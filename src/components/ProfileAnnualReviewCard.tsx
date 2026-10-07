import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, CheckCircle2, Copy, ExternalLink, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { useNow } from "@/hooks/use-now";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/gtec";

/**
 * §19 + §22 du référentiel « MON PROFIL » — rappel annuel (« Votre expérience
 * professionnelle a-t-elle évolué depuis votre dernière mise à jour ? ») et
 * accès au profil public. La bannière disparaît une fois le profil confirmé
 * (« MES INFORMATIONS SONT TOUJOURS EXACTES ») ; le sweep quotidien de GTEC
 * re-sollicite l'adhérent par notification au bout de 12 mois.
 */

const YEAR_MS = 365 * 24 * 3600 * 1000;

export function ProfileAnnualReviewCard() {
  const last = useQuery(api.profileExtras.myProfileConfirmation, {});
  const confirm = useMutation(api.profileExtras.confirmProfileUpToDate);
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow();

  if (last === undefined) return null;

  const stale = !last || now - last.confirmedAt > YEAR_MS;
  const publicUrl = user?._id ? `${window.location.origin}/t/${user._id}` : null;

  const doConfirm = async () => {
    try {
      await confirm({});
      toast.success("Merci ! Votre profil est confirmé à jour.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  if (!last || stale) {
    return (
      <Card className="card-layered border-amber-500/40 bg-amber-500/[0.04]">
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <RefreshCcw className="size-4 text-amber-600 dark:text-amber-400" /> Mise à jour annuelle du profil
          </p>
          <p className="text-sm text-muted-foreground">
            Votre expérience professionnelle a-t-elle évolué depuis votre dernière mise à jour ?
            {last && <> Dernière confirmation : {formatDate(last.confirmedAt)}.</>}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="halo-amber"
              size="sm"
              onClick={() =>
                toast.info(
                  "Utilisez les boutons « Ajouter une expérience », « Ajouter une certification », « Ajouter une formation »… pour enrichir votre dossier, puis confirmez ci-dessous.",
                  { duration: 8000 },
                )
              }
            >
              OUI, METTRE À JOUR
            </Button>
            <Button variant="outline" size="sm" onClick={doConfirm}>
              MES INFORMATIONS SONT TOUJOURS EXACTES
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          Profil confirmé à jour le {formatDate(last.confirmedAt)} — rappel annuel dans 12 mois.
        </p>
        {publicUrl && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/t/${user?._id}`)}>
              <ExternalLink className="mr-1.5 size-3.5" /> Voir mon profil public
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  toast.success("Lien du profil public copié");
                } catch {
                  toast.error("Copie impossible — sélectionnez le lien manuellement.");
                }
              }}
              aria-label="Copier le lien"
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Badge réutilisable : « Vérifié GTEC PRO » (vérification administrative). */
export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      <BadgeCheck className="size-3.5" /> Vérifié GTEC PRO
    </span>
  );
}
