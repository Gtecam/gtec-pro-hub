import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, requireAdminScope, auditLog, notify, notifyAdmins } from "./gtec";
import {
  DIPLOMA_LEVELS,
  SEED_INSTITUTIONS,
  institutionMatches,
  institutionScore,
} from "../lib/institutions";

/**
 * GTEC PRO — RÉFÉRENTIEL NATIONAL DES ÉTABLISSEMENTS D'ENSEIGNEMENT
 * SUPÉRIEUR (module MINESUP).
 *
 * Règles :
 *  - l'application n'a AUCUNE liste en dur : tout lit la table
 *    `higher_education_institutions` ;
 *  - un utilisateur ne peut ni créer ni modifier un établissement, ni
 *    s'auto-attribuer un badge vérifié (anti-fraude §17) ;
 *    toute modification admin est journalisée dans `auditLogs` ;
 *  - une ligne retirée/fermée n'est jamais supprimée : statut +
 *    `isActive = false` (§3).
 */

const vInstitutionType = v.union(
  v.literal("STATE_UNIVERSITY"),
  v.literal("PRIVATE_UNIVERSITY"),
  v.literal("PUBLIC_SPECIAL_STATUS"),
  v.literal("PRIVATE_HIGHER_INSTITUTE"),
  v.literal("INTERNATIONAL_INSTITUTION"),
  v.literal("INTERSTATE_INSTITUTION"),
  v.literal("FOREIGN_RECOGNIZED_INSTITUTION"),
);
const vOwnership = v.union(
  v.literal("PUBLIC"),
  v.literal("PRIVATE"),
  v.literal("INTERNATIONAL"),
  v.literal("INTERSTATE"),
);
const vRegion = v.union(
  v.literal("ADAMOUA"),
  v.literal("CENTRE"),
  v.literal("EST"),
  v.literal("EXTREME_NORD"),
  v.literal("LITTORAL"),
  v.literal("NORD"),
  v.literal("NORD_OUEST"),
  v.literal("OUEST"),
  v.literal("SUD"),
  v.literal("SUD_OUEST"),
);
const vStatus = v.union(
  v.literal("ACTIVE"),
  v.literal("SUSPENDED"),
  v.literal("CLOSED"),
  v.literal("PENDING_VERIFICATION"),
  v.literal("HISTORICAL"),
);
const vAuthorization = v.union(
  v.literal("AUTHORIZED"),
  v.literal("APPROVED"),
  v.literal("HOMOLOGATED"),
  v.literal("NOT_APPLICABLE"),
  v.literal("SUSPENDED"),
  v.literal("WITHDRAWN"),
  v.literal("UNKNOWN"),
);
const vRecognition = v.union(
  v.literal("RECOGNIZED"),
  v.literal("NOT_RECOGNIZED"),
  v.literal("UNDER_REVIEW"),
  v.literal("HISTORICAL"),
);
const vCredentialStatus = v.union(
  v.literal("declare"),
  v.literal("en_attente"),
  v.literal("verifie"),
  v.literal("rejete"),
);

/** Dernière vérification admin d'un établissement. */
async function touchVerified(ctx: any, id: Id<"higherEducationInstitutions">, adminId: Id<"users">) {
  await ctx.db.patch(id, { lastVerifiedAt: Date.now(), verifiedByAdminId: adminId });
}

// ============================ RECHERCHE ==================================

/**
 * Recherche intelligente (§15) : nom complet, acronyme, ancienne
 * appellation, ville, région, variantes orthographiques.
 * Accessible aux utilisateurs connectés (formulaire d'inscription).
 * Seuls les établissements actifs du référentiel sont proposés — aucun
 * établissement ne peut être créé depuis ce query.
 */
