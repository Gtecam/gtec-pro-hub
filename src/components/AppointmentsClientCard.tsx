import { useMutation, useQuery } from "convex/react";
import { CalendarDays, CalendarPlus, MapPin, Search, Video, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { isoDate } from "@/lib/availability";
import { cn } from "@/lib/utils";

/**
 * §8 « PRENDRE RENDEZ-VOUS » — espace client : choix d'un professionnel
 * vérifié, affichage des créneaux RÉELLEMENT libres (14 jours), réservation
 * avec mode sur site ou à distance, puis suivi et annulation.
 * Aucune donnée de contact du professionnel n'est affichée : la plateforme
 * reste l'intermédiaire (protection anti-contournement).
 */

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  CONFIRME: { label: "Confirmé", cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400" },
  REFUSE: { label: "Refusé", cls: "bg-muted text-muted-foreground ring-border" },
  ANNULE: { label: "Annulé", cls: "bg-muted text-muted-foreground ring-border" },
  TERMINE: { label: "Terminé", cls: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400" },
};

const fmt = (ts: number) =>
  new Date(ts).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AppointmentsClientCard() {
  const [search, setSearch] = useState("");
  const [proId, setProId] = useState<Id<"users"> | null>(null);
  const [slotStart, setSlotStart] = useState<number | null>(null);
  const [mode, setMode] = useState<"SUR_SITE" | "A_DISTANCE">("SUR_SITE");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const pros = useQuery(api.appointments.bookableTechnicians, { search: search.trim() || undefined });
  const slots = useQuery(
    api.appointments.availableSlots,
    proId ? { proUserId: proId } : "skip",
  );
  const mine = useQuery(api.appointments.myAppointments, {});
  const book = useMutation(api.appointments.bookAppointment);
  const updateAppt = useMutation(api.appointments.updateAppointment);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Array<{ start: number; end: number }>>();
    for (const s of slots ?? []) {
      const key = isoDate(s.start);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots]);

  const submit = async () => {
    if (!proId || slotStart === null) return;
    setBusy(true);
    try {
      await book({
        proUserId: proId,
        start: slotStart,
        mode,
        city: city.trim() || undefined,
        address: mode === "SUR_SITE" ? address.trim() || undefined : undefined,
        note: note.trim() || undefined,
      });
      toast.success("Rendez-vous confirmé — le professionnel est notifié");
      setSlotStart(null);
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: Id<"appointments">) => {
    setBusy(true);
    try {
      await updateAppt({ id, action: "CANCEL" });
      toast.success("Rendez-vous annulé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (pros === undefined || mine === undefined) return null;
  const now = Date.now();
  const upcoming = mine.asClient.filter((a) => a.slotEnd > now && a.status === "CONFIRME");
  const history = mine.asClient.filter((a) => a.slotEnd <= now || a.status !== "CONFIRME").slice(-6);

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-4 px-4 py-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarPlus className="size-4 text-primary" /> Prendre rendez-vous
        </p>

        {/* Étape 1 : professionnel */}
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">
            1. Choisissez un professionnel vérifié (profil validé par GTEC PRO)
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Métier, spécialité, ville…"
                className="pl-8"
              />
            </div>
          </div>
          {pros.length === 0 ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Aucun professionnel disponible ne correspond — ou n'a encore publié de disponibilités.
            </p>
          ) : (
            <Select
              value={proId ?? undefined}
              onValueChange={(v) => {
                setProId(v as Id<"users">);
                setSlotStart(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un professionnel" />
              </SelectTrigger>
              <SelectContent>
                {pros.map((p) => (
                  <SelectItem key={p.userId} value={p.userId}>
                    {p.name}
                    {p.jobTitle ? ` — ${p.jobTitle}` : ""}
                    {p.city ? ` (${p.city})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Étape 2 : créneau réellement disponible */}
        {proId && (
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              2. Choisissez un créneau réellement disponible (14 jours)
            </Label>
            {slots === undefined ? (
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            ) : slots.length === 0 ? (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Ce professionnel n'a plus de créneau libre sur les 14 prochains jours.
              </p>
            ) : (
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                {slotsByDay.map(([day, list]) => (
                  <div key={day} className="rounded-lg border border-border/70 px-3 py-2">
                    <p className="text-xs font-medium capitalize text-muted-foreground">
                      {new Date(list[0].start).toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {list.map((s) => (
                        <Button
                          key={s.start}
                          type="button"
                          size="sm"
                          variant={slotStart === s.start ? "default" : "outline"}
                          className={cn("h-7 px-2.5 text-xs", slotStart === s.start && "halo-amber")}
                          onClick={() => setSlotStart(s.start)}
                        >
                          {new Date(s.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Étape 3 : détails */}
        {slotStart !== null && (
          <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
            <p className="text-xs font-semibold">
              3. Détails — {fmt(slotStart)}
            </p>
            <Select value={mode} onValueChange={(v) => setMode(v as "SUR_SITE" | "A_DISTANCE")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUR_SITE">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" /> Sur site (déplacement du professionnel)
                  </span>
                </SelectItem>
                <SelectItem value="A_DISTANCE">
                  <span className="flex items-center gap-1.5">
                    <Video className="size-3.5" /> À distance (visio / conseil téléphonique)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Ville</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex. : Douala" />
              </div>
              {mode === "SUR_SITE" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Adresse *</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue, immeuble, repère…" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Précisions (facultatif)</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nature du besoin, matériel, créneau souhaité…"
              />
            </div>
            <Button className="halo-amber w-fit" disabled={busy} onClick={submit}>
              Confirmer le rendez-vous
            </Button>
          </div>
        )}

        {/* Mes rendez-vous */}
        <Separator />
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" /> Mes rendez-vous ({upcoming.length})
        </p>
        {upcoming.length === 0 && history.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Aucun rendez-vous pour le moment.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((a) => (
              <div key={a._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {a.otherName}
                    <span className="text-[11px] text-muted-foreground">
                      {a.mode === "SUR_SITE" ? "Sur site" : "À distance"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(a.slotStart)}
                    {a.city ? ` · ${a.city}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive"
                  disabled={busy}
                  onClick={() => cancel(a._id)}
                >
                  <XCircle className="mr-1 size-3.5" /> Annuler
                </Button>
              </div>
            ))}
            {history.map((a) => {
              const meta = STATUS_BADGE[a.status ?? ""] ?? STATUS_BADGE.CONFIRME;
              return (
                <div key={a._id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{a.otherName}</p>
                    <p className="text-xs text-muted-foreground">{fmt(a.slotStart)}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", meta.cls)}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}