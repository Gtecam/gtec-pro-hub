import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Banknote,
  FileText,
  Landmark,
  Percent,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  FileBadge,
  FileUp,
  GraduationCap,
  HardHat,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Plus,
  Send,
  Sparkles,
  Star,
  Trash2,
  Truck,
  UserCheck,
  UserRound,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/gtec";
import { PhoneVerifiedBadge } from "@/components/PhoneVerifiedBadge";
import { ReportForm } from "@/components/ReportForm";
import {
  CredentialForm,
  type InstitutionLite,
} from "@/components/CredentialForm";
import { MyProfile } from "@/components/MyProfile";
import { credentialBadge } from "@/lib/institutions";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  formatGps,
  gmapsDirectionsUrl,
  gmapsCoordsUrl,
  haversineKm,
  type GpsCoords,
} from "@/lib/gps";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { NavigationOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITIES, fcfa, formatDate, formatDateTime, MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL, PAYMENT_METHODS } from "@/lib/gtec";
import {
  CERTIFICATION_SUGGESTIONS,
  DEGREES,
  EXPERIENCE_BANDS,
  NOMENCLATURE,
  SKILLS_BY_DOMAIN,
  degreeByKey,
  nomenSpecialtyByCode,
} from "@/lib/nomenclature";
import { compressImageIfNeeded, dataUrlBytes, humanSize } from "@/lib/imageCompress";
import { Navigate } from "react-router";

// Prix officiels GTEC PRO 2.0 (§26) — alignés sur le backend (SUBSCRIPTION_PRICES).
const PLANS = [
  { key: "mensuel", label: "Mensuel", price: "6 000 FCFA", hint: "30 jours" },
  { key: "trimestriel", label: "Trimestriel", price: "20 000 FCFA", hint: "90 jours · 2 mois offerts sur l'année" },
  { key: "annuel", label: "Annuel", price: "55 000 FCFA", hint: "365 jours · meilleur tarif" },
] as const;

// Disponibilité technicien (§12 cahier des charges 2.0).
const AVAILABILITY_OPTIONS = [
  { key: "disponible", label: "Disponible" },
  { key: "occupe", label: "Occupé" },
  { key: "en_intervention", label: "En intervention" },
  { key: "indisponible", label: "Indisponible" },
  { key: "conge", label: "En congé" },
  { key: "hors_ligne", label: "Hors ligne" },
] as const;

type AvailabilityKey = (typeof AVAILABILITY_OPTIONS)[number]["key"];

function useTechnicianReportMutation() {
  return useMutation(api.gtec.technicianSubmitReport);
}

const PAYOUT_STATUS_STYLES: Record<string, string> = {
  "dû": "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  "payé": "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
};

// ---------- documents justificatifs (candidature technicien) ----------

type DocumentItem = { kind: string; label: string; url: string };

const DOC_KINDS = [
  { value: "cni", label: "Pièce d'identité (CNI / passeport)" },
  { value: "diploma", label: "Diplôme" },
  { value: "certificate", label: "Certificat / licence" },
  { value: "attestation", label: "Attestation d'expérience / travail" },
  { value: "other", label: "Autre justificatif" },
] as const;

const MAX_DOC_SIZE = MAX_FILE_SIZE; // 5 Mo par document (data URL)

function docKindLabel(kind: string): string {
  return DOC_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Téléversement de documents justificatifs — CNI + diplôme obligatoires. */
function DocumentsUploader({
  documents,
  onChange,
  requiredKinds = ["cni", "diploma"],
  disabled,
}: {
  documents: DocumentItem[];
  onChange: (docs: DocumentItem[]) => void;
  requiredKinds?: string[];
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const [kind, setKind] = useState<string>("cni");
  const [customLabel, setCustomLabel] = useState("");
  const [reading, setReading] = useState(false);

  const missing = requiredKinds.filter(
    (k) => !documents.some((d) => d.kind === k),
  );

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    });

  const handlePick = async (file: File | undefined, index: number) => {
    if (!file || index < 0) return;
    // Images : compression automatique en mode document (texte lisible).
    // Convex plafonne chaque champ à 1 Mio : on cible ~350 Ko par pièce pour
    // que le dossier complet (plusieurs pièces) reste sous la limite.
    if (file.type.startsWith("image/")) {
      if (file.type === "image/gif" || file.type === "image/svg+xml") {
        toast.error(`${file.name} : format non accepté (image ou PDF).`);
        return;
      }
      const target = 350 * 1024; // ~350 Ko par pièce (plafond champ Convex : 1 Mio)
      // PNG/photo lourd : on compresse vers JPEG (gain x3 à x10 typique).
      const needsCompress = file.size > target || file.type !== "image/jpeg";
      if (needsCompress || file.size > MAX_DOC_SIZE) {
        const res = await compressImageIfNeeded(file, {
          maxBytes: target,
          mode: "document-tight",
        });
        if (!res.ok) {
          toast.error(`Document illisible (${file.name}).`);
          return;
        }
        setReading(true);
        try {
          onChange(
            documents.map((d, j) => (j === index ? { ...d, url: res.dataUrl } : d)),
          );
          if (res.compressed) {
            toast.success(
              `${file.name} compressé : ${humanSize(res.originalSize)} → ${humanSize(dataUrlBytes(res.dataUrl))}.`,
            );
          } else {
            toast.success("Document joint");
          }
        } finally {
          setReading(false);
        }
        return;
      }
    }
    // PDF et autres : la limite stricte s'applique (pas de recompression possible).
    if (file.size > MAX_DOC_SIZE) {
      toast.error(
        `Document trop lourd (${humanSize(file.size)}) — maximum ${humanSize(MAX_DOC_SIZE)}. Les photos sont compressées automatiquement ; préférez une photo de votre document ou un PDF plus léger.`,
      );
      return;
    }
    setReading(true);
    try {
      const url = await readFile(file);
      onChange(documents.map((d, j) => (j === index ? { ...d, url } : d)));
      toast.success("Document joint");
    } catch {
      toast.error("Lecture du fichier impossible.");
    } finally {
      setReading(false);
    }
  };

  const addSlot = () => {
    const label =
      kind === "other" && customLabel.trim()
        ? customLabel.trim()
        : docKindLabel(kind);
    onChange([...documents, { kind, label, url: "" }]);
    setCustomLabel("");
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const index = pendingIndexRef.current;
          void handlePick(e.target.files?.[0], index ?? -1);
          e.target.value = "";
        }}
      />

      {documents.map((doc, i) => (
        <div
          key={i}
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-xl border border-border/70 px-3 py-2",
            !doc.url && "border-dashed",
          )}
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              doc.url
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <FileUp className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{doc.label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {doc.url ? "Fichier joint ✓" : "Fichier en attente"}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || reading}
            onClick={() => {
              pendingIndexRef.current = i;
              fileInputRef.current?.click();
            }}
          >
            {doc.url ? "Remplacer" : "Choisir un fichier"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={() => onChange(documents.filter((_, j) => j !== i))}
            aria-label="Retirer le document"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          disabled={disabled}
        >
          {DOC_KINDS.filter(
            (k) =>
              k.value !== "cni" || !documents.some((d) => d.kind === "cni"),
          ).map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {kind === "other" && (
          <Input
            className="w-48"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Nom du document"
            disabled={disabled}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addSlot}
        >
          <Plus className="mr-1.5 size-4" /> Ajouter
        </Button>
      </div>

      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Documents obligatoires manquants :{" "}
          {missing.map((k) => docKindLabel(k)).join(", ")}.
        </p>
      )}
    </div>
  );
}

// ---------- V6 : devis établi sur le terrain par le technicien ----------

type QuoteItemDraft = { label: string; qty: number; unitPrice: number };

