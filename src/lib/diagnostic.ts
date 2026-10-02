/**
 * GTEC PRO — MOTEUR DE PRÉ-DIAGNOSTIC (F°1 « GTEC AI DIAGNOSTIC »).
 * Moteur 100 % local (aucune donnée envoyée à un service externe — §37 IA) :
 * questions guidées par domaine + scoring simple sur les réponses.
 * Le résultat est une AIDE au pré-diagnostic, jamais une certification
 * technique définitive : le technicien conserve la validation finale.
 */

export type DiagnosticAnswer = { question: string; answer: string };

export type DiagnosticResult = {
  probableCategory: string;
  interventionType: string;
  urgency: "normale" | "urgente" | "critique";
  urgencyReason: string;
  requiredSkills: string[];
  possibleMaterials: string[];
  estimatedDurationHours: number;
  techniciansNeeded: number;
  disclaimer: string;
};

type Question = { q: string; options: string[] };
type Domain = {
  key: string; // préfixe serviceKey (elec, froid, ene…)
  label: string;
  questions: Question[];
  keywords: RegExp;
  rules: Array<{
    // Le moteur additionne les poids des réponses matchées.
    match: RegExp;
    urgency?: DiagnosticResult["urgency"];
    reason?: string;
    materials?: string[];
    duration?: number;
    technicians?: number;
    skills?: string[];
  }>;
  defaultSkills: string[];
};

const COMMON_QUESTIONS: Question[] = [
  { q: "Depuis combien de temps le problème dure-t-il ?", options: ["Moins de 24 h", "Quelques jours", "Plus d'une semaine"] },
  { q: "Le problème est-il permanent ou intermittent ?", options: ["Permanent", "Intermittent", "Apparu après un orage/coupure"] },
  { q: "Une maintenance récente a-t-elle été effectuée ?", options: ["Oui, il y a moins d'un mois", "Il y a plusieurs mois", "Jamais"] },
  { q: "Y a-t-il un risque immédiat (odeur de brûlé, étincelles, fuite d'eau) ?", options: ["Oui", "Non", "Je ne sais pas"] },
];

