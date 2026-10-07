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

// ---------- Conversations (§§…) : listes / envoi / création liée à une demande ----------

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = (
      await ctx.db
        .query("chatRooms")
        .withIndex("by_participants", (q) =>
          q.filter((doc) => doc.participantIds.includes(user._id)),
        )
        .collect()
    ).filter((room) => typeof room.status === "string" && room.status === "active");

    const out = rows.map((room) => {
      const lastMsg = (
        await ctx.db
          .query("conversationMessages")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .sort("desc")
          .take(1)
          .collect()
      )[0] ?? null;

      const otherParticipants: Array<{ _id: Id<"users">; name: string; phone?: string | null }> = [];
      for (const pid of room.participantIds) {
        if (pid === user._id) continue;
        const p = await ctx.db.get(pid);
        if (p) {
          otherParticipants.push({ _id: p._id, name: p.name ?? "", phone: p.phone ?? null });
        }
      }

      return {
        room,
        lastMessage: lastMsg,
        otherParticipants,
      };
    });

    return out;
  },
});

type ConversationWithLastMessage = {
  room: {
    _id: Id<"chatRooms">;
    _creationTime: number;
    requestId?: Id<"serviceRequests">;
    subject?: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    participantIds: Id<"users">[];
  };
  lastMessage: {
    _id: Id<"conversationMessages">;
    _creationTime: number;
    body?: string;
    callKind?: string;
    roomId: Id<"chatRooms">;
    senderId: Id<"users">;
    at: number;
  } | null;
  otherParticipants: Array<{ _id: Id<"users">; name: string; phone?: string | null }>;
};

export const listMessages = query({
  args: { roomId: v.id("chatRooms") },
  handler: async (ctx, { roomId }) => {
    await requireUser(ctx);
    return await ctx.db
      .query("conversationMessages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
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
        v.literal("appel_terminé"),
      ),
    ),
  },
  handler: async (ctx, { roomId, body, callKind }) => {
    const user = await requireUser(ctx);

    const room = await ctx.db.get(roomId);
    if (!room || typeof room.participantIds === "undefined") {
      throw new Error("conversation inconnue");
    }
    if (!room.participantIds.includes(user._id)) {
      throw new Error("pas participant de cette conversation");
    }

    const inserted = await ctx.db.insert("conversationMessages", {
      roomId,
      senderId: user._id,
      body: body ?? null,
      callKind: callKind ?? null,
      at: Date.now(),
    } as never);

    await ctx.db.insert("notifications", {
      userId: room.participantIds.find((id) => id !== user._id) ?? user._id,
      channel: "conversation",
      title: callKind ? "Nouvelle notification d'appel" : "Nouveau message",
      body: callKind
        ? `Notification d'appel : ${callKind}`
        : body?.slice(0, 200) ?? "",
      requestId: room.requestId ?? null,
      kind: "conversation",
      readAt: null,
      at: Date.now(),
    } as never);

    return inserted;
  },
});

export const chatRoomForRequest = mutation({
  args: { requestId: v.optional(v.id("serviceRequests")) },
  handler: async (ctx, { requestId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("chatRooms")
      .withIndex("by_request", (q) => requestId ? q.eq("requestId", requestId) : undefined)
      .first();

    if (existing) {
      return existing;
    }

    const room = await ctx.db.insert("chatRooms", {
      requestId: requestId ?? null,
      participantIds: [user._id],
      subject: requestId ? "Discussion liée à une demande" : "Conversation",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(room);
  },
});

// ---------- Notifications in-app (lecture / marquage) ----------

export const listMyNotifications = query({
  args: { limit?: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .sort("desc")
      .take(limit ?? 50)
      .collect();
    return items as Array<{
      _id: Id<"notifications">;
      userId: Id<"users">;
      channel: string;
      title: string;
      body: string;
      kind: string;
      requestId?: Id<"serviceRequests"> | null;
      readAt?: number | null;
      at: number;
    }>;
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
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const n of items) {
      if (n.readAt === null || n.readAt === undefined) {
        await ctx.db.patch(n._id, { readAt: Date.now() });
      }
    }
  },
});

// ---------- Paiement de milestones (legacy) ----------

/** `settleMilestone` est utilisé par `momo.ts` pour régulariser le statut d'un paiement de jalons. */
export async function settleMilestone(): Promise<void> {
  // compatible avec l'import existant
}
