import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { ADMIN_ROLES } from "./schema";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  COMMISSION_DEBT_DAYS,
  GTEC_COMMISSION_PERCENT,
  commissionFor,
  payoutFor,
  splitFiftyFifty,
  suggestTeam,
  toCmLocal,
  ADVANCE_PERCENT,
  BALANCE_PERCENT,
} from "../lib/gtec";
import {
  DEGREES,
  EXPERIENCE_BANDS,
  NOMENCLATURE,
  degreeByKey,
  nomenSpecialtyByCode,
} from "../lib/nomenclature";
import { interventionByCode } from "../lib/interventions";

/**
 * Normalise un numéro camerounais validé en E.164 (+237XXXXXXXX).
 * Lève une erreur explicite si le numéro n'est pas un mobile camerounais./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
function cmE164(raw: string): string {
  const local = toCmLocal(raw);
  if (!local) {
    throw new Error(
      "Numéro camerounais invalide. Format attendu : 6XX XX XX XX (MTN/Orange/Nexttel).",
    );
  }
  return `+237${local}`;
}

// ---------- helpers ----------

export async function requireUser(ctx: any): Promise<Doc<"users">> {
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

/**
 * GTEC PRO 2.0 (§3) : garde admin avec périmètre. Un Super Admin passe tous
 * les périmètres ; les autres comptes admin n'accèdent qu'à leur rôle :
 * kyc, finance, missions, support, litiges, moderation, technique.
 * Sans scope exigé, tout admin actif passe (fonctions transverses).
 */
export async function requireAdminScope(
  ctx: any,
  ...scopes: (typeof ADMIN_ROLES)[number][]
): Promise<Doc<"users">> {
  const admin = await requireAdmin(ctx);
  if (!scopes.length || admin.adminRole === "super_admin" || admin.adminRole === undefined) {
    return admin;
  }
  if (!scopes.includes(admin.adminRole as (typeof ADMIN_ROLES)[number])) {
    throw new Error(
      `Action réservée au périmètre : ${scopes.join(" / ")}. Votre rôle : ${admin.adminRole}.`,
    );
  }
  return admin;
}

/** Journal d'audit (§44) : trace une action sensible avec ancienne/nouvelle valeur. */
export async function auditLog(
  ctx: any,
  opts: {
    actorId?: Id<"users">;
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
    actorId: opts.actorId,
    actorRole: opts.actorRole,
    action: opts.action,
    targetTable: opts.targetTable,
    targetId: opts.targetId,
    oldValue: opts.oldValue,
    newValue: opts.newValue,
    detail: opts.detail,
    at: Date.now(),
  });
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
export async function notify(
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
  // V5 : met l'e-mail correspondant en file (envoyé par Resend si configuré).
  const notifUser = await ctx.db.get(userId);
  if (notifUser?.email) {
    await ctx.db.insert("emails", {
      userId,
      to: notifUser.email,
      kind,
      title,
      body,
      requestId,
    });
  }
}

/** Notifie tous les administrateurs (file de travail de la console). */
export async function notifyAdmins(
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

// ===================== V6 : KYC anti-fraude & doublons =====================

/**
 * Empreinte déterministe d'un document (djb2 sur début/milieu/fin du data
 * URL). Sert à détecter la réutilisation d'une même pièce d'identité ou d'un
 * même diplôme par plusieurs candidats — sans dépendre de node:crypto./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
function docFingerprint(url: string): string {
  const mid = Math.floor(url.length / 2);
  const parts = [
    url.slice(0, 4096),
    url.slice(mid, mid + 4096),
    url.slice(-4096),
  ];
  let h1 = 5381;
  let h2 = 52711;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      const c = part.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) | 0;
      h2 = ((h2 << 5) - h2 + c) | 0;
    }
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/** Normalise un numéro de CNI/passeport pour la comparaison anti-doublon. */
function normalizeNationalId(s: string): string {
  return s.replace(/[\s\-./]/g, "").toLowerCase();
}

// ---------- profils ----------

/**
 * Type d'espace choisi à l'inscription : "client" ou "technicien".
 * Irreversible côté client — l'admin peut toujours créer des comptes dédiés./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
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
      ...(args.phone?.trim() ? { phone: cmE164(args.phone) } : {}),
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
    if (args.phone?.trim() && !toCmLocal(args.phone)) {
      throw new Error(
        "Numéro camerounais invalide. Format attendu : 6XX XX XX XX (MTN/Orange/Nexttel).",
      );
    }
    await ctx.db.patch(user._id, {
      name: args.name,
      ...(args.phone?.trim() ? { phone: cmE164(args.phone) } : {}),
      city: args.city,
    });
  },
});

/**
 * Identité complète du client — prénom, nom, pièce d'identité, contacts,
 * adresse détaillée, type de client (particulier/entreprise) et photo de CNI./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
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
    if (!toCmLocal(args.phone)) {
      throw new Error(
        "Numéro camerounais invalide. Format attendu : 6XX XX XX XX (MTN/Orange/Nexttel).",
      );
    }
    if (!args.address.trim()) {
      throw new Error("Indiquez votre adresse.");
    }
    if (args.customerType === "entreprise" && !args.companyName?.trim()) {
      throw new Error("Indiquez la raison sociale de l'entreprise.");
    }
    if (args.idDocumentUrl && dataUrlsBytes([args.idDocumentUrl]) > 900 * 1024) {
      throw new Error(
        "Photo de la pi\u00e8ce d'identit\u00e9 trop volumineuse \u2014 elle est compress\u00e9e automatiquement, r\u00e9essayez.",
      );
    }
    await ctx.db.patch(user._id, {
      name: `${args.firstName.trim()} ${args.lastName.trim()}`.trim(),
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      nationalId: args.nationalId.trim(),
      gender: args.gender || undefined,
      birthDate: args.birthDate || undefined,
      phone: cmE164(args.phone),
      altPhone: args.altPhone?.trim() ? cmE164(args.altPhone) : undefined,
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
      phone: args.phone?.trim() ? cmE164(args.phone) : undefined,
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
      ["Jean-Baptiste Nkotto", "Chef d'équipe · Courant Fort CFO"],
      ["Aline Mbarga", "Électricité bâtiment CFO"],
      ["Serge Etoundi", "Solaire & énergie"],
      ["Marlyse Tchoumi", "Climatisation HVAC & froid"],
      ["Idrissou Bello", "Courant faible CFA · vidéosurveillance"],
      ["Patrick Nguini", "Bâtiment & infrastructures"],
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
    subcategory: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    address: v.string(),
    city: v.string(),
    photos: v.array(v.string()),
    /** GPS du chantier (position du client au moment de la demande). */
    coords: v.optional(
      v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
    ),
    /** NOMENCLATURE : spécialité professionnelle attendue (code ELEC-ELEC-IND…). */
    specialtyCode: v.optional(v.string()),
    /** Compétences techniques requises (sélectionnées par le client). */
    requiredSkills: v.optional(v.array(v.string())),
    /** CATALOGUE : intervention choisie (code unique CFO-INS-01…). */
    interventionCode: v.optional(v.string()),
    /** Niveau d'urgence : normale (défaut) | urgente | critique. */
    urgency: v.optional(
      v.union(v.literal("normale"), v.literal("urgente"), v.literal("critique")),
    ),
    /** Date souhaitée d'intervention (timestamp). */
    desiredDate: v.optional(v.number()),
    /** Budget indicatif (FCFA), facultatif. */
    budgetHint: v.optional(v.number()),
    /** Message vocal (data URL audio), facultatif — max ~600 Ko. */
    voiceNoteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Nomenclature : la spécialité attendue doit exister.
    if (args.specialtyCode && !nomenSpecialtyByCode(args.specialtyCode)) {
      throw new Error("Spécialité inconnue (nomenclature GTEC PRO).");
    }
    // Garde de taille : le champ `photos` (data URLs) est limité par Convex
    // (~1 Mio par valeur). Les images sont compressées côté navigateur —
    // cette garde n'attrape que les cas anormaux avec un message clair.
    const photosBytes = args.photos.reduce(
      (s, url) => s + Math.round(((url.length - (url.indexOf(",") + 1)) * 3) / 4),
      0,
    );
    if (photosBytes > 900 * 1024) {
      throw new Error(
        "Photos trop volumineuses pour la demande — réduisez leur nombre ou réessayez (elles sont compressées automatiquement).",
      );
    }
    const reference = await nextRef(ctx, "serviceRequests", "GTC");
    // CATALOGUE : résolution de l'intervention choisie (code → définition).
    const intervention = interventionByCode(args.interventionCode);
    if (args.interventionCode && !intervention) {
      throw new Error("Intervention inconnue (catalogue GTEC PRO).");
    }
    // Compétences = catalogue de l'intervention + sélection client (déduupliquées).
    const mergedSkills = [
      ...(intervention?.skills ?? []),
      ...(args.requiredSkills ?? []),
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s, i, a) => a.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);
    const mergedCerts = intervention?.certifications ?? [];
    const id = await ctx.db.insert("serviceRequests", {
      clientId: user._id,
      reference,
      serviceKey: args.serviceKey,
      subcategory: args.subcategory,
      title: args.title,
      description: args.description,
      address: args.address,
      city: args.city,
      photos: args.photos,
      ...(args.coords ? { coords: args.coords, coordsAt: Date.now() } : {}),
      specialtyCode: args.specialtyCode,
      interventionCode: intervention?.code,
      interventionLabel: intervention?.label,
      urgency: args.urgency ?? "normale",
      desiredDate: args.desiredDate,
      budgetHint: args.budgetHint !== undefined ? Math.max(0, args.budgetHint) : undefined,
      voiceNoteUrl: args.voiceNoteUrl,
      requiredSkills: mergedSkills.length ? mergedSkills : undefined,
      status: "nouvelle",
    });
    await addEvent(
      ctx,
      id,
      "demande",
      "Demande créée",
      `${args.serviceKey} · ${args.city}${args.coords ? " · position GPS enregistrée" : ""}`,
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
    // GÉO TERRAIN : positions GPS partagées du chef et des membres de l'équipe
    // (visibles par le client pendant le déplacement vers le chantier). On
    // renvoie la dernière position connue + l'horodatage + l'état du partage,
    // le client voyant ainsi la fraîcheur de la donnée.
    const teamLocations = assignment
      ? await Promise.all(
          [
            {
              id: assignment.teamLeaderId,
              name: teamLeader?.name ?? "Chef d'équipe",
              role: "Chef d'équipe",
            },
            ...assignment.members.map((m) => ({
              id: m.id,
              name: "Technicien",
              role: m.role,
            })),
          ].map(async (t) => {
            const p = (
              await ctx.db
                .query("technicianProfiles")
                .withIndex("by_user", (q) => q.eq("userId", t.id))
                .collect()
            )[0];
            if (!p?.lastLocation || !p.lastLocationAt) return null;
            return {
              userId: t.id,
              name: t.name,
              role: t.role,
              position: p.lastLocation,
              positionAt: p.lastLocationAt,
              sharing: p.locationSharing === true,
            };
          }),
        )
      : [];
    // V6 : toutes les tranches de paiement (avance 50 % + solde 50 %).
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", request._id))
      .collect();
    return {
      request,
      quote,
      payment,
      payments,
      assignment,
      teamLeader,
      members: members.filter(Boolean),
      teamLocations: teamLocations.filter(
        (t): t is NonNullable<(typeof teamLocations)[number]> => !!t,
      ),
      report,
      invoice,
      events,
    };
  },
});

