import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { Navigate } from "react-router";
import AdminConsole from "@/pages/AdminConsole";
import ClientDashboard from "@/pages/ClientDashboard";

/**
 * Tableau de bord : bascule selon le type d'espace du compte.
 * - Admin → console GTEC (l'admin peut consulter l'expérience client via ?view=client)
 * - Technicien → renvoyé vers /technician (son espace dédié)
 * - Client → expérience client
 */
export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [searchParams] = useSearchParams();

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

  return user.role === "admin" && !clientView ? (
    <AdminConsole />
  ) : (
    <ClientDashboard />
  );
}
