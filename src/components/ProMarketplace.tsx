import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNow } from "@/hooks/use-now";
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Coins,
  Hourglass,
  Inbox,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CITIES } from "@/lib/gtec";
import { cn } from "@/lib/utils";

/**
 * GTEC PRO — Espace professionnel côté MARCHÉ (§8, §9, §15, §16, §20).
 *
 * 1. Boîte de réception des demandes de devis : le pro voit la demande
 *    (description, ville, urgence, photos) avec une adresse APPROXIMATIVE
 *    (§16 : confidentialité de la localisation avant acceptation) et répond
 *    montant + délai d'arrivée + garantie + message.
 * 2. Présence temps réel (🟢🟠🔵⚫) + tarif indicatif « à partir de ».
 * 3. Zones couvertes + créneaux publiés (§20).
 */

const PRESENCE_OPTIONS = [
  { key: "disponible", label: "🟢 Disponible maintenant" },
  { key: "occupe", label: "🟠 Disponible plus tard" },
  { key: "en_intervention", label: "🔵 Sur une autre mission" },
  { key: "hors_ligne", label: "⚫ Hors ligne / indisponible" },
] as const;

// ============================ INBOX DEMANDES DE DEVIS ========================

function ProMarketInbox() {
  const items = useQuery(api.matching.myQuoteRequests, {});
  const now = useNow();
  const respond = useMutation(api.matching.respondToQuoteRequest);
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [delayMin, setDelayMin] = useState("");
  const [warranty, setWarranty] = useState("30");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (items === undefined) {
    return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  }
  const pending = items.filter((q) => q.status === "envoyee");
  const history = items.filter((q) => q.status !== "envoyee");

  const submit = async (quoteRequestId: string) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Indiquez un montant proposé valide.");
      return;
    }
    setBusy(true);
    try {
      await respond({
        quoteRequestId: quoteRequestId as never,
        amount: value,
        arrivalDelayMin: delayMin ? Number(delayMin) : undefined,
        warrantyDays: warranty ? Number(warranty) : undefined,
        message: message.trim() || undefined,
      });
      toast.success("Proposition envoyée au client");
      setOpenId(null);
      setAmount("");
      setDelayMin("");
      setWarranty("30");
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="card-layered">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="font-display text-lg font-semibold">Aucune demande de devis</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Restez « Disponible » et gardez votre zone couverte à jour — les
            clients vous trouveront ici dès qu'une demande correspond à votre
            profil.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.map((q) => {
        const minutesLeft = Math.round((q.responseDeadline - now) / 60000);
        const expired = q.responseDeadline < now;
        return (
          <Card key={q._id} className={cn("card-layered", expired && "border-amber-500/30")}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{q.title}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-xs">{q.reference}</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" /> {q.city} · localisation
                      approximative
                    </span>
                    {q.desiredDate && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3.5" />{" "}
                        {new Date(q.desiredDate).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                    q.urgency === "critique"
                      ? "bg-destructive/10 text-destructive ring-destructive/20"
                      : q.urgency === "urgente"
                        ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
                        : "bg-muted text-muted-foreground ring-border",
                  )}
                >
                  {q.urgency === "critique"
                    ? "Urgence critique"
                    : q.urgency === "urgente"
                      ? "Urgente"
                      : "Normale"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{q.description}</p>
              {q.photosCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  📷 {q.photosCount} photo(s) jointe(s)
                </p>
              )}
              <p
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-inset",
                  expired
                    ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
                    : "bg-primary/[0.06] text-primary ring-primary/20",
                )}
              >
                <Hourglass className="size-3.5" />
                {expired
                  ? "Délai de réponse dépassé"
                  : minutesLeft >= 60
                    ? `Réponse attendue dans les ${Math.round(minutesLeft / 60)} h`
                    : `Réponse attendue dans les ${minutesLeft} minutes`}
              </p>
              {openId === q._id ? (
                <div className="flex flex-col gap-2.5">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Montant proposé (FCFA)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ex. : 15000"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Arrivée estimée (min)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={delayMin}
                        onChange={(e) => setDelayMin(e.target.value)}
                        placeholder="Ex. : 30"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Garantie (jours)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={warranty}
                        onChange={(e) => setWarranty(e.target.value)}
                      />
                    </div>
                  </div>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Message au client : périmètre, matériel inclus, conditions…"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="halo-amber" disabled={busy} onClick={() => submit(q._id)}>
                      <CheckCircle2 className="mr-1.5 size-4" /> Envoyer la proposition
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" disabled={expired} onClick={() => setOpenId(q._id)}>
                  <Coins className="mr-2 size-4" />
                  {expired ? "Délai dépassé" : "Envoyer une proposition"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Historique */}
      {history.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Historique</p>
          {history.map((q) => (
            <div
              key={q._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs"
            >
              <span className="min-w-0 truncate font-medium">{q.title}</span>
              <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                {q.proposal && (
                  <span className="font-semibold text-foreground">
                    {Math.round(q.proposal.amount).toLocaleString("fr-FR")} FCFA
                  </span>
                )}
                {q.status === "acceptee" ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400">
                    Sélectionné ✓
                  </Badge>
                ) : q.status === "refusee" ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Non retenue
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {q.status === "expiree" ? "Clôturée" : "En attente client"}
                  </Badge>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================ PRÉSENCE + ZONES + CRÉNEAUX ====================

function ProPresencePanel() {
  const market = useQuery(api.matching.myMarketplaceProfile, {});
  const upsertPresence = useMutation(api.matching.upsertPresence);
  const upsertZone = useMutation(api.matching.upsertServiceZone);
  const removeZone = useMutation(api.matching.removeServiceZone);
  const publishSlot = useMutation(api.matching.publishAvailabilitySlot);
  const removeSlot = useMutation(api.matching.removeAvailabilitySlot);
  const slots = useQuery(api.matching.myAvailabilitySlots, {});

  const [price, setPrice] = useState("");
  const [zoneCity, setZoneCity] = useState<string>("Douala");
  const [zoneDistrict, setZoneDistrict] = useState("");
  const [zoneRadius, setZoneRadius] = useState("15");
  const [slotStart, setSlotStart] = useState("");
  const [busy, setBusy] = useState(false);
  const priceTouched = useRef(false);

  useEffect(() => {
    if (!priceTouched.current && market?.presence?.fromPrice != null) {
      setPrice(String(market.presence.fromPrice));
      priceTouched.current = true;
    }
  }, [market]);

  const presence = market?.presence ?? null;

  const setPresence = async (status: string) => {
    setBusy(true);
    try {
      await upsertPresence({
        status: status as never,
        fromPrice: price ? Number(price) : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const addZone = async () => {
    setBusy(true);
    try {
      await upsertZone({
        city: zoneCity,
        district: zoneDistrict.trim() || undefined,
        radiusKm: Number(zoneRadius) || 15,
      });
      toast.success("Zone ajoutée");
      setZoneDistrict("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const addSlot = async () => {
    if (!slotStart) {
      toast.error("Choisissez la date et l'heure du créneau.");
      return;
    }
    const start = new Date(slotStart).getTime();
    if (!Number.isFinite(start)) {
      toast.error("Créneau invalide.");
      return;
    }
    setBusy(true);
    try {
      await publishSlot({ start, end: start + 2 * 3600 * 1000 });
      toast.success("Créneau publié — visible par les clients");
      setSlotStart("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Présence + tarif indicatif */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 p-3">
        <div className="flex min-w-40 flex-col gap-1">
          <Label className="text-xs">Ma présence (marché)</Label>
          <Select
            value={(presence?.status ?? "hors_ligne") as string}
            onValueChange={(v) => void setPresence(v)}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESENCE_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-40 flex-col gap-1">
          <Label className="text-xs">Tarif « à partir de » (FCFA)</Label>
          <div className="flex gap-1.5">
            <Input
              type="number"
              min={0}
              value={price}
              onChange={(e) => {
                priceTouched.current = true;
                setPrice(e.target.value);
              }}
              placeholder="Ex. : 10000"
              className="w-32"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !price}
              onClick={() => void setPresence(presence?.status ?? "disponible")}
            >
              Enregistrer
            </Button>
          </div>
        </div>
        <p className="w-full text-[11px] text-muted-foreground">
          Votre statut alimente les pastilles 🟢🟠🔵⚫ et le tarif s'affiche
          « À partir de X FCFA » sur vos cartes dans le marché.
        </p>
      </div>

      {/* Zones couvertes */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
        <p className="text-sm font-medium">Zones couvertes</p>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={zoneCity} onValueChange={setZoneCity}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={zoneDistrict}
            onChange={(e) => setZoneDistrict(e.target.value)}
            placeholder="Quartier / commune"
            className="w-44"
          />
          <Input
            type="number"
            min={1}
            max={60}
            value={zoneRadius}
            onChange={(e) => setZoneRadius(e.target.value)}
            className="w-24"
            title="Rayon en km"
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={addZone}>
            <Plus className="mr-1.5 size-4" /> Ajouter
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(market?.zones ?? []).map((z) => (
            <span
              key={z._id}
              className="flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs"
            >
              {z.city}
              {z.district ? ` · ${z.district}` : ""} · {z.radiusKm} km
              <button
                className="text-muted-foreground transition-colors hover:text-destructive"
                onClick={() =>
                  removeZone({ id: z._id as never }).catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Erreur"),
                  )
                }
                aria-label="Retirer la zone"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
          {(market?.zones ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucune zone déclarée — le filtrage d'éligibilité (§3) se base sur
              votre ville et vos zones du profil technicien.
            </p>
          )}
        </div>
      </div>

      {/* Créneaux publiés */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
        <p className="text-sm font-medium">Créneaux disponibles (entrées de service)</p>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="datetime-local"
            value={slotStart}
            onChange={(e) => setSlotStart(e.target.value)}
            className="w-56"
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={addSlot}>
            <Plus className="mr-1.5 size-4" /> Publier (2 h)
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(slots ?? []).map((s) => (
            <span
              key={s._id}
              className="flex items-center gap-1.5 rounded-full bg-primary/[0.06] px-2.5 py-1 text-xs text-primary ring-1 ring-primary/20"
            >
              {new Date(s.start).toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
              <button
                className="transition-colors hover:text-destructive"
                onClick={() =>
                  removeSlot({ id: s._id as never }).catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Erreur"),
                  )
                }
                aria-label="Retirer le créneau"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
          {(slots ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Vos créneaux libres complètent vos disponibilités récurrentes (§8).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Bloc complet « Marché » intégré dans un onglet de l'espace technicien. */
export function ProMarketplace() {
  return (
    <div className="flex flex-col gap-4">
      {/* §5/§8 : boîte de réception des demandes de devis */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Inbox className="size-4 text-primary" /> Demandes de devis reçues
        </p>
        <ProMarketInbox />
      </div>
      {/* §15/§16/§20 : présence, zones, créneaux */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <BadgeCheck className="size-4 text-primary" /> Ma présence & mes zones
        </p>
        <ProPresencePanel />
      </div>
    </div>
  );
}
