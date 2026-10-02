import { useQuery } from "convex/react";
import { QrCode, ShieldAlert } from "lucide-react";
import { useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { PublicShell } from "@/components/gtec";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/gtec";

/**
 * GTEC PRO — SCAN QR ÉQUIPEMENT (F°6) : /asset/:token.
 * L'accès est contrôlé par les permissions (§40) : propriétaire, accès
 * temporaire actif ou administration. Le scan affiche modèle, garantie,
 * historique et prochaine maintenance — jamais les données du client.
 */
export default function AssetScanPage() {
  const { token } = useParams<{ token: string }>();
  const data = useQuery(api.buildings.getScannedAsset, token ? { token } : "skip");

  return (
    <PublicShell
      title="Fiche équipement"
      subtitle="Accès contrôlé — vos permissions déterminent la lecture."
      footer="GTEC PRO — Green Tech Energy Cameroon · lien de vérification officiel"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <QrCode className="size-5" />
          </span>
          <p className="text-xs text-muted-foreground">
            Dossier technique GTEC PRO — lecture sans donnée client.
          </p>
        </div>

        {data === undefined ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : data === null ? (
          <Card className="card-layered">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ShieldAlert className="size-8 text-destructive" />
              <p className="font-semibold">Équipement introuvable</p>
              <p className="text-sm text-muted-foreground">
                Ce QR code est invalide, l'équipement a été archivé, ou votre
                compte n'a pas d'accès actif à ce dossier.
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => window.history.back()}>
                Retour
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="card-layered">
              <CardContent className="flex flex-col gap-1.5 px-4 py-4">
                <p className="font-display text-lg font-semibold">{data.asset.label}</p>
                <p className="text-sm text-muted-foreground">
                  {[data.asset.brand, data.asset.model].filter(Boolean).join(" · ") || "Marque / modèle non renseignés"}
                </p>
                <div className="mt-1 grid gap-1 text-sm">
                  {data.asset.serialNumber && (
                    <p><span className="text-muted-foreground">N° de série :</span> {data.asset.serialNumber}</p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Installé :</span>{" "}
                    {data.asset.installedAt ? formatDate(data.asset.installedAt) : "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Garantie :</span>{" "}
                    {data.asset.warrantyUntil
                      ? data.asset.warrantyUntil > Date.now()
                        ? `active jusqu'au ${formatDate(data.asset.warrantyUntil)}`
                        : `expirée le ${formatDate(data.asset.warrantyUntil)}`
                      : "non renseignée"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Prochain entretien :</span>{" "}
                    {data.asset.nextMaintenanceAt ? formatDate(data.asset.nextMaintenanceAt) : "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Bâtiment :</span> {data.building.name} ({data.building.city})
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="card-layered">
              <CardContent className="flex flex-col gap-2 px-4 py-4">
                <p className="text-sm font-semibold">Historique ({data.events.length})</p>
                {data.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun événement enregistré pour cet équipement.</p>
                ) : (
                  data.events.map((e) => (
                    <div key={e._id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{e.label}{e.detail ? ` — ${e.detail}` : ""}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground/70">{formatDate(e.at)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PublicShell>
  );
}
