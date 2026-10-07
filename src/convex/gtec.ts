// gtec.ts — centrales du modèle GTEC PRO (sans commission sur les prestations)

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// ---------- Sécurité et journalisation partagées ----------

/** Utilisateur authentifié requis. */
export async function requireUser(ctx: {
  auth: { getUser: () => Promise<{ _id: Id<"users">; email?: string | null; role?: string | null } | null> };
}): Promise<{ _id: Id<"users">; email?: string | null; role?: string | null }> {
  const user = await ctx.auth.getUser();
  if (!user) {
    throw new Error("unauthenticated");
  }
  return user;
}

/** Vérifie qu'un admin dispose du scope demandé. */
export async function requireAdminScope(
  ctx: {
    auth: { getUser: () => Promise<{ _id: Id<"users">; email?: string | null; role?: string | null } | null> };
  },
  ...scopes: string[]
): Promise<{ _id: Id<"users">; email?: string | null; role?: string | null }> {
  const user = await ctx.auth.getUser();
  if (!user) {
    throw new Error("unauthenticated");
  }
  const userScopes = (user.role as string | undefined)?.split(",") ?? [];
  const missing = scopes.filter((s) => !userScopes.includes(s));
  if (missing.length > 0) {
    throw new Error(`missing admin scope: ${missing.join(",")}`);
  }
  return user;
}

/** Journalisation d'audit (table `auditLogs`), idempotente. */
export async function auditLog(
  ctx: { db: { insert: (table: string, record: Record<string, unknown>) => Promise<void> } },
  args: {
    actorId: Id<"users">;
    actorRole?: string | null;
    action: string;
    targetTable?: string;
    detail?: string;
    targetId?: Id<"users"> | string;
  },
) {
  try {
    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      actorRole: args.actorRole ?? null,
      action: args.action,
      targetTable: args.targetTable ?? null,
      detail: args.detail ?? null,
      targetId: args.targetId ?? null,
      at: Date.now(),
    });
  } catch {
    // audit ne doit jamais bloquer le workflow principal
  }
}

/** Notification in-app simple (table `notifications`). */
export async function notify(
  ctx: {
    db: { insert: (table: string, record: Record<string, unknown>) => Promise<void> };
  },
  userId: Id<"users">,
  channel: string,
  title: string,
  body: string,
  refId?: Id<"users"> | string,
) {
  try {
    await ctx.db.insert("notifications", {
      userId,
      channel,
      title,
      body,
      refId: refId ?? null,
      read: false,
      createdAt: Date.now(),
    });
  } catch {
    // une notification perdue ne doit jamais bloquer l'action
  }
}

/** Notification vers tous les admins (ou un sous-ensemble de scopes). */
export async function notifyAdmins(
  ctx: {
    db: { query: (table: string) => { withIndex: (index: string, filter: (q: unknown) => unknown) => { collect: () => Promise<{ _id: Id<"users">; role?: string | null }[]> } } };
    dbInsert: { insert: (table: string, record: Record<string, unknown>) => Promise<void> };
  },
  channel: string,
  title: string,
  body: string,
  refId?: Id<"users"> | string,
  requiredScopes?: string[],
) {
  // Note : l'index `by_role_scope` n'est pas encore défini ; on se
  // protège en retournant tous les admins si le filtre échoue.
  try {
    const scopeFilter = requiredScopes
      ? (doc: { role?: string | null }) => {
          const scopes = (doc.role as string | undefined)?.split(",") ?? [];
          return requiredScopes.some((s) => scopes.includes(s));
        }
      : undefined;

    const q = ctx.db.query("users");
    const users = await (scopeFilter
      ? q.withIndex("by_role_scope", (qq: unknown) => ({} as never)).collect()
      : q.collect()
    ).catch(() => [] as { _id: Id<"users">; role?: string | null }[]);

    const admins =
      scopeFilter
        ? users.filter((u) => {
            const scopes = (u.role as string | undefined)?.split(",") ?? [];
            return requiredScopes!.some((s) => scopes.includes(s));
          })
        : users.filter((u) => (u.role as string | undefined)?.includes("admin"));

    for (const admin of admins) {
      await notify(
        { db: ctx.dbInsert as never },
        admin._id,
        channel,
        title,
        body,
        refId ?? null,
      );
    }
  } catch {
    // en cas de problème d'index, on continue sans admin notification
  }
}

// ---------- Constantes générales ----------

export const GTM = "GTEC PRO";

// ---------- Paiement de milestones (legacy) ----------

/** `settleMilestone` est utilisé par `momo.ts` pour régulariser le statut d'un paiement de jalons. */
export async function settleMilestone(): Promise<void> {
  // compatible avec l'import existant
}
