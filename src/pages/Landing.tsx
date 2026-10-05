import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  FileText,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JOURNEY_STEPS, SERVICES } from "@/lib/gtec";

const STEP_DETAILS: Record<string, string> = {
  nouvelle: "Décrivez votre besoin en 2 minutes, photos à l'appui.",
  devis: "GTEC chiffre la prestation : prix clair, TVA incluse.",
  paiement: "MTN MoMo ou Orange Money, validé par GTEC.",
  affectation: "Un chef d'équipe et son équipe qualifiée sont assignés.",
  intervention: "L'équipe intervient à l'heure convenue.",
  rapport: "Travaux, matériel utilisé, photos avant/après.",
  reception: "Vous vérifiez puis signez le PV sur votre écran.",
  facture: "Facture officielle et garantie sur vos installations.",
};

const TECHNICIAN_PERKS = [
  "Profil vérifié et spécialités certifiées (CFO, solaire, CCTV…)",
  "Missions dans votre zone, selon vos disponibilités",
  "Rémunération selon les règles GTEC, paiement Mobile Money",
  "Planning, équipe et rapports gérés depuis l'application",
];

const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Buea", "Garoua"];

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub?: string;
}) {
  return (
    <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
        {kicker}
      </span>
      <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="text-pretty text-muted-foreground">{sub}</p>}
    </Reveal>
  );
}

// ---------- témoignages (avis réels de la base) ----------

