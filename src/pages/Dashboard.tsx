import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router";
import AdminConsole from "@/pages/AdminConsole";
import ClientDashboard from "@/pages/ClientDashboard";

/**
 * Tableau de bord : bascule automatique selon le rôle du compte.
 * Un admin peut consulter l'expérience client via /dashboard?view=client.
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

  return user.role === "admin" && !clientView ? (
    <AdminConsole />
  ) : (
    <ClientDashboard />
  );
}