// ---------- devis ----------

/**
 * V6 : le technicien établit le devis SUR LE TERRAIN après validation du
 * client. Dès qu'il l'envoie, GTEC le valide automatiquement (plus de
 * QuoteBuilder admin manuel) : le devis part immédiatement au client./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const submitFieldQuote = mutation({
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
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (!["nouvelle", "devis_emis"].includes(request.status)) {
      throw new Error("Un devis ne peut plus être émis à ce stade.");
    }
    if (args.items.length === 0) {
      throw new Error("Ajoutez au moins une ligne au devis.");
    }
    if (args.items.some((i) => !i.label.trim() || i.qty <= 0 || i.unitPrice < 0)) {
      throw new Error("Chaque ligne doit avoir un libellé, une quantité et un prix valides.");
    }
    // Auteur : technicien vérifié (visite terrain) ou administration.
    let authorRole: "technicien" | "admin" = "admin";
    if (user.role !== "admin") {
      const profile = (
        await ctx.db
          .query("technicianProfiles")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect()
      )[0];
      if (profile?.status !== "verifie") {
        throw new Error(
          "Seul un technicien vérifié par GTEC peut établir un devis terrain.",
        );
      }
      authorRole = "technicien";
    }
    const previous = await ctx.db
      .query("quotes")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    // GTEC PRO 2.0 (§18) : toute modification crée une NOUVELLE VERSION —
    // l'ancien devis est marqué remplacé (et expire), jamais écrasé.
    for (const q of previous) {
      if (q.status === "emis") await ctx.db.patch(q._id, { status: "expire" });
    }
    const { subtotal, vatRate, total } = quoteTotals(args.items);
    if (total <= 0) throw new Error("Le montant du devis doit être positif.");
    const number = await nextRef(ctx, "quotes", "DEV");
    const validUntil = Date.now() + (args.validDays ?? 7) * 24 * 3600 * 1000;
    const lastQuote = previous.slice(-1)[0];
    const version = (lastQuote?.version ?? 0) + 1;
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
      authorId: user._id,
      authorRole,
      // Validation automatique GTEC dès l'envoi du devis terrain.
      autoValidatedAt: Date.now(),
      version,
      ...(lastQuote ? { revisedFromId: lastQuote._id } : {}),
    });
    await ctx.db.patch(args.requestId, { status: "devis_emis" });
    await auditLog(ctx, {
      actorId: user._id,
      actorRole: authorRole === "admin" ? "admin" : "technicien",
      action: "quote.revised",
      targetTable: "quotes",
      targetId: args.requestId,
      oldValue: lastQuote ? `${lastQuote.number} V${lastQuote.version ?? 1} · ${lastQuote.total.toLocaleString("fr-FR")} FCFA` : undefined,
      newValue: `${number} V${version} · ${total.toLocaleString("fr-FR")} FCFA`,
    });
    await addEvent(
      ctx,
      args.requestId,
      "devis",
      version > 1
        ? `Devis ${number} — version ${version} émise (remplace ${lastQuote.number})`
        : `Devis ${number} émis sur le terrain`,
      `Total ${total.toLocaleString("fr-FR")} FCFA · validé automatiquement par GTEC`,
    );
    await notify(
      ctx,
      request.clientId,
      "devis",
      `Devis ${number} reçu`,
      `Votre technicien a établi le devis : ${total.toLocaleString("fr-FR")} FCFA. Acceptez-le, puis réglez l'avance de ${Math.round((total * 50) / 100).toLocaleString("fr-FR")} FCFA (50 %) pour lancer les travaux.`,
      args.requestId,
    );
    await notifyAdmins(
      ctx,
      "devis",
      `Devis ${number} émis par ${user.name ?? "un technicien"}`,
      `Devis terrain de ${total.toLocaleString("fr-FR")} FCFA validé automatiquement — en attente d'acceptation du client.`,
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
    if (quote.validUntil < Date.now()) {
      await ctx.db.patch(args.quoteId, { status: "expire" });
      throw new Error("Ce devis a expir\u00e9 \u2014 demandez une nouvelle proposition.");
    }
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
    if (quote.validUntil < Date.now()) {
      await ctx.db.patch(args.quoteId, { status: "expire" });
      throw new Error("Ce devis a expir\u00e9 \u2014 demandez une nouvelle proposition.");
    }
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

// ---------- helpers internes pour le paiement Mobile Money automatique ----------

/** Interne : devis accepté et payable, vérifié côté client (tranche 50/50). */
export const getAcceptedQuoteForPayment = internalQuery({
  args: {
    quoteId: v.id("quotes"),
    clientId: v.id("users"),
    /** V6 : tranche demandée — l'ordre avance → solde est imposé. */
    milestone: v.union(v.literal("avance"), v.literal("solde")),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) return null;
    if (quote.clientId !== args.clientId) return null;
    if (quote.status !== "accepte") return null;
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", quote.requestId))
      .collect();
    if (payments.some((p) => p.status === "en_attente")) return null;
    const advanceValidated = payments.some(
      (p) => p.milestone === "avance" && p.status === "valide",
    );
    // Ordre imposé : l'avance avant le solde ; chaque tranche une seule fois.
    if (args.milestone === "solde" && !advanceValidated) return null;
    if (
      payments.some(
        (p) => p.milestone === args.milestone && p.status === "valide",
      )
    ) {
      return null;
    }
    const { advance, balance } = splitFiftyFifty(quote.total);
    return {
      _id: quote._id,
      requestId: quote.requestId,
      total: quote.total,
      currency: quote.currency,
      advance,
      balance,
    };
  },
});

/** Interne : paiement en attente existant pour une demande. */
export const pendingPaymentForRequest = internalQuery({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    const pending = payments.find((p) => p.status === "en_attente");
    return pending ? { _id: pending._id } : null;
  },
});

/** Interne : crée le paiement GTEC en attente (déclenché par l'action MoMo). */
export const createPendingPayment = internalMutation({
  args: {
    quoteId: v.id("quotes"),
    clientId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    // 2.0 : la passerelle (CinetPay) couvre aussi la carte bancaire.
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("carte_visa"),
    ),
    payerPhone: v.string(),
    /** V6 : tranche payée — "avance" (50 % avant travaux) ou "solde". */
    milestone: v.union(v.literal("avance"), v.literal("solde")),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    const id = await ctx.db.insert("payments", {
      quoteId: args.quoteId,
      requestId: quote.requestId,
      clientId: args.clientId,
      amount: args.amount,
      currency: args.currency,
      method: args.method,
      payerPhone: args.payerPhone,
      status: "en_attente",
      externalRef: `MOMO-${Date.now().toString(36).toUpperCase()}`,
      milestone: args.milestone,
      percent: args.milestone === "avance" ? 50 : 50,
    });
    await addEvent(
      ctx,
      quote.requestId,
      "paiement",
      `${args.milestone === "avance" ? "Avance" : "Solde"} (50 %) Mobile Money initié`,
      "En attente de confirmation opérateur",
    );
    return id;
  },
});

/** Interne : charge un paiement par identifiant (pour l'action MoMo). */
export const getPaymentById = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    return (await ctx.db.get(args.paymentId)) ?? null;
  },
});

/** Interne : transaction MoMo liée à un paiement. */
export const txForPayment = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const txs = await ctx.db
      .query("momoTransactions")
      .withIndex("by_payment", (q) => q.eq("paymentId", args.paymentId))
      .collect();
    const tx = txs.slice(-1)[0];
    return tx ?? null;
  },
});

/** Interne : retrouve un paiement par sa référence marchande passerelle. */
export const paymentByExternalRef = internalQuery({
  args: { externalRef: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("externalRef"), args.externalRef))
      .collect();
    return all[0] ?? null;
  },
});

/** Interne : retrouve une transaction MoMo par sa référence opérateur. */
export const txByProviderRef = internalQuery({
  args: { providerRef: v.string() },
  handler: async (ctx, args) => {
    const tx = (
      await ctx.db
        .query("momoTransactions")
        .withIndex("by_provider_ref", (q) => q.eq("providerRef", args.providerRef))
        .collect()
    )[0];
    return tx ?? null;
  },
});

