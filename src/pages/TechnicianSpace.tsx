import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Banknote,
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
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/gtec";
import { ReportForm } from "@/components/ReportForm";
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
import { cn } from "@/lib/utils";
import { CITIES, fcfa, formatDateTime, PAYMENT_METHODS } from "@/lib/gtec";
import { Navigate } from "react-router";

const PLANS = [
  { key: "mensuel", label: "Mensuel", price: "5 000 FCFA", hint: "30 jours" },
  { key: "trimestriel", label: "Trimestriel", price: "12 000 FCFA", hint: "90 jours · 20 % de réduction" },
  { key: "annuel", label: "Annuel", price: "40 000 FCFA", hint: "365 jours · 33 % de réduction" },
] as const;

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

const MAX_DOC_SIZE = 1.2 * 1024 * 1024; // 1,2 Mo par document (data URL)

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
    if (file.size > MAX_DOC_SIZE) {
      toast.error(
        `Document trop lourd (${Math.round(file.size / 1024)} Ko) — maximum ${Math.round(MAX_DOC_SIZE / 1024)} Ko.`,
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

export default function TechnicianSpace() {
  const { user } = useAuth();
  const profile = useQuery(api.gtec.myTechnicianProfile);
  const missions = useQuery(api.gtec.listMyMissions);

  const apply = useMutation(api.gtec.submitTechnicianApplication);
  const requestSubPayment = useMutation(api.gtec.requestSubscriptionPayment);
  const requestMaterial = useMutation(api.gtec.requestMaterial);
  const collectCash = useMutation(api.gtec.technicianCollectCash);

  const pendingSubPayment = useQuery(api.gtec.myPendingSubscriptionPayment);
  const myPayouts = useQuery(api.gtec.listMyPayouts);
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
        highestDegree: highestDegree.trim(),
        fieldOfStudy: fieldOfStudy.trim() || undefined,
        school: school.trim() || undefined,
        graduationYear: graduationYear || undefined,
        documents,
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

  const pickCashProof = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1.2 * 1024 * 1024) {
      toast.error("Photo trop lourde — maximum 1,2 Mo.");
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

  const verified = profile?.status === "verifie";
  const activeMissions = (missions ?? []).filter(
    (m) => m.assignment.status !== "terminee" && m.request?.status !== "terminee",
  );
  const doneMissions = (missions ?? []).filter(
    (m) => m.assignment.status === "terminee" || m.request?.status === "terminee",
  );

  // Cloisonnement : seuls les comptes techniciens (et l'admin) entrent ici.
  if (user && user.accountType === "client") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppShell areaLabel="Espace technicien">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Espace technicien
          </p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight">
            Bonjour{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 🛠️
          </h1>
        </div>

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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Spécialité *</Label>
                      <Input
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        placeholder="Ex. : Électricité CFO/CATE, Solaire, CCTV…"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Métier exact</Label>
                      <Input
                        value={profession}
                        onChange={(e) => setProfession(e.target.value)}
                        placeholder="Ex. : Électricien bâtiment"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Années d'expérience *</Label>
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Dernier diplôme *</Label>
                      <Input
                        value={highestDegree}
                        onChange={(e) => setHighestDegree(e.target.value)}
                        placeholder="Ex. : CAP, BT, BTS, Licence, Ingénieur…"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm">Spécialité du diplôme</Label>
                      <Input
                        value={fieldOfStudy}
                        onChange={(e) => setFieldOfStudy(e.target.value)}
                        placeholder="Ex. : Électrotechnique"
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
                </section>

                {/* Documents obligatoires */}
                <section className="flex flex-col gap-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <FileBadge className="size-4 text-primary" /> Documents justificatifs *
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Obligatoire : pièce d'identité ET au moins un diplôme ou
                    certificat/attestation d'expérience. Formats acceptés : PDF,
                    images (max 1,2 Mo par fichier).
                  </p>
                  <DocumentsUploader
                    documents={documents}
                    onChange={setDocuments}
                    requiredKinds={["cni", "diploma"]}
                    disabled={busy}
                  />
                </section>

                <Button
                  className="halo-amber"
                  disabled={
                    busy ||
                    specialty.trim().length < 3 ||
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
              <TabsTrigger value="abonnement">
                <Crown className="mr-1.5 size-4" /> Abonnement
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
            </TabsList>

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

                            {request.status === "affectee" && (
                              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Truck className="size-4" />
                                Rendez-vous sur place à l'heure prévue —
                                l'admin démarrera l'intervention.
                              </p>
                            )}

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
                <Card className="card-layered">
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <Wallet className="size-8 text-muted-foreground" />
                    <p className="font-display text-lg font-semibold">
                      Aucun gain pour le moment
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Vos rémunérations apparaissent ici dès qu'un client signe le
                      PV d'une de vos missions terminées.
                    </p>
                  </CardContent>
                </Card>
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
          </Tabs>
        )}
      </div>
    </AppShell>
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
