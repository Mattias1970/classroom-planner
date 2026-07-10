import { describe, it, expect } from 'vitest';
import {
  PRIO_MAT_8,
  CONCEPTS_1_1,
  SOURCE_MAP_1_1_DEL1,
  SOURCE_MAP_1_1_DEL2,
} from '../src/fixtures/prio-mat-8.js';

describe('PRIO_MAT_8 — bokstruktur', () => {
  it('har 4 kapitel', () => {
    expect(PRIO_MAT_8.chapters).toHaveLength(4);
  });

  it('kapitel 1 heter Tal', () => {
    expect(PRIO_MAT_8.chapters[0]?.titel).toBe('Tal');
  });

  it('kapitel 1 har 5 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[0]?.subchapters).toHaveLength(5);
  });

  it('kapitel 2 heter Algebra', () => {
    expect(PRIO_MAT_8.chapters[1]?.titel).toBe('Algebra');
  });

  it('kapitel 2 har 8 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[1]?.subchapters).toHaveLength(8);
  });

  it('kapitel 3 heter Geometri och har 5 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[2]?.titel).toBe('Geometri');
    expect(PRIO_MAT_8.chapters[2]?.subchapters).toHaveLength(5);
  });

  it('kapitel 4 heter Sannolikhet och statistik och har 4 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[3]?.titel).toBe('Sannolikhet och statistik');
    expect(PRIO_MAT_8.chapters[3]?.subchapters).toHaveLength(4);
  });

  it('förlag är Sanoma', () => {
    expect(PRIO_MAT_8.förlag).toBe('Sanoma');
  });

  it('årskurs är 8', () => {
    expect(PRIO_MAT_8.årskurs).toBe(8);
  });
});

describe('CONCEPTS_1_1', () => {
  it('har 2 begrepp', () => {
    expect(CONCEPTS_1_1).toHaveLength(2);
  });

  it('första begreppet är negativt tal', () => {
    expect(CONCEPTS_1_1[0]?.term).toBe('negativt tal');
  });

  it('andra begreppet är tallinjen', () => {
    expect(CONCEPTS_1_1[1]?.term).toBe('tallinjen');
  });
});

describe('SOURCE_MAP_1_1_DEL1', () => {
  it('är lessonNo 1', () => {
    expect(SOURCE_MAP_1_1_DEL1.lessonNo).toBe(1);
  });

  it('har 2 exerciseRanges', () => {
    expect(SOURCE_MAP_1_1_DEL1.exerciseRanges).toHaveLength(2);
  });

  it('grön-range är 101–110', () => {
    const grön = SOURCE_MAP_1_1_DEL1.exerciseRanges[0];
    expect(grön?.label.known).toBe('grön');
    expect(grön?.from).toBe(101);
    expect(grön?.to).toBe(110);
  });

  it('quizStart är Matte8B', () => {
    expect(SOURCE_MAP_1_1_DEL1.quizStart).toBe('Matte8B');
  });
});

describe('SOURCE_MAP_1_1_DEL2', () => {
  it('är lessonNo 2', () => {
    expect(SOURCE_MAP_1_1_DEL2.lessonNo).toBe(2);
  });

  it('har blå och röd range', () => {
    const labels = SOURCE_MAP_1_1_DEL2.exerciseRanges.map((r) => r.label.known);
    expect(labels).toContain('blå');
    expect(labels).toContain('röd');
  });
});
