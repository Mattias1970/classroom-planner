import { describe, expect, it } from 'vitest';
import {
  applyClassEdits, guessScreenSize, isMobileViewport, nextChapterOf,
  uniqueClassId, validateClassBackup,
  type SubjectFile,
} from '../src/index.js';

const SUBJECT: SubjectFile = {
  meta: {
    ämne: 'Ma', årskurs: 8, lärobok: 'Prio',
    klasser: [
      { id: '8B', namn: '8B', läsår: '2026/27', socrative: 'Matte8B', arkiverad: false },
      { id: '8F', namn: '8F', läsår: '2026/27', socrative: 'Matte8F', arkiverad: false },
    ],
  },
  schema: {
    '8B': [{ day: 1, start: '09:00', end: '10:00' }],
    '8F': [{ day: 2, start: '08:00', end: '08:50' }],
  },
  läsår: { startdatum: [2026, 7, 17], lov: [] },
  kapitelMeta: {},
};

describe('applyClassEdits (FR-CM-002…008)', () => {
  it('lägger till klass med eget schema utan att mutera källan', () => {
    const out = applyClassEdits(SUBJECT, {
      added: [{ klass: { id: '8A', namn: '8A', läsår: '2026/27', socrative: 'Matte8A', arkiverad: false }, schema: [{ day: 3, start: '10:00', end: '11:00' }] }],
    });
    expect(out.meta.klasser.map((c) => c.id)).toEqual(['8B', '8F', '8A']);
    expect(out.schema['8A'][0].day).toBe(3);
    expect(SUBJECT.meta.klasser).toHaveLength(2);
  });
  it('byter namn/läsår/socrative via renamed-patch', () => {
    const out = applyClassEdits(SUBJECT, { renamed: { '8F': { namn: '8F-ny', socrative: 'MatteNy' } } });
    const f = out.meta.klasser.find((c) => c.id === '8F')!;
    expect(f.namn).toBe('8F-ny');
    expect(f.socrative).toBe('MatteNy');
    expect(f.läsår).toBe('2026/27');
  });
  it('arkiverar och återaktiverar', () => {
    const arch = applyClassEdits(SUBJECT, { archived: { '8F': true } });
    expect(arch.meta.klasser.find((c) => c.id === '8F')!.arkiverad).toBe(true);
    const back = applyClassEdits(SUBJECT, { archived: { '8F': false } });
    expect(back.meta.klasser.find((c) => c.id === '8F')!.arkiverad).toBe(false);
  });
  it('vägrar arkivera sista aktiva klassen (FR-CM-005)', () => {
    const out = applyClassEdits(SUBJECT, { archived: { '8B': true, '8F': true } });
    expect(out.meta.klasser.some((c) => !c.arkiverad)).toBe(true);
  });
  it('raderar klass permanent inklusive schema (FR-CM-007)', () => {
    const out = applyClassEdits(SUBJECT, { deleted: ['8F'] });
    expect(out.meta.klasser.map((c) => c.id)).toEqual(['8B']);
    expect(out.schema['8F']).toBeUndefined();
  });
  it('returnerar samma objekt utan ändringar', () => {
    expect(applyClassEdits(SUBJECT, {})).toBe(SUBJECT);
  });
});

describe('uniqueClassId', () => {
  it('behåller ledigt id och räknar upp vid krock', () => {
    expect(uniqueClassId('8A', ['8B', '8F'])).toBe('8A');
    expect(uniqueClassId('8B', ['8B', '8F'])).toBe('8B-2');
    expect(uniqueClassId('8B', ['8B', '8B-2'])).toBe('8B-3');
  });
});

describe('validateClassBackup (FR-CM-010)', () => {
  it('godkänner giltig fil', () => {
    const ok = validateClassBackup({ klasser: SUBJECT.meta.klasser, schema: SUBJECT.schema });
    expect(ok.klasser).toHaveLength(2);
  });
  it('avvisar fil utan klasser eller schema', () => {
    expect(() => validateClassBackup({ schema: {} })).toThrow(/saknar klasser/);
    expect(() => validateClassBackup({ klasser: SUBJECT.meta.klasser })).toThrow(/saknar schema/);
    expect(() => validateClassBackup({ klasser: [{ namn: 'x' }], schema: {} })).toThrow(/id och namn/);
  });
});

describe('isMobileViewport (FR-MOB-001/010)', () => {
  it('touch + smal skärm = mobil', () => {
    expect(isMobileViewport(390, 844, true)).toBe(true);
  });
  it('touch + kort liggande = mobil även över 768 px bredd', () => {
    expect(isMobileViewport(844, 390, true)).toBe(true);
  });
  it('utan touch aldrig mobil; bred touch-platta är inte mobil', () => {
    expect(isMobileViewport(390, 844, false)).toBe(false);
    expect(isMobileViewport(1024, 1366, true)).toBe(false);
  });
});

describe('guessScreenSize (FR-MOB-006)', () => {
  it('mappar fysisk bredd till profil enligt trösklar', () => {
    expect(guessScreenSize(720)).toBe('compact');
    expect(guessScreenSize(1560)).toBe('compact');
    expect(guessScreenSize(2340)).toBe('standard');
    expect(guessScreenSize(3120)).toBe('large');
  });
});

describe('nextChapterOf (FR-MOB-008/009)', () => {
  it('ger nästa kapitel och null efter sista', () => {
    expect(nextChapterOf([1, 2, 3, 4, 5], 1)).toBe(2);
    expect(nextChapterOf([1, 2, 3, 4, 5], 4)).toBe(5);
    expect(nextChapterOf([1, 2, 3, 4, 5], 5)).toBeNull();
    expect(nextChapterOf([1, 2], 7)).toBeNull();
  });
});
