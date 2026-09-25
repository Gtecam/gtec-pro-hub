import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalAction, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

/**
 * Envoi des e-mails en attente via Resend (action Node).
 * Appelée par le client après les opérations clés (et au chargement des
 * espaces) pour vider la file — les notifications in-app restent la source
 * de vérité temps réel.
 */

type PendingEmail = {
  _id: string;
  to: string;
  kind: string;
  title: string;
  body: string;
};

function gtecEmailHtml(kind: string, title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f4f7f4;font-family:Segoe UI,Arial,sans-serif;color:#1c2b22;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3ece5;">
      <div style="background:#1c6b34;padding:18px 24px;color:#ffffff;">
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">GTEC PRO</span>
        <span style="display:block;font-size:12px;opacity:.85;">Du diagnostic au contrat, du chantier au paiement.</span>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#5c7a68;">${kind}</p>
        <h1 style="margin:0 0 10px;font-size:19px;">${title}</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#3d5246;">${body}</p>
      </div>
      <div style="padding:14px 24px;background:#f4f7f4;font-size:11px;color:#7a8f83;">
        Green Tech Energy Cameroon · GTEC PRO — Service clientèle : +237 655 09 42 28
      </div>
    </div>
  </body>
</html>`;
}

/** Interne : lit les e-mails non envoyés (max 20 par passage). */
export const pendingEmails = internalQuery({
  args: {},
  handler: async (ctx): Promise<PendingEmail[]> => {
    const rows = await ctx.db.query("emails").collect();
    return rows
      .filter((r) => !r.sentAt && !r.error)
      .slice(0, 20)
      .map((r) => ({
        _id: r._id,
        to: r.to,
        kind: r.kind,
        title: r.title,
        body: r.body,
      }));
  },
});

/**
 * Vue admin : derniers e-mails de la file (150 max), triés par priorité —
 * en attente d'abord, puis échecs, puis envoyés (plus récents en premier).
 * Renvoie null pour tout utilisateur non administrateur.
 */
export const adminListEmails = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const admin = await ctx.db.get(userId);
    if (!admin || admin.role !== "admin") return null;
    const rows = await ctx.db.query("emails").collect();
    const rank = (r: Pick<Doc<"emails">, "sentAt" | "error">) =>
      r.sentAt ? 2 : r.error ? 1 : 0;
    rows.sort((a, b) => rank(a) - rank(b) || (b.sentAt ?? 0) - (a.sentAt ?? 0));
    return Promise.all(
      rows.slice(0, 150).map(async (r) => {
        const user = await ctx.db.get(r.userId);
        return {
          _id: r._id,
          to: r.to,
          kind: r.kind,
          title: r.title,
          body: r.body,
          sentAt: r.sentAt,
          error: r.error,
          userName: user?.name ?? null,
        };
      }),
    );
  },
});

/**
 * Interne : drain de la file (webhook MoMo, cron) — sans session utilisateur.
 * Réutilise la logique d'envoi Resend du flush client.
 */
export const drainEmails = internalAction({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.runQuery(internal.emails.pendingEmails, {});
    if (pending.length === 0) return { sent: 0 };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: 0, skipped: "RESEND_API_KEY manquante" };
    let sent = 0;
    for (const email of pending) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || "GTEC PRO <onboarding@resend.dev>",
            to: [email.to],
            subject: `[GTEC PRO] ${email.title}`,
            html: gtecEmailHtml(email.kind, email.title, email.body),
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          await ctx.runMutation(internal.emailQueue.markEmailSent, {
            emailId: email._id as never,
            error: `HTTP ${res.status} : ${text.slice(0, 180)}`,
          });
          continue;
        }
        await ctx.runMutation(internal.emailQueue.markEmailSent, {
          emailId: email._id as never,
        });
        sent += 1;
      } catch (e) {
        await ctx.runMutation(internal.emailQueue.markEmailSent, {
          emailId: email._id as never,
          error: e instanceof Error ? e.message : "Erreur inconnue",
        });
      }
    }
    return { sent };
  },
});

/**
 * Admin : replace un e-mail en échec dans la file (efface l'erreur) pour un
 * nouvel essai au prochain passage de flushEmails.
 */
export const adminRetryEmail = mutation({
  args: { emailId: v.id("emails") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const admin = await ctx.db.get(userId);
    if (!admin || admin.role !== "admin") {
      throw new Error("Action réservée à l'administration.");
    }
    const email = await ctx.db.get(args.emailId);
    if (!email) throw new Error("E-mail introuvable.");
    if (!email.error) return;
    await ctx.db.patch(args.emailId, { error: undefined });
  },
});

export const flushEmails = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { sent: 0 };
    const pending = await ctx.runQuery(internal.emails.pendingEmails, {});
    if (pending.length === 0) return { sent: 0 };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Pas de clé configurée : on laisse la file telle quelle (mode démo).
      return { sent: 0, skipped: "RESEND_API_KEY manquante" };
    }
    let sent = 0;
    for (const email of pending) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || "GTEC PRO <onboarding@resend.dev>",
            to: [email.to],
            subject: `[GTEC PRO] ${email.title}`,
            html: gtecEmailHtml(email.kind, email.title, email.body),
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          await ctx.runMutation(internal.emailQueue.markEmailSent, {
            emailId: email._id as never,
            error: `HTTP ${res.status} : ${text.slice(0, 180)}`,
          });
          continue;
        }
        await ctx.runMutation(internal.emailQueue.markEmailSent, {
          emailId: email._id as never,
        });
        sent += 1;
      } catch (e) {
        await ctx.runMutation(internal.emailQueue.markEmailSent, {
          emailId: email._id as never,
          error: e instanceof Error ? e.message : "Erreur inconnue",
        });
      }
    }
    return { sent };
  },
});
