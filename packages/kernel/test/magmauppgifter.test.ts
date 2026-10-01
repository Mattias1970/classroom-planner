import { describe, expect, it } from 'vitest';
import {
  deladeUppgifter, importeraResultat, klassaFormaga, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst,
  magmaAnalys, magmaAvsnittIntervall, magmaDelkapitelAnalys, magmaKlassFor, magmaTestForProv, sammaTestSom, sattMagmaKlassning,
  sparaMagmaTest, tolkaMagmaPdf, tomStruktur, type MagmaPdfItem, type Struktur,
} from '../src/index.js';

// Magmas utskriftslayout (pdf.js-koordinater): uppgiftsnummer x≈21 h10, formler h14, exponenter h10 upphöjda,
// bråk som täljare över nämnare på samma x. Egna uppgifter — inga verkliga Magma-uppgifter i kodrepot.
const DK = [
  { kod: '1.1', namn: 'Räkna med bråk', begrepp: ['förlängning', 'förkortning', 'blandad form'] },
  { kod: '1.2', namn: 'Addition och subtraktion av bråk', begrepp: ['gemensam nämnare'] },
  { kod: '1.3', namn: 'Multiplikation av bråk', begrepp: [] },
  { kod: '1.4', namn: 'Division av bråk', begrepp: [] },
  { kod: '1.5', namn: 'Potenser', begrepp: ['potens', 'bas', 'exponent'] },
  { kod: '1.6', namn: 'Tiopotenser', begrepp: ['tiopotens', 'grundpotensform'] },
];
const it_ = (text: string, x: number, y: number, h: number, sida: number): MagmaPdfItem => ({ text, x, y, h, sida });
const huvud = (titel: string, sida: number) => [it_(titel, 42, 813, 9, sida), it_('Hej, jag heter', 310, 815, 9, sida), it_(String(sida), 572, 12, 9, sida)];
/** Uppgift "3 / 2/5 =" med topp på y0. */
const division = (nr: number, y0: number, sida: number) => [
  it_(String(nr), 21, y0, 10, sida), it_('3', 18, y0 - 29, 14, sida), it_('/', 29, y0 - 29, 14, sida),
  it_('2', 42, y0 - 20, 14, sida), it_('5', 42, y0 - 35, 14, sida), it_('=', 55, y0 - 29, 14, sida), it_('Svar', 358, y0 - 173, 10, sida),
];
const potens = (nr: number, y0: number, sida: number) => [
  it_(String(nr), 21, y0, 10, sida), it_('Skriv talet utan potens och beräkna värdet.', 18, y0 - 19, 10, sida),
  it_('0,4', 18, y0 - 36, 14, sida), it_('2', 37, y0 - 32, 10, sida), it_('=', 47, y0 - 36, 14, sida), it_('Svar', 358, y0 - 173, 10, sida),
];
const saft = (nr: number, y0: number, sida: number) => [
  it_(String(nr), 21, y0, 10, sida), it_('Du häller upp hälften av mjölken.', 18, y0 - 160, 10, sida), it_('Hur mycket mjölk häller du upp?', 18, y0 - 174, 10, sida),
];
const resonemang = (nr: number, y0: number, sida: number) => [
  it_(String(nr), 21, y0, 10, sida), it_('Blir svaret större om du dividerar med 1/3', 18, y0 - 19, 10, sida), it_('än med 3? Visa hur du tänker.', 18, y0 - 33, 10, sida),
  it_('Välj en', 18, y0 - 90, 10, sida), it_(':', 52, y0 - 90, 10, sida), it_('Ja', 90, y0 - 90, 10, sida), it_('Nej', 160, y0 - 90, 10, sida),
];
const tiopotens = (nr: number, y0: number, sida: number) => [it_(String(nr), 21, y0, 10, sida), it_('Skriv talet 10 000 som tiopotens.', 18, y0 - 19, 10, sida)];

