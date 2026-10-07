import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/** GTEC PRO admin application (backend console). */
export const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "etsgreentech@yahoo.com";

const ADMIN_NAME = "Administration GTEC PRO";

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

export const ensureDemoAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const LEGACY_ADMIN_EMAILS = ["admin@gtecpro.cm"];
    for (const legacy of LEGACY_ADMIN_EMAILS) {
      const old = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), legacy))
        .unique();
      if (old && old.role === "admin") {
        await ctx.db.patch(old._id, { role: "user" });
      }
    }
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), ADMIN_EMAIL))
      .unique();
    if (existing) {
      if (existing.role !== "admin") {
        await ctx.db.patch(existing._id, { role: "admin" });
      }
      return { created: false };
    }
    await ctx.db.insert("users", {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      emailVerificationTime: Date.now(),
      role: "admin",
      accountType: "client",
    });
    return { created: true };
  },
});

export const getAdminEmail = query({
  args: {},
  handler: async () => ({ email: ADMIN_EMAIL }),
});

export const adminIsAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    return user?.role === "admin";
  },
});

export const adminUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        city: u.city,
        role: u.role ?? "user",
        accountType: u.accountType,
        createdAt: u._creationTime,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminStatsLite = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [requests, payments, contracts, users, payouts] = await Promise.all([
      ctx.db.query("serviceRequests").collect(),
      ctx.db.query("payments").collect(),
      ctx.db.query("maintenanceContracts").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("payouts").collect(),
    ]);
    return {
      missions: requests.length,
      openMissions: requests.filter(
        (r) => !["terminee", "annulee"].includes(r.status),
      ).length,
      revenue: payments
        .filter((p) => p.status === "valide")
        .reduce((s, p) => s + p.amount, 0),
      activeContracts: contracts.filter((c) => c.status === "actif").length,
      users: users.length,
      pendingPayouts: payouts
        .filter((p) => p.status === "dû")
        .reduce((s, p) => s + p.amount, 0),
    };
  },
});

export const adminListContractsLite = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const contracts = await ctx.db.query("maintenanceContracts").collect();
    const now = Date.now();
    const expired = contracts.filter(
      (c) => c.status === "actif" && c.endDate < now,
    );
    for (const c of expired) {
      c.status = "expire";
    }
    const out = [];
    for (const c of contracts.sort((a, b) => b.startDate - a.startDate)) {
      const client = await ctx.db.get(c.clientId);
      const visits = await ctx.db
        .query("contractVisits")
        .withIndex("by_contract", (q) => q.eq("contractId", c._id))
        .collect();
      out.push({
        contract: c,
        clientName: client?.name ?? "Client supprimé",
        visitsCount: visits.length,
        doneVisits: visits.filter((v) => v.status === "faite").length,
      });
    }
    return out;
  },
});

export const adminListRequestsLite = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("serviceRequests").collect();
    const out = [];
    for (const r of all.sort((a, b) => b._creationTime - a._creationTime)) {
      const client = await ctx.db.get(r.clientId);
      out.push({
        request: r,
        clientName: client?.name ?? "Client supprimé",
      });
    }
    return out;
  },
});
