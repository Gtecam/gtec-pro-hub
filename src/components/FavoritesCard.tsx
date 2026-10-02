import { useMutation, useQuery } from "convex/react";
import { Building2, Heart, Package, UserCog, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * §35 « ❤️ MES FAVORIS » — espace client : professionnels, entreprises et
 * services enregistrés pour les retrouver vite. Un favori n'accorde aucun
 * accès privilégié : les règles GTEC PRO (devis signé, KYC, abonnement)
 * restent inchangées.
 */

const TYPE_META: Record<string, { label: string; icon: typeof Heart }> = {
  technician: { label: "Technicien", icon: UserCog },
  company: { label: "Entreprise", icon: Building2 },
  service: { label: "Service", icon: Package },
};

export function FavoritesCard() {
  const favorites = useQuery(api.favorites.myFavorites, {});
  const remove = useMutation(api.favorites.removeFavorite);
  const navigate = useNavigate();

  if (favorites === undefined) return null;

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Heart className="size-4 text-primary" /> Mes favoris ({favorites.length})
        </p>
        {favorites.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Aucun favori. Ajoutez un professionnel depuis sa fiche publique pour le
            retrouver ici et lui commander directement.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {favorites.map((f) => {
              const meta = TYPE_META[f.targetType] ?? TYPE_META.technician;
              const Icon = meta.icon;
              const isTech = f.targetType === "technician";
              return (
                <div
                  key={f._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {meta.label}
                        {f.subtitle ? ` · ${f.subtitle}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {isTech && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => navigate(`/t/${f.targetId}`)}
                      >
                        Voir la fiche
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive"
                      onClick={async () => {
                        try {
                          await remove({ id: f._id as Id<"favorites"> });
                          toast.success("Retiré de vos favoris");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Erreur");
                        }
                      }}
                      aria-label="Retirer des favoris"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}