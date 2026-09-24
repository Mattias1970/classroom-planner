import { describe, expect, it } from 'vitest';
import { glomskaAnalys } from '../src/domain/glomska.js';
import type { Fragematris } from '../src/domain/delkapiteltrend.js';

/** Matris med en rad per förhör och elevens svar per fråga (t = rätt, f = fel, - = ej med). */
function matris(svar: string[]): Fragematris {
  const n = svar[0].length;
  return {
    fragor: Array.from({ length: n }, (_, i) => ({ nr: i + 1, fraga: `Fråga ${i + 1}?`, kod: '6.1', ursprung: 'L1', begrepp: `begrepp${i + 1}` })),
    rader: svar.map((rad, j) => ({
      nyckel: `r${j}`, prov: `L${j + 1}`, datum: `2026-09-${String(j + 1).padStart(2, '0')}`, kalla: 'socrative-laxforhor', test: 'test61',
      celler: rad.split('').map((c) => (c === '-' ? null : { bedomda: 1, ratt: c === 't' ? 1 : 0, procent: c === 't' ? 100 : 0 })),
      elevCeller: rad.split('').map((c) => (c === '-' ? null : c === 't')),
    })),
    grupper: [{ kod: '6.1', etikett: 'test61', ursprung: 'L1', fran: 1, till: n }],
    utanSvar: [],
  };
}

describe('Del 151: minnet — glömska efter att ett begrepp kunnats', () => {
  it('upprepade fel flaggas, enstaka fel noteras, rätt varje gång håller i', () => {
    // En sträng per FRÅGA, ett tecken per förhör L1–L4 (t rätt, f fel, - ej med)
    const perFraga = [
      'tttt',   // 1 håller i
      'tftt',   // 2 ett fel, sedan rätt igen → notering
      'ttff',   // 3 fel de två senaste efter att ha kunnats → flagga
      'ffff',   // 4 aldrig rätt → hör inte hit (kvar att lära)
      'tttf',   // 5 ett fel sist → notering (kan vara felklick)
      't---',   // 6 inte testat igen
    ];
    const g = glomskaAnalys(matris([0, 1, 2, 3].map((j) => perFraga.map((f) => f[j]).join(''))));
    expect(g.hallerI).toBe(1);
    expect(g.borjarGlomma.map((b) => b.nr)).toEqual([3]);
    expect(g.enstakaFel.map((b) => b.nr)).toEqual([2, 5]);
    expect(g.testadeIgen).toBe(4);
    expect(g.procentHallerI).toBe(25);
    expect(g.borjarGlomma[0]).toMatchObject({ kod: '6.1', begrepp: 'begrepp3', kundeProv: 'L1', kundeDatum: '2026-09-01', senasteRatt: false, testadEfter: 3 });
    expect(g.borjarGlomma[0].fel.map((x) => x.prov)).toEqual(['L3', 'L4']);
  });

  it('ett enda fel efter att ha kunnats flaggas aldrig; utan återtest finns inget att säga', () => {
    const g = glomskaAnalys(matris(['t', 'f']));
    expect(g.borjarGlomma).toEqual([]);
    expect(g.enstakaFel).toHaveLength(1);
    expect(glomskaAnalys(matris(['t'])).testadeIgen).toBe(0);
    expect(glomskaAnalys(matris(['t'])).procentHallerI).toBeNull();
  });
});
