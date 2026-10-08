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
  type LucideIcon,
} from "lucide-react";
import { nomenMatchScore } from "./nomenclature";

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

// ---------- catalogue dynamique (V4) : catégories gérées par l'administration ----------

/**
 * Icônes lucide disponibles pour les catégories dynamiques. Une clé inconnue
 * retombe sur l'icône générique « Wrench ».
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
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
};

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Wrench;
}

/**
 * Catégories par défaut (les 12 domaines officiels GTEC PRO, §4). Elles sont
 * injectées en base au premier lancement et restent ensuite modifiables par
 * l'administration depuis la console (ajout, modification, désactivation,
 * suppression, sous-catégories incluses).
 */
export const DEFAULT_CATEGORIES: {
  key: ServiceKey;
  label: string;
  description: string;
  icon: string;
  subcategories: string[];
}[] = [
  {
    key: "cfo",
    label: "Courant Fort — CFO",
    description: "Installations électriques, tableaux, distribution, mise aux normes",
    icon: "Zap",
    subcategories: [
      "Panne générale",
      "Disjoncteur",
      "Prise",
      "Éclairage",
      "Tableau électrique",
      "Court-circuit",
      "Mise aux normes",
      "Autre",
    ],
  },
  {
    key: "hta",
    label: "Haute Tension — HTA",
    description: "Lignes MT/BT, postes de transformation, comptage",
    icon: "Cable",
    subcategories: ["Poste de transformation", "Ligne MT", "Comptage", "Autre"],
  },
  {
    key: "industrie",
    label: "Industrie & automatisme",
    description: "Automatismes, moteurs, armoires de commande, régulation",
    icon: "Factory",
    subcategories: ["Automatisme", "Moteur", "Armoire de commande", "Régulation", "Autre"],
  },
  {
    key: "solaire",
    label: "Solaire & énergie",
    description: "Kits solaires, onduleurs, batteries, autonomie énergétique",
    icon: "Sun",
    subcategories: ["Installation kit", "Onduleur", "Batterie", "Maintenance", "Autre"],
  },
  {
    key: "cfa",
    label: "Courant Faible — CFA",
    description: "Réseaux, VDI, fibre, vidéosurveillance, interphonie",
    icon: "Network",
    subcategories: ["Réseau / VDI", "Vidéosurveillance", "Interphonie", "Fibre", "Autre"],
  },
  {
    key: "domotique",
    label: "Domotique",
    description: "Bâtiments intelligents, éclairage et accès connectés",
    icon: "Home",
    subcategories: ["Éclairage connecté", "Contrôle d'accès", "Scénarios", "Autre"],
  },
  {
    key: "incendie",
    label: "Sécurité incendie",
    description: "Détection, alarmes, désenfumage, extincteurs",
    icon: "Flame",
    subcategories: ["Détection", "Alarme", "Extincteurs", "Désenfumage", "Autre"],
  },
  {
    key: "inspection",
    label: "Inspection & diagnostic",
    description: "Thermographie, audits énergétiques, mesures électriques",
    icon: "Gauge",
    subcategories: ["Thermographie", "Audit énergétique", "Mesures électriques", "Autre"],
  },
  {
    key: "hvac",
    label: "Climatisation, HVAC & froid",
    description: "Split, central, chambres froides, entretien",
    icon: "Wind",
    subcategories: ["Split", "Centrale", "Chambre froide", "Entretien", "Autre"],
  },
  {
    key: "batiment",
    label: "Bâtiment & infrastructures",
    description: "Génie civil léger, réhabilitation, supports et chemins de câbles",
    icon: "Building2",
    subcategories: ["Génie civil", "Réhabilitation", "Chemins de câbles", "Autre"],
  },
  {
    key: "maintenance",
    label: "Maintenance & contrats",
    description: "Contrats préventifs, visites périodiques programmées",
    icon: "Wrench",
    subcategories: ["Visite préventive", "Dépannage", "Contrat nouveau", "Autre"],
  },
  {
    key: "fourniture",
    label: "Fourniture de matériel",
    description: "Câbles, disjoncteurs, panneaux, éclairage — GTEC Store",
    icon: "Package",
    subcategories: ["Câbles", "Disjoncteurs", "Éclairage", "Panneaux", "Autre"],
  },
];

