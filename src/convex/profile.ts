import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, notify, notifyAdmins } from "./gtec";

/**
 * GTEC PRO — PROFIL ÉVOLUTIF DES ADHÉRENTS (« dossier professionnel vivant »,
 * §26). Chaque rubrique (expériences, compétences, certifications, formations,
 * réalisations) suit le cycle DRAFT → SUBMITTED → UNDER_REVIEW →
 * VERIFIED/REJECTED. Un élément vérifié modifié repasse automatiquement en
 * vérification (§14) ; rien n'est jamais supprimé : archivage uniquement.
 * Seul l'admin GTEC écrit VERIFIED (§12 : jamais d'auto-vérification).
 * Toutes les écritures sont journalisées dans `profileChanges` (§15).
 */

const vItemStatus = v.union(
  v.literal("DRAFT"),
  v.literal("SUBMITTED"),
  v.literal("UNDER_REVIEW"),
  v.literal("VERIFIED"),
  v.literal("REJECTED"),
);

const KINDS = ["experience", "skill", "certification", "training", "project"] as const;
type Kind = (typeof KINDS)[number];
const vKind = v.union(...KINDS.map((k) => v.literal(k)));

const TABLES: Record<Kind, string> = {
  experience: "professionalExperiences",
  skill: "technicianSkills",
  certification: "profileCertifications",
  training: "trainingRecords",
  project: "portfolioProjects",
};

const KIND_LABELS: Record<Kind, string> = {
  experience: "expérience professionnelle",
  skill: "compétence",
  certification: "certification",
  training: "formation",
  project: "réalisation",
};

/** Journal des modifications du profil (§15) — conservé indéfiniment. */
async function logChange(
  ctx: any,
  userId: Id<"users">,
  kind: string,
  label: string,
  oldValue?: string,
  newValue?: string,
) {
  await ctx.db.insert("profileChanges", {
    userId,
    kind,
    label,
    oldValue: oldValue || undefined,
    newValue: newValue || undefined,
    at: Date.now(),
  });
}

function nowFields() {
  return { updatedAt: Date.now() };
}

/** Statut après création : SUBMITTED si un justificatif est fourni, sinon DRAFT. */
function initialStatus(hasDocument: boolean) {
  return hasDocument ? "SUBMITTED" : "DRAFT";
}

// ============================ EXPÉRIENCES (§4) =============================

