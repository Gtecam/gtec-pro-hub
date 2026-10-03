import { useMutation, useQuery } from "convex/react";
import { Activity, Gauge, Plus } from "lucide-react";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/gtec";

/**
 * GTEC PRO — MODULE IoT (phase 7) : relevés de compteurs et capteurs sur les
 * équipements du dossier technique. Saisie terrain simple (valeur + unité),
 * historique par équipement et écart automatique depuis le dernier relevé.
 * Les mesures sont déclaratives : une valeur anormale déclenche un contrôle
 * humain, jamais une décision automatique.
 */

const KINDS = [
  { key: "conso_elec", label: "Compteur électrique", unit: "kWh" },
  { key: "conso_eau", label: "Compteur d'eau", unit: "m³" },
  { key: "conso_gaz", label: "Compteur de gaz", unit: "m³" },
  { key: "temperature", label: "Température", unit: "°C" },
  { key: "autre", label: "Autre capteur", unit: "unité" },
];

export function AssetIotCard({ buildingId }: { buildingId: string }) {
  const overview = useQuery(api.iot.buildingIotOverview, { buildingId });
  const addReading = useMutation(api.iot.addReading);

  const [assetId, setAssetId] = useState("");
  const [kind, setKind] = useState("conso_elec");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("kWh");
  const [busy, setBusy] = useState(false);

  if (overview === undefined) {
    return (
      <Card className="card-layered">
        <CardContent className="py-6">
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const submit = async () => {
    if (!assetId) {
      toast.error("Choisissez l'équipement concerné.");
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      toast.error("Saisissez la valeur de la mesure.");
      return;
    }
    setBusy(true);
    try {
      await addReading({ assetId: assetId as never, kind: kind as never, value: num, unit });
      toast.success("Relevé enregistré dans l'historique de l'équipement");
      setValue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const hasAssets = overview.withReadings.length + overview.withoutReadings.length > 0;

  return (
    <Card className="card-layered">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-primary" /> Relevés & capteurs (IoT)
        </CardTitle>
        <CardDescription>
          Historisez les relevés de compteurs et capteurs par équipement. L'écart
          depuis le dernier relevé est calculé automatiquement — une mesure
          anormale déclenche un contrôle, jamais une décision automatique.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!hasAssets ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Ajoutez d'abord des équipements à ce bâtiment pour enregistrer des relevés.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Équipement</Label>
                <Select
                  value={assetId}
                  onValueChange={(v) => {
                    setAssetId(v);
                    const known = KINDS.find(() => false);
                    void known;
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...overview.withReadings, ...overview.withoutReadings.map((w) => ({ assetId: w.assetId, label: w.label, lastReading: null, readingCount: 0 }))].map((o) => (
                      <SelectItem key={o.assetId} value={o.assetId}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Type de mesure</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v);
                    const k = KINDS.find((x) => x.key === v);
                    if (k) setUnit(k.unit);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.key} value={k.key}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Valeur</Label>
                <Input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Ex. : 12480"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Unité</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
            </div>
            <div>
              <Button size="sm" className="halo-amber" disabled={busy} onClick={submit}>
                <Plus className="mr-1.5 size-3.5" /> Enregistrer le relevé
              </Button>
            </div>
          </>
        )}

        {overview.withReadings.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Activity className="size-3.5" /> Derniers relevés par équipement
            </p>
            {overview.withReadings.map((o) => (
              <div
                key={o.assetId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.lastReading?.detail ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {o.readingCount} relevé{o.readingCount > 1 ? "s" : ""}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70">
                    {formatDate(o.lastReading?.at ?? Date.now())}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
