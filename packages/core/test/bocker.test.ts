import { describe, it, expect } from 'vitest';
import {
  BOK_IMPORT_SCHEMA, filterBocker, grupperaPerAmne, normalizeLesson,
  raknaLektioner, validateBokImport,
} from '../src/domain/bocker.js';

const giltigImport = {
  schema: BOK_IMPORT_SCHEMA,
  version: 1,
  bok: {
    id: 'spektrum-biologi-7', titel: 'Spektrum Biologi', förlag: 'Liber',
    ämne: 'Biologi', årskurs: 7,
    kapitelMeta: { '1': { name: 'Cellen', col: '#2e7d32' } },
  },
  lektioner: {
    '1': [
      { id: 1, type: 'regular', avsnitt: '1.1', del: 1, grön: '1–5', blå: '6–10', röd: '11–12' },
      { id: 2, avsnitt: '1.1', del: 2 },
    ],
  },
};

describe('validateBokImport', () => {
  it('accepterar giltig import och fyller kapitelMeta-defaults', () => {
    const b = validateBokImport(giltigImport);
    expect(b.bok.titel).toBe('Spektrum Biologi');
    expect(b.bok.årskurs).toBe(7);
    expect(b.lektioner[1]?.length).toBe(2);
    expect(b.bok.kapitelMeta['1']?.name).toBe('Cellen');
    expect(b.bok.kapitelMeta['1']?.lektioner).toBe(2); // räknas från datan
  });

  it('förlåtande med saknade textfält ("—") och okänd typ (regular)', () => {
    const b = validateBokImport(giltigImport);
    const l2 = b.lektioner[1]?.[1];
    expect(l2?.grön).toBe('—');
    expect(l2?.type).toBe('regular');
    expect(l2?.laxa).toBe('—');
  });

  it('accepterar amne/arskurs utan svenska tecken (AI-utdata varierar)', () => {
    const b = validateBokImport({
      ...giltigImport,
      bok: { id: 'x', titel: 'X', amne: 'Kemi', arskurs: 8 },
    });
    expect(b.bok.ämne).toBe('Kemi');
    expect(b.bok.årskurs).toBe(8);
  });

  it.each([
    ['fel schema', { ...giltigImport, schema: 'nåt-annat' }, 'bokimport'],
    ['saknad titel', { ...giltigImport, bok: { ...giltigImport.bok, titel: '' } }, 'titel'],
    ['saknat ämne', { ...giltigImport, bok: { id: 'x', titel: 'X', årskurs: 7 } }, 'ämne'],
    ['ogiltig årskurs', { ...giltigImport, bok: { ...giltigImport.bok, årskurs: 12 } }, 'årskurs'],
    ['inga kapitel', { ...giltigImport, lektioner: {} }, 'inga kapitel'],
    ['dubblett-id', { ...giltigImport, lektioner: { '1': [{ id: 1 }, { id: 1 }] } }, 'flera gånger'],
    ['lektion utan id', { ...giltigImport, lektioner: { '1': [{ avsnitt: '1.1' }] } }, 'id'],
  ])('avvisar %s med svenskt felmeddelande', (_namn, data, textbit) => {
    expect(() => validateBokImport(data)).toThrowError(new RegExp(textbit, 'i'));
  });
});

describe('normalizeLesson', () => {
  it('tar gron/bla/rod utan svenska tecken', () => {
    const l = normalizeLesson({ id: 3, gron: '1–4', bla: '5–8', rod: '9' }, 2, 0);
    expect(l.grön).toBe('1–4');
    expect(l.blå).toBe('5–8');
    expect(l.röd).toBe('9');
  });
});

describe('filterBocker', () => {
  const bocker = [
    { ämne: 'Matematik', årskurs: 8, titel: 'Prio 8' },
    { ämne: 'Biologi', årskurs: 7, titel: 'Spektrum Bi 7' },
    { ämne: 'Biologi', årskurs: 8, titel: 'Spektrum Bi 8' },
  ];
  it('filtrerar på ämne, årskurs och kombination', () => {
    expect(filterBocker(bocker, { amne: 'Biologi' }).length).toBe(2);
    expect(filterBocker(bocker, { arskurs: 8 }).length).toBe(2);
    expect(filterBocker(bocker, { amne: 'Biologi', arskurs: 8 })[0]?.titel).toBe('Spektrum Bi 8');
  });
  it('null/undefined = inget filter', () => {
    expect(filterBocker(bocker, {}).length).toBe(3);
    expect(filterBocker(bocker, { amne: null, arskurs: null }).length).toBe(3);
  });
});

describe('grupperaPerAmne', () => {
  it('standardämnen i fast ordning, övriga alfabetiskt, Allmänt sist, tomma utelämnas', () => {
    const grupper = grupperaPerAmne([
      { amne: 'Spanska', id: 's' },
      { id: 'utan' },
      { amne: 'Teknik', id: 't' },
      { amne: 'Matematik', id: 'm' },
      { amne: 'Hemkunskap', id: 'h' },
    ]);
    expect(grupper.map(([a]) => a)).toEqual(['Matematik', 'Teknik', 'Hemkunskap', 'Spanska', 'Allmänt']);
  });
});

describe('raknaLektioner', () => {
  it('summerar över kapitel', () => {
    const b = validateBokImport(giltigImport);
    expect(raknaLektioner(b.lektioner)).toBe(2);
  });
});
