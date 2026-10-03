import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ArrowRight, Building2, Plus, Trash2, MapPin, Clock, AlertTriangle, FileText, PlusCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";


import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDate } from "@/lib/gtec";

/** GTEC PRO — §3 « PASSEPORT NUMÉRIQUE DU BÂTIMENT » + §5 « HISTORIQUE TECHNIQUE » */
export default function MyBuildingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("maison");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  const createBuilding = useMutation(api.buildings.upsertBuilding);
  const setBuildingPublic = useMutation(api.buildings.setBuildingPublic);
  const archiveBuilding = useMutation(api.buildings.archiveBuilding);
  const buildings = useQuery(api.buildings.myBuildings);
  const building = useQuery(api.buildings.getBuilding, "skip");

  const kindOptions = [
    "maison",
    "appartement",
    "immeuble",
    "bureau",
    "boutique",
    "hôtel",
    "restaurant",
    "usine",
    "entrepôt",
    "école",
    "hôpital",
    "établissement public",
    "autre",
  ];

  const openCreate = () => {
    setName("");
    setCity("");
    setDescription("");
    setKind("maison");
    setShowForm(true);
  };

  const submit = async () => {
    if (!name.trim() || !city.trim()) {
      toast.error("Le nom et la ville sont obligatoires.");
      return;
    }
    try {
      await createBuilding({ name: name.trim(), kind, city: city.trim(), description: description.trim() });
      toast.success("Bâtiment enregistré");
      setName("");
      setCity("");
      setDescription("");
      setShowForm(false);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const open = (id: string) => navigate(`/b/${id}`);
  const togglePublic = async (id: any, enabled: boolean) => {
    try {
      await setBuildingPublic({ id, enabled });
      toast.success(enabled ? "Affichage public activé (URL /verify)" : "Affichage public désactivé");
    } catch (e) {
      toast.error(String(e));
    }
  };
  const archive = async (id: any) => {
    try {
      await archiveBuilding({ id });
      toast.success("Archivé (données conservées)");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const owned = buildings?.owned ?? [];
  const shared = buildings?.shared ?? [];

  return (
    <div className="flex flex-col gap-6 px-4 py-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">🏠 Mon bâtiment</h1>
          <p className="text-sm text-muted-foreground">Enregistrez un ou plusieurs bâtiments et consultez leur dossier technique numérique.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1.5 size-4" /> {showForm ? "Annuler" : "Nouveau bâtiment"} {!showForm && <PlusCircle className="ml-1 size-4" />}
        </Button>
      </div>

      {showForm && (
        <Card className="card-layered border-primary/20 bg-primary/[0.02]">
          <CardHeader>
            <CardTitle>Nouveau bâtiment</CardTitle>
            <CardDescription>Indiquez le nom et la ville ; vous pourrez compléter la suite de l'info ultérieurement.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="b-name">Nom du bâtiment</Label>
                <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Maison de Pierre" />
              </div>
              <div>
                <Label htmlFor="b-kind">Type</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {kindOptions.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="b-city">Ville</Label>
              <Input id="b-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Douala, Yaoundé, Bafoussam…" />
            </div>
            <div>
              <Label htmlFor="b-desc">Description (optionnelle)</Label>
              <Input id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pièce, usage, particularités…" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button size="sm" onClick={submit}>
                <PlusCircle className="mr-1.5 size-4" /> Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {owned.length === 0 && shared.length === 0 ? (
        <Card className="card-layered text-center">
          <CardContent className="py-12">
            <Building2 className="mx-auto mb-3 size-10 text-muted-foreground" />
            <p className="font-semibold">Aucun bâtiment enregistré</p>
            <p className="text-sm text-muted-foreground">Commencez par en créer un pour ouvrir votre dossier technique.</p>
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 size-4" /> Premier bâtiment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {owned.map((b) => (
            <Card key={b._id} className="card-layered group cursor-pointer" onClick={() => open(b._id)}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.kind} · {b.city}</p>
                    {building?.building?._id === b._id && <Badge variant="secondary">Dossier ouvert</Badge>}
                  </div>
                </div>
                <div className="flex-shrink-0 flex gap-1.5">
                  {b.publicEnabled && <Badge>QR publique</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