export const DIAGNOSTIC_DOMAINS: Domain[] = [
  {
    key: "froid",
    label: "Climatisation & froid",
    keywords: /(clim|climat|froid|ventilat|congel|réfrig|refroid)/i,
    questions: [
      { q: "L'appareil démarre-t-il ?", options: ["Oui", "Non, aucune réaction", "Il disjoncte"] },
      { q: "Le ventilateur fonctionne-t-il ?", options: ["Oui", "Non", "Il fait un bruit anormal"] },
      { q: "Y a-t-il un bruit inhabituel ?", options: ["Aucun", "Grondement", "Sifflement", "Cliquets répétés"] },
      { q: "L'unité extérieure givre-t-elle ou fuit-elle ?", options: ["Oui", "Non", "Je ne sais pas"] },
      ...COMMON_QUESTIONS,
    ],
    rules: [
      { match: /aucune réaction/i, urgency: "urgente", reason: "Appareil qui ne démarre plus : panne électrique ou carte de commande possible.", materials: ["Multimètre", "Condensateur", "Carte de commande"], duration: 2, technicians: 1 },
      { match: /disjoncte/i, urgency: "urgente", reason: "Disjonction répétée : risque de court-circuit ou de compresseur en fin de vie.", materials: ["Contrôleur d'isolement", "Condensateur"], duration: 2, technicians: 1 },
      { match: /ne refroidit plus|refroidit mal|pas froid/i, urgency: "normale", reason: "Perte de charge frigorifique ou encrassement probables.", materials: ["Manifold", "Fluide R410A/R32", "Filtre"], duration: 2, technicians: 1 },
      { match: /givre|fuit/i, urgency: "normale", reason: "Givrage ou condensats : bocal bouché ou manque de gaz.", materials: ["Pompe à vide", "Bocal", "Ruban isolant"], duration: 2, technicians: 1 },
      { match: /bruit|grondement|cliquet/i, reason: "Bruit anormal : palier de ventilateur ou compresseur à contrôler.", materials: ["Palier", "Ampoule de test"], duration: 1 },
      { match: /orage|coupure/i, urgency: "urgente", reason: "Apparition après surtension : carte électronique à inspecter.", materials: ["Multimètre", "Carte de commande"] },
    ],
    defaultSkills: ["FROID-CLIM-DIAG", "FROID-CLIM-MAINT"],
  },
  {
    key: "elec",
    label: "Électricité générale",
    keywords: /(courant|électri|disjonct|prise|lampe|lumière|tableau|court-circuit|étincelle)/i,
    questions: [
      { q: "Toute l'installation est-elle coupée ou seulement une partie ?", options: ["Tout est coupé", "Une partie seulement", "Une prise / un point lumineux"] },
      { q: "Le disjoncteur différentiel saute-t-il dès la remise sous tension ?", options: ["Oui, immédiatement", "Après quelques minutes", "Non"] },
      { q: "Avez-vous constaté chauffe, odeur de brûlé ou traces noires ?", options: ["Oui", "Non"] },
      ...COMMON_QUESTIONS,
    ],
    rules: [
      { match: /odeur de brûlé|traces noires|étincelle/i, urgency: "critique", reason: "Signes d'échauffement anormal : RISQUE D'INCENDIE, couper l'alimentation générale.", materials: ["Caméra thermique", "Bornes de reprise", "Câble"], duration: 3, technicians: 2 },
      { match: /immédiatement/i, urgency: "urgente", reason: "Déclenchement instantané : défaut d'isolement actif sur le circuit.", materials: ["Testeur d'isolement", "Différentiel"], duration: 2, technicians: 1 },
      { match: /tout est coupé/i, urgency: "urgente", reason: "Panne générale : différentiel d'abonné ou branchement à contrôler.", materials: ["Multimètre", "VAT"], duration: 2, technicians: 1 },
      { match: /une partie|prise|point lumineux/i, urgency: "normale", reason: "Défaut localisé sur un circuit : recherche de panne classique.", materials: ["Multimètre", "Détecteur de tension"], duration: 2, technicians: 1 },
    ],
    defaultSkills: ["ELEC-RES-DIAG", "ELEC-RES-DEPAN"],
  },
  {
    key: "ene",
    label: "Solaire & énergie",
    keywords: /(solaire|panneau|batterie|onduleur|photovolt|énergie)/i,
    questions: [
      { q: "L'onduleur affiche-t-il un code d'erreur ?", options: ["Oui", "Non", "Écran éteint"] },
      { q: "La production est-elle tombée à zéro ou partielle ?", options: ["Zéro", "Partielle", "Je ne sais pas"] },
      { q: "Les batteries se déchargent-elles anormalement vite ?", options: ["Oui", "Non"] },
      ...COMMON_QUESTIONS,
    ],
    rules: [
      { match: /écran éteint|zéro/i, urgency: "urgente", reason: "Production nulle : chaîne DC, fusible ou onduleur à vérifier.", materials: ["Multimètre TRMS", "Pince DC", "Fusible"], duration: 3, technicians: 2 },
      { match: /anormalement|se déchargent/i, reason: "Batteries vieillissantes ou régulateur défaillant : test de capacité recommandé.", materials: ["Testeur de batterie", "Hydromètre"], duration: 3, technicians: 1 },
      { match: /partielle/i, urgency: "normale", reason: "String partiellement hors service : module, connecteur MC4 ou diode.", materials: ["Connecteurs MC4", "Multimètre"], duration: 2, technicians: 1 },
    ],
    defaultSkills: ["ENE-SOL-DIAG", "ENE-SOL-MAINT"],
  },
  {
    key: "plb",
    label: "Plomberie & eau",
    keywords: /(fuite|robinet|wc|toilette|canalis|pompe|chauffe-eau|eau)/i,
    questions: [
      { q: "L'eau s'écoule-t-elle en continu ?", options: ["Oui, fort débit", "Goutte à goutte", "Non"] },
      { q: "Pouvez-vous couper l'eau localement ?", options: ["Oui", "Non, robinet d'arrêt inaccessible"] },
      ...COMMON_QUESTIONS,
    ],
    rules: [
      { match: /fort débit|inaccessible/i, urgency: "urgente", reason: "Fuite active non isolable : risque de dégât des eaux.", materials: ["Collier de réparation", "Téflon", "Joints"], duration: 2, technicians: 1 },
      { match: /goutte à goutte/i, urgency: "normale", reason: "Fuite légère : joint ou mécanisme à remplacer.", materials: ["Jeu de joints", "Flotteur"], duration: 1, technicians: 1 },
    ],
    defaultSkills: ["PLB-RES-DIAG", "PLB-RES-REPAR"],
  },
];

