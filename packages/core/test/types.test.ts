import { describe, it, expect } from 'vitest';
import { KNOWLEDGE_DIMENSIONS, EVIDENCE_WEIGHTS } from '@planner/core';

describe('Kunskapsdirektiv D1–D6', () => {
  it('KNOWLEDGE_DIMENSIONS innehåller 6 poster', () => {
    expect(KNOWLEDGE_DIMENSIONS).toHaveLength(6);
  });

  it('D1 heter Begrepp och modeller', () => {
    const d1 = KNOWLEDGE_DIMENSIONS.find((d) => d.id === 'D1');
    expect(d1).toBeDefined();
    expect(d1?.label).toBe('Begrepp och modeller');
  });

  it('D6 heter Samhälle/hållbarhet/konsekvenser', () => {
    const d6 = KNOWLEDGE_DIMENSIONS.find((d) => d.id === 'D6');
    expect(d6).toBeDefined();
    expect(d6?.label).toBe('Samhälle/hållbarhet/konsekvenser');
  });

  it('Alla dimensioner har minst en typisk evidenskälla', () => {
    for (const dim of KNOWLEDGE_DIMENSIONS) {
      expect(dim.typicalSources.length).toBeGreaterThan(0);
    }
  });
});

describe('Evidensviktning', () => {
  it('EVIDENCE_WEIGHTS innehåller 8 poster', () => {
    expect(EVIDENCE_WEIGHTS).toHaveLength(8);
  });

  it('socrative-exit-ticket har weight medel', () => {
    const entry = EVIDENCE_WEIGHTS.find((e) => e.source === 'socrative-exit-ticket');
    expect(entry).toBeDefined();
    expect(entry?.weight).toBe('medel');
  });

  it('teacher-observation har weight konfigurerbar', () => {
    const entry = EVIDENCE_WEIGHTS.find((e) => e.source === 'teacher-observation');
    expect(entry).toBeDefined();
    expect(entry?.weight).toBe('konfigurerbar');
  });

  it('Alla sources är unika', () => {
    const sources = EVIDENCE_WEIGHTS.map((e) => e.source);
    const unique = new Set(sources);
    expect(unique.size).toBe(sources.length);
  });
});
