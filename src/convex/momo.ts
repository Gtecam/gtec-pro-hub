import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

import { ADMIN_EMAIL } from "./adminApp";
import { settleMilestone } from "./gtec";
import type { Id } from "./_generated/dataModel";

/**
 * Mobile Money automatique (cahier des charges §9) — collecte sans que le
 * client ait à confirmer manuellement auprès de GTEC :
 *
 *  - MTN MoMo  : API Collections `requesttopay` (momodeveloper.mtn.com)
 *  - Orange    : Orange Money Web Payment (developer.orange.com)
 *
 * Flux : `startMomoPayment` (action) crée la demande de paiement côté
 * opérateur et enregistre une référence `momoTransactions`. Le client est
 * invité à valider sur son téléphone. `checkMomoPayment` (action) interroge
 * l'opérateur ; si la transaction est réussie, le paiement GTEC et la demande
 * passent automatiquement au statut suivant (même logique que la validation
 * admin, sans intervention humaine).
 *
 * Clés requises (onglet Clés / API keys du projet) :
 *  MTN :  MOMO_SUBSCRIPTION_KEY, MOMO_API_USER, MOMO_API_KEY,
 *         MOMO_TARGET_ENV (mtncameroon), MOMO_CALLBACK_HOST (optionnel)
 *  Orange : ORANGE_CLIENT_ID, ORANGE_CLIENT_SECRET, ORANGE_MERCHANT_KEY,
 *         ORANGE_RETURN_URL (optionnel)
 */

// ---------- helpers HTTP ----------

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
      /* réponse texte (ex. XML Orange) */
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

// ---------- MTN MoMo Collections ----------

let cachedMomoToken: { token: string; expiresAt: number } | null = null;

async function momoToken(): Promise<string> {
  if (cachedMomoToken && Date.now() < cachedMomoToken.expiresAt - 60_000) {
    return cachedMomoToken.token;
  }
  const subKey = process.env.MOMO_SUBSCRIPTION_KEY;
  const apiUser = process.env.MOMO_API_USER;
  const apiKey = process.env.MOMO_API_KEY;
  const env = process.env.MOMO_TARGET_ENV || "mtncameroon";
  if (!subKey || !apiUser || !apiKey) {
    throw new Error(
      "MTN MoMo non configuré : ajoutez MOMO_SUBSCRIPTION_KEY, MOMO_API_USER et MOMO_API_KEY dans les clés du projet.",
    );
  }
  const basic = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
  const res = await fetchJson(
    `https://sandbox.momodeveloper.mtn.com/collection/token/`.replace("sandbox.", env === "sandbox" ? "sandbox." : ""),
    // La prod et le sandbox partagent ce chemin via l'en-tête X-Target-Environment.
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Ocp-Apim-Subscription-Key": subKey,
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Authentification MTN MoMo échouée (${res.status}). Vérifiez MOMO_API_USER / MOMO_API_KEY / MOMO_SUBSCRIPTION_KEY.`,
    );
  }
  cachedMomoToken = {
    token: res.data.access_token,
    expiresAt: Date.now() + (res.data.expires_in ?? 3600) * 1000,
  };
  return cachedMomoToken.token;
}

/** Interne : enregistre la référence opérateur liée au paiement GTEC. */
export const storeMomoTx = internalMutation({
  args: {
    paymentId: v.id("payments"),
    provider: v.union(v.literal("mtn"), v.literal("orange")),
    providerRef: v.string(),
    amount: v.number(),
    currency: v.string(),
    payerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("momoTransactions", {
      paymentId: args.paymentId,
      provider: args.provider,
      providerRef: args.providerRef,
      status: "en_attente",
      amount: args.amount,
      currency: args.currency,
      payerPhone: args.payerPhone,
    });
  },
});

/** Interne : applique la réussite d'une transaction MoMo au parcours GTEC. */
export const settleMomoSuccess = internalMutation({
  args: { paymentId: v.id("payments"), providerRef: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status === "valide") return;
    const request = await ctx.db.get(payment.requestId);
    if (!request) return;
    // V6 : l'avance se confirme en "devis_accepte", le solde en cours de
    // travaux / rapport émis. Toute autre étape ne consomme pas la tranche.
    const milestone = payment.milestone !== "solde" ? "avance" : "solde";
    const allowed =
      milestone === "avance"
        ? request.status === "devis_accepte"
        : ["en_intervention", "rapport_emis"].includes(request.status);
    if (!allowed) return;

    await settleMilestone(ctx, payment, { externalRef: args.providerRef });
    await ctx.db.insert("requestEvents", {
      requestId: payment.requestId,
      kind: "paiement",
      label:
        milestone === "avance"
          ? "Avance 50 % confirmée automatiquement (Mobile Money)"
          : "Solde 50 % confirmé automatiquement (Mobile Money)",
      detail: `${payment.amount.toLocaleString("fr-FR")} ${payment.currency} · réf. ${args.providerRef.slice(0, 12)}`,
      at: Date.now(),
    });

    // Alerte à l'administration pour lancer l'affectation de l'équipe.
    const admins = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", ADMIN_EMAIL))
      .collect();
    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        kind: "paiement",
        title:
          milestone === "avance"
            ? "Avance Mobile Money reçue"
            : "Solde Mobile Money reçu",
        body:
          milestone === "avance"
            ? `Une avance de ${payment.amount.toLocaleString("fr-FR")} FCFA (50 %) a été confirmée automatiquement — affectez l'équipe.`
            : `Le solde de ${payment.amount.toLocaleString("fr-FR")} FCFA (50 %) a été confirmé automatiquement — la réception peut être signée.`,
        requestId: payment.requestId,
        at: Date.now(),
      });
    }
  },
});

