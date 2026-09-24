import {
  Zap,
  Cable,
  Factory,
  Sun,
  Network,
  Home,
  Flame,
  Gauge,
  Wind,
  Building2,
  Wrench,
  Package,
} from "lucide-react";

// ---------- services (écran « Que souhaitez-vous faire ? ») ----------
// Les 12 domaines officiels GTEC PRO (cahier des charges §4).

export const SERVICES = [
  {
    key: "cfo",
    label: "Courant Fort — CFO",
    desc: "Installations électriques, tableaux, distribution, mise aux normes",
    icon: Zap,
  },
  {
    key: "hta",
    label: "Haute Tension — HTA",
    desc: "Lignes MT/BT, postes de transformation, comptage",
    icon: Cable,
  },
  {
    key: "industrie",
    label: "Industrie & automatisme",
    desc: "Automatismes, moteurs, armoires de commande, régulation",
    icon: Factory,
  },
  {
    key: "solaire",
    label: "Solaire & énergie",
    desc: "Kits solaires, onduleurs, batteries, autonomie énergétique",
    icon: Sun,
  },
  {
    key: "cfa",
    label: "Courant Faible — CFA",
    desc: "Réseaux, VDI, fibre, vidéosurveillance, interphonie",
    icon: Network,
  },
  {
    key: "domotique",
    label: "Domotique",
    desc: "Bâtiments intelligents, éclairage et accès connectés",
    icon: Home,
  },
  {
    key: "incendie",
    label: "Sécurité incendie",
    desc: "Détection, alarmes, désenfumage, extincteurs",
    icon: Flame,
  },
  {
    key: "inspection",
    label: "Inspection & diagnostic",
    desc: "Thermographie, audits énergétiques, mesures électriques",
    icon: Gauge,
  },
  {
    key: "hvac",
    label: "Climatisation, HVAC & froid",
    desc: "Split, central, chambres froides, entretien",
    icon: Wind,
  },
  {
    key: "batiment",
    label: "Bâtiment & infrastructures",
    desc: "Génie civil léger, réhabilitation, supports et chemins de câbles",
    icon: Building2,
  },
  {
    key: "maintenance",
    label: "Maintenance & contrats",
    desc: "Contrats préventifs, visites périodiques programmées",
    icon: Wrench,
  },
  {
    key: "fourniture",
    label: "Fourniture de matériel",
    desc: "Câbles, disjoncteurs, panneaux, éclairage — GTEC Store",
    icon: Package,
  },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];

/** Pôles bâtiment « entreprise » — ciblés pour les contrats de maintenance. */
export const ENTERPRISE_SERVICES = [
  "electricite",
  "climatisation",
  "maintenance",
  "reseau",
  "cctv",
] as const;

export const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Buea", "Garoua"] as const;

/**
 * Types de clients officiels GTEC (cahier des charges §5) — 7 profils.
 * Types « organisés » : champs raison sociale / NUI affichés au formulaire.
 */
export const CUSTOMER_TYPES = [
  { key: "particulier", label: "Particulier", company: false },
  { key: "professionnel", label: "Professionnel (artisan, libéral)", company: false },
  { key: "entreprise", label: "Entreprise", company: true },
  { key: "hotel", label: "Hôtel / hébergement", company: true },
  { key: "industrie", label: "Industrie / usine", company: true },
  { key: "promoteur", label: "Promoteur / BTP", company: true },
  { key: "institution", label: "Institution / administration", company: true },
] as const;

export type CustomerTypeKey = (typeof CUSTOMER_TYPES)[number]["key"];

export function customerTypeLabel(key: string | undefined): string {
  return CUSTOMER_TYPES.find((t) => t.key === key)?.label ?? "Particulier";
}

export function customerTypeNeedsCompany(key: string | undefined): boolean {
  return CUSTOMER_TYPES.find((t) => t.key === key)?.company ?? false;
}

// ---------- pipeline V1 (un seul parcours) ----------

export const JOURNEY_STEPS = [
  { key: "nouvelle", label: "Demande" },
  { key: "devis", label: "Devis" },
  { key: "paiement", label: "Paiement" },
  { key: "affectation", label: "Équipe" },
  { key: "intervention", label: "Intervention" },
  { key: "rapport", label: "Rapport" },
  { key: "reception", label: "Réception" },
  { key: "facture", label: "Facture" },
] as const;

export type RequestStatus =
  | "nouvelle"
  | "devis_emis"
  | "devis_accepte"
  | "paye"
  | "affectee"
  | "en_intervention"
  | "rapport_emis"
  | "terminee"
  | "annulee";

export const STATUS_META: Record<
  RequestStatus,
  { label: string; stepIndex: number; variant: "amber" | "sky" | "green" | "gray" | "red"; hint: string }
