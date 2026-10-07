import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Circle, ClipboardCheck, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * GTEC PRO — CHECK-LIST TECHNIQUE INTELLIGENTE (F°10).
 * Générée par spécialité au début de la mission, personnalisable par le chef
 * d'équipe. Les items obligatoires doivent être validés avant la clôture :
 * le serveur refuse la réception client tant que la check-list n'est pas
 * COMPLETE (garde dans gtec.ts → clientReception).
 */
export function MissionChecklist({
  requestId,
  isLeader,
}: {
  requestId: string;
  isLeader: boolean;
}) {
  const data = useQuery(api.missions.getMissionChecklist, { requestId: requestId as never });
  const ensure = useMutation(api.missions.ensureMissionChecklist);
  const toggle = useMutation(api.missions.toggleChecklistItem);
  const addItem = useMutation(api.missions.addChecklistItem);

  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const mandatory = (data?.items ?? []).filter((i) => i.mandatory);
  const mandatoryDone = mandatory.filter((i) => i.done).length;
  const allDone = mandatory.length > 0 && mandatoryDone === mandatory.length;

  const createIfNeeded = async () => {
    setCreating(true);
    try {
      await ensure({ requestId: requestId as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-2.5 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardCheck className="size-4 text-primary" /> Check-list de sécurité
          </p>
          {data?.checklist && (
            <span
              className={cn(
                "text-xs font-medium",
                data.checklist.status === "COMPLETE"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              {data.checklist.status === "COMPLETE"
                ? "Complète ✓ — clôture possible"
                : `${mandatoryDone}/${mandatory.length} obligatoires validés`}
            </span>
          )}
        </div>

        {data === undefined ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : !data.checklist ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              La check-list de sécurité de cette mission n'est pas encore
              initialisée. Elle sera exigée complète avant la clôture.
            </p>
            <Button size="sm" variant="outline" className="self-start" disabled={creating} onClick={createIfNeeded}>
              <Plus className="mr-1.5 size-3.5" /> Initialiser la check-list
            </Button>
          </div>
        ) : (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all"
                style={{ width: `${mandatory.length ? (mandatoryDone / mandatory.length) * 100 : 100}%` }}
              />
            </div>
            <div className="flex flex-col gap-1">
              {data.items.map((i) => (
                <button
                  key={i._id}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all",
                    i.done ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-border/70 hover:bg-muted/40",
                  )}
                  onClick={async () => {
                    try {
                      await toggle({ itemId: i._id as never, done: !i.done });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erreur");
                    }
                  }}
                >
                  {i.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn(i.done && "text-muted-foreground line-through")}>{i.label}</span>
                  {i.mandatory && !i.done && (
                    <span className="ml-auto shrink-0 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                      obligatoire
                    </span>
                  )}
                </button>
              ))}
            </div>
            {!allDone && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                La réception client restera bloquée tant que tous les points
                obligatoires ne sont pas validés.
              </p>
            )}
          </>
        )}

        {isLeader && data?.checklist && (
          <div className="flex gap-1.5 border-t pt-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ajouter un point (ex. : Consigner le TGBT)"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 text-xs"
              disabled={busy || label.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                try {
                  await addItem({ requestId: requestId as never, label: label.trim(), mandatory: false });
                  setLabel("");
                  toast.success("Point ajouté à la check-list");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erreur");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Plus className="mr-1 size-3" /> Ajouter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
