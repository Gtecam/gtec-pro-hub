import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  Download,
  FileText,
  IdCard,
  MapPin,
  Phone,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { AppShell, StatusBadge } from "@/components/gtec";
import { Building2, UserSearch } from "lucide-react";
import { MyClientProfile } from "@/components/MyClientProfile";
import { PhoneVerifiedBadge } from "@/components/PhoneVerifiedBadge";
import { AppointmentsClientCard } from "@/components/AppointmentsClientCard";
import { FavoritesCard } from "@/components/FavoritesCard";
import { AdvisorHistoryCard } from "@/components/AdvisorHistoryCard";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  CITIES,
  CONTRACT_STATUS_META,
  contractFrequencyLabel,
  fcfa,
  formatDate,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_LABEL,
  SERVICES,
  statusMeta,
} from "@/lib/gtec";
import { openMaintenancePdf, openMaintenanceReceiptPdf } from "@/lib/invoicePdf";
import { compressImageIfNeeded, dataUrlBytes, humanSize } from "@/lib/imageCompress";

function serviceIcon(key: string) {
  return SERVICES.find((s) => s.key === key)?.icon ?? Sparkles;
}

function serviceLabel(key: string) {
  return SERVICES.find((s) => s.key === key)?.label ?? key;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const requests = useQuery(api.gtec.listMyRequests);
  const contracts = useQuery(api.gtec.listMyContracts);
  const contractPays = useQuery(api.gtec.listMyContractPayments);
  const payMonthly = useMutation(api.gtec.payContractMonthly);
  const cancelRequest = useMutation(api.gtec.cancelRequest);
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState("mtn_momo");
  const [payPhone, setPayPhone] = useState("");
  const [payProof, setPayProof] = useState<string | null>(null);
  const payProofRef = useRef<HTMLInputElement | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<string | null>(null);

  const payTargetContract = contracts?.find(
    (c) => c.contract._id === payTarget,
  )?.contract;
  const payTargetDue = (() => {
    if (!payTarget || !contractPays) return { paidCount: 0, pending: false };
    const row = contractPays.find((p) => p.contractId === payTarget);
    const pays = row?.payments ?? [];
    return {
      paidCount: pays.filter((p) => p.status === "valide").length,
      pending: pays.some((p) => p.status === "en_attente"),
    };
  })();

  const pickPayProof = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPayError("Seule une photo du reçu est acceptée.");
      return;
    }
    const res = await compressImageIfNeeded(file);
    if (!res.ok) {
      setPayError(`Photo trop lourde même après compression (max ${MAX_FILE_SIZE_LABEL}).`);
      return;
    }
    if (res.compressed) {
      toast.success(`Photo compressée : ${humanSize(res.originalSize)} → ${humanSize(dataUrlBytes(res.dataUrl))}.`);
      setPayProof(res.dataUrl);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPayProof(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submitMonthlyPayment = async () => {
    if (!payTargetContract) return;
    if (!/^[+0-9 ]{8,}$/.test(payPhone.trim())) {
      setPayError("Numéro de téléphone invalide.");
      return;
    }
    if (payMethod === "especes" && !payProof) {
      setPayError("Joignez la photo du reçu (paiement en espèces).");
      return;
    }
    setPayBusy(true);
    setPayError(null);
    try {
      await payMonthly({
        contractId: payTargetContract._id as never,
        method: payMethod as never,
        payerPhone: payPhone.trim(),
        proofPhotoUrl: payProof ?? undefined,
      });
      toast.success("Mensualité envoyée — vérification par GTEC en cours.");
      setPayTarget(null);
      setPayPhone("");
      setPayProof(null);
      setPayMethod("mtn_momo");
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPayBusy(false);
    }
  };
  const openContractReceipt = (contractId: string, periodIndex?: number) => {
    const contract = contracts?.find((c) => c.contract._id === contractId)?.contract;
    const row = (contractPays ?? []).find((p) => p.contractId === contractId);
    const pays = (row?.payments ?? [])
      .filter((p) => p.status === "valide")
      .sort((a, b) =>
        periodIndex ? a.periodIndex - b.periodIndex : b.periodIndex - a.periodIndex,
      );
    const p = periodIndex ? pays.find((x) => x.periodIndex === periodIndex) : pays[0];
    if (!contract || !p) {
      toast.info(
        "Aucune mensualité réglée — le reçu est disponible après validation par GTEC.",
      );
      return;
    }
    try {
      openMaintenanceReceiptPdf({
        payment: {
          periodIndex: p.periodIndex,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          amount: p.amount,
          method: p.method,
          payerPhone: p.payerPhone,
          status: p.status,
          validatedAt: p.validatedAt,
          externalRef: p.externalRef,
          bankRef: p.bankRef,
          bankName: p.bankName,
        },
        contract: {
          reference: contract.reference,
          title: contract.title,
          serviceLabel: serviceLabel(contract.serviceKey),
          frequencyLabel: contractFrequencyLabel(contract.frequency),
          city: contract.city,
          address: contract.address,
          monthlyAmount: contract.monthlyAmount,
          startDate: contract.startDate,
          endDate: contract.endDate,
        },
        clientName: user?.name ?? "Client GTEC",
        clientPhone: user?.phone ?? undefined,
        clientEmail: user?.email ?? undefined,
        clientAddress: user?.address ?? undefined,
        clientCity: user?.city ?? contract.city,
        paidCount: pays.length,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Impression impossible — réessayez.",
      );
    }
  };

  const updateIdentity = useMutation(api.gtec.updateClientIdentity);

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Identité client — formulaire prérempli depuis le profil existant.
  const u = user as
    | (NonNullable<typeof user> & {
        firstName?: string;
        lastName?: string;
        nationalId?: string;
        gender?: string;
        birthDate?: string;
        altPhone?: string;
        address?: string;
        quarter?: string;
        customerType?: string;
        companyName?: string;
        taxId?: string;
        idDocumentUrl?: string;
        phoneVerified?: boolean;
      })
    | undefined;
  const identityComplete = !!(u?.firstName && u?.lastName && u?.nationalId);
  const [showIdentity, setShowIdentity] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [quarter, setQuarter] = useState("");
  const [customerType, setCustomerType] = useState("particulier");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState(false);
  const idInputRef = useRef<HTMLInputElement | null>(null);

  const openIdentity = () => {
    setFirstName(u?.firstName ?? u?.name?.split(" ")[0] ?? "");
    setLastName(u?.lastName ?? u?.name?.split(" ").slice(1).join(" ") ?? "");
    setNationalId(u?.nationalId ?? "");
    setGender(u?.gender ?? "");
    setBirthDate(u?.birthDate ?? "");
    setPhone(u?.phone ?? "");
    setAltPhone(u?.altPhone ?? "");
    setCity(u?.city ?? "");
    setAddress(u?.address ?? "");
    setQuarter(u?.quarter ?? "");
    setCustomerType(u?.customerType ?? "particulier");
    setCompanyName(u?.companyName ?? "");
    setTaxId(u?.taxId ?? "");
    setIdDocUrl(u?.idDocumentUrl ?? null);
    setShowIdentity(true);
  };

  const pickIdDoc = async () => {
    const file = idInputRef.current?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Seule une photo de la pièce d'identité est acceptée.");
      return;
    }
    const res = await compressImageIfNeeded(file);
    if (!res.ok) {
      toast.error(`Photo trop lourde même après compression (max ${MAX_FILE_SIZE_LABEL}).`);
      return;
    }
    if (res.compressed) {
      toast.success(`Photo compressée : ${humanSize(res.originalSize)} → ${humanSize(dataUrlBytes(res.dataUrl))}.`);
      setIdDocUrl(res.dataUrl);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setIdDocUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const saveIdentity = async () => {
    setBusyId(true);
    try {
      await updateIdentity({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nationalId: nationalId.trim(),
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        phone: phone.trim(),
        altPhone: altPhone.trim() || undefined,
        city: city,
        address: address.trim(),
        quarter: quarter.trim() || undefined,
        customerType,
        companyName: companyName.trim() || undefined,
        taxId: taxId.trim() || undefined,
        idDocumentUrl: idDocUrl ?? undefined,
      });
      toast.success("Identité enregistrée");
      setShowIdentity(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelRequest({
        requestId: cancelTarget as never,
        reason: cancelReason || "Annulée par le client",
      });
      toast.success("Demande annulée");
      setCancelTarget(null);
      setCancelReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const open = (requests ?? []).filter(
    (r) => !["terminee", "annulee"].includes(r.request.status),
  );
  const closed = (requests ?? []).filter((r) =>
    ["terminee", "annulee"].includes(r.request.status),
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        {/* En-tête */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Espace client
            </p>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight">
              Bonjour{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Demande, devis, paiement, équipe, rapport et facture : suivez
              chaque intervention au même endroit.
            </p>
            <a
              href="tel:+237655094228"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-80"
            >
              <Phone className="size-3.5" />
              Support GTEC : 655 09 42 28
            </a>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="halo-amber" onClick={() => navigate("/dashboard/new")}>
              <Plus className="mr-2 size-4" />
              Nouvelle demande
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/diaspora")}>
              🌍 Mode Diaspora
            </Button>
          </div>
        </div>

        {/* Numéro de téléphone vérifié */}
        <PhoneVerifiedBadge variant="full" />

        {/* EXTENSION F°5/F°33 : dossier technique des bâtiments */}
        <Card className="card-layered border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Dossier technique de mes bâtiments</p>
              <p className="text-xs text-muted-foreground">
                Équipements, QR codes, garanties, documents et historique — un
                dossier permanent par site, avec accès temporaires pour vos techniciens.
              </p>
            </div>              <Button variant="outline" size="sm" onClick={() => navigate("/buildings")}>
              Ouvrir <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Dossier technique du bâtiment */}
        <Card className="card-layered border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Dossier technique</p>
              <p className="text-xs text-muted-foreground">
                Équipements, QR codes, garanties, documents et historique d'un
                bâtiment de votre fiche.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/b/")}>
              Ouvrir <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </CardContent>
        </Card>

        {/* §8 : prise de rendez-vous chez un professionnel vérifié */}
        <AppointmentsClientCard />

        {/* Phase 5 GTEC AI : historique des sessions du conseiller (F°1-F°3) */}
        <AdvisorHistoryCard />

        {/* §35 : favoris (techniciens, entreprises, services) */}
        <FavoritesCard />

        {/* Identité client */}
        <Card
          className={cn(
            "card-layered",
            !identityComplete && "border-amber-500/40 bg-amber-500/[0.04]",
          )}
        >
          <CardContent className="flex flex-wrap items-center gap-4 py-4">
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-xl",
                identityComplete
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              <IdCard className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {identityComplete
                  ? `Identité vérifiée — ${u?.firstName} ${u?.lastName}`
                  : "Complétez votre identité"}
                {u?.phoneVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                    <ShieldCheck className="size-3.5" /> Numéro vérifié
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {identityComplete
                  ? `${u?.nationalId ? `CNI ${u.nationalId} · ` : ""}${u?.phone ?? ""}${u?.address ? ` · ${u.address}, ${u.city}` : ""}`
                  : "Prénom, nom, pièce d'identité et adresse permettent d'accélérer vos interventions et la facturation."}
              </p>
            </div>
            <Button variant={identityComplete ? "outline" : "default"} size="sm" onClick={openIdentity}>
              {identityComplete ? "Modifier" : "Renseigner mon identité"}
            </Button>
          </CardContent>
        </Card>

        {/* Mon profil client (§2) : adresses enregistrées + préférences */}
        <MyClientProfile />

        {/* Parcours garanti V1 */}
        <Card className="card-layered border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
            {[
              { icon: FileText, label: "Demande & devis" },
              { icon: Wallet, label: "Paiement Mobile Money" },
              { icon: CalendarClock, label: "Équipe planifiée" },
              { icon: ShieldCheck, label: "Rapport & PV signé" },
              { icon: Receipt, label: "Facture" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-2 text-sm font-medium">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                {label}
              </span>
            ))}
          </CardContent>
        </Card>

        {/* Demandes en cours */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Demandes en cours</h2>
          {requests === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : open.length === 0 ? (
            <Card className="card-layered">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="size-6" />
                </div>
                <p className="font-display text-lg font-semibold">
                  Aucune demande en cours
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Décrivez votre besoin en 2 minutes : un technicien GTEC
                  qualifié prend le relais.
                </p>
                <Button className="mt-2" onClick={() => navigate("/dashboard/new")}>
                  Créer une demande <ArrowRight className="ml-2 size-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {open.map(({ request, quote }) => {
                const Icon = serviceIcon(request.serviceKey);
                const meta = statusMeta(request.status);
                return (
                  <motion.div
                    key={request._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card
                      className="card-layered group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
                      onClick={() => navigate(`/dashboard/requests/${request._id}`)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="size-5" />
                            </span>
                            <div>
                              <CardTitle className="text-base">
                                {request.title}
                              </CardTitle>
                              <CardDescription className="mt-0.5 flex items-center gap-1">
                                {request.reference} · {serviceLabel(request.serviceKey)}
                              </CardDescription>
                            </div>
                          </div>
                          <StatusBadge status={request.status} />
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {request.description}
                        </p>
                        <div className="flex items-center justify-between border-t border-border/60 pt-3">
                          <span className="text-xs text-muted-foreground">
                            {quote && request.status !== "nouvelle"
                              ? `Devis : ${fcfa(quote.total)}`
                              : meta.hint}
                          </span>
                          {request.status === "nouvelle" ? (
                            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                              <UserSearch className="size-3.5" /> Choisir un pro
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-sm font-medium text-primary">
                              Ouvrir
                              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Historique */}
        {closed.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Historique</h2>
            <div className="overflow-hidden rounded-xl border border-border/70">
              {closed.map(({ request }) => (
                <button
                  key={request._id}
                  className="flex w-full items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50"
                  onClick={() => navigate(`/dashboard/requests/${request._id}`)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-medium">{request.reference}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {request.title}
                    </span>
                  </span>
                  <StatusBadge status={request.status} />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Contrats de maintenance */}
        {contracts !== undefined && contracts.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">
              Contrats de maintenance
            </h2>
            {contracts.map(({ contract, visits }) => {
              const meta =
                CONTRACT_STATUS_META[contract.status] ??
                CONTRACT_STATUS_META.actif;
              const done = visits.filter((v) => v.status === "faite").length;
              const next = visits.find(
                (v) => v.status === "planifiee",
              );
              return (
                <Card key={contract._id} className="card-layered">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="size-4 text-primary" />
                        {contract.title}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {contract.status === "actif" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPayError(null);
                              setPayTarget(contract._id);
                            }}
                          >
                            <Wallet className="mr-1.5 size-4" />
                            Payer la mensualité
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            try {
                              openMaintenancePdf({
                                contract: {
                                  reference: contract.reference,
                                  title: contract.title,
                                  serviceLabel: serviceLabel(contract.serviceKey),
                                  description: contract.description,
                                  frequencyLabel: contractFrequencyLabel(contract.frequency),
                                  city: contract.city,
                                  address: contract.address,
                                  monthlyAmount: contract.monthlyAmount,
                                  status: contract.status,
                                  startDate: contract.startDate,
                                  endDate: contract.endDate,
                                },
                                clientName: user?.name ?? "Client GTEC",
                                clientPhone: user?.phone ?? undefined,
                                clientEmail: user?.email ?? undefined,
                                clientAddress: user?.address ?? undefined,
                                clientCity: user?.city ?? contract.city,
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
                                  : "Impression impossible — réessayez.",
                              );
                            }
                          }}
                        >
                          <Download className="mr-1.5 size-4" />
                          Facture PDF
                        </Button>
                        {contract.status === "actif" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const pays = ((contractPays ?? []).find(
                                (p) => p.contractId === contract._id,
                              )?.payments ?? []).filter((p) => p.status === "valide");
                              if (pays.length === 0) {
                                toast.info(
                                  "Aucune mensualité réglée — le reçu est disponible après validation par GTEC.",
                                );
                                return;
                              }
                              if (pays.length === 1) {
                                openContractReceipt(contract._id);
                              } else {
                                setReceiptTarget(contract._id);
                              }
                            }}
                          >
                            <Receipt className="mr-1.5 size-4" />
                            Reçu PDF
                          </Button>
                        )}
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
                    <CardDescription>
                      {contract.reference} · {contractFrequencyLabel(contract.frequency)} ·{" "}
                      {fcfa(contract.monthlyAmount)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-muted/60 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Prochaine visite</p>
                        <p className="flex items-center gap-1.5 font-medium">
                          <CalendarClock className="size-3.5 text-primary" />
                          {contract.status === "actif" && next
                            ? formatDate(next.scheduledAt)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/60 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Visites faites</p>
                        <p className="font-medium">
                          {done} / {visits.length}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/60 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Mensualités payées</p>
                        <p className="font-medium">
                          {(contractPays ?? []).find((p) => p.contractId === contract._id)
                            ?.payments.filter((p) => p.status === "valide").length ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/60 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Jusqu'au</p>
                        <p className="font-medium">{formatDate(contract.endDate)}</p>
                      </div>
                    </div>
                    {visits.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {visits
                          .slice()
                          .reverse()
                          .slice(0, 4)
                          .map((v) => (
                            <div
                              key={v._id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                            >
                              <span className="flex items-center gap-2">
                                <CalendarCheck
                                  className={cn(
                                    "size-4",
                                    v.status === "faite" ? "text-primary" : "text-muted-foreground",
                                  )}
                                />
                                <span className="font-medium">
                                  {formatDate(v.scheduledAt)}
                                </span>
                                {v.doneAt && (
                                  <span className="text-xs text-muted-foreground">
                                    (réalisée le {formatDate(v.doneAt)})
                                  </span>
                                )}
                              </span>
                              <span className="max-w-[50%] truncate text-xs text-muted-foreground">
                                {v.report ?? (v.status === "planifiee" ? "Planifiée" : "Annulée")}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}
      </div>

      {/* Annulation */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
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
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Retour
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              <X className="mr-2 size-4" /> Annuler la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Identité */}
      <Dialog open={showIdentity} onOpenChange={setShowIdentity}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Mon identité</DialogTitle>
            <DialogDescription>
              Ces informations accélèrent le traitement de vos demandes et la
              facturation. Elles restent confidentielles.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Prénom *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Nom *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">CNI / Passeport *</Label>
                <Input
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="Numéro de la pièce"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Date de naissance</Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Sexe</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homme">Homme</SelectItem>
                    <SelectItem value="femme">Femme</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Téléphone *</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="6 XX XX XX XX"
                  inputMode="tel"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Téléphone secondaire</Label>
                <Input
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  inputMode="tel"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Ville *</Label>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
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
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value)}
                  placeholder="Ex. : Bonapriso"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Adresse</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rue, immeuble, repère…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Type de client *</Label>
                <Select value={customerType} onValueChange={setCustomerType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="particulier">Particulier</SelectItem>
                    <SelectItem value="entreprise">Entreprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {customerType === "entreprise" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm">Raison sociale *</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm">N° contribuable (NUI)</Label>
                    <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
                  </div>
                </>
              )}
            </div>

            {/* Photo de la pièce d'identité */}
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
              <Label className="text-sm">Photo de la pièce d'identité</Label>
              <input
                ref={idInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickIdDoc}
              />
              <div className="flex items-center gap-3">
                {idDocUrl ? (
                  <img
                    src={idDocUrl}
                    alt="Pièce d'identité"
                    className="size-14 rounded-lg object-cover ring-1 ring-border"
                  />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <IdCard className="size-5" />
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => idInputRef.current?.click()}
                >
                  {idDocUrl ? "Remplacer la photo" : "Joindre une photo"}
                </Button>
                {idDocUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setIdDocUrl(null)}>
                    Retirer
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Optionnelle mais recommandée (max {MAX_FILE_SIZE_LABEL}) — utilisée uniquement
                par l'administration GTEC.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIdentity(false)}>
              Annuler
            </Button>
            <Button
              className="halo-amber"
              disabled={
                busyId ||
                firstName.trim().length < 2 ||
                lastName.trim().length < 2 ||
                nationalId.trim().length < 6 ||
                phone.trim().length < 6 ||
                !city ||
                !address.trim()
              }
              onClick={saveIdentity}
            >
              {busyId ? "Enregistrement…" : "Enregistrer mon identité"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Choix de l'échéance pour le reçu */}
      <Dialog
        open={!!receiptTarget}
        onOpenChange={(o) => !o && setReceiptTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reçu de mensualité</DialogTitle>
            <DialogDescription>
              Choisissez l'échéance à imprimer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {(() => {
              const row = (contractPays ?? []).find(
                (p) => p.contractId === receiptTarget,
              );
              const pays = (row?.payments ?? [])
                .filter((p) => p.status === "valide")
                .sort((a, b) => b.periodIndex - a.periodIndex);
              return pays.map((p) => (
                <div
                  key={p._id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Échéance n°{p.periodIndex} · {fcfa(p.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                      {p.validatedAt ? ` · encaissée le ${formatDate(p.validatedAt)}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      openContractReceipt(receiptTarget as string, p.periodIndex);
                      setReceiptTarget(null);
                    }}
                  >
                    <Receipt className="mr-1.5 size-4" />
                    Reçu
                  </Button>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Paiement de mensualité */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Payer la mensualité{payTargetContract ? ` — ${payTargetContract.reference}` : ""}
            </DialogTitle>
            <DialogDescription>
              {payTargetContract
                ? `Échéance n°${payTargetDue.paidCount + 1} · ${payTargetContract.monthlyAmount.toLocaleString("fr-FR")} FCFA — vérifiée par GTEC après envoi.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Moyen de paiement</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn_momo">MTN MoMo</SelectItem>
                  <SelectItem value="orange_money">Orange Money</SelectItem>
                  <SelectItem value="virement">Virement bancaire</SelectItem>
                  <SelectItem value="especes">Espèces (reçu photo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Numéro payeur</Label>
              <Input
                value={payPhone}
                onChange={(e) => setPayPhone(e.target.value)}
                placeholder="6 XX XX XX XX"
                inputMode="tel"
              />
            </div>
            {payMethod === "especes" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Photo du reçu</Label>
                <input
                  ref={payProofRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickPayProof(e.target.files?.[0])}
                />
                <Button variant="outline" size="sm" onClick={() => payProofRef.current?.click()}>
                  {payProof ? "Remplacer la photo" : "Joindre une photo"}
                </Button>
              </div>
            )}
            {payError && <p className="text-xs text-destructive">{payError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Retour
            </Button>
            <Button className="halo-amber" disabled={payBusy} onClick={submitMonthlyPayment}>
              {payBusy ? "Envoi…" : "Envoyer la mensualité"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export { serviceIcon, serviceLabel };

// réutilisation utilitaire pour l'adresse affichée dans les cartes
export function AddressLine({ address, city }: { address: string; city: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <MapPin className="size-3.5" />
      {address}, {city}
    </span>
  );
}