const FALLBACK: Domain = {
  key: "autre",
  label: "Multi-technique",
  keywords: /.*/,
  questions: COMMON_QUESTIONS,
  rules: [],
  defaultSkills: [],
};

export function detectDomain(text: string): Domain {
  return DIAGNOSTIC_DOMAINS.find((d) => d.keywords.test(text)) ?? FALLBACK;
}

/** Questions à poser pour un problème décrit (ou le domaine fourni). */
export function questionsFor(text: string): { domainKey: string; domainLabel: string; questions: Question[] } {
  const d = detectDomain(text);
  return { domainKey: d.key, domainLabel: d.label, questions: d.questions };
}

/** Calcule le résultat du pré-diagnostic à partir des réponses. */
export function runDiagnostic(question: string, answers: DiagnosticAnswer[]): DiagnosticResult {
  const domain = detectDomain(question);
  const all = [question, ...answers.map((a) => `${a.question} ${a.answer}`)].join(" \n");

  let urgency: DiagnosticResult["urgency"] = "normale";
  const reasons = new Set<string>();
  const materials = new Set<string>();
  let duration = 1.5;
  let technicians = 1;

  const rank = { normale: 0, urgente: 1, critique: 2 };
  for (const rule of domain.rules) {
    if (!rule.match.test(all)) continue;
    if (rule.urgency && rank[rule.urgency] > rank[urgency]) {
      urgency = rule.urgency;
      if (rule.reason) reasons.add(rule.reason);
    } else if (rule.reason && urgency === "normale") {
      reasons.add(rule.reason);
    }
    (rule.materials ?? []).forEach((m) => materials.add(m));
    if (rule.duration && rule.duration > duration) duration = rule.duration;
    if (rule.technicians && rule.technicians > technicians) technicians = rule.technicians;
  }

  // « Risque immédiat oui » renforce l'urgence quel que soit le domaine.
  const risky = answers.some((a) => /risque immédiat/i.test(a.question) && /^oui$/i.test(a.answer.trim()));
  if (risky && rank[urgency] < 2) {
    urgency = "critique";
    reasons.add("Risque immédiat signalé : intervention prioritaire.");
  }
  if (reasons.size === 0) {
    reasons.add("Première analyse sur la base des éléments décrits — à confirmer sur place.");
  }

  return {
    probableCategory: domain.label,
    interventionType:
      urgency === "critique"
        ? "Dépannage urgent — sécurité"
        : urgency === "urgente"
          ? "Dépannage prioritaire"
          : "Diagnostic et réparation",
    urgency,
    urgencyReason: [...reasons].join(" "),
    requiredSkills: domain.defaultSkills,
    possibleMaterials: [...materials].slice(0, 6),
    estimatedDurationHours: duration,
    techniciansNeeded: technicians,
    disclaimer:
      "Pré-diagnostic indicatif généré automatiquement : il ne constitue pas une certification technique définitive. Le technicien GTEC PRO confirme le diagnostic réel sur place.",
  };
}