function FieldQuoteForm({ onDone }: { onDone?: () => void }) {
  const submitFieldQuote = useMutation(api.gtec.submitFieldQuote);
  const [requestId, setRequestId] = useState<string>("");
  const [items, setItems] = useState<QuoteItemDraft[]>([
    { label: "", qty: 1, unitPrice: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const vat = Math.round(subtotal * 0.1925);
  const total = subtotal + vat;
  const advance = Math.round(total / 2);

  const setItem = (idx: number, patch: Partial<QuoteItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = async () => {
    if (!requestId) {
      toast.error("Choisissez la demande concernée.");
      return;
    }
    const clean = items.filter((i) => i.label.trim() && i.qty > 0 && i.unitPrice > 0);
    if (clean.length === 0) {
      toast.error("Ajoutez au moins une ligne valide.");
      return;
    }
    setBusy(true);
    try {
      await submitFieldQuote({
        requestId: requestId as never,
        items: clean,
      });
      toast.success(
        "Devis envoyé — GTEC l'a validé automatiquement et le client vient de le recevoir.",
      );
      setItems([{ label: "", qty: 1, unitPrice: 0 }]);
      setRequestId("");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="card-layered">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="size-4 text-primary" /> Établir un devis terrain
        </CardTitle>
        <CardDescription>
          Après la visite chez le client, chiffrez les prestations. Dès l'envoi,
          GTEC valide automatiquement le devis et le client reçoit une
          notification. Paiement client ensuite en 2 tranches (50 % avant / 50 %
          à la fin).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FieldQuoteRequestPicker value={requestId} onChange={setRequestId} />
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
          <div className="text-right">
            <p className="font-semibold">
              Total TTC : <span className="text-primary">{fcfa(total)}</span>
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (TVA 19,25 %)
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Avance client 50 % : {fcfa(advance)} · solde {fcfa(total - advance)}
            </p>
          </div>
        </div>
        <Button
          className="halo-amber"
          disabled={busy || !requestId}
          onClick={submit}
        >
          <Send className="mr-2 size-4" />
          {busy ? "Envoi…" : "Envoyer le devis (validation auto GTEC)"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Sélecteur de demande à chiffrer (statuts nouvelle / devis_emis). */
function FieldQuoteRequestPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const requests = useQuery(api.gtec.listQuoteableRequests);
  if (requests === undefined) {
    return <div className="h-9 animate-pulse rounded-lg bg-muted" />;
  }
  if (requests.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucune demande à chiffrer pour le moment.
      </p>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Demande à chiffrer" />
      </SelectTrigger>
      <SelectContent>
        {requests.map(({ request, clientName }) => (
          <SelectItem key={request._id} value={request._id}>
            {request.reference} · {request.title} — {clientName} ({request.city})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function TechnicianSpace() {
  const { user } = useAuth();
  const userVerified = (
    user as { phoneVerified?: boolean } | null | undefined
  )?.phoneVerified ?? false;
  const profile = useQuery(api.gtec.myTechnicianProfile);
  const missions = useQuery(api.gtec.listMyMissions);

  const apply = useMutation(api.gtec.submitTechnicianApplication);
  const requestSubPayment = useMutation(api.gtec.requestSubscriptionPayment);
  const requestMaterial = useMutation(api.gtec.requestMaterial);
  const collectCash = useMutation(api.gtec.technicianCollectCash);
  const completeVisit = useMutation(api.gtec.completeContractVisit);

  // GPS : partage de position (temps réel optionnel) vers la console admin.
  const updateLocation = useMutation(api.gtec.updateTechnicianLocation);
  const stopSharing = useMutation(api.gtec.stopTechnicianLocationSharing);
  const markArrival = useMutation(api.gtec.markTeamArrival);
  const [arrivalBusy, setArrivalBusy] = useState(false);
  const geo = useGeolocation({ watch: true });

  const pendingSubPayment = useQuery(api.gtec.myPendingSubscriptionPayment);
  const myCommissions = useQuery(api.gtec.myCommissions);
  const myWallet = useQuery(api.gtec.myWallet);
  const requestWithdrawal = useMutation(api.gtec.requestWithdrawal);
  const payCommission = useMutation(api.gtec.payCommission);
  const setAvailability = useMutation(api.gtec.setAvailability);
  const myScore = useQuery(api.gtec.myProviderScore);
  const mySanctions = useQuery(api.gtec.mySanctions);
  const contestSanction = useMutation(api.gtec.contestSanction);
  const myPayouts = useQuery(api.gtec.listMyPayouts);
  const myVisits = useQuery(api.gtec.listMyVisits);
  const myReviews = useQuery(api.gtec.myTechnicianReviews);
  const myRating = useQuery(
    api.gtec.technicianRating,
    user ? { techUserId: user._id } : "skip",
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [residenceCity, setResidenceCity] = useState("");
  const [address, setAddress] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [profession, setProfession] = useState("");
  const [experience, setExperience] = useState(2);
  // NOMENCLATURE GTEC PRO : domaine → spécialité → métier → compétences →
  // diplôme → spécialité du diplôme → niveau → certifications → expérience → zone.
  const [domainCode, setDomainCode] = useState("");
  const [specialtyCode, setSpecialtyCode] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [experienceBand, setExperienceBand] = useState("");
  const [district, setDistrict] = useState("");
  const [radiusKm, setRadiusKm] = useState("");
  const [degreeKey, setDegreeKey] = useState("");
  const [degreeGroup, setDegreeGroup] = useState<string>("");
  const [currentEmployer, setCurrentEmployer] = useState("");
  const [references, setReferences] = useState("");
  const [zones, setZones] = useState<string[]>(["Douala"]);
  const [bio, setBio] = useState("");
  const [highestDegree, setHighestDegree] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [school, setSchool] = useState("");
  const [graduationYear, setGraduationYear] = useState<number | "">("");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [busy, setBusy] = useState(false);

  // RÉFÉRENTIEL MINESUP : établissement sélectionné pour la déclaration de
  // diplôme (§8) + diplômes déjà déclarés avec leur statut de vérification.
  const [selectedInstitution, setSelectedInstitution] = useState<InstitutionLite | null>(null);
  const myCredentials = useQuery(api.institutions.myCredentials, {});

  // Paiement d'abonnement
  const [subPlan, setSubPlan] = useState<"mensuel" | "trimestriel" | "annuel" | null>(null);
  const [subMethod, setSubMethod] = useState<string>("mtn_momo");
  const [subPhone, setSubPhone] = useState("");

  // Encaissement espèces sur mission
  const [cashFor, setCashFor] = useState<string | null>(null);
  const [cashProof, setCashProof] = useState<string | null>(null);
  const [cashPhone, setCashPhone] = useState("");
  const cashInputRef = useRef<HTMLInputElement | null>(null);

  const [materialFor, setMaterialFor] = useState<string | null>(null);
  const [materialLabel, setMaterialLabel] = useState("");
  const [materialQty, setMaterialQty] = useState(1);

  // V6 : retraits + règlement des commissions GTEC 15 %
  const [wdAmount, setWdAmount] = useState("");
  const [wdMethod, setWdMethod] = useState("mtn_momo");
  const [wdDestination, setWdDestination] = useState("");
  const [commPhone, setCommPhone] = useState("");
  const [commRef, setCommRef] = useState("");

  const toggleZone = (city: string) =>
    setZones((prev) =>
      prev.includes(city) ? prev.filter((z) => z !== city) : [...prev, city],
    );

  const submitApplication = async () => {
    if (!documents.some((d) => d.kind === "cni" && d.url)) {
      toast.error("Joignez la photo de votre CNI ou passeport (obligatoire).");
      return;
    }
    if (
      !documents.some(
        (d) =>
          ["diploma", "certificate", "attestation"].includes(d.kind) && d.url,
      )
    ) {
      toast.error(
        "Joignez au moins un diplôme, certificat ou attestation (obligatoire).",
      );
      return;
    }
    // Documents réellement joints (on écarte les emplacements vides).
    const filledDocs = documents.filter((d) => d.url);
    // Garde de poids : Convex limite chaque champ à 1 Mio — le tableau
    // `documents` entier compte comme une seule valeur. On garde une marge.
    const totalBytes = filledDocs.reduce((s, d) => s + dataUrlBytes(d.url), 0);
    const TOTAL_LIMIT = 800 * 1024; // marge sous le plafond Convex de 1 Mio/champ
    if (totalBytes > TOTAL_LIMIT) {
      toast.error(
        `Dossier trop volumineux (${humanSize(totalBytes)} de documents, maximum ${humanSize(TOTAL_LIMIT)}). Les photos sont compressées automatiquement — retirez un document ou utilisez des PDF plus légers.`,
      );
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      await apply({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nationalId: nationalId.trim(),
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        phone: phone.trim(),
        altPhone: altPhone.trim() || undefined,
        city: residenceCity,
        address: address.trim() || undefined,
        specialty: specialty.trim(),
        profession: profession.trim() || undefined,
        experienceYears: experience,
        currentEmployer: currentEmployer.trim() || undefined,
        references: references.trim() || undefined,
        zones,
        bio: bio.trim() || undefined,
        // NOMENCLATURE GTEC PRO
        domainCode: domainCode || undefined,
        specialtyCode: specialtyCode || undefined,
        jobTitle: jobTitle || undefined,
        skills: skills.length ? skills : undefined,
        certifications: certifications.length ? certifications : undefined,
        degreeKey: degreeKey || undefined,
        degreeLevel: degreeKey ? (degreeByKey(degreeKey)?.level ?? undefined) : undefined,
        experienceBand: experienceBand || undefined,
        district: district.trim() || undefined,
        radiusKm: radiusKm ? Number(radiusKm) : undefined,
        highestDegree: highestDegree.trim(),
        fieldOfStudy: fieldOfStudy.trim() || undefined,
        school: school.trim() || undefined,
        graduationYear: graduationYear || undefined,
        documents: filledDocs,
      });
      toast.success("Candidature envoyée — GTEC va vérifier votre dossier");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const handleSubscribe = async () => {
    if (!subPlan) return;
    setBusy(true);
    try {
      await requestSubPayment({
        plan: subPlan,
        method: subMethod as "mtn_momo" | "orange_money" | "especes" | "virement",
        payerPhone: subPhone.trim(),
      });
      toast.success(
        "Paiement envoyé — GTEC vérifie et activera votre abonnement",
      );
      setSubPlan(null);
      setSubPhone("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const handleMaterial = async () => {
    if (!materialFor) return;
    try {
      await requestMaterial({
        requestId: materialFor as never,
        label: materialLabel.trim(),
        qty: materialQty,
      });
      toast.success("Demande de matériel transmise à GTEC");
      setMaterialFor(null);
      setMaterialLabel("");
      setMaterialQty(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const pickCashProof = async (file: File | undefined) => {
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
      setCashProof(res.dataUrl);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCashProof(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleCollectCash = async () => {
    if (!cashFor || !cashProof) {
      toast.error("Joignez la photo du reçu avant d'enregistrer.");
      return;
    }
    try {
      await collectCash({
        requestId: cashFor as never,
        proofPhotoUrl: cashProof,
        payerPhone: cashPhone.trim() || undefined,
      });
      toast.success(
        "Encaissement enregistré — GTEC validera après vérification",
      );
      setCashFor(null);
      setCashProof(null);
      setCashPhone("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleCompleteVisit = async (visitId: string, report: string) => {
    try {
      await completeVisit({ visitId: visitId as never, report });
      toast.success("Visite clôturée — compte rendu enregistré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const verified = profile?.status === "verifie";
  const activeMissions = (missions ?? []).filter(
    (m) => m.assignment.status !== "terminee" && m.request?.status !== "terminee",
  );
  const doneMissions = (missions ?? []).filter(
    (m) => m.assignment.status === "terminee" || m.request?.status === "terminee",
  );

  // ---- GPS : envoi de la position dès qu'un fix arrive (si partage activé).
  const sharing = profile?.locationSharing ?? false;
  const lastGps = profile?.lastLocation
    ? { lat: profile.lastLocation.lat, lon: profile.lastLocation.lon }
    : null;
  const lastGpsAt = profile?.lastLocationAt;
  const fixKey = geo.position
    ? `${geo.position.coords.lat},${geo.position.coords.lon}`
    : "";
  const lastSentRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  useEffect(() => {
    if (!sharing || !geo.position || !fixKey) return;
    // Throttle : max 1 écriture / 20 s, sauf si le déplacement est significatif.
    const last = lastSentRef.current;
    const moved = last.key
      ? Math.abs(geo.position.coords.lat - Number(last.key.split(",")[0])) +
          Math.abs(geo.position.coords.lon - Number(last.key.split(",")[1])) >
        0.0003 // ~30 m
      : true;
    if (last.key === fixKey || (Date.now() - last.at < 20000 && !moved)) return;
    lastSentRef.current = { key: fixKey, at: Date.now() };
    updateLocation({
      lat: geo.position.coords.lat,
      lon: geo.position.coords.lon,
      accuracy: Math.round(geo.position.accuracy),
      sharing: true,
    }).catch(() => {
      /* silencieux : nouvelle tentative au prochain fix */
    });
    // Déclenché à chaque nouveau fix GPS pendant le partage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixKey, sharing]);

  const startSharing = async () => {
    try {
      geo.locate(); // active watchPosition — la position partira au 1er fix
      await updateLocation({ sharing: true });
      toast.success(
        "Partage GPS activé — votre position sera visible par GTEC PRO.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const stopSharingNow = async () => {
    try {
      geo.stop();
      await stopSharing();
      toast.info("Partage GPS désactivé.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  // Cloisonnement : seuls les comptes techniciens (et l'admin) entrent ici.
  if (user && user.accountType === "client") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppShell areaLabel="Espace technicien">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Espace technicien
            </p>
            <h1 className="font-display mt-1 flex flex-wrap items-center gap-2 text-3xl font-bold tracking-tight">
              Bonjour{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 🛠️
              {userVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 align-middle text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                  <BadgeCheck className="size-3.5" /> Numéro vérifié
                </span>
              )}
            </h1>
          </div>
          {!userVerified && <PhoneVerifiedBadge variant="full" className="max-w-md" />}
        </div>

        {/* Partage GPS (techniciens avec dossier) */}
        {profile && verified && (
          <Card className="card-layered border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      sharing
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Navigation className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      Position GPS{" "}
                      {sharing ? (
                        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                          </span>
                          en direct
                        </span>
                      ) : (
                        "désactivée"
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sharing
                        ? "La console GTEC PRO suit votre position pour optimiser les affectations."
                        : "Activez le partage pour être affecté aux chantiers les plus proches de vous."}
                    </p>
                  </div>
                </div>
                {sharing ? (
                  <Button variant="outline" size="sm" onClick={stopSharingNow}>
                    <NavigationOff className="mr-2 size-4" /> Arrêter le partage
                  </Button>
                ) : (
                  <Button size="sm" className="halo-amber" onClick={startSharing}>
                    <Navigation className="mr-2 size-4" /> Partager ma position
                  </Button>
                )}
              </div>
              {(geo.position || lastGps) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">
                    {geo.position
                      ? formatGps(geo.position.coords)
                      : lastGps
                        ? formatGps(lastGps)
                        : ""}
                  </span>
                  {geo.position?.accuracy !== undefined && (
                    <span>précision ± {Math.round(geo.position.accuracy)} m</span>
                  )}
                  {!geo.position && lastGpsAt && (
                    <span>
                      dernière position : {formatDateTime(lastGpsAt)}
                    </span>
                  )}
                  {geo.error && (
                    <span className="text-destructive">{geo.error}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {profile === undefined ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : profile === null ? (
          /* ---------- Candidature ---------- */
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Card className="card-layered">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-xl">
                  <Wrench className="size-5 text-primary" />
                  Rejoindre les équipes GTEC PRO
                </CardTitle>
                <CardDescription>
                  Votre dossier doit être complet : identité, profession,
                  parcours académique et documents justificatifs obligatoires.
                  Après vérification par GTEC, vous recevrez des missions dans
                  vos zones.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {/* Identité */}
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <UserRound className="size-4 text-primary" /> Identité
                  </p>
                  <PhoneVerifiedBadge variant="full" />
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
                      <Label className="text-sm">Ville de résidence *</Label>
                      <Select value={residenceCity} onValueChange={setResidenceCity}>
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
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label className="text-sm">Quartier / adresse</Label>
                      <Input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Ex. : Bonapriso, rue Njo-Njo"
                      />
                    </div>
                  </div>
                </section>

                {/* Profession */}
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <HardHat className="size-4 text-primary" /> Profession
                  </p>
                  {/* NOMENCLATURE GTEC PRO : Domaine → Spécialité → Métier */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Domaine *</Label>
                      <Select
                        value={domainCode}
                        onValueChange={(v) => {
                          setDomainCode(v);
                          setSpecialtyCode("");
                          setJobTitle("");
                          setSkills([]);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir" />
                        </SelectTrigger>
                        <SelectContent>
                          {NOMENCLATURE.map((d) => (
                            <SelectItem key={d.code} value={d.code}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Spécialité professionnelle *</Label>
                      <Select
                        value={specialtyCode}
                        onValueChange={(v) => {
                          setSpecialtyCode(v);
                          setJobTitle("");
                          const entry = nomenSpecialtyByCode(v);
                          if (entry) setSpecialty(entry.specialty.label);
                        }}
                        disabled={!domainCode}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={domainCode ? "Choisir" : "Choisissez d'abord un domaine"} />
                        </SelectTrigger>
                        <SelectContent>
                          {NOMENCLATURE.find((d) => d.code === domainCode)?.specialties.map((s) => (
                            <SelectItem key={s.code} value={s.code}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Métier *</Label>
                      <Select
                        value={jobTitle}
                        onValueChange={(v) => {
                          setJobTitle(v);
                          setProfession(v);
                        }}
                        disabled={!specialtyCode}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={specialtyCode ? "Choisir" : "Choisissez une spécialité"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(nomenSpecialtyByCode(specialtyCode)?.specialty.jobs ?? []).map((j) => (
                            <SelectItem key={j} value={j}>
                              {j}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {specialtyCode && (
                    <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      Code nomenclature : <span className="font-mono font-semibold text-foreground">{specialtyCode}</span>
                    </p>
                  )}
                  {domainCode && (
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Compétences *</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {(SKILLS_BY_DOMAIN[domainCode] ?? []).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setSkills((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                              )
                            }
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs transition-colors",
                              skills.includes(s)
                                ? "border-primary bg-primary/10 font-medium text-primary"
                                : "border-border/70 text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Spécialité (libellé libre, complet) *</Label>
                      <Input
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        placeholder="Ex. : Électricité CFO/CATE, Solaire, CCTV…"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Métier exact (si absent de la liste)</Label>
                      <Input
                        value={profession}
                        onChange={(e) => setProfession(e.target.value)}
                        placeholder="Ex. : Électricien bâtiment"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Palier d'expérience *</Label>
                      <Select value={experienceBand} onValueChange={setExperienceBand}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPERIENCE_BANDS.map((b) => (
                            <SelectItem key={b.key} value={b.key}>
                              {b.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Années d'expérience (précises) *</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={experience}
                        onChange={(e) => setExperience(Number(e.target.value) || 0)}
                        className="w-28"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Employeur actuel</Label>
                      <Input
                        value={currentEmployer}
                        onChange={(e) => setCurrentEmployer(e.target.value)}
                        placeholder="Ex. : Entreprise XYZ (optionnel)"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label className="text-sm">Références chantiers / clients</Label>
                      <Input
                        value={references}
                        onChange={(e) => setReferences(e.target.value)}
                        placeholder="Ex. : Immeuble X (Douala), résidence Y (Buea)…"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label className="text-sm">Zones d'intervention *</Label>
                      <div className="flex flex-wrap gap-2">
                        {CITIES.map((city) => (
                          <label
                            key={city}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                          >
                            <Switch
                              checked={zones.includes(city)}
                              onCheckedChange={() => toggleZone(city)}
                            />
                            {city}
                          </label>
                        ))}
                      </div>
                      {/* NOMENCLATURE §J : zone détaillée (arrondissement, rayon) */}
                      <div className="mt-1 grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-sm">Arrondissement / quartier principal</Label>
                          <Input
                            value={district}
                            onChange={(e) => setDistrict(e.target.value)}
                            placeholder="Ex. : Bonapriso, Nkolbisson…"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-sm">Rayon d'intervention (km)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={300}
                            value={radiusKm}
                            onChange={(e) => setRadiusKm(e.target.value)}
                            placeholder="Ex. : 25"
                            className="w-28"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label className="text-sm">Présentation (optionnel)</Label>
                      <Textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Parlez de votre expérience en quelques lignes…"
                        rows={2}
                      />
                    </div>
                  </div>
                </section>

                {/* Parcours académique */}
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <GraduationCap className="size-4 text-primary" /> Parcours académique
                  </p>
                  {/* NOMENCLATURE : Niveau → Diplôme → Spécialité du diplôme */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Niveau de diplôme *</Label>
                      <Select
                        value={degreeGroup}
                        onValueChange={(v) => {
                          setDegreeGroup(v);
                          setDegreeKey("");
                          const first = (DEGREES as Record<string, { key: string; label: string }[]>)[v]?.[0];
                          if (first) {
                            setDegreeKey(first.key);
                            setHighestDegree(first.label);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(DEGREES).map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Diplôme *</Label>
                      <Select
                        value={degreeKey}
                        onValueChange={(v) => {
                          setDegreeKey(v);
                          setHighestDegree(degreeByKey(v)?.label ?? "");
                        }}
                        disabled={!degreeGroup}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={degreeGroup ? "Choisir" : "Choisissez un niveau"} />
                        </SelectTrigger>
                        <SelectContent>
                          {((DEGREES as Record<string, { key: string; label: string; level: string }[]>)[degreeGroup] ?? []).map((d) => (
                            <SelectItem key={d.key} value={d.key}>
                              {d.label} · {d.level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Spécialité du diplôme</Label>
                      <Input
                        value={fieldOfStudy}
                        onChange={(e) => setFieldOfStudy(e.target.value)}
                        placeholder="Ex. : Électrotechnique, Énergies renouvelables…"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Dernier diplôme (libellé libre) *</Label>
                      <Input
                        value={highestDegree}
                        onChange={(e) => setHighestDegree(e.target.value)}
                        placeholder="Ex. : CAP, BT, BTS, Licence, Ingénieur…"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Établissement</Label>
                      <Input
                        value={school}
                        onChange={(e) => setSchool(e.target.value)}
                        placeholder="Ex. : Lycée technique de Douala"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Année d'obtention</Label>
                      <Input
                        type="number"
                        min={1970}
                        max={2030}
                        value={graduationYear}
                        onChange={(e) =>
                          setGraduationYear(
                            e.target.value ? Number(e.target.value) : "",
                          )
                        }
                        className="w-28"
                      />
                    </div>
                  </div>
                  {/* NOMENCLATURE : Certifications (§H) */}
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm">Certifications / habilitations</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {CERTIFICATION_SUGGESTIONS.filter((c) => c !== "Autre (préciser)").map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setCertifications((prev) =>
                              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                            )
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs transition-colors",
                            certifications.includes(c)
                              ? "border-primary bg-primary/10 font-medium text-primary"
                              : "border-border/70 text-muted-foreground hover:bg-muted/50",
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Déclaration de diplôme branchée sur le référentiel MINESUP */}
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <GraduationCap className="size-4 text-primary" /> Déclaration de diplôme
                  </p>
                  <CredentialForm
                    busy={busy}
                    degreeGroup={degreeGroup}
                    degreeKey={degreeKey}
                    diplomaTitle={highestDegree}
                    fieldOfStudy={fieldOfStudy}
                    graduationYear={graduationYear}
                    documents={documents}
                    onChangeDocuments={setDocuments}
                    school={school}
                    onChangeSchool={setSchool}
                    selected={selectedInstitution}
                    onSelect={setSelectedInstitution}
                  />
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                    <FileBadge className="size-4 text-primary" /> Documents justificatifs *
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Obligatoire : pièce d'identité ET au moins un diplôme ou
                    certificat/attestation d'expérience. Formats acceptés : PDF,
                    images (max {MAX_FILE_SIZE_LABEL} par fichier).
                  </p>
                  <DocumentsUploader
                    documents={documents}
                    onChange={setDocuments}
                    requiredKinds={["cni", "diploma"]}
                    disabled={busy}
                  />
                  {myCredentials !== undefined && myCredentials.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Mes diplômes déclarés (statut de vérification)
                      </p>
                      {myCredentials.map((c) => {
                        const badge = credentialBadge(c.verificationStatus);
                        return (
                          <div
                            key={c._id}
                            className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                          >
                            <span className="truncate font-medium">
                              {c.diplomaTitle ?? c.degreeKey ?? "Diplôme"} · {c.institutionName}
                              {c.graduationYear ? ` · ${c.graduationYear}` : ""}
                            </span>
                            <span className={cn("shrink-0", badge.tone)}>
                              {badge.emoji} {badge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <Button
                  className="halo-amber"
                  disabled={
                    busy ||
                    specialty.trim().length < 3 ||
                    !domainCode ||
                    !specialtyCode ||
                    !jobTitle ||
                    skills.length === 0 ||
                    !degreeGroup ||
                    !degreeKey ||
                    !experienceBand ||
                    zones.length === 0 ||
                    !documents.some((d) => d.kind === "cni") ||
                    !documents.some((d) =>
                      ["diploma", "certificate", "attestation"].includes(d.kind),
                    )
                  }
                  onClick={submitApplication}
                >
                  <Send className="mr-2 size-4" />
                  {busy ? "Envoi…" : "Envoyer ma candidature"}
                </Button>
            </CardContent>
          </Card>
          </div>
        ) : profile.status === "en_attente" ? (
          /* ---------- En attente de vérification ---------- */
          <Card className="card-layered mx-auto w-full max-w-lg">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <UserCheck className="size-7" />
              </div>
              <p className="font-display text-lg font-semibold">
                Candidature en cours de vérification
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Votre dossier ({profile.specialty}) est en cours d'examen par
                l'administration GTEC. Vous serez notifié dès validation.
              </p>
            </CardContent>
          </Card>
        ) : profile.status === "rejete" ? (
          <Card className="card-layered mx-auto w-full max-w-lg border-destructive/30">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <XCircle className="size-10 text-destructive" />
              <p className="font-display text-lg font-semibold">
                Candidature refusée
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Contactez l'administration GTEC pour plus d'informations.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* ---------- Technicien vérifié : missions & abonnement ---------- */
          <div className="flex flex-col gap-4">
          {/* GTEC PRO 2.0 : sanctions actives (bandeau rouge) */}
          {mySanctions && mySanctions.activeCount > 0 && (
            <Card className="card-layered border-destructive/40 bg-destructive/[0.04]">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <XCircle className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-destructive">
                    Sanction active — niveau {mySanctions.maxLevel}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Vos accès peuvent être limités (missions, retraits). Vous pouvez contester chaque décision.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {/* GTEC PRO 2.0 §24 : dette de commission (paiement cash) */}
          {myCommissions && myCommissions.dueTotal > 0 && (
            <Card className={cn(
              "card-layered",
              myCommissions.debtOverdue
                ? "border-destructive/40 bg-destructive/[0.04]"
                : "border-amber-500/40 bg-amber-500/[0.04]",
            )}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <span className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  myCommissions.debtOverdue
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}>
                  <Percent className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    Commission à régulariser : {fcfa(myCommissions.dueTotal)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {myCommissions.debtDeadline
                      ? myCommissions.debtOverdue
                        ? `Échéance dépassée (${formatDate(myCommissions.debtDeadline)}) — retraits et nouvelles missions bloqués.`
                        : `À régler avant le ${formatDate(myCommissions.debtDeadline)} — sinon retraits et nouvelles missions seront bloqués.`
                      : "Régularisez depuis l'onglet Gains."}
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <a href="#tab-gains">Régler maintenant</a>
                </Button>
              </CardContent>
            </Card>
          )}
          {/* GTEC PRO 2.0 : disponibilité (§12) + score prestataire (§38) */}
          {profile && (
            <Card className="card-layered">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Ma disponibilité (moteur d'affectation)</Label>
                  <Select
                    value={(profile.availability ?? "disponible") as AvailabilityKey}
                    onValueChange={(v) => {
                      setAvailability({ availability: v as AvailabilityKey }).catch((e) =>
                        toast.error(e instanceof Error ? e.message : "Erreur"),
                      );
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABILITY_OPTIONS.map((o) => (
                        <SelectItem key={o.key} value={o.key}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Les statuts autres que « Disponible » vous retirent des propositions de missions.
                  </p>
                </div>
                {myScore && (
                  <div className="flex items-center gap-3 rounded-xl border border-border/70 px-4 py-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {myScore.score}
                    </span>
                    <div>
                      <p className="text-xs font-medium">Score prestataire</p>
                      <p className="text-xs text-muted-foreground">
                        {myScore.completed} mission(s) réussie(s) · {myScore.completionRate} % de réalisation
                        {myScore.reviewCount > 0 ? ` · ${myScore.satisfaction}/5` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Tabs defaultValue="missions">
            <TabsList>
              <TabsTrigger value="missions">
                <CalendarClock className="mr-1.5 size-4" /> Missions
                {activeMissions.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {activeMissions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="devis">
                <FileText className="mr-1.5 size-4" /> Devis
              </TabsTrigger>
              <TabsTrigger value="abonnement">
                <Crown className="mr-1.5 size-4" /> Abonnement
              </TabsTrigger>
              <TabsTrigger value="profil">
                <UserRound className="mr-1.5 size-4" /> Mon profil
              </TabsTrigger>
              <TabsTrigger value="retraits">
                <Landmark className="mr-1.5 size-4" /> Retraits
              </TabsTrigger>
              <TabsTrigger value="gains">
                <Wallet className="mr-1.5 size-4" /> Gains
              </TabsTrigger>
              <TabsTrigger value="avis">
                <Star className="mr-1.5 size-4" /> Avis
                {myReviews && myReviews.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {myReviews.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="visites">
                <ClipboardCheck className="mr-1.5 size-4" /> Visites
                {myVisits &&
                  myVisits.some((v) => v.visit.status === "planifiee") && (
                    <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {myVisits.filter((v) => v.visit.status === "planifiee").length}
                    </span>
                  )}
              </TabsTrigger>
            </TabsList>

            {/* MON PROFIL — dossier professionnel vivant */}
            <TabsContent value="profil" className="mt-4">
              <MyProfile />
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toast.success("Profil enregistré.");
                  }}
                >
                  <UserRound className="mr-1.5 size-4" /> Enregistrer mon profil
</Button>
              </div>
            </TabsContent>
            {/* Missions */}
            <TabsContent value="missions" className="mt-4">
              {missions === undefined ? (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              ) : activeMissions.length === 0 ? (
                <Card className="card-layered">
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <Sparkles className="size-8 text-muted-foreground" />
                    <p className="font-display text-lg font-semibold">
                      Aucune mission active
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Vous serez affecté aux missions correspondant à votre
                      spécialité ({profile.specialty}) et vos zones (
                      {profile.zones.join(", ")}).
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-4">
                  {activeMissions.map(({ assignment, request }) =>
                    request ? (
                      <motion.div
                        key={assignment._id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <Card className="card-layered">
                          <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <CardTitle className="text-base">
                                  {request.title}
                                </CardTitle>
                                <CardDescription className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="font-mono text-xs">
                                    {request.reference}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="size-3.5" />
                                    {request.address}, {request.city}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <CalendarClock className="size-3.5" />
                                    {formatDateTime(assignment.scheduledAt)}
                                  </span>
                                  {request.coords && (
                                    <a
                                      className="flex items-center gap-1 text-primary hover:underline"
                                      href={gmapsDirectionsUrl(
                                        geo.position?.coords ?? lastGps,
                                        request.coords as GpsCoords,
                                      )}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Navigation className="size-3.5" />
                                      Itinéraire
                                    </a>
                                  )}
                                </CardDescription>
                              </div>
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                                  request.status === "en_intervention"
                                    ? "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400"
                                    : "bg-primary/10 text-primary ring-primary/20",
                                )}
                              >
                                {request.status === "en_intervention"
                                  ? "En intervention"
                                  : "Planifiée"}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <p className="text-sm text-muted-foreground">
                              {request.description}
                            </p>

                            {request.status === "affectee" &&
                              !request.coords && (
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Truck className="size-4" />
                                  Rendez-vous sur place à l'heure prévue —
                                  l'admin démarrera l'intervention.
                                </p>
                              )}

                            {/* GÉO TERRAIN : déplacement GPS vers le chantier */}
                            {request.status === "affectee" &&
                              request.coords &&
                              (() => {
                                const target = request.coords as GpsCoords;
                                const from = geo.position?.coords ?? lastGps;
                                const dist = from
                                  ? haversineKm(from, target)
                                  : null;
                                const etaMin =
                                  dist !== null
                                    ? Math.max(
                                        1,
                                        Math.round((dist / 30) * 60),
                                      )
                                    : null;
                                const arrived = !!request.teamArrivalAt;
                                return (
                                  <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                                        <Truck className="size-4 text-primary" />{" "}
                                        Déplacement vers le chantier
                                      </p>
                                      {arrived ? (
                                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                                          📍 Arrivée confirmée
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/20">
                                          En déplacement
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                      {dist !== null && (
                                        <span>
                                          Distance :{" "}
                                          <span className="font-semibold text-foreground">
                                            {dist < 1
                                              ? `${Math.round(dist * 1000)} m`
                                              : `${dist} km`}
                                          </span>
                                        </span>
                                      )}
                                      {etaMin !== null && (
                                        <span>
                                          ETA estimée : ~
                                          {etaMin < 60
                                            ? `${etaMin} min`
                                            : `${Math.round(etaMin / 6) / 10} h`}
                                        </span>
                                      )}
                                      {dist !== null && dist < 0.2 && (
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                          Vous êtes sur place ✓
                                        </span>
                                      )}
                                      <a
                                        className="flex items-center gap-1 text-primary hover:underline"
                                        href={gmapsDirectionsUrl(from, target)}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Navigation className="size-3.5" />
                                        Ouvrir l'itinéraire
                                      </a>
                                    </div>
                                    {!arrived && (
                                      <Button
                                        size="sm"
                                        className="halo-amber w-fit"
                                        disabled={arrivalBusy}
                                        onClick={async () => {
                                          const fix =
                                            geo.position?.coords ?? lastGps;
                                          if (!fix) {
                                            toast.error(
                                              "Position GPS indisponible — activez le partage de position puis réessayez.",
                                            );
                                            return;
                                          }
                                          setArrivalBusy(true);
                                          try {
                                            await markArrival({
                                              requestId: request._id,
                                              lat: fix.lat,
                                              lon: fix.lon,
                                              ...(geo.position
                                                ? {
                                                    accuracy: Math.round(
                                                      geo.position.accuracy,
                                                    ),
                                                  }
                                                : {}),
                                            });
                                            toast.success(
                                              "Arrivée confirmée — le client est prévenu 📍",
                                            );
                                          } catch (e) {
                                            toast.error(
                                              e instanceof Error
                                                ? e.message
                                                : "Erreur",
                                            );
                                          } finally {
                                            setArrivalBusy(false);
                                          }
                                        }}
                                      >
                                        {arrivalBusy ? (
                                          <Loader2 className="mr-2 size-4 animate-spin" />
                                        ) : (
                                          <CheckCircle2 className="mr-2 size-4" />
                                        )}
                                        Je suis arrivé
                                      </Button>
                                    )}
                                  </div>
                                );
                              })()}

                            {request.status === "en_intervention" && (
                              <>
                                {/* Encaissement espèces avec preuve */}
                                <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
                                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                                    <Banknote className="size-4 text-primary" />{" "}
                                    Paiement du client en espèces
                                  </p>
                                  {cashFor === request._id ? (
                                    <div className="flex flex-col gap-2">
                                      <input
                                        ref={cashInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          pickCashProof(e.target.files?.[0]);
                                          e.target.value = "";
                                        }}
                                      />
                                      <div className="flex items-center gap-3">
                                        {cashProof ? (
                                          <img
                                            src={cashProof}
                                            alt="Reçu"
                                            className="size-12 rounded-lg object-cover ring-1 ring-border"
                                          />
                                        ) : (
                                          <span className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                            <Banknote className="size-5" />
                                          </span>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            cashInputRef.current?.click()
                                          }
                                        >
                                          {cashProof
                                            ? "Remplacer la photo"
                                            : "Photo du reçu (obligatoire)"}
                                        </Button>
                                      </div>
                                      <Input
                                        value={cashPhone}
                                        onChange={(e) =>
                                          setCashPhone(e.target.value)
                                        }
                                        placeholder="Téléphone du client (optionnel)"
                                        inputMode="tel"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          className="halo-amber flex-1"
                                          size="sm"
                                          disabled={!cashProof}
                                          onClick={handleCollectCash}
                                        >
                                          Enregistrer l'encaissement
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setCashFor(null);
                                            setCashProof(null);
                                          }}
                                        >
                                          Annuler
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-fit"
                                      onClick={() => setCashFor(request._id)}
                                    >
                                      <Banknote className="mr-1.5 size-4" /> Le
                                      client a payé en espèces
                                    </Button>
                                  )}
                                </div>

                                <ReportForm
                                  requestId={request._id}
                                  useReportMutation={useTechnicianReportMutation}
                                  title="Clôturer la mission — rapport"
                                />
                                <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
                                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                                    <Package className="size-4 text-primary" />{" "}
                                    Demander du matériel
                                  </p>
                                  {materialFor === request._id ? (
                                    <div className="flex flex-col gap-2">
                                      <Input
                                        value={materialLabel}
                                        onChange={(e) =>
                                          setMaterialLabel(e.target.value)
                                        }
                                        placeholder="Ex. : Disjoncteur différentiel 40A type A"
                                      />
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          min={1}
                                          value={materialQty}
                                          onChange={(e) =>
                                            setMaterialQty(
                                              Number(e.target.value) || 1,
                                            )
                                          }
                                          className="w-20"
                                          aria-label="Quantité"
                                        />
                                        <Button
                                          className="halo-amber flex-1"
                                          size="sm"
                                          disabled={materialLabel.trim().length < 3}
                                          onClick={handleMaterial}
                                        >
                                          <Send className="mr-1.5 size-3.5" /> Envoyer
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setMaterialFor(null)}
                                        >
                                          Annuler
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-fit"
                                      onClick={() => setMaterialFor(request._id)}
                                    >
                                      <Package className="mr-1.5 size-4" /> Faire
                                      une demande
                                    </Button>
                                  )}
                                </div>
                              </>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ) : null,
                  )}
                </div>
              )}
              {doneMissions.length > 0 && (
                <div className="mt-6 flex flex-col gap-2">
                  <h2 className="font-display text-sm font-semibold text-muted-foreground">
                    Historique ({doneMissions.length})
                  </h2>
                  {doneMissions.map(({ assignment, request }) =>
                    request ? (
                      <div
                        key={assignment._id}
                        className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-2.5"
                      >
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {request.reference} · {request.title}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:block">
                          {formatDateTime(assignment.scheduledAt)}
                        </span>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </TabsContent>

            {/* Devis terrain (V6) */}
            <TabsContent value="devis" className="mt-4">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                <FieldQuoteForm />
                <Card className="card-layered">
                  <CardContent className="py-4 text-xs text-muted-foreground">
                    Rappel du flux : le client accepte votre intervention puis
                    vous chiffrez sur place. Dès l'envoi, GTEC valide
                    automatiquement le devis. Le client paie 50 % avant les
                    travaux (avance) et 50 % à la fin (solde) — la
                    part GTEC de 15 % est déduite de la mission et
                    réglée depuis l'onglet Commissions.
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Retraits (V6) */}
            <TabsContent value="retraits" className="mt-4">
              {myWallet === undefined ? (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              ) : (
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Total gagné (payé)", value: myWallet.earned },
                      { label: "Retraits effectués", value: myWallet.withdrawn },
                      { label: "Disponible", value: myWallet.available },
                    ].map(({ label, value }) => (
                      <Card key={label} className="card-layered">
                        <CardContent className="px-4 py-3.5">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {label}
                          </p>
                          <p className="font-display mt-1 text-lg font-bold">
                            {fcfa(value)}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Card className="card-layered">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Landmark className="size-4 text-primary" /> Demander un
                        retrait
                      </CardTitle>
                      <CardDescription>
                        Minimum 1 000 FCFA. Le transfert part vers votre compte
                        après validation par l'administration GTEC.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="grid gap-2 sm:grid-cols-[130px_1fr_1fr_auto]">
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
                          placeholder="Numéro MoMo ou IBAN"
                          inputMode="text"
                        />
                        <Button
                          className="halo-amber"
                          disabled={
                            busy ||
                            Number(wdAmount) < 1000 ||
                            !wdDestination.trim() ||
                            Number(wdAmount) > myWallet.available
                          }
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await requestWithdrawal({
                                amount: Number(wdAmount),
                                method: wdMethod as never,
                                destination: wdDestination.trim(),
                              });
                              toast.success("Demande de retrait envoyée — en attente de validation GTEC");
                              setWdAmount("");
                              setWdDestination("");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Erreur");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <Send className="mr-1.5 size-4" /> Retirer
                        </Button>
                      </div>
                      {myWallet.pending > 0 && (
                        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                          {fcfa(myWallet.pending)} de retraits en cours de traitement.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  {myWallet.history.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h3 className="text-sm font-semibold text-muted-foreground">
                        Historique des retraits
                      </h3>
                      {myWallet.history.map((w) => (
                        <div
                          key={w._id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-2.5"
                        >
                          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <Landmark className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {w.reference} · {fcfa(w.amount)} · {w.method}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {w.destination} · {formatDateTime(w.requestedAt)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset",
                              w.status === "payee"
                                ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                                : w.status === "refuse"
                                  ? "bg-destructive/10 text-destructive ring-destructive/20"
                                  : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
                            )}
                          >
                            {w.status === "payee"
                              ? "Payé"
                              : w.status === "refuse"
                                ? "Refusé"
                                : w.status === "approuve"
                                  ? "Approuvé"
                                  : "En attente"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Abonnement */}
            <TabsContent value="abonnement" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                <div className="flex flex-col gap-4">
                  {pendingSubPayment && (
                    <Card className="card-layered border-amber-500/30 bg-amber-500/[0.04]">
                      <CardContent className="flex items-center gap-3 py-4">
                        <Loader2 className="size-5 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
                        <p className="text-sm">
                          Paiement {pendingSubPayment.plan} de {fcfa(pendingSubPayment.amount)} —
                          <span className="text-muted-foreground">
                            {" "}en cours de vérification par GTEC.
                          </span>
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  <div className="grid gap-4 sm:grid-cols-3">
                    {PLANS.map((plan) => {
                      const isCurrent = profile.subscription === plan.key;
                      return (
                        <Card
                          key={plan.key}
                          className={cn(
                            "card-layered flex flex-col gap-2 p-5",
                            isCurrent && "border-primary/40 ring-2 ring-primary/20",
                          )}
                        >
                          <p className="font-display text-lg font-bold">
                            {plan.label}
                          </p>
                          <p className="text-xl font-bold text-primary">
                            {plan.price}
                          </p>
                          <p className="text-xs text-muted-foreground">{plan.hint}</p>
                          <Button
                            className="mt-auto"
                            size="sm"
                            variant={isCurrent ? "outline" : "default"}
                            disabled={busy || !!pendingSubPayment}
                            onClick={() => setSubPlan(plan.key)}
                          >
                            {isCurrent ? "Renouveler" : "Choisir"}
                          </Button>
                        </Card>
                      );
                    })}
                  </div>
                  {subPlan && (
                    <Card className="card-layered">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Payer l'abonnement {subPlan}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs">Moyen de paiement</Label>
                          <Select
                            value={subMethod}
                            onValueChange={(v) => setSubMethod(v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map((m) => (
                                <SelectItem key={m.key} value={m.key}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs">Numéro payeur</Label>
                          <Input
                            value={subPhone}
                            onChange={(e) => setSubPhone(e.target.value)}
                            placeholder="6 XX XX XX XX"
                            inputMode="tel"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            className="halo-amber flex-1"
                            size="sm"
                            disabled={busy || subPhone.trim().length < 6}
                            onClick={handleSubscribe}
                          >
                            {busy ? "Envoi…" : "Envoyer le paiement"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSubPlan(null)}
                          >
                            Annuler
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
                <Card className="card-layered h-fit">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Statut du compte</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Vérification</span>
                      <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                        <BadgeCheck className="size-4" /> Validé
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Spécialité</span>
                      <span className="font-medium">{profile.specialty}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Abonnement</span>
                      <span className="font-medium capitalize">
                        {profile.subscription}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Valable jusqu'au</span>
                      <span className="font-medium">
                        {profile.subscriptionUntil
                          ? formatDateTime(profile.subscriptionUntil)
                          : "—"}
                      </span>
                    </div>
                    {profile.subscription === "aucun" && (
                      <p className="rounded-lg bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
                        Activez un abonnement pour recevoir des missions.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Gains */}
            <TabsContent value="gains" className="mt-4">
              {myPayouts === undefined ? (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              ) : myPayouts.length === 0 ? (
                <div className="flex flex-col gap-4">
                  {myCommissions && myCommissions.items.length > 0 && (
                    <Card className="card-layered border-primary/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Percent className="size-4 text-primary" /> Commission
                          GTEC 10 %
                          {myCommissions.dueTotal > 0 && (
                            <span className="ml-auto rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
                              {fcfa(myCommissions.dueTotal)} à régler
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription>
                          90 % équipe / 10 % GTEC PRO (§22) — réglez la part
                          GTEC depuis une mission terminée ou contactez
                          l'administration.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Dû</p>
                            <p className="text-sm font-semibold">
                              {fcfa(myCommissions.dueTotal)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Réglé</p>
                            <p className="text-sm font-semibold">
                              {fcfa(myCommissions.paidTotal)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card className="card-layered">
                    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                      <Wallet className="size-8 text-muted-foreground" />
                      <p className="font-display text-lg font-semibold">
                        Aucun gain pour le moment
                      </p>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        Vos rémunérations apparaissent ici dès qu'un client signe
                        le PV d'une de vos missions terminées.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        label: "Total gagné",
                        value: fcfa(
                          myPayouts.reduce((s, p) => s + p.payout.amount, 0),
                        ),
                      },
                      {
                        label: "En attente de paiement",
                        value: fcfa(
                          myPayouts
                            .filter((p) => p.payout.status === "dû")
                            .reduce((s, p) => s + p.payout.amount, 0),
                        ),
                      },
                      {
                        label: "Déjà payé",
                        value: fcfa(
                          myPayouts
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
                          <p className="font-display mt-1 text-lg font-bold">
                            {value}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {/* Commission GTEC 10 % (§22-24 cahier des charges 2.0) — détail & régularisation */}
                  {myCommissions && myCommissions.items.length > 0 && (
                    <Card className="card-layered border-primary/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2">
                            <Percent className="size-4 text-primary" /> Commission
                            GTEC 10 %
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                              myCommissions.dueTotal > 0
                                ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
                                : "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
                            )}
                          >
                            {myCommissions.dueTotal > 0
                              ? `${fcfa(myCommissions.dueTotal)} à régler`
                              : "A jour"}
                          </span>
                        </CardTitle>
                        <CardDescription>
                          Sur chaque mission : 90 % pour l'équipe, 10 % pour
                          GTEC PRO (§22). Paiement en espèces = dette de
                          commission à régulariser avant l'échéance (§24) —
                          retraits et nouvelles missions restent bloqués sinon.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[
                            { label: "Dû", value: myCommissions.dueTotal },
                            { label: "Réglé", value: myCommissions.paidTotal },
                            {
                              label: "Répartition",
                              value: null,
                              detail: "90 % équipe / 10 % GTEC",
                            },
                          ].map(({ label, value, detail }) => (
                            <div key={label} className="rounded-lg bg-muted/60 px-3 py-2">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="text-sm font-semibold">
                                {value === null ? detail : fcfa(value)}
                              </p>
                            </div>
                          ))}
                        </div>
                        {myCommissions.items.slice(0, 6).map((c) => (
                          <div
                            key={c._id}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {fcfa(c.baseAmount)} × {c.ratePercent} % ={" "}
                                <span className="text-primary">{fcfa(c.amount)}</span>
                                {c.breakdown && (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    (équipe {fcfa(c.breakdown.teamAmount)} / GTEC{" "}
                                    {fcfa(c.breakdown.gtecAmount)})
                                  </span>
                                )}
                              </p>
                              <p className="text-xs capitalize text-muted-foreground">
                                Statut : {c.status === "due" ? "à régler" : c.status === "payee" ? "réglée" : "exonérée"}
                              </p>
                            </div>
                            {c.status === "due" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || commPhone.trim().length < 6}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await payCommission({
                                      commissionId: c._id,
                                      method: "mtn_momo",
                                      payerPhone: commPhone.trim(),
                                      externalRef: commRef.trim() || undefined,
                                    });
                                    toast.success("Règlement déclaré — validation GTEC en cours");
                                  } catch (e) {
                                    toast.error(e instanceof Error ? e.message : "Erreur");
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Déclarer le règlement
                              </Button>
                            )}
                          </div>
                        ))}
                        {myCommissions.dueCount > 0 && (
                          <Input
                            value={commPhone}
                            onChange={(e) => setCommPhone(e.target.value)}
                            placeholder="Numéro payeur MoMo (6 XX XX XX XX)"
                            inputMode="tel"
                          />
                        )}
                      </CardContent>
                    </Card>
                  )}
                  <div className="flex flex-col gap-2">
                    {myPayouts.map(({ payout, request }) => (
                      <div
                        key={payout._id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                      >
                        <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Wallet className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {fcfa(payout.amount)} · {request?.reference ?? "—"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {payout.role} · {request?.title ?? ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            PAYOUT_STATUS_STYLES[payout.status] ??
                              "bg-muted text-muted-foreground ring-border",
                          )}
                        >
                          {payout.status === "dû" ? "À payer" : "Payé"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Avis clients */}
            <TabsContent value="avis" className="mt-4">
              {myReviews === undefined ? (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              ) : myReviews.length === 0 ? (
                <Card className="card-layered">
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <Star className="size-8 text-muted-foreground" />
                    <p className="font-display text-lg font-semibold">
                      Aucun avis pour le moment
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Les clients notent vos interventions après réception des
                      travaux. Continuez comme ça !
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-4">
                  <Card className="card-layered border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent">
                    <CardContent className="flex items-center gap-4 py-5">
                      <span className="font-display text-4xl font-bold text-primary">
                        {myRating?.average ?? "—"}
                      </span>
                      <div className="flex flex-col gap-1">
                        <StarRating value={myRating?.average ?? 0} />
                        <span className="text-xs text-muted-foreground">
                          {myRating?.count ?? 0} avis client
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  <div className="flex flex-col gap-2">
                    {myReviews.map(({ review, clientName, requestRef }) => (
                      <div
                        key={review._id}
                        className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <StarRating value={review.rating} />
                            <span className="text-sm font-semibold">
                              {review.rating}/5
                            </span>
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {requestRef}
                          </span>
                        </div>
                        {review.comment && (
                          <p className="text-sm text-muted-foreground">
                            « {review.comment} »
                          </p>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {clientName} · {new Date(review.at).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}            </TabsContent>

            {/* Visites de maintenance */}
            <TabsContent value="visites" className="mt-4">
              {myVisits === undefined ? (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              ) : myVisits.length === 0 ? (
                <Card className="card-layered">
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <ClipboardCheck className="size-8 text-muted-foreground" />
                    <p className="font-display text-lg font-semibold">
                      Aucune visite de maintenance
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Les visites des contrats de maintenance qui vous sont
                      assignées apparaissent ici.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {myVisits.map(({ visit, contract }) => (
                    <Card key={visit._id} className="card-layered">
                      <CardContent className="flex flex-col gap-2.5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                              <CalendarClock
                                className={cn(
                                  "size-4",
                                  visit.status === "faite" ? "text-primary" : "text-amber-500",
                                )}
                              />
                              {contract.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {contract.reference} · {contract.city} ·{" "}
                              {contract.address}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                              visit.status === "faite"
                                ? "bg-primary/10 text-primary ring-primary/20"
                                : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
                            )}
                          >
                            {visit.status === "faite" ? "Faite" : "À faire"}
                          </span>
                        </div>
                        <p className="text-sm">
                          Visite prévue le{" "}
                          <span className="font-medium">
                            {formatDate(visit.scheduledAt)}
                          </span>
                        </p>
                        {visit.status === "faite" ? (
                          visit.report && (
                            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                              {visit.report}
                            </p>
                          )
                        ) : (
                          <VisitReportForm
                            disabled={busy}
                            onSubmit={(report) => handleCompleteVisit(visit._id, report)}
                          />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function VisitReportForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (report: string) => void;
}) {
  const [report, setReport] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={report}
        onChange={(e) => setReport(e.target.value)}
        placeholder="Compte rendu : équipements contrôlés, anomalie relevée, pièces remplacées, recommandations…"
        rows={3}
      />
      <Button
        size="sm"
        className="self-end"
        disabled={disabled || report.trim().length < 10}
        onClick={() => onSubmit(report.trim())}
      >
        <ClipboardCheck className="mr-1.5 size-4" /> Clôturer la visite
      </Button>
    </div>
  );
}

function StarRating({ value, size = 5 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            i <= Math.round(value)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30",
          )}
          style={{ width: size * 4, height: size * 4 }}
        />
      ))}
    </div>
  );
}