> = {
  nouvelle: {
    label: "Demande envoyée",
    stepIndex: 1,
    variant: "amber",
    hint: "GTEC prépare votre devis.",
  },
  devis_emis: {
    label: "Devis à valider",
    stepIndex: 2,
    variant: "amber",
    hint: "Consultez le devis et acceptez-le pour continuer.",
  },
  devis_accepte: {
    label: "Devis accepté",
    stepIndex: 3,
    variant: "amber",
    hint: "Réglez le devis par Mobile Money pour lancer l'intervention.",
  },
  paye: {
    label: "Paiement validé",
    stepIndex: 4,
    variant: "sky",
    hint: "GTEC affecte votre équipe d'intervention.",
  },
  affectee: {
    label: "Équipe affectée",
    stepIndex: 5,
    variant: "sky",
    hint: "Votre intervention est planifiée.",
  },
  en_intervention: {
    label: "En intervention",
    stepIndex: 5,
    variant: "sky",
    hint: "L'équipe travaille sur place.",
  },
  rapport_emis: {
    label: "Rapport à réceptionner",
    stepIndex: 7,
    variant: "amber",
    hint: "Vérifiez le travail, puis signez le PV de réception.",
  },
  terminee: {
    label: "Terminée",
    stepIndex: 8,
    variant: "green",
    hint: "Intervention réceptionnée, facture disponible.",
  },
  annulee: {
    label: "Annulée",
    stepIndex: 0,
    variant: "red",
    hint: "Cette demande a été annulée.",
  },
};

export function statusMeta(status: string) {
  return (
    STATUS_META[status as RequestStatus] ?? {
      label: status,
      stepIndex: 1,
      variant: "gray" as const,
      hint: "",
    }
  );
}

/** Étapes franchies selon le statut (pour le stepper). */
export function completedSteps(status: string): number {
  if (status === "terminee") return 8;
  if (status === "annulee") return 0;
  const m = statusMeta(status);
  return Math.max(0, m.stepIndex - 1);
}

/** Prochaine action attendue, côté client. */
export function clientNextAction(status: string): string | null {
  switch (status) {
    case "devis_emis":
      return "Valider le devis";
    case "devis_accepte":
      return "Payer le devis";
    case "rapport_emis":
      return "Signer le PV";
    default:
      return null;
  }
}

// ---------- suggestion d'équipe (moteur d'affectation simplifié V1) ----------

const TEAM_RULES: Record<string, { leaderHint: string; members: string[] }> = {
  cfo: { leaderHint: "CFO", members: ["bâtiment", "CFA"] },
  hta: { leaderHint: "HTA", members: ["CFO"] },
  industrie: { leaderHint: "automatisme", members: ["CFO", "industri"] },
  solaire: { leaderHint: "Solaire", members: ["CFO", "bâtiment"] },
  cfa: { leaderHint: "courant faible", members: ["réseau", "CCTV"] },
  domotique: { leaderHint: "domotique", members: ["courant faible", "CFO"] },
  incendie: { leaderHint: "incendie", members: ["courant faible", "CFO"] },
  inspection: { leaderHint: "inspection", members: ["thermograph", "CFO"] },
  hvac: { leaderHint: "Climatisation", members: ["froid", "bâtiment"] },
  batiment: { leaderHint: "bâtiment", members: ["CFO"] },
  maintenance: { leaderHint: "CFO", members: ["bâtiment", "Climatisation"] },
  fourniture: { leaderHint: "CFO", members: [] },
};

export function suggestCrew(
  serviceKey: string,
  techs: { id: string; name: string; specialty?: string }[],
): { leaderId: string | null; memberIds: string[]; total: number } {
  const rule = TEAM_RULES[serviceKey] ?? TEAM_RULES.cfo;
  const matches = (specialty: string | undefined, hint: string) =>
    !!specialty && specialty.toLowerCase().includes(hint.toLowerCase());
  const leader =
    techs.find((t) => matches(t.specialty, rule.leaderHint)) ?? techs[0] ?? null;
  const leaderId = leader ? leader.id : null;
  const memberIds: string[] = [];
  for (const hint of rule.members) {
    const found = techs.find(
      (t) => t.id !== leaderId && !memberIds.includes(t.id) && matches(t.specialty, hint),
    );
    if (found) memberIds.push(found.id);
  }
  return { leaderId, memberIds, total: memberIds.length + (leaderId ? 1 : 0) };
}

// ---------- formatage ----------

