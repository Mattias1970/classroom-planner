import { describe, expect, it } from 'vitest';
import {
  elevKurva, elevMatris, frageKort, klassKurva, provTillfallen, sokElever, tolkaVeckor, trendFor,
} from '../src/domain/dashboard.js';
import type { Resultat } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

// Fejkade elevnamn — verkliga elevuppgifter hör inte hemma i kodrepot.
function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 4, start: '10:00', slut: '11:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A', socrativeId: 'ANNA' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Pia Provlund', grupp: 'A' });
  const r = (id: string, elevId: string, kalla: Resultat['kalla'], prov: string, datum: string, poang: number, amneId = 'ma'): Resultat =>
    ({ id, elevId, amneId, kalla, prov, datum, poang, maxPoang: 10 });
  return { ...s, resultat: [
    // v.35 exit: Anna 9, Omar 6 · v.36 exit: Anna 10, Omar 8 · v.37 exit: Anna 10, Omar 9, Pia 7
    r('1', 'e1', 'socrative-exit', 'Quiz 1.1a', '2026-08-26', 9), r('2', 'e2', 'socrative-exit', 'Quiz 1.1a', '2026-08-26', 6),
    r('3', 'e1', 'socrative-exit', 'Quiz 1.1b', '2026-09-02', 10), r('4', 'e2', 'socrative-exit', 'Quiz 1.1b', '2026-09-02', 8),
    r('5', 'e1', 'socrative-exit', 'Quiz 1.2a', '2026-09-09', 10), r('6', 'e2', 'socrative-exit', 'Quiz 1.2a', '2026-09-09', 9),
    r('7', 'e3', 'socrative-exit', 'Quiz 1.2a', '2026-09-09', 7),
    // läxförhör v.36: Anna 9 (90 % – klarar exakt), Omar 10
    r('8', 'e1', 'socrative-laxforhor', 'Quiz 1.1a', '2026-09-02', 9), r('9', 'e2', 'socrative-laxforhor', 'Quiz 1.1a', '2026-09-02', 10),
    // biologi, ska filtreras bort med amneId=ma
    r('10', 'e1', 'socrative-exit', 'Biologi41', '2026-09-03', 5, 'bi'),
  ] };
}

describe('provTillfallen + klassKurva', () => {
  it('grupperar per datum/källa/prov kronologiskt med snitt, andel klarade och krav', () => {
    const t = provTillfallen(grund(), { klassId: 'k', amneId: 'ma' });
    expect(t.map((x) => `${x.datum} ${x.prov}`)).toEqual([
      '2026-08-26 Quiz 1.1a', '2026-09-02 Quiz 1.1a', '2026-09-02 Quiz 1.1b', '2026-09-09 Quiz 1.2a',
    ]);
    const forsta = t[0];
    expect(forsta).toMatchObject({ kalla: 'socrative-exit', antal: 2, snittProcent: 75, andelKlarade: 50, krav: 70, vecka: 35 });
    const lax = t.find((x) => x.kalla === 'socrative-laxforhor')!;
    expect(lax).toMatchObject({ snittProcent: 95, andelKlarade: 100, krav: 90 }); // 90 % klarar kravet exakt
    expect(klassKurva(grund(), { klassId: 'k' })).toHaveLength(5); // + biologi
  });

  it('filtrerar på källor och veckointervall (inkl. årsskifte)', () => {
    const s = grund();
    expect(provTillfallen(s, { klassId: 'k', kallor: ['socrative-laxforhor'] })).toHaveLength(1);
    expect(provTillfallen(s, { klassId: 'k', amneId: 'ma', veckaFran: 36, veckaTill: 36 })).toHaveLength(2);
    expect(provTillfallen(s, { klassId: 'k', amneId: 'ma', veckaFran: 37, veckaTill: 2 })).toHaveLength(1);
  });
});

