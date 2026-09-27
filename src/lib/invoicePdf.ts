import {
  fcfa,
  formatDateTime,
  MILESTONE_LABELS,
  PAYMENT_METHODS,
  splitFiftyFifty,
} from "./gtec";

/**
 * Facture PDF — générée côté navigateur en HTML A4 imprimable (Ctrl+P →
 * « Enregistrer au format PDF »), sans dépendance externe. La facture
 * reprend : devis détaillé (TVA 19,25 %), tranches 50/50, équipe, PV de
 * réception signé et coordonnées de règlement GTEC.
 */
export type InvoicePdfData = {
  invoiceNumber: string;
  issuedAt: number;
  invoiceStatus: string; // "emise" | "payee"
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientCity?: string;
  companyName?: string;
  taxId?: string;
  nationalId?: string;
  request: {
    reference: string;
    title: string;
    serviceLabel: string;
    address: string;
    city: string;
    scheduledAt?: number;
  };
  quote?: {
    number: string;
    items: { label: string; qty: number; unitPrice: number }[];
    subtotal: number;
    vatRate: number;
    total: number;
  };
  payments: {
    milestone?: string;
    amount: number;
    method: string;
    status: string;
    paidAt?: number;
  }[];
  report?: {
    workDone?: string;
    warrantyMonths: number;
    receivedAt?: number;
    clientSignature?: string;
  };
  team?: { name: string; role: string }[];
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const methodLabel = (key: string) =>
  PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key;

const paymentStatus = (status: string) =>
  status === "valide" ? "Validé" : status === "echoue" ? "Échoué" : "En attente";

export function buildInvoiceHtml(data: InvoicePdfData): string {
  const q = data.quote;
  const { advance, balance } = splitFiftyFifty(q?.total ?? 0);
  const advancePaid = data.payments.find((p) => p.milestone === "avance");
  const balancePaid = data.payments.find((p) => p.milestone === "solde");
  // Payée si la facture est marquée payée ou si les tranches validées
  // couvrent le total TTC (règlement 50/50 complet).
  const validatedTotal = data.payments
    .filter((p) => p.status === "valide")
    .reduce((s, p) => s + p.amount, 0);
  const isPaid =
    data.invoiceStatus === "payee" || (q ? validatedTotal >= q.total : validatedTotal > 0);

  const clientBlock = [
    data.companyName ? `<strong>${esc(data.companyName)}</strong>` : "",
    data.clientName ? esc(data.clientName) : "",
    data.taxId ? `NUI : ${esc(data.taxId)}` : "",
    data.nationalId && !data.taxId ? `CNI : ${esc(data.nationalId)}` : "",
    data.clientAddress ? esc(data.clientAddress) : "",
    data.clientCity ? esc(data.clientCity) : "",
    data.clientPhone ? `Tél. : ${esc(data.clientPhone)}` : "",
    data.clientEmail ? esc(data.clientEmail) : "",
  ]
    .filter(Boolean)
    .join("<br/>");

  const lines = (q?.items ?? [])
    .map(
      (it) => `
      <tr>
        <td>${esc(it.label)}</td>
        <td class="c">${it.qty.toLocaleString("fr-FR")}</td>
        <td class="r">${fcfa(it.unitPrice)}</td>
        <td class="r">${fcfa(it.qty * it.unitPrice)}</td>
      </tr>`,
    )
    .join("");

  const totals = q
    ? `
    <table class="totals">
      <tr><td>Sous-total</td><td class="r">${fcfa(q.subtotal)}</td></tr>
      <tr><td>TVA ${q.vatRate.toLocaleString("fr-FR")} %</td><td class="r">${fcfa(q.total - q.subtotal)}</td></tr>
      <tr class="grand"><td>Total TTC</td><td class="r">${fcfa(q.total)}</td></tr>
    </table>`
    : `<p class="muted">Montant facturé : <strong>${fcfa(data.payments.reduce((s, p) => s + p.amount, 0))}</strong></p>`;

  const tranche = (
    label: string,
    amount: number,
    paid?: { amount: number; method: string; status: string; paidAt?: number },
  ) => `
    <div class="tranche">
      <p class="tranche-label">${esc(label)}</p>
      <p class="tranche-amount">${fcfa(amount)}</p>
      <p class="tranche-status ${paid?.status === "valide" ? "ok" : ""}">
        ${paid ? `${paymentStatus(paid.status)} · ${methodLabel(paid.method)}${paid.paidAt ? ` · le ${formatDateTime(paid.paidAt)}` : ""}` : "En attente de règlement"}
      </p>
    </div>`;

  const paymentsRows = data.payments
    .map(
      (p) => `
      <tr>
        <td>${p.milestone ? esc(MILESTONE_LABELS[p.milestone] ?? p.milestone) : "Règlement"}</td>
        <td>${methodLabel(p.method)}</td>
        <td>${p.paidAt ? formatDateTime(p.paidAt) : "—"}</td>
        <td class="r">${fcfa(p.amount)}</td>
        <td class="c ${p.status === "valide" ? "ok" : ""}">${paymentStatus(p.status)}</td>
      </tr>`,
    )
    .join("");

  const team = (data.team ?? []).length
    ? `
    <h2>Équipe d'intervention</h2>
    <table>
      <thead><tr><th>Membre</th><th>Fonction</th></tr></thead>
      <tbody>
        ${data
          .team!.map(
            (m) =>
              `<tr><td>${esc(m.name)}</td><td>${esc(m.role)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>`
    : "";

  const report = data.report
    ? `
    <h2>PV de réception</h2>
    <div class="pv">
      <p><strong>Travaux réalisés :</strong> ${esc(data.report.workDone ?? "—")}</p>
      <p><strong>Garantie :</strong> ${data.report.warrantyMonths} mois
         ${data.report.receivedAt ? `· réceptionné le ${formatDateTime(data.report.receivedAt)}` : ""}</p>
      ${
        data.report.clientSignature
          ? `<div class="sig"><p>Signature du client :</p><img src="${esc(data.report.clientSignature)}" alt="Signature"/></div>`
          : ""
      }
    </div>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>Facture ${esc(data.invoiceNumber)} — GTEC PRO</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1c2b22; margin: 0; font-size: 12.5px; line-height: 1.5;
  }
  .head {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #15803d; padding-bottom: 14px; margin-bottom: 18px;
  }
  .brand h1 { margin: 0; font-size: 22px; color: #15803d; letter-spacing: -0.02em; }
  .brand p { margin: 2px 0 0; color: #4b5c51; font-size: 11px; }
  .doc { text-align: right; }
  .doc .doc-title { font-size: 26px; font-weight: 700; letter-spacing: 0.06em; margin: 0; }
  .doc .doc-num { font-family: "Courier New", monospace; color: #4b5c51; margin: 2px 0 0; }
  .badge {
    display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 999px;
    font-size: 10.5px; font-weight: 600; border: 1px solid #15803d; color: #15803d;
  }
  .badge.payee { background: #15803d; color: #fff; }
  .grid { display: flex; gap: 16px; margin-bottom: 16px; }
  .box { flex: 1; border: 1px solid #d5ded7; border-radius: 8px; padding: 10px 12px; }
  .box h3 { margin: 0 0 4px; font-size: 10.5px; text-transform: uppercase;
    letter-spacing: 0.08em; color: #15803d; }
  .meta { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
    background: #f2f7f3; border-radius: 8px; padding: 10px 12px; }
  .meta div { min-width: 140px; }
  .meta .k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #63756a; }
  h2 { font-size: 13px; margin: 18px 0 6px; color: #15803d; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #63756a; border-bottom: 2px solid #15803d; padding: 5px 6px; }
  td { border-bottom: 1px solid #e2eae4; padding: 6px; vertical-align: top; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .ok { color: #15803d; font-weight: 600; }
  table.totals { width: 46%; margin-left: auto; }
  table.totals td { border: none; padding: 3px 6px; }
  table.totals tr.grand td { border-top: 2px solid #15803d; font-weight: 700;
    font-size: 14px; color: #15803d; padding-top: 6px; }
  .tranches { display: flex; gap: 12px; margin: 8px 0 4px; }
  .tranche { flex: 1; border: 1px solid #d5ded7; border-radius: 8px; padding: 8px 10px; }
  .tranche-label { margin: 0; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.06em; color: #63756a; }
  .tranche-amount { margin: 2px 0; font-size: 15px; font-weight: 700; }
  .tranche-status { margin: 0; font-size: 10.5px; color: #b45309; }
  .tranche-status.ok { color: #15803d; }
  .muted { color: #63756a; }
  .pv { border: 1px solid #d5ded7; border-radius: 8px; padding: 10px 12px; }
  .sig img { height: 56px; display: block; margin-top: 4px; }
  .foot {
    margin-top: 22px; border-top: 1px solid #d5ded7; padding-top: 8px;
    font-size: 10.5px; color: #63756a; display: flex; justify-content: space-between; gap: 16px;
  }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <h1>GTEC PRO</h1>
      <p>Green Tech Energy Cameroon — Sarl · Énergie, électricité &amp; multi-services</p>
      <p>Service clientèle : 655 09 42 28 · etsgreentech@yahoo.com · Douala, Cameroun</p>
    </div>
    <div class="doc">
      <p class="doc-title">FACTURE</p>
      <p class="doc-num">${esc(data.invoiceNumber)}</p>
      <span class="badge ${isPaid ? "payee" : ""}">
        ${isPaid ? "Payée" : "Émise"}
      </span>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>Émetteur</h3>
      <strong>GTEC PRO Sarl</strong><br/>
      Green Tech Energy Cameroon<br/>
      Douala — Cameroun<br/>
      Tél. : 655 09 42 28
    </div>
    <div class="box">
      <h3>Client</h3>
      ${clientBlock}
    </div>
  </div>

  <div class="meta">
    <div><div class="k">Demande</div><div><strong>${esc(data.request.reference)}</strong> — ${esc(data.request.title)}</div></div>
    <div><div class="k">Prestation</div><div>${esc(data.request.serviceLabel)}</div></div>
    <div><div class="k">Lieu</div><div>${esc(data.request.address)}, ${esc(data.request.city)}</div></div>
    <div><div class="k">Facture émise le</div><div>${formatDateTime(data.issuedAt)}</div></div>
    ${data.request.scheduledAt ? `<div><div class="k">Intervention</div><div>${formatDateTime(data.request.scheduledAt)}</div></div>` : ""}
  </div>

  ${
    q
      ? `<h2>Détail de la prestation (devis ${esc(q.number)})</h2>
  <table>
    <thead><tr><th>Désignation</th><th class="c">Qté</th><th class="r">P.U. HT</th><th class="r">Total HT</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>
  ${totals}`
      : ""
  }

  <h2>Règlement 50 / 50</h2>
  <div class="tranches">
    ${tranche("Avance — avant travaux", advancePaid?.amount ?? advance, advancePaid)}
    ${tranche("Solde — fin des travaux", balancePaid?.amount ?? balance, balancePaid)}
  </div>
  ${
    paymentsRows
      ? `<table>
    <thead><tr><th>Tranche</th><th>Moyen</th><th>Date</th><th class="r">Montant</th><th class="c">Statut</th></tr></thead>
    <tbody>${paymentsRows}</tbody>
  </table>`
      : ""
  }

  ${team}
  ${report}

  <div class="foot">
    <div>
      Règlement par virement : ${esc("Afriland First Bank")} — IBAN ${esc("CM21 1000 5000 1523 4567 8901 234")}<br/>
      Mobile Money : Orange Money 655 54 76 49 · MTN MoMo 678 20 28 24
    </div>
    <div style="text-align:right">
      Document généré électroniquement par GTEC PRO<br/>
      ${new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Ouvre un document HTML dans un onglet isolé et déclenche l'impression
 * (« Enregistrer au format PDF »). Lève une erreur si les pop-ups sont bloqués.
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

/**
 * Ouvre la facture dans un onglet isolé et déclenche l'impression
 * (« Enregistrer au format PDF »). Lève une erreur si les pop-ups sont bloqués.
 */
export function openInvoicePdf(data: InvoicePdfData): void {
  openPrintWindow(buildInvoiceHtml(data));
}

// ===================== PV de réception (document séparé) =====================

export type ReceptionPdfData = {
  /** La réception est-elle effective (PV signé) ? */
  received: boolean;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientCity?: string;
  request: InvoicePdfData["request"];
  team?: { name: string; role: string }[];
  report: {
    workDone: string;
    partsUsed: { label: string; qty: number }[];
    recommendations?: string;
    beforePhotos: string[];
    afterPhotos: string[];
    warrantyMonths: number;
    receivedAt?: number;
    receptionNote?: string;
    clientSignature?: string;
  };
};

export function buildReceptionHtml(data: ReceptionPdfData): string {
  const r = data.report;
  const parts = r.partsUsed.length
    ? `<p><strong>Matériel utilisé :</strong> ${r.partsUsed
        .map((p) => `${esc(p.label)} × ${p.qty.toLocaleString("fr-FR")}`)
        .join(" · ")}</p>`
    : "";
  const recos = r.recommendations
    ? `<p><strong>Recommandations :</strong> ${esc(r.recommendations)}</p>`
    : "";
  const photoGrid = (label: string, photos: string[]) =>
    photos.length
      ? `<p class="ph-label">${label}</p><div class="photos">${photos
          .map((src) => `<img src="${esc(src)}" alt="${label}"/>`)
          .join("")}</div>`
      : "";
  const team = (data.team ?? []).length
    ? `<table>
      <thead><tr><th>Intervenant</th><th>Fonction</th></tr></thead>
      <tbody>${data
        .team!.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.role)}</td></tr>`)
        .join("")}</tbody>
    </table>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>PV de réception ${esc(data.request.reference)} — GTEC PRO</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1c2b22; margin: 0; font-size: 12.5px; line-height: 1.55; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #15803d; padding-bottom: 14px; margin-bottom: 18px; }
  .brand h1 { margin: 0; font-size: 22px; color: #15803d; letter-spacing: -0.02em; }
  .brand p { margin: 2px 0 0; color: #4b5c51; font-size: 11px; }
  .doc { text-align: right; }
  .doc .doc-title { font-size: 19px; font-weight: 700; letter-spacing: 0.04em; margin: 0; }
  .doc .doc-num { font-family: "Courier New", monospace; color: #4b5c51; margin: 2px 0 0; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 999px;
    font-size: 10.5px; font-weight: 600; border: 1px solid #b45309; color: #b45309; }
  .badge.ok { border-color: #15803d; background: #15803d; color: #fff; }
  h2 { font-size: 13px; margin: 18px 0 6px; color: #15803d; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #63756a; border-bottom: 2px solid #15803d; padding: 5px 6px; }
  td { border-bottom: 1px solid #e2eae4; padding: 6px; vertical-align: top; }
  .meta { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
    background: #f2f7f3; border-radius: 8px; padding: 10px 12px; }
  .meta div { min-width: 140px; }
  .meta .k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #63756a; }
  .client { border: 1px solid #d5ded7; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; }
  .client h3 { margin: 0 0 4px; font-size: 10.5px; text-transform: uppercase;
    letter-spacing: 0.08em; color: #15803d; }
  .pv { border: 1px solid #d5ded7; border-radius: 8px; padding: 10px 12px; }
  .pv p { margin: 4px 0; }
  .warranty { background: #f2f7f3; border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
  .warranty strong { color: #15803d; }
  .ph-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #63756a; margin: 10px 0 4px; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .photos img { width: 100%; border-radius: 6px; border: 1px solid #e2eae4; }
  .sig { margin-top: 14px; display: flex; justify-content: space-between; gap: 16px; }
  .sig .sig-box { flex: 1; }
  .sig .sig-box .frame { border: 1px dashed #9db3a4; border-radius: 8px;
    padding: 8px; min-height: 96px; display: flex; align-items: center; justify-content: center; }
  .sig img { max-height: 84px; max-width: 100%; }
  .sig .hint { font-size: 10px; color: #63756a; margin: 4px 0 0; }
  .foot { margin-top: 22px; border-top: 1px solid #d5ded7; padding-top: 8px;
    font-size: 10.5px; color: #63756a; display: flex; justify-content: space-between; gap: 16px; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <h1>GTEC PRO</h1>
      <p>Green Tech Energy Cameroon — Sarl · Énergie, électricité &amp; multi-services</p>
      <p>Service clientèle : 655 09 42 28 · etsgreentech@yahoo.com · Douala, Cameroun</p>
    </div>
    <div class="doc">
      <p class="doc-title">PROCÈS-VERBAL DE RÉCEPTION</p>
      <p class="doc-num">${esc(data.request.reference)}</p>
      <span class="badge ${data.received ? "ok" : ""}">
        ${data.received ? "Réceptionné" : "En attente de signature"}
      </span>
    </div>
  </div>

  <div class="meta">
    <div><div class="k">Intervention</div><div><strong>${esc(data.request.title)}</strong></div></div>
    <div><div class="k">Prestation</div><div>${esc(data.request.serviceLabel)}</div></div>
    <div><div class="k">Lieu</div><div>${esc(data.request.address)}, ${esc(data.request.city)}</div></div>
    ${data.request.scheduledAt ? `<div><div class="k">Intervention planifiée</div><div>${formatDateTime(data.request.scheduledAt)}</div></div>` : ""}
    ${r.receivedAt ? `<div><div class="k">Réception le</div><div>${formatDateTime(r.receivedAt)}</div></div>` : ""}
  </div>

  <div class="client">
    <h3>Client</h3>
    ${[data.clientName, data.clientAddress, data.clientCity, data.clientPhone ? `Tél. : ${data.clientPhone}` : "", data.clientEmail]
      .filter((s): s is string => !!s)
      .map(esc)
      .join("<br/>")}
  </div>

  <h2>Constat des travaux</h2>
  <div class="pv">
    <p><strong>Travaux réalisés :</strong> ${esc(r.workDone)}</p>
    ${parts}
    ${recos}
    ${r.receptionNote ? `<p><strong>Remarque du client :</strong> ${esc(r.receptionNote)}</p>` : ""}
  </div>

  ${photoGrid("Photos avant intervention", r.beforePhotos)}
  ${photoGrid("Photos après intervention", r.afterPhotos)}

  <div class="warranty">
    Garantie GTEC : <strong>${r.warrantyMonths} mois</strong> sur les travaux réalisés —
    toute réclamation dans ce délai est prise en charge par nos équipes.
  </div>

  ${team}

  <div class="sig">
    <div class="sig-box">
      <p style="margin:0 0 4px"><strong>Signature du client</strong></p>
      <div class="frame">
        ${r.clientSignature ? `<img src="${esc(r.clientSignature)}" alt="Signature du client"/>` : `<span class="hint">En attente de signature</span>`}
      </div>
      <p class="hint">La signature vaut reconnaissance des travaux conformes et déclenche la facturation.</p>
    </div>
    <div class="sig-box">
      <p style="margin:0 0 4px"><strong>Pour GTEC PRO</strong></p>
      <div class="frame"><span class="hint">Chef d'équipe / Administration</span></div>
    </div>
  </div>

  <div class="foot">
    <div>
      Document généré électroniquement par GTEC PRO — ${esc(data.request.reference)}<br/>
      Service clientèle : 655 09 42 28 · etsgreentech@yahoo.com
    </div>
    <div style="text-align:right">
      ${new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Ouvre le PV de réception (document séparé de la facture) et déclenche
 * l'impression — « Enregistrer au format PDF ».
 */
export function openReceptionPdf(data: ReceptionPdfData): void {
  openPrintWindow(buildReceptionHtml(data));
}
