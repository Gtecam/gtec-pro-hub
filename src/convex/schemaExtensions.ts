import { defineTable } from "convex/server";
import { v } from "convex/values";

/** ================================================================== */
/** 1. MODULE CONTRATS, COMMISSIONS ET FACTURATION (§1..§29)            */
/** ================================================================== */

/** Règles de commission (15 % figé, configurable admin, audit). */
export const commissionRules = defineTable({
  adminId: v.optional(v.id("users")),
  oldRatePercent: v.optional(v.number()),
  newRatePercent: v.number(),
  updatedAt: v.number(),
}).index("by_admin", ["adminId"])
.index("by_updatedAt", ["updatedAt"]);

/**Contrats contractuels (§14). */
export const contracts = defineTable({
  reference: v.string(), // GTEC-CTR-2026-NNNNNN
  type: v.string(), // "maintenance" | "avenant" | "curation" | "audit"
  modele: v.optional(v.string()),
  title: v.string(),
  clientId: v.id("users"),
  professionalId: v.id("users"),
  gtecId: v.optional(v.id("users")),
  description: v.optional(v.string()),
  durationMonths: v.number(),
  frequency: v.union(
    v.literal("mensuel"),
    v.literal("trimestriel"),
    v.literal("semestriel"),
    v.literal("annuel"),
    v.literal("personnalise"),
  ),
  frequencyCustom: v.optional(v.number()),
  amountHT: v.number(),
  commissionRatePercent: v.number(),
  commissionAmount: v.number(),
  netAmount: v.number(),
  currency: v.string(),
  paymentConditions: v.optional(v.string()),
  cancellationConditions: v.optional(v.string()),
  terminationConditions: v.optional(v.string()),
  liabilityConditions: v.optional(v.string()),
  repairConditions: v.optional(v.string()),
  complaintConditions: v.optional(v.string()),
  disputeConditions: v.optional(v.string()),
  annexes: v.optional(v.array(v.string())),
  nextVisitAt: v.optional(v.number()),
  schedule: v.optional(
    v.array(
      v.object({
        visitAt: v.number(),
        status: v.union(v.literal("planifiee"), v.literal("faite"), v.literal("annulee")),
      }),
    ),
  ),
  status: v.union(
    v.literal("brouillon"),
    v.literal("en_attente"),
    v.literal("active"),
    v.literal("suspendu"),
    v.literal("termine"),
    v.literal("annule"),
    v.literal("favorisé"),
  ),
  originalContractId: v.optional(v.id("contracts")),
  createdAt: v.number(),
  updatedAt: v.number(),
  version: v.number(),
  archived: v.optional(v.boolean()),
}).index("by_client", ["clientId"])
.index("by_professional", ["professionalId"])
.index("by_status", ["status"])
.index("by_reference", ["reference"]);