export const searchInstitutions = query({
  args: {
    q: v.string(),
    region: v.optional(vRegion),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("higherEducationInstitutions")
      .withIndex("by_active", (q: any) => q.eq("isActive", true))
      .collect();
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 30);
    const scored = all
      .filter((i: Doc<"higherEducationInstitutions">) => {
        if (args.region && i.region !== args.region) return false;
        if (i.status === "SUSPENDED" || i.status === "CLOSED") return false;
        return institutionMatches(i, args.q);
      })
      .map((i: Doc<"higherEducationInstitutions">) => ({
        institution: i,
        score: institutionScore(i, args.q),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);
    return scored.map((s: any) => s.institution);
  },
});

/** Liste complète (pour l'espace admin et les filtres région/type). */
export const listInstitutions = query({
  args: {
    q: v.optional(v.string()),
    region: v.optional(vRegion),
    status: v.optional(vStatus),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdminScope(ctx, "moderation", "technique");
    const all = await ctx.db.query("higherEducationInstitutions").collect();
    const q = (args.q ?? "").trim();
    return all
      .filter((i) => {
        if (!args.includeInactive && !i.isActive) return false;
        if (args.region && i.region !== args.region) return false;
        if (args.status && i.status !== args.status) return false;
        if (q && !institutionMatches(i, q)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },
});

/** Détail d'un établissement + historique de statuts (admin). */
export const getInstitutionDetail = query({
  args: { institutionId: v.id("higherEducationInstitutions") },
  handler: async (ctx, args) => {
    await requireAdminScope(ctx, "moderation", "technique");
    const institution = await ctx.db.get(args.institutionId);
    if (!institution) return null;
    const history = await ctx.db
      .query("institutionStatusHistory")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .collect();
    history.sort((a, b) => b.at - a.at);
    const credentials = await ctx.db
      .query("educationalCredentials")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .collect();
    return { institution, history, credentialCount: credentials.length };
  },
});

// ============================ SEED OFFICIEL ==============================

/**
 * Import du référentiel officiel MINESUP (§2) — idempotent : seules les
 * lignes absentes (code unique) sont insérées. Réservé à l'admin.
 */
export const seedInstitutions = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminScope(ctx, "moderation", "technique");
    const existing = new Set(
      (await ctx.db.query("higherEducationInstitutions").collect()).map((i) => i.code),
    );
    let created = 0;
    for (const s of SEED_INSTITUTIONS) {
      if (existing.has(s.code)) continue;
      await ctx.db.insert("higherEducationInstitutions", {
        ...s,
        aliases: s.aliases,
        lastVerifiedAt: Date.now(),
        verifiedByAdminId: admin._id,
      });
      created++;
    }
    // Niveaux de diplômes (§6) — seed idempotent aussi.
    const levels = new Set((await ctx.db.query("diplomaLevels").collect()).map((l) => l.code));
    for (const l of DIPLOMA_LEVELS) {
      if (levels.has(l.code)) continue;
      await ctx.db.insert("diplomaLevels", { code: l.code, label: l.label, rank: l.rank, active: true });
    }
    if (created > 0) {
      await auditLog(ctx, {
        actorId: admin._id,
        actorRole: "admin",
        action: "institution.seed",
        targetTable: "higherEducationInstitutions",
        detail: `${created} établissement(s) importé(s) depuis le référentiel MINESUP.`,
      });
    }
    return { created, total: SEED_INSTITUTIONS.length };
  },
});

// ============================== CRUD ADMIN ==============================

/** Création manuelle d'un établissement (admin, source obligatoire). */
export const adminCreateInstitution = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    shortName: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    institutionType: vInstitutionType,
    ownership: vOwnership,
    region: vRegion,
    city: v.optional(v.string()),
    department: v.optional(v.string()),
    address: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    status: vStatus,
    authorizationStatus: vAuthorization,
    recognitionStatus: vRecognition,
    canIssueNationalDiploma: v.optional(v.boolean()),
    canIssuePrivateDiploma: v.optional(v.boolean()),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "moderation", "technique");
    const code = args.code.trim().toUpperCase();
    if (!code || code.length > 50) throw new Error("Code invalide (1 à 50 caractères).");
    if (args.name.trim().length < 3) throw new Error("Nom d'établissement invalide.");
    const dup = await ctx.db
      .query("higherEducationInstitutions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (dup) throw new Error(`Le code ${code} existe déjà.`);
    const id = await ctx.db.insert("higherEducationInstitutions", {
      code,
      name: args.name.trim(),
      shortName: args.shortName?.trim() || undefined,
      aliases: args.aliases?.map((a) => a.trim()).filter(Boolean),
      institutionType: args.institutionType,
      ownership: args.ownership,
      region: args.region,
      city: args.city?.trim() || undefined,
      department: args.department?.trim() || undefined,
      address: args.address?.trim() || undefined,
      website: args.website?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      email: args.email?.trim() || undefined,
      status: args.status,
      authorizationStatus: args.authorizationStatus,
      recognitionStatus: args.recognitionStatus,
      canIssueNationalDiploma: args.canIssueNationalDiploma,
      canIssuePrivateDiploma: args.canIssuePrivateDiploma,
      source: args.source?.trim() || undefined,
      sourceUrl: args.sourceUrl?.trim() || undefined,
      lastVerifiedAt: Date.now(),
      verifiedByAdminId: admin._id,
      notes: args.notes?.trim() || undefined,
      isActive: args.status !== "CLOSED",
    });
    await ctx.db.insert("institutionStatusHistory", {
      institutionId: id,
      newStatus: args.status,
      newRecognitionStatus: args.recognitionStatus,
      reason: "Création dans le référentiel",
      changedById: admin._id,
      at: Date.now(),
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "institution.create",
      targetTable: "higherEducationInstitutions",
      targetId: id,
      newValue: `${code} · ${args.name.trim()}`,
    });
    return id;
  },
});

