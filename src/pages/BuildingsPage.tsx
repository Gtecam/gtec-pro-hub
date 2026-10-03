import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  Building2,
  CalendarClock,
  Clock,
  Copy,
  FileText,
  KeyRound,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/gtec";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/gtec";
import { NOMENCLATURE } from "@/lib/nomenclature";
import { AssetIotCard } from "@/components/AssetIotCard";

/**
 * GTEC PRO — DOSSIER TECHNIQUE NUMÉRIQUE DU BÂTIMENT (F°5, F°6, F°7, F°33).
 * Un dossier par bâtiment : équipements (QR + garantie), documents (plans,
 * certificats), historique technique et accès temporaires aux techniciens.
 */

const KINDS = [
  { key: "residence", label: "Résidence" },
  { key: "commerce", label: "Commerce" },
  { key: "hotel", label: "Hôtel" },
  { key: "industriel", label: "Industriel" },
  { key: "bureau", label: "Bureaux" },
  { key: "autre", label: "Autre" },
];

const DOC_KINDS = ["plan", "schema", "certificat", "facture", "contrat", "photo", "autre"];

const EVENT_KINDS = ["maintenance", "panne", "intervention", "inspection", "garantie", "autre"];

const QR_URL = (token: string) => `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(window.location.origin + "/verify/" + token)}`;
const QR_URL_ASSET = (token: string) => `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(window.location.origin + "/asset/" + token)}`;

