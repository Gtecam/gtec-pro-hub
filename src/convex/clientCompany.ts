import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, notify, notifyAdmins } from "./gtec";

/**
 * GTEC PRO — Client entreprise (§14 du référentiel « MON PROFIL ») :
 * déclinaison client du système entreprise/équipe. Un compte client peut
 * créer une fiche entreprise, déclarer ses sites/agences et rattacher
 * d'autres comptes GTEC PRO avec un rôle métier — à condition que chaque
 * personne INVITÉE accepte son rattachement (l'entreprise ne modifie jamais
 * les données personnelles d'un membre, §11/§14).
 *
 * Rôles : ADMIN (gère tout), TECH (responsable technique), MAINT (responsable
 * maintenance), FIN (responsable financier), REQUESTER (demandeur
 * d'intervention). Le propriétaire (ownerUserId) est administrateur de fait.
 *
 * RCCM/NIU suivent le même cycle que le prestataire : DRAFT → SUBMITTED →
 * UNDER_REVIEW → VERIFIED/REJECTED, seule l'administration GTEC écrit
 * VERIFIED (§16 : jamais d'auto-certification). Toutes les écritures sont
 * journalisées dans `profileChanges` (§15) — audit non supprimable.
 */

const CLIENT_ROLES = ["ADMIN", "TECH", "MAINT", "FIN", "REQUESTER"] as const;
type ClientRole = (typeof CLIENT_ROLES)[number];

const vRole = v.union(...CLIENT_ROLES.map((r) => v.literal(r)));

const ROLE_LABELS: Record<ClientRole, string> = {
  ADMIN: "Administrateur",
  TECH: "Responsable technique",
  MAINT: "Responsable maintenance",
  FIN: "Responsable financier",
  REQUESTER: "Demandeur d'intervention",
};

/** Journal des modifications (même table que profile.ts, §15). */
async function logChange(
  ctx: { db: any },
  userId: Id<"users">,
  kind: string,
  label: string,
  oldValue?: string,
  newValue?: string,
) {
  await ctx.db.insert("profileChanges", {
    userId,
    kind,
    label,
    oldValue: oldValue || undefined,
    newValue: newValue || undefined,
    at: Date.now(),
  });
}

/** Le propriétaire est ADMIN de fait ; un membre ADMIN actif peut aussi gérer. */
async function canManage(
  ctx: any,
  company: { _id: Id<"clientCompanies">; ownerUserId: Id<"users"> },
  userId: Id<"users">,
): Promise<boolean> {
  if (company.ownerUserId === userId) return true;
  const rows = (await ctx.db
    .query("clientTeamMembers")
    .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
    .collect()) as any[];
  return rows.some(
    (m) => m.userId === userId && m.isActive && m.status === "ACTIVE" && m.role === "ADMIN",
  );
}

// ========================= FICHE ENTREPRISE (§14) ===========================

export const myClientCompany = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const owned = (await ctx.db
      .query("clientCompanies")
      .withIndex("by_owner", (q: any) => q.eq("ownerUserId", user._id))
      .collect()) as any[];
    const company = owned.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

    const sites = [] as any[];
    const team = [] as any[];
    let myRole: string | null = company && company.ownerUserId === user._id ? "OWNER" : null;

    if (company) {
      const siteRows = (await ctx.db
        .query("clientSites")
        .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
        .collect()) as any[];
      for (const s of siteRows.filter((s) => s.isActive)) {
        sites.push(s);
      }
      sites.sort((a, b) => b.createdAt - a.createdAt);

      const memberRows = (await ctx.db
        .query("clientTeamMembers")
        .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
        .collect()) as any[];
      for (const m of memberRows.filter((m) => m.isActive)) {
        const u = (await ctx.db.get(m.userId as never)) as { name?: string; phone?: string } | null;
        if (m.userId === user._id && m.status === "ACTIVE" && !myRole) myRole = m.role;
        team.push({
          _id: m._id,
          userId: m.userId,
          role: m.role,
          status: m.status,
          invitedAt: m.invitedAt,
          isOwner: m.userId === company.ownerUserId,
          userName: u?.name ?? null,
          userPhone: u?.phone ?? null,
        });
      }
      team.sort((a, b) => a.invitedAt - b.invitedAt);
    }

    // Invitations reçues (auxquelles je suis invité) — visibles même sans fiche.
    const myInvites = (await ctx.db
      .query("clientTeamMembers")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect()) as any[];
    const invitations = [] as any[];
    for (const m of myInvites.filter((x) => x.isActive && x.status === "INVITED")) {
      const c = (await ctx.db.get(m.companyId as never)) as { name: string } | null;
      invitations.push({
        _id: m._id,
        companyId: m.companyId,
        companyName: c?.name ?? "",
        role: m.role,
        invitedAt: m.invitedAt,
      });
    }

    return {
      company,
      sites,
      team,
      invitations,
      myRole,
      canManage: !!company && (await canManage(ctx, company, user._id)),
    };
  },
});

