import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Landmark,
  Percent,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Crown,
  Download,
  FileSignature,
  FileText,
  FolderDown,
  ImagePlus,
  Lightbulb,
  Loader2,
  Mail,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Scale,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, StatusBadge } from "@/components/gtec";
import { haversinePositions } from "@/lib/gtec";
import { openDossierPdf, openMaintenancePdf, openMaintenanceReceiptPdf } from "@/lib/invoicePdf";
import { downloadCsv, todayStamp } from "@/lib/csv";
import { ReportForm } from "@/components/ReportForm";
import ServicesCatalog from "@/pages/ServicesCatalog";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CITIES, fcfa, formatDate, formatDateTime, suggestTeam, SERVICES, CONTRACT_STATUS_META, contractFrequencyLabel } from "@/lib/gtec";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";

// ---------- devis : désormais établi par le technicien sur le terrain ----------

function FieldQuoteNotice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-4 text-sm text-muted-foreground">
      <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>
        <span className="font-medium text-foreground">Devis côté terrain.</span>{" "}
        Le technicien affecté à la visite établit le devis sur place ; dès son
        envoi, GTEC le valide automatiquement et le client reçoit le devis à
        accepter. Paiement ensuite en 2 tranches : 50 % avant les travaux, 50 %
        à la fin.
      </p>
    </div>
  );
}

// ---------- affectation d'équipe ----------