/**
 * V6 : paiement en 2 tranches — le client règle 50 % AVANT le début des
 * travaux puis 50 % à la fin. `milestone` vaut "avance" ou "solde"./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
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
    if (args.proofPhotoUrl && dataUrlsBytes([args.proofPhotoUrl]) > 900 * 1024) {
      throw new Error(
        "Photo du reçu trop volumineuse \u2014 elle est compress\u00e9e automatiquement, r\u00e9essayez.",
      );
    }
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", quote.requestId))
      .collect();
    if (existing.some((p) => p.status === "en_attente")) {
      throw new Error("Un paiement est déjà en cours de vérification.");
    }
    const advanceValidated = existing.some(
      (p) => p.milestone === "avance" && p.status === "valide",
    );
    // L'avance se paie quand la demande attend le paiement ; le solde quand
    // les travaux sont finis (rapport transmis). L'ordre est imposé.
    if (args.milestone === "avance" && advanceValidated) {
      throw new Error("L'avance de 50 % est déjà payée.");
    }
    if (args.milestone === "solde" && !advanceValidated) {
      throw new Error("Payez d'abord l'avance de 50 % avant travaux.");
    }
    if (existing.some((p) => p.milestone === args.milestone && p.status === "valide")) {
      throw new Error(
        args.milestone === "avance"
          ? "L'avance de 50 % est déjà payée."
          : "Le solde de 50 % est déjà payé.",
      );
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
    const { advance, balance } = splitFiftyFifty(quote.total);
    const amount = args.milestone === "avance" ? advance : balance;
    const percent = args.milestone === "avance" ? ADVANCE_PERCENT : BALANCE_PERCENT;
    await ctx.db.insert("payments", {
      quoteId: quote._id,
      requestId: quote.requestId,
      clientId: user._id,
      amount,
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
      milestone: args.milestone,
      percent,
    });
    const advanceDone = advanceValidated;
    await addEvent(
      ctx,
      quote.requestId,
      "paiement",
      `${args.milestone === "avance" ? "Avance" : "Solde"} (${percent} %) initié`,
      `${amount.toLocaleString("fr-FR")} FCFA · ${advanceDone ? "2ᵉ tranche" : "1ʳᵉ tranche sur 2"}`,
    );
  },
});

/**
 * Encaissement cash par un technicien : il enregistre la collecte avec preuve
 * photo. V6 : il collecte soit l'avance (50 % avant travaux), soit le solde
 * (50 % à la fin). Crée le paiement en attente de validation admin./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
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
    const advanceValidated = existing.some(
      (p) => p.milestone === "avance" && p.status === "valide",
    );
    if (existing.some((p) => p.milestone === "solde" && p.status === "valide")) {
      throw new Error("Le solde de 50 % est déjà payé.");
    }
    const { advance, balance } = splitFiftyFifty(quote.total);
    // La mission est en cours : le technicien encaisse l'avance si elle
    // manque (démarrage), sinon le solde de fin de travaux.
    const milestone = advanceValidated ? "solde" : "avance";
    const amount = milestone === "avance" ? advance : balance;
    await ctx.db.insert("payments", {
      quoteId: quote._id,
      requestId: args.requestId,
      clientId: request.clientId,
      amount,
      currency: quote.currency,
      method: "especes",
      payerPhone: args.payerPhone?.trim() || "—",
      status: "en_attente",
      externalRef: `CASH-${Date.now().toString(36).toUpperCase()}`,
      proofPhotoUrl: args.proofPhotoUrl,
      collectedBy: user._id,
      collectedAt: Date.now(),
      milestone,
      percent: milestone === "avance" ? ADVANCE_PERCENT : BALANCE_PERCENT,
    });
    await addEvent(
      ctx,
      args.requestId,
      "paiement",
      milestone === "avance"
        ? "Avance (50 %) encaissée en espèces"
        : "Solde (50 %) encaissé en espèces",
      "En attente de validation GTEC",
    );
  },
});

/**
 * V6 : applique la validation d'une tranche de paiement. Factorisé pour
 * l'admin, le webhook MoMo et le flux automatique — crée la commission GTEC
 * détaillée 85/15 uniquement sur l'avance (1ʳᵉ tranche encaissée)./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export async function settleMilestone(
  ctx: any,
  payment: Doc<"payments">,
  opts: { externalRef?: string; adminId?: Id<"users"> } = {},
) {
  const request = await ctx.db.get(payment.requestId);
  if (!request) return;
  const existing = await ctx.db
    .query("payments")
    .withIndex("by_request", (q: any) => q.eq("requestId", payment.requestId))
    .collect();
  const isAdvance = payment.milestone !== "solde"; // rétrocompat : 1ʳᵉ tranche
  await ctx.db.patch(payment._id, {
    status: "valide",
    paidAt: Date.now(),
    ...(opts.externalRef ? { externalRef: opts.externalRef } : {}),
  });

  if (isAdvance) {
    // 1ʳᵉ tranche encaissée : les travaux peuvent démarrer.
    await ctx.db.patch(payment.requestId, { status: "paye" });
    await addEvent(
      ctx,
      payment.requestId,
      "paiement",
      `Avance 50 % validée (${payment.amount.toLocaleString("fr-FR")} FCFA)`,
      "L'équipe va être affectée — travaux autorisés",
    );
    // ---- Répartition détaillée 90/10 (commission 2.0 §22 : 10 %)
    // §24 : pour un paiement EN ESPÈCES, le client a remis la totalité au
    // prestataire — GTEC ne peut pas prélever sur un wallet vide. La commission
    // devient une DETTE DE COMMISSION à régulariser sous un délai de 7 jours.
    const commissionAmount = commissionFor(payment.amount * 2);
    const teamAmount = payment.amount * 2 - commissionAmount;
    const isCash = payment.method === "especes";
    const existingCommissions = await ctx.db
      .query("gtecCommissions")
      .withIndex("by_request", (q: any) => q.eq("requestId", payment.requestId))
      .collect();
    if (!existingCommissions.some((c: any) => c.status !== "exoneree")) {
      await ctx.db.insert("gtecCommissions", {
        requestId: payment.requestId,
        quoteId: payment.quoteId,
        // Encaisseur cash, sinon valeur provisoire — réattribuée au chef
        // d'équipe lors de l'affectation de la mission.
        techUserId: payment.collectedBy ?? opts.adminId ?? request.clientId,
        baseAmount: payment.amount * 2,
        ratePercent: GTEC_COMMISSION_PERCENT,
        amount: commissionAmount,
        currency: payment.currency,
        status: "due",
        breakdown: { teamAmount, gtecAmount: commissionAmount },
        ...(isCash
          ? {
              commissionDebt: {
                deadlineAt: Date.now() + COMMISSION_DEBT_DAYS * 24 * 3600 * 1000,
              },
            }
          : {}),
      });
      await addEvent(
        ctx,
        payment.requestId,
        "paiement",
        `Répartition 90/10 : équipe ${teamAmount.toLocaleString("fr-FR")} FCFA · GTEC ${commissionAmount.toLocaleString("fr-FR")} FCFA (10 %)${isCash ? " · paiement en espèces = dette de commission à régulariser" : ""}`,
      );
      if (isCash) {
        await notifyAdmins(
          ctx,
          "paiement",
          "Dette de commission (paiement cash)",
          `Commission de ${commissionAmount.toLocaleString("fr-FR")} FCFA à régulariser par le prestataire sous ${COMMISSION_DEBT_DAYS} jours (paiement en espèces).`,
          payment.requestId,
        );
      }
    }
    await notify(
      ctx,
      payment.clientId,
      "paiement",
      "Avance confirmée",
      `Votre avance de 50 % (${payment.amount.toLocaleString("fr-FR")} FCFA) est validée. L'équipe va être affectée et les travaux vont démarrer.`,
      payment.requestId,
    );
  } else {
    // 2ᵉ tranche encaissée : le solde est complet (réception débloquée).
    await addEvent(
      ctx,
      payment.requestId,
      "paiement",
      `Solde 50 % validé (${payment.amount.toLocaleString("fr-FR")} FCFA)`,
      "Paiement complet — la réception peut être signée",
    );
    await notify(
      ctx,
      payment.clientId,
      "paiement",
      "Solde confirmé",
      `Votre solde de ${payment.amount.toLocaleString("fr-FR")} FCFA est validé. Vous pouvez réceptionner les travaux et signer le PV.`,
      payment.requestId,
    );
  }
}

export const adminValidatePayment = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") {
      throw new Error("Ce paiement a déjà été traité.");
    }
    const request = await ctx.db.get(payment.requestId);
    if (!request) throw new Error("Demande introuvable.");
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_request", (q) => q.eq("requestId", payment.requestId))
      .collect();
    const advanceValidated = existing.some(
      (p) => p.milestone === "avance" && p.status === "valide",
    );
    if (payment.milestone === "solde" && !advanceValidated) {
      throw new Error("L'avance doit être validée avant le solde.");
    }
    const wasPendingAdvance =
      payment.milestone !== "solde" &&
      ["devis_accepte", "paye"].includes(request.status);
    const wasPendingBalance =
      payment.milestone === "solde" &&
      ["en_intervention", "rapport_emis"].includes(request.status);
    if (!wasPendingAdvance && !wasPendingBalance) {
      throw new Error(
        "La demande n'est plus en attente de paiement (déjà payée ou annulée).",
      );
    }
    await settleMilestone(ctx, payment, { adminId: admin._id });
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
      throw new Error(
        "La demande doit avoir son avance de 50 % validée avant affectation.",
      );
    }
    const leader = await ctx.db.get(args.teamLeaderId);
    if (!leader || leader.role !== "member") {
      throw new Error("Choisissez un chef d'équipe.");
    }
    // V6 : toute intervention terrain compte AU MOINS 2 personnes.
    const uniqueMembers = args.memberIds.filter((m) => m !== args.teamLeaderId);
    if (uniqueMembers.length + 1 < 2) {
      throw new Error(
        "Équipe impossible : une intervention terrain exige au moins 2 personnes (chef d'équipe + 1 technicien).",
      );
    }
    const members = [
      { id: args.teamLeaderId, role: "Chef d'équipe" },
      ...uniqueMembers.map((id) => ({ id, role: "Technicien" })),
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
    // Positions GPS connues dans l'équipe (info logistique, non bloquant).
    const gpsKnown = await Promise.all(
      members.map(async (m) => {
        const p = (
          await ctx.db
            .query("technicianProfiles")
            .withIndex("by_user", (q) => q.eq("userId", m.id))
            .collect()
        )[0];
        return !!p?.lastLocation;
      }),
    );
    const gpsCount = gpsKnown.filter(Boolean).length;
    await addEvent(
      ctx,
      args.requestId,
      "affectation",
      `Équipe affectée · ${members.length} technicien(s) (min. 2 appliqué)`,
      `Intervention prévue le ${date}${gpsCount ? ` · ${gpsCount} position(s) GPS disponible(s)` : ""}`,
    );

    // La commission (créée au paiement de l'avance) passe au nom du chef
    // d'équipe — redevable de la part GTEC 15 % pour son équipe.
    const commission = (
      await ctx.db
        .query("gtecCommissions")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect()
    ).slice(-1)[0];
    if (commission && commission.status === "due") {
      await ctx.db.patch(commission._id, { techUserId: args.teamLeaderId });
      await notify(
        ctx,
        args.teamLeaderId,
        "general",
        "Commission GTEC 10 % à régler",
        `Vous êtes chef d'équipe. La part GTEC de la mission est de ${commission.amount.toLocaleString("fr-FR")} FCFA (10 % de ${commission.baseAmount.toLocaleString("fr-FR")} FCFA) — réglez-la depuis votre espace.`,
        args.requestId,
      );
    }

    await notify(
      ctx,
      request.clientId,
      "affectation",
      "Équipe affectée à votre demande",
      `${leader.name ?? "Un technicien"} et son équipe (${members.length} personnes) interviendront le ${date}.`,
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

/**
 * V6 : suggestion d'équipe serveur (moteur géo). Retourne leader + membres
 * (≥ 2 personnes) proches de la ville du chantier + le motif du choix./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const suggestTeamForRequest = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    // §12 : les techniciens indisponibles (hors ligne, congé, occupé,
    // en intervention, indisponible) ne sont jamais proposés.
    const AVAILABLE_STATUSES = [undefined, "disponible"];
    const members = (
      await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "member"))
        .collect()
    ).filter(async (t) => {
      const p = (
        await ctx.db
          .query("technicianProfiles")
          .withIndex("by_user", (q) => q.eq("userId", t._id))
          .collect()
      )[0];
      return AVAILABLE_STATUSES.includes(p?.availability as never);
    });
    const enriched = await Promise.all(
      members.map(async (t) => {
        const profile = (
          await ctx.db
            .query("technicianProfiles")
            .withIndex("by_user", (q) => q.eq("userId", t._id))
            .collect()
        )[0];
        const ratings = await ctx.db
          .query("reviews")
          .withIndex("by_tech", (q) => q.eq("techUserId", t._id))
          .collect();
        const avgRating = ratings.length
          ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
          : undefined;
        const missionCount = (
          await ctx.db
            .query("assignments")
            .filter((q) =>
              q.eq(q.field("teamLeaderId"), t._id),
            )
            .collect()
        ).length;
        return {
          id: t._id,
          name: t.name ?? "Technicien",
          city: t.city,
          zones: profile?.zones ?? (t.city ? [t.city] : []),
          specialty: t.city,
          experienceYears: profile?.experienceYears,
          rating: avgRating,
          missionCount,
          active: profile ? subscriptionActive(profile) : true,
          verified: profile?.status === "verifie" || !profile,
          availability: profile?.availability ?? "disponible",
          gps: profile?.lastLocation
            ? { lat: profile.lastLocation.lat, lon: profile.lastLocation.lon }
            : undefined,
          // NOMENCLATURE GTEC PRO : spécialité, métier, diplôme, compétences.
          specialtyCode: profile?.specialtyCode,
          job: profile?.jobTitle ?? profile?.profession,
          degreeKey: profile?.degreeKey,
          degreeLevel: profile?.degreeLevel,
          skills: profile?.skills,
          certifications: profile?.certifications,
          // RÉFÉRENTIEL §12/§13 : bonus si le diplôme est vérifié GTEC PRO.
          credentialVerified: profile?.credentialStatus === "verifie",
        };
      }),
    );
    return suggestTeam(
      request.serviceKey,
      request.city,
      enriched,
      2,
      request.coords ? { lat: request.coords.lat, lon: request.coords.lon } : undefined,
      {
        specialtyCode: request.specialtyCode,
        requiredSkills: request.requiredSkills,
      },
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

/**
 * Taille approximative d'un tableau de data URLs (octets binaires).
 * Utilisé par les gardes de taille serveur (limite Convex ~1 Mio/valeur)./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
function dataUrlsBytes(urls: string[]): number {
  return urls.reduce(
    (s, url) => s + Math.round(((url.length - (url.indexOf(",") + 1)) * 3) / 4),
    0,
  );
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
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (dataUrlsBytes([...args.beforePhotos, ...args.afterPhotos]) > 900 * 1024) {
      throw new Error(
        "Photos du rapport trop volumineuses — elles sont compressées automatiquement côté application, réessayez.",
      );
    }
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

// ---------- GPS technicien (V6) ----------

/**
 * Enregistre la position GPS du technicien connecté (bouton « Partager ma
 * position » ou suivi temps réel côté app). Aucune géolocalisation de fond :
 * le technicien garde la main sur l'activation et la désactivation./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const updateTechnicianLocation = mutation({
  args: {
    lat: v.optional(v.number()),
    lon: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    /** Active/désactive le partage temps réel. */
    sharing: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    if (!profile) {
      throw new Error(
        "Le partage GPS est disponible après l'envoi de votre dossier technicien.",
      );
    }
    // Garde-fous anti-aberration.
    if (
      (args.lat !== undefined && Math.abs(args.lat) > 90) ||
      (args.lon !== undefined && Math.abs(args.lon) > 180) ||
      (args.lat === 0 && args.lon === 0)
    ) {
      throw new Error("Coordonnées GPS invalides.");
    }
    const hasFix = args.lat !== undefined && args.lon !== undefined;
    await ctx.db.patch(profile._id, {
      ...(hasFix
        ? {
            lastLocation: {
              lat: args.lat!,
              lon: args.lon!,
              ...(args.accuracy !== undefined
                ? { accuracy: args.accuracy }
                : {}),
            },
            lastLocationAt: Date.now(),
          }
        : {}),
      ...(args.sharing !== undefined ? { locationSharing: args.sharing } : {}),
    });
    return { ok: true };
  },
});

