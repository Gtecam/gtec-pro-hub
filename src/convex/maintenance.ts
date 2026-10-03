import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUser, notify } from "./gtec";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * GTEC PRO — Contrats de maintenance (§13-§14) : contrats récurrents
 * (mensuel/trimestriel/semestriel/annuel), visites planifiées, paiements
 * par échéance. Le client crée son contrat, GTEC planifie les visites et
 * valide les paiements ; tout est journalisé.
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

// === listes client ===

export const listMyMaintenance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const out = await Promise.all(
      contracts.map(async (c) => {
        const visits = await ctx.db
          .query("contractVisits")
          .withIndex("by_contract", (q) => q.eq("contractId", c._id))
          .collect();
        const payments = await ctx.db
          .query("contractPayments")
          .withIndex("by_contract", (q) => q.eq("contractId", c._id))
          .collect();
        const doneCount = visits.filter((v) => v.status === "faite").length;
        return {
          _id: c._id,
          reference: c.reference,
          serviceKey: c.serviceKey,
          title: c.title,
          description: c.description,
          frequency: c.frequency,
          monthlyAmount: c.monthlyAmount,
          city: c.city,
          address: c.address,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          nextVisitAt: c.nextVisitAt,
          visits: visits.sort((a, b) => a.scheduledAt - b.scheduledAt),
          payments: payments.sort((a, b) => a.periodIndex - b.periodIndex),
          doneCount,
          nextPaymentAt: c.nextVisitAt,
        };
      }),
    );
    return out.sort((a, b) => (a.nextVisitAt ?? 0) - (b.nextVisitAt ?? 0));
  },
});

export const listMaintenanceVisits = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const out = await Promise.all(
      contracts.map(async (c) => {
        const visits = await ctx.db
          .query("contractVisits")
          .withIndex("by_contract", (q) => q.eq("contractId", c._id))
          .collect();
        return { contractId: c._id, visits };
      }),
    );
    return out;
  },
});

export const listMaintenancePayments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const out = await Promise.all(
      contracts.map(async (c) => {
        const payments = await ctx.db
          .query("contractPayments")
          .withIndex("by_contract", (q) => q.eq("contractId", c._id))
          .collect();
        return { contractId: c._id, payments };
      }),
    );
    return out;
  },
});

// === création ===

const FREQUENCIES = ["mensuel", "trimestriel", "semestriel", "annuel"] as const;
type Frequency = (typeof FREQUENCIES)[number];

export const createMaintenanceContract = mutation({
  args: {
    reference: v.string(),
    serviceKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    frequency: v.union(
      v.literal("mensuel"),
      v.literal("trimestriel"),
      v.literal("semestriel"),
      v.literal("annuel"),
    ),
    monthlyAmount: v.number(),
    city: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.monthlyAmount < 0) throw new Error("Montant invalide.");
    if (!FREQUENCIES.includes(args.frequency as Frequency)) {
      throw new Error("Fréquence invalide.");
    }
    const now = Date.now();
    // Durée du contrat : 12 mois, échéances selon la fréquence.
    const endDate = now + 365 * 24 * 3600 * 1000;
    const nextVisitAt =
      args.frequency === "mensuel"
        ? now + 30 * 24 * 3600 * 1000
        : args.frequency === "trimestriel"
          ? now + 91 * 24 * 3600 * 1000
          : args.frequency === "semestriel"
            ? now + 182 * 24 * 3600 * 1000
            : now + 365 * 24 * 3600 * 1000;
    const id = await ctx.db.insert("maintenanceContracts", {
      reference: args.reference,
      clientId: user._id,
      serviceKey: args.serviceKey,
      title: args.title,
      description: args.description,
      frequency: args.frequency,
      monthlyAmount: args.monthlyAmount,
      city: args.city,
      address: args.address,
      status: "actif",
      startDate: now,
      endDate,
      nextVisitAt,
    });
    return id;
  },
});

// === visites ===

