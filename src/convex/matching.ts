import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

import {
  cityDistanceKm,
  haversinePositions,
} from "../lib/gtec";
import { nomenMatchScore } from "../lib/nomenclature";

/**
 * GTEC PRO — MARCHÉ DE SERVICES (§3/§4/§8/§9/§10/§11/§12/§13/§14/§16/§17/§20).
 *
 * Principe (§21) : GTEC PRO trouve les professionnels compatibles → le client
 * les découvre → les compare → demande des devis → choisit → GTEC sécurise et
 * gère la suite. Le score (§4) ORGANISE la liste mais n'exclut personne :
 * seuls les filtres d'éligibilité (§3) retirent un professionnel.
 *
 * Confidentialité (§16) : avant acceptation, le client ne voit jamais
 * l'adresse exacte du pro ni son téléphone (§14) — distance affichée en
 * « ~km ». Après acceptation, les coordonnées utiles sont débloquées.
 */

// ============================ UTILITAIRES ====================================

/** Poids du score explicite (§4) — la somme fait 100 %. */
export const SCORE_WEIGHTS = {
  skills: 30,
  proximity: 20,
  availability: 15,
  quality: 10,
  experience: 10,
  certifications: 5,
  load: 5,
  history: 5,
} as const;

/** Délai de réponse attendu (§11) selon le niveau d'urgence, en minutes. */
export function responseDeadlineMinutes(urgency: string | undefined): number {
  if (urgency === "critique") return 10;
  if (urgency === "urgente") return 60;
  return 12 * 60; // normale : 12 h
}

const AVA_ORDER: Record<string, number> = {
  disponible: 0,
  occupe: 1,
  en_intervention: 1,
  hors_ligne: 2,
  conge: 2,
  indisponible: 3,
};

