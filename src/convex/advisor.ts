import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, notify } from "./gtec";

/**
 * GTEC PRO — CONSEILLER INTELLIGENT (F°1 + F°2) : couche de persistance et de
 * traçabilité. Le moteur de diagnostic (lib/diagnostic.ts) et le moteur
 * d'estimation (lib/estimate.ts) tournent côté client — aucune donnée ne
 * quitte l'application (§37 IA). Seuls le problème, les réponses et le
 * résultat sont archivés côté serveur pour suivi et amélioration du service.
 * Le résultat est toujours présenté comme une aide, jamais une certification.
 */

const stamp = () => ({ isActive: true, createdAt: Date.now(), updatedAt: Date.now() });

/** Archive un pré-diagnostic terminé (F°1). */
export const saveDiagnostic = mutation({
  args: {
    sessionKey: v.string(),
    serviceKey: v.optional(v.string()),
    question: v.string(),
    answers: v.array(v.object({ question: v.string(), answer: v.string() })),
    resultJson: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.question.trim().length < 5) throw new Error("Décrivez d'abord votre problème.");
    const existing = (await ctx.db
      .query("aiDiagnostics")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const dup = existing.find((d) => d.sessionKey === args.sessionKey);
    const payload = {
      userId: user._id,
      sessionKey: args.sessionKey,
      serviceKey: args.serviceKey || undefined,
      question: args.question.trim(),
      answers: args.answers,
      resultJson: args.resultJson,
      ...stamp(),
    };
    if (dup) {
      await ctx.db.patch(dup._id, { ...payload, updatedAt: Date.now() });
      return dup._id;
    }
    return await ctx.db.insert("aiDiagnostics", payload);
  },
});

/** Archive une estimation budgétaire (F°2). */
export const saveEstimate = mutation({
  args: {
    sessionKey: v.string(),
    inputsJson: v.string(),
    resultJson: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = (await ctx.db
      .query("budgetEstimates")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const dup = existing.find((d) => d.sessionKey === args.sessionKey);
    if (dup) {
      await ctx.db.patch(dup._id, {
        inputsJson: args.inputsJson,
        resultJson: args.resultJson,
        updatedAt: Date.now(),
      });
      return dup._id;
    }
    return await ctx.db.insert("budgetEstimates", {
      userId: user._id,
      sessionKey: args.sessionKey,
      inputsJson: args.inputsJson,
      resultJson: args.resultJson,
      ...stamp(),
    });
  },
});

/** Rattache un diagnostic/estimation à la demande réellement créée (traçabilité). */
export const linkEstimateToRequest = mutation({
  args: { kind: v.union(v.literal("diagnostic"), v.literal("estimate")), sessionKey: v.string(), requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.kind === "diagnostic") {
      const rows = (await ctx.db
        .query("aiDiagnostics")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect()) as any[];
      const row = rows.find((d) => d.sessionKey === args.sessionKey);
      if (row) await ctx.db.patch(row._id, { convertedRequestId: args.requestId, updatedAt: Date.now() });
    } else {
      const rows = (await ctx.db
        .query("budgetEstimates")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect()) as any[];
      const row = rows.find((d) => d.sessionKey === args.sessionKey);
      if (row) await ctx.db.patch(row._id, { convertedRequestId: args.requestId, updatedAt: Date.now() });
    }
  },
});

/** Mes sessions de diagnostic / estimation (historique client). */
export const myAdvisorSessions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const diags = (await ctx.db
      .query("aiDiagnostics")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const estimates = (await ctx.db
      .query("budgetEstimates")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const map = new Map<string, { sessionKey: string; question?: string; estimate?: { min: number; max: number }; convertedRequestId?: string; at: number }>();
    for (const d of diags) {
      let res: any = {};
      try {
        res = JSON.parse(d.resultJson);
      } catch {
        /* résultat illisible : on ignore */
      }
      map.set(d.sessionKey, {
        sessionKey: d.sessionKey,
        question: d.question,
        estimate: res.min != null ? { min: res.min, max: res.max } : undefined,
        convertedRequestId: d.convertedRequestId ?? undefined,
        at: d.updatedAt,
      });
    }
    for (const e of estimates) {
      const prev = map.get(e.sessionKey);
      let res: any = {};
      try {
        res = JSON.parse(e.resultJson);
      } catch {
        /* ignore */
      }
      map.set(e.sessionKey, {
        sessionKey: e.sessionKey,
        question: prev?.question,
        estimate: res.min != null ? { min: res.min, max: res.max } : prev?.estimate,
        convertedRequestId: e.convertedRequestId ?? prev?.convertedRequestId,
        at: Math.max(prev?.at ?? 0, e.updatedAt),
      });
    }
    return [...map.values()].sort((a, b) => b.at - a.at).slice(0, 40);
  },
});
