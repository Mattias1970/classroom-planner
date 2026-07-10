import type {
  LessonContent,
  LessonTemplate,
  ScheduledLesson,
  TemplateId,
  VersionId,
  ScheduledId,
  ClassId,
} from '@planner/core';

/** Minimal giltig LessonContent för tester */
export function makeContent(overrides: Partial<LessonContent> = {}): LessonContent {
  return {
    rubrik: 'Negativa tal',
    mål: 'Förstå och räkna med negativa tal',
    subject: 'matematik',
    bookId: 'prio-mat-8-2ed' as LessonContent['bookId'],
    chapterId: '1',
    subchapterId: '1.1',
    årskurs: 8,
    längdMin: 55,
    del: 1,
    arbetsmoment: [],
    metoder: [],
    conceptIds: [],
    filmer: [],
    quizzes: [],
    magma: [],
    flippat: {
      blocks: [],
      settings: { socrativeRoom: 'Matte8B', sändDag: 'dag-före', sändTid: '15:00' },
    },
    bam: [],
    ...overrides,
  };
}

/** Minimal giltig LessonTemplate för tester */
export function makeTemplate(overrides: Partial<LessonTemplate> = {}): LessonTemplate {
  const versionId = 'v-001' as VersionId;
  return {
    id: 'tmpl-001' as TemplateId,
    currentVersionId: versionId,
    versions: [
      {
        id: versionId,
        createdAt: '2026-09-01T08:00:00Z',
        label: 'v1',
        content: makeContent(),
      },
    ],
    ...overrides,
  };
}

/** Minimal giltig ScheduledLesson för tester */
export function makeScheduled(overrides: Partial<ScheduledLesson> = {}): ScheduledLesson {
  return {
    id: 'sched-001' as ScheduledId,
    templateId: 'tmpl-001' as TemplateId,
    versionId: 'v-001' as VersionId,
    classId: '8B' as ClassId,
    date: '2026-09-03',
    startTime: '09:00',
    endTime: '09:55',
    locked: false,
    status: 'planerad',
    externalRefs: [],
    ...overrides,
  };
}
