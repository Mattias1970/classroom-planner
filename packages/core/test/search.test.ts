import { describe, it, expect } from 'vitest';
import { projectToIndex, search, createTemplate } from '@planner/core';
import type { TemplateId, VersionId, ConceptId, LessonTemplate } from '@planner/core';
import { makeContent, makeTemplate } from './helpers/fixtures.js';

const CLOCK  = () => '2026-09-01T08:00:00Z';
let cnt = 0;
const ID_GEN = () => `sid-${++cnt}`;

describe('C.3 — Sök: projectToIndex', () => {

  it('projicerar rubrik och mål korrekt', () => {
    const t = makeTemplate();
    const row = projectToIndex(t);
    expect(row.rubrik).toBe('Negativa tal');
    expect(row.mål).toBe('Förstå och räkna med negativa tal');
  });

  it('projicerar templateId och versionId', () => {
    const t = makeTemplate();
    const row = projectToIndex(t);
    expect(row.templateId).toBe(t.id);
    expect(row.versionId).toBe(t.currentVersionId);
  });

  it('projicerar subchapterId och bookId', () => {
    const t = makeTemplate();
    const row = projectToIndex(t);
    expect(row.subchapterId).toBe('1.1');
    expect(row.bookId).toBe('prio-mat-8-2ed');
  });

  it('använder aktuell version, inte äldre', () => {
    const t1 = createTemplate('t' as TemplateId, makeContent({ rubrik: 'Gammal' }), CLOCK, ID_GEN);
    const t3: LessonTemplate = {
      ...t1,
      currentVersionId: 'v-ny' as VersionId,
      versions: [
        ...t1.versions,
        { id: 'v-ny' as VersionId, createdAt: '2026-09-02T00:00:00Z', label: 'v2', content: makeContent({ rubrik: 'Ny' }) },
      ],
    };
    const row = projectToIndex(t3);
    expect(row.rubrik).toBe('Ny');
  });
});

describe('C.3 — Sök: search', () => {

  const t2: LessonTemplate = {
    id: 'tmpl-002' as TemplateId,
    currentVersionId: 'v-002' as VersionId,
    versions: [{
      id: 'v-002' as VersionId,
      createdAt: '2026-09-01T00:00:00Z',
      label: 'v1',
      content: makeContent({ rubrik: 'Algebra', mål: 'Lösa ekvationer', subchapterId: '2.1', chapterId: '2' }),
    }],
  };
  const rows = [projectToIndex(makeTemplate()), projectToIndex(t2)];

  it('tom query returnerar alla rader', () => {
    expect(search(rows, {})).toHaveLength(2);
  });

  it('text matchar rubrik (case-insensitive)', () => {
    const result = search(rows, { text: 'algebra' });
    expect(result).toHaveLength(1);
    expect(result[0]?.rubrik).toBe('Algebra');
  });

  it('text matchar mål', () => {
    const result = search(rows, { text: 'ekvationer' });
    expect(result).toHaveLength(1);
    expect(result[0]?.mål).toBe('Lösa ekvationer');
  });

  it('subchapterId-filter fungerar', () => {
    const result = search(rows, { subchapterId: '1.1' });
    expect(result).toHaveLength(1);
    expect(result[0]?.subchapterId).toBe('1.1');
  });

  it('bookId-filter fungerar', () => {
    const result = search(rows, { bookId: 'prio-mat-8-2ed' });
    expect(result).toHaveLength(2);
  });

  it('okänt bookId returnerar tom lista', () => {
    const result = search(rows, { bookId: 'finns-inte' });
    expect(result).toHaveLength(0);
  });

  it('AND mellan fält: text + subchapterId', () => {
    const result = search(rows, { text: 'negativa', subchapterId: '2.1' });
    expect(result).toHaveLength(0);
  });

  it('conceptId-filter fungerar', () => {
    const withConcept = {
      ...rows[0]!,
      conceptIds: ['c-1-1-negativatal'],
    };
    const result = search([withConcept, rows[1]!], { conceptId: 'c-1-1-negativatal' });
    expect(result).toHaveLength(1);
  });
});