describe('frageKort', () => {
  it('ett kort per källa + helhet med fråga, snitt, andel och trend', () => {
    const kort = frageKort(grund(), { klassId: 'k', amneId: 'ma' });
    expect(kort.map((k) => k.kalla)).toEqual(['socrative-laxforhor', 'socrative-exit', 'magma', 'digiexam', 'helhet']);
    const exit = kort[1];
    expect(exit.fraga).toBe('Lär sig eleven på lektionen?');
    expect(exit).toMatchObject({ antalProv: 3, antalElever: 3, krav: 70, serie: [75, 90, 87] });
    expect(exit.snittProcent).toBe(84); // 9+6+10+8+10+9+7 = 59/7 → 84
    expect(exit.andelKlarade).toBe(86); // 6 av 7 ≥ 70
    expect(exit.trend).toBe('upp');
    expect(kort[2]).toMatchObject({ kalla: 'magma', antalProv: 0, snittProcent: null, trend: null });
    expect(kort[4]).toMatchObject({ kalla: 'helhet', antalProv: 4, krav: null });
  });
});

describe('trendFor', () => {
  it('kräver tre punkter och 5 procentenheters skillnad', () => {
    expect(trendFor([50, 90])).toBeNull();
    expect(trendFor([50, 60, 90])).toBe('upp');
    expect(trendFor([90, 60, 50])).toBe('ned');
    expect(trendFor([70, 72, 71, 73])).toBe('jamn');
  });
});

describe('elevMatris + elevKurva + sokElever', () => {
  it('bygger elev × tillfälle med tomma celler, elevsnitt och sökfilter', () => {
    const m = elevMatris(grund(), { klassId: 'k', amneId: 'ma', kallor: ['socrative-exit'] });
    expect(m.tillfallen).toHaveLength(3);
    expect(m.rader.map((r) => r.elev.namn)).toEqual(['Anna Berg', 'Omar Ali', 'Pia Provlund']);
    const pia = m.rader[2];
    expect(pia.celler).toEqual([null, null, { procent: 70, klarat: true, poang: 7, maxPoang: 10 }]);
    expect(pia).toMatchObject({ snitt: 70, klarade: 1, bedomda: 1 });
    expect(m.rader[1]).toMatchObject({ snitt: 77, klarade: 2, bedomda: 3 });
    expect(elevMatris(grund(), { klassId: 'k' }, 'anna').rader.map((r) => r.elev.id)).toEqual(['e1']);
    expect(sokElever(grund(), 'k', 'ANNA').map((e) => e.id)).toEqual(['e1']); // Student ID
  });

  it('elevkurvan är kronologisk med krav per punkt', () => {
    const k = elevKurva(grund(), 'e1', { klassId: 'k', amneId: 'ma' });
    expect(k.map((p) => p.procent)).toEqual([90, 90, 100, 100]); // läxförhöret sorteras före exit samma dag
    expect(k[1]).toMatchObject({ kalla: 'socrative-laxforhor', krav: 90, klarat: true, vecka: 36 });
  });
});

describe('tolkaVeckor', () => {
  it('läser v.35–43, 35-43 och en enskild vecka', () => {
    expect(tolkaVeckor('v.35–43')).toEqual({ veckaFran: 35, veckaTill: 43 });
    expect(tolkaVeckor('35-43')).toEqual({ veckaFran: 35, veckaTill: 43 });
    expect(tolkaVeckor('v 40')).toEqual({ veckaFran: 40, veckaTill: 40 });
    expect(tolkaVeckor('vecka')).toBeNull();
    expect(tolkaVeckor('0-99')).toBeNull();
  });
});

