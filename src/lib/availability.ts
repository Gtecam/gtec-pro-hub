/**
 * GTEC PRO — Logique métier des rendez-vous (§8 « PRENDRE RENDEZ-VOUS »).
 *
 * Fonctions PURES (aucun accès base de données) : le client ne voit que les
 * créneaux réellement disponibles — horaires du professionnel, temps de
 * déplacement entre deux rendez-vous, capacité quotidienne, rendez-vous déjà
 * pris. Le même module est utilisé côté serveur (appointments.ts) pour
 * revérifier chaque réservation, et testé isolément (scripts/test-availability.ts).
 */

export interface AvailabilityRule {
  weekday: number; // 0 = dimanche … 6 = samedi
  startMin: number; // minutes depuis minuit
  endMin: number; // minutes depuis minuit
  slotMinutes?: number; // durée d'un créneau (défaut 60)
  travelMinutes?: number; // temps de déplacement entre deux rendez-vous (défaut 30)
  capacityPerDay?: number; // nombre max de rendez-vous par jour (non défini = illimité)
  effectiveFrom?: string; // YYYY-MM-DD
  effectiveUntil?: string; // YYYY-MM-DD
}

export interface BookedSlot {
  slotStart: number; // timestamp
  slotEnd: number; // timestamp
}

export interface AvailableSlot {
  start: number;
  end: number;
}

export const WEEKDAY_LABELS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

export const WEEKDAY_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

export const DEFAULT_SLOT_MINUTES = 60;
export const DEFAULT_TRAVEL_MINUTES = 30;

/** « 540 » → « 09:00 ». */
export function minutesToHHmm(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** « 09:30 » → 570. */
export function parseHHmm(value: string): number {
  const [h, m] = value.split(":").map((x) => Number(x) || 0);
  return Math.max(0, Math.min(24 * 60, (h ?? 0) * 60 + (m ?? 0)));
}

/** Date locale au format YYYY-MM-DD (pas d'UTC : évite les décalages de fuseau). */
export function isoDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface DayCursor {
  iso: string;
  weekday: number;
  midnight: number;
}

/** Liste les jours (dates locales) entre deux dates « YYYY-MM-DD », borné. */
export function eachDay(dateFrom: string, dateTo: string, maxDays = 60): DayCursor[] {
  const parse = (iso: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  };
  const from = parse(dateFrom);
  const to = parse(dateTo);
  if (!from || !to || to.getTime() < from.getTime()) return [];
  const out: DayCursor[] = [];
  const cursor = new Date(from.getTime());
  while (cursor.getTime() <= to.getTime() && out.length < maxDays) {
    out.push({
      iso: isoDate(cursor.getTime()),
      weekday: cursor.getDay(),
      midnight: cursor.getTime(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export interface GenerateOptions {
  rules: AvailabilityRule[];
  booked: BookedSlot[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  now?: number;
  /** Délai minimum avant le rendez-vous (défaut 60 min). */
  minLeadMinutes?: number;
}

/**
 * Créneaux réellement disponibles : on part des horaires déclarés par le
 * professionnel, on retire le temps de déplacement autour des rendez-vous
 * déjà pris, on plafonne à la capacité quotidienne et on exclut le passé.
 */
export function generateAvailableSlots(opts: GenerateOptions): AvailableSlot[] {
  const {
    rules,
    booked,
    dateFrom,
    dateTo,
    now = Date.now(),
    minLeadMinutes = 60,
  } = opts;
  const active = rules.filter(
    (r) =>
      r.weekday >= 0 &&
      r.weekday <= 6 &&
      Number.isFinite(r.startMin) &&
      Number.isFinite(r.endMin) &&
      r.endMin > r.startMin &&
      r.startMin >= 0 &&
      r.endMin <= 24 * 60,
  );
  if (active.length === 0) return [];

  const out: AvailableSlot[] = [];
  const minStart = now + minLeadMinutes * 60_000;

  for (const day of eachDay(dateFrom, dateTo)) {
    const dayRules = active.filter(
      (r) =>
        r.weekday === day.weekday &&
        (!r.effectiveFrom || day.iso >= r.effectiveFrom) &&
        (!r.effectiveUntil || day.iso <= r.effectiveUntil),
    );
    if (dayRules.length === 0) continue;

    const dayBookings = booked.filter((b) => isoDate(b.slotStart) === day.iso);
    // Capacité quotidienne : si le professionnel ne la définit pas, il peut
    // enchaîner autant de créneaux que sa plage horaire le permet.
    const capacity = Math.max(...dayRules.map((r) => r.capacityPerDay ?? Number.MAX_SAFE_INTEGER));
    if (dayBookings.length >= capacity) continue; // journée complète

    const daySlots: AvailableSlot[] = [];
    for (const rule of dayRules) {
      const slotMinutes = rule.slotMinutes ?? DEFAULT_SLOT_MINUTES;
      const travelMinutes = rule.travelMinutes ?? DEFAULT_TRAVEL_MINUTES;
      if (slotMinutes <= 0) continue;
      for (let t = rule.startMin; t + slotMinutes <= rule.endMin; t += slotMinutes) {
        const start = day.midnight + t * 60_000;
        const end = start + slotMinutes * 60_000;
        if (start < minStart) continue;
        const buffer = travelMinutes * 60_000;
        const clashWithBooking = dayBookings.some((b) =>
          overlaps(start, end, b.slotStart - buffer, b.slotEnd + buffer),
        );
        if (clashWithBooking) continue;
        if (daySlots.some((s) => overlaps(start, end, s.start, s.end))) continue;
        daySlots.push({ start, end });
      }
    }
    daySlots.sort((a, b) => a.start - b.start);
    out.push(...daySlots);
  }
  return out;
}

/** Prochaines dates réservables depuis aujourd'hui (14 jours par défaut). */
export function nextDays(now = Date.now(), count = 14): { iso: string; weekday: number; midnight: number }[] {
  return eachDay(isoDate(now), isoDate(now + (count - 1) * 86_400_000), count);
}