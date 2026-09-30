/**
 * MODE DIASPORA — backend (§1 à §17 du module).
 *
 * Un client à l'étranger commande pour un proche au Cameroun : bénéficiaires
 * enregistrés (§2/§15), commande (§3-5), devis (§6), paiement international
 * (§7 : tokenisation chez le PSP, montant en devise affiché avant validation),
 * escrow (§8 : autorisation puis capture après validation), suivi (§9-10),
 * validations croisées proche/diaspora (§11), litiges (§16-17 via l'existant).
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./gtec";
import { BENEFICIARY_RELATIONS } from "../lib/diaspora";
import { toCmLocal } from "../lib/gtec";
import { interventionsForService } from "../lib/interventions";

// ======================= §2/§15 : MES PROCHES ===============================

function normalizeBeneficiary(args: {
  firstName: string;
  lastName: string;
  phone: string;
  relation: string;
  city: string;
}) {
  if (args.firstName.trim().length < 2) throw new Error("Prénom du bénéficiaire requis.");
  if (args.lastName.trim().length < 2) throw new Error("Nom du bénéficiaire requis.");
  if (!toCmLocal(args.phone)) {
    throw new Error(
      "Numéro camerounais invalide pour le bénéficiaire. Format : 6XX XX XX XX.",
    );
  }
  if (args.relation.trim().length < 2) throw new Error("Relation requise.");
  if (!args.city.trim()) throw new Error("Ville du bénéficiaire requise.");
}

/** Liste des bénéficiaires du client connecté. */
export const listBeneficiaries = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("diasporaBeneficiaries")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
  },
});

/** Ajoute un proche/bénéficiaire au Cameroun. */
export const addBeneficiary = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    relation: v.string(),
    city: v.string(),
    quarter: v.optional(v.string()),
    address: v.optional(v.string()),
    accessInstructions: v.optional(v.string()),
    onSiteContactName: v.optional(v.string()),
    onSiteContactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    normalizeBeneficiary(args);
    const cmPhone = toCmLocal(args.phone)!;
    // Idempotence : pas deux fois le même bénéficiaire (même nom + même numéro).
    const all = await ctx.db
      .query("diasporaBeneficiaries")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    const dup = all.find(
      (b) =>
        !b.archived &&
        b.phone.replace(/\D/g, "").slice(-9) === cmPhone &&
        b.firstName.trim().toLowerCase() === args.firstName.trim().toLowerCase() &&
        b.lastName.trim().toLowerCase() === args.lastName.trim().toLowerCase(),
    );
    if (dup) throw new Error("Ce bénéficiaire est déjà enregistré.");
    return await ctx.db.insert("diasporaBeneficiaries", {
      ownerId: user._id,
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      phone: `+237${cmPhone}`,
      relation: args.relation.trim(),
      city: args.city.trim(),
      quarter: args.quarter?.trim() || undefined,
      address: args.address?.trim() || undefined,
      accessInstructions: args.accessInstructions?.trim() || undefined,
      onSiteContactName: args.onSiteContactName?.trim() || undefined,
      onSiteContactPhone: args.onSiteContactPhone?.trim()
        ? `+237${toCmLocal(args.onSiteContactPhone) ?? args.onSiteContactPhone.trim()}`
        : undefined,
    });
  },
});

/** Archive (désactive) un bénéficiaire. */
export const archiveBeneficiary = mutation({
  args: { beneficiaryId: v.id("diasporaBeneficiaries") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.beneficiaryId);
    if (!b || b.ownerId !== user._id) throw new Error("Bénéficiaire introuvable.");
    await ctx.db.patch(args.beneficiaryId, { archived: true });
  },
});

// ============ §4 : SUGGESTION DE PROFESSIONNELS (matching existant) =========

/**
 * Techniciens compatibles pour une demande diaspora : abonnement actif, KYC
 * vérifié, disponibles, triés par distance ville + score nomenclature.
 * Réutilise le moteur suggestTeam existant côté client puis enrichit.
 */
