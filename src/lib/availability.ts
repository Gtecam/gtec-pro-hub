export function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function minutesToHHmm(minutes: number): string {
  if (minutes < 0 || minutes >= 1440) return "00:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseHHmm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function overlaps(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1;
}

export const WEEKDAY_LABELS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

/** Créneaux libres sur une plage de dates pour un jeu de règles et de créneaux déjà réservés. */
export function generateAvailableSlots(params: {
  rules: Array<{ weekday: number; startMin: number; endMin: number; slotMinutes?: number; travelMinutes?: number; capacityPerDay?: number; effectiveFrom?: string; effectiveUntil?: string }>;
  booked: Array<{ start?: number; end?: number; slotStart?: number; slotEnd?: number }>;
  dateFrom: string;
  dateTo: string;
  now: number;
}): Array<{ start: number; end: number }> {
  const { rules, booked, dateFrom, dateTo, now } = params;
  const from = Date.parse(dateFrom);
  const to = Date.parse(dateTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];

  const slots: Array<{ start: number; end: number }> = [];

  for (let t = from; t <= to; t = t + 86_400_000) {
    const day = new Date(t).getDay();
    const dayRules = rules.filter(
      (r) =>
        r.weekday === day &&
        r.endMin > r.startMin &&
        (!r.effectiveFrom || t >= Date.parse(r.effectiveFrom)) &&
        (!r.effectiveUntil || t < Date.parse(r.effectiveUntil)),
    );
    if (dayRules.length === 0) continue;
    const dayStartOfDay = t;
    const dayEndOfDay = t + 86_400_000;
    const dayBooked = booked.filter((b) => {
      const bs = new Date(b.start ?? b.slotStart ?? 0).getTime();
      const be = new Date(b.end ?? b.slotEnd ?? 0).getTime();
      return bs < dayEndOfDay && be > dayStartOfDay;
    });

    // Determine the max travel buffer needed across all rules for this day
    let maxTravel = 0;
    for (const r of dayRules) {
      if (r.travelMinutes && r.travelMinutes > maxTravel) maxTravel = r.travelMinutes;
    }
    const busyMinutes = new Set<number>();
    for (const b of dayBooked) {
      const bStart = new Date(b.start ?? b.slotStart ?? 0).getTime();
      const bEnd = new Date(b.end ?? b.slotEnd ?? 0).getTime();
      // Add travel buffer before and after each booked slot
      const bufferedStart = bStart - maxTravel * 60_000;
      const bufferedEnd = bEnd + maxTravel * 60_000;
      for (let m = bufferedStart; m < bufferedEnd; m += 60_000) {
        busyMinutes.add(m);
      }
    }

    // Count already-booked slots for capacity tracking
    const bookedSlotCount = dayBooked.length;

    for (const rule of dayRules) {
      const slotMinutes = rule.slotMinutes ?? 60;
      const travelMinutes = rule.travelMinutes ?? 0;
      const capacity = rule.capacityPerDay ?? 999;
      const dayStart = t + rule.startMin * 60_000;
      const dayEnd = t + rule.endMin * 60_000;
      if (dayEnd <= now) continue;
      const cursor = Math.max(dayStart, now + 60_000 - ((now - dayStart) % 60_000));
      const ceiling = dayEnd - slotMinutes * 60_000;
      if (cursor > ceiling) continue;

      let usedToday = rule.capacityPerDay !== undefined ? bookedSlotCount : 0;
      for (let s = cursor; s <= ceiling; s += slotMinutes * 60_000) {
        if (usedToday >= capacity) break;
        const e = s + slotMinutes * 60_000;
        let blocked = false;
        for (let m = s; m < e; m += 60_000) {
          if (busyMinutes.has(m)) { blocked = true; break; }
        }
        if (blocked) continue;
        slots.push({ start: s, end: e });
        usedToday++;
        for (let m = s; m < e; m += 60_000) {
          busyMinutes.add(m);
        }
        // Add travel buffer after this slot
        if (travelMinutes > 0) {
          for (let m = e; m < e + travelMinutes * 60_000; m += 60_000) {
            busyMinutes.add(m);
          }
        }
      }
    }
  }

  return slots;
}
