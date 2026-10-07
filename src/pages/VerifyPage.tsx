import { useQuery } from "convex/react";
import { BadgeCheck, Building2, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { PublicShell } from "@/components/gtec";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/gtec";

/**
 * GTEC PRO — VÉRIFICATION PUBLIQUE (F°12 + F°6) : /verify/:token.
 * Page accessible sans connexion : vérification de l'authenticité d'un
 * certificat numérique d'intervention, ou vue publique masquée d'un
 * bâtiment (si le propriétaire l'a activée). Aucune donnée personnelle
 * n'est exposée (§13, §40).
 */
export default function VerifyPage() {
  const { token } = useParams<{ token: string }>();
  // Certificat d'intervention ?
  const cert = useQuery(api.missions.verifyCertificate, token ? { token } : "skip");
  // Vue publique bâtiment (le hook doit être appelé inconditionnellement).
  const building = useQuery(api.buildings.getPublicBuilding, token ? { token } : "skip");

  if (cert === undefined || building === undefined) {
    return (
      <PublicShell
        title="Vérification d'un document"
        subtitle="Lien public — aucune donnée personnelle n'est exposée."
        footer="GTEC PRO — Green Tech Energy Cameroon · lien de vérification officiel"
      >
        <div className="mx-auto max-w-xl py-2">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      title="Vérification d'un document"
      subtitle="Certificat d'intervention ou vue publique d'un dossier technique."
      footer="GTEC PRO — Green Tech Energy Cameroon · lien de vérification officiel"
    >
      <div className="mx-auto flex max-w-xl flex-col gap-4 py-2">
        {cert ? (
          <Card className="card-layered border-emerald-500/40 bg-emerald-500/[0.04]">
            <CardContent className="flex flex-col gap-2 px-5 py-5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="size-6" />
              </span>
              <p className="font-display text-lg font-semibold">
                Certificat {cert.number} authentique
              </p>
              <p className="text-sm text-muted-foreground">
                Ce certificat numérique d'intervention GTEC PRO est enregistré
                dans le registre officiel de la plateforme.
              </p>
              <div className="mt-1 grid gap-1 text-sm">
                <p><span className="text-muted-foreground">Mission :</span> {cert.reference}</p>
                <p><span className="text-muted-foreground">Intervention :</span> {cert.intervention ?? "—"}</p>
                <p><span className="text-muted-foreground">Ville :</span> {cert.city ?? "—"}</p>
                <p>
                  <span className="text-muted-foreground">Check-list sécurité :</span>{" "}
                  {cert.checklistComplete ? "complète" : "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Signature client :</span>{" "}
                  {cert.clientSigned ? "recueillie" : "—"}
                </p>
                <p><span className="text-muted-foreground">Émis le :</span> {formatDate(cert.issuedAt)}</p>
                <p className="break-all text-[11px] text-muted-foreground/80">
                  Empreinte SHA-256 : {cert.payloadHash.slice(0, 32)}…
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                GTEC PRO — Green Tech Energy Cameroon. L'empreinte garantit que
                les preuves (photos, signature, GPS) n'ont pas été altérées
                depuis l'émission.
              </p>
            </CardContent>
          </Card>
        ) : building ? (
          <Card className="card-layered">
            <CardContent className="flex flex-col gap-2 px-5 py-5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-6" />
              </span>
              <p className="font-display text-lg font-semibold">{building.name}</p>
              <p className="text-sm text-muted-foreground">
                {building.kind} · {building.city} — dossier technique GTEC PRO
              </p>
              {building.publicAssets.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Aucun équipement n'est partagé publiquement par le propriétaire.
                </p>
              ) : (
                <div className="mt-1 flex flex-col gap-2">
                  <p className="text-sm font-semibold">Équipements partagés ({building.publicAssets.length})</p>
                  {building.publicAssets.map((a, i) => (
                    <div key={i} className="rounded-lg border px-3 py-2 text-sm">
                      <p className="font-medium">{a.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {[a.brand, a.model].filter(Boolean).join(" · ") || "—"}
                        {a.installedAt ? ` · installé le ${formatDate(a.installedAt)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" /> Vue publique contrôlée par le propriétaire — aucune donnée personnelle.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="card-layered">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ShieldCheck className="size-8 text-muted-foreground" />
              <p className="font-semibold">Document ou dossier introuvable</p>
              <p className="text-sm text-muted-foreground">
                Ce lien de vérification est invalide, expiré ou a été désactivé
                par son propriétaire.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
