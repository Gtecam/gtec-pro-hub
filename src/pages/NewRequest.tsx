import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crosshair,
  ImagePlus,
  Loader2,
  MapPin,
  Navigation,
  Send,
  Trash2,
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
import { CITIES, SERVICES, categoryIcon, type ServiceKey } from "@/lib/gtec";

const STEPS = [
  { key: "service", label: "Service" },
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState<string>("Douala");

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

  const canNext = () => {
    if (step === 0) return !!serviceKey;
    if (step === 1)
      return title.trim().length >= 4 && description.trim().length >= 10;
    if (step === 3) return address.trim().length >= 5;
    return true;
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const remaining = 4 - photos.length;
    Array.from(files)
      .slice(0, remaining)
      .forEach((file) => {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} : seules les images sont acceptées en V1`);
          return;
        }
        if (file.size > 2 * 1024 * 1024) {
          toast.error(`${file.name} : fichier trop lourd (max 2 Mo)`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setPhotos((p) => (p.length < 4 ? [...p, result] : p));
        };
        reader.readAsDataURL(file);
      });
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
              {step === 0 && "Que souhaitez-vous faire ?"}
              {step === 1 && "Décrivez votre besoin"}
              {step === 2 && "Photos du problème"}
              {step === 3 && "Adresse d'intervention"}
              {step === 4 && "Vérifiez et envoyez"}
            </CardTitle>
            <CardDescription>
              {step === 0 && "Choisissez le type d'intervention souhaité."}
              {step === 1 && "Un titre court et quelques détails suffisent."}
              {step === 2 && "Ajoutez jusqu'à 4 images (max 2 Mo chacune) — optionnel mais recommandé."}
              {step === 3 && "Où l'équipe doit-elle intervenir ?"}
              {step === 4 && "Un technicien GTEC prendra le relais et préparera votre devis."}
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

            {step === 1 && (
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
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Titre</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex. : Court-circuit au compteur"
                    maxLength={80}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez le problème, depuis quand, ce que vous avez déjà essayé…"
                    rows={6}
                  />
                  <span className="text-xs text-muted-foreground">
                    {description.trim().length}/10 caractères minimum
                  </span>
                </div>
              </div>
            )}

            {step === 2 && (
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

            {step === 3 && (
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

            {step === 4 && service && (
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
                      <dt className="text-muted-foreground">Service</dt>
                      <dd className="font-medium">{service.label}</dd>
                    </div>
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
          {step < 4 ? (
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
