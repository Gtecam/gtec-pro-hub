import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import logo from "@/assets/logo.svg";
import {
  ArrowRight,
  Loader2,
  Mail,
  Phone,
  UserRound,
  Wrench,
} from "lucide-react";
import { CM_COUNTRY_CODE, formatCmPhone, toCmLocal } from "@/lib/gtec";
import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router";

type AccountType = "client" | "technicien";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const setAccountType = useMutation(api.gtec.setAccountType);

  // Écran 1 : choix de l'espace (client ou technicien) — écran 2 : connexion.
  const [space, setSpace] = useState<AccountType | null>(null);
  const registeredRef = useRef(false);
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [step, setStep] = useState<
    "signIn" | { email?: string; phone?: string }
  >("signIn");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode démo (Twilio non configuré) : le dernier code envoyé au numéro
  // saisi est lisible ici pour permettre la connexion depuis la preview.
  const demoCode = useQuery(
    api.sms.peekAuthSmsEcho,
    step !== "signIn" && step.phone ? { phone: step.phone } : "skip",
  );

  // Déjà connecté avec un espace défini : on entre directement.
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      if (user.accountType === "technicien" && user.role !== "admin") {
        navigate("/technician");
      } else {
        navigate(redirect);
      }
    }
  }, [authLoading, isAuthenticated, user, navigate, redirect]);

  // Connexion réussie : enregistrer le type d'espace choisi (une fois).
  useEffect(() => {
    if (!isAuthenticated || !user || !space || registeredRef.current) return;
    registeredRef.current = true;
    if (user.accountType === space || user.role === "admin") {
      navigate(space === "technicien" ? "/technician" : redirect);
      return;
    }
    if (!user.accountType) {
      setAccountType({ accountType: space })
        .then(() => {
          navigate(space === "technicien" ? "/technician" : redirect);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Erreur");
          setIsLoading(false);
        });
    } else {
      // Compte existant d'un autre espace : on informe et on reste sur l'app.
      toast.error(
        space === "client"
          ? "Ce compte est un compte technicien — connectez-vous via « Espace technicien »."
          : "Ce compte est un compte client — connectez-vous via « Espace client ».",
      );
      navigate(user.accountType === "technicien" ? "/technician" : redirect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, space]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Échec de l'envoi du code. Réessayez.",
      );
      setIsLoading(false);
    }
  };

  /** Connexion par numéro camerounais : envoi du code par SMS. */
  const handlePhoneSubmit = async () => {
    const local = toCmLocal(phoneLocal);
    if (!local) {
      setError("Numéro camerounais invalide. Exemple : 655 09 42 28.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("phone", `${CM_COUNTRY_CODE}${local}`);
      await signIn("phone-otp", formData);
      setStep({ phone: local });
      setIsLoading(false);
    } catch (error) {
      console.error("Phone sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Échec de l'envoi du SMS. Réessayez.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === "signIn") return;
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      if (step.phone) {
        formData.set("phone", `${CM_COUNTRY_CODE}${step.phone}`);
      } else if (step.email) {
        formData.set("email", step.email);
      }
      formData.set("code", otp);
      await signIn(step.phone ? "phone-otp" : "email-otp", formData);

      // L'enregistrement du type d'espace + navigation se font dans l'effet
      // qui observe l'utilisateur fraîchement connecté.
    } catch (error) {
      console.error("OTP verification error:", error);

      setError("Le code de vérification est incorrect.");
      setIsLoading(false);

      setOtp("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Auth Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="flex items-center justify-center h-full flex-col">
          {space === null ? (
            /* ---------- Écran 1 : choisir son espace ---------- */
            <Card className="w-full max-w-md border shadow-md">
              <CardHeader className="text-center">
                <div className="flex justify-center">
                  <img
                    src={logo}
                    alt="GTEC PRO"
                    width={64}
                    height={64}
                    className="rounded-lg mb-4 mt-4 cursor-pointer"
                    onClick={() => navigate("/")}
                  />
                </div>
                <CardTitle className="text-xl">Bienvenue sur GTEC PRO</CardTitle>
                <CardDescription>
                  Quel espace souhaitez-vous utiliser ?
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <button
                  className="group flex items-center gap-4 rounded-xl border border-border/70 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.04]"
                  onClick={() => {
                    setSpace("client");
                    setStep("signIn");
                  }}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <UserRound className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-semibold">
                      Espace client
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Demander une intervention, suivre le devis, payer et
                      signer le PV.
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>

                <button
                  className="group flex items-center gap-4 rounded-xl border border-border/70 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.04]"
                  onClick={() => {
                    setSpace("technicien");
                    setStep("signIn");
                  }}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Wrench className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-semibold">
                      Espace technicien
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Postuler, être vérifié, recevoir des missions et suivre
                      vos gains.
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              </CardContent>
              <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
                Connexion sécurisée — GTEC PRO Cameroun ·{" "}
                <a
                  href="tel:+237655094228"
                  className="font-medium text-foreground transition-colors hover:text-primary"
                >
                  Support 655 09 42 28
                </a>
              </div>
            </Card>
          ) : (
            /* ---------- Écran 2 : connexion / inscription ---------- */
            <Card className="min-w-[350px] pb-0 border shadow-md">
              {step === "signIn" ? (
                <>
                  <CardHeader className="text-center">
                    <div className="flex justify-center">
                      <img
                        src={logo}
                        alt="GTEC PRO"
                        width={64}
                        height={64}
                        className="rounded-lg mb-4 mt-4 cursor-pointer"
                        onClick={() => navigate("/")}
                      />
                    </div>
                    <CardTitle className="text-xl">
                      {space === "technicien"
                        ? "Espace technicien"
                        : "Espace client"}
                    </CardTitle>
                    <CardDescription>
                      {method === "phone"
                        ? "Entrez votre numéro de téléphone camerounais pour vous connecter ou créer votre compte."
                        : `Entrez votre email pour vous connecter ou créer votre compte ${space === "technicien" ? "technicien" : "client"}.`}
                    </CardDescription>
                  </CardHeader>
                  {method === "phone" ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handlePhoneSubmit();
                      }}
                    >
                      <CardContent>
                        <div className="flex items-center gap-2">
                          <div className="relative flex flex-1 items-center">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <span className="absolute left-9 select-none text-sm font-medium text-muted-foreground">
                              {CM_COUNTRY_CODE}
                            </span>
                            <Input
                              value={phoneLocal}
                              onChange={(e) => {
                                setPhoneLocal(e.target.value);
                                setError(null);
                              }}
                              placeholder="6XX XX XX XX"
                              inputMode="numeric"
                              autoComplete="tel-national"
                              className="pl-20 tracking-wide"
                              disabled={isLoading}
                            />
                          </div>
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRight className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {phoneLocal && toCmLocal(phoneLocal) && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatCmPhone(toCmLocal(phoneLocal)!)} — MTN / Orange
                            / Nexttel / Camtel
                          </p>
                        )}
                        {error && (
                          <p className="mt-2 text-sm text-destructive">{error}</p>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                          Un code de connexion vous sera envoyé par SMS.
                        </p>
                      </CardContent>
                    </form>
                  ) : (
                    <form onSubmit={handleEmailSubmit}>
                      <CardContent>
                        <div className="relative flex items-center gap-2">
                          <div className="relative flex-1">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              name="email"
                              placeholder="name@example.com"
                              type="email"
                              className="pl-9"
                              disabled={isLoading}
                              required
                            />
                          </div>
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRight className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {error && (
                          <p className="mt-2 text-sm text-destructive">{error}</p>
                        )}
                      </CardContent>
                    </form>
                  )}
                  <CardContent>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Ou
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3 w-full"
                      onClick={() => {
                        setMethod(method === "phone" ? "email" : "phone");
                        setError(null);
                      }}
                      disabled={isLoading}
                    >
                      {method === "phone"
                        ? "Continuer avec un e-mail"
                        : "Continuer avec un numéro camerounais"}
                    </Button>

                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      Connexion 100 % sécurisée par code unique — le mode
                      invité n'est plus disponible.
                    </p>

                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 w-full"
                      onClick={() => {
                        setSpace(null);
                        setStep("signIn");
                        setError(null);
                      }}
                      disabled={isLoading}
                    >
                      Changer d'espace
                    </Button>
                  </CardContent>
                </>
              ) : (
                <>
                  <CardHeader className="text-center mt-4">
                    <CardTitle>
                      {step.phone
                        ? "Vérifiez vos SMS"
                        : "Vérifiez votre boîte mail"}
                    </CardTitle>
                    <CardDescription>
                      Un code à 6 chiffres a été envoyé à{" "}
                      <span className="font-medium text-foreground">
                        {step.phone
                          ? `${CM_COUNTRY_CODE} ${formatCmPhone(step.phone)}`
                          : step.email}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleOtpSubmit}>
                    <CardContent className="pb-4">
                      <input type="hidden" name="code" value={otp} />

                      <div className="flex justify-center">
                        <InputOTP
                          value={otp}
                          onChange={setOtp}
                          maxLength={6}
                          disabled={isLoading}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              otp.length === 6 &&
                              !isLoading
                            ) {
                              const form = (
                                e.target as HTMLElement
                              ).closest("form");
                              if (form) {
                                form.requestSubmit();
                              }
                            }
                          }}
                        >
                          <InputOTPGroup>
                            {Array.from({ length: 6 }).map((_, index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      {error && (
                        <p className="mt-2 text-sm text-destructive text-center">
                          {error}
                        </p>
                      )}
                      {step.phone && demoCode && (
                        <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
                          Mode démo — SMS non configuré. Code de connexion :{" "}
                          <span className="font-mono text-sm font-bold tracking-widest text-foreground">
                            {demoCode.code}
                          </span>
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground text-center mt-4">
                        Code non reçu ?{" "}
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          disabled={isLoading}
                          onClick={() => {
                            if (step.phone) {
                              handlePhoneSubmit();
                            } else {
                              setStep("signIn");
                            }
                          }}
                        >
                          Renvoyer
                        </Button>
                      </p>
                    </CardContent>
                    <CardFooter className="flex-col gap-2">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading || otp.length !== 6}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Vérification…
                          </>
                        ) : (
                          <>
                            Valider le code
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStep("signIn")}
                        disabled={isLoading}
                        className="w-full"
                      >
                        Modifier le numéro ou l'e-mail
                      </Button>
                    </CardFooter>
                  </form>
                </>
              )}

              <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
                {space === "technicien" ? "Espace technicien" : "Espace client"}{" "}
                — GTEC PRO Cameroun ·{" "}
                <a
                  href="tel:+237655094228"
                  className="font-medium text-foreground transition-colors hover:text-primary"
                >
                  Support 655 09 42 28
                </a>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
