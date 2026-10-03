/**
 * GTEC PRO — GÉNÉRATEUR DE CAHIER DES CHARGES (F°3 « PROJECT BRIEF »).
 * Moteur 100 % local (§37 IA — aucune donnée externe) : à partir de quelques
 * réponses structurées, il produit un cahier des charges modifiable —
 * description, périmètre, lots, délais, livrables et clauses de garantie.
 * Le document est une AIDE à la rédaction : il engage le client seulement
 * après relecture et publication dans une demande de devis.
 */

export type BriefInput = {
  /** Pôle GTEC (serviceKey) : elec, froid, ene… */
  serviceKey?: string;
  /** Libellé du pôle pour l'affichage. */
  serviceLabel?: string;
  /** Intervention du catalogue choisie (code + libellé). */
  interventionCode?: string;
  interventionLabel?: string;
  /** Type de bâtiment : résidence, commerce, bureau, industriel… */
  buildingType: string;
  /** Ville du chantier. */
  city: string;
  /** Surface approximative (m²). */
  surface?: number;
  /** Nombre de points / unités à traiter. */
  quantity: number;
  /** Niveau d'urgence : normale | urgente | critique. */
  urgency: "normale" | "urgente" | "critique";
  /** Échéance souhaitée (libellé libre) : « Sous 2 semaines »… */
  deadline: string;
  /** Contraintes d'accès / d'exploitation (libre). */
  constraints?: string;
  /** Budget indicatif (FCFA), facultatif. */
  budgetHint?: number;
};

export type BriefResult = {
  title: string;
  sections: Array<{ heading: string; lines: string[] }>;
  disclaimer: string;
};

const URGENCY_DELAY: Record<string, string> = {
  normale: "sous 3 à 4 semaines",
  urgente: "sous 7 jours",
  critique: "sous 48 heures",
};

const BUILDING_LABEL: Record<string, string> = {
  residence: "résidence",
  commerce: "local commercial",
  bureau: "bureaux",
  industriel: "site industriel",
  hotel: "établissement hôtelier",
  autre: "bâtiment",
};

/** Génère un cahier des charges structuré (modifiable avant publication). */
export function buildBrief(input: BriefInput): BriefResult {
  const building = BUILDING_LABEL[input.buildingType] ?? input.buildingType;
  const scope = input.interventionLabel?.trim() || "Travaux techniques à définir";
  const pole = input.serviceLabel?.trim() || "Pôle technique GTEC PRO";
  const qty = Math.max(1, Math.min(input.quantity || 1, 500));
  const delay = URGENCY_DELAY[input.urgency] ?? URGENCY_DELAY.normale;

  const title = `${scope} — ${building.charAt(0).toUpperCase() + building.slice(1)}, ${input.city.trim() || "Cameroun"}`;

  const sections: BriefResult["sections"] = [
    {
      heading: "1. Contexte",
      lines: [
        `Maître d'ouvrage : client GTEC PRO (coordonnées transmises avec la demande).`,
        `Site concerné : ${building} à ${input.city.trim() || "—"}${input.surface ? ` · surface approximative ${input.surface.toLocaleString("fr-FR")} m²` : ""}.`,
        `Domaine technique : ${pole}${input.interventionCode ? ` (réf. catalogue ${input.interventionCode})` : ""}.`,
      ],
    },
    {
      heading: "2. Objet des travaux",
      lines: [
        `${scope} — ${qty} point(s) / unité(s) à traiter.`,
        `Prestations attendues : diagnostic initial, réalisation, essais et mise en service, formation express de l'utilisateur.`,
      ],
    },
    {
      heading: "3. Périmètre & exclusions",
      lines: [
        `Inclus : main-d'œuvre qualifiée, matériel courant d'installation, contrôle et essais.`,
        input.constraints?.trim()
          ? `Contraintes d'exploitation : ${input.constraints.trim()}`
          : `Contraintes d'exploitation : à préciser avec le prestataire (horaires, accès, sécurité).`,
        `Exclusions : gros œuvre, fournitures non listées au devis détaillé.`,
      ],
    },
    {
      heading: "4. Délais",
      lines: [
        `Intervention souhaitée ${delay}.`,
        input.deadline.trim()
          ? `Échéance indiquée par le client : ${input.deadline.trim()}.`
          : `Échéance : à caler avec le prestataire retenu.`,
        `Le planning définitif est confirmé à l'acceptation du devis.`,
      ],
    },
    {
      heading: "5. Livrables attendus",
      lines: [
        `Rapport d'intervention avec photos avant/après.`,
        `Procès-verbal de réception signé électroniquement.`,
        input.budgetHint && input.budgetHint > 0
          ? `Budget indicatif communiqué : ${input.budgetHint.toLocaleString("fr-FR")} FCFA (sous réserve du devis signé).`
          : `Devis détaillé (main-d'œuvre + matériel), TVA comprise.`,
      ],
    },
    {
      heading: "6. Garanties & suivi",
      lines: [
        `Garantie de travaux GTEC PRO sur les prestations réalisées.`,
        `Suivi via le dossier technique du bâtiment (documents, historique, garanties).`,
        `Litiges : instruction par l'administration GTEC PRO (§36-37).`,
      ],
    },
  ];

  return {
    title,
    sections,
    disclaimer:
      "Cahier des charges généré automatiquement comme aide à la rédaction. Relisez et complétez avant envoi : le document publié accompagne votre demande et le devis signé reste la seule référence contractuelle (§24).",
  };
}

/** Rendu texte complet (copie, export PDF via impression). */
export function briefToText(brief: BriefResult): string {
  return [
    brief.title,
    "",
    ...brief.sections.map((s) => [s.heading, ...s.lines.map((l) => `• ${l}`)].join("\n")),
    "",
    brief.disclaimer,
  ].join("\n\n");
}
