import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { slugify } from "../lib/gtec";

// ================================ DIPLÔMES ================================

/** Référentiel des niveaux de diplômes (§6) : CAP … DOCTORAT/PhD. */
export const DIPLOMA_LEVELS = [
  { code: "CAP", label: "CAP", rank: 1 },
  { code: "PROBATOIRE", label: "Probatoire / niveau antérieur", rank: 1 },
  { code: "BACCALAUREAT", label: "Baccalauréat", rank: 2 },
  { code: "BT", label: "BT (Brevet de technicien)", rank: 2 },
  { code: "BP", label: "BP (Brevet professionnel)", rank: 2 },
  { code: "BTS", label: "BTS", rank: 3 },
  { code: "HND", label: "HND", rank: 3 },
  { code: "DSEP", label: "DSEP", rank: 3 },
  { code: "HPD", label: "HPD", rank: 3 },
  { code: "DUT", label: "DUT", rank: 3 },
  { code: "DEUG", label: "DEUG", rank: 3 },
  { code: "LICENCE", label: "Licence", rank: 4 },
  { code: "LICENCE_PROFESSIONNELLE", label: "Licence professionnelle", rank: 4 },
  { code: "BACHELOR", label: "Bachelor", rank: 4 },
  { code: "MASTER", label: "Master", rank: 5 },
  { code: "MASTER_PROFESSIONNEL", label: "Master professionnel", rank: 5 },
  { code: "DIPLOME_INGENIEUR", label: "Diplôme d'ingénieur", rank: 5 },
  { code: "DEA", label: "DEA", rank: 6 },
  { code: "DESS", label: "DESS", rank: 6 },
  { code: "DOCTORAT", label: "Doctorat", rank: 7 },
  { code: "PHD", label: "PhD", rank: 7 },
  { code: "AUTRE", label: "Autre", rank: 0 },
];

// ================================ PÔLES ================================

/**
 * Pôle officiel GTEC PRO (12 domaines). Cette valeur, égale à la clé de
 * serviceKey des demandes, est la clé de regroupement du catalogue et du
 * moteur de matching. Elle n'est JAMAIS réécrite en dur dans l'UI.
 */
export const POLES = {
  cfo: {
    key: "cfo",
    label: "Courant Fort — CFO",
    description: "Électriciens : installations, tableaux, défenses, câblage, éclairage.",
    icon: "Zap",
    color: "from-blue-500 to-cyan-400",
  },
  ht: {
    key: "ht",
    label: "Haute Tension — HTA",
    description: "Postes, transformateurs, réseaux HT/MT, mesures d'isolement.",
    icon: "Zap",
    color: "from-amber-500 to-orange-400",
  },
  industrie: {
    key: "industrie",
    label: "Industrie & Automatisme",
    description: "Moteurs, commandes, variateurs, automates, instrumentation.",
    icon: "Factory",
    color: "from-violet-500 to-purple-400",
  },
  solaire: {
    key: "solaire",
    label: "Solaire & Énergie",
    description: "Photovoltaïque, stockage, onduleurs, systèmes autonomes, audit énergétique.",
    icon: "Sun",
    color: "from-yellow-500 to-amber-400",
  },
  cfa: {
    key: "cfa",
    label: "Courant Faible — CFA",
    description: "Réseaux informatiques, fibre, vidéosurveillance, interphonie, contrôle d'accès.",
    icon: "Monitor",
    color: "from-sky-500 to-blue-400",
  },
  domotique: {
    key: "domotique",
    label: "Domotique",
    description: "Éclairage intelligent, automatisme, sécurité connectée, confort.",
    icon: "Home",
    color: "from-fuchsia-500 to-pink-400",
  },
  sinc: {
    key: "sinc",
    label: "Sécurité Incendie",
    description: "Détection, alarmes, désenfumage, extincteurs, contrôles de conformité.",
    icon: "Fire",
    color: "from-red-500 to-rose-400",
  },
  inspection: {
    key: "inspection",
    label: "Inspection & Diagnostic",
    description: "Mesures électriques, thermographie, audits énergétiques, contrôles.",
    icon: "Search",
    color: "from-emerald-500 to-teal-400",
  },
  froid: {
    key: "froid",
    label: "Climatisation, HVAC & Froid",
    description: "Clim, VMC, chambres froides, groupes froid, réfrigération.",
    icon: "Snowflake",
    color: "from-cyan-500 to-blue-400",
  },
  bati: {
    key: "bati",
    label: "Bâtiment & Infrastructure",
    description: "Maçonnerie, cloisons, chemins de câbles, locaux techniques.",
    icon: "Building2",
    color: "from-stone-500 to-stone-300",
  },
  maintenance: {
    key: "maintenance",
    label: "Maintenance & Contrats",
    description: "Préventive, corrective, prédictive, contrats et gestion des interventions.",
    icon: "Wrench",
    color: "from-lime-500 to-green-400",
  },
  fourniture: {
    key: "fourniture",
    label: "Fourniture de Matériel",
    description: "Stock, commande, livraison et suivi de l'ensemble du catalogue.",
    icon: "ShoppingBasket",
    color: "from-slate-500 to-slate-300",
  },
} as const;

