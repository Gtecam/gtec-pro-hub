import { useQuery } from "convex/react";
import { QrCode, ShieldAlert, SlidersHorizontal, CalendarClock, Archive, Download, Eye } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/gtec";
import { PublicShell } from "@/components/gtec";

/** GTEC PRO — §6 « PASSEPORT NUMÉRIQUE DES ÉQUIPEMENTS » + §§8-9 */
export default function EquipmentScanPage() {
  const { token } = useParams<{ token: string }>();
  const data = useQuery(api.buildings.getScannedAsset, token ? { token } : "skip");
  const now = useNow();

  const item = data?.asset;
  const building = data?.building;
  const events = data?.events ?? [];

  if (data === undefined) {
    return (
      <PublicShell
        title="Scan d'un équipement"
        subtitle="Lien public — aucune donnée personnelle n'est exposée."
        footer="GTEC PRO — Green Tech Energy Cameroon · scan d'équipement"
      >
        <div className="mx-auto flex max-w-xl flex-col gap-4 py-2">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </PublicShell>
    );
  }

  if (data === null) {
    return (
      <PublicShell
        title="Équipement introuvable"
        subtitle="Ce QR a été désactivé, archivé ou n'appartient pas à votre dossier."
        footer="GTEC PRO — Green Tech Energy Cameroon · lien de scan"
      >
        <Card className="card-layered text-center"><CardContent className="py-10"><ShieldAlert className="mx-auto mb-3 size-8 text-destructive" /><p className="font-semibold">Équipement introuvable</p><p className="text-sm text-muted-foreground">Ce QR a été désactivé, archivé ou n'appartient pas à votre dossier.</p><Button variant="outline" onClick={() => window.history.back()}>Retour</Button></CardContent></Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      title="Fiche équipement"
      subtitle="Fiche d'équipement scannée via le QR."
      footer="GTEC PRO — Green Tech Energy Cameroon · scan d'équipement"
    >
      <div className="flex flex-col gap-5 px-4 py-6 max-w-2xl mx-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><QrCode className="size-5" /></span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Scan QR</p>
              <h1 className="font-display text-xl font-bold">Fiche équipement</h1>
            </div>
          </div>
          <Badge variant="outline">ID : {item?.label ?? "—"}</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="card-layered"><CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader><CardContent className="space-y-2">
            <p className="text-sm"><span className="text-muted-foreground">Catégorie :</span> {item?.domainCode ?? "—"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Marque / modèle :</span> {item?.brand ?? ""} {item?.model ?? ""}</p>
            <p className="text-sm"><span className="text-muted-foreground">N° série :</span> {item?.serialNumber ?? "—"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Installé le :</span> {item?.installedAt ? formatDate(item.installedAt) : "—"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Garantie :</span> {item?.warrantyUntil ? (item.warrantyUntil > now ? `active jusqu'au ${formatDate(item.warrantyUntil)}` : `expirée le ${formatDate(item.warrantyUntil)}`) : "non renseignée"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Prochain entretien :</span> {item?.nextMaintenanceAt ? formatDate(item.nextMaintenanceAt) : "—"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Bâtiment :</span> {building?.name ?? "—"} ({building?.city ?? "—"})</p>
          </CardContent></Card>

          <Card className="card-layered"><CardHeader><CardTitle className="text-base">Historique</CardTitle></CardHeader><CardContent className="space-y-1">
            {events.map((e: any) => <div key={e._id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-muted-foreground">{e.label}</span><span className="shrink-0 text-[11px] text-muted-foreground/70">{formatDate(e.at)}</span></div>)}
            {!events.length && <p className="text-xs text-muted-foreground">Aucun événement enregistré pour cet équipement.</p>}
          </CardContent></Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm"><Eye className="mr-1.5 size-4" /> Voir la fiche</Button>
          <Button variant="outline" size="sm"><SlidersHorizontal className="mr-1.5 size-4" /> Déclarer une panne</Button>
          <Button variant="outline" size="sm"><CalendarClock className="mr-1.5 size-4" /> Démarrer une maintenance</Button>
          <Button variant="outline" size="sm"><Archive className="mr-1.5 size-4" /> Pièce remplacée</Button>
          <Button variant="outline" size="sm"><Download className="mr-1.5 size-4" /> Rapport</Button>
        </div>

        <p className="text-[11px] text-muted-foreground">Les actions sont tracées dans l'historique de l'équipement (§8, §29).</p>
      </div>
    </PublicShell>
  );
}
