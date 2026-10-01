/**
 * GTEC PRO — RÉFÉRENTIEL NATIONAL DES ÉTABLISSEMENTS D'ENSEIGNEMENT
 * SUPÉRIEUR DU CAMEROUN (§ module MINESUP).
 *
 * Cette lib ne contient QUE :
 *  1. les types / libellés des nomenclatures (type, statut, région…) ;
 *  2. les fonctions de recherche intelligente (nom, acronyme, ancienne
 *     appellation, ville, région, variantes orthographiques) ;
 *  3. le SEED officiel importé par l'administrateur dans la table Convex
 *     `higher_education_institutions` (mutation `seedInstitutions`).
 *
 * L'application n'affiche JAMAIS cette liste en dur : l'UI lit la table
 * Convex via `api.institutions.*`. Le seed n'est qu'un point de départ
 * administrable (statuts, historique, suspensions) — source : MINESUP.
 */

// ============================ NOMENCLATURES ==============================

export const INSTITUTION_TYPES = [
  "STATE_UNIVERSITY",
  "PRIVATE_UNIVERSITY",
  "PUBLIC_SPECIAL_STATUS",
  "PRIVATE_HIGHER_INSTITUTE",
  "INTERNATIONAL_INSTITUTION",
  "INTERSTATE_INSTITUTION",
  "FOREIGN_RECOGNIZED_INSTITUTION",
] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  STATE_UNIVERSITY: "Université d'État",
  PRIVATE_UNIVERSITY: "Université privée",
  PUBLIC_SPECIAL_STATUS: "Établissement public à statut particulier",
  PRIVATE_HIGHER_INSTITUTE: "Institut privé d'enseignement supérieur (IPES)",
  INTERNATIONAL_INSTITUTION: "Institution internationale",
  INTERSTATE_INSTITUTION: "Institution inter-États",
  FOREIGN_RECOGNIZED_INSTITUTION: "Établissement étranger reconnu",
};

export const OWNERSHIPS = ["PUBLIC", "PRIVATE", "INTERNATIONAL", "INTERSTATE"] as const;
export type Ownership = (typeof OWNERSHIPS)[number];
export const OWNERSHIP_LABELS: Record<Ownership, string> = {
  PUBLIC: "Public",
  PRIVATE: "Privé",
  INTERNATIONAL: "International",
  INTERSTATE: "Inter-États",
};

export const REGIONS = [
  "ADAMOUA",
  "CENTRE",
  "EST",
  "EXTREME_NORD",
  "LITTORAL",
  "NORD",
  "NORD_OUEST",
  "OUEST",
  "SUD",
  "SUD_OUEST",
] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  ADAMOUA: "Adamaoua",
  CENTRE: "Centre",
  EST: "Est",
  EXTREME_NORD: "Extrême-Nord",
  LITTORAL: "Littoral",
  NORD: "Nord",
  NORD_OUEST: "Nord-Ouest",
  OUEST: "Ouest",
  SUD: "Sud",
  SUD_OUEST: "Sud-Ouest",
};

export const INSTITUTION_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
  "PENDING_VERIFICATION",
  "HISTORICAL",
] as const;
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];
export const INSTITUTION_STATUS_LABELS: Record<InstitutionStatus, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  CLOSED: "Fermé",
  PENDING_VERIFICATION: "En attente de vérification",
  HISTORICAL: "Historique",
};

export const AUTHORIZATION_STATUSES = [
  "AUTHORIZED",
  "APPROVED",
  "HOMOLOGATED",
  "NOT_APPLICABLE",
  "SUSPENDED",
  "WITHDRAWN",
  "UNKNOWN",
] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];
export const AUTHORIZATION_STATUS_LABELS: Record<AuthorizationStatus, string> = {
  AUTHORIZED: "Autorisé",
  APPROVED: "Agréé",
  HOMOLOGATED: "Homologué",
  NOT_APPLICABLE: "Sans objet",
  SUSPENDED: "Autorisation suspendue",
  WITHDRAWN: "Autorisation retirée",
  UNKNOWN: "Inconnu",
};

export const RECOGNITION_STATUSES = [
  "RECOGNIZED",
  "NOT_RECOGNIZED",
  "UNDER_REVIEW",
  "HISTORICAL",
] as const;
export type RecognitionStatus = (typeof RECOGNITION_STATUSES)[number];
export const RECOGNITION_STATUS_LABELS: Record<RecognitionStatus, string> = {
  RECOGNIZED: "Reconnu",
  NOT_RECOGNIZED: "Non reconnu",
  UNDER_REVIEW: "En cours d'examen",
  HISTORICAL: "Historique",
};

