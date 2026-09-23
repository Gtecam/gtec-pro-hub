import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import AdminConsole from "@/pages/AdminConsole";
import ClientDashboard from "@/pages/ClientDashboard";

/** Tableau de bord : bascule automatique selon le rôle du compte. */
export default function Dashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return user.role === "admin" ? <AdminConsole /> : <ClientDashboard />;
}
