import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

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

async function nextRef(
  ctx: any,
  table: "serviceRequests" | "quotes" | "invoices",
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
    ),
    payerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    if (quote.clientId !== user._id) throw new Error("Action non autorisée.");
    if (quote.status !== "accepte") {
      throw new Error("Acceptez d'abord le devis avant de payer.");
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
      payerPhone: args.payerPhone,
      status: "en_attente",
      externalRef: `SIM-${Date.now().toString(36).toUpperCase()}`,
    });
    await addEvent(
      ctx,
      quote.requestId,
      "paiement",
      "Paiement initié",
      "En attente de vérification GTEC",
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

/** Candidature technicien. */
export const submitTechnicianApplication = mutation({
  args: {
    specialty: v.string(),
    experienceYears: v.number(),
    zones: v.array(v.string()),
    certifications: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!user.name) {
      throw new Error("Complétez votre nom avant de postuler.");
    }
    if (args.specialty.trim().length < 3) {
      throw new Error("Indiquez votre spécialité.");
    }
    if (args.zones.length === 0) {
      throw new Error("Choisissez au moins une zone d'intervention.");
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
        )
      }
      throw new Error("Vous avez déjà une candidature en cours.");
    }
    await ctx.db.insert("technicianProfiles", {
      userId: user._id,
      specialty: args.specialty.trim(),
      experienceYears: Math.max(0, args.experienceYears),
      zones: args.zones,
      certifications: args.certifications?.trim() || undefined,
      bio: args.bio?.trim() || undefined,
      status: "en_attente",
      subscription: "aucun",
    });
  },
});

/** Vérification admin d'une candidature. */
export const adminReviewTechnician = mutation({
  args: {
    profileId: v.id("technicianProfiles"),
    decision: v.union(v.literal("verifie"), v.literal("rejete")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Candidature introuvable.");
    if (profile.status !== "en_attente") {
      throw new Error("Cette candidature a déjà été traitée.");
    }
    await ctx.db.patch(args.profileId, { status: args.decision });
    // Un technicien vérifié devient visible pour l'affectation :
    // rôle "member" + spécialité portée par le champ city (moteur d'affectation V1).
    if (args.decision === "verifie") {
      await ctx.db.patch(profile.userId, {
        role: "member",
        city: profile.specialty,
      });
    }
  },
});

const SUBSCRIPTION_PRICES: Record<string, number> = {
  mensuel: 5000,
  trimestriel: 12000,
  annuel: 40000,
};

/** Choix / renouvellement d'abonnement par le technicien. */
export const setTechnicianSubscription = mutation({
  args: {
    plan: v.union(
      v.literal("mensuel"),
      v.literal("trimestriel"),
      v.literal("annuel"),
    ),
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
    const now = Date.now();
    const days =
      args.plan === "mensuel" ? 30 : args.plan === "trimestriel" ? 90 : 365;
    const from =
      profile.subscriptionUntil && profile.subscriptionUntil > now
        ? profile.subscriptionUntil
        : now;
    await ctx.db.patch(profile._id, {
      subscription: args.plan,
      subscriptionUntil: from + days * 24 * 3600 * 1000,
      subscriptionPrice: SUBSCRIPTION_PRICES[args.plan],
    });
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
      .withIndex("by_status", (q) => q.eq("status", "demande"))
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
