/**
 * PAGE PROFIL — barre de navigation client.
 *
 * Regroupe tout ce qui a été déplacé hors de l'accueil simplifié : identité,
 * adresses et préférences, rendez-vous, favoris, conseiller IA, bâtiments,
 * contrats de maintenance, historique et paiements. Rien n'est supprimé :
 * l'ancien tableau de bord client complet reste accessible ici, tandis que
 * l'accueil (« /home ») reste consacré à TROUVER → CHOISIR → FAIRE RÉALISER.
 * La déconnexion vit désormais ici (l'en-tête de l'accueil ne garde que
 * notifications + profil).
 */
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import ClientDashboard from "./ClientDashboard";

export default function ProfilePage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl justify-end">
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="size-4" />
          Se déconnecter
        </Button>
      </div>
      <ClientDashboard />
    </>
  );
}
