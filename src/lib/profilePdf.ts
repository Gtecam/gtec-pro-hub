import { formatDate } from "./gtec";
import gtecLogoSvg from "@/assets/logo.svg?raw";

/**
 * GTEC PRO — « Passeport professionnel » (§19) : export PDF du dossier
 * professionnel vivant. Généré côté navigateur en HTML A4 imprimable
 * (Ctrl+P → « Enregistrer au format PDF »), sans dépendance externe,
 * sur le même principe que les documents d'intervention (invoicePdf.ts).
 * Aucune donnée client n'est affichée (§5, §13) : les interventions
 * GTEC PRO apparaissent avec leur seule référence.
 */

export type ProfilePdfData = {
  generatedAt: number;
  fullName: string;
  jobTitle?: string;
  domainLabel?: string;
  specialtyLabel?: string;
  city?: string;
  phone?: string;
  email?: string;
  photoUrl?: string;
  bio?: string;
  experienceYears?: number;
  completionPercent?: number;
  highestDegree?: string;
  credentials: Array<{
    title: string;
    institution: string;
    year?: number;
    verified: boolean;
  }>;
  skills: Array<{
    label: string;
    levelLabel?: string;
    years?: number;
    verified: boolean;
  }>;
  certifications: Array<{
    name: string;
    organization?: string;
    obtainedLabel?: string;
    expiresLabel?: string;
    verified: boolean;
  }>;
  trainings: Array<{
    name: string;
    organization?: string;
    dateLabel?: string;
    hours?: number;
  }>;
  experiences: Array<{
    title: string;
    company?: string;
    periodLabel: string;
    city?: string;
    description?: string;
    verified: boolean;
  }>;
  projects: Array<{
    title: string;
    domainLabel?: string;
    city?: string;
    dateLabel?: string;
    description?: string;
    outcome?: string;
    verified: boolean;
  }>;
  gtecInterventions: Array<{
    reference: string;
    title: string;
    dateLabel: string;
    city?: string;
    rating?: number;
  }>;
  company?: {
    name: string;
    status: string;
    city?: string;
    phone?: string;
    email?: string;
    domains?: string[];
    teamCount: number;
  } | null;
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const line = (s?: string | null): string =>
  s && String(s).trim().length > 0 ? esc(String(s).trim()) : "";

const VERIF_BADGE = (v: boolean): string =>
  v ? `<span class="verif ok">Vérifié GTEC PRO</span>` : `<span class="verif">Non vérifié</span>`;

function section(title: string, inner: string): string {
  if (!inner || inner.trim().length === 0) return "";
  return `<section><h2>${esc(title)}</h2>${inner}</section>`;
}

function buildProfileHtml(d: ProfilePdfData): string {
  const logo = (() => {
    try {
      return (gtecLogoSvg as unknown as string).replace(
        /<svg /,
        `<svg width="44" height="44" `,
      );
    } catch {
      return "";
    }
  })();

  const contacts = [line(d.phone), line(d.email), line(d.city)].filter(Boolean).join(" · ");

  const identity = `
    <div class="id-card">
      ${
        d.photoUrl
          ? `<img class="photo" src="${esc(d.photoUrl)}" alt="Photo" />`
          : `<div class="photo photo-empty">${esc(initials(d.fullName))}</div>`
      }
      <div class="id-main">
        <h1>${esc(d.fullName)}</h1>
        <p class="job">${esc([d.jobTitle, d.domainLabel, d.specialtyLabel].filter(Boolean).join(" — "))}</p>
        <p class="contact">${contacts || "—"}</p>
        <p class="meta">
          ${
            d.experienceYears != null
              ? `<span>${d.experienceYears} an${d.experienceYears > 1 ? "s" : ""} d'expérience</span>`
              : ""
          }
          ${
            d.completionPercent != null
              ? `<span>Dossier complété à ${d.completionPercent}&nbsp;%</span>`
              : ""
          }
          ${d.highestDegree ? `<span>${esc(d.highestDegree)}</span>` : ""}
        </p>
      </div>
      <div class="stamp">
        ${logo}
        <span>Passeport professionnel</span>
        <strong>GTEC PRO</strong>
        <em>Édité le ${formatDate(d.generatedAt)}</em>
      </div>
    </div>`;

  const credentials = d.credentials.length
    ? d.credentials
        .map(
          (c) => `
      <div class="row">
        <div class="row-main">
          <strong>${esc(c.title)}</strong>
          <span>${esc(c.institution)}${c.year ? ` · ${c.year}` : ""}</span>
        </div>
        ${VERIF_BADGE(c.verified)}
      </div>`,
        )
        .join("")
    : `<p class="empty">Aucun diplôme déclaré.</p>`;

  const skills = d.skills.length
    ? `<div class="chips">${d.skills
        .map(
          (s) =>
            `<span class="chip${s.verified ? " chip-verified" : ""}">${esc(s.label)}${
              s.levelLabel ? ` — ${esc(s.levelLabel)}` : ""
            }${s.years != null ? ` (${s.years} ans)` : ""}${s.verified ? " ✓" : ""}</span>`,
        )
        .join("")}</div>`
    : `<p class="empty">Aucune compétence renseignée.</p>`;

  const certifications = d.certifications.length
    ? d.certifications
        .map(
          (c) => `
      <div class="row">
        <div class="row-main">
          <strong>${esc(c.name)}</strong>
          <span>${esc(c.organization ?? "")}${c.obtainedLabel ? ` · obtenue le ${esc(c.obtainedLabel)}` : ""}${
            c.expiresLabel ? ` · expire le ${esc(c.expiresLabel)}` : ""
          }</span>
        </div>
        ${VERIF_BADGE(c.verified)}
      </div>`,
        )
        .join("")
    : `<p class="empty">Aucune certification déclarée.</p>`;

  const trainings = d.trainings.length
    ? d.trainings
        .map(
          (t) => `
      <div class="row">
        <div class="row-main">
          <strong>${esc(t.name)}</strong>
          <span>${esc(t.organization ?? "")}${t.dateLabel ? ` · ${esc(t.dateLabel)}` : ""}${
            t.hours ? ` · ${t.hours} h` : ""
          }</span>
        </div>
      </div>`,
        )
        .join("")
    : `<p class="empty">Aucune formation renseignée.</p>`;

  const experiences = d.experiences.length
    ? d.experiences
        .map(
          (x) => `
      <div class="entry">
        <div class="entry-head">
          <strong>${esc(x.title)}${x.company ? ` — ${esc(x.company)}` : ""}</strong>
          ${VERIF_BADGE(x.verified)}
        </div>
        <p class="entry-sub">${esc(x.periodLabel)}${x.city ? ` · ${esc(x.city)}` : ""}</p>
        ${x.description ? `<p class="entry-desc">${esc(x.description)}</p>` : ""}
      </div>`,
        )
        .join("")
    : `<p class="empty">Aucune expérience renseignée.</p>`;

  const projects = d.projects.length
    ? d.projects
        .map(
          (p) => `
      <div class="entry">
        <div class="entry-head">
          <strong>${esc(p.title)}</strong>
          ${VERIF_BADGE(p.verified)}
        </div>
        <p class="entry-sub">${esc([p.domainLabel, p.city, p.dateLabel].filter(Boolean).join(" · "))}</p>
        ${p.description ? `<p class="entry-desc">${esc(p.description)}</p>` : ""}
        ${p.outcome ? `<p class="entry-outcome">${esc(p.outcome)}</p>` : ""}
      </div>`,
        )
        .join("")
    : `<p class="empty">Aucune réalisation ajoutée.</p>`;

  const gtec = d.gtecInterventions.length
    ? d.gtecInterventions
        .map(
          (g) => `
      <div class="row">
        <div class="row-main">
          <strong>${esc(g.reference)}</strong>
          <span>${esc(g.title)}${g.city ? ` · ${esc(g.city)}` : ""} · ${esc(g.dateLabel)}${
            g.rating ? ` · ${g.rating}/5 ⭐` : ""
          }</span>
        </div>
        <span class="verif ok">PV signé</span>
      </div>`,
        )
        .join("")
    : `<p class="empty">Aucune intervention GTEC PRO à ce jour.</p>`;

  const company = d.company
    ? `<div class="company">
        <div class="row">
          <div class="row-main">
            <strong>${esc(d.company.name)}</strong>
            <span>${esc([d.company.city, d.company.phone, d.company.email].filter(Boolean).join(" · "))}${
              d.company.domains?.length ? ` · ${esc(d.company.domains.join(", "))}` : ""
            }</span>
          </div>
          <span class="verif${d.company.status === "VERIFIED" ? " ok" : ""}">${
            d.company.status === "VERIFIED" ? "Entreprise vérifiée" : "Non vérifiée"
          }</span>
        </div>
        <p class="entry-sub">${d.company.teamCount} membre${d.company.teamCount > 1 ? "s" : ""} rattaché${
         d.company.teamCount > 1 ? "s" : ""
       } à l'équipe (§11).</p>
      </div>`
    : "";

  const bio = line(d.bio) ? `<p class="bio">${esc(d.bio ?? "")}</p>` : "";

  const body = `
    ${identity}
    ${bio}
    ${section("Diplômes & formation initiale (référentiel MINESUP)", credentials)}
    ${section("Compétences techniques", skills)}
    ${section("Certifications & habilitations", certifications)}
    ${section("Formations continues", trainings)}
    ${section("Expériences professionnelles", experiences)}
    ${section("Réalisations / portfolio", projects)}
    ${section("Interventions GTEC PRO (client masqué)", gtec)}
    ${company ? section("Entreprise / équipe rattachée", company) : ""}`;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Passeport professionnel — ${esc(d.fullName)} — GTEC PRO</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 28px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1a2b22; font-size: 12px; line-height: 1.5;
    background: #f3f6f4;
  }
  h1 { margin: 0 0 2px; font-size: 22px; letter-spacing: -0.2px; }
  h2 {
    margin: 0 0 8px; font-size: 12.5px; text-transform: uppercase;
    letter-spacing: 1px; color: #1c6b34;
    border-bottom: 1.5px solid #1c6b34; padding-bottom: 4px;
  }
  section { margin: 0 0 18px; }
  .page {
    max-width: 820px; margin: 0 auto; background: #fff;
    border-radius: 14px; padding: 26px 30px;
    box-shadow: 0 10px 40px rgba(20,60,35,.12);
  }
  .id-card { display: flex; gap: 16px; align-items: flex-start; }
  .photo {
    width: 92px; height: 92px; border-radius: 14px; object-fit: cover;
    border: 2px solid #dcebe1; background: #eef5f0;
  }
  .photo-empty {
    display: flex; align-items: center; justify-content: center;
    font-size: 30px; font-weight: 700; color: #1c6b34;
  }
  .id-main { flex: 1; min-width: 0; }
  .job { margin: 0 0 4px; font-weight: 600; color: #14532d; }
  .contact { margin: 0 0 6px; color: #4b5f54; }
  .meta { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 12px; color: #4b5f54; font-size: 11px; }
  .stamp {
    text-align: center; border: 1.5px dashed #1c6b34; border-radius: 12px;
    padding: 10px 14px; color: #1c6b34; display: flex; flex-direction: column;
    gap: 3px; align-items: center;
  }
  .stamp span { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
  .stamp strong { font-size: 13px; letter-spacing: .5px; }
  .stamp em { font-size: 9px; color: #4b7a5e; }
  .bio { margin: 14px 0 0; padding: 10px 14px; background: #f2f8f4; border-radius: 10px; color: #244032; }
  .row {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; padding: 6px 0; border-bottom: 1px dashed #d9e5dd;
  }
  .row:last-child { border-bottom: 0; }
  .row-main { min-width: 0; }
  .row-main strong { display: block; font-size: 12px; }
  .row-main span { color: #5a6f63; font-size: 11px; }
  .verif {
    flex-shrink: 0; font-size: 9.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .4px; color: #7a8a80; border: 1px solid #d5ded8;
    border-radius: 999px; padding: 2px 8px; white-space: nowrap;
  }
  .verif.ok { color: #15803d; border-color: #86c79a; background: #ecf8f0; }
  .chip {
    display: inline-block; margin: 0 6px 6px 0; padding: 3px 10px;
    border: 1px solid #cfe0d5; border-radius: 999px; font-size: 11px;
    background: #f7fbf8;
  }
  .chip-verified { border-color: #86c79a; background: #ecf8f0; color: #14532d; }
  .entry { padding: 7px 0; border-bottom: 1px dashed #d9e5dd; }
  .entry:last-child { border-bottom: 0; }
  .entry-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .entry-head strong { font-size: 12px; }
  .entry-sub { margin: 1px 0 0; color: #5a6f63; font-size: 11px; }
  .entry-desc { margin: 3px 0 0; color: #33473c; }
  .entry-outcome { margin: 3px 0 0; color: #15803d; font-weight: 600; }
  .empty { color: #7a8a80; font-style: italic; margin: 2px 0; }
  .company { background: #f7fbf8; border: 1px solid #dcebe1; border-radius: 10px; padding: 10px 14px; }
  footer {
    max-width: 820px; margin: 14px auto 0; text-align: center;
    color: #6b7d72; font-size: 10px;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; border-radius: 0; max-width: none; padding: 10mm 12mm; }
    footer { margin: 8mm auto 0; }
    section { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    ${body}
  </div>
  <footer>
    GTEC PRO — Green Tech Energy Cameroon · Passeport professionnel édité depuis le dossier vivant de l'adhérent ·
    Les mentions « Vérifié » sont accordées exclusivement par l'administration GTEC PRO (§12).
  </footer>
</body>
</html>`;

  return html;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Ouvre un document HTML dans un onglet isolé et déclenche l'impression
 * (« Enregistrer au format PDF »). Lève une erreur si les pop-ups sont bloqués.
 * (Copie locale du pattern d'invoicePdf.ts — la fonction d'origine est privée.)
 */
function openPrintWindow(html: string): void {
  const win = window.open("", "_blank", "width=920,height=1200");
  if (!win) {
    throw new Error(
      "Le navigateur a bloqué la fenêtre d'impression. Autorisez les pop-ups pour télécharger le document.",
    );
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* l'utilisateur pourra imprimer manuellement (Ctrl+P) */
    }
  };
  setTimeout(trigger, 400);
}

/** Passeport professionnel (§19). */
export function openProfilePdf(data: ProfilePdfData): void {
  openPrintWindow(buildProfileHtml(data));
}