export const upsertExperience = mutation({
  args: {
    id: v.optional(v.id("professionalExperiences")),
    title: v.string(),
    company: v.optional(v.string()),
    domainCode: v.optional(v.string()),
    domainLabel: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    isCurrent: v.optional(v.boolean()),
    description: v.optional(v.string()),
    skillsUsed: v.optional(v.array(v.string())),
    achievements: v.optional(v.string()),
    city: v.optional(v.string()),
    photos: v.optional(v.array(v.string())),
    documentUrl: v.optional(v.string()),
    referenceName: v.optional(v.string()),
    referenceContact: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const title = args.title.trim();
    if (title.length < 3) throw new Error("Indiquez la fonction ou le poste occupé.");
    const payload = {
      userId: user._id,
      title,
      company: args.company?.trim() || undefined,
      domainCode: args.domainCode || undefined,
      domainLabel: args.domainLabel || undefined,
      startDate: args.startDate || undefined,
      endDate: args.isCurrent ? undefined : args.endDate || undefined,
      isCurrent: args.isCurrent ?? false,
      description: args.description?.trim() || undefined,
      skillsUsed: args.skillsUsed,
      achievements: args.achievements?.trim() || undefined,
      city: args.city?.trim() || undefined,
      photos: args.photos,
      documentUrl: args.documentUrl || undefined,
      referenceName: args.referenceName?.trim() || undefined,
      referenceContact: args.referenceContact?.trim() || undefined,
    };
    if (args.id) {
      const row = await ctx.db.get(args.id);
      if (!row || row.userId !== user._id) throw new Error("Expérience introuvable.");
      const wasVerified = row.status === "VERIFIED";
      await ctx.db.patch(args.id, {
        ...payload,
        // Une entrée vérifiée modifiée repasse en vérification (§14).
        status: wasVerified ? "SUBMITTED" : initialStatus(!!payload.documentUrl),
        verifiedAt: undefined,
        verifiedBy: undefined,
        ...nowFields(),
      });
      await logChange(ctx, user._id, "experience.update", `Modification de l'expérience « ${title} »`, row.title, title);
    } else {
      await ctx.db.insert("professionalExperiences", {
        ...payload,
        status: initialStatus(!!payload.documentUrl),
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "experience.add", `Ajout de l'expérience « ${title} »`, undefined, title);
    }
    await notify(ctx, user._id, "general", "Profil professionnel mis à jour", `Votre expérience « ${title} » a été enregistrée.`);
  },
});

// ============================= COMPÉTENCES (§3) ============================

export const upsertSkill = mutation({
  args: {
    id: v.optional(v.id("technicianSkills")),
    skill: v.string(),
    domainCode: v.optional(v.string()),
    domainLabel: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    level: v.optional(
      v.union(
        v.literal("DEBUTANT"),
        v.literal("INTERMEDIAIRE"),
        v.literal("AVANCE"),
        v.literal("EXPERT"),
      ),
    ),
    yearsPracticed: v.optional(v.number()),
    description: v.optional(v.string()),
    acquiredAt: v.optional(v.string()),
    documentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const skill = args.skill.trim();
    if (skill.length < 2) throw new Error("Indiquez la compétence.");
    const payload = {
      userId: user._id,
      skill,
      domainCode: args.domainCode || undefined,
      domainLabel: args.domainLabel || undefined,
      jobTitle: args.jobTitle?.trim() || undefined,
      level: args.level || undefined,
      yearsPracticed: args.yearsPracticed,
      description: args.description?.trim() || undefined,
      acquiredAt: args.acquiredAt || undefined,
      documentUrl: args.documentUrl || undefined,
    };
    if (args.id) {
      const row = await ctx.db.get(args.id);
      if (!row || row.userId !== user._id) throw new Error("Compétence introuvable.");
      const wasVerified = row.status === "VERIFIED";
      await ctx.db.patch(args.id, {
        ...payload,
        status: wasVerified ? "SUBMITTED" : initialStatus(!!payload.documentUrl),
        verifiedAt: undefined,
        verifiedBy: undefined,
        ...nowFields(),
      });
      await logChange(ctx, user._id, "skill.update", `Modification de la compétence « ${skill} »`, row.skill, skill);
    } else {
      await ctx.db.insert("technicianSkills", {
        ...payload,
        status: initialStatus(!!payload.documentUrl),
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "skill.add", `Ajout de la compétence « ${skill} »`, undefined, skill);
    }
  },
});

// =========================== CERTIFICATIONS (§8) ===========================

export const upsertCertification = mutation({
  args: {
    id: v.optional(v.id("profileCertifications")),
    name: v.string(),
    organization: v.optional(v.string()),
    domainCode: v.optional(v.string()),
    domainLabel: v.optional(v.string()),
    number: v.optional(v.string()),
    obtainedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    documentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2) throw new Error("Indiquez le nom de la certification.");
    const payload = {
      userId: user._id,
      name,
      organization: args.organization?.trim() || undefined,
      domainCode: args.domainCode || undefined,
      domainLabel: args.domainLabel || undefined,
      number: args.number?.trim() || undefined,
      obtainedAt: args.obtainedAt,
      expiresAt: args.expiresAt,
      documentUrl: args.documentUrl || undefined,
    };
    if (args.id) {
      const row = await ctx.db.get(args.id);
      if (!row || row.userId !== user._id) throw new Error("Certification introuvable.");
      const wasVerified = row.status === "VERIFIED";
      await ctx.db.patch(args.id, {
        ...payload,
        status: wasVerified ? "SUBMITTED" : initialStatus(!!payload.documentUrl),
        verifiedAt: undefined,
        verifiedBy: undefined,
        ...nowFields(),
      });
      await logChange(ctx, user._id, "certification.update", `Modification de la certification « ${name} »`, row.name, name);
    } else {
      await ctx.db.insert("profileCertifications", {
        ...payload,
        status: initialStatus(!!payload.documentUrl),
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "certification.add", `Ajout de la certification « ${name} »`, undefined, name);
    }
  },
});

// ============================ FORMATIONS (§9) ==============================

export const upsertTraining = mutation({
  args: {
    id: v.optional(v.id("trainingRecords")),
    name: v.string(),
    organization: v.optional(v.string()),
    domainCode: v.optional(v.string()),
    domainLabel: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    durationHours: v.optional(v.number()),
    skillsAcquired: v.optional(v.array(v.string())),
    certificateUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 3) throw new Error("Indiquez le nom de la formation.");
    const payload = {
      userId: user._id,
      name,
      organization: args.organization?.trim() || undefined,
      domainCode: args.domainCode || undefined,
      domainLabel: args.domainLabel || undefined,
      completedAt: args.completedAt,
      durationHours: args.durationHours,
      skillsAcquired: args.skillsAcquired,
      certificateUrl: args.certificateUrl || undefined,
    };
    if (args.id) {
      const row = await ctx.db.get(args.id);
      if (!row || row.userId !== user._id) throw new Error("Formation introuvable.");
      const wasVerified = row.status === "VERIFIED";
      await ctx.db.patch(args.id, {
        ...payload,
        status: wasVerified ? "SUBMITTED" : initialStatus(!!payload.certificateUrl),
        verifiedAt: undefined,
        verifiedBy: undefined,
        ...nowFields(),
      });
      await logChange(ctx, user._id, "training.update", `Modification de la formation « ${name} »`, row.name, name);
    } else {
      await ctx.db.insert("trainingRecords", {
        ...payload,
        status: initialStatus(!!payload.certificateUrl),
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "training.add", `Ajout de la formation « ${name} »`, undefined, name);
    }
  },
});

// =========================== RÉALISATIONS (§6) =============================

export const upsertProject = mutation({
  args: {
    id: v.optional(v.id("portfolioProjects")),
    title: v.string(),
    domainCode: v.optional(v.string()),
    domainLabel: v.optional(v.string()),
    description: v.optional(v.string()),
    installationType: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    city: v.optional(v.string()),
    photosBefore: v.optional(v.array(v.string())),
    photosDuring: v.optional(v.array(v.string())),
    photosAfter: v.optional(v.array(v.string())),
    materialsUsed: v.optional(v.string()),
    skillsUsed: v.optional(v.array(v.string())),
    difficulty: v.optional(v.string()),
    outcome: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const title = args.title.trim();
    if (title.length < 3) throw new Error("Indiquez le titre de la réalisation.");
    const payload = {
      userId: user._id,
      title,
      domainCode: args.domainCode || undefined,
      domainLabel: args.domainLabel || undefined,
      description: args.description?.trim() || undefined,
      installationType: args.installationType?.trim() || undefined,
      completedAt: args.completedAt,
      city: args.city?.trim() || undefined,
      photosBefore: args.photosBefore,
      photosDuring: args.photosDuring,
      photosAfter: args.photosAfter,
      materialsUsed: args.materialsUsed?.trim() || undefined,
      skillsUsed: args.skillsUsed,
      difficulty: args.difficulty?.trim() || undefined,
      outcome: args.outcome?.trim() || undefined,
    };
    if (args.id) {
      const row = await ctx.db.get(args.id);
      if (!row || row.userId !== user._id) throw new Error("Réalisation introuvable.");
      const wasVerified = row.status === "VERIFIED";
      await ctx.db.patch(args.id, {
        ...payload,
        isPublic: args.isPublic ?? row.isPublic,
        status: wasVerified ? "SUBMITTED" : initialStatus(!!args.photosAfter?.length),
        verifiedAt: undefined,
        verifiedBy: undefined,
        ...nowFields(),
      });
      await logChange(ctx, user._id, "project.update", `Modification de la réalisation « ${title} »`, row.title, title);
    } else {
      await ctx.db.insert("portfolioProjects", {
        ...payload,
        isPublic: args.isPublic ?? true,
        status: initialStatus(!!args.photosAfter?.length),
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "project.add", `Ajout de la réalisation « ${title} »`, undefined, title);
    }
  },
});

/** Visibilité publique d'une réalisation (§6 : case « profil public »). */
export const setProjectPublic = mutation({
  args: { id: v.id("portfolioProjects"), isPublic: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id) throw new Error("Réalisation introuvable.");
    await ctx.db.patch(args.id, { isPublic: args.isPublic, ...nowFields() });
    await logChange(
      ctx,
      user._id,
      "project.visibility",
      `Visibilité de « ${row.title} »`,
      row.isPublic ? "publique" : "privée",
      args.isPublic ? "publique" : "privée",
    );
  },
});

// ==================== SOUMISSION / ARCHIVAGE (§14, §4) =====================

/**
 * Soumet une rubrique à la vérification GTEC PRO. L'utilisateur ne peut
 * jamais écrire VERIFIED lui-même (§12) — seul adminReviewProfileItem le peut.
 */
export const submitForVerification = mutation({
  args: { kind: vKind, id: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!(KINDS as readonly string[]).includes(args.kind)) throw new Error("Type inconnu.");
    const table = TABLES[args.kind] as never;
    const row = (await ctx.db.get(args.id as never)) as { userId: Id<"users">; status: string } | null;
    if (!row || row.userId !== user._id) throw new Error("Élément introuvable.");
    const doc = row as unknown as Record<string, unknown>;
    const label = String(doc.title ?? doc.name ?? doc.skill ?? "Élément");
    await ctx.db.patch(args.id as never, { status: "SUBMITTED", ...nowFields() });
    await logChange(ctx, user._id, `${args.kind}.submitted`, `« ${label} » envoyé pour vérification`);
    await notifyAdmins(
      ctx,
      "general",
      "Nouvelle information professionnelle à vérifier",
      `${user.name ?? "Un adhérent"} a soumis ${KIND_LABELS[args.kind]} : « ${label} ».`,
    );
  },
});

/** Archiver / réactiver — jamais de suppression (§4, §15). */
export const setItemActive = mutation({
  args: { kind: vKind, id: v.string(), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!(KINDS as readonly string[]).includes(args.kind)) throw new Error("Type inconnu.");
    const row = (await ctx.db.get(args.id as never)) as unknown as Record<string, unknown> | null;
    if (!row || row.userId !== user._id) throw new Error("Élément introuvable.");
    const label = String(row.title ?? row.name ?? row.skill ?? "Élément");
    await ctx.db.patch(args.id as never, { isActive: args.isActive, ...nowFields() });
    await logChange(
      ctx,
      user._id,
      `${args.kind}.${args.isActive ? "reactivated" : "archived"}`,
      `${args.isActive ? "Réactivation" : "Archivage"} de « ${label} »`,
      args.isActive ? "archivé" : "actif",
      args.isActive ? "actif" : "archivé",
    );
  },
});