/** Niveaux de diplômes du référentiel (§6 du module). */
export const DIPLOMA_LEVELS: { code: string; label: string; rank: number }[] = [
  { code: "CAP", label: "CAP", rank: 1 },
  { code: "PROBATOIRE", label: "Probatoire / niveau antérieur", rank: 1 },
  { code: "BACCALAUREAT", label: "Baccalauréat", rank: 2 },
  { code: "BT", label: "BT (Brevet de technicien)", rank: 2 },
  { code: "BP", label: "BP (Brevet professionnel)", rank: 2 },
  { code: "BTS", label: "BTS", rank: 3 },
  { code: "HND", label: "HND", rank: 3 },
  { code: "DSEP", label: "DSEP", rank: 3 },
  { code: "HPD", label: "HPD", rank: 3 },
  { code: "DUT", label: "DUT", rank: 3 },
  { code: "DEUG", label: "DEUG", rank: 3 },
  { code: "LICENCE", label: "Licence", rank: 4 },
  { code: "LICENCE_PROFESSIONNELLE", label: "Licence professionnelle", rank: 4 },
  { code: "BACHELOR", label: "Bachelor", rank: 4 },
  { code: "MASTER", label: "Master", rank: 5 },
  { code: "MASTER_PROFESSIONNEL", label: "Master professionnel", rank: 5 },
  { code: "DIPLOME_INGENIEUR", label: "Diplôme d'ingénieur", rank: 5 },
  { code: "DEA", label: "DEA", rank: 6 },
  { code: "DESS", label: "DESS", rank: 6 },
  { code: "DOCTORAT", label: "Doctorat", rank: 7 },
  { code: "PHD", label: "PhD", rank: 7 },
  { code: "AUTRE", label: "Autre", rank: 0 },
];

/** Équivalence des diplômes étrangers (§6) — jamais automatique. */
export const EQUIVALENCE_STATUSES = [
  "NOT_REQUESTED",
  "PENDING",
  "GRANTED",
  "REFUSED",
  "NOT_REQUIRED",
] as const;
export type EquivalenceStatus = (typeof EQUIVALENCE_STATUSES)[number];
export const EQUIVALENCE_STATUS_LABELS: Record<EquivalenceStatus, string> = {
  NOT_REQUESTED: "Non demandée",
  PENDING: "Demande en cours",
  GRANTED: "Accordée",
  REFUSED: "Refusée",
  NOT_REQUIRED: "Sans objet (diplôme national)",
};

/** Statut de vérification d'un diplôme déclaré (badges profil §12). */
export const CREDENTIAL_STATUSES = ["declare", "en_attente", "verifie", "rejete"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];
export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  declare: "Déclaré",
  en_attente: "En cours de vérification",
  verifie: "Vérifié GTEC PRO",
  rejete: "Non vérifié",
};

/** Badges du profil (§12) — jamais « reconnu » sur simple déclaration. */
export function credentialBadge(status: CredentialStatus | undefined): {
  emoji: string;
  label: string;
  tone: string;
} {
  switch (status) {
    case "verifie":
      return { emoji: "✅", label: "Diplôme vérifié GTEC PRO", tone: "text-emerald-600 dark:text-emerald-400" };
    case "en_attente":
      return { emoji: "⚠️", label: "Diplôme en cours de vérification", tone: "text-amber-600 dark:text-amber-400" };
    case "rejete":
      return { emoji: "❌", label: "Diplôme non vérifié", tone: "text-destructive" };
    default:
      return { emoji: "🎓", label: "Diplôme déclaré", tone: "text-muted-foreground" };
  }
}

export function institutionBadge(status: InstitutionStatus | undefined): {
  emoji: string;
  label: string;
  tone: string;
} {
  switch (status) {
    case "ACTIVE":
      return { emoji: "🏫", label: "Établissement déclaré", tone: "text-primary" };
    case "PENDING_VERIFICATION":
      return { emoji: "⚠️", label: "Établissement en cours de vérification", tone: "text-amber-600 dark:text-amber-400" };
    case "SUSPENDED":
      return { emoji: "❌", label: "Établissement suspendu", tone: "text-destructive" };
    case "CLOSED":
      return { emoji: "🏛️", label: "Établissement fermé", tone: "text-muted-foreground" };
    default:
      return { emoji: "📜", label: "Établissement historique", tone: "text-muted-foreground" };
  }
}

// ============================ RECHERCHE ==================================

