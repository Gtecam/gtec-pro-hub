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
  { key: "virement", label: "Virement bancaire", hint: "Transfert bancaire" },
  { key: "especes", label: "Espèces (agence)", hint: "Paiement sur place" },
] as const;
