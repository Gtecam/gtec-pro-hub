import { useMutation, useQuery } from "convex/react";
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  Heart,
  ImageOff,
  MapPin,
  Star,
  Wrench,
} from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/gtec";
import { cn } from "@/lib/utils";

/**
 * §19 du référentiel « MON PROFIL » — fiche publique d'un technicien,
 * accessible sans authentification (/t/:userId). Ne sont exposés que les
 * éléments VÉRIFIÉS par GTEC PRO (§26) : compétences, certifications,
 * réalisations publiques. Téléphone, adresse exacte, documents et données
 * clients ne sont jamais publiés.
 */

const AVAIL_META: Record<string, { label: string; cls: string }> = {
  disponible: { label: "Disponible", cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400" },
  en_intervention: { label: "En intervention", cls: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400" },
  occupe: { label: "Occupé", cls: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400" },
  hors_ligne: { label: "Hors ligne", cls: "bg-muted text-muted-foreground ring-border" },
  indisponible: { label: "Indisponible", cls: "bg-muted text-muted-foreground ring-border" },
  conge: { label: "En congé", cls: "bg-muted text-muted-foreground ring-border" },
};

const SKILL_LEVEL_LABELS: Record<string, string> = {
  DEBUTANT: "Débutant",
  INTERMEDIAIRE: "Intermédiaire",
  AVANCE: "Avancé",
  EXPERT: "Expert",
};

export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId as Id<"users"> | undefined;
  const data = useQuery(
    api.profileExtras.publicTechnicianProfile,
    userId ? { userId } : "skip",
  );

  const initials = (data?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avail = data?.availability ? AVAIL_META[data.availability] : null;

  // Favoris (§35) — réservé aux comptes connectés ; la page reste consultable
  // par tous, seule l'action exige une authentification.
  const { isAuthenticated } = useAuth();
  const favorites = useQuery(api.favorites.myFavorites, isAuthenticated ? {} : "skip");
  const addFavorite = useMutation(api.favorites.addFavorite);
  const removeFavorite = useMutation(api.favorites.removeFavorite);
  const isFavorite =
    !!favorites && !!userId && favorites.some((f) => f.targetType === "technician" && f.targetId === userId);

  const toggleFavorite = async () => {
    if (!userId || !data) return;
    try {
      if (isFavorite) {
        const target = favorites?.find(
          (f) => f.targetType === "technician" && f.targetId === userId,
        );
        if (target) await removeFavorite({ id: target._id as Id<"favorites"> });
        toast.success("Retiré de vos favoris");
      } else {
        await addFavorite({
          targetType: "technician",
          targetId: userId,
          label: data.name ?? "Professionnel GTEC PRO",
          subtitle: data.jobTitle ?? undefined,
        });
        toast.success("Ajouté à vos favoris");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-green-900 to-green-950 px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-emerald-300/80">
          GTEC PRO — Profil professionnel vérifiable
        </p>

        {data === undefined && (
          <div className="h-96 animate-pulse rounded-2xl bg-white/10" />
        )}

        {data === null && (
          <div className="rounded-2xl border border-white/15 bg-white/5 p-10 text-center backdrop-blur">
            <Wrench className="mx-auto mb-3 size-10 text-emerald-300/70" />
            <h1 className="text-lg font-semibold text-emerald-50">Profil introuvable</h1>
            <p className="mt-1 text-sm text-emerald-100/70">
              Ce profil n'existe pas ou n'a pas encore de dossier professionnel GTEC PRO.
            </p>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-4">
            {/* Carte principale */}
            <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
              <div className="flex flex-wrap items-start gap-4">
                {data.image ? (
                  <img
                    src={data.image}
                    alt={data.name ?? ""}
                    className="size-20 rounded-2xl object-cover ring-1 ring-white/20"
                  />
                ) : (
                  <div className="flex size-20 items-center justify-center rounded-2xl bg-emerald-500/20 text-2xl font-bold text-emerald-200 ring-1 ring-white/20">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-emerald-50">{data.name ?? "Adhérent GTEC PRO"}</h1>
                    {avail && (
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset", avail.cls)}>
                        {avail.label}
                      </span>
                    )}
                    {isAuthenticated && (
                      <button
                        type="button"
                        onClick={toggleFavorite}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors",
                          isFavorite
                            ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                            : "bg-white/10 text-emerald-100 ring-white/20 hover:bg-white/15",
                        )}
                      >
                        <Heart className={cn("size-3.5", isFavorite && "fill-rose-400")} />
                        {isFavorite ? "Dans mes favoris" : "Ajouter aux favoris"}
                      </button>
                    )}
                  </div>
                  {data.jobTitle && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-emerald-200/90">
                      <Briefcase className="size-4" /> {data.jobTitle}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-emerald-100/70">
                    {data.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" /> {data.city}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" /> Chez GTEC PRO depuis{" "}
                      {new Date(data.memberSince).getFullYear()}
                    </span>
                  </p>
                </div>
              </div>

              {/* Statistiques plateforme — générées automatiquement, non modifiables */}
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-950/40 px-3 py-3 text-center ring-1 ring-white/10">
                  <p className="flex items-center justify-center gap-1 text-lg font-bold text-amber-300">
                    <Star className="size-4 fill-amber-300" /> {data.avgRating ?? "—"}
                  </p>
                  <p className="text-[11px] text-emerald-100/60">
                    Note moyenne ({data.ratingCount} avis)
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-950/40 px-3 py-3 text-center ring-1 ring-white/10">
                  <p className="text-lg font-bold text-emerald-200">{data.finishedCount}</p>
                  <p className="text-[11px] text-emerald-100/60">Missions sur GTEC PRO</p>
                </div>
                <div className="rounded-xl bg-emerald-950/40 px-3 py-3 text-center ring-1 ring-white/10">
                  <p className="text-lg font-bold text-emerald-200">{data.skills.length}</p>
                  <p className="text-[11px] text-emerald-100/60">Compétences vérifiées</p>
                </div>
              </div>

              {data.bio && (
                <p className="mt-4 rounded-xl bg-emerald-950/40 px-4 py-3 text-sm leading-relaxed text-emerald-100/80 ring-1 ring-white/10">
                  {data.bio}
                </p>
              )}

              {data.zones.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {data.zones.map((z: string) => (
                    <span
                      key={z}
                      className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 ring-1 ring-emerald-500/20"
                    >
                      {z}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Compétences vérifiées */}
            {data.skills.length > 0 && (
              <section className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-100">
                  <Wrench className="size-4 text-amber-300" /> Compétences vérifiées
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.skills.map((s) => (
                    <span
                      key={s.skill}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-100 ring-1 ring-white/10"
                    >
                      <BadgeCheck className="size-3.5 text-emerald-400" />
                      {s.skill}
                      {s.level && <span className="text-emerald-100/60">· {SKILL_LEVEL_LABELS[s.level] ?? s.level}</span>}
                      {s.yearsPracticed != null && <span className="text-emerald-100/60">· {s.yearsPracticed} an(s)</span>}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Certifications vérifiées */}
            {data.certifications.length > 0 && (
              <section className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-100">
                  <Award className="size-4 text-amber-300" /> Certifications vérifiées
                </h2>
                <div className="mt-3 flex flex-col gap-2">
                  {data.certifications.map((c) => (
                    <div
                      key={`${c.name}-${c.organization ?? ""}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-950/40 px-3 py-2 text-sm ring-1 ring-white/10"
                    >
                      <span className="font-medium text-emerald-50">{c.name}</span>
                      <span className="text-xs text-emerald-100/60">
                        {[c.organization, c.obtainedAt ? `obtenue en ${new Date(c.obtainedAt).getFullYear()}` : null, c.expiresAt ? `valable jusqu'au ${formatDate(c.expiresAt)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Réalisations publiques */}
            {data.projects.length > 0 && (
              <section className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-100">
                  <Building2 className="size-4 text-amber-300" /> Réalisations publiques
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {data.projects.map((p) => (
                    <div key={p.title} className="overflow-hidden rounded-xl bg-emerald-950/40 ring-1 ring-white/10">
                      {p.photo ? (
                        <img src={p.photo} alt={p.title} className="h-36 w-full object-cover" />
                      ) : (
                        <div className="flex h-36 items-center justify-center bg-emerald-900/60">
                          <ImageOff className="size-6 text-emerald-200/40" />
                        </div>
                      )}
                      <div className="flex flex-col gap-1 p-3">
                        <p className="truncate text-sm font-medium text-emerald-50">{p.title}</p>
                        <p className="text-[11px] text-emerald-100/60">
                          {[p.city, p.completedAt ? formatDate(p.completedAt) : null].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {p.description && (
                          <p className="line-clamp-2 text-xs text-emerald-100/70">{p.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="text-center text-[11px] leading-relaxed text-emerald-100/50">
              Les compétences, certifications et réalisations affichées ont été vérifiées par
              l'administration GTEC PRO — les éléments non vérifiés ne sont pas publiés. Les
              informations de contact, documents et données clients ne sont jamais exposés.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