describe('Del 58: veckoserier, samband, kluster, grupper', async () => {
  const { veckoSerier, pearson, sambandsanalys, trendKluster, gruppSnitt, periodDelta } = await import('../src/domain/dashboard.js');
  const { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } = await import('../src/domain/struktur.js');
  const { tomStruktur } = await import('../src/domain/typer.js');
  const { importeraResultat } = await import('../src/domain/resultat.js');

  function bygg() {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
    s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'A' });
    const imp = (kalla: 'socrative-laxforhor' | 'socrative-exit', prov: string, datum: string, p: number[]) => {
      s = importeraResultat(s, { klassId: 'k', kalla, prov, datum, rader: [
        { namn: 'Anna Berg', poang: p[0], maxPoang: 10 }, { namn: 'Omar Ali', poang: p[1], maxPoang: 10 }, { namn: 'Pia Provlund', poang: p[2], maxPoang: 10 }] }).s;
    };
    // v.35: exit; v.36: läxförhör + exit; v.37: läxförhör + exit
    imp('socrative-exit', 'E1', '2026-08-26', [6, 3, 9]);
    imp('socrative-laxforhor', 'L1', '2026-09-02', [7, 4, 10]);
    imp('socrative-exit', 'E2', '2026-09-02', [8, 4, 10]);
    imp('socrative-laxforhor', 'L2', '2026-09-09', [9, 5, 10]);
    imp('socrative-exit', 'E3', '2026-09-09', [10, 2, 10]);
    return s;
  }
  const f = { klassId: 'k' };

  it('veckoSerier ger snitt per vecka och källa', () => {
    const v = veckoSerier(bygg(), f);
    expect(v.veckor).toEqual([35, 36, 37]);
    expect(v.serier['socrative-exit']).toEqual([60, 73, 73]);
    expect(v.serier['socrative-laxforhor']).toEqual([null, 70, 80]);
    expect(v.serier.helhet[1]).toBe(72);
  });

  it('pearson och sambandsanalys', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBe(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    const sb = sambandsanalys(bygg(), f);
    expect(sb).toHaveLength(1);
    expect(sb[0]).toMatchObject({ a: 'socrative-laxforhor', b: 'socrative-exit', n: 3 });
    expect(sb[0].r).toBeGreaterThan(0.9);
  });

  it('trendKluster: Anna stigande, Pia stabil, Omar i riskzon', () => {
    const kl = trendKluster(bygg(), f);
    const namn = (k: string) => kl.find((x) => x.kluster === k)!.elever.map((e) => e.namn);
    expect(namn('stigande')).toEqual(['Anna Berg']);
    expect(namn('stabil')).toEqual(['Pia Provlund']);
    expect(namn('riskzon')).toEqual(['Omar Ali']);
    expect(namn('ojamn')).toEqual([]);
    expect(kl[0].serie).toEqual([60, 80, 70, 100, 90]); // samma dag: exit före läxförhör (provnamn)
  });

  it('gruppSnitt jämför A och B', () => {
    const g = gruppSnitt(bygg(), f);
    expect(g[0]).toMatchObject({ grupp: 'A', antalElever: 2 });
    expect(g[0].perKalla['socrative-exit']).toBe(88);
    expect(g[1].perKalla['socrative-laxforhor']).toBe(45);
    expect(g[1].perKalla.magma).toBeNull();
  });

  it('periodDelta', () => {
    expect(periodDelta([60, 70, 80, 90])).toBe(20);
    expect(periodDelta([50])).toBeNull();
  });
});

