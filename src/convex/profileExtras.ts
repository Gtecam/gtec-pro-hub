import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, notify } from "./gtec";

/**
 * GTEC PRO — Profil évolutif : extensions (MON PROFIL, §1-§28 du référentiel).
 * Complète `profile.ts` sans le toucher :
 *  - §10 : équipements / matériels déclarés (« MON MATÉRIEL ») ;
 *  - §22 : confirmation annuelle « MES INFORMATIONS SONT TOUJOURS EXACTES » ;
 *  - §19 : profil public limité aux informations non sensibles — le nom du
 *    client, les adresses exactes, les documents administratifs et tout
 *    contact direct ne sont JAMAIS exposés.
 * Déclaration ≠ vérification (§26) : seules les entrées VERIFIED par GTEC
 * apparaissent comme vérifiées côté public.
 */

/** Journal des modifications (même table que profile.ts, §15, non supprimable). */
async function logChange(
  ctx: { db: any },
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

// ======================= §10 — MON MATÉRIEL =================================

export const myEquipment = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = (await ctx.db
      .query("technicianEquipment")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    return rows.filter((r) => r.isActive).sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const upsertEquipment = mutation({
  args: {
    id: v.optional(v.id("technicianEquipment")),
    label: v.string(),
    brand: v.optional(v.string()),
    model: v.optional(v.string()),
    quantity: v.number(),
    condition: v.optional(
      v.union(
        v.literal("neuf"),
        v.literal("bon_etat"),
        v.literal("use"),
        v.literal("a_reparer"),
        v.literal("reforme"),
      ),
    ),
    photoUrl: v.optional(v.string()),
    acquiredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const label = args.label.trim();
    if (label.length < 2) throw new Error("Précisez le nom de l'équipement.");
    const quantity = Math.max(1, Math.floor(args.quantity || 1));
    const now = Date.now();
    const fields = {
      label,
      brand: args.brand?.trim() || undefined,
      model: args.model?.trim() || undefined,
      quantity,
      condition: args.condition,
      photoUrl: args.photoUrl?.trim() || undefined,
      acquiredAt: args.acquiredAt,
      updatedAt: now,
    };
    if (args.id) {
      const item = (await ctx.db.get(args.id)) as Doc<"technicianEquipment"> | null;
      if (!item || item.userId !== user._id) throw new Error("Équipement introuvable.");
      await ctx.db.patch(args.id, fields);
      await logChange(ctx, user._id, "equipment.update", `Matériel modifié : ${label}`, item.label, label);
      return;
    }
    await ctx.db.insert("technicianEquipment", {
      userId: user._id,
      ...fields,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await logChange(ctx, user._id, "equipment.add", `Matériel déclaré : ${label}`, undefined, label);
    await notify(
      ctx,
      user._id,
      "profil",
      "Matériel ajouté",
      `« ${label} » figure désormais dans MON MATÉRIEL.`,
    );
  },
});

/** Archivage uniquement (§26) : jamais de suppression définitive. */
export const removeEquipment = mutation({
  args: { id: v.id("technicianEquipment") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = (await ctx.db.get(args.id)) as Doc<"technicianEquipment"> | null;
    if (!item || item.userId !== user._id) throw new Error("Équipement introuvable.");
    await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });
    await logChange(ctx, user._id, "equipment.remove", `Matériel retiré : ${item.label}`, item.label);
  },
});

// ==================== §22 — CONFIRMATION ANNUELLE ===========================

/** Dernière confirmation du profil (null si jamais confirmé). */
export const myProfileConfirmation = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = (await ctx.db
      .query("profileConfirmations")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    if (rows.length === 0) return null;
    return rows.sort((a, b) => b.confirmedAt - a.confirmedAt)[0];
  },
});

/**
 * « MES INFORMATIONS SONT TOUJOURS EXACTES » (§22) : l'adhérent confirme
 * annuellement l'exactitude de son profil. Traçable, non supprimable.
 */
export const confirmProfileUpToDate = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    await ctx.db.insert("profileConfirmations", { userId: user._id, confirmedAt: now });
    await logChange(
      ctx,
      user._id,
      "profile.confirmation",
      "Profil confirmé à jour (rappel annuel)",
      undefined,
      new Date(now).toLocaleDateString("fr-FR"),
    );
  },
});

// ======================= §19 — PROFIL PUBLIC ================================

/**
 * Fiche publique d'un technicien (/t/:userId). Aucune authentification.
 * Sont exposés uniquement : identité légère, métier/spécialité, ville/zone,
 * disponibilité, note, nombre d'interventions, ancienneté, compétences et
 * certifications VÉRIFIÉES, réalisations publiques. Sont exclus : téléphone,
 * e-mail, adresse exacte, CNI, documents, données clients, montants.
 */
export const publicTechnicianProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profiles = (await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .collect()) as any[];
    const profile = profiles[0];
    if (!profile) return null;

    const user = (await ctx.db.get(args.userId)) as Doc<"users"> | null;
    if (!user) return null;

    const now = Date.now();
    const [skills, certifications, projects, reviews, assignments] = await Promise.all([
      ctx.db
        .query("technicianSkills")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("profileCertifications")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("portfolioProjects")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("reviews")
        .withIndex("by_tech", (q: any) => q.eq("techUserId", args.userId))
        .collect(),
      ctx.db.query("assignments").collect(),
    ]);

    const verifiedSkills = (skills as any[])
      .filter((s) => s.isActive && s.status === "VERIFIED")
      .sort((a, b) => (b.yearsPracticed ?? 0) - (a.yearsPracticed ?? 0));
    const verifiedCerts = (certifications as any[])
      .filter(
        (c) => c.isActive && c.status === "VERIFIED" && (!c.expiresAt || c.expiresAt > now),
      )
      .sort((a, b) => (b.obtainedAt ?? 0) - (a.obtainedAt ?? 0));
    const publicProjects = (projects as any[])
      .filter((p) => p.isActive && p.isPublic)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 12);

    const ratings = (reviews as any[]).map((r) => r.rating).filter((n) => typeof n === "number");
    const avgRating = ratings.length
      ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10
      : null;
    const finishedCount = (assignments as any[]).filter(
      (a) => a.members?.some((m: any) => m.id === args.userId) && a.requestId,
    ).length;

    return {
      name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || user.name || null,
      image: user.image ?? null,
      jobTitle: profile.jobTitle ?? profile.profession ?? profile.specialty,
      domainLabel: profile.specialty ?? null,
      city: profile.city ?? null,
      zones: profile.zones ?? [],
      bio: profile.bio ?? null,
      availability: profile.availability ?? null,
      memberSince: (profile as unknown as { _creationTime: number })._creationTime,
      skills: verifiedSkills.map((s) => ({
        skill: s.skill,
        level: s.level ?? null,
        yearsPracticed: s.yearsPracticed ?? null,
      })),
      certifications: verifiedCerts.map((c) => ({
        name: c.name,
        organization: c.organization ?? null,
        obtainedAt: c.obtainedAt ?? null,
        expiresAt: c.expiresAt ?? null,
      })),
      projects: publicProjects.map((p) => ({
        title: p.title,
        description: p.description ?? null,
        city: p.city ?? null,
        completedAt: p.completedAt ?? null,
        photo: p.photosAfter?.[0] ?? p.photosBefore?.[0] ?? null,
      })),
      avgRating,
      ratingCount: ratings.length,
      finishedCount,
    };
  },
});
