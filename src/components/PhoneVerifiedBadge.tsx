import { BadgeCheck, Loader2, ShieldAlert, Smartphone } from "lucide-react";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api } from "@/convex/_generated/api";
import { CM_COUNTRY_CODE, formatCmPhone, toCmLocal } from "@/lib/gtec";
import { cn } from "@/lib/utils";

type PhoneVerification = {
  phone: string | null;
  verified: boolean;
} | null;

/**
 * Badge « numéro vérifié » — pill compacte (variante badge) ou ligne de
 * statut (variante full). Le clic ouvre une vérification OTP par SMS du
 * numéro camerounais (Twilio ; mode démo = code affiché à l'écran).
 */
export function PhoneVerifiedBadge({
  variant = "badge",
  className,
}: {
  variant?: "badge" | "full";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);

  const verification = useQuery(api.sms.myPhoneVerification) as
    | PhoneVerification
    | undefined;
  const sendCode = useAction(api.sms.sendSmsCode);
  const verifyCode = useMutation(api.sms.verifySmsCode);

  const verified = verification?.verified ?? false;
  const phone = verification?.phone ?? null;
  // Mode démo (Twilio non configuré) : le code de vérification est renvoyé
  // par l'action sendSmsCode et affiché ici pour permettre la vérification.
  const [demoCode, setDemoCode] = useState<string | null>(null);

  const pretty = phone ? formatCmPhone(phone.replace(/\D/g, "").slice(-9)) : null;

  const request = async () => {
    const local = toCmLocal(phoneInput);
    if (!local) {
      toast.error("Numéro camerounais invalide. Exemple : 655 09 42 28.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendCode({
        phone: `${CM_COUNTRY_CODE}${local}`,
        provider: "profile",
      });
      if (res.mode === "demo") setDemoCode(res.code);
      setStep("code");
      toast.success("Code envoyé par SMS.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (code: string) => {
    setBusy(true);
    try {
      await verifyCode({ code });
      toast.success("Numéro de téléphone vérifié");
      setDemoCode(null);
      setOpen(false);
      setStep("phone");
      setPhoneInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code incorrect");
    } finally {
      setBusy(false);
    }
  };

  if (variant === "badge") {
    return (
      <>
        <button
          type="button"
          onClick={() => !verified && setOpen(true)}
          disabled={verified}
          title={
            verified
              ? `Numéro vérifié ${pretty ?? ""}`
              : "Vérifier mon numéro de téléphone"
          }
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors",
            verified
              ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400",
            className,
          )}
        >
          {verified ? (
            <>
              <BadgeCheck className="size-3.5" />
              Numéro vérifié
            </>
          ) : (
            <>
              <ShieldAlert className="size-3.5" />
              Numéro non vérifié
            </>
          )}
        </button>
        <VerificationDialog
          open={open}
          onOpenChange={setOpen}
          step={step}
          setStep={setStep}
          phoneInput={phoneInput}
          setPhoneInput={setPhoneInput}
          pretty={pretty}
          demoCode={demoCode}
          busy={busy}
          request={request}
          confirm={confirm}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !verified && setOpen(true)}
        disabled={verified}
        className={cn(
          "inline-flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
          verified
            ? "border-emerald-500/30 bg-emerald-500/[0.04]"
            : "border-amber-500/40 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            verified
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
        >
          {verified ? (
            <BadgeCheck className="size-5" />
          ) : (
            <Smartphone className="size-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {verified ? "Numéro de téléphone vérifié" : "Vérifiez votre numéro"}
            {pretty && (
              <span className="text-xs font-normal text-muted-foreground">
                {CM_COUNTRY_CODE} {pretty}
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">
            {verified
              ? "Votre numéro est confirmé — rendez-vous, paiements et alertes vous parviennent sans erreur."
              : "Un code SMS confirme votre numéro : indispensable pour les rendez-vous et les paiements Mobile Money."}
          </span>
        </span>
        {!verified && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">
            <ShieldAlert className="size-3.5" />
            Action requise
          </span>
        )}
      </button>
      <VerificationDialog
        open={open}
        onOpenChange={setOpen}
        step={step}
        setStep={setStep}
        phoneInput={phoneInput}
        setPhoneInput={setPhoneInput}
        pretty={pretty}
        demoCode={demoCode}
        busy={busy}
        request={request}
        confirm={confirm}
      />
    </>
  );
}

function VerificationDialog({
  open,
  onOpenChange,
  step,
  setStep,
  phoneInput,
  setPhoneInput,
  pretty,
  demoCode,
  busy,
  request,
  confirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  step: "phone" | "code";
  setStep: (s: "phone" | "code") => void;
  phoneInput: string;
  setPhoneInput: (v: string) => void;
  pretty: string | null;
  demoCode: string | null;
  busy: boolean;
  request: () => void;
  confirm: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {step === "phone" ? (
          <>
            <DialogHeader>
              <DialogTitle>Vérifier votre numéro de téléphone</DialogTitle>
              <DialogDescription>
                Nous envoyons un code à 6 chiffres par SMS pour confirmer votre
                numéro camerounais.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <div className="relative flex flex-1 items-center">
                <Smartphone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <span className="absolute left-9 select-none text-sm font-medium text-muted-foreground">
                  {CM_COUNTRY_CODE}
                </span>
                <Input
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="6XX XX XX XX"
                  inputMode="numeric"
                  className="pl-20 tracking-wide"
                  disabled={busy}
                />
              </div>
              <Button onClick={request} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Envoyer"}
              </Button>
            </div>
            {phoneInput && toCmLocal(phoneInput) && (
              <p className="text-xs text-muted-foreground">
                {formatCmPhone(toCmLocal(phoneInput)!)} — MTN / Orange / Nexttel /
                Camtel
              </p>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Code de vérification</DialogTitle>
              <DialogDescription>
                Saisissez le code reçu au {CM_COUNTRY_CODE} {pretty ?? phoneInput}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3">
              <InputOTP value={code} onChange={setCode} maxLength={6}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {demoCode && (
                <p className="rounded-lg border border-dashed border-border bg-muted/60 px-3 py-1.5 text-center text-xs text-muted-foreground">
                  Mode démo — SMS non configuré. Code :{" "}
                  <span className="font-mono text-sm font-bold tracking-widest text-foreground">
                    {demoCode}
                  </span>
                </p>
              )}
              <div className="flex w-full gap-2">
                <Button
                  className="flex-1"
                  onClick={() => confirm(code)}
                  disabled={busy || code.length !== 6}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Vérifier"}
                </Button>
                <Button variant="outline" onClick={() => setStep("phone")} disabled={busy}>
                  Modifier le numéro
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
