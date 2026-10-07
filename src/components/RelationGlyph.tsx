import { createElement } from "react";
import { relationIcon } from "@/lib/diaspora";

/**
 * Rendu professionnel d'une relation de bénéficiaire : icône vectorielle
 * (lucide) cohérente sur toutes les plateformes — jamais d'émoji système.
 * `createElement` (et non un composant assigné en rendu) reste conforme à la
 * règle react-compiler « no components created during render ».
 */
export function RelationGlyph({
  relation,
  className = "size-5",
}: {
  relation: string;
  className?: string;
}) {
  return createElement(relationIcon(relation), {
    className,
    "aria-hidden": true,
  });
}
