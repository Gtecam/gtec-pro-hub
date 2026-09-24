import { Loader2, Plus, Power, Trash2, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, categoryIcon } from "@/lib/gtec";

type CategoryRow = {
  _id: string;
  key: string;
  label: string;
  description?: string;
  icon?: string;
  subcategories: { key: string; label: string }[];
  active: boolean;
  sortOrder: number;
};

function parseSubs(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function runOrToast(fn: () => Promise<unknown>, ok: string) {
  return fn()
    .then(() => toast.success(ok))
    .catch((e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erreur"),
    );
}

/** Onglet admin : catalogue de services dynamique (cahier des charges §4). */
export default function ServicesCatalog() {
  const categories = useQuery(api.catalog.listServiceCategories, { all: true });
  const seedCategories = useMutation(api.catalog.seedServiceCategories);
  const createCategory = useMutation(api.catalog.adminCreateCategory);
  const updateCategory = useMutation(api.catalog.adminUpdateCategory);
  const deleteCategory = useMutation(api.catalog.adminDeleteCategory);

  // ----- dialogue création -----
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIcon, setNewIcon] = useState("Wrench");
  const [newSubs, setNewSubs] = useState("");
  const [busy, setBusy] = useState(false);

  // ----- dialogue édition -----
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIcon, setEditIcon] = useState("Wrench");
  const [editSubs, setEditSubs] = useState("");
  const [editActive, setEditActive] = useState(true);

  const openEdit = (c: CategoryRow) => {
    setEditId(c._id);
    setEditLabel(c.label);
    setEditDesc(c.description ?? "");
    setEditIcon(c.icon ?? "Wrench");
    setEditSubs(c.subcategories.map((s) => s.label).join("\n"));
    setEditActive(c.active);
  };

  const submitCreate = async () => {
    setBusy(true);
    try {
      await createCategory({
        label: newLabel,
        description: newDesc || undefined,
        icon: newIcon,
        subcategories: parseSubs(newSubs),
      });
      toast.success("Catégorie ajoutée");
      setCreateOpen(false);
      setNewLabel("");
      setNewDesc("");
      setNewIcon("Wrench");
      setNewSubs("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!editId) return;
    setBusy(true);
    try {
      await updateCategory({
        categoryId: editId as never,
        label: editLabel,
        description: editDesc,
        icon: editIcon,
        subcategories: parseSubs(editSubs),
        active: editActive,
      });
      toast.success("Catégorie mise à jour");
      setEditId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c: CategoryRow) => {
    try {
      await updateCategory({ categoryId: c._id as never, active: !c.active });
      toast.success(c.active ? "Catégorie désactivée" : "Catégorie réactivée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const removeCategory = async (id: string) => {
    setBusy(true);
    try {
      await deleteCategory({ categoryId: id as never });
      toast.success("Catégorie supprimée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (categories === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display font-semibold">Catalogue de services</p>
          <p className="text-sm text-muted-foreground">
            Catégories et sous-catégories proposées aux clients dans le
            formulaire de demande. Ajoutez, modifiez, désactivez ou supprimez.
          </p>
        </div>
        <div className="flex gap-2">
          {categories.length === 0 && (
            <Button
              variant="outline"
              onClick={() =>
                runOrToast(
                  () => seedCategories(),
                  "Les 12 domaines officiels ont été restaurés",
                )
              }
            >
              <Wrench className="mr-2 size-4" />
              Restaurer les 12 domaines officiels
            </Button>
          )}
          <Button className="halo-amber" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            Nouvelle catégorie
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <Card className="card-layered">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wrench className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucune catégorie pour le moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            return (
              <Card
                key={c._id}
                className={cn("card-layered", !c.active && "opacity-60")}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-sm font-semibold">
                          {c.label}
                        </CardTitle>
                        <CardDescription className="truncate text-xs">
                          {c.key}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={c.active ? "default" : "outline"}>
                      {c.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {c.description && (
                    <p className="text-xs text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {c.subcategories.length === 0 ? (
                      <span className="text-xs italic text-muted-foreground">
                        Aucune sous-catégorie
                      </span>
                    ) : (
                      c.subcategories.map((s) => (
                        <Badge
                          key={s.key}
                          variant="secondary"
                          className="text-[11px] font-normal"
                        >
                          {s.label}
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 border-t pt-3">
                    <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                      Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(c)}
                    >
                      <Power className="mr-1.5 size-3.5" />
                      {c.active ? "Désactiver" : "Activer"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => removeCategory(c._id)}
                    >
                      <Trash2 className="mr-1.5 size-3.5" />
                      Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogue : création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle catégorie de service</DialogTitle>
            <DialogDescription>
              Les sous-catégories correspondent aux « types de problème »
              proposés au client, une par ligne.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Libellé</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex. : Ascenseurs & levage"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description courte</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Affichée sous le libellé dans le formulaire client"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Icône</Label>
              <Select value={newIcon} onValueChange={setNewIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(CATEGORY_ICONS).map((name) => {
                    const Icon = categoryIcon(name);
                    return (
                      <SelectItem key={name} value={name}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="size-4" /> {name}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sous-catégories (une par ligne)</Label>
              <Textarea
                value={newSubs}
                onChange={(e) => setNewSubs(e.target.value)}
                placeholder={"Installation\nDépannage\nEntretien"}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              className="halo-amber"
              disabled={busy || newLabel.trim().length < 2}
              onClick={submitCreate}
            >
              Créer la catégorie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue : édition */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la catégorie</DialogTitle>
            <DialogDescription>
              Sous-catégories : une par ligne. Vider la liste supprime toutes
              les sous-catégories.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Libellé</Label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description courte</Label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Icône</Label>
              <Select value={editIcon} onValueChange={setEditIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(CATEGORY_ICONS).map((name) => {
                    const Icon = categoryIcon(name);
                    return (
                      <SelectItem key={name} value={name}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="size-4" /> {name}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sous-catégories (une par ligne)</Label>
              <Textarea
                value={editSubs}
                onChange={(e) => setEditSubs(e.target.value)}
                rows={6}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Catégorie visible par les clients
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditId(null)}>
              Annuler
            </Button>
            <Button className="halo-amber" disabled={busy} onClick={submitEdit}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