// ========================= LECTURE PROFIL (§1, §12) ========================

/** Toutes les rubriques du profil + historique (§1, §15). */
export const myProfileData = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [experiences, skills, certifications, trainings, projects, changes, credentials] = await Promise.all([
      ctx.db
        .query("professionalExperiences")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("technicianSkills")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("profileCertifications")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("trainingRecords")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("portfolioProjects")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("profileChanges")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("educationalCredentials")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect(),
    ]);
    const byDesc = (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt;
    return {
      experiences: experiences.sort(byDesc),
      skills: skills.sort(byDesc),
      certifications: certifications.sort(byDesc),
      trainings: trainings.sort(byDesc),
      projects: projects.sort(byDesc),
      credentials,
      history: changes.sort((a: { at: number }, b: { at: number }) => b.at - a.at).slice(0, 80),
    };
  },
});

/** Interventions GTEC PRO terminées (§5) — client masqué publiquement. */
export const myGtecExperiences = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const assignments = await ctx.db.query("assignments").collect();
    const mine = assignments.filter((a: any) => a.members?.some((m: any) => m.id === user._id));
    const rows = await Promise.all(
      mine.map(async (a: any) => {
        const request = (await ctx.db.get(a.requestId)) as Doc<"serviceRequests"> | null;
        if (!request) return null;
        const review = (
          await ctx.db
            .query("reviews")
            .withIndex("by_tech", (q: any) => q.eq("techUserId", user._id))
            .collect()
        ).find((r) => r.requestId === a.requestId);
        const alreadyAdded = !!(await ctx.db
          .query("portfolioProjects")
          .withIndex("by_user", (q: any) => q.eq("userId", user._id))
          .collect()
        ).some((p: any) => p.linkedRequestId === a.requestId);
        return {
          requestId: a.requestId as string,
          reference: request.reference,
          title: request.interventionLabel ?? request.title,
          city: request.city,
          finished: request.status === "terminee",
          status: request.status,
          date: (a as { _creationTime: number })._creationTime,
          rating: review?.rating,
          alreadyAdded,
        };
      }),
    );
    return rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[];
  },
});