/** Désactive le partage GPS (position conservée mais marquée ancienne). */
export const stopTechnicianLocationSharing = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    if (!profile) throw new Error("Profil technicien introuvable.");
    await ctx.db.patch(profile._id, { locationSharing: false });
    return { ok: true };
  },
});

/**
 * GÉO TERRAIN (§9) : confirmation d'arrivée de l'équipe sur le chantier,
 * horodatée et géolocalisée par l'appareil du technicien. Un seul signalement
 * suffit (idempotent) — le client/diaspora est notifié en temps réel et voit
 * le badge « Technicien arrivé » sur sa demande.
 */
export const markTeamArrival = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    lat: v.number(),
    lon: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    const assignment = (
      await ctx.db
        .query("assignments")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect()
    ).slice(-1)[0];
    if (!assignment) throw new Error("Aucune équipe affectée à cette demande.");
    const isTeamMember =
      user.role === "admin" ||
      assignment.teamLeaderId === user._id ||
      assignment.members.some((m) => m.id === user._id);
    if (!isTeamMember) {
      throw new Error("Seuls les techniciens affectés peuvent confirmer l'arrivée.");
    }
    if (request.status !== "affectee") {
      throw new Error(
        "L'arrivée se confirme seulement quand la mission est planifiée (statut « affectée »).",
      );
    }
    if (Math.abs(args.lat) > 90 || Math.abs(args.lon) > 180) {
      throw new Error("Coordonnées GPS invalides.");
    }
    if (request.teamArrivalAt) return { ok: true, already: true };
    const coords = {
      lat: args.lat,
      lon: args.lon,
      ...(args.accuracy !== undefined ? { accuracy: args.accuracy } : {}),
    };
    await ctx.db.patch(request._id, {
      teamArrivalAt: Date.now(),
      teamArrivalCoords: coords,
    });
    // Mémorise aussi la position comme dernière position connue du technicien.
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    if (profile) {
      await ctx.db.patch(profile._id, {
        lastLocation: coords,
        lastLocationAt: Date.now(),
      });
    }
    await addEvent(
      ctx,
      request._id,
      "intervention",
      "Équipe arrivée sur le chantier",
      `Position confirmée par GPS : ${args.lat.toFixed(5)}, ${args.lon.toFixed(5)}`,
    );
    await notify(
      ctx,
      request.clientId,
      "intervention",
      "Votre technicien est arrivé 📍",
      `L'équipe GTEC PRO est sur place pour ${request.reference}. L'intervention peut démarrer.`,
      request._id,
    );
    // Mode diaspora : prévenir aussi le bénéficiaire sur place (si compte lié
    // à son numéro) pour qu'il accueille l'équipe.
    if (request.isDiaspora && request.beneficiaryId) {
      const beneficiary = await ctx.db.get(request.beneficiaryId);
      if (beneficiary) {
        const beneficiaryUser = (
          await ctx.db
            .query("users")
            .withIndex("phone", (q) => q.eq("phone", beneficiary.phone))
            .collect()
        )[0];
        if (beneficiaryUser && beneficiaryUser._id !== request.clientId) {
          await ctx.db.insert("notifications", {
            userId: beneficiaryUser._id,
            kind: "diaspora",
            title: "L'équipe GTEC est arrivée 📍",
            body: `L'équipe envoyée par votre proche est arrivée pour ${request.reference}. Vous pouvez l'accueillir.`,
            requestId: request._id,
            at: Date.now(),
          });
        }
      }
    }
    return { ok: true, already: false };
  },
});

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
 * et documents justificatifs OBLIGATOIRES (CNI + diplôme/certificat)./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
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
    // RÉFÉRENTIEL MINESUP (§8) : établissement choisi dans la table, ou
    // demande de vérification si absent (§9) — jamais de création auto.
    institutionId: v.optional(v.id("higherEducationInstitutions")),
    institutionRequestId: v.optional(v.id("institutionVerificationRequests")),
    // NOMENCLATURE GTEC PRO (A→J)
    domainCode: v.optional(v.string()),
    specialtyCode: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    degreeKey: v.optional(v.string()),
    degreeLevel: v.optional(v.string()),
    certifications: v.optional(v.array(v.string())),
    experienceBand: v.optional(v.string()),
    district: v.optional(v.string()),
    radiusKm: v.optional(v.number()),
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
    if (!toCmLocal(args.phone)) {
      throw new Error(
        "Numéro camerounais invalide. Format attendu : 6XX XX XX XX (MTN/Orange/Nexttel).",
      );
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
    // RÉFÉRENTIEL : l'établissement doit exister et être actif (anti-fraude §17).
    let institution: Doc<"higherEducationInstitutions"> | null = null;
    if (args.institutionId) {
      institution = await ctx.db.get(args.institutionId);
      if (!institution || !institution.isActive) {
        throw new Error("Établissement introuvable ou inactif dans le référentiel.");
      }
    }
    if (args.institutionRequestId) {
      const req = await ctx.db.get(args.institutionRequestId);
      if (!req || req.userId !== user._id) {
        throw new Error("Demande de vérification d'établissement invalide.");
      }
    }
    // ===== NOMENCLATURE GTEC PRO : validation cohérente A→J =====
    if (args.specialtyCode) {
      const entry = nomenSpecialtyByCode(args.specialtyCode);
      if (!entry) {
        throw new Error("Spécialité professionnelle inconnue (nomenclature GTEC PRO).");
      }
      if (args.domainCode && args.domainCode !== entry.domain.code) {
        throw new Error(
          "Incohérence : le domaine ne correspond pas à la spécialité choisie.",
        );
      }
      if (
        args.jobTitle &&
        !entry.specialty.jobs.some(
          (j) => j.toLowerCase() === args.jobTitle?.toLowerCase(),
        )
      ) {
        throw new Error(
          "Le métier saisi ne figure pas dans les métiers de cette spécialité.",
        );
      }
    }
    if (args.degreeKey && !degreeByKey(args.degreeKey)) {
      throw new Error("Diplôme inconnu (nomenclature GTEC PRO).");
    }
    if (
      args.experienceBand &&
      !EXPERIENCE_BANDS.some((b) => b.key === args.experienceBand)
    ) {
      throw new Error("Palier d'expérience invalide.");
    }
    if (
      args.skills?.some(
        (s) => !s.trim() || s.length > 60,
      )
    ) {
      throw new Error("Compétences invalides (chaque compétence : 1 à 60 caractères).");
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

    // ===== V6 : contrôle KYC anti-fraude & doublons =====
    const nid = normalizeNationalId(args.nationalId);
    const allProfiles = await ctx.db.query("technicianProfiles").collect();
    // 1. Une même pièce d'identité ne peut pas créer plusieurs comptes.
    const idDup = allProfiles.find(
      (p) => normalizeNationalId(p.nationalId) === nid,
    );
    if (idDup) {
      await ctx.db.insert("technicianProfiles", {
        userId: user._id,
        firstName: args.firstName.trim(),
        lastName: args.lastName.trim(),
        nationalId: args.nationalId.trim(),
        gender: args.gender || undefined,
        birthDate: args.birthDate || undefined,
        phone: cmE164(args.phone),
        altPhone: args.altPhone?.trim() ? cmE164(args.altPhone) : undefined,
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
        status: "rejete",
        kycFlag: `pièce d'identité déjà utilisée par un autre compte (${idDup.firstName} ${idDup.lastName})`,
        kycDocHashes: args.documents.map((d) => docFingerprint(d.url)),
        subscription: "aucun",
      });
      throw new Error(
        "Cet numéro de CNI/passeport est déjà enregistré sur un autre compte technicien. La candidature a été rejetée pour doublon d'identité.",
      );
    }
    // 2. Un même téléphone ne peut pas servir pour deux dossiers.
    const phoneDup = allProfiles.find(
      (p) => p.phone.replace(/\D/g, "").slice(-9) === args.phone.replace(/\D/g, "").slice(-9),
    );
    if (phoneDup) {
      throw new Error(
        "Ce numéro de téléphone est déjà utilisé par un autre dossier technicien.",
      );
    }
    // 3. Une pièce (photo/PDF) déjà soumise par un autre dossier = fraude.
    const docHashes = args.documents.map((d) => docFingerprint(d.url));
    const otherHashes = new Map<string, string>();
    for (const p of allProfiles) {
      for (const h of p.kycDocHashes ?? []) {
        otherHashes.set(h, `${p.firstName} ${p.lastName}`);
      }
    }
    for (const d of args.documents) {
      if (!d.url) continue;
      const fp = docFingerprint(d.url);
      const owner = otherHashes.get(fp);
      if (owner) {
        throw new Error(
          `Le document « ${d.label} » est identique à celui d'un autre dossier (${owner}). Doublon détecté — vérifiez vos pièces.`,
        );
      }
    }

    await ctx.db.insert("technicianProfiles", {
      userId: user._id,
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      nationalId: args.nationalId.trim(),
      gender: args.gender || undefined,
      birthDate: args.birthDate || undefined,
      phone: cmE164(args.phone),
      altPhone: args.altPhone?.trim() ? cmE164(args.altPhone) : undefined,
      city: args.city.trim(),
      address: args.address?.trim() || undefined,
      specialty: args.specialty.trim(),
      profession: args.jobTitle?.trim() || args.profession?.trim() || undefined,
      experienceYears: Math.max(0, args.experienceYears),
      currentEmployer: args.currentEmployer?.trim() || undefined,
      references: args.references?.trim() || undefined,
      zones: args.zones,
      bio: args.bio?.trim() || undefined,
      highestDegree: args.degreeKey
        ? (degreeByKey(args.degreeKey)?.label ?? args.highestDegree.trim())
        : args.highestDegree.trim(),
      fieldOfStudy: args.fieldOfStudy?.trim() || undefined,
      school: institution?.name ?? args.school?.trim() ?? undefined,
      graduationYear: args.graduationYear || undefined,
      // RÉFÉRENTIEL MINESUP : établissement choisi + badge déclaré (§12)
      institutionId: args.institutionId,
      institutionRequestId: args.institutionRequestId,
      // Le diplôme est déposé avec documents → en attente d'instruction (§11).
      credentialStatus:
        institution?.name ?? args.school?.trim() ? "en_attente" : undefined,
      // NOMENCLATURE GTEC PRO (A→J)
      domainCode: args.domainCode || undefined,
      specialtyCode: args.specialtyCode || undefined,
      jobTitle: args.jobTitle?.trim() || undefined,
      skills: args.skills?.length ? args.skills.map((s) => s.trim()).filter(Boolean) : undefined,
      degreeKey: args.degreeKey || undefined,
      degreeLevel: args.degreeLevel?.trim() || degreeByKey(args.degreeKey ?? "")?.level || undefined,
      certifications: args.certifications?.length
        ? args.certifications.map((c) => c.trim()).filter(Boolean)
        : undefined,
      experienceBand: args.experienceBand || undefined,
      district: args.district?.trim() || undefined,
      radiusKm: args.radiusKm !== undefined ? Math.max(0, Math.min(300, args.radiusKm)) : undefined,
      documents: args.documents,
      status: "en_attente",
      subscription: "aucun",
      kycDocHashes: docHashes,
    });
    // Le nom du compte est mis à jour à partir de l'identité déclarée.
    await ctx.db.patch(user._id, {
      name: `${args.firstName.trim()} ${args.lastName.trim()}`.trim(),
      phone: cmE164(args.phone),
    });
    // RÉFÉRENTIEL §5/§10 : enregistre le diplôme déclaré (les documents de la
    // candidature servent de justificatifs — vérification admin séparée).
    if (institution?.name ?? args.school?.trim()) {
      const proofDoc = args.documents.find((d) =>
        ["diploma", "certificate", "attestation"].includes(d.kind),
      );
      await ctx.db.insert("educationalCredentials", {
        userId: user._id,
        institutionId: institution?._id,
        institutionName: institution?.name ?? args.school!.trim(),
        degreeKey: args.degreeKey || undefined,
        diplomaTitle: args.degreeKey
          ? (degreeByKey(args.degreeKey)?.label ?? args.highestDegree.trim())
          : args.highestDegree.trim(),
        fieldOfStudy: args.fieldOfStudy?.trim() || undefined,
        graduationYear: args.graduationYear || undefined,
        country: "Cameroun",
        institutionCity: institution?.city,
        documentUrl: proofDoc?.url,
        documentHash: proofDoc ? docFingerprint(proofDoc.url) : undefined,
        // Déclaré sur candidature, en attente de l'instruction §11.
        verificationStatus: "en_attente",
        equivalenceStatus: "NOT_REQUIRED",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

const SUBSCRIPTION_PRICES: Record<string, number> = {
  mensuel: 6000, // cahier des charges 2.0 §26
  trimestriel: 20000,
  annuel: 55000,
};

/**
 * Abonnement actif ? (non expiré). Un technicien sans abonnement actif
 * n'apparaît pas dans les suggestions d'affectation./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
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
 * moteur d'affectation — remplace la liste brute des "member"./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
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
          availability: profile?.availability ?? "disponible",
          gps: profile?.lastLocation
            ? { lat: profile.lastLocation.lat, lon: profile.lastLocation.lon }
            : undefined,
          gpsAt: profile?.lastLocationAt,
          sharing: profile?.locationSharing ?? false,
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
    if (profile.kycFlag) {
      throw new Error(
        `Dossier bloqué par le contrôle KYC : ${profile.kycFlag}. Refusez-le.`,
      );
    }
    if (args.decision === "verifie") {
      // Contrôle final anti-doublon (CNI, téléphone, documents).
      const nid = normalizeNationalId(profile.nationalId);
      const others = (await ctx.db.query("technicianProfiles").collect()).filter(
        (p: any) => p._id !== profile._id,
      );
      const idDup = others.find(
        (p: any) =>
          normalizeNationalId(p.nationalId) === nid && p.status !== "rejete",
      );
      if (idDup) {
        await ctx.db.patch(profile._id, {
          status: "rejete",
          kycFlag: `pièce d'identité déjà utilisée par ${idDup.firstName} ${idDup.lastName}`,
        });
        throw new Error(
          "Doublon d'identité détecté (même CNI sur un autre dossier) — candidature refusée automatiquement.",
        );
      }
      const phoneDup = others.find(
        (p: any) =>
          p.status !== "rejete" &&
          p.phone.replace(/\D/g, "").slice(-9) ===
            profile.phone.replace(/\D/g, "").slice(-9),
      );
      if (phoneDup) {
        throw new Error(
          "Ce numéro de téléphone existe déjà sur un autre dossier vérifié.",
        );
      }
      const myHashes = new Set(profile.kycDocHashes ?? []);
      for (const p of others) {
        if (p.status === "rejete") continue;
        for (const h of p.kycDocHashes ?? []) {
          if (myHashes.has(h)) {
            await ctx.db.patch(profile._id, {
              status: "rejete",
              kycFlag: `document déjà soumis par ${p.firstName} ${p.lastName}`,
            });
            throw new Error(
              `Document identique à celui de ${p.firstName} ${p.lastName} — candidature refusée automatiquement (fraude).`,
            );
          }
        }
      }
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

/**
 * V6 : demandes à chiffrer sur le terrain — le technicien vérifié établit le
 * devis après la visite. Statuts « nouvelle » ou « devis_emis » seulement./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const listQuoteableRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") {
      const profile = (
        await ctx.db
          .query("technicianProfiles")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect()
      )[0];
      if (profile?.status !== "verifie") return [];
    }
    const all = await ctx.db.query("serviceRequests").collect();
    const quoteable = all
      .filter((r) => ["nouvelle", "devis_emis"].includes(r.status))
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 30);
    return await Promise.all(
      quoteable.map(async (r) => {
        const client = await ctx.db.get(r.clientId);
        const quote = (
          await ctx.db
            .query("quotes")
            .withIndex("by_request", (q) => q.eq("requestId", r._id))
            .collect()
        ).slice(-1)[0];
        return { request: r, clientName: client?.name ?? "Client", existingQuote: quote };
      }),
    );
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
    if (dataUrlsBytes([...args.beforePhotos, ...args.afterPhotos]) > 900 * 1024) {
      throw new Error(
        "Photos du rapport trop volumineuses \u2014 elles sont compress\u00e9es automatiquement c\u00f4t\u00e9 application, r\u00e9essayez.",
      );
    }
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

/**
 * V6 : porte de réception — le PV ne peut être signé que si l'avance (50 %)
 * ET le solde (50 %) sont encaissés. Tolérance legacy : une demande payée en
 * une seule fois (avant le passage au 50/50) reste réceptionnable./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export async function assertReceptionPaymentsAllowed(
  ctx: any,
  requestId: Id<"serviceRequests">,
  quoteTotal: number,
) {
  const allPayments = await ctx.db
    .query("payments")
    .withIndex("by_request", (q: any) => q.eq("requestId", requestId))
    .collect();
  const validatedTotal = allPayments
    .filter((p: any) => p.status === "valide")
    .reduce((s: number, p: any) => s + p.amount, 0);
  const hasLegacyFullPayment = validatedTotal >= quoteTotal && quoteTotal > 0;
  const advanceValidated = allPayments.some(
    (p: any) => p.milestone === "avance" && p.status === "valide",
  );
  const balanceValidated = allPayments.some(
    (p: any) => p.milestone === "solde" && p.status === "valide",
  );
  if (!advanceValidated && !hasLegacyFullPayment) {
    throw new Error("L'avance de 50 % doit être payée avant la réception.");
  }
  if (!balanceValidated && !hasLegacyFullPayment) {
    throw new Error(
      "Réglez d'abord le solde de 50 % (fin des travaux) pour signer le PV.",
    );
  }
}

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
    // V6 : porte de réception — avance ET solde doivent être encaissés.
    await assertReceptionPaymentsAllowed(ctx, args.requestId, quote?.total ?? 0);
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
    // §10 : la clôture financière exige la régularisation de la commission
    // GTEC, sauf exonération administrative. Si due, les rémunérations sont
    // créées mais restent bloquées au statut "dû" jusqu'à régularisation.
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
        const commission = (
          await ctx.db
            .query("gtecCommissions")
            .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
            .collect()
        ).slice(-1)[0];
        if (commission && commission.status === "due") {
          await addEvent(
            ctx,
            args.requestId,
            "reception",
            `Commission GTEC due (${commission.amount.toLocaleString("fr-FR")} FCFA) — paiements équipe bloqués jusqu'à régularisation`,
          );
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

// ===================== Commission GTEC 10 % (§22 cahier des charges 2.0) =====================

/**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const adminListCommissions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("gtecCommissions").collect();
    const sorted = [...all].sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(
      sorted.map(async (c) => {
        const request = await ctx.db.get(c.requestId);
        const tech = await ctx.db.get(c.techUserId);
        return { commission: c, request, tech };
      }),
    );
  },
});

/** Statistiques commissions pour le tableau de bord admin. */
export const adminCommissionStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("gtecCommissions").collect();
    const due = all.filter((c) => c.status === "due");
    const paid = all.filter((c) => c.status === "payee");
    return {
      dueCount: due.length,
      dueTotal: due.reduce((s, c) => s + c.amount, 0),
      paidTotal: paid.reduce((s, c) => s + c.amount, 0),
    };
  },
});

/**
 * Commissions du technicien connecté : dues, payées, solde à régulariser.
 * Un solde non nul peut suspendre l'accès aux nouvelles missions./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const myCommissions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db
      .query("gtecCommissions")
      .withIndex("by_tech", (q) => q.eq("techUserId", user._id))
      .collect();
    const due = all.filter((c) => c.status === "due");
    const paid = all.filter((c) => c.status === "payee");
    // §24 : état de la dette de commission la plus urgente (bandeau UI).
    const nextDeadline = due
      .map((c) => c.commissionDebt?.deadlineAt)
      .filter((d): d is number => !!d)
      .sort((a, b) => a - b)[0];
    return {
      items: all.sort((a, b) => b._creationTime - a._creationTime),
      dueTotal: due.reduce((s, c) => s + c.amount, 0),
      dueCount: due.length,
      paidTotal: paid.reduce((s, c) => s + c.amount, 0),
      debtDeadline: nextDeadline,
      debtOverdue: nextDeadline !== undefined && nextDeadline < Date.now(),
    };
  },
});

/**
 * Déclaration de paiement d'une commission par le technicien : Mobile Money
 * vers les numéros officiels GTEC, ou virement. En attente de validation./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
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
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission introuvable.");
    if (commission.techUserId !== user._id) {
      throw new Error("Seul le technicien redevable peut régler cette commission.");
    }
    if (commission.status !== "due") {
      throw new Error("Cette commission est déjà réglée ou annulée.");
    }
    if (!args.payerPhone.trim()) {
      throw new Error("Indiquez le numéro payeur.");
    }
    // §24 : la dette de commission n'est soldée qu'après vérification GTEC —
    // le statut reste "due", le règlement déclaré est conservé pour audit.
    await ctx.db.patch(args.commissionId, {
      method: args.method,
      payerPhone: args.payerPhone.trim(),
      externalRef:
        args.externalRef?.trim() ||
        `COM-${Date.now().toString(36).toUpperCase()}`,
      paidAt: Date.now(),
    });
    await addEvent(
      ctx,
      commission.requestId,
      "paiement",
      `Règlement de commission déclaré (${commission.amount.toLocaleString("fr-FR")} FCFA)`,
      "En attente de validation GTEC",
    );
    await notify(
      ctx,
      user._id,
      "general",
      "Commission déclarée",
      `Règlement de ${commission.amount.toLocaleString("fr-FR")} FCFA déclaré — en attente de validation GTEC.`,
      commission.requestId,
    );
    await notifyAdmins(
      ctx,
      "paiement",
      "Commission déclarée — à valider",
      `${user.name ?? "Un technicien"} déclare avoir réglé ${commission.amount.toLocaleString("fr-FR")} FCFA (${args.method}).`,
      commission.requestId,
    );
  },
});

/** Validation par l'administration du règlement d'une commission (§24). */
export const adminValidateCommission = mutation({
  args: { commissionId: v.id("gtecCommissions") },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "finance", "super_admin");
    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission introuvable.");
    if (commission.status !== "due") {
      throw new Error("Cette commission n'est plus en attente.");
    }
    await ctx.db.patch(args.commissionId, {
      status: "payee",
      paidAt: commission.paidAt ?? Date.now(),
      validatedBy: admin._id,
    });
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: `admin:${admin.adminRole ?? "super_admin"}`,
      action: "commission.validated",
      targetTable: "gtecCommissions",
      targetId: args.commissionId,
      oldValue: "due",
      newValue: "payee",
      detail: `${commission.amount.toLocaleString("fr-FR")} FCFA régularisés (dette de commission soldée).`,
    });
    await notify(
      ctx,
      commission.techUserId,
      "general",
      "Commission validée",
      `${commission.amount.toLocaleString("fr-FR")} FCFA régularisés. Votre compte est à nouveau entièrement opérationnel.`,
      commission.requestId,
    );
  },
});

