// subscriptions.ts — modèle économique des abonnements professionnels GTEC PRO
//
// Règle économique (modèle 2026) :
//  • Aucune commission GTEC PRO sur les prestations (0 %) — le professionnel
//    conserve 100 % du montant payé par le client.
//  • GTEC PRO se rémunère via les abonnements professionnels ci-dessous.
//
// Tarifs de référence (modifiables par l'administration via la table
// `subscriptionPlans`). La remise affichée est TOUJOURS calculée par rapport
// au tarif mensuel de référence (10 000 FCFA/mois) : si la formule coûte plus
// cher que l'équivalent mensuel, on affiche « Aucune remise » — jamais de
// remise artificielle.

export const MONTHLY_REFERENCE_PRICE = 10_000; // FCFA / mois

export type PlanKey = "mensuel" | "trimestriel" | "semestriel" | "annuel";

export type SubscriptionPlan = {
  key: PlanKey;
  label: string;
  priceFcfa: number;
  months: number;
  advantages: string[];
  recommended?: boolean;
  defaultForNew?: boolean;
};

/** Avantages communs à toutes les formules (identiques par défaut). */
const COMMON_ADVANTAGES = [
  "Accès à la plateforme GTEC PRO",
  "Réception des demandes de clients correspondant à vos services",
  "Profil professionnel visible par les clients",
  "Envoi et réception de demandes de devis",
  "Gestion des interventions",
  "Communication avec les clients",
  "Suivi des prestations",
  "Gestion des revenus",
  "Développement de votre clientèle",
  "Badge professionnel vérifié après validation GTEC PRO",
];

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    key: "mensuel",
    label: "Mensuel",
    priceFcfa: 10_000,
    months: 1,
    advantages: COMMON_ADVANTAGES,
    defaultForNew: true,
  },
  {
    key: "trimestriel",
    label: "Trimestriel",
    priceFcfa: 48_000,
    months: 3,
    advantages: COMMON_ADVANTAGES,
  },
  {
    key: "semestriel",
    label: "Semestriel",
    priceFcfa: 55_000,
    months: 6,
    advantages: COMMON_ADVANTAGES,
  },
  {
    key: "annuel",
    label: "Annuel",
    priceFcfa: 100_000,
    months: 12,
    advantages: COMMON_ADVANTAGES,
    recommended: true,
  },
];

export function planByKey(key: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.key === key);
}

export function fcfa(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} FCFA`;
}

export type PlanPricing = {
  /** Équivalent mensuel (prix ÷ durée en mois), arrondi à l'unité. */
  monthlyEquivalent: number;
  /** Remise en % par rapport au mensuel de référence — null si aucune. */
  discountPercent: number | null;
  /** Libellé à afficher : « Remise : 8,33 % » ou « Aucune remise ». */
  discountLabel: string;
};

/**
 * Calcule l'équivalent mensuel et la remise réelle d'une formule.
 * Une remise n'est affichée que si le prix est STRICTEMENT inférieur au coût
 * des mois équivalents au tarif de référence.
 */
export function planPricing(plan: SubscriptionPlan): PlanPricing {
  const monthlyEquivalent = plan.priceFcfa / plan.months;
  const reference = MONTHLY_REFERENCE_PRICE * plan.months;
  const hasDiscount = plan.priceFcfa < reference;
  const discountPercent = hasDiscount
    ? ((reference - plan.priceFcfa) / reference) * 100
    : null;
  return {
    monthlyEquivalent: Math.round(monthlyEquivalent),
    discountPercent,
    discountLabel: hasDiscount
      ? `Remise : ${formatPercent(discountPercent!)}`
      : "Aucune remise",
  };
}

/** Formate un pourcentage à la française : 8,33 %. */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

/** « environ 9 167 FCFA/mois » pour l'affichage des cartes. */
export function monthlyEquivalentLabel(plan: SubscriptionPlan): string {
  const { monthlyEquivalent } = planPricing(plan);
  const exact = plan.priceFcfa % plan.months === 0;
  return `${exact ? "" : "environ "}${fcfa(monthlyEquivalent)}/mois`;
}

/** Jours restants avant expiration (0 si déjà expiré). */
export function daysRemaining(subscriptionUntil: number | undefined): number {
  if (!subscriptionUntil) return 0;
  return Math.max(0, Math.ceil((subscriptionUntil - Date.now()) / 86_400_000));
}

/** Statut d'abonnement : actif, expiré bientôt (≤ 7 jours) ou expiré. */
export function subscriptionStatus(subscriptionUntil: number | undefined): {
  active: boolean;
  expiringSoon: boolean;
  daysLeft: number;
  label: "Actif" | "Expire bientôt" | "Expiré";
} {
  const daysLeft = daysRemaining(subscriptionUntil);
  const active = daysLeft > 0;
  return {
    active,
    expiringSoon: active && daysLeft <= 7,
    daysLeft,
    label: !active ? "Expiré" : daysLeft <= 7 ? "Expire bientôt" : "Actif",
  };
}
