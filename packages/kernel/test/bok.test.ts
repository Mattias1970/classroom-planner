import { describe, expect, it } from 'vitest';
import { bokBegrepp, bokFromImport, bokLektioner, delkapitelKod, sidspann } from '../src/domain/bok.js';
import { bokSidregister, bokSidregisterCsv } from '../src/export/sidregister.js';

const V1 = (lektioner: Record<string, unknown[]>) => JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: {
    id: 'liber-matematik-y', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8,
    kapitelMeta: { '4': { name: 'Algebra', col: '#2f5aa8' } },
  },
  lektioner,
});

const L = (id: number, more: Record<string, unknown> = {}) => ({
  id, type: 'regular', avsnitt: '4.6 Ekvationer', del: 1,
  ett: '133–137', två: '138–143', tre: '—',
  sidor_teori: 's. 187–190', begrepp: 'ekvation, obekant, balansmetoden', ...more,
});

describe('bokFromImport (v1-filer, t.ex. Matematik Y)', () => {
  it('bygger kapitel → delkapitel → lektioner med sidor, begrepp och nivåer', () => {
    const bok = bokFromImport(V1({ '4': [
      L(1),
      L(2, { del: 2, avsnitt: '4.6 Ekvationer', sidor_teori: 's. 190–192', begrepp: 'Ekvation, vänster led' }),
      L(3, { avsnitt: '4.7 Ekvationer med parenteser', sidor_teori: 's. 193–195', begrepp: 'distribuera' }),
      L(4, { type: 'review', avsnitt: 'Blandade uppgifter', sidor_teori: 's. 203–207', begrepp: '—' }),
      L(5, { type: 'exam', avsnitt: '4 Prov', sidor_teori: '—' }),
    ] }));
    expect(bok.titel).toBe('Matematik Y');
    expect(bok.nivaer).toEqual({ niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' });
    const kap = bok.kapitel[0];
    expect(kap.sidor).toBe('s. 187–207');
    expect(kap.delkapitel.map((d) => d.kod)).toEqual(['4.6', '4.7']);
    const d46 = kap.delkapitel[0];
    expect(d46.namn).toBe('Ekvationer');
    expect(d46.sidor).toBe('s. 187–192');
    expect(d46.begrepp).toEqual(['ekvation', 'obekant', 'balansmetoden', 'vänster led']);
    expect(d46.lektioner.map((l) => l.niva1)).toEqual(['133–137', '133–137']);
    expect(kap.extraLektioner.map((l) => l.avsnitt)).toEqual(['Blandade uppgifter', '4 Prov']);
    expect(kap.begreppslista).toEqual(['ekvation', 'obekant', 'balansmetoden', 'vänster led', 'distribuera']);
    expect(kap.resurser).toEqual({ filmer: [], forklaringar: {} }); // öppet för filmer + flippat klassrum
  });

  it('läser grön/blå/röd-böcker med rätt etiketter', () => {
    const bok = bokFromImport(V1({ '4': [{ ...L(1), ett: undefined, två: undefined, tre: undefined, grön: '1–5', blå: '6–9', röd: '10' }] }));
    expect(bok.nivaer).toEqual({ niva1: 'Grön', niva2: 'Blå', niva3: 'Röd' });
    expect(bok.kapitel[0].delkapitel[0].lektioner[0]).toMatchObject({ niva1: '1–5', niva2: '6–9', niva3: '10' });
  });

  it('avvisar fel schema, dubbla id och trasig JSON med svenska fel', () => {
    expect(() => bokFromImport('nope')).toThrow(/giltig JSON/);
    expect(() => bokFromImport('{"schema":"x","version":1}')).toThrow(/bokfil/);
    expect(() => bokFromImport(V1({ '4': [L(1), L(1)] }))).toThrow(/flera gånger/);
    expect(() => bokFromImport(V1({}))).toThrow(/inga lektioner/);
  });

  it('bokLektioner ger planeringsordning; bokBegrepp listar per delkapitel', () => {
    const bok = bokFromImport(V1({ '4': [L(2, { del: 2 }), L(1), L(3, { avsnitt: 'Blandade uppgifter' })] }));
    expect(bokLektioner(bok).map((x) => x.lektion.id)).toEqual([1, 2, 3]);
    expect(bokBegrepp(bok)).toEqual([{ kapitel: 4, kod: '4.6', begrepp: ['ekvation', 'obekant', 'balansmetoden'] }]);
  });
});

describe('sidspann + delkapitelKod', () => {
  it('sammanfattar sidnummer och plockar delkapitelkoder', () => {
    expect(sidspann(['s. 184–186', 's. 187', '—'])).toBe('s. 184–187');
    expect(sidspann(['—'])).toBe('—');
    expect(delkapitelKod('4.6 Ekvationer')).toBe('4.6');
    expect(delkapitelKod('Blandade uppgifter')).toBeNull();
  });
});

describe('sidregister', () => {
  it('en rad per kapitel, teoridel, delkapitel och avsnitt — med sidnummer och begrepp', () => {
    const bok = bokFromImport(V1({ '4': [L(1), L(4, { type: 'exam', avsnitt: '4 Prov', sidor_teori: 's. 213' })] }));
    const rader = bokSidregister(bok);
    expect(rader.map((r) => r.niva)).toEqual(['Kapitel', 'Delkapitel', 'Teori', 'Avsnitt', 'Avsnitt']);
    expect(rader[0]).toMatchObject({ kod: '4', namn: 'Algebra', sidor: 's. 187–213' });
    expect(rader[1]).toMatchObject({ kod: '4.6', sidor: 's. 187–190', begrepp: 'ekvation, obekant, balansmetoden' });
    expect(rader[2].namn).toBe('Ekvationer — teori del 1');
    expect(rader[4]).toMatchObject({ namn: '4 Prov', sidor: 's. 213' });
    const csv = bokSidregisterCsv(bok);
    expect(csv.startsWith('\uFEFFNivå;Kod;Namn;Sidor;Begrepp')).toBe(true);
    expect(csv).toContain('Delkapitel;4.6;Ekvationer;s. 187–190;"ekvation, obekant, balansmetoden"');
  });
});

describe('genomgangslänk i matematikformatet', () => {
  it("raw 'genomgang_lank' med http-länk hamnar på lektionen; annat ignoreras", () => {
    const bok = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'b', titel: 'B', kapitelMeta: { '1': { name: 'K' } } },
      lektioner: { '1': [
        { id: 1, type: 'regular', avsnitt: '1.1 X', ett: '1–5', genomgang_lank: 'https://app.binogi.se/l/x' },
        { id: 2, type: 'regular', avsnitt: '1.1 X', del: 2, ett: '6–9', genomgang_lank: 'inte en länk' },
      ] },
    }));
    const [l1, l2] = bok.kapitel[0].delkapitel[0].lektioner;
    expect(l1.genomgangLank).toBe('https://app.binogi.se/l/x');
    expect(l2.genomgangLank).toBeUndefined();
  });
});

