/**
 * RECHERCHE DE SERVICES — client (accueil → recherche → demande).
 *
 * Liste filtrable des services disponibles : l'accueil pointe ici pour
 * « Rechercher un service » et « Voir tous les services ». Choisir un service
 * ouvre le formulaire de demande pré-sélectionné — le parcours reste
 * TROUVER → CHOISIR → FAIRE RÉALISER.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowRight, Search, X } from "lucide-react";
import { AppShell } from "@/components/gtec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_CATEGORIES,
  categoryIcon,
  type ServiceKey,
} from "@/lib/gtec";

/** Exemples de recherche affichés quand le champ est vide (§4 du brief). */
const SEARCH_EXAMPLES = [
  "Électricien",
  "Climatisation",
  "Installation solaire",
  "Informaticien",
  "Plombier",
  "Maintenance",
  "Vidéosurveillance",
];

/** Synonymes pratiques : la recherche tolère le langage du client. */
const ALIASES: Array<{ match: string[]; key: ServiceKey }> = [
  { match: ["electric", "électricien", "electricien", "courant", "panne"], key: "cfo" },
  { match: ["solaire", "panneau", "batterie", "onduleur", "energie", "énergie"], key: "solaire" },
  { match: ["clim", "climatisation", "froid", "hvac", "split", "ventilation"], key: "hvac" },
  { match: ["info", "informatique", "reseau", "réseau", "wifi", "video", "vidéo", "camera", "caméra", "surveillance", "fibre", "internet"], key: "cfa" },
  { match: ["batiment", "bâtiment", "construction", "macon", "maçon", "genie", "génie"], key: "batiment" },
  { match: ["maintenance", "entretien", "contrat", "visite", "preventif", "préventif"], key: "maintenance" },
  { match: ["haute tension", "hta", "poste", "transformateur"], key: "hta" },
  { match: ["industrie", "automatisme", "moteur", "armoire"], key: "industrie" },
  { match: ["domotique", "maison connectee", "connecté", "acces", "accès"], key: "domotique" },
  { match: ["incendie", "alarme", "extincteur", "securite", "sécurité"], key: "incendie" },
  { match: ["inspection", "diagnostic", "audit", "thermographie", "mesure"], key: "inspection" },
  { match: ["materiel", "matériel", "fourniture", "cable", "câble", "store", "achat"], key: "fourniture" },
];

export default function SearchServices() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEFAULT_CATEGORIES;
    // Alias d'abord : « climatisation » doit tomber sur la bonne catégorie
    // même si le libellé officiel est « Climatisation, HVAC & froid ».
    const aliasKey = ALIASES.find((a) =>
      a.match.some((m) => q.includes(m) || m.includes(q)),
    )?.key;
    return DEFAULT_CATEGORIES.filter((c) => {
      if (aliasKey === c.key) return true;
      const haystack = [c.label, c.description, ...c.subcategories]
        .join(" ")
        .toLowerCase();
      return q.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [query]);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <h1 className="font-display pt-2 text-xl font-bold tracking-tight">
          Quel service recherchez-vous ?
        </h1>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un service…"
            className="h-14 rounded-2xl pl-11 pr-10 text-base"
            inputMode="search"
          />
          {query && (
            <button
              type="button"
              aria-label="Effacer"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {!query && (
          <div className="flex flex-wrap gap-1.5">
            {SEARCH_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQuery(ex)}
                className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {results.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucun service ne correspond à « {query} ».{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => navigate("/dashboard/new")}
            >
              Décrire votre besoin
            </button>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((c) => {
              const Icon = categoryIcon(c.icon);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => navigate(`/dashboard/new?service=${c.key}`)}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {c.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.description}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            Retour à l'accueil
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
