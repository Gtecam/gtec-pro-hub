import { Zap, Droplets, Sun, Camera, Wind, Wrench } from "lucide-react";

// ---------- services (écran « Que souhaitez-vous faire ? ») ----------

export const SERVICES = [
  {
    key: "electricite",
    label: "Électricité",
    desc: "Dépannage, installation, mise aux normes",
    icon: Zap,
  },
  {
    key: "plomberie",
    label: "Plomberie",
    desc: "Fuites, sanitaires, pompes à eau",
    icon: Droplets,
  },
  {
    key: "solaire",
    label: "Solaire",
    desc: "Kits solaires, onduleurs, batteries",
    icon: Sun,
  },
  {
    key: "cctv",
    label: "CCTV",
    desc: "Caméras, alarmes, vidéosurveillance",
    icon: Camera,
  },
  {
    key: "climatisation",
    label: "Climatisation",
    desc: "Split, central, entretien froid",
    icon: Wind,
  },
  {
    key: "maintenance",
    label: "Maintenance",
    desc: "Contrats et visites préventives",
    icon: Wrench,
  },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];

export const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Buea", "Garoua"] as const;

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
  electricite: {
    leaderHint: "CFO",
    members: ["bâtiment"],
  },
  plomberie: {
    leaderHint: "Plomberie",
    members: ["Plomberie"],
  },
  solaire: {
    leaderHint: "Solaire",
    members: ["Solaire", "bâtiment"],
  },
  cctv: {
    leaderHint: "CCTV",
    members: ["CCTV", "bâtiment"],
  },
  climatisation: {
    leaderHint: "Climatisation",
    members: ["Climatisation", "bâtiment"],
  },
  maintenance: {
    leaderHint: "CFO",
    members: ["bâtiment", "Climatisation"],
  },
};

export function suggestCrew(
  serviceKey: string,
  techs: { id: string; name: string; specialty?: string }[],
): { leaderId: string | null; memberIds: string[]; total: number } {
  const rule = TEAM_RULES[serviceKey] ?? TEAM_RULES.electricite;
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

/** Numéros marchands GTEC pour les paiements Mobile Money. */
export const MERCHANT_NUMBERS = {
  orange_money: { number: "655 09 42 28", tel: "+237655094228", label: "Orange Money" },
  mtn_momo: { number: "678 20 28 24", tel: "+237678202824", label: "MTN MoMo" },
} as const;

/** Coordonnées bancaires GTEC (virements entreprises). */
export const BANK_DETAILS = {
  bank: "Afriland First Bank",
  iban: "CM21 1000 5000 1523 4567 8901 234",
  beneficiary: "GTEC PRO Sarl",
} as const;

// ---------- abonnements techniciens (paiement Mobile Money vérifié) ----------

export const SUBSCRIPTION_PLANS = [
  { key: "mensuel", label: "Mensuel", price: 5000, days: 30, hint: "30 jours" },
  { key: "trimestriel", label: "Trimestriel", price: 12000, days: 90, hint: "90 jours · 20 % de réduction" },
  { key: "annuel", label: "Annuel", price: 40000, days: 365, hint: "365 jours · 33 % de réduction" },
] as const;

export type SubscriptionPlanKey = (typeof SUBSCRIPTION_PLANS)[number]["key"];

// ---------- rémunération techniciens (règles GTEC V1) ----------

/**
 * Part du montant TTC reversée à l'équipe : 60 % du devis.
 * Répartition interne : chef d'équipe 1,5 part · technicien 1 part.
 */
export const TEAM_SHARE_PERCENT = 60;
export const LEADER_WEIGHT = 1.5;
export const MEMBER_WEIGHT = 1;

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
