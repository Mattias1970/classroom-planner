/**
 * Schemaredigering + redigeringsstatistik (kravspec del 3) — ren kärna.
 * FR-SCH-002…005: lokala schemaändringar (startdatum, veckodag, tider) som
 * appliceras ovanpå subject.json utan att mutera källan.
 * FR-EDIT-007/008: räknare och sammanfattning av inline-redigerade fält.
 */
import type { FieldOverride, SchedulePass, SubjectFile, YmdTuple } from '../records/lesson-record.js';

/** FR-SCH-003: mappar svenska/engelska veckodagsnamn (fritext) till 1=mån … 5=fre. */
export function parseWeekday(input: string): number | null {
  const t = input.trim().toLowerCase();
  if (t === '') return null;
  const table: Array<[RegExp, number]> = [
    [/^m[åa]n/, 1], [/^mon/, 1],
    [/^tis/, 2], [/^tue/, 2],
    [/^ons/, 3], [/^wed/, 3],
    [/^tor/, 4], [/^thu/, 4],
    [/^fre/, 5], [/^fri/, 5],
  ];
  for (const [re, day] of table) if (re.test(t)) return day;
  return null;
}

/** Lokala schemaändringar som lagras utanför datakällan. */
export interface SchemaEdits {
  /** Nytt startdatum för läsåret (FR-SCH-002). */
  startdatum?: YmdTuple;
  /** Ersättningsschema per klass (FR-SCH-003/004). */
  schema?: Record<string, SchedulePass[]>;
}

/** Applicerar schemaändringar immutabelt — källobjektet röres ej. */
export function applySchemaEdits(subject: SubjectFile, edits: SchemaEdits): SubjectFile {
  if (!edits.startdatum && !edits.schema) return subject;
  return {
    ...subject,
    läsår: edits.startdatum ? { ...subject.läsår, startdatum: edits.startdatum } : subject.läsår,
    schema: edits.schema ? { ...subject.schema, ...edits.schema } : subject.schema,
  };
}

/** Giltigt lektionspass: dag 1–5 och start < slut ("HH:MM"). */
export function isValidPass(p: SchedulePass): boolean {
  return p.day >= 1 && p.day <= 5 && /^\d{2}:\d{2}$/.test(p.start) && /^\d{2}:\d{2}$/.test(p.end) && p.start < p.end;
}

/** FR-EDIT-007: antal unika (kapitel, lektion, fält) med lokal redigering. */
export function distinctEditedFields(overrides: FieldOverride[]): number {
  return new Set(overrides.map((o) => `${o.kapitel}:${o.lektionId}:${String(o.field)}`)).size;
}

export interface EditSummaryRow { kapitel: number; lektionId: number; field: string; value: string; }

/** FR-EDIT-008: sammanfattning av lokala redigeringar — senaste värdet per fält. */
export function summarizeEdits(overrides: FieldOverride[]): EditSummaryRow[] {
  const latest = new Map<string, EditSummaryRow>();
  for (const o of [...overrides].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    latest.set(`${o.kapitel}:${o.lektionId}:${String(o.field)}`,
      { kapitel: o.kapitel, lektionId: o.lektionId, field: String(o.field), value: o.value });
  }
  return [...latest.values()].sort((a, b) =>
    a.kapitel - b.kapitel || a.lektionId - b.lektionId || a.field.localeCompare(b.field));
}
