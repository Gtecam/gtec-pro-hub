import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  School,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AUTHORIZATION_STATUS_LABELS,
  AUTHORIZATION_STATUSES,
  INSTITUTION_STATUSES,
  INSTITUTION_STATUS_LABELS,
  INSTITUTION_TYPE_LABELS,
  INSTITUTION_TYPES,
  OWNERSHIP_LABELS,
  OWNERSHIPS,
  REGION_LABELS,
  REGIONS,
  RECOGNITION_STATUS_LABELS,
  credentialBadge,
  type CredentialStatus,
  type InstitutionStatus,
} from "@/lib/institutions";

/**
 * Onglet « Éducation & Diplômes » (console admin) :
 *  - dashboard du référentiel MINESUP (`educationStats`) + alerte stale ;
 *  - import du seed officiel (`seedInstitutions`) — idempotent ;
 *  - CRUD établissements (création, édition, statut, vérification annuelle) ;
 *  - vérification des diplômes (`adminListCredentials` → `adminReviewCredential`) ;
 *  - demandes « Mon établissement n'est pas dans la liste »
 *    (`adminListVerificationRequests` → `adminReviewVerificationRequest`).
 */
export function EducationAdmin() {
  const stats = useQuery(api.institutions.educationStats, {});
  const institutions = useQuery(api.institutions.listInstitutions, { includeInactive: true });
  const credentials = useQuery(api.institutions.adminListCredentials, {});
  const requests = useQuery(api.institutions.adminListVerificationRequests, {});
  const seedInstitutions = useMutation(api.institutions.seedInstitutions);
  const createInstitution = useMutation(api.institutions.adminCreateInstitution);
  const updateInstitution = useMutation(api.institutions.adminUpdateInstitution);
  const setStatus = useMutation(api.institutions.adminSetInstitutionStatus);
  const verifyInstitution = useMutation(api.institutions.adminVerifyInstitution);
  const reviewCredential = useMutation(api.institutions.adminReviewCredential);
  const reviewRequest = useMutation(api.institutions.adminReviewVerificationRequest);

  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<null | {
    _id: string;
    name: string;
    city: string;
    region: string;
    authorizationStatus: string;
    recognitionStatus: string;
    canIssueNationalDiploma: boolean;
    canIssuePrivateDiploma: boolean;
    website: string;
    notes: string;
  }>(null);
  const [statusTarget, setStatusTarget] = useState<null | { id: string; name: string; current: string }>(null);
  const [newStatus, setNewStatus] = useState("ACTIVE");
  const [statusReason, setStatusReason] = useState("");
  const [newCred, setNewCred] = useState<null | { id: string; decision: string }>(null);
  const [credNote, setCredNote] = useState("");
  const [openReq, setOpenReq] = useState<null | {
    requestId: string;
    institutionName: string;
    decision: string;
    code: string;
    institutionType: string;
    ownership: string;
    region: string;
    city: string;
    adminNote: string;
  }>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  // ----- formulaire de création -----
  const [form, setForm] = useState({
    code: "",
    name: "",
    shortName: "",
    institutionType: "PRIVATE_HIGHER_INSTITUTE",
    ownership: "PRIVATE",
    region: "CENTRE",
    city: "",
    authorizationStatus: "UNKNOWN",
    recognitionStatus: "UNDER_REVIEW",
    source: "",
    sourceUrl: "",
    notes: "",
  });

  const filtered = (institutions ?? []).filter((i) => {
    if (!q.trim()) return true;
    const hay = `${i.code} ${i.name} ${i.shortName ?? ""} ${i.city ?? ""} ${i.region}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const pendingCreds = (credentials ?? []).filter(
    (c) => c.credential.verificationStatus === "en_attente" || c.credential.verificationStatus === "declare",
  );
  const pendingRequests = (requests ?? []).filter(
    (r) => r.request.status === "PENDING" || r.request.status === "UNDER_REVIEW",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Dashboard ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Établissements", value: stats?.total ?? "—", icon: Building2, tone: "" },
          { label: "Universités d'État", value: stats?.stateUniversities ?? "—", icon: Landmark, tone: "" },
          { label: "IPES", value: stats?.ipes ?? "—", icon: School, tone: "" },
          { label: "Diplômes vérifiés", value: stats?.credentialsVerified ?? "—", icon: FileCheck2, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "À vérifier", value: stats?.credentialsPending ?? "—", icon: GraduationCap, tone: "text-amber-600 dark:text-amber-400" },
          { label: "Demandes en attente", value: stats?.requestsPending ?? "—", icon: AlertTriangle, tone: "text-amber-600 dark:text-amber-400" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="card-layered">
            <CardContent className="px-4 py-3.5">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="size-3.5" /> {label}
              </p>
              <p className={cn("font-display mt-1 truncate text-lg font-bold", tone)}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerte référentiel stale (§20) */}
      {stats && stats.staleAlertCount > 0 && (
        <Card className="card-layered border-amber-500/40 bg-amber-500/[0.04]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" /> Référentiel à re-vérifier
            </CardTitle>
            <CardDescription>
              {stats.staleAlertCount} établissement(s) actifs n'ont pas été vérifiés depuis plus de{" "}
              {Math.round(stats.staleDays / 30)} mois. Reconduisez la vérification annuelle.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {stats.stale.slice(0, 8).map((i) => (
              <div key={i._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate">{i.name} <span className="text-xs text-muted-foreground">· {i.code} · {REGION_LABELS[i.region as keyof typeof REGION_LABELS] ?? i.region}</span></span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => verifyInstitution({ institutionId: i._id as never }),
                      `${i.name} marqué vérifié`,
                    )
                  }
                >
                  <ShieldCheck className="mr-1.5 size-3.5" /> Vérifier
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---------- Seed ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(() => seedInstitutions({}), "Référentiel MINESUP importé")}
        >
          <RefreshCw className={cn("mr-1.5 size-4", busy && "animate-spin")} />
          Importer le référentiel officiel
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 size-4" /> Ajouter un établissement
        </Button>
        <span className="text-xs text-muted-foreground">
          Source : MINESUP — l'import est idempotent (seules les lignes absentes sont créées).
        </span>
      </div>

      {/* ---------- Liste des établissements ---------- */}
      <Card className="card-layered">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-primary" /> Référentiel des établissements
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (nom, code, ville…)"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {institutions === undefined ? (
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
          ) : institutions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Référentiel vide — importez le référentiel officiel ci-dessus.
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              {filtered.map((i) => (
                <div key={i._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {i.name}
                      {i.shortName && <span className="ml-1.5 text-xs text-muted-foreground">({i.shortName})</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.code} · {INSTITUTION_TYPE_LABELS[i.institutionType]} ·{" "}
                      {REGION_LABELS[i.region as keyof typeof REGION_LABELS] ?? i.region}
                      {i.city ? ` · ${i.city}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        i.status === "ACTIVE"
                          ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                          : i.status === "SUSPENDED" || i.status === "CLOSED"
                            ? "border-destructive/40 text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {INSTITUTION_STATUS_LABELS[i.status as InstitutionStatus] ?? i.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        i.recognitionStatus === "RECOGNIZED"
                          ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                          : i.recognitionStatus === "NOT_RECOGNIZED"
                            ? "border-destructive/40 text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {RECOGNITION_STATUS_LABELS[i.recognitionStatus as keyof typeof RECOGNITION_STATUS_LABELS] ?? i.recognitionStatus}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing({
                      _id: i._id,
                      name: i.name,
                      city: i.city ?? "",
                      region: i.region,
                      authorizationStatus: i.authorizationStatus,
                      recognitionStatus: i.recognitionStatus,
                      canIssueNationalDiploma: i.canIssueNationalDiploma ?? false,
                      canIssuePrivateDiploma: i.canIssuePrivateDiploma ?? false,
                      website: i.website ?? "",
                      notes: i.notes ?? "",
                    })}>
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => verifyInstitution({ institutionId: i._id as never }),
                          `${i.name} : vérification reconduite`,
                        )
                      }
                    >
                      <ShieldCheck className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setStatusTarget({ id: i._id, name: i.name, current: i.status });
                        setNewStatus(i.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
                        setStatusReason("");
                      }}
                    >
                      Statut
                    </Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Vérification des diplômes ---------- */}
      <Card className="card-layered">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="size-4 text-primary" /> Vérification des diplômes
            {pendingCreds.length > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {pendingCreds.length}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Seule cette instruction peut attribuer le badge « Diplôme vérifié » (§12, §17).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {credentials === undefined ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          ) : credentials.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun diplôme déclaré pour le moment.</p>
          ) : (
            credentials.map(({ credential, user, institution }) => {
              const badge = credentialBadge(credential.verificationStatus as CredentialStatus);
              return (
                <div key={credential._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {credential.diplomaTitle ?? credential.degreeKey ?? "Diplôme"}{" "}
                      {credential.diplomaLevel && (
                        <span className="text-xs font-normal text-muted-foreground">· {credential.diplomaLevel}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user?.name ?? "Utilisateur"} · {credential.institutionName}
                      {institution ? ` (${INSTITUTION_STATUS_LABELS[institution.status as InstitutionStatus] ?? institution.status})` : ""}
                      {credential.country && credential.country !== "Cameroun" ? ` · ${credential.country}` : ""}
                      {credential.graduationYear ? ` · ${credential.graduationYear}` : ""}
                    </p>
                    {credential.documentUrl && (
                      <a
                        href={credential.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Voir le justificatif
                      </a>
                    )}
                  </div>
                  <span className={cn("shrink-0 text-xs font-medium", badge.tone)}>
                    <badge.icon className="mr-1 inline size-3.5" /> {badge.label}
                  </span>
                  {credential.verificationStatus !== "verifie" && credential.verificationStatus !== "rejete" && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setNewCred({ id: credential._id, decision: "verifie" });
                          setCredNote("");
                        }}
                      >
                        <CheckCircle2 className="mr-1.5 size-3.5" /> Vérifier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => {
                          setNewCred({ id: credential._id, decision: "rejete" });
                          setCredNote("");
                        }}
                      >
                        <XCircle className="mr-1.5 size-3.5" /> Refuser
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ---------- Demandes d'établissements ---------- */}
      <Card className="card-layered">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="size-4 text-primary" /> Demandes « Mon établissement n'est pas dans la liste »
            {pendingRequests.length > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {pendingRequests.length}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            L'utilisateur ne crée jamais d'établissement : après validation, c'est l'admin qui ajoute la ligne au référentiel (§21).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {requests === undefined ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          ) : requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune demande pour le moment.</p>
          ) : (
            requests.map(({ request, user }) => (
              <div key={request._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{request.institutionName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user?.name ?? "Utilisateur"}
                    {request.city ? ` · ${request.city}` : ""}
                    {request.country && request.country !== "Cameroun" ? ` · ${request.country}` : ""}
                    {request.diplomaTitle ? ` · ${request.diplomaTitle}` : ""}
                    {request.graduationYear ? ` · ${request.graduationYear}` : ""}
                  </p>
                  {request.note && (
                    <p className="mt-0.5 truncate text-xs italic text-muted-foreground">« {request.note} »</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    request.status === "APPROVED"
                      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      : request.status === "REJECTED"
                        ? "border-destructive/40 text-destructive"
                        : "border-amber-500/40 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {request.status}
                </Badge>
                {(request.status === "PENDING" || request.status === "UNDER_REVIEW") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      setOpenReq({
                        requestId: request._id,
                        institutionName: request.institutionName,
                        decision: "APPROVED",
                        code: "",
                        institutionType: "PRIVATE_HIGHER_INSTITUTE",
                        ownership: "PRIVATE",
                        region: "CENTRE",
                        city: request.city ?? "",
                        adminNote: "",
                      })
                    }
                  >
                    Instruire
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ---------- Dialog : création d'établissement ---------- */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajouter un établissement au référentiel</DialogTitle>
            <DialogDescription>
              Création réservée à l'administration — la source (MINESUP ou décision) est obligatoire.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex. UY1" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nom complet *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sigle</Label>
              <Input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type *</Label>
              <Select value={form.institutionType} onValueChange={(v) => setForm({ ...form, institutionType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INSTITUTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{INSTITUTION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tutelle *</Label>
              <Select value={form.ownership} onValueChange={(v) => setForm({ ...form, ownership: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNERSHIPS.map((o) => (
                    <SelectItem key={o} value={o}>{OWNERSHIP_LABELS[o]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Région *</Label>
              <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>{REGION_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ville</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Statut d'autorisation</Label>
              <Select value={form.authorizationStatus} onValueChange={(v) => setForm({ ...form, authorizationStatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTHORIZATION_STATUSES.map((a) => (
                    <SelectItem key={a} value={a}>{AUTHORIZATION_STATUS_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Statut de reconnaissance</Label>
              <Select value={form.recognitionStatus} onValueChange={(v) => setForm({ ...form, recognitionStatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECOGNITION_STATUS_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Source *</Label>
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Ex. MINESUP 2025" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>URL source</Label>
              <Input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button
              disabled={busy || form.code.trim().length < 1 || form.name.trim().length < 3 || form.source.trim().length < 2}
              onClick={() =>
                run(async () => {
                  await createInstitution({
                    code: form.code.trim(),
                    name: form.name.trim(),
                    shortName: form.shortName.trim() || undefined,
                    institutionType: form.institutionType as never,
                    ownership: form.ownership as never,
                    region: form.region as never,
                    city: form.city.trim() || undefined,
                    status: "ACTIVE",
                    authorizationStatus: form.authorizationStatus as never,
                    recognitionStatus: form.recognitionStatus as never,
                    source: form.source.trim(),
                    sourceUrl: form.sourceUrl.trim() || undefined,
                    notes: form.notes.trim() || undefined,
                  });
                  setShowCreate(false);
                  setForm({ ...form, code: "", name: "", shortName: "", city: "", notes: "" });
                }, "Établissement ajouté au référentiel")
              }
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog : édition ---------- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Modifier « {editing?.name} »</DialogTitle>
            <DialogDescription>Toute modification est journalisée dans le journal d'audit (§44).</DialogDescription>
          </DialogHeader>
          {editing && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Nom</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Ville</Label>
                  <Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Région</Label>
                  <Select value={editing.region} onValueChange={(v) => setEditing({ ...editing, region: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r} value={r}>{REGION_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Autorisation</Label>
                  <Select value={editing.authorizationStatus} onValueChange={(v) => setEditing({ ...editing, authorizationStatus: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AUTHORIZATION_STATUSES.map((a) => (
                        <SelectItem key={a} value={a}>{AUTHORIZATION_STATUS_LABELS[a]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Reconnaissance</Label>
                  <Select value={editing.recognitionStatus} onValueChange={(v) => setEditing({ ...editing, recognitionStatus: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RECOGNITION_STATUS_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Site web</Label>
                  <Input value={editing.website} onChange={(e) => setEditing({ ...editing, website: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} />
                </div>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Diplômes nationaux : {editing.canIssueNationalDiploma ? "oui" : "non"} · Diplômes privés :{" "}
                {editing.canIssuePrivateDiploma ? "oui" : "non"} (modifiables via le statut).
              </p>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!editing) return;
                  await updateInstitution({
                    institutionId: editing._id as never,
                    name: editing.name.trim(),
                    city: editing.city.trim() || undefined,
                    region: editing.region as never,
                    authorizationStatus: editing.authorizationStatus as never,
                    recognitionStatus: editing.recognitionStatus as never,
                    website: editing.website.trim() || undefined,
                    notes: editing.notes.trim() || undefined,
                  });
                  setEditing(null);
                }, "Établissement mis à jour")
              }
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog : changement de statut ---------- */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Changer le statut — {statusTarget?.name}</DialogTitle>
            <DialogDescription>
              Jamais de suppression : la ligne est conservée avec son historique (§3).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Nouveau statut</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INSTITUTION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{INSTITUTION_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Motif / référence de la décision</Label>
              <Textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={2}
                placeholder="Ex. : Arrêté N°… du MINESUP"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>Annuler</Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!statusTarget) return;
                  await setStatus({
                    institutionId: statusTarget.id as never,
                    status: newStatus as never,
                    reason: statusReason.trim() || undefined,
                  });
                  setStatusTarget(null);
                }, "Statut mis à jour — historique écrit")
              }
            >
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog : décision sur un diplôme ---------- */}
      <Dialog open={!!newCred} onOpenChange={(o) => !o && setNewCred(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newCred?.decision === "verifie" ? "Vérifier le diplôme" : "Refuser le diplôme"}
            </DialogTitle>
            <DialogDescription>
              {newCred?.decision === "verifie"
                ? "Le badge « Diplôme vérifié GTEC PRO » sera attribué au profil technicien."
                : "Le badge passera à « Diplôme non vérifié »."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Note de vérification</Label>
            <Textarea value={credNote} onChange={(e) => setCredNote(e.target.value)} rows={2} placeholder="Ex. : cachet et signature contrôlés" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCred(null)}>Annuler</Button>
            <Button
              disabled={busy}
              className={newCred?.decision === "rejete" ? "" : "halo-amber"}
              onClick={() =>
                run(async () => {
                  if (!newCred) return;
                  await reviewCredential({
                    credentialId: newCred.id as never,
                    decision: newCred.decision as never,
                    note: credNote.trim() || undefined,
                  });
                  setNewCred(null);
                }, newCred?.decision === "verifie" ? "Diplôme vérifié — badge mis à jour" : "Diplôme refusé")
              }
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog : instruction d'une demande ---------- */}
      <Dialog open={!!openReq} onOpenChange={(o) => !o && setOpenReq(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Instruire la demande — {openReq?.institutionName}</DialogTitle>
            <DialogDescription>
              En cas d'approbation, vous créez vous-même la ligne du référentiel (source = demande validée).
            </DialogDescription>
          </DialogHeader>
          {openReq && (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={openReq.decision === "APPROVED" ? "default" : "outline"}
                  onClick={() => setOpenReq({ ...openReq, decision: "APPROVED" })}
                >
                  Approuver
                </Button>
                <Button
                  size="sm"
                  variant={openReq.decision === "UNDER_REVIEW" ? "default" : "outline"}
                  onClick={() => setOpenReq({ ...openReq, decision: "UNDER_REVIEW" })}
                >
                  En cours d'examen
                </Button>
                <Button
                  size="sm"
                  variant={openReq.decision === "REJECTED" ? "destructive" : "outline"}
                  onClick={() => setOpenReq({ ...openReq, decision: "REJECTED" })}
                >
                  Refuser
                </Button>
              </div>
              <Separator />
              {openReq.decision === "APPROVED" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Code *</Label>
                    <Input value={openReq.code} onChange={(e) => setOpenReq({ ...openReq, code: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Type</Label>
                    <Select value={openReq.institutionType} onValueChange={(v) => setOpenReq({ ...openReq, institutionType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INSTITUTION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{INSTITUTION_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Tutelle</Label>
                    <Select value={openReq.ownership} onValueChange={(v) => setOpenReq({ ...openReq, ownership: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OWNERSHIPS.map((o) => (
                          <SelectItem key={o} value={o}>{OWNERSHIP_LABELS[o]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Région</Label>
                    <Select value={openReq.region} onValueChange={(v) => setOpenReq({ ...openReq, region: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REGIONS.map((r) => (
                          <SelectItem key={r} value={r}>{REGION_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Ville</Label>
                    <Input value={openReq.city} onChange={(e) => setOpenReq({ ...openReq, city: e.target.value })} />
                  </div>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label>Note à l'utilisateur</Label>
                <Textarea value={openReq.adminNote} onChange={(e) => setOpenReq({ ...openReq, adminNote: e.target.value })} rows={2} />
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenReq(null)}>Annuler</Button>
            <Button
              disabled={busy || (openReq?.decision === "APPROVED" && openReq.code.trim().length < 1)}
              onClick={() =>
                run(async () => {
                  if (!openReq) return;
                  await reviewRequest({
                    requestId: openReq.requestId as never,
                    decision: openReq.decision as never,
                    adminNote: openReq.adminNote.trim() || undefined,
                    createInstitution:
                      openReq.decision === "APPROVED"
                        ? {
                            code: openReq.code.trim(),
                            institutionType: openReq.institutionType as never,
                            ownership: openReq.ownership as never,
                            region: openReq.region as never,
                            city: openReq.city.trim() || undefined,
                          }
                        : undefined,
                  });
                  setOpenReq(null);
                }, openReq?.decision === "APPROVED" ? "Établissement ajouté au référentiel" : "Demande instruite")
              }
            >
              Confirmer la décision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
