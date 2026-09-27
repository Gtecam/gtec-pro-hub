import { MAX_FILE_SIZE } from "./gtec";

/**
 * Compression d'images côté navigateur avant envoi (data URL JPEG).
 *
 * Les fichiers image lourds sont redimensionnés puis ré-encodés en JPEG par
 * paliers de qualité croissante jusqu'à passer sous MAX_FILE_SIZE. Les fichiers
 * déjà conformes (ou non image : PDF des documents KYC) sont renvoyés tels
 * quels — on ne refuse plus jamais une image pour sa taille si elle est
 * compressible.
 */

export type CompressResult =
  | { ok: true; dataUrl: string; compressed: boolean; originalSize: number }
  | { ok: false; reason: "trop-lourd"; originalSize: number };

/** Charge un fichier image dans un bitmap HTML (décode aussi l'EXIF d'orientation). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = src;
  });
}

/** Ré-encode l'image en JPEG avec la largeur et la qualité demandées. */
function encode(img: HTMLImageElement, maxWidth: number, quality: number): string {
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");
  // Fond blanc : évite le noir (transparence PNG → JPEG).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Taille réelle d'une data URL (base64 ≈ 4/3 du binaire). */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.round((base64.length * 3) / 4);
}

/**
 * Compresse si nécessaire, sinon renvoie le fichier inchangé.
 * - non image → inchangé (le refus de type reste de la responsabilité de l'appelant) ;
 * - image ≤ maxBytes → inchangée ;
 * - image lourde → redimensionnement progressif + qualité dégressive,
 *   du mieux conservé au plus compact, jusqu'à passer sous la limite.
 *
 * `mode: "document"` (défaut : photo) privilégie la lisibilité du texte :
 * largeur plafonnée à 1600 px, qualité plus haute — indispensable pour les
 * CNI, diplômes et attestations transmis à l'administration GTEC.
 * `mode: "document-tight"` : paliers plus resserrés (cible ~350 Ko/pièce)
 * pour respecter le plafond Convex de 1 Mio par champ sur un dossier complet.
 */
export async function compressImageIfNeeded(
  file: File,
  options?: { maxBytes?: number; mode?: "photo" | "document" | "document-tight" },
): Promise<CompressResult> {
  const maxBytes = options?.maxBytes ?? MAX_FILE_SIZE;
  const documentMode = options?.mode === "document";
  const tightMode = options?.mode === "document-tight";
  const isImage = file.type.startsWith("image/");
  if (!isImage || file.size <= maxBytes) {
    return { ok: true, dataUrl: "", compressed: false, originalSize: file.size };
  }

  // Lecture du fichier en data URL.
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });

  // GIF animé / formats exotiques : non ré-encodables proprement.
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return { ok: false, reason: "trop-lourd", originalSize: file.size };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(raw);
  } catch {
    return { ok: false, reason: "trop-lourd", originalSize: file.size };
  }

  // Paliers : on préserve d'abord la résolution, puis on réduit.
  // Mode document : plafond 1600 px et qualité plus haute (texte lisible).
  const steps: { maxWidth: number; quality: number }[] = tightMode
    ? [
        { maxWidth: 1200, quality: 0.8 },
        { maxWidth: 1000, quality: 0.74 },
        { maxWidth: 850, quality: 0.7 },
        { maxWidth: 700, quality: 0.66 },
        { maxWidth: 600, quality: 0.62 },
        { maxWidth: 480, quality: 0.58 },
      ]
    : documentMode
    ? [
        { maxWidth: Math.min(img.naturalWidth, 1600), quality: 0.86 },
        { maxWidth: Math.min(img.naturalWidth, 1400), quality: 0.8 },
        { maxWidth: 1200, quality: 0.78 },
        { maxWidth: 1000, quality: 0.72 },
        { maxWidth: 800, quality: 0.68 },
      ]
    : [
        { maxWidth: img.naturalWidth, quality: 0.82 },
        { maxWidth: img.naturalWidth, quality: 0.7 },
        { maxWidth: 1920, quality: 0.8 },
        { maxWidth: 1600, quality: 0.75 },
        { maxWidth: 1280, quality: 0.72 },
        { maxWidth: 1024, quality: 0.7 },
        { maxWidth: 800, quality: 0.65 },
      ];
  let best = "";
  for (const step of steps) {
    best = encode(img, step.maxWidth, step.quality);
    if (dataUrlBytes(best) <= maxBytes) {
      return { ok: true, dataUrl: best, compressed: true, originalSize: file.size };
    }
  }
  // Dernier palier conservé même s'il dépasse très légèrement : mieux que rien.
  return { ok: true, dataUrl: best, compressed: true, originalSize: file.size };
}

/** Taille lisible pour les toasts (Ko / Mo). */
export function humanSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.round(bytes / 1024)} Ko`;
}
