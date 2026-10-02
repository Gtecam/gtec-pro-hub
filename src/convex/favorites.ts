import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./gtec";

/**
 * GTEC PRO — Favoris client (§35 « ❤️ MES FAVORIS »).
 *
 * Le client enregistre les professionnels, entreprises et services qu'il
 * connaît pour les retrouver vite et commander directement auprès d'eux, dans
 * le respect des règles GTEC PRO (devis signé, KYC, abonnement). Le favori
 * n'accorde aucun accès privilégié : il ne donne accès à aucune donnée privée
 * et ne contourne ni le matching ni les vérifications.
 */

export const myFavorites = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = (await ctx.db
      .query("favorites")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const addFavorite = mutation({
  args: {
    targetType: v.union(v.literal("technician"), v.literal("company"), v.literal("service")),
    targetId: v.string(),
    label: v.string(),
    subtitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const label = args.label.trim();
    if (label.length < 2) throw new Error("Intitulé invalide.");
    if (!args.targetId.trim()) throw new Error("Référence invalide.");
    const existing = (await ctx.db
      .query("favorites")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const dup = existing.find(
      (f) => f.targetType === args.targetType && f.targetId === args.targetId,
    );
    if (dup) return dup._id;
    const now = Date.now();
    return await ctx.db.insert("favorites", {
      userId: user._id,
      targetType: args.targetType,
      targetId: args.targetId,
      label,
      subtitle: args.subtitle?.trim() || undefined,
      createdAt: now,
    });
  },
});

export const removeFavorite = mutation({
  args: { id: v.id("favorites") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as { userId: string } | null;
    if (!row || row.userId !== user._id) throw new Error("Favori introuvable.");
    await ctx.db.delete(args.id);
  },
});