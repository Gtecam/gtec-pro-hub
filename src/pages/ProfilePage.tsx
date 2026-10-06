/**
 * PAGE PROFIL — barre de navigation client.
 *
 * Regroupe tout ce qui a été déplacé hors de l'accueil simplifié : identité,
 * adresses et préférences, rendez-vous, favoris, conseiller IA, bâtiments,
 * contrats de maintenance, historique et paiements. Rien n'est supprimé :
 * l'ancien tableau de bord client complet reste accessible ici, tandis que
 * l'accueil (« /home ») reste consacré à TROUVER → CHOISIR → FAIRE RÉALISER.
 */
import ClientDashboard from "./ClientDashboard";

export default function ProfilePage() {
  return <ClientDashboard />;
}