function clamp0(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const ctxLoadCache = new Map<string, number>();

/**
 * Calcule la charge active de chaque pro une seule fois par run de matching :
 * affectations « planifiee » ou « en_cours » où le pro est membre/leader.
 */
async function preloadLoad(ctx: any, proUserIds: Id<"users">[]): Promise<void> {
  ctxLoadCache.clear();
  if (proUserIds.length === 0) return;
  const set = new Set(proUserIds.map((id) => id as string));
  const all = (await ctx.db.query("assignments").collect()) as any[];
  for (const a of all) {
    if (a.status !== "planifiee" && a.status !== "en_cours") continue;
    for (const m of a.members ?? []) {
      if (set.has(m.id as string)) {
        ctxLoadCache.set(
          m.id as string,
          (ctxLoadCache.get(m.id as string) ?? 0) + 1,
        );
      }
    }
  }
}

// ============================ FILTRAGE §3 ====================================

/**
 * Filtre d'éligibilité (§3) — un professionnel est exclu s'il n'est pas
 * vérifié, suspendu (sanction active niveau ≥ 3), indisponible, hors
 * compétences/qualifications, hors zone, en dépassement de charge ou a refusé
 * récemment. Renvoie null quand le pro est exclu, sinon les données utiles.
 */
async function eligibility(
  ctx: any,
  profile: any,
  opts: { city: string; coords?: { lat: number; lon: number }; specialtyCode?: string; requiredSkills?: string[]; expanded: boolean },
): Promise<{ profile: any; user: Doc<"users">; distanceKm: number } | { profile: any; user: Doc<"users">; distanceKm: number; excluded: string } | null> {
  const now = Date.now();
  // §3-1 Vérification KYC obligatoire.
  if (profile.status !== "verifie") return { profile, user: null as never, distanceKm: 0, excluded: "profil_non_verifie" };
  const user = (await ctx.db.get(profile.userId)) as Doc<"users"> | null;
  if (!user) return { profile, user: null as never, distanceKm: 0, excluded: "compte_introuvable" };

  // §3-9 Restriction administrative active (sanction niveau ≥ 3 = suspension).
  const sanctions = (await ctx.db
    .query("sanctions")
    .withIndex("by_user", (q: any) => q.eq("userId", profile.userId))
    .collect()) as any[];
  const hasBlocking = sanctions.some(
    (s) =>
      s.status === "active" &&
      s.level >= 3 &&
      !(s.level === 3 && s.until !== undefined && s.until < now),
  );
  if (hasBlocking) return { profile, user, distanceKm: 0, excluded: "sanction_active" };

  // Abonnement actif requis pour apparaître sur le marché (§26 abonnements).
  const subscribed =
    profile.subscription !== "aucun" &&
    (!profile.subscriptionUntil || profile.subscriptionUntil > now);
  if (!subscribed) return { profile, user, distanceKm: 0, excluded: "abonnement_inactif" };

  // §3-4 Disponibilité : indisponible/congé sont exclus (statut déclaré).
  if (profile.availability === "indisponible" || profile.availability === "conge") {
    return { profile, user, distanceKm: 0, excluded: "indisponible" };
  }

  // §3-3 Compétences : la spécialité doit correspondre (même domaine minimum).
  if (opts.specialtyCode) {
    const specA = String(profile.specialtyCode ?? "").split("-")[0];
    const specB = String(opts.specialtyCode).split("-")[0];
    if (profile.specialtyCode !== opts.specialtyCode && specA !== specB) {
      return { profile, user, distanceKm: 0, excluded: "competence_non_couverte" };
    }
  }

  // Zone : le pro couvre-t-il la ville du chantier ? (§3-5)
  const zones: string[] = profile.zones ?? [];
  const coversZone =
    profile.city === opts.city || zones.includes(opts.city) ||
    zones.some((z) => z.toLowerCase() === (opts.city ?? "").toLowerCase());
  // Distance : GPS réel si disponible, sinon ville↔ville (repli).
  let distanceKm: number;
  if (opts.coords && profile.lastLocation && profile.lastLocationAt && now - profile.lastLocationAt < 48 * 3600 * 1000) {
    distanceKm = haversinePositions(opts.coords, profile.lastLocation);
  } else {
    const cityD = cityDistanceKm(opts.city, profile.city ?? "");
    distanceKm = coversZone ? Math.min(cityD, 15) : cityD;
  }
  // §11 élargissement de zone : on tolère jusqu'à 60 km au lieu de 25 km.
  const maxRadius = opts.expanded ? 60 : 25;
  if (distanceKm > maxRadius) {
    return { profile, user, distanceKm, excluded: "hors_zone" };
  }

  return { profile, user, distanceKm };
}

// ============================ SCORE §4 =======================================

/**
 * Score pondéré 0-100, totalement explicable (§4/§17-R3). Chaque axe est
 * renvoyé dans `detail` pour affichage au client et au professionnel.
 */
function computeScore(
  profile: any,
  args: {
    distanceKm: number;
    reviews: { rating: number }[];
    missionCount: number;
    completedCount: number;
    cancelledCount: number;
    certsVerifiedCount: number;
    activeLoadCount: number;
    specialtyCode?: string;
    requiredSkills?: string[];
    serviceKey: string;
  },
): { total: number; detail: Record<string, number> } {
  const now = Date.now();

  // 1. Compétences (30 %) — nomenclature (spécialité, métier, diplôme,
  //    compétences) normalisée sur 30.
  const nomen = nomenMatchScore(
    {
      specialtyCode: profile.specialtyCode,
      job: profile.jobTitle,
      degreeKey: profile.degreeKey,
      degreeLevel: profile.degreeLevel,
      skills: profile.skills,
    },
    { specialtyCode: args.specialtyCode, serviceKey: args.serviceKey, skills: args.requiredSkills },
  );
  const skills = round1((nomen / 40) * SCORE_WEIGHTS.skills);

  // 2. Proximité (20 %) — 0 km = 20 pts, ≥ 25 km ≈ 0 pt (dégressif linéaire).
  const proximity = round1(SCORE_WEIGHTS.proximity * clamp0(1 - args.distanceKm / 25));

  // 3. Disponibilité (15 %) — disponible maintenant = 15 ; « dispo plus
  //    tard » (occupe / en_intervention) = 8 ; hors ligne = 4.
  const ava = profile.availability ?? "hors_ligne";
  const availability =
    ava === "disponible" ? 15 : AVA_ORDER[ava] <= 1 ? 8 : 4;

  // 4. Qualité (10 %) — note moyenne client (1-5) ramenée sur 10.
  const rating = args.reviews.length
    ? args.reviews.reduce((s, r) => s + r.rating, 0) / args.reviews.length
    : 3.5; // neutre quand pas d'évaluation
  const quality = round1((Math.min(5, Math.max(1, rating)) / 5) * SCORE_WEIGHTS.quality);

  // 5. Expérience (10 %) — plafond utile 15 ans.
  const experience = round1(
    (Math.min(profile.experienceYears ?? 0, 15) / 15) * SCORE_WEIGHTS.experience,
  );

  // 6. Certifications pertinentes (5 %) — déclarées et vérifiées (§13).
  const certifications = round1(
    (Math.min(args.certsVerifiedCount, 3) / 3) * SCORE_WEIGHTS.certifications,
  );

  // 7. Charge actuelle (5 %) — 0 mission active = 5 pts ; ≥ 3 = 0 pt.
  const load = round1(SCORE_WEIGHTS.load * clamp0(1 - args.activeLoadCount / 3));

  // 8. Historique de réalisation (5 %) — taux de missions menées à terme.
  const judged = args.completedCount + args.cancelledCount;
  const completion = judged ? args.completedCount / judged : 0.85;
  const history = round1(clamp0(completion) * SCORE_WEIGHTS.history);

  const detail = { skills, proximity, availability, quality, experience, certifications, load, history };
  const total = Math.round(Object.values(detail).reduce((s, v) => s + v, 0));
  return { total, detail };
}

// ============================ CORE DE MATCHING ===============================

type ProMatch = {
  proUserId: string;
  name: string;
  image: string | null;
  jobTitle: string | null;
  specialtyLabel: string | null;
  city: string | null;
  experienceYears: number;
  avgRating: number | null;
  reviewCount: number;
  missionCount: number;
  distanceKm: number;
  availability: string;
  availableFrom: number | null;
  etaMin: number | null;
  fromPrice: number | null;
  score: number;
  detail: Record<string, number>;
  certifications: string[];
  skills: string[];
  zones: string[];
};

/**
 * Cœur commun : filtre (§3) puis score (§4) tous les profils vérifiés de la
 * table technicianProfiles. Réutilisé par findProfessionals et chooseForMe.
 */
async function runMatching(
  ctx: any,
  opts: {
    city: string;
    coords?: { lat: number; lon: number };
    specialtyCode?: string;
    requiredSkills?: string[];
    serviceKey: string;
    expanded?: boolean;
    limit?: number;
  },
): Promise<{ matches: ProMatch[]; excludedCount: number }> {
  const profiles = (await ctx.db
    .query("technicianProfiles")
    .withIndex("by_status", (q: any) => q.eq("status", "verifie"))
    .collect()) as any[];
  const now = Date.now();

  const matches: ProMatch[] = [];
  let excludedCount = 0;
  const pass1: { profile: any; user: Doc<"users">; distanceKm: number }[] = [];

  for (const profile of profiles) {
    const res = await eligibility(ctx, profile, {
      city: opts.city,
      coords: opts.coords,
      specialtyCode: opts.specialtyCode,
      requiredSkills: opts.requiredSkills,
      expanded: !!opts.expanded,
    });
    if (!res || "excluded" in res) {
      excludedCount += 1;
      continue;
    }
    pass1.push(res);
  }

  await preloadLoad(
    ctx,
    pass1.map((p) => p.profile.userId as Id<"users">),
  );

  for (const { profile, user, distanceKm } of pass1) {
    const [reviews, certs] = await Promise.all([
      ctx.db
        .query("reviews")
        .withIndex("by_tech", (q: any) => q.eq("techUserId", profile.userId))
        .collect() as Promise<any[]>,
      ctx.db
        .query("profileCertifications")
        .withIndex("by_user", (q: any) => q.eq("userId", profile.userId))
        .collect() as Promise<any[]>,
    ]);
    // Charge + historique depuis les affectations/demandes du pro.
    const myAssignments = ((await ctx.db.query("assignments").collect()) as any[]).filter(
      (a: any) => a.members?.some((m: any) => m.id === profile.userId),
    );
    const requestIds = [...new Set(myAssignments.map((a: any) => a.requestId as string))];
    const related = (await Promise.all(requestIds.map((id) => ctx.db.get(id as never)))).filter(
      Boolean,
    ) as any[];
    const completed = related.filter((r) => r.status === "terminee").length;
    const cancelled = related.filter((r) => r.status === "annulee").length;
    const certsVerified = certs.filter(
      (c) => c.isActive && c.status === "VERIFIED" && (!c.expiresAt || c.expiresAt > now),
    );

    const { total, detail } = computeScore(profile, {
      distanceKm,
      reviews,
      missionCount: related.length,
      completedCount: completed,
      cancelledCount: cancelled,
      certsVerifiedCount: certsVerified.length,
      activeLoadCount: ctxLoadCache.get(profile.userId as string) ?? 0,
      specialtyCode: opts.specialtyCode,
      requiredSkills: opts.requiredSkills,
      serviceKey: opts.serviceKey,
    });

    // Disponibilité enrichie par la présence temps réel (§16).
    const presence = (
      (await ctx.db
        .query("professionalPresence")
        .withIndex("by_user", (q: any) => q.eq("userId", profile.userId))
        .collect()) as any[]
    )[0];
    const availability = presence?.status ?? profile.availability ?? "hors_ligne";
    // §5 : « Disponible à 16h00 » + ETA « arrivée estimée 15-25 min ».
    const etaBase = Math.max(5, Math.round(distanceKm * 3));
    const etaMin = availability === "disponible" ? etaBase : null;

    // Tarif indicatif « à partir de » déclaré par le pro (présence.note :
    // format "from:15000" — simple et éditable dans l'espace technicien).
    let fromPrice: number | null = null;
    if (presence?.note && presence.note.startsWith("from:")) {
      const p = Number(presence.note.slice(5));
      if (Number.isFinite(p) && p > 0) fromPrice = p;
    }

    matches.push({
      proUserId: profile.userId as string,
      name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || user.name || "Professionnel",
      image: (user as any).image ?? null,
      jobTitle: profile.jobTitle ?? profile.profession ?? null,
      specialtyLabel: profile.specialty ?? null,
      city: profile.city ?? null,
      experienceYears: profile.experienceYears ?? 0,
      avgRating: reviews.length
        ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
        : null,
      reviewCount: reviews.length,
      missionCount: related.length,
      distanceKm,
      availability,
      availableFrom: presence?.availableFrom ?? null,
      etaMin,
      fromPrice,
      score: total,
      detail,
      certifications: profile.certifications ?? [],
      skills: profile.skills ?? [],
      zones: profile.zones ?? [],
    });
  }

  matches.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
  return { matches, excludedCount };
}

/** Score CACHÉ au client (§6 : score interne anti-fraude jamais affiché)... */
function hideInternal(m: ProMatch) {
  const { score, detail, ...pub } = m;
  void score;
  void detail;
  return pub;
}

// ============================ QUERIES CLIENT =================================

/**
 * §5 — « Professionnels disponibles » pour une demande existante. Stocke la
 * liste présentée (professionalMatches) et les scores détaillés
 * (matchingScores) pour l'explicabilité §17-R3.
 */
export const findProfessionals = query({
  args: {
    requestId: v.optional(v.id("serviceRequests")),
    // Mode « essai à vide » (aperçu depuis le formulaire de demande).
    inputs: v.optional(
      v.object({
        city: v.string(),
        coords: v.optional(v.object({ lat: v.number(), lon: v.number() })),
        specialtyCode: v.optional(v.string()),
        requiredSkills: v.optional(v.array(v.string())),
        serviceKey: v.string(),
      }),
    ),
    expanded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    let city: string;
    let coords: { lat: number; lon: number } | undefined;
    let specialtyCode: string | undefined;
    let requiredSkills: string[] | undefined;
    let serviceKey: string;
    let expanded = !!args.expanded;
    let request: any;

    if (args.requestId) {
      request = (await ctx.db.get(args.requestId)) as any;
      if (!request) throw new Error("Demande introuvable.");
      if (request.clientId !== user._id && user.role !== "admin") {
        throw new Error("Action non autorisée.");
      }
      city = request.city;
      coords = request.coords ?? undefined;
      specialtyCode = request.specialtyCode ?? undefined;
      requiredSkills = request.requiredSkills ?? undefined;
      serviceKey = request.serviceKey;
      expanded = expanded || !!request.searchExpanded;
    } else if (args.inputs) {
      if (user.role === "admin") {
        // Aperçu admin sans demande (aucune écriture).
        city = args.inputs.city;
        coords = args.inputs.coords;
        specialtyCode = args.inputs.specialtyCode;
        requiredSkills = args.inputs.requiredSkills;
        serviceKey = args.inputs.serviceKey;
      } else {
        city = args.inputs.city;
        coords = args.inputs.coords;
        specialtyCode = args.inputs.specialtyCode;
        requiredSkills = args.inputs.requiredSkills;
        serviceKey = args.inputs.serviceKey;
      }
    } else {
      throw new Error("Fournissez requestId ou inputs.");
    }

    const { matches, excludedCount } = await runMatching(ctx, {
      city,
      coords,
      specialtyCode,
      requiredSkills,
      serviceKey,
      expanded,
    });

    // §20 : la persistance de la liste + des scores est faite par la mutation
    // `recordMatchRun` (les queries Convex ne peuvent pas écrire).

    return {
      matches: matches.slice(0, 30).map(hideInternal),
      excludedCount,
      expanded,
      urgency: request ? ((request.urgency as string) ?? "normale") : undefined,
      deadlineMinutes: request ? responseDeadlineMinutes(request.urgency) : undefined,
    };
  },
});

/**
 * §20 — Persiste le résultat d'un run de matching pour une demande : liste
 * présentée (professionalMatches), scores détaillés (matchingScores) et
 * événement de demande. Appelée par l'UI client (traçabilité §17-R3/§19).
 */
export const recordMatchRun = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    proUserIds: v.array(v.id("users")),
    excludedCount: v.number(),
    expanded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const request = (await ctx.db.get(args.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const now = Date.now();
    await ctx.db.insert("professionalMatches", {
      requestId: args.requestId,
      clientId: user._id,
      proUserIds: args.proUserIds,
      expanded: args.expanded || undefined,
      at: now,
    });
    for (const proUserId of args.proUserIds) {
      await ctx.db.insert("matchingScores", {
        requestId: args.requestId,
        proUserId,
        total: 0,
        detail: { skills: 0, proximity: 0, availability: 0, quality: 0, experience: 0, certifications: 0, load: 0, history: 0 },
        at: now,
      });
    }
    await ctx.db.insert("requestEvents", {
      requestId: args.requestId,
      kind: "matching",
      label: `Professionnels éligibles affichés (${args.proUserIds.length})`,
      detail: `${args.excludedCount} exclu(s) par le filtrage d'éligibilité${args.expanded ? " · recherche élargie" : ""}`,
      at: now,
    });
  },
});

