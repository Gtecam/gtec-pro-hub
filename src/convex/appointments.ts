import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, notify } from "./gtec";
import { generateAvailableSlots, isoDate } from "../lib/availability";

/**
 * GTEC PRO — Prise de rendez-vous (§8 du référentiel maître).
 *
 * Flux complet : le professionnel déclare ses disponibilités (jour, plage
 * horaire, durée de créneau, temps de déplacement, capacité quotidienne) ; le
 * client ne voit QUE les créneaux réellement disponibles ; la réservation est
 * revalidée côté serveur (jamais de double réservation) ; chaque action est
 * journalisée dans `appointmentEvents` et notifiée à l'interlocuteur.
 *
 * Principes : le rendez-vous réserve le créneau immédiatement (statut
 * CONFIRME) ; le professionnel peut refuser avec motif, le client peut
 * annuler. Aucune donnée de contact directe n'est exposée au professionnel
 * (protection anti-contournement de la plateforme).
 */

const ACTIVE_STATUSES = ["CONFIRME", "TERMINE"] as const;

// ========================= DISPONIBILITÉS (§8) ==============================

export const myAvailabilityRules = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = (await ctx.db
      .query("availabilityRules")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    return rows
      .filter((r) => r.isActive)
      .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
  },
});

export const upsertAvailabilityRule = mutation({
  args: {
    id: v.optional(v.id("availabilityRules")),
    weekday: v.number(),
    startMin: v.number(),
    endMin: v.number(),
    slotMinutes: v.optional(v.number()),
    travelMinutes: v.optional(v.number()),
    capacityPerDay: v.optional(v.number()),
    effectiveFrom: v.optional(v.string()),
    effectiveUntil: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.weekday < 0 || args.weekday > 6) throw new Error("Jour de la semaine invalide.");
    if (args.startMin < 0 || args.endMin > 24 * 60) throw new Error("Horaires invalides.");
    if (args.endMin <= args.startMin) throw new Error("L'heure de fin doit être postérieure à l'heure de début.");
    const slotMinutes = args.slotMinutes ?? 60;
    if (slotMinutes < 15 || slotMinutes > 480) throw new Error("Durée de rendez-vous : entre 15 et 480 minutes.");
    const travelMinutes = args.travelMinutes ?? 30;
    if (travelMinutes < 0 || travelMinutes > 240) throw new Error("Temps de déplacement : entre 0 et 240 minutes.");
    if (args.capacityPerDay !== undefined && (args.capacityPerDay < 1 || args.capacityPerDay > 12)) {
      throw new Error("Capacité : entre 1 et 12 rendez-vous par jour.");
    }
    // Non renseignée = le professionnel peut enchaîner autant de créneaux que
    // sa plage horaire le permet (pas de plafond implicite).
    for (const [label, value] of [
      ["date de début", args.effectiveFrom],
      ["date de fin", args.effectiveUntil],
    ] as const) {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Format de ${label} invalide.`);
    }
    if (args.effectiveFrom && args.effectiveUntil && args.effectiveUntil < args.effectiveFrom) {
      throw new Error("La date de fin précède la date de début.");
    }
    const now = Date.now();
    const fields = {
      weekday: args.weekday,
      startMin: args.startMin,
      endMin: args.endMin,
      slotMinutes,
      travelMinutes,
      capacityPerDay: args.capacityPerDay,
      effectiveFrom: args.effectiveFrom,
      effectiveUntil: args.effectiveUntil,
      updatedAt: now,
    };
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as Doc<"availabilityRules"> | null;
      if (!row || row.userId !== user._id) throw new Error("Disponibilité introuvable.");
      await ctx.db.patch(args.id, fields);
      return;
    }
    await ctx.db.insert("availabilityRules", {
      userId: user._id,
      ...fields,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Archivage (jamais de suppression — l'historique reste traçable). */
export const removeAvailabilityRule = mutation({
  args: { id: v.id("availabilityRules") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as Doc<"availabilityRules"> | null;
    if (!row || row.userId !== user._id) throw new Error("Disponibilité introuvable.");
    await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });
  },
});

// ==================== PROFESSIONNELS RÉSERVABLES (§6/§8) ===================

/**
 * Professionnels vérifiés proposant des rendez-vous (KYC validé, au moins une
 * disponibilité future, profil actif). Sert aussi de moteur de recherche
 * léger pour « Trouver un professionnel » — sans exposer de donnée privée.
 */
export const bookableTechnicians = query({
  args: { search: v.optional(v.string()), domainCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profiles = (await ctx.db.query("technicianProfiles").collect()) as any[];
    const now = Date.now();
    const rules = (await ctx.db.query("availabilityRules").collect()) as any[];
    const byUser = new Map<string, any[]>();
    for (const r of rules.filter((x) => x.isActive)) {
      const list = byUser.get(r.userId) ?? [];
      list.push(r);
      byUser.set(r.userId, list);
    }
    const needle = (args.search ?? "").trim().toLowerCase();
    const rows: any[] = [];
    for (const p of profiles) {
      if (p.status !== "verifie") continue;
      const userRules = byUser.get(p.userId) ?? [];
      const today = isoDate(now);
      const hasFuture = userRules.some((r) => {
        if (r.effectiveUntil && r.effectiveUntil < today) return false;
        for (let i = 0; i < 14; i++) {
          const day = now + i * 86_400_000;
          const iso = isoDate(day);
          if (
            new Date(day).getDay() === r.weekday &&
            (!r.effectiveFrom || iso >= r.effectiveFrom) &&
            (!r.effectiveUntil || iso <= r.effectiveUntil)
          ) {
            return true;
          }
        }
        return false;
      });
      if (!hasFuture) continue;
      const label = [p.jobTitle, p.profession, p.specialty, p.domainCode, p.city].filter(Boolean).join(" ");
      if (args.domainCode && p.domainCode !== args.domainCode) continue;
      if (needle && !label.toLowerCase().includes(needle)) continue;
      const u = (await ctx.db.get(p.userId)) as { name?: string; image?: string } | null;
      rows.push({
        userId: p.userId as string,
        name: [p.firstName, p.lastName].filter(Boolean).join(" ") || u?.name || "Professionnel GTEC PRO",
        image: u?.image ?? null,
        jobTitle: p.jobTitle ?? p.profession ?? p.specialty ?? null,
        city: p.city ?? null,
        zones: p.zones ?? [],
        availability: p.availability ?? null,
      });
    }
    return rows.slice(0, 60);
  },
});

// ==================== CRÉNEAUX DISPONIBLES (§8) ============================

/** Créneaux réellement libres d'un professionnel sur une période donnée. */
export const availableSlots = query({
  args: {
    proUserId: v.id("users"),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const now = Date.now();
    const dateFrom = args.dateFrom ?? isoDate(now);
    const dateTo = args.dateTo ?? isoDate(now + 14 * 86_400_000);
    const rules = ((await ctx.db
      .query("availabilityRules")
      .withIndex("by_user", (q: any) => q.eq("userId", args.proUserId))
      .collect()) as any[]).filter((r) => r.isActive);
    if (rules.length === 0) return [];
    const appointments = ((await ctx.db
      .query("appointments")
      .withIndex("by_pro", (q: any) => q.eq("proUserId", args.proUserId))
      .collect()) as any[]).filter(
      (a) =>
        (ACTIVE_STATUSES as readonly string[]).includes(a.status) &&
        a.slotEnd > now - 86_400_000,
    );
    return generateAvailableSlots({
      rules,
      booked: appointments.map((a) => ({ slotStart: a.slotStart, slotEnd: a.slotEnd })),
      dateFrom,
      dateTo,
      now,
    });
  },
});

// ========================= RÉSERVATION (§8) =================================

export const bookAppointment = mutation({
  args: {
    proUserId: v.id("users"),
    start: v.number(),
    mode: v.union(v.literal("SUR_SITE"), v.literal("A_DISTANCE")),
    serviceKey: v.optional(v.string()),
    domainCode: v.optional(v.string()),
    requestId: v.optional(v.id("serviceRequests")),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.proUserId === user._id) {
      throw new Error("Vous ne pouvez pas réserver avec votre propre compte.");
    }
    const now = Date.now();
    if (args.mode === "SUR_SITE" && (!args.address || args.address.trim().length < 4)) {
      throw new Error("Indiquez l'adresse de l'intervention sur site.");
    }
    if (args.note && args.note.length > 1000) {
      throw new Error("Note trop longue (1000 caractères maximum).");
    }

    const profile = ((await ctx.db
      .query("technicianProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", args.proUserId))
      .collect()) as any[])[0];
    if (!profile) throw new Error("Professionnel introuvable.");
    if (profile.status !== "verifie") {
      throw new Error("Ce professionnel n'est pas encore validé par GTEC PRO.");
    }

    const rules = ((await ctx.db
      .query("availabilityRules")
      .withIndex("by_user", (q: any) => q.eq("userId", args.proUserId))
      .collect()) as any[]).filter((r) => r.isActive);
    if (rules.length === 0) throw new Error("Ce professionnel n'a pas de créneau disponible.");

    const day = isoDate(args.start);
    const existing = ((await ctx.db
      .query("appointments")
      .withIndex("by_pro", (q: any) => q.eq("proUserId", args.proUserId))
      .collect()) as any[]).filter(
      (a) =>
        (ACTIVE_STATUSES as readonly string[]).includes(a.status) && isoDate(a.slotStart) === day,
    );
    const slots = generateAvailableSlots({
      rules,
      booked: existing.map((a) => ({ slotStart: a.slotStart, slotEnd: a.slotEnd })),
      dateFrom: day,
      dateTo: day,
      now,
    });
    const chosen = slots.find((s) => s.start === args.start);
    if (!chosen) throw new Error("Ce créneau n'est plus disponible — choisissez-en un autre.");

    const appointmentId = await ctx.db.insert("appointments", {
      clientUserId: user._id,
      proUserId: args.proUserId,
      requestId: args.requestId,
      serviceKey: args.serviceKey,
      domainCode: args.domainCode,
      mode: args.mode,
      slotStart: chosen.start,
      slotEnd: chosen.end,
      status: "CONFIRME",
      city: args.city?.trim() || undefined,
      address: args.address?.trim() || undefined,
      note: args.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("appointmentEvents", {
      appointmentId,
      actorUserId: user._id,
      kind: "reserve",
      note: args.note?.trim() || undefined,
      at: now,
    });
    const when = new Date(chosen.start).toLocaleString("fr-FR", {
      dateStyle: "full",
      timeStyle: "short",
    });
    await notify(
      ctx,
      args.proUserId,
      "rendez-vous",
      "Nouveau rendez-vous",
      `${user.name ?? "Un client"} a réservé un créneau le ${when}.${
        args.city ? ` (${args.city})` : ""
      }`,
    );
    return { appointmentId, slotStart: chosen.start, slotEnd: chosen.end };
  },
});

// ======================== SUIVI & ACTIONS (§8) ============================

/** Refus (professionnel), annulation (client ou pro), passage (pro). */
export const updateAppointment = mutation({
  args: {
    id: v.id("appointments"),
    action: v.union(v.literal("REFUSE"), v.literal("CANCEL"), v.literal("COMPLETE")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const appt = (await ctx.db.get(args.id)) as Doc<"appointments"> | null;
    if (!appt) throw new Error("Rendez-vous introuvable.");
    const isPro = appt.proUserId === user._id;
    const isClient = appt.clientUserId === user._id;
    if (!isPro && !isClient) throw new Error("Action non autorisée.");
    if (appt.status === "ANNULE" || appt.status === "REFUSE") {
      throw new Error("Ce rendez-vous est déjà clos.");
    }
    if (appt.status === "TERMINE" && args.action !== "CANCEL") {
      throw new Error("Ce rendez-vous est déjà terminé.");
    }
    if (args.action === "REFUSE" && !isPro) {
      throw new Error("Seul le professionnel peut refuser.");
    }
    if (args.action === "COMPLETE" && !isPro) {
      throw new Error("Seul le professionnel peut clôturer le rendez-vous.");
    }
    const now = Date.now();
    const status =
      args.action === "REFUSE" ? "REFUSE" : args.action === "CANCEL" ? "ANNULE" : "TERMINE";
    await ctx.db.patch(args.id, {
      status,
      rejectReason: args.action === "REFUSE" ? args.reason?.trim() || undefined : undefined,
      updatedAt: now,
    });
    await ctx.db.insert("appointmentEvents", {
      appointmentId: args.id,
      actorUserId: user._id,
      kind:
        args.action === "REFUSE" ? "refuse" : args.action === "CANCEL" ? "annule" : "termine",
      note: args.reason?.trim() || undefined,
      at: now,
    });
    const when = new Date(appt.slotStart).toLocaleString("fr-FR", {
      dateStyle: "full",
      timeStyle: "short",
    });
    const other = isPro ? appt.clientUserId : appt.proUserId;
    const titles: Record<string, string> = {
      REFUSE: "Rendez-vous refusé",
      CANCEL: "Rendez-vous annulé",
      COMPLETE: "Rendez-vous terminé",
    };
    const bodies: Record<string, string> = {
      REFUSE: `Votre rendez-vous du ${when} a été refusé.${
        args.reason ? ` Motif : ${args.reason}` : ""
      }`,
      CANCEL: `Le rendez-vous du ${when} a été annulé.`,
      COMPLETE: `L'intervention du ${when} est terminée.`,
    };
    await notify(
      ctx,
      other,
      "rendez-vous",
      titles[args.action] ?? "Rendez-vous",
      bodies[args.action] ?? "",
    );
  },
});

