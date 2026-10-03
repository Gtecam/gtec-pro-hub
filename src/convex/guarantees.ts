// GTEC PRO — GARANTIES DE TRAVAUX (F°13) + MISSIONS AVANCÉES (F°10, F°12).
// Réutilise le module missions.ts existant et ajoute les garanties.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser, notify, notifyAdmins } from "./gtec";

// ========================= GARANTIES DE TRAVAUX (F°13) =========================

/** Ouvre la garantie de travaux à la réception client (30 jours par défaut,
 * durée = garantie du rapport). Idempotent. Appelée après clientReception. */
export const ensureWorkGuarantee = mutation({
  args: { requestId: v.id("serviceRequests"), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Mission introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") throw new Error("Action non autorisée.");
    const existing = await ctx.db
      .query("workGuarantees")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    if (existing.length > 0) return;
    const report = (await ctx.db
      .query("interventionReports")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect()) as Doc<"interventionReports">[];
    const days = Math.min(Math.max(args.days ?? Math.round((report[0]?.warrantyMonths ?? 1) * 30), 7), 365);
    const startedAt = Date.now();
    await ctx.db.insert("workGuarantees", {
      requestId: args.requestId,
      clientId: request.clientId,
      startedAt,
      days,
      until: startedAt + days * 86400000,
      status: "ACTIVE",
      isActive: true,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
  },
});

/** Garanties actives du client. */
export const myActiveGuarantees = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("workGuarantees")
      .withIndex("by_request", (q) => q.eq("clientId", user._id))
      .collect();
    const now = Date.now();
    const active = rows.filter((g) => g.status === "ACTIVE" && g.until > now);
    const out = await Promise.all(
      active.map(async (g) => {
        const request = (await ctx.db.get(g.requestId as never)) as Doc<"serviceRequests"> | undefined;
        return {
          _id: g._id,
          requestId: g.requestId,
          reference: request?.reference ?? "",
          title: request?.interventionLabel ?? request?.title ?? "",
          until: g.until,
          days: g.days,
        };
      }),
    );
    return out;
  },
});

/** Client : liste les signalements ouverts (garantie), rattachés à la mission. */
export const listWarrantyClaims = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const claims = await ctx.db
      .query("buildingEvents")
      .withIndex("by_building", (q) => q.eq("buildingId", user._id))
      .collect()
      .then((rows) => rows.filter((e) => e.kind === "garantie"));
    return claims;
  },
});

/** Client : signale un défaut pendant une garantie. */
export const createWarrantyClaim = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    description: v.string(),
    photos: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Mission introuvable.");
    if (request.clientId !== user._id) throw new Error("Accès interdit.");
    if (request.status !== "terminee") throw new Error("Seules les missions terminées sont couvertes.");
    const existing = await ctx.db
      .query("workGuarantees")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    const guarantee = existing[0];
    if (!guarantee) throw new Error("Aucune garantie de travaux pour cette mission.");
    if (guarantee.status !== "ACTIVE") throw new Error("La garantie est expirée.");
    if (guarantee.until < Date.now()) throw new Error("La garantie est expirée.");
    await ctx.db.insert("buildingEvents", {
      buildingId: guarantee.requestId,
      kind: "garantie",
      label: "Signalement garantie",
      detail: args.description.slice(0, 280),
      at: Date.now(),
    });
    await notify(
      ctx,
      guarantee.clientId,
      "garantie",
      "Signalement ouvert",
      `Votre signalement garantie pour « ${guarantee.reference} » est enregistré — l'équipe d'intervention le suit.`,
    );
    return true;
  },
});

/** Admin : instruction d'un signalement de garantie. */
export const adminReviewWarrantyClaim = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    decision: v.union(v.literal("accepte"), v.literal("refuse")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Mission introuvable.");
    const existing = await ctx.db
      .query("workGuarantees")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    const guarantee = existing[0];
    if (!guarantee) throw new Error("Aucune garantie pour cette mission.");
    await ctx.db.patch(guarantee._id as never, {
      status: args.decision === "accepte" ? "ACTIVE" : "EXPIRED",
      updatedAt: Date.now(),
    });
    if (args.decision === "accepte") {
      await notifyAdmins(
        ctx,
        "garantie",
        "Signalement garantie accepté",
        `La garantie « ${guarantee.reference} » est acceptée — l'équipe est notifiée pour un contrôle.`,
      );
    } else {
      await notifyAdmins(
        ctx,
        "garantie",
        "Signalement garantie refusé",
        `La garantie « ${guarantee.reference} » est refusée — ${args.note ?? ""}`.slice(0, 280),
      );
    }
  },
});

/** Admin : ferme une garantie (clôture d'une mission). */
export const resolveWarrantyClaim = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Mission introuvable.");
    const existing = await ctx.db
      .query("workGuarantees")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    const guarantee = existing[0];
    if (!guarantee) return;
    await ctx.db.patch(guarantee._id as never, { status: "EXPIRED", updatedAt: Date.now() });
  },
});

export default { ensureWorkGuarantee, myActiveGuarantees, listWarrantyClaims, createWarrantyClaim, adminReviewWarrantyClaim, resolveWarrantyClaim };
