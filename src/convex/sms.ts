import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Vérification du numéro de téléphone par code SMS (OTP) — Twilio.
 *
 * Le client demande un code à 6 chiffres, le reçoit par SMS, puis le saisit
 * dans l'application. Après 5 tentatives erronées, le code est invalidé.
 *
 * Clés requises (onglet Clés / API keys du projet) :
 *  - TWILIO_ACCOUNT_SID
 *  - TWILIO_AUTH_TOKEN
 *  - TWILIO_PHONE_NUMBER  (expéditeur SMS, ex. +2376XXXXXXX)
 *
 * Si les clés ne sont pas configurées, le mode démo renvoie le code à
 * l'écran (développement uniquement).
 */

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/** SHA-256 via Web Crypto (l'environnement Convex n'expose pas node:crypto). */
async function hashSha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalise un numéro camerounais en E.164 (+237XXXXXXXX). */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("237")) return `+${digits}`;
  if (digits.length === 9) return `+237${digits}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return null;
}

/** Envoi SMS bas niveau via l'API REST Twilio (pas de SDK nécessaire). */
async function sendSms(to: string, body: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    throw new Error(
      "SMS non configuré : ajoutez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_PHONE_NUMBER dans les clés du projet.",
    );
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  const data = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) {
    throw new Error(`Envoi SMS échoué : ${data.message ?? res.status}`);
  }
  return data.sid ?? "ok";
}

/** Interne : écrit le hash du code dans la table phoneVerifications. */
export const storeOtp = internalMutation({
  args: { userId: v.id("users"), phone: v.string(), codeHash: v.string() },
  handler: async (ctx, args) => {
    // Invalide les codes précédents.
    const existing = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of existing) {
      if (!row.consumedAt) await ctx.db.delete(row._id);
    }
    await ctx.db.insert("phoneVerifications", {
      userId: args.userId,
      phone: args.phone,
      codeHash: args.codeHash,
      attempts: 0,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
  },
});

/**
 * Demande un code de vérification : génère le code à 6 chiffres, le stocke
 * hashé, l'envoie par SMS et renvoie le mode (sms ou demo).
 */
export const sendSmsCode = action({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const e164 = toE164(args.phone);
 if (!e164) throw new Error("Numéro invalide. Format attendu : 6XX XX XX XX.");
    // Code à 6 chiffres + hash SHA-256 (web crypto, compatible Convex).
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hashSha256(code);
    await ctx.runMutation(internal.sms.storeOtp, {
      userId,
      phone: e164,
      codeHash,
    });
    const configured =
      !!process.env.TWILIO_ACCOUNT_SID &&
      !!process.env.TWILIO_AUTH_TOKEN &&
      !!process.env.TWILIO_PHONE_NUMBER;
    if (configured) {
      await sendSms(
        e164,
        `GTEC PRO : votre code de vérification est ${code}. Valable 10 minutes.`,
      );
      return { mode: "sms" as const };
    }
    // Mode démo : pas de clés Twilio configurées.
    return { mode: "demo" as const, code };
  },
});

/** Résultat de vérification côté client. */
export const verifySmsCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Non connecté.");
    const row = (
      await ctx.db
        .query("phoneVerifications")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter((r) => !r.consumedAt)[0];
    if (!row) throw new Error("Aucun code en attente. Demandez un nouveau code.");
    if (Date.now() > row.expiresAt) {
      await ctx.db.delete(row._id);
      throw new Error("Code expiré. Demandez un nouveau code.");
    }
    const codeHash = await hashSha256(args.code.trim());
    if (codeHash !== row.codeHash) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await ctx.db.delete(row._id);
        throw new Error("Trop de tentatives. Demandez un nouveau code.");
      }
      await ctx.db.patch(row._id, { attempts });
      throw new Error(`Code incorrect. ${MAX_ATTEMPTS - attempts} tentatives restantes.`);
    }
    await ctx.db.patch(row._id, { consumedAt: Date.now() });
    const user = await ctx.db.get(userId);
    if (user) {
      await ctx.db.patch(userId, { phone: row.phone, phoneVerified: true });
    }
  },
});

/** Statut de vérification du compte connecté (pour la bannière). */
export const myPhoneVerification = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      phone: user.phone ?? null,
      verified: user.phoneVerified ?? false,
    };
  },
});
