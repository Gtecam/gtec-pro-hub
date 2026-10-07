import { useQuery } from "convex/react";
import { ArrowLeft, FileText, Plus, Zap, Building2, Clock, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router";
import { formatDate } from "@/lib/gtec";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function BuildingPassportPage() {
  const navigate = useNavigate();
  const building = useQuery(api.buildings.getBuilding, "skip");

  const goBack = () => navigate(-1);
  const openEquipment = (assetId: string) => navigate(`/e/${assetId}`);

  return (
    <div className="flex flex-col gap-5 px-4 py-6 max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" onClick={goBack}><ArrowLeft className="mr-1.5 size-4" /> Retour aux bâtiments</Button>

      {building?.building ? (
        <>
          <Card className="card-layered border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-7" /></span>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dossier technique</p>
                    <h1 className="font-display text-2xl font-bold">{building.building.name}</h1>
                    <p className="text-sm text-muted-foreground">{building.building.kind} · {building.building.city}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm"><FileText className="mr-1.5 size-4" /> Documents</Button>
                  <Button variant="outline" size="sm"><Plus className="mr-1.5 size-4" /> Événements</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {building.assets?.map((a: any) => (
              <Card key={a._id} className="card-layered cursor-pointer" onClick={() => openEquipment(a._id)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Zap className="size-5" /></span>
                    <div>
                      <p className="font-display text-base font-semibold">{a.label}</p>
                      <p className="text-xs text-muted-foreground">{a.brand ?? ""} {a.model ?? ""}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">N° série : {a.serialNumber ?? "—"} · Garantie : {a.warrantyUntil ? formatDate(a.warrantyUntil) : "—"}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {building.events?.slice(0, 4)?.map((e: any) => (
              <Card key={e._id} className="card-layered"><CardContent className="py-3"><Clock className="size-3.5 text-muted-foreground" /> <p className="text-xs">{e.label} <span className="text-[10px] text-muted-foreground">{formatDate(e.at)}</span></p></CardContent></Card>
            ))}
            {!building.events?.length && <Card className="card-layered text-center"><CardContent className="py-6"><Clock className="mx-auto mb-2 size-5 text-muted-foreground" /><p className="text-xs text-muted-foreground">Aucun événement enregistré</p></CardContent></Card>}
          </div>
        </>
      ) : building === null ? (
        <Card className="card-layered text-center"><CardContent className="py-12"><AlertTriangle className="mx-auto mb-3 size-8 text-destructive" /><p className="font-semibold">Bâtiment introuvable</p><p className="text-sm text-muted-foreground">Il a été archivé ou n'existe pas.</p></CardContent></Card>
      ) : (
        <Card className="card-layered text-center"><CardContent className="py-12"><Building2 className="mx-auto mb-3 size-10 text-muted-foreground" /><p className="font-semibold">Aucun dossier technique</p><p className="text-sm text-muted-foreground">Ajoutez au moins un bâtiment dans <>Mon bâtiment</>.</p></CardContent></Card>
      )}
    </div>
  );
}
