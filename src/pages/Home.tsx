/**
 * ACCUEIL CLIENT — GTEC PRO (refonte « Simple. Rapide. Professionnel. »)
 *
 * Une seule question : « De quel professionnel avez-vous besoin ? »
 * Hiérarchie : 1. recherche → 2. catégories → 3. urgence → 4. suivi.
 * Aucune statistique, commission, contrat ou bannière ici : tout le reste
 * vit dans les écrans dédiés (Mes demandes, Profil, Bâtiments…).
 */
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  Battery,
  Building2,
  Flame,
  Gauge,
  Network,
  Package,
  Search,
  Sun,
  Wind,
  Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/gtec";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_CATEGORIES,
  SERVICES,
  statusMeta,
  type ServiceKey,
} from "@/lib/gtec";
import type { LucideIcon } from "lucide-react";

/** Les 6 catégories mises en avant sur l'accueil (le reste : « Voir tout »). */
const HOME_CATEGORY_KEYS: ServiceKey[] = [
  "cfo", // Électricité
  "solaire", // Solaire
  "hvac", // Climatisation
  "cfa", // Informatique / réseaux / vidéosurveillance
  "batiment", // Bâtiment
  "maintenance", // Maintenance
];

const CATEGORY_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Zap,
  Sun,
  Wind,
  Network,
  Battery,
  Gauge,
  Package,
  Building2,
};

function HomeCategoryCard({
  categoryKey,
  label,
  icon,
}: {
  categoryKey: ServiceKey;
  label: string;
  icon: string;
}) {
  const navigate = useNavigate();
  // Référence stable (composant module-level) : jamais recréé pendant le
  // rendu (react-hooks/static-components).
  const Icon = CATEGORY_ICON_COMPONENTS[icon] ?? Zap;
  return (
    <button
      type="button"
      onClick={() => navigate(`/dashboard/new?service=${categoryKey}`)}
      className="flex flex-col items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-3 py-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.03] active:bg-primary/[0.06]"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <span className="text-sm font-medium leading-tight">{label}</span>
    </button>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const requests = useQuery(api.gtec.listMyRequests);

  // DEMANDE EN COURS : une seule petite carte, uniquement si elle existe
  // réellement — jamais d'état vide « aucune demande » (règle UX §7).
  const active = (requests ?? [])
    .filter((r) => !["terminee", "annulee"].includes(r.request.status))
    .sort((a, b) => {
      const rank = (s: string) =>
        s === "en_intervention" ? 2 : s === "rapport_emis" ? 1 : 0;
      return rank(b.request.status) - rank(a.request.status);
    })[0];

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 pb-4">
        {/* ---------- Message principal ---------- */}
        <div className="pt-2 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            De quel professionnel avez-vous besoin ?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            Décrivez votre besoin et trouvez rapidement un professionnel
            disponible près de vous.
          </p>
        </div>

        {/* ---------- 1. Recherche ---------- */}
        <button
          type="button"
          onClick={() => navigate("/search")}
          className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4 text-left shadow-sm transition-colors hover:border-primary/40"
        >
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-base text-muted-foreground">
            Rechercher un service
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </button>

        {/* ---------- 2. Catégories principales (6 max) ---------- */}
        <div className="grid grid-cols-3 gap-3">
          {HOME_CATEGORY_KEYS.map((key) => {
            const cat = DEFAULT_CATEGORIES.find((c) => c.key === key);
            if (!cat) return null;
            return (
              <HomeCategoryCard
                key={key}
                categoryKey={key}
                label={cat.label.split("—")[0].split("&")[0].trim()}
                icon={cat.icon}
              />
            );
          })}
        </div>

        <div className="text-center">
          <Button variant="link" size="sm" onClick={() => navigate("/search")}>
            Voir tous les services
          </Button>
        </div>

        {/* ---------- 3. Intervention urgente ---------- */}
        <div className="flex flex-col items-center gap-1.5">
          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full max-w-sm rounded-2xl border-red-500/40 text-red-600 hover:bg-red-500/[0.05] hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            onClick={() => navigate("/dashboard/new?urgent=1")}
          >
            <Flame className="mr-2 size-5" />
            Besoin urgent ?
          </Button>
          <p className="text-xs text-muted-foreground">
            Trouver un professionnel disponible maintenant
          </p>
        </div>

        {/* ---------- 4. Demande en cours (si — et seulement si — elle existe) ---------- */}
        {active && (
          <Card className="card-layered">
            <CardContent className="flex items-center gap-4 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {(() => {
                  const Icon = SERVICES.find(
                    (s) => s.key === active.request.serviceKey,
                  )?.icon;
                  return Icon ? <Icon className="size-5" /> : null;
                })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Intervention en cours</p>
                <p className="truncate text-sm text-muted-foreground">
                  {SERVICES.find((s) => s.key === active.request.serviceKey)
                    ?.label ?? active.request.serviceKey}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {statusMeta(active.request.status).label}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-primary"
                onClick={() =>
                  navigate(`/dashboard/requests/${active.request._id}`)
                }
              >
                Voir le suivi <ArrowRight className="ml-1 size-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {user === undefined && (
          <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        )}
      </div>
    </AppShell>
  );
}
