import { describe, expect, it } from 'vitest';
import {
  applySchemaEdits, distinctEditedFields, isValidPass, parseWeekday, summarizeEdits,
  type FieldOverride, type SubjectFile,
} from '../src/index.js';

describe('parseWeekday (FR-SCH-003)', () => {
  it('mappar svenska veckodagsnamn till 1–5', () => {
    expect(parseWeekday('Måndag')).toBe(1);
    expect(parseWeekday('mandag')).toBe(1);
    expect(parseWeekday('tisdag')).toBe(2);
    expect(parseWeekday('ons')).toBe(3);
    expect(parseWeekday('TORSDAG')).toBe(4);
    expect(parseWeekday(' fredag ')).toBe(5);
  });
  it('mappar engelska veckodagsnamn', () => {
    expect(parseWeekday('Monday')).toBe(1);
    expect(parseWeekday('tue')).toBe(2);
    expect(parseWeekday('Wednesday')).toBe(3);
    expect(parseWeekday('thu')).toBe(4);
    expect(parseWeekday('Friday')).toBe(5);
  });
  it('ger null för ogiltigt värde — anroparen behåller tidigare dag', () => {
    expect(parseWeekday('lördag')).toBeNull();
    expect(parseWeekday('söndag')).toBeNull();
    expect(parseWeekday('xyz')).toBeNull();
    expect(parseWeekday('')).toBeNull();
  });
});

const SUBJECT: SubjectFile = {
  meta: { ämne: 'Ma', årskurs: 8, lärobok: 'Prio', klasser: [] },
  schema: { '8B': [{ day: 1, start: '09:00', end: '10:00' }] },
  läsår: { startdatum: [2026, 7, 17], lov: [] },
  kapitelMeta: {},
};

describe('applySchemaEdits (FR-SCH-002/004/005)', () => {
  it('byter startdatum utan att mutera källan', () => {
    const out = applySchemaEdits(SUBJECT, { startdatum: [2026, 7, 24] });
    expect(out.läsår.startdatum).toEqual([2026, 7, 24]);
    expect(SUBJECT.läsår.startdatum).toEqual([2026, 7, 17]);
  });
  it('ersätter klassens schema och lämnar övriga klasser orörda', () => {
    const src = { ...SUBJECT, schema: { ...SUBJECT.schema, '8F': [{ day: 2, start: '08:00', end: '08:50' }] } };
    const out = applySchemaEdits(src, { schema: { '8B': [{ day: 5, start: '13:00', end: '14:00' }] } });
    expect(out.schema['8B'][0].day).toBe(5);
    expect(out.schema['8F'][0].day).toBe(2);
    expect(src.schema['8B'][0].day).toBe(1);
  });
  it('returnerar samma objekt när inga ändringar finns', () => {
    expect(applySchemaEdits(SUBJECT, {})).toBe(SUBJECT);
  });
});

describe('isValidPass', () => {
  it('kräver dag 1–5 och start < slut', () => {
    expect(isValidPass({ day: 1, start: '09:00', end: '10:00' })).toBe(true);
    expect(isValidPass({ day: 6, start: '09:00', end: '10:00' })).toBe(false);
    expect(isValidPass({ day: 3, start: '10:00', end: '09:00' })).toBe(false);
    expect(isValidPass({ day: 3, start: '9:00', end: '10:00' })).toBe(false);
  });
});

function ov(kapitel: number, lektionId: number, field: string, value: string, at: string): FieldOverride {
  return { kapitel, lektionId, field: field as FieldOverride['field'], value, updatedAt: at };
}

describe('distinctEditedFields + summarizeEdits (FR-EDIT-007/008)', () => {
  const edits = [
    ov(1, 1, 'genomgang', 'gammal', '2026-08-01T10:00:00Z'),
    ov(1, 1, 'genomgang', 'ny', '2026-08-02T10:00:00Z'),
    ov(1, 2, 'laxa', 'x', '2026-08-01T11:00:00Z'),
    ov(2, 5, 'bam_gora', 'y', '2026-08-01T12:00:00Z'),
  ];
  it('räknar unika fält, inte antal ändringar', () => {
    expect(distinctEditedFields(edits)).toBe(3);
    expect(distinctEditedFields([])).toBe(0);
  });
  it('sammanfattar med senaste värdet per fält, sorterat', () => {
    const rows = summarizeEdits(edits);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kapitel: 1, lektionId: 1, field: 'genomgang', value: 'ny' });
    expect(rows[2]).toMatchObject({ kapitel: 2, lektionId: 5, field: 'bam_gora' });
  });
});
