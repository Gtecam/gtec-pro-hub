import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * E-mails transactionnels GTEC PRO — Resend.
 *
 * Chaque étape clé du parcours (devis, paiement, affectation, rapport,
 * facture…) écrit déjà une notification in-app. Ce module fournit une file
 * d'envoi : les notifications portant `emailQueued: true` sont envoyées par
 * l'action `flushEmails` (appelée par le client au chargement des espaces).
 *
 * Clé requise (onglet Clés / API keys du projet) : RESEND_API_KEY
 * Expéditeur par défaut : onboarding@resend.dev (à remplacer par un domaine
 * vérifié GTEC en production).
 */

/** Interne : crée la file d'un e-mail à partir d'une notification. */
export const enqueueEmail = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    requestId: v.optional(v.id("serviceRequests")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.email) return null;
    const emailId = await ctx.db.insert("emails", {
      userId: args.userId,
      to: user.email,
      kind: args.kind,
      title: args.title,
      body: args.body,
      requestId: args.requestId,
      sentAt: undefined,
    });
    return emailId;
  },
});

/** Interne : passe un e-mail en « envoyé ». */
export const markEmailSent = internalMutation({
  args: { emailId: v.id("emails"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailId, {
      sentAt: args.error ? undefined : Date.now(),
      error: args.error,
    });
  },
});