export const upsertClientCompany = mutation({
  args: {
    id: v.optional(v.id("clientCompanies")),
    name: v.string(),
    tradeName: v.optional(v.string()),
    rccm: v.optional(v.string()),
    niu: v.optional(v.string()),
    sector: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2) throw new Error("Indiquez la raison sociale.");
    const now = Date.now();
    const payload = {
      ownerUserId: user._id,
      name,
      tradeName: args.tradeName?.trim() || undefined,
      rccm: args.rccm?.trim() || undefined,
      niu: args.niu?.trim() || undefined,
      sector: args.sector?.trim() || undefined,
      logoUrl: args.logoUrl?.trim() || undefined,
      address: args.address?.trim() || undefined,
      region: args.region?.trim() || undefined,
      city: args.city?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      email: args.email?.trim() || undefined,
      updatedAt: now,
    };
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as Doc<"clientCompanies"> | null;
      if (!row || row.ownerUserId !== user._id) throw new Error("Entreprise introuvable.");
      const wasVerified = row.status === "VERIFIED";
      await ctx.db.patch(args.id, {
        ...payload,
        // Un élément vérifié modifié repasse en vérification (§16).
        status: wasVerified ? "SUBMITTED" : row.status,
        verifiedAt: wasVerified ? undefined : row.verifiedAt,
        verifiedBy: wasVerified ? undefined : row.verifiedBy,
      });
      await logChange(ctx, user._id, "clientCompany.update", `Modification du client entreprise « ${name} »`, row.name, name);
      return;
    }
    await ctx.db.insert("clientCompanies", {
      ...payload,
      status: "DRAFT",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await logChange(ctx, user._id, "clientCompany.add", `Création du profil client entreprise « ${name} »`, undefined, name);
  },
});

/** Soumission à la vérification GTEC PRO (RCCM/NIU : §16). */
export const submitClientCompanyForVerification = mutation({
  args: { id: v.id("clientCompanies") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as Doc<"clientCompanies"> | null;
    if (!row || row.ownerUserId !== user._id) throw new Error("Entreprise introuvable.");
    await ctx.db.patch(args.id, { status: "SUBMITTED", updatedAt: Date.now() });
    await logChange(ctx, user._id, "clientCompany.submitted", `Client entreprise « ${row.name} » soumis à vérification`);
    await notifyAdmins(ctx, "general", "Nouveau client entreprise à vérifier", `${user.name ?? "Un adhérent"} a soumis « ${row.name} ».`);
  },
});

// ========================= SITES / AGENCES (§14) ============================