/**
 * Exonération administrative (autorisation spéciale GTEC — §10 : toute
 * dérogation est tracée et validée par l'administration)./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const adminWaiveCommission = mutation({
  args: { commissionId: v.id("gtecCommissions") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const commission = await ctx.db.get(args.commissionId);
    if (!commission) throw new Error("Commission introuvable.");
    if (commission.status !== "due") {
      throw new Error("Cette commission n'est plus en attente.");
    }
    await ctx.db.patch(args.commissionId, {
      status: "exoneree",
      validatedBy: admin._id,
    });
    await notify(
      ctx,
      commission.techUserId,
      "general",
      "Commission annulée",
      "La commission de cette mission a été annulée par l'administration.",
      commission.requestId,
    );
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
 * du nom du client, la note et le commentaire./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
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

/** Tous les paiements (export comptable admin). */
export const adminListAllPayments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const payments = await ctx.db.query("payments").order("desc").collect();
    const out: {
      payment: Doc<"payments">;
      request: Doc<"serviceRequests"> | null;
      client: Doc<"users"> | null;
    }[] = [];
    for (const p of payments) {
      const request = await ctx.db.get(p.requestId);
      const client = await ctx.db.get(p.clientId);
      out.push({ payment: p, request, client });
    }
    return out;
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

