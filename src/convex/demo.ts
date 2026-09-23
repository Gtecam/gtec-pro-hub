import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

async function requireAdmin(ctx: any): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  if (user.role !== "admin") {
    throw new Error("Accès réservé à l'administration GTEC.");
  }
  return user;
}

/**
 * Données de démonstration V2 : contrats de maintenance + visites.
 * Idempotent — ne crée rien si un contrat existe déjà.
 */
export const adminSeedDemoContracts = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const existing = await ctx.db.query("maintenanceContracts").collect();
    if (existing.length > 0) {
      return { created: 0, message: "Des contrats existent déjà." };
    }

    const DAY = 24 * 3600 * 1000;
    const now = Date.now();
    const created: string[] = [];

    // ---- Clients de démonstration ----
    const demoClients: [string, string, string, string][] = [
      [
        "Résidence des Palmiers",
        "699 12 34 56",
        "Douala",
        "Bonapriso, rue Njo-Njo, immeuble A",
      ],
      [
        "Société CAMFARM Sarl",
        "677 45 67 89",
        "Douala",
        "Zone industrielle Bassa, lot 12",
      ],
      ["Hôtel La Grâce", "655 98 76 54", "Yaoundé", "Bastos, avenue Winston Churchill"],
    ];
    const clientIds = [];
    for (const [name, phone, city, address] of demoClients) {
      clientIds.push(
        await ctx.db.insert("users", {
          name,
          phone,
          city,
          address,
          role: "user",
          accountType: "client",
        }),
      );
    }

    // ---- Contrat 1 : climatisation trimestrielle — résidence (Douala) ----
    const c1 = await ctx.db.insert("maintenanceContracts", {
      reference: "CTR-0001",
      clientId: clientIds[0],
      serviceKey: "climatisation",
      title: "Entretien préventif climatisation — Résidence des Palmiers",
      description:
        "Nettoyage filtres, contrôle pressions, vérification drains et thermostats.",
      frequency: "trimestriel",
      monthlyAmount: 45000,
      city: "Douala",
      address: "Bonapriso, rue Njo-Njo, immeuble A",
      status: "actif",
      startDate: now - 120 * DAY,
      endDate: now + 245 * DAY,
    });
    created.push("CTR-0001");

    // Visites passées (faites) + prochaine planifiée dans 10 jours.
    await ctx.db.insert("contractVisits", {
      contractId: c1,
      scheduledAt: now - 110 * DAY,
      doneAt: now - 110 * DAY,
      status: "faite",
      report:
        "Nettoyage complet des 12 split-systems, drains dégorgés, 2 thermostats recalibrés.",
    });
    await ctx.db.insert("contractVisits", {
      contractId: c1,
      scheduledAt: now - 20 * DAY,
      doneAt: now - 19 * DAY,
      status: "faite",
      report:
        "Contrôle pressions R410a conforme, remplacement filtres salle technique.",
    });
    await ctx.db.insert("contractVisits", {
      contractId: c1,
      scheduledAt: now + 10 * DAY,
      status: "planifiee",
    });
    await ctx.db.patch(c1, { nextVisitAt: now + 10 * DAY });

    // ---- Contrat 2 : électricité mensuelle — entreprise (Douala) ----
    const c2 = await ctx.db.insert("maintenanceContracts", {
      reference: "CTR-0002",
      clientId: clientIds[1],
      serviceKey: "electricite",
      title: "Maintenance électrique mensuelle — CAMFARM",
      description:
        "Contrôle TGBT, serrage connexions, mesure de terre, test disjoncteurs.",
      frequency: "mensuel",
      monthlyAmount: 85000,
      city: "Douala",
      address: "Zone industrielle Bassa, lot 12",
      status: "actif",
      startDate: now - 70 * DAY,
      endDate: now + 295 * DAY,
    });
    created.push("CTR-0002");

    await ctx.db.insert("contractVisits", {
      contractId: c2,
      scheduledAt: now - 65 * DAY,
      doneAt: now - 65 * DAY,
      status: "faite",
      report:
        "Serrage peignes TGBT, 1 disjoncteur défectueux remplacé, mesure de terre 4,2 Ω.",
    });
    await ctx.db.insert("contractVisits", {
      contractId: c2,
      scheduledAt: now - 35 * DAY,
      doneAt: now - 34 * DAY,
      status: "faite",
      report: "Contrôle mensuel conforme, aucune anomalie relevée.",
    });
    await ctx.db.insert("contractVisits", {
      contractId: c2,
      scheduledAt: now - 5 * DAY,
      doneAt: now - 5 * DAY,
      status: "faite",
      report:
        "Éclairage de sécurité défectueux signalé, remplacement programmé à la visite suivante.",
    });
    await ctx.db.insert("contractVisits", {
      contractId: c2,
      scheduledAt: now + 25 * DAY,
      status: "planifiee",
    });
    await ctx.db.patch(c2, { nextVisitAt: now + 25 * DAY });

    // ---- Contrat 3 : solaire semestriel — hôtel (Yaoundé) ----
    const c3 = await ctx.db.insert("maintenanceContracts", {
      reference: "CTR-0003",
      clientId: clientIds[2],
      serviceKey: "solaire",
      title: "Entretien champs solaires — Hôtel La Grâce",
      description:
        "Nettoyage panneaux, contrôle onduleurs, mesure de production, serrage rails.",
      frequency: "semestriel",
      monthlyAmount: 120000,
      city: "Yaoundé",
      address: "Bastos, avenue Winston Churchill",
      status: "suspendu",
      startDate: now - 200 * DAY,
      endDate: now + 165 * DAY,
    });
    created.push("CTR-0003");

    await ctx.db.insert("contractVisits", {
      contractId: c3,
      scheduledAt: now - 190 * DAY,
      doneAt: now - 190 * DAY,
      status: "faite",
      report:
        "48 panneaux nettoyés, production mesurée conforme, 2 micro-onduleurs rebranchés.",
    });
    await ctx.db.insert("contractVisits", {
      contractId: c3,
      scheduledAt: now - 10 * DAY,
      status: "annulee",
    });

    // ---- Contract 4 : CCTV — expiré (pour visualiser le statut) ----
    const c4 = await ctx.db.insert("maintenanceContracts", {
      reference: "CTR-0004",
      clientId: clientIds[0],
      serviceKey: "cctv",
      title: "Vérification annuelle vidéosurveillance — Résidence des Palmiers",
      frequency: "annuel",
      monthlyAmount: 60000,
      city: "Douala",
      address: "Bonapriso, rue Njo-Njo, immeuble A",
      status: "expire",
      startDate: now - 400 * DAY,
      endDate: now - 35 * DAY,
    });
    created.push("CTR-0004");

    await ctx.db.insert("contractVisits", {
      contractId: c4,
      scheduledAt: now - 395 * DAY,
      doneAt: now - 395 * DAY,
      status: "faite",
      report: "8 caméras contrôlées, disque dur remplacé, firmware mis à jour.",
    });

    return {
      created: created.length,
      contracts: created,
      clients: demoClients.map(([name]) => name),
      visits: 12,
    };
  },
});
