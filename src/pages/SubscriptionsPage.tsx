import { AppShell } from "@/components/gtec";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  SUBSCRIPTION_PLANS,
  monthlyEquivalentLabel,
  planPricing,
  fcfa,
  type SubscriptionPlan,
} from "@/lib/subscriptions";
import { Check, Crown, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";

// Page publique « Abonnements » — modèle économique 2026 :
// 0 % de commission sur les prestations, revenus GTEC PRO par abonnement.

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const pricing = planPricing(plan);
  const recommended = !!plan.recommended;

  const choose = () => {
    navigate(isAuthenticated ? "/technician" : "/auth?returnTo=/technician");
  };

  return (
    <Card
      className={cn(
        "card-layered relative flex h-full flex-col transition-shadow",
        recommended
          ? "border-primary/50 shadow-lg shadow-primary/10"
          : "hover:shadow-md",
      )}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="gap-1 bg-primary px-3 py-1 text-xs font-semibold shadow">
            <Sparkles className="size-3" />
            Meilleur rapport qualité/prix
          </Badge>
        </div>
      )}
      <CardHeader className="pb-3 text-center">
        <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Crown className="size-5" />
        </div>
        <CardTitle className="font-display text-lg">{plan.label}</CardTitle>
        <CardDescription>
          {plan.months} {plan.months > 1 ? "mois" : "mois"}
        </CardDescription>
        <p className="font-display mt-1 text-3xl font-bold text-foreground">
          {fcfa(plan.priceFcfa)}
        </p>
        <p className="text-sm text-muted-foreground">
          Équivalent : {monthlyEquivalentLabel(plan)}
        </p>
        <p
          className={cn(
            "text-sm font-medium",
            pricing.discountPercent === null
              ? "text-muted-foreground"
              : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {pricing.discountLabel}
        </p>
      </CardHeader>
      <CardContent className="mt-auto flex flex-1 flex-col gap-4">
        <ul className="flex flex-col gap-2 text-sm">
          {plan.advantages.map((a) => (
            <li key={a} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">{a}</span>
            </li>
          ))}
        </ul>
        <Button
          onClick={choose}
          variant={recommended ? "default" : "outline"}
          className={cn("w-full", recommended && "halo-amber")}
        >
          Choisir cette formule
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Professionnels
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold sm:text-4xl">
            Abonnement professionnel GTEC PRO
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Recevez des demandes de clients, gérez vos interventions et
            conservez <span className="font-medium text-foreground">100 %</span>{" "}
            du montant de vos prestations — GTEC PRO ne prélève{" "}
            <span className="font-medium text-foreground">aucune commission</span>.
            Votre abonnement est votre seul investissement.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SUBSCRIPTION_PLANS.map((p) => (
            <PlanCard key={p.key} plan={p} />
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Paiement par MTN Mobile Money, Orange Money, carte bancaire / Visa ou
          PayPal. Reçu d'abonnement généré après chaque paiement — séparé de
          toute facture de prestation.
        </p>
      </div>
    </AppShell>
  );
}
