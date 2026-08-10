/**
 * Klassregister-overlay + mobilheuristik (kravspec del 5) — ren kärna.
 * FR-CM-002…008: lokala klassoperationer (lägg till, byt namn, arkivera,
 * återaktivera, radera) som appliceras ovanpå subject.json utan mutation.
 * FR-MOB-001/006/009/010: mobilidentifiering, skärmstorleksgissning,
 * nästa-kapitel-logik.
 */
import type { KlassInfo, SchedulePass, SubjectFile } from '../records/lesson-record.js';

export interface AddedClass { klass: KlassInfo; schema: SchedulePass[]; }
export interface ClassEdits {
  added?: AddedClass[];
  /** Patchar per klass-id (FR-CM-003). */
  renamed?: Record<string, Partial<Pick<KlassInfo, 'namn' | 'läsår' | 'socrative'>>>;
  /** true = arkiverad, false = återaktiverad (FR-CM-005/006). */
  archived?: Record<string, boolean>;
  /** Permanent borttagna klass-id:n (FR-CM-007). */
  deleted?: string[];
}

/**
 * Applicerar klassoperationer immutabelt. Skyddsregel (FR-CM-005):
 * om resultatet skulle sakna aktiva klasser ignoreras arkiveringarna.
 */
export function applyClassEdits(subject: SubjectFile, edits: ClassEdits): SubjectFile {
  const { added = [], renamed = {}, archived = {}, deleted = [] } = edits;
  if (added.length === 0 && Object.keys(renamed).length === 0
    && Object.keys(archived).length === 0 && deleted.length === 0) return subject;

  const del = new Set(deleted);
  let klasser: KlassInfo[] = [
    ...subject.meta.klasser,
    ...added.map((a) => a.klass),
  ]
    .filter((c) => !del.has(c.id))
    .map((c) => ({ ...c, ...(renamed[c.id] ?? {}) }))
    .map((c) => (archived[c.id] === undefined ? c : { ...c, arkiverad: archived[c.id] }));

  if (!klasser.some((c) => !c.arkiverad)) { // minst en aktiv klass krävs
    klasser = klasser.map((c) => (archived[c.id] === true ? { ...c, arkiverad: subject.meta.klasser.find((x) => x.id === c.id)?.arkiverad ?? false } : c));
  }

  const schema: Record<string, SchedulePass[]> = { ...subject.schema };
  for (const a of added) schema[a.klass.id] = a.schema;
  for (const id of deleted) delete schema[id];

  return { ...subject, meta: { ...subject.meta, klasser }, schema };
}

/** Unikt klass-id ur önskat namn: '8A' → '8A', krockar → '8A-2', '8A-3' … */
export function uniqueClassId(wanted: string, existingIds: string[]): string {
  const base = wanted.trim().replace(/\s+/g, '-') || 'klass';
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Validerar en klassbackup-JSON (FR-CM-010). Kastar Error med svensk text vid fel. */
export function validateClassBackup(raw: unknown): { klasser: KlassInfo[]; schema: Record<string, SchedulePass[]> } {
  const b = raw as { klasser?: unknown; schema?: unknown };
  if (!Array.isArray(b.klasser) || b.klasser.length === 0) throw new Error('Filen saknar klasser.');
  for (const k of b.klasser as Array<Partial<KlassInfo>>) {
    if (!k.id || !k.namn) throw new Error('Ogiltig klass i filen: id och namn krävs.');
  }
  if (typeof b.schema !== 'object' || b.schema === null) throw new Error('Filen saknar schema.');
  return { klasser: b.klasser as KlassInfo[], schema: b.schema as Record<string, SchedulePass[]> };
}

// ── Mobil (FR-MOB-001/006/009/010) ────────────────────────────

/** Touch-enhet som är smal, eller kort liggande (<=500 px hög), räknas som mobil. */
export function isMobileViewport(width: number, height: number, hasTouch: boolean): boolean {
  if (!hasTouch) return false;
  return width <= 768 || height <= 500;
}

export type ScreenSize = 'compact' | 'standard' | 'large';

/** Grov gissning från fysisk pixelbredd: <1900 kompakt, <2800 standard, annars stor. */
export function guessScreenSize(physicalWidth: number): ScreenSize {
  if (physicalWidth < 1900) return 'compact';
  if (physicalWidth < 2800) return 'standard';
  return 'large';
}

/** Nästa kapitel i sorterad lista, eller null efter det sista (FR-MOB-009). */
export function nextChapterOf(chapters: number[], current: number): number | null {
  const sorted = [...chapters].sort((a, b) => a - b);
  const i = sorted.indexOf(current);
  if (i === -1 || i === sorted.length - 1) return null;
  return sorted[i + 1];
}