/** Ajoute une intervention GTEC PRO au portfolio (§5). */
export const addGtecExperienceToPortfolio = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignments = await ctx.db.query("assignments").collect();
    const assignment = assignments.find(
      (a: any) => a.requestId === args.requestId && a.members?.some((m: any) => m.id === user._id),
    );
    if (!assignment) throw new Error("Intervention introuvable.");
    const request = (await ctx.db.get(args.requestId)) as Doc<"serviceRequests"> | null;
    if (!request) throw new Error("Intervention introuvable.");
    const existing = (await ctx.db
      .query("portfolioProjects")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    if (existing.some((p) => p.linkedRequestId === args.requestId)) {
      throw new Error("Cette intervention est déjà dans votre portfolio.");
    }
    const review = (
      await ctx.db
        .query("reviews")
        .withIndex("by_tech", (q: any) => q.eq("techUserId", user._id))
        .collect()
    ).find((r) => r.requestId === args.requestId);
    const title = request.interventionLabel ?? request.title;
    await ctx.db.insert("portfolioProjects", {
      userId: user._id,
      title: `Intervention ${request.reference} — ${title}`,
      domainLabel: title,
      description: request.description,
      completedAt: (assignment as unknown as { _creationTime: number })._creationTime,
      city: request.city,
      skillsUsed: request.requiredSkills,
      outcome: review?.rating ? `Évaluation client : ${review.rating}/5` : undefined,
      isPublic: true, // les données client ne sont jamais affichées (§5, §13)
      linkedRequestId: args.requestId,
      status: "VERIFIED", // intervention tracée et validée par la plateforme (PV signé)
      verifiedAt: Date.now(),
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logChange(ctx, user._id, "project.gtec", `Ajout de l'intervention ${request.reference} au portfolio`, undefined, title);
    await notify(ctx, user._id, "general", "Portfolio enrichi", `L'intervention ${request.reference} a été ajoutée à vos réalisations.`);
  },
});

// ==================== COMPLÉTION DU PROFIL (§12, 🔥) =======================

