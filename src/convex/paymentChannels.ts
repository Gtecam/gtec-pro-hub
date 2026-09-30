/**
 * GTEC PRO 2.0 (§2E, §20, §23, §29) — implémentation de la couche
 * d'abstraction paiement : canal **CinetPay** (agrégateur agréé Établissement
 * de Paiement BEAC/CEMAC) via checkout hébergé, avec repli automatique en
 * **mode démo** (déclaration manuelle avec preuve, validée par
 * l'administration) quand les clés ne sont pas configurées.
 *
 * Flux CinetPay (§20) :
 *   client paie → fonds sécurisés chez l'EPI agréé → mission réalisée →
 *   validation (check serveur / webhook) → commission 10 % → solde prestataire
 *
 * Clés requises pour activer le canal (onglet Clés / API keys) :
 *   CINETPAY_API_KEY, CINETPAY_SITE_ID (+ CINETPAY_WEBHOOK_SECRET optionnel,
 *   GATEWAY_NOTIFY_URL pour les notifications serveur).
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  CINETPAY_BASE,
  buildMerchantReference,
  cinetPayCollectPayload,
  getAvailableChannels,
  isValidCollectAmount,
  mapCinetPayStatus,
} from "../lib/paymentGateway";

async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* réponse non JSON */
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

// ---------- disponibilité des canaux (UI + gardes) ----------

/**
 * Canaux de paiement effectivement disponibles selon les clés du projet.
 * Action (et non query) car process.env n'est lisible que dans les actions.
 */
export const getPaymentChannels = action({
  args: {},
  handler: async () => {
    return getAvailableChannels({
      CINETPAY_API_KEY: process.env.CINETPAY_API_KEY,
      CINETPAY_SITE_ID: process.env.CINETPAY_SITE_ID,
      MOMO_SUBSCRIPTION_KEY: process.env.MOMO_SUBSCRIPTION_KEY,
      MOMO_API_USER: process.env.MOMO_API_USER,
      MOMO_API_KEY: process.env.MOMO_API_KEY,
      ORANGE_CLIENT_ID: process.env.ORANGE_CLIENT_ID,
      ORANGE_CLIENT_SECRET: process.env.ORANGE_CLIENT_SECRET,
      ORANGE_MERCHANT_KEY: process.env.ORANGE_MERCHANT_KEY,
    });
  },
});

// ---------- helpers internes ----------

/** Patch la référence marchande d'un paiement (idempotence côté PSP). */
export const setPaymentExternalRef = internalMutation({
  args: {
    paymentId: v.id("payments"),
    externalRef: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { externalRef: args.externalRef });
  },
});

function cinetPayKeys(): { apiKey: string; siteId: string } | null {
  const apiKey = process.env.CINETPAY_API_KEY;
  const siteId = process.env.CINETPAY_SITE_ID;
  if (!apiKey || !siteId) return null;
  return { apiKey, siteId };
}

// ---------- démarrage d'un paiement passerelle ----------

type GatewayStart =
  | { kind: "redirect"; paymentId: string; url: string; reference: string }
  | { kind: "demo"; reason: string };

/**
 * Démarre un paiement de tranche (avance 50 % / solde 50 %) via le checkout
 * hébergé CinetPay — MTN MoMo, Orange Money et carte bancaire (tokenisation
 * chez le PSP, jamais de donnée de carte dans GTEC PRO, §29).
 *
 * Sans clés CinetPay : `{ kind: "demo" }` — le client utilise alors la
 * déclaration manuelle avec preuve (flux existant).
 */
