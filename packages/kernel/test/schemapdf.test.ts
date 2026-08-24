import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { skapaTjanstFranSchema, tolkaSchemaPdf, type PdfTextItem } from '../src/domain/schemapdf.js';
import { laggTillSkolar, larareSchema, resetIdRaknare, saneraIdn, schemaKonflikter } from '../src/domain/struktur.js';
import { tomStruktur } from '../src/domain/typer.js';

const items = JSON.parse(readFileSync(join(__dirname, 'fixtures/mittschema.json'), 'utf-8')) as PdfTextItem[];

beforeEach(resetIdRaknare);

describe('tolkaSchemaPdf — MittSchema24aug.pdf', () => {
  const t = tolkaSchemaPdf(items);
  it('läser lärare och läsår', () => {
    expect(t.signatur).toBe('MatTe');
    expect(t.larareNamn).toBe('Mattias Terfelt');
    expect(t.lasar).toBe('Läsåret 2026/2027');
  });
  it('hittar alla Ma-pass med rätt dag och tid', () => {
    const ma8a = t.lektioner.filter((l) => l.amne === 'Matematik' && l.klass === '8A')
      .map((l) => `${l.dag} ${l.start}-${l.slut}`);
    expect(ma8a).toEqual(['1 10:50-12:00', '2 10:15-11:15', '3 08:25-09:15', '5 12:50-13:40']);
    const ma8b = t.lektioner.filter((l) => l.amne === 'Matematik' && l.klass === '8B').map((l) => l.dag);
    expect(ma8b).toEqual([2, 3, 4, 5]);
  });
  it('hittar NO+Tk med hel- och halvklassmärkning (:a→A, :b→B)', () => {
    const no8b = t.lektioner.filter((l) => l.amne === 'NO+Tk' && l.klass === '8B')
      .map((l) => `${l.dag} ${l.start} ${l.omfattning}`);
    expect(no8b).toEqual(['1 09:15 hel', '4 08:30 B', '4 09:45 A', '5 08:25 hel']);
    const no8a = t.lektioner.filter((l) => l.amne === 'NO+Tk' && l.klass === '8A')
      .map((l) => `${l.dag} ${l.start} ${l.omfattning}`);
    expect(no8a).toEqual(['1 12:55 A', '1 14:20 B', '4 12:50 hel', '5 09:40 hel']);
  });
  it('salar följer med och övrigt (Konftid, MTID, …) hoppas över men listas', () => {
    expect(t.lektioner.every((l) => /^[A-Z]\d+$/.test(l.sal))).toBe(true);
    expect(t.ovrigt.join(' ')).toContain('Konftid');
    expect(t.ovrigt.join(' ')).toContain('MTID');
    expect(t.ovrigt.join(' ')).toContain('MA Spets');
    expect(t.lektioner).toHaveLength(16); // 8 Ma + 8 NO+Tk
  });
});

describe('skapaTjanstFranSchema', () => {
  it('skapar lärare, tjänst, klasser och ämnen med rätt scheman', () => {
    let s = tomStruktur();
    s = laggTillSkolar(s, { id: 'la', namn: 'Läsåret 2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = skapaTjanstFranSchema(s, tolkaSchemaPdf(items), 'la');
    expect(s.larare[0]).toMatchObject({ namn: 'Mattias Terfelt', signatur: 'MatTe' });
    expect(s.tjanster[0].larareId).toBe(s.larare[0].id);
    expect(s.klasser.map((k) => k.namn)).toEqual(['8A', '8B']);
    // Matematik: 4 pass per klass
    const ma8b = s.amnen.find((a) => a.namn === 'Matematik' && a.klassId === s.klasser[1].id)!;
    expect(ma8b.schema).toHaveLength(4);
    // NO+Tk: fyra delämnen per klass med hel-/halvklasspass i grupplistorna
    const bio8b = s.amnen.find((a) => a.namn === 'Biologi' && a.klassId === s.klasser[1].id)!;
    expect(bio8b.halvklass).toBe(true);
    expect(bio8b.schema).toEqual([          // Grupp A: mån hel, tor 09:45 A, fre hel
      { dag: 1, start: '09:15', slut: '10:30' },
      { dag: 4, start: '09:45', slut: '10:55' },
      { dag: 5, start: '08:25', slut: '09:35' },
    ]);
    expect(bio8b.schemaB).toEqual([         // Grupp B: mån hel, tor 08:30 B, fre hel
      { dag: 1, start: '09:15', slut: '10:30' },
      { dag: 4, start: '08:30', slut: '09:40' },
      { dag: 5, start: '08:25', slut: '09:35' },
    ]);
    expect(s.amnen.filter((a) => a.klassId === s.klasser[0].id)).toHaveLength(5); // Ma + 4 NO-delämnen
  });
});

describe('lärarvyn efter PDF-import', () => {
  it('NO+Tk-blocket visas som EN rad per pass och ger inga falska konflikter', () => {
    let s = tomStruktur();
    s = laggTillSkolar(s, { id: 'la', namn: 'Läsåret 2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = skapaTjanstFranSchema(s, tolkaSchemaPdf(items), 'la');
    const schema = larareSchema(s, s.larare[0].id);
    // Mån 09:15 8B: fyra delämnen × två grupper → EN rad 'NO+Tk'
    const man915 = schema.filter((r) => r.dag === 1 && r.start === '09:15');
    expect(man915).toHaveLength(1);
    expect(man915[0].amnesNamn).toBe('NO+Tk');
    // Hela schemat: 8 Ma + 8 NO-block = 16 rader, inga dubbletter
    expect(schema).toHaveLength(16);
    expect(schemaKonflikter(schema)).toHaveLength(0);        // 136 → 0
  });

  it('dubbel import ger EN lärare (saneraIdn slår ihop på signatur, tjänster pekas om)', () => {
    let s = tomStruktur();
    s = laggTillSkolar(s, { id: 'la', namn: 'Läsåret 2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    const t = tolkaSchemaPdf(items);
    s = skapaTjanstFranSchema(s, t, 'la');
    s = skapaTjanstFranSchema(s, t, 'la');   // andra importen återanvänder läraren
    expect(s.larare).toHaveLength(1);
    // Gammal data med två lärare (före dedup-fixen): sanering slår ihop
    const gammal = { ...s, larare: [...s.larare, { id: 'lr-dubblett', namn: 'Mattias Terfelt', signatur: 'MatTe' }],
      tjanster: s.tjanster.map((tj, i) => (i === 1 ? { ...tj, larareId: 'lr-dubblett' } : tj)) };
    const ren = saneraIdn(gammal);
    expect(ren.larare).toHaveLength(1);
    expect(ren.tjanster.every((tj) => tj.larareId === ren.larare[0].id)).toBe(true);
  });
});
