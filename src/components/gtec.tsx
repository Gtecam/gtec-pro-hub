import { Check, Eraser, LogOut, PenLine, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { completedSteps, JOURNEY_STEPS, statusMeta } from "@/lib/gtec";
import { useNavigate } from "react-router";
import logo from "@/assets/logo.svg";

// ---------- badge de statut ----------

const BADGE_STYLES: Record<string, string> = {
  amber: "bg-primary/10 text-primary ring-primary/20",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  red: "bg-destructive/10 text-destructive ring-destructive/20",
  gray: "bg-muted text-muted-foreground ring-border",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        BADGE_STYLES[meta.variant],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

// ---------- stepper du parcours V1 ----------

export function JourneyStepper({ status, className }: { status: string; className?: string }) {
  const done = completedSteps(status);
  return (
    <ol className={cn("flex items-center gap-1 sm:gap-1.5", className)}>
      {JOURNEY_STEPS.map((step, i) => {
        const isDone = i < done;
        const isCurrent = i === done && status !== "terminee" && status !== "annulee";
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5">
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1 transition-colors",
                  isDone
                    ? "bg-primary text-primary-foreground ring-primary"
                    : isCurrent
                      ? "bg-primary/15 text-primary ring-2 ring-primary/40"
                      : "bg-muted text-muted-foreground ring-border",
                )}
              >
                {isDone ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden max-w-16 truncate text-center text-[10px] leading-none sm:block",
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < JOURNEY_STEPS.length - 1 && (
              <span
                className={cn(
                  "-mt-4 h-px flex-1 sm:-mt-0",
                  i < done - 1 || (status === "terminee" && i < done - 1)
                    ? "bg-primary/50"
                    : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- pad de signature (PV de réception) ----------

export function SignaturePad({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!value) {
      setHasInk(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [value]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };

  const stop = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="rounded-xl border border-dashed border-ring/50 bg-muted/40 p-2">
      <canvas
        ref={canvasRef}
        width={560}
        height={180}
        className="h-36 w-full touch-none rounded-lg bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerLeave={stop}
      />
      <div className="mt-2 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PenLine className="size-3.5" />
          {hasInk ? "Signature enregistrée" : "Signez dans le cadre"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
          <Eraser className="mr-1.5 size-3.5" /> Effacer
        </Button>
      </div>
    </div>
  );
}

// ---------- shell applicatif (header) ----------

export function AppShell({
  children,
  adminArea = false,
  areaLabel,
}: {
  children: React.ReactNode;
  adminArea?: boolean;
  areaLabel?: string;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const isTech = user?.accountType === "technicien";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Navigation cloisonnée : chaque espace ne montre que ses propres liens.
  const links: React.ReactNode[] = [];
  if (isAdmin) {
    if (adminArea) {
      links.push(
        <Button
          key="client"
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard?view=client")}
        >
          Vue client
        </Button>,
        <Button
          key="console"
          variant="outline"
          size="sm"
          onClick={() => navigate("/dashboard")}
        >
          <ShieldCheck className="mr-1.5 size-4 text-primary" /> Console admin
        </Button>,
      );
    } else {
      links.push(
        <Button
          key="console"
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
        >
          <ShieldCheck className="mr-1.5 size-4 text-primary" /> Console admin
        </Button>,
      );
    }
  } else if (isTech) {
    // Espace technicien : aucune porte vers l'espace client.
    if (areaLabel !== "Espace technicien") {
      links.push(
        <Button
          key="tech"
          variant="ghost"
          size="sm"
          onClick={() => navigate("/technician")}
        >
          <Wrench className="mr-1.5 size-4 text-primary" /> Espace technicien
        </Button>,
      );
    }
  } else {
    // Espace client : aucune porte vers l'espace technicien.
    if (areaLabel !== "Espace client") {
      links.push(
        <Button
          key="home"
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
        >
          Tableau de bord
        </Button>,
      );
    }
  }

  const badge =
    areaLabel ??
    (adminArea
      ? "Administration"
      : isTech
        ? "Espace technicien"
        : isAdmin
          ? "Administration"
          : "Espace client");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            className="flex items-center gap-2.5"
            onClick={() => navigate("/")}
          >
            <img src={logo} alt="GTEC PRO" className="size-8 rounded-lg" />
            <span className="font-display text-base font-bold tracking-tight">
              GTEC <span className="text-primary">PRO</span>
            </span>
            <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">
              {badge}
            </span>
          </button>
          <div className="flex items-center gap-2">
            {links}
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:block">
              {user?.name || user?.email || "Compte"}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Quitter</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
