// GTEC PRO — module central (src/convex/gtec.ts)
//
// Ce fichier concentre les fonctions Convex du parcours de service :
// demandes, devis, paiements, affectation d'équipe, rapports, avis, litiges,
// messagerie de chantier, profils techniciens, abonnements, portefeuille et
// console d'administration.
//
// Montants en FCFA entiers. Rôles gérés : admin / client / technicien /
// diaspora / company. Les données sensibles (CNI, coordonnées exactes) ne
// sont jamais renvoyées à un utilisateur non autorisé.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

// =====================================================================
// HELPERS PARTAGÉS
// =====================================================================

/** Utilisateur connecté ou erreur. Ne jamais appeler depuis une action. */
export async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("unauthenticated");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("unauthenticated");
  return user;
}

/** Utilisateur connecté ou null (queries ouvertes). */
async function currentUserOrNull(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
}

/**
 * Notification in-app (source de vérité temps réel).
 * Deux formes acceptées (compatibilité avec les modules existants) :
 *  - notify(ctx, userId, kind, title, body, requestId?)
 *  - notify(ctx, userId, { kind, title, body, requestId? })
 */
export async function notify(ctx: any, ...rest: any[]) {
  const [userId, second, third, fourth, fifth] = rest;
  if (!userId) return;
  const n: any =
    second && typeof second === "object"
      ? second
      : { kind: second, title: third, body: fourth, requestId: fifth };
  if (!n?.title || !n?.body) return;
  await ctx.db.insert("notifications", {
    userId,
    kind: n.kind ?? "info",
    title: n.title,
    body: n.body,
    ...(n.requestId ? { requestId: n.requestId } : {}),
    at: Date.now(),
  });
}

/**
 * Notification à tous les administrateurs. Formes acceptées :
 *  - notifyAdmins(ctx, kind, title, body, requestId?)
 *  - notifyAdmins(ctx, { kind, title, body, requestId? })
 */
export async function notifyAdmins(ctx: any, ...rest: any[]) {
  const [first, second, third, fourth] = rest;
  const n: any =
    first && typeof first === "object"
      ? first
      : { kind: first, title: second, body: third, requestId: fourth };
  if (!n?.title || !n?.body) return;
  const all = await ctx.db.query("users").collect();
  for (const a of all) {
    if (a.role === "admin") {
      await ctx.db.insert("notifications", {
        userId: a._id,
        kind: n.kind ?? "info",
        title: n.title,
        body: n.body,
        ...(n.requestId ? { requestId: n.requestId } : {}),
        at: Date.now(),
      });
    }
  }
}

/** Journal d'audit (§29). */
export async function auditLog(
  ctx: any,
  entry: {
    actorId?: any;
    actorRole?: string;
    action: string;
    targetTable?: string;
    targetId?: string;
    oldValue?: string;
    newValue?: string;
    detail?: string;
  },
) {
  await ctx.db.insert("auditLogs", {
    ...(entry.actorId ? { actorId: entry.actorId } : {}),
    ...(entry.actorRole ? { actorRole: entry.actorRole } : {}),
    action: entry.action,
    ...(entry.targetTable ? { targetTable: entry.targetTable } : {}),
    ...(entry.targetId ? { targetId: entry.targetId } : {}),
    ...(entry.oldValue ? { oldValue: entry.oldValue } : {}),
    ...(entry.newValue ? { newValue: entry.newValue } : {}),
    ...(entry.detail ? { detail: entry.detail } : {}),
    at: Date.now(),
  });
}

/**
 * Vérifie le périmètre d'un administrateur.
 *  - `requireAdminScope(ctx)` : simple contrôle « est admin » ;
 *  - `requireAdminScope(ctx, "finance", "super_admin")` : l'adminRole doit
 *    être super_admin ou faire partie des rôles listés.
 */
export async function requireAdminScope(ctx: any, ...allowed: string[]) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Action réservée à l'administration GTEC.");
  }
  if (allowed.length > 0) {
    const r = user.adminRole ?? "super_admin";
    if (r !== "super_admin" && !allowed.includes(r)) {
      throw new Error("Périmètre administrateur insuffisant pour cette action.");
    }
  }
  return user;
}

/** Référence séquentielle courte (GTC-0001, FAC-0001…). */
async function nextReference(ctx: any, prefix: string, table: string): Promise<string> {
  const rows = await ctx.db.query(table).collect();
  return `${prefix}-${String(rows.length + 1).padStart(4, "0")}`;
}

async function latestBy<T = any>(rows: T[], key: string): Promise<T | null> {
  const sorted = [...rows].sort(
    (a: any, b: any) => (b._creationTime ?? 0) - (a._creationTime ?? 0),
  );
  return sorted.length ? (sorted[0] as any) ?? null : ((rows.find((r: any) => r[key]) as any) ?? null);
}

function splitFiftyFifty(total: number) {
  const advance = Math.round(total / 2);
  return { advance, balance: total - advance };
}

/** Public : sous-total client « FiftyFifty » (utilisé par le front). */
export const splitRequestAmount = (total: number) => splitFiftyFifty(total);

/**
 * Applique la validation d'un paiement (admin, MoMo, passerelle) au parcours :
 * marque la tranche payée et fait progresser la demande.
 */
export async function settleMilestone(
  ctx: any,
  payment: any,
  opts: { externalRef?: string } = {},
) {
  if (!payment || payment.status === "valide") return;
  await ctx.db.patch(payment._id, {
    status: "valide",
    paidAt: Date.now(),
    ...(opts.externalRef ? { externalRef: opts.externalRef } : {}),
  });
  const request = await ctx.db.get(payment.requestId);
  if (!request) return;

  const milestone = payment.milestone ?? "avance";
  if (milestone === "avance" && request.status === "devis_accepte") {
    await ctx.db.patch(request._id, { status: "paye" });
  }
  // Le solde validé laisse la demande en cours jusqu'à la réception client.

  await ctx.db.insert("requestEvents", {
    requestId: payment.requestId,
    kind: "paiement",
    label:
      milestone === "avance"
        ? "Avance (50 %) confirmée"
        : "Solde (50 %) confirmé",
    detail: `${Number(payment.amount).toLocaleString("fr-FR")} ${payment.currency ?? "FCFA"}`,
    at: Date.now(),
  });
  await notify(ctx, payment.clientId, {
    kind: "paiement",
    title:
      milestone === "avance"
        ? "Avance confirmée — l'équipe va être affectée"
        : "Solde confirmé — merci !",
    body: `Paiement de ${Number(payment.amount).toLocaleString("fr-FR")} ${payment.currency ?? "FCFA"} validé.`,
    requestId: payment.requestId,
  });
}

/** Nom d'affichage sûr d'un utilisateur. */
function displayName(u: any): string {
  return u?.name ?? u?.firstName ?? "Utilisateur GTEC";
}

// =====================================================================
// COMPTES
// =====================================================================

/** L'application a-t-elle déjà un administrateur ? */
export const adminExists = query({
  args: {},
  handler: async (ctx: any): Promise<boolean> => {
    const users = await ctx.db.query("users").collect();
    return users.some((u: any) => u.role === "admin");
  },
});

/** Le premier utilisateur de l'instance devient administrateur. */
export const claimAdmin = mutation({
  args: {},
  handler: async (ctx: any) => {
    const user = await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    const existing = users.filter((u: any) => u.role === "admin");
    if (existing.length > 0) {
      if (!existing.some((a: any) => a._id === user._id)) {
        throw new Error("Un administrateur GTEC existe déjà.");
      }
      return { ok: true };
    }
    await ctx.db.patch(user._id, { role: "admin", adminRole: "super_admin" });
    await auditLog(ctx, {
      actorId: user._id,
      actorRole: "admin",
      action: "admin.claimed",
      targetTable: "users",
      targetId: String(user._id),
      detail: "Premier administrateur de l'instance",
    });
    return { ok: true };
  },
});

/** Choix de l'espace à l'inscription : client ou technicien. */
export const setAccountType = mutation({
  args: { accountType: v.union(v.literal("client"), v.literal("technicien")) },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { accountType: args.accountType });
    return { ok: true };
  },
});

/** Identité complète du client (profil client §2). */
export const updateClientIdentity = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    gender: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    phone: v.optional(v.string()),
    altPhone: v.optional(v.string()),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    quarter: v.optional(v.string()),
    customerType: v.optional(v.string()),
    companyName: v.optional(v.string()),
    taxId: v.optional(v.string()),
    idDocumentUrl: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const patch: any = { ...args };
    for (const k of Object.keys(patch)) {
      if (patch[k] === undefined) delete patch[k];
    }
    await ctx.db.patch(user._id, patch);
    return { ok: true };
  },
});

// =====================================================================
// DEMANDES DE SERVICE
// =====================================================================

export const createRequest = mutation({
  args: {
    serviceKey: v.string(),
    subcategory: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    address: v.string(),
    city: v.string(),
    photos: v.array(v.string()),
    specialtyCode: v.optional(v.string()),
    requiredSkills: v.optional(v.array(v.string())),
    interventionCode: v.optional(v.string()),
    urgency: v.union(v.literal("normale"), v.literal("urgente"), v.literal("critique")),
    desiredDate: v.optional(v.number()),
    budgetHint: v.optional(v.number()),
    voiceNoteUrl: v.optional(v.string()),
    coords: v.optional(
      v.object({
        lat: v.number(),
        lon: v.number(),
        accuracy: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    if (!args.title.trim() || !args.description.trim()) {
      throw new Error("Titre et description obligatoires.");
    }
    const reference = await nextReference(ctx, "GTC", "serviceRequests");
    const requestId = await ctx.db.insert("serviceRequests", {
      clientId: user._id,
      reference,
      serviceKey: args.serviceKey,
      ...(args.subcategory ? { subcategory: args.subcategory } : {}),
      title: args.title.trim(),
      description: args.description.trim(),
      address: args.address.trim(),
      city: args.city,
      photos: args.photos ?? [],
      status: "nouvelle",
      ...(args.specialtyCode ? { specialtyCode: args.specialtyCode } : {}),
      ...(args.requiredSkills ? { requiredSkills: args.requiredSkills } : {}),
      ...(args.interventionCode ? { interventionCode: args.interventionCode } : {}),
      ...(args.interventionLabel ? { interventionLabel: args.interventionLabel } : {}),
      urgency: args.urgency ?? "normale",
      ...(args.desiredDate ? { desiredDate: args.desiredDate } : {}),
      ...(args.budgetHint ? { budgetHint: args.budgetHint } : {}),
      ...(args.voiceNoteUrl ? { voiceNoteUrl: args.voiceNoteUrl } : {}),
      ...(args.coords ? { coords: args.coords, coordsAt: Date.now() } : {}),
    });
    await ctx.db.insert("requestEvents", {
      requestId,
      kind: "demande",
      label: "Demande créée",
      detail: `${reference} · ${args.city}`,
      at: Date.now(),
    });
    await notifyAdmins(ctx, {
      kind: "demande",
      title: `Nouvelle demande ${reference}`,
      body: `${displayName(user)} · ${args.title} (${args.city}) — émettez un devis.`,
      requestId,
    });
    return requestId;
  },
});

/** Demandes du client connecté (avec devis + paiements joints). */
export const listMyRequests = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("serviceRequests")
      .withIndex("by_client", (q: any) => q.eq("clientId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (request: any) => {
        const quotes = await ctx.db
          .query("quotes")
          .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
          .collect();
        quotes.sort((a: any, b: any) => b._creationTime - a._creationTime);
        const payments = await ctx.db
          .query("payments")
          .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
          .collect();
        return {
          request,
          quote: quotes[0] ?? null,
          payments,
        };
      }),
    );
  },
});

type LooseDoc = { [key: string]: any };
type QuoteDetailShape = LooseDoc & { items: any[] };
type ReportDetailShape = LooseDoc & {
  partsUsed: any[];
  beforePhotos: any[];
  afterPhotos: any[];
};
type RequestDocShape = LooseDoc & { photos: any[] };

