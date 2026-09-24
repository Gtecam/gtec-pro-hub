import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { payoutFor } from "../lib/gtec";

// ---------- helpers ----------

async function requireUser(ctx: any): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  return user;
}

async function requireAdmin(ctx: any): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Accès réservé à l'administration GTEC.");
  }
  return user;
}

async function addEvent(
  ctx: any,
  requestId: Id<"serviceRequests">,
  kind: string,
  label: string,
  detail?: string,
) {
  await ctx.db.insert("requestEvents", {
    requestId,
    kind,
    label,
    detail,
    at: Date.now(),
  });
}

function pad(n: number) {
  return String(n).padStart(4, "0");
}

/** V3 : notification in-app temps réel — poussée automatique par Convex. */
async function notify(
  ctx: any,
  userId: Id<"users">,
  kind: string,
  title: string,
  body: string,
  requestId?: Id<"serviceRequests">,
) {
  await ctx.db.insert("notifications", {
    userId,
    kind,
    title,
    body,
    requestId,
    at: Date.now(),
  });
}

/** Notifie tous les administrateurs (file de travail de la console). */
async function notifyAdmins(
  ctx: any,
  kind: string,
  title: string,
  body: string,
  requestId?: Id<"serviceRequests">,
) {
  const admins = await ctx.db
    .query("users")
    .filter((q: any) => q.eq(q.field("role"), "admin"))
    .collect();
  for (const admin of admins) {
    await notify(ctx, admin._id, kind, title, body, requestId);
  }
}

async function nextRef(
  ctx: any,
  table:
    | "serviceRequests"
    | "quotes"
    | "invoices"
    | "maintenanceContracts",
  prefix: string,
): Promise<string> {
  const all = await ctx.db.query(table).collect();
  return `${prefix}-${pad(all.length + 1)}`;
}

function quoteTotals(items: { qty: number; unitPrice: number }[]) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const vatRate = 19.25; // TVA Cameroun
  const total = Math.round(subtotal * (1 + vatRate / 100));
  return { subtotal, vatRate, total };
}

// ---------- profils ----------

/**
 * Type d'espace choisi à l'inscription : "client" ou "technicien".
 * Irreversible côté client — l'admin peut toujours créer des comptes dédiés.
 */
export const setAccountType = mutation({
  args: {
    accountType: v.union(v.literal("client"), v.literal("technicien")),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // L'admin conserve son rôle ; les autres comptes verrouillent leur espace.
    if (user.role === "admin") return;
    if (user.accountType && user.accountType !== args.accountType) {
      throw new Error("Le type d'espace de ce compte est déjà défini.");
    }
    await ctx.db.patch(user._id, {
      accountType: args.accountType,
      ...(args.name?.trim() ? { name: args.name.trim() } : {}),
      ...(args.phone?.trim() ? { phone: args.phone.trim() } : {}),
    });
  },
});

export const updateClientProfile = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      name: args.name,
      phone: args.phone,
      city: args.city,
    });
  },
});

/**
 * Identité complète du client — prénom, nom, pièce d'identité, contacts,
 * adresse détaillée, type de client (particulier/entreprise) et photo de CNI.
 */
export const updateClientIdentity = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    nationalId: v.string(),
    gender: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    phone: v.string(),
    altPhone: v.optional(v.string()),
    city: v.string(),
    address: v.string(),
    quarter: v.optional(v.string()),
    customerType: v.string(), // particulier | entreprise
    companyName: v.optional(v.string()),
    taxId: v.optional(v.string()),
    idDocumentUrl: v.optional(v.string()), // data URL
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.firstName.trim().length < 2) {
      throw new Error("Indiquez votre prénom.");
    }
    if (args.lastName.trim().length < 2) {
      throw new Error("Indiquez votre nom.");
    }
    if (args.nationalId.trim().length < 6) {
      throw new Error("Numéro CNI / passeport invalide.");
    }
    if (args.phone.trim().length < 6) {
      throw new Error("Numéro de téléphone invalide.");
    }
    if (!args.address.trim()) {
      throw new Error("Indiquez votre adresse.");
    }
    if (args.customerType === "entreprise" && !args.companyName?.trim()) {
      throw new Error("Indiquez la raison sociale de l'entreprise.");
    }
    await ctx.db.patch(user._id, {
      name: `${args.firstName.trim()} ${args.lastName.trim()}`.trim(),
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      nationalId: args.nationalId.trim(),
      gender: args.gender || undefined,
      birthDate: args.birthDate || undefined,
      phone: args.phone.trim(),
      altPhone: args.altPhone?.trim() || undefined,
      city: args.city,
      address: args.address.trim(),
      quarter: args.quarter?.trim() || undefined,
      customerType: args.customerType,
      companyName: args.companyName?.trim() || undefined,
      taxId: args.taxId?.trim() || undefined,
      idDocumentUrl: args.idDocumentUrl || user.idDocumentUrl,
    });
  },
});

// ---------- admin : bootstrap & techniciens ----------

export const adminExists = query({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();
    return admins.length > 0;
  },
});

/** Pilote V1 : le premier utilisateur à le demander devient administrateur. */
export const claimAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();
    if (admins.length > 0) {
      throw new Error("Un administrateur existe déjà pour ce projet.");
    }
    await ctx.db.patch(user._id, { role: "admin" });
  },
});

export const adminListTechnicians = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "member"))
      .collect();
  },
});

export const adminCreateTechnician = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    specialty: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "member"))
      .collect();
    const id = await ctx.db.insert("users", {
      name: args.name,
      phone: args.phone,
      role: "member",
      city: args.specialty,
    });
    return { id, wasSeeded: existing.length === 0 };
  },
});

export const adminSeedTechnicians = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "member"))
      .collect();
    if (existing.length > 0) return { created: 0 };
    const seed: [string, string][] = [
      ["Jean-Baptiste Nkotto", "Chef d'équipe · Électricité CFO/CATE"],
      ["Aline Mbarga", "Électricité bâtiment"],
      ["Serge Etoundi", "Solaire / onduleurs"],
      ["Marlyse Tchoumi", "Climatisation & froid"],
      ["Idrissou Bello", "Vidéosurveillance CCTV"],
      ["Patrick Nguini", "Plomberie sanitaire"],
    ];
    for (const [name, specialty] of seed) {
      await ctx.db.insert("users", { name, role: "member", city: specialty });
    }
    return { created: seed.length };
  },
});

// ---------- client : demandes ----------

export const createRequest = mutation({
  args: {
    serviceKey: v.string(),
    title: v.string(),
    description: v.string(),
    address: v.string(),
    city: v.string(),
    photos: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const reference = await nextRef(ctx, "serviceRequests", "GTC");
    const id = await ctx.db.insert("serviceRequests", {
      clientId: user._id,
      reference,
      serviceKey: args.serviceKey,
      title: args.title,
      description: args.description,
      address: args.address,
      city: args.city,
      photos: args.photos,
      status: "nouvelle",
    });
    await addEvent(
      ctx,
      id,
      "demande",
      "Demande créée",
      `${args.serviceKey} · ${args.city}`,
    );
    return id;
  },
});

