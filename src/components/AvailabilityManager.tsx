import { useMutation, useQuery } from "convex/react";
import { CalendarDays, CheckCircle2, Clock, MapPin, Plus, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { minutesToHHmm, parseHHmm, WEEKDAY_LABELS } from "@/lib/availability";
import { cn } from "@/lib/utils";

/**
 * §8 « PRENDRE RENDEZ-VOUS » — espace professionnel : le technicien définit
 * ses disponibilités (jour, plage, durée de créneau, temps de déplacement,
 * capacité quotidienne) et traite les rendez-vous reçus (refus avec motif,
 * clôture). Les créneaux proposés aux clients sont calculés à partir de ces
 * règles — le client ne voit que ce qui est réellement libre.
 */

type Rule = {
  _id: Id<"availabilityRules">;
  weekday: number;
  startMin: number;
  endMin: number;
  slotMinutes?: number;
  travelMinutes?: number;
  capacityPerDay?: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  CONFIRME: { label: "Confirmé", cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400" },
  REFUSE: { label: "Refusé", cls: "bg-muted text-muted-foreground ring-border" },
  ANNULE: { label: "Annulé", cls: "bg-muted text-muted-foreground ring-border" },
  TERMINE: { label: "Terminé", cls: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400" },
};

const fmt = (ts: number) =>
  new Date(ts).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function AvailabilityManager() {
  const rules = useQuery(api.appointments.myAvailabilityRules, { userId: "me" });
  const appointments = useQuery(api.appointments.myAppointments, {});
  const upsertRule = useMutation(api.appointments.upsertAvailabilityRule);
  const removeRule = useMutation(api.appointments.removeAvailabilityRule);
  const updateAppt = useMutation(api.appointments.updateAppointment);

  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"availabilityRules"> | null>(null);
  const [weekday, setWeekday] = useState("1");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [slot, setSlot] = useState("60");
  const [travel, setTravel] = useState("30");
  const [capacity, setCapacity] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [refusing, setRefusing] = useState<{ id: Id<"appointments">; name: string } | null>(null);
  const [reason, setReason] = useState("");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const openDialog = (rule?: Rule) => {
    if (rule) {
      setEditId(rule._id);
      setWeekday(String(rule.weekday));
      setStart(minutesToHHmm(rule.startMin));
      setEnd(minutesToHHmm(rule.endMin));
      setSlot(String(rule.slotMinutes ?? 60));
      setTravel(String(rule.travelMinutes ?? 30));
      setCapacity(rule.capacityPerDay ? String(rule.capacityPerDay) : "");
      setFrom(rule.effectiveFrom ?? "");
      setUntil(rule.effectiveUntil ?? "");
    } else {
      setEditId(null);
      setWeekday("1");
      setStart("09:00");
      setEnd("17:00");
      setSlot("60");
      setTravel("30");
      setCapacity("");
      setFrom("");
      setUntil("");
    }
    setOpen(true);
  };

  if (rules === undefined || appointments === undefined) return null;

  const now = Date.now();
  const upcoming = appointments.asPro.filter((a) => a.slotEnd > now - 86_400_000);
  const openOnes = upcoming.filter((a) => a.status === "CONFIRME");

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-4 px-4 py-4">
        {/* ---- Disponibilités ---- */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="size-4 text-primary" /> Mes disponibilités
          </p>
          <Button size="sm" className="halo-amber" onClick={() => openDialog()} disabled={busy}>
            <Plus className="mr-1 size-3.5" /> Ajouter un créneau hebdo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Déclarez vos horaires pour recevoir des rendez-vous. Le client ne voit que les
          créneaux réellement libres, temps de déplacement compris. Sans disponibilité,
          votre profil n'apparaît pas dans « Prendre rendez-vous ».
        </p>
        {rules.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Aucune disponibilité déclarée — les clients ne peuvent pas vous réserver.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rules.map((r) => (
              <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {WEEKDAY_LABELS[r.weekday]} · {minutesToHHmm(r.startMin)} – {minutesToHHmm(r.endMin)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[`Créneau ${r.slotMinutes ?? 60} min`, `Déplacement ${r.travelMinutes ?? 30} min`, r.capacityPerDay ? `Max ${r.capacityPerDay}/jour` : "Capacité illimitée"].join(" · ")}
                    {(r.effectiveFrom || r.effectiveUntil) &&
                      ` · ${r.effectiveFrom ?? "aujourd'hui"} → ${r.effectiveUntil ?? "sans fin"}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDialog(r)}>
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive"
                    disabled={busy}
                    onClick={() =>                    run(() => removeRule({ id: r._id as Id<"availabilityRules"> }), "Disponibilité retirée")}
                    aria-label="Retirer"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- Rendez-vous reçus ---- */}
        <Separator />
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="size-4 text-primary" /> Rendez-vous reçus ({openOnes.length} à venir)
        </p>
        {upcoming.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Aucun rendez-vous pour le moment.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((a) => {
              const meta = STATUS_BADGE[a.status ?? ""] ?? STATUS_BADGE.CONFIRME;
              return (
                <div key={a._id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {a.otherName}
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", meta.cls)}>
                        {meta.label}
                      </span>
                      {a.status === "CONFIRME" && (
                        <span className="text-[11px] text-muted-foreground">
                          {a.mode === "SUR_SITE" ? "Sur site" : "À distance"}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmt(a.slotStart)}</p>
                    {a.city && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {[a.city, a.address].filter(Boolean).join(" — ")}
                      </p>
                    )}
                    {a.note && <p className="mt-1 text-xs italic text-muted-foreground">« {a.note} »</p>}
                    {a.rejectReason && <p className="mt-1 text-xs text-destructive">Motif : {a.rejectReason}</p>}
                  </div>
                  {a.status === "CONFIRME" && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(() => updateAppt({ id: a._id as Id<"appointments">, action: "COMPLETE" }), "Rendez-vous clôturé — le client est notifié")
                        }
                      >
                        <CheckCircle2 className="mr-1 size-3.5" /> Terminé
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => (setRefusing({ id: a._id as Id<"appointments">, name: a.otherName }), setReason(""))}
                      >
                        <XCircle className="mr-1 size-3.5" /> Refuser
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Dialog disponibilité */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifier la disponibilité" : "Ajouter une disponibilité"}</DialogTitle>
            <DialogDescription>
              Une règle par jour de la semaine : plage horaire, durée d'un rendez-vous,
              temps de déplacement entre deux rendez-vous et capacité quotidienne.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Jour</Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_LABELS.map((label, index) => (
                    <SelectItem key={label} value={String(index)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Début</Label>
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Fin</Label>
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Durée (min)</Label>
                <Input type="number" min={15} step={15} value={slot} onChange={(e) => setSlot(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Déplacement (min)</Label>
                <Input type="number" min={0} step={5} value={travel} onChange={(e) => setTravel(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Capacité par jour (vide = illimitée)</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Illimitée"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Valable à partir du</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Jusqu'au</Label>
                <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              className="halo-amber"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    upsertRule({
                      id: editId ?? undefined,
                      weekday: Number(weekday),
                      startMin: parseHHmm(start),
                      endMin: parseHHmm(end),
                      slotMinutes: Number(slot) || 60,
                      travelMinutes: Number(travel) || 0,
                      capacityPerDay: capacity ? Number(capacity) : undefined,
                      effectiveFrom: from || undefined,
                      effectiveUntil: until || undefined,
                    }),
                  editId ? "Disponibilité mise à jour" : "Disponibilité enregistrée",
                ).then(() => setOpen(false))
              }
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog refus */}
      <Dialog open={!!refusing} onOpenChange={(v) => !v && setRefusing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refuser ce rendez-vous</DialogTitle>
            <DialogDescription>
              {refusing?.name} sera notifié avec votre motif. Le créneau redevient disponible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Motif du refus</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : indisponible ce jour-là, ou déjà un autre rendez-vous ce matin."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusing(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !refusing}
              onClick={() =>
                refusing &&
                run(
                  () =>
                    updateAppt({
                      id: refusing.id,
                      action: "REFUSE",
                      reason: reason.trim() || undefined,
                    }),
                  "Rendez-vous refusé — le client est notifié",
                ).then(() => setRefusing(null))
              }
            >
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}