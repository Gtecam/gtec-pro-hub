import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUser, notify } from "./gtec";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * GTEC PRO — Garantie de travaux (F°13). Un signalement pendant la période
 * de garantie est rattaché à la mission d'origine (buildingEvents).
 */

async function requireAdmin(ctx: any): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté.");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin") {
    throw new Error("Accès réservé à l'administration GTEC.");
  }
  return user._id;
}

// ---------- assure une garantie de travaux avant intervention ----------

export const ensureWorkGuarantee = mutation({
  args: {
    requestId: v.string(),
    clientId: v.string(),
    days: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId as Id<"serviceRequests">);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    if (args.days < 0) throw new Error("Durée de garantie invalide.");

    const existing = await ctx.db
      .query("workGuarantees")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId as Id<"serviceRequests">))
      .collect();
    if (existing.length > 0) return existing[0]._id;

    const startedAt = Date.now();
    const until = startedAt + args.days * 24 * 60 * 60 * 1000;
    const id = await ctx.db.insert("workGuarantees", {
      requestId: args.requestId as Id<"serviceRequests">,
      clientId: (request.clientId ?? args.clientId) as Id<"users">,
      startedAt,
      days: args.days,
      until,
      status: "ACTIVE",
      isActive: true,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    return id;
  },
});

/** Garanties actives du client. */
export const myActiveGuarantees = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db.query("workGuarantees").collect();
    const now = Date.now();
    const active = all.filter(
      (g) => g.status === "ACTIVE" && g.until > now && g.clientId === user._id,
    );
    const out = await Promise.all(
      active.map(async (g) => {
        const request = await ctx.db.get(g.requestId);
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

/**
 * Client : liste les signalements de garantie (buildingEvents « garantie »)
 * enregistrés sur SES bâtiments — rattachés à la mission d'origine.
 */
export const listWarrantyClaims = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
      .collect();
    const owned = new Set(buildings.map((b) => b._id));
    const events = await ctx.db.query("buildingEvents").collect();
    return events.filter((e) => e.kind === "garantie" && owned.has(e.buildingId));
  },
});

/** Admin : liste les garanties de travaux. */
export const adminListWarrantyClaims = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("workGuarantees").collect();
    return await Promise.all(
      rows.map(async (g) => {
        const request = await ctx.db.get(g.requestId);
        return {
          _id: g._id,
          requestId: g.requestId,
          clientId: g.clientId,
          days: g.days,
          until: g.until,
          status: g.status,
          reference: request?.reference ?? "",
          title: request?.interventionLabel ?? request?.title ?? "",
        };
      }),
    );
  },
});

/** Admin : crée une garantie de travaux. */
export const adminCreateWarrantyClaim = mutation({
  args: {
    requestId: v.string(),
    clientId: v.string(),
    days: v.number(),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId as Id<"serviceRequests">);
    if (!request) throw new Error("Demande introuvable.");

    const startedAt = Date.now();
    const until = startedAt + args.days * 24 * 60 * 60 * 1000;
    const id = await ctx.db.insert("workGuarantees", {
      requestId: args.requestId as Id<"serviceRequests">,
      clientId: (request.clientId ?? args.clientId) as Id<"users">,
      startedAt,
      days: args.days,
      until,
      status: "ACTIVE",
      isActive: true,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await notify(
      ctx,
      request.clientId,
      "garantie",
      "Garantie accordée",
      args.note || `Garantie de ${args.days} jours accordée sur la mission ${request.reference}.`,
      request._id,
    );
    return id;
  },
});

/** Client : réclame une garantie. */
export const createWarrantyClaim = mutation({
  args: {
    requestId: v.string(),
    guaranteeDays: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId as Id<"serviceRequests">);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id)
      throw new Error("Vous n'êtes pas le client de cette demande.");

    const id = await ctx.db.insert("workGuarantees", {
      requestId: args.requestId as Id<"serviceRequests">,
      clientId: user._id,
      startedAt: Date.now(),
      days: args.guaranteeDays,
      until: Date.now() + args.guaranteeDays * 24 * 60 * 60 * 1000,
      status: "ACTIVE",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  },
});

/** Admin : examine une réclamation de garantie. */
export const adminReviewWarrantyClaim = mutation({
  args: {
    claimId: v.string(),
    decision: v.string(),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const claim = await ctx.db.get(args.claimId as Id<"workGuarantees">);
    if (!claim) throw new Error("Réclamation introuvable.");
    await ctx.db.patch(args.claimId as Id<"workGuarantees">, {
      status: args.decision === "EXPIRED" ? "EXPIRED" : "ACTIVE",
      updatedAt: Date.now(),
    });
    return true;
  },
});

/** Client : résolution d'une garantie. */
export const resolveWarrantyClaim = mutation({
  args: {
    claimId: v.string(),
    decision: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const claim = await ctx.db.get(args.claimId as Id<"workGuarantees">);
    if (!claim) throw new Error("Réclamation introuvable.");
    if (claim.clientId !== user._id) throw new Error("Action non autorisée.");
    await ctx.db.patch(args.claimId as Id<"workGuarantees">, {
      status: args.decision === "EXPIRED" ? "EXPIRED" : "ACTIVE",
      updatedAt: Date.now(),
    });
    return true;
  },
});
