import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser, notify } from "./gtec";

/**
 * GTEC PRO — MISSIONS AVANCÉES (F°10, F°12, F°13).
 *  - Check-list technique générée par spécialité ; les items obligatoires
 *    doivent être validés avant la clôture (garde serveur dans gtec.ts) ;
 *  - Certificat numérique d'intervention : hash SHA-256 des preuves + token
 *    QR de vérification publique (/verify/:token) ;
 *  - Garantie de travaux : période ACTIVE pendant laquelle un signalement est
 *    automatiquement rattaché à la mission d'origine.
 */

const nextNumber = async (ctx: any, count: number): Promise<string> => {
  const n = count + 1;
  return `CERT-${String(n).padStart(4, "0")}`;
};

// Item par défaut selon le service (l'équipe peut en ajouter à la volée).
const DEFAULT_CHECKLIST: Record<string, string[]> = {
  elec: [
    "Couper l'alimentation et condamner",
    "Vérifier l'absence de tension (VAT)",
    "Port des EPI (gants, écran facial)",
    "Contrôle de la mise à la terre",
    "Serrage des connexions",
    "Test final de fonctionnement",
    "Photos avant / après",
  ],
  froid: [
    "Consigner l'appareil et couper l'alimentation",
    "Contrôle des pressions frigorifiques",
    "Recherche de fuite",
    "Port des EPI",
    "Test de refroidissement",
    "Photos avant / après",
  ],
  ene: [
    "Consignation DC/AC (onduleur, batteries)",
    "Contrôle visuel des modules et câblage",
    "Mesures de production (Voc, Vmp)",
    "Port des EPI (travail en hauteur)",
    "Test de charge",
    "Photos avant / après",
  ],
};

const GENERIC_CHECKLIST = [
  "Sécuriser la zone d'intervention",
  "Port des EPI",
  "Test de fonctionnement",
  "Photos avant / après",
  "Nettoyage du chantier",
];

