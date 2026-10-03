import { requireUser, notify } from "./gtec";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { GetRequestResult } from "./_generated/server";

type IdList = readonly { id: string }[];

/** Compte le nombre de visites faites (status « faite »). */
function countDone(visits: readonly (Doc<"contractVisits"> | null)[]): number {
  let n = 0;
  for (const v of visits) if (v && v.status === "faite") n++;
  return n;
}

/** Évalue le status du contrat suivant le cycle de vie de sa garantie. */
function computeStatus(c: { status: string; nextVisitAt: number | null }): "actif" | "suspendu" | "expire" | "resilie" {
  if (c.status === "suspendu" || c.status === "resilie") return c.status;
  if (c.status === "expire") return "expire";
  if (c.nextVisitAt !== null && c.nextVisitAt < Date.now()) return "expire";
  return "actif";
}

/** Administration interne : vérifie le rôle de l'admin (impossible de retrouver
 *  `requireAdmin` parce que `gtec.ts` ne l'exporte pas — il est privé). */
async function requireAdmin(ctx: { auth: { userId: string | null } }): Promise<Id<"users">> {
  if (!ctx.auth.userId) throw new Error("Non connecté.");
  const user = await ctx.db.get(ctx.auth.userId);
  if (!user || user.role !== "admin") throw new Error("Accès réservé à l'administration GTEC.");
  return user._id;
}

// === listes publiques ===

export const listMyMaintenance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db.query("maintenanceContracts").withIndex("by_client", (q) => q.eq("clientId", user._id)).collect();
    const out = await Promise.all(
      contracts.map(async (c) => {
        const visits = await ctx.db.query("contractVisits").withIndex("by_contract", (q) => q.eq("contractId", c._id)).collect();
        const payments = await ctx.db.query("contractPayments").withIndex("by_contract", (q) => q.eq("contractId", c._id)).collect();
        const doneCount = countDone(visits);
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
          status: computeStatus(c),
          nextVisitAt: c.nextVisitAt,
          visits,
          payments,
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
    const contracts = await ctx.db.query("maintenanceContracts").withIndex("by_client", (q) => q.eq("clientId", user._id)).collect();
    const out = await Promise.all(
      contracts.map(async (c) => {
        const visits = await ctx.db.query("contractVisits").withIndex("by_contract", (q) => q.eq("contractId", c._id)).collect();
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
    const contracts = await ctx.db.query("maintenanceContracts").withIndex("by_client", (q) => q.eq("clientId", user._id)).collect();
    const out = await Promise.all(
      contracts.map(async (c) => {
        const payments = await ctx.db.query("contractPayments").withIndex("by_contract", (q) => q.eq("contractId", c._id)).collect();
        return { contractId: c._id, payments };
      }),
    );
    return out;
  },
});

// === provenance / création ===

export const createMaintenanceContract = mutation({
  args: {
    reference: "string",
    serviceKey: "string",
    title: "string",
    description: "string",
    frequency: "string",
    monthlyAmount: "number",
    city: "string",
    address: "string",
    clientId: "string",
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.clientId !== user._id) throw new Error("Action non autorisée.");
    const now = Date.now();
    const id = await ctx.db.insert("maintenanceContracts", {
      reference: args.reference,
      clientId: args.clientId,
      serviceKey: args.serviceKey,
      title: args.title,
      description: args.description,
      frequency: args.frequency,
      monthlyAmount: args.monthlyAmount,
      city: args.city,
      address: args.address,
      status: "actif",
      startDate: now,
      endDate: null,
      nextVisitAt: null,
      createdAt: now,
      updatedAt: now,
    });
    // journalisation du cycle de vie du client
    await ctx.db.insert("requestEvents", {
      requestId: id,
      kind: "maintenance",
      label: "Contrat de maintenance créé",
      at: now,
    });
    return id;
  },
});

// === visites ===

export const scheduleVisit = mutation({
  args: {
    contractId: "string",
    scheduledAt: "number",
    note: "string",
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const contract = await ctx.db.get(args.contractId as Id<"maintenanceContracts">);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id) throw new Error("Action non autorisée.");
    const id = await ctx.db.insert("contractVisits", {
      contractId: args.contractId as Id<"maintenanceContracts">,
      scheduledAt: args.scheduledAt,
      doneAt: null,
      assignedTeamLeaderId: null,
      report: null,
      status: "planifiee",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("requestEvents", {
      requestId: args.contractId as Id<"maintenanceContracts">,
      kind: "maintenance",
      label: "Visite planifiée",
      at: Date.now(),
    });
    return id;
  },
});

export const completeVisit = mutation({
  args: {
    visitId: "string",
    report: "string",
    doneAt: "number",
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const visit = await ctx.db.get(args.visitId as Id<"contractVisits">);
    if (!visit) throw new Error("Visite introuvable.");
    const contract = await ctx.db.get(visit.contractId as Id<"maintenanceContracts">);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id) throw new Error("Action non autorisée.");
    if (visit.status !== "planifiee") throw new Error("Seules les visites planifiées sont terminables.");
    await ctx.db.patch(args.visitId as Id<"contractVisits">, {
      status: "faite",
      doneAt: args.doneAt,
      report: args.report,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("requestEvents", {
      requestId: visit.contractId as Id<"maintenanceContracts">,
      kind: "maintenance",
      label: "Visite réalisée",
      at: Date.now(),
    });
    return true;
  },
});

// === paiements ===

export const payMaintenance = mutation({
  args: {
    contractId: "string",
    periodIndex: "number",
    amount: "number",
    method: "string",
    payerPhone: "string",
    proofPhotoUrl: "string",
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const contract = await ctx.db.get(args.contractId as Id<"maintenanceContracts">);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id) throw new Error("Action non autorisée.");
    const now = Date.now();
    const id = await ctx.db.insert("contractPayments", {
      contractId: args.contractId as Id<"maintenanceContracts">,
      clientId: user._id,
      periodIndex: args.periodIndex,
      periodStart: now,
      periodEnd: now,
      amount: args.amount,
      currency: "XAF",
      method: args.method,
      payerPhone: args.payerPhone,
      proofPhotoUrl: args.proofPhotoUrl,
      status: "en_attente",
      validatedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("requestEvents", {
      requestId: args.contractId as Id<"maintenanceContracts">,
      kind: "maintenance",
      label: "Paiement enregistré",
      at: now,
    });
    return id;
  },
});

export const adminValidateMaintenancePayment = mutation({
  args: {
    paymentId: "string",
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId as Id<"contractPayments">);
    if (!payment) throw new Error("Paiement introuvable.");
    await ctx.db.patch(args.paymentId as Id<"contractPayments">, {
      status: "valide",
      validatedAt: Date.now(),
      updatedAt: Date.now(),
    });
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
        const request = (await ctx.db.get(g.requestId as never)) as GetRequestResult | undefined;
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
          const request = (await ctx.db.get(g.requestId as never)) as GetRequestResult | undefined;
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
