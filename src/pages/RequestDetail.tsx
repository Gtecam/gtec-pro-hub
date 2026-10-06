import { Star } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
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
  FolderDown,
  Hourglass,
  ImagePlus,
  Loader2,
  MapPin,
  Navigation,
  PenLine,
  Phone,
  Receipt,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Doc } from "@/convex/_generated/dataModel";
import { useNavigate, useParams } from "react-router";
import { api } from "@/convex/_generated/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { BadgeCheck } from "lucide-react";
import {
  BANK_DETAILS,
  fcfa,
  formatDateTime,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_LABEL,
  MERCHANT_NUMBERS,
  MILESTONE_LABELS,
  PAYMENT_METHODS,
  splitFiftyFifty,
  SERVICES,
  statusMeta,
  formatDate,
} from "@/lib/gtec";
import { URGENCY_BADGE } from "@/lib/interventions";
import { formatGps, gmapsCoordsUrl, haversineKm } from "@/lib/gps";
import { openDossierPdf, openInvoicePdf, openQuotePdf, openReceptionPdf } from "@/lib/invoicePdf";
import { compressImageIfNeeded, dataUrlBytes, humanSize } from "@/lib/imageCompress";
import {
  AppShell,
  JourneyStepper,
  SignaturePad,
  StatusBadge,
} from "@/components/gtec";
import {
  ConversationListPanel,
  ConversationPanel,
} from "@/components/ConversationPanel";

function serviceMeta(key: string) {
  return SERVICES.find((s) => s.key === key);
}