export const cancelRequest = mutation({
  args: { requestId: v.id("serviceRequests"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    if (request.status === "terminee" || request.status === "annulee") {
      throw new Error("Cette demande ne peut plus être annulée.");
    }
    await ctx.db.patch(args.requestId, {
      status: "annulee",
      cancellationReason: args.reason,
    });
    await addEvent(ctx, args.requestId, "annulation", "Demande annulée", args.reason);
  },
});

// ---------- client : suivi ----------

export const listMyRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const requests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .order("desc")
      .collect();
    return await Promise.all(
      requests.map(async (r) => {
        const quote = (
          await ctx.db
            .query("quotes")
            .withIndex("by_request", (q) => q.eq("requestId", r._id))
            .collect()
        ).slice(-1)[0];
        const payment = quote
          ? (
              await ctx.db
                .query("payments")
                .withIndex("by_request", (q) => q.eq("requestId", r._id))
                .collect()
            ).slice(-1)[0]
          : undefined;
        const assignment = (
          await ctx.db
            .query("assignments")
            .withIndex("by_request", (q) => q.eq("requestId", r._id))
            .collect()
        ).slice(-1)[0];
        return { request: r, quote, payment, assignment };
      }),
    );
  },
});

export const getRequestDetail = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const quote = (
      await ctx.db
        .query("quotes")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    ).slice(-1)[0];
    const payment = (
      await ctx.db
        .query("payments")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    ).slice(-1)[0];
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    ).slice(-1)[0];
    const teamLeader = assignment
      ? await ctx.db.get(assignment.teamLeaderId)
      : undefined;
    const members = assignment
      ? await Promise.all(
          assignment.members.map(async (m) => {
            const u = await ctx.db.get(m.id);
            return u ? { id: u._id, name: u.name ?? "Technicien", role: m.role } : null;
          }),
        )
      : [];
    const report = (
      await ctx.db
        .query("interventionReports")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    ).slice(-1)[0];
    const invoice = (
      await ctx.db
        .query("invoices")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    ).slice(-1)[0];
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", request._id))
      .order("desc")
      .collect();
    return {
      request,
      quote,
      payment,
      assignment,
      teamLeader,
      members: members.filter(Boolean),
      report,
      invoice,
      events,
    };
  },
});

// ---------- devis ----------

export const adminCreateQuote = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    items: v.array(
      v.object({
        label: v.string(),
        qty: v.number(),
        unitPrice: v.number(),
      }),
    ),
    validDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (!["nouvelle", "devis_emis"].includes(request.status)) {
      throw new Error("Un devis ne peut plus être émis à ce stade.");
    }
    if (args.items.length === 0) {
      throw new Error("Ajoutez au moins une ligne au devis.");
    }
    const previous = await ctx.db
      .query("quotes")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    for (const q of previous) {
      if (q.status === "emis") await ctx.db.patch(q._id, { status: "expire" });
    }
    const { subtotal, vatRate, total } = quoteTotals(args.items);
    const number = await nextRef(ctx, "quotes", "DEV");
    const validUntil = Date.now() + (args.validDays ?? 7) * 24 * 3600 * 1000;
    await ctx.db.insert("quotes", {
      requestId: args.requestId,
      clientId: request.clientId,
      number,
      items: args.items,
      subtotal,
      vatRate,
      total,
      currency: "FCFA",
      status: "emis",
      validUntil,
    });
    await ctx.db.patch(args.requestId, { status: "devis_emis" });
    await addEvent(
      ctx,
      args.requestId,
      "devis",
      `Devis ${number} émis`,
      `Total ${total.toLocaleString("fr-FR")} FCFA`,
    );
    await notify(
      ctx,
      request.clientId,
      "devis",
      `Devis ${number} reçu`,
      `Votre devis est prêt : ${total.toLocaleString("fr-FR")} FCFA. Acceptez-le pour lancer les travaux.`,
      args.requestId,
    );
  },
});

export const acceptQuote = mutation({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    if (quote.clientId !== user._id) throw new Error("Action non autorisée.");
    if (quote.status !== "emis") throw new Error("Ce devis n'est plus valable.");
    await ctx.db.patch(args.quoteId, { status: "accepte" });
    await ctx.db.patch(quote.requestId, { status: "devis_accepte" });
    await addEvent(ctx, quote.requestId, "devis", `Devis ${quote.number} accepté`);
    await notifyAdmins(
      ctx,
      "devis",
      `Devis ${quote.number} accepté`,
      "Le client a accepté le devis — en attente de son paiement.",
      quote.requestId,
    );
  },
});

export const refuseQuote = mutation({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    if (quote.clientId !== user._id) throw new Error("Action non autorisée.");
    if (quote.status !== "emis") throw new Error("Ce devis n'est plus valable.");
    await ctx.db.patch(args.quoteId, { status: "refuse" });
    await ctx.db.patch(quote.requestId, { status: "nouvelle" });
    await addEvent(
      ctx,
      quote.requestId,
      "devis",
      `Devis ${quote.number} refusé`,
      "Vous pouvez demander une nouvelle proposition.",
    );
  },
});

// ---------- paiement (mobile money — simulation vérification V1) ----------

export const initiatePayment = mutation({
  args: {
    quoteId: v.id("quotes"),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("especes"),
      v.literal("virement"),
      v.literal("carte_visa"),
    ),
    payerPhone: v.string(),
    // Cash : preuve photo du reçu du technicien (obligatoire pour espèces)
    proofPhotoUrl: v.optional(v.string()),
    // Virement / carte : références bancaires
    bankName: v.optional(v.string()),
    bankRef: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    collectedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    if (quote.clientId !== user._id) throw new Error("Action non autorisée.");
    if (quote.status !== "accepte") {
      throw new Error("Acceptez d'abord le devis avant de payer.");
    }
    // Cash : une preuve photo est OBLIGATOIRE.
    if (args.method === "especes" && !args.proofPhotoUrl?.startsWith("data:")) {
      throw new Error(
        "Preuve obligatoire pour un paiement en espèces : joignez la photo du reçu.",
      );
    }
    // Virement : banque + référence obligatoires.
    if (args.method === "virement") {
      if (!args.bankName?.trim()) {
        throw new Error("Indiquez la banque du virement.");
      }
      if (!args.bankRef?.trim()) {
        throw new Error("Indiquez la référence du virement.");
      }
    }
    // Carte : 4 derniers chiffres obligatoires.
    if (args.method === "carte_visa") {
      if (!args.cardLast4 || !/^\d{4}$/.test(args.cardLast4)) {
        throw new Error("Indiquez les 4 derniers chiffres de la carte.");
      }
    }
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", quote.requestId))
      .collect();
    for (const p of existing) {
      if (p.status === "en_attente") {
        throw new Error("Un paiement est déjà en cours de vérification.");
      }
    }
    await ctx.db.insert("payments", {
      quoteId: quote._id,
      requestId: quote.requestId,
      clientId: user._id,
      amount: quote.total,
      currency: quote.currency,
      method: args.method,
      payerPhone: args.payerPhone.trim(),
      status: "en_attente",
      externalRef: `SIM-${Date.now().toString(36).toUpperCase()}`,
      proofPhotoUrl: args.proofPhotoUrl,
      bankName: args.bankName?.trim() || undefined,
      bankRef: args.bankRef?.trim() || undefined,
      cardLast4: args.cardLast4,
      collectedBy: args.collectedBy,
      collectedAt: args.method === "especes" ? Date.now() : undefined,
    });
    await addEvent(
      ctx,
      quote.requestId,
      "paiement",
      "Paiement initié",
      args.method === "especes"
        ? "Espèces avec preuve — en attente de validation GTEC"
        : "En attente de vérification GTEC",
    );
  },
});

