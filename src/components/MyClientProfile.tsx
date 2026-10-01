import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  Check,
  Home,
  MapPin,
  Pencil,
  Plus,
  Store,
  Star,
  Trash2,
  UserRound,
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
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * « MON PROFIL » client (§2) : identité et localisation (réutilise la mutation
 * existante `gtec.updateClientIdentity`), carnet d'adresses enregistrées
 * (domicile, bureau, commerce… avec une adresse par défaut) et préférences
 * (langue, notifications, contact d'urgence). Toutes les adresses sont
 * archivées — jamais supprimées définitivement.
 */

const KIND_META: Record<string, { label: string; icon: typeof Home }> = {
  DOMICILE: { label: "Domicile", icon: Home },
  BUREAU: { label: "Bureau", icon: Building2 },
  COMMERCE: { label: "Commerce", icon: Store },
  RESIDENCE_SECONDAIRE: { label: "Résidence secondaire", icon: MapPin },
  AUTRE: { label: "Autre", icon: MapPin },
};

type Address = {
  _id: string;
  label: string;
  kind: string;
  region?: string;
  city: string;
  quarter?: string;
  address: string;
  isDefault?: boolean;
};

export function MyClientProfile() {
  const { user } = useAuth();
  const addresses = useQuery(api.profile.myAddresses, {});
  const upsertAddress = useMutation(api.profile.upsertAddress);
  const removeAddress = useMutation(api.profile.removeAddress);
  const updateIdentity = useMutation(api.gtec.updateClientIdentity);
  const updatePrefs = useMutation(api.profile.updateClientPreferences);

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
        city?: string;
        customerType?: string;
        companyName?: string;
        taxId?: string;
        emergencyContact?: { name?: string; phone?: string } | null;
        prefLangue?: string;
        prefNotifEmail?: boolean;
        prefNotifSms?: boolean;
      })
    | undefined;

  // ----- Identité -----
  const [idOpen, setIdOpen] = useState(false);
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
  const [busyId, setBusyId] = useState(false);

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
    setIdOpen(true);
  };

  const saveIdentity = async () => {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast.error("Indiquez votre prénom et votre nom.");
      return;
    }
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
        city: city.trim(),
        address: address.trim(),
        quarter: quarter.trim() || undefined,
        customerType,
        companyName: companyName.trim() || undefined,
        taxId: taxId.trim() || undefined,
      });
      toast.success("Identité enregistrée");
      setIdOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyId(false);
    }
  };

  // ----- Adresses -----
  const [addrOpen, setAddrOpen] = useState(false);
  const [aId, setAId] = useState<string | null>(null);
  const [aLabel, setALabel] = useState("");
  const [aKind, setAKind] = useState("DOMICILE");
  const [aCity, setACity] = useState("");
  const [aQuarter, setAQuarter] = useState("");
  const [aAddress, setAAddress] = useState("");
  const [aDefault, setADefault] = useState(false);
  const [busyAddr, setBusyAddr] = useState(false);

  const openAddress = (a?: Address) => {
    setAId(a?._id ?? null);
    setALabel(a?.label ?? "");
    setAKind(a?.kind ?? "DOMICILE");
    setACity(a?.city ?? u?.city ?? "");
    setAQuarter(a?.quarter ?? "");
    setAAddress(a?.address ?? "");
    setADefault(!!a?.isDefault);
    setAddrOpen(true);
  };

  const saveAddress = async () => {
    if (aLabel.trim().length < 2) {
      toast.error("Indiquez un libellé (Domicile, Bureau…).");
      return;
    }
    if (aAddress.trim().length < 5 || aCity.trim().length < 2) {
      toast.error("Indiquez la ville et l'adresse complète.");
      return;
    }
    setBusyAddr(true);
    try {
      await upsertAddress({
        id: (aId ?? undefined) as never,
        label: aLabel.trim(),
        kind: aKind as never,
        city: aCity.trim(),
        quarter: aQuarter.trim() || undefined,
        address: aAddress.trim(),
        isDefault: aDefault,
      });
      toast.success(aId ? "Adresse mise à jour" : "Adresse ajoutée à votre carnet");
      setAddrOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyAddr(false);
    }
  };

  const deleteAddress = async (a: Address) => {
    if (!confirm(`Retirer « ${a.label} » de vos adresses ? (conservée dans l'historique)`)) return;
    try {
      await removeAddress({ id: a._id as never });
      toast.success("Adresse retirée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  // ----- Préférences -----
  const [prefOpen, setPrefOpen] = useState(false);
  const [pLang, setPLang] = useState("fr");
  const [pEmail, setPEmail] = useState(true);
  const [pSms, setPSms] = useState(true);
  const [pEName, setPEName] = useState("");
  const [pEPhone, setPEPhone] = useState("");
  const [busyPrefs, setBusyPrefs] = useState(false);

  const openPrefs = () => {
    setPLang(u?.prefLangue ?? "fr");
    setPEmail(u?.prefNotifEmail ?? true);
    setPSms(u?.prefNotifSms ?? true);
    setPEName(u?.emergencyContact?.name ?? "");
    setPEPhone(u?.emergencyContact?.phone ?? "");
    setPrefOpen(true);
  };

  const savePrefs = async () => {
    if ((pEName.trim().length > 0) !== (pEPhone.trim().length > 0)) {
      toast.error("Renseignez le nom ET le téléphone du contact d'urgence (ou aucun des deux).");
      return;
    }
    setBusyPrefs(true);
    try {
      await updatePrefs({
        prefLangue: pLang,
        prefNotifEmail: pEmail,
        prefNotifSms: pSms,
        emergencyName: pEName.trim() || undefined,
        emergencyPhone: pEPhone.trim() || undefined,
      });
      toast.success("Préférences enregistrées");
      setPrefOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyPrefs(false);
    }
  };

  const identityComplete = !!(u?.firstName && u?.lastName);
  const emergency = u?.emergencyContact;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Identité & localisation */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="size-4 text-primary" /> Identité & localisation
            </p>
            <Button size="sm" variant={identityComplete ? "outline" : "default"} onClick={openIdentity}>
              <Pencil className="mr-1.5 size-3.5" /> Modifier
            </Button>
          </div>
          <div className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Nom :</span>{" "}
              {identityComplete ? `${u?.firstName} ${u?.lastName}` : (u?.name ?? "—")}
              {identityComplete ? null : (
                <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">à compléter</span>
              )}
            </p>
            <p>
              <span className="text-muted-foreground">Téléphone :</span> {u?.phone ?? "—"}
              {u?.altPhone ? ` · ${u.altPhone}` : ""}
            </p>
            <p>
              <span className="text-muted-foreground">Adresse :</span>{" "}
              {[u?.address, u?.quarter, u?.city].filter(Boolean).join(", ") || "—"}
            </p>
            {u?.customerType && (
              <p>
                <span className="text-muted-foreground">Type de client :</span> {u.customerType}
                {u?.companyName ? ` · ${u.companyName}` : ""}
                {u?.taxId ? ` · NUI ${u.taxId}` : ""}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Préférences */}
      <Card className="card-layered">
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Star className="size-4 text-primary" /> Préférences
            </p>
            <Button size="sm" variant="outline" onClick={openPrefs}>
              <Pencil className="mr-1.5 size-3.5" /> Modifier
            </Button>
          </div>
          <div className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Langue :</span>{" "}
              {(u?.prefLangue ?? "fr") === "en" ? "English" : "Français"}
            </p>
            <p>
              <span className="text-muted-foreground">Notifications :</span>{" "}
              email {(u?.prefNotifEmail ?? true) ? "activé" : "désactivé"} · SMS{" "}
              {(u?.prefNotifSms ?? true) ? "activés" : "désactivés"}
            </p>
            <p>
              <span className="text-muted-foreground">Contact d'urgence :</span>{" "}
              {emergency ? `${emergency.name} · ${emergency.phone}` : "non renseigné"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Carnet d'adresses (§2) */}
      <Card className="card-layered lg:col-span-2">
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <MapPin className="size-4 text-primary" /> Mes adresses enregistrées
            </p>
            <Button size="sm" onClick={() => openAddress()}>
              <Plus className="mr-1.5 size-4" /> Ajouter une adresse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Choisissez l'adresse par défaut : vos demandes et interventions la
            proposent automatiquement. Une adresse retirée reste dans
            l'historique de vos interventions passées.
          </p>
          {addresses === undefined ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
          ) : addresses.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Aucune adresse enregistrée — ajoutez votre domicile ou votre bureau.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {addresses.map((a) => {
                const meta = KIND_META[a.kind] ?? KIND_META.AUTRE;
                const Icon = meta.icon;
                return (
                  <div
                    key={a._id}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5",
                      a.isDefault && "border-primary/40 bg-primary/[0.04]",
                    )}
                  >
                    <div className="flex min-w-0 gap-2.5">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                          {a.label}
                          {a.isDefault && (
                            <Badge variant="outline" className="text-[10px] text-primary">
                              <Check className="mr-0.5 size-2.5" /> Par défaut
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.address}
                          {a.quarter ? `, ${a.quarter}` : ""} — {a.city}
                          {a.region ? ` (${a.region})` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground/80">{meta.label}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => openAddress(a)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive"
                        onClick={() => void deleteAddress(a)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog identité */}
      <Dialog open={idOpen} onOpenChange={setIdOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mon identité & localisation</DialogTitle>
            <DialogDescription>
              Ces informations servent aux interventions, aux factures et au
              contrat de confiance avec votre technicien.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Prénom *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Nom *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Téléphone *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Téléphone secondaire</Label>
                <Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Pièce d'identité (CNI / passeport)</Label>
              <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Sexe</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculin</SelectItem>
                    <SelectItem value="F">Féminin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Date de naissance</Label>
                <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Ville</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Quartier</Label>
                <Input value={quarter} onChange={(e) => setQuarter(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Adresse</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Type de client</Label>
              <Select value={customerType} onValueChange={setCustomerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particulier">Particulier</SelectItem>
                  <SelectItem value="professionnel">Professionnel</SelectItem>
                  <SelectItem value="entreprise">Entreprise</SelectItem>
                  <SelectItem value="institution">Institution</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(customerType === "entreprise" || customerType === "institution") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Raison sociale</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">NUI / contribuable</Label>
                  <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIdOpen(false)}>
              Annuler
            </Button>
            <Button onClick={saveIdentity} disabled={busyId}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog adresse */}
      <Dialog open={addrOpen} onOpenChange={setAddrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{aId ? "Modifier l'adresse" : "Nouvelle adresse"}</DialogTitle>
            <DialogDescription>
              Le libellé vous aide à choisir rapidement (ex. : « Domicile », «
              Boutique Mboppi »).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Libellé *</Label>
                <Input value={aLabel} onChange={(e) => setALabel(e.target.value)} placeholder="Domicile" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Type</Label>
                <Select value={aKind} onValueChange={setAKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_META).map(([k, m]) => (
                      <SelectItem key={k} value={k}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Ville *</Label>
                <Input value={aCity} onChange={(e) => setACity(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Quartier</Label>
                <Input value={aQuarter} onChange={(e) => setAQuarter(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Adresse complète *</Label>
              <Input value={aAddress} onChange={(e) => setAAddress(e.target.value)} placeholder="Rue, immeuble, repère…" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={aDefault} onCheckedChange={setADefault} />
              Définir comme adresse par défaut
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddrOpen(false)}>
              Annuler
            </Button>
            <Button onClick={saveAddress} disabled={busyAddr}>
              {aId ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog préférences */}
      <Dialog open={prefOpen} onOpenChange={setPrefOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mes préférences</DialogTitle>
            <DialogDescription>
              Langue de l'application, canaux de notification et contact à
              prévenir en cas d'urgence sur un chantier.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Langue</Label>
              <Select value={pLang} onValueChange={setPLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={pEmail} onCheckedChange={setPEmail} />
              Recevoir les notifications par e-mail
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={pSms} onCheckedChange={setPSms} />
              Recevoir les notifications par SMS
            </label>
            <div className="mt-1 border-t pt-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Contact d'urgence (optionnel)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Nom</Label>
                  <Input value={pEName} onChange={(e) => setPEName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Téléphone</Label>
                  <Input value={pEPhone} onChange={(e) => setPEPhone(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrefOpen(false)}>
              Annuler
            </Button>
            <Button onClick={savePrefs} disabled={busyPrefs}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
