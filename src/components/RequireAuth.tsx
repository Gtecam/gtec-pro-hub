import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

/**
 * Bloque une route réservée aux utilisateurs connectés.
 *
 * Plutôt que de renvoyer directement vers /auth (ce qui laissait l'utilisateur
 * sur un formulaire sans contexte), on affiche le blocage sur la page visitée,
 * puis la connexion ramène vers cette page via `returnTo`.
 */
export function RequireAuth({
  children,
  title = "Connectez-vous pour continuer",
  description = "Cette page est réservée aux utilisateurs connectés.",
  redirectImmediately = false,
}: {
  children: ReactNode;
  /** Headline on the blocked screen. */
  title?: string;
  /** Says what the visitor gets by signing in. */
  description?: string;
  /** Skip the explanation and go straight to `/auth`. */
  redirectImmediately?: boolean;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    const signInHref = `/auth?returnTo=${encodeURIComponent(returnTo)}`;

    if (redirectImmediately) {
      return <Navigate to={signInHref} replace />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                <Lock className="size-5 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Vous serez ramené ici dès votre connexion.
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => navigate(signInHref)}>
              Se connecter
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Retour à l'accueil
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return children;
}