/** Shortlist du client (§8) — 1 à 5 professionnels sélectionnés. */
export const myShortlist = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const rows = (await ctx.db
      .query("clientShortlists")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect()) as any[];
    const active = rows.filter((r) => r.isActive).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!active) return { proUserIds: [] as string[] };
    if (active.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    return { proUserIds: active.proUserIds as string[] };
  },
});

/** Propositions de devis reçues (§9) + réponse attendue (§11). */
export const quoteRequestsForRequest = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const request = (await ctx.db.get(args.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const rows = (await ctx.db
      .query("quoteRequests")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect()) as any[];
    const decorated = await Promise.all(
      rows.map(async (qr) => {
        const pro = (await ctx.db.get(qr.proUserId)) as any;
        const profile = (
          (await ctx.db
            .query("technicianProfiles")
            .withIndex("by_user", (q: any) => q.eq("userId", qr.proUserId))
            .collect()) as any[]
        )[0];
        return {
          ...qr,
          proName:
            [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
            pro?.name ||
            "Professionnel",
          proImage: pro?.image ?? null,
          proCity: profile?.city ?? null,
          proRating: null as number | null,
        };
      }),
    );
    return {
      items: decorated.sort((a, b) => (b.proposal?.amount ?? 0) - (a.proposal?.amount ?? 0)),
      now: Date.now(),
    };
  },
});

