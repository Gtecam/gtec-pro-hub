/**
 * Export CSV comptable — téléchargement côté navigateur, encodage UTF-8
 * avec BOM pour que les accents et le FCFA s'affichent correctement
 * dans Excel (séparateur point-virgule, standard FR).
 */

/** Échappe une cellule : guillemets doublés si séparateur/retour/guillemet. */
function cell(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Construit un CSV (point-virgule) et déclenche son téléchargement.
 * Lève une erreur si le navigateur bloque le téléchargement.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | undefined)[][],
): void {
  const lines = [headers, ...rows].map((r) => r.map(cell).join(";"));
  const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Date du jour au format AAAA-MM-JJ (nom de fichier). */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