/**
 * Encaissement cash par un technicien : il enregistre la collecte avec preuve
 * photo. Crée le paiement en attente de validation par l'admin.
 */
export const technicianCollectCash = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    proofPhotoUrl: v.string(),
    payerPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (!assignment || !assignment.members.some((m) => m.id === user._id)) {
      throw new Error("Vous n'êtes pas affecté à cette mission.");
    }
    if (!args.proofPhotoUrl.startsWith("data:")) {
      throw new Error("Photo du reçu obligatoire.");
    }
    const quote = (
      await ctx.db
        .query("quotes")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (!quote || quote.status !== "accepte") {
      throw new Error("Le devis doit être accepté pour encaisser le paiement.");
    }
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    for (const p of existing) {
      if (p.status === "en_attente") {
        throw new Error("Un paiement est déjà en cours de vérification.");
      }
    }
    await ctx.db.insert("payments", {
      quoteId: quote._id,
      requestId: args.requestId,
      clientId: request.clientId,
      amount: quote.total,
      currency: quote.currency,
      method: "especes",
      payerPhone: args.payerPhone?.trim() || "—",
      status: "en_attente",
      externalRef: `CASH-${Date.now().toString(36).toUpperCase()}`,
      proofPhotoUrl: args.proofPhotoUrl,
      collectedBy: user._id,
      collectedAt: Date.now(),
    });
    await addEvent(
      ctx,
      args.requestId,
      "paiement",
      "Espèces encaissées par le technicien",
      "En attente de validation GTEC",
    );
  },
});

export const adminValidatePayment = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") {
      throw new Error("Ce paiement a déjà été traité.");
    }
    const request = await ctx.db.get(payment.requestId);
    if (!request || request.status !== "devis_accepte") {
      throw new Error(
        "La demande n'est plus en attente de paiement (déjà payée ou annulée).",
      );
    }
    await ctx.db.patch(args.paymentId, { status: "valide" });
    await ctx.db.patch(payment.requestId, { status: "paye" });
    await addEvent(
      ctx,
      payment.requestId,
      "paiement",
      "Paiement validé",
      `${payment.amount.toLocaleString("fr-FR")} FCFA · ${payment.payerPhone}`,
    );
    await notify(
      ctx,
      payment.clientId,
      "paiement",
      "Paiement confirmé",
      `Votre paiement de ${payment.amount.toLocaleString("fr-FR")} FCFA est validé. L'équipe va être affectée.`,
      payment.requestId,
    );
  },
});

export const adminRejectPayment = mutation({
  args: { paymentId: v.id("payments"), reason: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") {
      throw new Error("Ce paiement a déjà été traité.");
    }
    await ctx.db.patch(args.paymentId, { status: "echoue" });
    await addEvent(
      ctx,
      payment.requestId,
      "paiement",
      "Paiement non abouti",
      args.reason || "Vérification négative",
    );
  },
});

// ---------- affectation & intervention ----------

export const adminAssignCrew = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    teamLeaderId: v.id("users"),
    memberIds: v.array(v.id("users")),
    scheduledAt: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.status !== "paye") {
      throw new Error("La demande doit être payée avant affectation.");
    }
    const leader = await ctx.db.get(args.teamLeaderId);
    if (!leader || leader.role !== "member") {
      throw new Error("Choisissez un chef d'équipe.");
    }
    const members = [
      { id: args.teamLeaderId, role: "Chef d'équipe" },
      ...args.memberIds
        .filter((m) => m !== args.teamLeaderId)
        .map((id) => ({ id, role: "Technicien" })),
    ];
    await ctx.db.insert("assignments", {
      requestId: args.requestId,
      teamLeaderId: args.teamLeaderId,
      members,
      scheduledAt: args.scheduledAt,
      notes: args.notes,
      status: "planifiee",
    });
    await ctx.db.patch(args.requestId, {
      status: "affectee",
      scheduledAt: args.scheduledAt,
    });
    const date = new Date(args.scheduledAt).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    await addEvent(
      ctx,
      args.requestId,
      "affectation",
      `Équipe affectée · ${members.length} technicien(s)`,
      `Intervention prévue le ${date}`,
    );
    await notify(
      ctx,
      request.clientId,
      "affectation",
      "Équipe affectée à votre demande",
      `${leader.name ?? "Un technicien"} interviendra le ${date}.`,
      args.requestId,
    );
    for (const m of members.slice(1)) {
      await notify(
        ctx,
        m.id,
        "affectation",
        "Nouvelle mission",
        `Vous êtes affecté à « ${request.title} » (${request.city}) — prévue le ${date}.`,
        args.requestId,
      );
    }
  },
});

export const adminStartIntervention = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "affectee") {
      throw new Error("L'intervention ne peut pas démarrer.");
    }
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (assignment) {
      await ctx.db.patch(assignment._id, { status: "en_cours" });
    }
    await ctx.db.patch(args.requestId, { status: "en_intervention" });
    await addEvent(ctx, args.requestId, "intervention", "Intervention démarrée");
  },
});