export const myProfileCompletion = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = (await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const p = profile[0];
    const [experiences, skills, certifications, trainings, projects, credentials] = await Promise.all([
      ctx.db.query("professionalExperiences").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
      ctx.db.query("technicianSkills").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
      ctx.db.query("profileCertifications").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
      ctx.db.query("trainingRecords").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
      ctx.db.query("portfolioProjects").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
      ctx.db.query("educationalCredentials").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
    ]);
    const items = [
      { key: "photo", label: "Photo de profil", done: !!user.image },
      { key: "phone", label: "Téléphone vérifié", done: !!user.phoneVerified },
      { key: "identity", label: "Identité complète", done: !!(user.firstName && user.lastName) || !!p },
      { key: "kyc", label: "Dossier KYC", done: p?.status === "verifie" },
      { key: "job", label: "Métier & spécialité", done: !!(p?.domainCode && p?.specialtyCode && p?.jobTitle) },
      { key: "skills", label: "Compétences", done: (skills as any[]).length > 0 },
      { key: "experience", label: "Expériences renseignées", done: (experiences as any[]).length > 0 },
      { key: "diploma", label: "Diplôme déclaré", done: (credentials as any[]).length > 0 },
      { key: "diploma_verified", label: "Diplôme vérifié", done: (credentials as any[]).some((c) => c.verificationStatus === "verifie") },
      { key: "certification", label: "Certifications", done: (certifications as any[]).length > 0 },
      { key: "training", label: "Formations", done: (trainings as any[]).length > 0 },
      { key: "portfolio", label: "Réalisations / portfolio", done: (projects as any[]).length > 0 },
      { key: "availability", label: "Disponibilité renseignée", done: !!p?.availability },
    ];
    const done = items.filter((i) => i.done).length;
    return { percent: Math.round((done / items.length) * 100), items };
  },
});

// ========================== ADMIN (§11, §14, §16) ==========================

/** File unifiée des informations professionnelles à vérifier. */
export const adminListProfileVerifications = query({
  args: { status: v.optional(vItemStatus) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") throw new Error("Action réservée à l'administration.");
    const statusFilter = args.status;
    const load = async (table: "professionalExperiences" | "technicianSkills" | "profileCertifications" | "trainingRecords" | "portfolioProjects", kind: Kind) => {
      const rows = statusFilter
        ? await ctx.db.query(table).withIndex("by_status", (q: any) => q.eq("status", statusFilter)).collect()
        : await ctx.db.query(table).collect();
      return (rows as any[])
        .filter((r) => r.isActive)
        .map((r) => ({ kind, id: r._id as string, row: r }));
    };
    const rows = [
      ...(await load("professionalExperiences", "experience")),
      ...(await load("technicianSkills", "skill")),
      ...(await load("profileCertifications", "certification")),
      ...(await load("trainingRecords", "training")),
      ...(await load("portfolioProjects", "project")),
    ];
    return await Promise.all(
      rows.map(async (r) => {
        const u = (await ctx.db.get(r.row.userId as never)) as { name?: string; phone?: string } | null;
        return {
          ...r,
          user: u ? { name: u.name ?? null, phone: u.phone ?? null } : null,
        };
      }),
    );
  },
});

/** Validation admin : VERIFIED / REJECTED / UNDER_REVIEW (§14) + notification (§16). */
export const adminReviewProfileItem = mutation({
  args: { kind: vKind, id: v.string(), decision: v.union(v.literal("VERIFIED"), v.literal("REJECTED"), v.literal("UNDER_REVIEW")), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") throw new Error("Action réservée à l'administration.");
    if (!(KINDS as readonly string[]).includes(args.kind)) throw new Error("Type inconnu.");
    const row = (await ctx.db.get(args.id as never)) as unknown as Record<string, unknown> | null;
    if (!row) throw new Error("Élément introuvable.");
    const label = String(row.title ?? row.name ?? row.skill ?? "Élément");
    await ctx.db.patch(args.id as never, {
      status: args.decision,
      reviewNote: args.note?.trim() || undefined,
      verifiedAt: args.decision === "VERIFIED" ? Date.now() : undefined,
      verifiedBy: args.decision === "VERIFIED" ? admin._id : undefined,
      ...nowFields(),
    });
    const table = TABLES[args.kind] as never;
    await ctx.db.insert("profileChanges" as never, {
      userId: row.userId,
      kind: `${args.kind}.${args.decision.toLowerCase()}`,
      label:
        args.decision === "VERIFIED"
          ? `« ${label} » vérifié par GTEC PRO ✓`
          : args.decision === "REJECTED"
            ? `« ${label} » refusé`
            : `« ${label} » en cours d'examen`,
      at: Date.now(),
    } as never);
    await notify(
      ctx,
      row.userId as Id<"users">,
      "general",
      args.decision === "VERIFIED"
        ? "Votre nouvelle information a été vérifiée ✓"
        : args.decision === "REJECTED"
          ? "Information refusée"
          : "Vérification en cours",
      args.decision === "VERIFIED"
        ? `« ${label} » est désormais marqué « Vérifié par GTEC PRO » sur votre profil.`
        : args.decision === "REJECTED"
          ? `« ${label} » n'a pas été validé. ${args.note ?? ""}`.trim()
          : `« ${label} » est en cours d'examen par l'administration.`,
    );
  },
});

// ==================== ADRESSES CLIENT (§2 « MES ADRESSES ») =================

/** Mes adresses enregistrées. */
export const myAddresses = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = (await ctx.db
      .query("clientAddresses")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    return rows
      .filter((a) => a.isActive !== false)
      .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || b.createdAt - a.createdAt);
  },
});

