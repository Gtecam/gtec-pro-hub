/**
 * MODE DIASPORA GTEC PRO — libellés, relations, devises et statuts de suivi.
 *
 * Un client vivant à l'étranger commande une intervention pour un proche au
 * Cameroun : bénéficiaires enregistrés, commande à distance, paiement
 * international (tokenisation chez le PSP — jamais de carte chez GTEC PRO),
 * suivi temps réel et validation à distance (§8 : fonds libérés après
 * validation quand le mécanisme le permet).
 */

/** Relations proches (§15). */
export const BENEFICIARY_RELATIONS = [
  "Maman",
  "Papa",
  "Frère",
  "Sœur",
  "Enfant",
  "Oncle",
  "Tante",
  "Grand-parent",
  "Locataire",
  "Employé",
  "Maison familiale",
  "Entreprise",
  "Moi-même",
  "Autre proche",
] as const;

export type BeneficiaryRelation = (typeof BENEFICIARY_RELATIONS)[number];

/** Icône indicative d'une relation (affichage liste « Pour qui ? »). */
export function relationIcon(relation: string): string {
  switch (relation) {
    case "Maman":
    case "Papa":
    case "Grand-parent":
      return "👤";
    case "Frère":
    case "Sœur":
    case "Enfant":
    case "Oncle":
    case "Tante":
      return "👥";
    case "Locataire":
      return "🏘️";
    case "Employé":
      return "🧑‍💼";
    case "Maison familiale":
      return "🏠";
    case "Entreprise":
      return "🏢";
    case "Moi-même":
      return "🙋";
    default:
      return "👥";
  }
}

// ============================== DEVISES =====================================

/**
 * Devises affichées au payeur international. Les taux sont **indicatifs**
 * (affichage avant validation) ; le montant final facturé par le PSP prime
 * toujours et est journalisé au retour du paiement.
 */
export const DIASPORA_CURRENCIES = [
  { code: "EUR", label: "Euro", flag: "🇪🇺", perXaf: 1 / 655.957 },
  { code: "USD", label: "Dollar US", flag: "🇺🇸", perXaf: 1 / 600 },
  { code: "GBP", label: "Livre sterling", flag: "🇬🇧", perXaf: 1 / 760 },
  { code: "CAD", label: "Dollar canadien", flag: "🇨🇦", perXaf: 1 / 440 },
  { code: "XAF", label: "FCFA (local)", flag: "🇨🇲", perXaf: 1 },
] as const;

export type DiasporaCurrencyCode = (typeof DIASPORA_CURRENCIES)[number]["code"];

/** Convertit un montant FCFA vers une devise affichage (2 décimales max). */
export function convertFromXaf(
  amountXaf: number,
  currency: DiasporaCurrencyCode,
): number {
  const c = DIASPORA_CURRENCIES.find((d) => d.code === currency);
  const v = (c?.perXaf ?? 1) * amountXaf;
  return Math.round(v * 100) / 100;
}

/** Affichage « 75 000 FCFA ≈ 114,34 EUR ». */
export function displayConverted(
  amountXaf: number,
  currency: DiasporaCurrencyCode,
): string {
  if (currency === "XAF") return `${amountXaf.toLocaleString("fr-FR")} FCFA`;
  const value = convertFromXaf(amountXaf, currency);
  return `${amountXaf.toLocaleString("fr-FR")} FCFA ≈ ${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Frais éventuels estimés du paiement international (indicatifs, affichés
 * avant validation — le montant final facturé par le PSP prime).
 */
export function estimatedInternationalFee(amountXaf: number): number {
  return Math.round(amountXaf * 0.029) + 250; // ~2,9 % + 250 FCFA (fixe)
}

// ===================== STATUTS DE SUIVI DIASPORA (§9) =======================

export type DiasporaTrackStep = {
  key: string;
  label: string;
  icon: string;
};

export const DIASPORA_TRACK: DiasporaTrackStep[] = [
  { key: "nouvelle", label: "Demande créée", icon: "🟡" },
  { key: "recherche", label: "Recherche d'un professionnel", icon: "🔵" },
  { key: "devis_emis", label: "Devis reçu", icon: "🟣" },
  { key: "devis_accepte", label: "Devis accepté", icon: "🟢" },
  { key: "paye", label: "Paiement confirmé", icon: "💳" },
  { key: "affectee", label: "Technicien en déplacement", icon: "🚗" },
  { key: "en_intervention", label: "Technicien arrivé · intervention en cours", icon: "🔧" },
  { key: "rapport_emis", label: "Intervention terminée · rapport disponible", icon: "📄" },
  { key: "terminee", label: "Validation et évaluation", icon: "⭐" },
];

/** Index de l'étape de suivi correspondant à un statut du pipeline. */
export function diasporaTrackIndex(status: string): number {
  const i = DIASPORA_TRACK.findIndex((s) => s.key === status);
  if (i >= 0) return i;
  if (status === "annulee") return -1;
  return 0;
}

// ===================== PROPOSITION DE DEVISE PAR PAYS =======================

/** Devise suggérée selon le pays de résidence déclaré (formulaire simple). */
export function suggestedCurrency(country: string): DiasporaCurrencyCode {
  const c = country.trim().toLowerCase();
  if (/(france|belgique|luxembourg|allemagne|espagne|italie|portugal|suisse|pays-bas|europe)/.test(c))
    return "EUR";
  if (/(canada|québec|quebec)/.test(c)) return "CAD";
  if (/(royaume-uni|angleterre|england|uk|united kingdom)/.test(c)) return "GBP";
  if (/(usa|united states|états-unis|etats-unis|amérique|amerique)/.test(c)) return "USD";
  return "EUR";
}
