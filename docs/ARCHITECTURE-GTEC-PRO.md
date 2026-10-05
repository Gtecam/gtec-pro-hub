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

## 5.1 Écrans publics

| Écran | URL | Rôle | Contenu | Sortie vers |
|---|---|---|---|---|
| **Landing** | `/` | Présentation du service, parcours client et technicien, b2b / académie MINESUP, témoignages, couverture 5 villes | Hero, services, parcours (8 JOURNEY_STEPS), sections b2b + académie, techniciens, témoignages, CTA | `/auth?returnTo=/dashboard` ou `/auth?returnTo=/technician` |
| **Auth** | `/auth` | Connexion / inscription (OTP e-mail, OTP SMS), retour sur la destination demandée | Espaces identiques, case « Rester connecté », liens vers les espaces client / technicien | `/dashboard` ou `/technician` selon le rôle |
| **VerifyPage** | `/verify/:token` | Vérification de signature d'intervention, preuve de paiement ou réception | Formulaire de vérification, confirmation métier, log `auditLog` | La page d'origine (enlevant `returnTo`) |

## 5.2 Écran client

| Écran | URL | Rôle | Contenu | Sortie vers |
|---|---|---|---|---|
| **Dashboard** | `/dashboard` | Espace client récapitulatif | Accueil avec statistiques, bouton « Nouvelle demande », accès à l'espace complet, numéro de support GTEC, `MyClientProfile`, `AppointmentsClientCard`, `FavoritesCard`, `AdvisorHistoryCard` | `/dashboard/new` |
| **NewRequest** | `/dashboard/new` | Formulaire de demande (7 étapes) | Domaine → Intervention → Besoin → Photos (max 4, compression), Adresse (+ GPS), Récapitulatif, Professionnels (marché serveur) | `/dashboard/requests/:requestId` |
| **RequestDetail** | `/dashboard/requests/:requestId` | Détail du parcours d'une demande | Panneau gauche (statut, quilts, devis, marché, paiement, équipe, rapport, facture, certificat, avis, litige, photos, journal), panneau droit (actions selon le statut), stepper JOURNEY_STEPS, `SignaturePad`, paiement MoMo/CinetPay/espèces/virement, reçu, PDF facture + PV + dossier | Actions métier : accepter/refuser devis, choisir pour moi, modifier offre, payer tranche, signer, évaluer, signaler |
| **PublicProfilePage** | `/pro/:userId` | Fiche publique d'un professionnel | Nom, spécialité, badge `verifie`, avis (moyenne/count), délais, galerie, contact masqué jusqu'à acceptation du devis | `/dashboard/requests/:requestId` ou `/technician` |
| **DiasporaPage** | `/diaspora` | Espace diaspora (client à l'étranger) | Liste des bénéficiaires (`diasporaBeneficiaries`), choix du bénéficiaire, code de validation, suivi de la demande, libération des fonds | `/dashboard/requests/:requestId` |
| **MyClientProfile** | `/profile` | Contacts et adresses | Adresses enregistrées, préférences, photo de profil, `PhoneVerifiedBadge` | `/dashboard` |

## 5.3 Écran technicien

| Écran | URL | Rôle | Contenu | Sortie vers |
|---|---|---|---|---|
| **TechnicianSpace** | `/technician` | Espace technicien complet | `AppShell` `cloisonnement` (panneau admin/technicien/client), `PhoneVerifiedBadge`, `SignaturePad`, `JourneyStepper`, `StatusBadge` | Tabs : missions / devis / marché / abonnement / profil / retraits / gains / avis / visites |
| **Candidature** | `/technician` (statut `en_attente`/`rejete`) | Candidature au rôle de technicien | CNI + diplôme obligatoires, `CredentialForm` branchement MINESUP, `NOMENCLATURE` (domaine → spécialité → métier → compétences → diplôme → certifications), zones avec `Switch`, `DocumentsUploader` | `/technician` |
| **Missions** | `/technician/missions` | Recevoir et exécuter les missions | `MissionChecklist` (sécurité), `ReportForm`, encaissement espèces (`cashProof`), demande de matériel, déplacement GPS vers chantier, `markArrival` | `/technician` |
| **Devis terrain** | `/technician/devis` | Chiffrage visuel sur le terrain (V6) | `FieldQuoteForm` (TVA 19,25 % / 50 % avant/solde), sélecteur de demande, validation automatique GTEC | `/technician` |
| **Marché** | `/technician/marche` | Proposer et suivre les offres | `ProMarketplace` (demandes de devis, présence, zones) | `/technician` |
| **Abonnement** | `/technician/abonnement` | Dossier d'abonnement mensuel/trimestriel/annuel | `PLANS` (6000 / 20000 / 55000 FCFA), moyens de paiement (`PAYMENT_METHODS`), `requestSubscriptionPayment` | `/technician` |
| **Profil / Retraits / Gains / Avis / Visites** | `/technician/profile` | Dossier professionnel | `MyProfile`, `AvailabilityManager`, retraits (min 1000 FCFA, `requestWithdrawal`), commissions 10 % (`payCommission`), avis clients (`StarRating`), visites de maintenance (`VisitReportForm`) | `/technician` |
| **Sanctions / Score** | `/technician` | Gestion des sanctions et du score | `mySanctions` (niveaux 1–5), `contestSanction`, `myProviderScore` (§38), bandeau sanctions actives | `/technician` |

## 5.4 Écran admin

| Écran | URL | Rôle | Contenu | Sortie vers |
|---|---|---|---|---|
| **AdminConsole** | `/admin` | Back-office de supervision | Statistiques V1 (clients, pros, demandes, prestations, PA, commissions, abonnements, réclamations, notes, délais), `requireAdminScope` | `/admin/console` |
| **AdminApp** | `/admin/console` | Modules d'arbitrage et de vérification | Chaîne d'OBS, validation des profils técniciens, citations, paiements et commissions, `auditLogs`, contenu des tableaux (map/reduce) pour les contrôles manuels | `/admin` |
| **Diaspora validation** | `/admin/console` | Validation à distance des commandes diaspora | `validateByDiaspora`, libération des fonds, rapport du bénéficiaire, `auditLog` des actions sensibles | `/admin` |
| **Stats & reporting** | `/admin/console` | Indicateurs et tableaux de bord | Comptes, demandes en cours/terminées, PA, commissions, abonnements, réclamations, notes, délais, `crons.daily` sweep | `/admin` |

## 5.5 Spécifications écran par écran (GTEC PRO V1)

### 5.5.1 Espace client ( CLIENT )

#### 5.5.1.1 Landing — `/`
- **Objectif** : convaincre et orienter vers l'espace authentifié.
- **Champs/boutons** :
  - Hero : slogan, CTA « Créer ma demande » (vers `/auth?returnTo=/dashboard`), visiontte ultime TECHNICIEN (vers `/auth?returnTo=/technician`).
  - Services GTEC PRO (catalogue `SERVICES` + icônes `categoryIcon`).
  - Parcours client (8 `JOURNEY_STEPS`).
  - Sections b2b marketplace et académie MINESUP.
  - Section techniciens (badge `verifie`, notes, specialite).
  - Témoignages (avis clients).
  - Couverture 5 villes (`CITIES`).
  - CTA final vers l'authentification.
- **Sortie** : `/auth?returnTo=/dashboard` (client) ou `/auth?returnTo=/technician` (technicien).

#### 5.5.1.2 Auth — `/auth`
- **Objectif** : connexion / inscription, conservation du chemin de retour.
- **Champs** : e-mail OTP, SMS OTP, mot de passe (si activé), lien retour `returnTo`.
- **Sortie** : `/dashboard` ou `/technician` selon `accountType`.

#### 5.5.1.3 Dashboard — `/dashboard`
- **Objectif** : recapitulatif client.
- **Champs/boutons** :
  - `MyClientProfile` : adresses, préférences, photo de profil.
  - `AppointmentsClientCard` : RDV avec professionnels vérifiés.
  - `FavoritesCard` : favoris techniciens/entreprises/services.
  - `AdvisorHistoryCard` : historique des sessions conseiller (F°1-F°3).
  - `PhoneVerifiedBadge` : identité vérifiée + numéro vérifié.
  - Liste des demandes : filtres en cours & fermés, bouton `Nouvelle demande` → `/dashboard/new`.
  - Bouton support : `655 09 42 28`.

#### 5.5.1.4 NewRequest — `/dashboard/new`
- **Objectif** : saisie complète de la demande client en 7 étapes.
- **Etapes (STEPS)** :
  1. **Domaine** – sélecteur catalogue `SERVICES` / dynamique `catalog.listServiceCategories` (12 domaines officiels).
  2. **Intervention** – code d'intervention (NOMENCLATURE), intitulé, description, urgence (`URGENCY_LEVELS`), date souhaitée, hint budgétaire.
  3. **Besoin** – titre (min 4 caractères), description (min 10 caractères), message vocal (`MediaRecorder`, ~1 min, webm/opus compressé), photos 0–4 (compression automatique `compressImageIfNeeded`).
  4. **Adresse** – adresse, ville (geo-détection auto via `nearestCity` ≤ 40 km si GPS), `address` obligatoire ≥ 5 caractères.
  5. **Récapitulatif** – synthèse du formulaire (domaine, intervention, urgence, date, budget, photos, adresse, GPS, note vocale).
  6. **Professionnels** – marché serveur : `quoteRequestsForRequest`, propositions, filtres, accepter/refuser/modifier, `chooseForMe`.
- **Mode diaspora** : `?diaspora=1&beneficiary=...` → champ `beneficiaryId` obligatoire, `createDiasporaRequest`.
- **Sortie** : `/dashboard/requests/:requestId` (status `nouvelle`).

#### 5.5.1.5 RequestDetail — `/dashboard/requests/:requestId`
- **Objectif** : suivi et actionnel complet de la demande.
- **Panneau gauche** :
  - **Parcours** : `JourneyStepper` + hint statut.
  - **Géo-terrain** : suivi GPS équipe (visible client + diaspora accompagnant un proche), `teamArrivalAt`, coordonnées chantier.
  - **Devis** : `quote.number`, `quote.status` (emis/accepte/refuse/expire), `quote.pdf` (TTC, TVA 19,25 %), `quote.validUntil`.
  - **Marché** : propositions `quoteRequestsData.items`, délai réponse, `expandSearch`, `chooseForMe`, accepter/refuser/modifier.
  - **Paiement** : tranches 50/50 (`advance` / `solde`), `payment`, `PAYMENT_METHODS` (MoMo, orange_money, espèces, virement), preuve photo pour espèces, `initiatePayment`.
  - **Équipe** : chef d'équipe + membres, `assignment.notes`, statut `en_intervention`.
  - **Rapport** : `report.workDone`, `partsUsed`, photos avant/après, `recommendations`, `report.clientSignature`.
  - **Facture** : `invoice.number`, `invoice.status`, `invoice.pdf`, `dossier.complet.pdf` (facture + PV).
  - **Certificat** : `certificate` (SHA-256, `verifyToken`, QR), `guarantees` (garantie de travaux, période).
  - **Avis** : étoiles 1–5, commentaire, `submitReview`.
  - **Litige** : catégories (non conforme, retard, paiement, comportement, matériel, devis, contrat, autre), `createDispute`, suivi `ouvert/en_cours/resolue/rejetee`.
  - **Photos** : photos de la demande.
  - **Journal** : `requestEvents`.
- **Panneau droit** : actions selon statut :
  - `nouvelle` : choisir un pro → marché.
  - `devis_emis` : accepter/refuser devis (`acceptQuote`/`refuseQuote`).
  - `devis_accepte` : payer `avance` 50 % (PayPal / MoMo / espèces / virement).
  - `en_intervention` : suivi GPS, paiement espèces, `markArrival`.
  - `rapport_emis` : payer `solde` 50 % → signature PV (`SignaturePad`, `clientReception`) → facture.
  - `terminee` : évaluation, certificate, guarantee.
  - `annulee` : courte notice d'annulation.

#### 5.5.1.6 PublicProfilePage — `/pro/:userId`
- **Objectif** : fiche publique (peut être consultée par un visiteur).
- **Champs exposés** : nom, spécialité, icône `verifie`, avis moyens/count, note, délais de réponse, galerie.
- **Masqués** : coordonnées exactes, CNI, contact jusqu'à acceptation du devis (acceptation → `assignment` + `teamLeader` + `members`).

#### 5.5.1.7 DiasporaPage — `/diaspora`
- **Objectif** : commander pour un proche.
- **Champs/boutons** :
  - `listBeneficiaries` : bénéficiaires enregistrés, code de validation, statut de la demande.
  - Formulaireographie : `createDiasporaRequest` (copie adresse du proche, `isDiaspora=true`, `beneficiaryValidationCode`).
  - Validation à distance : `validateByDiaspora` (conforme / correction demandée / problème signalé).
  - Suivi de la demande client incluant la validation du bénéficiaire.

#### 5.5.1.8 MyClientProfile — `/profile`
- **Objectif** : identité et contacts.
- **Champs** : `firstName`, `lastName`, `nationalId`, `gender`, `birthDate`, `phone`, `altPhone`, `city`, `address`, `quarter`, `customerType`, `companyName`, `taxId`, `idDocumentUrl` (DM photographies, compression automatique).
- **Actions** : `updateClientIdentity`, sauvegarde permanente, `identityComplete` (verdict du front).

### 5.5.2 Espace technicien ( TECHNICIEN )

#### 5.5.2.1 TechnicianSpace — `/technician`
- **Objectif** : toute l'activité du technicien dans un espace cloisonné.
- **Structure** : `AppShell` (admin/technicien/client links, pas de lien transversal), `PhoneVerifiedBadge` (numéro vérifié), `JourneyStepper`, `SignaturePad`, `StatusBadge`.
- **GPS** : partage optionnel (`updateTechnicianLocation`, `stopTechnicianLocationSharing`), `geo.position` + `lastGps`, throttle 20 s, déplacement > 30 m.

#### 5.5.2.2 Candidature — `/technician` (statut `en_attente` / `rejete`)
- **Objectif** : dossier complet pour obtention du statut `verifie`.
- **Obligatoires** : `nationalId`, `phone`, `domainCode`, `specialtyCode`, `jobTitle`, `skills.length > 0`, `degreeGroup`, `degreeKey`, `experienceBand`, `zones.length > 0` + `documents` (CNI obligatoire, diplôme/certificat/attestation obligatoire).
- **Champs** :
  - **Identité** : prénom, nom, CNI, téléphone, secondaire, naissance, sexe, ville de résidence, quartier/address.
  - **Profession** : nom libellé + `NOMENCLATURE` (domaine → spécialité → métier), compétences (`SKILLS_BY_DOMAIN`), palette de spécialité libre, métier exact libre, palier d'expérience, années précises, employeur actuel, références.
  - **Zones** : `CITIES` avec `Switch`, `district`, `radiusKm` (≤ 300 km).
  - **Parcours académique** : niveau → diplôme → spécialité du diplôme, `highestDegree`, établissement, année d'obtention.
  - **Certifications** : `CERTIFICATION_SUGGESTIONS`.
  - **Déclaration MINESUP** : `CredentialForm` (institution, diplôme, année, fréquence : `myCredentials` + `institutions.myCredentials`).
  - **Documents** : `DocumentsUploader` (CNI + diplôme, jpg/png/pdf, max 5 Mo/champ, compression vers JPEG, ~350 Ko/pièce).
  - **Validation** : `submitTechnicianApplication` (status `en_attente` → vérification admin).

#### 5.5.2.3 Missions — `/technician/missions`
- **Objectif** : exécution des interventions assignées.
- **Contenu** : liste `listMyMissions`, filtres actives/historique, `request.title`, `request.reference`, adresse, `assignment.scheduledAt`, `request.coords`, `request.teamArrivalAt`.
- **Actions** :
  - **Déplacement** : `markArrival` (GPS), ETA estimé (~30 km/h).
  - **Géo-terrain** : positions GPS partagées, `teamLocations` + `request.coords`.
  - **Encaissement espèces** : `cashFor`, `cashProof` (photo du reçu obligatoire), `cashPhone` client.
  - **Déroulé de la mission** : `MissionChecklist` (sécurité, ledeur seulement), `ReportForm` (compte rendu), demande matériel (`requestMaterial`).
  - **Clôture** : `completeVisit` (report) → `assignment.status = terminee`, `request.status = terminee`.

#### 5.5.2.4 Devis terrain — `/technician/devis`
- **Objectif** : chiffrage V6 sur le terrain.
- **Champs** : `FieldQuoteRequestPicker` (demandes `nouvelle`/`devis_emis`), lignes (`label`, `qty`, `unitPrice`), `FieldQuoteForm` (subtotal, TVA 19,25 %, total TTC, avance 50 %, solde 50 %), validation automatique GTEC.
- **Devis reçu** : envoi du `submitFieldQuote` → notification client, paiement 50/50.

#### 5.5.2.5 Marché — `/technician/marche`
- **Objectif** : offres et présence client.
- **Contenu** : `ProMarketplace` : demandes de devis, propositions (`quoteRequestsForRequest`), presence, zones, `upsertPresence`, `upsertServiceZone`, `removeServiceZone`, réponse aux offres client (`respondToQuoteRequest`, `declineQuote`).

#### 5.5.2.6 Abonnement — `/technician/abonnement`
- **Objectif** : droits d'accès aux missions.
- **Plans** : `PLANS` = mensuel 6000 / trimestriel 20000 (90 j, 2 mois offerts) / annuel 55000 (365 j). `requestSubscriptionPayment` → `myPendingSubscriptionPayment` → statut actif.
- **Validation** : téléphone payeur, moyens `PAYMENT_METHODS`, `requestSubPayment`.

#### 5.5.2.7 Mon profil — `/technician/profile`
- **Objectif** : dossier professionnel vivant.
- **Contenu** : `MyProfile` (photo, bio, specialite, métier, zones), `AvailabilityManager` (disponibilité + rendez-vous reçus), statut du compte (`verifie`, specialite, abonnement, date de péremption), badge `BadgeCheck` numéro vérifié.

#### 5.5.2.8 Retraits — `/technician/retraits`
- **Objectif** : régularisation des gains.
- **Champs** : montant ≥ 1000 FCFA, `wdMethod` (MTN MoMo, Orange Money, virement, espèces), `wdDestination` (numéro ou IBAN), `requestWithdrawal` → `myWallet` (payé/approuve/refuse/attente), historique des retraits.
- **Sans protection** : si commission due au delà de l'échéance → blocage retraits et nouvelles missions.

#### 5.5.2.9 Gains — `/technician/gains`
- **Objectif** : suivie des commissions et des paiements.
- **Citations** : `myCommissions` (90 % équipe / 10 % GTEC, `payCommission` avec numéro payeur, `commissionFor`, `splitFiftyFifty`), détail de base, `dueTotal`/`paidTotal`, `myPayouts` (statut `dû`/`payé`).

#### 5.5.2.10 Avis — `/technician/avis`
- **Objectif** : recueillir et lire les notes clients.
- **Contenu** : `myRating` (moyenne + count), `myReviews` (note, commentaire, `review.at`), `StarRating`.

#### 5.5.2.11 Visites — `/technician/visites`
- **Objectif** : maintenance assignée.
- **Contenu** : `myVisits` (contrat, `visit.status` fait/à faire, `visit.scheduledAt`, `visit.report`), `VisitReportForm` (compte rendu ≥ 10 caractères, `handleCompleteVisit`).

#### 5.5.2.12 Sanctions et score — `/technician`
- **Objectif** : contrôle legal et professionnel.
- **Champs** : `mySanctions` (niveaux 1–5, `contestSanction`), `myProviderScore` (complétion, taux, satisfaction, `score`).
- **Bandeau** : sanctions actives (`mySanctions.activeCount > 0`, niveau max, accès limités), message de contestation.

### 5.5.3 Espace admin ( ADMINISTRATION )

#### 5.5.3.1 AdminConsole — `/admin`
- **Objectif** : supervision et statistiques V1.
- **Tableaux** : clients, professionnels, demandes (statut), prestations, PA, commissions, abonnements, réclamations, notes, délais.
- **Contrôles** : `requireAdminScope` sur tout accès sensible, `auditLog` des actions critiques.

#### 5.5.3.2 AdminApp — `/admin/console`
- **Objectif** : arbitrage et vérifications.
- **Modules** :
  - Validation de profils techniciens : `adminReviewProfileItem`, statut `verifie`/`rejete`.
  - Citations de devis : `adminListCommissions`, validation, notation.
  - Paiements, commissions, abonnements, réclamations, notes, délais.
  - Chaîne d'OBS, `auditLogs` pour tous les arbitrages.
  - Contenu des tableaux (map/reduce) pour les contrôles manuels.

#### 5.5.3.3 Diaspora — `/admin/console` (validation à distance)
- **Objectif** : valider la commande du bénéficiaire.
- **Actions** : `validateByDiaspora` (conforme / correction demandée / problème signalé), `diasporaBeneficiaries`, `beneficiaryValidationCode`, libération des fonds.

#### 5.5.3.4 Stats & reporting — `/admin/console`
- **Objectif** : indicateurs quotidiens par `crons.daily`.
- **Traitements** : abonnements expirants, rappels de paiement, sweep de validation des commandes diaspora.

### 5.5.4 Rôles et permissions (V1)

| Rôle | Peut |
|---|---|
| Visiteur | Consulter pages publiques (landing, fiche publique) |
| Client | Demandes, suivi, réception, paiement, évaluation, profil |
| Client diaspora | Commander pour un proche, paiement, validation à distance du bénéficiaire |
| Technicien | Candidature, profil, spécialités, disponibilité, devis terrain, missions, remboursements, revenus, abonnement |
| Entreprise prestataire | Fiche, profil, devis, missions (gestion avancée des équipes en V2) |
| Admin | Vérifier, arbitrer, voir paiements/commissions/abonnements/réclamations/avis, confirmer les statuts, audits |

### 5.5.5 Pipelines et statuts clés

| Pipeline | Statuts |
|---|---|
| Demande client | `nouvelle` → `devis_emis` → `devis_accepte` → `affectee` → `en_intervention` → `rapport_emis` → `terminee` / `annulee` |
| Devis | `emis` → `accepte` / `refuse` / `expire` |
| Marché | `envoyee` → `proposee` → `acceptee` / `refusee` / `clore` |
| Profil technicien | `en_attente` → `verifie` / `rejete`, sanctions niveaux 1–5 |
| Abonnement | `en_attente` → actif, péremption, `crons.daily` sweep |
| Diaspora | `createDiasporaRequest` → validation bénéficiaire → `validateByDiaspora` (conforme / correction / problème) → libération des fonds |
| Contrat | signature client (PV), `guarantee` (garantie de travaux), `certificate` (QR, SHA-256), `dispute` (litige) |

### 5.5.6 Notes d'intégration

- **Composants réutilisés uniquement** : `AppShell`, `NotificationBell`, `PhoneVerificationBanner`, `StatusBadge`, `JourneyStepper`, `SignaturePad`, `PublicShell`, `AdvisorCard`, `BriefCard`, `ProfessionalMatches`, `AdvisorHistoryCard`, `FavoritesCard`, `AccountCard` (absent du repo, non inventé), `MyClientProfile`, `MyProfile`, `CredentialForm`, `DocumentsUploader`, `FieldQuoteForm`, `ProMarketplace`, `MissionChecklist`, `AvailabilityManager`, `ReportForm`, `VisitReportForm`, `StarRating`, `PhoneVerifiedBadge`, `FavoritesCard`, `AppointmentsClientCard`, `ClientCompanyCard`, `ClientSiteCard`, `ClientTeamMemberCard`, `ClientSiteDocumentCard`.
- **API de référence** : `gtec.ts` (demandes, paiements, commissions, revenus, profil, contacts), `matching.ts` (marché, devis, présence, zones, disponibilités), `diaspora.ts` (bénéficiaires, validation à distance), `profile.ts`/`profileExtras.ts` (dossier professionnel), `guarantees.ts`/`missions.ts`/`catalog.ts`/`clientCompany.ts`/`favorites.ts`/`appointments.ts` (extensions V1).
- **Journalisation** : `requestEvents` pour le pipeline de demande, `auditLogs` pour les actions sensibles (sanction, commission, annulation, diaspora, administration).
- **Paiements** : MoMo (MTN/Orange), CinetPay (escrow), espèces (preuve photo), virement, minimum de retrait 1000 FCFA, commission GTEC 10 %.
- **Sécurité** : données sensibles (CNI, coordonnées exactes, documents bancaires) uniquement pour le propriétaire de la demande + l'admin, `RequireAuth` avec `returnTo`, `users.phoneVerified` pour la vérification du numéro.

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

---

## 11. Module CONTRATS, COMMISSIONS ET FACTURATION (V2)

Tables définies dans `src/convex/schemaExtensions.ts` et fusionnées dans le
schéma principal via le spread `...extensionTables` de `src/convex/schema.ts`
(`schemaValidation: false`). API métier : `src/convex/contracts.ts` — le
front-end n'accède jamais aux tables directement.

### 11.1 Tables du module

| Table | Rôle (référentiel) | Champs clés |
|---|---|---|
| `commissionRules` | Taux de commission figé par transaction, 15 % initial, journal d'audit (§1) | `newRatePercent`, `oldRatePercent`, `adminId`, `updatedAt` |
| `contracts` | Contrats GTEC-CTR-YYYY-NNNNNN, durée/fréquence/conditions, versions immuables (§14) | `reference`, `type`, `clientId`, `professionalId`, `amountHT`, `commissionRatePercent`, `commissionAmount`, `netAmount`, `status`, `version`, `clientAccepted`, `professionalAccepted`, `documentHash` |
| `contractTemplates` | Gabarits par type de maintenance, clauses et obligations (§5-§10) | `kind`, `label`, `clauses`, `active` |
| `invoiceItems` | Lignes de facture (désignation, quantité, prix unitaire, TVA) | `invoiceId`, `designation`, `quantity`, `unitPrice`, `total`, `taxRate` |
| `invoicePayments` | Encaissements partiels par facture, idempotence `externalRef`/`transactionRef` (§16) | `invoiceId`, `amount`, `method`, `status`, `transactionRef` |
| `invoiceSequences` | Compteur partagé de numérotation CTR/FAC (§24) | `sequence`, `lastRefNumber` |
| `commissionRecords` | Commission due/payée par transaction (§19), rattachable devis/contrat/facture | `requestId`, `quoteId`, `contractId`, `invoiceId`, `baseAmount`, `ratePercent`, `amount`, `paymentStatus` |
| `contractSignatures` | Signatures électroniques horodatées (IP, user-agent, hash document) (§15) | `contractId`, `version`, `documentHash`, `clientSignedAt`, `professionalSignedAt` |
| `contractAmendments` | Avenants — le contrat signé original reste immuable (§15) | `contractId`, `version`, `signatories[]`, `status` |
| `documents` / `documentVersions` / `documentAccessLogs` | Archive documentaire versionnée, jamais écrasée, accès journalisés (§23) | `documentHash`, `versionNumber`, `pdfUrl`, `status` ; `documentId`, `hash` ; `viewerId`, `accessedAt` |
| `creditNotes` | Avoirs GTEC-AVR-2026-NNNNNN contreparties d'annulation/remboursement (§17) | `reference`, `invoiceId`, `clientId`, `amountHT`, `totalTTC`, `status` (`emis/utilise/rembourse/annule`) |

La table `invoices` (factures GTEC-FAC-YYYY-NNNNNN, §16-§18) est définie dans
`schema.ts` comme fusion des champs V1 (`number`, `amount`, `status`, `issuedAt`,
index `by_request`/`by_client`) et des champs module (`reference`, `type`,
`contractId`, `professionalId`, `dueDate`, `subTotal`, `taxRate`, `totalPaid`,
`remaining`, `pdfUrl`…) ; sa définition « double » de `schemaExtensions.ts`
n'est pas propagée dans `extensionTables` (le spread écraserait la fusion).

### 11.2 Index

| Table | Index |
|---|---|
| `commissionRules` | `by_admin(adminId)`, `by_updatedAt(updatedAt)` |
| `contracts` | `by_client`, `by_professional`, `by_status`, `by_reference` |
| `contractTemplates` | `by_kind`, `by_active` |
| `invoices` | `by_request`, `by_client`, `by_professional`, `by_status`, `by_reference` |
| `invoiceItems` / `invoicePayments` | `by_invoice(invoiceId)` ; `by_invoice`, `by_external_ref` |
| `invoiceSequences` | `by_sequence(sequence)` |
| `commissionRecords` | `by_request`, `by_contract`, `by_invoice`, `by_professional`, `by_status(paymentStatus)` |
| `contractSignatures` | `by_contract`, `by_client`, `by_professional` |
| `contractAmendments` | `by_contract`, `by_version` |
| `documents` | `by_client`, `by_professional`, `by_contract`, `by_invoice`, `by_number`, `by_status` |
| `documentVersions` / `documentAccessLogs` | `by_document(documentId)` ; `by_document`, `by_accessedAt` |
| `creditNotes` | `by_client`, `by_invoice`, `by_reference` |

### 11.3 Règles métier appliquées

- Montants en FCFA entiers ; commission figée à 15 % par transaction (§1, §19),
  modifiable uniquement par l'administration avec trace dans `auditLogs`.
- Numérotation unique : GTEC-CTR / GTEC-FAC / GTEC-AVR / GTEC-MIS-YYYY-NNNNNN (§24).
- Immuabilité : tout contrat signé ne se modifie plus — un avenant crée une
  version séparée (`contractAmendments`), les documents se versionnent
  (`documentVersions`), les accès s'enregistrent (`documentAccessLogs`).
- Idempotence financière : `externalRef` / `transactionRef` sur paiements et
  commissions ; avoirs tracés de l'émission au remboursement.
- Journalisation : `auditLogs` pour chaque opération sensible (changement de
  taux, signature, avenant appliqué, archivage).