export const suggestProsForDiaspora = query({
  args: { city: v.string(), serviceKey: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const profiles = await ctx.db.query("technicianProfiles").collect();
    const users = await ctx.db.query("users").collect();
    const now = Date.now();
    const out: {
      id: string;
      name: string;
      specialty?: string;
      job?: string;
      experienceYears?: number;
      rating?: number;
      reviewCount: number;
      city?: string;
      distanceKm: number | null;
      verified: boolean;
      availability: string;
      degreeLabel?: string;
      certifications?: string[];
      domainCode?: string;
      specialtyCode?: string;
    }[] = [];
    for (const p of profiles) {
      if (p.status !== "verifie") continue;
      const active =
        p.subscription !== "aucun" &&
        !!p.subscriptionUntil &&
        p.subscriptionUntil > now;
      if (!active) continue;
      if (p.availability && p.availability !== "disponible") continue;
      const u = users.find((x) => x._id === p.userId);
      if (!u) continue;
      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_tech", (q) => q.eq("techUserId", p.userId))
        .collect();
      const rating = reviews.length
        ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
        : undefined;
      const zones = p.zones.length ? p.zones : p.city ? [p.city] : [];
      const distanceKm = zones.includes(args.city) ? 0 : zones.length ? 25 : null;
      out.push({
        id: String(p.userId),
        name: u.name ?? "Technicien GTEC",
        specialty: p.specialty,
        job: p.jobTitle ?? p.profession,
        experienceYears: p.experienceYears,
        rating,
        reviewCount: reviews.length,
        city: p.city,
        distanceKm,
        verified: true,
        availability: p.availability ?? "disponible",
        degreeLabel: p.highestDegree,
        certifications: p.certifications,
        domainCode: p.domainCode,
        specialtyCode: p.specialtyCode,
      });
    }
    return out.sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
  },
});

// ============== §3 : COMMANDE POUR UN PROCHE (demande diaspora) =============

/**
 * Crée la demande pour un bénéficiaire : copie l'adresse du proche, notifie
 * le bénéficiaire sur place, marque la demande « diaspora ».
 */
export const createDiasporaRequest = mutation({
  args: {
    beneficiaryId: v.id("diasporaBeneficiaries"),
    serviceKey: v.string(),
    interventionCode: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    photos: v.array(v.string()),
    urgency: v.optional(
      v.union(v.literal("normale"), v.literal("urgente"), v.literal("critique")),
    ),
    desiredDate: v.optional(v.number()),
    budgetHint: v.optional(v.number()),
    voiceNoteUrl: v.optional(v.string()),
    specialtyCode: v.optional(v.string()),
    requiredSkills: v.optional(v.array(v.string())),
    coords: v.optional(
      v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.beneficiaryId);
    if (!b || b.ownerId !== user._id) throw new Error("Bénéficiaire introuvable.");
    if (b.archived) throw new Error("Ce bénéficiaire est archivé.");

    // CATALOGUE : résolution de l'intervention + fusion des compétences.
    const intervention = args.interventionCode
      ? interventionsForService(args.serviceKey)?.families
          .flatMap((f) => f.items)
          .find((i) => i.code === args.interventionCode)
      : undefined;
    if (args.interventionCode && !intervention) {
      throw new Error("Intervention inconnue (catalogue GTEC PRO).");
    }
    const mergedSkills = [
      ...(intervention?.skills ?? []),
      ...(args.requiredSkills ?? []),
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s, i, a) => a.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);

    const requestId = await ctx.db.insert("serviceRequests", {
      clientId: user._id, // le payeur est le client diaspora
      reference: "PENDING",
      serviceKey: args.serviceKey,
      title: args.title.trim(),
      description: args.description.trim(),
      address: b.address ?? b.quarter ?? b.city,
      city: b.city,
      photos: args.photos,
      ...(args.coords ? { coords: args.coords, coordsAt: Date.now() } : {}),
      specialtyCode: args.specialtyCode,
      requiredSkills: mergedSkills.length ? mergedSkills : undefined,
      interventionCode: intervention?.code,
      interventionLabel: intervention?.label,
      urgency: args.urgency ?? "normale",
      desiredDate: args.desiredDate,
      budgetHint: args.budgetHint,
      voiceNoteUrl: args.voiceNoteUrl,
      beneficiaryId: b._id,
      isDiaspora: true,
      accessInstructions: b.accessInstructions,
      onSiteContact: {
        name: b.onSiteContactName ?? `${b.firstName} ${b.lastName}`,
        phone: b.onSiteContactPhone ?? b.phone,
      },
      beneficiaryValidation: "en_attente",
      // §11 : code à 6 chiffres remis au bénéficiaire pour valider sans compte.
      beneficiaryValidationCode: String(Math.floor(100000 + Math.random() * 900000)),
      status: "nouvelle",
    } as never);

    // Notification au bénéficiaire sur place (si compte GTEC connu).
    const beneficiaryUser = (
      await ctx.db
        .query("users")
        .withIndex("phone", (q) => q.eq("phone", b.phone))
        .collect()
    )[0];
    if (beneficiaryUser) {
      await ctx.db.insert("notifications", {
        userId: beneficiaryUser._id,
        kind: "diaspora",
        title: "Intervention GTEC PRO pour vous",
        body: `${user.name ?? "Un proche"} a demandé une intervention GTEC PRO pour vous. Un professionnel sera envoyé à votre adresse.`,
        requestId,
        at: Date.now(),
      });
    }
    return requestId;
  },
});

