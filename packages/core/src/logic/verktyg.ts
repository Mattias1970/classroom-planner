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
