import { motion } from "framer-motion";
import { Compass, Home, LogIn } from "lucide-react";
import { Link } from "react-router";
import { PublicShell } from "@/components/gtec";
import { Button } from "@/components/ui/button";

/**
 * GTEC PRO — 404 (/route inconnue). Écran public autonome : thème vert
 * GTEC, message en français et deux sorties (accueil / connexion) pour que
 * le visiteur ne reste jamais bloqué sur une page vide.
 */
export default function NotFound() {
  return (
    <PublicShell>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card px-6 py-10 text-center shadow-sm"
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="size-7" />
        </span>
        <p className="font-display text-4xl font-bold tracking-tight text-primary">404</p>
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Cette page n'existe pas
        </h1>
        <p className="text-sm text-muted-foreground">
          L'adresse demandée est introuvable ou a été déplacée. Les liens de
          vérification de certificat et de scan d'équipement restent valides s'ils
          sont ouverts directement depuis leur QR code.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link to="/">
              <Home className="size-4" /> Retour à l'accueil
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth">
              <LogIn className="size-4" /> Se connecter
            </Link>
          </Button>
        </div>
      </motion.div>
    </PublicShell>
  );
}