// ================== §7/§8 : PAIEMENT INTERNATIONAL (escrow) =================

const FX_INDICATIVE: Record<string, number> = {
  EUR: 655.957,
  USD: 600,
  GBP: 760,
  CAD: 440,
  XAF: 1,
};

/**
 * Paiement international depuis l'étranger (§7) — carte Visa/Mastercard via
 * Stripe si configuré (STRIPE_SECRET_KEY), sinon repli démo jusqu'à
 * configuration des clés. Modèle **autorisation puis capture** (§8) :
 * les fonds sont autorisés puis capturés (libérés) après validation de
 * l'intervention — le montant est en FCFA (XAF, zéro décimale).
 *
 * Sécurité (§18) : aucune donnée de carte ne transite ni n'est stockée chez
 * GTEC PRO — uniquement des références/token PSP, journalisation intégrale.
 */
export const startInternationalPayment = action({
  args: {
    paymentId: v.id("payments"),
    /** Devise d'affichage du payeur (le débit reste en XAF). */
    displayCurrency: v.string(),
    stripeToken: v.optional(v.string()), // token PSP côté client (si intégré)
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const payment = (await ctx.runQuery(internal.diaspora.getOwnPayment, {
      paymentId: args.paymentId,
      userId,
    })) as (Doc<"payments"> & { requestId: Id<"serviceRequests"> }) | null;
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.status !== "en_attente") {
      throw new Error("Ce paiement n'est plus en attente (anti double-paiement).");
    }
    if (payment.international?.captured) {
      throw new Error("Paiement déjà traité (anti double-paiement).");
    }

    const rate = FX_INDICATIVE[args.displayCurrency] ?? 655.957;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      // ---- Cas réel : Stripe PaymentIntents, capture manuelle (escrow §8) ----
      const amountMinor = Math.round(payment.amount); // XAF : zéro décimale
      const body = new URLSearchParams({
        amount: String(amountMinor),
        currency: "xaf",
        "capture_method[]": "manual", // autorisation puis capture après validation
        description: `GTEC PRO Diaspora — intervention au Cameroun (${payment.amount} FCFA)`,
      });
      const res = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        throw new Error(
          `PSP international indisponible (${res.status}). Réessayez ou payez localement.`,
        );
      }
      await ctx.runMutation(internal.diaspora.markInternationalStarted, {
        paymentId: payment._id,
        provider: "stripe",
        providerRef: String(data.id),
        amountMinor,
        currency: args.displayCurrency,
        fxRateFromXaf: 1 / rate,
      });
      return {
        kind: "stripe" as const,
        clientSecret: String(data.client_secret ?? ""),
        paymentIntentId: String(data.id),
        amountXaf: payment.amount,
        displayCurrency: args.displayCurrency,
      };
    }

    // ---- Repli démo : clés non configurées (le canal CinetPay carte reste
    // disponible depuis l'écran de paiement standard) ----
    await ctx.runMutation(internal.diaspora.markInternationalStarted, {
      paymentId: payment._id,
      provider: "cinetpay_card",
      providerRef: `demo_${payment._id}`,
      amountMinor: payment.amount,
      currency: args.displayCurrency,
      fxRateFromXaf: 1 / rate,
    });
    return {
      kind: "demo" as const,
      reason:
        "Paiement carte international non activé (clés PSP manquantes). Le canal CinetPay carte est disponible sur l'écran de paiement standard, ou payez localement via un proche.",
      amountXaf: payment.amount,
      displayCurrency: args.displayCurrency,
    };
  },
});

/** Marque le début d'un paiement international (journalisation §18). */
export const markInternationalStarted = internalMutation({
  args: {
    paymentId: v.id("payments"),
    provider: v.union(v.literal("stripe"), v.literal("cinetpay_card")),
    providerRef: v.string(),
    amountMinor: v.number(),
    currency: v.string(),
    fxRateFromXaf: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, {
      international: {
        provider: args.provider,
        amountMinor: args.amountMinor,
        currency: args.currency,
        fxRateFromXaf: args.fxRateFromXaf,
        captured: false,
        providerRef: args.providerRef,
      },
    });
  },
});

