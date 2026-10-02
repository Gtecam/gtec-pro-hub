import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, notify } from "./gtec";

/**
 * GTEC PRO — DOSSIER TECHNIQUE NUMÉRIQUE DU BÂTIMENT (F°5, F°6, F°7, F°33).
 * Chaque bâtiment (résidence, hôtel, immeuble de bureaux…) possède un dossier
 * permanent : équipements avec QR codes, documents (plans, certificats),
 * historique d'événements et accès temporaires accordés à des techniciens.
 * Aucune donnée n'est supprimée : archivage (isActive) uniquement (§26).
 * Les tokens QR sont vérifiés côté serveur à chaque accès (§40).
 */

const randToken = (): string => {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/** Peut lire le dossier ? Propriétaire, accès « lecture/intervention » actif, ou admin. */
async function assertCanRead(ctx: any, building: Doc<"buildings">, userId: Id<"users">, role?: string) {
  if (building.ownerUserId === userId) return;
  if (role === "admin") return;
  const grants = (await ctx.db
    .query("buildingAccessGrants")
    .withIndex("by_user", (q: any) => q.eq("grantedToUserId", userId))
    .collect()) as any[];
  const now = Date.now();
  if (grants.some((g) => g.buildingId === building._id && g.isActive && g.until > now)) return;
  throw new Error("Accès refusé à ce dossier bâtiment.");
}

/** Peut écrire / intervenir ? Propriétaire, accès « intervention » actif, ou admin. */
async function assertCanWrite(ctx: any, building: Doc<"buildings">, userId: Id<"users">, role?: string) {
  if (building.ownerUserId === userId) return;
  if (role === "admin") return;
  const grants = (await ctx.db
    .query("buildingAccessGrants")
    .withIndex("by_user", (q: any) => q.eq("grantedToUserId", userId))
    .collect()) as any[];
  const now = Date.now();
  if (grants.some((g) => g.buildingId === building._id && g.isActive && g.until > now && g.scope === "intervention"))
    return;
  throw new Error("Modification réservée au propriétaire ou à un technicien autorisé.");
}

// ============================== BÂTIMENTS ==================================

/** Mes bâtiments (propriétaire) + ceux auxquels j'ai un accès temporaire. */
export const myBuildings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const owned = (await ctx.db
      .query("buildings")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", user._id))
      .collect()) as any[];
    const myGrants = ((await ctx.db
      .query("buildingAccessGrants")
      .withIndex("by_user", (q: any) => q.eq("grantedToUserId", user._id))
      .collect()) as any[]).filter((g) => g.isActive && g.until > Date.now());
    const sharedIds = [...new Set(myGrants.map((g) => g.buildingId))];
    const shared = (await Promise.all(
      sharedIds.map((id) => ctx.db.get(id as never)),
    )) as (Doc<"buildings"> | null)[];
    return {
      owned: owned.filter((b) => b.isActive !== false).sort((a, b) => b.createdAt - a.createdAt),
      shared: shared
        .filter((b): b is Doc<"buildings"> => !!b)
        .map((b) => ({
          _id: b._id,
          name: b.name,
          city: b.city,
          kind: b.kind,
          scope: myGrants.find((g) => g.buildingId === b._id)?.scope ?? "lecture",
          until: myGrants.find((g) => g.buildingId === b._id)?.until ?? 0,
        })),
    };
  },
});

