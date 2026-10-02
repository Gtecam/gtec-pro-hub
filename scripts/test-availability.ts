/**
 * GTEC PRO — Tests de la logique métier des rendez-vous (§8).
 * Exécution : bun scripts/test-availability.ts
 * (module pur, testé sans base de données — même code que le serveur utilise).
 */
import {
  generateAvailableSlots,
  isoDate,
  minutesToHHmm,
  overlaps,
  parseHHmm,
  WEEKDAY_LABELS,
} from "../src/lib/availability";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail === undefined ? "" : detail);
  }
}

function at(y: number, m: number, d: number, minutes = 0): number {
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime() + minutes * 60_000;
}

console.log("§8 Rendez-vous — logique des créneaux disponibles\n");

// --- Conversions horaires ---
check("minutesToHHmm(540) = 09:00", minutesToHHmm(540) === "09:00");
check("minutesToHHmm(0) = 00:00", minutesToHHmm(0) === "00:00");
check("parseHHmm('09:30') = 570", parseHHmm("09:30") === 570);
check("aller-retour 15:45", parseHHmm(minutesToHHmm(945)) === 945);
check("bornes horaires", minutesToHHmm(-5) === "00:00" && minutesToHHmm(2000) === "00:00");
check("overlaps détecte le recouvrement", overlaps(0, 60, 30, 90));
check("overlaps ignore la simple proximité", !overlaps(0, 60, 60, 120));

// --- 1) Génération simple : lundi 6 janvier 2025 (weekday 1) ---
const monday = "2025-01-06";
check("6 janvier 2025 = lundi", WEEKDAY_LABELS[new Date(2025, 0, 6).getDay()] === "Lundi");

const slots = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60, slotMinutes: 60 }],
  booked: [],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check("3 créneaux de 1 h (9h, 10h, 11h)", slots.length === 3, slots.length);
check("premier créneau à 9h", slots[0]?.start === at(2025, 1, 6, 9 * 60));
check("dernier créneau finit à 12h", slots[2]?.end === at(2025, 1, 6, 12 * 60));

// --- 2) Temps de déplacement entre deux rendez-vous ---
const withTravel = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 8 * 60, endMin: 13 * 60, slotMinutes: 60, travelMinutes: 30 }],
  booked: [{ slotStart: at(2025, 1, 6, 10 * 60), slotEnd: at(2025, 1, 6, 11 * 60) }],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
const hours = withTravel.map((s) => new Date(s.start).getHours());
check("créneaux 9h et 11h bloqués par le déplacement", !hours.includes(9) && !hours.includes(11), hours);
check("créneaux 8h et 12h libres", hours.includes(8) && hours.includes(12), hours);

// --- 3) Capacité quotidienne ---
const capacityOk = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 8 * 60, endMin: 12 * 60, slotMinutes: 60, capacityPerDay: 3 }],
  booked: [
    { slotStart: at(2025, 1, 6, 8 * 60), slotEnd: at(2025, 1, 6, 9 * 60) },
    { slotStart: at(2025, 1, 6, 9 * 60), slotEnd: at(2025, 1, 6, 10 * 60) },
  ],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check("capacité 3/jour avec 2 rendez-vous : un créneau restant", capacityOk.length === 1, capacityOk.length);

const noCapacity = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 8 * 60, endMin: 12 * 60, slotMinutes: 60 }],
  booked: [{ slotStart: at(2025, 1, 6, 8 * 60), slotEnd: at(2025, 1, 6, 9 * 60) }],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check(
  "capacité non définie : plage ouverte malgré un rendez-vous (2 créneaux après le buffer de déplacement)",
  noCapacity.length === 2,
  noCapacity.length,
);

const capacityFull = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 8 * 60, endMin: 12 * 60, slotMinutes: 60, capacityPerDay: 1 }],
  booked: [{ slotStart: at(2025, 1, 6, 9 * 60), slotEnd: at(2025, 1, 6, 10 * 60) }],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check("capacité 1/jour : journée complète → aucun créneau", capacityFull.length === 0, capacityFull.length);

// --- 4) Jour non travaillé ---
const wrongDay = generateAvailableSlots({
  rules: [{ weekday: 0, startMin: 9 * 60, endMin: 12 * 60 }],
  booked: [],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check("dimanche programmed, lundi demandé → 0 créneau", wrongDay.length === 0);

// --- 5) Passés exclus (délai minimum) ---
const pastSlots = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 8 * 60, endMin: 12 * 60, slotMinutes: 60 }],
  booked: [],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 6, 9 * 30),
});
check("créneaux du matin passés exclus (délai 60 min)", pastSlots.every((s) => s.start >= at(2025, 1, 6, 10 * 30)), pastSlots.length);

// --- 6) Périodes d'effet ---
const windowed = generateAvailableSlots({
  rules: [
    {
      weekday: 1,
      startMin: 9 * 60,
      endMin: 10 * 60,
      effectiveFrom: "2025-01-13",
    },
  ],
  booked: [],
  dateFrom: monday,
  dateTo: "2025-01-20",
  now: at(2025, 1, 1),
});
check("effectiveFrom ignore la semaine du 6", windowed.every((s) => s.start >= at(2025, 1, 13)));

const expired = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 9 * 60, endMin: 10 * 60, effectiveUntil: "2025-01-01" }],
  booked: [],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check("effectiveUntil échu → aucun créneau", expired.length === 0);

// --- 7) Créneaux de 30 minutes ---
const halfHour = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 9 * 60, endMin: 10 * 60, slotMinutes: 30 }],
  booked: [],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check("créneaux de 30 min → 2 créneaux", halfHour.length === 2, halfHour.length);

// --- 8) Robustesse ---
check(
  "règle incohérente ignorée (fin <= début)",
  generateAvailableSlots({
    rules: [{ weekday: 1, startMin: 12 * 60, endMin: 9 * 60 }],
    booked: [],
    dateFrom: monday,
    dateTo: monday,
    now: at(2025, 1, 1),
  }).length === 0,
);
check(
  "intervalle inversé → aucun jour",
  generateAvailableSlots({
    rules: [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60 }],
    booked: [],
    dateFrom: monday,
    dateTo: "2025-01-01",
    now: at(2025, 1, 1),
  }).length === 0,
);
check("aucune règle → aucun créneau", generateAvailableSlots({ rules: [], booked: [], dateFrom: monday, dateTo: monday }).length === 0);
check("isoDate format", isoDate(at(2025, 1, 6, 12)) === "2025-01-06");

// --- 9) Pas de double réservation sur le même créneau ---
const double = generateAvailableSlots({
  rules: [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60, slotMinutes: 60, travelMinutes: 0 }],
  booked: [
    { slotStart: at(2025, 1, 6, 9 * 60), slotEnd: at(2025, 1, 6, 10 * 60) },
    { slotStart: at(2025, 1, 6, 10 * 60), slotEnd: at(2025, 1, 6, 11 * 60) },
  ],
  dateFrom: monday,
  dateTo: monday,
  now: at(2025, 1, 1),
});
check("deux rendez-vous consécutifs → 1 créneau restant (11h)", double.length === 1 && new Date(double[0].start).getHours() === 11, double.length);

console.log(`\n${passed} test(s) réussi(s), ${failed} échec(s)`);
if (failed > 0) process.exit(1);