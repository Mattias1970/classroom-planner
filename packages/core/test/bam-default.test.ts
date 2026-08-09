import { describe, expect, it } from 'vitest';
import { arbetsEtikett, defaultBamTimeline, diffMinutes } from '../src/logic/bam-default.js';
import type { LessonRecord } from '../src/records/lesson-record.js';

const L = (extra: Partial<LessonRecord>): LessonRecord => ({
  id: 1, type: 'regular', avsnitt: '1.1', del: 1, grön: '1–13', blå: '14–21', röd: '—',
  sidor_teori: '—', begrepp: '—', soc_start: '—', exit: 'Quiz 1.1a',
  genomgang: '', bam_gora: '', bam_lara: '', bam_ex: '', ex: '', laxa: '—', ...extra,
});

describe('defaultBamTimeline (prototypparitet)', () => {
  it('lektion utan läxförhör: Genomgång 10 + Arbete + Exit 5', () => {
    const rows = defaultBamTimeline(L({}), 60);
    expect(rows.map((r) => [r.label.split(' ·')[0], r.minutes])).toEqual([
      ['Genomgång', 10], ['Arbete', 45], ['Exit ticket', 5],
    ]);
  });
  it('lektion med soc_start får Läxförhör 10 min först', () => {
    const rows = defaultBamTimeline(L({ soc_start: 'Quiz 1.1a', del: 2, grön: '—', blå: '14–21', röd: '22–25' }), 55);
    expect(rows[0]).toMatchObject({ label: 'Läxförhör', minutes: 10, kind: 'quiz' });
    expect(rows.reduce((s, r) => s + r.minutes, 0)).toBe(55);
  });
  it('utan exit: ingen exit-rad, summan stämmer', () => {
    const rows = defaultBamTimeline(L({ exit: '—' }), 50);
    expect(rows.some((r) => r.kind === 'exit')).toBe(false);
    expect(rows.reduce((s, r) => s + r.minutes, 0)).toBe(50);
  });
  it('kort lektion kraschar inte och summerar rätt', () => {
    const rows = defaultBamTimeline(L({ soc_start: 'Quiz' }), 25);
    expect(rows.reduce((s, r) => s + r.minutes, 0)).toBe(25);
    expect(rows.every((r) => r.minutes > 0)).toBe(true);
  });
});

describe('arbetsEtikett', () => {
  it('del 1: Grön + Blå', () => {
    expect(arbetsEtikett(L({}))).toBe('Arbete · Grön 1–13 · Blå 14–21');
  });
  it('del 2: Blå + Röd', () => {
    expect(arbetsEtikett(L({ del: 2, röd: '22–25' }))).toBe('Arbete · Blå 14–21 · Röd 22–25');
  });
  it('del 0 (repetition/prov): alla nivåer, eller bara Arbete', () => {
    expect(arbetsEtikett(L({ del: 0, röd: '22–25' }))).toContain('Röd 22–25');
    expect(arbetsEtikett(L({ del: 0, grön: '—', blå: '—' }))).toBe('Arbete');
  });
});

describe('diffMinutes', () => {
  it('räknar lektionslängd', () => { expect(diffMinutes('09:00', '10:00')).toBe(60); });
});
