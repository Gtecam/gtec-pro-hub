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
  v.literal("super_admin"),
  v.literal("kyc"),
  v.literal("finance"),
  v.literal("missions"),
  v.literal("support"),
  v.literal("litiges"),
  v.literal("moderation"),
  v.literal("technique"),
);

// ===================== SERVICE PACK AGILE (réf. client GTEC V2) =====

/** Pôle de service client (cahier des charges §4). La clé est la valeur de serviceKey des demandes. */
export const SERVICE_PACKS = [
  { key: "cfo", label: "Courant Fort — CFO", description: "Électricité : installations, tableaux, défenses, câblage, éclairage.", events: "électricité" },
  { key: "ht", label: "Haute Tension — HTA", description: "Postes de transformation, réseaux HT, mesures d'isolement.", events: "haute tension" },
  { key: "industrie", label: "Industrie & Automatisme", description: "Moteurs, commandes, variateurs, automates, instrumentation.", events: "industrie" },
  { key: "solaire", label: "Solaire & Énergie", description: "Photovoltaïque, stockage, onduleurs, systèmes autonomes.", events: "énergie" },
  { key: "cfa", label: "Courant Faible — CFA", description: "Réseaux informatiques, fibre, vidéosurveillance, interphonie.", events: "réseaux" },
  { key: "domotique", label: "Domotique & Confort", description: "Éclairage intelligent, automatisme, sécurité connectée.", events: "domotique" },
  { key: "sinc", label: "Sécurité Incendie", description: "Détection, alarmes, désenfumage, extincteurs, contrôles de conformité.", events: "sécurité incendie" },
  { key: "inspection", label: "Inspection & Diagnostic", description: "Mesures électriques, thermographie, audits énergétiques, contrôles.", events: "diagnostic" },
  { key: "froid", label: "Climatisation, HVAC & Froid", description: "Clim, VMC, chambres froides, groupes froid, réfrigération.", events: "climatisation" },
  { key: "bati", label: "Bâtiment & Infrastructure", description: "Maçonnerie, cloisons, chemins de câbles, locaux techniques.", events: "bâtiment" },
  { key: "maintenance", label: "Maintenance & Contrats", description: "Préventive, corrective, prédictive, contrats et interventions.", events: "maintenance" },
  { key: "fourniture", label: "Fourniture de Matériel", description: "Stock, commande et livraison du catalogue de matériel GTEC.", events: "fourniture" },
] as const;

export type ServiceKey = (typeof SERVICE_PACKS)[number]["key"];

/** Catégories par pôle (§4). */
export const CATEGORIES_BY_POLE: Record<ServiceKey, string[]> = {
  cfo: ["Installation électrique", "Réhabilitation", "Éclairage", "Mise à la terre", "Protection", "Distribution"],
  ht: ["Poste de transformation", "Réseau HT/MT", "Cellule HTA", "Maintenance HTA", "Mesures et contrôles"],
  industrie: ["Moteurs", "Commande électrique", "Variateurs", "Automatisme", "Machines industrielles", "Instrumentation"],
  solaire: ["Installation solaire", "Onduleurs", "Batteries", "Systèmes autonomes", "Gestion énergétique"],
  cfa: ["Réseaux informatiques", "Fibre optique", "Vidéosurveillance", "Interphonie", "Contrôle d'accès"],
  domotique: ["Éclairage intelligent", "Gestion bâtiment", "Sécurité connectée", "Confort", "Maintenance"],
  sinc: ["Détection incendie", "Alarme incendie", "Désenfumage", "Extinction", "Contrôle et maintenance"],
  inspection: ["Diagnostic électrique", "Mesures électriques", "Thermographie", "Audit énergétique", "Inspection"],
  froid: ["Climatisation", "Maintenance", "HVAC", "Froid"],
  bati: ["Travaux de bâtiment", "Supports électriques", "Génie civil léger", "Infrastructure électrique", "Réhabilitation"],
  maintenance: ["Maintenance préventive", "Maintenance corrective", "Maintenance prédictive", "Contrats", "Gestion des interventions"],
  fourniture: ["Matériel électrique", "Éclairage", "Solaire", "Courant faible", "Sécurité", "Climatisation & froid"],
};