/** Modification d'un établissement (admin) — journalisée. */
export const adminUpdateInstitution = mutation({
  args: {
    institutionId: v.id("higherEducationInstitutions"),
    name: v.optional(v.string()),
    shortName: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    region: v.optional(vRegion),
    city: v.optional(v.string()),
    department: v.optional(v.string()),
    address: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    institutionType: v.optional(vInstitutionType),
    ownership: v.optional(vOwnership),
    authorizationStatus: v.optional(vAuthorization),
    recognitionStatus: v.optional(vRecognition),
    canIssueNationalDiploma: v.optional(v.boolean()),
    canIssuePrivateDiploma: v.optional(v.boolean()),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "moderation", "technique");
    const inst = await ctx.db.get(args.institutionId);
    if (!inst) throw new Error("Établissement introuvable.");
    const patch: Record<string, unknown> = {};
    const track = (key: string, val: unknown) => {
      if (val !== undefined) patch[key] = val;
    };
    if (args.name !== undefined) {
      if (args.name.trim().length < 3) throw new Error("Nom d'établissement invalide.");
      track("name", args.name.trim());
    }
    track("shortName", args.shortName?.trim() || undefined);
    if (args.aliases !== undefined) track("aliases", args.aliases.map((a) => a.trim()).filter(Boolean));
    track("region", args.region);
    track("city", args.city?.trim() || undefined);
    track("department", args.department?.trim() || undefined);
    track("address", args.address?.trim() || undefined);
    track("website", args.website?.trim() || undefined);
    track("phone", args.phone?.trim() || undefined);
    track("email", args.email?.trim() || undefined);
    track("institutionType", args.institutionType);
    track("ownership", args.ownership);
    track("authorizationStatus", args.authorizationStatus);
    if (args.recognitionStatus !== undefined && args.recognitionStatus !== inst.recognitionStatus) {
      track("recognitionStatus", args.recognitionStatus);
      await ctx.db.insert("institutionStatusHistory", {
        institutionId: inst._id,
        oldStatus: inst.status,
        newStatus: inst.status,
        oldRecognitionStatus: inst.recognitionStatus,
        newRecognitionStatus: args.recognitionStatus,
        reason: "Changement de statut de reconnaissance",
        changedById: admin._id,
        at: Date.now(),
      });
    }
    track("canIssueNationalDiploma", args.canIssueNationalDiploma);
    track("canIssuePrivateDiploma", args.canIssuePrivateDiploma);
    track("source", args.source?.trim() || undefined);
    track("sourceUrl", args.sourceUrl?.trim() || undefined);
    track("notes", args.notes?.trim() || undefined);
    track("isActive", args.isActive);
    await ctx.db.patch(args.institutionId, patch);
    await touchVerified(ctx, args.institutionId, admin._id);
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "institution.update",
      targetTable: "higherEducationInstitutions",
      targetId: args.institutionId,
      oldValue: `${inst.name} · ${inst.status}`,
      newValue: `${(patch.name as string) ?? inst.name} · ${String(patch.status ?? inst.status)}`,
    });
  },
});

