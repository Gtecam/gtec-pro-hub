import { useMutation, useQuery } from "convex/react";
import { Lightbulb, RotateCcw, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  questionsFor,
  runDiagnostic,
  type DiagnosticAnswer,
} from "@/lib/diagnostic";
import { estimateBudget, fcfaRange } from "@/lib/estimate";
import { cn } from "@/lib/utils";

/**
 * GTEC PRO — CONSEILLER (F°1 « AI DIAGNOSTIC » + F°2 « ESTIMATE »).
 * Aide au pré-diagnostic et à l'estimation AVANT la demande : moteurs 100 %
 * locaux (aucune donnée externe), résultats archivés côté serveur
 * (advisor.ts) et injectables dans le formulaire de demande. Le pré-diagnostic
 * n'est jamais une certification : le technicien valide sur place ; l'estimation
 * ne remplace jamais le devis signé.
 */

const URGENCY_LABELS: Record<string, string> = {
  normale: "Normale",
  urgente: "Urgente",
  critique: "Critique",
};

export function AdvisorCard({
  serviceKey,
  sessionKey,
  onApply,
}: {
  serviceKey: string | null;
  /** Base commune des clés de session (diag-/est-) portée par le parent —
   *  permet le rattachement à la demande réelle après création. */
  sessionKey: string;
  onApply?: (payload: { description?: string; urgency?: string; budgetHint?: number }) => void;
}) {
  const saveDiagnostic = useMutation(api.advisor.saveDiagnostic);
  const saveEstimate = useMutation(api.advisor.saveEstimate);
  const interventions = useQuery(
    api.catalog.listInterventions,
    serviceKey ? { serviceKey } : "skip",
  );

  const [mode, setMode] = useState<"none" | "diagnostic" | "estimate">("none");

  // ----- Pré-diagnostic -----
  const [question, setQuestion] = useState("");
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof runDiagnostic> | null>(null);
  const [, setBusy] = useState(false);

  const guided = useMemo(() => questionsFor(question), [question]);
  const currentQ = guided.questions[qIndex];

  const startDiag = () => {
    if (question.trim().length < 10) {
      toast.error("Décrivez votre problème en quelques mots (10 caractères min).");
      return;
    }
    setAnswers([]);
    setQIndex(0);
    setResult(null);
    setStarted(true);
    setMode("diagnostic");
  };

  const answerQ = (answer: string) => {
    const next = [...answers, { question: currentQ.q, answer }];
    setAnswers(next);
    if (qIndex + 1 < guided.questions.length) {
      setQIndex(qIndex + 1);
    } else {
      const r = runDiagnostic(question, next);
      setResult(r);
      setBusy(true);
      void saveDiagnostic({
        sessionKey: `diag-${sessionKey}`,
        serviceKey: serviceKey ?? undefined,
        question: question.trim(),
        answers: next,
        resultJson: JSON.stringify(r),
      })
        .catch(() => undefined)
        .finally(() => setBusy(false));
    }
  };

  // ----- Estimation -----
  const [interventionCode, setInterventionCode] = useState("");
  const [qty, setQty] = useState("1");
  const [difficulty, setDifficulty] = useState("moyen");
  const [urgency, setUrgency] = useState("normale");
  const [techs, setTechs] = useState("1");
  const [materials, setMaterials] = useState("oui");
  const [estimate, setEstimate] = useState<ReturnType<typeof estimateBudget> | null>(null);

  const chosen = (interventions ?? []).find((i) => i.code === interventionCode);

  const runEstimate = async () => {
    const r = estimateBudget({
      basePrice: chosen?.price,
      baseLabel: chosen?.label,
      quantity: Number(qty) || 1,
      difficulty: difficulty as never,
      urgency: urgency as never,
      technicians: Number(techs) || 1,
      materialsIncluded: materials === "oui",
    });
    setEstimate(r);
    try {
      await saveEstimate({
        sessionKey: `est-${sessionKey}`,
        inputsJson: JSON.stringify({ interventionCode, qty, difficulty, urgency, techs, materials, serviceKey }),
        resultJson: JSON.stringify(r),
      });
    } catch {
      /* l'archivage ne bloque jamais l'affichage de l'estimation */
    }
  };

  if (mode === "none") {
    return (
      <Card className="card-layered border-primary/25 bg-gradient-to-br from-primary/[0.05] to-transparent">
        <CardContent className="flex flex-col gap-2.5 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb className="size-4 text-primary" /> Assistant GTEC PRO — avant de décrire votre besoin
          </p>
          <p className="text-xs text-muted-foreground">
            Laissez-vous guider : un pré-diagnostic rapide précise votre
            problème, une estimation donne une fourchette de budget indicative.
            Le technicien garde toujours la validation finale et le devis signé
            reste la référence.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setMode("diagnostic")}>
              <Search className="mr-1.5 size-3.5" /> Pré-diagnostic guidé
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("estimate")}>
              <Wallet className="mr-1.5 size-3.5" /> Estimer mon budget
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mode === "diagnostic") {
    return (
      <Card className="card-layered border-primary/25">
        <CardContent className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Lightbulb className="size-4 text-primary" /> Pré-diagnostic — {guided.domainLabel}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setMode("none");
                setStarted(false);
                setResult(null);
                setAnswers([]);
                setQIndex(0);
              }}
            >
              <RotateCcw className="mr-1 size-3" /> Fermer
            </Button>
          </div>

          {!started && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Décrivez votre problème</Label>
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ex. : Ma climatisation fonctionne mais ne refroidit plus"
              />
              <Button size="sm" onClick={startDiag}>
                Démarrer le questionnaire guidé
              </Button>
            </div>
          )}

          {started && !result && currentQ && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Question {qIndex + 1}/{guided.questions.length}
              </p>
              <p className="text-sm font-medium">{currentQ.q}</p>
              <div className="grid gap-1.5">
                {currentQ.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                      "border-border/70 hover:border-primary/50 hover:bg-primary/5",
                    )}
                    onClick={() => answerQ(o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                <p>
                  <span className="text-muted-foreground">Catégorie probable :</span>{" "}
                  <span className="font-medium">{result.probableCategory}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Type d'intervention :</span>{" "}
                  <span className="font-medium">{result.interventionType}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Urgence suggérée :</span>{" "}
                  <span
                    className={cn(
                      "font-medium",
                      result.urgency === "critique"
                        ? "text-destructive"
                        : result.urgency === "urgente"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {URGENCY_LABELS[result.urgency]}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{result.urgencyReason}</p>
                {result.possibleMaterials.length > 0 && (
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">Matériel probable :</span>{" "}
                    {result.possibleMaterials.join(", ")}
                  </p>
                )}
                <p className="mt-1 text-xs">
                  <span className="text-muted-foreground">Durée indicative :</span> ~
                  {result.estimatedDurationHours} h ·{" "}
                  <span className="text-muted-foreground">Techniciens :</span>{" "}
                  {result.techniciansNeeded}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">{result.disclaimer}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  onClick={() => {
                    onApply?.({
                      description: `${question.trim()}${answers.length ? "\n\nPré-diagnostic GTEC PRO :\n" + answers.map((a) => `• ${a.question} ${a.answer}`).join("\n") : ""}`,
                      urgency: result.urgency,
                    });
                    toast.success("Pré-diagnostic reporté dans votre demande");
                    setMode("none");
                  }}
                >
                  Utiliser dans ma demande
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAnswers([]);
                    setQIndex(0);
                    setResult(null);
                    setStarted(false);
                  }}
                >
                  <RotateCcw className="mr-1 size-3.5" /> Recommencer
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // mode === "estimate"
  return (
    <Card className="card-layered border-primary/25">
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Wallet className="size-4 text-primary" /> Estimation indicative
          </p>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode("none")}>
            <RotateCcw className="mr-1 size-3" /> Fermer
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Intervention du catalogue</Label>
            <Select value={interventionCode} onValueChange={setInterventionCode}>
              <SelectTrigger>
                <SelectValue placeholder={interventions === undefined ? "Chargement…" : "Choisir"} />
              </SelectTrigger>
              <SelectContent>
                {(interventions ?? []).map((i) => (
                  <SelectItem key={i.code} value={i.code}>
                    {i.label} ({i.price.toLocaleString("fr-FR")} F)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Quantité</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Techniciens</Label>
              <Input type="number" min={1} max={6} value={techs} onChange={(e) => setTechs(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Difficulté</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="moyen">Moyen</SelectItem>
                <SelectItem value="complexe">Complexe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Urgence</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normale">Normale</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
                <SelectItem value="critique">Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-sm">Matériel fourni par le prestataire ?</Label>
            <Select value={materials} onValueChange={setMaterials}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui — matériel inclus</SelectItem>
                <SelectItem value="non">Non — main-d'œuvre seule</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button size="sm" onClick={() => void runEstimate()}>
          Calculer la fourchette indicative
        </Button>

        {estimate && (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <p className="font-medium">
                Estimation indicative : {fcfaRange(estimate)}
              </p>
              {estimate.detail.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {estimate.detail.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{estimate.disclaimer}</p>
            <Button
              size="sm"
              onClick={() => {
                const mid = Math.round((estimate.min + estimate.max) / 2 / 500) * 500;
                onApply?.({ budgetHint: mid });
                toast.success("Budget indicatif prérempli — modifiable à tout moment");
                setMode("none");
              }}
            >
              Préremplir mon budget indicatif
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
