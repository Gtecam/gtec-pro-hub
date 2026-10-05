import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./gtec";
import { generateAvailableSlots, isoDate } from "../lib/availability";

const stamp = () => ({ isActive: true, createdAt: Date.now(), updatedAt: Date.now() });

export const openConversation = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    clientUserId: v.id("users"),
    clientName: v.optional(v.string()),
    proUserId: v.optional(v.id("users")),
    proName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.clientUserId !== user._id && args.proUserId !== user._id) {
      throw new Error("Action non autorisée.");
    }
    const existing = await ctx.db
      .query("chatRooms")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.clientName ? { clientName: args.clientName } : {}),
        ...(args.proUserId && !existing.proUserId ? { proUserId: args.proUserId } : {}),
        ...(args.proName && !existing.proName ? { proName: args.proName } : {}),
        status: "active",
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("chatRooms", {
      requestId: args.requestId,
      clientUserId: args.clientUserId,
      proUserId: args.proUserId,
      clientName: args.clientName ?? "Client GTEC PRO",
      proName: args.proName ?? "Professionnel GTEC PRO",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const sendMessage = mutation({
  args: {
    roomId: v.id("chatRooms"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Conversation introuvable.");
    if (room.clientUserId !== user._id && room.proUserId !== user._id) {
      throw new Error("Action non autorisée.");
    }
    const msgId = await ctx.db.insert("conversationMessages", {
      roomId: args.roomId,
      userId: user._id,
      body: args.body.trim(),
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.roomId, { updatedAt: Date.now() });
    const msg = await ctx.db.get(msgId);
    if (msg && msg.userId !== room.proUserId) {
      await ctx.db.patch(msgId, { readAt: Date.now() });
    }
    return msgId;
  },
});

export const conversations = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const room = await ctx.db
      .query("chatRooms")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .first();
    if (!room) return null;
    if (room.clientUserId !== user._id && room.proUserId !== user._id) {
      throw new Error("Action non autorisée.");
    }
    const msgs = await ctx.db
      .query("conversationMessages")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const partners = msgs.filter((m) => m.userId !== room.clientUserId && m.userId !== room.proUserId);
    return {
      roomId: room._id,
      requestId: room.requestId,
      clientUserId: room.clientUserId,
      proUserId: room.proUserId,
      clientName: room.clientName,
      proName: room.proName,
      lastAt: room.updatedAt,
      unreadCount: msgs.filter((m) => m.userId !== user._id && m.readAt === null).length,
      messages: msgs,
    };
  },
});

export const listConversations = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rooms = await ctx.db
      .query("chatRooms")
      .withIndex("by_client", (q) => q.eq("clientUserId", args.userId))
      .collect();
    const proRooms = await ctx.db
      .query("chatRooms")
      .withIndex("by_pro", (q) => q.eq("proUserId", args.userId))
      .collect();
    const allRooms = [...rooms, ...proRooms.filter((r) => r.status === "active")];
    const enriched = await Promise.all(
      allRooms.map(async (r) => {
        const last = await ctx.db
          .query("conversationMessages")
          .withIndex("by_room", (q) => q.eq("roomId", r._id))
          .first();
        return {
          roomId: r._id,
          requestId: r.requestId,
          clientUserId: r.clientUserId,
          proUserId: r.proUserId,
          clientName: r.clientName,
          proName: r.proName,
          lastMessage: last?.body ?? "",
          lastAt: last?.createdAt ?? r.createdAt,
          unreadCount: last && last.userId !== args.userId && last.readAt === null ? 1 : 0,
        };
      }),
    );
    if (user._id !== args.userId && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    return enriched.sort((a, b) => b.lastAt - a.lastAt);
  },
});

export const saveAppointment = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("serviceRequests"),
    contactName: v.string(),
    contactPhone: v.string(),
    message: v.optional(v.string()),
    choice: v.union(
      v.literal("rappeler"),
      v.literal("rappeler_plus_tard"),
      v.literal("passer_plus_tard"),
      v.literal("refuser"),
      v.literal("suspension"),
    ),
    date: v.optional(v.string()),
    note: v.optional(v.string()),
    emoji: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appointments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("requestId"), args.requestId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("appointments", {
      ...args,
      clientUserId: args.userId,
      ...stamp(),
    });
  },
});

export const listAppointments = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("appointments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const bookableTechnicians = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_status", (q) => q.eq("status", "verifie"))
      .collect();
    const term = args.search?.toLowerCase();
    const filtered = term
      ? profiles.filter((p) => {
          const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.toLowerCase();
          const specialty = (p.specialty ?? "").toLowerCase();
          const city = (p.city ?? "").toLowerCase();
          return (
            name.includes(term) ||
            specialty.includes(term) ||
            city.includes(term)
          );
        })
      : profiles;
    return filtered.map((p) => ({
      userId: p.userId,
      name: `${p.firstName} ${p.lastName}`,
      jobTitle: p.jobTitle,
      city: p.city,
      specialty: p.specialty,
    }));
  },
});

