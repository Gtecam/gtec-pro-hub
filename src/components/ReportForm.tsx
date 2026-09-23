import { useMutation } from "convex/react";
import {
  ClipboardCheck,
  ImagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Part = { label: string; qty: number; unitPrice: number };

/**
 * Formulaire de rapport d'intervention — partagé entre la console admin
 * et l'espace technicien (mutation injectée via `useReportMutation`).
 */
export function ReportForm({
  requestId,
  useReportMutation,
  title = "Rapport d'intervention",
}: {
  requestId: string;
  /** Hook renvoyant la mutation de soumission (admin ou technicien). */
  useReportMutation: () => ReturnType<
    typeof useMutation<typeof api.gtec.adminSubmitReport>
  >;
  title?: string;
}) {
  const submitReport = useReportMutation();
  const [workDone, setWorkDone] = useState("");
  const [parts, setParts] = useState<Part[]>([{ label: "", qty: 1, unitPrice: 0 }]);
  const [before, setBefore] = useState<string[]>([]);
  const [after, setAfter] = useState<string[]>([]);
  const [warranty, setWarranty] = useState(6);
  const [recommendations, setRecommendations] = useState("");
  const [busy, setBusy] = useState(false);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  const readImages = (
    files: FileList | null,
    setter: (fn: (p: string[]) => string[]) => void,
  ) => {
    if (!files) return;
    Array.from(files)
      .slice(0, 4)
      .forEach((file) => {
        if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
          toast.error(`${file.name} : image de 2 Mo max`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          setter((p) => (p.length < 4 ? [...p, reader.result as string] : p));
        reader.readAsDataURL(file);
      });
  };

  const submit = async () => {
    if (workDone.trim().length < 10) {
      toast.error("Décrivez les travaux réalisés (10 caractères min).");
      return;
    }
    setBusy(true);
    try {
      await submitReport({
        requestId: requestId as never,
        workDone: workDone.trim(),
        partsUsed: parts
          .filter((p) => p.label.trim())
          .map((p) => ({ label: p.label.trim(), qty: p.qty })),
        beforePhotos: before,
        afterPhotos: after,
        warrantyMonths: warranty,
        recommendations: recommendations.trim() || undefined,
      });
      toast.success("Rapport transmis au client");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const photoGrid = (
    photos: string[],
    addRef: React.RefObject<HTMLInputElement | null>,
    setter: (fn: (p: string[]) => string[]) => void,
    label: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <input
        ref={addRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          readImages(e.target.files, setter);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        {photos.map((src, i) => (
          <div key={i} className="group relative size-14 overflow-hidden rounded-lg border">
            <img src={src} alt={`${label} ${i + 1}`} className="size-full object-cover" />
            <button
              className="absolute inset-0 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => setter((p) => p.filter((_, j) => j !== i))}
            >
              <Trash2 className="mx-auto size-3.5 text-white" />
            </button>
          </div>
        ))}
        {photos.length < 4 && (
          <button
            className="flex size-14 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary"
            onClick={() => addRef.current?.click()}
          >
            <ImagePlus className="size-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ClipboardCheck className="size-4 text-primary" /> {title}
      </p>
      <Textarea
        value={workDone}
        onChange={(e) => setWorkDone(e.target.value)}
        placeholder="Travaux réalisés (remplacement du disjoncteur 25A, reprise de la ligne cuisine…)"
        rows={3}
      />
      {parts.map((part, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={part.label}
            onChange={(e) =>
              setParts((p) => p.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)))
            }
            placeholder="Matériel utilisé (optionnel)"
            className="flex-1"
          />
          <Input
            type="number"
            min={1}
            value={part.qty}
            onChange={(e) =>
              setParts((p) =>
                p.map((it, i) => (i === idx ? { ...it, qty: Number(e.target.value) || 1 } : it)),
              )
            }
            className="w-16"
            aria-label="Quantité"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setParts((p) => p.filter((_, i) => i !== idx))}
            disabled={parts.length === 1}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => setParts((p) => [...p, { label: "", qty: 1, unitPrice: 0 }])}
      >
        <Plus className="mr-1 size-3.5" /> Matériel
      </Button>
      <div className="grid gap-4 sm:grid-cols-2">
        {photoGrid(before, beforeRef, (fn) => setBefore(fn), "Photos avant")}
        {photoGrid(after, afterRef, (fn) => setAfter(fn), "Photos après")}
      </div>
      <div className="flex items-center gap-3">
        <Label className="text-xs">Garantie (mois)</Label>
        <Input
          type="number"
          min={0}
          max={60}
          value={warranty}
          onChange={(e) => setWarranty(Number(e.target.value) || 0)}
          className="w-20"
        />
      </div>
      <Textarea
        value={recommendations}
        onChange={(e) => setRecommendations(e.target.value)}
        placeholder="Recommandations (optionnel)"
        rows={2}
      />
      <Button className="halo-amber" disabled={busy} onClick={submit}>
        <ClipboardCheck className="mr-2 size-4" />
        {busy ? "Envoi…" : "Transmettre le rapport au client"}
      </Button>
    </div>
  );
}
