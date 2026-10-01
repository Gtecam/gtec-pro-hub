import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  Award,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  FileDown,
  GraduationCap,
  History,
  Pencil,
  Plus,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { NOMENCLATURE } from "@/lib/nomenclature";
import { credentialBadge } from "@/lib/institutions";
import { formatDate } from "@/lib/gtec";
import { openProfilePdf } from "@/lib/profilePdf";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "text-muted-foreground" },
  SUBMITTED: { label: "Soumis — à vérifier ⏳", cls: "text-amber-600 dark:text-amber-400" },
  UNDER_REVIEW: { label: "En cours d'examen", cls: "text-amber-600 dark:text-amber-400" },
  VERIFIED: { label: "Vérifié GTEC PRO ✓", cls: "text-emerald-600 dark:text-emerald-400" },
  REJECTED: { label: "Refusé", cls: "text-destructive" },
};

const SKILL_LEVELS = ["DEBUTANT", "INTERMEDIAIRE", "AVANCE", "EXPERT"] as const;
const SKILL_LEVEL_LABELS: Record<string, string> = {
  DEBUTANT: "Débutant",
  INTERMEDIAIRE: "Intermédiaire",
  AVANCE: "Avancé",
  EXPERT: "Expert",
};

type Kind = "experience" | "skill" | "certification" | "training" | "project";

