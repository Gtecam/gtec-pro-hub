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
      /** Espace choisi à l'inscription : "client" (défaut) ou "technicien". */
      accountType: v.optional(v.union(v.literal("client"), v.literal("technicien"))),
      phone: v.optional(v.string()),
      city: v.optional(v.string()),

      // Identité complète du client (profil client)
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      nationalId: v.optional(v.string()), // CNI / passeport
      gender: v.optional(v.string()),
      birthDate: v.optional(v.string()), // YYYY-MM-DD
      altPhone: v.optional(v.string()),
      address: v.optional(v.string()),
      quarter: v.optional(v.string()), // quartier
      customerType: v.optional(v.string()), // particulier | professionnel | entreprise | hotel | industrie | promoteur | institution (7 types GTEC)
      companyName: v.optional(v.string()),
      taxId: v.optional(v.string()), // NUI / contribuable
      idDocumentUrl: v.optional(v.string()), // photo CNI (data URL)
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---- GTEC PRO V1 : one end-to-end client journey ----
    // demande -> devis -> paiement -> affectation -> intervention -> rapport -> réception -> facture

    serviceRequests: defineTable({
      clientId: v.id("users"),
      reference: v.string(), // GTC-0001
      serviceKey: v.string(), // electricite | plomberie | solaire | cctv | climatisation | maintenance
      subcategory: v.optional(v.string()), // type de problème choisi dans la catégorie
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
        v.literal("carte_visa"),
      ),
      payerPhone: v.string(),
      status: v.union(
        v.literal("en_attente"),
        v.literal("valide"),
        v.literal("echoue"),
      ),
      externalRef: v.optional(v.string()),

      // Preuves & références (cash, virement, carte)
      proofPhotoUrl: v.optional(v.string()), // reçu/reçu de paiement (data URL)
      bankName: v.optional(v.string()),
      bankRef: v.optional(v.string()), // référence transaction bancaire
      cardLast4: v.optional(v.string()), // 4 derniers chiffres Visa
      collectedBy: v.optional(v.id("users")), // technicien encaisseur (cash)
      collectedAt: v.optional(v.number()),
      paidAt: v.optional(v.number()), // date réelle d'encaissement (démo/rapports)
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

    /** Avis client sur une intervention terminée (1 seul par demande). */
    reviews: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      /** Technicien ciblé : le chef d'équipe de la mission. */
      techUserId: v.id("users"),
      rating: v.number(), // 1 à 5
      comment: v.optional(v.string()),
      at: v.number(),
    })
      .index("by_request", ["requestId"])
      .index("by_tech", ["techUserId"]),

    // ===================== V2 : contrats de maintenance =====================

    /**
     * Contrat de maintenance préventive — visites périodiques planifiées
     * (ex. : entretien clim 4 fois/an, contrôle électrique semestriel).
     */
    maintenanceContracts: defineTable({
      reference: v.string(), // CTR-0001
      clientId: v.id("users"),
      serviceKey: v.string(), // pôle couvert par le contrat
      title: v.string(),
      description: v.optional(v.string()),
      /** Fréquence des visites. */
      frequency: v.union(
        v.literal("mensuel"),
        v.literal("trimestriel"),
        v.literal("semestriel"),
        v.literal("annuel"),
      ),
      /** Montant annuel ou par visite, en FCFA. */
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
      /** Dernière / prochaine visite planifiée. */
      nextVisitAt: v.optional(v.number()),
    })
      .index("by_client", ["clientId"])
      .index("by_status", ["status"]),

    /** Visite de maintenance réalisée ou planifiée dans un contrat. */
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
    }).index("by_contract", ["contractId"])
      .index("by_leader", ["assignedTeamLeaderId"]),

    // ---- Espace technicien (V1.1) ----

    /** Profil de candidature technicien — un par utilisateur. */
    technicianProfiles: defineTable({
      userId: v.id("users"),

      // Identité
      firstName: v.string(),
      lastName: v.string(),
      nationalId: v.string(), // CNI / passeport
      gender: v.optional(v.string()),
      birthDate: v.optional(v.string()), // YYYY-MM-DD
      phone: v.string(),
      altPhone: v.optional(v.string()),
      city: v.string(), // ville de résidence
      address: v.optional(v.string()),

      // Profession
      specialty: v.string(), // ex. "Électricité CFO/CATE"
      profession: v.optional(v.string()), // métier exact
      experienceYears: v.number(),
      currentEmployer: v.optional(v.string()),
      references: v.optional(v.string()), // chantiers / clients de référence
      zones: v.array(v.string()), // villes d'intervention
      bio: v.optional(v.string()),

      // Parcours académique
      highestDegree: v.string(), // ex. CAP, BT, Licence, BTS, Ingénieur
      fieldOfStudy: v.optional(v.string()),
      school: v.optional(v.string()),
      graduationYear: v.optional(v.number()),

      // Documents obligatoires (data URLs)
      documents: v.array(
        v.object({
          kind: v.string(), // cni | diploma | certificate | other
          label: v.string(),
          url: v.string(),
        }),
      ),

      status: v.union(
        v.literal("en_attente"), // dossier soumis, en cours de vérification GTEC
        v.literal("verifie"), // validé par l'admin
        v.literal("rejete"),
      ),
      reviewNote: v.optional(v.string()), // motif admin en cas de rejet
      subscription: v.union(
        v.literal("aucun"),
        v.literal("mensuel"),
        v.literal("trimestriel"),
        v.literal("annuel"),
      ),
      subscriptionUntil: v.optional(v.number()),
      subscriptionPrice: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    /** Demande de matériel faite par un technicien pendant l'intervention. */
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

    /**
     * Paiement d'abonnement technicien (Mobile Money — vérification manuelle V1,
     * même modèle que les paiements de devis).
     */
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

    /**
     * Rémunération technicien — calculée quand le client signe le PV,
     * payée à la fin du mois par l'admin.
     */
    payouts: defineTable({
      techUserId: v.id("users"),
      requestId: v.id("serviceRequests"),
      amount: v.number(),
      sharePercent: v.number(),
      role: v.string(), // "Chef d'équipe" | "Technicien"
      status: v.union(
        v.literal("dû"),
        v.literal("payé"),
      ),
      paidAt: v.optional(v.number()),
      method: v.optional(v.string()),
    })
      .index("by_tech", ["techUserId", "status"])
      .index("by_request", ["requestId"]),

    /**
     * Commission GTEC de 15 % — créée automatiquement quand le client paie un
     * devis (§10 du cahier des charges). Le technicien la règle à GTEC par
     * Mobile Money ; la clôture financière exige sa régularisation.
     */
    gtecCommissions: defineTable({
      requestId: v.id("serviceRequests"),
      quoteId: v.id("quotes"),
      /** Chef d'équipe redevable (débite la mission au nom de l'équipe). */
      techUserId: v.id("users"),
      /** Montant TTC de l'intervention, base du calcul. */
      baseAmount: v.number(),
      ratePercent: v.number(), // 15 par défaut
      amount: v.number(),
      currency: v.string(),
      status: v.union(
        v.literal("due"), // commission générée, en attente de paiement
        v.literal("payee"), // réglée et validée par l'administration
        v.literal("exoneree"), // annulée par autorisation administrative
      ),
      method: v.optional(
        v.union(
          v.literal("mtn_momo"),
          v.literal("orange_money"),
          v.literal("virement"),
        ),
      ),
      payerPhone: v.optional(v.string()),
      externalRef: v.optional(v.string()),
      paidAt: v.optional(v.number()),
      validatedBy: v.optional(v.id("users")),
    })
      .index("by_tech", ["techUserId", "status"])
      .index("by_request", ["requestId"])
      .index("by_status", ["status"]),

    // ===================== V3 : notifications in-app =====================

    // ===================== V4 : catalogue de services dynamique =====================

    /**
     * Catégorie de service gérée par l'administration (cahier des charges §4).
     * L'admin peut ajouter, modifier, désactiver ou supprimer des catégories
     * et leurs sous-catégories (types de problèmes du formulaire client).
     */
    serviceCategories: defineTable({
      key: v.string(), // slug stable, ex. "cfo"
      label: v.string(), // ex. "Courant Fort — CFO"
      description: v.optional(v.string()),
      icon: v.optional(v.string()), // nom d'icône lucide, ex. "Zap"
      subcategories: v.array(
        v.object({ key: v.string(), label: v.string() }),
      ),
      active: v.boolean(),
      sortOrder: v.number(),
    }).index("by_key", ["key"]),

    /**
     * Notification in-app temps réel (Convex = poussée automatique au client).
     * Les étapes clés des 3 espaces créent une notification ciblée.
     */
    notifications: defineTable({
      userId: v.id("users"),
      title: v.string(),
      body: v.string(),
      kind: v.string(), // devis | paiement | affectation | intervention | rapport | reception | facture | visite | abonnement | materiel | avis | general
      requestId: v.optional(v.id("serviceRequests")),
      readAt: v.optional(v.number()),
      at: v.number(),
    })
      .index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
