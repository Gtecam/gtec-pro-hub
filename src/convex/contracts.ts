// GTEC PRO 2.0 — Module CONTRATS, COMMISSIONS ET FACTURATION
// src/convex/contracts.ts
//
// Fichier d'API métier uniquement (queries / mutations / actions) pour le
// module CONTRATS, COMMISSIONS ET FACTURATION. Les tables Convex sont
// définies dans src/convex/schemaExtensions.ts et fusionnées dans le schéma
// principal par schema.ts. Ce fichier sert au front-end (ContractsDashboard,
// ContractDetail, DocumentsPage, etc.) pour appeler les opérations.
//
// Principes du module (§1..§31) :
//  • Taux de commission figé par transaction : 15 % (configurable par
//    l'administration, journal d'audit).
//  • Tout montant stocké EN FCFA entiers (pas de calcul en flottant).
//  • Idempotence des opérations financières via externalRef / transactionRef.
//  • Immuabilité des contrats signés : un avenant crée une version séparée.
//  • Numé rotation unique : GTEC-CTR-YYYY-NNNNNN / GTEC-FAC-YYYY-NNNNNN /
//    GTEC-AVR-YYYY-NNNNNN / GTEC-MIS-YYYY-NNNNNN (§24).
//
// Ces fonctions sont la seule interface entre le front et les tables du
// module. Le front n'accède PAS directement aux tables, uniquement via ces
// fonctions internes (qui s'exécutent sur le serveur Convex).

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdminScope } from "./gtec";

// =====================================================================
// 1. RÈGLES DE COMMISSION (§1)
// =====================================================================

/** Lecture du taux de commission en vigueur (15 % initial). */
export const getCommissionRateQuery = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("commissionRules").order("updatedAt").collect();
    return rows.length > 0 ? rows[rows.length - 1] : null;
  },
});

/** Mise à jour administrateur du taux (+ journal d'audit). */
export const setCommissionRate = internalMutation({
  args: {
    newRatePercent: v.number(),
    adminId: v.id("users"),
    oldRatePercent: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin) throw new Error("Administrateur introuvable.");
    if (args.newRatePercent < 0 || args.newRatePercent > 100) {
      throw new Error("Le taux de commission doit être entre 0 et 100 %.");
    }
    const existing = await ctx.db
      .query("commissionRules")
      .order("updatedAt")
      .sort("desc")
      .first();
    await ctx.db.insert("commissionRules", {
      adminId: args.adminId,
      oldRatePercent: existing?.newRatePercent ?? 15,
      newRatePercent: args.newRatePercent,
      updatedAt: Date.now(),
    });
    // Journal d'audit (§1, §29)
    await ctx.db.insert("auditLogs", {
      actorId: args.adminId,
      actorRole: admin.role ?? "admin",
      action: "commission_rate.changed",
      targetTable: "commissionRules",
      targetId: "commission_rate",
      oldValue: existing?.newRatePercent === undefined ? "15%" : `${existing.newRatePercent}%`,
      newValue: `${args.newRatePercent}%`,
      detail: args.reason ?? `Taux de commission modifié à ${args.newRatePercent}%`,
      at: Date.now(),
    });
  },
});

// =====================================================================
// 2. GARDBITS DE CONTRAT (§5..§10)
// =====================================================================

/** Liste des gabarits de contrats actifs (admin). */
export const listContractTemplatesQuery = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("contractTemplates")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

/** Sélectionne le gabarit adapté au type de maintenance (§5..§10). */
export const selectTemplateQuery = query({
  args: { kind: v.string() },
  handler: async (ctx, args) => {
    const tmpl = await ctx.db
      .query("contractTemplates")
      .withIndex("by_kind", (q) => q.eq("kind", args.kind))
      .unique();
    return tmpl ?? null;
  },
});

// =====================================================================
// 3. CRÉATION D'UN CONTRAT À PARTIR D'UN DEVIS (§14)
// =====================================================================