export const availableSlots = query({
  args: { proUserId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.proUserId))
      .unique();
    if (!profile?.availabilityRulesJson) return [];
    const rules = parseAvailability(profile.availabilityRulesJson);
    if (rules.length === 0) return [];
    return generateAvailableSlots({
      rules,
      booked: [],
      dateFrom: isoDate(Date.now()),
      dateTo: isoDate(nowPlus(14)),
      now: Date.now(),
    });
  },
});

export const bookAppointment = mutation({
  args: {
    proUserId: v.id("users"),
    start: v.number(),
    mode: v.union(v.literal("SUR_SITE"), v.literal("A_DISTANCE")),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const booked = {
      slotStart: args.start,
      slotEnd: args.start + 60 * 60_000,
    };
    const slot = generateAvailableSlots({
      rules: [{ weekday: new Date(args.start).getDay(), startMin: 0, endMin: 24 * 60 }],
      booked: [booked],
      dateFrom: isoDate(args.start),
      dateTo: isoDate(args.start),
      now: Date.now(),
    })[0];
    if (!slot) throw new Error("Créneau indisponible.");
    const appointmentId = await ctx.db.insert("appointments", {
      userId: user._id,
      proUserId: args.proUserId,
      clientUserId: user._id,
      proUserIdField: args.proUserId,
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: args.mode,
      city: args.city?.trim() || undefined,
      address: args.address?.trim() || undefined,
      note: args.note?.trim() || undefined,
      status: "CONFIRME",
      contactName: user.name ?? undefined,
      contactPhone: user.phone ?? undefined,
      choice: "souscrire",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return appointmentId;
  },
});

export const updateAppointment = mutation({
  args: {
    id: v.id("appointments"),
    action: v.union(
      v.literal("CANCEL"),
      v.literal("RESCHEDULE"),
      v.literal("COMPLETE"),
      v.literal("REFUSE"),
    ),
    date: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.id);
    if (!appointment) throw new Error("Rendez-vous introuvable.");
    const user = await requireUser(ctx);
    const involved =
      appointment.userId === user._id ||
      appointment.clientUserId === user._id ||
      appointment.proUserId === user._id;
    if (!involved) throw new Error("Action non autorisée.");
    if (args.action === "CANCEL") {
      await ctx.db.patch(args.id, {
        status: "ANNULE",
        reason: args.reason,
        updatedAt: Date.now(),
      });
      return;
    }
    if (args.action === "REFUSE") {
      await ctx.db.patch(args.id, {
        status: "REFUSE",
        reason: args.reason,
        updatedAt: Date.now(),
      });
      return;
    }
    if (args.action === "COMPLETE") {
      await ctx.db.patch(args.id, {
        status: "TERMINE",
        updatedAt: Date.now(),
      });
      return;
    }
    if (args.action === "RESCHEDULE" && args.date) {
      await ctx.db.patch(args.id, {
        slotStart: Date.parse(args.date),
        slotEnd: Date.parse(args.date) + 60 * 60_000,
        updatedAt: Date.now(),
      });
    }
  },
});

export const myAvailabilityRules = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const target = args.userId ?? user._id;
    if (target !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .unique();
    if (!profile?.availabilityRulesJson) return [];
    const rules = parseAvailability(profile.availabilityRulesJson);
    // Ids stables côté UI : « userId:index » dans le JSON du profil.
    return rules.map((r, i) => ({ ...r, _id: `${target}:${i}` as Id<"availabilityRules"> }));
  },
});

