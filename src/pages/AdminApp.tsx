import { useAuth } from "@/hooks/use-auth";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  FileSignature,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import { contractFrequencyLabel, fcfa, formatDate } from "@/lib/gtec";

/**
 * Application web ADMIN — séparée de l'app clients/techniciens.
 * Connexion dédiée (email fixe + code OTP),
 * thème sombre distinct, aucune navigation croisée.
 */
export default function AdminApp() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const ensureDemoAdmin = useMutation(api.adminApp.ensureDemoAdmin);
  const isAdmin = user?.role === "admin";

  // Pré-crée le compte admin fixe dès l'ouverture de l'app admin.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      ensureDemoAdmin().catch(() => undefined);
    }
  }, [isLoading, isAuthenticated, ensureDemoAdmin]);

  if (!isLoading && isAuthenticated && isAdmin) {
    return <AdminConsole signOut={signOut} />;
  }

  // Session validée mais profil encore en chargement (juste après le code OTP
  // ou au rechargement) : on affiche un écran d'attente — surtout PAS l'écran
  // « Accès refusé », sinon la console admin ne s'ouvre jamais.
  if (isAuthenticated && isLoading) {
    return (
      <AdminShell centered>
        <Loader2 className="size-6 animate-spin text-amber-400" />
      </AdminShell>
    );
  }

  if (isAuthenticated && !isLoading && !isAdmin) {
    // Un compte non-admin qui atterrit ici : accès refusé clair.
    return (
    <AdminShell centered>
      <Card className="w-full max-w-md border-red-900/40">
          <CardHeader className="text-center">
            <Lock className="mx-auto mb-2 size-10 text-red-400" />
            <CardTitle className="text-xl text-red-300">Accès refusé</CardTitle>
            <CardDescription className="text-slate-400">
              Ce compte n'a pas les droits d'administration. Déconnectez-vous
              puis connectez-vous avec le compte administrateur.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="destructive" onClick={() => void signOut()}>
              Se déconnecter
            </Button>
            <Button variant="ghost" className="text-slate-300" onClick={() => navigate("/")}>
              Retour à l'application GTEC PRO
            </Button>
          </CardContent>
        </Card>
      </AdminShell>
    );
  }

  return <AdminSignIn />;
}

// ---------- Écran de connexion admin (application séparée) ----------

function AdminSignIn() {
  const [email, setEmail] = useState("etsgreentech@yahoo.com");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuthActions();

  const sendCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", email.trim().toLowerCase());
      await signIn("email-otp", fd);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec d'envoi du code.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", email.trim().toLowerCase());
      fd.set("code", code);
      await signIn("email-otp", fd);
      // L'affichage bascule sur la console via l'état d'auth du composant parent.
    } catch {
      setError("Code incorrect ou expiré.");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell centered>
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/80">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <img src={logo} alt="GTEC PRO" width={56} height={56} className="rounded-lg" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            <Lock className="size-4 text-amber-400" />
            Administration GTEC PRO
          </CardTitle>
          <CardDescription className="text-slate-400">
            Application de gestion interne — accès réservé
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === "email" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label className="text-slate-300">Email administrateur</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-500" />
                  <Input
                    className="border-slate-700 bg-slate-950/60 pl-9 text-slate-100 placeholder:text-slate-600"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="etsgreentech@yahoo.com"
                    type="email"
                    autoComplete="email"
                  />
                </div>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <Button
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                disabled={loading || !email.includes("@")}
              >
                {loading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 size-4" />
                )}
                Recevoir le code de connexion
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-center text-sm text-slate-400">
                Un code à 6 chiffres a été envoyé à{" "}
                <span className="font-medium text-slate-200">{email}</span>
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="border-slate-700 bg-slate-950/60 text-lg text-slate-100"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
              <Button
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                disabled={loading || code.length !== 6}
                onClick={() => void verifyCode()}
              >
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Se connecter
              </Button>
              <Button
                variant="ghost"
                className="text-slate-400"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
              >
                Changer d'email
                </Button>
            </div>
          )}
          <p className="text-center text-xs text-slate-500">
            Compte administrateur : <span className="text-slate-400">etsgreentech@yahoo.com</span>
            {" "}— le code est envoyé sur la boîte configurée dans l'environnement Freebuff.
          </p>
        </CardContent>
      </Card>
    </AdminShell>
  );
}

// ---------- Console admin (thème sombre distinct) ----------

