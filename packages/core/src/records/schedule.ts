/**
 * Schemamotor (sprint 13/14-om): beräknar lektionsdatum per klass från
 * subject.json — lektionspass, läsårsstart, lov och svenska röda dagar.
 */
import type { LovPeriod, SchedulePass, SubjectFile, YmdTuple } from './lesson-record.js';

function ymd(t: YmdTuple): Date { return new Date(Date.UTC(t[0], t[1], t[2])); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function easterSunday(year: number): Date {
  // Anonym Gregoriansk algoritm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

/** Svenska röda dagar som kan infalla mån–fre under läsåret. */
export function swedishPublicHolidays(year: number): Set<string> {
  const out = new Set<string>();
  const fixed: Array<[number, number]> = [[0, 1], [0, 6], [4, 1], [5, 6], [11, 24], [11, 25], [11, 26], [11, 31]];
  for (const [m, d] of fixed) out.add(iso(new Date(Date.UTC(year, m, d))));
  const easter = easterSunday(year);
  out.add(iso(addDays(easter, -2))); // Långfredag
  out.add(iso(addDays(easter, 1)));  // Annandag påsk
  out.add(iso(addDays(easter, 39))); // Kristi himmelsfärd
  // Midsommarafton: fredag 19–25 juni
  const jun19 = new Date(Date.UTC(year, 5, 19));
  out.add(iso(addDays(jun19, (5 - jun19.getUTCDay() + 7) % 7)));
  return out;
}

function inLov(dateIso: string, lov: LovPeriod[]): string | null {
  for (const p of lov) {
    if (dateIso >= iso(ymd(p.start)) && dateIso <= iso(ymd(p.end))) return p.label;
  }
  return null;
}

export interface ScheduledSlot {
  date: string;      // ISO
  week: number;      // ISO-vecka
  weekday: number;   // 1=mån … 5=fre
  start: string;
  end: string;
}

export function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Genererar de N första lektionstillfällena för en klass.
 * Hoppar över helger, lov och röda dagar.
 */
export function generateSlots(subject: SubjectFile, classId: string, count: number): ScheduledSlot[] {
  const passes = subject.schema[classId];
  if (!passes || passes.length === 0) return [];
  const byDay = new Map<number, SchedulePass>(passes.map((p) => [p.day, p]));
  const holidays = new Set<string>();
  const startYear = subject.läsår.startdatum[0];
  for (const y of [startYear, startYear + 1]) for (const h of swedishPublicHolidays(y)) holidays.add(h);

  const slots: ScheduledSlot[] = [];
  let d = ymd(subject.läsår.startdatum);
  let guard = 0;
  while (slots.length < count && guard++ < 800) {
    const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const pass = byDay.get(weekday);
    const dateIso = iso(d);
    if (pass && weekday <= 5 && !holidays.has(dateIso) && inLov(dateIso, subject.läsår.lov) === null) {
      slots.push({ date: dateIso, week: isoWeek(d), weekday, start: pass.start, end: pass.end });
    }
    d = addDays(d, 1);
  }
  return slots;
}

/** Parar ihop kapitlens lektioner (i ordning) med klassens slots. */
export function assignDates<T extends { id: number }>(
  lessonsInOrder: Array<{ kapitel: number; lesson: T }>,
  slots: ScheduledSlot[],
): Array<{ kapitel: number; lesson: T; slot: ScheduledSlot | null }> {
  return lessonsInOrder.map((l, i) => ({ ...l, slot: slots[i] ?? null }));
}
