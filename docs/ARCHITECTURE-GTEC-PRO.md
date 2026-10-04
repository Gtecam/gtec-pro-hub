# GREEN TECH ENERGY CAMEROON — GTEC PRO

## Architecture de référence (document vivant)

> « Du besoin à la réalisation : trouver, commander, suivre et gérer tous vos services
> techniques dans une seule plateforme. »

Ce document est **vivant** : il décrit l'état réel du code (aucune fonctionnalité
annoncée sans être implémentée, testée et poussée sur Convex).

---

## 1. Architecture fonctionnelle

Quatre interfaces, un socle commun :

| Interface | Rôle | Écran principaux |
|---|---|---|
| **CLIENT** | Demander, planifier, payer, suivre | `/`, `/auth`, `/dashboard`, `/dashboard/new`, `/dashboard/requests/:requestId`, `/messages`, `/diaspora`, `/profile` |
| **TECHNICIEN** | Se qualifier, recevoir, exécuter | `/technician`, `/technician/requests`, `/technician/missions`, `/technician/devis`, `/technician/messages`, `/technician/revenus`, `/technician/profile`, `/technician/abonnement` |
| **ENTREPRISE** | Structurer équipe, sites, flotte | `/company/:companyId` (phases ultérieures) |
| **ADMIN** | Vérifier, superviser, arbitrer | `/admin`, `/admin/console` |

Flux cible (extrait) : **Besoin → Recherche → Choix → Devis → Accepation → Intervention → Réception → Paiement → Avis**.

---

## 2. Architecture technique

- **Web** : Vite + React 19 + TypeScript + Tailwind + shadcn/ui + Framer Motion
- **Backend / BDD** : Convex (base de données + fonctions typées + subscriptions temps réel)
- **Auth** : Convex Auth (OTP e-mail), RBAC `users.role` = `user` | `admin`, `accountType`
- **Paiements** : MoMo / CinetPay (webhooks dans `http.ts`, vérification serveur)
- **Documents** : Convex Storage (URLs non publiques côté client tant que possible)
- **Email/SMS** : files d'attente `emailQueue` / `sms` + notifications in-app `notifications`
- **Diaspora** : table `diasporaBeneficiaries` + champ `isDiaspora` / `beneficiaryId` sur la demande

Contraintes du runtime Convex appliquées dans tout le code :
`crypto.subtle` (pas `node:crypto`), une query ne peut pas écrire, les helpers
partagés sont dans `./gtec` (`requireUser`, `notify`, `notifyAdmins`, `auditLog`).

---

## 3. Schéma de base de données

Le schéma est scindé en deux fichiers fusionnés par spread dans `schema.ts` :

- `schema.ts` — cœur métier : `users`, `serviceRequests`, `quotes`, `assignments`, `reviews`, `sanctions`, `notifications`, `requestEvents`, `technicianProfiles`, `payments`, `interventionReports`, `invoices`, `disputes`, `diasporaBeneficiaries`
- `schemaExtensions.ts` — extensions livrées par vagues :
  - Demandes client : `diasporaBeneficiaries`
  - GTEC PRO avancé : `matchingScores`, `professionalMatches`, `clientShortlists`, `quoteRequests`, `professionalComparisons`, `selectionEvents`, `professionalPresence`, `professionalServiceZones`, `availabilitySlots`, `favorites`, `clientCompanies`, `clientSites`, `clientTeamMembers`, `availabilityRules`, `appointments`, `appointmentEvents`
  - Profil : `technicianEquipment`, `profileConfirmations`, `professionalExperiences`, `technicianSkills`, `profileCertifications`, `trainingRecords`, `portfolioProjects`, `profileChanges`
  - Bâtiment : `buildings`, `buildingAssets`, `buildingDocuments`, `buildingEvents`, `buildingAccessGrants`
  - Missions : `missionChecklists`, `checklistItems`, `digitalCertificates`, `workGuarantees`

Invariants : rien n'est **supprimé** (archivage `isActive = false`), toutes les
tables métier portent `createdAt` / `updatedAt`, et les éléments sensibles suivent
le cycle `DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED / REJECTED`.

---

## 4. API (Convex functions)

