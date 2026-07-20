import type { BamRow, TimedBamRow } from '../domain/index.js';

export interface TimelineValidation { ok: boolean; message?: string; }

export function validateTimeline(rows: BamRow[], totalMinutes: number): TimelineValidation {
  if (rows.length === 0) {
    return { ok: false, message: 'Tidslinjen är tom — lägg till minst ett moment.' };
  }
  for (const r of rows) {
    if (!Number.isInteger(r.minutes) || r.minutes <= 0) {
      return { ok: false, message: `Momentet "${r.label}" måste ha ett positivt heltal antal minuter.` };
    }
  }
  const sum = rows.reduce((s, r) => s + r.minutes, 0);
  if (sum !== totalMinutes) {
    return { ok: false, message: `Tidslinjens summa är ${sum} minuter men lektionens längd är ${totalMinutes} minuter.` };
  }
  return { ok: true };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHhmm(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeTimes(rows: BamRow[], startTime: string): TimedBamRow[] {
  let t = toMinutes(startTime);
  return rows.map((r) => {
    const from = toHhmm(t); t += r.minutes;
    return { ...r, from, to: toHhmm(t) };
  });
}
