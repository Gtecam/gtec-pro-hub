import { CITY_GEO } from "./gtec";

/** Position GPS brute (degrés décimaux WGS84). */
export type GpsCoords = { lat: number; lon: number };

export function isValidGps(c?: GpsCoords | null): boolean {
  return (
    !!c &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lon) <= 180 &&
    !(c.lat === 0 && c.lon === 0)
  );
}

/** Distance en km entre deux positions GPS (haversine). */
export function haversineKm(a: GpsCoords, b: GpsCoords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Affichage compact : "4.051100, 9.767900". */
export function formatGps(c: GpsCoords): string {
  return `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`;
}

/** Ville GTEC la plus proche d'une position GPS. */
export function nearestCity(
  c: GpsCoords,
): { city: string; distanceKm: number } | null {
  let best: { city: string; distanceKm: number } | null = null;
  for (const [city, geo] of Object.entries(CITY_GEO)) {
    const d = haversineKm(c, geo);
    if (!best || d < best.distanceKm) best = { city, distanceKm: d };
  }
  return best;
}

/** Lien Google Maps vers un point (épinglage du chantier). */
export function gmapsCoordsUrl(c: GpsCoords): string {
  return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`;
}

/** Itinéraire Google Maps : position actuelle du technicien → chantier. */
export function gmapsDirectionsUrl(
  from: GpsCoords | null | undefined,
  to: GpsCoords,
): string {
  if (from && isValidGps(from)) {
    return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=driving`;
  }
  return gmapsCoordsUrl(to);
}
