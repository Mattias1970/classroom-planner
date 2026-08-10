import { describe, expect, it } from 'vitest';
import {
  buildBegreppTabell, normalizeUrl, shiftOverrideMap,
  type LessonRecord, type OverrideMap,
} from '../src/index.js';

describe('normalizeUrl (FR-TOOL-004)', () => {
  it('lägger på https:// när protokoll saknas', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('  app.binogi.se/negativa-tal ')).toBe('https://app.binogi.se/negativa-tal');
  });
  it('bevarar befintligt protokoll', () => {
    expect(normalizeUrl('https://socrative.com')).toBe('https://socrative.com');
    expect(normalizeUrl('http://magma.se/test')).toBe('http://magma.se/test');
  });
  it('tom sträng förblir tom', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('shiftOverrideMap (FR-STR-005)', () => {
  const map: OverrideMap = {
    2: { type: 'cancelled', reason: 'a' },
    5: { type: 'shifted', reason: 'b' },
    9: { type: 'moved', reason: 'c', targetDate: '2026-09-01' },
  };
  it('flyttar index på och efter insättningspunkten', () => {
    const out = shiftOverrideMap(map, 5, 1);
    expect(out[2]?.reason).toBe('a');   // före: orörd
    expect(out[5]).toBeUndefined();
    expect(out[6]?.reason).toBe('b');   // på punkten: flyttad
    expect(out[10]?.reason).toBe('c');  // efter: flyttad
  });
  it('muterar inte indata', () => {
    shiftOverrideMap(map, 0, 1);
    expect(Object.keys(map).sort()).toEqual(['2', '5', '9']);
  });
});

function lesson(id: number, avsnitt: string, begrepp: string): LessonRecord {
  return {
    id, type: 'regular', avsnitt, del: 1,
    grön: '—', blå: '—', röd: '—', sidor_teori: '—', begrepp,
    soc_start: '—', exit: '—', genomgang: '', bam_gora: '', bam_lara: '',
    bam_ex: '', ex: '', laxa: '—',
  };
}

describe('buildBegreppTabell (FR-BEG-001)', () => {
  const defs = { 'negativa tal': 'Tal mindre än noll', 'tallinjen': 'Linje med tal i ordning' };
  it('en rad per begrepp — första introduktionslektionen vinner', () => {
    const rows = buildBegreppTabell([
      lesson(1, '1.1 Negativa tal', 'negativa tal, tallinjen'),
      lesson(2, '1.1 Negativa tal', 'tallinjen, differens'),
      lesson(3, 'Läxförhör', '—'),
    ], defs);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ lektionNr: 1, begrepp: 'negativa tal', forklaring: 'Tal mindre än noll' });
    expect(rows[1]).toMatchObject({ lektionNr: 1, begrepp: 'tallinjen' });
    expect(rows[2]).toMatchObject({ lektionNr: 2, begrepp: 'differens', forklaring: '—' });
  });
  it('dedupliceringen är skiftlägesokänslig', () => {
    const rows = buildBegreppTabell([
      lesson(1, 'a', 'Potens'),
      lesson(2, 'b', 'potens'),
    ], {});
    expect(rows).toHaveLength(1);
  });
});
