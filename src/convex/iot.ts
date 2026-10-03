import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * GTEC PRO — MODULE IoT (phase 7) : relevés de compteurs et capteurs
 * rattachés aux équipements du dossier technique. Chaque relevé est une
 * mesure déclarée (saisie terrain ou passerelle) historisée comme événement
 * technique du bâtiment (buildingEvents, kind « iot ») — traçable, jamais
 * certifiée automatiquement : une mesure anormale déclenche une alerte de
 * contrôle, pas une décision automatique.
 */

const IOT_KINDS = ["conso_elec", "conso_eau", "conso_gaz", "temperature", "autre"] as const;
type IotKind = (typeof IOT_KINDS)[number];

const IOT_LABELS: Record<IotKind, string> = {
  conso_elec: "Compteur électrique",
  conso_eau: "Compteur d'eau",
  conso_gaz: "Compteur de gaz",
  temperature: "Capteur de température",
  autre: "Autre capteur",
};

/** Vérifie que l'utilisateur peut écrire dans le dossier du bâtiment. */
async function assertCanWriteAsset(ctx: any, assetId: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  const asset = (await ctx.db.get(assetId as never)) as Doc<"buildingAssets"> | null;
  if (!asset || asset.isActive === false) throw new Error("Équipement introuvable.");
  const building = (await ctx.db.get(asset.buildingId)) as Doc<"buildings"> | null;
  if (!building) throw new Error("Bâtiment introuvable.");
  const isOwner = building.ownerUserId === user._id;
  let hasGrant = false;
  if (!isOwner) {
    const grants = (await ctx.db
      .query("buildingAccessGrants")
      .withIndex("by_user", (q: any) => q.eq("grantedToUserId", user._id))
      .collect()) as any[];
    hasGrant = grants.some(
      (g) => g.buildingId === building._id && g.isActive && g.until > Date.now(),
    );
  }
  if (!isOwner && !hasGrant && user.role !== "admin") {
    throw new Error("Action non autorisée sur cet équipement.");
  }
  return { user, asset, building };
}

/** Enregistre un relevé IoT sur un équipement (saisie terrain ou passerelle). */
export const addReading = mutation({
  args: {
    assetId: v.string(),
    kind: v.union(
      v.literal("conso_elec"),
      v.literal("conso_eau"),
      v.literal("conso_gaz"),
      v.literal("temperature"),
      v.literal("autre"),
    ),
    value: v.number(),
    unit: v.string(), // kWh, m³, °C…
    note: v.optional(v.string()),
    readAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { asset, building } = await assertCanWriteAsset(ctx, args.assetId);
    if (!Number.isFinite(args.value)) throw new Error("Valeur de mesure invalide.");
    const unit = args.unit.trim() || "unité";
    const readAt = args.readAt ?? Date.now();

    // Dernier relevé du même type : calcul de l'écart (delta) si ordre croissant.
    const previous = ((await ctx.db
      .query("buildingEvents")
      .withIndex("by_building", (q: any) => q.eq("buildingId", building._id))
      .collect()) as any[])
      .filter(
        (e) =>
          e.kind === "iot" &&
          e.assetId === asset._id &&
          (e.detail ?? "").startsWith(`${IOT_LABELS[args.kind as IotKind]} —`),
      )
      .sort((a, b) => b.at - a.at)[0];

    let deltaText = "";
    if (previous) {
      const prevValue = Number((previous.detail ?? "").match(/:\s*(-?[\d.]+)/)?.[1]);
      if (Number.isFinite(prevValue) && args.kind !== "temperature") {
        const delta = args.value - prevValue;
        deltaText =
          delta >= 0
            ? ` (+${delta.toLocaleString("fr-FR")} ${unit} depuis le dernier relevé)`
            : ` (${delta.toLocaleString("fr-FR")} ${unit} — vérifier le compteur)`;
      }
    }

    await ctx.db.insert("buildingEvents", {
      buildingId: building._id,
      assetId: asset._id,
      kind: "iot",
      label: `Relevé ${IOT_LABELS[args.kind as IotKind]} — ${asset.label}`,
      detail: `${IOT_LABELS[args.kind as IotKind]} — ${args.value.toLocaleString("fr-FR")} ${unit} : ${args.value}${deltaText}${args.note ? ` · ${args.note.trim()}` : ""}`,
      at: readAt,
    });

    return { ok: true as const };
  },
});

/** Historique des relevés d'un équipement (du plus récent au plus ancien). */
export const assetReadings = query({
  args: { assetId: v.string() },
  handler: async (ctx, args) => {
    const { asset, building } = await assertCanWriteAsset(ctx, args.assetId);
    const events = ((await ctx.db
      .query("buildingEvents")
      .withIndex("by_building", (q: any) => q.eq("buildingId", building._id))
      .collect()) as any[])
      .filter((e) => e.kind === "iot" && e.assetId === asset._id)
      .sort((a, b) => b.at - a.at)
      .slice(0, 60);
    return {
      asset: { _id: asset._id, label: asset.label },
      building: { _id: building._id, name: building.name },
      readings: events,
    };
  },
});

/** Synthèse IoT d'un bâtiment : dernier relevé par équipement (vue dossier). */
export const buildingIotOverview = query({
  args: { buildingId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Utilisateur introuvable.");
    const building = (await ctx.db.get(args.buildingId as never)) as Doc<"buildings"> | null;
    if (!building || building.isActive === false) throw new Error("Bâtiment introuvable.");
    const isOwner = building.ownerUserId === user._id;
    if (!isOwner && user.role !== "admin") {
      const grants = (await ctx.db
        .query("buildingAccessGrants")
        .withIndex("by_user", (q: any) => q.eq("grantedToUserId", user._id))
        .collect()) as any[];
      if (!grants.some((g) => g.buildingId === building._id && g.isActive && g.until > Date.now())) {
        throw new Error("Action non autorisée.");
      }
    }
    const assets = ((await ctx.db
      .query("buildingAssets")
      .withIndex("by_building", (q: any) => q.eq("buildingId", building._id))
      .collect()) as any[]).filter((a) => a.isActive !== false);
    const events = ((await ctx.db
      .query("buildingEvents")
      .withIndex("by_building", (q: any) => q.eq("buildingId", building._id))
      .collect()) as any[])
      .filter((e) => e.kind === "iot")
      .sort((a, b) => b.at - a.at);
    const overview = assets.map((a) => ({
      assetId: a._id as string,
      label: a.label as string,
      lastReading: events.find((e) => e.assetId === a._id) ?? null,
      readingCount: events.filter((e) => e.assetId === a._id).length,
    }));
    return {
      withReadings: overview.filter((o) => o.lastReading),
      withoutReadings: overview.filter((o) => !o.lastReading).map((o) => ({ assetId: o.assetId, label: o.label })),
    };
  },
});
