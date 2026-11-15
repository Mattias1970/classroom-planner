/**
 * Del 253 · En fråga som skrivits om men har samma svar står under samma frågenummer — också när svaret fått sitt
 * andra namn inom parentes ('självständiga nervsystemet' → 'Autonoma (självständiga) nervsystemet'). Frågor med
 * olika svar hålls isär. Förhören med den äldre formuleringen märks ut.
 */
import { describe, expect, it } from 'vitest';
import { fragematris } from '../src/domain/delkapiteltrend.js';
import { begreppsvarianter, enaFragor } from '../src/domain/fragaidentitet.js';
import { importeraResultat, type FragaSvar, type Resultat } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const IMPULS = 'Svaga elektriska signaler som sänds mellan nervceller.';
const MYELIN = 'Skyddande fettlager som omger vissa nervtrådar.';
const PERIFERA_DA = 'Alla nerver som går till och från hjärna och ryggmärg.';
const PERIFERA_NU = 'Kroppens nerver, som går till och från hjärna och ryggmärg.';
const SJALV_DA = 'Del av nervsystemet som vi inte kan styra med vår vilja.';
const SJALV_NU = 'De delar av nervsystemet som vi inte kan påverka med vår vilja.';
const HINNOR = 'Omger och skyddar hjärnan.';

type Par = [fraga: string, facit: string];
const EXIT: Par[] = [[IMPULS, 'A. • nervimpuls'], [MYELIN, 'B. • myelin'], [PERIFERA_DA, 'C. • perifera nervsystemet'], [SJALV_DA, 'D. • självständiga nervsystemet']];
const LAXA: Par[] = [[IMPULS, 'A. • nervimpuls'], [PERIFERA_NU, 'B. • perifera nervsystemet'], [SJALV_NU, 'C. • Autonoma (självständiga) nervsystemet'], [HINNOR, 'D. • hjärnhinnor']];

function svar(par: Par[], ratt: boolean[]): FragaSvar[] {
  return par.map(([fraga, facit], i) => ({ fraga, svar: ratt[i] ? facit : 'E. • något annat', ratt: ratt[i], facit }));
}
function bygg(laxor: Array<{ prov: string; datum: string; par: Par[] }> = [{ prov: 'Kap 7.1', datum: '2026-10-12', par: LAXA }]): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
  const imp = (kalla: 'socrative-exit' | 'socrative-laxforhor', prov: string, datum: string, par: Par[]) => {
    const anna = svar(par, par.map(() => true)); const omar = svar(par, par.map((_, i) => i % 2 === 0));
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, tid: '09:21', rum: 'BIOLOGI8BB', rader: [
      { namn: 'Anna Berg', poang: anna.filter((x) => x.ratt).length, maxPoang: par.length, svar: anna },
      { namn: 'Omar Ali', poang: omar.filter((x) => x.ratt).length, maxPoang: par.length, svar: omar },
    ] }).s;
  };
  imp('socrative-exit', 'Nervsystemet 7.1', '2026-10-09', EXIT);
  for (const l of laxor) imp('socrative-laxforhor', l.prov, l.datum, l.par);
  return s;
}
const f = { klassId: 'k', amneId: 'bi' };

describe('Del 253 · begreppets andra namn inom parentes', () => {
  it('parentesen mitt i ersätter ordet före; parentesen sist står för hela begreppet', () => {
    expect(begreppsvarianter('C. • Autonoma (självständiga) nervsystemet')).toEqual(['autonoma nervsystemet', 'självständiga nervsystemet']);
    expect(begreppsvarianter('DNA (arvsmassa)')).toEqual(['dna', 'arvsmassa']);
    expect(begreppsvarianter('A. • röda blodkroppar (erytrocyter)')).toEqual(['röda blodkroppar', 'erytrocyter']);
  });
  it('utan parentes finns inget andra namn', () => {
    expect(begreppsvarianter('A. • nervimpuls')).toEqual([]);
    expect(begreppsvarianter('(nervimpuls)')).toEqual([]);
    expect(begreppsvarianter(undefined)).toEqual([]);
  });
});

