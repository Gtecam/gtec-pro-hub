import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DEFAULT_CATEGORIES, slugify } from "../lib/gtec";

/**
 * Catalogue de services dynamique (cahier des charges §4).
 *
 * - `listServiceCategories` : catégories actives (ou toutes pour l'admin).
 *   Si la table est vide, renvoie les 12 catégories officielles par défaut
 *   sans rien écrire — le formulaire client fonctionne dès le premier jour.
 * - `seedServiceCategories` : injecte les 12 catégories officielles en base
 *   (idempotent) ; appelé automatiquement par la console admin.
 * - CRUD admin : ajouter, modifier, désactiver/réactiver, supprimer une
 *   catégorie et gérer ses sous-catégories (types de problèmes).
 */

/** État applicatif d'une catégorie (table serviceCategories). */
export type ServiceCategoryDoc = {
  _id: string;
  key: string;
  label: string;
  description?: string;
  icon?: string;
  subcategories: { key: string; label: string }[];
  active: boolean;
  sortOrder: number;
};

/** Vue renvoyée au frontend — identique table comme fallback statique. */
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
    subcategories: c.subcategories.map((label) => ({
      key: slugify(label),
      label,
    })),
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
        subcategories: c.subcategories.map((label) => ({
          key: slugify(label),
          label,
        })),
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
          subcategories: c.subcategories.map((l) => ({
            key: slugify(l),
            label: l,
          })),
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
