import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BadgeCheck,
  Car,
  CheckSquare,
  ChevronDown,
  Crown,
  MapPin,
  Scale,
  Send,
  Square,
  Star,
  Timer,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router";

/**
 * GTEC PRO — « Professionnels disponibles » (§5, §7, §8, §10, §12, §16).
 *
 * Le client découvre les pros éligibles (filtrage §3 déjà appliqué côté
 * serveur), les compare (§7, 2 à 5), sélectionne 1 à 5 (§8), envoie les
 * demandes de devis, ou bascule en MODE 2 « GTEC choisit pour moi » (§12).
 * Le score interne n'est PAS affiché (§6) : seules des cartes lisibles et
 * des recommandations explicables (§10) orientent le choix.
 */

type ProMatch = {
  proUserId: string;
  name: string;
  image: string | null;
  jobTitle: string | null;
  specialtyLabel: string | null;
  city: string | null;
  experienceYears: number;
  avgRating: number | null;
  reviewCount: number;
  missionCount: number;
  distanceKm: number;
  availability: string;
  availableFrom: number | null;
  etaMin: number | null;
  fromPrice: number | null;
  certifications: string[];
  skills: string[];
  zones: string[];
};

type FindResult = {
  matches: ProMatch[];
  excludedCount: number;
  expanded: boolean;
  urgency?: string;
  deadlineMinutes?: number;
};

