/**
 * Verktyg + strukturell lektionshantering (kravspec del 4) — ren kärna.
 * FR-TOOL-004: URL-normalisering. FR-STR-005: skift av globalIdx-nycklade
 * överstyrningar vid strukturell insättning. FR-BEG-001: begreppstabell
 * som härleder första introduktionslektion per begrepp.
 */
import type { LessonRecord } from '../records/lesson-record.js';
import type { OverrideMap } from '../records/schedule-overrides.js';

/** FR-TOOL-004: "example.com" → "https://example.com"; befintligt protokoll bevaras. */
export function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (t === '') return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/**
 * FR-STR-005: efter insättning av en lektion på global position `insertedAt`
 * flyttas alla överstyrningar med index >= insertedAt ett steg (delta) så att
 * de fortsätter peka på rätt lektion. Immutabel.
 */
export function shiftOverrideMap(map: OverrideMap, insertedAt: number, delta: number): OverrideMap {
  const out: OverrideMap = {};
  for (const [k, v] of Object.entries(map)) {
    const idx = Number(k);
    out[idx >= insertedAt ? idx + delta : idx] = v;
  }
  return out;
}

/** FR-BEG-001: en rad per introducerat begrepp — första lektionen vinner. */
export interface BegreppRow {
  lektionNr: number;   // 1-baserat inom kapitlet
  begrepp: string;
  avsnitt: string;
  forklaring: string;
}

export function buildBegreppTabell(
  lessons: ReadonlyArray<LessonRecord>,
  definitioner: Record<string, string>,
): BegreppRow[] {
  const seen = new Set<string>();
  const rows: BegreppRow[] = [];
  lessons.forEach((l, i) => {
    if (!l.begrepp || l.begrepp === '—') return;
    for (const raw of l.begrepp.split(',')) {
      const b = raw.trim();
      if (b === '' || seen.has(b.toLowerCase())) continue;
      seen.add(b.toLowerCase());
      rows.push({
        lektionNr: i + 1,
        begrepp: b,
        avsnitt: l.avsnitt,
        forklaring: definitioner[b] ?? definitioner[b.toLowerCase()] ?? '—',
      });
    }
  });
  return rows;
}

/**
 * Begrepp för en lektion: lektionens eget fält om ifyllt; annars, för den
 * introducerande lektionen (del 1 eller odelad ordinarie lektion), hämtas
 * delkapitlets begrepp ur per-delkapitel-strukturen via avsnittsrubriken
 * ("1.4 Potenser" → nyckel "1.4"). Dedupe skiftlägesokänsligt, ordning bevaras.
 */
export function resolveBegrepp(
  rawBegrepp: string,
  avsnitt: string,
  del: number,
  perDelkapitel: Record<string, string[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (b: string) => {
    const t = b.trim();
    if (t === '' || t === '—' || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(t);
  };
  if (rawBegrepp && rawBegrepp !== '—') {
    for (const b of rawBegrepp.split(',')) push(b);
    return out;
  }
  if (del === 2) return out; // introduceras lektion 1 — repeteras via läxan
  const m = avsnitt.match(/^([1-9])\.(\d{1,2})\b/);
  if (!m) return out;
  for (const b of perDelkapitel[`${m[1]}.${m[2]}`] ?? []) push(b);
  return out;
}
