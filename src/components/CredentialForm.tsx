import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Loader2,
  Search,
  Send,
  ShieldQuestion,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
  INSTITUTION_TYPE_LABELS,
  REGION_LABELS,
  institutionBadge,
  type InstitutionStatus,
  type Region,
} from "@/lib/institutions";

/** Pièce justificative partagée avec la candidature (CNI, diplôme…). */
export type CredentialDoc = { kind: string; label: string; url: string };

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente d'examen",
  UNDER_REVIEW: "En cours d'examen",
  APPROVED: "Acceptée — ajoutée au référentiel",
  REJECTED: "Refusée",
};

/** SHA-256 du justificatif (§10 : chaque document est hashé). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type InstitutionLite = {
  _id: string;
  name: string;
  shortName?: string;
  institutionType: string;
  region: string;
  city?: string;
  status: string;
  source?: string;
  sourceUrl?: string;
};

/**
 * Déclaration de diplôme branchée sur le référentiel MINESUP (§8-§12) :
 *  - recherche intelligente dans `higher_education_institutions` (nom,
 *    acronyme, ancienne appellation, ville, région) ;
 *  - « Mon établissement n'est pas dans la liste » → demande de vérification
 *    (jamais de création automatique, §21) ;
 *  - justificatif joint à la candidature, hashé SHA-256 au dépôt ;
 *  - enregistrement via `submitCredential` : statut « declare » ou
 *    « en_attente » — seul l'admin peut décerner « vérifié » (§12, §17).
 */