export const upsertAvailabilityRule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    id: v.optional(v.string()),
    weekday: v.optional(v.number()),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    slotMinutes: v.optional(v.number()),
    travelMinutes: v.optional(v.number()),
    capacityPerDay: v.optional(v.number()),
    effectiveFrom: v.optional(v.string()),
    effectiveUntil: v.optional(v.string()),
    rule: v.optional(
      v.object({
        weekday: v.number(),
        startMin: v.number(),
        endMin: v.number(),
        slotMinutes: v.optional(v.number()),
        travelMinutes: v.optional(v.number()),
        capacityPerDay: v.optional(v.number()),
        effectiveFrom: v.optional(v.string()),
        effectiveUntil: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Compat UI : soit { userId, rule }, soit { id?, weekday, startMin, ... }.
    const rule =
      args.rule ??
      (args.weekday !== undefined && args.startMin !== undefined && args.endMin !== undefined
        ? {
            weekday: args.weekday,
            startMin: args.startMin,
            endMin: args.endMin,
            slotMinutes: args.slotMinutes,
            travelMinutes: args.travelMinutes,
            capacityPerDay: args.capacityPerDay,
            effectiveFrom: args.effectiveFrom,
            effectiveUntil: args.effectiveUntil,
          }
        : undefined);
    if (!rule) throw new Error("Règle de disponibilité manquante.");
    if (rule.endMin <= rule.startMin) throw new Error("Créneau invalide.");
    const target = args.userId ?? user._id;
    if (target !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .unique();
    if (!profile) throw new Error("Profil introuvable.");
    const rules = parseAvailability(profile.availability);
    let idx = -1;
    if (args.id && args.id.includes(":")) {
      const parsed = Number(args.id.split(":").pop());
      idx =
        Number.isInteger(parsed) && parsed >= 0 && parsed < rules.length
          ? parsed
          : -1;
    }
    if (idx < 0) idx = rules.findIndex((r) => r.weekday === rule.weekday);
    if (idx >= 0) rules[idx] = rule;
    else rules.push(rule);
    await ctx.db.patch(profile._id, {
      availabilityRulesJson: serializeAvailability(rules),
    });
    return { ok: true };
  },
});

export const removeAvailabilityRule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    id: v.optional(v.string()),
    weekday: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const target = args.userId ?? user._id;
    if (target !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .unique();
    if (!profile) throw new Error("Profil introuvable.");
    const rules = parseAvailability(profile.availability);
    let idx = -1;
    if (args.id && args.id.includes(":")) {
      const parsed = Number(args.id.split(":").pop());
      idx =
        Number.isInteger(parsed) && parsed >= 0 && parsed < rules.length
          ? parsed
          : -1;
    }
    if (idx < 0 && args.weekday !== undefined) {
      idx = rules.findIndex((r) => r.weekday === args.weekday);
    }
    if (idx >= 0) rules.splice(idx, 1);
    await ctx.db.patch(profile._id, {
      availabilityRulesJson: serializeAvailability(rules),
    });
    return { ok: true };
  },
});

export const listAppointmentsForPro = query({
  args: { proUserId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("appointments")
      .withIndex("by_pro", (q) => q.eq("proUserId", args.proUserId))
      .collect();
  },
});

export const listAppointmentsForClient = query({
  args: { clientUserId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("appointments")
      .withIndex("by_client", (q) => q.eq("clientUserId", args.clientUserId))
      .collect();
  },
});

/** Vue enrichie d'un rendez-vous : l'autre partie est nommée (jamais contactée directement). */
type ApptView = Doc<"appointments"> & {
  slotStart: number;
  slotEnd: number;
  otherName: string;
  rejectReason: string | undefined;
};

export const myAppointments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") return { asClient: [] as ApptView[], asPro: [] as ApptView[] };
    const proAppts = (await ctx.db
      .query("appointments")
      .withIndex("by_pro", (q) => q.eq("proUserId", user._id))
      .collect()) as Doc<"appointments">[];
    const clientAppts = (await ctx.db
      .query("appointments")
      .withIndex("by_client", (q) => q.eq("clientUserId", user._id))
      .collect()) as Doc<"appointments">[];
    const nameOf = async (id: Id<"users"> | undefined): Promise<string> => {
      if (!id) return "GTEC PRO";
      const u = await ctx.db.get(id);
      return u?.name ?? "GTEC PRO";
    };
    const visible = (a: Doc<"appointments">) =>
      a.choice !== "refuser" && a.choice !== "suspension";
    const asClient: ApptView[] = await Promise.all(
      clientAppts.filter(visible).map(async (a) => ({
        ...a,
        slotStart: a.slotStart ?? 0,
        slotEnd: a.slotEnd ?? 0,
        otherName: await nameOf(a.proUserId),
        rejectReason: a.reason,
      })),
    );
    const asPro: ApptView[] = await Promise.all(
      proAppts.filter(visible).map(async (a) => ({
        ...a,
        slotStart: a.slotStart ?? 0,
        slotEnd: a.slotEnd ?? 0,
        otherName: await nameOf(a.clientUserId),
        rejectReason: a.reason,
      })),
    );
    asClient.sort((a, b) => a.createdAt - b.createdAt);
    asPro.sort((a, b) => a.createdAt - b.createdAt);
    return { asClient, asPro };
  },
});

export const dismissAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) throw new Error("Rappel introuvable.");
    const user = await requireUser(ctx);
    if (appointment.userId !== user._id && user.role !== "admin") {
      throw new Error("Action non autorisée.");
    }
    await ctx.db.patch(args.appointmentId, {
      status: "ignored",
      dismissedAt: Date.now(),
    });
  },
});

// --- helpers (pure, shared with scripts/test-availability.ts) -------------------

interface AvailabilityRule {
  weekday: number;
  startMin: number;
  endMin: number;
  slotMinutes?: number;
  travelMinutes?: number;
  capacityPerDay?: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

function parseAvailability(raw: string | AvailabilityRule[] | undefined): AvailabilityRule[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as AvailabilityRule[];
  try {
    return JSON.parse(raw) as AvailabilityRule[];
  } catch {
    return [];
  }
}

function serializeAvailability(rules: AvailabilityRule[]): string {
  return JSON.stringify(rules);
}

function nowPlus(days: number): number {
  return Date.now() + days * 86_400_000;
}
