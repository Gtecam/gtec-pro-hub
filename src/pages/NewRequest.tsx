import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Crosshair,
  ImagePlus,
  Loader2,
  MapPin,
  Mic,
  Square,
  Navigation,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/gtec";
import { useGeolocation, type GeoFix } from "@/hooks/useGeolocation";
import { formatGps, gmapsCoordsUrl, nearestCity } from "@/lib/gps";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CITIES, MAX_FILE_SIZE_LABEL, SERVICES, categoryIcon, type ServiceKey } from "@/lib/gtec";
import { NOMENCLATURE, SKILLS_BY_DOMAIN } from "@/lib/nomenclature";
import {
  URGENCY_LEVELS,
  interventionsForService,
  interventionByCode,
} from "@/lib/interventions";
import { compressImageIfNeeded, dataUrlBytes, humanSize } from "@/lib/imageCompress";

const STEPS = [
  { key: "service", label: "Domaine" },
  { key: "intervention", label: "Intervention" },
  { key: "besoin", label: "Besoin" },
  { key: "photos", label: "Photos" },
  { key: "adresse", label: "Adresse" },
  { key: "recap", label: "Récapitulatif" },
] as const;

export default function NewRequest() {
  const navigate = useNavigate();
  const createRequest = useMutation(api.gtec.createRequest);
  // Catalogue dynamique géré par l'administration (§4) ; tant que le backend
  // n'a pas répondu, on affiche la liste statique des 12 domaines officiels.
  const categories = useQuery(api.catalog.listServiceCategories, {});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [serviceKey, setServiceKey] = useState<ServiceKey | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [interventionCode, setInterventionCode] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState<string>("Douala");
  // NOMENCLATURE GTEC PRO : spécialité professionnelle attendue + compétences.
  const [specialtyCode, setSpecialtyCode] = useState<string>("");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  // Formulaire enrichi : urgence, date souhaitée, budget, message vocal.
  const [urgency, setUrgency] = useState<string>("normale");
  const [desiredDate, setDesiredDate] = useState("");
  const [budgetHint, setBudgetHint] = useState("");
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // GPS du chantier : position capturée au moment de la demande (facultative).
  const geo = useGeolocation();
  const [gpsCoords, setGpsCoords] = useState<GeoFix | null>(null);

  const captureGps = () => {
    geo.locate();
  };

  const fileRef = useRef<HTMLInputElement>(null);

  // Vue d'affichage : données dynamiques dès qu'elles arrivent, sinon la
  // liste statique des 12 domaines officiels pendant le chargement.
  const view = (
    categories
      ? categories.map((c) => ({
          key: c.key as ServiceKey,
          label: c.label,
          desc: c.description ?? "",
          icon: categoryIcon(c.icon),
          subcategories: c.subcategories,
        }))
      : SERVICES.map((s) => ({
          key: s.key,
          label: s.label,
          desc: s.desc,
          icon: s.icon,
          subcategories: [] as { key: string; label: string }[],
        }))
  );

  // Dès qu'un fix GPS arrive (bouton « Ma position »), on l'enregistre et on
  // propose automatiquement la ville GTEC la plus proche.
  const lastFixKey = geo.position
    ? `${geo.position.coords.lat},${geo.position.coords.lon}`
    : "";
  useEffect(() => {
    if (!geo.position || geo.loading) return;
    setGpsCoords(geo.position);
    const near = nearestCity(geo.position.coords);
    if (near && near.distanceKm <= 40) {
      setCity((c) => {
        if (c !== near.city) {
          toast.info(`Ville détectée : ${near.city} (${near.distanceKm} km)`);
          return near.city;
        }
        return c;
      });
    }
    // Déclenché uniquement quand un nouveau fix GPS est reçu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFixKey]);

  const catalogue = serviceKey ? interventionsForService(serviceKey) : undefined;
  const intervention = interventionByCode(interventionCode);

  // Spécialité présélectionnée depuis la nomenclature quand une intervention
  // catalogue a des compétences exigées (repli : sélection manuelle).
  const skillsForSpecialty = specialtyCode
    ? (SKILLS_BY_DOMAIN[
        NOMENCLATURE.find((d) => d.specialties.some((s) => s.code === specialtyCode))?.code ?? ""
      ] ?? [])
    : [];

  const canNext = () => {
    if (step === 0) return !!serviceKey;
    if (step === 1) return !!interventionCode;
    if (step === 2)
      return title.trim().length >= 4 && description.trim().length >= 10;
    if (step === 4) return address.trim().length >= 5;
    return true;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = 4 - photos.length;
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} : seules les images sont acceptées en V1`);
        continue;
      }
      // Compression automatique : une image lourde est réduite au lieu d'être refusée.
      const res = await compressImageIfNeeded(file);
      if (!res.ok) {
        toast.error(
          `${file.name} : trop lourd même après compression (max ${MAX_FILE_SIZE_LABEL}).`,
        );
        continue;
      }
      const dataUrl = res.compressed
        ? res.dataUrl
        : await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(file);
          });
      if (res.compressed) {
        toast.success(
          `${file.name} compressée : ${humanSize(res.originalSize)} → ${humanSize(dataUrlBytes(dataUrl))}.`,
        );
      }
      setPhotos((p) => (p.length < 4 ? [...p, dataUrl] : p));
    }
  };

  // ===== Message vocal (MediaRecorder, ~1 minute max, compressé webm/opus) =====
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 600 * 1024) {
          toast.error("Message vocal trop long — limitez-vous à ~1 minute.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setVoiceNoteUrl(String(reader.result));
          toast.success("Message vocal enregistré");
        };
        reader.readAsDataURL(blob);
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone indisponible — vérifiez les autorisations.");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const submit = async () => {
    if (!serviceKey) return;
    setSubmitting(true);
    try {
      const id = await createRequest({
        serviceKey,
        subcategory: subcategory ?? undefined,
        title: title.trim(),
        description: description.trim(),
        address: address.trim(),
        city,
        photos,
        specialtyCode: specialtyCode || undefined,
        requiredSkills: requiredSkills.length ? requiredSkills : undefined,
        interventionCode: interventionCode || undefined,
        urgency: urgency as "normale" | "urgente" | "critique",
        desiredDate: desiredDate ? new Date(desiredDate).getTime() : undefined,
        budgetHint: budgetHint ? Number(budgetHint) : undefined,
        voiceNoteUrl: voiceNoteUrl ?? undefined,
        coords: gpsCoords
          ? {
              lat: gpsCoords.coords.lat,
              lon: gpsCoords.coords.lon,
              accuracy: Math.round(gpsCoords.accuracy),
            }
          : undefined,
      });
      toast.success("Demande envoyée à GTEC PRO");
      navigate(`/dashboard/requests/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      setSubmitting(false);
    }
  };

  const service = view.find((s) => s.key === serviceKey);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <button
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => (step === 0 ? navigate("/dashboard") : setStep((s) => s - 1))}
        >
          <ArrowLeft className="size-4" />
          {step === 0 ? "Retour au tableau de bord" : "Étape précédente"}
        </button>

        {/* Progression */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 flex-col gap-1.5">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  i < step ? "bg-primary" : i === step ? "bg-primary/60" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "text-[11px] font-medium",
                  i === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <Card className="card-layered">
          <CardHeader>
            <CardTitle className="font-display text-xl">
              {step === 0 && "Choisissez votre domaine"}
              {step === 1 && "Que souhaitez-vous faire ?"}
              {step === 2 && "Décrivez votre besoin"}
              {step === 3 && "Photos du problème"}
              {step === 4 && "Adresse d'intervention"}
              {step === 5 && "Vérifiez et envoyez"}
            </CardTitle>
            <CardDescription>
              {step === 0 && "Les 12 domaines GTEC PRO — l'ordre définitif de l'offre."}
              {step === 1 &&
                service &&
                `Interventions « ${service.label} » — sélectionnez celle qui correspond à votre besoin.`}
              {step === 2 && "Un titre court, quelques détails, l'urgence et vos contraintes."}
              {step === 3 && `Ajoutez jusqu'à 4 images (max ${MAX_FILE_SIZE_LABEL} chacune) — optionnel mais recommandé.`}
              {step === 4 && "Où l'équipe doit-elle intervenir ?"}
              {step === 5 && "Un technicien GTEC prendra le relais et préparera votre devis."}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-[280px]">
            {step === 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {view.map((s) => {
                  const Icon = s.icon;
                  const active = serviceKey === s.key;
                  return (
                    <button
                      key={s.key}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-muted/40",
                      )}
                      onClick={() => {
                        setServiceKey(s.key);
                        setSubcategory(null);
                        setInterventionCode("");
                      }}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span>
                        <span className="block font-medium">{s.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {s.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 1 && service && (
              <div className="flex flex-col gap-5">
                {catalogue ? (
                  catalogue.families.map((family) => (
                    <div key={family.key} className="flex flex-col gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {family.label}
                      </p>
                      <div className="grid gap-1.5">
                        {family.items.map((item) => {
                          const active = interventionCode === item.code;
                          return (
                            <button
                              key={item.code}
                              type="button"
                              className={cn(
                                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-all",
                                active
                                  ? "border-primary bg-primary/5 font-medium ring-1 ring-primary/30"
                                  : "border-border/70 hover:border-primary/40 hover:bg-muted/40",
                              )}
                              onClick={() => setInterventionCode(item.code)}
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{item.label}</span>
                                {item.skills && item.skills.length > 0 && (
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    Compétences : {item.skills.join(", ")}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                {item.code}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    Ce domaine utilise un catalogue personnalisé géré par
                    l'administration. Précisez votre besoin à l'étape suivante.
                  </p>
                )}
                {intervention && (
                  <p className="rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">
                    Sélection : <span className="font-semibold text-foreground">{intervention.label}</span>{" "}
                    · code <span className="font-mono">{intervention.code}</span>
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                {service && service.subcategories.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      Type de problème — {service.label}
                    </label>
                    <Select
                      value={subcategory ?? ""}
                      onValueChange={setSubcategory}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Précisez le type d'intervention" />
                      </SelectTrigger>
                      <SelectContent>
                        {service.subcategories.map((sub) => (
                          <SelectItem key={sub.key} value={sub.label}>
                            {sub.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* NOMENCLATURE GTEC PRO : spécialité attendue + compétences requises */}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3 flex flex-col gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      Spécialité professionnelle attendue (optionnel)
                    </label>
                    <Select value={specialtyCode} onValueChange={(v) => { setSpecialtyCode(v); setRequiredSkills([]); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Préciser la spécialité GTEC PRO (ELEC-ELEC-IND…)" />
                      </SelectTrigger>
                      <SelectContent>
                        {NOMENCLATURE.map((domain) => (
                          <div key={domain.code}>
                            <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {domain.label}
                            </p>
                            {domain.specialties.map((s) => (
                              <SelectItem key={s.code} value={s.code} className="pl-4">
                                {s.label}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {specialtyCode && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium">Compétences attendues</label>
                      <div className="flex flex-wrap gap-1.5">
                        {skillsForSpecialty.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setRequiredSkills((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                              )
                            }
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs transition-colors",
                              requiredSkills.includes(s)
                                ? "border-primary bg-primary/10 font-medium text-primary"
                                : "border-border/70 text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Le moteur d'affectation priorisera les techniciens dont la spécialité, le métier, le diplôme et les compétences correspondent ({specialtyCode}).
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Titre</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={intervention ? intervention.label : "Ex. : Court-circuit au compteur"}
                    maxLength={80}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez le problème, depuis quand, ce que vous avez déjà essayé…"
                    rows={5}
                  />
                  <span className="text-xs text-muted-foreground">
                    {description.trim().length}/10 caractères minimum
                  </span>
                </div>

                {/* Niveau d'urgence */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Niveau d'urgence</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {URGENCY_LEVELS.map((u) => (
                      <button
                        key={u.key}
                        type="button"
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                          urgency === u.key
                            ? "border-primary bg-primary/5 font-medium ring-1 ring-primary/30"
                            : "border-border/70 hover:bg-muted/40",
                        )}
                        onClick={() => setUrgency(u.key)}
                      >
                        {u.label}
                        <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                          {u.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date souhaitée + budget indicatif */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium">
                      <CalendarClock className="size-3.5 text-primary" /> Date souhaitée
                    </label>
                    <Input
                      type="datetime-local"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium">
                      <Wallet className="size-3.5 text-primary" /> Budget indicatif (FCFA)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={budgetHint}
                      onChange={(e) => setBudgetHint(e.target.value)}
                      placeholder="Facultatif"
                    />
                  </div>
                </div>

                {/* Message vocal */}
                <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-sm font-medium">Message vocal (optionnel)</p>
                  {voiceNoteUrl ? (
                    <div className="flex items-center gap-2">
                      <audio controls src={voiceNoteUrl} className="h-9 flex-1" />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setVoiceNoteUrl(null)}
                      >
                        <Trash2 className="mr-1.5 size-4" /> Retirer
                      </Button>
                    </div>
                  ) : recording ? (
                    <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="self-start">
                      <Square className="mr-2 size-4 animate-pulse" /> Arrêter l'enregistrement
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => void startRecording()} className="self-start">
                      <Mic className="mr-2 size-4" /> Enregistrer un message vocal
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Décrivez votre besoin à l'oral (~1 minute max) — l'équipe
                    l'entendra depuis votre dossier.
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {photos.map((photo, i) => (
                    <div key={i} className="group relative overflow-hidden rounded-xl border">
                      <img src={photo} alt={`Photo ${i + 1}`} className="aspect-square w-full object-cover" />
                      <button
                        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 4 && (
                    <button
                      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      onClick={() => fileRef.current?.click()}
                    >
                      <ImagePlus className="size-6" />
                      <span className="text-xs">Ajouter</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Les photos aident l'équipe à préparer le bon matériel dès le devis.
                </p>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Ville</label>
                  <Select value={city} onValueChange={setCity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une ville" />
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
                  <label className="text-sm font-medium">Adresse complète</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Quartier, rue, repère…"
                    />
                  </div>
                </div>

                {/* Géolocalisation GPS du chantier */}
                <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <Navigation className="size-4 text-primary" /> Position GPS
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant={gpsCoords ? "outline" : "default"}
                      onClick={captureGps}
                      disabled={geo.loading}
                    >
                      {geo.loading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Crosshair className="mr-2 size-4" />
                      )}
                      {gpsCoords ? "Actualiser ma position" : "Utiliser ma position"}
                    </Button>
                  </div>
                  {gpsCoords ? (
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span>
                        Chantier épinglé :{" "}
                        <span className="font-mono text-foreground">
                          {formatGps(gpsCoords.coords)}
                        </span>{" "}
                        (± {Math.round(gpsCoords.accuracy)} m)
                      </span>
                      <span>
                        L'équipe recevra la position exacte — repérage et
                        itinéraire facilités.
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Facultatif : un tap partage votre position GPS pour que
                      l'équipe trouve le chantier sans appeler.{" "}
                      {geo.error && (
                        <span className="text-destructive">{geo.error}</span>
                      )}
                    </p>
                  )}
                  {gpsCoords && (
                    <a
                      href={gmapsCoordsUrl(gpsCoords.coords)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Vérifier sur Google Maps ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            {step === 5 && service && (
              <div className="flex flex-col gap-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl bg-muted/50 p-4 text-sm"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-4 text-primary" />
                    Tout est prêt
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Domaine</dt>
                      <dd className="font-medium">{service.label}</dd>
                    </div>
                    {intervention && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Intervention</dt>
                        <dd className="text-right font-medium">
                          {intervention.label}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {intervention.code}
                          </span>
                        </dd>
                      </div>
                    )}
                    {subcategory && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Type</dt>
                        <dd className="font-medium">{subcategory}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Titre</dt>
                      <dd className="text-right font-medium">{title}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Urgence</dt>
                      <dd className="font-medium">
                        {URGENCY_LEVELS.find((u) => u.key === urgency)?.label ?? "Normale"}
                      </dd>
                    </div>
                    {desiredDate && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Date souhaitée</dt>
                        <dd className="font-medium">
                          {new Date(desiredDate).toLocaleString("fr-FR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </dd>
                      </div>
                    )}
                    {budgetHint && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Budget indicatif</dt>
                        <dd className="font-medium">
                          {Number(budgetHint).toLocaleString("fr-FR")} FCFA
                        </dd>
                      </div>
                    )}
                    {voiceNoteUrl && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Message vocal</dt>
                        <dd className="font-medium">Joint ✓</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Photos</dt>
                      <dd className="font-medium">{photos.length || "Aucune"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Adresse</dt>
                      <dd className="text-right font-medium">
                        {address}, {city}
                      </dd>
                    </div>
                    {gpsCoords && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Position GPS</dt>
                        <dd className="font-mono text-right font-medium">
                          {formatGps(gpsCoords.coords)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </motion.div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? navigate("/dashboard") : setStep((s) => s - 1))}
          >
            <ArrowLeft className="mr-2 size-4" /> Retour
          </Button>
          {step < 5 ? (
            <Button disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
              Continuer <ArrowRight className="ml-2 size-4" />
            </Button>
          ) : (
            <Button className="halo-amber" disabled={submitting} onClick={submit}>
              <Send className="mr-2 size-4" />
              {submitting ? "Envoi…" : "Envoyer la demande"}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
