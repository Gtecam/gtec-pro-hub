import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { api } from "../_generated/api";

/**
 * Connexion par SMS (OTP à 6 chiffres) — numéro camerounais (+237).
 *
 * L'identifiant du compte est le numéro local à 9 chiffres (ex. "655094228").
 * À la vérification du code, Convex Auth écrit automatiquement
 * `users.phone` (identifiant) et `users.phoneVerified = true`.
 *
 * L'envoi SMS se fait via l'action existante `sms:sendSmsCode` (Twilio) ;
 * sans clés Twilio, l'API renvoie le code à l'écran (mode démo).
 */
export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: phone, token }, ctx) {
    // Chaque provider a sa propre clé optionnelle AUTH_PHONE_OTP_KEY.
    await ctx.runAction(api.sms.sendSmsCode, {
      phone,
      code: token,
      provider: "auth",
    });
  },
});