type RequestDetailShape = {
  request: RequestDocShape;
  client: any;
  quote: QuoteDetailShape | null;
  quotes: any[];
  payment: any;
  payments: any[];
  assignment: any;
  teamLeader: any;
  members: any[];
  report: ReportDetailShape;
  invoice: any;
  events: any[];
  teamLocations: any[];
};

/** Dossier complet d'une demande (client / équipe / admin). */
export const getRequestDetail = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx: any, args: any): Promise<RequestDetailShape | null> => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;

    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    quotes.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    payments.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    assignments.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const assignment = assignments[0] ?? null;
    const reports = await ctx.db
      .query("interventionReports")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    reports.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    invoices.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    events.sort((a: any, b: any) => a.at - b.at);

    const isClient = request.clientId === user._id;
    const isAdmin = user.role === "admin";
    let isTeam = isAdmin;
    let teamLeader: any = null;
    const members: any[] = [];
    if (assignment) {
      if (assignment.teamLeaderId === user._id) isTeam = true;
      const leader = await ctx.db.get(assignment.teamLeaderId);
      if (leader) {
        teamLeader = {
          _id: leader._id,
          name: displayName(leader),
          phone: leader.phone ?? null,
        };
        if (isAdmin || isClient) {
          members.push({
            id: leader._id,
            name: displayName(leader),
            role: "Chef d'équipe",
          });
        }
      }
      for (const m of assignment.members ?? []) {
        if (m.id === user._id) isTeam = true;
        const mu = await ctx.db.get(m.id);
        if (mu && (isAdmin || isClient)) {
          members.push({ id: m.id, name: displayName(mu), role: m.role ?? "Technicien" });
        }
      }
    }
    if (!isClient && !isTeam) {
      // Auteur d'un devis ou participant à la conversation : accès lecture.
      const authored = quotes.some((q: any) => q.authorId === user._id);
      if (!authedParticipant(ctx, request, user, authored)) return null;
    }

    // Partage GPS de l'équipe (client + admin uniquement).
    let teamLocations: any[] = [];
    if (isAdmin || isClient) {
      const ids = new Set<any>();
      if (assignment) {
        ids.add(assignment.teamLeaderId);
        for (const m of assignment.members ?? []) ids.add(m.id);
      }
      for (const id of ids) {
        const profiles = await ctx.db
          .query("technicianProfiles")
          .withIndex("by_user", (q: any) => q.eq("userId", id))
          .collect();
        const p = profiles[0];
        if (p?.lastLocation && p?.locationSharing) {
          const u = await ctx.db.get(id);
          teamLocations.push({
            userId: id,
            name: displayName(u),
            position: p.lastLocation,
            positionAt: p.lastLocationAt ?? 0,
            sharing: true,
          });
        }
      }
    }

    const client = await ctx.db.get(request.clientId);
    const pendingPayment = payments.find((p: any) => p.status === "en_attente") ?? null;

    return {
      request,
      client: isClient || isAdmin ? { name: displayName(client), phone: client?.phone ?? null } : null,
      quote: quotes[0] ?? null,
      quotes,
      payment: pendingPayment ?? payments[0] ?? null,
      payments,
      assignment,
      teamLeader,
      members,
      report: reports[0] ?? null,
      invoice: invoices[0] ?? null,
      events,
      teamLocations,
    };
  },
});

function authedParticipant(_ctx: any, _request: any, _user: any, authored: boolean): boolean {
  return authored;
}

export const cancelRequest = mutation({
  args: { requestId: v.id("serviceRequests"), reason: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    if (["terminee", "annulee"].includes(request.status)) {
      throw new Error("Cette demande est déjà clôturée.");
    }
    await ctx.db.patch(request._id, {
      status: "annulee",
      cancellationReason: args.reason,
    });
    await ctx.db.insert("requestEvents", {
      requestId: request._id,
      kind: "annulation",
      label: "Demande annulée",
      detail: args.reason,
      at: Date.now(),
    });
    await notifyAdmins(ctx, {
      kind: "annulation",
      title: `Demande ${request.reference} annulée`,
      body: args.reason,
      requestId: request._id,
    });
    return { ok: true };
  },
});

// =====================================================================
// DEVIS
// =====================================================================

/** Devis émis par un technicien vérifié — validation automatique GTEC. */
export const submitFieldQuote = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    items: v.array(
      v.object({ label: v.string(), qty: v.number(), unitPrice: v.number() }),
    ),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    const items = (args.items ?? []).filter((i: any) => i.label?.trim());
    if (items.length === 0) throw new Error("Ajoutez au moins une ligne de devis.");
    const subtotal = items.reduce(
      (acc: number, i: any) => acc + Math.max(0, Number(i.qty)) * Math.max(0, Number(i.unitPrice)),
      0,
    );
    const vatRate = 19.25;
    const total = Math.round(subtotal * (1 + vatRate / 100));
    const number = await nextReference(ctx, "DEV", "quotes");
    const quoteId = await ctx.db.insert("quotes", {
      requestId: request._id,
      clientId: request.clientId,
      authorId: user._id,
      authorRole: "technicien",
      number,
      items,
      subtotal,
      vatRate,
      total,
      currency: "FCFA",
      status: "emis",
      validUntil: Date.now() + 30 * 24 * 3600 * 1000,
    });
    if (request.status === "nouvelle") {
      await ctx.db.patch(request._id, { status: "devis_emis" });
    }
    await ctx.db.insert("requestEvents", {
      requestId: request._id,
      kind: "devis",
      label: `Devis ${number} émis`,
      detail: `${total.toLocaleString("fr-FR")} FCFA TTC`,
      at: Date.now(),
    });
    await notify(ctx, request.clientId, {
      kind: "devis",
      title: `Devis ${number} reçu`,
      body: `Montant : ${total.toLocaleString("fr-FR")} FCFA TTC — acceptez pour planifier l'intervention.`,
      requestId: request._id,
    });
    return quoteId;
  },
});

export const acceptQuote = mutation({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    if (quote.clientId !== user._id) throw new Error("Action non autorisée.");
    if (quote.status !== "emis") throw new Error("Ce devis n'est plus acceptable.");
    await ctx.db.patch(quote._id, { status: "accepte" });
    await ctx.db.patch(quote.requestId, { status: "devis_accepte" });
    await ctx.db.insert("requestEvents", {
      requestId: quote.requestId,
      kind: "devis",
      label: `Devis ${quote.number} accepté`,
      detail: `${quote.total.toLocaleString("fr-FR")} FCFA TTC`,
      at: Date.now(),
    });
    await notifyAdmins(ctx, {
      kind: "devis",
      title: `Devis ${quote.number} accepté`,
      body: "Le client a accepté le devis — enregistrez le paiement de l'avance.",
      requestId: quote.requestId,
    });
    return { ok: true };
  },
});

export const refuseQuote = mutation({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    if (quote.clientId !== user._id) throw new Error("Action non autorisée.");
    await ctx.db.patch(quote._id, { status: "refuse" });
    await ctx.db.insert("requestEvents", {
      requestId: quote.requestId,
      kind: "devis",
      label: `Devis ${quote.number} refusé`,
      at: Date.now(),
    });
    return { ok: true };
  },
});

/** Demandes chiffrables par un technicien vérifié. */
export const listQuoteableRequests = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    const profile = profiles[0];
    if (!profile || profile.status !== "verifie") return [];
    // Modèle économique 2026 : sans abonnement actif, le professionnel ne
    // reçoit plus de nouvelles demandes (les missions en cours restent
    // accessibles jusqu'à leur clôture).
    if (profile.subscriptionUntil && profile.subscriptionUntil <= Date.now()) {
      return [];
    }
    const rows = await ctx.db
      .query("serviceRequests")
      .withIndex("by_status", (q: any) => q.eq("status", "nouvelle"))
      .collect();
    const emitted = await ctx.db
      .query("serviceRequests")
      .withIndex("by_status", (q: any) => q.eq("status", "devis_emis"))
      .collect();
    const all = [...rows, ...emitted];
    all.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      all.slice(0, 40).map(async (request: any) => {
        const client = await ctx.db.get(request.clientId);
        return { request, clientName: displayName(client) };
      }),
    );
  },
});

// =====================================================================
// PAIEMENTS (2 tranches 50/50, §V6)
// =====================================================================

export const initiatePayment = mutation({
  args: {
    quoteId: v.id("quotes"),
    milestone: v.union(v.literal("avance"), v.literal("solde")),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("especes"),
      v.literal("virement"),
      v.literal("carte_visa"),
    ),
    payerPhone: v.string(),
    proofPhotoUrl: v.optional(v.string()),
    bankName: v.optional(v.string()),
    bankRef: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.clientId !== user._id || quote.status !== "accepte") {
      throw new Error("Devis introuvable ou non accepté.");
    }
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_milestone", (q: any) =>
        q.eq("requestId", quote.requestId).eq("milestone", args.milestone),
      )
      .collect();
    if (existing.some((p: any) => p.status === "valide")) {
      throw new Error("Cette tranche est déjà réglée.");
    }
    if (existing.some((p: any) => p.status === "en_attente")) {
      throw new Error("Un paiement est déjà en cours de vérification.");
    }
    const { advance, balance } = splitFiftyFifty(quote.total);
    const amount = args.milestone === "avance" ? advance : balance;
    const paymentId = await ctx.db.insert("payments", {
      quoteId: quote._id,
      requestId: quote.requestId,
      clientId: user._id,
      amount,
      currency: quote.currency ?? "FCFA",
      method: args.method,
      payerPhone: args.payerPhone,
      status: "en_attente",
      milestone: args.milestone,
      ...(args.proofPhotoUrl ? { proofPhotoUrl: args.proofPhotoUrl } : {}),
      ...(args.bankName ? { bankName: args.bankName } : {}),
      ...(args.bankRef ? { bankRef: args.bankRef } : {}),
      ...(args.cardLast4 ? { cardLast4: args.cardLast4 } : {}),
    });
    await ctx.db.insert("requestEvents", {
      requestId: quote.requestId,
      kind: "paiement",
      label:
        args.milestone === "avance"
          ? "Avance (50 %) initiée — en attente de vérification"
          : "Solde (50 %) initié — en attente de vérification",
      detail: `${amount.toLocaleString("fr-FR")} FCFA · ${args.method}`,
      at: Date.now(),
    });
    await notifyAdmins(ctx, {
      kind: "paiement",
      title: "Paiement à vérifier",
      body: `Tranche « ${args.milestone} » de ${amount.toLocaleString("fr-FR")} FCFA déclarée (${args.method}).`,
      requestId: quote.requestId,
    });
    return paymentId;
  },
});

export const clientReception = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    signature: v.string(),
    receptionNote: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) throw new Error("Action non autorisée.");
    const reports = await ctx.db
      .query("interventionReports")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    reports.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const report = reports[0];
    if (report) {
      await ctx.db.patch(report._id, {
        status: "receptionne",
        clientSignature: args.signature,
        ...(args.receptionNote ? { receptionNote: args.receptionNote } : {}),
        receivedAt: Date.now(),
      });
    }
    await ctx.db.patch(request._id, { status: "terminee" });

    // Facture finale (émise si tout est payé, sinon en attente).
    const paymentsRows = await ctx.db
      .query("payments")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    const allPaid =
      paymentsRows.length > 0 && paymentsRows.every((p: any) => p.status === "valide");
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    quotes.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const accepted = quotes.find((q: any) => q.status === "accepte") ?? quotes[0];
    const number = await nextReference(ctx, "FAC", "invoices");
    const invoiceId = await ctx.db.insert("invoices", {
      requestId: request._id,
      clientId: request.clientId,
      number,
      amount: accepted?.total ?? 0,
      currency: accepted?.currency ?? "FCFA",
      status: allPaid ? "payee" : "emise",
      issuedAt: Date.now(),
    });
    await ctx.db.insert("requestEvents", {
      requestId: request._id,
      kind: "reception",
      label: "Réception confirmée par le client",
      detail: args.receptionNote ?? undefined,
      at: Date.now(),
    });
    await notifyAdmins(ctx, {
      kind: "reception",
      title: `Réception signée — ${request.reference}`,
      body: "Le client a signé la réception des travaux.",
      requestId: request._id,
    });
    return invoiceId;
  },
});

