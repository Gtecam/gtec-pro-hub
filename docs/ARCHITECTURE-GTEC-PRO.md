# GREEN TECH ENERGY CAMEROON — GTEC PRO
## Architecture de référence (document living)

> « Du besoin à la réalisation : trouver, commander, suivre et gérer tous vos services
> techniques dans une seule plateforme. »

Ce document est **vivant** : il décrit l'état réel du code (aucune fonctionnalité
annoncée sans être implémentée, testée et poussée sur Convex).

---

## 1. Architecture fonctionnelle

Quatre interfaces, un socle commun :

| Interface | Rôle | Écrans principaux |
|---|---|---|
| **CLIENT** | Demander, planifier, payer, suivre | `ClientDashboard`, `NewRequest`, `RequestDetail`, `AppointmentsClientCard`, `FavoritesCard`, `MyClientProfile`, `ClientCompanyCard`, `BuildingsPage`, `DiasporaPage` |
| **TECHNICIEN** | Se qualifier, recevoir, exécuter | `TechnicianSpace`, `MyProfile`, `AvailabilityManager`, `MissionChecklist`, `ReportForm` |
| **ENTREPRISE** | Structurer équipe, sites, flotte | `MyProfile` (bloc `TeamCompanyCard`), fiches `companies` / `clientCompanies` |
| **ADMIN** | Vérifier, superviser, arbitrer | `AdminConsole`, `ProfileVerificationsAdmin` |

Flux cible (extrait) : **Besoin → Diagnostic assisté → Recherche → Matching →
Professionnel vérifié → Devis → Rendez-vous → Contrat → Paiement → Intervention →
Suivi → Rapport → Validation → Garantie → Maintenance**.

## 2. Architecture technique

- **Web** : Vite + React 19 + TypeScript + Tailwind + shadcn/ui + Framer Motion
- **Backend / BDD** : Convex (base de données + fonctions typées + subscriptions temps réel)
- **Auth** : Convex Auth (OTP e-mail), RBAC `users.role` = `user` | `admin`, `accountType`
- **Paiements** : MoMo / CinetPay (webhooks dans `http.ts`, vérification serveur)
- **Documents** : Convex Storage (URLs non publiques côté client tant que possible)
- **Email/SMS** : files d'attente `emailQueue` / `sms` + notifications in-app `notifications`

Contraintes du runtime Convex appliquées dans tout le code :
`crypto.subtle` (pas `node:crypto`), une query ne peut pas écrire, les helpers
partagés sont dans `./gtec` (`requireUser`, `notify`, `notifyAdmins`).

## 3. Schéma de base de données (64 tables)

Le schéma est scindé en deux fichiers fusionnés par spread dans `schema.ts` :

- `schema.ts` — cœur métier : `users`, `serviceRequests`, `quotes`, `assignments`,
  `contractVisits`, `reviews`, `payments`, `technicianProfiles`, `companies`,
  `companyMembers`, `notifications`, `auditLogs`, `higherEducationInstitutions`,
  `educationalCredentials`, `professionalExperiences`, `technicianSkills`,
  `profileCertifications`, `trainingRecords`, `portfolioProjects`, `profileChanges`,
  `clientAddresses`, `higherEducation`…
- `schemaExtensions.ts` — extensions livrées par vagues :
  - Bâtiments/équipements : `buildings`, `buildingAssets`, `buildingDocuments`,
    `buildingEvents`, `buildingAccessGrants`
  - Missions : `missionChecklists`, `checklistItems`, `digitalCertificates`, `workGuarantees`
  - Assistant : `aiDiagnostics`, `budgetEstimates`, `projectBriefs`
  - Profil : `technicianEquipment`, `profileConfirmations`
  - Client entreprise (§14) : `clientCompanies`, `clientSites`, `clientTeamMembers`
  - Rendez-vous (§8) : `availabilityRules`, `appointments`, `appointmentEvents`
  - Favoris (§35) : `favorites`

Invariants : rien n'est **supprimé** (archivage `isActive = false`), toutes les
tables métier portent `createdAt` / `updatedAt`, et les éléments sensibles suivent
le cycle `DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED / REJECTED`.

## 4. API (Convex functions)