export const adminSubmitReport = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    workDone: v.string(),
    partsUsed: v.array(v.object({ label: v.string(), qty: v.number() })),
    beforePhotos: v.array(v.string()),
    afterPhotos: v.array(v.string()),
    warrantyMonths: v.number(),
    recommendations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "en_intervention") {
      throw new Error("Aucune intervention en cours pour cette demande.");
    }
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (!assignment) throw new Error("Affectation introuvable.");
    await ctx.db.insert("interventionReports", {
      requestId: args.requestId,
      assignmentId: assignment._id,
      workDone: args.workDone,
      partsUsed: args.partsUsed,
      beforePhotos: args.beforePhotos,
      afterPhotos: args.afterPhotos,
      warrantyMonths: args.warrantyMonths,
      recommendations: args.recommendations,
      status: "transmis",
    });
    await ctx.db.patch(assignment._id, { status: "terminee" });
    await ctx.db.patch(args.requestId, { status: "rapport_emis" });
    await addEvent(
      ctx,
      args.requestId,
      "rapport",
      "Rapport d'intervention transmis",
      `Garantie ${args.warrantyMonths} mois`,
    );
    await notify(
      ctx,
      request.clientId,
      "rapport",
      "Rapport d'intervention disponible",
      "L'\u00e9quipe a termin\u00e9. Consultez le rapport et signez le PV de r\u00e9ception.",
      args.requestId,
    );
  },
});

// ---------- espace technicien ----------

export const myTechnicianProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    return profile ?? null;
  },
});

/**
 * Candidature technicien complète : identité, profession, parcours académique
 * et documents justificatifs OBLIGATOIRES (CNI + diplôme/certificat).
 */
export const submitTechnicianApplication = mutation({
  args: {
    // Identité
    firstName: v.string(),
    lastName: v.string(),
    nationalId: v.string(),
    gender: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    phone: v.string(),
    altPhone: v.optional(v.string()),
    city: v.string(),
    address: v.optional(v.string()),
    // Profession
    specialty: v.string(),
    profession: v.optional(v.string()),
    experienceYears: v.number(),
    currentEmployer: v.optional(v.string()),
    references: v.optional(v.string()),
    zones: v.array(v.string()),
    bio: v.optional(v.string()),
    // Parcours académique
    highestDegree: v.string(),
    fieldOfStudy: v.optional(v.string()),
    school: v.optional(v.string()),
    graduationYear: v.optional(v.number()),
    // Documents (obligatoires)
    documents: v.array(
      v.object({
        kind: v.string(),
        label: v.string(),
        url: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Identité
    if (args.firstName.trim().length < 2) {
      throw new Error("Indiquez votre prénom.");
    }
    if (args.lastName.trim().length < 2) {
      throw new Error("Indiquez votre nom.");
    }
    if (args.nationalId.trim().length < 6) {
      throw new Error("Numéro CNI / passeport invalide.");
    }
    if (args.phone.trim().length < 6) {
      throw new Error("Numéro de téléphone invalide.");
    }
    if (!args.city.trim()) {
      throw new Error("Indiquez votre ville de résidence.");
    }
    // Profession
    if (args.specialty.trim().length < 3) {
      throw new Error("Indiquez votre spécialité.");
    }
    if (args.zones.length === 0) {
      throw new Error("Choisissez au moins une zone d'intervention.");
    }
    // Parcours académique
    if (!args.highestDegree.trim()) {
      throw new Error("Indiquez votre dernier diplôme obtenu.");
    }
    // Documents obligatoires : au moins une pièce d'identité + un justificatif
    // de compétence (diplôme, attestation ou certificat).
    const hasId = args.documents.some((d) => d.kind === "cni");
    const hasProof = args.documents.some((d) =>
      ["diploma", "certificate", "attestation"].includes(d.kind),
    );
    if (!hasId) {
      throw new Error(
        "Pièce d'identité obligatoire : joignez une photo de votre CNI ou passeport.",
      );
    }
    if (!hasProof) {
      throw new Error(
        "Justificatif obligatoire : joignez au moins un diplôme, certificat ou attestation d'expérience.",
      );
    }
    for (const d of args.documents) {
      if (!d.url.startsWith("data:")) {
        throw new Error("Document invalide.");
      }
    }
    const existing = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    if (existing) {
      if (existing.status === "rejete") {
        throw new Error(
          "Votre candidature a été refusée. Contactez l'administration GTEC.",
        );
      }
      throw new Error("Vous avez déjà une candidature en cours.");
    }
    await ctx.db.insert("technicianProfiles", {
      userId: user._id,
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      nationalId: args.nationalId.trim(),
      gender: args.gender || undefined,
      birthDate: args.birthDate || undefined,
      phone: args.phone.trim(),
      altPhone: args.altPhone?.trim() || undefined,
      city: args.city.trim(),
      address: args.address?.trim() || undefined,
      specialty: args.specialty.trim(),
      profession: args.profession?.trim() || undefined,
      experienceYears: Math.max(0, args.experienceYears),
      currentEmployer: args.currentEmployer?.trim() || undefined,
      references: args.references?.trim() || undefined,
      zones: args.zones,
      bio: args.bio?.trim() || undefined,
      highestDegree: args.highestDegree.trim(),
      fieldOfStudy: args.fieldOfStudy?.trim() || undefined,
      school: args.school?.trim() || undefined,
      graduationYear: args.graduationYear || undefined,
      documents: args.documents,
      status: "en_attente",
      subscription: "aucun",
    });
    // Le nom du compte est mis à jour à partir de l'identité déclarée.
    await ctx.db.patch(user._id, {
      name: `${args.firstName.trim()} ${args.lastName.trim()}`.trim(),
      phone: args.phone.trim(),
    });
  },
});

const SUBSCRIPTION_PRICES: Record<string, number> = {
  mensuel: 5000,
  trimestriel: 12000,
  annuel: 40000,
};

/**
 * Abonnement actif ? (non expiré). Un technicien sans abonnement actif
 * n'apparaît pas dans les suggestions d'affectation.
 */
function subscriptionActive(profile: Doc<"technicianProfiles"> | null): boolean {
  return (
    !!profile &&
    profile.subscription !== "aucun" &&
    !!profile.subscriptionUntil &&
    profile.subscriptionUntil > Date.now()
  );
}

/** Choix / renouvellement d'abonnement : crée un paiement à vérifier. */
export const requestSubscriptionPayment = mutation({
  args: {
    plan: v.union(
      v.literal("mensuel"),
      v.literal("trimestriel"),
      v.literal("annuel"),
    ),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("especes"),
      v.literal("virement"),
    ),
    payerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    if (!profile) throw new Error("Aucun profil technicien.");
    if (profile.status !== "verifie") {
      throw new Error("Votre profil doit d'abord être vérifié par GTEC.");
    }
    if (!args.payerPhone.trim()) {
      throw new Error("Indiquez le numéro payeur.");
    }
    // Un seul paiement d'abonnement en attente à la fois.
    const pending = await ctx.db
      .query("subscriptionPayments")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    if (pending.some((p) => p.status === "en_attente")) {
      throw new Error("Un paiement d'abonnement est déjà en cours de vérification.");
    }
    const amount = SUBSCRIPTION_PRICES[args.plan];
    await ctx.db.insert("subscriptionPayments", {
      profileId: profile._id,
      techUserId: user._id,
      plan: args.plan,
      amount,
      currency: "FCFA",
      method: args.method,
      payerPhone: args.payerPhone.trim(),
      status: "en_attente",
      externalRef: `SIM-${Date.now().toString(36).toUpperCase()}`,
    });
  },
});

/** Abonnement en attente du technicien connecté. */
export const myPendingSubscriptionPayment = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    if (!profile) return null;
    const all = await ctx.db
      .query("subscriptionPayments")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    return all.filter((p) => p.status === "en_attente").slice(-1)[0] ?? null;
  },
});

