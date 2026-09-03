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