| Domaine | Fichier | Points d'entrée principaux |
|---|---|---|
| Demandes | `gtec.ts` | `createRequest`, `cancelRequest`, `listMyRequests`, `getRequestDetail`, `acceptQuote`, `refuseQuote`, `initiatePayment`, `clientReception`, `submitReview` |
| Diaspora | `diaspora.ts` | `createDiasporaRequest`, `listBeneficiaries`, `validateByDiaspora` |
| Marché de services | `matching.ts` | `findProfessionals`, `myShortlist`, `quoteRequestsForRequest`, `myQuoteRequests`, `recordMatchRun`, `toggleShortlist`, `requestQuotes`, `respondToQuoteRequest`, `declineQuote`, `requestQuoteModification`, `acceptQuoteRequest`, `chooseForMe`, `expandSearch`, `logComparison`, `upsertPresence`, `upsertServiceZone`, `removeServiceZone`, `publishAvailabilitySlot`, `removeAvailabilitySlot`, `myAvailabilitySlots` |
| Profil | `profile.ts`, `profileExtras.ts` | `upsertExperience/Skill/Certification/Training/Project`, `myProfileCompletion`, `adminReviewProfileItem` |
| Revenus | `gtec.ts` | `commissionFor`, `payoutFor`, `splitFiftyFifty`, `adminListCommissions` |
| Back-office | `gtec.ts` | `requireAdminScope`, `adminExists`, `claimAdmin` |
| Notifications | `gtec.ts` | `notify`, `notifyAdmins`, `listMyNotifications`, `markNotificationRead` |
| Admin & autre | `adminApp.ts`, `crons.ts` | statistiques, référentiel, sweep quotidien |

---

## 5. Écrans livrés (non exhaustif)

Landing, Auth, Dashboard, ClientDashboard, NewRequest, RequestDetail,
TechnicianSpace, DiasporaPage, PublicProfilePage, AdminConsole, AdminApp.

---

## 6. Rôles et permissions

| Rôle | Peut |
|---|---|
| Visiteur | Consulter pages publiques (landing, demande utilisateur) |
| Client | Demandes, messagerie liée aux demandes, suivi, réception, paiement, évaluation, profil |
| Client diaspora | Commander et payer pour un proche au Cameroun ; le donneur d'ordre reste le payeur |
| Technicien | Profil, spécialités, disponibilité, propositions de devis, missions, rapports, revenus, abonnement |
| Entreprise prestataire | Fiche, profil, devis, missions (gestion avancée des équipes en V2) |
| Admin | Vérifier, arbitrer les litiges, voir paiements/commissions/abonnements/réclamations/avis, confirmer les statuts |

---

## 7. Sécurité & protection des informations

- **Public vs privé** : `PublicProfilePage` expose seulement ce qui est nécessaire au parcours client ; les coordonnées exactes du professionnel restent masquées jusqu'à l'acceptation du devis.
- **Déclaration ≠ vérification** : le dépôt d'un justificatif ne accorde aucun badge ; seul l'administration écrit `VERIFIED`.
- **Déclenchement seulement par un utilisateur connecté** : `RequireAuth` retourne vers `/auth?returnTo=...` conservant le chemin. Aucun contenu sensible n'est accessible sans session.
- **Paiements** : le client ne voit que le montant et le moyen de paiement ; le système enregistre automatiquement montant, mode, date, référence, statut, prestation, client, professionnel, commission GTEC.
- **Côté admin** : tout accès aux statistiques, aux commissions et aux paiements passe par `requireAdminScope`.
- **Journal** : `requestEvents` pour le pipeline de la demande, `auditLogs` pour les actions sensibles (sanction, modération, commission, annulation).

---

## 8. Tests

```sh
bun scripts/test-availability.ts   # 26 assertions — logique métier des créneaux
bun tsc -b --noEmit                # vérification de types
bunx convex dev --once             # push + typecheck serveur
bun run build                      # bundle de production
```

---

## 9. Notifications & sweep quotidien

`crons.daily` traite : abonnements expirants, rappels de paiement, ainsi que la
gestion administrative des commandes diaspora (validation à distance du bénéficiaire).

---

## 10. Documentation & dette assumée

- **Non couvert** (hors périmètre V1) : matching avancé score, shortlists multi-pros, comparateurs de devis détaillés, marketplace B2B, bâtiments/équipements, garanties, maintenance, IoT.
- **Clarté V1** : le policier métier reste celui du cahier des charges — la demande est un simple flux, le devis est le loup de la situation, l'acceptation déclenche l'affectation, le suivi est en temps réel, la réception est signée, le paiement est sécurisé, l'évaluation est laissée libre.
- L'espace admin conserve les indicateurs administratifs de la V1 (clients, pros, demandes, prestations, PA, commissions, abonnements, réclamations, notes, délais).