export const upsertClientSite = mutation({
  args: {
    id: v.optional(v.id("clientSites")),
    companyId: v.id("clientCompanies"),
    label: v.string(),
    city: v.string(),
    quarter: v.optional(v.string()),
    address: v.string(),
    region: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const company = (await ctx.db.get(args.companyId)) as Doc<"clientCompanies"> | null;
    if (!company || !company.isActive) throw new Error("Entreprise introuvable.");
    if (!(await canManage(ctx, company, user._id))) throw new Error("Seuls le propriétaire ou un administrateur peuvent gérer les sites.");
    const label = args.label.trim();
    const address = args.address.trim();
    const city = args.city.trim();
    if (label.length < 2 || address.length < 4 || city.length < 2) {
      throw new Error("Libellé, ville et adresse sont obligatoires.");
    }
    const now = Date.now();
    const fields = {
      label,
      city,
      quarter: args.quarter?.trim() || undefined,
      address,
      region: args.region?.trim() || undefined,
      updatedAt: now,
    };
    if (args.id) {
      const row = (await ctx.db.get(args.id)) as Doc<"clientSites"> | null;
      if (!row || row.companyId !== args.companyId) throw new Error("Site introuvable.");
      await ctx.db.patch(args.id, fields);
      await logChange(ctx, user._id, "clientSite.update", `Site modifié : ${label}`, row.label, label);
    } else {
      await ctx.db.insert("clientSites", {
        companyId: args.companyId,
        ...fields,
        isDefault: args.isDefault ?? false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await logChange(ctx, user._id, "clientSite.add", `Site ajouté : ${label} (${city})`, undefined, label);
    }
    if (args.isDefault) await setOnlyDefault(ctx, args.companyId, args.id ?? null, label);
  },
});

/** Un seul site par défaut : désactive le défaut des autres. */
async function setOnlyDefault(
  ctx: any,
  companyId: Id<"clientCompanies">,
  keepId: Id<"clientSites"> | null,
  keepLabel: string,
) {
  const rows = (await ctx.db
    .query("clientSites")
    .withIndex("by_company", (q: any) => q.eq("companyId", companyId))
    .collect()) as any[];
  for (const s of rows) {
    if (s.isActive && s.isDefault && s._id !== keepId) {
      await ctx.db.patch(s._id, { isDefault: false, updatedAt: Date.now() });
    }
    if (keepId && s._id === keepId) {
      await ctx.db.patch(s._id, { isDefault: true, updatedAt: Date.now() });
    }
  }
  if (keepId) void keepLabel;
}

export const setDefaultClientSite = mutation({
  args: { id: v.id("clientSites") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as Doc<"clientSites"> | null;
    if (!row || !row.isActive) throw new Error("Site introuvable.");
    const company = (await ctx.db.get(row.companyId)) as Doc<"clientCompanies"> | null;
    if (!company) throw new Error("Entreprise introuvable.");
    if (!(await canManage(ctx, company, user._id))) throw new Error("Action non autorisée.");
    await setOnlyDefault(ctx, row.companyId, args.id, row.label);
    await logChange(ctx, user._id, "clientSite.default", `Site par défaut : ${row.label}`);
  },
});

/** Archivage (jamais de suppression, §26). */
export const removeClientSite = mutation({
  args: { id: v.id("clientSites") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = (await ctx.db.get(args.id)) as Doc<"clientSites"> | null;
    if (!row || !row.isActive) throw new Error("Site introuvable.");
    const company = (await ctx.db.get(row.companyId)) as Doc<"clientCompanies"> | null;
    if (!company) throw new Error("Entreprise introuvable.");
    if (!(await canManage(ctx, company, user._id))) throw new Error("Action non autorisée.");
    await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });
    await logChange(ctx, user._id, "clientSite.remove", `Site retiré : ${row.label}`, row.label);
  },
});

// ==================== ÉQUIPE MULTI-UTILISATEURS (§14) =======================

