import { describe, it, expect } from 'vitest';
import { buildFlip } from '@planner/core';
import type { ClassId, ConceptId, LessonTemplate, VersionId } from '@planner/core';
import { makeContent, makeTemplate, makeScheduled } from './helpers/fixtures.js';

const ROOM_RESOLVER = (classId: string): string =>
  classId === '8B' ? 'Matte8B' : 'Matte8F';

function makeTemplateWithContent(overrides: Parameters<typeof makeContent>[0]): LessonTemplate {
  const content = makeContent(overrides);
  const vId = 'v-custom' as VersionId;
  return {
    id: makeTemplate().id,
    currentVersionId: vId,
    versions: [{ id: vId, createdAt: '2026-09-01T00:00:00Z', label: 'v1', content }],
  };
}

describe('C.4 — Flipp-generering', () => {

  it('returnerar korrekt socrativeRoom via roomResolver', () => {
    const result = buildFlip(
      makeScheduled({ classId: '8B' as ClassId }),
      makeTemplate(),
      ROOM_RESOLVER
    );
    expect(result.socrativeRoom).toBe('Matte8B');
  });

  it('socrativeUrl är https://socrative.com/', () => {
    const result = buildFlip(makeScheduled(), makeTemplate(), ROOM_RESOLVER);
    expect(result.socrativeUrl).toBe('https://socrative.com/');
  });

  it('subject är lektionens rubrik', () => {
    const result = buildFlip(makeScheduled(), makeTemplate(), ROOM_RESOLVER);
    expect(result.subject).toBe('Negativa tal');
  });

  it('greeting innehåller rubrik och datum', () => {
    const result = buildFlip(
      makeScheduled({ date: '2026-09-03' }),
      makeTemplate(),
      ROOM_RESOLVER
    );
    expect(result.greeting).toContain('Negativa tal');
    expect(result.greeting).toContain('2026-09-03');
  });

  it('textblock renderas som p-tagg', () => {
    const template = makeTemplateWithContent({
      flippat: {
        blocks: [{ typ: 'text', text: 'Läs sid 10-13.' }],
        settings: { socrativeRoom: 'Matte8B', sändDag: 'dag-före', sändTid: '15:00' },
      },
    });
    const result = buildFlip(makeScheduled(), template, ROOM_RESOLVER);
    expect(result.blocksHtml[0]).toContain('<p>');
    expect(result.blocksHtml[0]).toContain('Läs sid 10-13.');
  });

  it('tom blocks ger tom blocksHtml', () => {
    const result = buildFlip(makeScheduled(), makeTemplate(), ROOM_RESOLVER);
    expect(result.blocksHtml).toHaveLength(0);
  });

  it('homeworkConcepts innehåller conceptIds som strängar', () => {
    const template = makeTemplateWithContent({
      conceptIds: ['c-1-1-negativatal', 'c-1-1-tallinjen'] as ConceptId[],
    });
    const result = buildFlip(makeScheduled(), template, ROOM_RESOLVER);
    expect(result.homeworkConcepts).toContain('c-1-1-negativatal');
    expect(result.homeworkConcepts).toContain('c-1-1-tallinjen');
  });

  it('klassen 8F får rum Matte8F', () => {
    const result = buildFlip(
      makeScheduled({ classId: '8F' as ClassId }),
      makeTemplate(),
      ROOM_RESOLVER
    );
    expect(result.socrativeRoom).toBe('Matte8F');
  });

  it('buildFlip är ren — muterar inte indata', () => {
    const scheduled = makeScheduled();
    const template  = makeTemplate();
    const origVersionsLen = template.versions.length;
    buildFlip(scheduled, template, ROOM_RESOLVER);
    expect(template.versions).toHaveLength(origVersionsLen);
    expect(scheduled.classId).toBe('8B');
  });
});