| Domaine | Fichier | Points d'entrée principaux |
|---|---|---|
| Demandes, missions, devis, paiements | `gtec.ts` | création, affectation, réception client (`clientReception`), clôture |
| Profil évolue | `profile.ts` | `upsertExperience/Skill/Certification/Training/Project`, `myProfileCompletion`, `adminReviewProfileItem` |
| Profil — matériel, rappel annuel, vitrine | `profileExtras.ts` | `myEquipment`, `confirmProfileUpToDate`, `publicTechnicianProfile` |
| Bâtiments & équipements | `buildings.ts` | `myBuildings`, `getBuilding`, `upsertAsset`, `myWarrantyAlerts`, `getPublicBuilding` |
| Check-lists, certificats, garanties | `missions.ts` | `ensureMissionChecklist`, `toggleChecklistItem`, `issueDigitalCertificate`, `verifyCertificate`, `ensureWorkGuarantee` |
| Diagnostic & estimation | `advisor.ts` + `lib/` | `saveDiagnostic`, `saveEstimate`, `saveBrief`, `linkEstimateToRequest`, `linkBriefToRequest` |
| Client entreprise (§14) | `clientCompany.ts` | `myClientCompany`, `inviteClientTeamMember`, `upsertClientSite`, `adminReviewClientCompany` |
| Rendez-vous (§8) | `appointments.ts` | `myAvailabilityRules`, `bookableTechnicians`, `availableSlots`, `bookAppointment`, `updateAppointment`, `myAppointments` |
| Favoris (§35) | `favorites.ts` | `myFavorites`, `addFavorite`, `removeFavorite` |
| Back-office & planifiés | `crons.ts`, `adminApp.ts`, `institutions.ts` | `dailySweep`, statistiques, référentiel MINESUP |
| Garanties de travaux (F°13) | `guarantees.ts` | `ensureWorkGuarantee`, `myActiveGuarantees`, `listWarrantyClaims`, `adminListWarrantyClaims` |
| Contrats de maintenance | `maintenance.ts` | `listMyMaintenance`, `createMaintenanceContract`, `scheduleVisit`, `completeVisit`, `payMaintenance`, `adminValidateMaintenancePayment` |
| Relevés & capteurs (IoT, phase 7) | `iot.ts` | `addReading`, `assetReadings`, `buildingIotOverview` |
| Cahier des charges (F°3, phase 3) | `advisor.ts` + `lib/brief.ts` | `saveBrief`, `linkBriefToRequest` + moteur local `buildBrief` |

## 5. Écrans livrés (non exhaustif)

Landing, Auth, Dashboard, ClientDashboard, NewRequest, RequestDetail,
TechnicianSpace, MyProfile, MyClientProfile, BuildingsPage, AssetScanPage,
VerifyPage, PublicProfilePage, DiasporaPage, AdminConsole, AdminApp.

Extensions phases 2-7 : `BriefCard` + `AdvisorHistoryCard` (conseiller F°1-F°3
et historique des sessions GTEC AI), `AssetIotCard` (relevés IoT par
équipement), section B2B & Académie sur la landing (marketplace vérifiée +
référentiel MINESUP), écrans garanties/maintenance (`guarantees.ts`,
`maintenance.ts`).

## 6. Rôles et permissions

| Rôle | Peut |
|---|---|
| Visiteur | Consulter pages publiques (`/verify/:token`, `/asset/:token`, `/t/:userId`) |
| Client | Demandes, rendez-vous, favoris, bâtiments, factures, entreprise client (§14) |
| Technicien | Profil, compétences, disponibilités, check-lists, rapports, revenus |
| Technicien vérifié (`status = "verifie"`) | Réservable par les clients, visible dans « Trouver un professionnel » |
| Propriétaire entreprise (`ownerUserId`) | Gérer fiche, sites, invitations |
| Membre rôle `ADMIN` | Gérer sites et invitations (pas la fiche RCCM/NIU) |
| Admin | Seul à écrire `VERIFIED` / `REJECTED`, arbitrer litiges, voir audit |

## 7. Sécurité & protection des informations

- **Public vs privé** : `publicTechnicianProfile` n'expose ni téléphone, ni e-mail,
  ni adresse exacte, ni documents, ni données clients ; page `/t/:userId` sans authentification.
- **Déclaration ≠ vérification** : le dépôt d'un justificatif n'accorde aucun badge ;
  seul l'administration écrit `VERIFIED`.
- **Rendez-vous** : revérification serveur du créneau (aucun double booking),
  délai minimum, capacité quotidienne, refus tracé. La réservation écrit sur la
  règle de disponibilité qui a produit le créneau : en cas de réservations
  simultanées, le contrôle de concurrence optimiste de Convex rejoue la seconde
  transaction, qui relit les rendez-vous frais et rejette le créneau pris.
- **Performance** : aucun scan complet de `serviceRequests` dans les queries
  utilisateur (lecture ciblée par identifiant). Dette connue : `assignments`
  n'a qu'un index `by_request` (les membres sont stockés en tableau), donc le
  calcul du score prestataire et l'expérience GTEC PRO lisent la table — à
  migrer vers une table de liaison si le volume de missions devient critique.
