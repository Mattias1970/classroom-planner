import { describe, it, expect } from 'vitest';
import { buildLessonPlanSummary } from '../src/logic/planning.js';
import { createFixtureLessonContent } from './helpers/fixtures.js';

describe('buildLessonPlanSummary', () => {
  it('skapar en standardplan när bam saknas', () => {
    const content = createFixtureLessonContent();
    const plan = buildLessonPlanSummary(content, 55);

    expect(plan.title).toBe('Multiplikation med negativa tal');
    expect(plan.targetDurationMin).toBe(55);
    expect(plan.sections).toHaveLength(3);
    expect(plan.sections.reduce((sum, row) => sum + row.minutes, 0)).toBe(55);
  });

  it('använder befintlig bam när den finns', () => {
    const content = createFixtureLessonContent();
    content.bam = [
      { label: 'Quiz', minutes: 10, kind: 'quiz' },
      { label: 'Arbeta', minutes: 20, kind: 'work' },
      { label: 'Exit', minutes: 15, kind: 'exit' },
    ];

    const plan = buildLessonPlanSummary(content, 45);
    expect(plan.sections).toHaveLength(3);
    expect(plan.sections[0]?.label).toBe('Quiz');
    expect(plan.hasFlippedContent).toBe(true);
  });
});