export const getCategoriesByPole = (pole: ServiceKey): string[] => CATEGORIES_BY_POLE[pole];

export const getCategories = (pole?: ServiceKey | null, all: boolean = false): string[] => {
  if (!pole) return all ? Object.values(CATEGORIES_BY_POLE).flat() : [];
  return CATEGORIES_BY_POLE[pole];
};

// ===================== GTEC PRO 2.0 : litiges / sanctions / audit =====

export const schema = defineSchema(
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
      accountType: v.optional(v.union(v.literal("client"), v.literal("technicien"))), // Espace choisi à l'inscription : client ou technicien
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
    }).index("email", ["email"]).index("phone", ["phone"]),

    // service demandes de service
    serviceRequests: defineTable({
      clientId: v.id("users"),
      reference: v.string(), // GTC-0001
      serviceKey: v.string(), // cfo | ht | industrie | solaire | cfa | domotique | sinc | inspection | froid | bati | maintenance | fourniture
      subcategory: v.optional(v.string()),
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
      coords: v.optional(v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) })),
      coordsAt: v.optional(v.number()),
      specialtyCode: v.optional(v.string()), // NOMENCLATURE : spécialité professionnelle attendue (ex. ELEC-ELEC-IND…)
      requiredSkills: v.optional(v.array(v.string())), // compétences techniques requises
      interventionCode: v.optional(v.string()), // CATALOGUE : intervention choisie (code unique)
      beneficiaryId: v.optional(v.id("diasporaBeneficiaries")),
      isDiaspora: v.optional(v.boolean()), // mode diaspora : le demandeur est à l'étranger
      onSiteContact: v.optional(v.object({ name: v.string(), phone: v.string() })), // bénéficiaire à contacter sur place
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
      teamArrivalCoords: v.optional(v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) })), // GÉO TERRAIN : coordonnées d'arrivée
      interventionLabel: v.optional(v.string()), // libellé figé de l'intervention
      urgency: v.optional(v.union(v.literal("normale"), v.literal("urgente"), v.literal("critique"))), // niveau d'urgence
      desiredDate: v.optional(v.number()), // date souhaitée d'intervention
      budgetHint: v.optional(v.number()), // budget indicatif client (FCFA)
      voiceNoteUrl: v.optional(v.string()), // message vocal (data URL)
    })
      .index("by_client", ["clientId"])
      .index("by_status", ["status"])
      .index("by_reference", ["reference"]),

    quotes: defineTable({
      requestId: v.id("serviceRequests"),
      clientId: v.id("users"),
      authorId: v.optional(v.id("users")),
      authorRole: v.optional(v.union(v.literal("technicien"), v.literal("admin"))), // auteur du devis
      number: v.string(), // DEV-0001
      items: v.array({ label: v.string(), qty: v.number(), unitPrice: v.number() }),
      subtotal: v.number(),
      vatRate: v.number(), // TVA Cameroun
      total: v.number(),
      currency: v.string(), // FCFA
      status: v.union(v.literal("emis"), v.literal("accepte"), v.literal("refuse"), v.literal("expire")),
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
      coords: v.optional(v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) })),
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
      method: v.union(v.literal("mtn_momo"), v.literal("orange_money"), v.literal("especes"), v.literal("virement"), v.literal("carte_visa")),
      payerPhone: v.string(),
      status: v.union(v.literal("en_attente"), v.literal("valide"), v.literal("echoue")),
      externalRef: v.optional(v.string()),
      proofPhotoUrl: v.optional(v.string()),
      bankName: v.optional(v.string()),
      bankRef: v.optional(v.string()),
      cardLast4: v.optional(v.string()),
      international: v.optional(v.object({
        provider: v.union(v.literal("stripe"), v.literal("cinetpay_card")),
        amountMinor: v.number(),
        currency: v.string(),
        fxRateFromXaf: v.optional(v.number()),
        feeXaf: v.optional(v.number()),
        captured: v.optional(v.boolean()),
        providerRef: v.optional(v.string()),
      })),
      collectedBy: v.optional(v.id("users")),
      collectedAt: v.optional(v.number()),
      paidAt: v.optional(v.number()),
      milestone: v.optional(v.union(v.literal("avance"), v.literal("solde"))),
      percent: v.optional(v.number()),
    })
      .index("by_request", ["requestId"])
      .index("by_client", ["clientId"])
      .index("by_milestone", ["requestId", "milestone"]),

    assignments: defineTable({
      requestId: v.id("serviceRequests"),
      teamLeaderId: v.id("users"),
      members: v.array({ id: v.id("users"), role: v.string() }),
      scheduledAt: v.number(),
      notes: v.optional(v.string()),
      status: v.union(v.literal("planifiee"), v.literal("en_cours"), v.literal("terminee")),
    }).index("by_request", ["requestId"]),

    interventionReports: defineTable({
      requestId: v.id("serviceRequests"),
      assignmentId: v.id("assignments"),
      workDone: v.string(),
      partsUsed: v.array({ label: v.string(), qty: v.number() }),
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
    }).index("by_request", ["requestId"]).index("by_client", ["clientId"]),

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
    }).index("by_request", ["requestId"]).index("by_tech", ["techUserId"]),

    maintenanceContracts: defineTable({
      reference: v.string(),
      clientId: v.id("users"),
      serviceKey: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      frequency: v.union(v.literal("mensuel"), v.literal("trimestriel"), v.literal("semestriel"), v.literal("annuel")),
      monthlyAmount: v.number(),
      city: v.string(),
      address: v.string(),
      status: v.union(v.literal("actif"), v.literal("suspendu"), v.literal("expire"), v.literal("resilie")),
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
      status: v.union(v.literal("planifiee"), v.literal("faite"), v.literal("annulee")),
    }).index("by_contract", ["contractId"]).index("by_leader", ["assignedTeamLeaderId"]),

    contractPayments: defineTable({
      contractId: v.id("maintenanceContracts"),
      clientId: v.id("users"),
      periodIndex: v.number(),
      periodStart: v.number(),
      periodEnd: v.number(),
      amount: v.number(),
      currency: v.string(),
      method: v.union(v.literal("mtn_momo"), v.literal("orange_money"), v.literal("especes"), v.literal("virement")),
      payerPhone: v.string(),
      proofPhotoUrl: v.optional(v.string()),
      bankName: v.optional(v.string()),
      bankRef: v.optional(v.string()),
      status: v.union(v.literal("en_attente"), v.literal("valide"), v.literal("echoue")),
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
      highestDegree: v.string(),
      fieldOfStudy: v.optional(v.string()),
      school: v.optional(v.string()),
      graduationYear: v.optional(v.number()),
      institutionId: v.optional(v.id("higherEducationInstitutions")),
      institutionRequestId: v.optional(v.id("institutionVerificationRequests")),
      credentialStatus: v.optional(v.union(v.literal("declare"), v.literal("en_attente"), v.literal("verifie"), v.literal("rejete"))),
      status: v.union(v.literal("en_attente"), v.literal("verifie"), v.literal("rejete")),
      reviewNote: v.optional(v.string()),
      kycFlag: v.optional(v.string()),
      kycDocHashes: v.optional(v.array(v.string())),
      subscription: v.union(v.literal("aucun"), v.literal("mensuel"), v.literal("trimestriel"), v.literal("annuel")),
      subscriptionUntil: v.optional(v.number()),
      subscriptionPrice: v.optional(v.number()),
      lastLocation: v.optional(v.object({ lat: v.number(), lon: v.number(), accuracy: v.optional(v.number()) })),
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
      availability: v.optional(v.union(v.literal("disponible"), v.literal("occupe"), v.literal("hors_ligne"), v.literal("indisponible"), v.literal("en_intervention"), v.literal("conge"))),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    materialRequests: defineTable({
      requestId: v.id("serviceRequests"),
      requestedById: v.id("users"),
      label: v.string(),
      qty: v.number(),
      status: v.union(v.literal("demande"), v.literal("approuve"), v.literal("commande"), v.literal("livre"), v.literal("refuse")),
      adminNote: v.optional(v.string()),
    }).index("by_request", ["requestId"]).index("by_status", ["status"]),

    subscriptionPayments: defineTable({
      profileId: v.id("technicianProfiles"),
      techUserId: v.id("users"),
      plan: v.union(v.literal("mensuel"), v.literal("trimestriel"), v.literal("annuel")),
      amount: v.number(),
      currency: v.string(),
      method: v.union(v.literal("mtn_momo"), v.literal("orange_money"), v.literal("especes"), v.literal("virement")),
      payerPhone: v.string(),
      status: v.union(v.literal("en_attente"), v.literal("valide"), v.literal("echoue")),
      externalRef: v.optional(v.string()),
    }).index("by_profile", ["profileId"]).index("by_status", ["status"]),

    payouts: defineTable({
      techUserId: v.id("users"),
      requestId: v.id("serviceRequests"),
      amount: v.number(),
      sharePercent: v.number(),
      role: v.string(),
      status: v.union(v.literal("dû"), v.literal("payé")),
      paidAt: v.optional(v.number()),
      method: v.optional(v.string()),
    }).index("by_tech", ["techUserId", "status"]).index("by_request", ["requestId"]),

    gtecCommissions: defineTable({
      requestId: v.id("serviceRequests"),
      quoteId: v.id("quotes"),
      breakdown: v.optional(v.object({ teamAmount: v.number(), gtecAmount: v.number() })),
      techUserId: v.id("users"),
      baseAmount: v.number(),
      ratePercent: v.number(),
      amount: v.number(),
      currency: v.string(),
      status: v.union(v.literal("due"), v.literal("payee"), v.literal("exoneree")),
      method: v.optional(v.union(v.literal("mtn_momo"), v.literal("orange_money"), v.literal("virement"), v.literal("especes"))),
      payerPhone: v.optional(v.string()),
      externalRef: v.optional(v.string()),
      paidAt: v.optional(v.number()),
      validatedBy: v.optional(v.id("users")),
      commissionDebt: v.optional(v.object({ deadlineAt: v.number(), remindedAt: v.optional(v.number()) })),
    })
      .index("by_tech", ["techUserId", "status"])
      .index("by_request", ["requestId"])
      .index("by_status", ["status"]),

    withdrawals: defineTable({
      userId: v.id("users"),
      sourceRole: v.union(v.literal("technicien"), v.literal("admin")),
      amount: v.number(),
      currency: v.string(),
      method: v.union(v.literal("mtn_momo"), v.literal("orange_money"), v.literal("especes"), v.literal("virement")),
      destination: v.string(),
      destinationLabel: v.optional(v.string()),
      status: v.union(v.literal("demande"), v.literal("approuve"), v.literal("payee"), v.literal("refuse")),
      requestedAt: v.number(),
      processedAt: v.optional(v.number()),
      processedBy: v.optional(v.id("users")),
      reference: v.string(),
      note: v.optional(v.string()),
    }).index("by_user", ["userId", "status"]).index("by_status", ["status"]),

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
      subcategories: v.array({ key: v.string(), label: v.string() }),
      active: v.boolean(),
      sortOrder: v.number(),
    }).index("by_key", ["key"]),

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

    serviceRequestsArchive: defineTable({
      clientId: v.id("users"),
      reference: v.string(),
      serviceKey: v.string(),
      title: v.string(),
      status: v.string(),
      archivedAt: v.number(),
    }).index("by_client", ["clientId"]),

    hopsSphere: defineTable({
      id: v.string(),
      name: v.string(),
      type: v.string(),
      metric: v.number(),
      at: v.number(),
    }).index("by_type", ["type"]),
  },
  { schemaValidation: false },
);

export default schema;