// ===================== V6 : mensualités des contrats =====================

/** Échéancier + paiements de mensualités des contrats du client connecté. */
export const listMyContractPayments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const contracts = await ctx.db
      .query("maintenanceContracts")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const out = [];
    for (const contract of contracts) {
      const pays = await ctx.db
        .query("contractPayments")
        .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
        .collect();
      out.push({
        contractId: contract._id,
        reference: contract.reference,
        monthlyAmount: contract.monthlyAmount,
        payments: pays.sort((a, b) => a.periodIndex - b.periodIndex),
      });
    }
    return out;
  },
});

/** Le client déclare le paiement d'une mensualité (prochaine échéance due). */
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
    bankName: v.optional(v.string()),
    bankRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!/^[+0-9 ]{8,}$/.test(args.payerPhone.trim())) {
      throw new Error("Numéro de téléphone invalide.");
    }
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientId !== user._id)
      throw new Error("Action non autorisée.");
    if (contract.status !== "actif")
      throw new Error("Le contrat doit être actif pour régler une mensualité.");
    if (args.proofPhotoUrl && dataUrlsBytes([args.proofPhotoUrl]) > 900 * 1024) {
      throw new Error(
        "Photo du reçu trop volumineuse \u2014 elle est compress\u00e9e automatiquement, r\u00e9essayez.",
      );
    }
    const previous = await ctx.db
      .query("contractPayments")
      .withIndex("by_contract", (q) => q.eq("contractId", contract._id))
      .collect();
    if (previous.some((p) => p.status === "en_attente"))
      throw new Error(
        "Une mensualité est déjà en attente de vérification par GTEC.",
      );
    const nextIndex =
      previous.filter((p) => p.status === "valide").length + 1;
    const monthMs = 30 * 24 * 3600 * 1000;
    const periodStart = contract.startDate + (nextIndex - 1) * monthMs;
    if (periodStart >= contract.endDate)
      throw new Error("Toutes les mensualités de ce contrat sont déjà réglées.");
    const id = await ctx.db.insert("contractPayments", {
      contractId: contract._id,
      clientId: user._id,
      periodIndex: nextIndex,
      periodStart,
      periodEnd: Math.min(periodStart + monthMs, contract.endDate),
      amount: contract.monthlyAmount,
      currency: "FCFA",
      method: args.method,
      payerPhone: args.payerPhone.trim(),
      proofPhotoUrl: args.proofPhotoUrl,
      bankName: args.bankName,
      bankRef: args.bankRef,
      status: "en_attente",
    });
    await notifyAdmins(
      ctx,
      "paiement",
      `Mensualité ${contract.reference} — échéance ${nextIndex}`,
      `${user.name ?? "Le client"} a payé la mensualité ${nextIndex} (${contract.monthlyAmount.toLocaleString("fr-FR")} FCFA) — à vérifier.`,
    );
    return id;
  },
});

/** Admin : valide ou rejette une mensualité en attente. */
export const adminValidateContractPayment = mutation({
  args: {
    paymentId: v.id("contractPayments"),
    decision: v.union(v.literal("valide"), v.literal("echoue")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const p = await ctx.db.get(args.paymentId);
    if (!p) throw new Error("Paiement introuvable.");
    if (p.status !== "en_attente")
      throw new Error("Ce paiement a déjà été traité.");
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
    }
  },
});

/** Admin : toutes les mensualités (en attente + réglées), contrat et client joints. */
export const adminListContractPayments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("contractPayments")
      .order("desc")
      .collect();
    const out: {
      payment: Doc<"contractPayments">;
      contract: Doc<"maintenanceContracts"> | null;
      client: Doc<"users"> | null;
    }[] = [];
    for (const p of rows) {
      const contract = await ctx.db.get(p.contractId);
      const client = await ctx.db.get(p.clientId);
      out.push({ payment: p, contract, client });
    }
    return out;
  },
});

/** Admin : liste des mensualités en attente de vérification. */
export const adminPendingContractPayments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("contractPayments")
      .withIndex("by_status", (q) => q.eq("status", "en_attente"))
      .collect();
    const out = [];
    for (const p of rows) {
      const contract = await ctx.db.get(p.contractId);
      const client = await ctx.db.get(p.clientId);
      out.push({ payment: p, contract, client });
    }
    return out;
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

// ===================== V6 : retraits (techniciens & administration) =====================

/** Référence suivante pour les retraits (RET-0001). */
async function nextWithdrawalRef(ctx: any): Promise<string> {
  const all = await ctx.db.query("withdrawals").collect();
  return `RET-${pad(all.length + 1)}`;
}

/**
 * Solde retirable d'un utilisateur.
 *  - technicien : rémunérations "payé" − retraits
 *  - admin : commissions GTEC "payée" (15 % encaissées) − retraits/**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const myWallet = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const isAdmin = user.role === "admin";
    const wallet = await myWalletInternal(ctx, user._id, isAdmin);
    const withdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    return {
      sourceRole: isAdmin ? ("admin" as const) : ("technicien" as const),
      earned: wallet.earned,
      withdrawn: wallet.withdrawn,
      pending: wallet.pending,
      available: wallet.available,
      history: withdrawals.sort((a: any, b: any) => b.requestedAt - a.requestedAt),
    };
  },
});

/** Liste de tous les retraits (console admin). */
export const adminListWithdrawals = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db
      .query("withdrawals")
      .filter((q: any) => q.neq(q.field("status"), "payee"))
      .collect();
    const sorted = [...all].sort((a: any, b: any) => b.requestedAt - a.requestedAt);
    const out: {
      withdrawal: Doc<"withdrawals">;
      user: Doc<"users"> | null;
    }[] = [];
    for (const w of sorted) {
      const user = await ctx.db.get(w.userId as Id<"users">);
      out.push({ withdrawal: w as Doc<"withdrawals">, user });
    }
    return out;
  },
});

/**
 * Demande de retrait — disponible pour les techniciens (sur leurs gains) ET
 * pour l'administration (sur les commissions GTEC encaissées)./**
 * À l'affectation d'une équipe, la commission générée au paiement est
 * réattribuée au chef d'équipe (redevable de la régularisation pour sa team).
 */