const TEST_A = [...huvud('8x 1.4 - 1.5', 1), ...division(1, 743, 1), ...potens(2, 487, 1), ...huvud('8x 1.4 - 1.5', 2), ...saft(3, 743, 2), ...resonemang(4, 487, 2)];
// Samma uppgifter, annat namn och annan sidbrytning (en kopia av testet)
const TEST_KOPIA = [...huvud('Läxa 3 efter 1.5', 1), ...division(1, 743, 1), ...huvud('Läxa 3 efter 1.5', 2), ...potens(2, 743, 2), ...saft(3, 487, 2), ...huvud('Läxa 3 efter 1.5', 3), ...resonemang(4, 743, 3)];
// Diagnosen återanvänder divisionsuppgiften (på en annan plats) och har en egen tiopotensuppgift
const DIAGNOS = [...huvud('Diagnos Kap 1', 1), ...tiopotens(1, 743, 1), ...division(2, 487, 1), ...huvud('Diagnos Kap 1', 2), ...saft(3, 743, 2)];

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  return s;
}
const svar = (...ratt: boolean[]) => ratt.map((r, i) => ({ fraga: `Uppgift ${i + 1}`, svar: r ? '1' : '0', ratt: r }));

describe('Del 153 · Magma-testens uppgifter ur PDF', () => {
  it('läser titel, uppgifter, bråk och exponenter, och klassar delkapitel och förmåga', () => {
    const a = tolkaMagmaPdf(TEST_A, '8x_1.4_-_1.5.pdf', DK);
    expect(a.titel).toBe('8x 1.4 - 1.5');
    expect(a.uppgifter.map((u) => [u.nr, u.text, u.delkapitel, u.formagor.join(''), u.flerval])).toEqual([
      ['1', '3 / 2/5 =', '1.4', 'M', false],
      ['2', 'Skriv talet utan potens och beräkna värdet.\n0,4² =', '1.5', 'M', false],
      ['3', 'Du häller upp hälften av mjölken.\nHur mycket mjölk häller du upp?', '1.4', 'P', false],
      ['4', 'Blir svaret större om du dividerar med 1/3\nän med 3? Visa hur du tänker.\nJa Nej', '1.4', 'R', true],
    ]);
    expect(magmaAvsnittIntervall('8x 1.4 - 1.5')).toEqual({ kapitel: 1, fran: 4, till: 5 });
    expect(magmaAvsnittIntervall('BAS Läxa 2 – efter avsnitt 1.3')).toEqual({ kapitel: 1, fran: 1, till: 3 });
    expect(magmaAvsnittIntervall('Diagnos Kap 1')).toEqual({ kapitel: 1, fran: 1, till: 99 });
    expect(klassaFormaga('Vilken uträkning visar bilden?', true)).toEqual(['B']);
    expect(klassaFormaga('Hur mycket är 14 − 3 ⋅ 2 ?', true)).toEqual(['M']);
    expect(klassaFormaga('En näckros blir dubbelt så stor varje dag. Efter hur många dagar … Förklara hur du tänker.', false)).toEqual(['P', 'R']);
  });

  it('samma uppgifter under annat namn och annan sidbrytning = samma test; delade uppgifter hittas i diagnosen', () => {
    const a = tolkaMagmaPdf(TEST_A, 'a.pdf', DK);
    const k = tolkaMagmaPdf(TEST_KOPIA, 'k.pdf', DK);
    const d = tolkaMagmaPdf(DIAGNOS, 'd.pdf', DK);
    expect(k.testNyckel).toBe(a.testNyckel);
    expect(k.uppgifter.map((u) => u.nyckel)).toEqual(a.uppgifter.map((u) => u.nyckel));
    expect(d.testNyckel).not.toBe(a.testNyckel);
    expect(d.uppgifter[1].nyckel).toBe(a.uppgifter[0].nyckel);           // divisionsuppgiften
    expect(d.uppgifter[2].nyckel).toBe(a.uppgifter[2].nyckel);           // mjölkuppgiften
    expect(d.uppgifter[0]).toMatchObject({ delkapitel: '1.6', formagor: ['M'] });
    let s = sparaMagmaTest(sparaMagmaTest(sparaMagmaTest(bygg(), a), k), d);
    expect(sammaTestSom(s, a).map((t) => t.titel)).toEqual(['Läxa 3 efter 1.5']);
    expect([...deladeUppgifter(s, d).entries()]).toEqual([['2', [{ titel: '8x 1.4 - 1.5', nr: '1' }, { titel: 'Läxa 3 efter 1.5', nr: '1' }]], ['3', [{ titel: '8x 1.4 - 1.5', nr: '3' }, { titel: 'Läxa 3 efter 1.5', nr: '3' }]]]);
    expect(magmaTestForProv(s, '8x 1.4 - 1.5')?.titel).toBe('8x 1.4 - 1.5');
    expect(magmaTestForProv(s, '8x_1.4_-_1.5')?.titel).toBe('8x 1.4 - 1.5');
    // Lärarens klassning gäller uppgiften i alla test
    s = sattMagmaKlassning(s, a.uppgifter[0].nyckel, { delkapitel: '1.3', formagor: ['M', 'B'] });
    expect(magmaKlassFor(s, d.uppgifter[1])).toEqual({ delkapitel: '1.3', formagor: ['M', 'B'], andrad: true });
  });

  it('analys per uppgift, delkapitel och förmåga: samma uppgift i olika test räknas ihop; senaste försöket per test', () => {
    let s = bygg();
    for (const [items, fil] of [[TEST_A, 'a.pdf'], [TEST_KOPIA, 'k.pdf'], [DIAGNOS, 'd.pdf']] as const) s = sparaMagmaTest(s, tolkaMagmaPdf([...items], fil, DK));
    const imp = (prov: string, datum: string, rader: Array<[string, boolean[]]>) => {
      s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov, datum, rader: rader.map(([namn, r]) => ({ namn, poang: r.filter(Boolean).length, maxPoang: r.length, svar: svar(...r) })) }).s;
    };
    imp('8x 1.4 - 1.5', '2026-09-20', [['Anna Berg', [true, true, false, true]], ['Omar Ali', [false, true, false, false]]]);
    imp('Läxa 3 efter 1.5', '2026-09-27', [['Omar Ali', [true, true, false, false]]]);    // samma test igen — senaste räknas
    imp('Diagnos Kap 1', '2026-10-01', [['Anna Berg', [true, true, true]], ['Omar Ali', [false, false, false]]]);
    imp('Okänt test', '2026-10-02', [['Anna Berg', [true]]]);

    const a = magmaDelkapitelAnalys(s, 'k', 'ma');
    expect(a.sammaTest).toEqual([['8x 1.4 - 1.5', 'Läxa 3 efter 1.5']]);
    expect(a.utanPdf).toEqual(['Okänt test']);
    const div = a.uppgifter.find((u) => u.text === '3 / 2/5 =')!;
    expect(div).toMatchObject({ delkapitel: '1.4', ratt: 3, totalt: 4, andel: 75 });       // A: Anna ✓ Omar(senaste) ✓ · D: Anna ✓ Omar ✗
    expect(div.forekomster).toEqual([{ titel: '8x 1.4 - 1.5', nr: '1' }, { titel: 'Läxa 3 efter 1.5', nr: '1' }, { titel: 'Diagnos Kap 1', nr: '2' }]);
    expect(a.delkapitel).toEqual([
      { kod: '1.4', ratt: 5, totalt: 10, andel: 50 },
      { kod: '1.5', ratt: 2, totalt: 2, andel: 100 },
      { kod: '1.6', ratt: 1, totalt: 2, andel: 50 },
    ]);
    expect(a.formagor).toEqual([{ formaga: 'M', ratt: 6, totalt: 8, andel: 75 }, { formaga: 'P', ratt: 1, totalt: 4, andel: 25 }, { formaga: 'R', ratt: 1, totalt: 2, andel: 50 }]);
    const omar = a.elever.find((e) => e.elevId === 'e2')!;
    expect(omar.delkapitel['1.4']).toEqual({ ratt: 1, totalt: 5, andel: 20 });
    expect(omar.behoverForbattra).toEqual(['1.4']);
    expect(a.elever.find((e) => e.elevId === 'e1')!.behoverForbattra).toEqual([]);

    // Den vanliga Magma-analysen visar kopian och originalet som ett test
    const m = magmaAnalys(s, 'k', 'ma');
    expect(m.prov.map((p) => [p.prov, p.antal])).toEqual([['8x 1.4 - 1.5 = Läxa 3 efter 1.5', 2], ['Diagnos Kap 1', 2], ['Okänt test', 1]]);
    expect(m.elever.find((e) => e.elevId === 'e2')!.procent[0]).toBe(50);                // Omars senaste försök
  });
});
