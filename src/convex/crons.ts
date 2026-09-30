// Crons GTEC PRO — automatisations quotidiennes (V6).
//
// Trois tâches, exécutées chaque matin à 6 h UTC :
//  1. Marquer les devis dont la validité est dépassée + notifier client et admin.
//  2. Rappeler les visites de maintenance planifiées sous 48 h (technicien
//     affecté + client + admin).
//  3. Signaler les abonnements technicien expirés / expirant sous 7 jours
//     (le technicien disparaît des suggestions d'affectation à l'échéance).
import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const crons = cronJobs();

/**
 * GTEC PRO 2.0 (§24) : rappel quotidien des dettes de commission (paiements
 * cash) — au prestataire concerné et, à l'échéance dépassée, à l'admin.
 */
crons.daily(
  "gtec-commission-debt-reminder",
  { hourUTC: 6, minuteUTC: 15 },
  internal.crons.commissionDebtSweep,
);

crons.daily(
  "gtec-daily-sweep",
  { hourUTC: 6, minuteUTC: 0 },
  internal.crons.dailySweep,
);

/** Notification minimale (sans file e-mail) : crons silencieux si e-mail absent. */
async function pushNotification(
  db: any,
  userId: Id<"users">,
  kind: string,
  title: string,
  body: string,
  requestId?: Id<"serviceRequests">,
) {
  await db.insert("notifications", { userId, kind, title, body, requestId, at: Date.now() });
}

/** Notify admins via notifications uniquement (pas d'e-mail — sweep quotidien). */
async function pushAdmins(db: any, kind: string, title: string, body: string) {
  const admins = await db
    .query("users")
    .filter((q: any) => q.eq(q.field("role"), "admin"))
    .collect();
  for (const a of admins) {
    await pushNotification(db, a._id, kind, title, body);
  }
  return admins.length;
}

/**
 * Sweep quotidien : devis expirés, rappels de visites, abonnements expirés.
 * Idempotent : les devis déjà "expire" sont ignorés, un seul rappel par visite
 * (marquée via report existant ? Non — on s'appuie sur l'absence de
 * notification récente via le libellé ; la visite ne change pas de statut).
 */