export type PoleKey = keyof typeof POLES;
export type Pole = (typeof POLES)[PoleKey];

// ================================ DASHBOARD ================================

/**
 * Tableau de bord de l'administration (§20) : répartition du catalogue par
 * pôle + indicateurs éducation. Dédié à l'onglet « Éducation & diplômes ».
 */
export type EducationDashboard = {
  totalInterventions: number;
  totalCategories: number;
  totalPoles: number;
  byPole: Record<string, { label: string; count: number }>;
  credentialsDeclared: number;
  credentialsPending: number;
  credentialsVerified: number;
  credentialsRejected: number;
  institutionsTotal: number;
  institutionsActive: number;
  institutionsSuspended: number;
  institutionsClosed: number;
  verificationRequestsPending: number;
  staleAlertCount: number;
  staleDays: number;
};

// ================================ INDEXATION =============================

/**
 * Clé de compatibilité de l'ancien formulaire client : le pôle partiel
 * (sauf CFO qui gère les tableurs) mappe vers la zone professionnelle.
 * Consommé par le moteur de matching et l'admin.
 */
export const POLE_TO_POLE = {
  cfo: "électricité",
  ht: "haute tension",
  industrie: "industrie & automatisme",
  solaire: "énergie",
  cfa: "réseaux informatiques",
  domotique: "domotique",
  sinc: "sécurité",
  inspection: "diagnostic",
  froid: "climatisation & froid",
  bati: "bâtiment",
  maintenance: "maintenance",
  fourniture: "fourniture",
} as const;

// ================================ CATEGORIES (pôles existants) ==========

export type CategoryDoc = {
  _id: string;
  key: string;
  label: string;
  description?: string;
  icon?: string;
  subcategories: { key: string; label: string }[];
  active: boolean;
  sortOrder: number;
};

type CategoryView = {
  _id: string;
  key: string;
  label: string;
  description: string | undefined;
  icon: string | undefined;
  subcategories: { key: string; label: string }[];
  active: boolean;
  sortOrder: number;
};

function fallbackView(): CategoryView[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    _id: c.key,
    key: c.key,
    label: c.label,
    description: c.description,
    icon: c.icon,
    subcategories: c.subcategories.map((l) => ({ key: slugify(l), label: l })),
    active: true,
    sortOrder: i,
  }));
}

export const listServiceCategories = query({
  args: { all: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<CategoryView[]> => {
    const rows = await ctx.db.query("serviceCategories").collect();
    if (rows.length === 0) return fallbackView();
    return rows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((c) => (args.all ? true : c.active))
      .map((c) => ({
        _id: c._id,
        key: c.key,
        label: c.label,
        description: c.description,
        icon: c.icon,
        subcategories: c.subcategories,
        active: c.active,
        sortOrder: c.sortOrder,
      }));
  },
});

export const seedServiceCategories = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("serviceCategories").collect();
    if (existing.length > 0) return { created: 0 };
    let i = 0;
    for (const c of DEFAULT_CATEGORIES) {
      await ctx.db.insert("serviceCategories", {
        key: c.key,
        label: c.label,
        description: c.description,
        icon: c.icon,
        subcategories: c.subcategories.map((label) => ({ key: slugify(label), label })),
        active: true,
        sortOrder: i++,
      });
    }
    return { created: DEFAULT_CATEGORIES.length };
  },
});

