import { relationIcon } from "@/lib/diaspora";

/**
 * Rendu professionnel d'une relation de bénéficiaire : icône vectorielle
 * (lucide) cohérente sur toutes les plateformes — jamais d'émoji système.
 */
export function RelationGlyph({
  relation,
  className = "size-5",
}: {
  relation: string;
  className?: string;
}) {
  const Icon = relationIcon(relation);
  return <Icon className={className} aria-hidden />;
}