/** Dossier complet d'un bâtiment : équipements, documents, événements. */
export const getBuilding = query({
  args: { id: v.id("buildings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const building = (await ctx.db.get(args.id)) as Doc<"buildings"> | null;
    if (!building || building.isActive === false) throw new Error("Bâtiment introuvable.");
    await assertCanRead(ctx, building, user._id, user.role);
    const assets = ((await ctx.db
      .query("buildingAssets")
      .withIndex("by_building", (q: any) => q.eq("buildingId", args.id))
      .collect()) as any[]).filter((a) => a.isActive !== false);
    const documents = ((await ctx.db
      .query("buildingDocuments")
      .withIndex("by_building", (q: any) => q.eq("buildingId", args.id))
      .collect()) as any[]).filter((d) => d.isActive !== false);
    const events = ((await ctx.db
      .query("buildingEvents")
      .withIndex("by_building", (q: any) => q.eq("buildingId", args.id))
      .collect()) as any[]).sort((a, b) => b.at - a.at);
    const grants = ((await ctx.db
      .query("buildingAccessGrants")
      .withIndex("by_building", (q: any) => q.eq("buildingId", args.id))
      .collect()) as any[]).filter((g) => g.isActive);
    const grantedUsers = await Promise.all(
      grants.map(async (g) => {
        const u = (await ctx.db.get(g.grantedToUserId)) as { name?: string; phone?: string } | null;
        return { ...g, userName: u?.name ?? null };
      }),
    );
    return { building, assets, documents, events, grants: grantedUsers };
  },
});

/** Création / mise à jour d'un bâtiment. */
export const upsertBuilding = mutation({
  args: {
    id: v.optional(v.id("buildings")),
    name: v.string(),
    kind: v.string(),
    city: v.string(),
    quarter: v.optional(v.string()),
    address: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    const city = args.city.trim();
    if (name.length < 2) throw new Error("Indiquez le nom du bâtiment.");
    if (city.length < 2) throw new Error("Indiquez la ville.");
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as Doc<"buildings"> | null;
      if (!row || row.ownerUserId !== user._id) throw new Error("Bâtiment introuvable.");
      await ctx.db.patch(args.id, {
        name,
        kind: args.kind,
        city,
        quarter: args.quarter?.trim() || undefined,
        address: args.address?.trim() || undefined,
        description: args.description?.trim() || undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("buildings", {
        ownerUserId: user._id,
        name,
        kind: args.kind,
        city,
        quarter: args.quarter?.trim() || undefined,
        address: args.address?.trim() || undefined,
        description: args.description?.trim() || undefined,
        publicToken: randToken(),
        publicEnabled: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/** Active/désactive l'affichage public du QR bâtiment (page /verify/:token). */
export const setBuildingPublic = mutation({
  args: { id: v.id("buildings"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as Doc<"buildings"> | null;
    if (!row || (row.ownerUserId !== user._id && user.role !== "admin"))
      throw new Error("Bâtiment introuvable.");
    await ctx.db.patch(args.id, { publicEnabled: args.enabled, updatedAt: Date.now() });
  },
});

/** Archive un bâtiment (jamais de suppression destructive). */
export const archiveBuilding = mutation({
  args: { id: v.id("buildings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as Doc<"buildings"> | null;
    if (!row || (row.ownerUserId !== user._id && user.role !== "admin"))
      throw new Error("Bâtiment introuvable.");
    await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });
  },
});

// ============================== ÉQUIPEMENTS =================================

/** Ajout / modification d'un équipement (génère ou conserve son QR token). */
export const upsertAsset = mutation({
  args: {
    id: v.optional(v.id("buildingAssets")),
    buildingId: v.id("buildings"),
    label: v.string(),
    domainCode: v.optional(v.string()),
    model: v.optional(v.string()),
    brand: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    installedAt: v.optional(v.number()),
    warrantyMonths: v.optional(v.number()),
    warrantyUntil: v.optional(v.number()),
    nextMaintenanceAt: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const building = (await ctx.db.get(args.buildingId)) as Doc<"buildings"> | null;
    if (!building) throw new Error("Bâtiment introuvable.");
    await assertCanWrite(ctx, building, user._id, user.role);
    const label = args.label.trim();
    if (label.length < 2) throw new Error("Indiquez le nom de l'équipement.");
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as Doc<"buildingAssets"> | null;
      if (!row || row.buildingId !== args.buildingId) throw new Error("Équipement introuvable.");
      await ctx.db.patch(args.id, {
        label,
        domainCode: args.domainCode || undefined,
        model: args.model?.trim() || undefined,
        brand: args.brand?.trim() || undefined,
        serialNumber: args.serialNumber?.trim() || undefined,
        installedAt: args.installedAt,
        warrantyMonths: args.warrantyMonths,
        warrantyUntil: args.warrantyUntil,
        nextMaintenanceAt: args.nextMaintenanceAt,
        status: args.status?.trim() || undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("buildingAssets", {
        buildingId: args.buildingId,
        ownerUserId: building.ownerUserId,
        label,
        domainCode: args.domainCode || undefined,
        model: args.model?.trim() || undefined,
        brand: args.brand?.trim() || undefined,
        serialNumber: args.serialNumber?.trim() || undefined,
        installedAt: args.installedAt,
        warrantyMonths: args.warrantyMonths,
        warrantyUntil: args.warrantyUntil,
        nextMaintenanceAt: args.nextMaintenanceAt,
        status: args.status?.trim() || "operationnel",
        qrToken: randToken(),
        publicEnabled: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/** Alerte 30 jours avant expiration de garantie (F°7) — appelé à l'ouverture. */
export const myWarrantyAlerts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const buildings = (await ctx.db
      .query("buildings")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", user._id))
      .collect()) as any[];
    const alerts = [] as Array<{
      assetId: string;
      buildingName: string;
      label: string;
      warrantyUntil: number;
      daysLeft: number;
    }>;
    for (const b of buildings.filter((x) => x.isActive !== false)) {
      const assets = ((await ctx.db
        .query("buildingAssets")
        .withIndex("by_building", (q: any) => q.eq("buildingId", b._id))
        .collect()) as any[]).filter((a) => a.isActive !== false);
      for (const a of assets) {
        if (!a.warrantyUntil) continue;
        const daysLeft = Math.ceil((a.warrantyUntil - Date.now()) / 86400000);
        if (daysLeft <= 30) {
          alerts.push({
            assetId: a._id as string,
            buildingName: b.name,
            label: a.label,
            warrantyUntil: a.warrantyUntil,
            daysLeft,
          });
        }
      }
    }
    return alerts.sort((x, y) => x.daysLeft - y.daysLeft);
  },
});

// =============================== DOCUMENTS ==================================

/** Ajoute un document au dossier (plan, certificat, photo…). */
export const addBuildingDocument = mutation({
  args: {
    buildingId: v.id("buildings"),
    kind: v.string(),
    title: v.string(),
    documentUrl: v.optional(v.string()),
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const building = (await ctx.db.get(args.buildingId)) as Doc<"buildings"> | null;
    if (!building) throw new Error("Bâtiment introuvable.");
    await assertCanWrite(ctx, building, user._id, user.role);
    const title = args.title.trim();
    if (title.length < 2) throw new Error("Indiquez le titre du document.");
    await ctx.db.insert("buildingDocuments", {
      buildingId: args.buildingId,
      kind: args.kind,
      title,
      documentUrl: args.documentUrl || undefined,
      note: args.note?.trim() || undefined,
      expiresAt: args.expiresAt,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// =============================== ÉVÉNEMENTS =================================

/** Enregistre un événement technique (maintenance, panne, inspection…). */
export const addBuildingEvent = mutation({
  args: {
    buildingId: v.id("buildings"),
    assetId: v.optional(v.id("buildingAssets")),
    kind: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const building = (await ctx.db.get(args.buildingId)) as Doc<"buildings"> | null;
    if (!building) throw new Error("Bâtiment introuvable.");
    await assertCanWrite(ctx, building, user._id, user.role);
    const label = args.label.trim();
    if (label.length < 2) throw new Error("Indiquez l'intitulé de l'événement.");
    await ctx.db.insert("buildingEvents", {
      buildingId: args.buildingId,
      assetId: args.assetId,
      kind: args.kind,
      label,
      detail: args.detail?.trim() || undefined,
      at: args.at ?? Date.now(),
    });
  },
});

// =========================== ACCÈS TEMPORAIRES ==============================

/** Accorde un accès temporaire à un technicien par téléphone (F°5, §11). */
export const grantBuildingAccess = mutation({
  args: {
    buildingId: v.id("buildings"),
    phone: v.string(),
    scope: v.union(v.literal("lecture"), v.literal("intervention")),
    hours: v.number(), // durée en heures (max 30 jours)
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const building = (await ctx.db.get(args.buildingId)) as Doc<"buildings"> | null;
    if (!building || building.ownerUserId !== user._id)
      throw new Error("Seul le propriétaire peut accorder un accès.");
    const phone = args.phone.replace(/\s+/g, "");
    const target = (await ctx.db
      .query("users")
      .withIndex("phone", (q: any) => q.eq("phone", phone))
      .first()) as { _id: Id<"users">; name?: string } | null;
    if (!target) throw new Error("Aucun compte GTEC PRO avec ce numéro.");
    if (target._id === user._id) throw new Error("Vous êtes déjà propriétaire de ce dossier.");
    const hours = Math.min(Math.max(Math.round(args.hours), 1), 720);
    await ctx.db.insert("buildingAccessGrants", {
      buildingId: args.buildingId,
      grantedToUserId: target._id,
      grantedByUserId: user._id,
      scope: args.scope,
      until: Date.now() + hours * 3600000,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await notify(
      ctx,
      target._id,
      "general",
      "Accès à un dossier bâtiment",
      `${building.name} vous a accordé un accès « ${args.scope} » pendant ${hours} h.`,
    );
  },
});

/** Révoque un accès temporaire (propriétaire uniquement). */
export const revokeBuildingAccess = mutation({
  args: { grantId: v.id("buildingAccessGrants") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const grant = (await ctx.db.get(args.grantId)) as Doc<"buildingAccessGrants"> | null;
    if (!grant) throw new Error("Accès introuvable.");
    const building = (await ctx.db.get(grant.buildingId)) as Doc<"buildings"> | null;
    if (!building || building.ownerUserId !== user._id)
      throw new Error("Seul le propriétaire peut révoquer un accès.");
    await ctx.db.patch(args.grantId, { isActive: false, updatedAt: Date.now() });
    await notify(ctx, grant.grantedToUserId, "general", "Accès révoqué", `L'accès au dossier « ${building.name} » a été révoqué.`);
  },
});

// ======================== QR PUBLICS (contrôlés) ============================

/** Page publique /verify/:token — vue masquée, sans données personnelles. */
export const getPublicBuilding = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const building = (await ctx.db
      .query("buildings")
      .withIndex("by_token", (q: any) => q.eq("publicToken", args.token))
      .first()) as Doc<"buildings"> | null;
    if (!building || building.isActive === false || building.publicEnabled !== true) return null;
    const assets = ((await ctx.db
      .query("buildingAssets")
      .withIndex("by_building", (q: any) => q.eq("buildingId", building._id))
      .collect()) as any[]).filter((a) => a.isActive !== false && a.publicEnabled === true);
    return {
      name: building.name,
      kind: building.kind,
      city: building.city,
      publicAssets: assets.map((a) => ({
        label: a.label,
        brand: a.brand ?? null,
        model: a.model ?? null,
        installedAt: a.installedAt ?? null,
      })),
    };
  },
});

/** Fiche équipement scannée : /asset/:token — accès contrôlé par permissions. */
export const getScannedAsset = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const asset = (await ctx.db
      .query("buildingAssets")
      .withIndex("by_token", (q: any) => q.eq("qrToken", args.token))
      .first()) as Doc<"buildingAssets"> | null;
    if (!asset || asset.isActive === false) return null;
    const building = (await ctx.db.get(asset.buildingId)) as Doc<"buildings"> | null;
    if (!building) return null;
    // Permissions (§40) : le scanner doit avoir un droit actif sur le dossier.
    await assertCanRead(ctx, building, user._id, user.role);
    const events = ((await ctx.db
      .query("buildingEvents")
      .withIndex("by_building", (q: any) => q.eq("buildingId", building._id))
      .collect()) as any[])
      .filter((e) => e.assetId === asset._id)
      .sort((a, b) => b.at - a.at)
      .slice(0, 30);
    return {
      asset: {
        _id: asset._id,
        label: asset.label,
        domainCode: asset.domainCode ?? null,
        brand: asset.brand ?? null,
        model: asset.model ?? null,
        serialNumber: asset.serialNumber ?? null,
        installedAt: asset.installedAt ?? null,
        warrantyMonths: asset.warrantyMonths ?? null,
        warrantyUntil: asset.warrantyUntil ?? null,
        nextMaintenanceAt: asset.nextMaintenanceAt ?? null,
        status: asset.status ?? null,
      },
      building: { _id: building._id, name: building.name, city: building.city },
      events,
    };
  },
});
