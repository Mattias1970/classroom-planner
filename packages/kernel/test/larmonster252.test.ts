/**
 * Del 252 · Lärmönster: eleven jämförs med klassen på läxförhör och exit ticket, lektion för lektion.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FORKLARINGAR, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, larmonster, lektionstester, resetIdRaknare, tomStruktur,
  type ResultatKalla, type Struktur,
} from '../src/index.js';

beforeEach(resetIdRaknare);

const NAMN = ['Anna Berg', 'Omar Ali', 'Pia Provlund', 'Kim Testsson', 'Hugo Hemsson', 'Lea Lektlund'];
/** Poäng av 10 per elev: Hugo följer klassen på läxförhören men tappar på exit; Lea tvärtom. */
const LAX = [9, 9, 9, 9, 9, 5];
const EXIT = [8, 8, 8, 8, 4, 8];

function bygg(dagar: string[]): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  NAMN.forEach((n, i) => { s = laggTillElev(s, { id: `e${i}`, klassId: 'k', namn: n, grupp: 'A' }); });
  const imp = (kalla: ResultatKalla, prov: string, datum: string, poang: number[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rader: NAMN.map((namn, i) => ({ namn, poang: poang[i], maxPoang: 10 })) }).s;
  };
  dagar.forEach((d, i) => { imp('socrative-laxforhor', `Läxa ${i + 1}`, d, LAX); imp('socrative-exit', `Exit ${i + 1}`, d, EXIT); });
  return s;
}
const f = { klassId: 'k', amneId: 'bi' };

describe('Del 252 · larmonster', () => {
  it('den som följer klassen på läxförhören men ligger under på exit tickets visar mer efter att ha övat hemma — och tvärtom', () => {
    const m = larmonster(bygg(['2026-09-07', '2026-09-14', '2026-09-21']), f);
    expect(m.map((x) => [x.elev.namn, x.lektioner, x.laxMotKlass, x.exitMotKlass, x.monster])).toEqual([
      ['Anna Berg', 3, 7, 7, null],
      ['Hugo Hemsson', 3, 7, -33, 'hemma'],
      ['Kim Testsson', 3, 7, 7, null],
      ['Lea Lektlund', 3, -33, 7, 'lektion'],
      ['Omar Ali', 3, 7, 7, null],
      ['Pia Provlund', 3, 7, 7, null],
    ]);
  });

  it('färre än tre lektioner med båda testen pekar inte ut något mönster', () => {
    const m = larmonster(bygg(['2026-09-07', '2026-09-14']), f);
    expect(m.map((x) => [x.lektioner, x.monster])).toEqual(Array.from({ length: 6 }, () => [2, null]));
  });

  it('en elev som ligger lågt på båda testen har inget mönster — bara skillnaden mellan testen pekas ut', () => {
    let s = bygg(['2026-09-07', '2026-09-14', '2026-09-21']);
    s = laggTillElev(s, { id: 'e9', klassId: 'k', namn: 'Sam Svagsson', grupp: 'A' });
    for (const [d, i] of [['2026-09-07', 1], ['2026-09-14', 2], ['2026-09-21', 3]] as const) {
      s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: `Läxa ${i}`, datum: d, rader: [{ namn: 'Sam Svagsson', poang: 4, maxPoang: 10 }] }).s;
      s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: `Exit ${i}`, datum: d, rader: [{ namn: 'Sam Svagsson', poang: 3, maxPoang: 10 }] }).s;
    }
    const sam = larmonster(s, f).find((x) => x.elev.namn === 'Sam Svagsson')!;
    expect(sam.laxMotKlass).toBeLessThan(-30);
    expect(sam.exitMotKlass).toBeLessThan(-30);
    expect(sam.monster).toBeNull();
  });

  it('lektioner med bara ett av testen räknas inte', () => {
    let s = bygg(['2026-09-07', '2026-09-14', '2026-09-21']);
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Bara exit', datum: '2026-09-28', rader: NAMN.map((namn) => ({ namn, poang: 1, maxPoang: 10 })) }).s;
    const bara = lektionstester(s, f).at(-1)!;
    expect([bara.laxforhorProv, bara.exitProv, bara.antalBada, bara.elever.length]).toEqual([null, 'Bara exit', 0, 6]);
    expect(larmonster(s, f).map((x) => x.lektioner)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('förklaringen säger vad kolumnen och mönstren betyder', () => {
    const text = FORKLARINGAR.lektionstest.lang.join(' ');
    expect(text).toContain('Gjorde båda');
    expect(text).toContain('övat hemma');
    expect(text).toContain('följs upp med eleven');
  });
});
