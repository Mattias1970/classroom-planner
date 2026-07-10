import type { BamRow, LessonContent } from '../domain/index.js';

export interface LessonPlanSummary {
  title: string;
  targetDurationMin: number;
  sections: BamRow[];
  hasFlippedContent: boolean;
}

/**
 * Skapar en enkel planeringssummering för en lektion.
 * Om lektionen redan har BAM-rader används dessa; annars skapas en enkel standardplan.
 */
export function buildLessonPlanSummary(
  content: LessonContent,
  targetDurationMin = content.längdMin
): LessonPlanSummary {
  const sections = content.bam.length > 0
    ? content.bam
    : createDefaultSections(targetDurationMin);

  return {
    title: content.rubrik,
    targetDurationMin,
    sections,
    hasFlippedContent: content.flippat.blocks.length > 0,
  };
}

function createDefaultSections(totalMin: number): BamRow[] {
  const introMin = Math.min(10, Math.max(5, Math.floor(totalMin / 4)));
  const workMin = Math.max(8, totalMin - introMin - 8);
  const exitMin = totalMin - introMin - workMin;

  return [
    { label: 'Intro', minutes: introMin, kind: 'lecture' },
    { label: 'Arbeta', minutes: workMin, kind: 'work' },
    { label: 'Avslut', minutes: exitMin, kind: 'exit' },
  ];
}