function AdminConsole({ signOut }: { signOut: () => Promise<void> }) {
  const navigate = useNavigate();
  const stats = useQuery(api.adminApp.adminStatsLite);
  const users = useQuery(api.adminApp.adminUsers);
  const contracts = useQuery(api.adminApp.adminListContractsLite);
  const requests = useQuery(api.adminApp.adminListRequestsLite);
  const [tab, setTab] = useState<"stats" | "users" | "missions" | "contracts">("stats");

  const clientUsers = (users ?? []).filter((u) => u.role === "user" || u.accountType === "client");
  const techUsers = (users ?? []).filter((u) => u.accountType === "technicien");

  return (
    <AdminShell>
      <div className="flex flex-col gap-6">
        {/* En-tête console */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium tracking-wider text-amber-400/80 uppercase">
              <ShieldCheck className="size-3.5" />
              Application administration — accès interne
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold text-slate-100">
              Console GTEC PRO
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-slate-200"
              onClick={() => navigate("/dashboard")}
            >
              App métier
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={() => void signOut()}
            >
              Déconnexion
</Button>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Missions", value: stats?.missions ?? "—", icon: Wrench },
            { label: "En cours", value: stats?.openMissions ?? "—", icon: CalendarClock },
            { label: "Encaissé", value: stats ? fcfa(stats.revenue) : "—", icon: Wallet },
            { label: "Contrats actifs", value: stats?.activeContracts ?? "—", icon: FileSignature },
            { label: "Rémun. dues", value: stats ? fcfa(stats.pendingPayouts) : "—", icon: Wallet },
            { label: "Comptes", value: stats?.users ?? "—", icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-slate-800 bg-slate-900/70">
              <CardContent className="px-4 py-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
                  <Icon className="size-3.5 text-amber-400/80" />
                  {label}
                </p>
                <p className="font-display mt-1 truncate text-lg font-bold text-slate-100">
                  {value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Navigation interne */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["stats", "Vue d'ensemble"],
              ["users", "Comptes"],
              ["missions", "Missions"],
              ["contracts", "Contrats"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={tab === key ? "default" : "outline"}
              className={cn(
                tab === key
                  ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800",
              )}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Contenu */}
        {tab === "stats" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-200">Dernières missions</CardTitle>
                <CardDescription className="text-slate-500">
                  Les 8 demandes les plus récentes.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {(requests ?? []).slice(0, 8).map(({ request, clientName }) => (
                  <div
                    key={request._id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-200">
                        {request.reference} · {request.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {clientName} · {request.city}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                      {request.status}
                    </span>
                  </div>
                ))}
                {(requests ?? []).length === 0 && (
                  <p className="py-4 text-center text-sm text-slate-500">
                    Aucune mission pour le moment.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-200">Comptes récents</CardTitle>
                <CardDescription className="text-slate-500">
                  Les 8 derniers inscrits, clients et techniciens.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {(users ?? []).slice(0, 8).map((u) => (
                  <div
                    key={u._id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-200">{u.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {u.email ?? u.phone ?? "—"} · {u.city ?? "—"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                      {u.accountType === "technicien" ? "Technicien" : "Client"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "users" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminUserList title="Clients" users={clientUsers} icon={Building2} />
            <AdminUserList title="Techniciens" users={techUsers} icon={Wrench} />
          </div>
        )}

        {tab === "missions" && (
          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-200">Toutes les missions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(requests ?? []).map(({ request, clientName }) => (
                <div
                  key={request._id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-200">
                      {request.reference} · {request.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {clientName} · {request.city} · créé le {formatDate(request._creationTime)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                    {request.status}
                  </span>
                </div>
              ))}
              {(requests ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">
                  Aucune mission.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "contracts" && (
          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-200">Contrats de maintenance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(contracts ?? []).map(({ contract, clientName, visitsCount, doneVisits }) => {
                return (
                  <div
                    key={contract._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-200">
                        {contract.reference} · {contract.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {clientName} · {contractFrequencyLabel(contract.frequency)} ·{" "}
                        {fcfa(contract.monthlyAmount)} · jusqu'au {formatDate(contract.endDate)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {doneVisits}/{visitsCount} visites
                      </span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                        {contract.status}
                      </span>
                    </span>
                  </div>
                );
              })}
              {(contracts ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">
                  Aucun contrat. Créez-en depuis l'application métier (onglet Contrats).
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

function AdminUserList({
  title,
  users,
  icon: Icon,
}: {
  title: string;
  users: {
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
  }[];
  icon: typeof Building2;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
          <Icon className="size-4 text-amber-400/80" />
          {title} ({users.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {users.length === 0 && (
          <p className="py-3 text-center text-sm text-slate-500">Aucun compte.</p>
        )}
        {users.map((u) => (
          <div
            key={u._id}
            className="rounded-lg border border-slate-800 px-3 py-2 text-sm"
          >
            <p className="truncate font-medium text-slate-200">{u.name ?? "—"}</p>
            <p className="truncate text-xs text-slate-500">
              {u.email ?? u.phone ?? "—"}
              {u.city ? ` · ${u.city}` : ""}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Coquille visuelle séparée (thème sombre « salle de contrôle ») ----------

function AdminShell({
  children,
  centered = false,
}: {
  children: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(800px 400px at 20% -10%, rgba(245,158,11,0.10), transparent), radial-gradient(600px 300px at 90% 10%, rgba(16,185,129,0.08), transparent)",
        }}
      />
      <main
        className={cn(
          "relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-10",
          centered && "items-center justify-center",
        )}
      >
        {children}
      </main>
    </div>
  );
}
