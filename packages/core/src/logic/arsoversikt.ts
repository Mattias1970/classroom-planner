/**
 * Årsöversiktslogik (kravspec del 1: FR-YR-001…008) — ren kärna.
 * Extraherar nyckeldatum (repetition/övaförmågor/diagnos/kapiteltest/prov)
 * ur placerade lektioner, jämför baslinje mot aktuell placering och
 * räknar kapitelresurser. Inga DOM-/nätverksberoenden.
 */
import type { LessonRecord } from '../records/lesson-record.js';
import type { PlacedLesson } from '../records/schedule-overrides.js';

/** Ett nyckeldatum i årsöversikten. */
export interface KeyDate {
  globalIdx: number;
  kapitel: number;
  avsnitt: string;
  /** 'repetition' | 'review' | 'ovaformagor' | 'test' (diagnos/kapiteltest) | 'exam' (prov) */
  type: LessonRecord['type'];
  date: string | null; // ISO, null = inställd/ej schemalagd
  week: number | null;
}

const KEY_TYPES: ReadonlyArray<LessonRecord['type']> = ['repetition', 'review', 'ovaformagor', 'test', 'exam'];

/** FR-YR-004/008: plockar ut nyckeldatum ur en placeringssekvens, i kronologisk ordning. */
export function extractKeyDates(placed: ReadonlyArray<PlacedLesson<LessonRecord>>): KeyDate[] {
  return placed
    .filter((p) => KEY_TYPES.includes(p.lesson.type))
    .map((p) => ({
      globalIdx: p.globalIdx,
      kapitel: p.kapitel,
      avsnitt: p.lesson.avsnitt,
      type: p.lesson.type,
      date: p.slot?.date ?? null,
      week: p.slot?.week ?? null,
    }));
}

/** En upptäckt datumförändring (FR-YR-005/006/007). */
export interface KeyDateChange {
  globalIdx: number;
  kapitel: number;
  avsnitt: string;
  type: LessonRecord['type'];
  from: { date: string; week: number } | null;
  to: { date: string; week: number } | null;
  /** Positiv = senare, negativ = tidigare. null om inställd eller osäker. */
  deltaWeeks: number | null;
  cancelled: boolean;
}

/**
 * FR-YR-005/007: jämför baslinjens nyckeldatum (utan överstyrningar) med aktuella.
 * En förändring rapporteras när veckan skiljer sig eller lektionen är inställd.
 */
export function diffKeyDates(baseline: KeyDate[], current: KeyDate[]): KeyDateChange[] {
  const byIdx = new Map(current.map((k) => [k.globalIdx, k]));
  const out: KeyDateChange[] = [];
  for (const b of baseline) {
    const c = byIdx.get(b.globalIdx);
    if (!c) continue;
    const cancelled = c.date === null && b.date !== null;
    const weekChanged = b.week !== null && c.week !== null && b.week !== c.week;
    if (!cancelled && !weekChanged) continue;
    out.push({
      globalIdx: b.globalIdx,
      kapitel: b.kapitel,
      avsnitt: b.avsnitt,
      type: b.type,
      from: b.date !== null && b.week !== null ? { date: b.date, week: b.week } : null,
      to: c.date !== null && c.week !== null ? { date: c.date, week: c.week } : null,
      deltaWeeks: cancelled || b.week === null || c.week === null ? null : c.week - b.week,
      cancelled,
    });
  }
  return out;
}

/** FR-YR-007: endast bedömningar (diagnos/kapiteltest/prov) motiverar varningsbanner. */
export function examWarnings(changes: KeyDateChange[]): KeyDateChange[] {
  return changes.filter((c) => c.type === 'test' || c.type === 'exam');
}

/** FR-YR-003: räknar begrepp för ett kapitel ur per-delkapitel-strukturen ('1.1' → kap 1). */
export function countBegreppForKap(perDelkapitel: Record<string, string[]>, kapitel: number): number {
  const seen = new Set<string>();
  for (const [key, list] of Object.entries(perDelkapitel)) {
    if (key.split('.')[0] === String(kapitel)) for (const b of list) seen.add(b);
  }
  return seen.size;
}

/** FR-YR-001: '6,25' för 25 lektioner à 4 pass/vecka — svensk decimalnotation. */
export function weeksLabel(lessonCount: number, passesPerWeek: number): string {
  if (passesPerWeek <= 0) return '—';
  const v = lessonCount / passesPerWeek;
  return (Math.round(v * 100) / 100).toLocaleString('sv-SE');
}

/** Svensk kort datumetikett: '2026-08-28' → '28 aug'. */
export function svDateLabel(dateIso: string): string {
  const [, m, d] = dateIso.split('-').map(Number);
  const M = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${d} ${M[m - 1] ?? '?'}`;
}
