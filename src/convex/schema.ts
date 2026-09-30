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

/**
 * GTEC PRO 2.0 (§3) : spécialisation des comptes administrateurs.
 * "super_admin" a tous les droits ; les autres rôles limitent leur périmètre
 * (les gardes serveur utilisent requireAdmin(ctx, scope)).
 */
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
      /** GTEC PRO 2.0 : périmètre du compte admin (super_admin = tous droits). */
      adminRole: v.optional(adminRoleValidator),

      // GTEC PRO
      /** Espace choisi à l'inscription : "client" (défaut) ou "technicien". */
      accountType: v.optional(v.union(v.literal("client"), v.literal("technicien"))),
      phone: v.optional(v.string()),
      city: v.optional(v.string()),

      // Identité complète du client (profil client)
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      /** Vérification du téléphone par code SMS (OTP Twilio). */
      phoneVerified: v.optional(v.boolean()),
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
    }).index("email", ["email"]) // index for the email. do not remove or modify
      .index("phone", ["phone"]), // requis par Convex Auth (provider Phone / phone-otp)

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
      /** GPS du chantier saisi par le client (degrés décimaux). */
      coords: v.optional(
        v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
      ),
      /** Date de la dernière position GPS client enregistrée. */
      coordsAt: v.optional(v.number()),
      /** NOMENCLATURE : spécialité professionnelle attendue (code ELEC-ELEC-IND…). */
      specialtyCode: v.optional(v.string()),
      /** Compétences techniques requises pour l'intervention. */
      requiredSkills: v.optional(v.array(v.string())),
    })
      .index("by_client", ["clientId"])
      .index("by_status", ["status"])
      .index("by_reference", ["reference"]),

    quotes: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      /** V6 : auteur du devis — le technicien le rédige sur le terrain. */
      authorId: v.optional(v.id("users")),
      authorRole: v.optional(v.union(v.literal("technicien"), v.literal("admin"))),
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
      /** V6 : validation automatique GTEC dès l'envoi du devis terrain. */
      autoValidatedAt: v.optional(v.number()),
      /** GTEC PRO 2.0 (§18) : version du devis (V1, V2…) — toute modification
       * crée un nouveau devis lié, l'ancien n'est jamais écrasé. */
      version: v.optional(v.number()),
      /** 2.0 : devis révisé par celui-ci (chaîne de versionnage). */
      revisedFromId: v.optional(v.id("quotes")),
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"])
      .index("by_author", ["authorId"]),

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

      // ===== V6 : paiement en 2 tranches (50 % avant / 50 % après) =====
      /** "avance" = 50 % avant travaux · "solde" = 50 % à la fin des travaux. */
      milestone: v.optional(v.union(v.literal("avance"), v.literal("solde"))),
      /** Part du total TTC couverte par ce paiement (50 par défaut). */
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

    /**
     * Mensualité d'un contrat de maintenance (paiement vérifié par
     * l'administration, même modèle que les paiements de devis).
     */
    contractPayments: defineTable({
      contractId: v.id("maintenanceContracts"),
      clientId: v.id("users"),
      /** Numéro d'échéance (1 = première mensualité). */
      periodIndex: v.number(),
      /** Date de couverture de la mensualité (début de période). */
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
    }).index("by_contract", ["contractId"])
      .index("by_client", ["clientId"])
      .index("by_status", ["status"]),

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
      /** V6 : source du doublon détecté (candidature rejetée automatiquement). */
      kycFlag: v.optional(v.string()),
      /** V6 : empreintes SHA-256 des documents (anti-doublon de pièces). */
      kycDocHashes: v.optional(v.array(v.string())),
      subscription: v.union(
        v.literal("aucun"),
        v.literal("mensuel"),
        v.literal("trimestriel"),
        v.literal("annuel"),
      ),
      subscriptionUntil: v.optional(v.number()),
      subscriptionPrice: v.optional(v.number()),

      /** Dernière position GPS connue du technicien (degrés décimaux). */
      lastLocation: v.optional(
        v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) }),
      ),
      /** Horodatage de la dernière position GPS. */
      lastLocationAt: v.optional(v.number()),
      /** Partage GPS temps réel activé par le technicien. */
      locationSharing: v.optional(v.boolean()),

      /**
       * NOMENCLATURE GTEC PRO : Domaine → Spécialité professionnelle →
       * Métier → Compétences → Diplôme → Spécialité du diplôme → Niveau →
       * Certifications (+ expérience, zone d'intervention détaillée).
       */
      /** Domaine (code racine : ELEC, HTA, IND, ENE, FROID, INFO, RES, BTP, PLB, MNT, MEC, SEC, ENT). */
      domainCode: v.optional(v.string()),
      /** Spécialité professionnelle (code unique : ELEC-ELEC-IND…). */
      specialtyCode: v.optional(v.string()),
      /** Métier officiel de la nomenclature (ex. "Électricien industriel"). */
      jobTitle: v.optional(v.string()),
      /** Compétences réellement exercées. */
      skills: v.optional(v.array(v.string())),
      /** Clé du diplôme (BTS_ELTO, LIC_GE, ING_GE…) — voir src/lib/nomenclature.ts. */
      degreeKey: v.optional(v.string()),
      /** Niveau d'études lisible (ex. "Bac+2"). */
      degreeLevel: v.optional(v.string()),
      /** Certifications / habilitations (HTA, photovoltaïque, sécurité…). */
      certifications: v.optional(v.array(v.string())),
      /** Palier d'expérience déclaré (0-1, 2-3, 4-5, 6-10, 10+). */
      experienceBand: v.optional(v.string()),
      /** Arrondissement / quartier principal d'intervention. */
      district: v.optional(v.string()),
      /** Rayon d'intervention accepté autour de la ville (km). */
      radiusKm: v.optional(v.number()),
      /** GTEC PRO 2.0 (§12) : disponibilité déclarée — un prestataire
       * indisponible n'est jamais proposé par le moteur d'affectation. */
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
      /** 2.0 : "team" = part de l'équipe (90 %) · "gtec" = commission (10 %). */
      breakdown: v.optional(
        v.object({
          teamAmount: v.number(),
          gtecAmount: v.number(),
        }),
      ),
      /** Chef d'équipe redevable (débite la mission au nom de l'équipe). */
      techUserId: v.id("users"),
      /** Montant TTC de l'intervention, base du calcul. */
      baseAmount: v.number(),
      ratePercent: v.number(), // 10 par défaut (§22 cahier des charges 2.0)
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
          v.literal("especes"),
        ),
      ),
      payerPhone: v.optional(v.string()),
      externalRef: v.optional(v.string()),
      paidAt: v.optional(v.number()),
      validatedBy: v.optional(v.id("users")),
      /** 2.0 (§24) : commission née d'un paiement cash — dette de commission
       * du prestataire. Il dispose d'un délai pour la régulariser. */
      commissionDebt: v.optional(
        v.object({
          /** 24 h par défaut (paramétrable par GTEC). */
          deadlineAt: v.number(),
          remindedAt: v.optional(v.number()),
        }),
      ),
    })
      .index("by_tech", ["techUserId", "status"])
      .index("by_request", ["requestId"])
      .index("by_status", ["status"]),

    // ===================== V6 : retraits (techniciens + administration) =====

    /**
     * Demande de retrait d'un solde disponible. Pour un technicien, le solde
     * provient de ses rémunérations "payé" moins ses retraits déjà payés.
     * Pour l'administration, le solde provient des commissions GTEC payées
     * (85/15) moins les retraits déjà payés.
     */
    withdrawals: defineTable({
      /** Bénéficiaire du retrait (technicien ou administrateur). */
      userId: v.id("users"),
      /** "technicien" = gains · "admin" = commissions GTEC encaissées. */
      sourceRole: v.union(v.literal("technicien"), v.literal("admin")),
      amount: v.number(),
      currency: v.string(), // FCFA
      method: v.union(
        v.literal("mtn_momo"),
        v.literal("orange_money"),
        v.literal("virement"),
        v.literal("especes"),
      ),
      /** Numéro MoMo ou IBAN selon le moyen choisi. */
      destination: v.string(),
      destinationLabel: v.optional(v.string()), // nom du titulaire / banque
      status: v.union(
        v.literal("demande"), // créée par le bénéficiaire
        v.literal("approuve"), // validée par l'administration
        v.literal("payee"), // transfert effectué
        v.literal("refuse"),
      ),
      requestedAt: v.number(),
      processedAt: v.optional(v.number()),
      processedBy: v.optional(v.id("users")),
      reference: v.string(), // RET-0001
      note: v.optional(v.string()), // motif de refus ou note de traitement
    })
      .index("by_user", ["userId", "status"])
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

    // ===================== V5 : vérification SMS + Mobile Money =====================

    /**
     * Code OTP de vérification de téléphone (envoyé par SMS via Twilio).
     * Un seul enregistrement actif par utilisateur.
     */
    phoneVerifications: defineTable({
      userId: v.id("users"),
      phone: v.string(), // format E.164 (+237…)
      codeHash: v.string(), // SHA-256 du code à 6 chiffres
      attempts: v.number(), // tentatives de vérification échouées
      expiresAt: v.number(),
      consumedAt: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    /**
     * Écho de l'OTP de connexion (provider phone-otp) — utilisé uniquement
     * quand l'envoi SMS est impossible (Twilio non configuré) : le client
     * peut alors consulter son dernier code via une query dédiée.
     * En production (clés Twilio présentes), aucune ligne n'est écrite.
     */
    authSmsEcho: defineTable({
      phone: v.string(), // E.164
      code: v.string(), // code en clair — UNIQUEMENT en mode démo
      createdAt: v.number(),
      expiresAt: v.number(),
    }).index("by_phone", ["phone"]),

    /**
     * File d'envoi des e-mails transactionnels (Resend) — un enregistrement
     * par e-mail à envoyer, alimenté par les notifications du parcours.
     */
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

    /**
     * Référence d'une transaction Mobile Money automatique (MTN Collections
     * ou Orange Web Payment) — reliée au paiement GTEC correspondant.
     */
    momoTransactions: defineTable({
      paymentId: v.id("payments"),
      provider: v.union(v.literal("mtn"), v.literal("orange")),
      providerRef: v.string(), // referenceId MTN / payToken ou orderId Orange
      status: v.union(
        v.literal("en_attente"),
        v.literal("reussie"),
        v.literal("echouee"),
        v.literal("expiree"),
      ),
      amount: v.number(),
      currency: v.string(),
      payerPhone: v.string(),
      lastCheckedAt: v.optional(v.number()),
      failureReason: v.optional(v.string()),
    })
      .index("by_payment", ["paymentId"])
      .index("by_provider_ref", ["providerRef"]),

    // ===================== GTEC PRO 2.0 : litiges / sanctions / audit ======

    /**
     * Litige ouvert sur une mission (§36). Catégorie libre parmi la liste du
     * cahier des charges ; l'admin rend une décision documentée.
     */
    disputes: defineTable({
      requestId: v.id("serviceRequests"),
      /** Ouverture par le client ou par un membre de l'équipe (technicien). */
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
      attachments: v.optional(v.array(v.string())), // data URLs compressées
      status: v.union(
        v.literal("ouverte"),
        v.literal("en_cours"),
        v.literal("resolue"),
        v.literal("rejetee"),
      ),
      decision: v.optional(v.string()), // décision documentée de l'admin
      resolvedById: v.optional(v.id("users")),
      resolvedAt: v.optional(v.number()),
    })
      .index("by_request", ["requestId"])
      .index("by_status", ["status"]),

    /**
     * Sanction graduée (§37) : 1 avertissement · 2 limitation · 3 suspension
     * temporaire · 4 restriction financière · 5 résiliation/bannissement.
     * Toujours motivée, notifiée et contestable.
     */
    sanctions: defineTable({
      userId: v.id("users"),
      level: v.number(), // 1 à 5
      reason: v.string(), // motivation obligatoire
      /** Contexte : demande de service liée, si pertinent. */
      requestId: v.optional(v.id("serviceRequests")),
      status: v.union(
        v.literal("active"),
        v.literal("levee"),
        v.literal("contested"),
      ),
      contestReason: v.optional(v.string()),
      contestAt: v.optional(v.number()),
      /** Fin de suspension (niveau 3) — auto-expirée à la lecture. */
      until: v.optional(v.number()),
      issuedById: v.id("users"), // admin émetteur
      issuedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    /**
     * Journal d'audit (§44) : chaque action sensible est tracée avec
     * l'auteur, la cible, l'ancienne et la nouvelle valeur.
     */
    auditLogs: defineTable({
      actorId: v.optional(v.id("users")), // système (crons) → undefined
      actorRole: v.optional(v.string()), // admin:kyc, technicien, client, system…
      action: v.string(), // ex. "commission.validated", "sanction.issued"
      targetTable: v.optional(v.string()),
      targetId: v.optional(v.string()),
      oldValue: v.optional(v.string()), // sérialisé libre (texte court)
      newValue: v.optional(v.string()),
      detail: v.optional(v.string()),
      at: v.number(),
    }).index("by_at", ["at"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
