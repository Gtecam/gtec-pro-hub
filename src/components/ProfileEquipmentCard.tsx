import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { cn } from "@/lib/utils";

/**
 * §10 du référentiel « MON PROFIL » — MON MATÉRIEL. Le technicien liste les
 * équipements dont il dispose (multimètre, mégohmmètre, caméra thermique…).
 * Déclaration simple : publiée immédiatement, mais jamais qualifiée de
 * « vérifiée » (§26 — Déclaration ≠ vérification).
 */

const CONDITIONS: Array<{ key: string; label: string; cls: string }> = [
  { key: "neuf", label: "Neuf", cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400" },
  { key: "bon_etat", label: "Bon état", cls: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400" },
  { key: "use", label: "Usé", cls: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400" },
  { key: "a_reparer", label: "À réparer", cls: "bg-orange-500/10 text-orange-600 ring-orange-500/20 dark:text-orange-400" },
  { key: "reforme", label: "Réformé", cls: "bg-muted text-muted-foreground ring-border" },
];

const condMeta = (key?: string | null) => CONDITIONS.find((c) => c.key === key);

export function ProfileEquipmentCard() {
  const data = useQuery(api.profileExtras.myEquipment, {});
  const upsert = useMutation(api.profileExtras.upsertEquipment);
  const remove = useMutation(api.profileExtras.removeEquipment);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"technicianEquipment"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");

  const reset = () => {
    setEditId(null);
    setLabel("");
    setBrand("");
    setModel("");
    setQuantity("1");
    setCondition("");
    setPhotoUrl("");
    setAcquiredAt("");
  };

  const openDialog = (item?: {
    _id: Id<"technicianEquipment">;
    label: string;
    brand?: string;
    model?: string;
    quantity: number;
    condition?: string;
    photoUrl?: string;
    acquiredAt?: number;
  }) => {
    if (item) {
      setEditId(item._id);
      setLabel(item.label);
      setBrand(item.brand ?? "");
      setModel(item.model ?? "");
      setQuantity(String(item.quantity));
      setCondition(item.condition ?? "");
      setPhotoUrl(item.photoUrl ?? "");
      setAcquiredAt(item.acquiredAt ? new Date(item.acquiredAt).toISOString().slice(0, 10) : "");
    } else {
      reset();
    }
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await upsert({
        id: editId ?? undefined,
        label,
        brand: brand || undefined,
        model: model || undefined,
        quantity: Number(quantity) || 1,
        condition: (condition || undefined) as never,
        photoUrl: photoUrl || undefined,
        acquiredAt: acquiredAt ? Date.parse(acquiredAt) : undefined,
      });
      toast.success(editId ? "Matériel mis à jour" : "Matériel ajouté à votre profil");
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (id: Id<"technicianEquipment">, name: string) => {
    try {
      await remove({ id });
      toast.success(`« ${name} » retiré de votre profil`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Wrench className="size-4 text-primary" /> Mon matériel{" "}
            <span className="text-muted-foreground">({data?.length ?? "…"})</span>
          </p>
          <Button size="sm" className="halo-amber" onClick={() => openDialog()} disabled={busy}>
            <Plus className="mr-1 size-3.5" /> Ajouter un équipement
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Multimètre, mégohmmètre, pince ampèremétrique, caméra thermique… Listez votre outillage :
          cela rassure les clients et aide GTEC à vous affecter les bonnes missions.
        </p>
        {data && data.length === 0 && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Aucun équipement déclaré pour le moment.
          </p>
        )}
        {data && data.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.map((item) => {
              const meta = condMeta(item.condition);
              return (
                <div
                  key={item._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.label}
                      {item.quantity > 1 && (
                        <span className="text-muted-foreground"> × {item.quantity}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[item.brand, item.model, item.acquiredAt ? `Acquis le ${formatDate(item.acquiredAt)}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {meta && (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", meta.cls)}>
                        {meta.label}
                      </span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openDialog(item)} aria-label="Modifier">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => archive(item._id, item.label)}
                      aria-label="Retirer"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => !v && (setOpen(false), reset())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifier l'équipement" : "Ajouter un équipement"}</DialogTitle>
            <DialogDescription>
              Déclaration simple — un équipement « vérifié » ne peut être promu que par l'administration GTEC PRO.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Équipement *</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex. : Multimètre, Mégohmmètre, Caméra thermique…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Marque</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex. : Fluke" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Modèle</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex. : 117" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Quantité</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">État</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Date d'acquisition</Label>
              <Input type="date" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Photo (lien, optionnel)</Label>
              <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setOpen(false), reset())}>
              Annuler
            </Button>
            <Button className="halo-amber" disabled={busy || label.trim().length < 2} onClick={submit}>
              {editId ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Badge d'état (usage interne). */
export function EquipmentConditionBadge({ condition }: { condition?: string | null }) {
  const meta = condMeta(condition);
  if (!meta) return <Badge variant="outline">—</Badge>;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", meta.cls)}>
      {meta.label}
    </span>
  );
}
