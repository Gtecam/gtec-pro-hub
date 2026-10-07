/**
 * GTEC PRO — ESTIMATION INTELLIGENTE DU BUDGET (F°2 « GTEC ESTIMATE »).
 * Moteur 100 % local : la fourchette est calculée à partir du prix de
 * référence du catalogue officiel (table serviceInterventions, prix fixés
 * par l'administration, fournis par l'appelant via basePrice).
 * C'est une fourchette indicative : elle ne remplace jamais le devis signé
 * du prestataire, seule référence financière de la mission (§24).
 */

export type EstimateInput = {
  /** Prix de référence du catalogue (serviceInterventions.price). */
  basePrice?: number;
  /** Libellé de l'intervention choisie (pour l'affichage). */
  baseLabel?: string;
  quantity?: number; // nombre de points / unités
  difficulty?: "simple" | "moyen" | "complexe";
  urgency?: "normale" | "urgente" | "critique";
  technicians?: number;
  materialsIncluded?: boolean; // matériel fourni par le prestataire
};

export type EstimateResult = {
  min: number;
  max: number;
  currency: string;
  baseLabel: string;
  detail: string[];
  disclaimer: string;
};

const URGENCY_FACTOR: Record<string, number> = { normale: 1, urgente: 1.2, critique: 1.35 };
const DIFFICULTY_FACTOR: Record<string, number> = { simple: 0.9, moyen: 1, complexe: 1.35 };

const DEFAULT_BASE = 50_000;

export function estimateBudget(input: EstimateInput): EstimateResult {
  const detail: string[] = [];
  let base = 0;
  const baseLabel = input.baseLabel?.trim() || "Intervention technique";

  if (input.basePrice && input.basePrice > 0) {
    base = input.basePrice;
    detail.push(`Catalogue GTEC : ${baseLabel} (${base.toLocaleString("fr-FR")} FCFA de référence)`);
  } else {
    base = DEFAULT_BASE;
    detail.push("Sans prix catalogue : base indicative par défaut 50 000 FCFA");
  }

  const qty = Math.max(1, Math.min(input.quantity ?? 1, 200));
  if (qty > 1) detail.push(`Quantité : ${qty} unité(s)`);
  const diff = DIFFICULTY_FACTOR[input.difficulty ?? "moyen"] ?? 1;
  if (diff !== 1) detail.push(`Difficulté « ${input.difficulty} » : ×${diff}`);
  const urg = URGENCY_FACTOR[input.urgency ?? "normale"] ?? 1;
  if (urg !== 1) detail.push(`Urgence « ${input.urgency} » : ×${urg}`);
  const techs = Math.max(1, Math.min(input.technicians ?? 1, 6));
  if (techs > 1) detail.push(`Équipe : ${techs} techniciens (×${techs})`);
  const mat = input.materialsIncluded === false ? 0.85 : 1; // matériel non fourni → −15 %
  if (mat !== 1) detail.push("Matériel non fourni : −15 % (main-d'œuvre seule)");

  const point = base * qty * diff * urg * techs * mat;
  // Fourchette ±20 % : le prix réel dépend du diagnostic sur place.
  const min = Math.round((point * 0.8) / 500) * 500;
  const max = Math.round((point * 1.2) / 500) * 500;

  return {
    min,
    max,
    currency: "FCFA",
    baseLabel,
    detail,
    disclaimer:
      "Estimation indicative générée automatiquement à partir du catalogue officiel GTEC PRO. Elle ne remplace jamais le devis officiel du prestataire : seul le devis signé fait foi (§24).",
  };
}

export const fcfaRange = (r: { min: number; max: number }): string =>
  `${r.min.toLocaleString("fr-FR")} – ${r.max.toLocaleString("fr-FR")} FCFA`;
