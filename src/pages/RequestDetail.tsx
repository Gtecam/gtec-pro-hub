import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileText,
  ImagePlus,
  MapPin,
  PenLine,
  Phone,
  Receipt,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import {
  AppShell,
  JourneyStepper,
  SignaturePad,
  StatusBadge,
} from "@/components/gtec";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BANK_DETAILS,
  fcfa,
  formatDateTime,
  MERCHANT_NUMBERS,
  PAYMENT_METHODS,
  SERVICES,
  statusMeta,
} from "@/lib/gtec";

function serviceMeta(key: string) {
  return SERVICES.find((s) => s.key === key);
}

export default function RequestDetail() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const detail = useQuery(api.gtec.getRequestDetail, {
    requestId: requestId as never,
  });

  const acceptQuote = useMutation(api.gtec.acceptQuote);
  const refuseQuote = useMutation(api.gtec.refuseQuote);
  const initiatePayment = useMutation(api.gtec.initiatePayment);
  const clientReception = useMutation(api.gtec.clientReception);
  const cancelRequest = useMutation(api.gtec.cancelRequest);

  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<string>("mtn_momo");
  const [payerPhone, setPayerPhone] = useState("");
  const [busy, setBusy] = useState(false);

  // Champs spécifiques par moyen de paiement
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  const [signature, setSignature] = useState<string | null>(null);
  const [receptionNote, setReceptionNote] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (detail === undefined) {
    return (
      <AppShell>
        <div className="flex flex-col gap-4">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  if (detail === null) {
    return (
      <AppShell>
        <Card className="card-layered">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="font-display text-lg font-semibold">
              Demande introuvable
            </p>
            <Button onClick={() => navigate("/dashboard")}>
              Retour au tableau de bord
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const { request, quote, payment, assignment, teamLeader, report, invoice, events } =
    detail;
  const members = (detail.members ?? []).filter(
    (m): m is NonNullable<(typeof detail.members)[number]> => !!m,
  );
  const meta = statusMeta(request.status);
  const service = serviceMeta(request.serviceKey);
  const ServiceIcon = service?.icon ?? Wrench;
  const canCancel = !["terminee", "annulee"].includes(request.status);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
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

  const pickProof = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1.2 * 1024 * 1024) {
      toast.error("Photo trop lourde — maximum 1,2 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProofUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handlePay = async () => {
    if (!quote) return;
    if (!/^[+0-9 ]{8,}$/.test(payerPhone.trim())) {
      toast.error("Numéro de téléphone invalide.");
      return;
    }
    if (method === "especes" && !proofUrl) {
      toast.error("Joignez la photo du reçu (paiement en espèces).\n");
      return;
    }
    if (method === "virement" && (!bankName.trim() || !bankRef.trim())) {
      toast.error("Banque et référence du virement obligatoires.");
      return;
    }
    if (method === "carte_visa" && !/^\d{4}$/.test(cardLast4.trim())) {
      toast.error("Indiquez les 4 derniers chiffres de la carte.");
      return;
    }
    const ok = await run(
      () =>
        initiatePayment({
          quoteId: quote._id,
          method: method as never,
          payerPhone: payerPhone.trim(),
          proofPhotoUrl: proofUrl ?? undefined,
          bankName: bankName.trim() || undefined,
          bankRef: bankRef.trim() || undefined,
          cardLast4: cardLast4.trim() || undefined,
        }),
      "Paiement initié — en attente de vérification",
    );
    if (ok) {
      setPayOpen(false);
      setProofUrl(null);
      setBankName("");
      setBankRef("");
      setCardLast4("");
    }
  };

  const handleReception = async () => {
    if (!signature) {
      toast.error("Signez le PV de réception pour continuer.");
      return;
    }
    const ok = await run(
      () =>
        clientReception({
          requestId: request._id,
          signature,
          receptionNote: receptionNote.trim() || undefined,
        }),
      "Réception confirmée — facture émise",
    );
    if (ok) {
      setSignature(null);
      setReceptionNote("");
    }
  };

  const handleCancel = async () => {
    const ok = await run(
      () =>
        cancelRequest({
          requestId: request._id,
          reason: cancelReason.trim() || "Annulée par le client",
        }),
      "Demande annulée",
    );
    if (ok) setCancelOpen(false);
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        {/* En-tête */}
        <div className="flex flex-col gap-4">
          <button
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="size-4" /> Tableau de bord
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ServiceIcon className="size-6" />
              </span>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  {request.title}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{request.reference}</span>
                  <span>{service?.label ?? request.serviceKey}</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {request.address}, {request.city}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={request.status} />
              {canCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="size-4" />
                  <span className="hidden sm:inline">Annuler</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Parcours */}
        <Card className="card-layered">
          <CardContent className="py-5">
            <JourneyStepper status={request.status} />
            <p className="mt-3 text-center text-sm text-muted-foreground">
              {meta.hint}
            </p>
          </CardContent>
        </Card>

        {request.status === "annulee" && (
          <Card className="card-layered border-destructive/30">
            <CardContent className="flex items-center gap-3 py-5 text-sm">
              <XCircle className="size-5 shrink-0 text-destructive" />
              <span>
                Cette demande a été annulée
                {request.cancellationReason
                  ? ` — ${request.cancellationReason}`
                  : ""}
                .
              </span>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Colonne principale */}
          <div className="flex flex-col gap-6">
            {/* Devis */}
            {quote && (
              <Card className="card-layered">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="size-5" />
                      </span>
                      <div>
                        <CardTitle className="text-base">
                          Devis {quote.number}
                        </CardTitle>
                        <CardDescription>
                          Valable jusqu'au {formatDateTime(quote.validUntil)}
                        </CardDescription>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                        quote.status === "accepte" &&
                          "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
                        quote.status === "emis" &&
                          "bg-primary/10 text-primary ring-primary/20",
                        quote.status === "refuse" &&
                          "bg-destructive/10 text-destructive ring-destructive/20",
                        quote.status === "expire" &&
                          "bg-muted text-muted-foreground ring-border",
                      )}
                    >
                      {quote.status === "emis" && "À valider"}
                      {quote.status === "accepte" && "Accepté"}
                      {quote.status === "refuse" && "Refusé"}
                      {quote.status === "expire" && "Expiré"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="overflow-hidden rounded-xl border border-border/70">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/70 bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Prestation</th>
                          <th className="px-3 py-2 text-center font-medium">Qté</th>
                          <th className="px-3 py-2 text-right font-medium">P.U.</th>
                          <th className="px-3 py-2 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.items.map((item, i) => (
                          <tr
                            key={i}
                            className="border-b border-border/50 last:border-0"
                          >
                            <td className="px-3 py-2.5">{item.label}</td>
                            <td className="px-3 py-2.5 text-center">{item.qty}</td>
                            <td className="px-3 py-2.5 text-right">
                              {fcfa(item.unitPrice)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium">
                              {fcfa(item.qty * item.unitPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sous-total</span>
                      <span>{fcfa(quote.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        TVA ({quote.vatRate}%)
                      </span>
                      <span>
                        {fcfa(
                          Math.round(
                            quote.subtotal * (quote.vatRate / 100),
                          ),
                        )}
                      </span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between text-base font-semibold">
                      <span>Total</span>
                      <span className="text-primary">{fcfa(quote.total)}</span>
                    </div>
                  </div>
                  {quote.status === "emis" && request.status === "devis_emis" && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        className="halo-amber flex-1"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => acceptQuote({ quoteId: quote._id }),
                            "Devis accepté",
                          )
                        }
                      >
                        <CheckCircle2 className="mr-2 size-4" />
                        Accepter le devis
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => refuseQuote({ quoteId: quote._id }),
                            "Devis refusé",
                          )
                        }
                      >
                        <XCircle className="mr-2 size-4" />
                        Refuser
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Paiement */}
            {payment && (
              <Card className="card-layered">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Wallet className="size-5" />
                      </span>
                      <div>
                        <CardTitle className="text-base">Paiement</CardTitle>
                        <CardDescription>
                          {PAYMENT_METHODS.find((m) => m.key === payment.method)
                            ?.label ?? payment.method}{" "}
                          · {payment.payerPhone}
                        </CardDescription>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                        payment.status === "valide" &&
                          "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
                        payment.status === "en_attente" &&
                          "bg-primary/10 text-primary ring-primary/20",
                        payment.status === "echoue" &&
                          "bg-destructive/10 text-destructive ring-destructive/20",
                      )}
                    >
                      {payment.status === "valide" && "Validé"}
                      {payment.status === "en_attente" && "En attente"}
                      {payment.status === "echoue" && "Échoué"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-display text-xl font-bold">
                    {fcfa(payment.amount)}
                  </span>
                  {payment.status === "en_attente" && (
                    <span className="text-sm text-amber-600 dark:text-amber-400">
                      Vérification en cours par GTEC…
                    </span>
                  )}
                  {payment.status === "valide" && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" /> Paiement confirmé
                    </span>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Équipe */}
            {assignment && (
              <Card className="card-layered">
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="size-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">
                        Équipe d'intervention
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" />
                        {formatDateTime(assignment.scheduledAt)}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {teamLeader && (
                    <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                      <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                        {teamLeader.name?.[0] ?? "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {teamLeader.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Chef d'équipe
                          {teamLeader.city ? ` · ${teamLeader.city}` : ""}
                        </p>
                      </div>
                      <Truck className="ml-auto size-4 shrink-0 text-muted-foreground" />
                    </div>
                  )}
                  {members.length > 1 && (
                    <div className="flex flex-col gap-2">
                      {members
                        .filter((m) => m.id !== teamLeader?._id)
                        .map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 px-3 py-1.5"
                          >
                            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                              {m.name?.[0] ?? "?"}
                            </span>
                            <p className="text-sm">{m.name}</p>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {m.role}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                  {assignment.notes && (
                    <p className="rounded-lg bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
                      {assignment.notes}
                    </p>
                  )}
                  {request.status === "en_intervention" && (
                    <p className="flex items-center gap-2 text-sm text-sky-600 dark:text-sky-400">
                      <Wrench className="size-4" /> L'équipe travaille sur
                      place — le rapport suivra la fin des travaux.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Rapport */}
            {report && (
              <Card className="card-layered">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <ClipboardCheck className="size-5" />
                      </span>
                      <div>
                        <CardTitle className="text-base">
                          Rapport d'intervention
                        </CardTitle>
                        <CardDescription>
                          Garantie {report.warrantyMonths} mois
                        </CardDescription>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                        report.status === "receptionne"
                          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                          : "bg-primary/10 text-primary ring-primary/20",
                      )}
                    >
                      {report.status === "receptionne" ? "Réceptionné" : "À réceptionner"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-sm leading-6">{report.workDone}</p>
                  {report.partsUsed.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Matériel utilisé
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {report.partsUsed.map((p, i) => (
                          <li
                            key={i}
                            className="rounded-full bg-muted px-2.5 py-1 text-xs"
                          >
                            {p.label} × {p.qty}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(report.beforePhotos.length > 0 ||
                    report.afterPhotos.length > 0) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        { label: "Avant", photos: report.beforePhotos },
                        { label: "Après", photos: report.afterPhotos },
                      ].map(
                        ({ label, photos }) =>
                          photos.length > 0 && (
                            <div key={label}>
                              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {label}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {photos.map((src, i) => (
                                  <img
                                    key={i}
                                    src={src}
                                    alt={`${label} ${i + 1}`}
                                    className="aspect-square w-full rounded-lg border object-cover"
                                  />
                                ))}
                              </div>
                            </div>
                          ),
                      )}
                    </div>
                  )}
                  {report.recommendations && (
                    <p className="rounded-lg bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
                      <span className="font-semibold">Recommandations : </span>
                      {report.recommendations}
                    </p>
                  )}
                  {report.clientSignature && (
                    <div>
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <PenLine className="size-3" /> PV de réception signé
                      </p>
                      <img
                        src={report.clientSignature}
                        alt="Signature du client"
                        className="h-20 rounded-lg border bg-white object-contain px-4"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Facture */}
            {invoice && (
              <Card className="card-layered border-emerald-500/20">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Receipt className="size-5" />
                      </span>
                      <div>
                        <CardTitle className="text-base">
                          Facture {invoice.number}
                        </CardTitle>
                        <CardDescription>
                          Émise le {formatDateTime(invoice.issuedAt)}
                        </CardDescription>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
                      {invoice.status === "payee" ? "Payée" : "Émise"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="font-display text-xl font-bold">
                    {fcfa(invoice.amount)}
                  </span>
                  <Button variant="outline" size="sm" disabled>
                    <Download className="mr-1.5 size-4" />
                    PDF (bientôt)
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Colonne latérale */}
          <div className="flex flex-col gap-6">
            {/* Prochaine action */}
            {request.status === "devis_accepte" && quote && !payment && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="card-layered border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CircleDollarSign className="size-5 text-primary" />
                      Payer le devis
                    </CardTitle>
                    <CardDescription>
                      Réglez {fcfa(quote.total)} par Mobile Money pour lancer
                      l'affectation de votre équipe.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="halo-amber w-full"
                      onClick={() => setPayOpen(true)}
                    >
                      <Wallet className="mr-2 size-4" />
                      Payer maintenant
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {request.status === "rapport_emis" && report && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="card-layered border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="size-5 text-primary" />
                      Réception des travaux
                    </CardTitle>
                    <CardDescription>
                      Vérifiez le travail puis signez le PV pour clôturer et
                      recevoir votre facture.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <SignaturePad value={signature} onChange={setSignature} />
                    <Input
                      value={receptionNote}
                      onChange={(e) => setReceptionNote(e.target.value)}
                      placeholder="Remarque (optionnel)"
                    />
                    <Button
                      className="halo-amber w-full"
                      disabled={busy || !signature}
                      onClick={handleReception}
                    >
                      <CheckCircle2 className="mr-2 size-4" />
                      Signer et réceptionner
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Photos client */}
            {request.photos.length > 0 && (
              <Card className="card-layered">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ImagePlus className="size-4 text-muted-foreground" />
                    Photos de la demande
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {request.photos.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Photo ${i + 1}`}
                        className="aspect-square w-full rounded-lg border object-cover"
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Journal */}
            <Card className="card-layered">
              <CardHeader>
                <CardTitle className="text-sm">Journal</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-4">
                  {events.map((ev) => (
                    <li key={ev._id} className="flex gap-3">
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-primary/60 ring-4 ring-primary/10" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{ev.label}</p>
                        {ev.detail && (
                          <p className="text-xs text-muted-foreground">
                            {ev.detail}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatDateTime(ev.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Paiement */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payer le devis {quote?.number}</DialogTitle>
            <DialogDescription>
              {quote && `${fcfa(quote.total)} · `}Choisissez votre moyen de
              paiement. Un agent GTEC vérifie la réception.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.key}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    method === m.key
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40",
                  )}
                  onClick={() => setMethod(m.key)}
                >
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>

            {/* Mobile Money : numéros marchands */}
            {(method === "mtn_momo" || method === "orange_money") && (
              <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                {(() => {
                  const merchant = MERCHANT_NUMBERS[method];
                  return (
                    <>
                      <p className="text-sm font-medium">
                        Envoyez {quote ? fcfa(quote.total) : ""} au{" "}
                        {merchant.label} :
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-lg font-bold text-primary">
                          {merchant.number}
                        </span>
                        <a
                          href={`tel:${merchant.tel}`}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          <Phone className="size-3.5" /> Appeler
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Utilisez votre nom en référence, puis indiquez votre
                        numéro ci-dessous.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Carte Visa : saisie des 4 derniers chiffres */}
            {method === "carte_visa" && (
              <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                <p className="text-sm font-medium">
                  Paiement par carte bancaire (entreprises)
                </p>
                <p className="text-xs text-muted-foreground">
                  Réglez sur le TPE GTEC ou via le lien de paiement envoyé par
                  l'agence, puis indiquez les 4 derniers chiffres de la carte
                  pour le rapprochement.
                </p>
                <Input
                  value={cardLast4}
                  onChange={(e) =>
                    setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="4 derniers chiffres (ex. : 4291)"
                  inputMode="numeric"
                />
              </div>
            )}

            {/* Virement bancaire : coordonnées + référence */}
            {method === "virement" && (
              <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                <p className="text-sm font-medium">
                  Virement bancaire (entreprises)
                </p>
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span>
                    Bénéficiaire :{" "}
                    <span className="font-medium text-foreground">
                      {BANK_DETAILS.beneficiary}
                    </span>
                  </span>
                  <span>
                    Banque :{" "}
                    <span className="font-medium text-foreground">
                      {BANK_DETAILS.bank}
                    </span>
                  </span>
                  <span>
                    IBAN :{" "}
                    <span className="font-mono font-medium text-foreground">
                      {BANK_DETAILS.iban}
                    </span>
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Votre banque"
                  />
                  <Input
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                    placeholder="Référence du virement"
                  />
                </div>
              </div>
            )}

            {/* Espèces : preuve photo obligatoire */}
            {method === "especes" && (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
                <p className="text-sm font-medium">
                  Espèces — preuve obligatoire
                </p>
                <p className="text-xs text-muted-foreground">
                  Payez comptant au technicien ou en agence, prenez le reçu, puis
                  joignez sa photo. GTEC validera après vérification.
                </p>
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    pickProof(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <div className="flex items-center gap-3">
                  {proofUrl ? (
                    <img
                      src={proofUrl}
                      alt="Preuve de paiement"
                      className="size-14 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <span className="flex size-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Receipt className="size-5" />
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => proofInputRef.current?.click()}
                  >
                    {proofUrl ? "Remplacer la photo" : "Joindre la photo du reçu"}
                  </Button>
                </div>
              </div>
            )}

            {/* Numéro payeur (tous moyens sauf virement seul) */}
            {method !== "virement" && (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium">
                  <Phone className="size-3.5" /> Numéro payeur
                </label>
                <Input
                  value={payerPhone}
                  onChange={(e) => setPayerPhone(e.target.value)}
                  placeholder="Ex. : 6 99 99 99 99"
                  inputMode="tel"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Retour
            </Button>
            <Button className="halo-amber" disabled={busy} onClick={handlePay}>
              <Wallet className="mr-2 size-4" />
              {method === "especes"
                ? "Déclarer le paiement"
                : method === "virement"
                  ? "Notifier le virement"
                  : "Payer"}{" "}
              {quote ? fcfa(quote.total) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Annulation */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler cette demande ?</DialogTitle>
            <DialogDescription>
              Indiquez brièvement la raison de l'annulation.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ex. : problème résolu entre-temps"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Retour
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={busy}>
              <XCircle className="mr-2 size-4" /> Annuler la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
