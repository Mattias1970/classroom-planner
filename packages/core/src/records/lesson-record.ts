/**
 * LessonRecord — det enhetliga lektionsformatet (sprint 23/24-om).
 * Speglar EXAKT fältuppsättningen i classroom-planner-data:
 * kapitel/<N>/lektioner/<id>.json och <id>.flip.json.
 */
import type { BamRow, FlipBlock, FlipSettings, QuizRef } from '../domain/index.js';

export type LessonType = 'regular' | 'test' | 'repetition' | 'review' | 'ovaformagor' | 'exam';
export const LESSON_TYPES: LessonType[] = ['regular', 'test', 'repetition', 'review', 'ovaformagor', 'exam'];

/** Kärnfilen <id>.json — alla fält obligatoriska, "—" för ej tillämpligt. */
export interface LessonRecord {
  id: number;
  type: LessonType;
  avsnitt: string;
  del: number;
  grön: string;
  blå: string;
  röd: string;
  sidor_teori: string;
  begrepp: string;
  soc_start: string;
  exit: string;
  genomgang: string;
  bam_gora: string;
  bam_lara: string;
  bam_ex: string;
  ex: string;
  laxa: string;
}

/** <id>.flip.json — valfri per lektion. */
export interface FlipDoc {
  settings: FlipSettings;
  blocks: FlipBlock[];
  bamTimeline: BamRow[];
  socrativeStart?: QuizRef;
  exitTicket?: QuizRef;
  concepts: string[];
}

export interface ClassMeta {
  id: string; namn: string; läsår: string; socrative: string; arkiverad: boolean;
}
export interface SchedulePass { day: number; start: string; end: string; }
/** [år, månad(0-index), dag] — exakt som JavaScripts Date-konstruktor. */
export type YmdTuple = [number, number, number];
export interface LovPeriod { start: YmdTuple; end: YmdTuple; label: string; }
export interface KapitelMeta {
  name: string; col: string; lektioner: number; veckor: string;
  term: string; sidor_samm: string; prov: string;
}

/** book.json — en boks metadata (books/<bookId>/book.json). */
export interface BookFile {
  id: string;
  titel: string;
  förlag: string;
  ämne: string;
  årskurs: number;
  kapitelMeta: Record<string, KapitelMeta>;
}

/** subject.json — en planering. Med bookId läses innehållet ur books/<bookId>/. */
export interface SubjectFile {
  bookId?: string;
  meta: { ämne: string; årskurs: number; lärobok: string; klasser: ClassMeta[] };
  schema: Record<string, SchedulePass[]>;
  läsår: { startdatum: YmdTuple; lov: LovPeriod[] };
  kapitelMeta: Record<string, KapitelMeta>;
}

/** overrides.json — lärarens fältändringar. */
export interface FieldOverride {
  kapitel: number; lektionId: number; field: keyof LessonRecord; value: string; updatedAt: string;
}

export interface SubjectLibrary {
  slug: string;
  book?: BookFile;
  subject: SubjectFile;
  kapitel: Map<number, { lektioner: LessonRecord[]; flip: Map<number, FlipDoc> }>;
  begrepp: { perDelkapitel: Record<string, string[]>; definitioner: Record<string, string> };
  overrides: FieldOverride[];
}

export class LessonRecordError extends Error {}

export function validateLessonRecord(raw: unknown, filename: string): LessonRecord {
  const r = raw as Partial<LessonRecord>;
  const required: (keyof LessonRecord)[] = ['id','type','avsnitt','del','grön','blå','röd','sidor_teori','begrepp','soc_start','exit','genomgang','bam_gora','bam_lara','bam_ex','ex','laxa'];
  for (const k of required) {
    if (r[k] === undefined) throw new LessonRecordError(`${filename}: fältet "${k}" saknas.`);
  }
  if (!Number.isInteger(r.id)) throw new LessonRecordError(`${filename}: id måste vara ett heltal.`);
  const expected = parseInt(filename.replace(/\.json$/, ''), 10);
  if (Number.isFinite(expected) && r.id !== expected) {
    throw new LessonRecordError(`${filename}: id (${r.id}) matchar inte filnamnet (${expected}).`);
  }
  if (!LESSON_TYPES.includes(r.type as LessonType)) {
    throw new LessonRecordError(`${filename}: ogiltig type "${String(r.type)}".`);
  }
  return r as LessonRecord;
}

export function validateFlipDoc(raw: unknown, filename: string): FlipDoc {
  const f = raw as Partial<FlipDoc>;
  if (!f.settings || !Array.isArray(f.blocks)) {
    throw new LessonRecordError(`${filename}: settings och blocks krävs.`);
  }
  for (const b of f.blocks) {
    if (b.typ === 'text') { if (typeof b.text !== 'string') throw new LessonRecordError(`${filename}: text-block saknar text.`); }
    else if (b.typ === 'film' || b.typ === 'quiz') {
      if (!b.ref?.titel || !b.ref?.url) throw new LessonRecordError(`${filename}: ${b.typ}-block kräver ref.titel och ref.url.`);
    } else throw new LessonRecordError(`${filename}: ogiltig blocktyp.`);
  }
  for (const key of ['socrativeStart', 'exitTicket'] as const) {
    const q = f[key];
    if (q !== undefined && (!q.url || q.url.trim() === '')) {
      throw new LessonRecordError(`${filename}: ${key}.url är obligatorisk när ${key} finns — utelämna objektet helt annars.`);
    }
  }
  for (const row of f.bamTimeline ?? []) {
    if (!Number.isInteger(row.minutes) || row.minutes <= 0) {
      throw new LessonRecordError(`${filename}: bamTimeline.minutes måste vara positiva heltal.`);
    }
  }
  return { bamTimeline: [], concepts: [], ...f } as FlipDoc;
}

/** Applicerar overrides på en lektionspost (senaste per fält vinner). */
export function applyOverrides(kapitel: number, record: LessonRecord, overrides: FieldOverride[]): LessonRecord {
  const mine = overrides
    .filter((o) => o.kapitel === kapitel && o.lektionId === record.id)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  if (mine.length === 0) return record;
  const out: LessonRecord = { ...record };
  for (const o of mine) (out as unknown as Record<string, unknown>)[o.field] = o.value;
  return out;
}