/** Ajout/modification d'une adresse enregistrée (domicile, bureau…). */
export const upsertAddress = mutation({
  args: {
    id: v.optional(v.id("clientAddresses")),
    label: v.string(),
    kind: v.union(
      v.literal("DOMICILE"),
      v.literal("BUREAU"),
      v.literal("COMMERCE"),
      v.literal("RESIDENCE_SECONDAIRE"),
      v.literal("AUTRE"),
    ),
    region: v.optional(v.string()),
    city: v.string(),
    quarter: v.optional(v.string()),
    address: v.string(),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const label = args.label.trim();
    const city = args.city.trim();
    const address = args.address.trim();
    if (label.length < 2) throw new Error("Indiquez un libellé (Domicile, Bureau…).");
    if (city.length < 2) throw new Error("Indiquez la ville.");
    if (address.length < 5) throw new Error("Indiquez l'adresse complète.");
    // Une seule adresse par défaut : on désactive les autres.
    if (args.isDefault) {
      const others = (await ctx.db
        .query("clientAddresses")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect()) as any[];
      for (const o of others.filter((a) => a.isActive !== false && a.isDefault && a._id !== args.id)) {
        await ctx.db.patch(o._id, { isDefault: false, updatedAt: Date.now() });
      }
    }
    const payload = {
      userId: user._id,
      label,
      kind: args.kind,
      region: args.region?.trim() || undefined,
      city,
      quarter: args.quarter?.trim() || undefined,
      address,
      isDefault: args.isDefault ?? false,
    };
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as { userId: Id<"users"> } | null;
      if (!row || row.userId !== user._id) throw new Error("Adresse introuvable.");
      await ctx.db.patch(args.id, { ...payload, updatedAt: Date.now() });
      await logChange(ctx, user._id, "address.update", `Modification de l'adresse « ${label} »`, undefined, `${address}, ${city}`);
    } else {
      await ctx.db.insert("clientAddresses", {
        ...payload,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "address.add", `Ajout de l'adresse « ${label} »`, undefined, `${address}, ${city}`);
    }
  },
});

/** Archivage d'une adresse (jamais de suppression définitive). */
export const removeAddress = mutation({
  args: { id: v.id("clientAddresses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as { userId: Id<"users">; label: string } | null;
    if (!row || row.userId !== user._id) throw new Error("Adresse introuvable.");
    await ctx.db.patch(args.id, { isActive: false, isDefault: false, updatedAt: Date.now() });
    await logChange(ctx, user._id, "address.remove", `Suppression de l'adresse « ${row.label} »`);
  },
});

/** Préférences client (langue, notifications, contact d'urgence). */
export const updateClientPreferences = mutation({
  args: {
    emergencyName: v.optional(v.string()),
    emergencyPhone: v.optional(v.string()),
    prefLangue: v.optional(v.string()),
    prefNotifEmail: v.optional(v.boolean()),
    prefNotifSms: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const emergencyContact =
      args.emergencyName?.trim() && args.emergencyPhone?.trim()
        ? { name: args.emergencyName.trim(), phone: args.emergencyPhone.trim() }
        : undefined;
    await ctx.db.patch(user._id, {
      emergencyContact,
      prefLangue: args.prefLangue || undefined,
      prefNotifEmail: args.prefNotifEmail,
      prefNotifSms: args.prefNotifSms,
    });
    await logChange(ctx, user._id, "preferences.update", "Mise à jour des préférences client");
  },
});

// ============ ENTREPRISE / SOCIÉTÉ PRESTATAIRE (§10-§11) ============

/** Mon entreprise (celle que je dirige) + membres + invitations reçues. */
export const myCompany = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const owned = (await ctx.db
      .query("companies")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", user._id))
      .collect()) as any[];
    const company = owned.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    const memberships = (await ctx.db
      .query("companyMembers").collect()) as any[];
    const myMemberships = memberships.filter((m) => m.userId === user._id && m.isActive);
    const invitations = [] as any[];
    const team = [] as any[];
    if (company) {
      const rows = memberships.filter((m) => m.companyId === company._id && m.isActive);
      for (const m of rows) {
        const u = (await ctx.db.get(m.userId as never)) as { name?: string; phone?: string } | null;
        team.push({
          _id: m._id,
          userId: m.userId,
          role: m.role,
          status: m.status,
          invitedAt: m.invitedAt,
          userName: u?.name ?? null,
          userPhone: u?.phone ?? null,
        });
      }
    }
    for (const m of myMemberships.filter((x) => x.status === "INVITED")) {
      const c = (await ctx.db.get(m.companyId as never)) as { name: string } | null;
      invitations.push({ _id: m._id, companyId: m.companyId, companyName: c?.name ?? "", role: m.role, invitedAt: m.invitedAt });
    }
    return { company, team, invitations, myMemberships: myMemberships.map((m) => ({ _id: m._id, companyId: m.companyId, role: m.role, status: m.status })) };
  },
});

