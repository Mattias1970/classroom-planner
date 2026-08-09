import { describe, expect, it } from 'vitest';
import { placeLessons, type OverrideMap } from '../../src/records/schedule-overrides.js';
import type { ScheduledSlot } from '../../src/records/schedule.js';

const slots: ScheduledSlot[] = [
  { date: '2026-08-17', week: 34, weekday: 1, start: '09:00', end: '10:00' },
  { date: '2026-08-18', week: 34, weekday: 2, start: '08:00', end: '08:50' },
  { date: '2026-08-19', week: 34, weekday: 3, start: '12:30', end: '13:25' },
  { date: '2026-08-21', week: 34, weekday: 5, start: '13:45', end: '14:45' },
];
const L = (n: number) => ({ kapitel: 1, lesson: { id: n } });
const lessons = [L(1), L(2), L(3)];

describe('placeLessons', () => {
  it('utan överstyrningar: sekventiell placering', () => {
    const p = placeLessons(lessons, slots);
    expect(p.map((x) => x.slot?.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
  });

  it('cancelled: lektionen utan slot, efterföljande dras fram', () => {
    const ov: OverrideMap = { 1: { type: 'cancelled', reason: 'Studiedag' } };
    const p = placeLessons(lessons, slots, ov);
    expect(p[1].slot).toBeNull();
    expect(p[2].slot?.date).toBe('2026-08-18'); // L3 tar L2:s pass
  });

  it('shifted: passet utgår, lektionen tar nästa, resten förskjuts', () => {
    const ov: OverrideMap = { 0: { type: 'shifted', reason: 'Sjuk' } };
    const p = placeLessons(lessons, slots, ov);
    expect(p[0].slot?.date).toBe('2026-08-18');
    expect(p[1].slot?.date).toBe('2026-08-19');
    expect(p[2].slot?.date).toBe('2026-08-21');
  });

  it('moved: fästs på datum/tid, konsumerar inget sekventiellt pass', () => {
    const ov: OverrideMap = { 1: { type: 'moved', reason: 'Prao', targetDate: '2026-09-01', targetStart: '10:00', targetEnd: '11:00' } };
    const p = placeLessons(lessons, slots, ov);
    expect(p[1].slot).toMatchObject({ date: '2026-09-01', start: '10:00', week: 36 });
    expect(p[2].slot?.date).toBe('2026-08-18'); // L3 kompakteras till L2:s gamla pass
  });
});
