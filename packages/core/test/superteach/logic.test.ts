import { describe, expect, it } from 'vitest';
import {
  buildClassSummaries,
  buildStudentSummary,
  recencyFactor,
  sourceWeight,
  usableEvidence,
} from '../../src/features/superteach/logic.js';
import {
  DEFAULT_SUPERTEACH_CONFIG,
  type SuperTeachEvidence,
} from '../../src/features/superteach/types.js';

const NOW = new Date('2026-07-19T12:00:00Z');

function ev(partial: Partial<SuperTeachEvidence> & { id: string }): SuperTeachEvidence {
  return {
    studentKey: 'elev-1',
    subject: 'matematik',
    source: 'google-forms',
    dimensions: [],
    aiAssisted: false,
    teacherReviewed: true,
    collectedAt: '2026-07-10T08:00:00Z',
    ...partial,
  };
}

describe('sourceWeight', () => {
  it('ger högre vikt för Forms än Socrative-läxa', () => {
    expect(sourceWeight('google-forms')).toBeGreaterThan(sourceWeight('socrative-homework'));
  });
  it('använder konfigurerbar vikt för lärarobservation', () => {
    expect(sourceWeight('teacher-observation', { ...DEFAULT_SUPERTEACH_CONFIG, configurableWeight: 1.5 })).toBe(1.5);
  });
});

describe('recencyFactor', () => {
  it('är 1.0 för färsk evidens', () => {
    expect(recencyFactor('2026-07-15T00:00:00Z', NOW)).toBe(1.0);
  });
  it('klingar av mot golvet för gammal evidens', () => {
    const old = recencyFactor('2025-09-01T00:00:00Z', NOW);
    expect(old).toBeCloseTo(DEFAULT_SUPERTEACH_CONFIG.decayFloor, 5);
  });
});

describe('usableEvidence', () => {
  it('exkluderar ogranskad AI-evidens som standard', () => {
    const { usable, excludedUnreviewedAi } = usableEvidence([
      ev({ id: 'a', aiAssisted: true, teacherReviewed: false }),
      ev({ id: 'b' }),
    ]);
    expect(usable.map((e) => e.id)).toEqual(['b']);
    expect(excludedUnreviewedAi).toBe(1);
  });
});

describe('buildStudentSummary', () => {
  it('aggregerar dimensioner, hittar luckor och räknar exkluderad AI', () => {
    const evidence: SuperTeachEvidence[] = [
      ev({
        id: '1',
        dimensions: [
          { dimension: 'begrepp', status: 'secure', confidence: 'high', evidenceText: 'Full poäng på begreppstest' },
          { dimension: 'procedur', status: 'gap', confidence: 'medium', evidenceText: 'Ekvationslösning brister' },
        ],
      }),
      ev({
        id: '2',
        source: 'teacher-observation',
        collectedAt: '2026-07-12T08:00:00Z',
        dimensions: [
          { dimension: 'begrepp', status: 'secure', confidence: 'medium', evidenceText: 'Resonerar säkert muntligt' },
        ],
      }),
      ev({ id: '3', aiAssisted: true, teacherReviewed: false, dimensions: [
        { dimension: 'begrepp', status: 'gap', confidence: 'high', evidenceText: 'AI-analys, ej granskad' },
      ]}),
      ev({ id: '4', studentKey: 'annan-elev' }),
    ];
    const s = buildStudentSummary('elev-1', 'matematik', evidence, NOW);
    expect(s.totalEvidence).toBe(3);
    expect(s.excludedUnreviewedAi).toBe(1);
    const begrepp = s.dimensions.find((d) => d.dimension === 'begrepp');
    expect(begrepp?.status).toBe('secure');
    expect(begrepp?.evidenceCount).toBe(2);
    expect(s.gaps).toContain('procedur');
  });

  it('markerar not-assessed när ingen bedömbar evidens finns', () => {
    const s = buildStudentSummary('elev-1', 'matematik', [
      ev({ id: '1', dimensions: [{ dimension: 'kommunikation', status: 'not-assessed', confidence: 'low', evidenceText: '' }] }),
    ], NOW);
    expect(s.dimensions[0]?.status).toBe('not-assessed');
    expect(s.dimensions[0]?.score).toBeNull();
    expect(s.gaps).toContain('kommunikation');
  });

  it('upptäcker förbättringstrend', () => {
    const dims = (status: 'gap' | 'secure') =>
      [{ dimension: 'procedur', status, confidence: 'high' as const, evidenceText: '' }];
    const s = buildStudentSummary('elev-1', 'matematik', [
      ev({ id: '1', collectedAt: '2026-06-01T08:00:00Z', dimensions: dims('gap') }),
      ev({ id: '2', collectedAt: '2026-06-20T08:00:00Z', dimensions: dims('gap') }),
      ev({ id: '3', collectedAt: '2026-07-05T08:00:00Z', dimensions: dims('secure') }),
      ev({ id: '4', collectedAt: '2026-07-15T08:00:00Z', dimensions: dims('secure') }),
    ], NOW);
    expect(s.dimensions[0]?.trend).toBe('improving');
  });
});

describe('buildClassSummaries', () => {
  it('bygger en sammanställning per elev', () => {
    const map = buildClassSummaries(['elev-1', 'elev-2'], 'matematik', [ev({ id: '1' })], NOW);
    expect(map.size).toBe(2);
    expect(map.get('elev-2')?.totalEvidence).toBe(0);
  });
});
