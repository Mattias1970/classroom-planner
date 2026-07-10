import type {
  BookId,
  ClassId,
  ConceptId,
  LessonContent,
  LessonTemplate,
  ScheduledLesson,
  TemplateId,
  VersionId,
} from '../../src/domain/index.js';

export function createFixtureLessonContent(): LessonContent {
  return {
    rubrik: 'Multiplikation med negativa tal',
    mål: 'Förstå multiplikation med negativa tal',
    subject: 'matematik',
    årskurs: 8,
    längdMin: 55,
    del: 1,
    arbetsmoment: [],
    metoder: ['diskussion'],
    conceptIds: ['c-1'] as ConceptId[],
    filmer: [],
    quizzes: [],
    magma: [],
    flippat: {
      blocks: [{ typ: 'text', text: 'Förbered dig' }],
      settings: { socrativeRoom: 'Matte8B', sändDag: 'samma-dag', sändTid: '15:00' },
    },
    bam: [],
  };
}

export function makeContent(overrides: Partial<LessonContent> = {}): LessonContent {
  return {
    rubrik: 'Negativa tal',
    mål: 'Förstå och räkna med negativa tal',
    subject: 'matematik',
    bookId: 'prio-mat-8-2ed' as BookId,
    chapterId: '1',
    subchapterId: '1.1',
    årskurs: 8,
    längdMin: 45,
    del: 1,
    arbetsmoment: [],
    metoder: ['diskussion'],
    conceptIds: [] as ConceptId[],
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

export function makeTemplate(
  overrides: Partial<LessonTemplate> = {},
  contentOverrides: Partial<LessonContent> = {}
): LessonTemplate {
  const content = makeContent(contentOverrides);
  const version = {
    id: 'v-default' as VersionId,
    createdAt: '2026-09-01T00:00:00Z',
    label: 'v1',
    content,
  };

  return {
    id: 'tmpl-default' as TemplateId,
    currentVersionId: version.id,
    versions: [version],
    ...overrides,
    versions: overrides.versions ?? [version],
  };
}

export function makeScheduled(
  overrides: Partial<ScheduledLesson> = {}
): ScheduledLesson {
  return {
    id: 'sched-default' as any,
    templateId: 'tmpl-default' as TemplateId,
    versionId: 'v-default' as VersionId,
    classId: '8B' as ClassId,
    date: '2026-09-01',
    startTime: '09:00',
    endTime: '09:45',
    locked: false,
    status: 'planerad',
    externalRefs: [],
    ...overrides,
  };
}