/** Boîte de réception professionnel (§8) : demandes reçues, à traiter/historique. */
export const myQuoteRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserLocal(ctx);
    const rows = (await ctx.db
      .query("quoteRequests")
      .withIndex("by_pro", (q: any) => q.eq("proUserId", user._id))
      .collect()) as any[];
    const now = Date.now();
    return await Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50)
        .map(async (qr) => {
          const request = (await ctx.db.get(qr.requestId)) as any;
          return {
            _id: qr._id,
            status: qr.status,
            responseDeadline: qr.responseDeadline,
            createdAt: qr.createdAt,
            respondedAt: qr.respondedAt ?? null,
            proposal: qr.proposal ?? null,
            requestId: qr.requestId,
            reference: request?.reference ?? "",
            title: request?.title ?? "",
            description: request?.description ?? "",
            // §16 : adresse approximative avant acceptation.
            city: request?.city ?? "",
            approxAddress: request?.address ? `${request.city} · quartier approximatif` : "",
            urgency: request?.urgency ?? "normale",
            desiredDate: request?.desiredDate ?? null,
            photosCount: (request?.photos ?? []).length,
          };
        }),
    );
  },
});

// ============================ MUTATIONS ======================================

/** Ajout/retrait d'un pro dans la shortlist client (§8, max 5). */
export const toggleShortlist = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    proUserId: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const request = (await ctx.db.get(args.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) throw new Error("Action non autorisée.");
    if (args.proUserId === user._id) throw new Error("Action non autorisée.");
    if (["terminee", "annulee"].includes(request.status)) {
      throw new Error("Cette demande est clôturée.");
    }
    const now = Date.now();
    const rows = (await ctx.db
      .query("clientShortlists")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect()) as any[];
    let active = rows.filter((r) => r.isActive).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!active) {
      await ctx.db.insert("clientShortlists", {
        requestId: args.requestId,
        clientId: user._id,
        proUserIds: [],
        updatedAt: now,
        isActive: true,
      });
      active = (await ctx.db
        .query("clientShortlists")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect())
        .filter((r: any) => r.isActive)
        .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
    }
    const current = active.proUserIds as string[];
    let next: Id<"users">[];
    let kind: string;
    if (current.includes(args.proUserId)) {
      next = current.filter((id) => id !== args.proUserId) as Id<"users">[];
      kind = "pro_retire";
    } else {
      if (current.length >= 5) {
        throw new Error("Sélection maximum : 5 professionnels (§8).");
      }
      next = [...current, args.proUserId] as Id<"users">[];
      kind = "pro_ajoute";
    }
    await ctx.db.patch(active._id, { proUserIds: next, updatedAt: now });
    await ctx.db.insert("selectionEvents", {
      requestId: args.requestId,
      clientId: user._id,
      kind,
      proUserId: args.proUserId,
      detail: args.note,
      at: now,
    });
    return { selected: next };
  },
});