export const scheduleVisit = mutation({
  args: {
    contractId: v.string(),
    scheduledAt: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const contract = await ctx.db.get(args.contractId as Id<"maintenanceContracts">);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const id = await ctx.db.insert("contractVisits", {
      contractId: contract._id,
      scheduledAt: args.scheduledAt,
      status: "planifiee",
      report: args.note,
    });
    // Le contrat avance sa prochaine visite si la nouvelle est plus tôt.
    if (contract.nextVisitAt === undefined || args.scheduledAt < contract.nextVisitAt) {
      await ctx.db.patch(contract._id, { nextVisitAt: args.scheduledAt });
    }
    return id;
  },
});

export const completeVisit = mutation({
  args: {
    visitId: v.string(),
    report: v.string(),
    doneAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const visit = await ctx.db.get(args.visitId as Id<"contractVisits">);
    if (!visit) throw new Error("Visite introuvable.");
    const contract = await ctx.db.get(visit.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    if (visit.status !== "planifiee") {
      throw new Error("Seules les visites planifiées sont terminables.");
    }
    await ctx.db.patch(visit._id, {
      status: "faite",
      doneAt: args.doneAt,
      report: args.report,
    });
    // Événement technique sur le bâtiment si un dossier existe pour ce client.
    const building = (
      await ctx.db
        .query("buildings")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", contract.clientId))
        .filter((q) => q.eq(q.field("address"), contract.address))
        .collect()
    )[0];
    if (building) {
      await ctx.db.insert("buildingEvents", {
        buildingId: building._id,
        kind: "maintenance",
        label: `Visite de maintenance — ${contract.title}`,
        detail: args.report,
        at: args.doneAt,
      });
    }
    return true;
  },
});

// === paiements ===

export const payMaintenance = mutation({
  args: {
    contractId: v.string(),
    periodIndex: v.number(),
    amount: v.number(),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("especes"),
      v.literal("virement"),
    ),
    payerPhone: v.string(),
    proofPhotoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const contract = await ctx.db.get(args.contractId as Id<"maintenanceContracts">);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id) throw new Error("Action non autorisée.");
    if (args.amount <= 0) throw new Error("Montant invalide.");
    const now = Date.now();
    const id = await ctx.db.insert("contractPayments", {
      contractId: contract._id,
      clientId: user._id,
      periodIndex: args.periodIndex,
      periodStart: now,
      periodEnd: now,
      amount: args.amount,
      currency: "FCFA",
      method: args.method,
      payerPhone: args.payerPhone,
      proofPhotoUrl: args.proofPhotoUrl,
      status: "en_attente",
    });
    await notify(
      ctx,
      contract.clientId,
      "paiement",
      "Paiement de maintenance enregistré",
      `Votre paiement pour « ${contract.title} » est en attente de validation GTEC.`,
    );
    return id;
  },
});

export const adminValidateMaintenancePayment = mutation({
  args: {
    paymentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId as Id<"contractPayments">);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") {
      throw new Error("Ce paiement est déjà traité.");
    }
    await ctx.db.patch(payment._id, {
      status: "valide",
      validatedAt: Date.now(),
    });
    await notify(
      ctx,
      payment.clientId,
      "paiement",
      "Paiement de maintenance validé",
      "Votre paiement de maintenance a été validé par GTEC PRO.",
    );
    return true;
  },
});

// === garanties de travaux (F°13) ===

export const myActiveGuarantees = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db.query("workGuarantees").collect();
    const now = Date.now();
    const active = all.filter((g) => g.status === "ACTIVE" && g.until > now && g.clientId === user._id);
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

export const adminListActiveGuarantees = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("workGuarantees").collect();
    const now = Date.now();
    const out = await Promise.all(
      rows
        .filter((g) => g.status === "ACTIVE" && g.until > now)
        .map(async (g) => {
          const request = await ctx.db.get(g.requestId);
          return {
            _id: g._id,
            requestId: g.requestId,
            clientId: g.clientId,
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