/** File admin des paiements d'abonnement à vérifier. */
export const adminPendingSubscriptionPayments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db
      .query("subscriptionPayments")
      .filter((q) => q.eq(q.field("status"), "en_attente"))
      .collect();
    return await Promise.all(
      all.map(async (p) => {
        const tech = await ctx.db.get(p.techUserId);
        return { payment: p, tech };
      }),
    );
  },
});

/** Valider un paiement d'abonnement → activation + cumul de durée. */
export const adminValidateSubscriptionPayment = mutation({
  args: { paymentId: v.id("subscriptionPayments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") {
      throw new Error("Ce paiement a déjà été traité.");
    }
    const profile = await ctx.db.get(payment.profileId);
    if (!profile) throw new Error("Profil technicien introuvable.");
    const now = Date.now();
    const days =
      payment.plan === "mensuel" ? 30 : payment.plan === "trimestriel" ? 90 : 365;
    // Cumul de durée si renouvellement anticipé.
    const from =
      profile.subscriptionUntil && profile.subscriptionUntil > now
        ? profile.subscriptionUntil
        : now;
    await ctx.db.patch(payment._id, { status: "valide" });
    await ctx.db.patch(profile._id, {
      subscription: payment.plan,
      subscriptionUntil: from + days * 24 * 3600 * 1000,
      subscriptionPrice: payment.amount,
    });
    // Rôle "member" au cas où la vérification l'aurait mis à jour sans abonnement.
    if (profile.status === "verifie") {
      await ctx.db.patch(profile.userId, { role: "member" });
    }
    await notify(
      ctx,
      payment.techUserId,
      "abonnement",
      "Abonnement activé",
      `Votre abonnement ${payment.plan} est actif. Vous recevez désormais des missions.`,
    );
  },
});

/** Refuser un paiement d'abonnement (MoMo non abouti…). */
export const adminRejectSubscriptionPayment = mutation({
  args: { paymentId: v.id("subscriptionPayments"), reason: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") {
      throw new Error("Ce paiement a déjà été traité.");
    }
    await ctx.db.patch(args.paymentId, { status: "echoue" });
    void args.reason;
  },
});

/**
 * Techniciens affectables : vérifiés ET abonnement actif. Utilisé par le
 * moteur d'affectation — remplace la liste brute des "member".
 */
export const adminListAssignableTechnicians = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const members = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "member"))
      .collect();
    return await Promise.all(
      members.map(async (t) => {
        const profile = (
          await ctx.db
            .query("technicianProfiles")
            .withIndex("by_user", (q) => q.eq("userId", t._id))
            .collect()
        )[0];
        const active = subscriptionActive(profile);
        return {
          _id: t._id,
          name: t.name,
          city: t.city,
          phone: t.phone,
          // Techniciens "legacy" créés avant les profils : affectables par défaut.
          subscription: profile?.subscription ?? ("aucun" as const),
          subscriptionUntil: profile?.subscriptionUntil,
          active: profile ? active : true,
          verified: profile?.status === "verifie" || !profile,
        };
      },
      ),
    );
  },
});

/** Vérification admin d'une candidature. */
export const adminReviewTechnician = mutation({
  args: {
    profileId: v.id("technicianProfiles"),
    decision: v.union(v.literal("verifie"), v.literal("rejete")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Candidature introuvable.");
    if (profile.status !== "en_attente") {
      throw new Error("Cette candidature a déjà été traitée.");
    }
    await ctx.db.patch(args.profileId, {
      status: args.decision,
      reviewNote: args.note,
    });
    // Un technicien vérifié devient visible pour l'affectation :
    // rôle "member" + spécialité portée par le champ city (moteur d'affectation V1).
    if (args.decision === "verifie") {
      await ctx.db.patch(profile.userId, {
        role: "member",
        city: profile.specialty,
      });
      await notify(
        ctx,
        profile.userId,
        "general",
        "Dossier validé ✓",
        "Félicitations ! Votre dossier est validé. Activez votre abonnement pour recevoir des missions.",
      );
    } else {
      await notify(
        ctx,
        profile.userId,
        "general",
        "Candidature refusée",
        args.note
          ? `Motif : ${args.note}`
          : "Votre candidature n'a pas été retenue cette fois.",
      );
    }
  },
});

/** Missions du technicien connecté (affectations où il apparaît). */
export const listMyMissions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const assignments = await ctx.db.query("assignments").collect();
    const mine = assignments.filter((a) =>
      a.members.some((m) => m.id === user._id),
    );
    return await Promise.all(
      mine.map(async (a) => {
        const request = await ctx.db.get(a.requestId);
        return { assignment: a, request };
      }),
    );
  },
});

/** Rapport soumis par un technicien membre de l'équipe (mission en cours). */
export const technicianSubmitReport = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    workDone: v.string(),
    partsUsed: v.array(v.object({ label: v.string(), qty: v.number() })),
    beforePhotos: v.array(v.string()),
    afterPhotos: v.array(v.string()),
    warrantyMonths: v.number(),
    recommendations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "en_intervention") {
      throw new Error("Aucune intervention en cours pour cette mission.");
    }
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (!assignment) throw new Error("Affectation introuvable.");
    if (!assignment.members.some((m) => m.id === user._id)) {
      throw new Error("Vous n'êtes pas affecté à cette mission.");
    }
    const report = (
      await ctx.db
        .query("interventionReports")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (report) {
      // Le rapport existe déjà : mise à jour (brouillon repris).
      await ctx.db.patch(report._id, {
        workDone: args.workDone,
        partsUsed: args.partsUsed,
        beforePhotos: args.beforePhotos,
        afterPhotos: args.afterPhotos,
        warrantyMonths: args.warrantyMonths,
        recommendations: args.recommendations,
        status: "transmis",
      });
    } else {
      await ctx.db.insert("interventionReports", {
        requestId: args.requestId,
        assignmentId: assignment._id,
        workDone: args.workDone,
        partsUsed: args.partsUsed,
        beforePhotos: args.beforePhotos,
        afterPhotos: args.afterPhotos,
        warrantyMonths: args.warrantyMonths,
        recommendations: args.recommendations,
        status: "transmis",
      });
    }
    await ctx.db.patch(assignment._id, { status: "terminee" });
    await ctx.db.patch(args.requestId, { status: "rapport_emis" });
    await addEvent(
      ctx,
      args.requestId,
      "rapport",
      "Rapport d'intervention transmis",
      `Garantie ${args.warrantyMonths} mois`,
    );
    await notify(
      ctx,
      request.clientId,
      "rapport",
      "Rapport d'intervention disponible",
      "L'\u00e9quipe a termin\u00e9. Consultez le rapport et signez le PV de r\u00e9ception.",
      args.requestId,
    );
  },
});