export const startGatewayPayment = action({
  args: {
    quoteId: v.id("quotes"),
    milestone: v.union(v.literal("avance"), v.literal("solde")),
    /** Rail choisi par le client — détermine la méthode GTEC enregistrée. */
    rail: v.union(
      v.literal("mtn_momo"),
      v.literal("orange_money"),
      v.literal("carte_visa"),
    ),
    /** Téléphone payeur (optionnel pour la carte). */
    payerPhone: v.optional(v.string()),
    /** URL de retour après checkout (origine de l'application). */
    returnUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GatewayStart> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const keys = cinetPayKeys();
    if (!keys) {
      return {
        kind: "demo",
        reason:
          "CinetPay non configuré — déclarez votre paiement avec une preuve, il sera validé par l'administration GTEC.",
      };
    }

    const quote = (await ctx.runQuery(internal.gtec.getAcceptedQuoteForPayment, {
      quoteId: args.quoteId,
      clientId: userId,
      milestone: args.milestone,
    })) as {
      _id: Id<"quotes">;
      requestId: Id<"serviceRequests">;
      total: number;
      currency: string;
      advance: number;
      balance: number;
    } | null;
    if (!quote) {
      throw new Error("Devis introuvable, non accepté ou déjà payé.");
    }
    const existing = (await ctx.runQuery(internal.gtec.pendingPaymentForRequest, {
      requestId: quote.requestId,
    })) as { _id: Id<"payments"> } | null;
    if (existing) {
      throw new Error("Un paiement est déjà en cours de vérification.");
    }

    const amount = args.milestone === "avance" ? quote.advance : quote.balance;
    if (!isValidCollectAmount(amount)) {
      throw new Error("Montant invalide pour un paiement en ligne.");
    }

    // 1. Paiement GTEC en attente (même porte que le flux MoMo direct).
    const paymentId = (await ctx.runMutation(internal.gtec.createPendingPayment, {
      quoteId: quote._id,
      clientId: userId,
      amount,
      currency: quote.currency,
      // La passerelle couvre MoMo + cartes ; le rail choisi qualifie la méthode.
      method: args.rail,
      payerPhone: args.payerPhone?.trim() || "—",
      milestone: args.milestone,
    })) as Id<"payments">;

    // 2. Référence marchande unique (lisible + identifiant paiement encodé).
    const reference = buildMerchantReference("GTEC", paymentId);
    await ctx.runMutation(internal.paymentChannels.setPaymentExternalRef, {
      paymentId,
      externalRef: reference,
    });

    // 3. Création du checkout hébergé CinetPay.
    const payload = cinetPayCollectPayload(
      {
        amountXaf: amount,
        description:
          args.milestone === "avance"
            ? "GTEC PRO — Avance 50 % intervention"
            : "GTEC PRO — Solde 50 % intervention",
        customerPhone: args.payerPhone,
        merchantReference: reference,
        returnUrl: args.returnUrl,
        notifyUrl: process.env.GATEWAY_NOTIFY_URL || process.env.ORANGE_NOTIF_URL,
        channels:
          args.rail === "carte_visa"
            ? "CREDIT_CARD"
            : args.rail === "mtn_momo"
              ? "MOBILE_MONEY"
              : "ALL",
      },
      keys,
    );
    const res = await fetchJson(CINETPAY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const checkoutUrl: string | undefined = res.data?.data?.payment_url;
    if (!res.ok || !checkoutUrl) {
      // Le checkout n'a pas pu être créé : on annule le paiement en attente
      // pour permettre une nouvelle tentative immédiate.
      await ctx.runMutation(internal.momo.settleMomoFailure, {
        paymentId,
        providerRef: reference,
        reason: `CinetPay a refusé la création du checkout (${res.status}).`,
        expired: true,
      });
      throw new Error(
        `Création du paiement en ligne impossible (${res.status}). Réessayez ou déclarez le paiement manuellement.`,
      );
    }

    return { kind: "redirect", paymentId, url: checkoutUrl, reference };
  },
});

// ---------- vérification serveur ----------

/**
 * Interroge CinetPay (`/v2/payment/check`) pour connaître le statut réel de
 * la transaction et applique le résultat au parcours GTEC (source de vérité
 * serveur — le retour navigateur n'est jamais suffisant, §43 rapprochement).
 */
export const checkGatewayPayment = action({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const payment = (await ctx.runQuery(internal.gtec.getPaymentById, {
      paymentId: args.paymentId,
    })) as {
      _id: string;
      clientId: string;
      status: string;
      externalRef?: string;
    } | null;
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.clientId !== userId) throw new Error("Action non autorisée.");
    if (payment.status === "valide") return { status: "reussie" as const };
    if (payment.status !== "en_attente") {
      return { status: "echouee" as const };
    }

    const reference = payment.externalRef;
    const keys = cinetPayKeys();
    if (!reference || !keys) {
      // Mode démo : la validation passe par l'administration.
      return { status: "en_attente" as const };
    }

    const res = await fetchJson(`${CINETPAY_BASE.replace("/payment", "/payment")}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apikey: keys.apiKey,
        site_id: keys.siteId,
        transaction_id: reference,
      }),
    });
    if (!res.ok) {
      throw new Error(`Consultation CinetPay échouée (${res.status}).`);
    }
    const rawStatus = String(res.data?.data?.status ?? "");
    const outcome = mapCinetPayStatus(rawStatus);

    if (outcome === "reussie") {
      await ctx.runMutation(internal.momo.settleMomoSuccess, {
        paymentId: args.paymentId,
        providerRef: reference,
      });
      return { status: "reussie" as const };
    }
    if (outcome === "echouee") {
      await ctx.runMutation(internal.momo.settleMomoFailure, {
        paymentId: args.paymentId,
        providerRef: reference,
        reason: `Statut CinetPay : ${rawStatus}`,
      });
      return { status: "echouee" as const };
    }
    return { status: "en_attente" as const };
  },
});

/**
 * Vérification déclenchée par le webhook : re-requête serveur (la pratique
 * recommandée CinetPay — on ne fait jamais confiance au corps du POST seul).
 * Interne : pas d'authentification utilisateur, appelée depuis http.ts.
 */
export const verifyCinetPayTransaction = internalAction({
  args: { transactionId: v.string() },
  handler: async (ctx, args) => {
    const keys = cinetPayKeys();
    if (!keys) return { checked: false as const };
    const payment = (await ctx.runQuery(internal.gtec.paymentByExternalRef, {
      externalRef: args.transactionId,
    })) as { _id: Id<"payments">; status: string } | null;
    if (!payment || payment.status !== "en_attente") {
      return { checked: false as const };
    }
    const res = await fetchJson(`${CINETPAY_BASE}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apikey: keys.apiKey,
        site_id: keys.siteId,
        transaction_id: args.transactionId,
      }),
    });
    if (!res.ok) return { checked: false as const };
    const outcome = mapCinetPayStatus(String(res.data?.data?.status ?? ""));
    if (outcome === "reussie") {
      await ctx.runMutation(internal.momo.settleMomoSuccess, {
        paymentId: payment._id,
        providerRef: args.transactionId,
      });
    } else if (outcome === "echouee") {
      await ctx.runMutation(internal.momo.settleMomoFailure, {
        paymentId: payment._id,
        providerRef: args.transactionId,
        reason: "Webhook CinetPay : paiement refusé ou annulé",
      });
    }
    return { checked: true as const, outcome };
  },
});
