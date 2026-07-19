import { describe, expect, it } from 'vitest';
import {
  IngestError,
  ingestGoogleFormsCsv,
  ingestMagmaCsv,
  ingestScoreCsv,
  ingestSocrativeCsv,
  parseCsv,
} from '../../src/features/superteach/ingest.js';

const AT = '2026-07-19T10:00:00Z';

describe('parseCsv', () => {
  it('hanterar citattecken, semikolon och CRLF', () => {
    expect(parseCsv('a;b\r\n"x;1";2\r\n')).toEqual([['a', 'b'], ['x;1', '2']]);
    expect(parseCsv('a,b\n"sa""id",2')).toEqual([['a', 'b'], ['sa"id', '2']]);
  });
});

describe('ingestScoreCsv', () => {
  it('mappar procent till status enligt trösklar', () => {
    const csv = 'Student Name,Score (%)\nAnna,90\nBjörn,55\nCem,20\nDitt,\n';
    const { evidence, skippedRows } = ingestScoreCsv(csv, {
      source: 'google-forms', subject: 'matematik', dimension: 'begrepp', collectedAt: AT,
    });
    expect(skippedRows).toBe(1);
    expect(evidence.map((e) => e.dimensions[0].status)).toEqual(['secure', 'developing', 'gap']);
    expect(evidence[0].studentKey).toBe('Anna');
    expect(evidence[0].aiAssisted).toBe(false);
  });

  it('räknar poäng/max när procent saknas', () => {
    const csv = 'Namn;Poäng;Max\nAnna;8;10\nBjörn;3;10\n';
    const { evidence } = ingestScoreCsv(csv, {
      source: 'magma', subject: 'matematik', dimension: 'procedur', collectedAt: AT,
    });
    expect(evidence[0].dimensions[0].status).toBe('secure');
    expect(evidence[1].dimensions[0].status).toBe('gap');
  });

  it('ger begripligt fel utan namn-/resultatkolumn', () => {
    expect(() => ingestScoreCsv('X,Y\n1,2\n', {
      source: 'manual', subject: 'ma', dimension: 'begrepp',
    })).toThrow(IngestError);
  });

  it('idempotenta id:n — samma fil två gånger dubblerar inte i servicen', () => {
    const csv = 'Namn,Score (%)\nAnna,90\n';
    const a = ingestScoreCsv(csv, { source: 'google-forms', subject: 'ma', dimension: 'begrepp', collectedAt: AT });
    const b = ingestScoreCsv(csv, { source: 'google-forms', subject: 'ma', dimension: 'begrepp', collectedAt: AT });
    expect(a.evidence[0].id).toBe(b.evidence[0].id);
  });
});

describe('källspecifika wrappers', () => {
  const csv = 'Namn,Score (%)\nAnna,80\n';
  it('sätter rätt källa och defaultdimension', () => {
    expect(ingestSocrativeCsv(csv, { subject: 'ma', kind: 'exit-ticket', collectedAt: AT }).evidence[0].source)
      .toBe('socrative-exit-ticket');
    expect(ingestMagmaCsv(csv, { subject: 'ma', collectedAt: AT }).evidence[0].dimensions[0].dimension)
      .toBe('procedur');
    expect(ingestGoogleFormsCsv(csv, { subject: 'ma', collectedAt: AT }).evidence[0].source)
      .toBe('google-forms');
  });
});
