import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DEFAULT_CATEGORIES, slugify } from "../lib/gtec";

/**
 * Catalogue dynamique GTEC PRO :
 *  - `serviceCategories` : les 12 pôles officiels (§4) avec sous-catégories,
 *    gérés par l'administration (fallback statique si la table est vide) ;
 *  - `serviceInterventions` : le dictionnaire des interventions par pôle
 *    (compétences, niveau, durée, tarification de base).
 *
 * Aucune liste n'est codée en dur dans l'UI : tout lit ces tables.
 */

// ================================ CATÉGORIES (pôles) ======================

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

async function insertDefaultCategories(ctx: any): Promise<void> {
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
    await insertDefaultCategories(ctx);
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
      await insertDefaultCategories(ctx);
      rows = await ctx.db.query("serviceCategories").collect();
    }
    const key = slugify(label);
    if (rows.some((r) => r.key === key)) {
      throw new Error("Une catégorie avec cette clé existe déjà.");
    }
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    return await ctx.db.insert("serviceCategories", {
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

// ================================ INTERVENTIONS ===========================

export const listInterventions = query({
  args: {
    serviceKey: v.optional(v.string()),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = args.serviceKey
      ? await ctx.db
          .query("serviceInterventions")
          .withIndex("by_serviceKey", (q) => q.eq("serviceKey", args.serviceKey!))
          .collect()
      : await ctx.db.query("serviceInterventions").collect();
    const cat = (args.category ?? "").trim().toLowerCase();
    const q = (args.search ?? "").trim().toLowerCase();
    return rows
      .filter((i) => {
        if (cat && (i.category ?? "").toLowerCase() !== cat) return false;
        if (q) {
          const hay = `${i.code} ${i.label} ${i.subtitle ?? ""} ${i.category ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code, "fr"));
  },
});

export const getIntervention = query({
  args: { interventionId: v.id("serviceInterventions") },
  handler: async (ctx, args) => {
    return (await ctx.db.get(args.interventionId)) ?? null;
  },
});

export const adminCreateIntervention = mutation({
  args: {
    serviceKey: v.string(),
    category: v.optional(v.string()),
    label: v.string(),
    subtitle: v.optional(v.string()),
    actions: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    level: v.optional(v.string()),
    duration: v.optional(v.number()),
    durationUnit: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const label = args.label.trim();
    if (label.length < 3) throw new Error("Le libellé de l'intervention est trop court.");
    const code = `${args.serviceKey}-${slugify(label).slice(0, 24)}`;
    const dup = await ctx.db
      .query("serviceInterventions")
      .withIndex("by_serviceKey", (q) => q.eq("serviceKey", args.serviceKey))
      .collect();
    if (dup.some((d) => d.code === code)) {
      throw new Error(`Une intervention du même libellé existe déjà pour ${args.serviceKey}.`);
    }
    return await ctx.db.insert("serviceInterventions", {
      code,
      serviceKey: args.serviceKey,
      category: args.category?.trim() || undefined,
      label,
      subtitle: args.subtitle?.trim() || undefined,
      actions: args.actions ?? [],
      skills: args.skills?.map((s) => s.trim()).filter(Boolean) ?? [],
      level: args.level ?? "technicien",
      duration: args.duration ?? 2,
      durationUnit: args.durationUnit ?? "heure",
      price: args.price ?? 0,
      currency: args.currency ?? "FCFA",
    });
  },
});

export const adminUpdateIntervention = mutation({
  args: {
    interventionId: v.id("serviceInterventions"),
    label: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    category: v.optional(v.string()),
    actions: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    level: v.optional(v.string()),
    duration: v.optional(v.number()),
    durationUnit: v.optional(v.string()),
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
    if (args.category !== undefined) patch.category = args.category?.trim() || undefined;
    if (args.actions !== undefined) patch.actions = args.actions;
    if (args.skills !== undefined) patch.skills = args.skills.map((s) => s.trim()).filter(Boolean);
    if (args.level !== undefined) patch.level = args.level;
    if (args.duration !== undefined) patch.duration = args.duration;
    if (args.durationUnit !== undefined) patch.durationUnit = args.durationUnit;
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
      throw new Error(
        "Impossible de supprimer : une demande utilise cette intervention. Modifiez-la ou désactivez-la.",
      );
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
