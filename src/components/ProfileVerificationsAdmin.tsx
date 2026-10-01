import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, CheckCircle2, Clock, FileText, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/gtec";

const KIND_LABELS: Record<string, string> = {
  experience: "Expérience",
  skill: "Compétence",
  certification: "Certification",
  training: "Formation",
  project: "Réalisation",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "text-muted-foreground" },
  SUBMITTED: { label: "À vérifier", cls: "text-amber-600 dark:text-amber-400" },
  UNDER_REVIEW: { label: "En examen", cls: "text-amber-600 dark:text-amber-400" },
  VERIFIED: { label: "Vérifié ✓", cls: "text-emerald-600 dark:text-emerald-400" },
  REJECTED: { label: "Refusé", cls: "text-destructive" },
};

type Row = {
  kind: "experience" | "skill" | "certification" | "training" | "project";
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any;
  user: { name: string | null; phone: string | null } | null;
};

/**
 * §11/§14 : instruction des informations professionnelles soumises par les
 * adhérents. Seul l'admin écrit VERIFIED ; chaque décision notifie
 * l'utilisateur et alimente son historique de profil.
 */
export function ProfileVerificationsAdmin() {
  const verifications = useQuery(api.profile.adminListProfileVerifications, {});
  const review = useMutation(api.profile.adminReviewProfileItem);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [note, setNote] = useState("");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setRejecting(null);
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (verifications === undefined) {
    return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  }

  const pending = verifications.filter((r) => r.row.status === "SUBMITTED" || r.row.status === "UNDER_REVIEW");
  const recent = verifications
    .filter((r) => r.row.status === "VERIFIED" || r.row.status === "REJECTED")
    .slice(0, 12);

  const renderRow = (r: Row) => {
    const label = String(r.row.title ?? r.row.name ?? r.row.skill ?? "—");
    const meta = STATUS_META[r.row.status] ?? STATUS_META.DRAFT;
    const docUrl = r.row.documentUrl ?? r.row.certificateUrl;
    return (
      <div key={r.id} className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              <Badge variant="outline" className="mr-1.5 text-[10px] uppercase">
                {KIND_LABELS[r.kind] ?? r.kind}
              </Badge>
              {label}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {r.user?.name ?? "Utilisateur"} · mis à jour le {formatDate(r.row.updatedAt)}
            </p>
          </div>
          <span className={cn("shrink-0 text-xs font-medium", meta.cls)}>{meta.label}</span>
        </div>
        {(r.row.description ?? null) != null && typeof r.row.description === "string" && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{r.row.description}</p>
        )}
        {docUrl && (
          <a
            href={docUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
          >
            <FileText className="size-3.5" /> Justificatif fourni
          </a>
        )}
        {(r.row.status === "SUBMITTED" || r.row.status === "UNDER_REVIEW") && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    review({
                      kind: r.kind,
                      id: r.id as never,
                      decision: "VERIFIED",
                    }),
                  "Information vérifiée — l'adhérent est notifié",
                )
              }
            >
              <BadgeCheck className="mr-1 size-3.5" /> Vérifier
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    review({
                      kind: r.kind,
                      id: r.id as never,
                      decision: "UNDER_REVIEW",
                    }),
                  "Passé en cours d'examen",
                )
              }
            >
              <Clock className="mr-1 size-3.5" /> En examen
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-destructive"
              disabled={busy}
              onClick={() => setRejecting(r)}
            >
              <XCircle className="mr-1 size-3.5" /> Refuser
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-2.5 px-4 py-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <BadgeCheck className="size-4 text-primary" /> Profil évolutif — informations à vérifier
        </p>
        <p className="text-xs text-muted-foreground">
          Expériences, compétences, certifications, formations et réalisations
          soumises par les adhérents. Seul GTEC PRO accorde le badge « Vérifié ».
        </p>
        {pending.length === 0 ? (
          <p className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" /> Aucune information en attente.
          </p>
        ) : (
          pending.map(renderRow)
        )}
        {recent.length > 0 && (
          <>
            <p className="mt-2 text-xs font-medium text-muted-foreground">Décisions récentes</p>
            {recent.map(renderRow)}
          </>
        )}
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser cette information</DialogTitle>
            <DialogDescription>
              L'adhérent sera notifié avec votre motif. L'élément reste dans son
              dossier avec le statut « Refusé ».
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Motif du refus</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. : le justificatif ne permet pas de confirmer l'information."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !rejecting}
              onClick={() =>
                rejecting &&
                run(
                  () =>
                    review({
                      kind: rejecting.kind,
                      id: rejecting.id as never,
                      decision: "REJECTED",
                      note: note.trim() || undefined,
                    }),
                  "Information refusée — l'adhérent est notifié",
                )
              }
            >
              <Send className="mr-1.5 size-4" /> Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
