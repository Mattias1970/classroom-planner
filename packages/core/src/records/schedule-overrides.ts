/**
 * Kalenderöverstyrningar (paritet med prototypens lessonOverrides):
 *  - 'cancelled': lektionen utgår helt — efterföljande dras fram
 *  - 'shifted':   lektionen flyttas till nästa ordinarie pass — allt efter förskjuts
 *  - 'moved':     lektionen fästs på ett specifikt datum/tid — sekvensen kompakteras runt den
 * Nyckel: global lektionsindex (0-baserat över alla kapitel i ordning).
 */
import type { ScheduledSlot } from './schedule.js';

export type OverrideType = 'cancelled' | 'shifted' | 'moved';
export interface LessonOverride {
  type: OverrideType;
  reason: string;
  targetDate?: string;
  targetStart?: string;
  targetEnd?: string;
}
export type OverrideMap = Record<number, LessonOverride>;

export interface PlacedLesson<T> {
  globalIdx: number;
  kapitel: number;
  lesson: T;
  slot: ScheduledSlot | null;
  override?: LessonOverride;
}

/**
 * Placerar lektioner på slots med överstyrningar applicerade.
 * 'moved' konsumerar inget sekventiellt slot; 'shifted' hoppar över ett slot
 * (passet utgår); 'cancelled' konsumerar inget slot alls.
 */
export function placeLessons<T>(
  lessonsInOrder: Array<{ kapitel: number; lesson: T }>,
  slots: ScheduledSlot[],
  overrides: OverrideMap = {},
): PlacedLesson<T>[] {
  const out: PlacedLesson<T>[] = [];
  let cursor = 0;
  lessonsInOrder.forEach((item, globalIdx) => {
    const ov = overrides[globalIdx];
    if (ov?.type === 'cancelled') {
      out.push({ globalIdx, ...item, slot: null, override: ov });
      return;
    }
    if (ov?.type === 'moved' && ov.targetDate) {
      const d = new Date(ov.targetDate + 'T00:00:00Z');
      const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      out.push({
        globalIdx, ...item, override: ov,
        slot: {
          date: ov.targetDate,
          week: isoWeekOf(d),
          weekday,
          start: ov.targetStart ?? '08:00',
          end: ov.targetEnd ?? '09:00',
        },
      });
      return;
    }
    if (ov?.type === 'shifted') cursor += 1; // ordinarie passet utgår
    out.push({ globalIdx, ...item, slot: slots[cursor] ?? null, override: ov });
    cursor += 1;
  });
  return out;
}

function isoWeekOf(d: Date): number {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - ys.getTime()) / 86400000 + 1) / 7);
}

/** Prototypens kapitelfärger (CAL_KAP_COLORS), index = kapitelnummer. */
export const KAP_COLORS = ['', '#A0522D', '#1D7A6B', '#1565C0', '#8B1A8B', '#B8860B'];