describe('Del 59: närvaro härledd ur Socrative-tillfällen', async () => {
  const { narvaroLektioner, elevNarvaro, narvaroKort, tidPaDagen, sambandNarvaro } = await import('../src/domain/dashboard.js');
  const { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } = await import('../src/domain/struktur.js');
  const { tomStruktur } = await import('../src/domain/typer.js');
  const { importeraResultat } = await import('../src/domain/resultat.js');

  function bygg() {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    for (const [id, namn] of [['a', 'Anna Berg'], ['b', 'Omar Ali'], ['c', 'Pia Provlund'], ['d', 'Ted Testsson']] as const) {
      s = laggTillElev(s, { id, klassId: 'k', namn, grupp: 'A' });
    }
    const rad = (namn: string, p: number) => ({ namn, poang: p, maxPoang: 10 });
    // Onsdag 26 aug 09:05: läxförhör (Ted saknas) + exit (Ted och Pia saknas) → Ted frånvarande, Pia närvarande
    s = importeraResultat(s, { klassId: 'k', kalla: 'socrative-laxforhor', prov: 'L1', datum: '2026-08-26', tid: '09:05', rader: [rad('Anna Berg', 9), rad('Omar Ali', 8), rad('Pia Provlund', 10)] }).s;
    s = importeraResultat(s, { klassId: 'k', kalla: 'socrative-exit', prov: 'E1', datum: '2026-08-26', tid: '09:50', rader: [rad('Anna Berg', 8), rad('Omar Ali', 5)] }).s;
    // Fredag 28 aug 13:10: exit — Omar saknas
    s = importeraResultat(s, { klassId: 'k', kalla: 'socrative-exit', prov: 'E2', datum: '2026-08-28', tid: '13:10', rader: [rad('Anna Berg', 9), rad('Pia Provlund', 9), rad('Ted Testsson', 4)] }).s;
    // Magma-test räknas inte som lektion för närvaro
    s = importeraResultat(s, { klassId: 'k', kalla: 'magma', prov: 'M1', datum: '2026-08-31', rader: [rad('Anna Berg', 9)] }).s;
    return s;
  }
  const f = { klassId: 'k' };

  it('slår ihop läxförhör + exit samma dag till en lektion och härleder frånvaro', () => {
    const l = narvaroLektioner(bygg(), f);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ datum: '2026-08-26', veckodag: 3, tid: '09:05', prov: ['E1', 'L1'], franvarande: ['d'], narvaroProcent: 75 });
    expect(l[1]).toMatchObject({ datum: '2026-08-28', veckodag: 5, franvarande: ['b'], narvaroProcent: 75 });
  });

  it('per elev, kort och trend', () => {
    const e = elevNarvaro(bygg(), f);
    expect(e.find((x) => x.elev.id === 'a')).toMatchObject({ lektioner: 2, narvarande: 2, narvaroProcent: 100, franvaroDatum: [] });
    expect(e.find((x) => x.elev.id === 'd')).toMatchObject({ narvaroProcent: 50, franvaroDatum: ['2026-08-26'] });
    const k = narvaroKort(bygg(), f);
    expect(k).toMatchObject({ antalLektioner: 2, narvaroProcent: 75, fraga: 'Är eleven på lektionen?' });
    expect(k.riskElever.map((x) => x.id).sort()).toEqual(['b', 'd']);
    expect(k.perVecka).toEqual([{ vecka: 35, procent: 75 }]);
  });

  it('tid på dagen: veckodag × pass', () => {
    const celler = tidPaDagen(bygg(), f);
    expect(celler).toHaveLength(20);
    expect(celler.find((c) => c.veckodag === 3 && c.pass === '08–10')).toMatchObject({ antal: 1, snittProcent: 80, narvaroProcent: 75 });
    expect(celler.find((c) => c.veckodag === 5 && c.pass === '12–14')).toMatchObject({ antal: 1, snittProcent: 73 });
    expect(celler.find((c) => c.veckodag === 1 && c.pass === '08–10')).toMatchObject({ antal: 0, snittProcent: null });
  });

  it('samband närvaro ↔ helhetsresultat', () => {
    const sb = sambandNarvaro(bygg(), f);
    expect(sb).not.toBeNull();
    expect(sb!.n).toBe(4);
    expect(sb!.r).toBeGreaterThan(0); // Anna (100 % närvaro, högst snitt) drar upp
  });
});

describe('Del 63: trendLinje', async () => {
  const { trendLinje } = await import('../src/domain/dashboard.js');
  it('anpassar en rät linje och hoppar luckor, null utanför mätpunkterna', () => {
    expect(trendLinje([50, null, 70, 90])).toEqual([48.6, 61.4, 74.3, 87.1]); // minsta kvadrat, ej genom ändpunkterna
    expect(trendLinje([50, 60, 70, 80])).toEqual([50, 60, 70, 80]);
    expect(trendLinje([null, 40, 40, null])).toEqual([null, 40, 40, null]);
    expect(trendLinje([70])).toEqual([null]);
  });
});

