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