export const requestWithdrawal = mutation({
  args: {
    sourceRole: v.optional(v.union(v.literal("technicien"), v.literal("admin"))),
    amount: v.number(),
    method: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("virement"),
      v.literal("especes"),
    ),
    destination: v.string(),
    destinationLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const isAdmin = user.role === "admin";
    const sourceRole = args.sourceRole ?? (isAdmin ? "admin" : "technicien");
    if (isAdmin && args.sourceRole === "technicien") {
      throw new Error("Un compte administrateur retire les commissions GTEC, pas des gains techniciens.");
    }
    if (!isAdmin && sourceRole === "admin") {
      throw new Error("Seule l'administration peut retirer les commissions GTEC.");
    }
    if (args.amount < 1000) {
      throw new Error("Montant minimum de retrait : 1 000 FCFA.");
    }
    if (!args.destination.trim()) {
      throw new Error(
        sourceRole === "admin"
          ? "Indiquez le compte de réception des commissions (MoMo ou IBAN)."
          : "Indiquez le numéro MoMo ou l'IBAN de réception.",
      );
    }
    const wallet = await myWalletInternal(ctx, user._id, isAdmin);
    if (args.amount > wallet.available) {
      throw new Error(
        `Solde insuffisant : disponible ${wallet.available.toLocaleString("fr-FR")} FCFA.`,
      );
    }
    // §24 : retraits bloqués tant qu'une dette de commission est ouverte.
    if (!isAdmin) {
      const openDebt = (
        await ctx.db
          .query("gtecCommissions")
          .withIndex("by_tech", (q: any) =>
            q.eq("techUserId", user._id).eq("status", "due"),
          )
          .collect()
      ).reduce((s: number, c: any) => s + c.amount, 0);
      if (openDebt > 0) {
        throw new Error(
          `Retrait bloqué : dette de commission à régulariser (${openDebt.toLocaleString("fr-FR")} FCFA). Réglez votre commission GTEC depuis votre espace.`,
        );
      }
    }
    const reference = await nextWithdrawalRef(ctx);
    const id = await ctx.db.insert("withdrawals", {
      userId: user._id,
      sourceRole,
      amount: Math.round(args.amount),
      currency: "FCFA",
      method: args.method,
      destination: args.destination.trim(),
      destinationLabel: args.destinationLabel?.trim() || undefined,
      status: "demande",
      requestedAt: Date.now(),
      reference,
    });
    await notifyAdmins(
      ctx,
      "general",
      `Demande de retrait ${reference}`,
      sourceRole === "admin"
        ? `L'administration demande le retrait de ${args.amount.toLocaleString("fr-FR")} FCFA de commissions.`
        : `${user.name ?? "Un technicien"} demande un retrait de ${args.amount.toLocaleString("fr-FR")} FCFA.`,
    );
    return id;
  },
});

/** Solde interne (helper partagé par myWallet et requestWithdrawal). */
async function myWalletInternal(ctx: any, userId: Id<"users">, isAdmin: boolean) {
  let earned = 0;
  if (isAdmin) {
    const commissions = await ctx.db
      .query("gtecCommissions")
      .filter((q: any) => q.eq(q.field("status"), "payee"))
      .collect();
    earned = commissions.reduce((s: number, c: any) => s + c.amount, 0);
  } else {
    const payouts = await ctx.db.query("payouts").collect();
    earned = payouts
      .filter((p: any) => p.techUserId === userId && p.status === "payé")
      .reduce((s: number, p: any) => s + p.amount, 0);
  }
  const withdrawals = await ctx.db
    .query("withdrawals")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  const withdrawn = withdrawals
    .filter((w: any) => w.status === "payee")
    .reduce((s: number, w: any) => s + w.amount, 0);
  const pending = withdrawals
    .filter((w: any) => w.status === "demande" || w.status === "approuve")
    .reduce((s: number, w: any) => s + w.amount, 0);
  return { earned, withdrawn, pending, available: Math.max(0, earned - withdrawn - pending) };
}

/** Traitement d'une demande de retrait par l'administration. */
export const adminProcessWithdrawal = mutation({
  args: {
    withdrawalId: v.id("withdrawals"),
    decision: v.union(v.literal("approuve"), v.literal("payee"), v.literal("refuse")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const w = await ctx.db.get(args.withdrawalId);
    if (!w) throw new Error("Retrait introuvable.");
    if (w.status === "payee" || w.status === "refuse") {
      throw new Error("Ce retrait est déjà clôturé.");
    }
    if (args.decision === "refuse") {
      await ctx.db.patch(args.withdrawalId, {
        status: "refuse",
        processedAt: Date.now(),
        processedBy: admin._id,
        note: args.note,
      });
      await notify(
        ctx,
        w.userId,
        "general",
        `Retrait ${w.reference} refusé`,
        args.note ?? "Votre demande de retrait n'a pas été approuvée.",
      );
      return;
    }
    if (args.decision === "approuve" && w.status !== "demande") {
      throw new Error("Seule une demande peut être approuvée.");
    }
    if (args.decision === "payee") {
      await ctx.db.patch(args.withdrawalId, {
        status: "payee",
        processedAt: Date.now(),
        processedBy: admin._id,
        note: args.note,
      });
      await notify(
        ctx,
        w.userId,
        "general",
        `Retrait ${w.reference} payé`,
        `${w.amount.toLocaleString("fr-FR")} FCFA ont été transférés vers ${w.destination}.`,
      );
      return;
    }
    await ctx.db.patch(args.withdrawalId, {
      status: "approuve",
      processedAt: Date.now(),
      processedBy: admin._id,
      note: args.note,
    });
    await notify(
      ctx,
      w.userId,
      "general",
      `Retrait ${w.reference} approuvé`,
      "Votre demande est validée — le transfert sera effectué par l'administration.",
    );
  },
});

// ========================================================================
// GTEC PRO 2.0 — litiges (§36), sanctions (§37), audit (§44),
// disponibilité (§12), score prestataire (§38), rôles admin (§3)
// ========================================================================

// ------------------------ Litiges (§36) ------------------------

const DISPUTE_CATEGORY_LABELS: Record<string, string> = {
  travaux_non_conformes: "Travaux non conformes",
  retard: "Retard",
  paiement: "Paiement",
  comportement: "Comportement",
  materiel: "Matériel",
  devis: "Devis",
  contrat: "Contrat",
  autre: "Autre",
};

/** Litiges visibles par l'utilisateur connecté sur une mission donnée. */
export const listRequestDisputes = query({
  args: { requestId: v.id("serviceRequests") },
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
    const isTeamMember = assignment?.members.some((m) => m.id === user._id);
    if (request.clientId !== user._id && user.role !== "admin" && !isTeamMember) {
      throw new Error("Action non autorisée.");
    }
    const disputes = await ctx.db
      .query("disputes")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    return await Promise.all(
      disputes.sort((a, b) => b._creationTime - a._creationTime).map(async (d) => {
        const openedBy = await ctx.db.get(d.openedById);
        const resolver = d.resolvedById ? await ctx.db.get(d.resolvedById) : null;
        return {
          dispute: d,
          openedByName: openedBy?.name ?? "Utilisateur",
          resolvedByName: resolver?.name,
        };
      }),
    );
  },
});

/** File admin de tous les litiges (console). */
export const adminListDisputes = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminScope(ctx, "litiges", "support", "super_admin");
    const disputes = await ctx.db.query("disputes").order("desc").collect();
    return await Promise.all(
      disputes.map(async (d) => {
        const request = await ctx.db.get(d.requestId);
        const openedBy = await ctx.db.get(d.openedById);
        return { dispute: d, request, openedByName: openedBy?.name ?? "Utilisateur" };
      }),
    );
  },
});

/**
 * Ouvre un litige sur une mission (client ou technicien de l'équipe) —
 * toujours motivé, tracé et notifié à l'administration.
 */
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
    attachments: v.optional(v.array(v.string())),
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
    const isTeamMember = assignment?.members.some((m) => m.id === user._id);
    if (request.clientId !== user._id && !isTeamMember) {
      throw new Error("Seuls le client et les techniciens de la mission peuvent signaler un problème.");
    }
    if (args.description.trim().length < 10) {
      throw new Error("Décrivez le problème (10 caractères minimum).");
    }
    if (args.attachments && dataUrlsBytes(args.attachments) > 900 * 1024) {
      throw new Error("Pièces jointes trop volumineuses — elles sont compressées automatiquement, réessayez.");
    }
    const open = await ctx.db
      .query("disputes")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    if (open.some((d) => d.status === "ouverte" || d.status === "en_cours")) {
      throw new Error("Un litige est déjà ouvert sur cette mission.");
    }
    const id = await ctx.db.insert("disputes", {
      requestId: args.requestId,
      openedById: user._id,
      category: args.category,
      description: args.description.trim(),
      attachments: args.attachments,
      status: "ouverte",
    });
    await auditLog(ctx, {
      actorId: user._id,
      actorRole: user.role === "member" ? "technicien" : "client",
      action: "dispute.opened",
      targetTable: "disputes",
      targetId: id,
      newValue: DISPUTE_CATEGORY_LABELS[args.category] ?? args.category,
      detail: `Mission ${request.reference} · ${args.description.trim().slice(0, 80)}`,
    });
    await addEvent(ctx, args.requestId, "litige", `Problème signalé (${DISPUTE_CATEGORY_LABELS[args.category] ?? args.category})`);
    await notifyAdmins(
      ctx,
      "litige",
      "Nouveau litige signalé",
      `${user.name ?? "Un utilisateur"} signale : ${DISPUTE_CATEGORY_LABELS[args.category] ?? args.category} — ${request.reference}.`,
      args.requestId,
    );
    if (request.clientId !== user._id) {
      await notify(
        ctx,
        request.clientId,
        "litige",
        "Un problème a été signalé",
        `${user.name ?? "Votre équipe"} a signalé un problème sur la mission ${request.reference}. L'administration GTEC va instruire le dossier.`,
        args.requestId,
      );
    } else if (assignment) {
      await notify(
        ctx,
        assignment.teamLeaderId,
        "litige",
        "Un problème a été signalé",
        `Le client a signalé un problème sur la mission ${request.reference}. L'administration GTEC va instruire le dossier.`,
        args.requestId,
      );
    }
    return id;
  },
});

/** Décision admin documentée sur un litige (instruction → résolution/rejet). */
export const adminResolveDispute = mutation({
  args: {
    disputeId: v.id("disputes"),
    decision: v.union(v.literal("resolue"), v.literal("rejetee"), v.literal("en_cours")),
    decisionNote: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "litiges", "support", "super_admin");
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("Litige introuvable.");
    if (dispute.status === "resolue" || dispute.status === "rejetee") {
      throw new Error("Ce litige est déjà clôturé.");
    }
    if (args.decisionNote.trim().length < 10) {
      throw new Error("La décision doit être documentée (10 caractères minimum).");
    }
    await ctx.db.patch(args.disputeId, {
      status: args.decision,
      decision: args.decisionNote.trim(),
      resolvedById: args.decision === "en_cours" ? undefined : admin._id,
      resolvedAt: args.decision === "en_cours" ? undefined : Date.now(),
    });
    const request = await ctx.db.get(dispute.requestId);
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: `admin:${admin.adminRole ?? "super_admin"}`,
      action: "dispute.resolved",
      targetTable: "disputes",
      targetId: args.disputeId,
      oldValue: dispute.status,
      newValue: args.decision,
      detail: args.decisionNote.trim().slice(0, 120),
    });
    await addEvent(ctx, dispute.requestId, "litige", `Litige ${args.decision === "en_cours" ? "en instruction" : args.decision}`);
    await notify(
      ctx,
      dispute.openedById,
      "litige",
      args.decision === "resolue" ? "Litige résolu" : args.decision === "rejetee" ? "Litige rejeté" : "Litige en cours d'instruction",
      args.decisionNote.trim(),
      dispute.requestId,
    );
    if (request && request.clientId !== dispute.openedById) {
      await notify(
        ctx,
        request.clientId,
        "litige",
        "Mise à jour du litige",
        `Décision GTEC : ${args.decision === "en_cours" ? "instruction en cours" : args.decision}. ${args.decisionNote.trim()}`,
        dispute.requestId,
      );
    }
  },
});

