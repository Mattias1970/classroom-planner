import { describe, expect, it } from 'vitest';
import {
  countBegreppForKap, diffKeyDates, examWarnings, extractKeyDates,
  generateSlots, placeLessons, svDateLabel, weeksLabel,
  type LessonRecord, type SubjectFile,
} from '../src/index.js';

function lesson(id: number, type: LessonRecord['type'], avsnitt: string): LessonRecord {
  return {
    id, type, avsnitt, del: 0,
    grön: '—', blå: '—', röd: '—', sidor_teori: '—', begrepp: '—',
    soc_start: '—', exit: '—', genomgang: '', bam_gora: '', bam_lara: '',
    bam_ex: '', ex: '', laxa: '—',
  };
}

const SUBJECT: SubjectFile = {
  meta: {
    ämne: 'Matematik', årskurs: 8, lärobok: 'Prio 8',
    klasser: [{ id: '8B', namn: '8B', läsår: '2026/27', socrative: 'Matte8B', arkiverad: false }],
  },
  schema: { '8B': [{ day: 1, start: '09:00', end: '10:00' }, { day: 3, start: '09:00', end: '10:00' }] },
  läsår: {
    startdatum: [2026, 7, 17],
    lov: [{ start: [2026, 9, 26], end: [2026, 9, 30], label: 'Höstlov' }],
  },
  kapitelMeta: { '1': { name: 'Tal', col: 'c1', lektioner: 4, veckor: '1', term: 'HT', sidor_samm: '—', prov: 'Prov i Tal' } },
};

const SEQ = [
  { kapitel: 1, lesson: lesson(1, 'regular', '1.1 Negativa tal') },
  { kapitel: 1, lesson: lesson(2, 'repetition', 'Repetition 1.1–1.3') },
  { kapitel: 1, lesson: lesson(3, 'test', 'Diagnos 1.1–1.3') },
  { kapitel: 1, lesson: lesson(4, 'exam', 'Prov i Tal') },
];

describe('extractKeyDates (FR-YR-004/008)', () => {
  it('plockar repetition, diagnos och prov men inte ordinarie lektioner', () => {
    const slots = generateSlots(SUBJECT, '8B', 10);
    const keys = extractKeyDates(placeLessons(SEQ, slots));
    expect(keys.map((k) => k.type)).toEqual(['repetition', 'test', 'exam']);
    expect(keys.every((k) => k.date !== null && k.week !== null)).toBe(true);
  });
});

describe('diffKeyDates (FR-YR-005/006)', () => {
  const slots = generateSlots(SUBJECT, '8B', 10);
  const baseline = extractKeyDates(placeLessons(SEQ, slots));

  it('rapporterar ingen förändring när placeringen är orörd', () => {
    expect(diffKeyDates(baseline, baseline)).toEqual([]);
  });

  it('rapporterar veckoförflyttning med korrekt delta', () => {
    // Ställ in lektion 1 som "shifted" → allt efter förskjuts ett pass
    const current = extractKeyDates(placeLessons(SEQ, slots, { 0: { type: 'shifted', reason: 'x' } }));
    const changes = diffKeyDates(baseline, current);
    const prov = changes.find((c) => c.type === 'exam');
    expect(prov).toBeDefined();
    expect(prov!.from!.week).toBeLessThan(prov!.to!.week);
    expect(prov!.deltaWeeks).toBe(prov!.to!.week - prov!.from!.week);
    expect(prov!.cancelled).toBe(false);
  });

  it('rapporterar inställt prov som cancelled utan delta', () => {
    const current = extractKeyDates(placeLessons(SEQ, slots, { 3: { type: 'cancelled', reason: 'x' } }));
    const [c] = diffKeyDates(baseline, current);
    expect(c.type).toBe('exam');
    expect(c.cancelled).toBe(true);
    expect(c.to).toBeNull();
    expect(c.deltaWeeks).toBeNull();
  });
});

describe('examWarnings (FR-YR-007)', () => {
  it('varnar bara för diagnos/kapiteltest/prov, inte repetition', () => {
    const slots = generateSlots(SUBJECT, '8B', 10);
    const baseline = extractKeyDates(placeLessons(SEQ, slots));
    const current = extractKeyDates(placeLessons(SEQ, slots, { 0: { type: 'shifted', reason: 'x' } }));
    const all = diffKeyDates(baseline, current);
    const warn = examWarnings(all);
    expect(warn.every((w) => w.type === 'test' || w.type === 'exam')).toBe(true);
    expect(warn.length).toBeLessThanOrEqual(all.length);
  });
});

describe('countBegreppForKap (FR-YR-003)', () => {
  it('räknar unika begrepp per kapitel via delkapitelnyckeln', () => {
    const per = { '1.1': ['a', 'b'], '1.2': ['b', 'c'], '2.1': ['d'] };
    expect(countBegreppForKap(per, 1)).toBe(3);
    expect(countBegreppForKap(per, 2)).toBe(1);
    expect(countBegreppForKap(per, 3)).toBe(0);
  });
});

describe('weeksLabel (FR-YR-001)', () => {
  it('ger svensk decimalnotation: 25 lektioner / 4 pass = 6,25', () => {
    expect(weeksLabel(25, 4)).toBe('6,25');
    expect(weeksLabel(27, 4)).toBe('6,75');
    expect(weeksLabel(8, 4)).toBe('2');
    expect(weeksLabel(5, 0)).toBe('—');
  });
});

describe('svDateLabel', () => {
  it('formaterar ISO-datum till svensk kort form', () => {
    expect(svDateLabel('2026-08-28')).toBe('28 aug');
    expect(svDateLabel('2027-05-17')).toBe('17 maj');
  });
});

describe('lovmedveten placering av nyckeldatum (FR-YR-009)', () => {
  it('schemalägger aldrig ett nyckeldatum inom lovintervall', () => {
    const slots = generateSlots(SUBJECT, '8B', 40);
    const keys = extractKeyDates(placeLessons(SEQ, slots));
    for (const k of keys) {
      expect(k.date! < '2026-10-26' || k.date! > '2026-10-30').toBe(true);
    }
  });
});