/** Dialogue générique d'ajout/édition par rubrique. */
function ItemDialog({
  kind,
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const domains = NOMENCLATURE;
  const [form, setForm] = useState<Record<string, string>>({});

  const titles: Record<Kind, string> = {
    experience: "Ajouter une expérience professionnelle",
    skill: "Ajouter une compétence",
    certification: "Ajouter une certification",
    training: "Ajouter une formation",
    project: "Ajouter une réalisation",
  };

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (kind === "experience") {
      if ((form.title ?? "").trim().length < 3) {
        toast.error("Indiquez la fonction ou le poste occupé.");
        return;
      }
      onSubmit({
        title: form.title,
        company: form.company,
        domainCode: form.domainCode || undefined,
        domainLabel: domains.find((d) => d.code === form.domainCode)?.label,
        startDate: form.startDate || undefined,
        endDate: form.isCurrent ? undefined : form.endDate || undefined,
        isCurrent: form.isCurrent === "1",
        description: form.description,
        achievements: form.achievements,
        city: form.city,
      });
    } else if (kind === "skill") {
      if ((form.skill ?? "").trim().length < 2) {
        toast.error("Indiquez la compétence.");
        return;
      }
      onSubmit({
        skill: form.skill,
        domainCode: form.domainCode || undefined,
        domainLabel: domains.find((d) => d.code === form.domainCode)?.label,
        level: form.level || undefined,
        yearsPracticed: form.yearsPracticed ? Number(form.yearsPracticed) : undefined,
        description: form.description,
      });
    } else if (kind === "certification") {
      if ((form.name ?? "").trim().length < 2) {
        toast.error("Indiquez le nom de la certification.");
        return;
      }
      onSubmit({
        name: form.name,
        organization: form.organization,
        domainCode: form.domainCode || undefined,
        domainLabel: domains.find((d) => d.code === form.domainCode)?.label,
        number: form.number,
        obtainedAt: form.obtainedAt ? new Date(form.obtainedAt).getTime() : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : undefined,
      });
    } else if (kind === "training") {
      if ((form.name ?? "").trim().length < 3) {
        toast.error("Indiquez le nom de la formation.");
        return;
      }
      onSubmit({
        name: form.name,
        organization: form.organization,
        domainCode: form.domainCode || undefined,
        domainLabel: domains.find((d) => d.code === form.domainCode)?.label,
        completedAt: form.completedAt ? new Date(form.completedAt).getTime() : undefined,
        durationHours: form.durationHours ? Number(form.durationHours) : undefined,
        skillsAcquired: form.skillsAcquired
          ? form.skillsAcquired.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      });
    } else {
      if ((form.title ?? "").trim().length < 3) {
        toast.error("Indiquez le titre de la réalisation.");
        return;
      }
      onSubmit({
        title: form.title,
        domainCode: form.domainCode || undefined,
        domainLabel: domains.find((d) => d.code === form.domainCode)?.label,
        description: form.description,
        installationType: form.installationType,
        completedAt: form.completedAt ? new Date(form.completedAt).getTime() : undefined,
        city: form.city,
        materialsUsed: form.materialsUsed,
        difficulty: form.difficulty,
        outcome: form.outcome,
      });
    }
  };

  const domainSelect = (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">Domaine</Label>
      <Select value={form.domainCode ?? ""} onValueChange={(v) => set("domainCode", v)}>
        <SelectTrigger>
          <SelectValue placeholder="Choisir un domaine" />
        </SelectTrigger>
        <SelectContent>
          {domains.map((d) => (
            <SelectItem key={d.code} value={d.code}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[kind]}</DialogTitle>
          <DialogDescription>
            Les informations avec justificatif peuvent être soumises à la
            vérification GTEC PRO. Vous ne pouvez jamais vous auto-vérifier.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
          {(kind === "experience" || kind === "project") && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">
                {kind === "experience" ? "Fonction / poste occupé *" : "Titre du projet *"}
              </Label>
              <Input
                value={form.title ?? ""}
                onChange={(e) => set("title", e.target.value)}
                placeholder={
                  kind === "experience"
                    ? "Ex. : Technicien électricien industriel"
                    : "Ex. : Installation solaire 10 kW — bâtiment commercial"
                }
              />
            </div>
          )}
          {kind === "experience" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Entreprise / client</Label>
              <Input
                value={form.company ?? ""}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Ex. : XYZ Industrie"
              />
            </div>
          )}
          {(kind === "certification" || kind === "training") && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">
                {kind === "certification" ? "Nom de la certification *" : "Nom de la formation *"}
              </Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder={
                  kind === "certification"
                    ? "Ex. : Habilitation électrique B2V-BR"
                    : "Ex. : Installation et maintenance photovoltaïques"
                }
              />
            </div>
          )}
          {kind === "skill" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Compétence *</Label>
              <Input
                value={form.skill ?? ""}
                onChange={(e) => set("skill", e.target.value)}
                placeholder="Ex. : Installation photovoltaïque"
              />
            </div>
          )}
          {domainSelect}
          {kind === "skill" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Niveau</Label>
                  <Select value={form.level ?? ""} onValueChange={(v) => set("level", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILL_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {SKILL_LEVEL_LABELS[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Années de pratique</Label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={form.yearsPracticed ?? ""}
                    onChange={(e) => set("yearsPracticed", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
          {kind === "experience" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Début</Label>
                <Input
                  type="month"
                  value={form.startDate ?? ""}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Fin</Label>
                <Input
                  type="month"
                  value={form.endDate ?? ""}
                  onChange={(e) => set("endDate", e.target.value)}
                  disabled={form.isCurrent === "1"}
                />
              </div>
              <label className="mt-5 flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isCurrent === "1"}
                  onCheckedChange={(v) => set("isCurrent", v ? "1" : "")}
                />
                Poste actuel
              </label>
            </div>
          )}
          {(kind === "certification" || kind === "training" || kind === "project") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">
                  {kind === "certification" ? "Date d'obtention" : "Date"}
                </Label>
                <Input
                  type="date"
                  value={form.obtainedAt ?? form.completedAt ?? ""}
                  onChange={(e) =>
                    set(kind === "certification" ? "obtainedAt" : "completedAt", e.target.value)
                  }
                />
              </div>
              {kind === "certification" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Date d'expiration</Label>
                  <Input
                    type="date"
                    value={form.expiresAt ?? ""}
                    onChange={(e) => set("expiresAt", e.target.value)}
                  />
                </div>
              )}
              {kind === "training" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Durée (heures)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.durationHours ?? ""}
                    onChange={(e) => set("durationHours", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          {(kind === "certification" || kind === "training") && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Organisme</Label>
              <Input
                value={form.organization ?? ""}
                onChange={(e) => set("organization", e.target.value)}
              />
            </div>
          )}
          {kind === "certification" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Numéro de la certification</Label>
              <Input value={form.number ?? ""} onChange={(e) => set("number", e.target.value)} />
            </div>
          )}
          {(kind === "experience" || kind === "project") && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Ville</Label>
              <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </div>
          )}
          {kind === "project" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Type d'installation</Label>
              <Input
                value={form.installationType ?? ""}
                onChange={(e) => set("installationType", e.target.value)}
                placeholder="Ex. : Solaire raccordé réseau"
              />
            </div>
          )}
          {kind !== "skill" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">
                {kind === "experience" ? "Missions / description" : "Description"}
              </Label>
              <Textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder={
                  kind === "experience"
                    ? "Maintenance des moteurs, installation d'armoires électriques…"
                    : undefined
                }
              />
            </div>
          )}
          {kind === "experience" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Réalisations principales</Label>
              <Textarea
                rows={2}
                value={form.achievements ?? ""}
                onChange={(e) => set("achievements", e.target.value)}
              />
            </div>
          )}
          {kind === "training" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Compétences acquises (séparées par des virgules)</Label>
              <Input
                value={form.skillsAcquired ?? ""}
                onChange={(e) => set("skillsAcquired", e.target.value)}
                placeholder="Dimensionnement, Installation, Maintenance"
              />
            </div>
          )}
          {kind === "project" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Matériel utilisé</Label>
                <Input
                  value={form.materialsUsed ?? ""}
                  onChange={(e) => set("materialsUsed", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Résultat obtenu</Label>
                <Textarea
                  rows={2}
                  value={form.outcome ?? ""}
                  onChange={(e) => set("outcome", e.target.value)}
                />
              </div>
            </>
          )}
          {kind === "skill" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Description</Label>
              <Textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            <Plus className="mr-1.5 size-4" /> Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return <span className={cn("shrink-0 text-xs font-medium", meta.cls)}>{meta.label}</span>;
}

/**
 * « MON PROFIL » — dossier professionnel vivant (§26) : complétion (§12),
 * expériences (§4), compétences (§3), diplômes (§7, référentiel),
 * certifications (§8), formations (§9), réalisations (§6), interventions
 * GTEC PRO (§5) et historique (§15).
 */
export function MyProfile() {
  const data = useQuery(api.profile.myProfileData, {});
  const completion = useQuery(api.profile.myProfileCompletion, {});
  const gtecExps = useQuery(api.profile.myGtecExperiences, {});
  const upsertExperience = useMutation(api.profile.upsertExperience);
  const upsertSkill = useMutation(api.profile.upsertSkill);
  const upsertCert = useMutation(api.profile.upsertCertification);
  const upsertTraining = useMutation(api.profile.upsertTraining);
  const upsertProject = useMutation(api.profile.upsertProject);
  const submitForVerification = useMutation(api.profile.submitForVerification);
  const setItemActive = useMutation(api.profile.setItemActive);
  const setProjectPublic = useMutation(api.profile.setProjectPublic);
  const addGtec = useMutation(api.profile.addGtecExperienceToPortfolio);

  // Entreprise & équipe (§10-§11) — alimente le bloc dédié et le passeport PDF.
  const companyData = useQuery(api.profile.myCompany, {});
  const techProfile = useQuery(api.gtec.myTechnicianProfile, {});

  const [busy, setBusy] = useState(false);
  const [dialogKind, setDialogKind] = useState<Kind | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setDialogKind(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const submitDialog = (kind: Kind) => (payload: Record<string, unknown>) => {
    if (kind === "experience") run(() => upsertExperience(payload as never), "Expérience ajoutée à votre dossier");
    else if (kind === "skill") run(() => upsertSkill(payload as never), "Compétence ajoutée");
    else if (kind === "certification") run(() => upsertCert(payload as never), "Certification ajoutée");
    else if (kind === "training") run(() => upsertTraining(payload as never), "Formation ajoutée");
    else run(() => upsertProject(payload as never), "Réalisation ajoutée à votre portfolio");
  };

  if (data === undefined || companyData === undefined || completion === undefined) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  }

  const doneCount = completion.items.filter((i) => i.done).length;

  // Passeport professionnel (§19) — export PDF imprimable du dossier vivant.
  const activeExperiences = data.experiences.filter((e) => e.isActive);
  const activeSkills = data.skills.filter((s) => s.isActive);
  const activeCertifications = data.certifications.filter((c) => c.isActive);
  const activeTrainings = data.trainings.filter((t) => t.isActive);
  const activeProjects = data.projects.filter((p) => p.isActive);
  const company = companyData.company;
  const teamCount = companyData.team.filter((m) => m.status === "ACTIVE").length;
  const dom = NOMENCLATURE.find((d) => d.code === techProfile?.domainCode);
  const specLabel = Array.isArray(dom?.specialties)
    ? (dom?.specialties as Array<{ code?: string; label?: string }>).find(
        (s) => s?.code === techProfile?.specialtyCode,
      )?.label
    : undefined;

  const generatePdf = () => {
    try {
      openProfilePdf({
        generatedAt: Date.now(),
        fullName:
          [techProfile?.firstName, techProfile?.lastName].filter(Boolean).join(" ") ||
          "Adhérent GTEC PRO",
        jobTitle: techProfile?.jobTitle ?? techProfile?.profession ?? undefined,
        domainLabel: dom?.label,
        specialtyLabel: specLabel,
        city: techProfile?.city ?? undefined,
        phone: techProfile?.phone ?? undefined,
        bio: techProfile?.bio ?? undefined,
        experienceYears: techProfile?.experienceYears ?? undefined,
        completionPercent: completion.percent,
        highestDegree: techProfile?.highestDegree ?? undefined,
        credentials: data.credentials.map((c) => ({
          title: c.diplomaTitle ?? c.degreeKey ?? "Diplôme",
          institution: c.institutionName,
          year: c.graduationYear ?? undefined,
          verified: c.verificationStatus === "verifie",
        })),
        skills: activeSkills.map((s) => ({
          label: s.skill,
          levelLabel: s.level ? SKILL_LEVEL_LABELS[s.level] : undefined,
          years: s.yearsPracticed ?? undefined,
          verified: s.status === "VERIFIED",
        })),
        certifications: activeCertifications.map((c) => ({
          name: c.name,
          organization: c.organization ?? undefined,
          obtainedLabel: c.obtainedAt ? formatDate(c.obtainedAt) : undefined,
          expiresLabel: c.expiresAt ? formatDate(c.expiresAt) : undefined,
          verified: c.status === "VERIFIED",
        })),
        trainings: activeTrainings.map((t) => ({
          name: t.name,
          organization: t.organization ?? undefined,
          dateLabel: t.completedAt ? formatDate(t.completedAt) : undefined,
          hours: t.durationHours ?? undefined,
        })),
        experiences: activeExperiences.map((e) => ({
          title: e.title,
          company: e.company ?? undefined,
          periodLabel: `${e.startDate ?? "?"} → ${e.isCurrent ? "aujourd'hui" : (e.endDate ?? "?")}`,
          city: e.city ?? undefined,
          description: e.description ?? undefined,
          verified: e.status === "VERIFIED",
        })),
        projects: activeProjects.map((p) => ({
          title: p.title,
          domainLabel: p.domainLabel ?? undefined,
          city: p.city ?? undefined,
          dateLabel: p.completedAt ? formatDate(p.completedAt) : undefined,
          description: p.description ?? undefined,
          outcome: p.outcome ?? undefined,
          verified: p.status === "VERIFIED",
        })),
        gtecInterventions: (gtecExps ?? [])
          .filter((g) => g.finished)
          .map((g) => ({
            reference: g.reference,
            title: g.title,
            dateLabel: formatDate(g.date),
            city: g.city ?? undefined,
            rating: g.rating ?? undefined,
          })),
        company: company
          ? {
              name: company.name,
              status: company.status,
              city: company.city ?? undefined,
              phone: company.phone ?? undefined,
              email: company.email ?? undefined,
              domains: company.domains ?? undefined,
              teamCount,
            }
          : null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impression impossible — réessayez.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Complétion du profil (§12) */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> Profil complété à {completion.percent} %
            </p>
            <span className="text-xs text-muted-foreground">
              {doneCount}/{completion.items.length} éléments
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {completion.items.map((i) => (
              <span
                key={i.key}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  i.done
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-dashed text-muted-foreground",
                )}
              >
                {i.done ? "✓" : "○"} {i.label}
              </span>
            ))}
          </div>
          {completion.percent < 100 && (
            <p className="text-xs text-muted-foreground">
              Complétez votre profil pour améliorer votre visibilité et permettre
              une meilleure correspondance avec les missions.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions rapides */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setDialogKind("experience")}>
          <Plus className="mr-1.5 size-4" /> Expérience
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialogKind("skill")}>
          <Plus className="mr-1.5 size-4" /> Compétence
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialogKind("certification")}>
          <Plus className="mr-1.5 size-4" /> Certification
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialogKind("training")}>
          <Plus className="mr-1.5 size-4" /> Formation
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialogKind("project")}>
          <Plus className="mr-1.5 size-4" /> Réalisation
        </Button>
        <Button size="sm" variant="outline" onClick={generatePdf}>
          <FileDown className="mr-1.5 size-4" /> Générer mon profil PDF
        </Button>
      </div>

      {/* Expériences GTEC PRO (§5) — client masqué */}
      {gtecExps !== undefined && gtecExps.length > 0 && (
        <Card className="card-layered">
          <CardContent className="flex flex-col gap-2 px-4 py-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Wrench className="size-4 text-primary" /> Interventions GTEC PRO
            </p>
            <p className="text-xs text-muted-foreground">
              Chaque intervention terminée peut alimenter votre portfolio
              professionnel — les données du client ne sont jamais affichées.
            </p>
            {gtecExps.map((x) => (
              <div
                key={x.requestId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {x.reference} — {x.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {x.city} · {formatDate(x.date)}
                    {x.rating ? ` · ${x.rating}/5 ⭐` : ""}
                    {x.finished ? " · Terminée ✓" : ` · ${x.status}`}
                  </p>
                </div>
                {x.finished &&
                  (x.alreadyAdded ? (
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      <CheckCircle2 className="mr-1 size-3" /> Dans le portfolio
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => addGtec({ requestId: x.requestId as never }),
                          "Intervention ajoutée au portfolio",
                        )
                      }
                    >
                      <Plus className="mr-1 size-3.5" /> Portfolio
                    </Button>
                  ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Expériences professionnelles (§4) */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Briefcase className="size-4 text-primary" /> Mes expériences professionnelles
          </p>
          {data.experiences.filter((e) => e.isActive).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune expérience renseignée — ajoutez votre parcours (jamais
              supprimé, archivable à tout moment).
            </p>
          ) : (
            data.experiences
              .filter((e) => e.isActive)
              .map((e) => (
                <div key={e._id} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {e.title}
                      {e.company ? ` · ${e.company}` : ""}
                    </p>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {e.startDate ?? "?"} → {e.isCurrent ? "aujourd'hui" : (e.endDate ?? "?")}
                    {e.city ? ` · ${e.city}` : ""}
                    {e.domainLabel ? ` · ${e.domainLabel}` : ""}
                  </p>
                  {e.description && (
                    <p className="text-xs text-muted-foreground">{e.description}</p>
                  )}
                  <div className="flex gap-1.5">
                    {e.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => submitForVerification({ kind: "experience", id: e._id }),
                            "Envoyé pour vérification GTEC PRO",
                          )
                        }
                      >
                        <Send className="mr-1 size-3" /> Faire vérifier
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => setItemActive({ kind: "experience", id: e._id, isActive: false }),
                          "Expérience archivée (conservée dans l'historique)",
                        )
                      }
                    >
                      <Archive className="mr-1 size-3" /> Archiver
                    </Button>
                  </div>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Compétences (§3) */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Wrench className="size-4 text-primary" /> Mes compétences
          </p>
          {data.skills.filter((s) => s.isActive).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ajoutez vos compétences avec leur niveau et vos années de pratique.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.skills
                .filter((s) => s.isActive)
                .map((s) => (
                  <span
                    key={s._id}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      s.status === "VERIFIED" && "border-emerald-500/30 bg-emerald-500/10",
                    )}
                  >
                    <span className="font-medium">{s.skill}</span>
                    {s.level && <span className="text-muted-foreground">· {SKILL_LEVEL_LABELS[s.level] ?? s.level}</span>}
                    {s.yearsPracticed != null && <span className="text-muted-foreground">· {s.yearsPracticed} ans</span>}
                    {s.status === "VERIFIED" && <CheckCircle2 className="size-3 text-emerald-500" />}
                    {s.status === "DRAFT" && (
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => submitForVerification({ kind: "skill", id: s._id }),
                            "Envoyé pour vérification",
                          )
                        }
                      >
                        vérifier
                      </button>
                    )}
                  </span>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diplômes (§7 — référentiel) */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <GraduationCap className="size-4 text-primary" /> Mes diplômes
          </p>
          {data.credentials.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Déclarez vos diplômes depuis la candidature ou l'onglet
              « Déclaration de diplôme » (référentiel officiel des établissements).
            </p>
          ) : (
            data.credentials.map((c) => {
              const badge = credentialBadge(c.verificationStatus);
              return (
                <div key={c._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.diplomaTitle ?? c.degreeKey ?? "Diplôme"}
                      {c.graduationYear ? ` · ${c.graduationYear}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{c.institutionName}</p>
                  </div>
                  <span className={cn("shrink-0 text-xs font-medium", badge.tone)}>
                    {badge.emoji} {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Certifications (§8) + alerte expiration 30 jours */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Award className="size-4 text-primary" /> Mes certifications
          </p>
          {data.certifications.filter((c) => c.isActive).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ajoutez vos habilitations et certifications avec leur date
              d'expiration — une alerte vous préviendra 30 jours avant.
            </p>
          ) : (
            data.certifications
              .filter((c) => c.isActive)
              .map((c) => {
                const daysToExpire = c.expiresAt
                  ? Math.ceil((c.expiresAt - Date.now()) / 86400000)
                  : null;
                return (
                  <div key={c._id} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {c.name}
                        {c.organization ? ` · ${c.organization}` : ""}
                      </p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {c.obtainedAt ? `Obtenue le ${formatDate(c.obtainedAt)}` : ""}
                      {c.expiresAt ? ` · expire le ${formatDate(c.expiresAt)}` : ""}
                    </p>
                    {daysToExpire !== null && daysToExpire <= 30 && (
                      <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <Clock className="size-3.5" />
                        {daysToExpire >= 0
                          ? `Votre certification expire dans ${daysToExpire} jours.`
                          : "Votre certification est expirée."}
                      </p>
                    )}
                    {c.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 self-start text-xs"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => submitForVerification({ kind: "certification", id: c._id }),
                            "Envoyée pour vérification GTEC PRO",
                          )
                        }
                      >
                        <Send className="mr-1 size-3" /> Faire vérifier
                      </Button>
                    )}
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>

      {/* Formations (§9) */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Building2 className="size-4 text-primary" /> Mes formations continues
          </p>
          {data.trainings.filter((t) => t.isActive).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ajoutez vos formations continues au fil de votre montée en compétence.
            </p>
          ) : (
            data.trainings
              .filter((t) => t.isActive)
              .map((t) => (
                <div key={t._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.organization ? `${t.organization} · ` : ""}
                      {t.completedAt ? formatDate(t.completedAt) : ""}
                      {t.durationHours ? ` · ${t.durationHours} h` : ""}
                      {t.skillsAcquired?.length ? ` · ${t.skillsAcquired.join(", ")}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Réalisations / portfolio (§6) */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Award className="size-4 text-primary" /> Mes réalisations
          </p>
          {data.projects.filter((p) => p.isActive).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Présentez vos travaux : titre, domaine, photos avant/pendant/après,
              matériel, difficulté et résultat.
            </p>
          ) : (
            data.projects
              .filter((p) => p.isActive)
              .map((p) => (
                <div key={p._id} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{p.title}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {p.domainLabel ? `${p.domainLabel} · ` : ""}
                    {p.city ? `${p.city} · ` : ""}
                    {p.completedAt ? formatDate(p.completedAt) : ""}
                    {p.linkedRequestId ? " · Intervention GTEC PRO ✓" : ""}
                  </p>
                  {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                  {p.outcome && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{p.outcome}</p>
                  )}
                  {!p.linkedRequestId && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={!!p.isPublic}
                        onCheckedChange={(v) =>
                          run(
                            () => setProjectPublic({ id: p._id, isPublic: v }),
                            v ? "Réalisation visible sur votre profil public" : "Réalisation masquée",
                          )
                        }
                      />
                      <Eye className="size-3.5" /> Afficher dans mon profil public
                    </label>
                  )}
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Archivés (§4 : jamais supprimés, réactivables) */}
      {[...data.experiences, ...data.certifications]
        .filter((x) => !x.isActive)
        .length > 0 && (
        <Card className="card-layered border-dashed">
          <CardContent className="flex flex-col gap-1.5 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Archive className="size-3.5" /> Éléments archivés
            </p>
            {[...data.experiences, ...data.certifications]
              .filter((x) => !x.isActive)
              .map((x) => (
                <div key={x._id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">
                    {("title" in x ? x.title : x.name) as string}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          setItemActive({
                            kind: "title" in x ? "experience" : "certification",
                            id: x._id,
                            isActive: true,
                          }),
                        "Élément réactivé",
                      )
                    }
                  >
                    <ArchiveRestore className="mr-1 size-3" /> Réactiver
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Entreprise & équipe (§10-§11) */}
      <TeamCompanyCard />

      {/* Historique des modifications (§15) */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-4 text-primary" /> Historique des modifications
          </p>
          {data.history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chaque ajout, modification et vérification apparaîtra ici.
            </p>
          ) : (
            <>
              <Separator />
              {data.history.map((h) => (
                <div key={h._id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{h.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {formatDate(h.at)}
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {dialogKind && (
        <ItemDialog
          kind={dialogKind}
          open
          onOpenChange={(v) => !v && setDialogKind(null)}
          onSubmit={submitDialog(dialogKind)}
          busy={busy}
        />
      )}
    </div>
  );
}

// ==================== ENTREPRISE & ÉQUIPE (§10-§11) =========================

const COMPANY_STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "text-muted-foreground" },
  SUBMITTED: { label: "Soumise — à vérifier", cls: "text-amber-600 dark:text-amber-400" },
  UNDER_REVIEW: { label: "En cours d'examen", cls: "text-amber-600 dark:text-amber-400" },
  VERIFIED: { label: "Vérifiée GTEC PRO ✓", cls: "text-emerald-600 dark:text-emerald-400" },
  REJECTED: { label: "Refusée", cls: "text-destructive" },
};

const MEMBER_ROLE_META: Record<string, { label: string; cls: string }> = {
  INVITED: { label: "Invitation en attente", cls: "text-amber-600 dark:text-amber-400" },
  ACTIVE: { label: "Membre actif", cls: "text-emerald-600 dark:text-emerald-400" },
  DECLINED: { label: "Invitation refusée", cls: "text-muted-foreground" },
};

const TEAM_ROLES = [
  "Technicien",
  "Chef d'équipe",
  "Électricien",
  "Frigoriste",
  "Plombier",
  "Chargé clientèle",
  "Stagiaire",
];

/**
 * Profil entreprise (§10) et équipe (§11) : création/modification, soumission
 * à la vérification, invitations par téléphone (le technicien doit accepter)
 * et retrait traçable — les données personnelles des membres restent intangibles.
 */
function TeamCompanyCard() {
  const companyData = useQuery(api.profile.myCompany, {});
  const upsertCompany = useMutation(api.profile.upsertCompany);
  const submitCompany = useMutation(api.profile.submitCompanyForVerification);
  const invite = useMutation(api.profile.inviteTeamMember);
  const respond = useMutation(api.profile.respondToTeamInvite);
  const removeMember = useMutation(api.profile.removeTeamMember);

  const [busy, setBusy] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cRccm, setCrcm] = useState("");
  const [cNiu, setCniu] = useState("");
  const [cCity, setCCity] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cYear, setCYear] = useState("");
  const [cTechCount, setCTechCount] = useState("");
  const [cDomains, setCDomains] = useState("");
  const [cZones, setCZones] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cCapabilities, setCCapabilities] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [iPhone, setIPhone] = useState("");
  const [iRole, setIRole] = useState(TEAM_ROLES[0]);

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
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

  if (companyData === undefined) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  const { company, team, invitations } = companyData;
  const activeMembers = team.filter((m) => m.status === "ACTIVE");

  const openCompany = () => {
    setCName(company?.name ?? "");
    setCrcm(company?.rccm ?? "");
    setCniu(company?.niu ?? "");
    setCCity(company?.city ?? "");
    setCPhone(company?.phone ?? "");
    setCEmail(company?.email ?? "");
    setCYear(company?.yearCreated ? String(company.yearCreated) : "");
    setCTechCount(company?.technicianCount ? String(company.technicianCount) : "");
    setCDomains((company?.domains ?? []).join(", "));
    setCZones((company?.zones ?? []).join(", "));
    setCDesc(company?.description ?? "");
    setCCapabilities(company?.capabilities ?? "");
    setCompanyOpen(true);
  };

  const saveCompany = async () => {
    if (cName.trim().length < 2) {
      toast.error("Indiquez le nom commercial de l'entreprise.");
      return;
    }
    const ok = await run(
      () =>
        upsertCompany({
          id: company?._id as never,
          name: cName,
          rccm: cRccm.trim() || undefined,
          niu: cNiu.trim() || undefined,
          city: cCity.trim() || undefined,
          phone: cPhone.trim() || undefined,
          email: cEmail.trim() || undefined,
          yearCreated: cYear ? Number(cYear) : undefined,
          technicianCount: cTechCount ? Number(cTechCount) : undefined,
          domains: cDomains.split(",").map((s) => s.trim()).filter(Boolean),
          zones: cZones.split(",").map((s) => s.trim()).filter(Boolean),
          description: cDesc.trim() || undefined,
          capabilities: cCapabilities.trim() || undefined,
        }),
      company ? "Entreprise mise à jour" : "Profil entreprise créé",
    );
    if (ok) setCompanyOpen(false);
  };

  const sendInvite = async () => {
    if (!company) {
      toast.error("Créez d'abord le profil entreprise.");
      return;
    }
    if (!/^\+?[0-9 ]{8,}$/.test(iPhone.trim())) {
      toast.error("Numéro de téléphone invalide.");
      return;
    }
    const ok = await run(
      () => invite({ companyId: company._id as never, phone: iPhone.trim(), role: iRole }),
      "Invitation envoyée — le technicien doit l'accepter depuis son espace",
    );
    if (ok) {
      setIPhone("");
      setInviteOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Invitations reçues (le technicien reste maître de son rattachement) */}
      {invitations.length > 0 && (
        <Card className="card-layered border-amber-500/40 bg-amber-500/[0.04]">
          <CardContent className="flex flex-col gap-2 px-4 py-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <UserPlus className="size-4 text-amber-600 dark:text-amber-400" /> Invitations à rejoindre une équipe
            </p>
            {invitations.map((inv) => (
              <div key={inv._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{inv.companyName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Fonction proposée : {inv.role} · invitée le {formatDate(inv.invitedAt)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => run(() => respond({ inviteId: inv._id as never, accept: true }), "Rattachement accepté — bienvenue dans l'équipe")}
                  >
                    <CheckCircle2 className="mr-1 size-3.5" /> Accepter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => run(() => respond({ inviteId: inv._id as never, accept: false }), "Invitation refusée")}
                  >
                    <XCircle className="mr-1 size-3.5" /> Refuser
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="card-layered">
        <CardContent className="flex flex-col gap-2 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Building2 className="size-4 text-primary" /> Mon entreprise
          </p>
          {!company ? (
            <>
              <p className="text-xs text-muted-foreground">
                Vous dirigez une société ou un atelier ? Créez son profil : il
                sera vérifié par GTEC PRO puis mis en avant auprès des clients.
              </p>
              <Button size="sm" className="self-start" onClick={openCompany}>
                <Plus className="mr-1.5 size-4" /> Créer le profil entreprise
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{company.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[company.city, company.phone, company.email].filter(Boolean).join(" · ") || "—"}
                    {company.rccm ? ` · RCCM ${company.rccm}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    (COMPANY_STATUS_META[company.status] ?? COMPANY_STATUS_META.DRAFT).cls,
                  )}
                >
                  {(COMPANY_STATUS_META[company.status] ?? COMPANY_STATUS_META.DRAFT).label}
                </span>
              </div>
              {company.description && (
                <p className="text-xs text-muted-foreground">{company.description}</p>
              )}
              {company.status === "REJECTED" && company.reviewNote && (
                <p className="text-xs text-destructive">Motif du refus : {company.reviewNote}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={openCompany}>
                  <Pencil className="mr-1.5 size-3.5" /> Modifier
                </Button>
                {(company.status === "DRAFT" || company.status === "REJECTED") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => submitCompany({ id: company._id as never }),
                        "Entreprise soumise à vérification — l'administration est notifiée",
                      )
                    }
                  >
                    <Send className="mr-1.5 size-3.5" /> Soumettre à vérification
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="mr-1.5 size-3.5" /> Inviter un technicien
                </Button>
              </div>
              <div className="mt-1 flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Users className="size-3.5" /> Équipe ({activeMembers.length} actif{activeMembers.length > 1 ? "s" : ""} ·{" "}
                  {team.length} rattachement{team.length > 1 ? "s" : ""})
                </p>
                {team.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun rattachement — invitez vos techniciens par numéro de téléphone.
                  </p>
                ) : (
                  team.map((m) => {
                    const meta = MEMBER_ROLE_META[m.status] ?? MEMBER_ROLE_META.INVITED;
                    return (
                      <div key={m._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {m.userName ?? m.userPhone ?? "Compte GTEC PRO"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {m.role} · invité le {formatDate(m.invitedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("shrink-0 text-xs font-medium", meta.cls)}>{meta.label}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Retirer ${m.userName ?? "ce membre"} de l'équipe ? Ses données personnelles restent inchangées.`)) {
                                void run(
                                  () => removeMember({ memberId: m._id as never }),
                                  "Membre retiré de l'équipe",
                                );
                              }
                            }}
                          >
                            <Archive className="mr-1 size-3" /> Retirer
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Le rattachement n'efface jamais les données personnelles du technicien :
                il doit accepter l'invitation depuis son propre espace (§11).
              </p>
            </>
          )}
        </CardContent>

        <Dialog open={companyOpen} onOpenChange={setCompanyOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {company ? "Modifier le profil entreprise" : "Créer le profil entreprise"}
              </DialogTitle>
              <DialogDescription>
                Identité, contacts et capacités techniques. Après modification
                d'un profil vérifié, il repasse automatiquement en vérification (§14).
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Nom commercial *</Label>
                <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Ex. : GTEC Services & Énergie" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">RCCM</Label>
                  <Input value={cRccm} onChange={(e) => setCrcm(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">NIU</Label>
                  <Input value={cNiu} onChange={(e) => setCniu(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Ville</Label>
                  <Input value={cCity} onChange={(e) => setCCity(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Téléphone</Label>
                  <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">E-mail</Label>
                  <Input value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Année de création</Label>
                  <Input type="number" min={1950} max={2100} value={cYear} onChange={(e) => setCYear(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Nombre de techniciens</Label>
                  <Input type="number" min={0} value={cTechCount} onChange={(e) => setCTechCount(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Domaines (codes, séparés par des virgules)</Label>
                  <Input value={cDomains} onChange={(e) => setCDomains(e.target.value)} placeholder="ELEC, SOLAIRE, FROID" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Zones d'intervention (séparées par des virgules)</Label>
                  <Input value={cZones} onChange={(e) => setCZones(e.target.value)} placeholder="Douala, Yaoundé, Bafoussam" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Capacités techniques (équipements, véhicules…)</Label>
                <Textarea rows={2} value={cCapabilities} onChange={(e) => setCCapabilities(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Description</Label>
                <Textarea rows={3} value={cDesc} onChange={(e) => setCDesc(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompanyOpen(false)}>
                Annuler
              </Button>
              <Button onClick={saveCompany} disabled={busy}>
                {company ? "Enregistrer" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un technicien dans l'équipe</DialogTitle>
              <DialogDescription>
                Entrez le numéro de téléphone de son compte GTEC PRO : il recevra
                une invitation et devra l'accepter — ses données personnelles ne
                sont jamais modifiées par l'entreprise (§11).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Téléphone du compte GTEC PRO *</Label>
                <Input value={iPhone} onChange={(e) => setIPhone(e.target.value)} placeholder="Ex. : 655 09 42 28" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Fonction dans l'entreprise</Label>
                <Select value={iRole} onValueChange={setIRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>
                Annuler
              </Button>
              <Button onClick={sendInvite} disabled={busy}>
                <UserPlus className="mr-1.5 size-4" /> Envoyer l'invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