describe('Del 253 · omskriven fråga med samma svar står under samma frågenummer', () => {
  it('samma svar → en fråga (senaste formuleringen); olika svar → olika frågor', () => {
    const m = fragematris(bygg(), f);
    expect(m.fragor.map((q) => [q.nr, q.fraga, q.begrepp])).toEqual([
      [1, IMPULS, 'nervimpuls'],
      [2, MYELIN, 'myelin'],                                            // bara i exit ticket — står kvar för sig
      [3, PERIFERA_NU, 'perifera nervsystemet'],
      [4, SJALV_NU, 'Autonoma (självständiga) nervsystemet'],           // 'självständiga nervsystemet' = samma svar
      [5, HINNOR, 'hjärnhinnor'],                                       // ny fråga med annat svar — egen kolumn
    ]);
    // exit ticket har inte hjärnhinnor, läxförhöret har inte myelin — skillnaden finns kvar
    expect(m.rader.map((r) => r.celler.map((c) => c !== null))).toEqual([[true, true, true, true, false], [true, false, true, true, true]]);
  });

  it('förhöret med den äldre formuleringen märks ut — det med den nya gör det inte', () => {
    const m = fragematris(bygg(), f);
    expect(m.rader.map((r) => r.celler.map((c) => c?.aldreFraga ?? null))).toEqual([
      [null, null, PERIFERA_DA, SJALV_DA, null],
      [null, null, null, null, null],
    ]);
    expect(m.fragor[3].aldre).toEqual([{ fraga: SJALV_DA, begrepp: 'självständiga nervsystemet', forst: '2026-10-09', sist: '2026-10-09' }]);
    expect(m.fragor[2].aldre).toEqual([{ fraga: PERIFERA_DA, begrepp: 'perifera nervsystemet', forst: '2026-10-09', sist: '2026-10-09' }]);
    expect(m.fragor[0].aldre).toBeUndefined();
    expect(m.fragor[1].aldre).toBeUndefined();
  });

  it('resultaten räknas som vanligt — ramen ändrar inga siffror', () => {
    const m = fragematris(bygg(), f);
    expect(m.rader[0].celler[3]).toEqual({ bedomda: 2, ratt: 1, procent: 50, aldreFraga: SJALV_DA });
    expect(m.rader[1].celler[3]).toEqual({ bedomda: 2, ratt: 2, procent: 100 });
  });

  it('den äldre formuleringens tid sträcker sig över alla förhör där den användes', () => {
    const m = fragematris(bygg([
      { prov: 'Kap 7.1', datum: '2026-10-12', par: EXIT },
      { prov: 'Kap 7.1 igen', datum: '2026-10-16', par: LAXA },
    ]), f);
    expect(m.fragor[3].aldre).toEqual([{ fraga: SJALV_DA, begrepp: 'självständiga nervsystemet', forst: '2026-10-09', sist: '2026-10-12' }]);
    expect(m.rader.map((r) => r.celler[3]?.aldreFraga !== undefined)).toEqual([true, true, false]);
  });

  it('två frågor i samma quiz slås inte ihop för att den ena har den andras namn inom parentes', () => {
    const BADA: Par[] = [[SJALV_DA, 'A. • självständiga nervsystemet'], [SJALV_NU, 'B. • Autonoma (självständiga) nervsystemet']];
    const m = fragematris(bygg([{ prov: 'Kap 7.1', datum: '2026-10-12', par: BADA }]), f);
    expect(m.fragor.filter((q) => q.fraga === SJALV_DA || q.fraga === SJALV_NU).map((q) => q.fraga)).toEqual([SJALV_DA, SJALV_NU]);
  });

  it('enaFragor: den äldre förekomsten bär sin ursprungliga text, indata muteras inte', () => {
    const rs: Resultat[] = [
      { id: 'r1', elevId: 'a', amneId: 'bi', kalla: 'socrative-exit', prov: 'Nervsystemet 7.1', datum: '2026-10-09', rum: 'BIOLOGI8BB', poang: 4, maxPoang: 4, svar: svar(EXIT, [true, true, true, true]) },
      { id: 'r2', elevId: 'a', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Kap 7.1', datum: '2026-10-12', rum: 'BIOLOGI8BB', poang: 4, maxPoang: 4, svar: svar(LAXA, [true, true, true, true]) },
    ];
    const fore = JSON.stringify(rs);
    const ut = enaFragor(rs).resultat;
    expect(JSON.stringify(rs)).toBe(fore);
    expect(ut[0].svar!.map((sv) => [sv.fraga, sv.aldreFraga])).toEqual([[IMPULS, undefined], [MYELIN, undefined], [PERIFERA_NU, PERIFERA_DA], [SJALV_NU, SJALV_DA]]);
    expect(ut[1]).toBe(rs[1]);   // det senaste förhöret har redan den formulering som gäller
  });
});