export function fcfa(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export function formatDateTime(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", { dateStyle: "long" });
}

export const PAYMENT_METHODS = [
  { key: "mtn_momo", label: "MTN MoMo", hint: "Paiement mobile MTN" },
  { key: "orange_money", label: "Orange Money", hint: "Paiement mobile Orange" },
  { key: "carte_visa", label: "Carte Visa", hint: "Entreprises · paiement en ligne" },
  { key: "virement", label: "Virement bancaire", hint: "Entreprises · transfert bancaire" },
  { key: "especes", label: "Espèces", hint: "Comptant avec preuve du reçu" },
] as const;

/**
 * Numéros marchands officiels GTEC pour les paiements Mobile Money
 * (cahier des charges §9 : Orange Money 655 547 649 · MTN MoMo 678 202 824).
 */
export const MERCHANT_NUMBERS = {
  orange_money: { number: "655 54 76 49", tel: "+237655547649", label: "Orange Money" },
  mtn_momo: { number: "678 20 28 24", tel: "+237678202824", label: "MTN MoMo" },
} as const;

/** Service clientèle officiel Green Tech Energy Cameroon (§20). */
export const SUPPORT_PHONE = {
  number: "655 09 42 28",
  tel: "+237655094228",
  label: "Service clientèle GTEC",
} as const;

/** Coordonnées bancaires GTEC (virements entreprises). */
export const BANK_DETAILS = {
  bank: "Afriland First Bank",
  iban: "CM21 1000 5000 1523 4567 8901 234",
  beneficiary: "GTEC PRO Sarl",
} as const;

// ---------- abonnements techniciens (paiement Mobile Money vérifié) ----------

/**
 * Formules d'abonnement technicien (cahier des charges §14) :
 * mensuel 2 500 · trimestriel 9 000 · annuel modifiable par l'administration.
 */
export const SUBSCRIPTION_PLANS = [
  { key: "mensuel", label: "Mensuel", price: 2500, days: 30, hint: "1 mois" },
  { key: "trimestriel", label: "Trimestriel", price: 9000, days: 90, hint: "3 mois" },
  { key: "annuel", label: "Annuel", price: 30000, days: 365, hint: "12 mois · tarif à confirmer par l'administration" },
] as const;

export type SubscriptionPlanKey = (typeof SUBSCRIPTION_PLANS)[number]["key"];

// ---------- rémunération techniciens (règles GTEC V1) ----------

/**
 * Commission GTEC obligatoire : 15 % de chaque intervention (cahier des
 * charges §10). Base = montant total de l'intervention (TTC du devis).
 * Le reste (85 %) revient à l'équipe selon la répartition ci-dessous.
 */
export const GTEC_COMMISSION_PERCENT = 15;
export const TEAM_SHARE_PERCENT = 100 - GTEC_COMMISSION_PERCENT;
export const LEADER_WEIGHT = 1.5;
export const MEMBER_WEIGHT = 1;

/** Commission GTEC due sur une intervention (15 % du montant TTC). */
export function commissionFor(quoteTotal: number): number {
  return Math.round((quoteTotal * GTEC_COMMISSION_PERCENT) / 100);
}

export function payoutFor(
  quoteTotal: number,
  role: string,
  crewSize: number,
): { amount: number; sharePercent: number } {
  const teamPot = Math.round((quoteTotal * TEAM_SHARE_PERCENT) / 100);
  const weight = role === "Chef d'équipe" ? LEADER_WEIGHT : MEMBER_WEIGHT;
  const totalWeights = LEADER_WEIGHT + (crewSize - 1) * MEMBER_WEIGHT;
  const amount = Math.round((teamPot * weight) / (totalWeights || 1));
  return { amount, sharePercent: TEAM_SHARE_PERCENT };
}

// ---------- contrats de maintenance préventive (V2) ----------

export const CONTRACT_FREQUENCIES = [
  { key: "mensuel", label: "Mensuel", days: 30 },
  { key: "trimestriel", label: "Trimestriel", days: 90 },
  { key: "semestriel", label: "Semestriel", days: 180 },
  { key: "annuel", label: "Annuel", days: 365 },
] as const;

export type ContractFrequency = (typeof CONTRACT_FREQUENCIES)[number]["key"];

export function contractFrequencyLabel(key: string): string {
  return CONTRACT_FREQUENCIES.find((f) => f.key === key)?.label ?? key;
}

export const CONTRACT_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  actif: {
    label: "Actif",
    className: "bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  suspendu: {
    label: "Suspendu",
    className: "bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300",
  },
  expire: {
    label: "Expiré",
    className: "bg-muted text-muted-foreground ring-border",
  },
  resilie: {
    label: "Résilié",
    className: "bg-red-100 text-red-700 ring-red-600/20 dark:bg-red-950/50 dark:text-red-300",
  },
};

/**
 * Calcule la date de la prochaine visite périodique :
 * à partir de la dernière visite faite (ou de la date de début du
 * contrat), on ajoute l'intervalle de la fréquence jusqu'à dépasser
 * la date de référence.
 */
export function nextVisitAfter(
  frequency: ContractFrequency,
  lastVisitAt: number,
): number {
  const days = CONTRACT_FREQUENCIES.find((f) => f.key === frequency)?.days ?? 90;
  const step = days * 24 * 3600 * 1000;
  const now = Date.now();
  let next = lastVisitAt + step;
  while (next < now) next += step;
  return next;
}
