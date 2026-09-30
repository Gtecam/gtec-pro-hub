/**
 * GTEC PRO 2.0 (§2E, §20, §50) — couche d'abstraction des paiements.
 *
 * Objectifs du cahier des charges :
 *  - remplacer un fournisseur sans reconstruire l'application (§2E) ;
 *  - escrow / paiement sécurisé via un prestataire agréé (§20) ;
 *  - ne jamais stocker de données de carte (§29) : le checkout hébergé
 *    (redirection) garantit la tokenisation chez le prestataire.
 *
 * Canaux supportés :
 *  1. `cinetpay`      — agrégateur agréé Établissement de Paiement (BEAC/CEMAC) :
 *                       MTN MoMo + Orange Money + Visa/Mastercard via un
 *                       checkout hébergé unique, payouts (Mass Payout) pour les
 *                       retraits techniciens. Canal recommandé.
 *  2. `mtn_direct`    — MTN MoMo Collections (déjà intégré, momo.ts).
 *  3. `orange_direct` — Orange Money Web Payment (déjà intégré, momo.ts).
 *  4. `demo`          — aucune clé configurée : déclaration manuelle avec
 *                       preuve (flux existant), validée par l'administration.
 *
 * Ce module est volontairement sans dépendance : il ne manipule que des
 * objets JSON et peut être utilisé depuis les actions Convex comme de l'UI.
 */

// ---------- canaux ----------

export type PaymentChannel = "cinetpay" | "mtn_direct" | "orange_direct" | "demo";

export type ChannelAvailability = {
  channel: PaymentChannel;
  label: string;
  available: boolean;
  /** Ce que le marchand doit configurer pour activer le canal. */
  missingKeys: string[];
};

/** Clés requises par canal (onglet Clés / API keys du projet). */
export const CHANNEL_KEY_REQUIREMENTS: Record<Exclude<PaymentChannel, "demo">, string[]> = {
  cinetpay: ["CINETPAY_API_KEY", "CINETPAY_SITE_ID"],
  mtn_direct: ["MOMO_SUBSCRIPTION_KEY", "MOMO_API_USER", "MOMO_API_KEY"],
  orange_direct: ["ORANGE_CLIENT_ID", "ORANGE_CLIENT_SECRET", "ORANGE_MERCHANT_KEY"],
};

/**
 * Disponibilité effective des canaux selon les clés présentes dans
 * l'environnement du backend (process.env côté action Convex).
 */
export function getAvailableChannels(env: Record<string, string | undefined>): ChannelAvailability[] {
  const check = (channel: Exclude<PaymentChannel, "demo">): ChannelAvailability => {
    const missingKeys = CHANNEL_KEY_REQUIREMENTS[channel].filter((k) => !env[k]);
    return {
      channel,
      available: missingKeys.length === 0,
      missingKeys,
      label:
        channel === "cinetpay"
          ? "CinetPay — MoMo + carte bancaire (checkout sécurisé)"
          : channel === "mtn_direct"
            ? "MTN MoMo (push USSD direct)"
            : "Orange Money (redirection opérateur)",
    };
  };
  return [check("cinetpay"), check("mtn_direct"), check("orange_direct")];
}

// ---------- collecte (checkout / push) ----------

export type CollectRequest = {
  /** Montant en FCFA (XAF), entier positif. */
  amountXaf: number;
  /** Libellé affiché au payeur. */
  description: string;
  /** Téléphone du payeur — requis pour les push USSD, optionnel CinetPay. */
  customerPhone?: string;
  /** Référence marchande unique (idempotence). */
  merchantReference: string;
  /** URLs de retour / notification. */
  returnUrl?: string;
  notifyUrl?: string;
  /** Canaux autorisés chez l'agrégateur ("ALL", "MOBILE_MONEY", "CREDIT_CARD"). */
  channels?: string;
};

export type CollectResponse =
  | {
      kind: "redirect";
      /** URL du checkout hébergé (tokenisation carte + MoMo chez le PSP). */
      url: string;
      merchantReference: string;
    }
  | {
      kind: "ussd_push";
      /** Demande de paiement créée : le client confirme sur son téléphone. */
      merchantReference: string;
    }
  | {
      kind: "demo";
      merchantReference: string;
    };

