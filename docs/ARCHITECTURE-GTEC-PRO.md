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
| Diagnostic & estimation | `advisor.ts` + `lib/` | `saveDiagnostic`, `saveEstimate`, `linkEstimateToRequest` |
| Client entreprise (§14) | `clientCompany.ts` | `myClientCompany`, `inviteClientTeamMember`, `upsertClientSite`, `adminReviewClientCompany` |
| Rendez-vous (§8) | `appointments.ts` | `myAvailabilityRules`, `bookableTechnicians`, `availableSlots`, `bookAppointment`, `updateAppointment`, `myAppointments` |
| Favoris (§35) | `favorites.ts` | `myFavorites`, `addFavorite`, `removeFavorite` |
| Back-office & planifiés | `crons.ts`, `adminApp.ts`, `institutions.ts` | `dailySweep`, statistiques, référentiel MINESUP |

## 5. Écrans livrés (non exhaustif)

Landing, Auth, Dashboard, ClientDashboard, NewRequest, RequestDetail,
TechnicianSpace, MyProfile, MyClientProfile, BuildingsPage, AssetScanPage,
VerifyPage, PublicProfilePage, DiasporaPage, AdminConsole, AdminApp.

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
  délai minimum, capacité quotidienne, refus tracé.
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

## 9. Notifications & sweep quotidien

`crons.daily` (`gtec-daily-sweep`) traite : devis expirés, rappels de visite
(< 48 h), abonnements expirants, dettes de commission, **certifications
expirant sous 30 j**, **rappel annuel de mise à jour du profil** (§22).

## 10. Documentation & dette assumée

- Ce fichier + les en-têtes de chaque module Convex (règles métier commentées).
- **Non couvert à ce jour** : messagerie (§25), carte géographique (§11),
  Store/Stock (§15, §22), véhicules (§21), Academy/formations en ligne (§16),
  badges factuels calculés (§17), moteur de recherche visuel multi-critères (§6),
  IA photo/vidéo (§10), recommandations explicables (§36).

## 11. Plan de déploiement

1. `bunx convex dev --once` (schéma + fonctions)
2. `bun tsc -b --noEmit`
3. `bun run build` → `dist/`
4. Variables d'environnement : clés MoMo/CinetPay, e-mail, SMS dans l'onglet
   **Keys/API keys** (jamais de secrets dans le dépôt).