// ------------------------ Sanctions graduées (§37) ------------------------

const SANCTION_LEVELS = [
  { level: 1, label: "Avertissement" },
  { level: 2, label: "Limitation" },
  { level: 3, label: "Suspension temporaire" },
  { level: 4, label: "Restriction financière" },
  { level: 5, label: "Résiliation / bannissement" },
];

/** Vérifie l'état de blocage d'un compte (sanction active, auto-expirée si niveau 3). */
export const mySanctions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db
      .query("sanctions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const now = Date.now();
    // Suspension temporaire (niveau 3) : auto-expirée logiquement à l'échéance.
    const active = all.filter(
      (s) =>
        s.status === "active" &&
        !(s.level === 3 && s.until !== undefined && s.until < now),
    );
    const maxLevel = active.reduce((m, s) => Math.max(m, s.level), 0);
    return {
      items: all.sort((a, b) => b.issuedAt - a.issuedAt),
      activeCount: active.length,
      maxLevel,
      isBanned: active.some((s) => s.level === 5),
    };
  },
});

/** File admin des sanctions (console). */
export const adminListSanctions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminScope(ctx, "litiges", "moderation", "super_admin");
    const all = await ctx.db.query("sanctions").order("desc").collect();
    return await Promise.all(
      all.map(async (s) => {
        const target = await ctx.db.get(s.userId);
        const issuer = await ctx.db.get(s.issuedById);
        return { sanction: s, targetName: target?.name ?? "Utilisateur", issuerName: issuer?.name ?? "Admin" };
      }),
    );
  },
});

/** Émet une sanction graduée, motivée et notifiée (§37). */
export const adminIssueSanction = mutation({
  args: {
    userId: v.id("users"),
    level: v.number(),
    reason: v.string(),
    requestId: v.optional(v.id("serviceRequests")),
    /** Niveau 3 uniquement : durée de suspension en jours. */
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "litiges", "moderation", "super_admin");
    if (args.level < 1 || args.level > 5) {
      throw new Error("Niveau de sanction invalide (1 à 5).");
    }
    if (args.reason.trim().length < 10) {
      throw new Error("La sanction doit être motivée (10 caractères minimum).");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Utilisateur introuvable.");
    if (target.role === "admin") {
      throw new Error("Les sanctions s'appliquent aux comptes clients et techniciens.");
    }
    const id = await ctx.db.insert("sanctions", {
      userId: args.userId,
      level: args.level,
      reason: args.reason.trim(),
      requestId: args.requestId,
      status: "active",
      until:
        args.level === 3
          ? Date.now() + Math.max(1, args.days ?? 7) * 24 * 3600 * 1000
          : undefined,
      issuedById: admin._id,
      issuedAt: Date.now(),
    });
    // Niveau 5 : résiliation — le compte perd son rôle d'accès.
    if (args.level === 5 && target.role === "member") {
      await ctx.db.patch(args.userId, { role: "user" });
    }
    const label = SANCTION_LEVELS[args.level - 1]?.label ?? `Niveau ${args.level}`;
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: `admin:${admin.adminRole ?? "super_admin"}`,
      action: "sanction.issued",
      targetTable: "sanctions",
      targetId: id,
      newValue: `Niveau ${args.level} — ${label}`,
      detail: args.reason.trim().slice(0, 120),
    });
    await notify(
      ctx,
      args.userId,
      "sanction",
      `Sanction : ${label}`,
      `${args.reason.trim()} Vous pouvez contester cette décision auprès de l'administration GTEC.`,
      args.requestId,
    );
    return id;
  },
});

/** Levée de sanction (décision révisée) — tracée. */
export const adminLiftSanction = mutation({
  args: {
    sanctionId: v.id("sanctions"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminScope(ctx, "litiges", "moderation", "super_admin");
    const s = await ctx.db.get(args.sanctionId);
    if (!s) throw new Error("Sanction introuvable.");
    if (s.status !== "active" && s.status !== "contested") {
      throw new Error("Cette sanction est déjà levée.");
    }
    await ctx.db.patch(args.sanctionId, { status: "levee" });
    const target = await ctx.db.get(s.userId);
    // Réactivation du compte après un bannissement levé.
    if (s.level === 5 && target && target.role === "user") {
      await ctx.db.patch(s.userId, { role: "member" });
    }
    await auditLog(ctx, {
      actorId: admin._id,
      actorRole: `admin:${admin.adminRole ?? "super_admin"}`,
      action: "sanction.lifted",
      targetTable: "sanctions",
      targetId: args.sanctionId,
      oldValue: s.status,
      newValue: "levee",
      detail: args.note,
    });
    await notify(
      ctx,
      s.userId,
      "sanction",
      "Sanction levée",
      args.note?.trim() || "La sanction qui vous concernait a été levée par l'administration.",
      s.requestId,
    );
  },
});

/** Contestation d'une sanction par l'utilisateur concerné (droit de réponse §37). */
export const contestSanction = mutation({
  args: {
    sanctionId: v.id("sanctions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const s = await ctx.db.get(args.sanctionId);
    if (!s) throw new Error("Sanction introuvable.");
    if (s.userId !== user._id) throw new Error("Action non autorisée.");
    if (s.status !== "active") {
      throw new Error("Seule une sanction active peut être contestée.");
    }
    if (args.reason.trim().length < 10) {
      throw new Error("Expliquez votre contestation (10 caractères minimum).");
    }
    await ctx.db.patch(args.sanctionId, {
      status: "contested",
      contestReason: args.reason.trim(),
      contestAt: Date.now(),
    });
    await auditLog(ctx, {
      actorId: user._id,
      actorRole: user.role === "member" ? "technicien" : "client",
      action: "sanction.contested",
      targetTable: "sanctions",
      targetId: args.sanctionId,
      detail: args.reason.trim().slice(0, 120),
    });
    await notifyAdmins(
      ctx,
      "sanction",
      "Sanction contestée",
      `${user.name ?? "Un utilisateur"} conteste une sanction de niveau ${s.level} : ${args.reason.trim().slice(0, 80)}`,
      s.requestId,
    );
  },
});

// ------------------------ Journal d'audit (§44) ------------------------

/** 200 dernières entrées du journal d'audit (console admin). */
export const adminAuditLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminScope(ctx, "super_admin", "technique", "finance", "litiges", "moderation", "kyc", "missions", "support");
    return await ctx.db.query("auditLogs").order("desc").take(200);
  },
});

// ------------------------ Disponibilité technicien (§12) ------------------------

/** Met à jour la disponibilité déclarée du technicien connecté. */
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
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = (
      await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    )[0];
    if (!profile) throw new Error("Profil technicien introuvable.");
    await ctx.db.patch(profile._id, { availability: args.availability });
    return { ok: true };
  },
});

// ------------------------ Rôles admin (§3) ------------------------

/** Liste des comptes administrateurs et de leur périmètre. */
export const adminListAdmins = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminScope(ctx, "super_admin");
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();
    return admins.map((a) => ({
      _id: a._id,
      name: a.name,
      phone: a.phone,
      email: a.email,
      adminRole: a.adminRole,
    }));
  },
});

/** Attribue le périmètre d'un compte admin (Super Admin seulement, §3). */
export const adminSetAdminRole = mutation({
  args: {
    userId: v.id("users"),
    adminRole: v.optional(
      v.union(
        v.literal("super_admin"),
        v.literal("kyc"),
        v.literal("finance"),
        v.literal("missions"),
        v.literal("support"),
        v.literal("litiges"),
        v.literal("moderation"),
        v.literal("technique"),
      ),
    ),
    /** Niveau d'accès admin : "admin" = compte admin, undefined = retire. */
    makeAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const superAdmin = await requireAdminScope(ctx, "super_admin");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Utilisateur introuvable.");
    if (target._id === superAdmin._id) {
      throw new Error("Vous ne pouvez pas modifier votre propre périmètre.");
    }
    const willBeAdmin = args.makeAdmin ?? target.role === "admin";
    await ctx.db.patch(args.userId, {
      role: willBeAdmin ? "admin" : "user",
      ...(willBeAdmin ? { adminRole: args.adminRole ?? "support" } : { adminRole: undefined }),
    });
    await auditLog(ctx, {
      actorId: superAdmin._id,
      actorRole: "admin:super_admin",
      action: "admin.role.changed",
      targetTable: "users",
      targetId: args.userId,
      oldValue: `${target.role}${target.adminRole ? `:${target.adminRole}` : ""}`,
      newValue: willBeAdmin ? `admin:${args.adminRole ?? "support"}` : "user",
      detail: `Compte : ${target.name ?? args.userId}`,
    });
    return { ok: true };
  },
});

// ------------------------ Score prestataire (§38) ------------------------

/**
 * Score interne non manipulable (§38) : taux de réponse (missions menées à
 * terme), taux d'annulation, satisfaction, ancienneté, missions réussies.
 * Utilisé par le matching et affiché au technicien.
 */
export const myProviderScore = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_tech", (q) => q.eq("techUserId", user._id))
      .collect();
    const satisfaction = reviews.length
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 3;
    const myAssignments = (
      await ctx.db.query("assignments").collect()
    ).filter((a) => a.members.some((m) => m.id === user._id));
    const requestIds = new Set(myAssignments.map((a) => a.requestId));
    const relatedRequests = (
      await ctx.db.query("serviceRequests").collect()
    ).filter((r) => requestIds.has(r._id));
    const completed = relatedRequests.filter((r) => r.status === "terminee").length;
    const cancelled = relatedRequests.filter((r) => r.status === "annulee").length;
    const judged = completed + cancelled;
    const completionRate = judged ? completed / judged : 1;
    const cancellationRate = judged ? cancelled / judged : 0;
    // Ancienneté : jours depuis le premier évènement du compte (plafonné à 2 ans).
    const seniorityDays = Math.min(
      730,
      Math.max(0, (Date.now() - user._creationTime) / (24 * 3600 * 1000)),
    );
    const score =
      Math.round(
        satisfaction * 10 +
          completionRate * 40 +
          (1 - cancellationRate) * 10 +
          (seniorityDays / 730) * 15 +
          Math.min(completed, 50) * 0.5,
      ) || 0;
    return {
      score: Math.max(0, Math.min(100, score)),
      satisfaction: Math.round(satisfaction * 10) / 10,
      reviewCount: reviews.length,
      completed,
      cancelled,
      completionRate: Math.round(completionRate * 100),
      cancellationRate: Math.round(cancellationRate * 100),
      seniorityDays: Math.round(seniorityDays),
    };
  },
});
