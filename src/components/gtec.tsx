import {
  Bell,
  Check,
  Eraser,
  Inbox,
  Loader2,
  LogOut,
  MessageSquare,
  PenLine,
  ShieldCheck,
  Smartphone,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { completedSteps, JOURNEY_STEPS, statusMeta } from "@/lib/gtec";
import { Link, useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import logo from "@/assets/logo.svg";

// ---------- V3 : cloche de notifications in-app ----------

const KIND_STYLES: Record<string, string> = {
  devis: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  paiement: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  affectation: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rapport: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  facture: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  reception: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  visite: "bg-primary/10 text-primary",
  abonnement: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  general: "bg-muted text-muted-foreground",
};

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const notifications = useQuery(
    api.gtec.listMyNotifications,
    isAuthenticated ? {} : "skip",
  );
  const markRead = useMutation(api.gtec.markNotificationRead);
  const markAllRead = useMutation(api.gtec.markAllNotificationsRead);
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) return null;

  const unread = (notifications ?? []).filter((n) => n.readAt === undefined).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9">
          <Bell className="size-4.5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => void markAllRead()}
            >
              Tout marquer lu
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications === undefined ? (
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox className="size-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Aucune notification pour le moment.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n._id}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50",
                  n.readAt === undefined && "bg-primary/[0.04]",
                )}
                onClick={() => {
                  if (n.readAt === undefined) void markRead({ notificationId: n._id });
                  if (n.requestId) {
                    setOpen(false);
                    navigate(`/dashboard/requests/${n.requestId}`);
                  }
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      KIND_STYLES[n.kind] ?? KIND_STYLES.general,
                    )}
                  >
                    {n.kind}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
                  {n.readAt === undefined && (
                    <span className="size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                <span className="text-[10px] text-muted-foreground/70">
                  {new Date(n.at).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- V5 : bannière de vérification du téléphone (OTP SMS) ----------

/**
 * Bannière affichée tant que le numéro du compte n'est pas vérifié.
 * Avec les clés Twilio configurées, le code arrive par SMS ; sans clés,
 * le mode démo affiche le code à l'écran.
 */
export function PhoneVerificationBanner() {
  const { isAuthenticated } = useAuth();
  const verification = useQuery(
    api.sms.myPhoneVerification,
    isAuthenticated ? {} : "skip",
  );
  const sendCode = useAction(api.sms.sendSmsCode);
  const verifyCode = useMutation(api.sms.verifySmsCode);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  if (!isAuthenticated || verification === undefined || verification?.verified) {
    return null;
  }

  const send = async () => {
    if (!/^[+0-9 ]{8,}$/.test(phone.trim())) {
      toast.error("Numéro invalide. Ex. : 6 55 09 42 28");
      return;
    }
    setSending(true);
    try {
      const res = await sendCode({ phone: phone.trim() });
      setCodeSent(true);
      if (res.mode === "demo") {
        setDemoCode(res.code);
        toast.info(`Mode démo — code : ${res.code}`);
      } else {
        setDemoCode(null);
        toast.success(`Code envoyé au ${phone.trim()} par SMS.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("Le code contient 6 chiffres.");
      return;
    }
    setChecking(true);
    try {
      await verifyCode({ code: code.trim() });
      toast.success("Téléphone vérifié — merci !");
      setOpen(false);
      setCode("");
      setDemoCode(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vérification impossible");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto mb-6 max-w-6xl px-4 sm:px-6">
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-3 sm:flex-row sm:items-center",
          open && "items-start",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Smartphone className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Vérifiez votre numéro de téléphone
          </p>
          <p className="text-xs text-muted-foreground">
            {verification?.phone
              ? `Numéro enregistré : ${verification.phone} — non vérifié.`
              : "Aucun numéro enregistré. Il sert aux notifications SMS et aux paiements Mobile Money."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <MessageSquare className="mr-1.5 size-4" />
          {open ? "Fermer" : "Vérifier maintenant"}
        </Button>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4">
          {demoCode && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              Mode démo (clés Twilio absentes) — votre code :{" "}
              <span className="font-display text-sm font-bold tracking-widest">
                {demoCode}
              </span>
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="6 55 09 42 28"
              inputMode="tel"
              className="sm:max-w-56"
            />
            <Button size="sm" disabled={sending} onClick={() => void send()}>
              {sending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <MessageSquare className="mr-1.5 size-4" />
              )}
              Recevoir le code
            </Button>
          </div>
          {codeSent && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Code à 6 chiffres"
                inputMode="numeric"
                className="sm:max-w-56"
              />
              <Button size="sm" disabled={checking} onClick={() => void verify()}>
                {checking ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 size-4" />
                )}
                Valider
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const { user, signOut, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const isTech = user?.accountType === "technicien";

  // V5 : vide la file d'e-mails (Resend) au chargement de chaque espace.
  const flushEmails = useAction(api.emails.flushEmails);
  useEffect(() => {
    if (!isAuthenticated) return;
    void flushEmails().catch(() => undefined);
    // Une seule passe par montage de l'espace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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
          onClick={() => navigate("/admin")}
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
          onClick={() => navigate("/admin")}
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
            <NotificationBell />
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
      <PhoneVerificationBanner />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

// ---------- shell public (pages accessibles sans connexion) ----------

/**
 * En-tête minimal pour les pages ouvertes à tous (vérification d'un
 * certificat, scan d'un QR équipement). Contrairement à AppShell, aucun
 * appel authentifié n'est déclenché (ni cloche, ni bannière OTP, ni vidage
 * de la file d'e-mails) et aucun bouton de déconnexion n'est proposé : un
 * visiteur non connecté voit le document, pas un espace de compte.
 */
export function PublicShell({
  children,
  title,
  subtitle,
  footer = "GTEC PRO — Green Tech Energy Cameroon · plateforme de gestion technique",
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  footer?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="GTEC PRO" className="size-8 rounded-lg" />
            <span className="font-display text-base font-bold tracking-tight">
              GTEC <span className="text-primary">PRO</span>
            </span>
          </Link>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Lien public
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && (
              <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}
        {children}
      </main>
      <footer className="border-t border-border/60 px-4 py-4 text-center text-[11px] text-muted-foreground">
        {footer}
      </footer>
    </div>
  );
}