describe('Del 64: halvklass A/B slås ihop till ett tillfälle; dagfilter', async () => {
  const { provTillfallen, elevMatris, narvaroLektioner, lektionsDagar, tillfalleIndex } = await import('../src/domain/dashboard.js');
  const { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, laggTillAmne } = await import('../src/domain/struktur.js');
  const { tomStruktur } = await import('../src/domain/typer.js');
  const { importeraResultat } = await import('../src/domain/resultat.js');

  function bygg() {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
    s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
    s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
    s = laggTillElev(s, { id: 'd', klassId: 'k', namn: 'Ted Testsson', grupp: 'B' });
    const rad = (namn: string, p: number) => ({ namn, poang: p, maxPoang: 10 });
    // Halvklass: grupp A måndag 24/8, grupp B torsdag 27/8 — samma rum Biologi41, olika quiznamn i Socrative
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Biologi 4.1 Begrepp', datum: '2026-08-24', rum: 'Biologi41', rader: [rad('Anna Berg', 9), rad('Omar Ali', 7)] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Biologi 4.1 begrepp (B)', datum: '2026-08-27', rum: 'Biologi41', rader: [rad('Pia Provlund', 10)] }).s; // Ted borta
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Exit 4.2', datum: '2026-08-24', rum: 'Biologi42', rader: [rad('Anna Berg', 8), rad('Omar Ali', 6)] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Exit 4.2', datum: '2026-08-27', rum: 'Biologi42', rader: [rad('Pia Provlund', 9), rad('Ted Testsson', 5)] }).s;
    // Omtag av samma läxförhör tre veckor senare → eget tillfälle (utanför fönstret)
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Biologi 4.1 omtag', datum: '2026-09-21', rum: 'Biologi41', rader: [rad('Ted Testsson', 8)] }).s;
    return s;
  }
  const f = { klassId: 'k' };

  it('två halvklassessioner inom en vecka blir ett tillfälle med båda datumen', () => {
    const t = provTillfallen(bygg(), f);
    expect(t.map((x) => `${x.datum}..${x.datumTill} ${x.kalla} n=${x.antal}`)).toEqual([
      '2026-08-24..2026-08-27 socrative-laxforhor n=3',
      '2026-08-24..2026-08-27 socrative-exit n=4',
      '2026-09-21..2026-09-21 socrative-laxforhor n=1',
    ]);
    expect(t[0].sessioner).toEqual(['2026-08-24', '2026-08-27']);
    expect(t[0].snittProcent).toBe(87);
  });

  it('matrisen har en kolumn per sammanslaget tillfälle och alla elever hamnar i den', () => {
    const m = elevMatris(bygg(), f);
    expect(m.tillfallen).toHaveLength(3);
    const pia = m.rader.find((r) => r.elev.id === 'c')!;
    expect(pia.celler.map((c) => c?.procent ?? null)).toEqual([100, 90, null]);
    const ted = m.rader.find((r) => r.elev.id === 'd')!;
    expect(ted.celler.map((c) => c?.procent ?? null)).toEqual([null, 50, 80]);
  });

  it('närvaro räknar halvklassparet som EN lektion — inte 50 % frånvaro', () => {
    const l = narvaroLektioner(bygg(), f);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ datum: '2026-08-24', sessioner: ['2026-08-24', '2026-08-27'], narvaroProcent: 100, franvarande: [] });
    expect(l[1]).toMatchObject({ datum: '2026-09-21', narvarande: ['d'] });
  });

  it('lektionsDagar: läxförhör + exit samma dag = en post med etikett', () => {
    const d = lektionsDagar(bygg(), f);
    expect(d.map((x) => x.etikett)).toEqual(['mån 24 aug · läxförhör + exit · halvklass A+B', 'mån 21 sep · läxförhör']);
    expect(d[0].datumTill).toBe('2026-08-27');
  });

  it('tillfalleIndex skiljer på omtag av samma elev inom fönstret', () => {
    const s = bygg();
    const extra = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Biologi 4.1 Begrepp igen', datum: '2026-08-26', rum: 'Biologi41', rader: [{ namn: 'Anna Berg', poang: 10, maxPoang: 10 }] }).s;
    expect(tillfalleIndex(extra.resultat ?? []).tillfallen.filter((t) => t.nyckel.includes('laxforhor'))).toHaveLength(3);
  });
});

