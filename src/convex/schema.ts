import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // GTEC PRO
      phone: v.optional(v.string()),
      city: v.optional(v.string()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---- GTEC PRO V1 : one end-to-end client journey ----
    // demande -> devis -> paiement -> affectation -> intervention -> rapport -> réception -> facture

    serviceRequests: defineTable({
      clientId: v.id("users"),
      reference: v.string(), // GTC-0001
      serviceKey: v.string(), // electricite | plomberie | solaire | cctv | climatisation | maintenance
      title: v.string(),
      description: v.string(),
      address: v.string(),
      city: v.string(),
      photos: v.array(v.string()), // data URLs (V1, small)
      status: v.union(
        v.literal("nouvelle"), // demande créée, en attente de devis
        v.literal("devis_emis"), // devis envoyé, en attente d'acceptation
        v.literal("devis_accepte"), // client a accepté, en attente de paiement
        v.literal("paye"), // paiement validé, en attente d'affectation
        v.literal("affectee"), // équipe affectée, intervention planifiée
        v.literal("en_intervention"), // travaux en cours
        v.literal("rapport_emis"), // rapport transmis, attente réception client
        v.literal("terminee"), // PV signé, facture émise
        v.literal("annulee"), // client ou GTEC a annulé
      ),
      scheduledAt: v.optional(v.number()),
      cancellationReason: v.optional(v.string()),
    })
      .index("by_client", ["clientId"])
      .index("by_status", ["status"])
      .index("by_reference", ["reference"]),

    quotes: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      number: v.string(), // DEV-0001
      items: v.array(
        v.object({
          label: v.string(),
          qty: v.number(),
          unitPrice: v.number(),
        }),
      ),
      subtotal: v.number(),
      vatRate: v.number(), // e.g. 19.25 (Cameroun)
      total: v.number(),
      currency: v.string(), // FCFA
      status: v.union(
        v.literal("emis"),
        v.literal("accepte"),
        v.literal("refuse"),
        v.literal("expire"),
      ),
      validUntil: v.number(),
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"]),

    payments: defineTable({
      quoteId: v.id("quotes"),
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      amount: v.number(),
      currency: v.string(),
      method: v.union(
        v.literal("mtn_momo"),
        v.literal("orange_money"),
        v.literal("especes"),
        v.literal("virement"),
      ),
      payerPhone: v.string(),
      status: v.union(
        v.literal("en_attente"),
        v.literal("valide"),
        v.literal("echoue"),
      ),
      externalRef: v.optional(v.string()),
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"]),

    assignments: defineTable({
      requestId: v.id("serviceRequests"),
      teamLeaderId: v.id("users"),
      members: v.array(v.object({ id: v.id("users"), role: v.string() })),
      scheduledAt: v.number(),
      notes: v.optional(v.string()),
      status: v.union(
        v.literal("planifiee"),
        v.literal("en_cours"),
        v.literal("terminee"),
      ),
    }).index("by_request", ["requestId"]),

    interventionReports: defineTable({
      requestId: v.id("serviceRequests"),
      assignmentId: v.id("assignments"),
      workDone: v.string(),
      partsUsed: v.array(
        v.object({ label: v.string(), qty: v.number() }),
      ),
      beforePhotos: v.array(v.string()),
      afterPhotos: v.array(v.string()),
      warrantyMonths: v.number(),
      recommendations: v.optional(v.string()),
      status: v.union(
        v.literal("transmis"),
        v.literal("receptionne"),
      ),
      receptionNote: v.optional(v.string()),
      clientSignature: v.optional(v.string()), // data URL du PV
      receivedAt: v.optional(v.number()),
    }).index("by_request", ["requestId"]),

    invoices: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      number: v.string(), // FAC-0001
      amount: v.number(),
      currency: v.string(),
      status: v.union(v.literal("emise"), v.literal("payee")),
      issuedAt: v.number(),
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"]),

    requestEvents: defineTable({
      requestId: v.id("serviceRequests"),
      kind: v.string(), // demande, devis, paiement, affectation, intervention, rapport, reception, facture, annulation
      label: v.string(),
      detail: v.optional(v.string()),
      at: v.number(),
    }).index("by_request", ["requestId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
