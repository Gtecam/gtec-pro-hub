import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { Navigate } from "react-router";
import AdminConsole from "@/pages/AdminConsole";
import ClientDashboard from "@/pages/ClientDashboard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

/**
 * Tableau de bord : bascule selon le type d'espace du compte.
 * - Admin → console GTEC (l'admin peut consulter l'expérience client via ?view=client)
 * - Technicien → renvoyé vers /technician (son espace dédié)
 * - Client → expérience client
 * Pilote : si aucun admin n'existe encore, n'importe quel compte connecté
 * peut initialiser la console (le premier qui réclame devient admin).
 */
export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const adminExists = useQuery(api.gtec.adminExists);
  const claimAdmin = useMutation(api.gtec.claimAdmin);
  const [busy, setBusy] = useState(false);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const clientView = searchParams.get("view") === "client";

  if (user.role !== "admin" && user.accountType === "technicien") {
    // Un compte technicien ne peut pas entrer dans l'espace client.
    return <Navigate to="/technician" replace />;
  }

  if (user.role === "admin") {
    return clientView ? <ClientDashboard /> : <AdminConsole />;
  }

  // Pilote initialisation : aucun admin n'existe encore.
  if (adminExists === false) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="card-layered w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <CardTitle className="font-display text-xl">
              Initialiser la console GTEC
            </CardTitle>
            <CardDescription>
              Aucun administrateur n'existe encore. Le premier compte qui
              initialise la console devient l'administration GTEC PRO. Vous
              garderez l'accès à votre espace {user.accountType === "technicien" ? "technicien" : "client"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="halo-amber w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await claimAdmin();
                  toast.success("Vous êtes maintenant administrateur GTEC");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erreur");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ShieldCheck className="mr-2 size-4" />
              Devenir l'administrateur GTEC
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <ClientDashboard />;
}