export const clientSubmitReview = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) throw new Error("Action non autorisée.");
    if (args.rating < 1 || args.rating > 5) throw new Error("Note entre 1 et 5.");
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    if (existing.length > 0) throw new Error("Un avis existe déjà pour cette demande.");
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    assignments.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const techUserId = assignments[0]?.teamLeaderId ?? user._id;
    await ctx.db.insert("reviews", {
      requestId: request._id,
      clientId: user._id,
      techUserId,
      rating: args.rating,
      ...(args.comment ? { comment: args.comment } : {}),
      at: Date.now(),
    });
    await notify(ctx, techUserId, {
      kind: "avis",
      title: "Nouvel avis client",
      body: `Note : ${args.rating}/5${args.comment ? ` — « ${args.comment} »` : ""}`,
      requestId: request._id,
    });
    return { ok: true };
  },
});

export const getReviewForRequest = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx: any, args: any) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect();
    return rows[0] ?? null;
  },
});

export const listPublicReviews = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const rows = await ctx.db.query("reviews").collect();
    rows.sort((a: any, b: any) => b.at - a.at);
    return Promise.all(
      rows.slice(0, 9).map(async (r: any) => {
        const client = await ctx.db.get(r.clientId);
        const request = await ctx.db.get(r.requestId);
        return {
          rating: r.rating,
          comment: r.comment ?? null,
          at: r.at,
          clientName: displayName(client),
          serviceKey: request?.serviceKey ?? "",
        };
      }),
    );
  },
});

// =====================================================================
// PAIEMENTS — fonctions internes (momo.ts / paymentChannels.ts / http.ts)
// =====================================================================

export const txByProviderRef = internalQuery({
  args: { providerRef: v.string() },
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query("momoTransactions")
      .withIndex("by_provider_ref", (q: any) => q.eq("providerRef", args.providerRef))
      .collect();
    if (!rows.length) return null;
    return { paymentId: rows[rows.length - 1].paymentId };
  },
});

export const txForPayment = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query("momoTransactions")
      .withIndex("by_payment", (q: any) => q.eq("paymentId", args.paymentId))
      .collect();
    rows.sort((a: any, b: any) => a._creationTime - b._creationTime);
    return rows[rows.length - 1] ?? null;
  },
});

export const getAcceptedQuoteForPayment = internalQuery({
  args: {
    quoteId: v.id("quotes"),
    clientId: v.id("users"),
    milestone: v.union(v.literal("avance"), v.literal("solde")),
  },
  handler: async (ctx: any, args: any) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.clientId !== args.clientId || quote.status !== "accepte") {
      return null;
    }
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_milestone", (q: any) =>
        q.eq("requestId", quote.requestId).eq("milestone", args.milestone),
      )
      .collect();
    if (existing.some((p: any) => p.status === "valide")) return null;
    return quote;
  },
});

export const pendingPaymentForRequest = internalQuery({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect();
    return rows.find((p: any) => p.status === "en_attente") ?? null;
  },
});

export const createPendingPayment = internalMutation({
  args: {
    quoteId: v.id("quotes"),
    clientId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    method: v.string(),
    payerPhone: v.string(),
    milestone: v.union(v.literal("avance"), v.literal("solde")),
  },
  handler: async (ctx: any, args: any) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    return await ctx.db.insert("payments", {
      quoteId: args.quoteId,
      requestId: quote.requestId,
      clientId: args.clientId,
      amount: args.amount,
      currency: args.currency,
      method: args.method,
      payerPhone: args.payerPhone,
      status: "en_attente",
      milestone: args.milestone,
    });
  },
});

export const getPaymentById = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx: any, args: any) => {
    return (await ctx.db.get(args.paymentId)) ?? null;
  },
});

export const paymentByExternalRef = internalQuery({
  args: { externalRef: v.string() },
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db.query("payments").collect();
    return rows.find((p: any) => p.externalRef === args.externalRef) ?? null;
  },
});

// =====================================================================
// AFFECTATION D'ÉQUIPE & INTERVENTIONS
// =====================================================================

export const adminAssignCrew = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    teamLeaderId: v.id("users"),
    memberIds: v.array(v.id("users")),
    scheduledAt: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    const members = (args.memberIds ?? [])
      .filter((id: any) => id !== args.teamLeaderId)
      .map((id: any) => ({ id, role: "Technicien" }));
    await ctx.db.insert("assignments", {
      requestId: request._id,
      teamLeaderId: args.teamLeaderId,
      members,
      scheduledAt: args.scheduledAt,
      ...(args.notes ? { notes: args.notes } : {}),
      status: "planifiee",
    });
    await ctx.db.patch(request._id, {
      status: "affectee",
      scheduledAt: args.scheduledAt,
    });
    await ctx.db.insert("requestEvents", {
      requestId: request._id,
      kind: "affectation",
      label: "Équipe affectée",
      detail: `Intervention programmée`,
      at: Date.now(),
    });
    await notify(ctx, request.clientId, {
      kind: "affectation",
      title: "Équipe affectée à votre demande",
      body: `Intervention programmée — l'équipe vous contactera avant de passer.`,
      requestId: request._id,
    });
    await notify(ctx, args.teamLeaderId, {
      kind: "mission",
      title: "Nouvelle mission",
      body: `${request.reference} — ${request.title} (${request.city}).`,
      requestId: request._id,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "assignment.created",
      targetTable: "assignments",
      targetId: String(request._id),
      detail: `Chef : ${args.teamLeaderId}`,
    });
    return { ok: true };
  },
});

export const adminStartIntervention = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx: any, args: any) => {
    await requireAdminScope(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    await ctx.db.patch(request._id, { status: "en_intervention" });
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    assignments.sort((a: any, b: any) => b._creationTime - a._creationTime);
    if (assignments[0]) {
      await ctx.db.patch(assignments[0]._id, { status: "en_cours" });
    }
    await ctx.db.insert("requestEvents", {
      requestId: request._id,
      kind: "intervention",
      label: "Intervention démarrée",
      at: Date.now(),
    });
    await notify(ctx, request.clientId, {
      kind: "intervention",
      title: "L'intervention a démarré",
      body: "L'équipe GTEC est sur place.",
      requestId: request._id,
    });
    return { ok: true };
  },
});

/** Rapport d'intervention — admin ou technicien (même logique). */
async function submitReportImpl(ctx: any, user: any, args: any) {
  const request = await ctx.db.get(args.requestId);
  if (!request) throw new Error("Demande introuvable.");
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
    .collect();
  assignments.sort((a: any, b: any) => b._creationTime - a._creationTime);
  let assignment = assignments[0];
  if (!assignment) {
    const assignmentId = await ctx.db.insert("assignments", {
      requestId: request._id,
      teamLeaderId: user._id,
      members: [],
      scheduledAt: Date.now(),
      status: "terminee",
    });
    assignment = await ctx.db.get(assignmentId);
  }
  const reportId = await ctx.db.insert("interventionReports", {
    requestId: request._id,
    assignmentId: assignment._id,
    workDone: args.workDone,
    partsUsed: args.partsUsed ?? [],
    beforePhotos: args.beforePhotos ?? [],
    afterPhotos: args.afterPhotos ?? [],
    warrantyMonths: args.warrantyMonths ?? 0,
    ...(args.recommendations ? { recommendations: args.recommendations } : {}),
    status: "transmis",
  });
  await ctx.db.patch(request._id, { status: "rapport_emis" });
  await ctx.db.insert("requestEvents", {
    requestId: request._id,
    kind: "rapport",
    label: "Rapport d'intervention transmis",
    at: Date.now(),
  });
  await notify(ctx, request.clientId, {
    kind: "rapport",
    title: "Rapport d'intervention disponible",
    body: `${request.reference} — vérifiez les travaux et signez la réception.`,
    requestId: request._id,
  });
  return reportId;
}

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
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    return await submitReportImpl(ctx, admin, args);
  },
});

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
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    return await submitReportImpl(ctx, user, args);
  },
});

// =====================================================================
// GÉOLOCALISATION TERRAIN
// =====================================================================

export const updateTechnicianLocation = mutation({
  args: {
    lat: v.optional(v.number()),
    lon: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    sharing: v.boolean(),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    const profile = profiles[0];
    if (!profile) return { ok: false };
    const patch: any = { locationSharing: args.sharing };
    if (args.sharing && typeof args.lat === "number" && typeof args.lon === "number") {
      patch.lastLocation = {
        lat: args.lat,
        lon: args.lon,
        ...(args.accuracy ? { accuracy: args.accuracy } : {}),
      };
      patch.lastLocationAt = Date.now();
    }
    await ctx.db.patch(profile._id, patch);
    return { ok: true };
  },
});

export const stopTechnicianLocationSharing = mutation({
  args: {},
  handler: async (ctx: any) => {
    const user = await requireUser(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    if (profiles[0]) {
      await ctx.db.patch(profiles[0]._id, { locationSharing: false });
    }
    return { ok: true };
  },
});

export const markTeamArrival = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    lat: v.number(),
    lon: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    await ctx.db.patch(request._id, {
      teamArrivalAt: Date.now(),
      teamArrivalCoords: {
        lat: args.lat,
        lon: args.lon,
        ...(args.accuracy ? { accuracy: args.accuracy } : {}),
      },
    });
    await ctx.db.insert("requestEvents", {
      requestId: request._id,
      kind: "intervention",
      label: "Arrivée de l'équipe confirmée",
      at: Date.now(),
    });
    await notify(ctx, request.clientId, {
      kind: "intervention",
      title: "L'équipe est arrivée sur place",
      body: `${request.reference} — l'intervention commence.`,
      requestId: request._id,
    });
    return { ok: true };
  },
});

// =====================================================================
// MESSAGERIE DE CHANTIER (§11)
// =====================================================================

export const chatRoomForRequest = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const rooms = await ctx.db
      .query("chatRooms")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect();
    const room = rooms[0];
    if (!room) return null;
    if (!(room.participantIds ?? []).some((id: any) => id === user._id)) return null;
    return room._id;
  },
});

export const listConversations = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const rooms = await ctx.db.query("chatRooms").collect();
    const mine = rooms
      .filter((r: any) => (r.participantIds ?? []).some((id: any) => id === user._id))
      .sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return Promise.all(
      mine.map(async (room: any) => {
        const messages = await ctx.db
          .query("conversationMessages")
          .withIndex("by_room", (q: any) => q.eq("roomId", room._id))
          .collect();
        messages.sort((a: any, b: any) => a.at - b.at);
        const last = messages[messages.length - 1] ?? null;
        const sender = last ? await ctx.db.get(last.senderId) : null;
        return {
          room,
          lastMessage: last
            ? { body: last.body ?? "", callKind: last.callKind ?? null, at: last.at }
            : null,
          lastSenderName: last ? displayName(sender) : null,
        };
      }),
    );
  },
});

export const listMessages = query({
  args: { roomId: v.id("chatRooms") },
  handler: async (ctx: any, args: any): Promise<any[] | null> => {
    const user = await requireUser(ctx);
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;
    if (!(room.participantIds ?? []).some((id: any) => id === user._id)) return null;
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_room", (q: any) => q.eq("roomId", args.roomId))
      .collect();
    messages.sort((a: any, b: any) => a.at - b.at);
    return Promise.all(
      messages.map(async (m: any) => ({
        _id: m._id,
        senderId: m.senderId,
        body: m.body ?? "",
        callKind: m.callKind ?? null,
        at: m.at,
      })),
    );
  },
});

