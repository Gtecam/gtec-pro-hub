import { requireUser, notify } from "./gtec";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { GetRequestResult } from "./_generated/server";

type WorkGuarantee = {
  _id: Id<"workGuarantees">;
  requestId: Id<"serviceRequests">;
  clientId: Id<"users">;
  startedAt: number;
  days: number;
  until: number;
  status: "ACTIVE" | "EXPIRED";
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

// ---------- assure une garantie de travaux avant intervention ----------

export const ensureWorkGuarantee = mutation({
  args: {
    requestId: "string",
    clientId: "string",
    days: "number",
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId as Id<"serviceRequests">);
    if (!request) throw new Error("Demande introuvable.");
    if (request.type !== "intervention")
      throw new Error("Seules les interventions peuvent recevoir une garantie.");

    const existing = await ctx
      .db()
      .query("workGuarantees")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    if (existing.length > 0) return existing[0]._id;

    const startedAt = Date.now();
    const until = startedAt + args.days * 24 * 60 * 60 * 1000;
    const id = await ctx.db.insert("workGuarantees", {
      requestId: args.requestId as Id<"serviceRequests">,
      clientId: args.clientId as Id<"users">,
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
        const request = (await ctx.db.get(g.requestId)) as
          | GetRequestResult
          | undefined;
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
    const claims = await ctx
      .db()
      .query("buildingEvents")
      .withIndex("by_building", (q) => q.eq("buildingId", user._id))
      .collect();
    return claims.filter((e) => e.kind === "garantie");
  },
});

/** Admin : liste les garanties de travaux. */
export const adminListWarrantyClaims = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("workGuarantees").collect();
    return rows.map((g) => ({
      _id: g._id,
      requestId: g.requestId,
      clientId: g.clientId,
      days: g.days,
      until: g.until,
      status: g.status,
    })) as WorkGuarantee[];
  },
});

/** Admin : crée une garantie de travaux. */
export const adminCreateWarrantyClaim = mutation({
  args: {
    requestId: "string",
    clientId: "string",
    days: "number",
    note: "string",
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId as Id<"serviceRequests">);
    if (!request) throw new Error("Demande introuvable.");
    if (request.type !== "intervention")
      throw new Error("Seules les interventions peuvent recevoir une garantie.");

    const startedAt = Date.now();
    const until = startedAt + args.days * 24 * 60 * 60 * 1000;
    const id = await ctx.db.insert("workGuarantees", {
      requestId: args.requestId as Id<"serviceRequests">,
      clientId: args.clientId as Id<"users">,
      startedAt,
      days: args.days,
      until,
      status: "ACTIVE",
      isActive: true,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await notify(ctx, args.clientId as Id<"users">, "garantie", "Garantie accordée", args.note);
    return id;
  },
});

/** Client : réclame une garantie. */
export const createWarrantyClaim = mutation({
  args: {
    requestId: "string",
    guaranteeDays: "number",
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId as Id<"serviceRequests">);
    if (!request) throw new Error("Demande introuvable.");
    if (request.type !== "intervention")
      throw new Error("Seules les interventions peuvent recevoir une garantie.");
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
    claimId: "string",
    decision: "string",
    note: "string",
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const claim = await ctx.db.get(args.claimId as Id<"workGuarantees">);
    if (!claim) throw new Error("Réclamation introuvable.");
    await ctx.db.patch(args.claimId as Id<"workGuarantees">, {
      status: args.decision as "ACTIVE" | "EXPIRED",
      note: args.note,
    });
    return true;
  },
});

/** Client : résolution d'une garantie. */
export const resolveWarrantyClaim = mutation({
  args: {
    claimId: "string",
    decision: "string",
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const claim = await ctx.db.get(args.claimId as Id<"workGuarantees">);
    if (!claim) throw new Error("Réclamation introuvable.");
    if (claim.clientId !== user._id) throw new Error("Action non autorisée.");
    await ctx.db.patch(args.claimId as Id<"workGuarantees">, {
      status: args.decision as "ACTIVE" | "EXPIRED",
    });
    return true;
  },
});
