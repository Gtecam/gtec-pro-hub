import { useQuery } from "convex/react";
import { ArrowRight, Bot, FileText } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * GTEC PRO — GTEC AI (phase 5) : historique des sessions du conseiller
 * intelligent (pré-diagnostics F°1, estimations F°2 et cahiers des charges
 * F°3 archivés côté serveur). Chaque session liée à une demande réelle est
 * rouvrable d'un clic — traçabilité complète de l'aide à la décision.
 */
export function AdvisorHistoryCard() {
  const sessions = useQuery(api.advisor.myAdvisorSessions, {});
  const navigate = useNavigate();

  if (sessions === undefined || sessions.length === 0) return null;

  return (
    <Card className="card-layered">
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Bot className="size-4 text-primary" /> Assistant GTEC PRO — mes sessions
          </p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {sessions.length}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {sessions.slice(0, 6).map((s) => (
            <div
              key={s.sessionKey}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.question ?? "Estimation budgétaire"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.estimate
                    ? `Fourchette ${s.estimate.min.toLocaleString("fr-FR")} – ${s.estimate.max.toLocaleString("fr-FR")} FCFA · `
                    : ""}
                  {new Date(s.at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {s.convertedRequestId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => navigate(`/dashboard/requests/${s.convertedRequestId}`)}
                >
                  <FileText className="mr-1 size-3.5" /> Voir la demande
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => navigate("/dashboard/new")}
                >
                  Créer la demande <ArrowRight className="ml-1 size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