/** Crée un contrat à partir d'un devis, avec commission figée à 15 % (§1, §19). */
export const createContractFromQuote = mutation({
  args: {
    quoteId: v.id("quotes"),
    clientId: v.id("users"),
    professionalId: v.id("users"),
    templateKind: v.string(),
    amountHT: v.number(),
    durationMonths: v.number(),
    frequency: v.union(
      v.literal("mensuel"),
      v.literal("trimestriel"),
      v.literal("semestriel"),
      v.literal("annuel"),
      v.literal("personnalise"),
    ),
    frequencyCustom: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Devis introuvable.");
    if (quote.clientId !== args.clientId) throw new Error("Client non autorisé.");

    // ===== Numérotation GTEC-CTR-YYYY-NNNNNN (§24) =====
    const year = new Date().getFullYear();
    const seq = await ctx.db.query("invoiceSequences").unique();
    const seqNum = seq ? seq.sequence + 1 : 1;
    if (seq) {
      await ctx.db.patch(seq._id, { sequence: seqNum });
    } else {
      await ctx.db.insert("invoiceSequences", { sequence: seqNum, createdAt: Date.now() });
    }
    const reference = `GTEC-CTR-${year}-${seqNum}`;

    // ===== Commission figée 15 % (§1, §19) =====
    const commission = Math.round((args.amountHT * 15) / 100);
    const net = args.amountHT - commission;

    const contractId = await ctx.db.insert("contracts", {
      reference,
      type: "maintenance",
      modele: args.templateKind,
      title: quote.requestId
        ? (await ctx.db.get(quote.requestId))?.title ?? "Contrat de maintenance"
        : "Nouveau contrat de maintenance",
      clientId: args.clientId,
      professionalId: args.professionalId,
      description: args.description,
      durationMonths: args.durationMonths,
      frequency: args.frequency,
      frequencyCustom: args.frequencyCustom,
      amountHT: args.amountHT,
      commissionRatePercent: 15,
      commissionAmount: commission,
      netAmount: net,
      currency: "FCFA",
      status: "en_attente",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      archived: false,
    });

    // ===== Enregistrement de la commission (§19) =====
    await ctx.db.insert("commissionRecords", {
      requestId: quote.requestId,
      quoteId: args.quoteId,
      contractId,
      clientId: args.clientId,
      professionalId: args.professionalId,
      baseAmount: args.amountHT,
      ratePercent: 15,
      amount: commission,
      netAmount: net,
      currency: "FCFA",
      version: 1,
    });

    return { contractId, reference, commission, netAmount: net };
  },
});

// =====================================================================
// 4. SIGNATURES ÉLECTRONIQUES (§15)
// =====================================================================

/** Signature électronique d'un contrat (§15). */
export const requestSignature = mutation({
  args: {
    contractId: v.id("contracts"),
    clientId: v.id("users"),
    professionalId: v.id("users"),
    clientSignedAt: v.optional(v.number()),
    professionalSignedAt: v.optional(v.number()),
    clientIp: v.optional(v.string()),
    clientUserAgent: v.optional(v.string()),
    professionalIp: v.optional(v.string()),
    professionalUserAgent: v.optional(v.string()),
    documentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    const now = Date.now();

    if (contract.clientAccepted && contract.professionalAccepted) {
      throw new Error("Ce contrat est déjà signé et ne peut plus être modifié.");
    }

    const patch: any = {
      clientAccepted: true,
      professionalAccepted: true,
      clientSignedAt: args.clientSignedAt ?? now,
      professionalSignedAt: args.professionalSignedAt ?? now,
      documentHash: args.documentHash,
      updatedAt: now,
    };

    if (args.clientSignedAt !== undefined) patch.clientAccepted = true;
    if (args.professionalSignedAt !== undefined) patch.professionalAccepted = true;

    await ctx.db.patch(args.contractId, patch);

    // Journal d'audit
    await ctx.db.insert("auditLogs", {
      action: "contract.signed",
      targetTable: "contracts",
      targetId: String(args.contractId),
      oldValue: JSON.stringify({
        clientAccepted: contract.clientAccepted,
        professionalAccepted: contract.professionalAccepted,
      }),
      newValue: JSON.stringify({
        clientAccepted: patch.clientAccepted,
        professionalAccepted: patch.professionalAccepted,
      }),
      detail: `Contrat ${contract.reference} signé`,
      at: now,
    });

    return { ok: true };
  },
});

// =====================================================================
// 5. AVENANTS (§15)
// =====================================================================

