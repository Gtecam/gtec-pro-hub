export function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function minutesToHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseHHmm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export const WEEKDAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/** Créneaux libres sur une plage de dates pour un jeu de règles et de créneaux déjà réservés. */
export function generateAvailableSlots(params: {
  rules: Array<{ weekday: number; startMin: number; endMin: number; slotMinutes?: number; travelMinutes?: number; capacityPerDay?: number }>;
  booked: Array<{ start: number; end: number }>;
  dateFrom: string;
  dateTo: string;
  now: number;
}): Array<{ start: number; end: number }> {
  const { rules, booked, dateFrom, dateTo, now } = params;
  const from = Date.parse(dateFrom);
  const to = Date.parse(dateTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];

  const slots: Array<{ start: number; end: number }> = [];
  const travel = 30;

  for (let t = from; t <= to; t = t + 86_400_000) {
    const day = new Date(t).getDay();
    const dayRules = rules.filter((r) => r.weekday === day && r.endMin > r.startMin);
    if (dayRules.length === 0) continue;
    const dayBooked = booked.filter((b) => {
      const bs = new Date(b.start).setHours(0, 0, 0, 0);
      const be = new Date(b.end).setHours(0, 0, 0, 0);
      const ds = new Date(t).setHours(0, 0, 0, 0);
      const de = new Date(t + 86_400_000).setHours(0, 0, 0, 0);
      return bs < de && be > ds;
    });

    const capacityByMinute = new Map<number, number>();
    for (const b of dayBooked) {
      for (let m = b.start; m < b.end; m += 60_000) {
        capacityByMinute.set(m, (capacityByMinute.get(m) ?? 0) + 1);
      }
    }

    for (const rule of dayRules) {
      const dayStart = t + rule.startMin * 60_000;
      const dayEnd = t + rule.endMin * 60_000;
      if (dayEnd <= now) continue;
      const slotMinutes = rule.slotMinutes ?? 60;
      const travelMinutes = rule.travelMinutes ?? 0;
      const gap = slotMinutes + travelMinutes;
      const capacity = rule.capacityPerDay ?? 999;
      let cursor = Math.max(dayStart, now - (now % 60_000) + (now % 60_000 > 0 ? 60_000 - (now % 60_000) : 0));
      if (cursor < dayStart) cursor = dayStart;
      const ceiling = dayEnd - slotMinutes * 60_000;
      if (cursor > ceiling) continue;

      let usedToday = 0;
      for (let s = cursor; s <= ceiling; s = s + gap * 60_000) {
        if (usedToday >= capacity) break;
        const e = s + slotMinutes * 60_000;
        let overlap = false;
        for (let m = s; m < e; m += 60_000) {
          if ((capacityByMinute.get(m) ?? 0) > 0) { overlap = true; break; }
        }
        if (overlap) continue;
        slots.push({ start: s, end: e });
        usedToday++;
        for (let m = s; m < e; m += 60_000) {
          capacityByMinute.set(m, (capacityByMinute.get(m) ?? 0) + 1);
        }
      }
    }
  }

  return slots;
}
