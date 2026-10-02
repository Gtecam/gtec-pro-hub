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
    answers: v.array(v.object({ question: v.string(), answer: v.string() })),
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
    answers: v.array(v.object({ question: v.string(), answer: v.string() })),
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
};
