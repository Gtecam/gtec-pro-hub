import { useMutation } from "convex/react";
import { FileText, RotateCcw, ScrollText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
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
import { Textarea } from "@/components/ui/textarea";
import { buildBrief, briefToText, type BriefResult } from "@/lib/brief";
import { cn } from "@/lib/utils";

/**
 * GTEC PRO — CAHIER DES CHARGES (F°3 « PROJECT BRIEF »).
 * Quelques questions guidées → un cahier des charges structuré généré
 * localement, archivé côté serveur (advisor.saveBrief) et injectable dans la
 * demande. Le document reste modifiable : le devis signé reste la référence.
 */

type Answer = { question: string; answer: string };

const BUILDINGS = [
  { key: "residence", label: "Résidence" },
  { key: "commerce", label: "Local commercial" },
  { key: "bureau", label: "Bureaux" },
  { key: "industriel", label: "Site industriel" },
  { key: "hotel", label: "Établissement hôtelier" },
  { key: "autre", label: "Autre" },
];

const DEADLINES = ["Sous 48 heures", "Sous 1 semaine", "Sous 2 semaines", "Sous 1 mois", "Flexible"];

export function BriefCard({
  serviceKey,
  sessionKey,
  interventionCode,
  interventionLabel,
  onApply,
}: {
  serviceKey: string | null;
  /** Clé de session portée par le parent — permet de rattacher le document
   *  à la demande réellement créée (advisor.linkBriefToRequest). */
  sessionKey: string;
  interventionCode?: string;
  interventionLabel?: string;
  onApply?: (payload: { description?: string }) => void;
}) {
  const saveBrief = useMutation(api.advisor.saveBrief);

  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<BriefResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [buildingType, setBuildingType] = useState("residence");
  const [city, setCity] = useState("");
  const [surface, setSurface] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [urgency, setUrgency] = useState("normale");
  const [deadline, setDeadline] = useState(DEADLINES[1]);
  const [constraints, setConstraints] = useState("");

  const generate = async () => {
    if (city.trim().length < 2) {
      toast.error("Indiquez la ville du chantier.");
      return;
    }
    const brief = buildBrief({
      serviceKey: serviceKey ?? undefined,
      interventionCode,
      interventionLabel,
      buildingType,
      city: city.trim(),
      surface: Number(surface) || undefined,
      quantity: Number(quantity) || 1,
      urgency: urgency as "normale" | "urgente" | "critique",
      deadline,
      constraints: constraints.trim() || undefined,
    });
    setResult(brief);
    setBusy(true);
    try {
      const answers: Answer[] = [
        { question: "Type de bâtiment", answer: buildingType },
        { question: "Ville", answer: city.trim() },
        { question: "Surface (m²)", answer: surface || "—" },
        { question: "Quantité", answer: quantity },
        { question: "Urgence", answer: urgency },
        { question: "Échéance", answer: deadline },
        { question: "Contraintes", answer: constraints.trim() || "—" },
      ];
      await saveBrief({
        sessionKey,
        title: brief.title,
        answers,
        contentJson: JSON.stringify(brief),
      });
    } catch {
      /* l'archivage ne bloque jamais l'affichage du document */
    } finally {
      setBusy(false);
    }
  };

  if (!started) {
    return (
      <Card className="card-layered border-primary/25 bg-gradient-to-br from-primary/[0.05] to-transparent">
        <CardContent className="flex flex-col gap-2.5 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ScrollText className="size-4 text-primary" /> Cahier des charges guidé — pour un chantier bien cadré
          </p>
          <p className="text-xs text-muted-foreground">
            Répondez à quelques questions : GTEC PRO rédige un cahier des
            charges structuré (périmètre, délais, livrables) à joindre à votre
            demande. Vous gardez la main sur le contenu final.
          </p>
          <div>
            <Button size="sm" variant="outline" onClick={() => setStarted(true)}>
              <FileText className="mr-1.5 size-3.5" /> Rédiger mon cahier des charges
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-layered border-primary/25">
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ScrollText className="size-4 text-primary" /> Cahier des charges
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              setStarted(false);
              setResult(null);
            }}
          >
            <RotateCcw className="mr-1 size-3" /> Fermer
          </Button>
        </div>

        {!result ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Type de bâtiment</Label>
              <Select value={buildingType} onValueChange={setBuildingType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUILDINGS.map((b) => (
                    <SelectItem key={b.key} value={b.key}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Ville *</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex. : Douala" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Surface (m², optionnel)</Label>
              <Input type="number" min={0} value={surface} onChange={(e) => setSurface(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Points / unités</Label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Urgence</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="critique">Critique</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Échéance souhaitée</Label>
              <Select value={deadline} onValueChange={setDeadline}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-sm">Contraintes d'accès / d'exploitation (optionnel)</Label>
              <Textarea
                rows={2}
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="Ex. : travaux après 17 h, accès badge, zone sensible en exploitation…"
              />
            </div>
            <div className="sm:col-span-2">
              <Button size="sm" disabled={busy} onClick={generate}>
                <FileText className="mr-1.5 size-3.5" /> Générer le document
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
              <p className="text-sm font-semibold">{result.title}</p>
              <div className="mt-2 flex flex-col gap-2">
                {result.sections.map((s) => (
                  <div key={s.heading}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {s.heading}
                    </p>
                    <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                      {s.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className={cn("mt-2 text-[11px] text-muted-foreground")}>{result.disclaimer}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                onClick={() => {
                  onApply?.({ description: briefToText(result) });
                  toast.success("Cahier des charges reporté dans votre demande");
                }}
              >
                Utiliser dans ma demande
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const blob = new Blob([briefToText(result)], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "cahier-des-charges-gtec.txt";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Télécharger (.txt)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                <RotateCcw className="mr-1 size-3.5" /> Modifier les réponses
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