/** 🟢🟠🔵⚫ — indicateurs de statut (§15). */
export function availabilityMeta(a: string): {
  dot: string;
  label: string;
  tone: string;
} {
  switch (a) {
    case "disponible":
      return {
        dot: "bg-emerald-500",
        label: "Disponible maintenant",
        tone: "text-emerald-600 dark:text-emerald-400",
      };
    case "occupe":
    case "en_intervention":
      return { dot: "bg-sky-500", label: "Sur une autre mission", tone: "text-sky-600 dark:text-sky-400" };
    case "hors_ligne":
      return { dot: "bg-slate-400", label: "Hors ligne", tone: "text-muted-foreground" };
    default:
      return { dot: "bg-zinc-400", label: "Indisponible", tone: "text-muted-foreground" };
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function etaLabel(m: ProMatch): string {
  if (m.etaMin == null) return "—";
  return `${m.etaMin}–${m.etaMin + 10} min`;
}

// ============================ CARTE PRO (§5) =================================

function ProCard({
  pro,
  selected,
  onToggle,
  onCompare,
  compareChecked,
  rank,
  badge,
}: {
  pro: ProMatch;
  selected: boolean;
  onToggle: () => void;
  onCompare: () => void;
  compareChecked: boolean;
  rank: number;
  badge?: { emoji: string; label: string; hint: string };
}) {
  const navigate = useNavigate();
  const ava = availabilityMeta(pro.availability);
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-all",
        selected
          ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
          : "border-border/70 hover:border-primary/40",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Photo */}
        {pro.image ? (
          <img
            src={pro.image}
            alt={pro.name}
            className="size-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
            {initials(pro.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-medium">{pro.name}</p>
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
              <BadgeCheck className="size-3" /> Vérifié
            </span>
            {rank === 1 && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                🏆 Meilleure correspondance
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[pro.jobTitle, pro.specialtyLabel, pro.city].filter(Boolean).join(" · ")}
          </p>
          {badge && (
            <p
              className="mt-1 w-fit cursor-help rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium"
              title={badge.hint}
            >
              {badge.emoji} {badge.label}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {pro.experienceYears > 0 && <span>{pro.experienceYears} ans d'expérience</span>}
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {pro.avgRating != null
                ? `${pro.avgRating}/5 — ${pro.reviewCount} évaluations`
                : "Nouveau — pas encore d'évaluation"}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {pro.distanceKm < 1
                ? "à moins d'1 km"
                : `À environ ${Math.round(pro.distanceKm)} km`}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={cn("flex items-center gap-1.5 font-medium", ava.tone)}>
              <span className={cn("size-2 rounded-full", ava.dot)} />
              {pro.availableFrom && pro.availability !== "disponible"
                ? `Disponible à ${new Date(pro.availableFrom).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
                : ava.label}
            </span>
            {pro.etaMin != null && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Car className="size-3.5" /> Arrivée estimée : {etaLabel(pro)}
              </span>
            )}
            <span className="font-medium">
              {pro.fromPrice != null
                ? `À partir de ${pro.fromPrice.toLocaleString("fr-FR")} FCFA`
                : "Devis nécessaire"}
            </span>
          </div>
        </div>
        {/* Actions verticales */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button size="sm" variant={selected ? "secondary" : "default"} onClick={onToggle}>
            {selected ? "Sélectionné ✓" : "Sélectionner"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-8", compareChecked && "text-primary")}
            onClick={onCompare}
          >
            {compareChecked ? (
              <CheckSquare className="mr-1 size-3.5" />
            ) : (
              <Square className="mr-1 size-3.5" />
            )}
            Comparer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            onClick={() => navigate(`/t/${pro.proUserId}`)}
          >
            Voir le profil
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================ COMPARATEUR (§7) ===============================

function ComparisonTable({ pros }: { pros: ProMatch[] }) {
  const rows: { label: string; render: (p: ProMatch) => React.ReactNode }[] = [
    { label: "Vérifié", render: () => "✓" },
    {
      label: "Spécialité",
      render: (p) => [p.jobTitle, p.specialtyLabel].filter(Boolean).join(" · ") || "—",
    },
    { label: "Expérience", render: (p) => `${p.experienceYears} ans` },
    {
      label: "Note",
      render: (p) => (p.avgRating != null ? `${p.avgRating}/5` : "—"),
    },
    { label: "Interventions", render: (p) => `${p.missionCount}` },
    {
      label: "Distance",
      render: (p) => (p.distanceKm < 1 ? "<1 km" : `${Math.round(p.distanceKm)} km`),
    },
    {
      label: "Disponibilité",
      render: (p) => availabilityMeta(p.availability).label,
    },
    {
      label: "Tarif indicatif",
      render: (p) =>
        p.fromPrice != null ? `${p.fromPrice.toLocaleString("fr-FR")} FCFA` : "Devis",
    },
    {
      label: "Certifications",
      render: (p) => (p.certifications.length > 0 ? `✓ (${p.certifications.length})` : "—"),
    },
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-muted/50 text-left">
            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Critère
            </th>
            {pros.map((p) => (
              <th key={p.proUserId} className="px-3 py-2 text-xs font-semibold">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border/50 last:border-0">
              <td className="px-3 py-2 text-xs font-medium text-muted-foreground">
                {row.label}
              </td>
              {pros.map((p) => (
                <td key={p.proUserId} className="px-3 py-2">
                  {row.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================ COMPOSANT PRINCIPAL ============================

export function ProfessionalMatches({
  requestId,
  preview,
  onDone,
}: {
  requestId?: string;
  preview?: {
    city: string;
    coords?: { lat: number; lon: number };
    specialtyCode?: string;
    requiredSkills?: string[];
    serviceKey: string;
  };
  /** Appelé quand devis envoyés ou choix auto effectué (l'étape est terminée). */
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [sending, setSending] = useState(false);

  const result = useQuery(
    api.matching.findProfessionals,
    requestId
      ? { requestId: requestId as never, expanded }
      : preview
        ? { inputs: preview, expanded }
        : "skip",
  );
  const shortlist = useQuery(
    api.matching.myShortlist,
    requestId ? { requestId: requestId as never } : "skip",
  );
  const recordRun = useMutation(api.matching.recordMatchRun);
  const toggleShortlist = useMutation(api.matching.toggleShortlist);
  const requestQuotes = useMutation(api.matching.requestQuotes);
  const chooseForMe = useMutation(api.matching.chooseForMe);
  const logComparison = useMutation(api.matching.logComparison);
  const expandSearch = useMutation(api.matching.expandSearch);

  const matches = result?.matches ?? [];
  const selected = new Set(shortlist?.proUserIds ?? []);

  // Recommandations explicables (§10) — critères objectifs uniquement.
  const badges = useMemo(() => {
    const out = new Map<string, { emoji: string; label: string; hint: string }>();
    if (matches.length === 0) return out;
    const available = matches.filter((m) => m.availability === "disponible");
    const best = available[0] ?? matches[0];
    out.set(best.proUserId, {
      emoji: "🏆",
      label: "Meilleur choix",
      hint: "Professionnel particulièrement adapté à votre demande : compétences, proximité et disponibilité combinées.",
    });
    const fastest = [...(available.length ? available : matches)].sort(
      (a, b) => a.distanceKm - b.distanceKm,
    )[0];
    if (fastest && !out.has(fastest.proUserId)) {
      out.set(fastest.proUserId, {
        emoji: "⚡",
        label: "Plus rapide",
        hint: "Disponible immédiatement et le plus proche de votre chantier.",
      });
    }
    const cheapest = [...matches]
      .filter((m) => m.fromPrice != null)
      .sort((a, b) => (a.fromPrice ?? 0) - (b.fromPrice ?? 0))[0];
    if (cheapest && !out.has(cheapest.proUserId)) {
      out.set(cheapest.proUserId, {
        emoji: "💰",
        label: "Option économique",
        hint: "Offre présentant le montant estimé le plus faible parmi les tarifs déclarés.",
      });
    }
    const bestRated = [...matches]
      .filter((m) => m.avgRating != null && m.reviewCount >= 3)
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))[0];
    if (bestRated && !out.has(bestRated.proUserId)) {
      out.set(bestRated.proUserId, {
        emoji: "⭐",
        label: "Mieux noté",
        hint: "Meilleure évaluation client sur les interventions réalisées.",
      });
    }
    const expert = [...matches]
      .filter((m) => m.experienceYears > 0)
      .sort(
        (a, b) =>
          b.experienceYears + b.certifications.length * 2 -
          (a.experienceYears + a.certifications.length * 2),
      )[0];
    if (expert && !out.has(expert.proUserId)) {
      out.set(expert.proUserId, {
        emoji: "🛠️",
        label: "Expert",
        hint: "Expérience et certifications particulièrement adaptées à cette intervention.",
      });
    }
    return out;
  }, [matches]);

  // Premier affichage avec demande réelle : traçabilité §19 (best effort).
  const [recorded, setRecorded] = useState(false);
  useEffect(() => {
    if (!requestId || !result || recorded) return;
    setRecorded(true);
    void recordRun({
      requestId: requestId as never,
      proUserIds: result.matches.slice(0, 30).map((m) => m.proUserId as never),
      excludedCount: result.excludedCount,
      expanded,
    }).catch(() => undefined);
    // Un seul enregistrement par affichage de la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, result?.matches.length]);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) {
        toast.error("Comparaison limitée à 5 professionnels.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleRequestQuotes = async () => {
    if (!requestId) return;
    if (selected.size === 0) {
      toast.error("Sélectionnez au moins 1 professionnel (jusqu'à 5).");
      return;
    }
    setSending(true);
    try {
      const res = await requestQuotes({
        requestId: requestId as never,
        proUserIds: [...selected] as never[],
      });
      toast.success(
        `${res.sent} demande(s) de devis envoyée(s) — réponse attendue dans les ${result?.deadlineMinutes ?? 60} minutes.`,
      );
      onDone?.();
      navigate(`/dashboard/requests/${requestId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSending(false);
    }
  };

  const handleChooseForMe = async () => {
    if (!requestId) return;
    setSending(true);
    try {
      await chooseForMe({ requestId: requestId as never });
      toast.success("GTEC PRO a choisi le meilleur professionnel pour vous.");
      onDone?.();
      navigate(`/dashboard/requests/${requestId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSending(false);
    }
  };

  const handleExpand = async () => {
    if (!requestId) {
      setExpanded(true);
      return;
    }
    try {
      await expandSearch({ requestId: requestId as never });
      setExpanded(true);
      toast.info("Recherche élargie — des professionnels plus éloignés sont inclus.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const comparePros = matches.filter((m) => compareIds.includes(m.proUserId));

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau urgence / délai (§11) */}
      {result?.urgency && result.urgency !== "normale" && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-400">
          <Timer className="size-3.5" />
          Demande {result.urgency} — réponse attendue dans les{" "}
          {result.deadlineMinutes} minutes après envoi aux professionnels.
        </p>
      )}

      {result === undefined ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <Card className="card-layered">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="font-display text-lg font-semibold">
              Aucun professionnel éligible pour l'instant
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {result.excludedCount > 0
                ? `${result.excludedCount} professionnel(s) ont été écartés par le filtrage d'éligibilité (vérification, disponibilité, zone, compétences). `
                : ""}
              Élargissez la recherche ou réessayez plus tard — de nouveaux pros
              se connectent en continu.
            </p>
            <Button variant="outline" onClick={handleExpand}>
              Élargir la recherche
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{matches.length}</span>{" "}
              professionnel(s) éligible(s)
              {result.expanded && " · recherche élargie"}
              {" — "}sélectionnez <strong>1 à 5</strong> pros pour recevoir des
              propositions de devis.
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleExpand}
              disabled={result.expanded}
            >
              Élargir la recherche
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {matches.map((m, i) => (
              <ProCard
                key={m.proUserId}
                pro={m}
                rank={i + 1}
                badge={badges.get(m.proUserId)}
                selected={selected.has(m.proUserId)}
                compareChecked={compareIds.includes(m.proUserId)}
                onToggle={() => {
                  if (!requestId) {
                    toast.info("Créez d'abord la demande pour sélectionner des professionnels.");
                    return;
                  }
                  toggleShortlist({ requestId: requestId as never, proUserId: m.proUserId as never }).catch(
                    (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
                  );
                }}
                onCompare={() => toggleCompare(m.proUserId)}
              />
            ))}
          </div>

          {/* Comparateur §7 */}
          {comparePros.length >= 2 && (
            <Card className="card-layered border-primary/25">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Scale className="size-4 text-primary" /> Comparer {comparePros.length}{" "}
                  professionnels
                </CardTitle>
                <CardDescription>
                  Sélection compare : {compareIds.length}/5 — {comparePros.length} affiché(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {showComparison ? (
                  <ComparisonTable pros={comparePros} />
                ) : (
                  <Button variant="outline" onClick={() => setShowComparison(true)}>
                    <ChevronDown className="mr-2 size-4" /> Afficher le tableau comparatif
                  </Button>
                )}
                {requestId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      logComparison({
                        requestId: requestId as never,
                        proUserIds: comparePros.map((p) => p.proUserId as never),
                      }).catch(() => undefined)
                    }
                  >
                    <Scale className="mr-1.5 size-3.5" /> Enregistrer cette comparaison
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Barre d'action (§8 / §12) */}
          {requestId && (
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
              <p className="text-sm">
                <span className="font-semibold">{selected.size}</span>/5 sélectionné(s)
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleChooseForMe}
                  disabled={sending}
                  title="MODE 2 : l'algorithme GTEC PRO choisit le meilleur professionnel selon compétence, disponibilité, distance, expérience, certifications, qualité, charge et historique."
                >
                  <Crown className="mr-2 size-4" /> Choisir pour moi
                </Button>
                <Button className="halo-amber" onClick={handleRequestQuotes} disabled={sending || selected.size === 0}>
                  <Send className="mr-2 size-4" />
                  Demander {selected.size > 1 ? `les ${selected.size} devis` : "un devis"}
                  <ArrowRight className="ml-1.5 size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