/** Demande de matériel par un technicien de l'équipe. */
export const requestMaterial = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    label: v.string(),
    qty: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (!assignment || !assignment.members.some((m) => m.id === user._id)) {
      throw new Error("Vous n'êtes pas affecté à cette mission.");
    }
    if (args.label.trim().length < 3) {
      throw new Error("Décrivez le matériel demandé.");
    }
    await ctx.db.insert("materialRequests", {
      requestId: args.requestId,
      requestedById: user._id,
      label: args.label.trim(),
      qty: Math.max(1, args.qty),
      status: "demande",
    });
  },
});

export const listMaterialRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db
      .query("materialRequests")
      .filter((q) => q.eq(q.field("status"), "valide")) // (q) => q.eq("status", "demande"))
      .collect();
    return await Promise.all(
      all.map(async (m) => {
        const request = await ctx.db.get(m.requestId);
        const requester = await ctx.db.get(m.requestedById);
        return { material: m, request, requester };
      }),
    );
  },
});

export const adminReviewMaterial = mutation({
  args: {
    materialId: v.id("materialRequests"),
    decision: v.union(
      v.literal("approuve"),
      v.literal("refuse"),
      v.literal("commande"),
      v.literal("livre"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const material = await ctx.db.get(args.materialId);
    if (!material) throw new Error("Demande de matériel introuvable.");
    if (material.status === "livre" || material.status === "refuse") {
      throw new Error("Cette demande est déjà clôturée.");
    }
    await ctx.db.patch(args.materialId, {
      status: args.decision,
      adminNote: args.note,
    });
  },
});

export const adminListApplications = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const profiles = await ctx.db.query("technicianProfiles").collect();
    return await Promise.all(
      profiles.map(async (p) => {
        const user = await ctx.db.get(p.userId);
        return { profile: p, user };
      }),
    );
  },
});

// ---------- réception client & facture ----------

export const clientReception = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    signature: v.string(), // data URL
    receptionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) throw new Error("Action non autorisée.");
    if (request.status !== "rapport_emis") {
      throw new Error("Le rapport doit d'abord être transmis.");
    }
    const report = (
      await ctx.db
        .query("interventionReports")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (!report) throw new Error("Rapport introuvable.");
    await ctx.db.patch(report._id, {
      status: "receptionne",
      clientSignature: args.signature,
      receptionNote: args.receptionNote,
      receivedAt: Date.now(),
    });
    const quote = (
      await ctx.db
        .query("quotes")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    const number = await nextRef(ctx, "invoices", "FAC");
    await ctx.db.insert("invoices", {
      requestId: args.requestId,
      clientId: user._id,
      number,
      amount: quote?.total ?? 0,
      currency: quote?.currency ?? "FCFA",
      status: "emise",
      issuedAt: Date.now(),
    });
    await ctx.db.patch(args.requestId, { status: "terminee" });
    await addEvent(ctx, args.requestId, "reception", "PV de réception signé");
    await addEvent(ctx, args.requestId, "facture", `Facture ${number} émise`);
    await notify(
      ctx,
      user._id,
      "facture",
      `Facture ${number} disponible`,
      "Merci ! Votre facture et le PV signé sont consultables dans votre espace.",
      args.requestId,
    );
    if (assignment) {
      await notify(
        ctx,
        assignment.teamLeaderId,
        "reception",
        "PV signé par le client",
        "Le client a réceptionné les travaux — votre rémunération est enregistrée.",
        args.requestId,
      );
    }

    // Rémunérations de l'équipe — calculées une seule fois, à la réception.
    if (quote && assignment) {
      const existingPayouts = await ctx.db
        .query("payouts")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect();
      if (existingPayouts.length === 0) {
        for (const m of assignment.members) {
          const { amount, sharePercent } = payoutFor(
            quote.total,
            m.role,
            assignment.members.length,
          );
          await ctx.db.insert("payouts", {
            techUserId: m.id,
            requestId: args.requestId,
            amount,
            sharePercent,
            role: m.role,
            status: "dû",
          });
        }
        await addEvent(
          ctx,
          args.requestId,
          "reception",
          `Rémunérations de l'équipe calculées (${assignment.members.length})`,
        );
      }
    }
  },
});

// ---------- rémunérations (paiement techniciens) ----------

/** Rémunérations du technicien connecté. */
/** Visites de maintenance assignées au technicien connecté (à venir ou récentes). */
export const listMyVisits = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") return [];
    const visits = await ctx.db
      .query("contractVisits")
      .withIndex("by_leader", (q) =>
        q.eq("assignedTeamLeaderId", user._id),
      )
      .collect();
    const out = [];
    for (const v of visits.sort((a, b) => a.scheduledAt - b.scheduledAt)) {
      const contract = await ctx.db.get(v.contractId);
      if (!contract) continue;
      out.push({ visit: v, contract });
    }
    // Les planifiées à venir d'abord, puis les plus récentes.
    return out.sort((a, b) => {
      const doneA = a.visit.status === "faite" ? 1 : 0;
      const doneB = b.visit.status === "faite" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return a.visit.scheduledAt - b.visit.scheduledAt;
    });
  },
});

/** Clients (comptes non-admin) pour la création de contrats de maintenance. */
export const adminListClients = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => u.role !== "admin")
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "Client",
        phone: u.phone,
        city: u.city,
        accountType: u.accountType,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ===================== V3 : notifications =====================

/** Notifications de l'utilisateur connecté, les plus récentes d'abord. */
export const listMyNotifications = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(30);
  },
});

/** Nombre de notifications non lues (badge temps réel). */
export const unreadNotificationsCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return all.filter((n) => n.readAt === undefined).length;
  },
});

/** Marque une notification comme lue. */
export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const notif = await ctx.db.get(args.notificationId);
    if (!notif || notif.userId !== user._id) return;
    if (notif.readAt === undefined) {
      await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    }
  },
});

/** Marque toutes les notifications comme lues. */
export const markAllNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const now = Date.now();
    for (const n of all) {
      if (n.readAt === undefined) await ctx.db.patch(n._id, { readAt: now });
    }
  },
});

export const listMyPayouts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db.query("payouts").collect();
    const mine = all.filter((p) => p.techUserId === user._id);
    return await Promise.all(
      mine.map(async (p) => {
        const request = await ctx.db.get(p.requestId);
        return { payout: p, request };
      }),
    );
  },
});

