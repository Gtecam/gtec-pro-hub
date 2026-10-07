import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Globe,
  Landmark,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/gtec";
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
import { cn } from "@/lib/utils";
import { CITIES } from "@/lib/gtec";
import { statusMeta } from "@/lib/gtec";
import {
  BENEFICIARY_RELATIONS,
  DIASPORA_TRACK,
  diasporaTrackIndex,
  displayConverted,
} from "@/lib/diaspora";
import { RelationGlyph } from "@/components/RelationGlyph";

export default function DiasporaPage() {
  const navigate = useNavigate();
  const beneficiaries = useQuery(api.diaspora.listBeneficiaries);
  const history = useQuery(api.diaspora.myDiasporaHistory);
  const addBeneficiary = useMutation(api.diaspora.addBeneficiary);
  const archiveBeneficiary = useMutation(api.diaspora.archiveBeneficiary);

  const [tab, setTab] = useState<"accueil" | "proches" | "interventions" | "paiements">("accueil");
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("EUR");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    relation: "",
    city: "Douala",
    quarter: "",
    address: "",
    accessInstructions: "",
    onSiteContactName: "",
    onSiteContactPhone: "",
  });

  const submitBeneficiary = async () => {
    setBusy(true);
    try {
      await addBeneficiary({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        relation: form.relation,
        city: form.city,
        quarter: form.quarter.trim() || undefined,
        address: form.address.trim() || undefined,
        accessInstructions: form.accessInstructions.trim() || undefined,
        onSiteContactName: form.onSiteContactName.trim() || undefined,
        onSiteContactPhone: form.onSiteContactPhone.trim() || undefined,
      });
      toast.success("Bénéficiaire enregistré — il apparaîtra dans « Pour qui ? »");
      setAddOpen(false);
      setForm({
        firstName: "",
        lastName: "",
        phone: "",
        relation: "",
        city: "Douala",
        quarter: "",
        address: "",
        accessInstructions: "",
        onSiteContactName: "",
        onSiteContactPhone: "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const active = (beneficiaries ?? []).filter((b) => !b.archived);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {/* En-tête Mode Diaspora */}
        <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] via-transparent to-emerald-500/[0.04] p-6">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            <Globe className="size-3.5" /> GTEC PRO Diaspora
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight">
            Vous êtes à l'étranger ?
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Faites intervenir un professionnel vérifié au Cameroun pour votre
            famille, vos proches ou votre bien immobilier. Où que vous soyez
            dans le monde : trouvez, commandez, payez, suivez.
          </p>
        </div>

        {/* Navigation interne */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["accueil", "Accueil"],
              ["proches", `Mes proches (${active.length})`],
              ["interventions", `Mes interventions (${(history ?? []).length})`],
              ["paiements", "Mes paiements"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={tab === key ? "default" : "outline"}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* ===== ACCUEIL : 4 entrées ===== */}
        {tab === "accueil" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Search,
                title: "Trouver un technicien",
                desc: "Commandez une intervention pour un proche au Cameroun.",
                action: () =>
                  active.length > 0
                    ? navigate(`/dashboard/new?diaspora=1&beneficiary=${active[0]._id}`)
                    : (setTab("proches"), setAddOpen(true)),
              },
              {
                icon: ClipboardList,
                title: "Suivre une intervention",
                desc: "Statuts en temps réel, photos, rapport et validation.",
                action: () => setTab("interventions"),
              },
              {
                icon: CreditCard,
                title: "Mes paiements",
                desc: "Paiements internationaux, conversion et escrow.",
                action: () => setTab("paiements"),
              },
              {
                icon: Users,
                title: "Mes proches",
                desc: "Bénéficiaires enregistrés : famille, locataire, entreprise.",
                action: () => setTab("proches"),
              },
            ].map((c) => (
              <button
                key={c.title}
                className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                onClick={c.action}
              >
                <span className="icon-tile size-10"><c.icon className="size-5" /></span>
                <span className="font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* ===== MES PROCHES ===== */}
        {tab === "proches" && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <Button size="sm" className="halo-amber" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 size-4" /> Ajouter un proche
              </Button>
            </div>
            {beneficiaries === undefined ? (
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            ) : active.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <Users className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Aucun bénéficiaire — ajoutez votre premier proche au Cameroun
                    (nom, téléphone, ville, adresse, accès).
                  </p>
                </CardContent>
              </Card>
            ) : (
              active.map((b) => (
                <div
                  key={b._id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                >
                  <span className="icon-tile size-10 shrink-0">
                    <RelationGlyph relation={b.relation} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {b.firstName} {b.lastName} · {b.relation}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.city}
                      {b.quarter ? ` · ${b.quarter}` : ""} · {b.phone}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="halo-amber"
                    onClick={() =>
                      navigate(`/dashboard/new?diaspora=1&beneficiary=${b._id}`)
                    }
                  >
                    Commander <ArrowRight className="ml-1.5 size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      try {
                        await archiveBeneficiary({ beneficiaryId: b._id });
                        toast.success("Bénéficiaire archivé");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erreur");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== MES INTERVENTIONS AU CAMEROUN (§14) ===== */}
        {tab === "interventions" && (
          <div className="flex flex-col gap-3">
            {history === undefined ? (
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            ) : history.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <ClipboardList className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Aucune intervention commandée à distance pour le moment.
                  </p>
                  <Button size="sm" className="halo-amber" onClick={() => setTab("accueil")}>
                    Commander pour un proche
                  </Button>
                </CardContent>
              </Card>
            ) : (
              history.map(({ request, beneficiary }) => {
                const meta = statusMeta(request.status);
                const trackIdx = diasporaTrackIndex(request.status);
                return (
                  <Card key={request._id} className="card-layered">
                    <CardContent className="flex flex-col gap-3 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="icon-tile size-10 shrink-0">
                          {beneficiary ? (
                            <RelationGlyph relation={beneficiary.relation} />
                          ) : (
                            <Globe className="size-5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {beneficiary
                              ? `${beneficiary.firstName} (${beneficiary.relation})`
                              : "Bénéficiaire"}{" "}
                            · {request.city}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {request.reference} · {request.title} ·{" "}
                            {new Date(request._creationTime).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            meta.variant === "green"
                              ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                              : meta.variant === "red"
                                ? "bg-destructive/10 text-destructive ring-destructive/20"
                                : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {/* Suivi à distance (§9) */}
                      <div className="flex flex-wrap gap-1">
                        {DIASPORA_TRACK.map((step, i) => (
                          <span
                            key={step.key}
                            title={step.label}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px]",
                              i < trackIdx
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : i === trackIdx
                                  ? "bg-primary/10 font-semibold text-primary"
                                  : "bg-muted text-muted-foreground/50",
                            )}
                          >
                            <step.icon className="mr-1 inline size-3" /> {step.label}
                          </span>
                        ))}
                      </div>
                      {request.beneficiaryValidation &&
                        request.beneficiaryValidation !== "en_attente" && (
                          <p className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
                            Validation du proche :{" "}
                            <span className="font-medium">
                            {request.beneficiaryValidation === "conforme" ? (
                              <>
                                <CheckCircle2 className="mr-1 inline size-3.5" />
                                Tout est correct
                              </>
                            ) : request.beneficiaryValidation === "correction_demandee" ? (
                              <>
                                <AlertTriangle className="mr-1 inline size-3.5" />
                                Correction demandée
                              </>
                            ) : (
                              <>
                                <XCircle className="mr-1 inline size-3.5" />
                                Problème signalé
                              </>
                            )}
                            </span>
                            {request.beneficiaryValidationNote
                              ? ` — ${request.beneficiaryValidationNote}`
                              : ""}
                          </p>
                        )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="self-end"
                        onClick={() => navigate(`/dashboard/requests/${request._id}`)}
                      >
                        Ouvrir le suivi complet <ArrowRight className="ml-1.5 size-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* ===== MES PAIEMENTS (§7/§8) ===== */}
        {tab === "paiements" && (
          <Card className="card-layered">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4 text-primary" /> Paiements internationaux
              </CardTitle>
              <CardDescription>
                Carte bancaire Visa/Mastercard via notre prestataire certifié —
                tokenisation intégrale, aucune donnée de carte stockée chez
                GTEC PRO. Les fonds sont libérés après validation de
                l'intervention (paiement sécurisé).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Devise d'affichage</Label>
                <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">Euro (EUR)</SelectItem>
                    <SelectItem value="USD">Dollar US (USD)</SelectItem>
                    <SelectItem value="GBP">Livre (GBP)</SelectItem>
                    <SelectItem value="CAD">Dollar canadien (CAD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 rounded-xl bg-muted/60 p-3 text-sm sm:grid-cols-2">
                <p>Exemple : intervention 75 000 FCFA</p>
                <p className="text-right font-medium">
                  {displayConverted(75000, displayCurrency as never)}
                </p>
                <p>Frais éventuels (estimation) : ~2,9 % + forfait</p>
                <p className="text-right text-xs text-muted-foreground">
                  Le montant final affiché avant validation prime.
                </p>
              </div>
              <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-2 text-xs text-muted-foreground">
                <Landmark className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Le paiement se règle sur l'écran de chaque intervention, à
                l'étape « Paiement » — le montant y est affiché en FCFA et
                converti dans votre devise avant confirmation.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== DIALOG : AJOUT D'UN PROCHE (§2) ===== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajouter un bénéficiaire au Cameroun</DialogTitle>
            <DialogDescription>
              Qui recevra l'intervention sur place ? Le proche est notifié dès
              la création de la demande.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Prénom *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Marie"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Nom *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Nkeng"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Téléphone camerounais *</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="6 XX XX XX XX"
                inputMode="tel"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Relation *</Label>
              <Select
                value={form.relation}
                onValueChange={(v) => setForm({ ...form, relation: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {BENEFICIARY_RELATIONS.filter((r) => r !== "Moi-même").map((r) => (
                    <SelectItem key={r} value={r}>
                      <RelationGlyph relation={r} className="size-4" /> {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Ville *</Label>
              <Select
                value={form.city}
                onValueChange={(v) => setForm({ ...form, city: v })}
              >
                <SelectTrigger>
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
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Quartier</Label>
              <Input
                value={form.quarter}
                onChange={(e) => setForm({ ...form, quarter: e.target.value })}
                placeholder="Ex. : Bonapriso"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-sm">Adresse</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Rue, immeuble, repère…"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-sm">Instructions d'accès</Label>
              <Textarea
                value={form.accessInstructions}
                onChange={(e) => setForm({ ...form, accessInstructions: e.target.value })}
                placeholder="Portail bleu, 2e étage, sonner à l'appartement B…"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Contact sur place (nom)</Label>
              <Input
                value={form.onSiteContactName}
                onChange={(e) => setForm({ ...form, onSiteContactName: e.target.value })}
                placeholder="Si différent du bénéficiaire"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Contact sur place (téléphone)</Label>
              <Input
                value={form.onSiteContactPhone}
                onChange={(e) => setForm({ ...form, onSiteContactPhone: e.target.value })}
                placeholder="6 XX XX XX XX"
                inputMode="tel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Annuler
            </Button>
            <Button
              className="halo-amber"
              disabled={
                busy ||
                form.firstName.trim().length < 2 ||
                form.lastName.trim().length < 2 ||
                form.phone.replace(/\D/g, "").length < 9 ||
                !form.relation
              }
              onClick={submitBeneficiary}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Enregistrer le bénéficiaire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