/** Création / mise à jour du profil entreprise (§10). */
export const upsertCompany = mutation({
  args: {
    id: v.optional(v.id("companies")),
    name: v.string(),
    legalName: v.optional(v.string()),
    rccm: v.optional(v.string()),
    niu: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    socials: v.optional(v.array(v.string())),
    yearCreated: v.optional(v.number()),
    description: v.optional(v.string()),
    domains: v.optional(v.array(v.string())),
    zones: v.optional(v.array(v.string())),
    capabilities: v.optional(v.string()),
    technicianCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2) throw new Error("Indiquez le nom commercial.");
    const payload = {
      ownerUserId: user._id,
      name,
      legalName: args.legalName?.trim() || undefined,
      rccm: args.rccm?.trim() || undefined,
      niu: args.niu?.trim() || undefined,
      logoUrl: args.logoUrl || undefined,
      address: args.address?.trim() || undefined,
      region: args.region?.trim() || undefined,
      city: args.city?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      email: args.email?.trim() || undefined,
      website: args.website?.trim() || undefined,
      socials: args.socials,
      yearCreated: args.yearCreated,
      description: args.description?.trim() || undefined,
      domains: args.domains,
      zones: args.zones,
      capabilities: args.capabilities?.trim() || undefined,
      technicianCount: args.technicianCount,
    };
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as {
        ownerUserId: Id<"users">;
        status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
        name: string;
      } | null;
      if (!row || row.ownerUserId !== user._id) throw new Error("Entreprise introuvable.");
      const wasVerified = row.status === "VERIFIED";
      await ctx.db.patch(args.id, {
        ...payload,
        status: wasVerified ? "SUBMITTED" : row.status === "DRAFT" ? "DRAFT" : row.status,
        verifiedAt: undefined,
        verifiedBy: undefined,
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "company.update", `Modification de l'entreprise « ${name} »`, row.name, name);
    } else {
      await ctx.db.insert("companies", {
        ...payload,
        status: "DRAFT",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await logChange(ctx, user._id, "company.add", `Création du profil entreprise « ${name} »`, undefined, name);
    }
  },
});

/** Soumission du profil entreprise à la vérification (§14). */
export const submitCompanyForVerification = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as { ownerUserId: Id<"users">; name: string } | null;
    if (!row || row.ownerUserId !== user._id) throw new Error("Entreprise introuvable.");
    await ctx.db.patch(args.id, { status: "SUBMITTED", updatedAt: Date.now() });
    await logChange(ctx, user._id, "company.submitted", `Entreprise « ${row.name} » soumise à vérification`);
    await notifyAdmins(ctx, "general", "Nouvelle entreprise à vérifier", `${user.name ?? "Un adhérent"} a soumis « ${row.name} ».`);
  },
});