function TestimonialsSection() {
  const reviews = useQuery(api.gtec.listPublicReviews);
  if (reviews === undefined || reviews.length === 0) return null;
  const serviceLabel = (key: string) =>
    SERVICES.find((s) => s.key === key)?.label ?? "";
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <SectionHeading
        kicker="Ils nous font confiance"
        title="Ce que disent nos clients"
        sub="Des avis laissés après des interventions réellement réceptionnées sur la plateforme."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r, i) => (
          <Reveal key={i} delay={i * 0.05}>
            <Card className="card-layered flex h-full flex-col gap-3 p-6">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={
                      s <= r.rating
                        ? "size-4 fill-amber-400 text-amber-400"
                        : "size-4 text-muted-foreground/30"
                    }
                  />
                ))}
              </div>
              {r.comment ? (
                <p className="text-pretty text-sm leading-6">
                  « {r.comment} »
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Intervention notée {r.rating}/5
                </p>
              )}
              <div className="mt-auto flex items-center gap-2.5 pt-1">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {r.displayName[0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.city, serviceLabel(r.serviceKey)].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- Navigation ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="GTEC PRO" className="size-9 rounded-lg" />
            <span className="font-display text-lg font-bold tracking-tight">
              GTEC <span className="text-primary">PRO</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#services" className="transition-colors hover:text-foreground">
              Services
            </a>
            <a href="#parcours" className="transition-colors hover:text-foreground">
              Comment ça marche
            </a>
            <a href="#techniciens" className="transition-colors hover:text-foreground">
              Techniciens
            </a>
            <a href="#couverture" className="transition-colors hover:text-foreground">
              Couverture
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">Se connecter</Link>
            </Button>
            <Button size="sm" className="halo-amber" asChild>
              <Link to="/auth?returnTo=%2Fdashboard">
                Créer un compte
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0" />
        <div className="absolute -top-32 left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex flex-col items-start gap-6"
          >
            <span className="flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
              <Zap className="size-3.5" />
              Énergie & bâtiment — Cameroun
            </span>
            <h1 className="font-display text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Vos installations,{" "}
              <span className="text-primary">gérées de A à Z.</span>
            </h1>
            <p className="max-w-xl text-pretty text-lg text-muted-foreground">
              Dépannage électrique, solaire, CCTV, climatisation : demandez,
              validez le devis, payez par Mobile Money et suivez l'équipe en
              temps réel. Du premier appel à la facture — au même endroit.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="halo-amber" asChild>
                <Link to="/dashboard/new">
                  <Sparkles className="mr-2 size-4" />
                  Demander une intervention
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth">Créer un compte</Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary" />
                Techniciens vérifiés
              </span>
              <span className="flex items-center gap-1.5">
                <Wallet className="size-4 text-primary" />
                Mobile Money sécurisé
              </span>
              <span className="flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-primary" />
                Garantie sur travaux
              </span>
            </div>
          </motion.div>

          {/* Aperçu produit */}
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
          >
            <Card className="card-layered halo-amber relative overflow-hidden">
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Zap className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">
                        Dépannage électrique
                      </p>
                      <p className="text-xs text-muted-foreground">
                        GTC-0001 · Bonamoussadi, Douala
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-600 ring-1 ring-inset ring-sky-500/20 dark:text-sky-400">
                    En intervention
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    Équipe affectée
                  </span>
                  <div className="flex -space-x-2">
                    {["J", "A", "S"].map((initial, i) => (
                      <span
                        key={i}
                        className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary/15 text-xs font-semibold text-primary"
                      >
                        {initial}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2.5">
                  {[
                    { icon: ClipboardCheck, label: "Rapport avec photos avant/après" },
                    { icon: FileText, label: "PV de réception signé sur mobile" },
                    { icon: Receipt, label: "Facture & garantie 6 mois" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2.5 text-sm">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Icon className="size-3.5" />
                      </span>
                      {label}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-3.5">
                  <span className="text-sm text-muted-foreground">
                    Devis validé
                  </span>
                  <span className="font-display text-lg font-bold text-primary">
                    87 500 FCFA
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Chiffres */}
        <div className="relative border-y border-border/60 bg-card/60">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/60 px-4 sm:px-6 lg:grid-cols-4">
            {[
              { value: "100 %", label: "Parcours tracé, devis à facture" },
              { value: "48 h", label: "Délai moyen d'intervention*" },
              { value: "2", label: "Solutions Mobile Money acceptées" },
              { value: "6 mois", label: "Garantie standard sur travaux" },
            ].map(({ value, label }, i) => (
              <Reveal key={label} delay={i * 0.06} className="px-4 py-6 text-center sm:py-8">
                <p className="font-display text-2xl font-bold text-primary sm:text-3xl">
                  {value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {label}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Services ---------- */}
      <section id="services" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          kicker="Pôles d'intervention"
          title="Un seul partenaire pour tous vos métiers"
          sub="Chaque demande est prise en charge par une équipe dont la spécialité correspond exactement à votre besoin."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.key} delay={i * 0.05}>
                <Card className="card-layered group h-full transition-all hover:-translate-y-1 hover:shadow-lg">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <p className="font-display text-lg font-semibold">
                      {s.label}
                    </p>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------- Parcours ---------- */}
      <section id="parcours" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading
            kicker="Comment ça marche"
            title="8 étapes, zéro zone d'ombre"
            sub="Chaque mission suit le pipeline GTEC PRO : vous savez toujours où en est votre dossier, et qui agit."
          />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY_STEPS.map((step, i) => (
              <Reveal key={step.key} delay={i * 0.05}>
                <div className="relative flex h-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-5">
                  <span className="font-display text-3xl font-bold text-primary/20">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="font-semibold">{step.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {STEP_DETAILS[step.key]}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-10 text-center" delay={0.2}>
            <Button size="lg" className="halo-amber" asChild>
              <Link to="/dashboard/new">
                Lancer ma demande
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ---------- Techniciens ---------- */}
      <section id="techniciens" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal className="flex flex-col items-start gap-5">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              Vous êtes technicien ?
            </span>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Rejoignez les équipes GTEC PRO
            </h2>
            <p className="text-pretty text-muted-foreground">
              GTEC réunit les meilleurs pros du bâtiment et de l'énergie au
              Cameroun. Inscrivez-vous, faites vérifier vos qualifications, et
              recevez des missions correspondant à vos spécialités.
            </p>
            <ul className="flex flex-col gap-2.5">
              {TECHNICIAN_PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2.5 text-sm">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  {perk}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button className="halo-amber" asChild>
                <Link to="/technician">
                  <Wrench className="mr-2 size-4" />
                  Postuler comme technicien
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <a href="tel:+237655094228">
                  <Phone className="mr-2 size-4" />
                  Parler à GTEC — 655 09 42 28
                </a>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <Card className="card-layered">
              <CardContent className="flex flex-col gap-4 p-6">
                <p className="text-sm font-semibold text-muted-foreground">
                  Composition d'équipe type
                </p>
                {[
                  { role: "Chef d'équipe", spec: "Électricité CFO/CATE", count: 1 },
                  { role: "Technicien", spec: "Électricité bâtiment", count: 2 },
                  { role: "Technicien", spec: "Solaire / onduleurs", count: 1 },
                ].map((row) => (
                  <div
                    key={row.role + row.spec}
                    className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                        {row.count}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{row.role}</p>
                        <p className="text-xs text-muted-foreground">{row.spec}</p>
                      </div>
                    </div>
                    <Users className="size-4 text-muted-foreground" />
                  </div>
                ))}
                <p className="flex items-center gap-2 rounded-lg bg-accent/60 px-3 py-2.5 text-xs text-accent-foreground">
                  <CalendarClock className="size-4 shrink-0" />
                  Le moteur d'affectation propose l'équipe selon compétence,
                  zone, disponibilité et taille du chantier — l'admin valide.
                </p>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </section>

      {/* ---------- Témoignages clients (avis réels) ---------- */}
      <TestimonialsSection />

      {/* ---------- Couverture ---------- */}
      <section id="couverture" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-16 text-center sm:px-6">
          <SectionHeading
            kicker="Couverture"
            title="Déjà actifs dans 5 villes"
            sub="Nous ouvrons de nouvelles villes au fur et à mesure du recrutement des équipes vérifiées."
          />
          <div className="flex flex-wrap justify-center gap-2.5">
            {CITIES.map((city, i) => (
              <Reveal key={city} delay={i * 0.05}>
                <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm">
                  <MapPin className="size-4 text-primary" />
                  {city}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA final ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card p-10 text-center sm:p-16">
            <div className="grid-bg absolute inset-0 opacity-60" />
            <div className="relative flex flex-col items-center gap-5">
              <img src={logo} alt="" className="size-14 rounded-2xl" />
              <h2 className="font-display text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Prêt à confier vos installations à GTEC PRO ?
              </h2>
              <p className="max-w-xl text-pretty text-muted-foreground">
                Créez votre compte en 30 secondes, décrivez votre besoin, et
                recevez votre devis rapidement.
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Button size="lg" className="halo-amber" asChild>
                  <Link to="/dashboard/new">
                    <Smartphone className="mr-2 size-4" />
                    Demander une intervention
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">Se connecter</Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="size-7 rounded-md" />
            <span className="font-display font-semibold text-foreground">
              GTEC <span className="text-primary">PRO</span>
            </span>
          </div>
          <p>© {new Date().getFullYear()} GTEC PRO — Cameroun. Tous droits réservés.</p>
          <p className="text-xs">
            Support client :{" "}
            <a
              href="tel:+237655094228"
              className="font-medium text-foreground transition-colors hover:text-primary"
            >
              655 09 42 28
            </a>{" "}
            · Électricité, solaire, CCTV, climatisation{" "}
            <span className="text-muted-foreground/50">·</span>{" "}
            <a
              href="/admin"
              className="text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              Espace administration
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
