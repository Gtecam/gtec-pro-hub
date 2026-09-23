import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Crown,
  FileText,
  ImagePlus,
  Lightbulb,
  Loader2,
  Package,
  Plus,
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
import { ReportForm } from "@/components/ReportForm";
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
import { fcfa, formatDateTime, suggestCrew } from "@/lib/gtec";

// ---------- constructeur de devis ----------

type QuoteItem = { label: string; qty: number; unitPrice: number };

function QuoteBuilder({ requestId }: { requestId: string }) {
  const createQuote = useMutation(api.gtec.adminCreateQuote);
  const [items, setItems] = useState<QuoteItem[]>([
    { label: "", qty: 1, unitPrice: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const total = Math.round(subtotal * 1.1925);

  const setItem = (idx: number, patch: Partial<QuoteItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = async () => {
    const clean = items.filter((i) => i.label.trim() && i.unitPrice > 0);
    if (clean.length === 0) {
      toast.error("Ajoutez au moins une ligne valide.");
      return;
    }
    setBusy(true);
    try {
      await createQuote({
        requestId: requestId as never,
        items: clean.map((i) => ({
          label: i.label.trim(),
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
      });
      toast.success("Devis envoyé au client");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <FileText className="size-4 text-primary" /> Établir le devis
      </p>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={item.label}
            onChange={(e) => setItem(idx, { label: e.target.value })}
            placeholder="Prestation (ex. : Remplacement disjoncteur)"
            className="flex-1"
          />
          <Input
            type="number"
            min={1}
            value={item.qty}
            onChange={(e) => setItem(idx, { qty: Number(e.target.value) || 1 })}
            className="w-16"
            aria-label="Quantité"
          />
          <Input
            type="number"
            min={0}
            value={item.unitPrice || ""}
            onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) || 0 })}
            placeholder="P.U."
            className="w-28"
            aria-label="Prix unitaire"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
            disabled={items.length === 1}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setItems((p) => [...p, { label: "", qty: 1, unitPrice: 0 }])}
        >
          <Plus className="mr-1 size-3.5" /> Ligne
        </Button>
        <span className="font-semibold">
          Total TTC : <span className="text-primary">{fcfa(total)}</span>
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            (TVA 19,25 %)
          </span>
        </span>
      </div>
      <Button className="halo-amber" disabled={busy} onClick={submit}>
        <FileText className="mr-2 size-4" />
        {busy ? "Envoi…" : "Envoyer le devis au client"}
      </Button>
    </div>
  );
}

// ---------- affectation d'équipe ----------

function AssignCrew({
  request,
  techs,
}: {
  request: { _id: string; serviceKey: string };
  techs: {
    _id: Id<"users">;
    name: string;
    city?: string;
    active?: boolean;
    subscription?: string;
  }[];
}) {
  const assignCrew = useMutation(api.gtec.adminAssignCrew);
  // La suggestion automatique n'utilise que les techniciens à abonnement actif.
  const suggestion = suggestCrew(
    request.serviceKey,
    techs
      .filter((t) => t.active !== false)
      .map((t) => ({ id: t._id, name: t.name, specialty: t.city })),
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
              Suggestion pour ce type de mission : {suggestion.total} technicien(s)
              selon la spécialité requise.
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
                      {t.city && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.city}
                        </span>
                      )}
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

  const actions: React.ReactNode[] = [];
  if (request.status === "nouvelle") actions.push(<QuoteBuilder key="q" requestId={request._id} />);
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
  const techs = useQuery(api.gtec.adminListAssignableTechnicians);
  const adminExists = useQuery(api.gtec.adminExists);

  const subPayments = useQuery(api.gtec.adminPendingSubscriptionPayments);
  const payouts = useQuery(api.gtec.adminListPayouts);

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

  const applications = useQuery(api.gtec.adminListApplications);
  const materials = useQuery(api.gtec.listMaterialRequests);
  const pendingApps =
    applications?.filter((a) => a.profile.status === "en_attente") ?? [];

  const [techName, setTechName] = useState("");
  const [techSpecialty, setTechSpecialty] = useState("");
  const [techPhone, setTechPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [proofZoom, setProofZoom] = useState<string | null>(null);

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
            <TabsTrigger value="materiel">
              <Package className="mr-1.5 size-4" /> Matériel
              {(materials?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {materials?.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Missions */}
          <TabsContent value="missions" className="mt-4">
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

          {/* Abonnements techniciens */}
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
