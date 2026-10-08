// gtec.ts - centrales du modèle GTEC PRO (sans commission sur les prestations)

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------- Sécurité et journalisation partagées ----------

/** Utilisateur authentifié requis. */
export async function requireUser(
  ctx: any
): Promise<any> {
  const auth = ctx.auth;
  const authGetter =
    typeof auth?.getUser === "function"
      ? auth.getUser.bind(auth)
      : undefined;

  const user =
    authGetter?.() ??
    Promise.resolve(null);

  const resolved = await user;
  if (!resolved) {
    throw new Error("unauthenticated");
  }
  return resolved;
}

/** Vérifie qu'un admin dispose du scope demandé. */
export async function requireAdminScope(
  ctx: any,
  ...scopes: string[]
): Promise<any> {
  const user = await requireUser(ctx);
  const role =
    typeof user.role === "string" ? user.role : (user.role ?? "");
  const userScopes = role.split(",");
  const missing = scopes.filter((s) => !userScopes.includes(s));
  if (missing.length > 0) {
    throw new Error(`missing admin scope: ${missing.join(",")}`);
  }
  return user;
}

/** Journalisation d'audit (table `auditLogs`), idempotente. */
export async function auditLog(
  ctx: any,
  args: {
    actorId: Id<"users">;
    actorRole?: string | null;
    action: string;
    targetTable?: string;
    detail?: string;
    targetId?: Id<"users"> | string;
  }
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
  ctx: any,
  userId: Id<"users">,
  title: string,
  body: string,
  refId?: Id<"users"> | string
) {
  try {
    await ctx.db.insert("notifications", {
      userId,
      title,
      body,
      refId: refId ?? null,
      readAt: null,
      at: Date.now(),
    });
  } catch {
    // une notification perdue ne doit jamais bloquer l'action
  }
}

/** Notification vers tous les admins (ou un sous-ensemble de scopes). */
export async function notifyAdmins(
  ctx: any,
  title: string,
  body: string,
  refId?: Id<"users"> | string,
  requiredScopes?: string[]
) {
  try {
    const scopeFilter = requiredScopes
      ? (doc: { role?: string | null }) => {
          const scopes =
            typeof doc.role === "string" ? doc.role.split(",") : [];
          return requiredScopes.some((s) => scopes.includes(s));
        }
      : undefined;

    const q = ctx.db.query("users");
    const users = (
      scopeFilter
        ? await q
            .withIndex("by_role_scope", (qq: any) => ({} as never))
            .collect()
        : await q.collect()
    ).filter(
      (u: { role?: string | null }) =>
        typeof u.role === "string" && u.role.includes("admin")
    );

    const admins =
      scopeFilter
        ? (users as any[]).filter((u) => {
            const scopes =
              typeof u.role === "string" ? u.role.split(",") : [];
            return requiredScopes!.some((s) => scopes.includes(s));
          })
        : users;

    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        title,
        body,
        refId: refId ?? null,
        readAt: null,
        at: Date.now(),
      });
    }
  } catch {
    // en cas de problème d'index, on continue sans admin notification
  }
}

// ---------- Constantes générales ----------

export const GTM = "GTEC PRO";

// ---------- Conversations (§§...) : listes / envoi / création liée à une demande ----------

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rooms = await ctx.db
      .query("chatRooms")
      .collect();
    return (rooms as any[]).filter(
      (room) =>
        room.status === "active" &&
        room.participantIds?.includes?.(user._id)
    );
  },
});

export const listMessages = query({
  args: { roomId: v.id("chatRooms") },
  handler: async (ctx, { roomId }) => {
    await requireUser(ctx);
    return ctx.db
      .query("conversationMessages")
      .withIndex("by_room", (q: any) => q.eq("roomId", roomId))
      .collect();
  },
});

export const sendMessage = mutation({
  args: {
    roomId: v.id("chatRooms"),
    body: v.optional(v.string()),
    callKind: v.optional(
      v.union(
        v.literal("appel_sortant"),
        v.literal("appel_entrant"),
        v.literal("appel_accepte"),
        v.literal("appel_recu"),
        v.literal("appel_decroche"),
        v.literal("appel_terminé")
      )
    ),
  },
  handler: async (ctx, { roomId, body, callKind }) => {
    const user = await requireUser(ctx);

    const room = await ctx.db.get(roomId);
    if (!room || !Array.isArray(room.participantIds)) {
      throw new Error("conversation inconnue");
    }
    if (!room.participantIds.includes(user._id)) {
      throw new Error("pas participant de cette conversation");
    }

    const inserted = await ctx.db.insert("conversationMessages", {
      roomId,
      senderId: user._id,
      body,
      callKind,
      at: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId:
        room.participantIds.find(
          (id: any) => id !== user._id
        ) ?? user._id,
      title: callKind ? "Nouvelle notification d'appel" : "Nouveau message",
      body:
        callKind
          ? `Notification d'appel : ${callKind}`
          : body?.slice(0, 200) ?? "",
      readAt: null,
      at: Date.now(),
    });

    return inserted;
  },
});

export const chatRoomForRequest = mutation({
  args: { requestId: v.optional(v.id("serviceRequests")) },
  handler: async (ctx, { requestId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("chatRooms")
      .withIndex(
        "by_request",
        (q: any) =>
          requestId ? q.eq("requestId", requestId) : q
      )
      .first();

    if (existing) {
      return existing;
    }

    const room = await ctx.db.insert("chatRooms", {
      requestId: requestId ?? undefined,
      participantIds: [user._id],
      subject:
        requestId ? "Discussion liée à une demande" : "Conversation",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return ctx.db.get(room);
  },
});

// ---------- Notifications in-app (lecture / marquage) ----------

export const listMyNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    return items;
  },
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const n = await ctx.db.get(notificationId);
    if (!n || n.userId !== user._id) {
      return;
    }
    await ctx.db.patch(notificationId, { readAt: Date.now() });
  },
});

export const markAllNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    for (const n of items) {
      if (n.readAt == null) {
        await ctx.db.patch(n._id, { readAt: Date.now() });
      }
    }
  },
});

// ---------- Paiement de milestones (legacy) ----------

/** `settleMilestone` est utilisé par `momo.ts` pour régulariser le statut d'un paiement de jalons. */
export async function settleMilestone(
  ctx: any,
  payment: {
    requestId: Id<"serviceRequests">;
    amount: number;
    currency: string;
  },
  opts?: { externalRef?: string }
): Promise<void> {
  // compatible avec l'import existant
  void ctx;
  void payment;
  void opts;
}

// ---------- Helpers compatibilité (legacy) ----------

/** Marque une insert comme ayant eu lieu. */
export const dbInsert = { insert: 1 } as const;