/** Interne : marque une transaction MoMo échouée ou expirée. */
export const settleMomoFailure = internalMutation({
  args: {
    paymentId: v.id("payments"),
    providerRef: v.string(),
    reason: v.string(),
    expired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const tx = (
      await ctx.db
        .query("momoTransactions")
        .withIndex("by_provider_ref", (q) => q.eq("providerRef", args.providerRef))
        .collect()
    )[0];
    if (tx) {
      await ctx.db.patch(tx._id, {
        status: args.expired ? "expiree" : "echouee",
        failureReason: args.reason,
        lastCheckedAt: Date.now(),
      });
    }
    const payment = await ctx.db.get(args.paymentId);
    if (payment && payment.status === "en_attente") {
      await ctx.db.patch(payment._id, { status: "echoue" });
      await ctx.db.insert("requestEvents", {
        requestId: payment.requestId,
        kind: "paiement",
        label: args.expired ? "Paiement Mobile Money expiré" : "Paiement Mobile Money échoué",
        detail: args.reason,
        at: Date.now(),
      });
    }
  },
});

/** Statut brut MTN d'une transaction `requesttopay`. */
export const momoStatus = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const tx = (
      await ctx.db
        .query("momoTransactions")
        .withIndex("by_payment", (q) => q.eq("paymentId", args.paymentId))
        .collect()
    ).slice(-1)[0];
    if (!tx) return null;
    return {
      provider: tx.provider,
      status: tx.status,
      failureReason: tx.failureReason ?? null,
    };
  },
});

/**
 * Démarre un paiement Mobile Money automatique pour le devis accepté du
 * client. La demande opérateur est créée immédiatement ; le client valide
 * sur son téléphone, puis l'application interroge le statut via
 * `checkMomoPayment`.
 */
type MomoStartResult =
  | { provider: "mtn"; paymentId: string; referenceId: string }
  | {
      provider: "orange";
      paymentId: string;
      redirectUrl?: string;
      payToken?: string;
      referenceId: string;
    };