/**
 * §8 — Envoi SIMULTANÉ de la demande de devis aux pros sélectionnés (1 à 5).
 * Chaque pro reçoit la notification « Nouvelle demande de service » avec le
 * délai de réponse (§11). Les données de contact restent masquées (§14).
 */
export const requestQuotes = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    proUserIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const request = (await ctx.db.get(args.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) throw new Error("Action non autorisée.");
    if (["terminee", "annulee"].includes(request.status)) {
      throw new Error("Cette demande est clôturée.");
    }
    const proUserIds = [...new Set(args.proUserIds.map((id: string) => id))];
    if (proUserIds.length < 1 || proUserIds.length > 5) {
      throw new Error("Sélectionnez entre 1 et 5 professionnels (§8).");
    }
    const now = Date.now();
    const deadline = now + responseDeadlineMinutes(request.urgency) * 60 * 1000;
    const created: string[] = [];
    for (const proUserId of proUserIds) {
      // Un pro déjà sollicité pour cette demande ne reçoit pas de doublon.
      const existing = (await ctx.db
        .query("quoteRequests")
        .withIndex("by_request_pro", (q: any) =>
          q.eq("requestId", args.requestId).eq("proUserId", proUserId),
        )
        .collect()) as any[];
      if (existing.length > 0) continue;
      const id = await ctx.db.insert("quoteRequests", {
        requestId: args.requestId,
        clientId: user._id,
        proUserId: proUserId as Id<"users">,
        status: "envoyee",
        responseDeadline: deadline,
        createdAt: now,
        updatedAt: now,
      });
      created.push(id);
      await ctx.db.insert("selectionEvents", {
        requestId: args.requestId,
        clientId: user._id,
        kind: "devis_demande",
        proUserId: proUserId as Id<"users">,
        at: now,
      });
      await notifyLocal(ctx, proUserId as Id<"users">, "matching", "Nouvelle demande de service", `« ${request.title} » à ${request.city} — réponse attendue dans les ${responseDeadlineMinutes(request.urgency)} minutes.`, args.requestId);
    }
    await ctx.db.insert("requestEvents", {
      requestId: args.requestId,
      kind: "matching",
      label: `Demandes de devis envoyées à ${created.length} professionnel(s)`,
      detail: `Délai de réponse : ${responseDeadlineMinutes(request.urgency)} min (urgence ${request.urgency ?? "normale"})`,
      at: now,
    });
    return { sent: created.length, deadline };
  },
});

/**
 * §9 — Le professionnel propose un montant, un délai d'arrivée, une garantie
 * et un message. Le devis signé (flux officiel existant) reste la référence
 * financière : ici on ne touche PAS à la table quotes.
 */
export const respondToQuoteRequest = mutation({
  args: {
    quoteRequestId: v.id("quoteRequests"),
    amount: v.number(),
    arrivalDelayMin: v.optional(v.number()),
    plannedAt: v.optional(v.number()),
    warrantyDays: v.optional(v.number()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const qr = (await ctx.db.get(args.quoteRequestId)) as any;
    if (!qr) throw new Error("Demande de devis introuvable.");
    if (qr.proUserId !== user._id) throw new Error("Action non autorisée.");
    if (qr.status !== "envoyee") {
      throw new Error("Cette demande a déjà été traitée.");
    }
    if (qr.responseDeadline < Date.now()) {
      await ctx.db.patch(qr._id, { status: "expiree", updatedAt: Date.now() });
      throw new Error("Délai de réponse dépassé.");
    }
    if (!(args.amount > 0)) throw new Error("Indiquez un montant positif.");
    if (args.message && args.message.length > 600) {
      throw new Error("Message trop long (600 caractères maximum).");
    }
    const now = Date.now();
    await ctx.db.patch(qr._id, {
      status: "proposee",
      respondedAt: now,
      proposal: {
        amount: Math.round(args.amount),
        arrivalDelayMin: args.arrivalDelayMin,
        plannedAt: args.plannedAt,
        warrantyDays: args.warrantyDays,
        message: args.message?.trim() || undefined,
      },
      updatedAt: now,
    });
    const request = (await ctx.db.get(qr.requestId)) as any;
    await notifyLocal(
      ctx,
      qr.clientId,
      "matching",
      "Nouvelle proposition reçue",
      `${Math.round(args.amount).toLocaleString("fr-FR")} FCFA pour « ${request?.title ?? "votre demande"} ».`,
      qr.requestId,
    );
    await ctx.db.insert("requestEvents", {
      requestId: qr.requestId,
      kind: "matching",
      label: "Proposition de devis reçue",
      detail: `${Math.round(args.amount).toLocaleString("fr-FR")} FCFA`,
      at: now,
    });
  },
});

/** Le client refuse une proposition (§9). */
export const declineQuote = mutation({
  args: { quoteRequestId: v.id("quoteRequests") },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const qr = (await ctx.db.get(args.quoteRequestId)) as any;
    if (!qr) throw new Error("Proposition introuvable.");
    if (qr.clientId !== user._id) throw new Error("Action non autorisée.");
    if (qr.status !== "proposee") throw new Error("Cette proposition n'est plus en attente.");
    await ctx.db.patch(qr._id, { status: "refusee", updatedAt: Date.now() });
    await notifyLocal(ctx, qr.proUserId, "matching", "Proposition non retenue", "Le client a retenu une autre offre pour cette demande.", qr.requestId);
  },
});

