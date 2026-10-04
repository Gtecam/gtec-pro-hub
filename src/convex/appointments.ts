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
