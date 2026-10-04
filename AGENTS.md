# AGENTS.md — GTEC PRO (étendre, ne pas réinventer)

## Missions
1. Étendre GTEC PRO V1 vers un écosystème complet de services techniques au Cameroun.
2. Réutiliser les composants, API, tables et services déjà disponibles.
3. Ne pas créer de doublons inutiles.

## Stack
- Web : Vite + React 19 + TypeScript + Tailwind + shadcn/ui + Framer Motion
- Backend : Convex (base de données + fonctions typées + subscriptions temps réel)
- Auth : Convex Auth (OTP e-mail / OTP SMS)
- Paiements : MoMo / CinetPay (webhooks dans http.ts)
- Documents : Convex Storage
- Émail/SMS : files d'attente + notifications in-app

## Règles
- Réutiliser l'existant : `gtec.ts`, `matching.ts`, `catalog.ts`, `diaspora.ts`, `buildings.ts`, `maintenance.ts`, `guarantees.ts`, `missions.ts`, `profile.ts`, `favorites.ts`, `clientCompany.ts`, `appointments.ts`.
- Chaque fonctionnalité = interface + API + logique métier + permissions + BDD + validations + journalisation + notification + tests.
- Ne jamais supprimer une fonctionnalité existante.
- Gérer les rôles : `admin`, `client`, `technicien`, `diaspora`, `company`.
- Ne jamais exposer les données sensibles (CNI, coordonnées exactes, documents bancaires) à un utilisateur non autorisé.
- Limiter le remote debugging et rester conforme au cahier des charges et aux données du Cameroun.

## Vérifications
- `bunx convex dev --once` (exit 0)
- `bun tsc -b --noEmit` (exit 0)
- `bun scripts/test-availability.ts` (26/26)
- Ne jamais exécuter `bun run build` sauf demande explicite.