/** Rendez-vous du client connecté et ceux reçus par le professionnel. */
export const myAppointments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [asClient, asPro] = await Promise.all([
      ctx.db
        .query("appointments")
        .withIndex("by_client", (q: any) => q.eq("clientUserId", user._id))
        .collect(),
      ctx.db
        .query("appointments")
        .withIndex("by_pro", (q: any) => q.eq("proUserId", user._id))
        .collect(),
    ]);
    const decorate = async (rows: Doc<"appointments">[], side: "client" | "pro") => {
      const out: any[] = [];
      for (const a of rows) {
        const otherId = side === "client" ? a.proUserId : a.clientUserId;
        const u = (await ctx.db.get(otherId)) as { name?: string; image?: string } | null;
        const profile = ((await ctx.db
          .query("technicianProfiles")
          .withIndex("by_user", (q: any) => q.eq("userId", otherId))
          .collect()) as any[])[0];
        out.push({
          ...a,
          otherName:
            side === "client"
              ? [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
                u?.name ||
                "Professionnel"
              : u?.name || "Client GTEC PRO",
          otherImage: u?.image ?? null,
          otherCity: side === "client" ? profile?.city ?? null : null,
        });
      }
      return out.sort((x, y) => x.slotStart - y.slotStart);
    };
    return {
      asClient: await decorate(asClient as Doc<"appointments">[], "client"),
      asPro: await decorate(asPro as Doc<"appointments">[], "pro"),
      now: Date.now(),
    };
  },
});