function AssignCrew({
  request,
  techs,
}: {
  request: {
    _id: string;
    serviceKey: string;
    city: string;
    coords?: { lat: number; lon: number; accuracy?: number } | null;
  };
  techs: {
    _id: Id<"users">;
    name: string;
    city?: string;
    active?: boolean;
    subscription?: string;
    zones?: string[];
    experienceYears?: number;
    rating?: number;
    verified?: boolean;
    gps?: { lat: number; lon: number };
    gpsAt?: number;
    sharing?: boolean;
  }[];
}) {
  const assignCrew = useMutation(api.gtec.adminAssignCrew);
  // V6 : moteur géo — équipe ≥ 2 proche du chantier, chef choisi sur des
  // critères objectifs (expérience, note client, missions réalisées).
  // GPS client présent : la distance réelle technicien↔chantier remplace la
  // distance ville-à-ville pour les techniciens qui partagent leur position.
  const requestGps = request.coords
    ? { lat: request.coords.lat, lon: request.coords.lon }
    : undefined;
  const distanceOf = (t: (typeof techs)[number]) => {
    if (requestGps && t.gps) return haversinePositions(requestGps, t.gps);
    return null; // distance ville calculée en interne par suggestTeam
  };
  const suggestion = suggestTeam(
    request.serviceKey,
    request.city,
    techs.map((t) => ({
      id: t._id,
      name: t.name,
      city: t.city,
      zones: t.zones,
      specialty: t.city,
      experienceYears: t.experienceYears,
      rating: t.rating,
      active: t.active,
      verified: t.verified,
      gps: t.gps,
    })),
    2,
    requestGps,
  );
  const [leaderId, setLeaderId] = useState<Id<"users"> | null>(
    (suggestion.leaderId as Id<"users">) ?? null,
  );
  const [memberIds, setMemberIds] = useState<Id<"users">[]>(
    suggestion.memberIds as Id<"users">[],
  );
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleMember = (id: Id<"users">) =>
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );

  const submit = async () => {
    if (!leaderId) {
      toast.error("Choisissez un chef d'équipe.");
      return;
    }
    if (memberIds.filter((m) => m !== leaderId).length < 1) {
      toast.error(
        "Équipe impossible : une intervention terrain exige au moins 2 personnes (chef d'équipe + 1 technicien).",
      );
      return;
    }
    const ts = when ? new Date(when).getTime() : Date.now() + 24 * 3600 * 1000;
    if (isNaN(ts)) {
      toast.error("Date d'intervention invalide.");
      return;
    }
    setBusy(true);
    try {
      await assignCrew({
        requestId: request._id as never,
        teamLeaderId: leaderId,
        memberIds,
        scheduledAt: ts,
        notes: notes.trim() || undefined,
      });
      toast.success("Équipe affectée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Users className="size-4 text-primary" /> Affecter une équipe
      </p>
      {techs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun technicien enregistré — ajoutez-en dans l'onglet Techniciens.
        </p>
      ) : (
        <>
          {suggestion.total > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
              {suggestion.reason} — sélection géo automatique (min. 2 personnes,
              chef d'équipe selon expérience, note client et missions réalisées).
            </p>
          )}
          {suggestion.total > 0 && suggestion.total < 2 && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Moins de 2 techniciens disponibles à proximité — élargissez les
              zones ou activez des abonnements pour compléter l'équipe.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Chef d'équipe</Label>
            <Select
              value={leaderId ?? undefined}
              onValueChange={(v) => setLeaderId(v as Id<"users">)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un chef d'équipe" />
              </SelectTrigger>
              <SelectContent>
                {techs.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                    {t.city ? ` — ${t.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Techniciens additionnels</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {techs
                .filter((t) => t._id !== leaderId)
                .map((t) => (
                  <label
                    key={t._id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/70 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <Switch
                      checked={memberIds.includes(t._id)}
                      onCheckedChange={() => toggleMember(t._id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {t.name}
                        {t.active === false && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                            · abonnement expiré
                          </span>
                        )}
                      </span>
                      {(() => {
                        const d = distanceOf(t);
                        return (
                          <span className="block truncate text-xs text-muted-foreground">
                            {t.city}
                            {d !== null && (
                              <span
                                className={
                                  d <= 15
                                    ? "ml-1.5 font-semibold text-emerald-600 dark:text-emerald-400"
                                    : "ml-1.5 text-amber-600 dark:text-amber-400"
                                }
                              >
                                · {d} km GPS
                              </span>
                            )}
                            {t.gps && t.gpsAt && (
                              <span className="ml-1 text-[10px]">
                                (pos. {new Date(t.gpsAt).toLocaleDateString("fr-FR")})
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </span>
                  </label>
                ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <CalendarClock className="size-3.5" /> Date & heure d'intervention
            </Label>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          {techs.some((t) => t.active === false) && (
            <p className="text-xs text-muted-foreground">
              Les techniciens à abonnement expiré sont exclus de la suggestion et
              affichés avec une mention.
            </p>
          )}
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Consignes pour l'équipe (optionnel)"
            rows={2}
          />
          <Button className="halo-amber" disabled={busy} onClick={submit}>
            <CheckCircle2 className="mr-2 size-4" />
            {busy ? "Affectation…" : `Valider l'équipe (${memberIds.length + (leaderId ? 1 : 0)})`}
          </Button>
        </>
      )}
    </div>
  );
}

// ---------- rapport : mutation admin injectée dans le formulaire partagé ----------

function useAdminReportMutation() {
  return useMutation(api.gtec.adminSubmitReport);
}

// ---------- dossier complet d'un candidat technicien ----------

const DOC_KIND_LABELS: Record<string, string> = {
  cni: "Pièce d'identité",
  diploma: "Diplôme",
  certificate: "Certificat",
  attestation: "Attestation",
  other: "Document",
};

function ApplicationRow({
  profile,
  user,
  busy,
  onReview,
}: {
  profile: Doc<"technicianProfiles">;
  user: Doc<"users"> | null;
  busy: boolean;
  onReview: (decision: "verifie" | "rejete", note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [zoomDoc, setZoomDoc] = useState<string | null>(null);

  const identityFields: [string, string][] = [
    ["Nom complet", `${profile.firstName} ${profile.lastName}`],
    ["CNI / Passeport", profile.nationalId],
    ["Téléphone", profile.phone],
    ...(profile.altPhone ? ([["Tél. secondaire", profile.altPhone]] as [string, string][]) : []),
    ["Ville", profile.city],
    ...(profile.address ? ([["Adresse", profile.address]] as [string, string][]) : []),
    ...(profile.gender ? ([["Sexe", profile.gender]] as [string, string][]) : []),
    ...(profile.birthDate ? ([["Naissance", profile.birthDate]] as [string, string][]) : []),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
          {user?.name?.[0] ?? "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {profile.firstName} {profile.lastName}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {profile.specialty} · {profile.experienceYears} an(s)
            </span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {profile.city} · {profile.zones.join(", ")} ·{" "}
            {profile.documents.length} document(s)
            {profile.kycFlag && (
              <span className="ml-1.5 font-semibold text-destructive">
                · ⚠ KYC : {profile.kycFlag}
              </span>
            )}
          </span>
        </span>
        {profile.status !== "en_attente" && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              profile.status === "verifie"
                ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive ring-destructive/20",
            )}
          >
            {profile.status === "verifie" ? "Vérifié" : "Refusé"}
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border/60 px-4 py-4">
          {/* Identité */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Identité
            </p>
            <div className="grid gap-1.5 text-sm sm:grid-cols-2">
              {identityFields.map(([label, value]) => (
                <p key={label}>
                  <span className="text-muted-foreground">{label} : </span>
                  <span className="capitalize">{value}</span>
                </p>
              ))}
            </div>
          </section>

          {/* Profession */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Profession
            </p>
            <div className="grid gap-1.5 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Spécialité : </span>
                {profile.specialty}
              </p>
              {profile.profession && (
                <p>
                  <span className="text-muted-foreground">Métier : </span>
                  {profile.profession}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Expérience : </span>
                {profile.experienceYears} an(s)
              </p>
              {profile.currentEmployer && (
                <p>
                  <span className="text-muted-foreground">Employeur : </span>
                  {profile.currentEmployer}
                </p>
              )}
              {profile.references && (
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Références : </span>
                  {profile.references}
                </p>
              )}
            </div>
          </section>

          {/* Parcours académique */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Parcours académique
            </p>
            <div className="grid gap-1.5 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Dernier diplôme : </span>
                {profile.highestDegree}
              </p>
              {profile.fieldOfStudy && (
                <p>
                  <span className="text-muted-foreground">Filière : </span>
                  {profile.fieldOfStudy}
                </p>
              )}
              {profile.school && (
                <p>
                  <span className="text-muted-foreground">Établissement : </span>
                  {profile.school}
                </p>
              )}
              {profile.graduationYear && (
                <p>
                  <span className="text-muted-foreground">Année : </span>
                  {profile.graduationYear}
                </p>
              )}
            </div>
          </section>

          {/* Documents justificatifs */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documents justificatifs ({profile.documents.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.documents.map((d, i) => (
                <button
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  onClick={() => setZoomDoc(d.url)}
                >
                  <FileText className="size-4 text-primary" />
                  <span className="max-w-48 truncate">
                    {DOC_KIND_LABELS[d.kind] ?? d.label}
                    {d.kind === "other" && d.label ? ` · ${d.label}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {profile.bio && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {profile.bio}
            </p>
          )}

          {/* Décision */}
          {profile.status === "en_attente" ? (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Motif (requis en cas de refus) — ex. : diplôme illisible"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  className="halo-amber"
                  size="sm"
                  disabled={busy}
                  onClick={() => onReview("verifie", "")}
                >
                  <CheckCircle2 className="mr-1.5 size-4" /> Valider le dossier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={busy || note.trim().length < 5}
                  onClick={() => onReview("rejete", note.trim())}
                >
                  <XCircle className="mr-1.5 size-4" /> Refuser (motif requis)
                </Button>
              </div>
            </div>
          ) : (
            profile.reviewNote && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Motif du refus : {profile.reviewNote}
              </p>
            )
          )}
        </div>
      )}

      {/* Visionneuse de document */}
      <Dialog open={!!zoomDoc} onOpenChange={(o) => !o && setZoomDoc(null)}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
          {zoomDoc?.startsWith("data:image/") ? (
            <img src={zoomDoc} alt="Document" className="w-full rounded-lg" />
          ) : (
            <object
              data={zoomDoc ?? ""}
              type="application/pdf"
              className="h-[70vh] w-full rounded-lg"
            >
              <p className="p-4 text-sm text-muted-foreground">
                Aperçu PDF indisponible —{" "}
                <a href={zoomDoc ?? "#"} target="_blank" rel="noreferrer" className="text-primary underline">
                  ouvrir dans un onglet
                </a>
              </p>
            </object>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- panneau admin d'une demande ----------

function AdminRequestRow({
  entry,
  techs,
}: {
  entry: {
    request: {
      _id: string;
      reference: string;
      title: string;
      serviceKey: string;
      status: string;
      description: string;
      address: string;
      city: string;
      scheduledAt?: number;
      coords?: { lat: number; lon: number; accuracy?: number } | null;
    };
    client?: { name?: string; phone?: string; email?: string } | null;
    quote?: {
      _id: string;
      number: string;
      total: number;
      status: string;
      items: { label: string; qty: number; unitPrice: number }[];
    } | null;
    payment?: { _id: string; amount: number; method: string; status: string; payerPhone: string } | null;
    assignment?: { _id: string; status: string } | null;
  };
  techs: { _id: Id<"users">; name: string; city?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const startIntervention = useMutation(api.gtec.adminStartIntervention);
  const { request, client, quote, payment } = entry;

  // Dossier PDF (facture + PV) : chargé uniquement quand le panneau est ouvert.
  const detail = useQuery(
    api.gtec.getRequestDetail,
    open ? ({ requestId: request._id as never }) : "skip",
  );

  const buildDossierPayload = () => {
    if (!detail || !detail.invoice || !detail.report) return null;
    const d = detail;
    const serviceLabel =
      SERVICES.find((s) => s.key === d.request.serviceKey)?.label ??
      d.request.serviceKey;
    const requestPdf = {
      reference: d.request.reference,
      title: d.request.title,
      serviceLabel,
      address: d.request.address,
      city: d.request.city,
      scheduledAt: d.request.scheduledAt,
    };
    const teamPdf = (d.members ?? [])
      .filter((m): m is NonNullable<(typeof d.members)[number]> => !!m)
      .map((m) => ({ name: m.name, role: m.role }));
    const invoice = d.invoice;
    const q = d.quote;
    const report = d.report;
    return {
      invoice: {
        invoiceNumber: invoice.number,
        issuedAt: invoice.issuedAt,
        invoiceStatus: invoice.status,
        clientName: client?.name ?? "Client GTEC",
        clientPhone: client?.phone,
        clientEmail: client?.email,
        clientCity: d.request.city,
        request: requestPdf,
        quote: q
          ? {
              number: q.number,
              items: q.items,
              subtotal: q.subtotal,
              vatRate: q.vatRate,
              total: q.total,
            }
          : undefined,
        payments: ((d.payments ?? []) as Doc<"payments">[]).map((p) => ({
          milestone: p.milestone,
          amount: p.amount,
          method: p.method,
          status: p.status,
          paidAt: p.paidAt,
        })),
        report: {
          workDone: report.workDone,
          warrantyMonths: report.warrantyMonths,
          receivedAt: report.receivedAt,
          clientSignature: report.clientSignature,
        },
        team: teamPdf,
      },
      reception: {
        received: report.status === "receptionne",
        clientName: client?.name ?? "Client GTEC",
        clientPhone: client?.phone,
        clientEmail: client?.email,
        clientCity: d.request.city,
        request: requestPdf,
        team: teamPdf,
        report: {
          workDone: report.workDone,
          partsUsed: report.partsUsed,
          recommendations: report.recommendations,
          beforePhotos: report.beforePhotos,
          afterPhotos: report.afterPhotos,
          warrantyMonths: report.warrantyMonths,
          receivedAt: report.receivedAt,
          receptionNote: report.receptionNote,
          clientSignature: report.clientSignature,
        },
      },
    };
  };

  const actions: React.ReactNode[] = [];
  if (request.status === "nouvelle") actions.push(<FieldQuoteNotice key="q" />);
  if (request.status === "paye" && techs.length > 0)
    actions.push(
      <AssignCrew key="a" request={request} techs={techs} />,
    );
  if (request.status === "affectee")
    actions.push(
      <Button
        key="s"
        className="halo-amber"
        onClick={async () => {
          try {
            await startIntervention({ requestId: request._id as never });
            toast.success("Intervention démarrée");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erreur");
          }
        }}
      >
        <Wrench className="mr-2 size-4" /> Démarrer l'intervention
      </Button>,
    );
  if (request.status === "en_intervention")
    actions.push(
      <ReportForm
        key="r"
        requestId={request._id}
        useReportMutation={useAdminReportMutation}
      />,
    );
  if (request.status === "rapport_emis")
    actions.push(
      <p key="w" className="text-sm text-muted-foreground">
        En attente de la signature du PV par le client.
      </p>,
    );

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="hidden w-24 shrink-0 font-mono text-xs text-muted-foreground sm:block">
          {request.reference}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{request.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {client?.name ?? "Client"} · {request.city}
          </span>
        </span>
        {quote && (
          <span className="hidden shrink-0 text-sm font-medium sm:block">
            {fcfa(quote.total)}
          </span>
        )}
        <StatusBadge status={request.status} className="shrink-0" />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-t border-border/60"
        >
          <div className="flex flex-col gap-4 px-4 py-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Client : </span>
                {client?.name ?? "—"}
                {client?.phone ? ` · ${client.phone}` : ""}
              </p>
              <p>
                <span className="text-muted-foreground">Adresse : </span>
                {request.address}, {request.city}
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Besoin : </span>
                {request.description}
              </p>
            </div>
            {quote && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">Devis {quote.number}</span> ·{" "}
                {fcfa(quote.total)} ·{" "}
                <span className="text-muted-foreground">
                  {quote.items.length} ligne(s) · {quote.status}
                </span>
              </div>
            )}
            {payment && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <Wallet className="size-4 text-primary" />
                <span className="font-medium">{fcfa(payment.amount)}</span>
                <span className="text-muted-foreground">
                  {payment.method} · {payment.payerPhone} · {payment.status}
                </span>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={!detail?.invoice || !detail.report}
                title={
                  !detail?.invoice || !detail.report
                    ? "Disponible dès que la facture est émise et le PV existe"
                    : undefined
                }
                onClick={() => {
                  const payload = buildDossierPayload();
                  if (!payload) {
                    toast.error(
                      "Le dossier n\u00e9cessite une facture émise et un PV de réception.",
                    );
                    return;
                  }
                  try {
                    openDossierPdf(payload, { adminCopy: true });
                  } catch (e) {
                    toast.error(
                      e instanceof Error
                        ? e.message
                        : "Impression impossible \u2014 r\u00e9essayez.",
                    );
                  }
                }}
              >
                <FolderDown className="mr-1.5 size-4" />
                Dossier complet (facture + PV)
              </Button>
            </div>
            <Separator />
            {actions.length > 0 ? (
              actions
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune action admin requise à ce stade.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ---------- console admin ----------

export default function AdminConsole() {
  const { user } = useAuth();
  const stats = useQuery(api.gtec.adminStats);
  const requests = useQuery(api.gtec.adminListRequests);
  const payments = useQuery(api.gtec.adminPendingPayments);
  const contractPays = useQuery(api.gtec.adminPendingContractPayments);
  const allContractPays = useQuery(api.gtec.adminListContractPayments);
  const validateContractPay = useMutation(api.gtec.adminValidateContractPayment);
  const allPayments = useQuery(api.gtec.adminListAllPayments);
  const techs = useQuery(api.gtec.adminListAssignableTechnicians);
  const adminExists = useQuery(api.gtec.adminExists);

  const subPayments = useQuery(api.gtec.adminPendingSubscriptionPayments);
  const payouts = useQuery(api.gtec.adminListPayouts);
  const contracts = useQuery(api.gtec.adminListContracts);
  const clients = useQuery(api.gtec.adminListClients);
  const revenue = useQuery(api.gtec.adminRevenueSeries);

  const claimAdmin = useMutation(api.gtec.claimAdmin);
  const validatePayment = useMutation(api.gtec.adminValidatePayment);
  const rejectPayment = useMutation(api.gtec.adminRejectPayment);
  const validateSubPayment = useMutation(api.gtec.adminValidateSubscriptionPayment);
  const rejectSubPayment = useMutation(api.gtec.adminRejectSubscriptionPayment);
  const markPayoutPaid = useMutation(api.gtec.adminMarkPayoutPaid);
  const seedTechs = useMutation(api.gtec.adminSeedTechnicians);
  const createTech = useMutation(api.gtec.adminCreateTechnician);
  const reviewTechnician = useMutation(api.gtec.adminReviewTechnician);
  const reviewMaterial = useMutation(api.gtec.adminReviewMaterial);
  const seedDemo = useMutation(api.demo.adminSeedDemoContracts);
  const seedMissions = useMutation(api.demo.adminSeedDemoMissions);
  const createContract = useMutation(api.gtec.adminCreateContract);
  const updateContractStatus = useMutation(api.gtec.adminUpdateContractStatus);
  const scheduleVisit = useMutation(api.gtec.adminScheduleContractVisit);
  const assignVisit = useMutation(api.gtec.adminAssignVisit);

  // V6 : retraits (techniciens + admin) et commissions GTEC.
  const withdrawals = useQuery(api.gtec.adminListWithdrawals);
  const commissions = useQuery(api.gtec.adminListCommissions);
  const commissionStats = useQuery(api.gtec.adminCommissionStats);
  const adminWallet = useQuery(api.gtec.myWallet);
  const processWithdrawal = useMutation(api.gtec.adminProcessWithdrawal);
  const validateCommission = useMutation(api.gtec.adminValidateCommission);
  const waiveCommission = useMutation(api.gtec.adminWaiveCommission);
  const adminRequestWithdrawal = useMutation(api.gtec.requestWithdrawal);

  // GTEC PRO 2.0 : litiges, sanctions, audit, rôles admin.
  const disputes = useQuery(api.gtec.adminListDisputes);
  const sanctions = useQuery(api.gtec.adminListSanctions);
  const auditLogs = useQuery(api.gtec.adminAuditLogs);
  const adminAdmins = useQuery(api.gtec.adminListAdmins);
  const resolveDispute = useMutation(api.gtec.adminResolveDispute);
  const issueSanction = useMutation(api.gtec.adminIssueSanction);
  const liftSanction = useMutation(api.gtec.adminLiftSanction);
  const setAdminRole = useMutation(api.gtec.adminSetAdminRole);
  const [disputeNote, setDisputeNote] = useState("");
  const [sanctionTarget, setSanctionTarget] = useState<string>("");
  const [sanctionLevel, setSanctionLevel] = useState<string>("1");
  const [sanctionReason, setSanctionReason] = useState("");
  const [sanctionDays, setSanctionDays] = useState<string>("7");
  const [adminRoleDrafts, setAdminRoleDrafts] = useState<Record<string, string>>({});

  // Exports comptables CSV (commissions 15 % et retraits).
  const exportCommissionsCsv = () => {
    if (!commissions || commissions.length === 0) {
      toast.error("Aucune commission à exporter.");
      return;
    }
    downloadCsv(
      `commissions-gtec-${todayStamp()}.csv`,
      [
        "Commission",
        "Demande",
        "Redevable",
        "Base TTC (FCFA)",
        "Part équipe 90% (FCFA)",
        "Commission GTEC 10% (FCFA)",
        "Statut",
        "Moyen",
        "Numéro payeur",
        "Réf. externe",
        "Payée le",
        "Créée le",
      ],
      commissions.map(({ commission, request, tech }) => [
        commission.breakdown ? commission.breakdown.gtecAmount : commission.amount,
        request?.reference ?? "",
        tech?.name ?? "",
        commission.baseAmount,
        commission.breakdown?.teamAmount ?? "",
        commission.breakdown?.gtecAmount ?? commission.amount,
        commission.status === "payee"
          ? "Encaissée"
          : commission.status === "exoneree"
            ? "Exonérée"
            : "Due",
        commission.method ?? "",
        commission.payerPhone ?? "",
        commission.externalRef ?? "",
        commission.paidAt ? new Date(commission.paidAt).toLocaleString("fr-FR") : "",
        new Date(commission._creationTime).toLocaleString("fr-FR"),
      ]),
    );
    toast.success(`${commissions.length} commission(s) exportée(s).`);
  };

  const exportWithdrawalsCsv = () => {
    if (!withdrawals || withdrawals.length === 0) {
      toast.error("Aucun retrait à exporter.");
      return;
    }
    downloadCsv(
      `retraits-gtec-${todayStamp()}.csv`,
      [
        "Référence",
        "Bénéficiaire",
        "Type",
        "Montant (FCFA)",
        "Moyen",
        "Destination",
        "Statut",
        "Demandé le",
        "Traité le",
        "Note",
      ],
      withdrawals.map(({ withdrawal, user }) => [
        withdrawal.reference,
        user?.name ?? "",
        withdrawal.sourceRole === "admin" ? "Administration (commissions)" : "Technicien (gains)",
        withdrawal.amount,
        withdrawal.method,
        withdrawal.destination,
        withdrawal.status === "demande"
          ? "Demandé"
          : withdrawal.status === "approuve"
            ? "Approuvé"
            : withdrawal.status === "payee"
              ? "Payé"
              : "Refusé",
        new Date(withdrawal.requestedAt).toLocaleString("fr-FR"),
        withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleString("fr-FR") : "",
        withdrawal.note ?? "",
      ]),
    );
    toast.success(`${withdrawals.length} retrait(s) exporté(s).`);
  };

  const missionStatusLabel = (s: string) =>
    ({
      nouvelle: "Nouvelle",
      devis_emis: "Devis émis",
      devis_accepte: "Devis accepté",
      paye: "Payée",
      affectee: "Affectée",
      en_intervention: "En intervention",
      rapport_emis: "Rapport transmis",
      terminee: "Terminée",
      annulee: "Annulée",
    })[s] ?? s;

  const methodShortLabel = (m: string) =>
    ({
      mtn_momo: "MTN MoMo",
      orange_money: "Orange Money",
      especes: "Espèces",
      virement: "Virement",
      carte_visa: "Carte Visa",
    })[m] ?? m;

  const exportMissionsCsv = () => {
    if (!requests || requests.length === 0) {
      toast.error("Aucune mission à exporter.");
      return;
    }
    downloadCsv(
      `missions-gtec-${todayStamp()}.csv`,
      [
        "Référence",
        "Titre",
        "Client",
        "Téléphone client",
        "Ville",
        "Adresse",
        "Pôle",
        "Statut",
        "Devis n°",
        "Total TTC (FCFA)",
        "Dernier paiement",
        "Affectation",
        "Créée le",
      ],
      requests.map(({ request, client, quote, payment, assignment }) => [
        request.reference,
        request.title,
        client?.name ?? "",
        client?.phone ?? "",
        request.city,
        request.address,
        SERVICES.find((s) => s.key === request.serviceKey)?.label ?? request.serviceKey,
        missionStatusLabel(request.status),
        quote?.number ?? "",
        quote?.total ?? "",
        payment ? `${methodShortLabel(payment.method)} · ${fcfa(payment.amount)}` : "",
        assignment?.status ?? "",
        new Date(request._creationTime).toLocaleString("fr-FR"),
      ]),
    );
    toast.success(`${requests.length} mission(s) exportée(s).`);
  };

  const exportPaymentsCsv = () => {
    if (!allPayments || allPayments.length === 0) {
      toast.error("Aucun paiement à exporter.");
      return;
    }
    downloadCsv(
      `paiements-gtec-${todayStamp()}.csv`,
      [
        "Tranche",
        "Demande",
        "Client",
        "Montant (FCFA)",
        "Moyen",
        "Numéro payeur",
        "Statut",
        "Réf. externe",
        "Encaissé le",
        "Créé le",
      ],
      allPayments.map(({ payment, request, client }) => [
        payment.milestone === "avance"
          ? "Avance (50 %)"
          : payment.milestone === "solde"
            ? "Solde (50 %)"
            : "Complet",
        request?.reference ?? "",
        client?.name ?? "",
        payment.amount,
        methodShortLabel(payment.method),
        payment.payerPhone,
        payment.status === "valide"
          ? "Validé"
          : payment.status === "echoue"
            ? "Échoué"
            : "En attente",
        payment.externalRef ?? "",
        payment.paidAt ? new Date(payment.paidAt).toLocaleString("fr-FR") : "",
        new Date(payment._creationTime).toLocaleString("fr-FR"),
      ]),
    );
    toast.success(`${allPayments.length} paiement(s) exporté(s).`);
  };

  // Export comptable CSV des mensualités de contrats de maintenance.
  const exportContractPaysCsv = () => {
    if (!allContractPays || allContractPays.length === 0) {
      toast.error("Aucune mensualité à exporter.");
      return;
    }
    downloadCsv(
      `mensualites-gtec-${todayStamp()}.csv`,
      [
        "Contrat",
        "Intitulé",
        "Pôle",
        "Client",
        "Échéance",
        "Période début",
        "Période fin",
        "Montant (FCFA)",
        "Moyen",
        "Numéro payeur",
        "Réf. externe",
        "Statut",
        "Encaissée le",
        "Déclarée le",
      ],
      allContractPays.map(({ payment, contract, client }) => [
        contract?.reference ?? "",
        contract?.title ?? "",
        contract
          ? (SERVICES.find((sv) => sv.key === contract.serviceKey)?.label ??
            contract.serviceKey)
          : "",
        client?.name ?? "",
        payment.periodIndex,
        formatDate(payment.periodStart),
        formatDate(payment.periodEnd),
        payment.amount,
        methodShortLabel(payment.method),
        payment.payerPhone,
        payment.externalRef ?? "",
        payment.status === "valide"
          ? "Encaissée"
          : payment.status === "echoue"
            ? "Échouée"
            : "En attente",
        payment.validatedAt
          ? new Date(payment.validatedAt).toLocaleString("fr-FR")
          : "",
        new Date(payment._creationTime).toLocaleString("fr-FR"),
      ]),
    );
    toast.success(`${allContractPays.length} mensualité(s) exportée(s).`);
  };
  const [wdAmount, setWdAmount] = useState("");
  const [wdMethod, setWdMethod] = useState("mtn_momo");
  const [wdDestination, setWdDestination] = useState("");

  // V5 : statut de la file d'e-mails (Resend)
  const adminEmails = useQuery(api.emails.adminListEmails);
  const flushEmails = useAction(api.emails.flushEmails);
  const retryEmail = useMutation(api.emails.adminRetryEmail);
  const [sendingEmails, setSendingEmails] = useState(false);
  const pendingEmailCount = (adminEmails ?? []).filter(
    (e) => !e.sentAt && !e.error,
  ).length;
  const handleFlushEmails = async () => {
    setSendingEmails(true);
    try {
      const res = await flushEmails();
      toast.success(
        res.sent > 0
          ? `${res.sent} e-mail(s) envoyé(s).`
          : res.skipped
            ? `File non traitée : ${res.skipped}.`
            : "Aucun e-mail en attente.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSendingEmails(false);
    }
  };

  const applications = useQuery(api.gtec.adminListApplications);
  const materials = useQuery(api.gtec.listMaterialRequests);
  const pendingApps =
    applications?.filter((a) => a.profile.status === "en_attente") ?? [];

  const [techName, setTechName] = useState("");
  const [techSpecialty, setTechSpecialty] = useState("");
  const [techPhone, setTechPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [proofZoom, setProofZoom] = useState<string | null>(null);
  const [receiptHistory, setReceiptHistory] = useState(false);

  const openAdminReceipt = (index: number) => {
    const row = (allContractPays ?? [])[index];
    if (!row) return;
    const { payment, contract, client } = row;
    if (!contract || !client) {
      toast.error("Contrat ou client introuvable pour cette mensualité.");
      return;
    }
    try {
      openMaintenanceReceiptPdf({
        payment: {
          periodIndex: payment.periodIndex,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
          amount: payment.amount,
          method: payment.method,
          payerPhone: payment.payerPhone,
          status: payment.status,
          validatedAt: payment.validatedAt,
          externalRef: payment.externalRef,
          bankRef: payment.bankRef,
          bankName: payment.bankName,
        },
        contract: {
          reference: contract.reference,
          title: contract.title,
          serviceLabel:
            SERVICES.find((sv) => sv.key === contract.serviceKey)?.label ??
            contract.serviceKey,
          frequencyLabel: contractFrequencyLabel(contract.frequency),
          city: contract.city,
          address: contract.address,
          monthlyAmount: contract.monthlyAmount,
          startDate: contract.startDate,
          endDate: contract.endDate,
        },
        clientName: client.companyName ?? client.name ?? "Client GTEC",
        clientPhone: client.phone ?? undefined,
        clientEmail: client.email ?? undefined,
        clientAddress: client.address ?? undefined,
        clientCity: client.city ?? contract.city,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Impression impossible — réessayez.",
      );
    }
  };
  const [showContractForm, setShowContractForm] = useState(false);
  const [ctrClient, setCtrClient] = useState("");
  const [ctrService, setCtrService] = useState("solaire");
  const [ctrTitle, setCtrTitle] = useState("");
  const [ctrFrequency, setCtrFrequency] = useState("trimestriel");
  const [ctrAmount, setCtrAmount] = useState("50000");
  const [ctrCity, setCtrCity] = useState("Douala");
  const [ctrAddress, setCtrAddress] = useState("");
  const [ctrMonths, setCtrMonths] = useState("12");

  const pendingSubs = subPayments ?? [];
  const pendingPayouts = (payouts ?? []).filter((p) => p.payout.status === "dû");

  const techList = (techs ?? []).map((t) => ({
    _id: t._id,
    name: t.name ?? "Technicien",
    city: t.city,
    active: t.active,
    subscription: t.subscription,
  }));

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

  // Pas encore d'admin : pilote V1 — le premier compte peut se déclarer admin.
  if (adminExists === false) {
    return (
      <AppShell adminArea>
        <Card className="card-layered mx-auto max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <CardTitle className="font-display text-xl">
              Initialiser la console GTEC
            </CardTitle>
            <CardDescription>
              Aucun administrateur n'existe encore. Le premier compte qui
              initialise la console devient l'administration GTEC PRO.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="halo-amber w-full"
              disabled={busy}
              onClick={() =>
                run(() => claimAdmin(), "Vous êtes maintenant administrateur GTEC")
              }
            >
              <BadgeCheck className="mr-2 size-4" />
              Devenir l'administrateur GTEC
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const isAdmin = user?.role === "admin";
  if (isAdmin === false) {
    return (
      <AppShell adminArea>
        <Card className="card-layered mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <XCircle className="size-10 text-destructive" />
            <p className="font-display text-lg font-semibold">Accès réservé</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cette console est réservée à l'administration GTEC PRO.
            </p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell adminArea>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Console GTEC
          </p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight">
            Administration
          </h1>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Missions", value: stats?.total ?? "—" },
            { label: "En cours", value: stats?.open ?? "—" },
            { label: "Terminées", value: stats?.done ?? "—" },
            { label: "Annulées", value: stats?.cancelled ?? "—" },
            { label: "Factures", value: stats?.invoices ?? "—" },
            {
              label: "Encaissé",
              value: stats ? fcfa(stats.revenue) : "—",
            },
          ].map(({ label, value }) => (
            <Card key={label} className="card-layered">
              <CardContent className="px-4 py-3.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="font-display mt-1 truncate text-lg font-bold">
                  {value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="missions">
          <TabsList>
            <TabsTrigger value="missions">
              <Wrench className="mr-1.5 size-4" /> Missions
            </TabsTrigger>
            <TabsTrigger value="paiements">
              <Wallet className="mr-1.5 size-4" /> Paiements
              {(payments?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {payments?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="abonnements">
              <Crown className="mr-1.5 size-4" /> Abonnements
              {pendingSubs.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {pendingSubs.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="remunerations">
              <Banknote className="mr-1.5 size-4" /> Rémunérations
              {pendingPayouts.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {pendingPayouts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="retraits">
              <Landmark className="mr-1.5 size-4" /> Retraits
              {(withdrawals?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {withdrawals?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="commissions">
              <Percent className="mr-1.5 size-4" /> Commissions 10 %
            </TabsTrigger>
            <TabsTrigger value="litiges">
              <Scale className="mr-1.5 size-4" /> Litiges
              {(disputes?.filter((d) => d.dispute.status === "ouverte" || d.dispute.status === "en_cours").length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {disputes?.filter((d) => d.dispute.status === "ouverte" || d.dispute.status === "en_cours").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sanctions">
              <ShieldAlert className="mr-1.5 size-4" /> Sanctions
            </TabsTrigger>
            <TabsTrigger value="audit">
              <ScrollText className="mr-1.5 size-4" /> Audit
            </TabsTrigger>
            <TabsTrigger value="acces-admin">
              <ShieldCheck className="mr-1.5 size-4" /> Accès admin
            </TabsTrigger>
            <TabsTrigger value="techniciens">
              <Users className="mr-1.5 size-4" /> Techniciens
            </TabsTrigger>
            <TabsTrigger value="verification">
              <UserCheck className="mr-1.5 size-4" /> Vérification
              {pendingApps.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {pendingApps.length}
                </span>
              )}
            </TabsTrigger>
              <TabsTrigger value="mensualites">
                <FileSignature className="mr-1.5 size-4" /> Mensualités
                {(contractPays?.length ?? 0) > 0 && (
                  <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {contractPays?.length}
                  </span>
                )}
              </TabsTrigger>
            <TabsTrigger value="materiel">
              <Package className="mr-1.5 size-4" /> Matériel
              {(materials?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {materials?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="contrats">
              <FileSignature className="mr-1.5 size-4" /> Contrats
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-1.5 size-4" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="services">
              <Sparkles className="mr-1.5 size-4" /> Services
            </TabsTrigger>
            <TabsTrigger value="emails">
              <Mail className="mr-1.5 size-4" /> E-mails
              {pendingEmailCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {pendingEmailCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Missions */}
          <TabsContent value="missions" className="mt-4">
            <div className="mb-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={(requests?.length ?? 0) === 0}
                onClick={exportMissionsCsv}
              >
                <Download className="mr-1.5 size-4" />
                Export CSV (missions)
              </Button>
            </div>
            {requests === undefined ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Sparkles className="size-8 text-muted-foreground" />
                  <p className="font-display text-lg font-semibold">
                    Aucune mission pour le moment
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Les demandes clients apparaîtront ici avec devis, paiement et
                    affectation.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {requests.map((entry) => (
                  <AdminRequestRow
                    key={entry.request._id}
                    entry={{
                      request: entry.request,
                      client: entry.client,
                      quote: entry.quote,
                      payment: entry.payment,
                      assignment: entry.assignment,
                    }}
                    techs={techList}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Paiements */}
          <TabsContent value="paiements" className="mt-4">
            <div className="mb-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={(allPayments?.length ?? 0) === 0}
                onClick={exportPaymentsCsv}
              >
                <Download className="mr-1.5 size-4" />
                Export CSV (tous les paiements)
              </Button>
            </div>
            {payments === undefined ? (
              <div className="h-32 animate-pulse rounded-xl bg-muted" />
            ) : payments.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucun paiement en attente de vérification.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {payments.map(({ payment, request, client }) => (
                  <Card key={payment._id} className="card-layered">
                    <CardContent className="flex flex-wrap items-center gap-4 py-4">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Wallet className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {fcfa(payment.amount)} · {request?.reference}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {client?.name ?? "Client"} · {payment.method} ·{" "}
                          {payment.payerPhone}
                        </p>
                        {(payment.method === "especes" ||
                          payment.method === "virement" ||
                          payment.method === "carte_visa") && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {payment.method === "especes" &&
                              "Espèces — preuve photo jointe"}
                            {payment.method === "virement" &&
                              `Virement ${payment.bankName ?? ""} · réf. ${payment.bankRef ?? "—"}`}
                            {payment.method === "carte_visa" &&
                              `Carte •••• ${payment.cardLast4 ?? "—"}`}
                          </p>
                        )}
                      </div>
                      {payment.proofPhotoUrl && (
                        <button
                          className="shrink-0"
                          onClick={() => setProofZoom(payment.proofPhotoUrl ?? null)}
                          title="Voir la preuve"
                        >
                          <img
                            src={payment.proofPhotoUrl}
                            alt="Preuve de paiement"
                            className="size-12 rounded-lg object-cover ring-1 ring-border transition-opacity hover:opacity-80"
                          />
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          className="halo-amber"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => validatePayment({ paymentId: payment._id as never }),
                              "Paiement validé",
                            )
                          }
                        >
                          <CheckCircle2 className="mr-1.5 size-4" />
                          Valider
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                rejectPayment({
                                  paymentId: payment._id as never,
                                  reason: "Paiement non retrouvé / non abouti",
                                }),
                              "Paiement marqué échoué",
                            )
                          }
                        >
                          <XCircle className="mr-1.5 size-4" />
                          Échec
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Vérification des candidatures */}
          <TabsContent value="verification" className="mt-4">
            {applications === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : applications.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucune candidature technicien pour le moment.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {applications.map(({ profile, user }) => (
                  <ApplicationRow
                    key={profile._id}
                    profile={profile}
                    user={user}
                    busy={busy}
                    onReview={(decision, note) =>
                      run(
                        () =>
                          reviewTechnician({
                            profileId: profile._id as never,
                            decision,
                            note: note || undefined,
                          }),
                        decision === "verifie"
                          ? "Technicien vérifié — il reçoit maintenant des missions"
                          : "Candidature refusée",
                      )
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Demandes de matériel */}
          <TabsContent value="materiel" className="mt-4">
            {materials === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : materials.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucune demande de matériel en attente.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {materials.map(({ material, request, requester }) => (
                  <Card key={material._id} className="card-layered">
                    <CardContent className="flex flex-wrap items-center gap-4 py-4">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Package className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {material.label} × {material.qty}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {request?.reference}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Demandé par {requester?.name ?? "technicien"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="halo-amber"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                reviewMaterial({
                                  materialId: material._id as never,
                                  decision: "commande",
                                }),
                              "Matériel commandé",
                            )
                          }
                        >
                          <CheckCircle2 className="mr-1.5 size-4" /> Commander
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                reviewMaterial({
                                  materialId: material._id as never,
                                  decision: "refuse",
                                }),
                              "Demande refusée",
                            )
                          }
                        >
                          <XCircle className="mr-1.5 size-4" /> Refuser
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Contrats de maintenance */}
          <TabsContent value="contrats" className="mt-4">
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              {(requests ?? []).length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => seedMissions(),
                      "Missions de démonstration créées : 4 cycles complets",
                    )
                  }
                >
                  <Wrench className="mr-1.5 size-4" /> Missions de démo
                </Button>
              )}
              {(contracts ?? []).length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => seedDemo(),
                      "Données de démonstration créées : 4 contrats, 12 visites",
                    )
                  }
                >
                  <Sparkles className="mr-1.5 size-4" /> Contrats de démo
                </Button>
              )}
              <Button size="sm" onClick={() => setShowContractForm((v) => !v)}>
                <Plus className="mr-1.5 size-4" /> Nouveau contrat
              </Button>
            </div>
            {showContractForm && (
              <Card className="card-layered mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Créer un contrat de maintenance</CardTitle>
                  <CardDescription>
                    Toutes les visites périodiques sont planifiées automatiquement
                    selon la fréquence choisie.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Client</Label>
                    <Select value={ctrClient} onValueChange={setCtrClient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un client" />
                      </SelectTrigger>
                      <SelectContent>
                        {(clients ?? []).map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Pôle couvert</Label>
                    <Select value={ctrService} onValueChange={setCtrService}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICES.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label className="text-xs">Objet du contrat</Label>
                    <Input
                      value={ctrTitle}
                      onChange={(e) => setCtrTitle(e.target.value)}
                      placeholder="Ex. : Entretien préventif climatisation — siège"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Fréquence</Label>
                    <Select value={ctrFrequency} onValueChange={setCtrFrequency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensuel">Mensuel</SelectItem>
                        <SelectItem value="trimestriel">Trimestriel</SelectItem>
                        <SelectItem value="semestriel">Semestriel</SelectItem>
                        <SelectItem value="annuel">Annuel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Montant par visite (FCFA)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={ctrAmount}
                      onChange={(e) => setCtrAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Ville</Label>
                    <Select value={ctrCity} onValueChange={setCtrCity}>
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
                    <Label className="text-xs">Adresse d'intervention</Label>
                    <Input
                      value={ctrAddress}
                      onChange={(e) => setCtrAddress(e.target.value)}
                      placeholder="Quartier, rue, repère"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Durée (mois)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={36}
                      value={ctrMonths}
                      onChange={(e) => setCtrMonths(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Button
                      className="halo-amber"
                      disabled={
                        busy ||
                        !ctrClient ||
                        !ctrTitle.trim() ||
                        !ctrAddress.trim() ||
                        Number(ctrAmount) <= 0
                      }
                      onClick={() =>
                        run(async () => {
                          await createContract({
                            clientId: ctrClient as never,
                            serviceKey: ctrService,
                            title: ctrTitle.trim(),
                            frequency: ctrFrequency as
                              | "mensuel"
                              | "trimestriel"
                              | "semestriel"
                              | "annuel",
                            monthlyAmount: Number(ctrAmount),
                            city: ctrCity,
                            address: ctrAddress.trim(),
                            months: Number(ctrMonths) || 12,
                          });
                          setShowContractForm(false);
                          setCtrTitle("");
                          setCtrAddress("");
                        }, "Contrat créé — visites planifiées")
                      }
                    >
                      <FileSignature className="mr-1.5 size-4" /> Créer le contrat
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {contracts === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : contracts.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucun contrat de maintenance. Créez-en un pour un client
                  entreprise ou particulier.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {contracts.map(({ contract, clientName, clientPhone, visits }) => {
                  const meta =
                    CONTRACT_STATUS_META[contract.status] ??
                    CONTRACT_STATUS_META.actif;
                  const nextVisit = visits.find((v) => v.status === "planifiee");
                  return (
                    <Card key={contract._id} className="card-layered">
                      <CardContent className="flex flex-col gap-3 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                              <FileSignature className="size-4 text-primary" />
                              {contract.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {contract.reference} · {clientName}
                              {clientPhone ? ` · ${clientPhone}` : ""} ·{" "}
                              {contract.city}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                try {
                                  openMaintenancePdf({
                                    contract: {
                                      reference: contract.reference,
                                      title: contract.title,
                                      serviceLabel:
                                        SERVICES.find((s) => s.key === contract.serviceKey)
                                          ?.label ?? contract.serviceKey,
                                      description: contract.description,
                                      frequencyLabel: contractFrequencyLabel(contract.frequency),
                                      city: contract.city,
                                      address: contract.address,
                                      monthlyAmount: contract.monthlyAmount,
                                      status: contract.status,
                                      startDate: contract.startDate,
                                      endDate: contract.endDate,
                                    },
                                    clientName,
                                    clientPhone,
                                    clientAddress: contract.address,
                                    clientCity: contract.city,
                                    visits: visits.map((v) => ({
                                      scheduledAt: v.scheduledAt,
                                      doneAt: v.doneAt,
                                      status: v.status,
                                      report: v.report,
                                    })),
                                  });
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error
                                      ? e.message
                                      : "Impression impossible \u2014 r\u00e9essayez.",
                                  );
                                }
                              }}
                            >
                              <Download className="mr-1.5 size-4" />
                              Facture PDF
                            </Button>
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-2 text-xs sm:grid-cols-4">
                          <div className="rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-muted-foreground">Pôle</p>
                            <p className="font-medium">
                              {SERVICES.find((s) => s.key === contract.serviceKey)?.label ??
                                contract.serviceKey}
                            </p>
                          </div>
                          <div className="rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-muted-foreground">Périodicité</p>
                            <p className="font-medium">
                              {contractFrequencyLabel(contract.frequency)} ·{" "}
                              {fcfa(contract.monthlyAmount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-muted-foreground">Prochaine visite</p>
                            <p className="font-medium">
                              {nextVisit ? formatDate(nextVisit.scheduledAt) : "—"}
                            </p>
                          </div>
                          <div className="rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-muted-foreground">Fin</p>
                            <p className="font-medium">{formatDate(contract.endDate)}</p>
                          </div>
                        </div>
                        {visits.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {visits
                              .slice()
                              .reverse()
                              .slice(0, 5)
                              .map((v) => (
                                <div
                                  key={v._id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-1.5 text-xs"
                                >
                                  <span className="flex items-center gap-2">
                                    <CalendarClock
                                      className={cn(
                                        "size-3.5",
                                        v.status === "faite"
                                          ? "text-primary"
                                          : v.status === "planifiee"
                                            ? "text-muted-foreground"
                                            : "text-destructive",
                                      )}
                                    />
                                    <span className="font-medium">
                                      {formatDate(v.scheduledAt)}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {v.status === "faite"
                                        ? "Faite"
                                        : v.status === "planifiee"
                                          ? "Planifiée"
                                          : "Annulée"}
                                    </span>
                                  </span>
                                  {v.status === "faite" && v.report ? (
                                    <span className="max-w-[55%] truncate text-muted-foreground">
                                      {v.report}
                                    </span>
                                  ) : v.status === "planifiee" ? (
                                    <div className="flex items-center gap-1.5">
                                      <Select
                                        value={v.assignedTeamLeaderId ?? ""}
                                        onValueChange={(val) =>
                                          val &&
                                          run(
                                            () =>
                                              assignVisit({
                                                visitId: v._id as never,
                                                teamLeaderId: val as never,
                                              }),
                                            "Chef d'équipe assigné",
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-7 w-40 text-xs">
                                          <SelectValue placeholder="Assigner chef d'équipe" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {techList.map((t) => (
                                            <SelectItem key={t._id} value={t._id}>
                                              {t.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        disabled={busy}
                                        onClick={() => {
                                          const dateStr = window.prompt(
                                            "Replanifier la visite (AAAA-MM-JJ) :",
                                            new Date(v.scheduledAt)
                                              .toISOString()
                                              .slice(0, 10),
                                          );
                                          if (!dateStr) return;
                                          const ts = new Date(dateStr).getTime();
                                          if (Number.isNaN(ts)) {
                                            toast.error("Date invalide");
                                            return;
                                          }
                                          void run(
                                            () =>
                                              scheduleVisit({
                                                contractId: contract._id as never,
                                                scheduledAt: ts,
                                              }),
                                            "Visite ajoutée",
                                          );
                                        }}
                                      >
                                        + Visite
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                          </div>
                        )}
                        {contract.status === "actif" && (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    updateContractStatus({
                                      contractId: contract._id as never,
                                      status: "suspendu",
                                    }),
                                  "Contrat suspendu",
                                )
                              }
                            >
                              Suspendre
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    updateContractStatus({
                                      contractId: contract._id as never,
                                      status: "resilie",
                                    }),
                                  "Contrat résilié",
                                )
                              }
                            >
                              Résilier
                            </Button>
                          </div>
                        )}
                        {contract.status === "suspendu" && (
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    updateContractStatus({
                                      contractId: contract._id as never,
                                      status: "actif",
                                    }),
                                  "Contrat réactivé",
                                )
                              }
                            >
                              Réactiver
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-4">
            {revenue === undefined ? (
              <div className="h-64 animate-pulse rounded-xl bg-muted" />
            ) : (
              <div className="flex flex-col gap-4">
                <Card className="card-layered">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Encaissements validés — 6 derniers mois
                    </CardTitle>
                    <CardDescription>
                      Montants cumulés par mois (tous moyens de paiement).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenue.months}>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                          <XAxis dataKey="label" fontSize={12} stroke="currentColor" opacity={0.7} />
                          <YAxis
                            fontSize={12}
                            stroke="currentColor"
                            opacity={0.7}
                            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                          />
                          <ReTooltip
                            formatter={(v: number | string) => [fcfa(Number(v)), "Encaissé"]}
                            contentStyle={{
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.1)",
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card className="card-layered">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Services les plus demandés</CardTitle>
                    <CardDescription>Répartition des demandes par pôle.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {revenue.services.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        Aucune demande enregistrée.
                      </p>
                    ) : (
                      revenue.services.map((s) => {
                        const total =
                          revenue.services.reduce((acc, x) => acc + x.count, 0) || 1;
                        const pct = Math.round((s.count / total) * 100);
                        return (
                          <div key={s.key} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">
                                {SERVICES.find((x) => x.key === s.key)?.label ?? s.key}
                              </span>
                              <span className="text-muted-foreground">
                                {s.count} demandes · {pct}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${Math.max(4, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Abonnements techniciens */}
          {/* Catalogue de services dynamique (§4) */}
          <TabsContent value="services" className="mt-4">
            <ServicesCatalog />
          </TabsContent>
          {/* File d'e-mails transactionnels (Resend) — V5 */}
          <TabsContent value="emails" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "En attente", value: adminEmails?.filter((e) => !e.sentAt && !e.error).length ?? 0, tone: "text-amber-600 dark:text-amber-400" },
                  { label: "Échecs", value: adminEmails?.filter((e) => !!e.error).length ?? 0, tone: "text-destructive" },
                  { label: "Envoyés (150 dern.)", value: adminEmails?.filter((e) => !!e.sentAt).length ?? 0, tone: "text-emerald-600 dark:text-emerald-400" },
                ].map(({ label, value, tone }) => (
                  <Card key={label} className="card-layered">
                    <CardContent className="px-4 py-3.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p className={cn("font-display mt-1 text-lg font-bold", tone)}>{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={sendingEmails} onClick={() => void handleFlushEmails()}>
                  {sendingEmails ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Mail className="mr-1.5 size-4" />
                  )}
                  Envoyer les e-mails en attente
                </Button>
                {adminEmails?.some((e) => !e.sentAt && !e.error) ? null : (
                  <span className="text-xs text-muted-foreground">
                    La file se vide aussi automatiquement à l'ouverture de chaque espace.
                  </span>
                )}
              </div>

              {adminEmails === undefined ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : adminEmails === null ? (
                <Card className="card-layered">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Réservé à l'administration.
                  </CardContent>
                </Card>
              ) : adminEmails.length === 0 ? (
                <Card className="card-layered">
                  <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                    <Mail className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Aucun e-mail dans la file — les notifications du parcours y
                      apparaissent automatiquement.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {adminEmails.map((email) => (
                    <div
                      key={email._id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full",
                          email.error
                            ? "bg-destructive/10 text-destructive"
                            : email.sentAt
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {email.error ? (
                          <XCircle className="size-4" />
                        ) : email.sentAt ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <Mail className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{email.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {email.userName ?? "Utilisateur"} · {email.to} ·{" "}
                          <span className="uppercase">{email.kind}</span>
                          {email.sentAt
                            ? ` · envoyé le ${formatDateTime(email.sentAt)}`
                            : ""}
                        </p>
                        {email.error && (
                          <p className="mt-1 line-clamp-2 text-xs text-destructive">
                            {email.error}
                          </p>
                        )}
                      </div>
                      {email.error && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            retryEmail({ emailId: email._id as never })
                          }
                        >
                          <RefreshCw className="mr-1.5 size-4" /> Réessayer
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="abonnements" className="mt-4">
            {subPayments === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : pendingSubs.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucun paiement d'abonnement en attente de vérification.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {pendingSubs.map(({ payment, tech }) => (
                  <Card key={payment._id} className="card-layered">
                    <CardContent className="flex flex-wrap items-center gap-4 py-4">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Crown className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {fcfa(payment.amount)} · abonnement {payment.plan}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {tech?.name ?? "Technicien"} · {payment.method} ·{" "}
                          {payment.payerPhone}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="halo-amber"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                validateSubPayment({
                                  paymentId: payment._id as never,
                                }),
                              "Abonnement activé",
                            )
                          }
                        >
                          <CheckCircle2 className="mr-1.5 size-4" /> Valider
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                rejectSubPayment({
                                  paymentId: payment._id as never,
                                  reason: "Paiement non retrouvé",
                                }),
                              "Paiement marqué échoué",
                            )
                          }
                        >
                          <XCircle className="mr-1.5 size-4" /> Échec
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Mensualités des contrats de maintenance */}
          <TabsContent value="mensualites" className="mt-4">
            <div className="mb-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!allContractPays || allContractPays.length === 0}
                onClick={exportContractPaysCsv}
              >
                <Download className="mr-1.5 size-4" />
                Export CSV (mensualités)
              </Button>
              {(allContractPays ?? []).some(
                (p) => p.payment.status !== "en_attente",
              ) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReceiptHistory((v) => !v)}
                >
                  <Receipt className="mr-1.5 size-4" />
                  {receiptHistory ? "Masquer l'historique" : "Historique & reçus"}
                </Button>
              )}
            </div>
            {receiptHistory && (
              <div className="mb-4 flex flex-col gap-2">
                <h3 className="font-display text-sm font-semibold text-muted-foreground">
                  Mensualités traitées
                </h3>
                {(allContractPays ?? [])
                  .filter((p) => p.payment.status !== "en_attente")
                  .map((row, idx) => {
                    const index = (allContractPays ?? []).indexOf(row);
                    return (
                      <div
                        key={row.payment._id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                      >
                        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Receipt className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {fcfa(row.payment.amount)} · {row.contract?.reference} —
                            échéance n°{row.payment.periodIndex}
                            {row.client ? ` · ${row.client.name ?? "Client"}` : ""}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.payment.status === "valide"
                              ? row.payment.validatedAt
                                ? `Encaissée le ${formatDateTime(row.payment.validatedAt)}`
                                : "Encaissée"
                              : "Paiement non abouti"}
                            {` · ${row.payment.method}`}
                            {row.payment.externalRef ? ` · réf. ${row.payment.externalRef}` : ""}
                          </p>
                        </div>
                        <span
                          className={
                            row.payment.status === "valide"
                              ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400"
                              : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400"
                          }
                        >
                          {row.payment.status === "valide" ? "Encaissée" : "Échouée"}
                        </span>
                        {row.payment.status === "valide" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAdminReceipt(index)}
                          >
                            <Receipt className="mr-1.5 size-4" />
                            Reçu PDF
                          </Button>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            {contractPays === undefined ? (
              <div className="h-32 animate-pulse rounded-xl bg-muted" />
            ) : contractPays.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucune mensualité en attente de vérification.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {contractPays.map(({ payment, contract, client }) => (
                  <Card key={payment._id} className="card-layered">
                    <CardContent className="flex flex-wrap items-center gap-4 py-4">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <FileSignature className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {fcfa(payment.amount)} · {contract?.reference} — échéance n°
                          {payment.periodIndex}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {client?.name ?? "Client"} · {payment.method} ·{" "}
                          {payment.payerPhone}
                          {payment.bankRef ? ` · réf. ${payment.bankRef}` : ""}
                        </p>
                      </div>
                      {payment.proofPhotoUrl && (
                        <img
                          src={payment.proofPhotoUrl}
                          alt="Preuve"
                          className="size-12 cursor-pointer rounded-lg border object-cover"
                          onClick={() => setProofZoom(payment.proofPhotoUrl ?? null)}
                        />
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openAdminReceipt(
                              (allContractPays ?? []).findIndex(
                                (r) => r.payment._id === payment._id,
                              ),
                            )
                          }
                        >
                          <Receipt className="mr-1.5 size-4" />
                          Reçu PDF
                        </Button>
                        <Button
                          size="sm"
                          className="halo-amber"
                          onClick={() =>
                            run(
                              () =>
                                validateContractPay({
                                  paymentId: payment._id as never,
                                  decision: "valide",
                                }),
                              "Mensualité validée",
                            )
                          }
                        >
                          <CheckCircle2 className="mr-1.5 size-4" /> Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() =>
                            run(
                              () =>
                                validateContractPay({
                                  paymentId: payment._id as never,
                                  decision: "echoue",
                                  note: "Paiement non retrouvé",
                                }),
                              "Paiement marqué échoué",
                            )
                          }
                        >
                          <XCircle className="mr-1.5 size-4" /> Échec
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Rémunérations techniciens */}
          <TabsContent value="remunerations" className="mt-4">
            {payouts === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : payouts.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucune rémunération — elles sont générées quand un client signe
                  le PV de réception.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "Total équipe",
                      value: fcfa(
                        payouts.reduce((s, p) => s + p.payout.amount, 0),
                      ),
                    },
                    {
                      label: "À payer",
                      value: fcfa(
                        pendingPayouts.reduce((s, p) => s + p.payout.amount, 0),
                      ),
                    },
                    {
                      label: "Déjà payé",
                      value: fcfa(
                        payouts
                          .filter((p) => p.payout.status === "payé")
                          .reduce((s, p) => s + p.payout.amount, 0),
                      ),
                    },
                  ].map(({ label, value }) => (
                    <Card key={label} className="card-layered">
                      <CardContent className="px-4 py-3.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                        <p className="font-display mt-1 text-lg font-bold">{value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {payouts.map(({ payout, tech, request }) => (
                    <div
                      key={payout._id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                        {tech?.name?.[0] ?? "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {tech?.name ?? "Technicien"} · {fcfa(payout.amount)}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {payout.role} · {request?.reference ?? ""}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {request?.title ?? ""}
                        </p>
                      </div>
                      {payout.status === "dû" ? (
                        <Button
                          className="halo-amber"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                markPayoutPaid({
                                  payoutId: payout._id as never,
                                  method: "Mobile Money",
                                }),
                              "Rémunération marquée payée",
                            )
                          }
                        >
                          <Banknote className="mr-1.5 size-4" /> Marquer payée
                        </Button>
                      ) : (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
                          Payée
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Retraits (techniciens + administration) */}
          <TabsContent value="retraits" className="mt-4">
            <div className="flex flex-col gap-4">
              {/* Solde de l'administration (commissions 15 % encaissées) */}
              <Card className="card-layered border-primary/25">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Landmark className="size-4 text-primary" /> Solde
                    commissions GTEC (administration)
                  </CardTitle>
                  <CardDescription>
                    15 % de chaque intervention, encaissés par GTEC PRO —
                    retirable sur le compte de la société.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Commissions encaissées", value: adminWallet?.earned },
                      { label: "Retraits effectués", value: adminWallet?.withdrawn },
                      { label: "Disponible", value: adminWallet?.available },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl bg-muted/60 px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                        <p className="font-display mt-1 text-lg font-bold">
                          {value === undefined ? "—" : fcfa(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_auto]">
                    <Input
                      type="number"
                      min={1000}
                      value={wdAmount}
                      onChange={(e) => setWdAmount(e.target.value)}
                      placeholder="Montant"
                    />
                    <Select value={wdMethod} onValueChange={setWdMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mtn_momo">MTN MoMo</SelectItem>
                        <SelectItem value="orange_money">Orange Money</SelectItem>
                        <SelectItem value="virement">Virement bancaire</SelectItem>
                        <SelectItem value="especes">Espèces</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={wdDestination}
                      onChange={(e) => setWdDestination(e.target.value)}
                      placeholder="Compte de réception (MoMo / IBAN)"
                    />
                    <Button
                      className="halo-amber"
                      disabled={
                        busy ||
                        Number(wdAmount) < 1000 ||
                        !wdDestination.trim() ||
                        (adminWallet?.available ?? 0) < Number(wdAmount)
                      }
                      onClick={() =>
                        run(async () => {
                          await adminRequestWithdrawal({
                            sourceRole: "admin",
                            amount: Number(wdAmount),
                            method: wdMethod as never,
                            destination: wdDestination.trim(),
                          });
                          setWdAmount("");
                          setWdDestination("");
                        }, "Demande de retrait enregistrée")
                      }
                    >
                      <Banknote className="mr-1.5 size-4" /> Retirer
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Demandes de retrait (techniciens) */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(withdrawals?.length ?? 0) === 0}
                  onClick={exportWithdrawalsCsv}
                >
                  <Download className="mr-1.5 size-4" />
                  Export CSV (retraits)
                </Button>
              </div>
              {withdrawals === undefined ? (
                <div className="h-32 animate-pulse rounded-xl bg-muted" />
              ) : withdrawals.length === 0 ? (
                <Card className="card-layered">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Aucune demande de retrait en attente.
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {withdrawals.map(({ withdrawal, user }) => (
                    <div
                      key={withdrawal._id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Landmark className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {withdrawal.reference} · {fcfa(withdrawal.amount)}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {withdrawal.sourceRole === "admin"
                              ? "Administration"
                              : (user as Doc<"users"> | null)?.name ?? "Technicien"}{" "}
                            · {withdrawal.method} → {withdrawal.destination}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Demandé le {formatDateTime(withdrawal.requestedAt)}
                          {withdrawal.note ? ` · ${withdrawal.note}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium capitalize text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
                        {withdrawal.status}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          className="halo-amber"
                          size="sm"
                          disabled={busy || withdrawal.status === "approuve"}
                          onClick={() =>
                            run(
                              () =>
                                processWithdrawal({
                                  withdrawalId: withdrawal._id as never,
                                  decision: "approuve",
                                }),
                              "Retrait approuvé",
                            )
                          }
                        >
                          <CheckCircle2 className="mr-1.5 size-4" /> Approuver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                processWithdrawal({
                                  withdrawalId: withdrawal._id as never,
                                  decision: "payee",
                                  note: "Transfert effectué",
                                }),
                              "Retrait marqué payé",
                            )
                          }
                        >
                          <Banknote className="mr-1.5 size-4" /> Payé
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                processWithdrawal({
                                  withdrawalId: withdrawal._id as never,
                                  decision: "refuse",
                                  note: "Refusé par l'administration",
                                }),
                              "Retrait refusé",
                            )
                          }
                        >
                          <XCircle className="mr-1.5 size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Commissions GTEC 15 % — répartition détaillée */}
          <TabsContent value="commissions" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(commissions?.length ?? 0) === 0}
                  onClick={exportCommissionsCsv}
                >
                  <Download className="mr-1.5 size-4" />
                  Export CSV (commissions)
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Commission due", value: commissionStats?.dueTotal, tone: "text-amber-600 dark:text-amber-400" },
                  { label: "Commission encaissée", value: commissionStats?.paidTotal, tone: "text-emerald-600 dark:text-emerald-400" },
                  {
                    label: "Part équipe (85 %)",
                    value: (commissions ?? []).reduce(
                      (s, c) => s + (c.commission.breakdown?.teamAmount ?? 0),
                      0,
                    ),
                    tone: "text-sky-600 dark:text-sky-400",
                  },
                  {
                    label: "Part GTEC (15 %)",
                    value: (commissions ?? []).reduce(
                      (s, c) => s + (c.commission.breakdown?.gtecAmount ?? c.commission.amount),
                      0,
                    ),
                    tone: "text-primary",
                  },
                ].map(({ label, value, tone }) => (
                  <Card key={label} className="card-layered">
                    <CardContent className="px-4 py-3.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      <p className={cn("font-display mt-1 text-lg font-bold", tone)}>
                        {value === undefined ? "—" : fcfa(value)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
                Sur chaque intervention : <span className="font-medium text-foreground">85 %</span>{" "}
                reviennent à l'équipe terrain (payouts) et{" "}
                <span className="font-medium text-foreground">15 %</span> reviennent à GTEC PRO
                (commission à la charge du technicien, réglée puis encaissée ici).
              </p>
              {commissions === undefined ? (
                <div className="h-32 animate-pulse rounded-xl bg-muted" />
              ) : commissions.length === 0 ? (
                <Card className="card-layered">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Aucune commission — elles sont générées quand l'avance de 50 % est validée.
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {commissions.map(({ commission, request, tech }) => (
                    <div
                      key={commission._id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        15%
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {request?.reference ?? "—"} ·{" "}
                          <span className="text-muted-foreground">
                            base {fcfa(commission.baseAmount)}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {commission.breakdown
                            ? `Équipe ${fcfa(commission.breakdown.teamAmount)} (85 %) · GTEC ${fcfa(commission.breakdown.gtecAmount)} (15 %)`
                            : `Montant ${fcfa(commission.amount)}`}{" "}
                          · redevable : {tech?.name ?? "—"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset",
                          commission.status === "payee"
                            ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                            : commission.status === "exoneree"
                              ? "bg-muted text-muted-foreground ring-border"
                              : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
                        )}
                      >
                        {commission.status === "payee"
                          ? "Encaissée"
                          : commission.status === "exoneree"
                            ? "Exonérée"
                            : "Due"}
                      </span>
                      {commission.status === "due" && (
                        <div className="flex items-center gap-2">
                          <Button
                            className="halo-amber"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  validateCommission({
                                    commissionId: commission._id as never,
                                  }),
                                "Commission encaissée",
                              )
                            }
                          >
                            <CheckCircle2 className="mr-1.5 size-4" /> Encaisser
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  waiveCommission({
                                    commissionId: commission._id as never,
                                  }),
                                "Commission exonérée",
                              )
                            }
                          >
                            <XCircle className="mr-1.5 size-4" /> Exonérer
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* GTEC PRO 2.0 : Litiges (§36) */}
          <TabsContent value="litiges" className="mt-4">
            {disputes === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : disputes.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <Scale className="size-8 text-muted-foreground" />
                  <p className="font-display text-lg font-semibold">Aucun litige</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Les problèmes signalés par les clients ou les techniciens apparaissent ici pour instruction.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {disputes.map(({ dispute, request, openedByName }) => (
                  <Card key={dispute._id} className="card-layered">
                    <CardContent className="flex flex-col gap-3 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                          <Scale className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {dispute.category.replace(/_/g, " ")} · {request?.reference ?? "—"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            Signalé par {openedByName} · {new Date(dispute._creationTime).toLocaleString("fr-FR")}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            dispute.status === "ouverte"
                              ? "bg-destructive/10 text-destructive ring-destructive/20"
                              : dispute.status === "en_cours"
                                ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
                                : dispute.status === "resolue"
                                  ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                                  : "bg-muted text-muted-foreground ring-border",
                          )}
                        >
                          {dispute.status === "ouverte"
                            ? "Ouverte"
                            : dispute.status === "en_cours"
                              ? "En instruction"
                              : dispute.status === "resolue"
                                ? "Résolue"
                                : "Rejetée"}
                        </span>
                      </div>
                      <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{dispute.description}</p>
                      {dispute.decision && (
                        <p className="rounded-lg border border-border/70 px-3 py-2 text-xs text-muted-foreground">
                          <span className="font-semibold">Décision GTEC :</span> {dispute.decision}
                        </p>
                      )}
                      {dispute.status !== "resolue" && dispute.status !== "rejetee" && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={disputeNote}
                            onChange={(e) => setDisputeNote(e.target.value)}
                            placeholder="Décision documentée (motif, mesures prises…)"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || disputeNote.trim().length < 10}
                              onClick={() =>
                                run(
                                  () =>
                                    resolveDispute({
                                      disputeId: dispute._id as never,
                                      decision: "en_cours",
                                      decisionNote: disputeNote.trim(),
                                    }),
                                  "Litige en cours d'instruction",
                                )
                              }
                            >
                              Instruire
                            </Button>
                            <Button
                              size="sm"
                              className="halo-amber"
                              disabled={busy || disputeNote.trim().length < 10}
                              onClick={() =>
                                run(
                                  () =>
                                    resolveDispute({
                                      disputeId: dispute._id as never,
                                      decision: "resolue",
                                      decisionNote: disputeNote.trim(),
                                    }),
                                  "Litige résolu",
                                )
                              }
                            >
                              <CheckCircle2 className="mr-1.5 size-4" /> Résoudre
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              disabled={busy || disputeNote.trim().length < 10}
                              onClick={() =>
                                run(
                                  () =>
                                    resolveDispute({
                                      disputeId: dispute._id as never,
                                      decision: "rejetee",
                                      decisionNote: disputeNote.trim(),
                                    }),
                                  "Litige rejeté",
                                )
                              }
                            >
                              <XCircle className="mr-1.5 size-4" /> Rejeter
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* GTEC PRO 2.0 : Sanctions graduées (§37) */}
          <TabsContent value="sanctions" className="mt-4">
            <Card className="card-layered mb-4 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Émettre une sanction graduée</CardTitle>
                <CardDescription>
                  1 Avertissement · 2 Limitation · 3 Suspension temporaire · 4 Restriction financière · 5 Résiliation.
                  Toute sanction doit être motivée, est notifiée et reste contestable.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    value={sanctionTarget}
                    onChange={(e) => setSanctionTarget(e.target.value)}
                    placeholder="ID utilisateur (users…)"
                  />
                  <Select value={sanctionLevel} onValueChange={setSanctionLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Niveau 1 — Avertissement</SelectItem>
                      <SelectItem value="2">Niveau 2 — Limitation</SelectItem>
                      <SelectItem value="3">Niveau 3 — Suspension</SelectItem>
                      <SelectItem value="4">Niveau 4 — Restriction financière</SelectItem>
                      <SelectItem value="5">Niveau 5 — Résiliation</SelectItem>
                    </SelectContent>
                  </Select>
                  {sanctionLevel === "3" && (
                    <Input
                      value={sanctionDays}
                      onChange={(e) => setSanctionDays(e.target.value)}
                      placeholder="Durée (jours)"
                      inputMode="numeric"
                    />
                  )}
                </div>
                <Textarea
                  value={sanctionReason}
                  onChange={(e) => setSanctionReason(e.target.value)}
                  placeholder="Motif détaillé de la sanction (obligatoire, 10 caractères min.)"
                  rows={2}
                />
                <Button
                  size="sm"
                  className="self-end"
                  variant="destructive"
                  disabled={
                    busy ||
                    !sanctionTarget.trim() ||
                    sanctionReason.trim().length < 10
                  }
                  onClick={async () => {
                    await run(
                      () =>
                        issueSanction({
                          userId: sanctionTarget.trim() as never,
                          level: Number(sanctionLevel),
                          reason: sanctionReason.trim(),
                          days:
                            sanctionLevel === "3" && Number(sanctionDays) > 0
                              ? Number(sanctionDays)
                              : undefined,
                        }),
                      "Sanction notifiée",
                    );
                    setSanctionReason("");
                  }}
                >
                  <ShieldAlert className="mr-1.5 size-4" /> Émettre la sanction
                </Button>
              </CardContent>
            </Card>
            {sanctions === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : sanctions.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucune sanction enregistrée.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {sanctions.map(({ sanction, targetName, issuerName }) => (
                  <div
                    key={sanction._id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        sanction.level >= 4
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {sanction.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {targetName} — niveau {sanction.level}
                        {sanction.until && sanction.level === 3
                          ? ` · jusqu'au ${new Date(sanction.until).toLocaleDateString("fr-FR")}`
                          : ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {sanction.reason} · par {issuerName} ·{" "}
                        {new Date(sanction.issuedAt).toLocaleDateString("fr-FR")}
                        {sanction.status === "contested" && sanction.contestReason
                          ? ` · CONTESTÉE : ${sanction.contestReason}`
                          : ""}
                      </p>
                    </div>
                    {(sanction.status === "active" || sanction.status === "contested") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => liftSanction({ sanctionId: sanction._id as never }),
                            "Sanction levée",
                          )
                        }
                      >
                        <CheckCircle2 className="mr-1.5 size-4" /> Lever
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* GTEC PRO 2.0 : Rôles administrateurs (§3) — Super Admin uniquement */}
          <TabsContent value="acces-admin" className="mt-4">
            <Card className="card-layered mb-4 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Périmètres d'administration (§3)</CardTitle>
                <CardDescription>
                  Attribuez à chaque compte admin son périmètre : Super Admin (tous droits), KYC, Finance, Missions, Support, Litiges, Modération ou Technique. Les actions hors périmètre sont refusées par le serveur et tracées.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {adminAdmins === undefined ? (
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                ) : adminAdmins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun administrateur.</p>
                ) : (
                  adminAdmins.map((a) => (
                    <div
                      key={a._id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.name ?? "Admin"} {user?._id === a._id ? "(vous)" : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.phone ?? a.email ?? a._id}
                        </p>
                      </div>
                      <Select
                        value={a.adminRole ?? "super_admin"}
                        onValueChange={(v) =>
                          setAdminRoleDrafts((prev) => ({ ...prev, [a._id]: v }))
                        }
                      >
                        <SelectTrigger className="w-full sm:w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                          <SelectItem value="kyc">Admin KYC</SelectItem>
                          <SelectItem value="finance">Admin Finance</SelectItem>
                          <SelectItem value="missions">Admin Missions</SelectItem>
                          <SelectItem value="support">Admin Support</SelectItem>
                          <SelectItem value="litiges">Admin Litiges</SelectItem>
                          <SelectItem value="moderation">Admin Modération</SelectItem>
                          <SelectItem value="technique">Admin Technique</SelectItem>
                        </SelectContent>
                      </Select>
                      {user?._id !== a._id && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                setAdminRole({
                                  userId: a._id as never,
                                  adminRole:
                                    (adminRoleDrafts[a._id] ?? a.adminRole ?? "super_admin") as never,
                                  makeAdmin: true,
                                }),
                              "Périmètre mis à jour",
                            )
                          }
                        >
                          Appliquer
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* GTEC PRO 2.0 : Journal d'audit (§44) */}
          <TabsContent value="audit" className="mt-4">
            {auditLogs === undefined ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : auditLogs.length === 0 ? (
              <Card className="card-layered">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucune entrée — le journal se remplit à chaque action sensible (commissions, litiges, sanctions, rôles, devis révisés).
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/70">
                {auditLogs.map((log) => (
                  <div
                    key={log._id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 bg-card px-4 py-2.5 text-sm last:border-0"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(log.at).toLocaleString("fr-FR")}
                    </span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                      {log.action}
                    </span>
                    <span className="truncate text-xs">
                      {log.actorRole ?? "système"}
                      {log.oldValue ? ` · ${log.oldValue} → ${log.newValue ?? ""}` : log.newValue ? ` · ${log.newValue}` : ""}
                      {log.detail ? ` · ${log.detail}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Techniciens */}
          <TabsContent value="techniciens" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="flex flex-col gap-2">
                {techs === undefined ? (
                  <div className="h-40 animate-pulse rounded-xl bg-muted" />
                ) : techs.length === 0 ? (
                  <Card className="card-layered">
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                      <Users className="size-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Aucun technicien — préchargez l'équipe de démonstration ou
                        ajoutez-en un.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  techs.map((t) => (
                    <div
                      key={t._id}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                        {t.name?.[0] ?? "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.city || "Spécialité à définir"}
                          {t.phone ? ` · ${t.phone}` : ""}
                        </p>
                      </div>
                      {t.active === false ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
                          Abonnement expiré
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
                          Disponible
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-col gap-3">
                <Card className="card-layered">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <UserPlus className="size-4 text-primary" /> Ajouter un
                      technicien
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Input
                      value={techName}
                      onChange={(e) => setTechName(e.target.value)}
                      placeholder="Nom complet"
                    />
                    <Input
                      value={techSpecialty}
                      onChange={(e) => setTechSpecialty(e.target.value)}
                      placeholder="Spécialité (ex. : Électricité CFO)"
                    />
                    <Input
                      value={techPhone}
                      onChange={(e) => setTechPhone(e.target.value)}
                      placeholder="Téléphone (optionnel)"
                      inputMode="tel"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !techName.trim() || !techSpecialty.trim()}
                      onClick={async () => {
                        await run(
                          () =>
                            createTech({
                              name: techName.trim(),
                              specialty: techSpecialty.trim(),
                              phone: techPhone.trim() || undefined,
                            }),
                          "Technicien ajouté",
                        );
                        setTechName("");
                        setTechSpecialty("");
                        setTechPhone("");
                      }}
                    >
                      <UserPlus className="mr-1.5 size-4" /> Ajouter
                    </Button>
                  </CardContent>
                </Card>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => seedTechs(), "Équipe de démonstration chargée")}
                >
                  <Loader2 className={cn("mr-1.5 size-4", busy && "animate-spin")} />
                  Précharger l'équipe GTEC
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Visionneuse de preuve de paiement */}
      <Dialog open={!!proofZoom} onOpenChange={(o) => !o && setProofZoom(null)}>
        <DialogContent className="sm:max-w-lg">
          {proofZoom && (
            <img
              src={proofZoom}
              alt="Preuve de paiement"
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