export const sendMessage = mutation({
  args: {
    roomId: v.id("chatRooms"),
    body: v.optional(v.string()),
    callKind: v.optional(
      v.union(
        v.literal("appel_sortant"),
        v.literal("appel_entrant"),
        v.literal("appel_accepte"),
        v.literal("appel_recu"),
        v.literal("appel_decroche"),
        v.literal("appel_terminé"),
      ),
    ),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Conversation introuvable.");
    if (!(room.participantIds ?? []).some((id: any) => id === user._id)) {
      throw new Error("Action non autorisée.");
    }
    if (!args.body?.trim() && !args.callKind) {
      throw new Error("Message vide.");
    }
    const messageId = await ctx.db.insert("conversationMessages", {
      roomId: room._id,
      senderId: user._id,
      ...(args.body?.trim() ? { body: args.body.trim() } : {}),
      ...(args.callKind ? { callKind: args.callKind } : {}),
      at: Date.now(),
    });
    await ctx.db.patch(room._id, { updatedAt: Date.now() });
    for (const pid of room.participantIds ?? []) {
      if (pid === user._id) continue;
      await notify(ctx, pid, {
        kind: "message",
        title: args.callKind ? `Appel — ${displayName(user)}` : `Message — ${displayName(user)}`,
        body: args.callKind ? args.callKind : (args.body ?? "").slice(0, 120),
        requestId: room.requestId ?? undefined,
      });
    }
    return messageId;
  },
});

// =====================================================================
// NOTIFICATIONS IN-APP
// =====================================================================

export const listMyNotifications = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b.at - a.at);
    return rows.slice(0, 50);
  },
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const n = await ctx.db.get(args.notificationId);
    if (!n || n.userId !== user._id) throw new Error("Notification introuvable.");
    if (n.readAt === undefined) {
      await ctx.db.patch(n._id, { readAt: Date.now() });
    }
    return { ok: true };
  },
});

export const markAllNotificationsRead = mutation({
  args: {},
  handler: async (ctx: any) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    for (const n of rows) {
      if (n.readAt === undefined) await ctx.db.patch(n._id, { readAt: Date.now() });
    }
    return { ok: true };
  },
});

// =====================================================================
// PROFIL TECHNICIEN, ABONNEMENTS, MISSIONS
// =====================================================================

export const myTechnicianProfile = query({
  args: {},
  handler: async (ctx: any): Promise<any> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return rows[0] ?? null;
  },
});

export const submitTechnicianApplication = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    nationalId: v.string(),
    gender: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    phone: v.string(),
    altPhone: v.optional(v.string()),
    city: v.string(),
    address: v.optional(v.string()),
    specialty: v.string(),
    profession: v.optional(v.string()),
    experienceYears: v.number(),
    currentEmployer: v.optional(v.string()),
    references: v.optional(v.string()),
    zones: v.array(v.string()),
    bio: v.optional(v.string()),
    domainCode: v.optional(v.string()),
    specialtyCode: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    certifications: v.optional(v.array(v.string())),
    degreeKey: v.optional(v.string()),
    degreeLevel: v.optional(v.string()),
    experienceBand: v.optional(v.string()),
    district: v.optional(v.string()),
    radiusKm: v.optional(v.number()),
    highestDegree: v.string(),
    fieldOfStudy: v.optional(v.string()),
    school: v.optional(v.string()),
    graduationYear: v.optional(v.number()),
    documents: v.array(v.object({ kind: v.string(), label: v.string(), url: v.string() })),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const payload: any = {
      userId: user._id,
      firstName: args.firstName,
      lastName: args.lastName,
      nationalId: args.nationalId,
      ...(args.gender ? { gender: args.gender } : {}),
      ...(args.birthDate ? { birthDate: args.birthDate } : {}),
      phone: args.phone,
      ...(args.altPhone ? { altPhone: args.altPhone } : {}),
      city: args.city,
      ...(args.address ? { address: args.address } : {}),
      specialty: args.specialty,
      ...(args.profession ? { profession: args.profession } : {}),
      experienceYears: args.experienceYears,
      ...(args.currentEmployer ? { currentEmployer: args.currentEmployer } : {}),
      ...(args.references ? { references: args.references } : {}),
      zones: args.zones,
      ...(args.bio ? { bio: args.bio } : {}),
      ...(args.domainCode ? { domainCode: args.domainCode } : {}),
      ...(args.specialtyCode ? { specialtyCode: args.specialtyCode } : {}),
      ...(args.jobTitle ? { jobTitle: args.jobTitle } : {}),
      ...(args.skills ? { skills: args.skills } : {}),
      ...(args.certifications ? { certifications: args.certifications } : {}),
      ...(args.degreeKey ? { degreeKey: args.degreeKey } : {}),
      ...(args.degreeLevel ? { degreeLevel: args.degreeLevel } : {}),
      ...(args.experienceBand ? { experienceBand: args.experienceBand } : {}),
      ...(args.district ? { district: args.district } : {}),
      ...(args.radiusKm ? { radiusKm: args.radiusKm } : {}),
      highestDegree: args.highestDegree,
      ...(args.fieldOfStudy ? { fieldOfStudy: args.fieldOfStudy } : {}),
      ...(args.school ? { school: args.school } : {}),
      ...(args.graduationYear ? { graduationYear: args.graduationYear } : {}),
      documents: args.documents,
      status: "en_attente",
      subscription: "aucun",
    };
    // Mise à jour des infos de base du compte.
    await ctx.db.patch(user._id, {
      ...(args.phone ? { phone: args.phone } : {}),
      city: args.city,
      firstName: args.firstName,
      lastName: args.lastName,
    });
    if (rows[0]) {
      await ctx.db.patch(rows[0]._id, payload);
      return rows[0]._id;
    }
    return await ctx.db.insert("technicianProfiles", payload);
  },
});

// Tarifs officiels des abonnements professionnels (modèle économique 2026 :
// aucune commission sur les prestations, revenus via abonnements).
export const SUBSCRIPTION_PRICES: Record<string, { priceFcfa: number; months: number }> = {
  mensuel: { priceFcfa: 10000, months: 1 },
  trimestriel: { priceFcfa: 48000, months: 3 },
  semestriel: { priceFcfa: 55000, months: 6 },
  annuel: { priceFcfa: 100000, months: 12 },
};

const PLAN_FALLBACK = SUBSCRIPTION_PRICES;

export const requestSubscriptionPayment = mutation({
  args: {
    plan: v.union(
      v.literal("mensuel"),
      v.literal("trimestriel"),
      v.literal("semestriel"),
      v.literal("annuel"),
    ),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("especes"),
      v.literal("virement"),
      v.literal("carte"),
      v.literal("paypal"),
    ),
    payerPhone: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    const profile = profiles[0];
    if (!profile) throw new Error("Complétez d'abord votre candidature.");
    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_plan", (q: any) => q.eq("plan", args.plan))
      .collect();
    const plan = plans[0];
    const price = plan?.priceFcfa ?? PLAN_FALLBACK[args.plan]?.priceFcfa ?? 5000;
    const months = plan?.months ?? PLAN_FALLBACK[args.plan]?.months ?? 1;
    const receiptNo = `ABO-${Date.now().toString(36).toUpperCase()}`;
    await ctx.db.insert("subscriptionPayments", {
      profileId: profile._id,
      techUserId: user._id,
      plan: args.plan,
      amount: price,
      currency: "FCFA",
      method: args.method,
      payerPhone: args.payerPhone,
      status: "en_attente",
      receiptNo,
    });
    await notifyAdmins(ctx, {
      kind: "abonnement",
      title: "Paiement d'abonnement à vérifier",
      body: `${displayName(user)} · ${args.plan} · ${price.toLocaleString("fr-FR")} FCFA (${receiptNo}).`,
    });
    return { receiptNo };
  },
});

export const myPendingSubscriptionPayment = query({
  args: {},
  handler: async (ctx: any) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("subscriptionPayments").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return rows.find((r: any) => r.techUserId === user._id && r.status === "en_attente") ?? null;
  },
});

/**
 * « MON ABONNEMENT » — formule actuelle, dates, jours restants, statut et
 * historique complet des paiements (reçus d'abonnement, distincts des
 * factures de prestation).
 */
export const mySubscription = query({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<{
    plan: string | null;
    priceFcfa: number | null;
    until: number | null;
    daysLeft: number;
    active: boolean;
    statusLabel: "Actif" | "Expire bientôt" | "Expiré" | "Aucun";
    history: any[];
  }> => {
    const user = await requireUser(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    const profile = profiles[0];
    const until = profile?.subscriptionUntil ?? null;
    const daysLeft = until ? Math.max(0, Math.ceil((until - Date.now()) / 86_400_000)) : 0;
    const active = daysLeft > 0 && profile?.subscription !== "aucun";
    const payments = await ctx.db.query("subscriptionPayments").collect();
    const history = payments
      .filter((p: any) => p.techUserId === user._id)
      .sort((a: any, b: any) => b._creationTime - a._creationTime);
    const lastPaid = history.find((p: any) => p.status === "valide");
    return {
      plan: active ? (profile?.subscription ?? null) : null,
      priceFcfa: lastPaid?.amount ?? null,
      until,
      daysLeft,
      active,
      statusLabel: !until || !active ? "Expiré" : daysLeft <= 7 ? "Expire bientôt" : "Actif",
      history: history as any[],
    };
  },
});

export const requestMaterial = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    label: v.string(),
    qty: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    const id = await ctx.db.insert("materialRequests", {
      requestId: request._id,
      requestedById: user._id,
      label: args.label.trim(),
      qty: Math.max(1, Number(args.qty)),
      status: "demande",
    });
    await notifyAdmins(ctx, {
      kind: "materiel",
      title: "Demande de matériel",
      body: `${args.qty} × ${args.label} — ${request.reference}.`,
      requestId: request._id,
    });
    return id;
  },
});

export const technicianCollectCash = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    proofPhotoUrl: v.optional(v.string()),
    payerPhone: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_request", (q: any) => q.eq("requestId", request._id))
      .collect();
    quotes.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const accepted = quotes.find((q: any) => q.status === "accepte") ?? quotes[0];
    if (!accepted) throw new Error("Aucun devis accepté pour cette demande.");
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_milestone", (q: any) =>
        q.eq("requestId", request._id).eq("milestone", "solde"),
      )
      .collect();
    if (existing.some((p: any) => p.status === "valide")) {
      throw new Error("Le solde est déjà réglé.");
    }
    const { balance } = splitFiftyFifty(accepted.total);
    const paymentId = await ctx.db.insert("payments", {
      quoteId: accepted._id,
      requestId: request._id,
      clientId: request.clientId,
      amount: balance,
      currency: accepted.currency ?? "FCFA",
      method: "especes",
      payerPhone: args.payerPhone ?? user.phone ?? "—",
      status: "en_attente",
      milestone: "solde",
      ...(args.proofPhotoUrl ? { proofPhotoUrl: args.proofPhotoUrl } : {}),
      collectedBy: user._id,
      collectedAt: Date.now(),
    });
    await notifyAdmins(ctx, {
      kind: "paiement",
      title: "Encaissement espèces à vérifier",
      body: `Solde ${balance.toLocaleString("fr-FR")} FCFA collecté sur ${request.reference}.`,
      requestId: request._id,
    });
    return paymentId;
  },
});

export const listMyMissions = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const assignments = await ctx.db.query("assignments").collect();
    assignments.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const mine = assignments.filter(
      (a: any) =>
        a.teamLeaderId === user._id ||
        (a.members ?? []).some((m: any) => m.id === user._id),
    );
    return Promise.all(
      mine.map(async (assignment: any) => {
        const request = await ctx.db.get(assignment.requestId);
        return { assignment, request: request ?? null };
      }),
    );
  },
});