export const dailySweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    const summary = { quotesExpired: 0, visitReminders: 0, subsExpiring: 0, debtReminders: 0 };

    // ---------- 1) Devis dont la validité est dépassée ----------
    const quotes = await ctx.db.query("quotes").collect();
    for (const q of quotes) {
      if (q.status === "emis" && q.validUntil < now) {
        await ctx.db.patch(q._id, { status: "expire" });
        summary.quotesExpired++;
        await pushNotification(
          ctx.db,
          q.clientId,
          "devis",
          "Devis expiré",
          `Le devis ${q.number} a expiré sans réponse. Faites une nouvelle demande pour actualiser les prix.`,
          q.requestId,
        );
      }
    }

    // ---------- 2) Visites de maintenance planifiées sous 48 h ----------
    const visits = await ctx.db
      .query("contractVisits")
      .withIndex("by_contract")
      .collect();
    const soon = now + 2 * DAY;
    for (const v of visits) {
      if (v.status !== "planifiee" || v.scheduledAt < now || v.scheduledAt > soon) {
        continue;
      }
      const contract = await ctx.db.get(v.contractId);
      if (!contract) continue;
      const when = new Date(v.scheduledAt).toLocaleDateString("fr-FR", {
        dateStyle: "long",
      });
      // Client
      await pushNotification(
        ctx.db,
        contract.clientId,
        "visite",
        `Visite de maintenance le ${when}`,
        `Notre équipe passera pour « ${contract.title} ». Merci de faciliter l'accès aux équipements.`,
      );
      // Technicien affecté
      if (v.assignedTeamLeaderId) {
        await pushNotification(
          ctx.db,
          v.assignedTeamLeaderId,
          "visite",
          `Visite planifiée le ${when}`,
          `Visite de maintenance « ${contract.title} » — ${contract.address}, ${contract.city}.`,
        );
      }
      summary.visitReminders++;
    }

    // ---------- 3) Abonnements technicien expirés / expirant sous 7 jours ----------
    const profiles = await ctx.db.query("technicianProfiles").collect();
    const week = now + 7 * DAY;
    for (const p of profiles) {
      if (p.status !== "verifie" || !p.subscriptionUntil) continue;
      const until = p.subscriptionUntil;
      if (until <= now) {
        // Déjà expiré : un dernier rappel de renouvellement (chaque sweep le
        // ré-émettrait ; on borne via la notification la plus récente —
        // approche simple : seulement si aucune notif < 7 jours).
        const recent = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", p.userId))
          .collect();
        const hasRecent = recent.some(
          (n) =>
            n.kind === "abonnement" &&
            n.title === "Abonnement expiré" &&
            now - n.at < 7 * DAY,
        );
        if (!hasRecent) {
          await pushNotification(
            ctx.db,
            p.userId,
            "abonnement",
            "Abonnement expiré",
            "Votre abonnement GTEC PRO a expiré — renouvelez-le pour recevoir de nouvelles missions.",
          );
          summary.subsExpiring++;
        }
      } else if (until <= week) {
        const daysLeft = Math.max(1, Math.ceil((until - now) / DAY));
        const recent = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", p.userId))
          .collect();
        const hasRecent = recent.some(
          (n) =>
            n.kind === "abonnement" &&
            n.title === "Abonnement bientôt expiré" &&
            now - n.at < 3 * DAY,
        );
        if (!hasRecent) {
          await pushNotification(
            ctx.db,
            p.userId,
            "abonnement",
            "Abonnement bientôt expiré",
            `Votre abonnement expire dans ${daysLeft} jour(s). Renouvelez-le pour rester affectable sur les missions.`,
          );
          summary.subsExpiring++;
        }
      }
    }

    // ---------- 4) Dettes de commission (paiements cash, §24) ----------
    const debts = await ctx.db
      .query("gtecCommissions")
      .withIndex("by_status", (q) => q.eq("status", "due"))
      .collect();
    let debtReminders = 0;
    for (const c of debts) {
      if (!c.commissionDebt) continue;
      const deadline = c.commissionDebt.deadlineAt;
      const recent = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", c.techUserId))
        .collect();
      const overdue = deadline < now;
      const kind = overdue ? "commission_dette_en_retard" : "commission_dette";
      const hasRecent = recent.some(
        (n) =>
          n.kind === kind &&
          n.title === (overdue ? "Commission en retard" : "Commission à régulariser") &&
          now - n.at < (overdue ? 3 : 2) * DAY,
      );
      if (hasRecent) continue;
      await pushNotification(
        ctx.db,
        c.techUserId,
        kind,
        overdue ? "Commission en retard" : "Commission à régulariser",
        overdue
          ? `La commission de ${c.amount.toLocaleString("fr-FR")} FCFA devait être réglée — vos retraits et nouvelles missions restent bloqués jusqu'à régularisation.`
          : `Commission de ${c.amount.toLocaleString("fr-FR")} FCFA à régulariser avant le ${new Date(deadline).toLocaleDateString("fr-FR")} (paiement en espèces).`,
        c.requestId,
      );
      debtReminders++;
      if (overdue) {
        await pushAdmins(
          ctx.db,
          "general",
          "Dette de commission en retard",
          `Commission de ${c.amount.toLocaleString("fr-FR")} FCFA non réglée après échéance — intervention GTEC requise.`,
        );
      }
    }

    // ---------- Bilan pour l'administration ----------
    if (
      summary.quotesExpired > 0 ||
      summary.visitReminders > 0 ||
      summary.subsExpiring > 0
    ) {
      await pushAdmins(
        ctx.db,
        "general",
        "Sweep quotidien GTEC",
        `${summary.quotesExpired} devis expiré(s), ${summary.visitReminders} rappel(s) de visite, ${summary.subsExpiring} abonnement(s) à renouveler.`,
      );
    }

    return summary;
  },
});

/**
 * Sweep des dettes de commission (§24) : rappels au prestataire + escalade
 * admin au-delà de l'échéance. Idempotent via notification récente.
 */
export const commissionDebtSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    const debts = await ctx.db
      .query("gtecCommissions")
      .withIndex("by_status", (q) => q.eq("status", "due"))
      .collect();
    let reminded = 0;
    let overdue = 0;
    for (const c of debts) {
      if (!c.commissionDebt) continue;
      const isOverdue = c.commissionDebt.deadlineAt < now;
      const kind = isOverdue ? "commission_dette_en_retard" : "commission_dette";
      const title = isOverdue ? "Commission en retard" : "Commission à régulariser";
      const recent = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", c.techUserId))
        .collect();
      const hasRecent = recent.some(
        (n) => n.kind === kind && n.title === title && now - n.at < 2 * DAY,
      );
      if (hasRecent) continue;
      await ctx.db.insert("notifications", {
        userId: c.techUserId,
        kind,
        title,
        body: isOverdue
          ? `La commission de ${c.amount.toLocaleString("fr-FR")} FCFA est en retard — vos retraits et nouvelles missions restent bloqués jusqu'à régularisation.`
          : `Commission de ${c.amount.toLocaleString("fr-FR")} FCFA à régulariser avant le ${new Date(c.commissionDebt.deadlineAt).toLocaleDateString("fr-FR")} (paiement en espèces).`,
        requestId: c.requestId,
        at: now,
      });
      reminded++;
      if (isOverdue) overdue++;
    }
    if (overdue > 0) {
      const admins = await ctx.db
        .query("users")
        .filter((q: any) => q.eq(q.field("role"), "admin"))
        .collect();
      for (const a of admins) {
        await ctx.db.insert("notifications", {
          userId: a._id,
          kind: "general",
          title: "Dettes de commission en retard",
          body: `${overdue} commission(s) cash non régularisée(s) après échéance — intervention requise (Centre financier).`,
          at: now,
        });
      }
    }
    return { reminded, overdue };
  },
});

export default crons;