/**
 * Changement de statut (§3) : suspendre / fermer / réactiver — jamais de
 * suppression. Écrit l'historique (reconnaissance à la date du diplôme)
 * puis le journal d'audit.
 */
export const adminSetInstitutionStatus = mutation({
  args: {
    institutionId: v.id("higherEducationInstitutions"),
    status: vStatus,
    recognitionStatus: v.optional(vRecognition),
    authorizationStatus: v.optional(vAuthorization),
    decisionReference: v.optional(v.string()),
    decisionDate: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "moderation", "technique");
    const inst = await ctx.db.get(args.institutionId);
    if (!inst) throw new Error("Établissement introuvable.");
    const recognition = args.recognitionStatus ?? inst.recognitionStatus;
    const patch: Record<string, unknown> = { status: args.status, recognitionStatus: recognition };
    if (args.authorizationStatus !== undefined) patch.authorizationStatus = args.authorizationStatus;
    // Fermé / suspendu / historique → ligne conservée mais inactive (§3).
    patch.isActive = args.status === "ACTIVE" || args.status === "PENDING_VERIFICATION";
    await ctx.db.patch(args.institutionId, patch);
    await ctx.db.insert("institutionStatusHistory", {
      institutionId: inst._id,
      oldStatus: inst.status,
      newStatus: args.status,
      oldRecognitionStatus: inst.recognitionStatus,
      newRecognitionStatus: recognition,
      decisionReference: args.decisionReference?.trim() || undefined,
      decisionDate: args.decisionDate,
      sourceUrl: args.sourceUrl?.trim() || undefined,
      reason: args.reason?.trim() || undefined,
      changedById: admin._id,
      at: Date.now(),
    });
    await touchVerified(ctx, args.institutionId, admin._id);
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "institution.status",
      targetTable: "higherEducationInstitutions",
      targetId: args.institutionId,
      oldValue: `${inst.status}/${inst.recognitionStatus}`,
      newValue: `${args.status}/${recognition}`,
      detail: args.reason?.trim(),
    });
  },
});

/** Marquer un établissement comme vérifié aujourd'hui (reconduction annuelle). */
export const adminVerifyInstitution = mutation({
  args: {
    institutionId: v.id("higherEducationInstitutions"),
    sourceUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "moderation", "technique");
    const inst = await ctx.db.get(args.institutionId);
    if (!inst) throw new Error("Établissement introuvable.");
    await ctx.db.patch(args.institutionId, {
      lastVerifiedAt: Date.now(),
      verifiedByAdminId: admin._id,
      sourceUrl: args.sourceUrl?.trim() || inst.sourceUrl,
      notes: args.notes?.trim() || inst.notes,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "institution.verify",
      targetTable: "higherEducationInstitutions",
      targetId: args.institutionId,
      detail: `Vérification manuelle de « ${inst.name} ».`,
    });
  },
});