export const completeContractVisit = mutation({
  args: { visitId: v.id("contractVisits"), report: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const visit = await ctx.db.get(args.visitId);
    if (!visit) throw new Error("Visite introuvable.");
    if (visit.assignedTeamLeaderId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    await ctx.db.patch(visit._id, {
      doneAt: Date.now(),
      report: args.report,
      status: "faite",
    });
    return { ok: true };
  },
});

export const listMyVisits = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const visits = await ctx.db
      .query("contractVisits")
      .withIndex("by_leader", (q: any) => q.eq("assignedTeamLeaderId", user._id))
      .collect();
    visits.sort((a: any, b: any) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
    return Promise.all(
      visits.map(async (visit: any) => {
        const contract = await ctx.db.get(visit.contractId);
        return { visit, contract: contract ?? null };
      }),
    );
  },
});

export const setAvailability = mutation({
  args: {
    availability: v.union(
      v.literal("disponible"),
      v.literal("occupe"),
      v.literal("hors_ligne"),
      v.literal("indisponible"),
      v.literal("en_intervention"),
      v.literal("conge"),
    ),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    if (!profiles[0]) throw new Error("Profil technicien introuvable.");
    await ctx.db.patch(profiles[0]._id, { availability: args.availability });
    return { ok: true };
  },
});

export const myCommissions = query({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<{
    dueTotal: number;
    paidTotal: number;
    dueCount: number;
    debtDeadline: any;
    debtOverdue: boolean;
    items: any[];
  }> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("gtecCommissions").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const mine = rows.filter((r: any) => r.techUserId === user._id);
    const due = mine.filter((r: any) => r.status === "due");
    const dueTotal = due.reduce((acc: number, r: any) => acc + r.amount, 0);
    const paidTotal = mine
      .filter((r: any) => r.status === "payee")
      .reduce((acc: number, r: any) => acc + r.amount, 0);
    const deadline = due
      .map((r: any) => r.commissionDebt?.deadlineAt)
      .filter((d: any) => typeof d === "number")
      .sort((a: number, b: number) => a - b)[0];
    return {
      dueTotal,
      paidTotal,
      dueCount: due.length,
      items: mine as any[],
      debtDeadline: deadline ?? null,
      debtOverdue: deadline ? deadline < Date.now() : false,
    } as {
      dueTotal: number;
      paidTotal: number;
      dueCount: number;
      debtDeadline: any;
      debtOverdue: boolean;
      items: any[];
    };
  },
});

export const payCommission = mutation({
  args: {
    commissionId: v.id("gtecCommissions"),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("virement"),
      v.literal("especes"),
    ),
    payerPhone: v.string(),
    externalRef: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission introuvable.");
    if (commission.techUserId !== user._id) throw new Error("Action non autorisée.");
    if (commission.status !== "due") throw new Error("Commission déjà réglée.");
    await ctx.db.patch(commission._id, {
      method: args.method,
      payerPhone: args.payerPhone,
      ...(args.externalRef ? { externalRef: args.externalRef } : {}),
    });
    await notifyAdmins(ctx, {
      kind: "commission",
      title: "Règlement de commission déclaré",
      body: `${commission.amount.toLocaleString("fr-FR")} FCFA via ${args.method}.`,
      requestId: commission.requestId,
    });
    return { ok: true };
  },
});

export const myWallet = query({
  args: {},
  handler: async (ctx: any) => {
    const user = await requireUser(ctx);
    const payouts = await ctx.db.query("payouts").collect();
    const mine = payouts.filter((p: any) => p.techUserId === user._id);
    const earned = mine
      .filter((p: any) => p.status === "payé")
      .reduce((acc: number, p: any) => acc + p.amount, 0);
    const wdRows = await ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    wdRows.sort((a: any, b: any) => b.requestedAt - a.requestedAt);
    const withdrawn = wdRows
      .filter((w: any) => w.status === "payee")
      .reduce((acc: number, w: any) => acc + w.amount, 0);
    const pending = wdRows
      .filter((w: any) => w.status === "demande" || w.status === "approuve")
      .reduce((acc: number, w: any) => acc + w.amount, 0);
    const duePayouts = mine
      .filter((p: any) => p.status === "dû")
      .reduce((acc: number, p: any) => acc + p.amount, 0);
    return {
      earned,
      withdrawn,
      pending,
      available: Math.max(0, earned - withdrawn - pending),
      duePayouts,
      history: wdRows as any[],
      payouts: mine as any[],
    };
  },
});

export const requestWithdrawal = mutation({
  args: {
    amount: v.number(),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("especes"),
      v.literal("virement"),
    ),
    destination: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("Montant invalide.");
    }
    if (!args.destination.trim()) throw new Error("Renseignez la destination du retrait.");
    const wallet: any = await (async () => {
      const payouts = await ctx.db.query("payouts").collect();
      const mine = payouts.filter((p: any) => p.techUserId === user._id);
      const earned = mine
        .filter((p: any) => p.status === "payé")
        .reduce((acc: number, p: any) => acc + p.amount, 0);
      const wdRows = await ctx.db
        .query("withdrawals")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();
      const withdrawn = wdRows
        .filter((w: any) => w.status === "payee")
        .reduce((acc: number, w: any) => acc + w.amount, 0);
      const pending = wdRows
        .filter((w: any) => w.status === "demande" || w.status === "approuve")
        .reduce((acc: number, w: any) => acc + w.amount, 0);
      return Math.max(0, earned - withdrawn - pending);
    })();
    if (args.amount > wallet) {
      throw new Error(
        `Montant supérieur au solde disponible (${wallet.toLocaleString("fr-FR")} FCFA).`,
      );
    }
    const reference = `WD-${Date.now().toString(36).toUpperCase()}`;
    await ctx.db.insert("withdrawals", {
      userId: user._id,
      sourceRole: user.role === "admin" ? "admin" : "technicien",
      amount: args.amount,
      currency: "FCFA",
      method: args.method,
      destination: args.destination.trim(),
      status: "demande",
      requestedAt: Date.now(),
      reference,
    });
    await notifyAdmins(ctx, {
      kind: "retrait",
      title: "Demande de retrait",
      body: `${displayName(user)} · ${args.amount.toLocaleString("fr-FR")} FCFA · ${args.method}.`,
    });
    return { reference };
  },
});

export const myProviderScore = query({
  args: {},
  handler: async (ctx: any) => {
    const user = await requireUser(ctx);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_tech", (q: any) => q.eq("techUserId", user._id))
      .collect();
    const assignments = await ctx.db.query("assignments").collect();
    const mine = assignments.filter((a: any) => a.teamLeaderId === user._id);
    const completed = mine.filter((a: any) => a.status === "terminee").length;
    const total = mine.length;
    const avg =
      reviews.length > 0
        ? reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / reviews.length
        : 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const score = Math.round(
      (completionRate * 0.4 + (avg / 5) * 100 * 0.6) * 10,
    ) / 10;
    return {
      score,
      completed,
      total,
      completionRate,
      satisfaction: Math.round(avg * 10) / 10,
      reviewCount: reviews.length,
    };
  },
});

export const mySanctions = query({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<{ activeCount: number; maxLevel: number; items: any[] }> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("sanctions")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b.issuedAt - a.issuedAt);
    const active = rows.filter(
      (r: any) => r.status === "active" && (!r.until || r.until > Date.now()),
    );
    return {
      activeCount: active.length,
      maxLevel: active.reduce((m: number, r: any) => Math.max(m, r.level), 0),
      items: rows as any[],
    } as { activeCount: number; maxLevel: number; items: any[] };
  },
});

export const listMyPayouts = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("payouts").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows
        .filter((r: any) => r.techUserId === user._id)
        .map(async (payout: any) => {
          const request = await ctx.db.get(payout.requestId);
          return { payout, request: request ?? null };
        }),
    );
  },
});

export const myTechnicianReviews = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_tech", (q: any) => q.eq("techUserId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b.at - a.at);
    return Promise.all(
      rows.map(async (r: any) => {
        const request = await ctx.db.get(r.requestId);
        const client = await ctx.db.get(r.clientId);
        return {
          review: r,
          clientName: client?.name ?? "Client GTEC",
          requestRef: request?.reference ?? "—",
          request: request ?? null,
        };
      }),
    );
  },
});

export const technicianRating = query({
  args: { techUserId: v.id("users") },
  handler: async (ctx: any, args: any) => {
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_tech", (q: any) => q.eq("techUserId", args.techUserId))
      .collect();
    if (rows.length === 0) return { average: 0, count: 0 };
    const avg = rows.reduce((acc: number, r: any) => acc + r.rating, 0) / rows.length;
    return { average: Math.round(avg * 10) / 10, count: rows.length };
  },
});

// =====================================================================
// CONTRATS DE MAINTENANCE (client)
// =====================================================================

export const listMyContracts = query({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<Array<{ contract: LooseDoc; visits: any[] }>> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q: any) => q.eq("clientId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (contract: any) => {
        const visits = await ctx.db
          .query("contractVisits")
          .withIndex("by_contract", (q: any) => q.eq("contractId", contract._id))
          .collect();
        visits.sort((a: any, b: any) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
        return { contract, visits };
      }),
    );
  },
});

export const listMyContractPayments = query({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<Array<{ contractId: any; payments: any[] }>> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("contractPayments")
      .withIndex("by_client", (q: any) => q.eq("clientId", user._id))
      .collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const byContract = new Map<string, any[]>();
    for (const p of rows) {
      const list = byContract.get(p.contractId) ?? [];
      list.push(p);
      byContract.set(p.contractId, list);
    }
    return [...byContract.entries()].map(([contractId, payments]) => ({
      contractId,
      payments,
    }));
  },
});

export const payContractMonthly = mutation({
  args: {
    contractId: v.id("maintenanceContracts"),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("especes"),
      v.literal("virement"),
    ),
    payerPhone: v.string(),
    proofPhotoUrl: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id) throw new Error("Action non autorisée.");
    if (contract.status !== "actif") throw new Error("Contrat non actif.");
    const existing = await ctx.db
      .query("contractPayments")
      .withIndex("by_contract", (q: any) => q.eq("contractId", contract._id))
      .collect();
    if (existing.some((p: any) => p.status === "en_attente")) {
      throw new Error("Une mensualité est déjà en cours de vérification.");
    }
    const periodIndex = existing.filter((p: any) => p.status === "valide").length + 1;
    const months: Record<string, number> = {
      mensuel: 1,
      trimestriel: 3,
      semestriel: 6,
      annuel: 12,
    };
    const stepDays = (months[contract.frequency] ?? 1) * 30;
    const periodStart = contract.startDate + (periodIndex - 1) * stepDays * 24 * 3600 * 1000;
    const periodEnd = periodStart + stepDays * 24 * 3600 * 1000;
    await ctx.db.insert("contractPayments", {
      contractId: contract._id,
      clientId: user._id,
      periodIndex,
      periodStart,
      periodEnd,
      amount: contract.monthlyAmount,
      currency: "FCFA",
      method: args.method,
      payerPhone: args.payerPhone,
      status: "en_attente",
      ...(args.proofPhotoUrl ? { proofPhotoUrl: args.proofPhotoUrl } : {}),
    });
    await notifyAdmins(ctx, {
      kind: "paiement",
      title: "Mensualité de contrat à vérifier",
      body: `${contract.reference} — échéance n°${periodIndex} · ${contract.monthlyAmount.toLocaleString("fr-FR")} FCFA.`,
    });
    return { ok: true };
  },
});

// =====================================================================
// LITIGES (§36-37)
// =====================================================================

export const createDispute = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    category: v.union(
      v.literal("travaux_non_conformes"),
      v.literal("retard"),
      v.literal("paiement"),
      v.literal("comportement"),
      v.literal("materiel"),
      v.literal("devis"),
      v.literal("contrat"),
      v.literal("autre"),
    ),
    description: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const id = await ctx.db.insert("disputes", {
      requestId: request._id,
      openedById: user._id,
      category: args.category,
      description: args.description.trim(),
      status: "ouverte",
    });
    await notifyAdmins(ctx, {
      kind: "litige",
      title: `Litige ouvert — ${request.reference}`,
      body: args.description.slice(0, 140),
      requestId: request._id,
    });
    return id;
  },
});