/** Toutes les rémunérations, pour la console admin. */
export const adminListPayouts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("payouts").collect();
    return await Promise.all(
      all.map(async (p) => {
        const tech = await ctx.db.get(p.techUserId);
        const request = await ctx.db.get(p.requestId);
        return { payout: p, tech, request };
      }),
    );
  },
});

/** Marquer une rémunération comme payée (virement / MoMo GTEC). */
export const adminMarkPayoutPaid = mutation({
  args: {
    payoutId: v.id("payouts"),
    method: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Rémunération introuvable.");
    if (payout.status === "payé") {
      throw new Error("Cette rémunération a déjà été payée.");
    }
    await ctx.db.patch(args.payoutId, {
      status: "payé",
      paidAt: Date.now(),
      method: args.method,
    });
    await notify(
      ctx,
      payout.techUserId,
      "general",
      "Rémunération payée",
      `${payout.amount.toLocaleString("fr-FR")} FCFA vous ont été payés (${payout.role}).`,
      payout.requestId,
    );
  },
});

// ---------- avis clients ----------

/** Avis déjà laissé sur une demande (pour cacher le formulaire après envoi). */
export const getReviewForRequest = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const review = (
      await ctx.db
        .query("reviews")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    )[0];
    return review ?? null;
  },
});

/** Client : noter l'intervention (après réception, une seule fois). */
export const clientSubmitReview = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) {
      throw new Error("Action non autorisée.");
    }
    if (request.status !== "terminee") {
      throw new Error("L'intervention doit être réceptionnée avant de laisser un avis.");
    }
    if (args.rating < 1 || args.rating > 5) {
      throw new Error("La note doit être entre 1 et 5 étoiles.");
    }
    const existing = (
      await ctx.db
        .query("reviews")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    )[0];
    if (existing) {
      throw new Error("Vous avez déjà laissé un avis sur cette intervention.");
    }
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (!assignment) throw new Error("Aucune équipe pour cette intervention.");
    await ctx.db.insert("reviews", {
      requestId: args.requestId,
      clientId: user._id,
      techUserId: assignment.teamLeaderId,
      rating: Math.round(args.rating),
      comment: args.comment?.trim() || undefined,
      at: Date.now(),
    });
    await addEvent(
      ctx,
      args.requestId,
      "reception",
      `Avis client : ${Math.round(args.rating)}/5`,
    );
  },
});

/** Avis reçus par le technicien connecté (les plus récents d'abord). */
export const myTechnicianReviews = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_tech", (q) => q.eq("techUserId", user._id))
      .collect();
    const sorted = [...reviews].sort((a, b) => b.at - a.at);
    return await Promise.all(
      sorted.map(async (r) => {
        const client = await ctx.db.get(r.clientId);
        const request = await ctx.db.get(r.requestId);
        return { review: r, clientName: client?.name ?? "Client", requestRef: request?.reference ?? "" };
      }),
    );
  },
});

/**
 * Derniers avis clients (public, pour la vitrine). Retourne prénom + initiale
 * du nom du client, la note et le commentaire.
 */
export const listPublicReviews = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("reviews").collect();
    const sorted = all.sort((a, b) => b.at - a.at).slice(0, 6);
    return await Promise.all(
      sorted.map(async (r) => {
        const client = await ctx.db.get(r.clientId);
        const request = await ctx.db.get(r.requestId);
        const name = client?.name ?? "Client";
        const parts = name.trim().split(/\s+/);
        const displayName =
          parts.length > 1
            ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
            : name;
        return {
          rating: r.rating,
          comment: r.comment ?? null,
          displayName,
          city: request?.city ?? "",
          serviceKey: request?.serviceKey ?? "",
          at: r.at,
        };
      }),
    );
  },
});

/** Moyenne + nombre d'avis d'un technicien (pour les badges). */
export const technicianRating = query({
  args: { techUserId: v.id("users") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_tech", (q) => q.eq("techUserId", args.techUserId))
      .collect();
    if (reviews.length === 0) return { average: null, count: 0 };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    return {
      average: Math.round((sum / reviews.length) * 10) / 10,
      count: reviews.length,
    };
  },
});

// ---------- admin : tableaux de bord ----------

export const adminListRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const requests = await ctx.db
      .query("serviceRequests")
      .order("desc")
      .collect();
    return await Promise.all(
      requests.map(async (r) => {
        const client = await ctx.db.get(r.clientId);
        const quote = (
          await ctx.db
            .query("quotes")
            .withIndex("by_request", (q) => q.eq("requestId", r._id))
            .collect()
        ).slice(-1)[0];
        const payment = (
          await ctx.db
            .query("payments")
            .withIndex("by_request", (q) => q.eq("requestId", r._id))
            .collect()
        ).slice(-1)[0];
        const assignment = (
          await ctx.db
            .query("assignments")
            .withIndex("by_request", (q) => q.eq("requestId", r._id))
            .collect()
        ).slice(-1)[0];
        return { request: r, client, quote, payment, assignment };
      }),
    );
  },
});

export const adminPendingPayments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const payments = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("status"), "en_attente"))
      .collect();
    return await Promise.all(
      payments.map(async (p) => {
        const request = await ctx.db.get(p.requestId);
        const client = await ctx.db.get(p.clientId);
        return { payment: p, request, client };
      }),
    );
  },
});

export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const requests = await ctx.db.query("serviceRequests").collect();
    const invoices = await ctx.db.query("invoices").collect();
    const payments = await ctx.db.query("payments").collect();
    const validated = payments.filter((p) => p.status === "valide");
    return {
      total: requests.length,
      open: requests.filter(
        (r) => !["terminee", "annulee"].includes(r.status),
      ).length,
      done: requests.filter((r) => r.status === "terminee").length,
      cancelled: requests.filter((r) => r.status === "annulee").length,
      revenue: validated.reduce((s, p) => s + p.amount, 0),
      invoices: invoices.length,
    };
  },
});

// ===================== V2 : contrats de maintenance =====================

const VISIT_STEP_MS: Record<string, number> = {
  mensuel: 30 * 24 * 3600 * 1000,
  trimestriel: 90 * 24 * 3600 * 1000,
  semestriel: 180 * 24 * 3600 * 1000,
  annuel: 365 * 24 * 3600 * 1000,
};