// ==================== DEMANDES DE VÉRIFICATION (§9) ======================

/**
 * « + Mon établissement n'est pas dans la liste » — crée une demande
 * d'examen. NE CRÉE JAMAIS d'établissement (règle §21).
 */
export const submitInstitutionVerification = mutation({
  args: {
    institutionName: v.string(),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    graduationYear: v.optional(v.number()),
    diplomaTitle: v.optional(v.string()),
    specialty: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.institutionName.trim();
    if (name.length < 3) throw new Error("Indiquez le nom de l'établissement.");
    // Doublon : une seule demande ouverte par établissement et par utilisateur.
    const mine = await ctx.db
      .query("institutionVerificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const open = mine.find(
      (r) =>
        r.status !== "REJECTED" &&
        r.institutionName.toLowerCase().replace(/\s+/g, " ") === name.toLowerCase().replace(/\s+/g, " "),
    );
    if (open) {
      throw new Error("Une demande pour cet établissement est déjà en cours d'examen.");
    }
    const id = await ctx.db.insert("institutionVerificationRequests", {
      userId: user._id,
      institutionName: name,
      city: args.city?.trim() || undefined,
      country: args.country?.trim() || "Cameroun",
      region: args.region?.trim() || undefined,
      graduationYear: args.graduationYear,
      diplomaTitle: args.diplomaTitle?.trim() || undefined,
      specialty: args.specialty?.trim() || undefined,
      note: args.note?.trim() || undefined,
      status: "PENDING",
    });
    await notifyAdmins(
      ctx,
      "general",
      "Nouvelle demande d'établissement",
      `${user.name ?? "Un utilisateur"} demande la vérification de « ${name} ».`,
      undefined,
      ["moderation", "technique"],
    );
    return id;
  },
});

