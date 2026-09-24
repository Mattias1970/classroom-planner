import { describe, expect, it } from 'vitest';
import { begreppSamband, elevLektionsExit, lektionsExit } from '../src/domain/dashboard.js';
import { importeraResultat } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

function bas(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 5, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Provlund', grupp: 'B' });
  return s;
}
const svar = (n: number, ratt: number) => Array.from({ length: n }, (_, i) => ({ fraga: `Begrepp ${i + 1}?`, svar: i < ratt ? 'rätt' : 'fel', ratt: i < ratt, facit: 'rätt' }));
function prov(s: Struktur, kalla: 'socrative-laxforhor' | 'socrative-exit', prov: string, datum: string, rader: Array<[string, number, number]>): Struktur {
  return importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rader: rader.map(([namn, n, ratt]) => ({ namn, poang: ratt, maxPoang: n, svar: svar(n, ratt) })) }).s;
}

describe('Del 149: lektionsanalys bara på exit tickets', () => {
  it('lektioner utan exit ticket tas inte med; läxförhöret påverkar inte siffrorna', () => {
    let s = bas();
    s = prov(s, 'socrative-laxforhor', 'L1', '2026-09-04', [['Anna Testsson', 10, 10], ['Omar Provlund', 10, 2]]);
    s = prov(s, 'socrative-exit', 'E1', '2026-09-04', [['Anna Testsson', 4, 4], ['Omar Provlund', 4, 2]]);
    s = prov(s, 'socrative-laxforhor', 'L2', '2026-09-11', [['Anna Testsson', 10, 9]]);
    const l = lektionsExit(s, { klassId: 'k' });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ prov: 'E1', snitt: 75, klarade: 1, klaradeProcent: 50 });
    const e = elevLektionsExit(s, { klassId: 'k' });
    expect(e.map((x) => [x.elev.namn, x.snitt, x.klarade, x.lektioner])).toEqual([['Anna Testsson', 100, 1, 1], ['Omar Provlund', 50, 0, 1]]);
  });
});

describe('Del 149: antal begrepp ↔ resultat', () => {
  it('fler begrepp → lägre snitt ger negativt r och lutning; läxförhör och exit räknas var för sig', () => {
    let s = bas();
    s = prov(s, 'socrative-laxforhor', 'L1', '2026-09-04', [['Anna Testsson', 4, 4], ['Omar Provlund', 4, 4]]);   // 4 begrepp → 100 %
    s = prov(s, 'socrative-laxforhor', 'L2', '2026-09-11', [['Anna Testsson', 8, 6], ['Omar Provlund', 8, 6]]);   // 8 → 75 %
    s = prov(s, 'socrative-laxforhor', 'L3', '2026-09-18', [['Anna Testsson', 12, 8], ['Omar Provlund', 12, 4]]); // 12 → 50 %
    s = prov(s, 'socrative-exit', 'E1', '2026-09-04', [['Anna Testsson', 3, 3]]);
    const [lax, exit] = begreppSamband(s, { klassId: 'k' });
    expect(lax.kalla).toBe('socrative-laxforhor');
    expect(lax.punkter.map((p) => [p.begrepp, p.snitt])).toEqual([[4, 100], [8, 75], [12, 50]]);
    expect(lax.r).toBe(-1);
    expect(lax.lutning).toBe(-6.2);
    expect(lax.text).toContain('Starkt samband (r = -1.00): fler begrepp går ihop med lägre resultat, ungefär 6.2 procentenheter per begrepp.');
    expect(exit.punkter).toHaveLength(1);
    expect(exit.r).toBeNull();
    expect(exit.text).toBe('För få tillfällen (minst tre behövs).');
  });

  it('utan frågedata används maxpoängen; lika många begrepp överallt ger inget att jämföra', () => {
    let s = bas();
    for (const [p, d] of [['E1', '2026-09-04'], ['E2', '2026-09-11'], ['E3', '2026-09-18']]) {
      s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: p, datum: d, rader: [{ namn: 'Anna Testsson', poang: 3, maxPoang: 5 }] }).s;
    }
    const exit = begreppSamband(s, { klassId: 'k' })[1];
    expect(exit.punkter.map((p) => p.begrepp)).toEqual([5, 5, 5]);
    expect(exit.r).toBeNull();
    expect(exit.text).toContain('lika många begrepp');
  });
});