/** Normalise une chaîne : minuscules, sans accent ni ponctuation. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Champ(s) indexés pour la recherche d'un établissement. */
export function institutionHaystack(inst: {
  name: string;
  shortName?: string;
  aliases?: string[];
  city?: string;
  region: string;
  department?: string;
}): string {
  return normalizeText(
    [
      inst.name,
      inst.shortName ?? "",
      ...(inst.aliases ?? []),
      inst.city ?? "",
      inst.department ?? "",
      REGION_LABELS[inst.region as Region] ?? inst.region,
    ].join(" "),
  );
}

/**
 * Recherche intelligente (§15) : tous les mots de la requête doivent
 * correspondre (préfixe de mot) dans le référentiel de l'établissement.
 * Couvre : nom complet, acronyme, ancienne appellation, ville, région,
 * variante orthographique (« univ douala » → Université de Douala).
 */
export function institutionMatches(
  inst: {
    name: string;
    shortName?: string;
    aliases?: string[];
    city?: string;
    region: string;
    department?: string;
  },
  query: string,
): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = institutionHaystack(inst);
  if (hay.includes(q)) return true;
  const words = new Set(hay.split(" "));
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  // Chaque token doit être un préfixe d'un mot du référentiel.
  return tokens.every((t) =>
    [...words].some((w) => w.startsWith(t) || (t.length >= 4 && w.startsWith(t.slice(0, t.length - 1)))),
  );
}

/** Score de pertinence (tri) : exact > début > acronyme > token. */
export function institutionScore(
  inst: { name: string; shortName?: string; aliases?: string[]; city?: string; region: string },
  query: string,
): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const name = normalizeText(inst.name);
  const short = normalizeText(inst.shortName ?? "");
  const aliases = (inst.aliases ?? []).map(normalizeText);
  let score = 0;
  if (name === q) score += 100;
  if (short && (short === q || short.replace(/\s/g, "") === q.replace(/\s/g, ""))) score += 90;
  if (aliases.includes(q)) score += 85;
  if (name.startsWith(q)) score += 60;
  if (short.startsWith(q)) score += 50;
  if (normalizeText(inst.city ?? "") === q) score += 40;
  if (name.includes(q)) score += 30;
  if (short.includes(q)) score += 25;
  if (aliases.some((a) => a.includes(q))) score += 20;
  return score;
}

// ===================== SEED OFFICIEL (MINESUP) ===========================

export type SeedInstitution = {
  code: string;
  name: string;
  shortName?: string;
  aliases?: string[];
  institutionType: InstitutionType;
  ownership: Ownership;
  region: Region;
  city?: string;
  status: InstitutionStatus;
  authorizationStatus: AuthorizationStatus;
  recognitionStatus: RecognitionStatus;
  canIssueNationalDiploma: boolean;
  canIssuePrivateDiploma: boolean;
  source: string;
  sourceUrl: string;
  isActive: boolean;
};

const SOURCE = "MINESUP — référentiel officiel des établissements d'enseignement supérieur";
const SOURCE_URL = "https://www.minesup.gov.cm";

/** Villes connues — déduites du nom lorsque le libellé la mentionne. */
const CITY_HINTS: { city: string; norm: string }[] = [
  "Yaoundé", "Douala", "Bafoussam", "Buea", "Bamenda", "Bertoua", "Garoua",
  "Maroua", "Ngaoundéré", "Ebolowa", "Dschang", "Sangmélima", "Limbé",
  "Kumba", "Nkongsamba", "Bafang", "Bangangté", "Obala", "Edéa", "Mbalmayo",
  "Kribi", "Mbouda", "Foumban", "Bafia", "Tiko", "Melong", "Manengouba",
  "Nkolbisson", "Baham", "Eseka", "Ntui", "Mfou", "Akonolinga", "Bafang",
].map((c) => ({ city: c, norm: normalizeText(c) }));

function guessCity(name: string): string | undefined {
  const n = normalizeText(name);
  for (const h of CITY_HINTS) {
    if (n.includes(h.norm)) return h.city;
  }
  return undefined;
}