/** Invitation d'un technicien dans l'équipe (§11) — il doit accepter. */
export const inviteTeamMember = mutation({
  args: { companyId: v.id("companies"), phone: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const company = (await ctx.db.get(args.companyId)) as { ownerUserId: Id<"users">; name: string } | null;
    if (!company || company.ownerUserId !== user._id) throw new Error("Entreprise introuvable.");
    const phone = args.phone.replace(/\s+/g, "");
    if (phone.length < 9) throw new Error("Numéro de téléphone invalide.");
    const role = args.role.trim() || "Technicien";
    // Le rattachement se fait sur un compte GTEC PRO existant (§11 : l'entreprise
    // ne modifie jamais les données personnelles du technicien).
    const target = (await ctx.db
      .query("users")
      .withIndex("phone", (q: any) => q.eq("phone", phone))
      .first()) as { _id: Id<"users">; name?: string } | null;
    if (!target) throw new Error("Aucun compte GTEC PRO avec ce numéro. La personne doit d'abord créer son compte.");
    if (target._id === user._id) throw new Error("Vous dirigez déjà cette entreprise.");
    const existing = (await ctx.db
      .query("companyMembers")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect()) as any[];
    const dup = existing.find((m) => m.userId === target._id && m.isActive && m.status !== "DECLINED");
    if (dup) throw new Error(dup.status === "INVITED" ? "Une invitation est déjà en attente pour ce numéro." : "Cette personne fait déjà partie de l'équipe.");
    await ctx.db.insert("companyMembers", {
      companyId: args.companyId,
      userId: target._id,
      role,
      status: "INVITED",
      invitedAt: Date.now(),
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logChange(ctx, user._id, "team.invite", `Invitation envoyée à ${target.name ?? phone} (${role}) pour « ${company.name} »`);
    await notify(
      ctx,
      target._id,
      "general",
      "Invitation à rejoindre une équipe",
      `${company.name} vous invite à rejoindre son équipe en tant que « ${role} ». Répondez depuis votre espace profil.`,
    );
  },
});

/** Réponse du technicien à une invitation d'équipe (§11) : ACCEPT / DECLINE. */
export const respondToTeamInvite = mutation({
  args: { inviteId: v.id("companyMembers"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const invite = (await ctx.db.get(args.inviteId)) as {
      userId: Id<"users">;
      status: string;
      companyId: Id<"companies">;
      role: string;
    } | null;
    if (!invite || invite.userId !== user._id) throw new Error("Invitation introuvable.");
    if (invite.status !== "INVITED") throw new Error("Cette invitation a déjà été traitée.");
    const company = (await ctx.db.get(invite.companyId)) as { name: string; ownerUserId: Id<"users"> } | null;
    await ctx.db.patch(args.inviteId, {
      status: args.accept ? "ACTIVE" : "DECLINED",
      respondedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logChange(
      ctx,
      user._id,
      args.accept ? "team.accept" : "team.decline",
      args.accept
        ? `Rattachement accepté : ${company?.name ?? "entreprise"} (${invite.role})`
        : `Invitation refusée : ${company?.name ?? "entreprise"} (${invite.role})`,
    );
    if (company) {
      await notify(
        ctx,
        company.ownerUserId,
        "general",
        args.accept ? "Invitation acceptée" : "Invitation refusée",
        args.accept
          ? `${user.name ?? "Un technicien"} a rejoint votre équipe en tant que « ${invite.role} ».`
          : `${user.name ?? "Un technicien"} a décliné l'invitation (« ${invite.role} »).`,
      );
    }
  },
});

/** Retrait d'un membre de l'équipe (dirigeant uniquement, traçable §11). */
export const removeTeamMember = mutation({
  args: { memberId: v.id("companyMembers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const member = (await ctx.db.get(args.memberId)) as {
      companyId: Id<"companies">;
      userId: Id<"users">;
      role: string;
    } | null;
    if (!member) throw new Error("Membre introuvable.");
    const company = (await ctx.db.get(member.companyId)) as { ownerUserId: Id<"users">; name: string } | null;
    if (!company || company.ownerUserId !== user._id) throw new Error("Seul le dirigeant peut retirer un membre.");
    const u = (await ctx.db.get(member.userId)) as { name?: string } | null;
    await ctx.db.patch(args.memberId, { isActive: false, updatedAt: Date.now() });
    await logChange(ctx, user._id, "team.remove", `Retrait de ${u?.name ?? "un membre"} (${member.role}) de « ${company.name} »`);
    await notify(
      ctx,
      member.userId,
      "general",
      "Rattachement retiré",
      `${company.name} a retiré votre rattachement (« ${member.role} »). Vos données personnelles restent inchangées.`,
    );
  },
});

// ============ ADMIN : VÉRIFICATION DES ENTREPRISES (§14, §16) ============

/** Liste des entreprises pour l'administration (tous statuts). */
export const adminListCompanies = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") throw new Error("Action réservée à l'administration.");
    const rows = (await ctx.db.query("companies").collect()) as any[];
    const sorted = rows.sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      sorted.map(async (c) => {
        const owner = (await ctx.db.get(c.ownerUserId as never)) as { name?: string; phone?: string } | null;
        return {
          kind: "company" as const,
          id: c._id as string,
          row: c,
          user: owner ? { name: owner.name ?? null, phone: owner.phone ?? null } : null,
        };
      }),
    );
  },
});

/** Validation admin d'un profil entreprise : VERIFIED / REJECTED / UNDER_REVIEW. */
export const adminReviewCompany = mutation({
  args: {
    id: v.id("companies"),
    decision: v.union(v.literal("VERIFIED"), v.literal("REJECTED"), v.literal("UNDER_REVIEW")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") throw new Error("Action réservée à l'administration.");
    const row = (await ctx.db.get(args.id)) as { ownerUserId: Id<"users">; name: string } | null;
    if (!row) throw new Error("Entreprise introuvable.");
    await ctx.db.patch(args.id, {
      status: args.decision,
      reviewNote: args.note?.trim() || undefined,
      verifiedAt: args.decision === "VERIFIED" ? Date.now() : undefined,
      verifiedBy: args.decision === "VERIFIED" ? admin._id : undefined,
      ...nowFields(),
    });
    await logChange(
      ctx,
      row.ownerUserId,
      `company.${args.decision.toLowerCase()}`,
      args.decision === "VERIFIED"
        ? `Entreprise « ${row.name} » vérifiée par GTEC PRO ✓`
        : args.decision === "REJECTED"
          ? `Entreprise « ${row.name} » refusée`
          : `Entreprise « ${row.name} » en cours d'examen`,
    );
    await notify(
      ctx,
      row.ownerUserId,
      "general",
      args.decision === "VERIFIED" ? "Entreprise vérifiée ✓" : args.decision === "REJECTED" ? "Entreprise refusée" : "Vérification en cours",
      args.decision === "VERIFIED"
        ? `Le profil de « ${row.name} » est vérifié par GTEC PRO. Il sera mis en avant auprès des clients.`
        : args.decision === "REJECTED"
          ? `Le profil de « ${row.name} » n'a pas été validé. ${args.note ?? ""}`.trim()
          : `Le profil de « ${row.name} » est en cours d'examen par l'administration.`,
    );
  },
});