describe('kapitelfilmer i bokfilen', () => {
  it('läser kapitelMeta.filmer (Titel|url och objektform) till resurser.filmer, hoppar ogiltiga', () => {
    const bok = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'b', titel: 'B', kapitelMeta: { '1': { name: 'Tal', filmer: [
        'Negativa tal|https://app.binogi.se/l/introduktion-till-negativa-tal',
        { titel: 'Potenser', url: 'https://app.binogi.se/l/introduktion-till-potenser' },
        'utan länk', 'Trasig|ingen-url', { titel: '', url: 'https://x' }, 42,
      ] } } },
      lektioner: { '1': [{ id: 1, type: 'regular', avsnitt: '1.1 X', ett: '1–5' }] },
    }));
    expect(bok.kapitel[0].resurser.filmer).toEqual([
      { titel: 'Negativa tal', url: 'https://app.binogi.se/l/introduktion-till-negativa-tal' },
      { titel: 'Potenser', url: 'https://app.binogi.se/l/introduktion-till-potenser' },
    ]);
  });

  it('utan filmer-fält blir resurslistan tom', () => {
    const bok = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'b', titel: 'B', kapitelMeta: { '1': { name: 'K' } } },
      lektioner: { '1': [{ id: 1, type: 'regular', avsnitt: '1.1 X', ett: '1–5' }] },
    }));
    expect(bok.kapitel[0].resurser.filmer).toEqual([]);
  });
});