export default function RequestDetail() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const detail = useQuery(api.gtec.getRequestDetail, {
    requestId: requestId as never,
  });

  const acceptQuote = useMutation(api.gtec.acceptQuote);
  const refuseQuote = useMutation(api.gtec.refuseQuote);
  // MARCHÉ DE SERVICES (§9/§11) : propositions des professionnels + actions client.
  const quoteRequestsData = useQuery(api.matching.quoteRequestsForRequest, {
    requestId: requestId as never,
  });
  const acceptQuoteRequest = useMutation(api.matching.acceptQuoteRequest);
  const declineQuoteRequest = useMutation(api.matching.declineQuote);
  const requestQuoteModification = useMutation(api.matching.requestQuoteModification);
  const expandSearchMutation = useMutation(api.matching.expandSearch);
  const chooseForMeMutation = useMutation(api.matching.chooseForMe);
  const [modifTarget, setModifTarget] = useState<string | null>(null);
  const [modifNote, setModifNote] = useState("");
  const [marketBusy, setMarketBusy] = useState(false);
  const initiatePayment = useMutation(api.gtec.initiatePayment);
  const clientReception = useMutation(api.gtec.clientReception);
  // EXTENSIONS GTEC PRO : garantie de travaux (F°13) + certificat numérique (F°12).
  const ensureGuarantee = useMutation(api.missions.ensureWorkGuarantee);
  const issueCertificate = useMutation(api.missions.issueDigitalCertificate);
  const certificate = useQuery(
    api.missions.getCertificateByRequest,
    requestId ? { requestId: requestId as never } : "skip",
  );
  const guarantees = useQuery(api.missions.myActiveGuarantees, {});
  // Messagerie (§11) : salle liée à cette demande pour l'utilisateur connecté
  // (null s'il n'y participe pas) — évite de passer un id de demande là où un
  // id de room est attendu.
  const requestRoomId = useQuery(
    api.gtec.chatRoomForRequest,
    detail?.request ? { requestId: detail.request._id } : "skip",
  );
  const startMomoPayment = useAction(api.momo.startMomoPayment);
  const checkMomoPayment = useAction(api.momo.checkMomoPayment);

  // GTEC PRO 2.0 (§20) : passerelle CinetPay — MoMo + carte via un checkout
  // hébergé unique, escrow chez un Établissement de Paiement agréé.
  const startGatewayPayment = useAction(api.paymentChannels.startGatewayPayment);
  const checkGatewayPayment = useAction(api.paymentChannels.checkGatewayPayment);
  const getPaymentChannelsAction = useAction(api.paymentChannels.getPaymentChannels);
  const [channels, setChannels] = useState<Awaited<
    ReturnType<typeof getPaymentChannelsAction>
  > | null>(null);
  const [gatewayFlow, setGatewayFlow] = useState<
    | null
    | {
        paymentId: string;
        status: "en_attente" | "reussie" | "echouee";
      }
  >(null);
  useEffect(() => {
    let stopped = false;
    getPaymentChannelsAction()
      .then((c) => !stopped && setChannels(c))
      .catch(() => {});
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // V6 : paiements en 2 tranches — toutes les tranches de la demande.
  const payments = (detail?.payments ?? []) as Doc<"payments">[] | undefined;
  const advanceValidated = !!payments?.some(
    (p) => p.milestone === "avance" && p.status === "valide",
  );
  const balanceValidated = !!payments?.some(
    (p) => p.milestone === "solde" && p.status === "valide",
  );
  const pendingMilestone = payments?.find((p) => p.status === "en_attente")
    ?.milestone as "avance" | "solde" | undefined;
  const { advance: advanceAmount, balance: balanceAmount } = splitFiftyFifty(
    detail?.quote?.total ?? 0,
  );
  const cancelRequest = useMutation(api.gtec.cancelRequest);
  const submitReview = useMutation(api.gtec.clientSubmitReview);

  // GTEC PRO 2.0 §36 : litiges (signalement + suivi).
  const requestDisputes = useQuery(api.gtec.listRequestDisputes, {
    requestId: requestId as never,
  });
  const createDispute = useMutation(api.gtec.createDispute);
  const [disputeCategory, setDisputeCategory] = useState("travaux_non_conformes");
  const [disputeDescription, setDisputeDescription] = useState("");

  const myReview = useQuery(api.gtec.getReviewForRequest, {
    requestId: requestId as never,
  });

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");

  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<string>("mtn_momo");
  const [payerPhone, setPayerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  /** V6 : tranche à payer dans le dialog (avance = 1ʳᵉ, solde = 2ᵉ). */
  const [milestone, setMilestone] = useState<"avance" | "solde">("avance");

  // Messagerie (§11) : afficher la liste et, si une salle est sélectionnée,
  // le fil de discussion dédié.
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  useEffect(() => {
    function handleOpenConversation(e: Event) {
      const detail = (e as CustomEvent<{ roomId: string }>).detail;
      setActiveRoomId(detail.roomId ?? null);
    }
    window.addEventListener("gtc:open-conversation", handleOpenConversation);
    return () =>
      window.removeEventListener("gtc:open-conversation", handleOpenConversation);
  }, []);

  // Champs spécifiques par moyen de paiement
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  // V5 : flux de paiement Mobile Money automatique (MTN/Orange)
  const [momoFlow, setMomoFlow] = useState<
    | null
    | {
        provider: "mtn" | "orange";
        paymentId: string;
        redirectUrl?: string;
        status: "en_attente" | "reussie" | "echouee" | "expiree";
        failureReason?: string;
      }
  >(null);

  // V5 : interrogation MTN en boucle tant que le client n'a pas validé.
  useEffect(() => {
    if (!gatewayFlow || gatewayFlow.status !== "en_attente") {
      return;
    }
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      attempts += 1;
      try {
        const res = await checkGatewayPayment({
          paymentId: gatewayFlow.paymentId as never,
        });
        if (stopped) return;
        const s = res?.status ?? "en_attente";
        if (s === "reussie") {
          setGatewayFlow({ paymentId: gatewayFlow.paymentId, status: "reussie" });
          toast.success("Paiement en ligne confirmé — équipe en cours d'affectation !");
          return;
        }
        if (s === "echouee") {
          setGatewayFlow({ paymentId: gatewayFlow.paymentId, status: "echouee" });
          toast.error("Paiement refusé ou annulé sur la page de paiement.");
          return;
        }
        if (attempts < 40) timer = setTimeout(tick, 3500);
        else setGatewayFlow({ paymentId: gatewayFlow.paymentId, status: "echouee" });
      } catch {
        if (!stopped && attempts < 40) timer = setTimeout(tick, 3500);
      }
    };
    timer = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayFlow?.paymentId, gatewayFlow?.status]);

  // V5 : interrogation MTN en boucle tant que le client n'a pas validé.
  useEffect(() => {
    if (!momoFlow || momoFlow.provider !== "mtn" || momoFlow.status !== "en_attente") {
      return;
    }
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      attempts += 1;
      try {
        const res = await checkMomoPayment({
          paymentId: momoFlow.paymentId as never,
        });
        if (stopped) return;
        const s = res?.status ?? "en_attente";
        if (s === "reussie") {
          setMomoFlow((f) => (f ? { ...f, status: "reussie" } : f));
          toast.success("Paiement Mobile Money confirmé — équipe en cours d'affectation !");
          return;
        }
        if (s === "echouee") {
          setMomoFlow((f) => (f ? { ...f, status: "echouee" } : f));
          toast.error("Paiement refusé par l'opérateur.");
          return;
        }
        if (s === "expiree") {
          setMomoFlow((f) => (f ? { ...f, status: "expiree" } : f));
          toast.error("Demande de paiement expirée.");
          return;
        }
        if (attempts < 40) {
          timer = setTimeout(tick, 3500);
        } else {
          setMomoFlow((f) => (f ? { ...f, status: "expiree" } : f));
          toast.error("Pas de confirmation après 2 min — réessayez ou déclarez le paiement manuellement.");
        }
      } catch {
        if (!stopped && attempts < 40) timer = setTimeout(tick, 3500);
      }
    };
    timer = setTimeout(tick, 2500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momoFlow?.provider, momoFlow?.paymentId, momoFlow?.status]);

  const [signature, setSignature] = useState<string | null>(null);
  const [receptionNote, setReceptionNote] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // MARCHÉ (§9) : dialog « demander une modification » sur une proposition.
  const [modifOpen, setModifOpen] = useState(false);
  const openModif = (id: string) => {
    setModifTarget(id);
    setModifNote("");
    setModifOpen(true);
  };
  const submitModif = async () => {
    if (!modifTarget) return;
    setMarketBusy(true);
    try {
      await requestQuoteModification({ quoteRequestId: modifTarget as never, note: modifNote.trim() });
      toast.success("Modification demandée — le professionnel peut ajuster son offre.");
      setModifOpen(false);
      setModifTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setMarketBusy(false);
    }
  };

  // MODE DIASPORA (§11) : validation à distance par le client à l'étranger.
  const validateDiaspora = useMutation(api.diaspora.validateByDiaspora);
  const [diasporaNote, setDiasporaNote] = useState("");
  const [diasporaBusy, setDiasporaBusy] = useState(false);

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

  // Données partagées des documents PDF (facture, PV, dossier complet).
  const teamPdf = members.map((m) => ({ name: m.name, role: m.role }));
  const requestPdf = {
    reference: request.reference,
    title: request.title,
    serviceLabel: service?.label ?? request.serviceKey,
    address: request.address,
    city: request.city,
    scheduledAt: request.scheduledAt,
  };
  const quotePdf = quote
    ? {
        number: quote.number,
        items: quote.items,
        subtotal: quote.subtotal,
        vatRate: quote.vatRate,
        total: quote.total,
      }
    : undefined;
  const paymentsPdf = (payments ?? []).map((p) => ({
    milestone: p.milestone,
    amount: p.amount,
    method: p.method,
    status: p.status,
    paidAt: p.paidAt,
  }));

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

  const pickProof = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Seule une photo du reçu est acceptée.");
      return;
    }
    const res = await compressImageIfNeeded(file);
    if (!res.ok) {
      toast.error(`Photo trop lourde même après compression (max ${MAX_FILE_SIZE_LABEL}).`);
      return;
    }
    if (res.compressed) {
      toast.success(`Photo compressée : ${humanSize(res.originalSize)} → ${humanSize(dataUrlBytes(res.dataUrl))}.`);
      setProofUrl(res.dataUrl);
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
          milestone,
          method: method as never,
          payerPhone: payerPhone.trim(),
          proofPhotoUrl: proofUrl ?? undefined,
          bankName: bankName.trim() || undefined,
          bankRef: bankRef.trim() || undefined,
          cardLast4: cardLast4.trim() || undefined,
        }),
      milestone === "avance"
        ? "Avance (50 %) initiée — en attente de vérification"
        : "Solde (50 %) initié — en attente de vérification",
    );
    if (ok) {
      setPayOpen(false);
      setProofUrl(null);
      setBankName("");
      setBankRef("");
      setCardLast4("");
    }
  };

  /** V5/V6 : paiement Mobile Money automatique de la tranche courante. */
  const handleAutoMomo = async (provider: "mtn" | "orange") => {
    if (!quote) return;
    if (!/^[+0-9 ]{8,}$/.test(payerPhone.trim())) {
      toast.error("Numéro de téléphone invalide.");
      return;
    }
    setBusy(true);
    try {
      const res = await startMomoPayment({
        quoteId: quote._id,
        milestone,
        provider,
        payerPhone: payerPhone.trim(),
      });
      if (res.provider === "orange" && res.redirectUrl) {
        // Orange : redirige vers la page de paiement Orange Money.
        window.location.href = res.redirectUrl;
        return;
      }
      setMomoFlow({
        provider: res.provider,
        paymentId: res.paymentId,
        redirectUrl: "redirectUrl" in res ? res.redirectUrl : undefined,
        status: "en_attente",
      });
      toast.info(
        res.provider === "mtn"
          ? "Demande envoyée — validez sur votre téléphone avec votre code MTN MoMo."
          : "Demande Orange Money créée — suivez les instructions.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Paiement impossible");
    } finally {
      setBusy(false);
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
      // EXTENSIONS GTEC PRO : garantie de travaux (F°13) + certificat numérique (F°12).
      try {
        await ensureGuarantee({ requestId: request._id as never });
        await issueCertificate({ requestId: request._id as never });
        toast.success("Garantie de travaux activée — certificat numérique disponible via QR.");
      } catch {
        /* non bloquant : le certificat peut être émis plus tard */
      }
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

  const handleReview = async () => {
    if (rating < 1) {
      toast.error("Choisissez une note de 1 à 5 étoiles.");
      return;
    }
    const ok = await run(
      () =>
        submitReview({
          requestId: request._id,
          rating,
          comment: reviewComment.trim() || undefined,
        }),
      "Merci pour votre avis !",
    );
    if (ok) {
      setRating(0);
      setReviewComment("");
    }
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
                {(request.interventionLabel || request.urgency) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {request.interventionLabel && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {request.interventionLabel}
                        {request.interventionCode ? ` · ${request.interventionCode}` : ""}
                      </span>
                    )}
                    {request.urgency && request.urgency !== "normale" && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                          URGENCY_BADGE[request.urgency],
                        )}
                      >
                        {request.urgency === "critique" ? "Urgence critique" : "Urgente"}
                      </span>
                    )}
                  </div>
                )}
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

        {/* GÉO TERRAIN : suivi du déplacement de l'équipe vers le chantier.
            Visible par le client (et le diaspora qui suit pour son proche). */}
        {["affectee", "en_intervention"].includes(request.status) && (
          <Card className="card-layered border-primary/25 bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck className="size-4 text-primary" /> Suivi du déplacement
                de l'équipe
              </CardTitle>
              <CardDescription>
                Positions GPS partagées par les techniciens en route vers «
                {request.address}, {request.city} ».
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {request.teamArrivalAt ? (
                <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> Technicien arrivé 📍 —
                  arrivée confirmée le {formatDateTime(request.teamArrivalAt)}
                  {request.teamArrivalCoords && (
                    <a
                      className="ml-auto shrink-0 text-xs underline underline-offset-2"
                      href={gmapsCoordsUrl(
                        request.teamArrivalCoords as { lat: number; lon: number },
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Voir sur la carte
                    </a>
                  )}
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary ring-1 ring-primary/20">
                  <Truck className="size-4 shrink-0" /> L'équipe est en route —
                  la position apparaît dès que le technicien active son GPS.
                </p>
              )}
              {(detail.teamLocations?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucune position partagée pour l'instant — les techniciens
                  n'ont pas encore activé leur partage GPS.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {detail.teamLocations!.map((t) => {
                    const dist =
                      request.coords &&
                      haversineKm(
                        t.position as { lat: number; lon: number },
                        request.coords as { lat: number; lon: number },
                      );
                    const ageMin = Math.round(
                      (Date.now() - t.positionAt) / 60000,
                    );
                    return (
                      <div
                        key={t.userId}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border/70 px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            {t.sharing ? (
                              <span className="relative flex size-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                              </span>
                            ) : (
                              <Navigation className="size-3" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {t.name}
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {t.role}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              MAJ il y a{" "}
                              {ageMin < 1
                                ? "moins d'une minute"
                                : ageMin < 60
                                  ? `${ageMin} min`
                                  : `${Math.round(ageMin / 60)} h`}
                              {t.sharing ? " · partage en direct" : ""}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3 text-xs">
                          {dist !== null && dist !== undefined && (
                            <span className="font-semibold">
                              {dist < 1
                                ? `${Math.round(dist * 1000)} m`
                                : `${dist} km`} du chantier
                            </span>
                          )}
                          <a
                            className="flex items-center gap-1 text-primary hover:underline"
                            href={gmapsCoordsUrl(
                              t.position as { lat: number; lon: number },
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MapPin className="size-3.5" /> Carte
                          </a>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {request.coords && !request.teamArrivalAt && (
                <p className="text-xs text-muted-foreground">
                  Chantier épinglé :{" "}
                  <span className="font-mono">
                    {formatGps(request.coords as { lat: number; lon: number })}
                  </span>{" "}
                  —
                  <a
                    className="ml-1 text-primary hover:underline"
                    href={gmapsCoordsUrl(request.coords as {
                      lat: number;
                      lon: number;
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ouvrir dans Google Maps
                  </a>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* MODE DIASPORA (§8/§11) : validation à distance + libération des fonds */}
        {request.isDiaspora && request.status === "rapport_emis" && (
          <Card className="card-layered border-primary/25 bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                🌍 Validation à distance — Mode Diaspora
              </CardTitle>
              <CardDescription>
                L'intervention est-elle terminée conformément au devis ? Votre
                validation libère les fonds du paiement sécurisé.
                {request.beneficiaryValidationCode
                  ? ` Code du bénéficiaire sur place : ${request.beneficiaryValidationCode}.`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Textarea
                value={diasporaNote}
                onChange={(e) => setDiasporaNote(e.target.value)}
                placeholder="Commentaire (optionnel) — précisions, corrections demandées…"
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="halo-amber"
                  disabled={diasporaBusy}
                  onClick={async () => {
                    setDiasporaBusy(true);
                    try {
                      await validateDiaspora({
                        requestId: request._id as never,
                        verdict: "conforme",
                        note: diasporaNote.trim() || undefined,
                      });
                      toast.success("Validation enregistrée — fonds libérés");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erreur");
                    } finally {
                      setDiasporaBusy(false);
                    }
                  }}
                >
                  ✅ Oui, tout est correct
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={diasporaBusy || diasporaNote.trim().length < 5}
                  onClick={async () => {
                    setDiasporaBusy(true);
                    try {
                      await validateDiaspora({
                        requestId: request._id as never,
                        verdict: "correction_demandee",
                        note: diasporaNote.trim() || undefined,
                      });
                      toast.success("Correction demandée — GTEC reprend le travail");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erreur");
                    } finally {
                      setDiasporaBusy(false);
                    }
                  }}
                >
                  ⚠️ Demander une correction
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={diasporaBusy || diasporaNote.trim().length < 5}
                  onClick={async () => {
                    setDiasporaBusy(true);
                    try {
                      await validateDiaspora({
                        requestId: request._id as never,
                        verdict: "probleme_signale",
                        note: diasporaNote.trim() || undefined,
                      });
                      toast.error("Problème signalé — un litige est ouvert");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erreur");
                    } finally {
                      setDiasporaBusy(false);
                    }
                  }}
                >
                  ❌ Signaler un problème
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        try {
                          openQuotePdf({
                            quoteNumber: quote.number,
                            emittedAt: quote._creationTime,
                            validUntil: quote.validUntil,
                            status: quote.status,
                            clientName: user?.name ?? "Client GTEC",
                            clientPhone: user?.phone ?? undefined,
                            clientEmail: user?.email ?? undefined,
                            clientAddress: user?.address ?? undefined,
                            clientCity: user?.city ?? request.city,
                            companyName: user?.companyName ?? undefined,
                            taxId: user?.taxId ?? undefined,
                            request: requestPdf,
                            items: quote.items,
                            subtotal: quote.subtotal,
                            vatRate: quote.vatRate,
                            total: quote.total,
                          });
                        } catch (e) {
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Impression impossible — réessayez.",
                          );
                        }
                      }}
                    >
                      <Download className="mr-1.5 size-4" />
                      Devis PDF
                    </Button>
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

            {/* MARCHÉ DE SERVICES (§9) : propositions des professionnels + comparaison */}
            {quoteRequestsData && quoteRequestsData.items.length > 0 && !assignment && (
              <Card className="card-layered">
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Scale className="size-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">Propositions de devis</CardTitle>
                      <CardDescription>
                        Réponses des professionnels sollicités — comparez puis
                        choisissez votre prestataire.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {/* Délai de réponse (§11) */}
                  {(() => {
                    const pending = quoteRequestsData.items.filter(
                      (q) => q.status === "envoyee",
                    );
                    if (pending.length === 0) return null;
                    const nextDeadline = Math.min(
                      ...pending.map((q) => q.responseDeadline),
                    );
                    const remaining = nextDeadline - quoteRequestsData.now;
                    if (remaining > 0) {
                      const min = Math.max(1, Math.round(remaining / 60000));
                      return (
                        <p className="flex items-center gap-2 rounded-lg bg-primary/[0.06] px-3 py-2 text-xs font-medium text-primary ring-1 ring-primary/20">
                          <Hourglass className="size-3.5" />
                          Réponse attendue {min >= 60 ? `dans les ${Math.round(min / 60)} h` : `dans les ${min} minutes`} —
                          {pending.length} professionnel(s) sollicité(s).
                        </p>
                      );
                    }
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-400">
                        <span className="flex items-center gap-2">
                          <Hourglass className="size-3.5" /> Délai de réponse dépassé sans
                          proposition.
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={marketBusy}
                            onClick={async () => {
                              setMarketBusy(true);
                              try {
                                await expandSearchMutation({ requestId: request._id as never });
                                toast.info("Recherche élargie — nouveaux professionnels inclus.");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Erreur");
                              } finally {
                                setMarketBusy(false);
                              }
                            }}
                          >
                            Élargir la recherche
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={marketBusy}
                            onClick={async () => {
                              setMarketBusy(true);
                              try {
                                await chooseForMeMutation({ requestId: request._id as never });
                                toast.success("GTEC PRO a affecté le meilleur professionnel disponible.");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Erreur");
                              } finally {
                                setMarketBusy(false);
                              }
                            }}
                          >
                            Choisir pour moi
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Propositions reçues (§9) */}
                  {quoteRequestsData.items
                    .filter((q) => q.status === "proposee")
                    .map((q) => (
                      <div
                        key={q._id}
                        className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.03] p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {q.proposal ? (
                            <span className="text-lg font-bold text-primary">
                              {Math.round(q.proposal.amount).toLocaleString("fr-FR")} FCFA
                            </span>
                          ) : null}
                          <span className="text-sm font-medium">{q.proName}</span>
                          <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                            <BadgeCheck className="size-3" /> Vérifié
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {q.proposal?.arrivalDelayMin != null && (
                            <span>🚗 Arrivée : ~{q.proposal.arrivalDelayMin} min</span>
                          )}
                          {q.proposal?.plannedAt && (
                            <span>📅 {formatDateTime(q.proposal.plannedAt)}</span>
                          )}
                          {q.proposal?.warrantyDays != null && (
                            <span>🛡️ Garantie : {q.proposal.warrantyDays} jours</span>
                          )}
                        </div>
                        {q.proposal?.message && (
                          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs">{q.proposal.message}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="halo-amber"
                            disabled={marketBusy}
                            onClick={async () => {
                              setMarketBusy(true);
                              try {
                                await acceptQuoteRequest({ quoteRequestId: q._id as never });
                                toast.success("Professionnel choisi — affectation créée et contrat lancé.");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Erreur");
                              } finally {
                                setMarketBusy(false);
                              }
                            }}
                          >
                            <CheckCircle2 className="mr-1.5 size-4" /> Accepter cette offre
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={marketBusy}
                            onClick={() => openModif(q._id)}
                          >
                            <PenLine className="mr-1.5 size-4" /> Demander une modification
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={marketBusy}
                            onClick={async () => {
                              try {
                                await declineQuoteRequest({ quoteRequestId: q._id as never });
                                toast.info("Proposition refusée.");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Erreur");
                              }
                            }}
                          >
                            <XCircle className="mr-1.5 size-4" /> Refuser
                          </Button>
                        </div>
                      </div>
                    ))}

                  {/* Autres pros sollicités (statuts) */}
                  {quoteRequestsData.items.some((q) => q.status !== "proposee") && (
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {quoteRequestsData.items
                        .filter((q) => q.status !== "proposee")
                        .map((q) => (
                          <span
                            key={q._id}
                            className="rounded-full bg-muted px-2 py-0.5"
                          >
                            {q.proName} —{" "}
                            {q.status === "envoyee"
                              ? "réponse attendue"
                              : q.status === "acceptee"
                                ? "sélectionné ✓"
                                : q.status === "refusee"
                                  ? "offre refusée"
                                  : "clôturé"}
                          </span>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Paiement en 2 tranches (V6 : 50 % avant / 50 % après) */}
            {quote && (
              <Card className="card-layered">
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Wallet className="size-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">
                        Paiement en 2 tranches
                      </CardTitle>
                      <CardDescription>
                        50 % avant le début des travaux · 50 % à la fin des
                        travaux
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {([
                    {
                      key: "avance" as const,
                      amount: advanceAmount,
                      done: advanceValidated,
                      pending: pendingMilestone === "avance",
                    },
                    {
                      key: "solde" as const,
                      amount: balanceAmount,
                      done: balanceValidated,
                      pending: pendingMilestone === "solde",
                    },
                  ]).map((t, i) => (
                    <div
                      key={t.key}
                      className={cn(
                        "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
                        t.done
                          ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                          : t.pending
                            ? "border-amber-500/30 bg-amber-500/[0.04]"
                            : "border-border/70",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full text-xs font-bold",
                          t.done
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {MILESTONE_LABELS[t.key]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          50 % · {fcfa(t.amount)}
                        </p>
                      </div>
                      {t.done ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4" /> Payé
                        </span>
                      ) : t.pending ? (
                        <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                          Vérification en cours…
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">À payer</span>
                      )}
                    </div>
                  ))}
                  {payment && (
                    <p className="text-xs text-muted-foreground">
                      Dernier paiement déclaré : {fcfa(payment.amount)} ·{" "}
                      {PAYMENT_METHODS.find((m) => m.key === payment.method)?.label ??
                        payment.method}{' '}
                      · {payment.payerPhone}
                    </p>
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
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          try {
                            openReceptionPdf({
                              received: report.status === "receptionne",
                              clientName: user?.name ?? "Client GTEC",
                              clientPhone: user?.phone ?? undefined,
                              clientEmail: user?.email ?? undefined,
                              clientAddress: user?.address ?? undefined,
                              clientCity: user?.city ?? request.city,
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
                            });
                          } catch (e) {
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Impression impossible — réessayez.",
                            );
                          }
                        }}
                      >
                        <Download className="mr-1.5 size-4" />
                        PV PDF
                      </Button>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        try {
                          openInvoicePdf({
                            invoiceNumber: invoice.number,
                            issuedAt: invoice.issuedAt,
                            invoiceStatus: invoice.status,
                            clientName: user?.name ?? "Client GTEC",
                            clientPhone: user?.phone ?? undefined,
                            clientEmail: user?.email ?? undefined,
                            clientAddress: user?.address ?? undefined,
                            clientCity: user?.city ?? request.city,
                            companyName: user?.companyName ?? undefined,
                            taxId: user?.taxId ?? undefined,
                            nationalId: user?.nationalId ?? undefined,
                            request: requestPdf,
                            quote: quotePdf,
                            payments: paymentsPdf,
                            report: report
                              ? {
                                  workDone: report.workDone,
                                  warrantyMonths: report.warrantyMonths,
                                  receivedAt: report.receivedAt,
                                  clientSignature: report.clientSignature,
                                }
                              : undefined,
                            team: teamPdf,
                          });
                        } catch (e) {
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Impression impossible — réessayez.",
                          );
                        }
                      }}
                    >
                      <Download className="mr-1.5 size-4" />
                      Facture PDF
                    </Button>
                    {report && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                        onClick={() => {
                          try {
                            openDossierPdf({
                              invoice: {
                                invoiceNumber: invoice.number,
                                issuedAt: invoice.issuedAt,
                                invoiceStatus: invoice.status,
                                clientName: user?.name ?? "Client GTEC",
                                clientPhone: user?.phone ?? undefined,
                                clientEmail: user?.email ?? undefined,
                                clientAddress: user?.address ?? undefined,
                                clientCity: user?.city ?? request.city,
                                companyName: user?.companyName ?? undefined,
                                taxId: user?.taxId ?? undefined,
                                nationalId: user?.nationalId ?? undefined,
                                request: requestPdf,
                                quote: quotePdf,
                                payments: paymentsPdf,
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
                                clientName: user?.name ?? "Client GTEC",
                                clientPhone: user?.phone ?? undefined,
                                clientEmail: user?.email ?? undefined,
                                clientAddress: user?.address ?? undefined,
                                clientCity: user?.city ?? request.city,
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
                            });
                          } catch (e) {
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Impression impossible — réessayez.",
                            );
                          }
                        }}
                      >
                        <FolderDown className="mr-1.5 size-4" />
                        Dossier complet (facture + PV)
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Colonne latérale */}
          <div className="flex flex-col gap-6">
            {/* Prochaine action : avance avant travaux, solde à la fin */}
            {request.status === "devis_accepte" && !advanceValidated && !pendingMilestone && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="card-layered border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CircleDollarSign className="size-5 text-primary" />
                      Payer l'avance (50 %)
                    </CardTitle>
                    <CardDescription>
                      Réglez {fcfa(advanceAmount)} avant le début des travaux —
                      l'équipe est affectée dès confirmation. Le solde de{" "}
                      {fcfa(balanceAmount)} sera exigé à la fin des travaux.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="halo-amber w-full"
                      onClick={() => {
                        setMilestone("avance");
                        setPayOpen(true);
                      }}
                    >
                      <Wallet className="mr-2 size-4" />
                      Payer l'avance
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {request.status === "rapport_emis" && !balanceValidated && !pendingMilestone && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="card-layered border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] to-transparent">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CircleDollarSign className="size-5 text-primary" />
                      Payer le solde (50 %)
                    </CardTitle>
                    <CardDescription>
                      Les travaux sont terminés — réglez {fcfa(balanceAmount)}
                      pour débloquer la signature du PV de réception.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="halo-amber w-full"
                      onClick={() => {
                        setMilestone("solde");
                        setPayOpen(true);
                      }}
                    >
                      <Wallet className="mr-2 size-4" />
                      Payer le solde
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {request.status === "rapport_emis" && report && balanceValidated && (
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

            {/* EXTENSIONS GTEC PRO : certificat numérique + garantie (F°12, F°13) */}
            {request.status === "terminee" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="card-layered border-emerald-500/30 bg-emerald-500/[0.04]">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BadgeCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                      Certificat numérique d'intervention
                    </CardTitle>
                    <CardDescription>
                      Preuve vérifiable par QR code : hash des preuves, check-list,
                      signature client. Garantie de travaux incluse.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {certificate ? (
                      <>
                        <p className="text-sm font-medium">
                          {certificate.number} — émis le {formatDate(certificate.issuedAt)}
                        </p>
                        <p className="break-all text-[11px] text-muted-foreground/80">
                          Empreinte SHA-256 : {certificate.payloadHash.slice(0, 40)}…
                        </p>
                        <a
                          href={`${window.location.origin}/verify/${certificate.verifyToken}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Lien de vérification publique (/verify/{certificate.verifyToken.slice(0, 10)}…)
                        </a>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Le certificat sera émis automatiquement à la réception des travaux.
                      </p>
                    )}
                    {guarantees?.some((g) => g.requestId === request._id) && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        🛡️ Garantie de travaux active jusqu'au {formatDate(guarantees.find((g) => g.requestId === request._id)!.until)} — tout signalement sera rattaché à cette mission.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Avis client (après réception) */}
            {request.status === "terminee" && myReview !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="card-layered">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Star className="size-5 text-primary" />
                      {myReview === undefined
                        ? "Votre avis"
                        : "Votre avis sur cette intervention"}
                    </CardTitle>
                    <CardDescription>
                      Votre note aide GTEC à maintenir des équipes de qualité.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {myReview === undefined ? (
                      <div className="h-16 animate-pulse rounded-xl bg-muted" />
                    ) : myReview ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star
                              key={i}
                              className={cn(
                                "size-5",
                                i <= myReview.rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground/30",
                              )}
                            />
                          ))}
                          <span className="ml-2 text-sm font-semibold">
                            {myReview.rating}/5
                          </span>
                        </div>
                        {myReview.comment && (
                          <p className="text-sm text-muted-foreground">
                            « {myReview.comment} »
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <button
                              key={i}
                              type="button"
                              onMouseEnter={() => setHoveredRating(i)}
                              onMouseLeave={() => setHoveredRating(0)}
                              onClick={() => setRating(i)}
                              className="transition-transform hover:scale-110"
                              aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
                            >
                              <Star
                                className={cn(
                                  "size-8 transition-colors",
                                  i <= (hoveredRating || rating)
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground/30",
                                )}
                              />
                            </button>
                          ))}
                        </div>
                        <Textarea
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Partagez votre expérience (optionnel)…"
                          rows={2}
                        />
                        <Button
                          className="halo-amber w-fit"
                          disabled={busy || rating < 1}
                          onClick={handleReview}
                        >
                          <Star className="mr-2 size-4" />
                          Envoyer mon avis
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* GTEC PRO 2.0 §36 : Signaler un problème (client) */}
            {request.status !== "annulee" && (
              <Card className="card-layered">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldAlert className="size-4 text-destructive" />
                    Un problème sur cette mission ?
                  </CardTitle>
                  <CardDescription>
                    Votre signalement est transmis à l'administration GTEC qui instruit le dossier et rend une décision documentée.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {requestDisputes === undefined ? (
                    <div className="h-12 animate-pulse rounded-xl bg-muted" />
                  ) : (
                    <>
                      {requestDisputes.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          {requestDisputes.map(({ dispute, resolvedByName }) => (
                            <div
                              key={dispute._id}
                              className="rounded-lg border border-border/70 px-3 py-2 text-xs"
                            >
                              <p className="font-medium">
                                {dispute.category.replace(/_/g, " ")} · {""}
                                {dispute.status === "ouverte"
                                  ? "Ouverte"
                                  : dispute.status === "en_cours"
                                    ? "En instruction"
                                    : dispute.status === "resolue"
                                      ? "Résolue"
                                      : "Rejetée"}
                              </p>
                              {dispute.decision && (
                                <p className="mt-0.5 text-muted-foreground">
                                  Décision GTEC : {dispute.decision}
                                  {resolvedByName ? ` — ${resolvedByName}` : ""}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {requestDisputes.length === 0 && (
                        <>
                          <Select
                            value={disputeCategory}
                            onValueChange={setDisputeCategory}
                          >
                            <SelectTrigger className="w-full sm:w-64">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="travaux_non_conformes">Travaux non conformes</SelectItem>
                              <SelectItem value="retard">Retard</SelectItem>
                              <SelectItem value="paiement">Paiement</SelectItem>
                              <SelectItem value="comportement">Comportement</SelectItem>
                              <SelectItem value="materiel">Matériel</SelectItem>
                              <SelectItem value="devis">Devis</SelectItem>
                              <SelectItem value="contrat">Contrat</SelectItem>
                              <SelectItem value="autre">Autre</SelectItem>
                            </SelectContent>
                          </Select>
                          <Textarea
                            value={disputeDescription}
                            onChange={(e) => setDisputeDescription(e.target.value)}
                            placeholder="Décrivez le problème (10 caractères minimum)…"
                            rows={2}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="self-end text-destructive"
                            disabled={busy || disputeDescription.trim().length < 10}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await createDispute({
                                  requestId: request._id as never,
                                  category: disputeCategory as never,
                                  description: disputeDescription.trim(),
                                });
                                toast.success("Problème signalé — GTEC va instruire le dossier");
                                setDisputeDescription("");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Erreur");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <ShieldAlert className="mr-1.5 size-4" />
                            Signaler un problème
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
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
            <DialogTitle>
              {milestone === "avance" ? "Payer l'avance" : "Payer le solde"} —{" "}
              devis {quote?.number}
            </DialogTitle>
            <DialogDescription>
              Paiement en 2 tranches : 50 % avant les travaux, 50 % à la fin.
              Vous réglez ici : {MILESTONE_LABELS[milestone]}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {/* Sélecteur de tranche (50/50) */}
            <div className="grid grid-cols-2 gap-2">
              {([
                {
                  key: "avance" as const,
                  amount: advanceAmount,
                  disabled: advanceValidated || !!pendingMilestone,
                },
                {
                  key: "solde" as const,
                  amount: balanceAmount,
                  disabled:
                    balanceValidated ||
                    !advanceValidated ||
                    !!pendingMilestone,
                },
              ]).map((t) => (
                <button
                  key={t.key}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    milestone === t.key
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40",
                    t.disabled && "opacity-40",
                  )}
                  disabled={t.disabled}
                  onClick={() => setMilestone(t.key)}
                >
                  <span className="block text-sm font-medium">
                    {t.key === "avance" ? "1ʳᵉ tranche" : "2ᵉ tranche"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {MILESTONE_LABELS[t.key]} · {fcfa(t.amount)}
                  </span>
                </button>
              ))}
            </div>
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

            {/* GTEC PRO 2.0 (§20/§23/§29) : passerelle sécurisée — MoMo + carte,
                checkout hébergé chez un Établissement de Paiement agréé. */}
            {(method === "mtn_momo" || method === "orange_money" || method === "carte_visa") &&
              channels?.find((c) => c.channel === "cinetpay")?.available && (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
                {gatewayFlow ? (
                  <>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      {gatewayFlow.status === "en_attente" &&
                        "Paiement sur la page sécurisée — la confirmation est vérifiée automatiquement."}
                      {gatewayFlow.status === "reussie" && "Paiement confirmé — merci !"}
                      {gatewayFlow.status === "echouee" && "Paiement non abouti."}
                    </p>
                    {gatewayFlow.status === "en_attente" && (
                      <p className="text-xs text-muted-foreground">
                        Si la page de paiement s'est fermée, rouvrez-la : la confirmation
                        serveur reste valable et cette boîte se mettra à jour.
                      </p>
                    )}
                    {gatewayFlow.status === "echouee" && (
                      <Button variant="outline" size="sm" onClick={() => setGatewayFlow(null)}>
                        Nouvel essai
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Paiement sécurisé {method === "carte_visa" ? "par carte" : "Mobile Money"} — CinetPay
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {method === "carte_visa"
                        ? "Visa/Mastercard acceptées : vous êtes redirigé vers une page de paiement sécurisée (vos données de carte ne transitent jamais par GTEC PRO, §29)."
                        : "MTN MoMo, Orange Money et carte acceptés sur la page sécurisée. Les fonds sont conservés par un Établissement de Paiement agréé jusqu'à la réception des travaux (§20)."}
                    </p>
                    <Button
                      className="halo-amber"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        if (method !== "carte_visa" && !/^[+0-9 ]{8,}$/.test(payerPhone.trim())) {
                          toast.error("Numéro de téléphone invalide.");
                          return;
                        }
                        setBusy(true);
                        try {
                          const res = await startGatewayPayment({
                            quoteId: quote!._id,
                            milestone,
                            rail: method as "mtn_momo" | "orange_money" | "carte_visa",
                            payerPhone: payerPhone.trim() || undefined,
                            returnUrl: window.location.href,
                          });
                          if (res.kind === "redirect") {
                            setGatewayFlow({ paymentId: res.paymentId, status: "en_attente" });
                            window.open(res.url, "_blank");
                            toast.info("Page de paiement ouverte — finalisez puis revenez ici.");
                          } else {
                            toast.info(res.reason);
                          }
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Paiement impossible");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Wallet className="mr-2 size-4" />
                      Payer {milestone === "avance" ? fcfa(advanceAmount) : fcfa(balanceAmount)}
                    </Button>
                  </>
                )}
              </div>
            )}

              {/* Messagerie (§11) : fil de discussion de la demande si une salle
                existe et que l'utilisateur connecté y participe (client,
                bénéficiaire ou technicien lié) — sinon la liste générale des
                conversations, jamais une conversation d'un non participant. */}
              <div className="mt-4">
                {requestRoomId ? (
                  <ConversationPanel
                    roomId={requestRoomId}
                    className="max-w-md"
                  />
                ) : (
                  <ConversationListPanel className="max-w-md" />
                )}
              </div>

              {/* Mobile Money : flux automatique (V5) */}
            {(method === "mtn_momo" || method === "orange_money") && (
              <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                {momoFlow && momoFlow.provider === (method === "mtn_momo" ? "mtn" : "orange") ? (
                  <>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      {momoFlow.status === "en_attente" &&
                        "Demande envoyée — validez sur votre téléphone avec votre code secret Mobile Money."}
                      {momoFlow.status === "reussie" && "Paiement confirmé — merci !"}
                      {momoFlow.status === "echouee" && "Paiement refusé par l'opérateur."}
                      {momoFlow.status === "expiree" && "Demande expirée sans confirmation."}
                    </p>
                    {momoFlow.provider === "mtn" && momoFlow.status === "en_attente" && (
                      <p className="text-xs text-muted-foreground">
                        Une notification MTN MoMo a été poussée sur {payerPhone}. Entrez
                        votre code secret pour valider {quote ? fcfa(quote.total) : "la transaction"}.
                        Le statut se met à jour automatiquement (jusqu'à 2 min).
                      </p>
                    )}
                    {momoFlow.provider === "orange" && momoFlow.status === "en_attente" && (
                      <p className="text-xs text-muted-foreground">
                        Terminez le paiement sur la page Orange Money puis revenez ici :
                        l'admin finalise la validation dès réception de la notification
                        opérateur.
                      </p>
                    )}
                    {(momoFlow.status === "echouee" || momoFlow.status === "expiree") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setMomoFlow(null)}
                      >
                        Nouvel essai / paiement manuel
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Paiement automatique {method === "mtn_momo" ? "MTN MoMo" : "Orange Money"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {method === "mtn_momo"
                        ? "Entrez votre numéro, validez sur votre téléphone : GTEC reçoit la confirmation en direct et enclenche l'affectation de l'équipe — sans justificatif à envoyer."
                        : "Vous êtes redirigé vers la page de paiement sécurisée Orange Money, puis revenez sur GTEC : la confirmation opérateur finalise automatiquement votre dossier."}
                    </p>
                    <Button
                      className="halo-amber"
                      size="sm"
                      disabled={busy || !payerPhone.trim()}
                      onClick={() => void handleAutoMomo(method === "mtn_momo" ? "mtn" : "orange")}
                    >
                      <Wallet className="mr-2 size-4" />
                      Payer automatiquement{" "}
                      {milestone === "avance" ? fcfa(advanceAmount) : fcfa(balanceAmount)}
                    </Button>
                    <details className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Payer plutôt manuellement (transfert vers le numéro marchand)
                      </summary>
                      {(() => {
                        const merchant = MERCHANT_NUMBERS[method];
                        return (
                          <div className="mt-2 flex flex-col gap-2">
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
                              Utilisez votre nom en référence, puis cliquez sur « Payer »
                              ci-dessous pour déclarer le transfert (vérification par un
                              agent GTEC).
                            </p>
                          </div>
                        );
                      })()}
                    </details>
                  </>
                )}
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
                  : method === "mtn_momo" || method === "orange_money"
                    ? "Déclarer un transfert manuel"
                    : "Payer"}{" "}
              {milestone === "avance" ? fcfa(advanceAmount) : fcfa(balanceAmount)}
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

      {/* MARCHÉ (§9) : demander une modification d'une proposition de devis */}
      <Dialog open={modifOpen} onOpenChange={setModifOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander une modification</DialogTitle>
            <DialogDescription>
              Précisez ce que vous souhaitez ajuster — le professionnel pourra
              soumettre une nouvelle proposition.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={modifNote}
            onChange={(e) => setModifNote(e.target.value)}
            placeholder="Ex. : pouvez-vous inclure le remplacement du disjoncteur ?"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifOpen(false)}>
              Retour
            </Button>
            <Button
              className="halo-amber"
              disabled={marketBusy || modifNote.trim().length < 5}
              onClick={submitModif}
            >
              Envoyer la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