/** Gabarits de contrats (§5..§10). */
export const contractTemplates = defineTable({
  kind: v.string(),
  label: v.string(),
  description: v.optional(v.string()),
  clauses: v.string(),
  obligationsClient: v.optional(v.string()),
  obligationsPrestataire: v.optional(v.string()),
  conditionsPaiement: v.optional(v.string()),
  conditionsAnnulation: v.optional(v.string()),
  conditionsResiliation: v.optional(v.string()),
  active: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_kind", ["kind"])
.index("by_active", ["active"]);

/** Factures / avoirs (§16..§18). */
export const invoices = defineTable({
  reference: v.string(), // GTEC-FAC-2026-NNNNNN
  type: v.string(),
  contractId: v.optional(v.id("contracts")),
  requestId: v.optional(v.id("serviceRequests")),
  clientId: v.id("users"),
  professionalId: v.id("users"),
  issueDate: v.number(),
  dueDate: v.number(),
  paymentTerm: v.optional(v.number()),
  currency: v.string(),
  subTotal: v.number(),
  taxRate: v.number(),
  taxAmount: v.number(),
  discount: v.number(),
  totalHT: v.number(),
  totalTTCRef: v.number(),
  totalPaid: v.number(),
  remaining: v.number(),
  status: v.union(
    v.literal("a_venir"),
    v.literal("emise"),
    v.literal("en_attente"),
    v.literal("payee"),
    v.literal("en_retard"),
    v.literal("annulee"),
    v.literal("remboursee"),
  ),
  hashDocument: v.optional(v.string()),
  numVersion: v.optional(v.number()),
  pdfUrl: v.optional(v.string()),
  pdfUrlSigned: v.optional(v.string()),
  issuedById: v.optional(v.id("users")),
  issuedAt: v.optional(v.number()),
  validatedById: v.optional(v.id("users")),
  validatedAt: v.optional(v.number()),
}).index("by_client", ["clientId"])
.index("by_professional", ["professionalId"])
.index("by_status", ["status"])
.index("by_reference", ["reference"]);

export const invoiceItems = defineTable({
  invoiceId: v.id("invoices"),
  designation: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
  total: v.number(),
  lineTotal: v.number(),
  taxRate: v.number(),
  igrs: v.optional(v.number()),
}).index("by_invoice", ["invoiceId"]);

export const invoicePayments = defineTable({
  invoiceId: v.id("invoices"),
  amount: v.number(),
  method: v.union(
    v.literal("mtn_momo"),
    v.literal("orange_money"),
    v.literal("especes"),
    v.literal("virement"),
    v.literal("carte_visa"),
    v.literal("cinetpay"),
  ),
  payerPhone: v.string(),
  transactionRef: v.optional(v.string()),
  externalRef: v.optional(v.string()),
  status: v.union(v.literal("en_attente"), v.literal("valide"), v.literal("echoue")),
  proofPhotoUrl: v.optional(v.string()),
  collectedBy: v.optional(v.id("users")),
  collectedAt: v.optional(v.number()),
  at: v.number(),
}).index("by_invoice", ["invoiceId"])
.index("by_external_ref", ["externalRef"]);

export const invoiceSequences = defineTable({
  sequence: v.number(),
  lastRefNumber: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_sequence", ["sequence"]);

/** Commissions GTEC PRO (§1, §19). */
export const commissionRecords = defineTable({
  requestId: v.id("serviceRequests"),
  quoteId: v.optional(v.id("quotes")),
  contractId: v.optional(v.id("contracts")),
  invoiceId: v.optional(v.id("invoices")),
  clientId: v.id("users"),
  professionalId: v.id("users"),
  baseAmount: v.number(),
  ratePercent: v.number(),
  amount: v.number(),
  netAmount: v.number(),
  currency: v.string(),
  paymentId: v.optional(v.id("payments")),
  externalRef: v.optional(v.string()),
  paymentStatus: v.union(v.literal("en_attente"), v.literal("valide"), v.literal("echoue")),
  paymentMethod: v.optional(v.union(v.literal("mtn_momo"), v.literal("orange_money"), v.literal("especes"), v.literal("virement"))),
  payerPhone: v.optional(v.string()),
  disbursedAt: v.optional(v.number()),
  approvedById: v.optional(v.id("users")),
  approvedAt: v.optional(v.number()),
  version: v.number(),
}).index("by_request", ["requestId"])
.index("by_contract", ["contractId"])
.index("by_invoice", ["invoiceId"])
.index("by_professional", ["professionalId"])
.index("by_status", ["paymentStatus"]);

/** Signatures électroniques (§15). */
export const contractSignatures = defineTable({
  contractId: v.id("contracts"),
  version: v.number(),
  clientId: v.id("users"),
  professionalId: v.id("users"),
  gtecId: v.optional(v.id("users")),
  documentHash: v.string(),
  clientIp: v.optional(v.string()),
  clientUserAgent: v.optional(v.string()),
  professionalIp: v.optional(v.string()),
  clientSignedAt: v.number(),
  professionalSignedAt: v.optional(v.number()),
  clientAccepted: v.boolean(),
  professionalAccepted: v.boolean(),
  active: v.boolean(),
}).index("by_contract", ["contractId"])
.index("by_client", ["clientId"])
.index("by_professional", ["professionalId"]);

/** Avenants (§15). */
export const contractAmendments = defineTable({
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
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_contract", ["contractId"])
.index("by_version", ["version"]);

/** Documents archives (§23). */
export const documents = defineTable({
  type: v.string(),
  number: v.string(),
  reference: v.optional(v.string()),
  version: v.number(),
  documentHash: v.string(),
  clientId: v.id("users"),
  professionalId: v.id("users"),
  contractId: v.optional(v.id("contracts")),
  invoiceId: v.optional(v.id("invoices")),
  requestId: v.optional(v.id("serviceRequests")),
  label: v.string(),
  pdfUrl: v.string(),
  pdfUrlSigned: v.optional(v.string()),
  mimeType: v.string(),
  sizeBytes: v.number(),
  status: v.union(v.literal("actif"), v.literal("archive"), v.literal("supprimee")),
  createdAt: v.number(),
  updatedAt: v.number(),
  versionNumber: v.number(),
}).index("by_client", ["clientId"])
.index("by_professional", ["professionalId"])
.index("by_contract", ["contractId"])
.index("by_invoice", ["invoiceId"])
.index("by_number", ["number"])
.index("by_status", ["status"]);

export const documentVersions = defineTable({
  documentId: v.id("documents"),
  version: v.number(),
  pdfUrl: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  hash: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_document", ["documentId"]);

export const documentAccessLogs = defineTable({
  documentId: v.id("documents"),
  viewerId: v.id("users"),
  viewerRole: v.string(),
  viewerName: v.string(),
  accessedAt: v.number(),
  ip: v.optional(v.string()),
  userAgent: v.optional(v.string()),
}).index("by_document", ["documentId"])
.index("by_accessedAt", ["accessedAt"]);

// =====================================================================
// FUSION AVEC LE SCHÉMA PRINCIPAL
// =====================================================================

/** Table de fusion pour schema.ts (spread). */
export const extensionTables = {
  commissionRules,
  contracts,
  contractTemplates,
  invoices,
  invoiceItems,
  invoicePayments,
  invoiceSequences,
  creditNotes: undefined as unknown,
  commissionRecords,
  contractSignatures,
  contractAmendments,
  documents,
  documentVersions,
  documentAccessLogs,
};
