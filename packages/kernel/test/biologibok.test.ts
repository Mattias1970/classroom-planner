import { describe, expect, it } from 'vitest';
import {
  BOK_SCHEMA, bokFromBiologiImport, bokFromValfriImport,
  socrativeExitRum, socrativeLaxforhorRum,
} from '../src/index.js';

const NOBOK = JSON.stringify({
  id: 'spektrum-biologi', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
  kapitel: [{
    nummer: 6, titel: 'Vår fantastiska kropp', sidor: 's. 150–199',
    mal: ['Beskriva cellen'],
    delkapitel: [
      { nummer: '6.1', titel: 'Cellen', sidor: 's. 152–155', begrepp: ['cell', 'cellmembran'], extraBegrepp: ['organell'], testaDigSjalv: { sida: 155, fragor: ['Vad är en cell?', 'Vad gör membranet?'] }, genomgangLank: 'https://app.binogi.se/l/cellen', forklaringar: { cell: 'Kroppens minsta byggsten.', cellmembran: 'Cellens skal som styr vad som släpps in och ut.' } },
      { nummer: '6.2', titel: 'Organsystem', sidor: 's. 156–160', begrepp: ['organ', 'vävnad'], extraBegrepp: [] },
      { nummer: '6.3', titel: 'Huden', sidor: 's. 161–164', begrepp: ['överhud'], extraBegrepp: [] },
    ],
    perspektiv: { titel: 'Organdonation', sidor: 's. 196', fragor: ['Bör alla vara donatorer?'] },
    sammanfattning: { sidor: 's. 197' },
    finalen: { sidor: 's. 198–199', antalUppgifter: 24 },
  }],
});

describe('Socrative-namnkonventionen (kernel)', () => {
  it('bygger enskilda och kumulativa rum', () => {
    expect(socrativeExitRum('Biologi', 6, 1)).toBe('Biologi61');
    expect(socrativeLaxforhorRum('Biologi', 6, 3)).toBe('Biologi6123');
    expect(socrativeLaxforhorRum('Biologi', 6, 8)).toBe('Biologi612345678');
  });
});

describe('bokFromBiologiImport', () => {
  it('bygger delkapitel, extra lektioner och NO-mallens fält', () => {
    const bok = bokFromBiologiImport(NOBOK);
    expect(bok.id).toBe('spektrum-biologi');
    expect(bok.amne).toBe('Biologi');
    const kap = bok.kapitel[0];
    expect(kap.nr).toBe(6);
    expect(kap.delkapitel.map((d) => d.kod)).toEqual(['6.1', '6.2', '6.3']);
    // PERSPEKTIV + FINALEN + PROV hamnar som extra lektioner, PROV sist
    expect(kap.extraLektioner.map((l) => l.avsnitt)).toEqual(['PERSPEKTIV', 'FINALEN', 'PROV']);
    expect(kap.extraLektioner[2].typ).toBe('exam');
    // Kapitlets begreppslista aggregeras ur delkapitlens begrepp
    expect(kap.begreppslista).toEqual(['cell', 'cellmembran', 'organ', 'vävnad', 'överhud']);
  });

  it('lektion 1 saknar läxförhör; lektion 2+ har kumulativa rum med krav', () => {
    const kap = bokFromBiologiImport(NOBOK).kapitel[0];
    const [l1, l2, l3] = kap.delkapitel.map((d) => d.lektioner[0]);
    expect(l1.socStart).toBe('—');
    expect(l2.socStart).toBe('Biologi61 (krav ≥ 90 %)');
    expect(l3.socStart).toBe('Biologi612 (krav ≥ 90 %)');
    expect(l1.exit).toBe('Biologi61 (krav ≥ 70 %)');
    expect(l1.ex).toBe('Testa dig själv 6.1 (2 frågor)');
    expect(l1.laxa).toContain('Biologi61 ≥ 90 %');
  });

  it('kastar svenska fel för trasiga filer', () => {
    expect(() => bokFromBiologiImport('inte json')).toThrow('Filen är inte giltig JSON.');
    expect(() => bokFromBiologiImport('{"id":"x","titel":"T"}')).toThrow('"kapitel" saknas');
    expect(() => bokFromBiologiImport(JSON.stringify({ id: 'x', titel: 'T', kapitel: [{ nummer: 1, titel: 'K', delkapitel: [{ titel: 'D' }] }] }))).toThrow('nummer');
  });
});

describe('genomgångslänk och förklaringar ur NO-boken', () => {
  it('länken hamnar på lektionen och som kapitelfilm; förklaringarna i resurserna', () => {
    const kap = bokFromBiologiImport(NOBOK).kapitel[0];
    expect(kap.delkapitel[0].lektioner[0].genomgangLank).toBe('https://app.binogi.se/l/cellen');
    expect(kap.delkapitel[1].lektioner[0].genomgangLank).toBeUndefined();
    expect(kap.resurser.filmer).toEqual([{ titel: '6.1 Cellen — genomgång', url: 'https://app.binogi.se/l/cellen' }]);
    expect(kap.resurser.forklaringar).toEqual({
      cell: 'Kroppens minsta byggsten.',
      cellmembran: 'Cellens skal som styr vad som släpps in och ut.',
    });
  });
});

describe('bokFromValfriImport', () => {
  it('skickar bokfiler till bokFromImport och NO-böcker till biologiimporten', () => {
    const bokfil = JSON.stringify({
      schema: BOK_SCHEMA, version: 1,
      bok: { id: 'b', titel: 'B', kapitelMeta: { '1': { name: 'K' } } },
      lektioner: { '1': [{ id: 1, type: 'regular', avsnitt: '1.1 X', ett: '1–5' }] },
    });
    expect(bokFromValfriImport(bokfil).nivaer.niva1).toBe('ETT');
    expect(bokFromValfriImport(NOBOK).kapitel[0].nr).toBe(6);
    expect(() => bokFromValfriImport('{"x":1}')).toThrow('varken en bokfil');
  });
});
