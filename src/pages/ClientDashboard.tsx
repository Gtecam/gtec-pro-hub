import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  FileText,
  MapPin,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { AppShell, StatusBadge } from "@/components/gtec";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { fcfa, SERVICES, statusMeta } from "@/lib/gtec";

function serviceIcon(key: string) {
  return SERVICES.find((s) => s.key === key)?.icon ?? Sparkles;
}

function serviceLabel(key: string) {
  return SERVICES.find((s) => s.key === key)?.label ?? key;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const requests = useQuery(api.gtec.listMyRequests);
  const cancelRequest = useMutation(api.gtec.cancelRequest);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelRequest({
        requestId: cancelTarget as never,
        reason: cancelReason || "Annulée par le client",
      });
      toast.success("Demande annulée");
      setCancelTarget(null);
      setCancelReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const open = (requests ?? []).filter(
    (r) => !["terminee", "annulee"].includes(r.request.status),
  );
  const closed = (requests ?? []).filter((r) =>
    ["terminee", "annulee"].includes(r.request.status),
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        {/* En-tête */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Espace client
            </p>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight">
              Bonjour{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Demande, devis, paiement, équipe, rapport et facture : suivez
              chaque intervention au même endroit.
            </p>
          </div>
          <Button size="lg" className="halo-amber" onClick={() => navigate("/dashboard/new")}>
            <Plus className="mr-2 size-4" />
            Nouvelle demande
          </Button>
        </div>

        {/* Parcours garanti V1 */}
        <Card className="card-layered border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
            {[
              { icon: FileText, label: "Demande & devis" },
              { icon: Wallet, label: "Paiement Mobile Money" },
              { icon: CalendarClock, label: "Équipe planifiée" },
              { icon: ShieldCheck, label: "Rapport & PV signé" },
              { icon: Receipt, label: "Facture" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-2 text-sm font-medium">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                {label}
              </span>
            ))}
          </CardContent>
        </Card>

        {/* Demandes en cours */}
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Demandes en cours</h2>
          {requests === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : open.length === 0 ? (
            <Card className="card-layered">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="size-6" />
                </div>
                <p className="font-display text-lg font-semibold">
                  Aucune demande en cours
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Décrivez votre besoin en 2 minutes : un technicien GTEC
                  qualifié prend le relais.
                </p>
                <Button className="mt-2" onClick={() => navigate("/dashboard/new")}>
                  Créer une demande <ArrowRight className="ml-2 size-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {open.map(({ request, quote }) => {
                const Icon = serviceIcon(request.serviceKey);
                const meta = statusMeta(request.status);
                return (
                  <motion.div
                    key={request._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card
                      className="card-layered group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
                      onClick={() => navigate(`/dashboard/requests/${request._id}`)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="size-5" />
                            </span>
                            <div>
                              <CardTitle className="text-base">
                                {request.title}
                              </CardTitle>
                              <CardDescription className="mt-0.5 flex items-center gap-1">
                                {request.reference} · {serviceLabel(request.serviceKey)}
                              </CardDescription>
                            </div>
                          </div>
                          <StatusBadge status={request.status} />
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {request.description}
                        </p>
                        <div className="flex items-center justify-between border-t border-border/60 pt-3">
                          <span className="text-xs text-muted-foreground">
                            {quote && request.status !== "nouvelle"
                              ? `Devis : ${fcfa(quote.total)}`
                              : meta.hint}
                          </span>
                          <span className="flex items-center gap-1 text-sm font-medium text-primary">
                            Ouvrir
                            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Historique */}
        {closed.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Historique</h2>
            <div className="overflow-hidden rounded-xl border border-border/70">
              {closed.map(({ request }) => (
                <button
                  key={request._id}
                  className="flex w-full items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50"
                  onClick={() => navigate(`/dashboard/requests/${request._id}`)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-medium">{request.reference}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {request.title}
                    </span>
                  </span>
                  <StatusBadge status={request.status} />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Annulation */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler cette demande ?</DialogTitle>
            <DialogDescription>
              Indiquez brièvement la raison de l'annulation.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ex. : problème résolu entre-temps"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Retour
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              <X className="mr-2 size-4" /> Annuler la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export { serviceIcon, serviceLabel };

// réutilisation utilitaire pour l'adresse affichée dans les cartes
export function AddressLine({ address, city }: { address: string; city: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <MapPin className="size-3.5" />
      {address}, {city}
    </span>
  );
}
