/**
 * Del 250 · Perioden för resultaten kommer ur planeringen och förhörens datum — inte ur ett fast exempel.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, planeringsperiod, resetIdRaknare, resultatPeriod, sattNoPeriod,
  skapaFriPlanering, tomStruktur, type Struktur,
} from '../src/index.js';

beforeEach(resetIdRaknare);

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma/NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  ['Biologi', 'Kemi'].forEach((namn, i) => {
    s = laggTillAmne(s, { id: `no${i}`, klassId: 'k', namn, noGrupp: 'no', noOrder: i, schema: [{ dag: 1, start: '09:15', slut: '10:30' }, { dag: 5, start: '08:25', slut: '09:35' }] });
  });
  s = sattNoPeriod(s, 'no0', { fran: '2026-08-20', till: '2026-11-06' });   // Biologi: v.34–45
  s = sattNoPeriod(s, 'no1', { fran: '2026-11-09', till: '2027-01-18' });   // Kemi:    v.46–3
  s = laggTillAmne(s, { id: 'stod', klassId: 'k', namn: 'MaNOTk-stöd', schema: [{ dag: 4, start: '14:55', slut: '15:45' }] });
  s = laggTillElev(s, { id: 'e', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  return s;
}
const forhor = (s: Struktur, amneId: string, prov: string, datum: string): Struktur =>
  importeraResultat(s, { klassId: 'k', amneId, kalla: 'socrative-exit', prov, datum, rader: [{ namn: 'Anna Berg', poang: 1, maxPoang: 1 }] }).s;

describe('Del 250 · resultatPeriod', () => {
  it('Biologi: delämnets period i planeringen gäller — v.34–45, fast sista förhöret var i v.43', () => {
    let s = forhor(grund(), 'no0', 'Biologi 4.1 Begrepp', '2026-08-20');
    s = forhor(s, 'no0', 'Nervsystemet 7.5', '2026-10-23');
    expect(planeringsperiod(s, s.amnen.find((a) => a.id === 'no0')!)).toEqual({ fran: '2026-08-20', till: '2026-11-06' });
    expect(resultatPeriod(s, 'k', 'no0', '2026-11-15')).toEqual({ fran: '2026-08-20', till: '2026-11-06', veckor: 'v.34–45', kalla: 'planering+forhor' });
  });

  it('ett förhör utanför planeringens period vidgar perioden, så att inget genomfört förhör hamnar utanför', () => {
    const s = forhor(forhor(grund(), 'no0', 'Biologi 4.1 Begrepp', '2026-08-18'), 'no0', 'Omförhör', '2026-11-12');
    expect(resultatPeriod(s, 'k', 'no0', '2026-11-15')).toMatchObject({ fran: '2026-08-18', till: '2026-11-12', veckor: 'v.34–46' });
  });

  it('Kemi: perioden går över årsskiftet; utan förhör är det planeringen ensam', () => {
    expect(resultatPeriod(grund(), 'k', 'no1', '2026-11-15')).toEqual({ fran: '2026-11-09', till: '2027-01-18', veckor: 'v.46–3', kalla: 'planering' });
  });

  it('ett ämne utanför NO+Tk-blocket: första till sista planerade lektion', () => {
    const s = skapaFriPlanering(grund(), 'stod', '2026-08-17T08:00:00Z');
    const p = resultatPeriod(s, 'k', 'stod', '2026-11-15')!;
    expect(p.fran).toBe('2026-08-20');             // första torsdagen
    expect(p.veckor.startsWith('v.34–')).toBe(true);
    expect(p.kalla).toBe('planering');
  });

  it('utan planering gäller förhörens datum; utan något av dem finns ingen period', () => {
    const s = forhor(forhor(grund(), 'stod', 'Diagnos', '2026-09-03'), 'stod', 'Diagnos 2', '2026-09-24');
    expect(resultatPeriod(s, 'k', 'stod', '2026-11-15')).toEqual({ fran: '2026-09-03', till: '2026-09-24', veckor: 'v.36–39', kalla: 'forhor' });
    expect(resultatPeriod(grund(), 'k', 'stod', '2026-11-15')).toBeNull();
    expect(resultatPeriod(grund(), 'k', 'finns-inte', '2026-11-15')).toBeNull();
  });

  it('alla ämnen: från det första till det sista av de ämnen som har börjat eller har förhör', () => {
    const s = forhor(grund(), 'no0', 'Biologi 4.1 Begrepp', '2026-08-20');
    // i oktober har Kemi inte börjat och har inga förhör — bara Biologi räknas
    expect(resultatPeriod(s, 'k', '', '2026-10-01')).toMatchObject({ fran: '2026-08-20', till: '2026-11-06', veckor: 'v.34–45' });
    // i november har Kemi börjat — perioden sträcker sig till Kemis slut
    expect(resultatPeriod(s, 'k', '', '2026-11-15')).toMatchObject({ fran: '2026-08-20', till: '2027-01-18', veckor: 'v.34–3' });
  });
});
