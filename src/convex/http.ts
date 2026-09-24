import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

// ---------- V5 : webhook de notification opérateur (Mobile Money) ----------

/**
 * Point de notification des opérateurs Mobile Money :
 *  - champ `notif_url` du paiement Orange Money Web Payment ;
 *  - `X-Callback-Url` (MOMO_CALLBACK_HOST + /api/momo-callback) des
 *    transactions MTN MoMo Collections.
 *
 * Corps Orange : { status: "SUCCESS"|"FAILED", notif_token, txnid, … }
 * Corps MTN    : { referenceId, status: "SUCCESSFUL"|"FAILED", … }
 *
 * Le webhook est authentifié par la simple connaissance de l'URL ; il ne
 * retourne jamais l'état interne (réponse vide HTTP 200).
 */
export const momoCallback = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    // Corps illisible : on répond 200 pour éviter les relances infinies.
    return new Response(null, { status: 200 });
  }

  const rawStatus = String(
    payload.status ?? payload.transactionStatus ?? payload.state ?? "",
  ).toUpperCase();
  const referenceId = String(
    payload.referenceId ?? payload.providerRef ?? payload.reference ?? "",
  );
  const externalId = payload.externalId ?? payload.paymentId;
  const txnId = String(payload.txnid ?? payload.transactionId ?? payload.id ?? "");

  // Localise la transaction : référence opérateur en priorité.
  let paymentId: string | null = null;
  if (referenceId) {
    const tx = (await ctx.runQuery(internal.gtec.txByProviderRef, {
      providerRef: referenceId,
    })) as { paymentId: string } | null;
    paymentId = tx?.paymentId ?? null;
  }
  if (!paymentId && typeof externalId === "string" && externalId.length > 0) {
    paymentId = externalId; // externalId = paymentId GTEC (requesttopay MTN)
  }
  if (!paymentId && txnId.length > 0) {
    const tx = (await ctx.runQuery(internal.gtec.txByProviderRef, {
      providerRef: txnId,
    })) as { paymentId: string } | null;
    paymentId = tx?.paymentId ?? null;
  }

  if (paymentId) {
    if (rawStatus.includes("SUCCESS")) {
      await ctx.runMutation(internal.momo.settleMomoSuccess, {
        paymentId: paymentId as never,
        providerRef: referenceId || txnId || "webhook",
      });
    } else if (rawStatus.includes("FAIL") || rawStatus.includes("REJECT")) {
      await ctx.runMutation(internal.momo.settleMomoFailure, {
        paymentId: paymentId as never,
        providerRef: referenceId || txnId || "webhook",
        reason: `Notification opérateur : ${rawStatus}`,
      });
    }
  }

  // Draine la file d'e-mails pour notifier le client sans attendre.
  await ctx.runAction(internal.emails.drainEmails, {});

  return new Response(null, { status: 200 });
});

http.route({
  path: "/api/momo-callback",
  method: "POST",
  handler: momoCallback,
});

// Route de contrôle d'existence du webhook (healthcheck).
http.route({
  path: "/api/momo-callback",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("GTEC PRO — momo-callback ready", { status: 200 });
  }),
});

// ---------- réplication du validator v (usage futur, évite l'import inutilisé) ----------
export const _reserved = v.optional(v.string());

export default http;
