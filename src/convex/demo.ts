import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { payoutFor } from "../lib/gtec";

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
    const clientIds: any[] = [];
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

/**
 * Missions V1 de démonstration : cycle complet
 * demande -> devis -> paiement -> affectation -> intervention -> rapport -> PV -> facture -> avis -> rémunérations.
 * Idempotent — ne crée rien si des demandes existent déjà.
 */
export const adminSeedDemoMissions = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const existing = await ctx.db.query("serviceRequests").collect();
    if (existing.length > 0) {
      return { created: 0, message: "Des demandes existent déjà." };
    }

    const DAY = 24 * 3600 * 1000;
    const now = Date.now();
    const VAT = 19.25;
    const results = {
      requests: 0,
      quotes: 0,
      payments: 0,
      assignments: 0,
      reports: 0,
      invoices: 0,
      reviews: 0,
      payouts: 0,
    };

    // ---- Clients ----
    const clients = [
      {
        name: "Clarisse Ebolo",
        phone: "691 22 33 44",
        city: "Douala",
        address: "Akwa, rue de la Joie",
      },
      {
        name: "Guy-Roger Kamdem",
        phone: "699 88 77 66",
        city: "Douala",
        address: "Bonamoussadi, carrefour Vita",
      },
      {
        name: "Estelle Ngo Bassa",
        phone: "678 55 44 33",
        city: "Yaoundé",
        address: "Nlongkak, immeuble Antharès",
      },
      {
        name: "Boulangerie Le Fournil d'Or",
        phone: "655 44 33 22",
        city: "Douala",
        address: "Deido, rue Castelnau",
      },
    ];
    const clientIds: any[] = [];
    for (const c of clients) {
      clientIds.push(
        await ctx.db.insert("users", {
          name: c.name,
          phone: c.phone,
          city: c.city,
          address: c.address,
          role: "user",
          accountType: "client",
        }),
      );
    }

    // ---- Techniciens (mêmes que le seed historique, sinon créés) ----
    const techSeed: [string, string][] = [
      ["Jean-Baptiste Nkotto", "Électricité CFO/CATE · Douala"],
      ["Aline Mbarga", "Électricité bâtiment · Douala"],
      ["Serge Etoundi", "Solaire / onduleurs · Douala"],
      ["Marlyse Tchoumi", "Climatisation & froid · Douala"],
      ["Idrissou Bello", "Vidéosurveillance CCTV · Douala"],
      ["Patrick Nguini", "Plomberie sanitaire · Douala"],
    ];
    const techIds: Record<string, any> = {};
    const existingTechs = await ctx.db
      .query("users")
      .collect();
    for (const [name] of techSeed) {
      const found = existingTechs.find((t: any) => t.name === name);
      techIds[name] =
        found?._id ??
        (await ctx.db.insert("users", {
          name,
          role: "member",
          city: techSeed.find(([n]) => n === name)?.[1],
        }));
    }

    const mkEvent = async (
      requestId: any,
      kind: string,
      label: string,
      detail: string,
      at: number,
    ) => {
      await ctx.db.insert("requestEvents", { requestId, kind, label, detail, at });
    };

    const mkMission = async (opts: {
      clientIdx: number;
      serviceKey: string;
      title: string;
      description: string;
      city: string;
      address: string;
      items: [string, number, number][];
      leader: string;
      members: string[];
      daysAgo: number; // création de la demande
      review?: { rating: number; comment: string };
    }) => {
      const client = clients[opts.clientIdx];
      const createdAt = now - opts.daysAgo * DAY;
      const requestId = await ctx.db.insert("serviceRequests", {
        clientId: clientIds[opts.clientIdx],
        reference: `GTC-${String(results.requests + 1).padStart(4, "0")}`,
        serviceKey: opts.serviceKey,
        title: opts.title,
        description: opts.description,
        address: opts.address,
        city: opts.city,
        photos: [],
        status: "terminee",
      });
      results.requests++;

      const subtotal = opts.items.reduce((s, [, q, p]) => s + q * p, 0);
      const total = Math.round(subtotal * (1 + VAT / 100));
      const quoteId = await ctx.db.insert("quotes", {
        requestId,
        clientId: clientIds[opts.clientIdx],
        number: `DEV-${String(results.quotes + 1).padStart(4, "0")}`,
        items: opts.items.map(([label, qty, unitPrice]) => ({ label, qty, unitPrice })),
        subtotal,
        vatRate: VAT,
        total,
        currency: "FCFA",
        status: "accepte",
        validUntil: createdAt + 30 * DAY,
      });
      results.quotes++;

      const method = opts.clientIdx % 2 === 0 ? "orange_money" : "mtn_momo";
      await ctx.db.insert("payments", {
        quoteId,
        requestId,
        clientId: clientIds[opts.clientIdx],
        amount: total,
        currency: "FCFA",
        method,
        payerPhone: client.phone,
        status: "valide",
        externalRef: `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        paidAt: createdAt + 2 * DAY,
      });
      results.payments++;

      const assignmentId = await ctx.db.insert("assignments", {
        requestId,
        teamLeaderId: techIds[opts.leader],
        members: [opts.leader, ...opts.members].map((name, i) => ({
          id: techIds[name],
          role: i === 0 ? "Chef d'équipe" : "Technicien",
        })),
        scheduledAt: createdAt + 4 * DAY,
        notes: "Mission de démonstration",
        status: "terminee",
      });
      results.assignments++;

      await ctx.db.insert("interventionReports", {
        requestId,
        assignmentId,
        workDone: `Travaux réalisés pour « ${opts.title} » : diagnostic, intervention conforme aux normes GTEC, tests de fonctionnement et nettoyage du chantier.`,
        partsUsed: [{ label: "Petit matériel (visserie, connecteurs)", qty: 1 }],
        beforePhotos: [],
        afterPhotos: [],
        warrantyMonths: 6,
        recommendations:
          "Recommandation GTEC : contrôle préventif dans 6 mois pour maintenir la garantie.",
        status: "receptionne",
        receptionNote: "Travaux conformes, client satisfait.",
        clientSignature: undefined,
        receivedAt: createdAt + 5 * DAY,
      });
      results.reports++;

      await ctx.db.insert("invoices", {
        requestId,
        clientId: clientIds[opts.clientIdx],
        number: `FAC-${String(results.invoices + 1).padStart(4, "0")}`,
        amount: total,
        currency: "FCFA",
        status: "payee",
        issuedAt: createdAt + 5 * DAY,
      });
      results.invoices++;

      await mkEvent(requestId, "demande", "Demande créée", `${opts.serviceKey} · ${opts.city}`, createdAt);
      await mkEvent(requestId, "devis", "Devis émis", `DEV · ${total} FCFA TTC`, createdAt + DAY);
      await mkEvent(requestId, "paiement", "Paiement validé", method, createdAt + 2 * DAY);
      await mkEvent(requestId, "affectation", "Équipe affectée", opts.leader, createdAt + 3 * DAY);
      await mkEvent(requestId, "intervention", "Intervention réalisée", "Chantier mené à bien", createdAt + 4 * DAY);
      await mkEvent(requestId, "reception", "PV signé par le client", "Réception sans réserve", createdAt + 5 * DAY);
      await mkEvent(requestId, "facture", "Facture émise", `FAC · ${total} FCFA`, createdAt + 5 * DAY);

      // Rémunérations : 60 % du TTC répartis au poids (chef 1,5 · tech 1).
      const crew = [opts.leader, ...opts.members];
      for (let i = 0; i < crew.length; i++) {
        const role = i === 0 ? "Chef d'équipe" : "Technicien";
        const { amount, sharePercent } = payoutFor(total, role, crew.length);
        await ctx.db.insert("payouts", {
          techUserId: techIds[crew[i]],
          requestId,
          amount,
          sharePercent,
          role,
          status: "dû",
        });
        results.payouts++;
      }

      if (opts.review) {
        await ctx.db.insert("reviews", {
          requestId,
          clientId: clientIds[opts.clientIdx],
          techUserId: techIds[opts.leader],
          rating: opts.review.rating,
          comment: opts.review.comment,
          at: createdAt + 6 * DAY,
        });
        results.reviews++;
      }
    };

    // ---- 4 missions terminées (réaliste pour l'analytics) ----
    await mkMission({
      clientIdx: 0,
      serviceKey: "electricite",
      title: "Installation tableau électrique neuf",
      description:
        "Tableau vétuste, disjoncteurs qui sautent. Installation complète d'un tableau aux normes CFO/CATE.",
      city: "Douala",
      address: "Akwa, rue de la Joie",
      items: [
        ["Tableau électrique 3 rangées", 1, 95000],
        ["Disjoncteurs différentiels + calibrés", 8, 8500],
        ["Main d'œuvre électricien (jour)", 2, 25000],
      ],
      leader: "Jean-Baptiste Nkotto",
      members: ["Aline Mbarga"],
      daysAgo: 150,
      review: {
        rating: 5,
        comment:
          "Équipe ponctuelle et très propre. Le tableau fonctionne parfaitement, je recommande !",
      },
    });

    await mkMission({
      clientIdx: 1,
      serviceKey: "solaire",
      title: "Kit solaire 3 kVa avec onduleur",
      description:
        "Coupures fréquentes. Installation d'un kit solaire 3 kVa avec batteries et onduleur hybride.",
      city: "Douala",
      address: "Bonamoussadi, carrefour Vita",
      items: [
        ["Kit solaire 3 kVa hybride", 1, 850000],
        ["Batterie gel 200Ah", 2, 310000],
        ["Main d'œuvre installation", 1, 90000],
      ],
      leader: "Serge Etoundi",
      members: ["Aline Mbarga"],
      daysAgo: 110,
      review: {
        rating: 4,
        comment:
          "Installation sérieuse. Un délai de 2 jours de plus que prévu mais résultat impeccable.",
      },
    });
    // 2e paiement démo (MoMo) pour varier les moyens.

    await mkMission({
      clientIdx: 2,
      serviceKey: "climatisation",
      title: "Installation split 24 000 BTU",
      description:
        "Salon 45 m² exposé plein ouest. Fourniture et pose d'un split 24 000 BTU inverter.",
      city: "Yaoundé",
      address: "Nlongkak, immeuble Antharès",
      items: [
        ["Split inverter 24 000 BTU", 1, 245000],
        ["Pompe à condensats", 1, 32000],
        ["Main d'œuvre frigoriste", 1, 45000],
      ],
      leader: "Marlyse Tchoumi",
      members: ["Patrick Nguini"],
      daysAgo: 75,
      review: {
        rating: 5,
        comment: "Frais et silencieux. Explication complète de l'entretien à la remise.",
      },
    });

    await mkMission({
      clientIdx: 3,
      serviceKey: "plomberie",
      title: "Réfection réseau d'eau cuisine",
      description:
        "Fuites répétées sous l'évier de la boulangerie. Remplacement complet du réseau PER.",
      city: "Douala",
      address: "Deido, rue Castelnau",
      items: [
        ["Tube PER + raccords", 1, 78000],
        ["Main d'œuvre plombier (2 jours)", 2, 30000],
      ],
      leader: "Patrick Nguini",
      members: [],
      daysAgo: 30,
    });

    return results;
  },
});