export default function BuildingsPage() {
  const data = useQuery(api.buildings.myBuildings, {});
  const alerts = useQuery(api.buildings.myWarrantyAlerts, {});
  const upsertBuilding = useMutation(api.buildings.upsertBuilding);
  const setPublic = useMutation(api.buildings.setBuildingPublic);
  const archiveBuilding = useMutation(api.buildings.archiveBuilding);
  const upsertAsset = useMutation(api.buildings.upsertAsset);
  const addDoc = useMutation(api.buildings.addBuildingDocument);
  const addEvent = useMutation(api.buildings.addBuildingEvent);
  const grant = useMutation(api.buildings.grantBuildingAccess);
  const revoke = useMutation(api.buildings.revokeBuildingAccess);

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detail = useQuery(
    api.buildings.getBuilding,
    selected ? { id: selected as never } : "skip",
  );

  // Dialog bâtiment
  const [bOpen, setBOpen] = useState(false);
  const [bId, setBId] = useState<string | null>(null);
  const [bName, setBName] = useState("");
  const [bKind, setBKind] = useState("residence");
  const [bCity, setBCity] = useState("Douala");
  const [bQuarter, setBQuarter] = useState("");
  const [bAddress, setBAddress] = useState("");

  // Dialog équipement
  const [aOpen, setAOpen] = useState(false);
  const [aLabel, setALabel] = useState("");
  const [aDomain, setADomain] = useState("");
  const [aBrand, setABrand] = useState("");
  const [aModel, setAModel] = useState("");
  const [aSerial, setASerial] = useState("");
  const [aInstalled, setAInstalled] = useState("");
  const [aWarranty, setAWarranty] = useState("");
  const [aNext, setANext] = useState("");

  // Dialog document / événement / accès
  const [dOpen, setDOpen] = useState(false);
  const [dKind, setDKind] = useState("plan");
  const [dTitle, setDTitle] = useState("");
  const [dNote, setDNote] = useState("");
  const [eOpen, setEOpen] = useState(false);
  const [eKind, setEKind] = useState("maintenance");
  const [eLabel, setELabel] = useState("");
  const [eDetail, setEDetail] = useState("");
  const [gOpen, setGOpen] = useState(false);
  const [gPhone, setGPhone] = useState("");
  const [gScope, setGScope] = useState("lecture");
  const [gHours, setGHours] = useState("24");

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (data === undefined) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  const saveBuilding = async () => {
    if (bName.trim().length < 2 || bCity.trim().length < 2) {
      toast.error("Indiquez au moins le nom et la ville.");
      return;
    }
    const ok = await run(
      () =>
        upsertBuilding({
          id: (bId ?? undefined) as never,
          name: bName,
          kind: bKind,
          city: bCity,
          quarter: bQuarter.trim() || undefined,
          address: bAddress.trim() || undefined,
        }),
      bId ? "Bâtiment mis à jour" : "Bâtiment créé",
    );
    if (ok) setBOpen(false);
  };

  const saveAsset = async () => {
    if (!selected) return;
    if (aLabel.trim().length < 2) {
      toast.error("Indiquez le nom de l'équipement.");
      return;
    }
    const ok = await run(
      () =>
        upsertAsset({
          buildingId: selected as never,
          label: aLabel,
          domainCode: aDomain || undefined,
          brand: aBrand.trim() || undefined,
          model: aModel.trim() || undefined,
          serialNumber: aSerial.trim() || undefined,
          installedAt: aInstalled ? new Date(aInstalled).getTime() : undefined,
          warrantyMonths: aWarranty ? Number(aWarranty) : undefined,
          warrantyUntil: aWarranty && aInstalled ? new Date(aInstalled).getTime() + Number(aWarranty) * 30.44 * 86400000 : undefined,
          nextMaintenanceAt: aNext ? new Date(aNext).getTime() : undefined,
        }),
      "Équipement enregistré — son QR code est disponible",
    );
    if (ok) setAOpen(false);
  };

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Dossier technique</p>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-tight">Mes bâtiments</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Un dossier permanent par bâtiment : équipements avec QR codes,
              documents, historique et accès temporaires pour vos techniciens.
            </p>
          </div>
          <Button
            onClick={() => {
              setBId(null);
              setBName("");
              setBKind("residence");
              setBCity("Douala");
              setBQuarter("");
              setBAddress("");
              setBOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-4" /> Nouveau bâtiment
          </Button>
        </div>

        {/* Alertes garantie 30 jours (F°7) */}
        {alerts && alerts.length > 0 && (
          <Card className="card-layered border-amber-500/40 bg-amber-500/[0.04]">
            <CardContent className="flex flex-col gap-2 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <CalendarClock className="size-4 text-amber-600 dark:text-amber-400" /> Garanties à surveiller
              </p>
              {alerts.map((a) => (
                <p key={a.assetId} className="text-xs text-muted-foreground">
                  ⚠️ {a.daysLeft >= 0 ? `Garantie de « ${a.label} » (${a.buildingName}) expire dans ${a.daysLeft} jours.` : `Garantie de « ${a.label} » (${a.buildingName}) expirée.`}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Liste des bâtiments */}
        {data.owned.length === 0 && data.shared.length === 0 ? (
          <Card className="card-layered">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Building2 className="size-6" />
              </span>
              <p className="font-display text-lg font-semibold">Aucun bâtiment</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Créez le dossier de votre résidence ou de votre entreprise :
                équipements, QR codes, documents et historique centralisés.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.owned.map((b) => (
              <Card
                key={b._id}
                className={cn(
                  "card-layered cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg",
                  selected === b._id && "ring-2 ring-primary/40",
                )}
                onClick={() => setSelected(selected === b._id ? null : b._id)}
              >
                <CardContent className="flex flex-col gap-1.5 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <Building2 className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{b.name}</span>
                    </p>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {KINDS.find((k) => k.key === b.kind)?.label ?? b.kind}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[b.quarter, b.city].filter(Boolean).join(", ")}
                  </p>
                </CardContent>
              </Card>
            ))}
            {data.shared.map((b) => (
              <Card key={b._id} className="card-layered border-dashed">
                <CardContent className="flex flex-col gap-1.5 px-4 py-3.5">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <KeyRound className="size-4 shrink-0 text-amber-600" />
                    <span className="truncate">{b.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Accès « {b.scope} » jusqu'au {formatDate(b.until)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Dossier détaillé */}
        {detail && (
          <Card className="card-layered">
            <CardContent className="flex flex-col gap-4 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold">{detail.building.name}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setAOpen(true)}>
                    <Plus className="mr-1 size-3.5" /> Équipement
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDOpen(true)}>
                    <FileText className="mr-1 size-3.5" /> Document
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEOpen(true)}>
                    <Clock className="mr-1 size-3.5" /> Événement
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setGOpen(true)}>
                    <KeyRound className="mr-1 size-3.5" /> Accès
                  </Button>
                </div>
              </div>

              {/* QR bâtiment */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
                <img src={QR_URL(detail.building.publicToken)} alt="QR bâtiment" className="size-20 rounded border bg-white" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">QR code du bâtiment</p>
                  <p className="text-xs text-muted-foreground">
                    Page publique masquée (/verify/{detail.building.publicToken.slice(0, 8)}…) — aucune donnée personnelle.
                  </p>
                  <label className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={!!detail.building.publicEnabled}
                      onCheckedChange={(v) =>
                        run(() => setPublic({ id: detail.building._id as never, enabled: v }), v ? "Page publique activée" : "Page publique désactivée")
                      }
                    />
                    Autoriser l'affichage public
                  </label>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(`${window.location.origin}/verify/${detail.building.publicToken}`);
                    toast.success("Lien public copié");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>

              {/* Équipements */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Équipements ({detail.assets.length})</p>
                {detail.assets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun équipement enregistré.</p>
                ) : (
                  detail.assets.map((a) => (
                    <div key={a._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {a.label}
                          {a.brand ? ` · ${a.brand}` : ""}
                          {a.model ? ` ${a.model}` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {a.serialNumber ? `N° ${a.serialNumber} · ` : ""}
                          {a.installedAt ? `Installé le ${formatDate(a.installedAt)} · ` : ""}
                          {a.warrantyUntil
                            ? a.warrantyUntil > Date.now()
                              ? `Garantie jusqu'au ${formatDate(a.warrantyUntil)}`
                              : "Garantie expirée"
                            : "Sans garantie enregistrée"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <img src={QR_URL_ASSET(a.qrToken)} alt="QR équipement" className="size-14 rounded border bg-white" />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void navigator.clipboard.writeText(`${window.location.origin}/asset/${a.qrToken}`);
                            toast.success("Lien équipement copié");
                          }}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Documents */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Documents ({detail.documents.length})</p>
                {detail.documents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun document (plans, certificats, factures…).</p>
                ) : (
                  detail.documents.map((d) => (
                    <div key={d._id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{d.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {d.kind}
                          {d.expiresAt ? ` · expire le ${formatDate(d.expiresAt)}` : ""}
                        </p>
                      </div>
                      {d.documentUrl && (
                        <a href={d.documentUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline">
                          Ouvrir
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Historique */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Historique technique ({detail.events.length})</p>
                {detail.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun événement enregistré.</p>
                ) : (
                  detail.events.slice(0, 12).map((e) => (
                    <div key={e._id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">
                        {e.label} {e.detail ? `— ${e.detail}` : ""}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground/70">{formatDate(e.at)}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Phase 7 IoT : relevés de compteurs et capteurs par équipement */}
              <AssetIotCard buildingId={detail.building._id} />

              {/* Accès temporaires */}
              {detail.grants.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">Accès accordés</p>
                  {detail.grants.map((g) => (
                    <div key={g._id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{g.userName ?? "Utilisateur"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {g.scope} · jusqu'au {formatDate(g.until)}
                          {g.isActive ? "" : " · révoqué"}
                        </p>
                      </div>
                      {g.isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive"
                          onClick={() => run(() => revoke({ grantId: g._id as never }), "Accès révoqué")}
                        >
                          <Trash2 className="mr-1 size-3" /> Révoquer
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {detail.building.ownerUserId === undefined ? null : (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-destructive"
                    onClick={() => {
                      if (confirm(`Archiver « ${detail.building.name} » ? Son historique reste conservé.`)) {
                        void run(() => archiveBuilding({ id: detail.building._id as never }), "Bâtiment archivé");
                      }
                    }}
                  >
                    <Archive className="mr-1 size-3.5" /> Archiver ce bâtiment
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog bâtiment */}
      <Dialog open={bOpen} onOpenChange={setBOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bId ? "Modifier le bâtiment" : "Nouveau bâtiment"}</DialogTitle>
            <DialogDescription>Le dossier regroupe équipements, documents et historique du site.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Nom *</Label>
              <Input value={bName} onChange={(e) => setBName(e.target.value)} placeholder="Ex. : Résidence Bonapriso" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Type</Label>
                <Select value={bKind} onValueChange={setBKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Ville *</Label>
                <Input value={bCity} onChange={(e) => setBCity(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Quartier</Label>
                <Input value={bQuarter} onChange={(e) => setBQuarter(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Adresse</Label>
                <Input value={bAddress} onChange={(e) => setBAddress(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBOpen(false)}>Annuler</Button>
            <Button onClick={saveBuilding} disabled={busy}>{bId ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog équipement */}
      <Dialog open={aOpen} onOpenChange={setAOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel équipement</DialogTitle>
            <DialogDescription>
              Chaque équipement reçoit un QR code : le scan affiche modèle, garantie, historique et prochaine maintenance.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Nom de l'équipement *</Label>
              <Input value={aLabel} onChange={(e) => setALabel(e.target.value)} placeholder="Ex. : Climatiseur salon AC-0045" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Marque</Label>
                <Input value={aBrand} onChange={(e) => setABrand(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Modèle</Label>
                <Input value={aModel} onChange={(e) => setAModel(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">N° de série</Label>
                <Input value={aSerial} onChange={(e) => setASerial(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Domaine</Label>
                <Select value={aDomain} onValueChange={setADomain}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    {NOMENCLATURE.map((d) => (
                      <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Installation</Label>
                <Input type="date" value={aInstalled} onChange={(e) => setAInstalled(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Garantie (mois)</Label>
                <Input type="number" min={0} value={aWarranty} onChange={(e) => setAWarranty(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Proch. entretien</Label>
                <Input type="date" value={aNext} onChange={(e) => setANext(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAOpen(false)}>Annuler</Button>
            <Button onClick={saveAsset} disabled={busy}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog document */}
      <Dialog open={dOpen} onOpenChange={setDOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un document</DialogTitle>
            <DialogDescription>Plan, schéma, certificat, facture… le dossier reste complet.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Type</Label>
                <Select value={dKind} onValueChange={setDKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Titre *</Label>
                <Input value={dTitle} onChange={(e) => setDTitle(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Note</Label>
              <Textarea rows={2} value={dNote} onChange={(e) => setDNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDOpen(false)}>Annuler</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!selected || dTitle.trim().length < 2) {
                  toast.error("Indiquez le titre du document.");
                  return;
                }
                const ok = await run(
                  () => addDoc({ buildingId: selected as never, kind: dKind, title: dTitle, note: dNote.trim() || undefined }),
                  "Document ajouté au dossier",
                );
                if (ok) setDOpen(false);
              }}
            >
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog événement */}
      <Dialog open={eOpen} onOpenChange={setEOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un événement</DialogTitle>
            <DialogDescription>Maintenance, panne, inspection : tout l'historique du site est tracé.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Type</Label>
                <Select value={eKind} onValueChange={setEKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Intitulé *</Label>
                <Input value={eLabel} onChange={(e) => setELabel(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Détail</Label>
              <Textarea rows={2} value={eDetail} onChange={(e) => setEDetail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEOpen(false)}>Annuler</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!selected || eLabel.trim().length < 2) {
                  toast.error("Indiquez l'intitulé de l'événement.");
                  return;
                }
                const ok = await run(
                  () => addEvent({ buildingId: selected as never, kind: eKind, label: eLabel, detail: eDetail.trim() || undefined }),
                  "Événement enregistré",
                );
                if (ok) setEOpen(false);
              }}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog accès temporaire */}
      <Dialog open={gOpen} onOpenChange={setGOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accorder un accès temporaire</DialogTitle>
            <DialogDescription>
              Le technicien doit avoir un compte GTEC PRO. L'accès expire automatiquement — ses données restent intangibles.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Téléphone du compte GTEC PRO *</Label>
              <Input value={gPhone} onChange={(e) => setGPhone(e.target.value)} placeholder="655 09 42 28" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Portée</Label>
                <Select value={gScope} onValueChange={setGScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lecture">Lecture seule</SelectItem>
                    <SelectItem value="intervention">Lecture + intervention</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Durée (heures)</Label>
                <Input type="number" min={1} max={720} value={gHours} onChange={(e) => setGHours(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGOpen(false)}>Annuler</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!selected || !/^\+?[0-9 ]{8,}$/.test(gPhone.trim())) {
                  toast.error("Numéro de téléphone invalide.");
                  return;
                }
                const ok = await run(
                  () => grant({ buildingId: selected as never, phone: gPhone.trim(), scope: gScope as never, hours: Number(gHours) || 24 }),
                  "Accès accordé — le technicien est notifié",
                );
                if (ok) setGOpen(false);
              }}
            >
              <ShieldCheck className="mr-1.5 size-4" /> Accorder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
