import type { BamRow } from '../domain/index.js';

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

/**
 * Validerar en BAM-tidslinje.
 *
 * Giltig om:
 * - Minst 1 rad
 * - Varje rad: minutes är ett heltal >= 1
 * - Summan av minutes === totalMin
 *
 * Returnerar { ok: false, message: "..." } på svenska vid fel.
 * REN funktion — ingen I/O, ingen mutation.
 */
export function validateTimeline(
  rows: BamRow[],
  totalMin: number
): ValidationResult {
  if (rows.length === 0) {
    return { ok: false, message: 'Tidslinjen måste ha minst en rad.' };
  }

  for (const row of rows) {
    if (!Number.isInteger(row.minutes) || row.minutes < 1) {
      return {
        ok: false,
        message: `Raden "${row.label}" har ogiltig tid: ${row.minutes}. Minuter måste vara ett heltal >= 1.`,
      };
    }
  }

  const total = rows.reduce((sum, r) => sum + r.minutes, 0);
  if (total !== totalMin) {
    return {
      ok: false,
      message: `Tiderna summerar till ${total} minuter men lektionen är ${totalMin} minuter.`,
    };
  }

  return { ok: true };
}

/**
 * Beräknar från- och till-tider för varje BAM-rad.
 * start är i formatet "HH:MM", t.ex. "09:00".
 * REN funktion — ingen I/O, ingen mutation.
 */
export function computeTimes(
  rows: BamRow[],
  start: string
): Array<BamRow & { from: string; to: string }> {
  const [startHour, startMin] = start.split(':').map(Number) as [number, number];
  let currentMinutes = (startHour) * 60 + startMin;

  return rows.map((row) => {
    const from = minutesToTime(currentMinutes);
    currentMinutes += row.minutes;
    const to = minutesToTime(currentMinutes);
    return { ...row, from, to };
  });
}

/** Hjälpfunktion: omvandlar minuter från midnatt till "HH:MM" */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
