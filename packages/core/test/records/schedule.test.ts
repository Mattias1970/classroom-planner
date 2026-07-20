import { describe, expect, it } from 'vitest';
import { generateSlots, isoWeek, swedishPublicHolidays } from '../../src/records/schedule.js';
import type { SubjectFile } from '../../src/records/lesson-record.js';

const SUBJECT: SubjectFile = {
  meta: { ämne: 'Matematik', årskurs: 8, lärobok: 'Prio 8', klasser: [
    { id: '8B', namn: '8B', läsår: '2026/27', socrative: 'Matte8B', arkiverad: false },
  ]},
  schema: { '8B': [
    { day: 1, start: '09:00', end: '10:00' },
    { day: 3, start: '12:30', end: '13:25' },
  ]},
  läsår: {
    startdatum: [2026, 7, 17], // 17 aug 2026 (månad 0-indexerad)
    lov: [{ start: [2026, 9, 26], end: [2026, 9, 30], label: 'Höstlov' }],
  },
  kapitelMeta: { '1': { name: 'Tal', col: 'c1', lektioner: 25, veckor: '6', term: 'HT', sidor_samm: '54', prov: 'Prov' } },
};

describe('swedishPublicHolidays', () => {
  it('innehåller julafton, långfredag och Kristi himmelsfärd 2027', () => {
    const h = swedishPublicHolidays(2027);
    expect(h.has('2027-12-24')).toBe(true);
    expect(h.has('2027-03-26')).toBe(true); // långfredag 2027
    expect(h.has('2027-05-06')).toBe(true); // Kristi himmelsfärd 2027
  });
});

describe('generateSlots', () => {
  it('startar på första schemadagen fr.o.m. läsårsstart', () => {
    const slots = generateSlots(SUBJECT, '8B', 4);
    // 17 aug 2026 är en måndag → första passet samma dag
    expect(slots[0]).toMatchObject({ date: '2026-08-17', weekday: 1, start: '09:00' });
    expect(slots[1]).toMatchObject({ date: '2026-08-19', weekday: 3 });
    expect(slots[2].date).toBe('2026-08-24');
  });

  it('hoppar över höstlovet', () => {
    const slots = generateSlots(SUBJECT, '8B', 40);
    const dates = slots.map((s) => s.date);
    expect(dates).not.toContain('2026-10-26'); // måndag i lovet
    expect(dates).not.toContain('2026-10-28'); // onsdag i lovet
    expect(dates).toContain('2026-11-02');     // måndag efter lovet
  });

  it('okänd klass ger tom lista', () => {
    expect(generateSlots(SUBJECT, '9X', 5)).toEqual([]);
  });

  it('isoWeek beräknar vecka korrekt', () => {
    expect(isoWeek(new Date(Date.UTC(2026, 7, 17)))).toBe(34);
  });
});
