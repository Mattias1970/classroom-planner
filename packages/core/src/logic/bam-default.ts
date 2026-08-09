/**
 * Standard-BAM-tidslinje (paritet med HTML-prototypens buildBamTimeline):
 * varje lektion får en tidslinje ur sin egen data — ingen flip-fil krävs.
 *  - Läxförhör 10 min endast om soc_start finns
 *  - Genomgång 10 min alltid
 *  - Exit ticket 5 min endast om exit finns
 *  - Arbete = resten, med uppgiftsintervall enligt lektionens del
 */
import type { BamRow } from '../domain/index.js';
import type { LessonRecord } from '../records/lesson-record.js';

const har = (v: string | undefined): v is string => !!v && v !== '—';

/** Uppgiftsetikett för Arbete-segmentet enligt prototypens del-logik. */
export function arbetsEtikett(lesson: LessonRecord): string {
  const parts: string[] = [];
  const g = har(lesson.grön), b = har(lesson.blå), r = har(lesson.röd);
  if (lesson.del === 2) {
    if (b) parts.push(`Blå ${lesson.blå}`);
    if (r) parts.push(`Röd ${lesson.röd}`);
  } else if (lesson.del === 1) {
    if (g) parts.push(`Grön ${lesson.grön}`);
    if (b) parts.push(`Blå ${lesson.blå}`);
  } else {
    if (g) parts.push(`Grön ${lesson.grön}`);
    if (b) parts.push(`Blå ${lesson.blå}`);
    if (r) parts.push(`Röd ${lesson.röd}`);
  }
  return parts.length ? `Arbete · ${parts.join(' · ')}` : 'Arbete';
}

/** Bygger standardtidslinjen för en lektion av given längd (minuter). */
export function defaultBamTimeline(lesson: LessonRecord, totalMinutes: number): BamRow[] {
  const quiz = har(lesson.soc_start) ? 10 : 0;
  const exit = har(lesson.exit) ? 5 : 0;
  let genomgång = 10;
  let arbete = totalMinutes - quiz - genomgång - exit;
  if (arbete < 5) { // mycket kort lektion: krymp genomgången, garantera lite arbete
    genomgång = Math.max(5, totalMinutes - quiz - exit - 5);
    arbete = Math.max(0, totalMinutes - quiz - genomgång - exit);
  }
  const rows: BamRow[] = [];
  if (quiz) rows.push({ label: 'Läxförhör', minutes: quiz, kind: 'quiz' });
  rows.push({ label: 'Genomgång', minutes: genomgång, kind: 'lecture' });
  if (arbete > 0) rows.push({ label: arbetsEtikett(lesson), minutes: arbete, kind: 'work' });
  if (exit) rows.push({ label: 'Exit ticket', minutes: exit, kind: 'exit' });
  return rows;
}

/** Minuter mellan "HH:MM"-tider. */
export function diffMinutes(start: string, end: string): number {
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}