export const startMomoPayment = action({
  args: {
    quoteId: v.id("quotes"),
    /** V6 : tranche réglée — "avance" (50 % avant) ou "solde" (50 % à la fin). */
    milestone: v.union(v.literal("avance"), v.literal("solde")),
    provider: v.union(v.literal("mtn"), v.literal("orange")),
    payerPhone: v.string(),
  },
  handler: async (ctx, args): Promise<MomoStartResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const quote = (await ctx.runQuery(internal.gtec.getAcceptedQuoteForPayment, {
      quoteId: args.quoteId,
      clientId: userId,
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
    const amountNum = args.milestone === "avance" ? quote.advance : quote.balance;

    // Crée d'abord le paiement GTEC en attente (référence provisoire).
    const paymentId = (await ctx.runMutation(internal.gtec.createPendingPayment, {
      quoteId: quote._id,
      clientId: userId,
      amount: amountNum,
      currency: quote.currency,
      method: args.provider === "mtn" ? "mtn_momo" : "orange_money",
      payerPhone: args.payerPhone,
      milestone: args.milestone,
    })) as Id<"payments">;

    const referenceId = crypto.randomUUID();
    const amount = String(Math.round(amountNum));
    const payer = args.payerPhone.replace(/\D/g, "").slice(-9);

    if (args.provider === "mtn") {
      const token = await momoToken();
      const env = process.env.MOMO_TARGET_ENV || "mtncameroon";
      const host = process.env.MOMO_API_BASE || "https://sandbox.momodeveloper.mtn.com";
      const res = await fetchJson(`${host}/collection/v1_0/requesttopay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": env,
          ...(process.env.MOMO_CALLBACK_HOST
            ? { "X-Callback-Url": `${process.env.MOMO_CALLBACK_HOST}/api/momo-callback` }
            : {}),
          "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY!,
          "Content-Type": "application/json",
        },          body: JSON.stringify({
          amount,
          currency: env === "sandbox" ? "EUR" : "XAF",
          externalId: paymentId,
          payer: { partyIdType: "MSISDN", partyId: payer },
          payerMessage: args.milestone === "avance" ? "Avance 50% GTEC PRO" : "Solde 50% GTEC PRO",
          payeeNote: "Paiement intervention GTEC",
        }),
      });
      if (!res.ok && res.status !== 202) {
        throw new Error(
          `MTN MoMo a refusé la demande (${res.status}). Vérifiez le numéro et la configuration.`,
        );
      }
      await ctx.runMutation(internal.momo.storeMomoTx, {
        paymentId,
        provider: "mtn",
        providerRef: referenceId,
        amount: amountNum,
        currency: "XAF",
        payerPhone: args.payerPhone,
      });
      return { provider: "mtn" as const, paymentId, referenceId };
    }

    // ---- Orange Money Web Payment ----
    const clientId = process.env.ORANGE_CLIENT_ID;
    const clientSecret = process.env.ORANGE_CLIENT_SECRET;
    const merchantKey = process.env.ORANGE_MERCHANT_KEY;
    if (!clientId || !clientSecret || !merchantKey) {
      throw new Error(
        "Orange Money non configuré : ajoutez ORANGE_CLIENT_ID, ORANGE_CLIENT_SECRET et ORANGE_MERCHANT_KEY dans les clés du projet.",
      );
    }
    const tokenRes = await fetchJson("https://api.orange.com/oauth/v3/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Authentification Orange échouée (${tokenRes.status}). Vérifiez ORANGE_CLIENT_ID / ORANGE_CLIENT_SECRET.`,
      );
    }
    const accessToken = tokenRes.data.access_token as string;
    const orderId = `GTEC-${Date.now().toString(36).toUpperCase()}`;
    const payRes = await fetchJson(
      "https://api.orange.com/orange-money-webpay/dev/v1/webpayment",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchant_key: merchantKey,
          currency: "XAF",
          order_id: orderId,
          amount: Math.round(amountNum),
          return_url: process.env.ORANGE_RETURN_URL || "https://gtec.pro",
          cancel_url: process.env.ORANGE_RETURN_URL || "https://gtec.pro",
          notif_url: process.env.ORANGE_NOTIF_URL || process.env.ORANGE_RETURN_URL || "https://gtec.pro",
          lang: "fr",
          reference: "GTEC PRO",
        }),
      },
    );
    if (!payRes.ok) {
      throw new Error(
        `Orange Money a refusé la demande (${payRes.status}). Vérifiez ORANGE_MERCHANT_KEY et le montant.`,
      );
    }
    await ctx.runMutation(internal.momo.storeMomoTx, {
      paymentId,
      provider: "orange",
      providerRef: payRes.data.pay_token ?? orderId,
      amount: amountNum,
      currency: "XAF",
      payerPhone: args.payerPhone,
    });
    return {
      provider: "orange" as const,
      paymentId,
      redirectUrl: payRes.data.payment_url as string | undefined,
      payToken: payRes.data.pay_token as string | undefined,
      referenceId: orderId,
    };
  },
});

/**
 * Interroge l'opérateur pour connaître le statut du paiement en cours et
 * applique automatiquement le résultat au parcours GTEC.
 */
export const checkMomoPayment = action({
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
      requestId: string;
    } | null;
    if (!payment) throw new Error("Paiement introuvable.");
    if (payment.clientId !== userId) throw new Error("Action non autorisée.");
    if (payment.status === "valide") return { status: "reussie" as const };

    const tx = (await ctx.runQuery(internal.gtec.txForPayment, {
      paymentId: args.paymentId,
    })) as {
      provider: "mtn" | "orange";
      providerRef: string;
      status: string;
      amount: number;
      payerPhone: string;
    } | null;
    if (!tx) throw new Error("Transaction introuvable.");
    if (tx.status !== "en_attente") return { status: tx.status as never };

    if (tx.provider === "mtn") {
      const token = await momoToken();
      const env = process.env.MOMO_TARGET_ENV || "mtncameroon";
      const host = process.env.MOMO_API_BASE || "https://sandbox.momodeveloper.mtn.com";
      const res = await fetchJson(
        `${host}/collection/v1_0/requesttopay/${tx.providerRef}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY!,
          },
        },
      );
      if (!res.ok) {
        if (res.status === 404) {
          await ctx.runMutation(internal.momo.settleMomoFailure, {
            paymentId: args.paymentId,
            providerRef: tx.providerRef,
            reason: "Transaction introuvable côté MTN",
            expired: true,
          });
          return { status: "expiree" as const };
        }
        throw new Error(`Consultation MTN échouée (${res.status}).`);
      }
      const s = String(res.data.status);
      if (s === "SUCCESSFUL") {
        await ctx.runMutation(internal.momo.settleMomoSuccess, {
          paymentId: args.paymentId,
          providerRef: tx.providerRef,
        });
        return { status: "reussie" as const };
      }
      if (s === "FAILED" || s === "REJECTED") {
        await ctx.runMutation(internal.momo.settleMomoFailure, {
          paymentId: args.paymentId,
          providerRef: tx.providerRef,
          reason: `Statut MTN : ${s}`,
        });
        return { status: "echouee" as const };
      }
      return { status: "en_attente" as const }; // PENDING / ONGOING
    }

    // ---- Orange : pas d'API de consultation universelle publique —
    // le résultat arrive par notif_url (webhook) ; en attendant, la
    // transaction reste en attente et l'admin peut valider manuellement.
    return { status: "en_attente" as const };
  },
});