export const adminCreateCategory = mutation({
  args: {
    label: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    subcategories: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const label = args.label.trim();
    if (label.length < 2) throw new Error("Libellé trop court.");
    let rows = await ctx.db.query("serviceCategories").collect();
    // Seed automatique si la table est encore vide : les 12 domaines
    // officiels GTEC restent ainsi toujours présents.
    if (rows.length === 0) {
      let i = 0;
      for (const c of DEFAULT_CATEGORIES) {
        await ctx.db.insert("serviceCategories", {
          key: c.key,
          label: c.label,
          description: c.description,
          icon: c.icon,
          subcategories: c.subcategories.map((l) => ({ key: slugify(l), label: l })),
          active: true,
          sortOrder: i++,
        });
      }
      rows = await ctx.db.query("serviceCategories").collect();
    }
    const key = slugify(label);
    if (rows.some((r) => r.key === key)) {
      throw new Error("Une catégorie avec cette clé existe déjà.");
    }
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const id = await ctx.db.insert("serviceCategories", {
      key,
      label,
      description: args.description?.trim() || undefined,
      icon: args.icon || "Wrench",
      subcategories: (args.subcategories ?? [])
        .map((s) => s.trim())
        .filter(Boolean)
        .map((l) => ({ key: slugify(l), label: l })),
      active: true,
      sortOrder: maxOrder + 1,
    });
    return id;
  },
});