export const listRequestDisputes = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx: any, args: any): Promise<any[]> => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("disputes")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return rows;
  },
});

// =====================================================================
// CONSOLE D'ADMINISTRATION
// =====================================================================

export const adminStats = query({
  args: {},
  handler: async (ctx: any) => {
    await requireAdminScope(ctx);
    const requests = await ctx.db.query("serviceRequests").collect();
    const payments = await ctx.db.query("payments").collect();
    const contractPays = await ctx.db.query("contractPayments").collect();
    const subPays = await ctx.db.query("subscriptionPayments").collect();
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("technicianProfiles").collect();
    const disputes = await ctx.db.query("disputes").collect();
    const contracts = await ctx.db.query("maintenanceContracts").collect();
    const invoices = await ctx.db.query("invoices").collect();
    const revenue =
      payments
        .filter((p: any) => p.status === "valide")
        .reduce((acc: number, p: any) => acc + p.amount, 0) +
      contractPays
        .filter((p: any) => p.status === "valide")
        .reduce((acc: number, p: any) => acc + p.amount, 0) +
      subPays
        .filter((p: any) => p.status === "valide")
        .reduce((acc: number, p: any) => acc + p.amount, 0);
    return {
      revenue,
      total: requests.length,
      totalRequests: requests.length,
      open: requests.filter((r: any) =>
        !["terminee", "annulee"].includes(r.status),
      ).length,
      done: requests.filter((r: any) => r.status === "terminee").length,
      cancelled: requests.filter((r: any) => r.status === "annulee").length,
      activeRequests: requests.filter((r: any) =>
        !["terminee", "annulee"].includes(r.status),
      ).length,
      pendingPayments: payments.filter((p: any) => p.status === "en_attente").length,
      pendingContractPayments: contractPays.filter((p: any) => p.status === "en_attente").length,
      pendingSubPayments: subPays.filter((p: any) => p.status === "en_attente").length,
      clients: users.filter((u: any) => u.role !== "admin" && u.accountType !== "technicien").length,
      technicians: profiles.length,
      verifiedTechnicians: profiles.filter((p: any) => p.status === "verifie").length,
      openDisputes: disputes.filter((d: any) => ["ouverte", "en_cours"].includes(d.status)).length,
      activeContracts: contracts.filter((c: any) => c.status === "actif").length,
      invoices: invoices.length,
    };
  },
});

export const adminListRequests = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("serviceRequests").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.slice(0, 200).map(async (request: any) => {
        const client = await ctx.db.get(request.clientId);
        return { request, client: { name: displayName(client), phone: client?.phone ?? null } };
      }),
    );
  },
});

export const adminPendingPayments = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_request")
      .collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const pending = rows.filter((p: any) => p.status === "en_attente");
    return Promise.all(
      pending.map(async (payment: any) => {
        const client = await ctx.db.get(payment.clientId);
        const request = await ctx.db.get(payment.requestId);
        return {
          payment,
          client: { name: displayName(client), phone: client?.phone ?? null },
          request: request ? { reference: request.reference, title: request.title } : null,
        };
      }),
    );
  },
});

export const adminListAllPayments = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("payments").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.slice(0, 200).map(async (payment: any) => {
        const client = await ctx.db.get(payment.clientId);
        const request = await ctx.db.get(payment.requestId);
        return {
          payment,
          client: { name: displayName(client) },
          request: request ? { reference: request.reference } : null,
        };
      }),
    );
  },
});

export const adminPendingContractPayments = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("contractPayments").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const pending = rows.filter((p: any) => p.status === "en_attente");
    return Promise.all(
      pending.map(async (payment: any) => {
        const contract = await ctx.db.get(payment.contractId);
        const client = await ctx.db.get(payment.clientId);
        return { payment, contract: contract ?? null, client: client ? { name: displayName(client) } : null };
      }),
    );
  },
});

export const adminListContractPayments = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("contractPayments").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (payment: any) => {
        const contract = await ctx.db.get(payment.contractId);
        const client = await ctx.db.get(payment.clientId);
        return {
          payment,
          contract: contract ?? null,
          client: client ? { name: displayName(client) } : null,
        };
      }),
    );
  },
});

export const adminValidateContractPayment = mutation({
  args: {
    paymentId: v.id("contractPayments"),
    decision: v.union(v.literal("valide"), v.literal("echoue")),
    note: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") throw new Error("Paiement déjà traité.");
    await ctx.db.patch(payment._id, {
      status: args.decision,
      ...(args.decision === "valide" ? { validatedAt: Date.now() } : {}),
    });
    const contract = await ctx.db.get(payment.contractId);
    await notify(ctx, payment.clientId, {
      kind: "paiement",
      title:
        args.decision === "valide"
          ? "Mensualité validée"
          : "Mensualité non retenue",
      body:
        args.decision === "valide"
          ? `${contract?.reference ?? ""} — échéance n°${payment.periodIndex} enregistrée.`
          : (args.note ?? "Le paiement n'a pas pu être vérifié."),
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "contractPayment." + args.decision,
      targetTable: "contractPayments",
      targetId: String(payment._id),
      detail: args.note ?? undefined,
    });
    return { ok: true };
  },
});

export const adminValidatePayment = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") throw new Error("Paiement déjà traité.");
    await settleMilestone(ctx, payment, { externalRef: "validation admin" });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "payment.validated",
      targetTable: "payments",
      targetId: String(payment._id),
      detail: `${payment.amount.toLocaleString("fr-FR")} FCFA`,
    });
    return { ok: true };
  },
});

export const adminRejectPayment = mutation({
  args: { paymentId: v.id("payments"), reason: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") throw new Error("Paiement déjà traité.");
    await ctx.db.patch(payment._id, { status: "echoue" });
    await ctx.db.insert("requestEvents", {
      requestId: payment.requestId,
      kind: "paiement",
      label: "Paiement marqué échoué",
      detail: args.reason ?? undefined,
      at: Date.now(),
    });
    await notify(ctx, payment.clientId, {
      kind: "paiement",
      title: "Paiement non validé",
      body: args.reason ?? "Le paiement n'a pas pu être vérifié.",
      requestId: payment.requestId,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "payment.rejected",
      targetTable: "payments",
      targetId: String(payment._id),
      detail: args.reason ?? undefined,
    });
    return { ok: true };
  },
});

export const adminPendingSubscriptionPayments = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("subscriptionPayments").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    const pending = rows.filter((p: any) => p.status === "en_attente");
    return Promise.all(
      pending.map(async (payment: any) => {
        const user = await ctx.db.get(payment.techUserId);
        return { payment, user: user ? { name: displayName(user), phone: user.phone ?? null } : null };
      }),
    );
  },
});

export const adminValidateSubscriptionPayment = mutation({
  args: { paymentId: v.id("subscriptionPayments") },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") throw new Error("Paiement déjà traité.");
    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_plan", (q: any) => q.eq("plan", payment.plan))
      .collect();
    const months = plans[0]?.months ?? PLAN_FALLBACK[payment.plan]?.months ?? 1;
    const startsAt = Date.now();
    const endsAt = startsAt + months * 30 * 24 * 3600 * 1000;
    await ctx.db.patch(payment._id, {
      status: "valide",
      startsAt,
      endsAt,
    });
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", payment.techUserId))
      .collect();
    if (profiles[0]) {
      await ctx.db.patch(profiles[0]._id, {
        subscription: payment.plan,
        subscriptionUntil: endsAt,
        subscriptionPrice: payment.amount,
      });
    }
    await notify(ctx, payment.techUserId, {
      kind: "abonnement",
      title: "Abonnement activé",
      body: `Plan ${payment.plan} actif jusqu'au ${new Date(endsAt).toLocaleDateString("fr-FR")}.`,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "subscription.validated",
      targetTable: "subscriptionPayments",
      targetId: String(payment._id),
      detail: `${payment.plan} · ${payment.amount} FCFA`,
    });
    return { ok: true };
  },
});

export const adminRejectSubscriptionPayment = mutation({
  args: { paymentId: v.id("subscriptionPayments"), reason: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    await requireAdminScope(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") throw new Error("Paiement déjà traité.");
    await ctx.db.patch(payment._id, { status: "echoue" });
    await notify(ctx, payment.techUserId, {
      kind: "abonnement",
      title: "Paiement d'abonnement non validé",
      body: args.reason ?? "Le paiement n'a pas pu être vérifié.",
    });
    return { ok: true };
  },
});

export const adminListAssignableTechnicians = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_status", (q: any) => q.eq("status", "verifie"))
      .collect();
    return Promise.all(
      profiles.map(async (p: any) => {
        const user = await ctx.db.get(p.userId);
        const reviews = await ctx.db
          .query("reviews")
          .withIndex("by_tech", (q: any) => q.eq("techUserId", p.userId))
          .collect();
        const avg =
          reviews.length > 0
            ? reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / reviews.length
            : 0;
        const subscriptionActive =
          !p.subscriptionUntil || p.subscriptionUntil > Date.now();
        return {
          _id: p.userId,
          name: displayName(user),
          city: p.city ?? null,
          zones: p.zones ?? [],
          specialty: p.specialty ?? "",
          experienceYears: p.experienceYears ?? 0,
          rating: Math.round(avg * 10) / 10,
          active: subscriptionActive,
          verified: p.status === "verifie",
          gps: p.lastLocation ?? null,
          specialtyCode: p.specialtyCode ?? null,
        };
      }),
    );
  },
});

export const adminListApplications = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_status", (q: any) => q.eq("status", "en_attente"))
      .collect();
    return Promise.all(
      profiles.map(async (profile: any) => {
        const user = await ctx.db.get(profile.userId);
        return { profile, user: user ? { name: displayName(user), email: user.email ?? null } : null };
      }),
    );
  },
});

export const adminReviewTechnician = mutation({
  args: {
    profileId: v.id("technicianProfiles"),
    decision: v.union(v.literal("verifie"), v.literal("rejete")),
    note: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Candidature introuvable.");
    await ctx.db.patch(profile._id, {
      status: args.decision,
      ...(args.note ? { reviewNote: args.note } : {}),
    });
    await notify(ctx, profile.userId, {
      kind: "candidature",
      title:
        args.decision === "verifie"
          ? "Candidature validée"
          : "Candidature non retenue",
      body:
        args.decision === "verifie"
          ? "Votre dossier est vérifié — vous recevez désormais des missions."
          : (args.note ?? "Votre dossier n'a pas été retenu."),
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "technician.reviewed",
      targetTable: "technicianProfiles",
      targetId: String(profile._id),
      newValue: args.decision,
      detail: args.note ?? undefined,
    });
    return { ok: true };
  },
});

export const adminReviewMaterial = mutation({
  args: {
    materialId: v.id("materialRequests"),
    decision: v.union(
      v.literal("approuve"),
      v.literal("commande"),
      v.literal("livre"),
      v.literal("refuse"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireAdminScope(ctx);
    const material = await ctx.db.get(args.materialId);
    if (!material) throw new Error("Demande de matériel introuvable.");
    await ctx.db.patch(material._id, {
      status: args.decision,
      ...(args.note ? { adminNote: args.note } : {}),
    });
    await notify(ctx, material.requestedById, {
      kind: "materiel",
      title: "Demande de matériel mise à jour",
      body: `${material.label} — ${args.decision}.`,
      requestId: material.requestId,
    });
    return { ok: true };
  },
});

export const listMaterialRequests = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("materialRequests").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (material: any) => {
        const request = await ctx.db.get(material.requestId);
        return { material, request: request ? { reference: request.reference } : null };
      }),
    );
  },
});

export const adminListPayouts = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("payouts").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (payout: any) => {
        const user = await ctx.db.get(payout.techUserId);
        return { payout, tech: { name: displayName(user) } };
      }),
    );
  },
});

