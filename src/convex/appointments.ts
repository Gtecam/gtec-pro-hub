import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./gtec";

const stamp = () => ({ isActive: true, createdAt: Date.now(), updatedAt: Date.now() });

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
      .eq("requestId", args.requestId)
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
    const q = ctx.db
      .query("technicianProfiles")
      .withIndex("by_status", (q) => q.eq("status", "verifie"));
    if (args.search) {
      const term = args.search.toLowerCase();
      return q
        .filter((p) => {
          const name = (p.firstName ?? " " + p.lastName ?? "").toLowerCase();
          const specialty = (p.specialty ?? "").toLowerCase();
          const city = (p.city ?? "").toLowerCase();
          return (
            name.includes(term) ||
            specialty.includes(term) ||
            city.includes(term)
          );
        })
        .select((p) => ({
          userId: p.userId,
          name: p.firstName + " " + p.lastName,
          jobTitle: p.jobTitle,
          city: p.city,
          specialty: p.specialty,
        }))
        .collect();
    }
    return q
      .select((p) => ({
        userId: p.userId,
        name: p.firstName + " " + p.lastName,
        jobTitle: p.jobTitle,
        city: p.city,
        specialty: p.specialty,
      }))
      .collect();
  },
});

export const availableSlots = query({
  args: { proUserId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.proUserId))
      .unique();
    if (!profile?.availability) return [];
    const rules = parseAvailability(profile.availability);
    if (rules.length === 0) return [];
    return generateAvailableSlots({
      rules,
      booked: [],
      dateFrom: isoDateNow(),
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
      requestId: null,
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
    action: v.union(v.literal("CANCEL"), v.literal("RESCHEDULE")),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.id);
    if (!appointment) throw new Error("Rendez-vous introuvable.");
    const user = await requireUser(ctx);
    if (appointment.userId !== user._id) throw new Error("Action non autorisée.");
    if (args.action === "CANCEL") {
      await ctx.db.patch(args.id, {
        status: "ANNULE",
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
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile?.availability) return [];
    return parseAvailability(profile.availability);
  },
});

export const upsertAvailabilityRule = mutation({
  args: {
    userId: v.id("users"),
    rule: v.object({
      weekday: v.number(),
      startMin: v.number(),
      endMin: v.number(),
      slotMinutes: v.optional(v.number()),
      travelMinutes: v.optional(v.number()),
      capacityPerDay: v.optional(v.number()),
      effectiveFrom: v.optional(v.string()),
      effectiveUntil: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile) throw new Error("Profil introuvable.");
    const rules = parseAvailability(profile.availability);
    const idx = rules.findIndex((r) => r.weekday === args.rule.weekday);
    if (idx >= 0) rules[idx] = args.rule;
    else rules.push(args.rule);
    await ctx.db.patch(profile._id, {
      availability: serializeAvailability(rules),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const removeAvailabilityRule = mutation({
  args: { userId: v.id("users"), weekday: v.number() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile) throw new Error("Profil introuvable.");
    const rules = parseAvailability(profile.availability).filter(
      (r) => r.weekday !== args.weekday,
    );
    await ctx.db.patch(profile._id, {
      availability: serializeAvailability(rules),
      updatedAt: Date.now(),
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

export const myAppointments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") return [];
    const proAppts = (await ctx.db
      .query("appointments")
      .withIndex("by_pro", (q) => q.eq("proUserId", user._id))
      .collect()) as any[];
    const clientAppts = (await ctx.db
      .query("appointments")
      .withIndex("by_client", (q) => q.eq("clientUserId", user._id))
      .collect()) as any[];
    const mine = proAppts.filter((a) => a.choice !== "refuser" && a.choice !== "suspension");
    const theirs = clientAppts.filter((a) => a.choice !== "refuser" && a.choice !== "suspension");
    return [...mine, ...theirs].sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const dismissAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) throw new Error("Rappel introuvable.");
    const user = await requireUser(ctx);
    if (appointment.userId !== user._id && appointment.role !== "admin") {
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

function isoDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowPlus(days: number): number {
  return Date.now() + days * 86_400_000;
}
