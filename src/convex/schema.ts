import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { extensionTables } from "./schemaExtensions";

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

/** GTEC PRO 2.0 : spécialisation des comptes administrateurs. */
export const ADMIN_ROLES = [
  "super_admin",
  "kyc",
  "finance",
  "missions",
  "support",
  "litiges",
  "moderation",
  "technique",
] as const;

export const adminRoleValidator = v.union(
  ...ADMIN_ROLES.map((r) => v.literal(r)),
);

// The schema definition object. The Convex CLI resolves the schema from
// `extensionTables` (spread into `schema.ts`) and validates it inside the
// `defineSchema` call below, so this module must only build and export that
// definition — never default-export the `SchemaDefinition` wrapper.
const schemaDefinition = defineSchema(
  {
    // default auth tables using convex auth. do not remove or modify
    ...authTables,

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      adminRole: v.optional(adminRoleValidator), // GTEC admin role (super_admin = all rights)
      accountType: v.optional(
        v.union(v.literal("client"), v.literal("technicien")),
      ), // Espace choisi à l'inscription : client ou technicien
      phone: v.optional(v.string()),
      city: v.optional(v.string()),

      // Identité complète du client (profil client)
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      phoneVerified: v.optional(v.boolean()), // OTP SMS
      nationalId: v.optional(v.string()), // CNI / passeport
      gender: v.optional(v.string()),
      birthDate: v.optional(v.string()), // YYYY-MM-DD
      altPhone: v.optional(v.string()),
      address: v.optional(v.string()),
      quarter: v.optional(v.string()),
      customerType: v.optional(v.string()), // particulier | professionnel | entreprise | institution
      companyName: v.optional(v.string()),
      taxId: v.optional(v.string()), // NUI / contribuable
      idDocumentUrl: v.optional(v.string()), // photo CNI (data URL)
      emergencyContact: v.optional(
        v.object({ name: v.string(), phone: v.string() }),
      ), // contact d'urgence (§2)
      prefLangue: v.optional(v.string()), // fr | en (préférences)
      prefNotifEmail: v.optional(v.boolean()),
      prefNotifSms: v.optional(v.boolean()),
    })
      .index("email", ["email"])
      .index("phone", ["phone"]),

    // service demandes de service
    serviceRequests: defineTable({
      clientId: v.id("users"),
      reference: v.string(), // GTC-0001
      serviceKey: v.string(),
      subcategory: v.optional(v.string()),
      title: v.string(),
      description: v.string(),
      address: v.string(),
      city: v.string(),
      photos: v.array(v.string()), // data URLs (V1, small)
      status: v.union(
        v.literal("nouvelle"),
        v.literal("devis_emis"),
        v.literal("devis_accepte"),
        v.literal("paye"),
        v.literal("affectee"),
        v.literal("en_intervention"),
        v.literal("rapport_emis"),
        v.literal("terminee"),
        v.literal("annulee"),
      ),
      scheduledAt: v.optional(v.number()),
      cancellationReason: v.optional(v.string()),
      coords: v.optional(
        v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
      ),
      coordsAt: v.optional(v.number()),
      specialtyCode: v.optional(v.string()), // NOMENCLATURE : spécialité professionnelle attendue (ex. ELEC-ELEC-IND…)
      requiredSkills: v.optional(v.array(v.string())), // compétences techniques requises
      interventionCode: v.optional(v.string()), // CATALOGUE : intervention choisie (code unique)
      beneficiaryId: v.optional(v.id("diasporaBeneficiaries")),
      isDiaspora: v.optional(v.boolean()), // mode diaspora : le demandeur est à l'étranger
      onSiteContact: v.optional(
        v.object({ name: v.string(), phone: v.string() }),
      ), // bénéficiaire à contacter sur place
      accessInstructions: v.optional(v.string()), // instructions d'accès au chantier
      beneficiaryValidation: v.optional(
        v.union(
          v.literal("en_attente"),
          v.literal("conforme"),
          v.literal("correction_demandee"),
          v.literal("probleme_signale"),
        ),
      ),
      beneficiaryValidationNote: v.optional(v.string()),
      beneficiaryValidatedAt: v.optional(v.number()),
      beneficiaryValidationCode: v.optional(v.string()), // code pour valider sans compte
      teamArrivalAt: v.optional(v.number()), // GÉO TERRAIN : arrivée de l'équipe confirmée
      teamArrivalCoords: v.optional(
        v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
      ), // GÉO TERRAIN : coordonnées d'arrivée
      interventionLabel: v.optional(v.string()), // libellé figé de l'intervention
      urgency: v.optional(
        v.union(v.literal("normale"), v.literal("urgente"), v.literal("critique")),
      ), // niveau d'urgence
      desiredDate: v.optional(v.number()), // date souhaitée d'intervention
      budgetHint: v.optional(v.number()), // budget indicatif client (FCFA)
      voiceNoteUrl: v.optional(v.string()), // message vocal (data URL)
      searchExpanded: v.optional(v.boolean()), // §11 : zone élargie (urgence sans réponse)
    })
      .index("by_client", ["clientId"])
      .index("by_status", ["status"])
      .index("by_reference", ["reference"]),

    quotes: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      authorId: v.optional(v.id("users")),
      authorRole: v.optional(
        v.union(v.literal("technicien"), v.literal("admin")),
      ), // auteur du devis
      number: v.string(), // DEV-0001
      items: v.array(
        v.object({ label: v.string(), qty: v.number(), unitPrice: v.number() }),
      ),
      subtotal: v.number(),
      vatRate: v.number(), // TVA Cameroun
      total: v.number(),
      currency: v.string(), // FCFA
      status: v.union(
        v.literal("emis"),
        v.literal("accepte"),
        v.literal("refuse"),
        v.literal("expire"),
      ),
      validUntil: v.number(),
      autoValidatedAt: v.optional(v.number()), // validation automatique GTEC
      version: v.optional(v.number()), // version du devis
      revisedFromId: v.optional(v.id("quotes")), // devis révisé
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"])
      .index("by_author", ["authorId"]),

    diasporaBeneficiaries: defineTable({
      ownerId: v.id("users"), // client diaspora
      firstName: v.string(),
      lastName: v.string(),
      phone: v.string(), // numéro camerounais du bénéficiaire
      relation: v.string(), // maman, papa, frère, sœur, locataire…
      city: v.string(),
      quarter: v.optional(v.string()), // quartier
      address: v.optional(v.string()),
      coords: v.optional(
        v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
      ),
      accessInstructions: v.optional(v.string()),
      onSiteContactName: v.optional(v.string()),
      onSiteContactPhone: v.optional(v.string()),
      archived: v.optional(v.boolean()),
    }).index("by_owner", ["ownerId"]),

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
        v.literal("carte_visa"),
      ),
      payerPhone: v.string(),
      status: v.union(
        v.literal("en_attente"),
        v.literal("valide"),
        v.literal("echoue"),
      ),
      externalRef: v.optional(v.string()),
      proofPhotoUrl: v.optional(v.string()),
      bankName: v.optional(v.string()),
      bankRef: v.optional(v.string()),
      cardLast4: v.optional(v.string()),
      international: v.optional(
        v.object({
          provider: v.union(v.literal("stripe"), v.literal("cinetpay_card")),
          amountMinor: v.number(),
          currency: v.string(),
          fxRateFromXaf: v.optional(v.number()),
          feeXaf: v.optional(v.number()),
          captured: v.optional(v.boolean()),
          providerRef: v.optional(v.string()),
        }),
      ),
      collectedBy: v.optional(v.id("users")),
      collectedAt: v.optional(v.number()),
      paidAt: v.optional(v.number()),
      milestone: v.optional(
        v.union(v.literal("avance"), v.literal("solde")),
      ),
      percent: v.optional(v.number()),
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"])
      .index("by_milestone", ["requestId", "milestone"]),

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
      partsUsed: v.array(v.object({ label: v.string(), qty: v.number() })),
      beforePhotos: v.array(v.string()),
      afterPhotos: v.array(v.string()),
      warrantyMonths: v.number(),
      recommendations: v.optional(v.string()),
      status: v.union(v.literal("transmis"), v.literal("receptionne")),
      receptionNote: v.optional(v.string()),
      clientSignature: v.optional(v.string()),
      receivedAt: v.optional(v.number()),
    }).index("by_request", ["requestId"]),

    invoices: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      number: v.string(),
      amount: v.number(),
      currency: v.string(),
      status: v.union(v.literal("emise"), v.literal("payee")),
      issuedAt: v.number(),
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"]),

    requestEvents: defineTable({
      requestId: v.id("serviceRequests"),
      kind: v.string(),
      label: v.string(),
      detail: v.optional(v.string()),
      at: v.number(),
    }).index("by_request", ["requestId"]),

    reviews: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      techUserId: v.id("users"),
      rating: v.number(),
      comment: v.optional(v.string()),
      at: v.number(),
    })
      .index("by_request", ["requestId"])
      .index("by_tech", ["techUserId"]),

    maintenanceContracts: defineTable({
      reference: v.string(),
      clientId: v.id("users"),
      serviceKey: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      frequency: v.union(
        v.literal("mensuel"),
        v.literal("trimestriel"),
        v.literal("semestriel"),
        v.literal("annuel"),
      ),
      monthlyAmount: v.number(),
      city: v.string(),
      address: v.string(),
      status: v.union(
        v.literal("actif"),
        v.literal("suspendu"),
        v.literal("expire"),
        v.literal("resilie"),
      ),
      startDate: v.number(),
      endDate: v.number(),
      nextVisitAt: v.optional(v.number()),
    })
      .index("by_client", ["clientId"])
      .index("by_status", ["status"]),

    contractVisits: defineTable({
      contractId: v.id("maintenanceContracts"),
      scheduledAt: v.number(),
      doneAt: v.optional(v.number()),
      assignedTeamLeaderId: v.optional(v.id("users")),
      report: v.optional(v.string()),
      status: v.union(
        v.literal("planifiee"),
        v.literal("faite"),
        v.literal("annulee"),
      ),
    })
      .index("by_contract", ["contractId"])
      .index("by_leader", ["assignedTeamLeaderId"]),

    contractPayments: defineTable({
      contractId: v.id("maintenanceContracts"),
      clientId: v.id("users"),
      periodIndex: v.number(),
      periodStart: v.number(),
      periodEnd: v.number(),
      amount: v.number(),
      currency: v.string(),
      method: v.union(
        v.literal("mtn_momo"),
        v.literal("orange_money"),
        v.literal("especes"),
        v.literal("virement"),
      ),
      payerPhone: v.string(),
      proofPhotoUrl: v.optional(v.string()),
      bankName: v.optional(v.string()),
      bankRef: v.optional(v.string()),
      status: v.union(
        v.literal("en_attente"),
        v.literal("valide"),
        v.literal("echoue"),
      ),
      externalRef: v.optional(v.string()),
      validatedAt: v.optional(v.number()),
    })
      .index("by_contract", ["contractId"])
      .index("by_client", ["clientId"])
      .index("by_status", ["status"]),

    technicianProfiles: defineTable({
      userId: v.id("users"),
      firstName: v.string(),
      lastName: v.string(),
      nationalId: v.string(),
      gender: v.optional(v.string()),
      birthDate: v.optional(v.string()),
      phone: v.string(),
      altPhone: v.optional(v.string()),
      city: v.string(),
      address: v.optional(v.string()),
      specialty: v.string(),
      profession: v.optional(v.string()),
      experienceYears: v.number(),
      currentEmployer: v.optional(v.string()),
      references: v.optional(v.string()),
      zones: v.array(v.string()),
      bio: v.optional(v.string()),
      documents: v.array(
        v.object({ kind: v.string(), label: v.string(), url: v.string() }),
      ),
      highestDegree: v.string(),
      fieldOfStudy: v.optional(v.string()),
      school: v.optional(v.string()),
      graduationYear: v.optional(v.number()),
      institutionId: v.optional(v.id("higherEducationInstitutions")),
      institutionRequestId: v.optional(v.id("institutionVerificationRequests")),
      credentialStatus: v.optional(
        v.union(
          v.literal("declare"),
          v.literal("en_attente"),
          v.literal("verifie"),
          v.literal("rejete"),
        ),
      ),
      status: v.union(
        v.literal("en_attente"),
        v.literal("verifie"),
        v.literal("rejete"),
      ),
      reviewNote: v.optional(v.string()),
      kycFlag: v.optional(v.string()),
      kycDocHashes: v.optional(v.array(v.string())),
      subscription: v.union(
        v.literal("aucun"),
        v.literal("mensuel"),
        v.literal("trimestriel"),
        v.literal("annuel"),
      ),
      subscriptionUntil: v.optional(v.number()),
      subscriptionPrice: v.optional(v.number()),
      lastLocation: v.optional(
        v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
      ),
      lastLocationAt: v.optional(v.number()),
      locationSharing: v.optional(v.boolean()),
      domainCode: v.optional(v.string()),
      specialtyCode: v.optional(v.string()),
      jobTitle: v.optional(v.string()),
      skills: v.optional(v.array(v.string())),
      degreeKey: v.optional(v.string()),
      degreeLevel: v.optional(v.string()),
      certifications: v.optional(v.array(v.string())),
      experienceBand: v.optional(v.string()),
      district: v.optional(v.string()),
      radiusKm: v.optional(v.number()),
      availability: v.optional(
        v.union(
          v.literal("disponible"),
          v.literal("occupe"),
          v.literal("hors_ligne"),
          v.literal("indisponible"),
          v.literal("en_intervention"),
          v.literal("conge"),
        ),
      ),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    materialRequests: defineTable({
      requestId: v.id("serviceRequests"),
      requestedById: v.id("users"),
      label: v.string(),
      qty: v.number(),
      status: v.union(
        v.literal("demande"),
        v.literal("approuve"),
        v.literal("commande"),
        v.literal("livre"),
        v.literal("refuse"),
      ),
      adminNote: v.optional(v.string()),
    })
      .index("by_request", ["requestId"])
      .index("by_status", ["status"]),

    subscriptionPayments: defineTable({
      profileId: v.id("technicianProfiles"),
      techUserId: v.id("users"),
      plan: v.union(
        v.literal("mensuel"),
        v.literal("trimestriel"),
        v.literal("annuel"),
      ),
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
      .index("by_profile", ["profileId"])
      .index("by_status", ["status"]),

    payouts: defineTable({
      techUserId: v.id("users"),
      requestId: v.id("serviceRequests"),
      amount: v.number(),
      sharePercent: v.number(),
      role: v.string(),
      status: v.union(v.literal("dû"), v.literal("payé")),
      paidAt: v.optional(v.number()),
      method: v.optional(v.string()),
    })
      .index("by_tech", ["techUserId", "status"])
      .index("by_request", ["requestId"]),

    gtecCommissions: defineTable({
      requestId: v.id("serviceRequests"),
      quoteId: v.id("quotes"),
      breakdown: v.optional(
        v.object({ teamAmount: v.number(), gtecAmount: v.number() }),
      ),
      techUserId: v.id("users"),
      baseAmount: v.number(),
      ratePercent: v.number(),
      amount: v.number(),
      currency: v.string(),
      status: v.union(v.literal("due"), v.literal("payee"), v.literal("exoneree")),
      method: v.optional(
        v.union(
          v.literal("mtn_momo"),
          v.literal("orange_money"),
          v.literal("virement"),
          v.literal("especes"),
        ),
      ),
      payerPhone: v.optional(v.string()),
      externalRef: v.optional(v.string()),
      paidAt: v.optional(v.number()),
      validatedBy: v.optional(v.id("users")),
      commissionDebt: v.optional(
        v.object({ deadlineAt: v.number(), remindedAt: v.optional(v.number()) }),
      ),
    })
      .index("by_tech", ["techUserId", "status"])
      .index("by_request", ["requestId"])
      .index("by_status", ["status"]),

    withdrawals: defineTable({
      userId: v.id("users"),
      sourceRole: v.union(v.literal("technicien"), v.literal("admin")),
      amount: v.number(),
      currency: v.string(),
      method: v.union(
        v.literal("mtn_momo"),
        v.literal("orange_money"),
        v.literal("especes"),
        v.literal("virement"),
      ),
      destination: v.string(),
      destinationLabel: v.optional(v.string()),
      status: v.union(
        v.literal("demande"),
        v.literal("approuve"),
        v.literal("payee"),
        v.literal("refuse"),
      ),
      requestedAt: v.number(),
      processedAt: v.optional(v.number()),
      processedBy: v.optional(v.id("users")),
      reference: v.string(),
      note: v.optional(v.string()),
    })
      .index("by_user", ["userId", "status"])
      .index("by_status", ["status"]),

    notifications: defineTable({
      userId: v.id("users"),
      title: v.string(),
      body: v.string(),
      kind: v.string(),
      requestId: v.optional(v.id("serviceRequests")),
      readAt: v.optional(v.number()),
      at: v.number(),
    }).index("by_user", ["userId"]),

    serviceCategories: defineTable({
      key: v.string(),
      label: v.string(),
      description: v.optional(v.string()),
      icon: v.optional(v.string()),
      subcategories: v.array(v.object({ key: v.string(), label: v.string() })),
      active: v.boolean(),
      sortOrder: v.number(),
    }).index("by_key", ["key"]),

    // Catalogue des interventions (12 pôles) : pôle → catégorie → intervention.
    serviceInterventions: defineTable({
      code: v.string(),
      serviceKey: v.string(),
      category: v.optional(v.string()),
      label: v.string(),
      subtitle: v.optional(v.string()),
      actions: v.array(v.string()),
      skills: v.array(v.string()),
      level: v.string(),
      duration: v.number(),
      durationUnit: v.string(),
      price: v.number(),
      currency: v.string(),
    }).index("by_serviceKey", ["serviceKey"]),

    // Litiges (§36-37) — ouverts par le client ou l'équipe sur une mission.
    disputes: defineTable({
      requestId: v.id("serviceRequests"),
      openedById: v.id("users"),
      category: v.union(
        v.literal("travaux_non_conformes"),
        v.literal("retard"),
        v.literal("paiement"),
        v.literal("comportement"),
        v.literal("materiel"),
        v.literal("devis"),
        v.literal("contrat"),
        v.literal("autre"),
      ),
      description: v.string(),
      attachments: v.optional(v.array(v.string())),
      status: v.union(
        v.literal("ouverte"),
        v.literal("en_cours"),
        v.literal("resolue"),
        v.literal("rejetee"),
      ),
      decision: v.optional(v.string()),
      resolvedById: v.optional(v.id("users")),
      resolvedAt: v.optional(v.number()),
    })
      .index("by_request", ["requestId"])
      .index("by_status", ["status"]),

    sanctions: defineTable({
      userId: v.id("users"),
      level: v.number(), // 1..5
      reason: v.string(),
      requestId: v.optional(v.id("serviceRequests")),
      status: v.union(
        v.literal("active"),
        v.literal("levee"),
        v.literal("contested"),
      ),
      until: v.optional(v.number()), // niveau 3 : suspension temporaire
      issuedById: v.id("users"),
      issuedAt: v.number(),
      contestReason: v.optional(v.string()),
      contestAt: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    auditLogs: defineTable({
      actorId: v.optional(v.id("users")),
      actorRole: v.optional(v.string()),
      action: v.string(),
      targetTable: v.optional(v.string()),
      targetId: v.optional(v.string()),
      oldValue: v.optional(v.string()),
      newValue: v.optional(v.string()),
      detail: v.optional(v.string()),
      at: v.number(),
    }).index("by_at", ["at"]),

    phoneVerifications: defineTable({
      userId: v.id("users"),
      phone: v.string(),
      codeHash: v.string(),
      attempts: v.number(),
      expiresAt: v.number(),
      consumedAt: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    authSmsEcho: defineTable({
      phone: v.string(),
      code: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
    }).index("by_phone", ["phone"]),

    emails: defineTable({
      userId: v.id("users"),
      to: v.string(),
      kind: v.string(),
      title: v.string(),
      body: v.string(),
      requestId: v.optional(v.id("serviceRequests")),
      sentAt: v.optional(v.number()),
      error: v.optional(v.string()),
    }).index("by_user", ["userId"]),

    momoTransactions: defineTable({
      paymentId: v.id("payments"),
      provider: v.union(v.literal("mtn"), v.literal("orange")),
      providerRef: v.string(),
      status: v.union(
        v.literal("en_attente"),
        v.literal("reussie"),
        v.literal("echouee"),
        v.literal("expiree"),
      ),
      amount: v.number(),
      currency: v.string(),
      payerPhone: v.string(),
      failureReason: v.optional(v.string()),
      lastCheckedAt: v.optional(v.number()),
    })
      .index("by_payment", ["paymentId"])
      .index("by_provider_ref", ["providerRef"]),

    // ================= ÉDUCATION — référentiel MINESUP (§2-§12, §17, §20-21) =====

    higherEducationInstitutions: defineTable({
      code: v.string(), // code unique (ex. UY1, ISTMA)
      name: v.string(),
      shortName: v.optional(v.string()),
      aliases: v.optional(v.array(v.string())), // anciennes appellations, acronymes
      institutionType: v.union(
        v.literal("STATE_UNIVERSITY"),
        v.literal("PRIVATE_UNIVERSITY"),
        v.literal("PUBLIC_SPECIAL_STATUS"),
        v.literal("PRIVATE_HIGHER_INSTITUTE"),
        v.literal("INTERNATIONAL_INSTITUTION"),
        v.literal("INTERSTATE_INSTITUTION"),
        v.literal("FOREIGN_RECOGNIZED_INSTITUTION"),
      ),
      ownership: v.union(
        v.literal("PUBLIC"),
        v.literal("PRIVATE"),
        v.literal("INTERNATIONAL"),
        v.literal("INTERSTATE"),
      ),
      region: v.union(
        v.literal("ADAMOUA"),
        v.literal("CENTRE"),
        v.literal("EST"),
        v.literal("EXTREME_NORD"),
        v.literal("LITTORAL"),
        v.literal("NORD"),
        v.literal("NORD_OUEST"),
        v.literal("OUEST"),
        v.literal("SUD"),
        v.literal("SUD_OUEST"),
      ),
      city: v.optional(v.string()),
      department: v.optional(v.string()),
      address: v.optional(v.string()),
      website: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      status: v.union(
        v.literal("ACTIVE"),
        v.literal("SUSPENDED"),
        v.literal("CLOSED"),
        v.literal("PENDING_VERIFICATION"),
        v.literal("HISTORICAL"),
      ),
      authorizationStatus: v.union(
        v.literal("AUTHORIZED"),
        v.literal("APPROVED"),
        v.literal("HOMOLOGATED"),
        v.literal("NOT_APPLICABLE"),
        v.literal("SUSPENDED"),
        v.literal("WITHDRAWN"),
        v.literal("UNKNOWN"),
      ),
      recognitionStatus: v.union(
        v.literal("RECOGNIZED"),
        v.literal("NOT_RECOGNIZED"),
        v.literal("UNDER_REVIEW"),
        v.literal("HISTORICAL"),
      ),
      canIssueNationalDiploma: v.optional(v.boolean()),
      canIssuePrivateDiploma: v.optional(v.boolean()),
      source: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      lastVerifiedAt: v.optional(v.number()),
      verifiedByAdminId: v.optional(v.id("users")),
      notes: v.optional(v.string()),
      isActive: v.boolean(),
    })
      .index("by_code", ["code"])
      .index("by_active", ["isActive"])
      .index("by_region", ["region"]),

    institutionStatusHistory: defineTable({
      institutionId: v.id("higherEducationInstitutions"),
      oldStatus: v.optional(v.string()),
      newStatus: v.string(),
      oldRecognitionStatus: v.optional(v.string()),
      newRecognitionStatus: v.optional(v.string()),
      decisionReference: v.optional(v.string()), // arrêté / décision MINESUP
      decisionDate: v.optional(v.number()),
      sourceUrl: v.optional(v.string()),
      reason: v.optional(v.string()),
      changedById: v.id("users"),
      at: v.number(),
    }).index("by_institution", ["institutionId"]),

    institutionVerificationRequests: defineTable({
      userId: v.id("users"),
      institutionName: v.string(),
      city: v.optional(v.string()),
      country: v.optional(v.string()),
      region: v.optional(v.string()),
      graduationYear: v.optional(v.number()),
      diplomaTitle: v.optional(v.string()),
      specialty: v.optional(v.string()),
      note: v.optional(v.string()),
      status: v.union(
        v.literal("PENDING"),
        v.literal("UNDER_REVIEW"),
        v.literal("APPROVED"),
        v.literal("REJECTED"),
      ),
      adminNote: v.optional(v.string()),
      reviewedById: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      institutionId: v.optional(v.id("higherEducationInstitutions")), // si APPROVED + création
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    educationalCredentials: defineTable({
      userId: v.id("users"),
      institutionId: v.optional(v.id("higherEducationInstitutions")),
      institutionName: v.string(),
      diplomaLevel: v.optional(v.string()),
      degreeKey: v.optional(v.string()),
      fieldOfStudy: v.optional(v.string()),
      specialtyTitle: v.optional(v.string()),
      diplomaTitle: v.optional(v.string()),
      graduationYear: v.optional(v.number()),
      certificateNumber: v.optional(v.string()),
      country: v.optional(v.string()),
      institutionCity: v.optional(v.string()),
      documentUrl: v.optional(v.string()),
      documentHash: v.optional(v.string()),
      verificationStatus: v.union(
        v.literal("declare"),
        v.literal("en_attente"),
        v.literal("verifie"),
        v.literal("rejete"),
      ),
      equivalenceStatus: v.union(
        v.literal("NOT_REQUIRED"),
        v.literal("PENDING"),
        v.literal("GRANTED"),
        v.literal("REJECTED"),
      ),
      reviewNote: v.optional(v.string()),
      verifiedAt: v.optional(v.number()),
      verifiedById: v.optional(v.id("users")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_institution", ["institutionId"])
      .index("by_status", ["verificationStatus"]),

    diplomaLevels: defineTable({
      code: v.string(),
      label: v.string(),
      rank: v.number(),
      active: v.boolean(),
    }).index("by_code", ["code"]),

    // ===== PROFIL ÉVOLUTIF — « dossier professionnel vivant » (§26) =====
    // Toute information a : status de vérification (DRAFT → SUBMITTED →
    // UNDER_REVIEW → VERIFIED/REJECTED), verifiedAt/verifiedBy, isActive,
    // createdAt/updatedAt. Une entrée vérifiée modifiée repasse en
    // SUBMITTED (nouvelle validation). Rien n'est jamais supprimé.
    professionalExperiences: defineTable({
      userId: v.id("users"),
      title: v.string(), // fonction / poste occupé
      company: v.optional(v.string()),
      domainCode: v.optional(v.string()),
      domainLabel: v.optional(v.string()),
      startDate: v.optional(v.string()), // YYYY-MM
      endDate: v.optional(v.string()),
      isCurrent: v.optional(v.boolean()),
      description: v.optional(v.string()),
      skillsUsed: v.optional(v.array(v.string())),
      achievements: v.optional(v.string()),
      city: v.optional(v.string()),
      photos: v.optional(v.array(v.string())),
      documentUrl: v.optional(v.string()),
      referenceName: v.optional(v.string()),
      referenceContact: v.optional(v.string()),
      status: v.union(
        v.literal("DRAFT"),
        v.literal("SUBMITTED"),
        v.literal("UNDER_REVIEW"),
        v.literal("VERIFIED"),
        v.literal("REJECTED"),
      ),
      verifiedAt: v.optional(v.number()),
      verifiedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    technicianSkills: defineTable({
      userId: v.id("users"),
      domainCode: v.optional(v.string()),
      domainLabel: v.optional(v.string()),
      jobTitle: v.optional(v.string()),
      skill: v.string(),
      level: v.optional(
        v.union(
          v.literal("DEBUTANT"),
          v.literal("INTERMEDIAIRE"),
          v.literal("AVANCE"),
          v.literal("EXPERT"),
        ),
      ),
      yearsPracticed: v.optional(v.number()),
      description: v.optional(v.string()),
      acquiredAt: v.optional(v.string()),
      documentUrl: v.optional(v.string()),
      status: v.union(
        v.literal("DRAFT"),
        v.literal("SUBMITTED"),
        v.literal("UNDER_REVIEW"),
        v.literal("VERIFIED"),
        v.literal("REJECTED"),
      ),
      verifiedAt: v.optional(v.number()),
      verifiedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    profileCertifications: defineTable({
      userId: v.id("users"),
      name: v.string(),
      organization: v.optional(v.string()),
      domainCode: v.optional(v.string()),
      domainLabel: v.optional(v.string()),
      number: v.optional(v.string()),
      obtainedAt: v.optional(v.number()),
      expiresAt: v.optional(v.number()),
      documentUrl: v.optional(v.string()),
      status: v.union(
        v.literal("DRAFT"),
        v.literal("SUBMITTED"),
        v.literal("UNDER_REVIEW"),
        v.literal("VERIFIED"),
        v.literal("REJECTED"),
      ),
      verifiedAt: v.optional(v.number()),
      verifiedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    trainingRecords: defineTable({
      userId: v.id("users"),
      name: v.string(),
      organization: v.optional(v.string()),
      domainCode: v.optional(v.string()),
      domainLabel: v.optional(v.string()),
      completedAt: v.optional(v.number()),
      durationHours: v.optional(v.number()),
      skillsAcquired: v.optional(v.array(v.string())),
      certificateUrl: v.optional(v.string()),
      status: v.union(
        v.literal("DRAFT"),
        v.literal("SUBMITTED"),
        v.literal("UNDER_REVIEW"),
        v.literal("VERIFIED"),
        v.literal("REJECTED"),
      ),
      verifiedAt: v.optional(v.number()),
      verifiedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    portfolioProjects: defineTable({
      userId: v.id("users"),
      title: v.string(),
      domainCode: v.optional(v.string()),
      domainLabel: v.optional(v.string()),
      description: v.optional(v.string()),
      installationType: v.optional(v.string()),
      completedAt: v.optional(v.number()),
      city: v.optional(v.string()),
      photosBefore: v.optional(v.array(v.string())),
      photosDuring: v.optional(v.array(v.string())),
      photosAfter: v.optional(v.array(v.string())),
      materialsUsed: v.optional(v.string()),
      skillsUsed: v.optional(v.array(v.string())),
      difficulty: v.optional(v.string()),
      outcome: v.optional(v.string()),
      isPublic: v.optional(v.boolean()), // afficher dans le profil public
      linkedRequestId: v.optional(v.id("serviceRequests")), // intervention GTEC PRO (client masqué)
      status: v.union(
        v.literal("DRAFT"),
        v.literal("SUBMITTED"),
        v.literal("UNDER_REVIEW"),
        v.literal("VERIFIED"),
        v.literal("REJECTED"),
      ),
      verifiedAt: v.optional(v.number()),
      verifiedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    profileChanges: defineTable({
      userId: v.id("users"),
      kind: v.string(), // ex. certification.add / certification.verified
      label: v.string(),
      oldValue: v.optional(v.string()),
      newValue: v.optional(v.string()),
      at: v.number(),
    }).index("by_user", ["userId"]),

    // Adresses enregistrées du client (§2 « MES ADRESSES »).
    clientAddresses: defineTable({
      userId: v.id("users"),
      label: v.string(), // « Domicile », « Bureau »…
      kind: v.union(
        v.literal("DOMICILE"),
        v.literal("BUREAU"),
        v.literal("COMMERCE"),
        v.literal("RESIDENCE_SECONDAIRE"),
        v.literal("AUTRE"),
      ),
      region: v.optional(v.string()),
      city: v.string(),
      quarter: v.optional(v.string()),
      address: v.string(),
      isDefault: v.optional(v.boolean()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    companies: defineTable({
      ownerUserId: v.id("users"),
      name: v.string(), // nom commercial
      legalName: v.optional(v.string()), // raison sociale
      rccm: v.optional(v.string()),
      niu: v.optional(v.string()),
      logoUrl: v.optional(v.string()),
      address: v.optional(v.string()),
      region: v.optional(v.string()),
      city: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      website: v.optional(v.string()),
      socials: v.optional(v.array(v.string())), // réseaux sociaux professionnels
      yearCreated: v.optional(v.number()),
      description: v.optional(v.string()),
      domains: v.optional(v.array(v.string())), // codes nomenclature GTEC PRO
      zones: v.optional(v.array(v.string())),
      capabilities: v.optional(v.string()), // capacités techniques, équipements, véhicules
      technicianCount: v.optional(v.number()),
      status: v.union(
        v.literal("DRAFT"),
        v.literal("SUBMITTED"),
        v.literal("UNDER_REVIEW"),
        v.literal("VERIFIED"),
        v.literal("REJECTED"),
      ),
      verifiedAt: v.optional(v.number()),
      verifiedBy: v.optional(v.id("users")),
      reviewNote: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner", ["ownerUserId"])
      .index("by_status", ["status"]),

    companyMembers: defineTable({
      companyId: v.id("companies"),
      userId: v.id("users"),
      role: v.string(), // fonction dans l'entreprise
      status: v.union(
        v.literal("INVITED"),
        v.literal("ACTIVE"),
        v.literal("DECLINED"),
      ),
      invitedAt: v.number(),
      respondedAt: v.optional(v.number()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_company", ["companyId"])
      .index("by_user", ["userId"]),

    // ============ EXTENSIONS GTEC PRO — DOSSIER TECHNIQUE (PHASES 2-4) ===========
    ...extensionTables,
  },
  { schemaValidation: false },
);

// Export the resolved schema definition so the Convex CLI can push it.
export default schemaDefinition;