/** Mes demandes de vérification (utilisateur). */
export const myVerificationRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("institutionVerificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/** File des demandes (admin). */
export const adminListVerificationRequests = query({
  args: { status: v.optional(v.union(v.literal("PENDING"), v.literal("UNDER_REVIEW"), v.literal("APPROVED"), v.literal("REJECTED"))) },
  handler: async (ctx, args) => {
    await requireAdminScope(ctx, "moderation", "kyc", "support");
    const rows = args.status
      ? await ctx.db
          .query("institutionVerificationRequests")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("institutionVerificationRequests").collect();
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(
      rows.map(async (r) => ({ request: r, user: await ctx.db.get(r.userId) })),
    );
  },
});

/**
 * Instruction d'une demande (admin) :
 *  - APPROVED + `createInstitution` → l'admin crée lui-même la ligne au
 *    référentiel (source = demande validée) et la rattche à la demande ;
 *  - REJECTED → refus motivé notifié au demandeur.
 * L'utilisateur ne crée jamais rien lui-même.
 */
export const adminReviewVerificationRequest = mutation({
  args: {
    requestId: v.id("institutionVerificationRequests"),
    decision: v.union(v.literal("UNDER_REVIEW"), v.literal("APPROVED"), v.literal("REJECTED")),
    adminNote: v.optional(v.string()),
    createInstitution: v.optional(
      v.object({
        code: v.string(),
        institutionType: vInstitutionType,
        ownership: vOwnership,
        region: vRegion,
        city: v.optional(v.string()),
        sourceUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "moderation", "technique");
    const req = await ctx.db.get(args.requestId);
    if (!req) throw new Error("Demande introuvable.");
    if (req.status === "APPROVED" && args.decision !== "APPROVED") {
      throw new Error("Une demande approuvée n'est pas réversible.");
    }
    const patch: Record<string, unknown> = {
      status: args.decision,
      adminNote: args.adminNote?.trim() || undefined,
      reviewedById: admin._id,
      reviewedAt: Date.now(),
    };
    if (args.decision === "APPROVED" && args.createInstitution) {
      const code = args.createInstitution.code.trim().toUpperCase();
      const dup = await ctx.db
        .query("higherEducationInstitutions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (dup) throw new Error(`Le code ${code} existe déjà.`);
      const instId = await ctx.db.insert("higherEducationInstitutions", {
        code,
        name: req.institutionName,
        institutionType: args.createInstitution.institutionType,
        ownership: args.createInstitution.ownership,
        region: args.createInstitution.region,
        city: args.createInstitution.city?.trim() || req.city,
        status: "ACTIVE",
        authorizationStatus: "UNKNOWN",
        recognitionStatus: "UNDER_REVIEW",
        canIssueNationalDiploma: false,
        canIssuePrivateDiploma: true,
        source: `Demande d'utilisateur validée par GTEC PRO (${req.institutionName})`,
        sourceUrl: args.createInstitution.sourceUrl?.trim() || undefined,
        lastVerifiedAt: Date.now(),
        verifiedByAdminId: admin._id,
        notes: req.note,
        isActive: true,
      });
      await ctx.db.insert("institutionStatusHistory", {
        institutionId: instId,
        newStatus: "ACTIVE",
        newRecognitionStatus: "UNDER_REVIEW",
        reason: `Ajout suite à la validation de la demande #${req._creationTime}`,
        changedById: admin._id,
        at: Date.now(),
      });
      patch.institutionId = instId;
      await auditLog(ctx, {
        actorId: admin._id,
        actorRole: "admin",
        action: "institution.createFromRequest",
        targetTable: "higherEducationInstitutions",
        targetId: instId,
        newValue: `${code} · ${req.institutionName}`,
        detail: `Demande ${req._id}`,
      });
    }
    await ctx.db.patch(args.requestId, patch);
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "institution.request.review",
      targetTable: "institutionVerificationRequests",
      targetId: args.requestId,
      oldValue: req.status,
      newValue: args.decision,
      detail: args.adminNote?.trim(),
    });
    await notify(
      ctx,
      req.userId,
      "general",
      args.decision === "APPROVED"
        ? "Établissement ajouté au référentiel"
        : args.decision === "REJECTED"
          ? "Demande d'établissement refusée"
          : "Demande d'établissement en cours d'examen",
      args.decision === "APPROVED"
        ? `« ${req.institutionName} » est maintenant reconnu dans le référentiel GTEC PRO.`
        : args.decision === "REJECTED"
          ? `Votre demande concernant « ${req.institutionName} » a été refusée. ${args.adminNote ?? ""}`.trim()
          : `Votre demande concernant « ${req.institutionName} » est à l'examen.`,
    );
  },
});

// ============================== DIPLÔMES =================================

/**
 * Déclaration d'un diplôme par l'utilisateur (§5) — statut initial
 * « declare » ou « en_attente » si un document est joint. L'utilisateur
 * ne peut JAMAIS écrire « verifie » (§12, §17).
 */
export const submitCredential = mutation({
  args: {
    institutionId: v.optional(v.id("higherEducationInstitutions")),
    institutionName: v.optional(v.string()),
    diplomaLevel: v.optional(v.string()),
    degreeKey: v.optional(v.string()),
    fieldOfStudy: v.optional(v.string()),
    specialtyTitle: v.optional(v.string()),
    diplomaTitle: v.optional(v.string()),
    graduationYear: v.optional(v.number()),
    certificateNumber: v.optional(v.string()),
    country: v.optional(v.string()),
    institutionCity: v.optional(v.string()),
    documentUrl: v.optional(v.string()),
    documentHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let institution: Doc<"higherEducationInstitutions"> | null = null;
    if (args.institutionId) {
      institution = await ctx.db.get(args.institutionId);
      if (!institution) {
        throw new Error("Établissement introuvable dans le référentiel.");
      }
      if (!institution.isActive) {
        throw new Error("Cet établissement n'est plus actif dans le référentiel.");
      }
    }
    const name = institution?.name ?? args.institutionName?.trim();
    if (!name || name.length < 3) {
      throw new Error("Choisissez un établissement du référentiel ou indiquez son nom.");
    }
    if (!args.diplomaTitle?.trim() && !args.degreeKey) {
      throw new Error("Indiquez le diplôme obtenu.");
    }
    if (args.country && args.country.trim().toLowerCase() !== "cameroun") {
      // Diplôme étranger : jamais d'équivalence automatique (§6).
      await ctx.db.insert("educationalCredentials", {
        userId: user._id,
        institutionId: undefined,
        institutionName: name,
        diplomaLevel: args.diplomaLevel,
        degreeKey: args.degreeKey,
        fieldOfStudy: args.fieldOfStudy?.trim() || undefined,
        specialtyTitle: args.specialtyTitle?.trim() || undefined,
        diplomaTitle: args.diplomaTitle?.trim() || undefined,
        graduationYear: args.graduationYear,
        certificateNumber: args.certificateNumber?.trim() || undefined,
        country: args.country.trim(),
        institutionCity: args.institutionCity?.trim() || undefined,
        documentUrl: args.documentUrl,
        documentHash: args.documentHash,
        verificationStatus: "en_attente",
        equivalenceStatus: "PENDING",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    }
    await ctx.db.insert("educationalCredentials", {
      userId: user._id,
      institutionId: institution?._id,
      institutionName: name,
      diplomaLevel: args.diplomaLevel,
      degreeKey: args.degreeKey,
      fieldOfStudy: args.fieldOfStudy?.trim() || undefined,
      specialtyTitle: args.specialtyTitle?.trim() || undefined,
      diplomaTitle: args.diplomaTitle?.trim() || undefined,
      graduationYear: args.graduationYear,
      certificateNumber: args.certificateNumber?.trim() || undefined,
      country: "Cameroun",
      institutionCity: args.institutionCity?.trim() || institution?.city,
      documentUrl: args.documentUrl,
      documentHash: args.documentHash,
      verificationStatus: args.documentUrl ? "en_attente" : "declare",
      equivalenceStatus: "NOT_REQUIRED",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Mes diplômes déclarés (badge profil). */
export const myCredentials = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("educationalCredentials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** File des diplômes à vérifier (admin §11). */
export const adminListCredentials = query({
  args: { status: v.optional(vCredentialStatus) },
  handler: async (ctx, args) => {
    await requireAdminScope(ctx, "kyc", "moderation");
    const rows = args.status
      ? await ctx.db
          .query("educationalCredentials")
          .withIndex("by_status", (q) => q.eq("verificationStatus", args.status!))
          .collect()
      : await ctx.db.query("educationalCredentials").collect();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(
      rows.map(async (c) => ({
        credential: c,
        user: await ctx.db.get(c.userId),
        institution: c.institutionId ? await ctx.db.get(c.institutionId) : null,
      })),
    );
  },
});

/**
 * Instruction d'un diplôme (admin §11) : vérifier / refuser / demander un
 * document complémentaire. Le badge du profil technicien est mis à jour —
 * seule cette fonction peut écrire « verifie » (§17).
 */
export const adminReviewCredential = mutation({
  args: {
    credentialId: v.id("educationalCredentials"),
    decision: vCredentialStatus,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "kyc", "moderation");
    const cred = await ctx.db.get(args.credentialId);
    if (!cred) throw new Error("Diplôme introuvable.");
    await ctx.db.patch(args.credentialId, {
      verificationStatus: args.decision,
      reviewNote: args.note?.trim() || undefined,
      verifiedAt: Date.now(),
      verifiedById: admin._id,
      updatedAt: Date.now(),
    });
    // Badge du profil technicien aligné (§12).
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", cred.userId))
        .collect()
    )[0];
    if (profile) {
      await ctx.db.patch(profile._id, { credentialStatus: args.decision });
    }
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "credential.review",
      targetTable: "educationalCredentials",
      targetId: args.credentialId,
      oldValue: cred.verificationStatus,
      newValue: args.decision,
      detail: `${cred.diplomaTitle ?? cred.degreeKey ?? "Diplôme"} · ${cred.institutionName}${args.note ? ` · ${args.note}` : ""}`,
    });
    await notify(
      ctx,
      cred.userId,
      "general",
      args.decision === "verifie"
        ? "Diplôme vérifié"
        : args.decision === "rejete"
          ? "Diplôme non vérifié"
          : "Diplôme en cours de vérification",
      args.decision === "verifie"
        ? `Votre diplôme (${cred.institutionName}) a été vérifié par GTEC PRO.`
        : args.decision === "rejete"
          ? `La vérification de votre diplôme (${cred.institutionName}) a échoué. ${args.note ?? ""}`.trim()
          : `Votre dossier de diplôme (${cred.institutionName}) est en cours d'examen.`,
    );
  },
});

// ========================= DASHBOARD ÉDUCATION ===========================

/**
 * Dashboard « Éducation & diplômes » (§20) : compteurs du référentiel,
 * diplômes selon statut, demandes en attente + ALERTE RÉFÉRENTIEL
 * (établissements non vérifiés depuis `staleDays`, défaut 365 j).
 */
export const educationStats = query({
  args: { staleDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdminScope(ctx, "moderation", "technique", "kyc");
    const insts = await ctx.db.query("higherEducationInstitutions").collect();
    const creds = await ctx.db.query("educationalCredentials").collect();
    const requests = await ctx.db.query("institutionVerificationRequests").collect();
    const staleDays = Math.max(30, args.staleDays ?? 365);
    const cutoff = Date.now() - staleDays * 24 * 3600 * 1000;
    const countType = (t: string) => insts.filter((i) => i.institutionType === t).length;
    const countStatus = (s: string) => insts.filter((i) => i.status === s).length;
    const stale = insts.filter(
      (i) => i.isActive && i.status === "ACTIVE" && (!i.lastVerifiedAt || i.lastVerifiedAt < cutoff),
    );
    return {
      total: insts.length,
      stateUniversities: countType("STATE_UNIVERSITY"),
      privateUniversities: countType("PRIVATE_UNIVERSITY"),
      publicSpecial: countType("PUBLIC_SPECIAL_STATUS"),
      ipes: countType("PRIVATE_HIGHER_INSTITUTE"),
      international: countType("INTERNATIONAL_INSTITUTION") + countType("INTERSTATE_INSTITUTION"),
      suspended: countStatus("SUSPENDED"),
      closed: countStatus("CLOSED"),
      inactive: insts.filter((i) => !i.isActive).length,
      credentialsVerified: creds.filter((c) => c.verificationStatus === "verifie").length,
      credentialsPending: creds.filter((c) => c.verificationStatus === "en_attente").length,
      credentialsDeclared: creds.filter((c) => c.verificationStatus === "declare").length,
      credentialsRejected: creds.filter((c) => c.verificationStatus === "rejete").length,
      requestsPending: requests.filter((r) => r.status === "PENDING" || r.status === "UNDER_REVIEW").length,
      staleAlertCount: stale.length,
      staleDays,
      stale: stale
        .sort((a, b) => (a.lastVerifiedAt ?? 0) - (b.lastVerifiedAt ?? 0))
        .slice(0, 25)
        .map((i) => ({
          _id: i._id,
          name: i.name,
          code: i.code,
          region: i.region,
          lastVerifiedAt: i.lastVerifiedAt,
        })),
    };
  },
});

/** Niveaux de diplômes du référentiel (§6). */
export const listDiplomaLevels = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("diplomaLevels").collect();
    if (rows.length === 0) return DIPLOMA_LEVELS.map((l) => ({ ...l, active: true }));
    return rows.sort((a, b) => a.rank - b.rank);
  },
});