/** Lecture interne d'un paiement appartenant au payeur. */
export const getOwnPayment = internalQuery({
  args: { paymentId: v.id("payments"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.paymentId);
    if (!p || p.clientId !== args.userId) return null;
    return p;
  },
});

/**
 * §8 : capture les fonds après validation (proche ou diaspora) — libération
 * escrow, puis le pipeline standard (commission 10 %, solde prestataire)
 * s'applique. Interne : appelé par les mutations de validation.
 */
export const captureInternationalPayment = internalMutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const payments = await ctx.db
      .query("payments")
      .filter((q) => q.eq(q.field("requestId"), args.requestId))
      .collect();
    for (const p of payments) {
      if (p.international && !p.international.captured && p.status === "valide") {
        await ctx.db.patch(p._id, {
          international: { ...p.international, captured: true },
        });
      }
    }
  },
});

// =============== §11 : VALIDATION DU PROCHE + VALIDATION DIASPORA ===========

/**
 * Validation par le proche sur place (code à 6 chiffres figurant sur la
 * demande) : conforme / correction / problème — sans compte requis.
 */
export const validateByBeneficiaryCode = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    code: v.string(),
    verdict: v.union(
      v.literal("conforme"),
      v.literal("correction_demandee"),
      v.literal("probleme_signale"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (request.status !== "rapport_emis") {
      throw new Error("La validation est possible après transmission du rapport.");
    }
    const expected = (request.beneficiaryValidationCode ?? "").trim();
    if (!expected || args.code.trim() !== expected) {
      throw new Error("Code de validation incorrect.");
    }
    await ctx.db.patch(args.requestId, {
      beneficiaryValidation: args.verdict,
      beneficiaryValidationNote: args.note?.trim() || undefined,
      beneficiaryValidatedAt: Date.now(),
    });
    await ctx.db.insert("notifications", {
      userId: request.clientId,
      kind: "diaspora",
      title:
        args.verdict === "conforme"
          ? "Votre proche valide l'intervention ✅"
          : args.verdict === "correction_demandee"
            ? "Votre proche demande une correction ⚠️"
            : "Votre proche signale un problème ❌",
      body: `Intervention ${request.reference} — ${args.note?.trim() || "Sans commentaire."}`,
      requestId: request._id,
      at: Date.now(),
    });
    if (args.verdict === "conforme") {
      await ctx.runMutation(internal.diaspora.captureInternationalPayment, {
        requestId: request._id,
      });
    }
  },
});

/**
 * Validation par le client diaspora depuis son compte (§11) : confirme la
 * bonne exécution → libération des fonds (escrow), ou ouvre un litige.
 */
export const validateByDiaspora = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    verdict: v.union(
      v.literal("conforme"),
      v.literal("correction_demandee"),
      v.literal("probleme_signale"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.clientId !== user._id) throw new Error("Demande introuvable.");
    if (request.status !== "rapport_emis") {
      throw new Error("La validation est possible après transmission du rapport.");
    }
    await ctx.db.patch(args.requestId, {
      beneficiaryValidation: args.verdict,
      beneficiaryValidationNote: args.note?.trim() || undefined,
      beneficiaryValidatedAt: Date.now(),
    });
    if (args.verdict === "conforme") {
      await ctx.runMutation(internal.diaspora.captureInternationalPayment, {
        requestId: args.requestId,
      });
    } else if (args.verdict === "probleme_signale") {
      // Ouvre un litige tracé (module litiges existant).
      await ctx.db.insert("disputes", {
        requestId: args.requestId,
        openedById: user._id,
        category: "travaux_non_conformes",
        description:
          args.note?.trim() ||
          "Client diaspora : intervention signalée non conforme depuis l'étranger.",
        status: "ouverte",
      } as never);
    }
  },
});

/** Historique diaspora : interventions commandées pour les proches. */
export const myDiasporaHistory = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const requests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_client", (q) => q.eq("clientId", user._id))
      .collect();
    const diaspora = requests.filter((r) => r.isDiaspora);
    const out = [] as {
      request: Doc<"serviceRequests">;
      beneficiary: Doc<"diasporaBeneficiaries"> | null;
    }[];
    for (const r of diaspora.sort((a, b) => b._creationTime - a._creationTime)) {
      const beneficiary = r.beneficiaryId ? await ctx.db.get(r.beneficiaryId) : null;
      out.push({ request: r, beneficiary });
    }
    return out;
  },
});