export const inviteClientTeamMember = mutation({
  args: { companyId: v.id("clientCompanies"), phone: v.string(), role: vRole },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const company = (await ctx.db.get(args.companyId)) as Doc<"clientCompanies"> | null;
    if (!company || !company.isActive) throw new Error("Entreprise introuvable.");
    if (!(await canManage(ctx, company, user._id))) throw new Error("Seuls le propriétaire ou un administrateur peuvent inviter.");
    const phone = args.phone.replace(/\s+/g, "");
    if (phone.length < 9) throw new Error("Numéro de téléphone invalide.");
    const target = (await ctx.db
      .query("users")
      .withIndex("phone", (q: any) => q.eq("phone", phone))
      .first()) as { _id: Id<"users">; name?: string } | null;
    if (!target) throw new Error("Aucun compte GTEC PRO avec ce numéro. La personne doit d'abord créer son compte.");
    if (target._id === user._id) throw new Error("Vous faites déjà partie de cette entreprise.");
    const existing = (await ctx.db
      .query("clientTeamMembers")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect()) as any[];
    const dup = existing.find((m) => m.userId === target._id && m.isActive && m.status !== "DECLINED");
    if (dup) throw new Error(dup.status === "INVITED" ? "Une invitation est déjà en attente pour ce numéro." : "Cette personne fait déjà partie de l'équipe.");
    await ctx.db.insert("clientTeamMembers", {
      companyId: args.companyId,
      userId: target._id,
      role: args.role,
      status: "INVITED",
      invitedBy: user._id,
      invitedAt: Date.now(),
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logChange(
      ctx,
      user._id,
      "clientTeam.invite",
      `Invitation envoyée à ${target.name ?? phone} (${ROLE_LABELS[args.role]}) pour « ${company.name} »`,
    );
    await notify(
      ctx,
      target._id,
      "general",
      "Invitation à rejoindre un compte entreprise",
      `${company.name} vous invite comme « ${ROLE_LABELS[args.role]} ». Répondez depuis MON PROFIL.`,
    );
  },
});

export const respondToClientTeamInvite = mutation({
  args: { inviteId: v.id("clientTeamMembers"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const invite = (await ctx.db.get(args.inviteId)) as Doc<"clientTeamMembers"> | null;
    if (!invite || invite.userId !== user._id) throw new Error("Invitation introuvable.");
    if (invite.status !== "INVITED") throw new Error("Cette invitation a déjà été traitée.");
    const company = (await ctx.db.get(invite.companyId)) as Doc<"clientCompanies"> | null;
    await ctx.db.patch(args.inviteId, {
      status: args.accept ? "ACTIVE" : "DECLINED",
      respondedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logChange(
      ctx,
      user._id,
      args.accept ? "clientTeam.accept" : "clientTeam.decline",
      args.accept
        ? `Rattachement accepté : ${company?.name ?? "entreprise"} (${ROLE_LABELS[invite.role as ClientRole] ?? invite.role})`
        : `Invitation refusée : ${company?.name ?? "entreprise"}`,
    );
    if (company) {
      await notify(
        ctx,
        company.ownerUserId,
        "general",
        args.accept ? "Invitation acceptée" : "Invitation refusée",
        args.accept
          ? `${user.name ?? "Un adhérent"} a rejoint « ${company.name} » comme ${ROLE_LABELS[invite.role as ClientRole] ?? invite.role}.`
          : `${user.name ?? "Un adhérent"} a décliné l'invitation.`,
      );
    }
  },
});

export const removeClientTeamMember = mutation({
  args: { memberId: v.id("clientTeamMembers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const member = (await ctx.db.get(args.memberId)) as Doc<"clientTeamMembers"> | null;
    if (!member || !member.isActive) throw new Error("Membre introuvable.");
    const company = (await ctx.db.get(member.companyId)) as Doc<"clientCompanies"> | null;
    if (!company) throw new Error("Entreprise introuvable.");
    // Le propriétaire/ADMIN retire un membre ; chacun peut aussi se retirer lui-même.
    const self = member.userId === user._id;
    if (!self && !(await canManage(ctx, company, user._id))) {
      throw new Error("Action non autorisée.");
    }
    const u = (await ctx.db.get(member.userId)) as { name?: string } | null;
    await ctx.db.patch(args.memberId, { isActive: false, updatedAt: Date.now() });
    await logChange(
      ctx,
      user._id,
      "clientTeam.remove",
      self
        ? `Départ de l'équipe « ${company.name} » (${ROLE_LABELS[member.role as ClientRole] ?? member.role})`
        : `Retrait de ${u?.name ?? "un membre"} de « ${company.name} »`,
    );
    if (!self) {
      await notify(
        ctx,
        member.userId,
        "general",
        "Rattachement retiré",
        `${company.name} a retiré votre rattachement. Vos données personnelles restent inchangées.`,
      );
    }
  },
});

export const setClientMemberRole = mutation({
  args: { memberId: v.id("clientTeamMembers"), role: vRole },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const member = (await ctx.db.get(args.memberId)) as Doc<"clientTeamMembers"> | null;
    if (!member || !member.isActive) throw new Error("Membre introuvable.");
    const company = (await ctx.db.get(member.companyId)) as Doc<"clientCompanies"> | null;
    if (!company) throw new Error("Entreprise introuvable.");
    if (!(await canManage(ctx, company, user._id))) throw new Error("Action non autorisée.");
    if (member.userId === company.ownerUserId) throw new Error("Le propriétaire garde le rôle d'administrateur.");
    const oldLabel = ROLE_LABELS[member.role as ClientRole] ?? member.role;
    const newLabel = ROLE_LABELS[args.role];
    await ctx.db.patch(args.memberId, { role: args.role, updatedAt: Date.now() });
    await logChange(ctx, user._id, "clientTeam.role", `Rôle de ${oldLabel} → ${newLabel}`, oldLabel, newLabel);
    await notify(ctx, member.userId, "general", "Rôle mis à jour", `Votre rôle chez « ${company.name} » est désormais : ${newLabel}.`);
  },
});

// ================= ADMIN : VÉRIFICATION CLIENTS ENTREPRISE (§25) ============

export const adminListClientCompanies = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") throw new Error("Action réservée à l'administration.");
    const rows = (await ctx.db.query("clientCompanies").collect()) as any[];
    const sorted = rows.sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      sorted.map(async (c) => {
        const owner = (await ctx.db.get(c.ownerUserId as never)) as { name?: string; phone?: string } | null;
        return {
          kind: "clientCompany" as const,
          id: c._id as string,
          row: c,
          user: owner ? { name: owner.name ?? null, phone: owner.phone ?? null } : null,
        };
      }),
    );
  },
});