export const adminMarkPayoutPaid = mutation({
  args: { payoutId: v.id("payouts"), method: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Rémunération introuvable.");
    await ctx.db.patch(payout._id, {
      status: "payé",
      paidAt: Date.now(),
      ...(args.method ? { method: args.method } : {}),
    });
    await notify(ctx, payout.techUserId, {
      kind: "paiement",
      title: "Rémunération payée",
      body: `${payout.amount.toLocaleString("fr-FR")} FCFA ${args.method ? `via ${args.method}` : ""}.`,
      requestId: payout.requestId,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "payout.paid",
      targetTable: "payouts",
      targetId: String(payout._id),
    });
    return { ok: true };
  },
});

export const adminListContracts = query({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<
    Array<{ contract: LooseDoc; clientName: string; clientPhone: string; visits: any[] }>
  > => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("maintenanceContracts").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (contract: any) => {
        const client = await ctx.db.get(contract.clientId);
        const visits = await ctx.db
          .query("contractVisits")
          .withIndex("by_contract", (q: any) => q.eq("contractId", contract._id))
          .collect();
        visits.sort((a: any, b: any) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
        return {
          contract,
          clientName: displayName(client),
          clientPhone: client?.phone ?? "",
          visits: visits as any[],
        };
      }),
    );
  },
});

export const adminCreateContract = mutation({
  args: {
    clientId: v.id("users"),
    serviceKey: v.string(),
    title: v.string(),
    frequency: v.union(
      v.literal("mensuel"),
      v.literal("trimestriel"),
      v.literal("semestriel"),
      v.literal("annuel"),
    ),
    monthlyAmount: v.number(),
    city: v.string(),
    address: v.string(),
    months: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    if (args.monthlyAmount <= 0) throw new Error("Montant mensuel invalide.");
    const reference = await nextReference(ctx, "MTC", "maintenanceContracts");
    const months: Record<string, number> = {
      mensuel: 1,
      trimestriel: 3,
      semestriel: 6,
      annuel: 12,
    };
    const stepDays = (months[args.frequency] ?? 1) * 30;
    const startDate = Date.now();
    const contractId = await ctx.db.insert("maintenanceContracts", {
      reference,
      clientId: args.clientId,
      serviceKey: args.serviceKey,
      title: args.title.trim(),
      ...(args.description ? { description: args.description } : {}),
      frequency: args.frequency,
      monthlyAmount: args.monthlyAmount,
      city: args.city,
      address: args.address,
      status: "actif",
      startDate,
      endDate: startDate + args.months * 30 * 24 * 3600 * 1000,
      nextVisitAt: startDate + stepDays * 24 * 3600 * 1000,
    });
    await ctx.db.insert("contractVisits", {
      contractId,
      scheduledAt: startDate + stepDays * 24 * 3600 * 1000,
      status: "planifiee",
    });
    await notify(ctx, args.clientId, {
      kind: "contrat",
      title: "Contrat de maintenance activé",
      body: `${reference} — ${args.monthlyAmount.toLocaleString("fr-FR")} FCFA / ${args.frequency}.`,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "contract.created",
      targetTable: "maintenanceContracts",
      targetId: String(contractId),
      detail: reference,
    });
    return contractId;
  },
});

export const adminUpdateContractStatus = mutation({
  args: {
    contractId: v.id("maintenanceContracts"),
    status: v.union(
      v.literal("actif"),
      v.literal("suspendu"),
      v.literal("expire"),
      v.literal("resilie"),
    ),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    await ctx.db.patch(contract._id, { status: args.status });
    await notify(ctx, contract.clientId, {
      kind: "contrat",
      title: "Contrat mis à jour",
      body: `${contract.reference} — nouveau statut : ${args.status}.`,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "contract.status",
      targetTable: "maintenanceContracts",
      targetId: String(contract._id),
      newValue: args.status,
    });
    return { ok: true };
  },
});

export const adminScheduleContractVisit = mutation({
  args: {
    contractId: v.id("maintenanceContracts"),
    scheduledAt: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    const visitId = await ctx.db.insert("contractVisits", {
      contractId: contract._id,
      scheduledAt: args.scheduledAt,
      status: "planifiee",
    });
    await ctx.db.patch(contract._id, { nextVisitAt: args.scheduledAt });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "visit.scheduled",
      targetTable: "contractVisits",
      targetId: String(visitId),
    });
    return visitId;
  },
});

export const adminAssignVisit = mutation({
  args: {
    visitId: v.id("contractVisits"),
    teamLeaderId: v.id("users"),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const visit = await ctx.db.get(args.visitId);
    if (!visit) throw new Error("Visite introuvable.");
    await ctx.db.patch(visit._id, { assignedTeamLeaderId: args.teamLeaderId });
    const contract = await ctx.db.get(visit.contractId);
    await notify(ctx, args.teamLeaderId, {
      kind: "mission",
      title: "Visite de maintenance assignée",
      body: `${contract?.reference ?? ""} — visite programmée.`,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "visit.assigned",
      targetTable: "contractVisits",
      targetId: String(visit._id),
    });
    return { ok: true };
  },
});

export const adminListClients = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u: any) => u.role !== "admin")
      .map((u: any) => ({
        _id: u._id,
        name: displayName(u),
        email: u.email ?? null,
        phone: u.phone ?? null,
        city: u.city ?? null,
        accountType: u.accountType ?? "client",
        customerType: u.customerType ?? null,
      }));
  },
});

export const adminRevenueSeries = query({
  args: {},
  handler: async (ctx: any) => {
    await requireAdminScope(ctx);
    const payments = await ctx.db.query("payments").collect();
    const contractPays = await ctx.db.query("contractPayments").collect();
    const subPays = await ctx.db.query("subscriptionPayments").collect();
    const requests = await ctx.db.query("serviceRequests").collect();

    const months: { label: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const inMonth = (p: any) =>
        p.status === "valide" &&
        (p.paidAt ?? p.validatedAt ?? 0) >= start &&
        (p.paidAt ?? p.validatedAt ?? 0) < end;
      const revenue =
        payments.filter(inMonth).reduce((a: number, p: any) => a + p.amount, 0) +
        contractPays.filter(inMonth).reduce((a: number, p: any) => a + p.amount, 0) +
        subPays.filter(inMonth).reduce((a: number, p: any) => a + p.amount, 0);
      months.push({ label, revenue });
    }
    const byService = new Map<string, number>();
    for (const r of requests) {
      byService.set(r.serviceKey, (byService.get(r.serviceKey) ?? 0) + 1);
    }
    const services = [...byService.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    return { months: months as any[], services: services as any[] };
  },
});

export const adminListWithdrawals = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("withdrawals").collect();
    rows.sort((a: any, b: any) => b.requestedAt - a.requestedAt);
    return Promise.all(
      rows.map(async (withdrawal: any) => {
        const user = await ctx.db.get(withdrawal.userId);
        return { withdrawal, user: { name: displayName(user), phone: user?.phone ?? null } };
      }),
    );
  },
});

export const adminProcessWithdrawal = mutation({
  args: {
    withdrawalId: v.id("withdrawals"),
    decision: v.union(v.literal("approuve"), v.literal("payee"), v.literal("refuse")),
    note: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) throw new Error("Retrait introuvable.");
    if (withdrawal.status === "payee" || withdrawal.status === "refuse") {
      throw new Error("Retrait déjà traité.");
    }
    await ctx.db.patch(withdrawal._id, {
      status: args.decision,
      processedAt: Date.now(),
      processedBy: admin._id,
      ...(args.note ? { note: args.note } : {}),
    });
    await notify(ctx, withdrawal.userId, {
      kind: "retrait",
      title:
        args.decision === "refuse"
          ? "Retrait refusé"
          : args.decision === "payee"
            ? "Retrait payé"
            : "Retrait approuvé",
      body:
        args.note ??
        `${withdrawal.amount.toLocaleString("fr-FR")} FCFA — ${withdrawal.reference}.`,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "withdrawal." + args.decision,
      targetTable: "withdrawals",
      targetId: String(withdrawal._id),
      detail: args.note ?? undefined,
    });
    return { ok: true };
  },
});

export const adminListCommissions = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("gtecCommissions").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (commission: any) => {
        const user = await ctx.db.get(commission.techUserId);
        return { commission, tech: { name: displayName(user) } };
      }),
    );
  },
});

export const adminCommissionStats = query({
  args: {},
  handler: async (ctx: any) => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("gtecCommissions").collect();
    return {
      due: rows.filter((r: any) => r.status === "due").length,
      payee: rows.filter((r: any) => r.status === "payee").length,
      exoneree: rows.filter((r: any) => r.status === "exoneree").length,
      dueTotal: rows
        .filter((r: any) => r.status === "due")
        .reduce((acc: number, r: any) => acc + r.amount, 0),
      paidTotal: rows
        .filter((r: any) => r.status === "payee")
        .reduce((acc: number, r: any) => acc + r.amount, 0),
      totalDue: rows
        .filter((r: any) => r.status === "due")
        .reduce((acc: number, r: any) => acc + r.amount, 0),
      totalPayee: rows
        .filter((r: any) => r.status === "payee")
        .reduce((acc: number, r: any) => acc + r.amount, 0),
    };
  },
});

// =====================================================================
// GESTION DES ABONNEMENTS (modèle économique 2026)
// =====================================================================

/** Statistiques abonnements — remplace les statistiques de commissions. */
export const adminSubscriptionStats = query({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<{
    activeCount: number;
    newThisMonth: number;
    expiredCount: number;
    expiringSoon: number;
    byPlan: Record<string, number>;
    revenue: number;
    monthlyRevenue: number;
    renewalRate: number;
  }> => {
    await requireAdminScope(ctx);
    const profiles = await ctx.db.query("technicianProfiles").collect();
    const payments = await ctx.db.query("subscriptionPayments").collect();
    const now = Date.now();
    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).getTime();
    const activeProfiles = profiles.filter(
      (p: any) => p.subscriptionUntil && p.subscriptionUntil > now,
    );
    const expired = profiles.filter(
      (p: any) => p.subscriptionUntil && p.subscriptionUntil <= now,
    );
    const expiringSoon = activeProfiles.filter(
      (p: any) => p.subscriptionUntil! - now <= 7 * 86_400_000,
    );
    const byPlan: Record<string, number> = {
      mensuel: 0,
      trimestriel: 0,
      semestriel: 0,
      annuel: 0,
    };
    for (const p of activeProfiles) {
      const k = p.subscription ?? "mensuel";
      byPlan[k] = (byPlan[k] ?? 0) + 1;
    }
    const validated = payments.filter((p: any) => p.status === "valide");
    const revenue = validated.reduce((acc: number, p: any) => acc + p.amount, 0);
    const renewals = validated.filter(
      (p: any) => (p.startsAt ?? 0) > 0,
    ).length;
    const renewers = new Set(
      validated.map((p: any) => String(p.techUserId)),
    ).size;
    const clients = new Set(validated.map((p: any) => String(p.techUserId))).size;
    return {
      activeCount: activeProfiles.length,
      newThisMonth: validated.filter(
        (p: any) => (p.startsAt ?? p._creationTime) >= monthStart,
      ).length,
      expiredCount: expired.length,
      expiringSoon: expiringSoon.length,
      byPlan,
      revenue,
      monthlyRevenue: validated
        .filter((p: any) => (p.startsAt ?? 0) >= monthStart)
        .reduce((acc: number, p: any) => acc + p.amount, 0),
      renewalRate:
        clients > 0
          ? Math.round(
              (validated.filter((p: any) => (p.startsAt ?? 0) > p._creationTime).length /
                clients) *
                100,
            )
          : 0,
      _renewals: renewals,
    } as any;
  },
});