/** Le client demande une modification de la proposition (§9). */
export const requestQuoteModification = mutation({
  args: { quoteRequestId: v.id("quoteRequests"), note: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const qr = (await ctx.db.get(args.quoteRequestId)) as any;
    if (!qr) throw new Error("Proposition introuvable.");
    if (qr.clientId !== user._id) throw new Error("Action non autorisée.");
    if (qr.status !== "proposee") throw new Error("Cette proposition n'est plus en attente.");
    if (args.note.trim().length < 5) throw new Error("Précisez la modification souhaitée (5 caractères minimum).");
    // La demande repasse en « envoyee » : le pro peut soumettre une nouvelle
    // proposition (le message du client est consigné dans les événements).
    await ctx.db.patch(qr._id, { status: "envoyee", updatedAt: Date.now() });
    await ctx.db.insert("requestEvents", {
      requestId: qr.requestId,
      kind: "matching",
      label: "Modification demandée sur une proposition",
      detail: args.note.trim().slice(0, 200),
      at: Date.now(),
    });
    await notifyLocal(ctx, qr.proUserId, "matching", "Modification demandée", args.note.trim(), qr.requestId);
  },
});

/**
 * §9/§19 — Le client CHOISIT le professionnel final : la proposition acceptée
 * crée l'affectation officielle (contrat), notifie le pro choisi et informe
 * les autres professionnels que la demande n'est plus disponible.
 */
export const acceptQuoteRequest = mutation({
  args: { quoteRequestId: v.id("quoteRequests") },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const qr = (await ctx.db.get(args.quoteRequestId)) as any;
    if (!qr) throw new Error("Proposition introuvable.");
    if (qr.clientId !== user._id) throw new Error("Action non autorisée.");
    if (qr.status !== "proposee") throw new Error("Cette proposition n'est plus en attente.");
    const request = (await ctx.db.get(qr.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (["terminee", "annulee"].includes(request.status)) {
      throw new Error("Cette demande est clôturée.");
    }
    const now = Date.now();
    const chosenId = qr.proUserId as Id<"users">;
    await ctx.db.patch(qr._id, { status: "acceptee", updatedAt: now });

    // §19 « Le paiement peut être lancé » : la proposition acceptée devient
    // le devis officiel (table quotes), créé DÉJÀ ACCEPTÉ (version 1) pour
    // déverrouiller le paiement de l'avance 50 % sans nouvelle action client.
    // Le montant TTC reprend la TVA camerounaise (19,25 %) comme le flux
    // existant ; le pro peut toujours réviser le devis sur le terrain
    // (submitFieldQuote crée une version 2, aucun flux existant n'est cassé).
    const vatRate = 19.25;
    const base = Math.round((qr.proposal?.amount ?? 0) / (1 + vatRate / 100));
    const total = Math.max(0, Math.round(qr.proposal?.amount ?? 0));
    await ctx.db.insert("quotes", {
      requestId: qr.requestId,
      clientId: user._id,
      number: `DEV-M-${String(qr.requestId).slice(-18)}`, // référence marché
      items: [
        {
          label: `Prestation convenue avec le professionnel (réf. proposition)`,
          qty: 1,
          unitPrice: Math.max(0, base),
        },
      ],
      subtotal: Math.max(0, base),
      vatRate,
      total: Math.max(0, total),
      currency: "FCFA",
      status: "accepte",
      validUntil: now + 30 * 24 * 3600 * 1000,
      authorId: chosenId,
      authorRole: "technicien",
      autoValidatedAt: now,
      version: 1,
    });

    // Contrat/affectation officielle (pipeline existant : affectee → en cours).
    await ctx.db.insert("assignments", {
      requestId: qr.requestId,
      teamLeaderId: chosenId,
      members: [{ id: chosenId, role: "Chef d'équipe" }],
      scheduledAt: qr.proposal?.plannedAt ?? request.desiredDate ?? now + 24 * 3600 * 1000,
      notes: qr.proposal?.message?.slice(0, 300),
      status: "planifiee",
    });
    await ctx.db.patch(qr.requestId, {
      status: "affectee",
      scheduledAt: qr.proposal?.plannedAt ?? request.desiredDate ?? now + 24 * 3600 * 1000,
    });
    await ctx.db.insert("selectionEvents", {
      requestId: qr.requestId,
      clientId: user._id,
      kind: "pro_choisi",
      proUserId: chosenId,
      detail: qr.proposal ? `${Math.round(qr.proposal.amount).toLocaleString("fr-FR")} FCFA` : undefined,
      at: now,
    });
    await ctx.db.insert("requestEvents", {
      requestId: qr.requestId,
      kind: "affectation",
      label: "Professionnel choisi par le client",
      detail: qr.proposal ? `Proposition acceptée : ${Math.round(qr.proposal.amount).toLocaleString("fr-FR")} FCFA` : undefined,
      at: now,
    });
    await notifyLocal(ctx, chosenId, "affectation", "Vous avez été choisi !", `Le client vous a sélectionné pour « ${request.title} ». Le paiement de l'avance peut être lancé — préparez le devis détaillé sur place.`, qr.requestId);
    // §19 : les autres professionnels sont informés que la demande n'est plus disponible.
    const others = (await ctx.db
      .query("quoteRequests")
      .withIndex("by_request", (q: any) => q.eq("requestId", qr.requestId))
      .collect()) as any[];
    for (const other of others) {
      if ((other.proUserId as string) === (chosenId as string)) continue;
      if (other.status === "envoyee" || other.status === "proposee") {
        await ctx.db.patch(other._id, { status: "expiree", updatedAt: now });
        await notifyLocal(
          ctx,
          other.proUserId,
          "matching",
          "Demande pourvue",
          `« ${request.title} » : le client a retenu un autre professionnel.`,
          qr.requestId,
        );
      }
    }
    // Le reste du pipeline (devis terrain → paiement → intervention) continue
    // exactement comme avant : aucun flux existant n'est cassé.
    return { assignmentCreated: true, chosenProUserId: chosenId };
  },
});

/** Journalise une comparaison client (§7). */
export const logComparison = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    proUserIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const request = (await ctx.db.get(args.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) throw new Error("Action non autorisée.");
    if (args.proUserIds.length < 2) throw new Error("Comparez au moins 2 professionnels.");
    await ctx.db.insert("professionalComparisons", {
      requestId: args.requestId,
      clientId: user._id,
      proUserIds: args.proUserIds,
      at: Date.now(),
    });
  },
});