export const adminReviewClientCompany = mutation({
  args: {
    id: v.id("clientCompanies"),
    decision: v.union(v.literal("VERIFIED"), v.literal("REJECTED"), v.literal("UNDER_REVIEW")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") throw new Error("Action réservée à l'administration.");
    const row = (await ctx.db.get(args.id)) as Doc<"clientCompanies"> | null;
    if (!row) throw new Error("Entreprise introuvable.");
    await ctx.db.patch(args.id, {
      status: args.decision,
      reviewNote: args.note?.trim() || undefined,
      verifiedAt: args.decision === "VERIFIED" ? Date.now() : undefined,
      verifiedBy: args.decision === "VERIFIED" ? admin._id : undefined,
      updatedAt: Date.now(),
    });
    await logChange(
      ctx,
      row.ownerUserId,
      `clientCompany.${args.decision.toLowerCase()}`,
      args.decision === "VERIFIED"
        ? `Client entreprise « ${row.name} » vérifié par GTEC PRO ✓`
        : args.decision === "REJECTED"
          ? `Client entreprise « ${row.name} » refusé`
          : `Client entreprise « ${row.name} » en cours d'examen`,
    );
    await notify(
      ctx,
      row.ownerUserId,
      "general",
      args.decision === "VERIFIED" ? "Entreprise vérifiée ✓" : args.decision === "REJECTED" ? "Entreprise refusée" : "Vérification en cours",
      args.decision === "VERIFIED"
        ? `Le profil de « ${row.name} » est vérifié par GTEC PRO.`
        : args.decision === "REJECTED"
          ? `Le profil de « ${row.name} » a été refusé.${args.note ? ` Motif : ${args.note}` : ""}`
          : `La vérification de « ${row.name} » est en cours d'examen.`,
    );
  },
});