export function CredentialForm({
  busy,
  degreeGroup,
  degreeKey,
  diplomaTitle,
  fieldOfStudy,
  graduationYear,
  documents,
  school,
  onChangeSchool,
  selected,
  onSelect,
}: {
  busy: boolean;
  degreeGroup: string;
  degreeKey: string;
  diplomaTitle: string;
  fieldOfStudy: string;
  graduationYear: number | "";
  documents: CredentialDoc[];
  school: string;
  onChangeSchool: (v: string) => void;
  /** Établissement sélectionné dans le référentiel (état porté par le parent). */
  selected: InstitutionLite | null;
  onSelect: (inst: InstitutionLite | null) => void;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery(
    api.institutions.searchInstitutions,
    debouncedQ.trim().length >= 2 ? { q: debouncedQ.trim(), limit: 8 } : "skip",
  );
  const submitCredential = useMutation(api.institutions.submitCredential);
  const submitVerification = useMutation(api.institutions.submitInstitutionVerification);
  const myRequests = useQuery(api.institutions.myVerificationRequests, {});

  const [hashing, setHashing] = useState(false);

  // Demande « Mon établissement n'est pas dans la liste »
  const [nfOpen, setNfOpen] = useState(false);
  const [nfName, setNfName] = useState("");
  const [nfCity, setNfCity] = useState("");
  const [nfCountry, setNfCountry] = useState("Cameroun");
  const [nfYear, setNfYear] = useState<number | "">("");
  const [nfDiploma, setNfDiploma] = useState("");
  const [nfSpecialty, setNfSpecialty] = useState("");
  const [nfNote, setNfNote] = useState("");

  const diplomaDoc = documents.find((d) => d.kind === "diploma" && d.url);

  const canSubmit =
    (selected !== null || school.trim().length >= 3) &&
    (diplomaTitle.trim().length >= 2 || degreeKey) &&
    !busy &&
    !hashing;

  const registerCredential = async () => {
    if (!canSubmit) return;
    setHashing(true);
    try {
      let documentHash: string | undefined;
      if (diplomaDoc) {
        try {
          documentHash = await sha256Hex(diplomaDoc.url);
        } catch {
          // Le hash est un plus : on ne bloque pas la déclaration s'il échoue.
        }
      }
      await submitCredential({
        institutionId: selected ? (selected._id as never) : undefined,
        institutionName: selected ? undefined : school.trim(),
        diplomaLevel: degreeGroup || undefined,
        degreeKey: degreeKey || undefined,
        fieldOfStudy: fieldOfStudy.trim() || undefined,
        diplomaTitle: diplomaTitle.trim() || undefined,
        graduationYear: graduationYear || undefined,
        country: "Cameroun",
        institutionCity: selected?.city || undefined,
        documentUrl: diplomaDoc?.url,
        documentHash,
      });
      toast.success(
        diplomaDoc
          ? "Diplôme déclaré avec justificatif — vérification GTEC en cours ⚠️"
          : "Diplôme déclaré — joignez le justificatif pour accélérer la vérification ⚠️",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setHashing(false);
    }
  };

  const submitRequest = async () => {
    if (nfName.trim().length < 3) {
      toast.error("Indiquez le nom de l'établissement.");
      return;
    }
    try {
      await submitVerification({
        institutionName: nfName.trim(),
        city: nfCity.trim() || undefined,
        country: nfCountry.trim() || "Cameroun",
        graduationYear: nfYear || undefined,
        diplomaTitle: nfDiploma.trim() || undefined,
        specialty: nfSpecialty.trim() || undefined,
        note: nfNote.trim() || undefined,
      });
      toast.success("Demande envoyée — GTEC PRO va vérifier cet établissement.");
      setNfOpen(false);
      setNfName("");
      setNfCity("");
      setNfYear("");
      setNfDiploma("");
      setNfSpecialty("");
      setNfNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <GraduationCap className="size-4 text-primary" /> Établissement du référentiel
        </p>
        {selected && institutionBadge(selected.status as InstitutionStatus).emoji}
      </div>

      {selected ? (
        <Card className="card-layered border-emerald-500/25">
          <CardContent className="flex flex-col gap-1.5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold leading-snug">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  {INSTITUTION_TYPE_LABELS[
                    selected.institutionType as keyof typeof INSTITUTION_TYPE_LABELS
                  ] ?? selected.institutionType}
                  {selected.city ? ` · ${selected.city}` : ""} ·{" "}
                  {REGION_LABELS[selected.region as Region] ?? selected.region}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSelect(null);
                  onChangeSchool("");
                }}
              >
                Changer
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px]">
                {institutionBadge(selected.status as InstitutionStatus).label}
              </Badge>
              {selected.source && (
                <span className="text-[11px] text-muted-foreground">
                  Source : {selected.source}
                  {selected.sourceUrl && (
                    <a
                      href={selected.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      officielle <ExternalLink className="size-3" />
                    </a>
                  )}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher : nom, acronyme (ex. IUC), ville…"
              className="pl-8"
            />
          </div>
          {debouncedQ.trim().length >= 2 &&
            (search === undefined ? (
              <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Recherche dans le référentiel…
              </p>
            ) : search.length > 0 ? (
              <div className="flex flex-col gap-1">
                {search.map((i) => (
                  <button
                    key={i._id}
                    type="button"
                    onClick={() => {
                      onSelect(i as unknown as InstitutionLite);
                      onChangeSchool(i.name);
                      setQ("");
                    }}
                    className="flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="text-sm font-medium leading-snug">{i.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {INSTITUTION_TYPE_LABELS[
                        i.institutionType as keyof typeof INSTITUTION_TYPE_LABELS
                      ] ?? i.institutionType}
                      {i.city ? ` · ${i.city}` : ""} ·{" "}
                      {REGION_LABELS[i.region as Region] ?? i.region}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex items-start gap-1.5 px-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                Aucun établissement du référentiel ne correspond.
              </p>
            ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              setNfName(debouncedQ.trim().length >= 2 ? debouncedQ.trim() : "");
              setNfOpen(true);
            }}
          >
            <ShieldQuestion className="mr-1.5 size-4" /> Mon établissement n'est pas dans la liste
          </Button>
        </>
      )}

      {/* Justificatif + enregistrement */}
      <div className="flex flex-col gap-1.5 rounded-lg border bg-background/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs">
          {diplomaDoc ? (
            <>
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Justificatif joint : {diplomaDoc.label}
            </>
          ) : (
            <>
              <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400" />
              Joignez le justificatif (section « Documents justificatifs », type Diplôme) :
              il sera haché puis vérifié par GTEC PRO.
            </>
          )}
        </p>
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={!canSubmit}
          onClick={registerCredential}
        >
          {hashing ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 size-4" />
          )}
          Enregistrer cette déclaration
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Le badge « Diplôme vérifié GTEC PRO » n'est accordé qu'après contrôle des
          justificatifs par l'administration — jamais sur simple déclaration.
        </p>
      </div>

      {/* Mes demandes de vérification d'établissement */}
      {myRequests && myRequests.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Mes demandes d'ajout d'établissement
          </p>
          {myRequests.map((r) => (
            <div
              key={r._id}
              className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs"
            >
              <span className="truncate font-medium">{r.institutionName}</span>
              <span
                className={
                  r.status === "APPROVED"
                    ? "shrink-0 text-emerald-600 dark:text-emerald-400"
                    : r.status === "REJECTED"
                      ? "shrink-0 text-destructive"
                      : "shrink-0 text-amber-600 dark:text-amber-400"
                }
              >
                {REQUEST_STATUS_LABELS[r.status] ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Demande de vérification (§9) — jamais de création automatique */}
      <Dialog open={nfOpen} onOpenChange={setNfOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Faire vérifier cet établissement</DialogTitle>
            <DialogDescription>
              Il n'est pas encore dans le référentiel officiel. Décrivez-le : GTEC
              PRO contrôlera son autorisation MINESUP avant de l'ajouter. Votre
              diplôme restera « déclaré » en attendant.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Nom de l'établissement *</Label>
              <Input
                value={nfName}
                onChange={(e) => setNfName(e.target.value)}
                placeholder="Ex. : Institut Universitaire de la Côte"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Ville</Label>
                <Input
                  value={nfCity}
                  onChange={(e) => setNfCity(e.target.value)}
                  placeholder="Ex. : Douala"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Pays</Label>
                <Input value={nfCountry} onChange={(e) => setNfCountry(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Année d'obtention</Label>
                <Input
                  type="number"
                  min={1970}
                  max={2030}
                  value={nfYear}
                  onChange={(e) => setNfYear(e.target.value ? Number(e.target.value) : "")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Diplôme obtenu</Label>
                <Input
                  value={nfDiploma}
                  onChange={(e) => setNfDiploma(e.target.value)}
                  placeholder="Ex. : BTS"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Spécialité</Label>
              <Input
                value={nfSpecialty}
                onChange={(e) => setNfSpecialty(e.target.value)}
                placeholder="Ex. : Électrotechnique industrielle"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Précisions (optionnel)</Label>
              <Input
                value={nfNote}
                onChange={(e) => setNfNote(e.target.value)}
                placeholder="Site web, contact de l'établissement…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNfOpen(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={submitRequest} disabled={busy}>
              <Send className="mr-1.5 size-4" /> Soumettre pour vérification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