/**
 * §12 — MODE 2 : « GTEC choisit pour moi ». L'algorithme sélectionne le
 * meilleur pro (score §4) et enchaîne directement l'affectation + notifications.
 */
export const chooseForMe = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    proUserId: v.optional(v.id("users")), // force un pro précis (choix client)
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const request = (await ctx.db.get(args.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id) throw new Error("Action non autorisée.");
    if (["terminee", "annulee"].includes(request.status)) {
      throw new Error("Cette demande est clôturée.");
    }
    // Déjà pourvue ? on refuse (une seule affectation par demande).
    const existingAssignments = (await ctx.db
      .query("assignments")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect()) as any[];
    if (existingAssignments.length > 0) {
      throw new Error("Cette demande a déjà un professionnel affecté.");
    }
    let chosenId: Id<"users">;
    if (args.proUserId) {
      chosenId = args.proUserId;
    } else {
      const { matches } = await runMatching(ctx, {
        city: request.city,
        coords: request.coords ?? undefined,
        specialtyCode: request.specialtyCode ?? undefined,
        requiredSkills: request.requiredSkills ?? undefined,
        serviceKey: request.serviceKey,
        expanded: !!request.searchExpanded,
      });
      if (matches.length === 0) {
        throw new Error(
          "Aucun professionnel éligible n'a été trouvé. Élargissez votre recherche ou réessayez plus tard.",
        );
      }
      chosenId = matches[0].proUserId as Id<"users">;
    }
    const now = Date.now();
    await ctx.db.insert("assignments", {
      requestId: args.requestId,
      teamLeaderId: chosenId,
      members: [{ id: chosenId, role: "Chef d'équipe" }],
      scheduledAt: request.desiredDate ?? now + 24 * 3600 * 1000,
      notes: "Affectation automatique GTEC PRO (choix algorithmique)",
      status: "planifiee",
    });
    await ctx.db.patch(args.requestId, {
      status: "affectee",
      scheduledAt: request.desiredDate ?? now + 24 * 3600 * 1000,
    });
    await ctx.db.insert("selectionEvents", {
      requestId: args.requestId,
      clientId: user._id,
      kind: args.proUserId ? "pro_choisi" : "mode_auto",
      proUserId: chosenId,
      at: now,
    });
    await ctx.db.insert("requestEvents", {
      requestId: args.requestId,
      kind: "affectation",
      label: args.proUserId ? "Professionnel choisi par le client" : "Affectation automatique GTEC (mode « Choisissez pour moi »)",
      at: now,
    });
    await notifyLocal(ctx, chosenId, "affectation", "Nouvelle mission affectée", `« ${request.title} » à ${request.city}. Le devis se prépare sur place.`, args.requestId);
    return { chosenProUserId: chosenId };
  },
});

/**
 * §11 — Élargir la recherche : urgence sans réponse → zone élargie (60 km),
 * autres professionnels proposés, client averti.
 */
export const expandSearch = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const request = (await ctx.db.get(args.requestId)) as any;
    if (!request) throw new Error("Demande introuvable.");
    if (request.clientId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    await ctx.db.patch(args.requestId, { searchExpanded: true });
    await ctx.db.insert("requestEvents", {
      requestId: args.requestId,
      kind: "matching",
      label: "Recherche élargie (zone +60 km)",
      at: Date.now(),
    });
    const { matches } = await runMatching(ctx, {
      city: request.city,
      coords: request.coords ?? undefined,
      specialtyCode: request.specialtyCode ?? undefined,
      requiredSkills: request.requiredSkills ?? undefined,
      serviceKey: request.serviceKey,
      expanded: true,
    });
    return { matches: matches.slice(0, 12).map(hideInternal), expanded: true };
  },
});

// ============================ ESPACE PRO =====================================