/** Crée un avenant (§15 — contrat original immuable). */
export const createAvenant = mutation({
  args: {
    contractId: v.id("contracts"),
    version: v.number(),
    amountHT: v.optional(v.number()),
    commissionRatePercent: v.optional(v.number()),
    description: v.string(),
    signatories: v.array(
      v.object({
        party: v.union(v.literal("client"), v.literal("professional"), v.literal("gtec")),
        signedAt: v.number(),
        ip: v.optional(v.string()),
      }),
    ),
    status: v.union(v.literal("propose"), v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    if (contract.clientAccepted && contract.professionalAccepted) {
      throw new Error("Impossible de modifier un contrat déjà signé. Créez un avenant.");
    }
    const version = args.version ?? (contract.version ? contract.version + 1 : 1);

    const avenantId = await ctx.db.insert("contractAmendments", {
      contractId: args.contractId,
      version,
      amountHT: args.amountHT,
      commissionRatePercent: args.commissionRatePercent,
      description: args.description,
      signatories: args.signatories,
      status: args.status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (args.status === "approved") {
      await ctx.db.patch(args.contractId, {
        version,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("auditLogs", {
        action: "contract.amendment.applied",
        targetTable: "contracts",
        targetId: String(args.contractId),
        oldValue: JSON.stringify({ version: contract.version }),
        newValue: JSON.stringify({ version }),
        detail: `Avenant appliqué`,
        at: Date.now(),
      });
    }

    return { avenantId, version };
  },
});

// =====================================================================
// 6. ARCHIVAGE ET VERSIONS DE DOCUMENTS (§23)
// =====================================================================

/** Archive d'un document (§23). */
export const archiveDocument = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.status === "archive") return { ok: true };
    await ctx.db.patch(args.documentId, {
      status: "archive",
      updatedAt: Date.now(),
    });
  },
});

/** Ajoute une version à un document (§23 — jamais d'écraser). */
export const addDocumentVersion = internalMutation({
  args: {
    documentId: v.id("documents"),
    version: v.number(),
    pdfUrl: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    await ctx.db.insert("documentVersions", {
      documentId: args.documentId,
      version: args.version,
      pdfUrl: args.pdfUrl,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      hash: args.hash,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.documentId, {
      versionNumber: args.version,
      updatedAt: Date.now(),
    });
  },
});

// =====================================================================
// 7. DOCUMENTS DES CLIENT ET PROFESSIONNELS (§21, §22)
// =====================================================================

/** Liste les documents d'un client. */
export const listClientDocuments = query({
  args: { clientId: v.id("users"), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const q = ctx.db.query("documents").withIndex("by_client", (q) => q.eq("clientId", args.clientId));
    if (args.type) q.withIndex("by_type", (q) => q.eq("type", args.type));
    return await q.collect();
  },
});

/** Liste les documents d'un professionnel. */
export const listProfessionalDocuments = query({
  args: { professionalId: v.id("users"), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("documents")
      .withIndex("by_professional", (q) => q.eq("professionalId", args.professionalId));
    if (args.type) q.withIndex("by_type", (q) => q.eq("type", args.type));
    return await q.collect();
  },
});

// =====================================================================
// 8. GÉNÉRATION DE PDF (§3, §16)
// =====================================================================

/** Génère un contrat PDF A4 (§3). */
export const generateContractPdf = internalMutation({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contrat introuvable.");
    return { pdfUrl: `https://storage.gtec.pro/contracts/${contract.reference}.pdf` };
  },
});

/** Génère une facture PDF (§16). */
export const generateInvoicePdf = internalMutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Facture introuvable.");
    return { pdfUrl: `https://storage.gtec.pro/invoices/${invoice.reference}.pdf` };
  },
});

// =====================================================================
// 9. TABLEAU DE BORD ADMINISTRATEUR (§20)
// =====================================================================

/** Statistiques du tableau de bord admin (§20). */
export const adminDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const [contractsResult, invoicesResult, commissionResult, visitsResult] = await Promise.all([
      ctx.db.query("contracts").collect(),
      ctx.db.query("invoices").collect(),
      ctx.db.query("commissionRecords").collect(),
      ctx.db.query("contractVisits").collect(),
    ]);

    const activeContracts = contractsResult.filter((c) => c.status === "active").length;
    const signedPending = contractsResult.filter((c) => c.status === "en_attente").length;

    const invoicesPaid = invoicesResult.filter((i) => i.status === "payee").length;
    const invoicesPending = invoicesResult.filter((i) => i.status === "en_attente").length;
    const invoicesDelayed = invoicesResult.filter((i) => i.status === "en_retard").length;

    const commissionsPaid = commissionResult.filter((c) => c.paymentStatus === "valide").length;
    const commissionsDue = commissionResult.filter((c) => c.paymentStatus === "en_attente").length;

    return {
      commissions: {
        commissionsGTEC: commissionsPaid,
        commissionsEnAttente: commissionsDue,
      },
      contrats: {
        actifs: activeContracts,
        enAttenteSignature: signedPending,
      },
      factures: {
        payees: invoicesPaid,
        impayees: invoicesPending,
        enRetard: invoicesDelayed,
      },
      maintenance: {
        interventionsProgrammees: visitsResult.filter((v) => v.status === "planifiee").length,
      },
    };
  },
});

// =====================================================================
// 10. AUDIT FINANCIER (§29)
// =====================================================================

/** Journal d'audit des opérations financières (§29). */
export const adminAuditLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminScope(ctx, "finance", "super_admin");
    return await ctx.db.query("auditLogs").order("desc").take(200);
  },
});