/** Découpe « Nom officiel — ACRONYME » du listing MINESUP. */
function splitName(raw: string): { name: string; shortName?: string; city?: string } {
  const idx = raw.lastIndexOf(" — ");
  if (idx > 0) {
    const suffix = raw.slice(idx + 3).trim();
    if (/^[A-Z0-9'’\- ]{2,18}$/.test(suffix)) {
      const name = raw.slice(0, idx).trim();
      return { name, shortName: suffix, city: guessCity(name) };
    }
    // Suffixe non acronymique : c'est souvent une ville (ex. « … — Limbé »).
    const name = raw.slice(0, idx).trim();
    const asCity = CITY_HINTS.find((h) => normalizeText(h.norm) === normalizeText(suffix));
    return { name, city: asCity?.city ?? guessCity(name) };
  }
  return { name: raw, city: guessCity(raw) };
}

function build(
  raw: string,
  type: InstitutionType,
  ownership: Ownership,
  region: Region,
  code: string,
  extra?: Partial<SeedInstitution>,
): SeedInstitution {
  const { name, shortName, city } = splitName(raw);
  const isPublic = ownership === "PUBLIC";
  return {
    code,
    name,
    shortName,
    city,
    institutionType: type,
    ownership,
    region,
    status: "ACTIVE",
    authorizationStatus: type === "FOREIGN_RECOGNIZED_INSTITUTION" ? "NOT_APPLICABLE" : "AUTHORIZED",
    recognitionStatus: "RECOGNIZED",
    canIssueNationalDiploma: isPublic,
    canIssuePrivateDiploma: !isPublic || type === "PRIVATE_UNIVERSITY",
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    isActive: true,
    ...extra,
  };
}

const REGION_ABBR: Record<Region, string> = {
  ADAMOUA: "AD",
  CENTRE: "CE",
  EST: "ES",
  EXTREME_NORD: "EN",
  LITTORAL: "LI",
  NORD: "NO",
  NORD_OUEST: "NW",
  OUEST: "OU",
  SUD: "SD",
  SUD_OUEST: "SO",
};

/** IPES par région (listing officiel MINESUP, édition publiée). */
const IPES_BY_REGION: Record<Region, string[]> = {
  ADAMOUA: [
    "Institut Supérieur des Sciences, de Technologie, de Management et Développement Durable — ISSTMADD",
    "Sanda Institut Supérieur de Management — SISMA",
  ],
  CENTRE: [
    "Centre International des Etudes Polytechniques d'Obala",
    "Citec Higher Institute of Technology and Management — ICTU",
    "Ecole Sup Prépa",
    "Ecole Supérieure de Commerce et de Gestion des Entreprises — SUP DE CO",
    "Ecole Supérieure de Commerce et de Gestion de Yaoundé — ESCGY",
    "Ecole Supérieure des Sciences de la Finance, de l'Assurance et des Risques de Yaoundé — ESSFAR",
    "Ecole Supérieure Spéciale d'Architecture du Cameroun — ESSACA",
    "Higher Institute of Management and Entrepreneurship — HIME",
    "Information and Communication Technology University Institute",
    "Institut AGENLA Academy",
    "Institut Catholique de Yaoundé",
    "Institut de Management et de Marketing Supérieur de Commerce — I2M Sup de Co Cameroun",
    "Institut des Beaux-Arts CHEIKH ANTA DIOP",
    "Institut des Sciences Economiques et Informatiques de Gestion — ISEIG",
    "Institut MBASSI Supérieur",
    "Institut Saint Jean",
    "Institut Supérieur Azimut de Commerce, de Technologie et de Santé",
    "Institut Supérieur d'Agriculture et de Gestion",
    "Institut Supérieur d'Enseignement Managérial et Technologique",
    "Institut Supérieur d'Etudes Scientifiques, Technologiques et Managériales — ISESTMA",
    "Institut Supérieur de Chimie et de Gestion",
    "Institut Supérieur de Formation aux Métiers de Télécommunications, de l'Innovation Technologique, de Commerce et de Gestion — IFTIC-SUP",
    "Institut Supérieur de Gestion et d'Hôtellerie — ISGHO",
    "Institut Supérieur de l'Emergence — ISE",
    "Institut Supérieur de Management et des Sciences Appliquées — ISMASA",
    "Institut Supérieur de Management et des Technologies Industrielles — ISMTI",
    "Institut Supérieur de Management International — ISMI",
    "Institut Supérieur de Pétrochimie et d'Ingénierie Mathématique — ISPIM",
    "Institut Supérieur de Technologie Appliquée et de Gestion — ISTAG",
    "Institut Supérieur de Technologie le Bon Berger",
    "Institut Supérieur de Technologie Médicale de Nkolodom",
    "Institut Supérieur de Traduction, d'Interprétariat et de Communication — ISTIC",
    "Institut Supérieur des Affaires — ISA",
    "Institut Supérieur des métiers Notre Dame",
    "Institut Supérieur des Professions de Santé — ISPS",
    "Institut Supérieur des Sciences Agronomiques, de l'Environnement et de l'Entrepreneuriat Rural — ISSAEER",
    "Institut Supérieur des Sciences Biologiques et Appliquées — ISSBA",
    "Institut Supérieur des Sciences de l'Education — ISSED",
    "Institut Supérieur des Sciences de l'Entreprise — ISSE",
    "Institut Supérieur des Sciences et de Management — I2SM",
    "Institut Supérieur des Sciences et des Technologies Sainte Maria",
    "Institut Supérieur des Sciences et Techniques de Yaoundé — ISSTY",
    "Institut Supérieur des Sciences et Technologies de la Santé — ISSTS",
    "Institut Supérieur des Sciences Sociales et Appliquées — I3SA",
    "Institut Supérieur des Sciences, Arts et Métiers — ISSAM",
    "Institut Supérieur des Techniques Agricoles d'Ombessa",
    "Institut Supérieur des Technologies et de l'Innovation",
    "Institut Supérieur du Personnel Médico-Sanitaire — ISPM",
    "Institut Supérieur Hintel",
    "Institut Supérieur Jimit — ISJ",
    "Institut Supérieur la Rosière",
    "Institut Supérieur Lead — ISL",
    "Institut Supérieur Maritime et de Gestion — ISUMAG",
    "Institut Supérieur Matamfen — ISMAT",
    "Institut Supérieur Nyong et Sanaga — ISNS",
    "Institut Supérieur Polytechnique",
    "Institut Supérieur Polytechnique les Armandins — ISPA",
    "Institut Supérieur Professionnel — ISP",
    "Institut Supérieur Royal Deumaga — ISRD",
    "Institut Supérieur Saint Jean-Paul II — ISJP",
    "Institut Supérieur Simon de Cyrène — ISSC",
    "Institut Supérieur Technologique",
    "Institut Universitaire Agricole de Management des Métiers de la Production",
    "Institut universitaire Bengono Touré",
    "Institut Universitaire Catholique Sainte Thérèse de Yaoundé — INUCASTY",
    "Institut Universitaire d'Eseka — IUE",
    "Institut Universitaire des Sciences et de Management — IUSM",
    "Institut Universitaire des Sciences Pétrolières et de Management — IUSPM",
    "Institut Universitaire des Sciences, des Technologies et de l'Ethique — IUSTE",
    "Institut Universitaire International",
    "Institut Universitaire J. NDI SAMBA",
    "Institut Universitaire LA VISION",
    "Institut Universitaire Protestant de Yaoundé",
    "Institut Universitaire SIANTOU",
    "International Bilingual Academy Yaoundé — IBAY-SUP",
    "PK FOKAM Higher Institute",
    "Prépa Vogt",
    "Université Adventiste Cosendai",
    "Yaounde School of Economics and Management — YSEM",
  ],
  EST: [
    "Institut Supérieur d'Agronomie — ISA",
    "Institut Universitaire Catholique de Bertoua — IUCAB",
  ],
  EXTREME_NORD: [
    "Institut Supérieur des Techniques Appliquées et de Management",
    "Institut Supérieur Walya — WALYASUP",
  ],
  LITTORAL: [
    "Access Higher Institute of Professional Studies — Access-HIPS",
    "Alpha Higher Institute of Biomedical and Technological Sciences",
    "Douala Higher Institute of Technology — DIT",
    "Ecole Supérieure d'Ingénieur d'Afrique Centrale — ESIAC",
    "Ecole Supérieure de Commerce et de Management PIGIER Cameroun",
    "Ecole Supérieure des Sciences et Techniques — ESSET",
    "Ecole Supérieure Technique La Salle — EST",
    "Higher Institute for Nursing and Technico-Sanitary Personals — HINTP",
    "Higher Institute of Business",
    "Higher Institute of Professional Excellence — HIPE",
    "Institut des Etudes Supérieures de Science, d'Industrie et des Techniques de Gestion — IHES-SITG",
    "Institut panafricain pour le Développement — IPD",
    "Institut Supérieur Africain d'Enseignement Managérial et Technologique",
    "Institut Supérieur d'Etudes Commerciales et de Management — ISECMA",
    "Institut Supérieur d'Informatique et de la Communication — ISICOM",
    "Institut Supérieur Dale Kietzman",
    "Institut Supérieur de Commerce et d'Administration des Collectivités — ISCAC",
    "Institut Supérieur de Commerce et de Management",
    "Institut Supérieur de Comptabilité et Management — ISCM",
    "Institut Supérieur de Gestion — ISG",
    "Institut Supérieur de Gestion et de Management — ISGEM",
    "Institut Supérieur de Gestion et de Technologie — ISGET",
    "Institut Supérieur de Gestion et du Design — ISGD",
    "Institut Supérieur de l'Entreprise et du Management — ISEM",
    "Institut Supérieur de Management de Manengouba — ISMAM",
    "Institut Supérieur de Management — ISMA",
    "Institut Supérieur de Management et de l'Entrepreneuriat",
    "Institut Supérieur de Management et de Technologies Avancées — ISMT",
    "Institut Supérieur de Psychopédagogie Appliquée — ISPPA",
    "Institut Supérieur de Technologie Avancée et du Management Douala — ISTAMA",
    "Institut Supérieur de Technologie et de Gestion",
    "Institut Supérieur de Technologie et de Gestion d'Afrique Centrale — ISTG-AC",
    "Institut Supérieur de Technologie et de Management — ISTM",
    "Institut Supérieur de Technologies Appliquées — INSTAP",
    "Institut Supérieur de Transport, de Tourisme, des Affaires et de Management — ISTTAM",
    "Institut Supérieur des Formations Appliquées — ISFA",
    "Institut Supérieur des Hautes Etudes Commerciales et Industrielles SIGMEN",
    "Institut Supérieur des Métiers — ISMET",
    "Institut Supérieur des Sciences Appliquées au Management — ISSAM-ESSAMA",
    "Institut Supérieur des Sciences, de Technologie et de Commerce",
    "Institut Supérieur des Techniques Economiques et Comptables",
    "Institut Supérieur des Techniques Tertiaires et Industrielles — ISTTI",
    "Institut Supérieur du Génie Thermique et Énergétique",
    "Institut Supérieur du Tourisme, de l'Hôtellerie et des Arts Culinaires — ISTHAC",
    "Institut Supérieur Evangélique des Technologies et de Gestion — ISETAG",
    "Institut Supérieur la Perle — ISLAPE",
    "Institut Supérieur Lumière",
    "Institut Supérieur MINGOLE — ISM",
    "Institut Supérieur Professeurs Réunis — ISPR",
    "Institut Supérieure d'Informatique et de Commerce — ISICO",
    "Institut Universitaire Catholique de Douala Saint Jérôme",
    "Institut Universitaire de la Côte — IUC",
    "Institut Universitaire du Golfe de Guinée — IUG",
    "Institut Universitaire et Stratégique de l'Estuaire",
    "Institut Universitaire Louis Yinda — IULY",
    "Panafrican Institute of Strategy and Technology — PIST",
    "Sabena Flight Academy Africa",
    "The Vaal Institute of Technology — VIT",
  ],
  NORD: [
    "Institut Supérieur des Sciences et Techniques de la Santé et de Management — ISSTSM",
    "Institut Supérieur Fondation MAMADOU BAKO",
    "Institut Supérieur Industriel et Commercial de Garoua — ISIC",
    "Institut Supérieur Septentrion Informatique",
    "Institut Supérieur Yérima DEWA — ISYD",
  ],
  NORD_OUEST: [
    "Bamenda University Institute of Science and Technology — BUIST",
    "Capitol Higher Institute of Health Sciences and Beauty Therapy",
    "Catholic School of Health Sciences Shisong",
    "Catholic University Institute of Bamenda",
    "Central Higher Institute — CHI",
    "Christian University Institute",
    "Florence Nightingale Higher Institute of Health and Biomedical Sciences",
    "Fonab Polytechnic",
    "Havard Higher Institute of Science and Technology",
    "Higher Institute for Business and Management Sciences",
    "Higher Institute for Professional Development and Training — HIPDET",
    "Higher Institute of Professionalism and Technology — HIPT",
    "Impact Polytechnic",
    "International University of Bamenda",
    "Jomatt Polytechnic Institute of Education",
    "Laureate Higher Institute of Business and Administration — LAHIBA",
    "National Higher Institute of Business, Tourism and Hotel Management — NAHIBUTH",
    "National Polytechnic University Institute — NPUI",
    "Paul Nkwi Higher Institute of Management, Science, Arts and Technology",
    "Pauls's Computer Higher Institute of Technology — PC-HITECH",
    "Pyramid Higher Institute of Professional Studies",
    "Saint Louis Higher Institute of Health and Biomedical Sciences",
    "ST Jude's Higher Institute of Nursing and Biomedical",
  ],
  OUEST: [
    "Groupe Tankou Enseignement Supérieur — GTES",
    "Institut Catholique de Bafoussam — ICAB",
    "Institut d'Afrique Unie",
    "Institut d'Enseignement Supérieur Foyaguem — IESF",
    "Institut de Technologie de l'Industrie, du Management et de l'Entrepreneuriat — INTIME",
    "Institut Supérieur des Sciences et de Technologie de Bangangté — ISST",
    "Institut Supérieur de Bafang — ISB",
    "Institut Supérieur de Bafoussam",
    "Institut Supérieur de Banka-Bafang — ISB",
    "Institut Supérieur de Gestion et d'Economie Appliquée de Bafoussam — SUP GECO",
    "Institut Supérieur de Management et des Technologies Appliquées — ISMTA",
    "Institut Supérieur de Technologie et d'Etudes Commerciales — ISTEC",
    "Institut Supérieur des Arts et des Métiers de Bafoussam — ISAMET",
    "Institut Supérieur des Sciences Appliquées à la Santé — INSSAS",
    "Institut Supérieur des Sciences de la Santé de Bangangté — ISSS",
    "Institut Supérieur des Sciences et Technologies NANFAH — ISSTN",
    "Institut Supérieur des Sciences, de Technologie, de Commerce et d'Agriculture — ISSTECOA",
    "Institut Supérieur des Techniques Industrielles et Commerciales",
    "Institut Supérieur des Technologies, d'Agriculture et de Commerce — ISTACO",
    "Institut Supérieur Islamique de Foumban — ISIF",
    "Institut Supérieur Mony Keng — IMK",
    "Institut Supérieur Polytechnique de Bansoa — ISPB",
    "Institut Supérieur Royal Baboutcha-Nintcheu — ISRB",
    "Institut Universitaire Evangélique du Cameroun",
    "ROTAS Institut Supérieur de Management et de Gestion — ROTAS-ISMG",
  ],
  SUD: [
    "Institut Catholique Bonneau d'Ebolowa — ICABE",
    "Institut Privé des Sciences de la Santé de Sangmelima — IPSSSA",
    "Institut Supérieur Camille Chazeaud",
    "Institut Supérieur de l'Entreprise, du Management, de l'Industrie et des Technologies — ISEMIT",
    "Institut Supérieur des Technologies de l'Information et de la Communication",
    "Institut Supérieur Protestant des Sciences et de Technologie d'Elat",
    "Institut Universitaire Privé Laïc de L'Equateur",
  ],
  SUD_OUEST: [
    "Access Higher Institute of Professional Studies — Access-HIPS",
    "ACHAS Higher Institute of Sustainable Tourism, Hospitality and Business Management",
    "Biaka University Institute of Buea — BUIB",
    "Buea Polytechnic",
    "Catholic University Institute of Buea",
    "Catholic University Institute of Mamfe",
    "Chartered Higher Institute of Cameroon — CHIC",
    "Chartered Higher Institute of Technology and Management — CHITECHMA",
    "Ejed Higher Institute of Management and Biomedical Sciences — EHIMBS",
    "FOMIC Polytechnic",
    "Fotabe Higher Institute — FHI",
    "Gulf-Field Higher Institute of Petroleum, Mining, Business and Management Sciences — GFHIP",
    "Higher Institute for Business, Management and Technology",
    "Higher Institute of Applied Medical Sciences Buea",
    "Higher Institute of Business and Management Studies — HIBMS",
    "Higher Institute of Management Studies",
    "Higher Institute of Professional Studies",
    "Higher Institute of Professional Studies and Career Development",
    "Higher Institute of Technology",
    "Horti-Florale Institute — HFI",
    "Pan African Institute for Development — PAID",
    "Institute of Professional Studies — IPS",
    "ISEC Higher Institute of Health and Human Services",
    "JSF Polytechnic",
    "Landmark Higher Institute — LHI",
    "Maflekumen Higher Institute of Health Sciences Buea",
    "Rapha Higher Institute of Health and Biomedical Sciences Kumba — RAPHIHK",
    "Redemption Higher Institute of Biomedical and Management Sciences",
    "SMU Higher Institute",
    "ST Joan of Arc Higher Institute of Medical and Management Sciences",
    "Swisslink Higher Institute of Business and Technology — SHIBAT",
    "TRUSTECH Higher Institute of Technology and Professional Management",
  ],
};

function buildSeedList(): SeedInstitution[] {
  const list: SeedInstitution[] = [];
  const used = new Set<string>();
  const push = (s: SeedInstitution) => {
    // Garde anti-doublon (un même établissement publié dans 2 régions…).
    const key = normalizeText(s.name);
    if (used.has(key)) return;
    used.add(key);
    list.push(s);
  };

  // ---- 1. Universités d'État (11) ----
  const STATE_UNIS: [string, Region, string, string][] = [
    ["Université de Bamenda", "NORD_OUEST", "UBa", "Bamenda"],
    ["Université de Bertoua", "EST", "", "Bertoua"],
    ["Université de Buea", "SUD_OUEST", "UB", "Buea"],
    ["Université de Douala", "LITTORAL", "", "Douala"],
    ["Université de Dschang", "OUEST", "", "Dschang"],
    ["Université d'Ebolowa", "SUD", "", "Ebolowa"],
    ["Université de Garoua", "NORD", "", "Garoua"],
    ["Université de Maroua", "EXTREME_NORD", "", "Maroua"],
    ["Université de Ngaoundéré", "ADAMOUA", "", "Ngaoundéré"],
    ["Université de Yaoundé I", "CENTRE", "", "Yaoundé"],
    ["Université de Yaoundé II", "CENTRE", "", "Yaoundé"],
  ];
  STATE_UNIS.forEach(([name, region, short, city], i) => {
    push({
      code: `UNI-${String(i + 1).padStart(2, "0")}`,
      name,
      shortName: short || undefined,
      aliases: name === "Université de Yaoundé II" ? ["Université de Yaoundé II Soa", "Soa"] : undefined,
      institutionType: "STATE_UNIVERSITY",
      ownership: "PUBLIC",
      region,
      city,
      status: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
      recognitionStatus: "RECOGNIZED",
      canIssueNationalDiploma: true,
      canIssuePrivateDiploma: false,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      isActive: true,
    });
  });

  // ---- 2. Établissements publics à statut particulier (4) ----
  const PUBLIC_SPECIAL: [string, Region, string][] = [
    ["École Nationale Supérieure des Travaux Publics — ENSTP", "CENTRE", "Nkolbisson"],
    ["Institut National de la Jeunesse et des Sports — INJS", "CENTRE", "Yaoundé"],
    ["École Nationale Supérieure des Postes, des Télécommunications et des Technologies de l'Information et de la Communication — SUP'PTIC", "CENTRE", "Yaoundé"],
    ["Nautical Arts and Fisheries Institute — Limbé", "LITTORAL", "Limbé"],
  ];
  PUBLIC_SPECIAL.forEach(([raw, region, city], i) => {
    const { name, shortName } = splitName(raw);
    push({
      code: `PSP-${String(i + 1).padStart(2, "0")}`,
      name,
      shortName,
      institutionType: "PUBLIC_SPECIAL_STATUS",
      ownership: "PUBLIC",
      region,
      city,
      status: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
      recognitionStatus: "RECOGNIZED",
      canIssueNationalDiploma: true,
      canIssuePrivateDiploma: false,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      isActive: true,
    });
  });

  // ---- 3. Institutions internationales / inter-États (4) ----
  push(build("Université Panafricaine", "INTERSTATE_INSTITUTION", "INTERSTATE", "CENTRE", "INT-01", {
    shortName: "UP",
    aliases: ["PAUSTI", "Université Panafricaine de Sciences et Technologies d'Ingénierie"],
    city: "Yaoundé",
    authorizationStatus: "APPROVED",
  }));
  push(build("Université Inter-États Congo-Cameroun", "INTERSTATE_INSTITUTION", "INTERSTATE", "SUD", "INT-02", {
    city: "Sangmélima",
    authorizationStatus: "APPROVED",
  }));
  push(build("African Institute of Mathematical Sciences — AIMS Cameroon", "INTERNATIONAL_INSTITUTION", "INTERNATIONAL", "CENTRE", "INT-03", {
    city: "Yaoundé",
    authorizationStatus: "APPROVED",
  }));
  push(build("Institut Africain d'Informatique — IAI-Cameroun", "INTERNATIONAL_INSTITUTION", "INTERNATIONAL", "CENTRE", "INT-04", {
    shortName: "IAI",
    city: "Yaoundé",
    authorizationStatus: "APPROVED",
  }));

  // ---- 4. Universités privées ayant accédé au rang (2) ----
  push(build("Université Catholique d'Afrique Centrale — UCAC", "PRIVATE_UNIVERSITY", "PRIVATE", "CENTRE", "UPR-01", {
    city: "Yaoundé",
    authorizationStatus: "HOMOLOGATED",
  }));
  push(
    build("Université Adventiste Cosendai", "PRIVATE_UNIVERSITY", "PRIVATE", "CENTRE", "UPR-02", {
      city: "Yaoundé",
      authorizationStatus: "HOMOLOGATED",
    }),
  );

  // ---- 5. IPES autorisés, par région (listing MINESUP) ----
  for (const region of REGIONS) {
    const rows = IPES_BY_REGION[region];
    rows.forEach((raw, i) => {
      push(
        build(raw, "PRIVATE_HIGHER_INSTITUTE", "PRIVATE", region, `IPES-${REGION_ABBR[region]}-${String(i + 1).padStart(2, "0")}`),
      );
    });
  }

  return list;
}

/** Seed officiel complet (injecté par la mutation admin `seedInstitutions`). */
export const SEED_INSTITUTIONS: SeedInstitution[] = buildSeedList();

/** Total attendu du seed (affiché dans le back-office). */
export const SEED_COUNT = SEED_INSTITUTIONS.length;