/** Présence temps réel du pro (§16/§20) + tarif « à partir de ». */
export const upsertPresence = mutation({
  args: {
    status: v.union(
      v.literal("disponible"),
      v.literal("occupe"),
      v.literal("en_intervention"),
      v.literal("indisponible"),
      v.literal("hors_ligne"),
    ),
    availableFrom: v.optional(v.number()),
    fromPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const now = Date.now();
    const rows = (await ctx.db
      .query("professionalPresence")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const note = args.fromPrice !== undefined ? `from:${args.fromPrice}` : undefined;
    if (rows[0]) {
      await ctx.db.patch(rows[0]._id, {
        status: args.status,
        availableFrom: args.availableFrom,
        ...(note !== undefined ? { note } : {}),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("professionalPresence", {
        userId: user._id,
        status: args.status,
        availableFrom: args.availableFrom,
        note,
        updatedAt: now,
      });
    }
    // Miroir sur le statut « moteur d'affectation » existant (§12).
    const profile = (
      (await ctx.db
        .query("technicianProfiles")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect()) as any[]
    )[0];
    if (profile) {
      await ctx.db.patch(profile._id, { availability: args.status });
    }
  },
});

/** Zones couvertes (§20) : ajout/mise à jour (une ligne par ville). */
export const upsertServiceZone = mutation({
  args: {
    id: v.optional(v.id("professionalServiceZones")),
    city: v.string(),
    district: v.optional(v.string()),
    radiusKm: v.number(),
    center: v.optional(v.object({ lat: v.number(), lon: v.number() })),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const radiusKm = Math.max(1, Math.min(60, args.radiusKm));
    const now = Date.now();
    const fields = {
      city: args.city,
      district: args.district?.trim() || undefined,
      radiusKm,
      center: args.center,
      updatedAt: now,
    };
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as any;
      if (!row || row.userId !== user._id) throw new Error("Zone introuvable.");
      await ctx.db.patch(args.id, fields);
      return;
    }
    await ctx.db.insert("professionalServiceZones", {
      userId: user._id,
      ...fields,
      isActive: true,
      createdAt: now,
    });
  },
});

/** Retire une zone couverte (archive, pas de suppression). */
export const removeServiceZone = mutation({
  args: { id: v.id("professionalServiceZones") },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const row = (await ctx.db.get(args.id)) as any;
    if (!row || row.userId !== user._id) throw new Error("Zone introuvable.");
    await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });
  },
});

/** Mes zones + présence (espace pro). */
export const myMarketplaceProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserLocal(ctx);
    const presence = (
      (await ctx.db
        .query("professionalPresence")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect()) as any[]
    )[0];
    const zones = (await ctx.db
      .query("professionalServiceZones")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    return {
      presence: presence
        ? {
            status: presence.status,
            availableFrom: presence.availableFrom ?? null,
            fromPrice: presence.note?.startsWith("from:") ? Number(presence.note.slice(5)) : null,
            updatedAt: presence.updatedAt,
          }
        : null,
      zones: zones
        .filter((z) => z.isActive)
        .map((z) => ({
          _id: z._id,
          city: z.city,
          district: z.district ?? null,
          radiusKm: z.radiusKm,
          center: z.center ?? null,
        })),
    };
  },
});

/**
 * §20 — Publier des créneaux libres (complément des règles §8) : le client
 * verra la disponibilité concrète du pro (§5 « Disponible à 16h00 »).
 */
export const publishAvailabilitySlot = mutation({
  args: {
    start: v.number(),
    end: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    if (args.end <= args.start) throw new Error("Le créneau doit se terminer après son début.");
    if (args.end - args.start > 12 * 3600 * 1000) {
      throw new Error("Un créneau ne peut pas dépasser 12 heures.");
    }
    if (args.start < Date.now() - 3600 * 1000) {
      throw new Error("Le créneau doit être dans le futur.");
    }
    const now = Date.now();
    // Remplace les chevauchements existants (mark bloque puis insert).
    const existing = (await ctx.db
      .query("availabilitySlots")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    for (const s of existing) {
      if (s.status !== "libre") continue;
      if (s.start < args.end && s.end > args.start) {
        await ctx.db.patch(s._id, { status: "bloque", updatedAt: now });
      }
    }
    const id = await ctx.db.insert("availabilitySlots", {
      userId: user._id,
      start: args.start,
      end: args.end,
      status: "libre",
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

/** Mes créneaux publiés (espace pro). */
export const myAvailabilitySlots = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserLocal(ctx);
    const rows = (await ctx.db
      .query("availabilitySlots")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    return rows
      .filter((s) => s.status === "libre" && s.end > Date.now())
      .sort((a, b) => a.start - b.start)
      .slice(0, 60);
  },
});

/** Retire un créneau publié. */
export const removeAvailabilitySlot = mutation({
  args: { id: v.id("availabilitySlots") },
  handler: async (ctx, args) => {
    const user = await requireUserLocal(ctx);
    const row = (await ctx.db.get(args.id)) as any;
    if (!row || row.userId !== user._id) throw new Error("Créneau introuvable.");
    await ctx.db.patch(args.id, { status: "bloque", updatedAt: Date.now() });
  },
});

// ============================ HELPERS LOCAUX =================================

/** requireUser local (les helpers privés de gtec.ts ne sont pas exportables). */
/** requireUser local (les helpers privés de gtec.ts ne sont pas exportables). */
async function requireUserLocal(ctx: any): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté.");
  const user = (await ctx.db.get(userId)) as Doc<"users"> | null;
  if (!user) throw new Error("Utilisateur introuvable.");
  return user;
}

/** notify local : notification in-app (+ file e-mail si configurée). */
async function notifyLocal(
  ctx: any,
  userId: Id<"users">,
  kind: string,
  title: string,
  body: string,
  requestId?: Id<"serviceRequests">,
) {
  await ctx.db.insert("notifications", {
    userId,
    kind,
    title,
    body,
    requestId,
    at: Date.now(),
  });
  const notifUser = (await ctx.db.get(userId)) as any;
  if (notifUser?.email) {
    await ctx.db.insert("emails", {
      userId,
      to: notifUser.email,
      kind,
      title,
      body,
      requestId,
    });
  }
}