/** Ajoute des items par défaut si la check-list vient d'être créée. */
async function seedItems(ctx: any, checklistId: any, serviceKey: string | undefined) {
  const labels =
    (serviceKey && DEFAULT_CHECKLIST[serviceKey]) ??
    DEFAULT_CHECKLIST[Object.keys(DEFAULT_CHECKLIST).find((k) => serviceKey?.startsWith(k)) ?? ""] ??
    GENERIC_CHECKLIST;
  for (const label of labels) {
    await ctx.db.insert("checklistItems", {
      checklistId,
      label,
      mandatory: true,
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

/** Lit la check-list d'une mission (lecture seule — création via ensureMissionChecklist). */
export const getMissionChecklist = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = (await ctx.db.get(args.requestId)) as Doc<"serviceRequests"> | null;
    if (!request) throw new Error("Mission introuvable.");
    const assignment = (
      (await ctx.db
        .query("assignments")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const isMember = assignment?.members?.some((m: any) => m.id === user._id);
    if (request.clientId !== user._id && !isMember && user.role !== "admin")
      throw new Error("Accès refusé à cette mission.");
    const checklist = (
      (await ctx.db
        .query("missionChecklists")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    )[0];
    if (!checklist) return { checklist: null, items: [] as any[] };
    const items = (
      (await ctx.db
        .query("checklistItems")
        .withIndex("by_checklist", (q: any) => q.eq("checklistId", checklist._id))
        .collect()) as any[]
    ).sort((a, b) => a.createdAt - b.createdAt);
    return { checklist, items };
  },
});

/** Crée la check-list (items par spécialité) si la mission n'en a pas encore. */
export const ensureMissionChecklist = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = (await ctx.db.get(args.requestId)) as Doc<"serviceRequests"> | null;
    if (!request) throw new Error("Mission introuvable.");
    const assignment = (
      (await ctx.db
        .query("assignments")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const isMember = assignment?.members?.some((m: any) => m.id === user._id);
    if (!isMember && user.role !== "admin") throw new Error("Réservé à l'équipe de la mission.");
    const existing = (
      (await ctx.db
        .query("missionChecklists")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    )[0];
    if (existing) return;
    const id = await ctx.db.insert("missionChecklists", {
      requestId: args.requestId,
      assignmentId: assignment?._id,
      status: "ACTIVE",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await seedItems(ctx, id, request.serviceKey);
  },
});

/** Coche/décoche un item (technicien affecté uniquement). */
export const toggleChecklistItem = mutation({
  args: { itemId: v.id("checklistItems"), done: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = (await ctx.db.get(args.itemId)) as Doc<"checklistItems"> | null;
    if (!item) throw new Error("Item introuvable.");
    const checklist = (await ctx.db.get(item.checklistId)) as Doc<"missionChecklists"> | null;
    if (!checklist) throw new Error("Check-list introuvable.");
    const assignment = (
      (await ctx.db
        .query("assignments")
        .withIndex("by_request", (q: any) => q.eq("requestId", checklist.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const isMember = assignment?.members?.some((m: any) => m.id === user._id);
    if (!isMember && user.role !== "admin") throw new Error("Réservé à l'équipe de la mission.");
    await ctx.db.patch(args.itemId, {
      done: args.done,
      doneAt: args.done ? Date.now() : undefined,
      doneBy: args.done ? user._id : undefined,
      updatedAt: Date.now(),
    });
    if (args.done) {
      const all = ((await ctx.db
        .query("checklistItems")
        .withIndex("by_checklist", (q: any) => q.eq("checklistId", item.checklistId))
        .collect()) as any[]).filter((i) => i.mandatory);
      if (all.length > 0 && all.every((i) => i.done)) {
        await ctx.db.patch(checklist._id, { status: "COMPLETE", updatedAt: Date.now() });
      }
    } else if (checklist.status === "COMPLETE") {
      await ctx.db.patch(checklist._id, { status: "ACTIVE", updatedAt: Date.now() });
    }
  },
});

/** Le chef d'équipe personnalise la check-list : ajout d'un item (F°10). */
export const addChecklistItem = mutation({
  args: { requestId: v.id("serviceRequests"), label: v.string(), mandatory: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = (
      (await ctx.db
        .query("assignments")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const isLeader = assignment?.teamLeaderId === user._id;
    if (!isLeader && user.role !== "admin") throw new Error("Réservé au chef de mission.");
    const label = args.label.trim();
    if (label.length < 3) throw new Error("Libellé trop court.");
    const checklist = (
      (await ctx.db
        .query("missionChecklists")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    )[0];
    if (!checklist) throw new Error("La check-list sera disponible dès le début de la mission.");
    await ctx.db.insert("checklistItems", {
      checklistId: checklist._id,
      label,
      mandatory: args.mandatory ?? false,
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// =================== CERTIFICAT NUMÉRIQUE D'INTERVENTION ====================

/**
 * Émet le certificat numérique après réception client (statut « terminee ») :
 * hash SHA-256 des preuves + token QR. Idempotent : un seul certificat par mission.
 */
export const issueDigitalCertificate = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = (await ctx.db.get(args.requestId)) as Doc<"serviceRequests"> | null;
    if (!request) throw new Error("Mission introuvable.");
    const existing = (await ctx.db
      .query("digitalCertificates")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect()) as any[];
    if (existing.length > 0) return existing[0]._id;
    const assignment = (
      (await ctx.db
        .query("assignments")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const isMember = assignment?.members?.some((m: any) => m.id === user._id);
    if (request.clientId !== user._id && !isMember && user.role !== "admin")
      throw new Error("Action non autorisée.");
    const report = (
      (await ctx.db
        .query("interventionReports")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const review = (
      (await ctx.db
        .query("reviews")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    )[0];
    const checklist = (
      (await ctx.db
        .query("missionChecklists")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    )[0];
    const payload = {
      reference: request.reference,
      intervention: request.interventionLabel ?? request.title,
      city: request.city,
      finishedAt: Date.now(),
      teamLeader: assignment?.teamLeaderId ?? null,
      teamSize: assignment?.members?.length ?? 0,
      workDone: report?.workDone ?? null,
      warrantyMonths: report?.warrantyMonths ?? null,
      checklistComplete: checklist?.status === "COMPLETE",
      photosAfter: report?.afterPhotos?.length ?? 0,
      clientSigned: !!report?.clientSignature,
      clientRating: review?.rating ?? null,
    };
    const payloadJson = JSON.stringify(payload);
    // SHA-256 via Web Crypto (runtime Convex — pas de node:crypto).
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadJson));
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const certCount = (await ctx.db.query("digitalCertificates").collect()).length;
    await ctx.db.insert("digitalCertificates", {
      requestId: args.requestId,
      number: await nextNumber(ctx, certCount),
      verifyToken: crypto.randomUUID().replace(/-/g, ""),
      payloadHash: hash,
      payload: payloadJson,
      issuedAt: Date.now(),
    });
  },
});

/** Certificat d'une mission (affiché au client et à l'équipe). */
export const getCertificateByRequest = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = (await ctx.db.get(args.requestId)) as Doc<"serviceRequests"> | null;
    if (!request) throw new Error("Mission introuvable.");
    const assignment = (
      (await ctx.db
        .query("assignments")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const isMember = assignment?.members?.some((m: any) => m.id === user._id);
    if (request.clientId !== user._id && !isMember && user.role !== "admin")
      throw new Error("Accès refusé.");
    return (
      (await ctx.db
        .query("digitalCertificates")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    )[0] ?? null;
  },
});

/** Vérification publique du certificat : /verify/:token (données minimales). */
export const verifyCertificate = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const cert = (await ctx.db
      .query("digitalCertificates")
      .withIndex("by_token", (q: any) => q.eq("verifyToken", args.token))
      .first()) as Doc<"digitalCertificates"> | null;
    if (!cert) return null;
    const payload = JSON.parse(cert.payload) as Record<string, unknown>;
    return {
      number: cert.number,
      issuedAt: cert.issuedAt,
      payloadHash: cert.payloadHash,
      reference: (payload.reference as string | undefined) ?? null,
      intervention: (payload.intervention as string | undefined) ?? null,
      city: (payload.city as string | undefined) ?? null,
      checklistComplete: (payload.checklistComplete as boolean | undefined) ?? false,
      clientSigned: (payload.clientSigned as boolean | undefined) ?? false,
    };
  },
});

// ========================= GARANTIE DE TRAVAUX (F°13) =======================

/**
 * Ouvre la garantie de travaux à la réception client (30 jours par défaut,
 * durée = garantie du rapport). Idempotent. Appelée après clientReception.
 */
export const ensureWorkGuarantee = mutation({
  args: { requestId: v.id("serviceRequests"), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = (await ctx.db.get(args.requestId)) as Doc<"serviceRequests"> | null;
    if (!request) throw new Error("Mission introuvable.");
    if (request.clientId !== user._id && user.role !== "admin")
      throw new Error("Action non autorisée.");
    const existing = (await ctx.db
      .query("workGuarantees")
      .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
      .collect()) as any[];
    if (existing.length > 0) return;
    const report = (
      (await ctx.db
        .query("interventionReports")
        .withIndex("by_request", (q: any) => q.eq("requestId", args.requestId))
        .collect()) as any[]
    ).slice(-1)[0];
    const days = Math.min(Math.max(args.days ?? Math.round((report?.warrantyMonths ?? 1) * 30), 7), 365);
    const startedAt = Date.now();
    await ctx.db.insert("workGuarantees", {
      requestId: args.requestId,
      clientId: request.clientId,
      startedAt,
      days,
      until: startedAt + days * 86400000,
      status: "ACTIVE",
      isActive: true,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
  },
});

/** Garanties actives du client (signalement pendant la période → mission d'origine). */
export const myActiveGuarantees = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = (await ctx.db
      .query("workGuarantees")
      .withIndex("by_client", (q: any) => q.eq("clientId", user._id))
      .collect()) as any[];
    const now = Date.now();
    const active = rows.filter((g) => g.status === "ACTIVE" && g.until > now);
    const out = await Promise.all(
      active.map(async (g) => {
        const request = (await ctx.db.get(g.requestId as never)) as Doc<"serviceRequests"> | null;
        return {
          _id: g._id as string,
          requestId: g.requestId as string,
          reference: request?.reference ?? "",
          title: request?.interventionLabel ?? request?.title ?? "",
          until: g.until as number,
          days: g.days as number,
        };
      }),
    );
    return out;
  },
});