/** Slugify un libellé en clé stable (pour les nouvelles catégories). */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "cat";
}

/** Pôles bâtiment « entreprise » — ciblés pour les contrats de maintenance. */
export const ENTERPRISE_SERVICES = [
  "electricite",
  "climatisation",
  "maintenance",
  "reseau",
  "cctv",
] as const;

export const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Buea", "Garoua"] as const;

/** Taille maximale d'un document ou photo soumis (5 Mo par fichier). */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
/** Libellé lisible de la limite (messages UI). */
export const MAX_FILE_SIZE_LABEL = "5 Mo";

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
    label: "Avance payée",
    stepIndex: 4,
    variant: "sky",
    hint: "Avance de 50 % reçue — GTEC affecte votre équipe.",
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
    hint: "L'équipe travaille sur place. Le solde (50 %) sera exigé à la fin des travaux.",
  },
  rapport_emis: {
    label: "Rapport à réceptionner",
    stepIndex: 7,
    variant: "amber",
    hint: "Réglez le solde (50 %) puis vérifiez le travail et signez le PV.",
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
      return "Payer l'avance (50 %)";
    case "rapport_emis":
      return "Payer le solde & signer le PV";
    default:
      return null;
  }
}

// ---------- paiement en 2 tranches (V6 : 50 % avant / 50 % après) ----------

export const ADVANCE_PERCENT = 50; // tranche 1 : AVANT le début des travaux
export const BALANCE_PERCENT = 50; // tranche 2 : à la fin des travaux

export const MILESTONE_LABELS: Record<string, string> = {
  avance: "Avance — avant les travaux",
  solde: "Solde — à la fin des travaux",
};