/** Crée un contrat de maintenance et planifie toutes ses visites périodiques. */
export const adminCreateContract = mutation({
  args: {
    clientId: v.id("users"),
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
    months: v.number(), // durée du contrat en mois
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.monthlyAmount <= 0) throw new Error("Montant invalide.");
    if (args.months < 1 || args.months > 36)
      throw new Error("Durée invalide (1 à 36 mois).");
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Client introuvable.");

    const reference = await nextRef(ctx, "maintenanceContracts", "CTR");
    const now = Date.now();
    const step = VISIT_STEP_MS[args.frequency] ?? 90 * 24 * 3600 * 1000;
    const endDate = now + args.months * 30 * 24 * 3600 * 1000;

    const contractId = await ctx.db.insert("maintenanceContracts", {
      reference,
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
      endDate,
    });

    // Planification de toutes les visites périodiques jusqu'à la fin du contrat.
    let visitAt = now + step;
    let first = true;
    let count = 0;
    while (visitAt <= endDate && count < 60) {
      await ctx.db.insert("contractVisits", {
        contractId,
        scheduledAt: visitAt,
        status: "planifiee",
      });
      if (first) {
        await ctx.db.patch(contractId, { nextVisitAt: visitAt });
        first = false;
      }
      visitAt += step;
      count++;
    }

    return contractId;
  },
});

/** Change le statut d'un contrat (suspendre, reprendre, résilier). */
export const adminUpdateContractStatus = mutation({
  args: {
    contractId: v.id("maintenanceContracts"),
    status: v.union(
      v.literal("actif"),
      v.literal("suspendu"),
      v.literal("resilie"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.status === "expire")
      throw new Error("Ce contrat est expiré.");
    await ctx.db.patch(args.contractId, { status: args.status });
  },
});

/** Planifie une visite supplémentaire (intermédiaire ou de rattrapage). */
export const adminScheduleContractVisit = mutation({
  args: {
    contractId: v.id("maintenanceContracts"),
    scheduledAt: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.status !== "actif")
      throw new Error("Le contrat doit être actif pour planifier une visite.");
    if (args.scheduledAt < Date.now() - 24 * 3600 * 1000)
      throw new Error("La date de visite doit être future.");
    await ctx.db.insert("contractVisits", {
      contractId: args.contractId,
      scheduledAt: args.scheduledAt,
      status: "planifiee",
    });
    const next = Math.min(
      contract.nextVisitAt ?? Infinity,
      args.scheduledAt,
    );
    await ctx.db.patch(args.contractId, {
      nextVisitAt: Number.isFinite(next) ? next : undefined,
    });
    await notify(
      ctx,
      contract.clientId,
      "visite",
      "Nouvelle visite planifi\u00e9e",
      `Une visite de maintenance est pr\u00e9vue le ${new Date(args.scheduledAt).toLocaleDateString("fr-FR")}.`,
    );
  },
});

/** Le chef d'équipe (ou l'admin) clôture une visite avec son compte rendu. */
export const completeContractVisit = mutation({
  args: {
    visitId: v.id("contractVisits"),
    report: v.string(),
    teamLeaderId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const visit = await ctx.db.get(args.visitId);
    if (!visit) throw new Error("Visite introuvable.");
    if (visit.status === "faite")
      throw new Error("Cette visite est déjà clôturée.");
    if (args.report.trim().length < 10)
      throw new Error("Compte rendu trop court (10 caractères min.).");
    if (user.role !== "admin") {
      if (!visit.assignedTeamLeaderId || visit.assignedTeamLeaderId !== user._id)
        throw new Error("Seul le chef d'équipe assigné peut clôturer cette visite.");
    }

    const now = Date.now();
    await ctx.db.patch(args.visitId, {
      doneAt: now,
      report: args.report.trim(),
      status: "faite",
      assignedTeamLeaderId:
        visit.assignedTeamLeaderId ?? args.teamLeaderId ?? undefined,
    });

    // Prochaine visite planifiée restante.
    const remaining = await ctx.db
      .query("contractVisits")
      .withIndex("by_contract", (q) =>
        q.eq("contractId", visit.contractId),
      )
      .collect();
    const nextPlanned = remaining
      .filter((v) => v.status === "planifiee")
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    await ctx.db.patch(visit.contractId, {
      nextVisitAt: nextPlanned?.scheduledAt,
    });
  },
});

/** Affecte un chef d'équipe à une visite de maintenance. */
export const adminAssignVisit = mutation({
  args: {
    visitId: v.id("contractVisits"),
    teamLeaderId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const visit = await ctx.db.get(args.visitId);
    if (!visit) throw new Error("Visite introuvable.");
    if (visit.status !== "planifiee")
      throw new Error("Cette visite n'est plus planifiable.");
    await ctx.db.patch(args.visitId, {
      assignedTeamLeaderId: args.teamLeaderId,
    });
    const contract = await ctx.db.get(visit.contractId);
    await notify(
      ctx,
      args.teamLeaderId,
      "visite",
      "Nouvelle visite de maintenance",
      `Visite \« ${contract?.title ?? "contrat"} \» pr\u00e9vue le ${new Date(visit.scheduledAt).toLocaleDateString("fr-FR")}.`,
    );
  },
});

/** Contrats du client connecté, avec leurs visites. */
export const listMyContracts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const now = Date.now();
    const out = [];
    for (const contract of contracts.sort(
      (a, b) => b.startDate - a.startDate,
    )) {
      // Expiration au fil de l'eau.
      if (contract.status === "actif" && contract.endDate < now) {
        contract.status = "expire";
      }
      const visits = await ctx.db
        .query("contractVisits")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      out.push({
        contract,
        visits: visits.sort((a, b) => a.scheduledAt - b.scheduledAt),
      });
    }
    return out;
  },
});

/** Tous les contrats (console admin), avec nom du client et visites. */
export const adminListContracts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .collect();
    const now = Date.now();
    const out = [];
    for (const contract of contracts.sort(
      (a, b) => b.startDate - a.startDate,
    )) {
      if (contract.status === "actif" && contract.endDate < now) {
        contract.status = "expire";
      }
      const client = await ctx.db.get(contract.clientId);
      const visits = await ctx.db
        .query("contractVisits")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      out.push({
        contract,
        clientName: client?.name ?? "Client supprimé",
        clientPhone: client?.phone,
        visits: visits.sort((a, b) => a.scheduledAt - b.scheduledAt),
      });
    }
    return out;
  },
});

/** Revenus mensuels validés (6 derniers mois) + répartition par service. */
export const adminRevenueSeries = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const payments = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("status"), "valide"))
      .collect();
    const requests = await ctx.db.query("serviceRequests").collect();

    // 6 derniers mois (mois courant inclus).
    const months: { key: string; label: string; revenue: number; count: number }[] = [];
    const base = new Date();
    base.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("fr-FR", { month: "short" }),
        revenue: 0,
        count: 0,
      });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));
    for (const p of payments) {
      const d = new Date(p._creationTime);
      const idx = monthIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx !== undefined) {
        months[idx].revenue += p.amount;
        months[idx].count += 1;
      }
    }

    // Répartition des demandes par pôle de service.
    const byService = new Map<string, number>();
    for (const r of requests) {
      byService.set(r.serviceKey, (byService.get(r.serviceKey) ?? 0) + 1);
    }
    const services = [...byService.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { months, services };
  },
});