describe('Del 68: Lektionstest — läxförhör och exit ticket per lektion', async () => {
  const { lektionstester, elevLektionstest, median, tillfalleEtiketter, tillfalleKortEtikett, provTillfallen } = await import('../src/domain/dashboard.js');
  const { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, laggTillAmne } = await import('../src/domain/struktur.js');
  const { tomStruktur } = await import('../src/domain/typer.js');
  const { importeraResultat } = await import('../src/domain/resultat.js');

  function bygg() {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
    for (const [id, namn] of [['a', 'Anna Berg'], ['b', 'Omar Ali'], ['c', 'Pia Provlund']] as const) s = laggTillElev(s, { id, klassId: 'k', namn, grupp: 'A' });
    const rad = (namn: string, p: number) => ({ namn, poang: p, maxPoang: 10 });
    // Fre 21/8: läxförhör 4.1 + exit 4.2 (samma dag, olika prov)
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Biologi 4.1 Begrepp', datum: '2026-08-21', rum: 'Biologi41', rader: [rad('Anna Berg', 9), rad('Omar Ali', 6), rad('Pia Provlund', 8)] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Biologi 4.2 Begrepp', datum: '2026-08-21', rum: 'Biologi42', rader: [rad('Anna Berg', 10), rad('Omar Ali', 5), rad('Pia Provlund', 9)] }).s;
    // Mån 24/8: aggregerande läxförhör 4.1–4.2 + exit 4.3; Pia saknas på exit
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: '4.1-4.2 Begrepp', datum: '2026-08-24', rum: 'Biologi412', rader: [rad('Anna Berg', 10), rad('Omar Ali', 8), rad('Pia Provlund', 9)] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Biologi 4.3 Begrepp', datum: '2026-08-24', rum: 'Biologi43', rader: [rad('Anna Berg', 9), rad('Omar Ali', 7)] }).s;
    return s;
  }
  const f = { klassId: 'k' };

  it('håller isär läxförhör och exit ticket per lektionsdag och räknar diff per elev', () => {
    const l = lektionstester(bygg(), f);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ datum: '2026-08-21', laxforhorProv: 'Biologi 4.1 Begrepp', exitProv: 'Biologi 4.2 Begrepp', laxforhorRum: 'Biologi41', exitRum: 'Biologi42', antalBada: 3 });
    expect(l[0].elever.map((r) => `${r.elev.id}:${r.laxforhor}/${r.exit}/${r.diff}`)).toEqual(['a:90/100/10', 'b:60/50/-10', 'c:80/90/10']);
    expect(l[0]).toMatchObject({ laxforhorSnitt: 77, exitSnitt: 80, laxforhorMedian: 80, exitMedian: 90, diffSnitt: 3, diffMedian: 10 });
    // Pia har bara läxförhör den 24/8 → ingen diff, men raden finns kvar
    expect(l[1].elever.find((r) => r.elev.id === 'c')).toMatchObject({ laxforhor: 90, exit: null, diff: null });
    expect(l[1].antalBada).toBe(2);
  });

  it('per elev: snitt per källa samt snitt och median för differensen', () => {
    const e = elevLektionstest(bygg(), f);
    expect(e.find((x) => x.elev.id === 'a')).toMatchObject({ laxforhorSnitt: 95, exitSnitt: 95, diffSnitt: 0, diffMedian: 0, lektioner: 2 }); // +10 och −10
    expect(e.find((x) => x.elev.id === 'b')).toMatchObject({ diffSnitt: -10, diffMedian: -10 });
    expect(e.find((x) => x.elev.id === 'c')).toMatchObject({ exitSnitt: 90, diffSnitt: 10, lektioner: 2 });
  });

  it('median hanterar jämnt och udda antal', () => {
    expect(median([])).toBeNull();
    expect(median([70, 90, 80])).toBe(80);
    expect(median([70, 90, 80, 100])).toBe(85);
  });

  it('etiketten visar hela provnamnet; kortformen bara kapitlet', () => {
    const t = provTillfallen(bygg(), f);
    expect(tillfalleEtiketter(t[0])[2]).toBe('Biologi 4.1 Begrepp (Biologi41)');
    expect(tillfalleKortEtikett(t[0])).toBe('Kap 4.1');
  });
});