/** Parts de chaque tranche (arrondiFCFA, le solde absorbe la différence). */
export function splitFiftyFifty(total: number): { advance: number; balance: number } {
  const advance = Math.round((total * ADVANCE_PERCENT) / 100);
  return { advance, balance: Math.max(0, total - advance) };
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

/**
 * Coordonnées approximatives des villes d'intervention (moteur géo V6).
 * Elles servent à rapprocher l'équipe du chantier : la distance par
 * haversine trie les techniciens du plus proche au plus éloigné.
 */
// ===== Téléphone Cameroun (+237) — authentification et profils =====

export const CM_COUNTRY_CODE = "+237";

/** Préfixes mobiles camerounais (MTN, Orange, Nexttel/Vanco, Camtel). */
const CM_MOBILE_PREFIXES = [
  "67", "68", "650", "651", "652", "653", "654", "655", "656", "657",
  "658", "659", "66", "680", "681", "682", "683", "69", "62", "242", "243",
  "233", "222",
];

/**
 * Convertit une saisie en numéro camerounais : renvoie les 9 chiffres locaux
 * (ex. "655094228") ou null si le numéro n'est pas un mobile camerounais.
 * Accepte 9 chiffres, +237…, 237… ou 00 237….
 */
export function toCmLocal(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00237")) digits = digits.slice(5);
  else if (digits.startsWith("237")) digits = digits.slice(3);
  if (digits.length !== 9) return null;
  if (!CM_MOBILE_PREFIXES.some((p) => digits.startsWith(p))) return null;
  return digits;
}

/** Affichage lisible : "655 09 42 28" (+ indicatif en option). */
export function formatCmPhone(local9: string, withCode = false): string {
  const d = local9.replace(/\D/g, "").slice(-9);
  const pretty = `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  return withCode ? `${CM_COUNTRY_CODE} ${pretty}` : pretty;
}

export const CITY_GEO: Record<string, { lat: number; lon: number }> = {
  Douala: { lat: 4.0511, lon: 9.7679 },
  Yaoundé: { lat: 3.848, lon: 11.5021 },
  Bafoussam: { lat: 5.4781, lon: 10.4179 },
  Buea: { lat: 4.1527, lon: 9.241 },
  Garoua: { lat: 9.3265, lon: 13.3981 },
};

/** Distance en km entre deux positions GPS brutes (haversine). */
export function haversinePositions(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Distance approximative en km entre deux villes (haversine). */
export function cityDistanceKm(a: string, b: string): number {
  const A = CITY_GEO[a];
  const B = CITY_GEO[b];
  if (!A || !B) return 9999; // ville inconnue : pire score
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(B.lat - A.lat);
  const dLon = toRad(B.lon - A.lon);
  const lat1 = toRad(A.lat);
  const lat2 = toRad(B.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

/**
 * V6 : constitution d'équipe (≥ 2 personnes) selon la zone géographique et
 * la spécialité du chantier, puis choix du chef d'équipe selon les critères
 * objectifs. Le même code sert au dashboard admin (suggestion) et au backend.
 */
export type CrewCandidate = {
  id: string;
  name: string;
  city?: string;
  /** Villes d'intervention déclarées (profil technicien). */
  zones?: string[];
  specialty?: string;
  /** Années d'expérience. */
  experienceYears?: number;
  /** Note client moyenne (1-5). */
  rating?: number;
  /** Nombre d'interventions réalisées. */
  missionCount?: number;
  /** Abonnement actif — sinon exclu par défaut. */
  active?: boolean;
  /** Dossier KYC vérifié par l'administration. */
  verified?: boolean;
  /** Position GPS réelle du technicien (prioritaire sur la ville). */
  gps?: { lat: number; lon: number };
  /** NOMENCLATURE GTEC PRO : spécialité (code), métier, diplôme, compétences. */
  specialtyCode?: string;
  job?: string;
  degreeKey?: string;
  degreeLevel?: string;
  skills?: string[];
  /** Certifications / habilitations déclarées. */
  certifications?: string[];
  /** RÉFÉRENTIEL : diplôme vérifié GTEC PRO (§12/§13) — bonus de confiance. */
  credentialVerified?: boolean;
};

/** Chef d'équipe : score = expérience pondérée + note client + ancienneté. */
export function pickTeamLeader(
  candidates: CrewCandidate[],
): { leaderId: string | null; scores: { id: string; score: number }[] } {
  const scored = candidates.map((t) => {
    const exp = Math.min(t.experienceYears ?? 0, 30); // cap à 30 ans
    const rating = t.rating ?? 3.5;
    const missions = Math.min(t.missionCount ?? 0, 100);
    const score = exp * 1.0 + rating * 4 + missions * 0.2;
    return { id: t.id, score: Math.round(score * 10) / 10 };
  });
  const best = [...scored].sort((a, b) => b.score - a.score)[0];
  return { leaderId: best?.id ?? null, scores: scored };
}

/**
 * Moteur géo V6 : filtre par abonnement, trie par proximité de la ville du
 * chantier puis par couverture de zone et spécialité, garantit au moins
 * 2 membres (leader + 1) et désigne le chef selon les critères GTEC.
 */
export function suggestTeam(
  serviceKey: string,
  requestCity: string,
  techs: CrewCandidate[],
  minSize = 2,
  /** GPS précis du chantier — active la distance réelle technicien↔chantier. */
  requestGps?: { lat: number; lon: number },
  /** NOMENCLATURE : spécialité attendue (code) et compétences requises. */
  need?: { specialtyCode?: string; requiredSkills?: string[] },
): { leaderId: string | null; memberIds: string[]; total: number; reason: string } {
  const pool = techs.filter((t) => t.active !== false);
  if (pool.length === 0) {
    return { leaderId: null, memberIds: [], total: 0, reason: "Aucun technicien disponible" };
  }
  const rule = TEAM_RULES[serviceKey] ?? TEAM_RULES.cfo;
  const matches = (specialty: string | undefined, hint: string) =>
    !!specialty && specialty.toLowerCase().includes(hint.toLowerCase());
  const zoneOf = (t: CrewCandidate) =>
    t.zones?.length ? t.zones : t.city ? [t.city] : [];

  // Score : proximité géo (dominant) + zone couverte + spécialité + KYC.
  // Distance : GPS réel technicien→chantier si les deux sont connus, sinon
  // repli sur la distance ville-à-ville déclarée.
  const scored = pool
    .map((t) => {
      let distance: number;
      if (requestGps && t.gps) {
        distance = haversinePositions(requestGps, t.gps);
      } else {
        const zones = zoneOf(t);
        const distances = zones
          .map((c) => (c === requestCity ? 0 : cityDistanceKm(requestCity, c)))
          .filter((d) => d < 9999);
        distance = distances.length ? Math.min(...distances) : 9999;
      }
      const specialtyFit = [rule.leaderHint, ...rule.members].some((hint) =>
        matches(t.specialty, hint),
      );
      const kycBonus = t.verified === false ? -25 : 0;
      // RÉFÉRENTIEL (§13) : le diplôme n'est qu'un critère parmi d'autres —
      // un diplôme VÉRIFIÉ GTEC PRO apporte un léger bonus de confiance.
      const credentialBonus = t.credentialVerified ? 4 : 0;
      // NOMENCLATURE GTEC PRO : bonus spécialité+métier+diplôme+compétences
      // (0-40) calculé par le moteur dédié — repli legacy si non renseigné.
      const nomenBonus = nomenMatchScore(
        {
          specialtyCode: t.specialtyCode,
          job: t.job,
          degreeKey: t.degreeKey,
          degreeLevel: t.degreeLevel,
          skills: t.skills,
        },
        {
          specialtyCode: need?.specialtyCode,
          serviceKey,
          skills: need?.requiredSkills,
        },
      );
      const score = 100 - distance * 0.8 + (specialtyFit ? 20 : 0) + kycBonus + credentialBonus + nomenBonus;
      return { tech: t, distance, score };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = scored.slice(0, Math.max(minSize, 0));
  const { leaderId } = pickTeamLeader(chosen.map((c) => c.tech));
  const memberIds = chosen.map((c) => c.tech.id).filter((id) => id !== leaderId);
  const avgDistance = chosen.length
    ? Math.round(chosen.reduce((s, c) => s + c.distance, 0) / chosen.length)
    : 0;
  const gpsUsed = !!requestGps && chosen.some((c) => c.tech.gps);
  const nomenTop = chosen.some(
    (c) =>
      !!need?.specialtyCode &&
      c.tech.specialtyCode === need.specialtyCode,
  );
  const reason =
    chosen.length === 0
      ? "Aucun technicien disponible"
      : `Équipe de ${chosen.length} · proximité ${requestCity}${avgDistance ? ` (${avgDistance} km${gpsUsed ? ", GPS" : ""})` : ""}${chosen.some((c) => matches(c.tech.specialty, rule.leaderHint)) ? " · spécialité" : ""}${nomenTop ? " · nomenclature" : ""}`;
  return { leaderId, memberIds, total: memberIds.length + (leaderId ? 1 : 0), reason };
}

/**
 * Ancien moteur conservé pour compat (suggestion par spécialité seule) —
 * utilisé comme repli si la ville du chantier est inconnue.
 */
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

// Modèle économique 2026 : les formules d'abonnement vivent désormais dans
// `src/lib/subscriptions.ts` (mensuel 10 000 · trimestriel 48 000 ·
// semestriel 55 000 · annuel 100 000 FCFA, remises calculées automatiquement).

// ---------- rémunération techniciens (modèle 2026 : 0 % de commission) ----------

/**
 * Modèle 2026 : GTEC PRO ne prélève AUCUNE commission sur les prestations.
 * Le professionnel conserve 100 % du montant payé par le client ; GTEC PRO se
 * rémunère uniquement via les abonnements professionnels.
 */
export const GTEC_COMMISSION_PERCENT = 0;
export const TEAM_SHARE_PERCENT = 100; // 100 % pour l'équipe (aucune commission)
export const LEADER_WEIGHT = 1.5;
export const MEMBER_WEIGHT = 1;

/** Commission GTEC due sur une intervention : 0 FCFA (modèle 2026). */
export function commissionFor(quoteTotal: number): number {
  return Math.round((quoteTotal * GTEC_COMMISSION_PERCENT) / 100);
}

export function payoutFor(
  quoteTotal: number,
  role: string,
  crewSize: number,
): { amount: number; sharePercent: number } {
  // 100 % du montant de la prestation revient à l'équipe.
  const teamPot = quoteTotal;
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
