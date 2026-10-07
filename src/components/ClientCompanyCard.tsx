import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  CheckCircle2,
  MapPin,
  Pencil,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
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
import { cn } from "@/lib/utils";

/**
 * §14 du référentiel « MON PROFIL » — Client entreprise : fiche vérifiable
 * (RCCM/NIU), sites/agences et équipe multi-utilisateurs (administrateur,
 * responsable technique, maintenance, financier, demandeur d'intervention).
 * Mêmes garanties que l'équipe prestataire : invitation ACCEPTÉE par la
 * personne visée, données personnelles intangibles, tout est journalisé.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "text-muted-foreground" },
  SUBMITTED: { label: "Soumise — à vérifier", cls: "text-amber-600 dark:text-amber-400" },
  UNDER_REVIEW: { label: "En cours d'examen", cls: "text-amber-600 dark:text-amber-400" },
  VERIFIED: { label: "Vérifiée GTEC PRO", cls: "text-emerald-600 dark:text-emerald-400" },
  REJECTED: { label: "Refusée", cls: "text-destructive" },
};

const ROLES = [
  { key: "ADMIN", label: "Administrateur" },
  { key: "TECH", label: "Responsable technique" },
  { key: "MAINT", label: "Responsable maintenance" },
  { key: "FIN", label: "Responsable financier" },
  { key: "REQUESTER", label: "Demandeur d'intervention" },
];
const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label ?? key;

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-primary/10 text-primary ring-primary/20",
  TECH: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400",
  MAINT: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  FIN: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  REQUESTER: "bg-muted text-muted-foreground ring-border",
};

type CompanyRow = {
  _id: Id<"clientCompanies">;
  name: string;
  tradeName?: string;
  rccm?: string;
  niu?: string;
  sector?: string;
  address?: string;
  region?: string;
  city?: string;
  phone?: string;
  email?: string;
  status: string;
  reviewNote?: string;
};

export function ClientCompanyCard() {
  const data = useQuery(api.clientCompany.myClientCompany, {});
  const { user } = useAuth();
  const upsertCompany = useMutation(api.clientCompany.upsertClientCompany);
  const submitCompany = useMutation(api.clientCompany.submitClientCompanyForVerification);
  const upsertSite = useMutation(api.clientCompany.upsertClientSite);
  const setDefaultSiteMut = useMutation(api.clientCompany.setDefaultClientSite);
  const removeSite = useMutation(api.clientCompany.removeClientSite);
  const invite = useMutation(api.clientCompany.inviteClientTeamMember);
  const respond = useMutation(api.clientCompany.respondToClientTeamInvite);
  const removeMember = useMutation(api.clientCompany.removeClientTeamMember);
  const setRole = useMutation(api.clientCompany.setClientMemberRole);

  const [busy, setBusy] = useState(false);

  // --- Dialog entreprise ---
  const [coOpen, setCoOpen] = useState(false);
  const [coEditId, setCoEditId] = useState<Id<"clientCompanies"> | null>(null);
  const [name, setName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [sector, setSector] = useState("");
  const [rccm, setRccm] = useState("");
  const [niu, setNiu] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // --- Dialog site ---
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteEditId, setSiteEditId] = useState<Id<"clientSites"> | null>(null);
  const [siteLabel, setSiteLabel] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [siteQuarter, setSiteQuarter] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteDefault, setSiteDefault] = useState(false);

  // --- Dialog invitation ---
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState("REQUESTER");

  if (data === undefined) return null;

  const company = data.company as CompanyRow | null;
  const canManage = data.canManage;
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

  const openCompanyDialog = () => {
    if (company) {
      setCoEditId(company._id);
      setName(company.name);
      setTradeName(company.tradeName ?? "");
      setSector(company.sector ?? "");
      setRccm(company.rccm ?? "");
      setNiu(company.niu ?? "");
      setCity(company.city ?? "");
      setRegion(company.region ?? "");
      setAddress(company.address ?? "");
      setPhone(company.phone ?? "");
      setEmail(company.email ?? "");
    } else {
      setCoEditId(null);
      setName("");
      setTradeName("");
      setSector("");
      setRccm("");
      setNiu("");
      setCity("");
      setRegion("");
      setAddress("");
      setPhone("");
      setEmail("");
    }
    setCoOpen(true);
  };

  const openSiteDialog = (site?: {
    _id: Id<"clientSites">;
    label: string;
    city: string;
    quarter?: string;
    address: string;
    isDefault?: boolean;
  }) => {
    if (site) {
      setSiteEditId(site._id);
      setSiteLabel(site.label);
      setSiteCity(site.city);
      setSiteQuarter(site.quarter ?? "");
      setSiteAddress(site.address);
      setSiteDefault(!!site.isDefault);
    } else {
      setSiteEditId(null);
      setSiteLabel("");
      setSiteCity(company?.city ?? "");
      setSiteQuarter("");
      setSiteAddress("");
      setSiteDefault(false);
    }
    setSiteOpen(true);
  };

  // ================= Invitations reçues (avant toute fiche) =================
  const invitationsBlock =
    data.invitations.length > 0 ? (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
          <UserPlus className="size-4" /> Invitations à rejoindre un compte entreprise
        </p>
        {data.invitations.map((inv) => (
          <div
            key={inv._id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{inv.companyName}</p>
              <p className="text-xs text-muted-foreground">Rôle proposé : {roleLabel(inv.role)}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => respond({ inviteId: inv._id as never, accept: true }),
                    `Vous avez rejoint « ${inv.companyName} »`,
                  )
                }
              >
                <CheckCircle2 className="mr-1 size-3.5" /> Accepter
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () => respond({ inviteId: inv._id as never, accept: false }),
                    "Invitation refusée",
                  )
                }
              >
                <XCircle className="mr-1 size-3.5" /> Refuser
              </Button>
            </div>
          </div>
        ))}
      </div>
    ) : null;

  // ================= Pas de fiche : carte d'activation ======================
  if (!company) {
    return (
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Building2 className="size-4 text-primary" /> Mon entreprise (client)
          </p>
          <p className="text-xs text-muted-foreground">
            Vous êtes un client entreprise ? Créez la fiche de votre organisation :
            RCCM/NIU vérifiables, sites &amp; agences, et plusieurs comptes avec
            des rôles (administrateur, responsable technique, maintenance,
            financier, demandeur d'intervention).
          </p>
          <div>
            <Button className="halo-amber" size="sm" onClick={openCompanyDialog}>
              <Plus className="mr-1 size-3.5" /> Créer la fiche entreprise
            </Button>
          </div>
          {invitationsBlock && (
            <>
              <Separator />
              {invitationsBlock}
            </>
          )}
        </CardContent>

        <CompanyDialog
          open={coOpen}
          onOpenChange={setCoOpen}
          isEdit={!!coEditId}
          busy={busy}
          fields={{ name, tradeName, sector, rccm, niu, city, region, address, phone, email }}
          setters={{ setName, setTradeName, setSector, setRccm, setNiu, setCity, setRegion, setAddress, setPhone, setEmail }}
          onSubmit={() =>
            run(
              () =>
                upsertCompany({
                  id: coEditId ?? undefined,
                  name,
                  tradeName: tradeName || undefined,
                  sector: sector || undefined,
                  rccm: rccm || undefined,
                  niu: niu || undefined,
                  city: city || undefined,
                  region: region || undefined,
                  address: address || undefined,
                  phone: phone || undefined,
                  email: email || undefined,
                }),
              coEditId ? "Entreprise mise à jour" : "Profil entreprise créé",
            ).then(() => setCoOpen(false))
          }
        />
      </Card>
    );
  }

  const status = STATUS_META[company.status] ?? STATUS_META.DRAFT;

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        {/* En-tête fiche */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Building2 className="size-4 text-primary" /> {company.name}
              {company.tradeName && <span className="text-muted-foreground">({company.tradeName})</span>}
            </p>
            <p className={cn("mt-0.5 text-xs font-medium", status.cls)}>{status.label}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Mon rôle : {data.myRole === "OWNER" ? "Propriétaire" : roleLabel(data.myRole ?? "")}
            </span>
            {canManage && (
              <Button variant="outline" size="sm" onClick={openCompanyDialog}>
                <Pencil className="mr-1 size-3" /> Modifier
              </Button>
            )}
          </div>
        </div>
        {company.status === "REJECTED" && company.reviewNote && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Motif du refus : {company.reviewNote}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {[company.sector, company.city, company.phone, company.email].filter(Boolean).join(" · ") || "—"}
        </p>
        {canManage && (company.status === "DRAFT" || company.status === "REJECTED") && (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () => submitCompany({ id: company._id as never }),
                  "Soumise à vérification — l'administration est notifiée",
                )
              }
            >
              <Send className="mr-1 size-3.5" /> Soumettre à vérification
            </Button>
          </div>
        )}

        {invitationsBlock && (
          <>
            <Separator />
            {invitationsBlock}
          </>
        )}

        {/* Sites / agences */}
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-4 text-primary" /> Sites &amp; agences ({data.sites.length})
          </p>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => openSiteDialog()}>
              <Plus className="mr-1 size-3.5" /> Ajouter
            </Button>
          )}
        </div>
        {data.sites.length === 0 && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Aucun site enregistré. Ajoutez le siège et vos agences pour cibler les interventions.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {data.sites.map((s) => (
            <div
              key={s._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.label}
                  {s.isDefault && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Par défaut
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[s.city, s.quarter, s.address].filter(Boolean).join(" · ")}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  {!s.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={() => run(() => setDefaultSiteMut({ id: s._id as never }), "Site par défaut mis à jour")}
                    >
                      Défaut
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openSiteDialog(s)} aria-label="Modifier">
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive"
                    disabled={busy}
                    onClick={() => run(() => removeSite({ id: s._id as never }), "Site retiré")}
                    aria-label="Retirer"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Équipe multi-utilisateurs */}
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Users className="size-4 text-primary" /> Équipe ({data.team.filter((m) => m.status === "ACTIVE").length} actif
            {data.team.filter((m) => m.status === "ACTIVE").length > 1 ? "s" : ""} ·{" "}
            {data.team.filter((m) => m.status === "INVITED").length} en attente)
          </p>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => (setInvitePhone(""), setInviteRole("REQUESTER"), setInviteOpen(true))}>
              <UserPlus className="mr-1 size-3.5" /> Inviter
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Chaque membre rejoint avec le numéro de son compte GTEC PRO et doit accepter
          son rattachement. Ses données personnelles restent intangibles.
        </p>
        <div className="flex flex-col gap-2">
          {data.team.map((m) => (
            <div
              key={m._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.userName ?? m.userPhone ?? "Compte GTEC PRO"}
                  {m.isOwner && <span className="ml-2 text-[10px] font-medium text-primary">Propriétaire</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.status === "INVITED" ? "Invitation en attente" : m.userPhone ?? "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {m.status === "ACTIVE" ? (
                  <Select
                    value={m.role}
                    onValueChange={(r) =>
                      run(() => setRole({ memberId: m._id as never, role: r as never }), "Rôle mis à jour")
                    }
                    disabled={!canManage || m.isOwner || busy}
                  >
                    <SelectTrigger className="h-7 w-[190px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", ROLE_BADGE[m.role] ?? ROLE_BADGE.REQUESTER)}>
                    {roleLabel(m.role)}
                  </span>
                )}
                {(canManage || m.userId === user?._id) && !m.isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => removeMember({ memberId: m._id as never }),
                        m.status === "INVITED" ? "Invitation annulée" : "Membre retiré",
                      )
                    }
                    aria-label="Retirer"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Dialog fiche entreprise */}
      <CompanyDialog
        open={coOpen}
        onOpenChange={setCoOpen}
        isEdit={!!coEditId}
        busy={busy}
        fields={{ name, tradeName, sector, rccm, niu, city, region, address, phone, email }}
        setters={{ setName, setTradeName, setSector, setRccm, setNiu, setCity, setRegion, setAddress, setPhone, setEmail }}
        onSubmit={() =>
          run(
            () =>
              upsertCompany({
                id: coEditId ?? undefined,
                name,
                tradeName: tradeName || undefined,
                sector: sector || undefined,
                rccm: rccm || undefined,
                niu: niu || undefined,
                city: city || undefined,
                region: region || undefined,
                address: address || undefined,
                phone: phone || undefined,
                email: email || undefined,
              }),
            coEditId ? "Entreprise mise à jour" : "Profil entreprise créé",
          ).then(() => setCoOpen(false))
        }
      />

      {/* Dialog site / agence */}
      <Dialog open={siteOpen} onOpenChange={setSiteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{siteEditId ? "Modifier le site" : "Ajouter un site / agence"}</DialogTitle>
            <DialogDescription>
              Lieu d'intervention — le site par défaut est pré-rempli dans vos demandes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Libellé *</Label>
              <Input value={siteLabel} onChange={(e) => setSiteLabel(e.target.value)} placeholder="Ex. : Siège, Agence Bonapriso…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Ville *</Label>
                <Input value={siteCity} onChange={(e) => setSiteCity(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Quartier</Label>
                <Input value={siteQuarter} onChange={(e) => setSiteQuarter(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Adresse *</Label>
              <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="Rue, immeuble, repère…" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={siteDefault}
                onChange={(e) => setSiteDefault(e.target.checked)}
                className="size-4 accent-primary"
              />
              Définir comme site par défaut
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteOpen(false)}>
              Annuler
            </Button>
            <Button
              className="halo-amber"
              disabled={busy || siteLabel.trim().length < 2 || siteAddress.trim().length < 4 || siteCity.trim().length < 2}
              onClick={() =>
                run(
                  () =>
                    upsertSite({
                      id: siteEditId ?? undefined,
                      companyId: company._id as never,
                      label: siteLabel,
                      city: siteCity,
                      quarter: siteQuarter || undefined,
                      address: siteAddress,
                      isDefault: siteDefault,
                    }),
                  siteEditId ? "Site mis à jour" : "Site ajouté",
                ).then(() => setSiteOpen(false))
              }
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog invitation */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inviter un utilisateur</DialogTitle>
            <DialogDescription>
              Entrez le numéro de téléphone de son compte GTEC PRO : il recevra une
              invitation et devra l'accepter.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Téléphone du compte GTEC PRO *</Label>
              <Input value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} placeholder="6 XX XX XX XX" inputMode="tel" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Rôle *</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
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
            <Button
              className="halo-amber"
              disabled={busy || invitePhone.replace(/\s+/g, "").length < 9}
              onClick={() =>
                run(
                  () => invite({ companyId: company._id as never, phone: invitePhone, role: inviteRole as never }),
                  "Invitation envoyée",
                ).then(() => setInviteOpen(false))
              }
            >
              Envoyer l'invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Dialogue partagé de création/édition de la fiche client entreprise. */
function CompanyDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isEdit: boolean;
  busy: boolean;
  fields: {
    name: string;
    tradeName: string;
    sector: string;
    rccm: string;
    niu: string;
    city: string;
    region: string;
    address: string;
    phone: string;
    email: string;
  };
  setters: {
    setName: (v: string) => void;
    setTradeName: (v: string) => void;
    setSector: (v: string) => void;
    setRccm: (v: string) => void;
    setNiu: (v: string) => void;
    setCity: (v: string) => void;
    setRegion: (v: string) => void;
    setAddress: (v: string) => void;
    setPhone: (v: string) => void;
    setEmail: (v: string) => void;
  };
  onSubmit: () => void;
}) {
  const { fields, setters } = props;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.isEdit ? "Modifier la fiche entreprise" : "Fiche client entreprise"}</DialogTitle>
          <DialogDescription>
            RCCM et NIU sont soumis à vérification par l'administration GTEC PRO —
            ils ne sont jamais auto-certifiés.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Raison sociale *</Label>
            <Input value={fields.name} onChange={(e) => setters.setName(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Nom commercial</Label>
              <Input value={fields.tradeName} onChange={(e) => setters.setTradeName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Secteur d'activité</Label>
              <Input value={fields.sector} onChange={(e) => setters.setSector(e.target.value)} placeholder="Ex. : Agro-industrie, BTP…" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">RCCM</Label>
              <Input value={fields.rccm} onChange={(e) => setters.setRccm(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">NIU</Label>
              <Input value={fields.niu} onChange={(e) => setters.setNiu(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Ville</Label>
              <Input value={fields.city} onChange={(e) => setters.setCity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Région</Label>
              <Input value={fields.region} onChange={(e) => setters.setRegion(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Adresse du siège</Label>
            <Input value={fields.address} onChange={(e) => setters.setAddress(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Téléphone</Label>
              <Input value={fields.phone} onChange={(e) => setters.setPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">E-mail</Label>
              <Input value={fields.email} onChange={(e) => setters.setEmail(e.target.value)} type="email" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="halo-amber" disabled={props.busy || fields.name.trim().length < 2} onClick={props.onSubmit}>
            {props.isEdit ? "Enregistrer" : "Créer la fiche"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