/** Liste des professionnels et de leurs abonnements + historique de paiements. */
export const adminListSubscriptions = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const profiles = await ctx.db.query("technicianProfiles").collect();
    const payments = await ctx.db.query("subscriptionPayments").collect();
    const now = Date.now();
    return Promise.all(
      profiles.map(async (profile: any) => {
        const user = await ctx.db.get(profile.userId);
        const history = payments
          .filter((p: any) => p.techUserId === profile.userId)
          .sort((a: any, b: any) => b._creationTime - a._creationTime);
        const active =
          profile.subscriptionUntil && profile.subscriptionUntil > now;
        return {
          profile,
          user: user ? { name: displayName(user), phone: user.phone ?? null, email: user.email ?? null } : null,
          plan: profile.subscription ?? "aucun",
          priceFcfa: history.find((p: any) => p.status === "valide")?.amount ?? null,
          startsAt: history.find((p: any) => p.status === "valide")?.startsAt ?? null,
          until: profile.subscriptionUntil ?? null,
          statusLabel: !active ? "Expiré" : profile.subscriptionUntil! - now <= 7 * 86_400_000 ? "Expire bientôt" : "Actif",
          history: history as any[],
        };
      }),
    );
  },
});

/** Modification des tarifs d'abonnement (upsert du plan). */
export const adminUpdatePlanPrice = mutation({
  args: {
    plan: v.union(
      v.literal("mensuel"),
      v.literal("trimestriel"),
      v.literal("semestriel"),
      v.literal("annuel"),
    ),
    priceFcfa: v.number(),
    advantages: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx, "super_admin", "finance");
    if (args.priceFcfa <= 0) throw new Error("Prix invalide.");
    const existing = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_plan", (q: any) => q.eq("plan", args.plan))
      .collect();
    const months = SUBSCRIPTION_PRICES[args.plan]?.months ?? 1;
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, {
        priceFcfa: args.priceFcfa,
        months,
        ...(args.advantages ? { advantages: args.advantages } : {}),
      });
    } else {
      await ctx.db.insert("subscriptionPlans", {
        plan: args.plan,
        priceFcfa: args.priceFcfa,
        months,
        active: true,
        advantages: args.advantages ?? "Accès plateforme · demandes clients · profil vérifié",
      });
    }
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "subscriptionPlan.updated",
      targetTable: "subscriptionPlans",
      targetId: args.plan,
      newValue: `${args.priceFcfa} FCFA / ${months} mois`,
    });
    return { ok: true };
  },
});

/** Suspension ou réactivation manuelle d'un abonnement professionnel. */
export const adminSetSubscriptionStatus = mutation({
  args: {
    profileId: v.id("technicianProfiles"),
    action: v.union(v.literal("suspendre"), v.literal("reactiver")),
    note: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profil introuvable.");
    if (args.action === "suspendre") {
      await ctx.db.patch(profile._id, {
        subscription: "aucun",
        subscriptionUntil: Date.now(),
      });
    } else {
      await ctx.db.patch(profile._id, {
        subscription: "mensuel",
        subscriptionUntil: Date.now() + 30 * 86_400_000,
      });
    }
    await notify(ctx, profile.userId, {
      kind: "abonnement",
      title:
        args.action === "suspendre"
          ? "Abonnement suspendu"
          : "Abonnement réactivé",
      body: args.note ??
        (args.action === "suspendre"
          ? "Votre abonnement a été suspendu par l'administration GTEC PRO."
          : "Votre abonnement a été réactivé pour 30 jours."),
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: `subscription.${args.action}`,
      targetTable: "technicianProfiles",
      targetId: String(profile._id),
      detail: args.note ?? undefined,
    });
    return { ok: true };
  },
});

export const adminValidateCommission = mutation({
  args: { commissionId: v.id("gtecCommissions") },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission introuvable.");
    if (commission.status !== "due") throw new Error("Commission déjà traitée.");
    await ctx.db.patch(commission._id, {
      status: "payee",
      paidAt: Date.now(),
      validatedBy: admin._id,
    });
    await notify(ctx, commission.techUserId, {
      kind: "commission",
      title: "Commission encaissée",
      body: `${commission.amount.toLocaleString("fr-FR")} FCFA — merci.`,
      requestId: commission.requestId,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "commission.validated",
      targetTable: "gtecCommissions",
      targetId: String(commission._id),
    });
    return { ok: true };
  },
});

export const adminWaiveCommission = mutation({
  args: { commissionId: v.id("gtecCommissions") },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission introuvable.");
    if (commission.status !== "due") throw new Error("Commission déjà traitée.");
    await ctx.db.patch(commission._id, {
      status: "exoneree",
      validatedBy: admin._id,
    });
    await notify(ctx, commission.techUserId, {
      kind: "commission",
      title: "Commission exonérée",
      body: "GTEC a exonéré cette commission.",
      requestId: commission.requestId,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "commission.waived",
      targetTable: "gtecCommissions",
      targetId: String(commission._id),
    });
    return { ok: true };
  },
});

export const adminListDisputes = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("disputes").collect();
    rows.sort((a: any, b: any) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (dispute: any) => {
        const request = await ctx.db.get(dispute.requestId);
        return {
          dispute,
          request: request ? { reference: request.reference, title: request.title } : null,
        };
      }),
    );
  },
});

export const adminResolveDispute = mutation({
  args: {
    disputeId: v.id("disputes"),
    decision: v.union(
      v.literal("en_cours"),
      v.literal("resolue"),
      v.literal("rejetee"),
    ),
    decisionNote: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("Litige introuvable.");
    await ctx.db.patch(dispute._id, {
      status: args.decision,
      decision: args.decisionNote,
      resolvedById: admin._id,
      resolvedAt: Date.now(),
    });
    const request = await ctx.db.get(dispute.requestId);
    await notify(ctx, request?.clientId, {
      kind: "litige",
      title:
        args.decision === "resolue"
          ? "Litige résolu"
          : args.decision === "rejetee"
            ? "Litige rejeté"
            : "Litige en instruction",
      body: args.decisionNote,
      requestId: dispute.requestId,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "dispute." + args.decision,
      targetTable: "disputes",
      targetId: String(dispute._id),
      detail: args.decisionNote,
    });
    return { ok: true };
  },
});

export const adminListSanctions = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db.query("sanctions").collect();
    rows.sort((a: any, b: any) => b.issuedAt - a.issuedAt);
    return Promise.all(
      rows.map(async (sanction: any) => {
        const user = await ctx.db.get(sanction.userId);
        return { sanction, user: { name: displayName(user) } };
      }),
    );
  },
});

export const adminIssueSanction = mutation({
  args: {
    userId: v.id("users"),
    level: v.number(),
    reason: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    if (args.level < 1 || args.level > 5) throw new Error("Niveau de sanction : 1 à 5.");
    const until =
      args.level === 3 && args.days && args.days > 0
        ? Date.now() + args.days * 24 * 3600 * 1000
        : undefined;
    const id = await ctx.db.insert("sanctions", {
      userId: args.userId,
      level: args.level,
      reason: args.reason.trim(),
      status: "active",
      ...(until ? { until } : {}),
      issuedById: admin._id,
      issuedAt: Date.now(),
    });
    await notify(ctx, args.userId, {
      kind: "sanction",
      title: `Sanction niveau ${args.level}`,
      body: args.reason,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "sanction.issued",
      targetTable: "sanctions",
      targetId: String(id),
      detail: `Niveau ${args.level} — ${args.reason}`,
    });
    return id;
  },
});

export const adminLiftSanction = mutation({
  args: { sanctionId: v.id("sanctions") },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    const sanction = await ctx.db.get(args.sanctionId);
    if (!sanction) throw new Error("Sanction introuvable.");
    await ctx.db.patch(sanction._id, { status: "levee" });
    await notify(ctx, sanction.userId, {
      kind: "sanction",
      title: "Sanction levée",
      body: "Votre sanction a été levée par l'administration.",
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "sanction.lifted",
      targetTable: "sanctions",
      targetId: String(sanction._id),
    });
    return { ok: true };
  },
});

export const adminAuditLogs = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_at")
      .collect();
    rows.sort((a: any, b: any) => b.at - a.at);
    return rows.slice(0, 200);
  },
});

export const adminListAdmins = query({
  args: {},
  handler: async (ctx: any): Promise<any[]> => {
    await requireAdminScope(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u: any) => u.role === "admin")
      .map((u: any) => ({
        _id: u._id,
        name: displayName(u),
        email: u.email ?? null,
        adminRole: u.adminRole ?? "super_admin",
      }));
  },
});

export const adminSetAdminRole = mutation({
  args: {
    userId: v.id("users"),
    adminRole: v.union(...[
      "super_admin",
      "kyc",
      "finance",
      "missions",
      "support",
      "litiges",
      "moderation",
      "technique",
    ].map((r) => v.literal(r)) as any),
    makeAdmin: v.boolean(),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx, "super_admin");
    await ctx.db.patch(args.userId, {
      role: args.makeAdmin ? "admin" : "user",
      adminRole: args.adminRole,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: "admin",
      action: "admin.roleChanged",
      targetTable: "users",
      targetId: String(args.userId),
      newValue: `${args.makeAdmin ? "admin" : "user"} / ${args.adminRole}`,
    });
    return { ok: true };
  },
});

// =====================================================================
// SEMIS / CRÉATION DE TECHNICIENS (admin)
// =====================================================================

async function createTechnicianImpl(ctx: any, admin: any, name: string, specialty: string, phone?: string, email?: string) {
  const existing = await ctx.db.query("users").collect();
  const found = existing.find(
    (u: any) =>
      (email && u.email === email) ||
      (phone && u.phone === phone) ||
      (!email && !phone && u.name === name),
  );
  let userId = found?._id;
  if (!userId) {
    userId = await ctx.db.insert("users", {
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      role: "user",
      accountType: "technicien",
      isAnonymous: false,
    });
  }
  const profiles = await ctx.db
    .query("technicianProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  if (!profiles[0]) {
    await ctx.db.insert("technicianProfiles", {
      userId,
      firstName: name.split(" ")[0] ?? name,
      lastName: name.split(" ").slice(1).join(" ") || "GTEC",
      nationalId: "—",
      phone: phone ?? "—",
      city: "Yaoundé",
      specialty,
      experienceYears: 3,
      zones: ["Yaoundé"],
      documents: [],
      highestDegree: "—",
      status: "verifie",
      subscription: "mensuel",
      subscriptionUntil: Date.now() + 30 * 24 * 3600 * 1000,
      availability: "disponible",
    });
  }
  await auditLog(ctx, {
    actorId: admin._id,
    actorRole: "admin",
    action: "technician.created",
    targetTable: "users",
    targetId: String(userId),
    detail: name,
  });
  return userId;
}

export const adminCreateTechnician = mutation({
  args: {
    name: v.string(),
    specialty: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const admin = await requireAdminScope(ctx);
    if (!args.name.trim()) throw new Error("Nom requis.");
    return await createTechnicianImpl(ctx, admin, args.name.trim(), args.specialty.trim(), args.phone?.trim() || undefined);
  },
});

export const adminSeedTechnicians = mutation({
  args: {},
  handler: async (ctx: any) => {
    const admin = await requireAdminScope(ctx);
    const seeds = [
      { name: "Jean Kamga", specialty: "Électricité bâtiment", phone: "+237655000101" },
      { name: "Paul Nkoulou", specialty: "Plomberie sanitaire", phone: "+237655000102" },
      { name: "Marie Abena", specialty: "Froid & climatisation", phone: "+237655000103" },
      { name: "Eric Fotso", specialty: "Solaire photovoltaïque", phone: "+237655000104" },
      { name: "Serge Mbarga", specialty: "Électronique & alarmes", phone: "+237655000105" },
    ];
    const created: any[] = [];
    for (const s of seeds) {
      created.push(await createTechnicianImpl(ctx, admin, s.name, s.specialty, s.phone));
    }
    return { created: created.length };
  },
});

// Réexport de la fonction utilitaire pour usage interne éventuel.
export const _internalHelpers = { splitFiftyFifty, nextReference, latestBy };
export { internalMutation, internalQuery };
