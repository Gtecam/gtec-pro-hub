// GTEC PRO — MAINTENANCE & GARANTIES (Phases 2-3).
// Mutations/queries Convex pour les contrats de maintenance et les
// garanties de travaux. Réutilise le schéma existant :
// maintenanceContracts, contractVisits, contractPayments, workGuarantees.

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin, requireUser, notify, notifyAdmins } from "./gtec";

// ========================= CONTRATS DE MAINTENANCE =========================

/** Référence suivante : CTR-0001. */
async function nextRef(ctx: { db: any }, prefix: string): Promise<string> {
  const all = await ctx.db.query("maintenanceContracts").collect();
  return `${prefix}-${String(all.length + 1).padStart(4, "0")}`;
}

/** Client : liste de mes contrats de maintenance avec leurs visites. */
export const listMyMaintenance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const now = Date.now();
    const out: {
      contract: Doc<"maintenanceContracts">;
      visits: Doc<"contractVisits">[];
      payments: Doc<"contractPayments">[];
    }[] = [];
    for (const contract of contracts.sort((a, b) => b.startDate - a.startDate)) {
      if (contract.status === "actif" && contract.endDate < now) contract.status = "expire";
      const visits = await ctx.db
        .query("contractVisits")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      const payments = await ctx.db
        .query("contractPayments")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      out.push({ contract, visits, payments });
    }
    return out;
  },
});

/** Client : visites de maintenance (présentes/planifiées), avec contrat joint. */
export const listMaintenanceVisits = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const out: { contract: Doc<"maintenanceContracts">; visit: Doc<"contractVisits"> }[] = [];
    for (const contract of contracts) {
      if (contract.status === "actif" && contract.endDate < Date.now()) continue;
      const visits = await ctx.db
        .query("contractVisits")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      for (const v of visits) {
        out.push({ contract, visit: v });
      }
    }
    return out;
  },
});

/** Client : paiements mensuels (réglés + en attente), avec contrat joint. */
export const listMaintenancePayments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const out: {
      payment: Doc<"contractPayments">;
      contract: Doc<"maintenanceContracts">;
    }[] = [];
    for (const contract of contracts) {
      if (contract.status === "actif" && contract.endDate < Date.now()) continue;
      const payments = await ctx.db
        .query("contractPayments")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      for (const p of payments) {
        out.push({ payment: p, contract });
      }
    }
    return out;
  },
});

/** Client : règle le paiement mensuel d'un contrat (ou plusieurs échéances). */
export const payMaintenance = mutation({
  args: {
    contractId: v.id("maintenanceContracts"),
    method: v.union(v.literal("mtn_momo"), v.literal("orange_money"), v.literal("especes"), v.literal("virement")),
    payerPhone: v.string(),
    periods: v.optional(v.array(v.number())),
    proofPhotoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id) throw new Error("Accès interdit.");
    if (contract.status !== "actif") throw new Error("Ce contrat n'est plus actif.");
    const monthMs = 30 * 24 * 3600 * 1000;
    const lastPeriod = Math.floor((Date.now() - contract.startDate) / monthMs);
    const periods = args.periods ?? [lastPeriod + 1];
    for (const periodIndex of periods) {
      const periodStart = contract.startDate + (periodIndex - 1) * monthMs;
      const periodEnd = Math.min(periodStart + monthMs, contract.endDate);
      if (periodStart >= contract.endDate) throw new Error("Échéance hors du contrat.");
      const existing = await ctx.db
        .query("contractPayments")
        .withIndex("by_contract", (q) => q.eq("contractId", args.contractId))
        .collect()
        .then((rows) => rows.filter((p) => p.periodIndex === periodIndex));
      if (existing.length > 0) {
        const statuses = existing.map((p) => p.status);
        if (statuses.includes("en_attente")) throw new Error(`La période ${periodIndex} est déjà en attente de vérification.`);
        if (statuses.includes("valide")) continue;
      }
      const id = await ctx.db.insert("contractPayments", {
        contractId: contract._id,
        clientId: user._id,
        periodIndex,
        periodStart,
        periodEnd,
        amount: contract.monthlyAmount,
        currency: "FCFA",
        method: args.method,
        payerPhone: args.payerPhone.trim(),
        proofPhotoUrl: args.proofPhotoUrl,
        status: "en_attente",
      });
      await notifyAdmins(
        ctx,
        "paiement",
        `Mensualité ${contract.reference} — échéance ${periodIndex}`,
        `${user.name ?? "Le client"} a payé la période ${periodIndex} (${contract.monthlyAmount.toLocaleString("fr-FR")} FCFA) — à vérifier.`,
      );
    }
    return true;
  },
});

/** Admin : valide ou rejette un paiement de maintenance. */
export const adminValidateMaintenancePayment = mutation({
  args: {
    paymentId: v.id("contractPayments"),
    decision: v.union(v.literal("valide"), v.literal("echoue")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const p = await ctx.db.get(args.paymentId);
    if (!p) throw new Error("Paiement introuvable.");
    if (p.status !== "en_attente") throw new Error("Ce paiement a déjà été traité.");
    await ctx.db.patch(args.paymentId, {
      status: args.decision,
      externalRef: args.note,
      validatedAt: Date.now(),
    });
    if (args.decision === "valide") {
      await notify(
        ctx,
        p.clientId,
        "paiement",
        "Mensualité validée",
        "Votre mensualité de maintenance a été encaissée par GTEC. Merci !",
      );
    } else {
      await notify(
        ctx,
        p.clientId,
        "paiement",
        "Mensualité rejetée",
        "Votre mensualité n'a pas été validée. Corrigez le justificatif et payez à nouveau.",
      );
    }
  },
});

// ========================= GARANTIES DE TRAVAUX (F°13) =========================

/** Client : garanties de travaux actives. */
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

/** Admin : liste les garanties actives pour chaque client. */
export const adminListActiveGuarantees = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("workGuarantees")
      .withIndex("by_request")
      .collect();
    const now = Date.now();
    const out = await Promise.all(
      rows
        .filter((g) => g.status === "ACTIVE" && g.until > now)
        .map(async (g) => {
          const request = (await ctx.db.get(g.requestId as never)) as Doc<"serviceRequests"> | undefined;
          const client = await ctx.db.get(request?.clientId as never);
          return {
            _id: g._id,
            requestId: g.requestId,
            reference: request?.reference ?? "",
            title: request?.interventionLabel ?? request?.title ?? "",
            clientName: client?.name ?? "Client supprimé",
            until: g.until,
            days: g.days,
            status: g.status,
          };
        }),
    );
    return out;
  },
});

export default { listMyMaintenance, listMaintenanceVisits, listMaintenancePayments, payMaintenance, adminValidateMaintenancePayment, myActiveGuarantees, adminListActiveGuarantees };
