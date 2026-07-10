import { describe, it, expect } from 'vitest';
import { createLesson, updateLesson } from '../../src/app-services/lesson-use-cases.js';
import { makeContent } from '../helpers/fixtures.js';

describe('lesson use cases', () => {
  it('createLesson skapar en template med initial version', () => {
    const template = createLesson({
      id: 'tmpl-1' as any,
      initialContent: makeContent({ rubrik: 'Intro' }),
      clock: () => '2026-09-01T00:00:00Z',
      idGen: () => 'v-1',
    });

    expect(template.versions).toHaveLength(1);
    expect(template.versions[0]?.content.rubrik).toBe('Intro');
  });

  it('updateLesson lägger till en ny version', () => {
    const template = createLesson({
      id: 'tmpl-2' as any,
      initialContent: makeContent({ rubrik: 'Första' }),
      clock: () => '2026-09-01T00:00:00Z',
      idGen: () => 'v-1',
    });

    const updated = updateLesson({
      template,
      content: makeContent({ rubrik: 'Andra' }),
      clock: () => '2026-09-02T00:00:00Z',
      idGen: () => 'v-2',
    });

    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1]?.content.rubrik).toBe('Andra');
  });
});