- **Anti-contournement** : aucun contact direct exposé dans le flux rendez-vous ;
  la plateforme reste intermédiaire.
- **Audit** : `auditLogs` (back-office), `profileChanges` (profil),
  `appointmentEvents` (rendez-vous).

## 8. Tests

```
bun scripts/test-availability.ts   # 26 assertions — logique métier des créneaux
bun tsc -b --noEmit                # vérification de types
bunx convex dev --once             # push + typecheck serveur
bun run build                      # bundle de production
```

## 9bis. Marché de services — choix du technicien par le client (nouveau)

GTEC PRO fonctionne comme un **marché de services** (§21) : après création d'une
demande, le client découvre les professionnels éligibles, les compare, demande
des devis, puis choisit. Deux modes : **MODE 1 « Je choisis »** (sélection
1-5 pros → devis → acceptation) et **MODE 2 « GTEC choisit pour moi »**
(affectation algorithmique par `chooseForMe`).

**Moteur (`src/convex/matching.ts`)**
- `findProfessionals` : filtrage d'éligibilité (§3 — vérifié, sans sanction
  niveau ≥ 3, abonnement actif, disponible, compétences nomenclature, zone
  ≤ 25 km ou 60 km si recherche élargie) puis score pondéré 0-100 (§4) :
  compétences 30 % / proximité 20 % / disponibilité 15 % / qualité 10 % /
  expérience 10 % / certifications 5 % / charge 5 % / historique 5 %.
- `requestQuotes` : envoi simultané à 1-5 pros + délai de réponse (§11 :
  critique 10 min, urgente 60 min, normale 12 h).
- `respondToQuoteRequest` : proposition pro (montant, arrivée, garantie,
  message) — le devis signé (table `quotes`) reste la référence financière.
- `acceptQuoteRequest` : le client choisit → création de l'affectation
  officielle, notification au pro retenu, « demande pourvue » aux autres (§19).
- `expandSearch`, `declineQuote`, `requestQuoteModification`, `logComparison`,
  `toggleShortlist`, `recordMatchRun` (traçabilité).
- Espace pro : `upsertPresence` (🟢🟠🔵⚫ + tarif « à partir de »),
  `upsertServiceZone`, `publishAvailabilitySlot`, `myQuoteRequests` (inbox,
  adresse approximative §16 avant acceptation).

**Tables (§20, dans `schemaExtensions.ts`)** : `professionalPresence`,
`professionalServiceZones`, `professionalMatches`, `clientShortlists`,
`quoteRequests`, `professionalComparisons`, `selectionEvents`,
`availabilitySlots`, `matchingScores` (+ champ `searchExpanded` sur
`serviceRequests`).

**UI** : `ProfessionalMatches.tsx` (étape « Professionnels » de
NewRequest + cartes §5 avec recommandations 🏆⚡💰⭐🛠️ §10, comparateur §7),
carte « Propositions de devis » dans RequestDetail (comparer, accepter,
refuser, demander modification, élargir la recherche), onglet « Marché » dans
TechnicianSpace (`ProMarketplace.tsx`). Confidentialité : score interne jamais
affiché (§6), distance en « ~km » (§16), coordonnées privées masquées (§14).

## 9. Notifications & sweep quotidien

`crons.daily` (`gtec-daily-sweep`) traite : devis expirés, rappels de visite
(< 48 h), abonnements expirants, dettes de commission, **certifications
expirant sous 30 j**, **rappel annuel de mise à jour du profil** (§22).

## 10. Documentation & dette assumée

- Ce fichier + les en-têtes de chaque module Convex (règles métier commentées).
- **Non couvert à ce jour** : messagerie (§25), carte géographique (§11),
  Store/Stock (§15, §22), véhicules (§21), badges factuels calculés (§17),
  moteur de recherche visuel multi-critères (§6), IA photo/vidéo (§10).
  Les recommandations explicables sont couvertes côté marché de services
  (badges 🏆⚡💰⭐🛠️ du moteur de matching) ; le reste (§36) reste à venir.
  L'Academy « formations en ligne » (§16)
  est couverte par le volet diplômes/référentiel MINESUP (dossier professionnel
  vérifiable) ; les modules e-learning interactifs restent hors périmètre.
  Les phases 3-7 (briefs, marketplace B2B, GTEC AI, IoT) sont livrées —
  voir sections 4 et 5.

## 11. Plan de déploiement

1. `bunx convex dev --once` (schéma + fonctions)
2. `bun tsc -b --noEmit`
3. `bun run build` → `dist/`
4. Variables d'environnement : clés MoMo/CinetPay, e-mail, SMS dans l'onglet
   **Keys/API keys** (jamais de secrets dans le dépôt).