/** Point d'entrée de collecte CinetPay (POST /v2/payment). */
export function cinetPayCollectPayload(req: CollectRequest, keys: { apiKey: string; siteId: string }) {
  const phone = req.customerPhone?.replace(/\D/g, "").slice(-9);
  return {
    apikey: keys.apiKey,
    site_id: keys.siteId,
    transaction_id: req.merchantReference,
    amount: Math.round(req.amountXaf),
    currency: "XAF",
    description: req.description.slice(0, 250),
    ...(phone ? { customer_phone_number: `237${phone}` } : {}),
    ...(req.notifyUrl ? { notify_url: req.notifyUrl } : {}),
    ...(req.returnUrl ? { return_url: req.returnUrl } : {}),
    channels: req.channels ?? "ALL", // MoMo + cartes — cf. §23/§29/§30
    lang: "fr",
  };
}

export const CINETPAY_BASE = "https://api-checkout.cinetpay.com/v2/payment";

// ---------- statuts ----------

export type PaymentOutcome = "reussie" | "echouee" | "en_attente";

/**
 * Mappe le statut brut CinetPay (champ `data.status` du check ou du webhook)
 * vers le statut GTEC. Références : ACCEPTED, REFUSED, BLOCKED (succès/refus)
 * et WAITING_FOR_CUSTOMER, WAITING_FOR_TRANSFER, … (attente).
 */
export function mapCinetPayStatus(rawStatus: string | undefined): PaymentOutcome {
  const s = String(rawStatus ?? "").toUpperCase();
  if (["ACCEPTED", "SUCCES", "SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(s)) {
    return "reussie";
  }
  if (["REFUSED", "FAILED", "CANCELLED", "BLOCKED", "EXPIRED"].includes(s)) {
    return "echouee";
  }
  return "en_attente";
}

/** Statuts opérateurs directs déjà utilisés par momo.ts (aide au mapping). */
export function mapMtnStatus(s: string): PaymentOutcome {
  if (s === "SUCCESSFUL") return "reussie";
  if (s === "FAILED" || s === "REJECTED") return "echouee";
  return "en_attente";
}

// ---------- webhook ----------

/**
 * Vérifie la charge utile d'un webhook CinetPay. La pratique recommandée
 * CinetPay est la **vérification par re-requête serveur** : on ne fait jamais
 * confiance au corps du POST, on ré-interroge `/v2/payment/check` avec la
 * transaction_id reçue. Cette fonction extrait et normalise les champs utiles.
 */
export function extractCinetPayWebhook(payload: Record<string, unknown>): {
  transactionId: string;
  rawStatus: string;
  operatorId: string;
  paymentMethod: string;
} | null {
  const transactionId = String(payload.transaction_id ?? payload.transactionId ?? "");
  if (!transactionId) return null;
  return {
    transactionId,
    rawStatus: String(payload.status ?? payload.data_status ?? payload.state ?? ""),
    operatorId: String(
      (payload.data as Record<string, unknown> | undefined)?.operator_id ??
        payload.operator_id ??
        "",
    ),
    paymentMethod: String(
      (payload.data as Record<string, unknown> | undefined)?.payment_method ??
        payload.payment_method ??
        "",
    ),
  };
}

/**
 * Vérification HMAC (optionnelle, pour les PSP qui la fournissent) via
 * WebCrypto — disponible dans l'isolat Convex. `rawBody` doit être la charge
 * utile EXACTE reçue (avant parsing JSON).
 */
export async function verifyWebhookHmac(
  rawBody: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const expected = [...new Uint8Array(mac)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return expected === signatureHex.toLowerCase();
  } catch {
    return false;
  }
}

// ---------- payouts (retraits techniciens, §28) ----------

/** Requête de transfert CinetPay Mass Payout vers un wallet Mobile Money. */
export function cinetPayTransferPayload(
  req: {
    merchantReference: string;
    amountXaf: number;
    /** 9 chiffres du wallet bénéficiaire. */
    beneficiaryPhone: string;
    beneficiaryName?: string;
  },
  keys: { apiKey: string },
) {
  return {
    apikey: keys.apiKey,
    transaction_id: req.merchantReference,
    amount: Math.round(req.amountXaf),
    currency: "XAF",
    prefix: "237",
    phone: req.beneficiaryPhone.replace(/\D/g, "").slice(-9),
    ...(req.beneficiaryName ? { name: req.beneficiaryName } : {}),
  };
}

export const CINETPAY_TRANSFER_BASE = "https://client.cinetpay.com/v2";

// ---------- gardes communes ----------

/** Montant valide pour une collecte (CinetPay : >= 100 XAF, entier). */
export function isValidCollectAmount(xaf: number): boolean {
  return Number.isFinite(xaf) && xaf >= 100 && Math.round(xaf) === xaf;
}

/** Référence marchande unique, lisible et bornée. */
export function buildMerchantReference(prefix: string, paymentId: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const base = `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
  return `${base}P${paymentId.slice(-6)}`.slice(0, 50);
}
