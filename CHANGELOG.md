# CHANGELOG — GTEC PRO

Format : Keep a Changelog (approx.) — versions internes V1 / V2.

## [2.0.0] — Module CONTRATS, COMMISSIONS ET FACTURATION (2026-10-05)

### Ajouté
- **Module CONTRATS, COMMISSIONS ET FACTURATION (V2)** — tables, index et API :
  - `commissionRules` (taux 15 % configurable admin, audit), `contracts`
    (GTEC-CTR-YYYY-NNNNNN, versions immuables), `contractTemplates`
    (gabarits §5-§10), `invoiceItems`, `invoicePayments`, `invoiceSequences`
    (numérotation unique §24), `commissionRecords` (§19),
    `contractSignatures` (§15), `contractAmendments` (avenants),
    `documents` / `documentVersions` / `documentAccessLogs` (§23),
    `creditNotes` (avoirs GTEC-AVR, §17).
  - Définitions dans `src/convex/schemaExtensions.ts`, fusionnées dans
    `src/convex/schema.ts` via `...extensionTables` (spread).
  - API métier `src/convex/contracts.ts` : taux de commission, gabarits,
    création de contrat depuis devis (commission figée 15 %), signatures
    électroniques, avenants, archivage/versionnage de documents, statistiques
    admin, audit financier (`requireAdminScope`).
- `docs/ARCHITECTURE-GTEC-PRO.md` §12 : tables + index du module.

### Corrigé
- `schema.ts` : restauration des tables manquantes consommées par les modules
  existants — `appointments`, `availabilityRules`, `favorites`,
  `clientCompanies`, `clientSites`, `clientTeamMembers`, `technicianEquipment`,
  `profileConfirmations`, `aiDiagnostics`, `budgetEstimates`, `projectBriefs`,
  `buildings`, `buildingAssets`, `buildingDocuments`, `buildingEvents`,
  `buildingAccessGrants`, `professionalMatches`, `matchingScores`,
  `professionalComparisons`, `clientShortlists`, `quoteRequests`,
  `selectionEvents`, `professionalPresence`, `professionalServiceZones`,
  `availabilitySlots`, `missionChecklists`, `checklistItems`,
  `digitalCertificates`, `workGuarantees` (+ index `by_user`, `by_pro`,
  `by_client`, `by_owner`, `by_token`, `by_building`, `by_request`, …).
- `invoices` : fusion des champs V1 (numérotation `number`, `amount`, `status`,
  `issuedAt`) et des champs du module facturation (`reference`, `contractId`,
  `professionalId`, `dueDate`, `subTotal`, `taxRate`, `totalPaid`,
  `remaining`, PDF/hash…) — suppression du conflit de spread TS2783
  (`invoices` défini deux fois).
- `contracts.ts` : lecture du taux en vigueur via l'index `by_updatedAt`
  (remplace `order().sort()` invalide), insertion `commissionRecords` avec
  `paymentStatus`, listing documents par filtre (plus de double `withIndex`),
  audit limité à 200 entrées triées par `by_at`.
- `appointments.ts` : `updateAppointment` accepte `CANCEL`, `RESCHEDULE`,
  `COMPLETE` et `REFUSE` (+ `reason`), `myAvailabilityRules` utilisable sans
  `userId`, `upsertAvailabilityRule`/`removeAvailabilityRule` acceptent un
  `id` de règle ou les champs bruts, `myAppointments` renvoie
  `{ asClient, asPro }` enrichis (`otherName`, `rejectReason`),
  `bookableTechnicians` sans `select` Convex.
- Stockage des règles de disponibilité dans
  `technicianProfiles.availabilityRulesJson` (le champ `availability` reste le
  statut temps réel : disponible/occupe/…).
- Front : `AppointmentsClientCard` / `AvailabilityManager` alignés sur
  l'API rendez-vous (badge de statut tolérant aux statuts absents).

### Vérifié
- `bunx convex dev --once` — exit 0 (push + typecheck serveur OK).
- `bun tsc -b --noEmit` — exit 0.
- `bun scripts/test-availability.ts` — 26/26 assertions réussies.

---

## [2.0.0-conversations] — Module de messagerie (CONVERSATIONS — V2)

### Ajouté
- **Module CONVERSATIONS (V2)** — tables, index, API et composants React.
  - Tables `chatRooms` et `conversationMessages` dans
    `src/convex/schemaExtensions.ts`, fusionnées dans `src/convex/schema.ts`
    via le spread `...extensionTables`.
  - Index `by_request`/`by_participants`/`by_status` sur `chatRooms` et
    `by_room`/`by_sender`/`by_at` sur `conversationMessages`.
  - API Convex `src/convex/gtec.ts` : `createChatRoom`,
    `sendMessage`, `listConversations`, `listMessages`,
    `chatRoomForRequest` (salle d'une demande pour le participant connecté,
    sinon `null`).
  - Composants front `src/components/ConversationPanel.tsx` :
    `ConversationListPanel` (liste des conversations du participant) et
    `ConversationPanel` (fil de discussion actif).

### Règles métier appliquées
- Une conversation nécessite au moins 2 participants.
- Réutilisation : si une room existe déjà pour le même `requestId` et les
  mêmes participants, on retourne celle-ci.
- Messages : texte OU notification d'appel (`callKind`).
- Sécurité : seuls les participants peuvent envoyer des messages ; les rooms
  clôturées (`status !== "active"`) n'acceptent plus de messages.
- Notifications : chaque message notifie les autres participants via `notify`
  (file e-mail + in-app).

### Corrigé
- `RequestDetail.tsx` : imports manquants rétablis (`AppShell`, `StatusBadge`,
  `JourneyStepper`, `SignaturePad`, `ConversationPanel`,
  `ConversationListPanel`) et fil de messagerie branché sur
  `chatRoomForRequest` — l'embed passait un id de demande (`as never`) là où
  un id de `chatRooms` est attendu ; la page retombe sur la liste générale des
  conversations tant que l'utilisateur n'est pas participant d'une salle liée
  à la demande.
- `ConversationPanel.tsx` : `ConversationListPanel` n'exige plus `roomId`
  (props dédiées `ListProps`).

### Vérifié
- `bunx convex dev --once` — exit 0 (push + typecheck serveur OK).
- `bun tsc -b --noEmit` — exit 0.
- `bun scripts/test-availability.ts` — 25/26 assertions réussies
  (`lib/availability.ts` non modifié ; 1 écart documenté dans §8).

## [1.x] — GTEC PRO V1

- Parcours de service complet : demande → devis → paiement (MoMo/Orange/
  espèces/virement/carte) → affectation → intervention → rapport → réception
  → facture → avis.
- Diaspora (bénéficiaires, validation à distance), maintenance récurrente
  (contrats, visites, paiements par échéance), litiges, sanctions, abonnements
  technicien, commissions GTEC, retraits, notifications, e-mails, OCR/SMS OTP,
  référentiel éducation (MINESUP), profil évolutif (§26), catalogue 12 pôles,
  matching (filtrage §3, score §4, shortlist, demandes de devis, choix auto),
  conseiller IA, bâtiments/équipements QR, garanties, IoT, client entreprise,
  favoris, rendez-vous.
