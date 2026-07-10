import { describe, it, expect } from 'vitest';
import { validateTimeline, computeTimes } from '@planner/core';
import type { BamRow } from '@planner/core';

const STANDARD_BAM: BamRow[] = [
  { label: 'Läxförhör',  minutes: 10, kind: 'quiz'    },
  { label: 'Genomgång',  minutes: 15, kind: 'lecture'  },
  { label: 'Arbete',     minutes: 25, kind: 'work'     },
  { label: 'Exit ticket',minutes:  5, kind: 'exit'     },
];

describe('C.2 — BAM-validering', () => {

  it('giltig tidslinje returnerar ok:true', () => {
    const result = validateTimeline(STANDARD_BAM, 55);
    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('tom tidslinje returnerar ok:false med meddelande', () => {
    const result = validateTimeline([], 55);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('summan stämmer inte → ok:false', () => {
    const result = validateTimeline(STANDARD_BAM, 60);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('55');
    expect(result.message).toContain('60');
  });

  it('minuter = 0 → ok:false', () => {
    const bad: BamRow[] = [{ label: 'Tom', minutes: 0, kind: 'custom' }];
    const result = validateTimeline(bad, 0);
    expect(result.ok).toBe(false);
  });

  it('decimala minuter → ok:false', () => {
    const bad: BamRow[] = [{ label: 'Halvt', minutes: 2.5, kind: 'custom' }];
    const result = validateTimeline(bad, 2.5);
    expect(result.ok).toBe(false);
  });

  it('negativa minuter → ok:false', () => {
    const bad: BamRow[] = [{ label: 'Negativ', minutes: -5, kind: 'custom' }];
    const result = validateTimeline(bad, -5);
    expect(result.ok).toBe(false);
  });

  it('felmeddelande är på svenska', () => {
    const result = validateTimeline([], 55);
    expect(result.message).toMatch(/[åäöÅÄÖ]/);
  });
});

describe('C.2 — BAM-tider (computeTimes)', () => {

  it('beräknar from/to korrekt från 09:00', () => {
    const result = computeTimes(STANDARD_BAM, '09:00');
    expect(result[0]?.from).toBe('09:00');
    expect(result[0]?.to).toBe('09:10');
    expect(result[1]?.from).toBe('09:10');
    expect(result[1]?.to).toBe('09:25');
    expect(result[2]?.from).toBe('09:25');
    expect(result[2]?.to).toBe('09:50');
    expect(result[3]?.from).toBe('09:50');
    expect(result[3]?.to).toBe('09:55');
  });

  it('antal resultatrader = antal inrader', () => {
    const result = computeTimes(STANDARD_BAM, '09:00');
    expect(result).toHaveLength(STANDARD_BAM.length);
  });

  it('bevarar alla ursprungliga fält', () => {
    const result = computeTimes(STANDARD_BAM, '09:00');
    expect(result[0]?.label).toBe('Läxförhör');
    expect(result[0]?.kind).toBe('quiz');
    expect(result[0]?.minutes).toBe(10);
  });

  it('fungerar från 13:30', () => {
    const rows: BamRow[] = [{ label: 'Block', minutes: 45, kind: 'work' }];
    const result = computeTimes(rows, '13:30');
    expect(result[0]?.from).toBe('13:30');
    expect(result[0]?.to).toBe('14:15');
  });

  it('muterar inte indata', () => {
    const original = [...STANDARD_BAM];
    computeTimes(STANDARD_BAM, '09:00');
    expect(STANDARD_BAM).toHaveLength(original.length);
    expect(STANDARD_BAM[0]?.minutes).toBe(original[0]?.minutes);
  });
});
