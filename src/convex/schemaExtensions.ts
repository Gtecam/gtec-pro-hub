import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * GTEC PRO — EXTENSIONS « PLATEFORME COMPLÈTE » (Phases 2-4 du plan
 * d'intégration) : dossier technique du bâtiment (F°5), QR codes
 * bâtiment/équipement (F°6), garanties équipement (F°7), check-lists de
 * mission (F°10), certificat numérique d'intervention (F°12), garantie de
 * travaux (F°13), pré-diagnostic (F°1), estimation budgétaire (F°2) et
 * cahier des charges (F°3). Fichier séparé pour éviter les conflits
 * d'édition avec le schéma principal — fusionné via spread dans schema.ts.
 * Aucune table existante n'est dupliquée : les interventions, rapports et
 * garanties annexes réutilisent serviceRequests / interventionReports.
 */
export const extensionTables = {
  // Bâtiment / site — dossier technique permanent (F°5, F°33 multi-sites).
  buildings: defineTable({
    ownerUserId: v.id("users"),
    name: v.string(),
    kind: v.string(), // résidence | commerce | hotel | industriel | bureau | autre
    city: v.string(),
    quarter: v.optional(v.string()),
    address: v.optional(v.string()),
    description: v.optional(v.string()),
    publicToken: v.string(), // QR bâtiment : /verify/:token (vue publique masquée)
    publicEnabled: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_token", ["publicToken"]),

  // Équipement du bâtiment (climatiseur, onduleur, tableau…) — QR + garantie (F°6, F°7).
  buildingAssets: defineTable({
    buildingId: v.id("buildings"),
    ownerUserId: v.id("users"),
    label: v.string(),
    domainCode: v.optional(v.string()), // nomenclature ELEC, FROID, ENE…
    model: v.optional(v.string()),
    brand: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    installedAt: v.optional(v.number()),
    warrantyMonths: v.optional(v.number()),
    warrantyUntil: v.optional(v.number()),
    nextMaintenanceAt: v.optional(v.number()),
    status: v.optional(v.string()), // opérationnel | en panne | réformé…
    qrToken: v.string(), // QR équipement : /asset/:token (accès contrôlé)
    publicEnabled: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_building", ["buildingId"])
    .index("by_token", ["qrToken"]),

  // Documents du dossier bâtiment (plans, schémas, certificats, factures, photos).
  buildingDocuments: defineTable({
    buildingId: v.id("buildings"),
    kind: v.string(), // plan | schema | certificat | facture | contrat | photo | autre
    title: v.string(),
    documentUrl: v.optional(v.string()), // data URL compressée
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()), // certificats / assurances (F°22)
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_building", ["buildingId"]),

  // Événements techniques du bâtiment (maintenance, panne, intervention, inspection).
  buildingEvents: defineTable({
    buildingId: v.id("buildings"),
    assetId: v.optional(v.id("buildingAssets")),
    kind: v.string(), // maintenance | panne | intervention | inspection | garantie | autre
    label: v.string(),
    detail: v.optional(v.string()),
    at: v.number(),
  }).index("by_building", ["buildingId"]),

  // Accès temporaires à un dossier bâtiment (F°5, §40) — permissions limitées.
  buildingAccessGrants: defineTable({
    buildingId: v.id("buildings"),
    grantedToUserId: v.id("users"),
    grantedByUserId: v.id("users"),
    scope: v.string(), // lecture | intervention
    until: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_building", ["buildingId"])
    .index("by_user", ["grantedToUserId"]),

  // Check-list de sécurité par mission (F°10) — les items obligatoires
  // doivent être validés avant la clôture (garde serveur dans gtec.ts).
  missionChecklists: defineTable({
    requestId: v.id("serviceRequests"),
    assignmentId: v.optional(v.id("assignments")),
    status: v.union(v.literal("ACTIVE"), v.literal("COMPLETE")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_request", ["requestId"]),

  // Items de la check-list (fixes, personnalisés, obligatoires ou non).
  checklistItems: defineTable({
    checklistId: v.id("missionChecklists"),
    label: v.string(),
    mandatory: v.boolean(),
    done: v.boolean(),
    doneAt: v.optional(v.number()),
    doneBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_checklist", ["checklistId"]),

  // Certificat numérique d'intervention (F°12) — QR de vérification publique.
  digitalCertificates: defineTable({
    requestId: v.id("serviceRequests"),
    number: v.string(), // CERT-0001
    verifyToken: v.string(), // QR : /verify/:token
    payloadHash: v.string(), // empreinte SHA-256 des preuves
    payload: v.string(), // JSON des preuves (signature, GPS, techniciens…)
    issuedAt: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_token", ["verifyToken"]),

  // Garantie de travaux liée à une mission (F°13) — un signalement pendant
  // la période est rattaché automatiquement à la mission d'origine.
  workGuarantees: defineTable({
    requestId: v.id("serviceRequests"),
    clientId: v.id("users"),
    startedAt: v.number(),
    days: v.number(),
    until: v.number(),
    status: v.union(v.literal("ACTIVE"), v.literal("EXPIRED")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_request", ["requestId"]),

  // Pré-diagnostic IA (F°1) — traçabilité des réponses client + résultat du
  // moteur local (lib/diagnostic.ts). Aide au pré-diagnostic : le technicien
  // garde la validation finale, jamais une certification automatique.
  aiDiagnostics: defineTable({
    userId: v.id("users"),
    sessionKey: v.string(), // clé locale pour reprendre une session
    serviceKey: v.optional(v.string()),
    question: v.string(), // description libre du problème
    answers: v.array(
      v.object({
        question: v.string(),
        answer: v.string(),
      }),
    ),
    resultJson: v.string(), // catégorie probable, urgence, compétences, matériel
    convertedRequestId: v.optional(v.id("serviceRequests")), // demande créée depuis ce diagnostic
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Estimations budgétaires indicatives (F°2) — fourchette indicative,
  // jamais un devis : le devis signé reste la référence financière.
  budgetEstimates: defineTable({
    userId: v.id("users"),
    sessionKey: v.string(),
    inputsJson: v.string(), // type, localisation, surface, quantité, urgence…
    resultJson: v.string(), // fourchette + détail main-d'œuvre / matériel
    convertedRequestId: v.optional(v.id("serviceRequests")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Cahier des charges généré (F°3) — structure modifiable avant publication.
  projectBriefs: defineTable({
    userId: v.id("users"),
    sessionKey: v.string(),
    title: v.string(),
    answers: v.array(
      v.object({
        question: v.string(),
        answer: v.string(),
      }),
    ),
    contentJson: v.string(), // description, périmètre, lots, délais, livrables…
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Équipements et matériels du technicien (§10 « MON MATÉRIEL ») : les
  // déclarer rassure les clients et aide l'affectation. Déclaration ≠
  // vérification : l'état et la photo sont déclaratifs, jamais auto-certifiés.
  technicianEquipment: defineTable({
    userId: v.id("users"),
    label: v.string(), // Multimètre, Mégohmmètre, Pince ampèremétrique…
    brand: v.optional(v.string()),
    model: v.optional(v.string()),
    quantity: v.number(),
    condition: v.optional(
      v.union(
        v.literal("neuf"),
        v.literal("bon_etat"),
        v.literal("use"),
        v.literal("a_reparer"),
        v.literal("reforme"),
      ),
    ),
    photoUrl: v.optional(v.string()),
    acquiredAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // Confirmation annuelle du profil (§22 « MES INFORMATIONS SONT TOUJOURS
  // EXACTES ») — une ligne par confirmation, journalisée, non supprimable.
  profileConfirmations: defineTable({
    userId: v.id("users"),
    confirmedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Client entreprise (§14) : déclinaison client du profil entreprise —
  // RCCM/NIU vérifiables par GTEC, jamais auto-certifiés.
  clientCompanies: defineTable({
    ownerUserId: v.id("users"),
    name: v.string(), // raison sociale
    tradeName: v.optional(v.string()), // nom commercial
    rccm: v.optional(v.string()),
    niu: v.optional(v.string()),
    sector: v.optional(v.string()), // secteur d'activité
    logoUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
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

  // Sites / agences du client entreprise (§14) — lieux d'intervention.
  clientSites: defineTable({
    companyId: v.id("clientCompanies"),
    label: v.string(), // « Siège », « Agence Bonapriso »…
    region: v.optional(v.string()),
    city: v.string(),
    quarter: v.optional(v.string()),
    address: v.string(),
    isDefault: v.optional(v.boolean()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"]),

  // Utilisateurs rattachés au client entreprise (§14) — même logique que
  // companyMembers : invitation ACCEPTÉE par le compte visé, rôles métier
  // (administrateur, responsable technique, maintenance, financier, demandeur).
  clientTeamMembers: defineTable({
    companyId: v.id("clientCompanies"),
    userId: v.id("users"),
    role: v.string(), // ADMIN | TECH | MAINT | FIN | REQUESTER
    status: v.union(v.literal("INVITED"), v.literal("ACTIVE"), v.literal("DECLINED")),
    invitedBy: v.id("users"),
    invitedAt: v.number(),
    respondedAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_user", ["userId"]),

  // Disponibilités du professionnel (§8 « PRENDRE RENDEZ-VOUS ») — une règle
  // par jour de la semaine (horaires, durée de créneau, temps de déplacement,
  // capacité quotidienne). Les créneaux réellement libres sont calculés à la
  // volée à partir de ces règles et des rendez-vous existants.
  availabilityRules: defineTable({
    userId: v.id("users"),
    weekday: v.number(), // 0 = dimanche … 6 = samedi
    startMin: v.number(), // minutes depuis minuit
    endMin: v.number(),
    slotMinutes: v.optional(v.number()), // durée d'un créneau (défaut 60)
    travelMinutes: v.optional(v.number()), // temps de déplacement entre deux RDV (défaut 30)
    capacityPerDay: v.optional(v.number()), // nombre de rendez-vous/jour (défaut 1)
    effectiveFrom: v.optional(v.string()), // YYYY-MM-DD
    effectiveUntil: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Rendez-vous (§8) — le client réserve un créneau réellement disponible.
  appointments: defineTable({
    clientUserId: v.id("users"),
    proUserId: v.id("users"),
    requestId: v.optional(v.id("serviceRequests")),
    serviceKey: v.optional(v.string()),
    domainCode: v.optional(v.string()),
    mode: v.union(v.literal("SUR_SITE"), v.literal("A_DISTANCE")),
    slotStart: v.number(), // timestamp de début du créneau
    slotEnd: v.number(),
    status: v.union(
      v.literal("CONFIRME"),
      v.literal("REFUSE"),
      v.literal("ANNULE"),
      v.literal("TERMINE"),
    ),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    note: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientUserId"])
    .index("by_pro", ["proUserId"])
    .index("by_pro_status", ["proUserId", "status"]),

  // Journal des événements de rendez-vous (§38 journalisation / audit).
  appointmentEvents: defineTable({
    appointmentId: v.id("appointments"),
    actorUserId: v.id("users"),
    kind: v.string(), // réservé | confirmé | refusé | annulé | terminé
    note: v.optional(v.string()),
    at: v.number(),
  }).index("by_appointment", ["appointmentId"]),

  // ============ MARCHÉ DE SERVICES (§20 « choix du technicien ») ============

  /** Précalcul des scores de matching (§4) — traçabilité « score explicable ». */
  matchingScores: defineTable({
    requestId: v.id("serviceRequests"),
    proUserId: v.id("users"),
    total: v.number(), // 0-100
    detail: v.object({
      skills: v.number(), // 30 %
      proximity: v.number(), // 20 %
      availability: v.number(), // 15 %
      quality: v.number(), // 10 %
      experience: v.number(), // 10 %
      certifications: v.number(), // 5 %
      load: v.number(), // 5 %
      history: v.number(), // 5 %
    }),
    at: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_request_pro", ["requestId", "proUserId"]),

  /** Liste présentée au client pour une demande (capturée pour l'historique). */
  professionalMatches: defineTable({
    requestId: v.id("serviceRequests"),
    clientId: v.id("users"),
    proUserIds: v.array(v.id("users")),
    expanded: v.optional(v.boolean()), // recherche élargie (urgence §11)
    at: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_client", ["clientId"]),

  /** Sélection du client (§8) : 1 à 5 professionnels pour demande de devis. */
  clientShortlists: defineTable({
    requestId: v.id("serviceRequests"),
    clientId: v.id("users"),
    proUserIds: v.array(v.id("users")),
    updatedAt: v.number(),
    isActive: v.boolean(),
  })
    .index("by_request", ["requestId"])
    .index("by_client", ["clientId"]),

  /** Demandes de devis envoyées simultanément aux pros sélectionnés (§8/§9). */
  quoteRequests: defineTable({
    requestId: v.id("serviceRequests"),
    clientId: v.id("users"),
    proUserId: v.id("users"),
    status: v.union(
      v.literal("envoyee"),
      v.literal("proposee"),
      v.literal("acceptee"),
      v.literal("refusee"),
      v.literal("expiree"),
      v.literal("modification_demandee"),
    ),
    responseDeadline: v.number(), // délai de réponse (urgence §11)
    respondedAt: v.optional(v.number()),
    // Proposition du professionnel (ébauche de devis) : montant, délai,
    // garantie, message — le devis signé reste la référence financière.
    proposal: v.optional(
      v.object({
        amount: v.number(),
        arrivalDelayMin: v.optional(v.number()),
        plannedAt: v.optional(v.number()),
        warrantyDays: v.optional(v.number()),
        message: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_pro", ["proUserId"])
    .index("by_pro_status", ["proUserId", "status"])
    .index("by_request_pro", ["requestId", "proUserId"]),

  /** Historique des comparaisons client (§7) — lisible pour l'explicabilité. */
  professionalComparisons: defineTable({
    requestId: v.id("serviceRequests"),
    clientId: v.id("users"),
    proUserIds: v.array(v.id("users")),
    at: v.number(),
  }).index("by_request", ["requestId"]),

  /** Journal du choix du client (§13) : mode 1/2, chaque sélection, refus. */
  selectionEvents: defineTable({
    requestId: v.id("serviceRequests"),
    clientId: v.id("users"),
    kind: v.string(), // mode_choisi | pro_ajoute | pro_retire | devis_demande | mode_auto
    proUserId: v.optional(v.id("users")),
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_pro", ["proUserId"]),

  /** Présence temps réel du professionnel (§16/§20). */
  professionalPresence: defineTable({
    userId: v.id("users"),
    status: v.union(
      v.literal("disponible"),
      v.literal("occupe"),
      v.literal("en_intervention"),
      v.literal("indisponible"),
      v.literal("hors_ligne"),
    ),
    availableFrom: v.optional(v.number()), // dispo à une heure donnée (§5)
    note: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  /** Zones couvertes déclarées par le professionnel (§20). */
  professionalServiceZones: defineTable({
    userId: v.id("users"),
    city: v.string(),
    district: v.optional(v.string()), // quartier / commune
    radiusKm: v.number(),
    center: v.optional(v.object({ lat: v.number(), lon: v.number() })),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Créneaux publiés par le professionnel (§20) — complément des règles §8. */
  availabilitySlots: defineTable({
    userId: v.id("users"),
    start: v.number(),
    end: v.number(),
    status: v.union(
      v.literal("libre"),
      v.literal("reserve"),
      v.literal("bloque"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_start", ["userId", "start"]),

  // Favoris client (§35 « MES FAVORIS ») — techniciens, entreprises, services.
  favorites: defineTable({
    userId: v.id("users"),
    targetType: v.union(v.literal("technician"), v.literal("company"), v.literal("service")),
    targetId: v.string(), // Id sérialisé ou code service
    label: v.string(),
    subtitle: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "targetType"]),
};