export const adminUpdateCategory = mutation({
  args: {
    categoryId: v.id("serviceCategories"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    subcategories: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const cat = await ctx.db.get(args.categoryId);
    if (!cat) throw new Error("Catégorie introuvable.");
    const patch: {
      label?: string;
      description?: string;
      icon?: string;
      subcategories?: { key: string; label: string }[];
      active?: boolean;
    } = {};
    if (args.label !== undefined) {
      const lbl = args.label.trim();
      if (lbl.length < 2) throw new Error("Libellé trop court.");
      patch.label = lbl;
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.icon !== undefined) patch.icon = args.icon || "Wrench";
    if (args.subcategories !== undefined) {
      patch.subcategories = args.subcategories
        .map((s) => s.trim())
        .filter(Boolean)
        .map((l) => ({ key: slugify(l), label: l }));
    }
    if (args.active !== undefined) patch.active = args.active;
    await ctx.db.patch(args.categoryId, patch);
  },
});

export const adminDeleteCategory = mutation({
  args: { categoryId: v.id("serviceCategories") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const cat = await ctx.db.get(args.categoryId);
    if (!cat) throw new Error("Catégorie introuvable.");
    const used = await ctx.db
      .query("serviceRequests")
      .filter((q) => q.eq(q.field("serviceKey"), cat.key))
      .first();
    if (used) {
      throw new Error(
        "Impossible de supprimer : des demandes utilisent cette catégorie. Désactivez-la plutôt.",
      );
    }
    await ctx.db.delete(args.categoryId);
  },
});

// ================================ INTERVENTIONS =========================

/**
 * Intervention du catalogue GTEC PRO (§4) : pôle → catégorie → intervention
 * → sous-intervention, avec la liste des compétences requises, le niveau
 * de qualification, la durée indicative et la tarification de base.
 *
 * Le frontend affiche ce dictionnaire — il n'est jamais codé en dur.
 */
export type InterventionDoc = {
  _id: string;
  code: string;
  serviceKey: string;
  category: string;
  label: string;
  subtitle?: string;
  actions: string[];
  skills: string[];
  level: string;
  duration: number;
  durationUnit: string;
  price: number;
  currency: string;
};

export const listInterventions = query({
  args: {
    serviceKey: v.optional(v.union(
      v.literal("cfo"),
      v.literal("ht"),
      v.literal("industrie"),
      v.literal("solaire"),
      v.literal("cfa"),
      v.literal("domotique"),
      v.literal("sinc"),
      v.literal("inspection"),
      v.literal("froid"),
      v.literal("bati"),
      v.literal("maintenance"),
      v.literal("fourniture"),
    )),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("serviceInterventions").collect();
    const key = (args.serviceKey ?? "").trim().toLowerCase();
    const cat = (args.category ?? "").trim().toLowerCase();
    const q = (args.search ?? "").trim().toLowerCase();
    return all.filter((i) => {
      if (key && i.serviceKey !== key) return false;
      if (cat && i.category.toLowerCase() !== cat) return false;
      if (q) {
        const hay = `${i.label} ${i.subtitle ?? ""} ${i.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },
});

export const getIntervention = query({
  args: { interventionId: v.id("serviceInterventions") },
  handler: async (ctx, args) => {
    const i = await ctx.db.get(args.interventionId);
    if (!i) return null;
    return i;
  },
});

export const seedInterventions = mutation({
  args: {
    serviceKey: v.optional(v.union(
      v.literal("cfo"),
      v.literal("ht"),
      v.literal("industrie"),
      v.literal("solaire"),
      v.literal("cfa"),
      v.literal("domotique"),
      v.literal("sinc"),
      v.literal("inspection"),
      v.literal("froid"),
      v.literal("bati"),
      v.literal("maintenance"),
      v.literal("fourniture"),
    )),
    category: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("serviceInterventions").collect();
    if (!args.force && existing.length > 0) return { created: 0 };

    const clusters = DEFAULT_INTERVENTIONS.filter(
      (i) => !args.serviceKey || i.serviceKey === args.serviceKey,
    );

    const upsertCluster = (père: { cat: string; label: string }, items: Partial<InterventionDoc>[]) => {
      for (const item of items) {
        const code = `${père.cat}-${slugify(item.label).slice(0, 12)}`;
        const existingRow = existing.find((e) => e.code === code);
        if (existingRow) {
          existingRow.price = item.price ?? existingRow.price;
          existingRow.duration = item.duration ?? existingRow.duration;
          existingRow.actions = item.actions ?? existingRow.actions;
          existingRow.skills = item.skills ?? existingRow.skills;
          existingRow.level = item.level ?? existingRow.level;
        } else {
          ctx.db.insert("serviceInterventions", {
            code,
            serviceKey: args.serviceKey ?? "cfo",
            category: père.cat,
            label: item.label,
            subtitle: item.subtitle,
            actions: item.actions ?? [],
            skills: item.skills ?? [],
            level: item.level ?? "technicien",
            duration: item.duration ?? 2,
            durationUnit: "heure",
            price: item.price ?? 0,
            currency: "FCFA",
          });
        }
      }
    };

    let created = 0;
    for (const [cat, items] of clusters) {
      if (items.length === 0) {
        const category = await ctx.db
          .query("serviceCategories")
          .withIndex("by_key", (q: any) => q.eq("key", cat))
          .unique();
        if (category) {
          const parent = await ctx.db
            .query("serviceCategories")
            .withIndex("by_key", (q: any) => q.eq("key", args.serviceKey ?? "cfo"))
            .first();
          if (!parent) continue;
        }
        continue;
      }
      const parent = await ctx.db
        .query("serviceCategories")
        .withIndex("by_key", (q: any) => q.eq("key", args.serviceKey ?? "cfo"))
        .first();
      if (!parent) continue;
      for (const item of items) {
        const code = `${cat}-${slugify(item.label).slice(0, 12)}`;
        const already = existing.find((e) => e.code === code);
        if (already) continue;
        const id = await ctx.db.insert("serviceInterventions", {
          code,
          serviceKey: args.serviceKey ?? "cfo",
          category: cat,
          label: item.label,
          subtitle: item.subtitle,
          actions: item.actions ?? [],
          skills: item.skills ?? [],
          level: item.level ?? "technicien",
          duration: item.duration ?? 2,
          durationUnit: "heure",
          price: item.price ?? 0,
          currency: "FCFA",
        });
        created++;
      }
    }

    await ctx.db.insert("serviceInterventions", {
      code: "pilot",
      serviceKey: args.serviceKey ?? "cfo",
      category: "Sélectionner…",
      label: "(pilot)",
      actions: ["Sélectionner une intervention"],
      skills: [],
      level: "technicien",
      duration: 0,
      durationUnit: "minute",
      price: 0,
      currency: "FCFA",
    });
    return { created, total: clusters.length };
  },
});

export const adminCreateIntervention = mutation({
  args: {
    serviceKey: v.union(
      v.literal("cfo"),
      v.literal("ht"),
      v.literal("industrie"),
      v.literal("solaire"),
      v.literal("cfa"),
      v.literal("domotique"),
      v.literal("sinc"),
      v.literal("inspection"),
      v.literal("froid"),
      v.literal("bati"),
      v.literal("maintenance"),
      v.literal("fourniture"),
    ),
    category: v.optional(v.string()),
    label: v.string(),
    subtitle: v.optional(v.string()),
    actions: v.array(v.string()),
    skills: v.optional(v.array(v.string())),
    level: v.optional(v.string()),
    duration: v.optional(v.number()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const label = args.label.trim();
    if (label.length < 3) throw new Error("Le libellé de l'intervention est trop court.");
    const dup = await ctx.db
      .query("serviceInterventions")
      .withIndex("by_serviceKey", (q: any) => q.eq("serviceKey", args.serviceKey))
      .collect();
    const code = `${args.serviceKey}-${slugify(label).slice(0, 12)}`;
    if (dup.some((d) => d.code === code)) {
      throw new Error(`Une intervention du même libellé existe déjà pour ${args.serviceKey}.`);
    }
    const id = await ctx.db.insert("serviceInterventions", {
      code,
      serviceKey: args.serviceKey,
      category: args.category ?? "",
      label,
      subtitle: args.subtitle?.trim() || undefined,
      actions: args.actions ?? [],
      skills: args.skills?.map((s) => s.trim()).filter(Boolean) ?? [],
      level: args.level ?? "technicien",
      duration: args.duration ?? 2,
      durationUnit: "heure",
      price: args.price ?? 0,
      currency: args.currency ?? "FCFA",
    });
    return id;
  },
});

export const adminUpdateIntervention = mutation({
  args: {
    interventionId: v.id("serviceInterventions"),
    label: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    actions: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    level: v.optional(v.string()),
    duration: v.optional(v.number()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(args.interventionId);
    if (!row) throw new Error("Intervention introuvable.");
    const patch: Record<string, unknown> = {};
    if (args.label !== undefined) {
      if (args.label.trim().length < 3) throw new Error("Libellé trop court.");
      patch.label = args.label.trim();
    }
    if (args.subtitle !== undefined) patch.subtitle = args.subtitle?.trim() || undefined;
    if (args.actions !== undefined) patch.actions = args.actions ?? [];
    if (args.skills !== undefined) patch.skills = args.skills.map((s) => s.trim()).filter(Boolean);
    if (args.level !== undefined) patch.level = args.level;
    if (args.duration !== undefined) patch.duration = args.duration;
    if (args.price !== undefined) patch.price = args.price;
    if (args.currency !== undefined) patch.currency = args.currency;
    await ctx.db.patch(args.interventionId, patch);
  },
});

export const adminDeleteIntervention = mutation({
  args: { interventionId: v.id("serviceInterventions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(args.interventionId);
    if (!row) throw new Error("Intervention introuvable.");
    const used = await ctx.db
      .query("serviceRequests")
      .filter((q) => q.eq(q.field("interventionCode"), row.code))
      .first();
    if (used) {
      throw new Error("Impossible de supprimer : une demande utilise cette intervention. Modifiez-la ou désactivez-la.");
    }
    await ctx.db.delete(args.interventionId);
  },
});

// ---------- helpers ----------

async function requireAdmin(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  if (user.role !== "admin") {
    throw new Error("Accès réservé à l'administration GTEC.");
  }
  return user;
}
