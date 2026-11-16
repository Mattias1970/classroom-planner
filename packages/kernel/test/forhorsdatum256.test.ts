/**
 * Del 256 · Ett förhör bär dagen det kördes. Lektionens datum används bara när lektionen ligger nära;
 * förhör som redan fått en avlägsen lektions datum hittas via filnamnet och kan rättas.
 */
import { describe, expect, it } from 'vitest';
import { feldateradeForhor, rattaForhorsdatum } from '../src/domain/forhorsdatum.js';
import { importeraResultat, registreraFil, type FragaSvar, type ResultatKalla } from '../src/domain/resultat.js';
import { MAX_DAGAR_FRAN_LEKTION, klassificeraViaRum } from '../src/domain/socrative.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { trendkoll } from '../src/domain/trendkoll.js';
import { tomStruktur, type PlaneradLektion, type Struktur } from '../src/domain/typer.js';

const lekt = (avsnitt: string, socStart: string, exit: string): PlaneradLektion['lektion'] =>
  ({ id: 1, typ: 'regular', avsnitt, del: 1, niva1: '—', niva2: '—', niva3: '—', sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart, exit });

describe('Del 256 · klassificeraViaRum: lektionens datum bara när lektionen ligger nära', () => {
  // 8A:s planering börjar först 23 okt — förhören kördes från augusti
  const plan: PlaneradLektion[] = [
    { kapitel: 7, lektion: lekt('7.5 Sinnen', 'BIOLOGI8AA', 'BIOLOGI8AA'), datum: '2026-10-23', vecka: 43, start: '10:15', slutTid: '11:20' },
    { kapitel: 7, lektion: lekt('7.6 Hormoner', 'BIOLOGI8AA', 'BIOLOGI8AA'), datum: '2026-11-02', vecka: 45, start: '12:40', slutTid: '13:35' },
  ];
  it('ett förhör kört långt före planeringens första lektion får dagen det kördes — inte lektionens', () => {
    const k = klassificeraViaRum('BIOLOGI8AA', '2026-09-21T12:35:00Z', plan)!;
    expect(k).toMatchObject({ datum: '2026-09-21', tid: '14:35', lektionsIndex: null, avsnitt: null, kalla: 'socrative-exit' });
    expect(k.beskrivning).toContain('körd 2026-09-21');
    expect(k.beskrivning).toContain(`ingen lektion med rummet inom ${MAX_DAGAR_FRAN_LEKTION} dagar`);
    // förut fick alla sådana förhör 23 okt
    for (const start of ['2026-08-24T10:58:00Z', '2026-09-04T08:41:00Z', '2026-10-05T07:18:00Z', '2026-10-15T10:54:00Z']) {
      expect(klassificeraViaRum('BIOLOGI8AA', start, plan)!.datum).toBe(start.slice(0, 10));
    }
  });
  it('nära lektionen gäller lektionens dag som förut', () => {
    expect(klassificeraViaRum('BIOLOGI8AA', '2026-10-23T08:39:00Z', plan)).toMatchObject({ datum: '2026-10-23', lektionsIndex: 0 });
    // kört dagen före (hemma) och tre dagar efter: räknas till lektionen
    expect(klassificeraViaRum('BIOLOGI8AA', '2026-10-22T10:51:00Z', plan)).toMatchObject({ datum: '2026-10-23', lektionsIndex: 0 });
    expect(klassificeraViaRum('BIOLOGI8AA', '2026-10-26T09:00:00Z', plan)).toMatchObject({ datum: '2026-10-23', lektionsIndex: 0 });
    // fyra dagar efter: inte längre
    expect(klassificeraViaRum('BIOLOGI8AA', '2026-10-27T09:00:00Z', plan)).toMatchObject({ datum: '2026-10-27', lektionsIndex: null });
  });
});

const FRAGOR = ['Nervcellens långa utskott.', 'Kopplingen mellan två nervceller.', 'Skyddande fettlager runt nervtrådar.'];
function svar(ratt: boolean[]): FragaSvar[] {
  return FRAGOR.map((fraga, i) => ({ fraga, svar: ratt[i] ? `A. • begrepp ${i}` : 'B. • annat', ratt: ratt[i], facit: `A. • begrepp ${i}` }));
}
/** 8A med förhör som alla fått 23 okt, fast filnamnen säger olika dagar. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '09:00', slut: '10:00' }] });
  for (const [i, namn] of ['Anna Berg', 'Omar Ali', 'Li Testsson'].entries()) s = laggTillElev(s, { id: `e${i}`, klassId: 'k', namn, grupp: 'A' });
  const imp = (filnamn: string, prov: string, kalla: ResultatKalla, datum: string, tid: string | undefined, elever: string[], ratt: boolean[], amneId = 'bi') => {
    const u = importeraResultat(s, { klassId: 'k', amneId, kalla, prov, datum, ...(tid !== undefined ? { tid } : {}), rum: 'BIOLOGI8AA',
      rader: elever.map((namn) => ({ namn, poang: ratt.filter(Boolean).length, maxPoang: 3, svar: svar(ratt) })) });
    s = registreraFil(u.s, { amneId, filnamn, importerad: '2026-11-10T20:00:00.000Z', kalla, prov, datum, rum: 'BIOLOGI8AA', traffar: u.traffar });
  };
  const ALLA = ['Anna Berg', 'Omar Ali', 'Li Testsson'];
  // Kördes 21 sep, 5 okt och 15 okt — alla sparade som 23 okt
  imp('Class_2026_09_21__12_35_QZ_6.1 Begrepp.xlsx', '6.1 Begrepp', 'socrative-exit', '2026-10-23', '14:35', ALLA, [false, false, true]);
  imp('Class_2026_10_05__07_18_QZ_Biologi 6.4 Begrepp (1).xlsx', 'Biologi 6.4 Begrepp', 'socrative-exit', '2026-10-23', '09:18', ALLA, [true, false, true]);
  imp('Class_2026_10_15__10_54_QZ_Nervsystemet 7.1.xlsx', 'Nervsystemet 7.1', 'socrative-exit', '2026-10-23', '12:54', ALLA, [true, true, true]);
  // Samma quiz kört två gånger (22 okt 12:51 och 13:44), olika elever — båda sparade som 23 okt
  imp('Class_2026_10_22__10_51_QZ_6.1 - 6.5, 7.1 - 7.4.xlsx', '6.1 - 6.5, 7.1 - 7.4', 'socrative-laxforhor', '2026-10-23', '12:51', ['Anna Berg'], [true, true, false]);
  imp('Class_2026_10_22__11_44_QZ_6.1 - 6.5, 7.1 - 7.4 (1).xlsx', '6.1 - 6.5, 7.1 - 7.4', 'socrative-laxforhor', '2026-10-23', '13:44', ['Omar Ali', 'Li Testsson'], [true, true, true]);
  // Kördes verkligen 23 okt — rätt som det är
  imp('Class_2026_10_23__09_00_QZ_Nervsystemet 7.5.xlsx', 'Nervsystemet 7.5', 'socrative-exit', '2026-10-23', '11:00', ALLA, [true, true, true]);
  // Ett äldre förhör utan klockslag på resultaten (ensam fil för sitt quiz den dagen)
  imp('Class_2026_08_24__10_58_QZ_Biologi 4.1 Begrepp.xlsx', 'Biologi 4.1 Begrepp', 'socrative-exit', '2026-10-23', undefined, ALLA, [false, true, false]);
  // Inte en Socrative-fil: rörs aldrig
  imp('Diagnos kapitel 2.xlsx', 'Diagnos kapitel 2', 'magma', '2026-10-23', undefined, ALLA, [true, false, false], 'ma');
  return s;
}

describe('Del 256 · feldateradeForhor', () => {
  it('hittar förhören vars sparade datum inte är dagen de kördes — i den ordning de kördes', () => {
    const fel = feldateradeForhor(bygg());
    expect(fel.map((f) => [f.fil.prov, f.fil.datum, f.kord.datum, f.kord.tid, f.resultat])).toEqual([
      ['Biologi 4.1 Begrepp', '2026-10-23', '2026-08-24', '12:58', 3],
      ['6.1 Begrepp', '2026-10-23', '2026-09-21', '14:35', 3],
      ['Biologi 6.4 Begrepp', '2026-10-23', '2026-10-05', '09:18', 3],
      ['Nervsystemet 7.1', '2026-10-23', '2026-10-15', '12:54', 3],
    ]);
  });
  it('förhör nära sin lektion (inom tre dagar) och andra källor än Socrative lämnas i fred', () => {
    const prov = feldateradeForhor(bygg()).map((f) => f.fil.prov);
    expect(prov).not.toContain('6.1 - 6.5, 7.1 - 7.4');      // kört dagen före lektionen
    expect(prov).not.toContain('Nervsystemet 7.5');           // kört samma dag
    expect(prov).not.toContain('Diagnos kapitel 2');
  });
});

describe('Del 256 · rattaForhorsdatum', () => {
  it('resultaten och filregistret får dagen förhöret kördes — inget annat ändras', () => {
    const s = bygg();
    const fore = JSON.stringify(s);
    const u = rattaForhorsdatum(s);
    expect(JSON.stringify(s)).toBe(fore);                                    // indata rörs inte
    expect([u.filer, u.resultat]).toEqual([4, 12]);
    const datumFor = (prov: string) => [...new Set((u.s.resultat ?? []).filter((r) => r.prov === prov).map((r) => r.datum))];
    expect(datumFor('Biologi 4.1 Begrepp')).toEqual(['2026-08-24']);
    expect(datumFor('6.1 Begrepp')).toEqual(['2026-09-21']);
    expect(datumFor('Biologi 6.4 Begrepp')).toEqual(['2026-10-05']);
    expect(datumFor('Nervsystemet 7.1')).toEqual(['2026-10-15']);
    expect(datumFor('Nervsystemet 7.5')).toEqual(['2026-10-23']);
    expect(datumFor('6.1 - 6.5, 7.1 - 7.4')).toEqual(['2026-10-23']);
    expect(datumFor('Diagnos kapitel 2')).toEqual(['2026-10-23']);
    expect((u.s.filregister ?? []).find((f) => f.prov === '6.1 Begrepp')!.datum).toBe('2026-09-21');
    // poäng, svar och allt annat är orört
    const utanDatum = (x: Struktur) => JSON.stringify({ ...x, resultat: (x.resultat ?? []).map((r) => ({ ...r, datum: '' })), filregister: (x.filregister ?? []).map((f) => ({ ...f, datum: '' })) });
    expect(utanDatum(u.s)).toBe(utanDatum(s));
    expect(feldateradeForhor(u.s)).toEqual([]);                              // inget kvar att rätta
    expect(rattaForhorsdatum(u.s)).toEqual({ s: u.s, filer: 0, resultat: 0 });
  });

  it('bara de valda filerna rättas', () => {
    const s = bygg();
    const en = feldateradeForhor(s).find((f) => f.fil.prov === 'Nervsystemet 7.1')!;
    const u = rattaForhorsdatum(s, [en.fil.id]);
    expect([u.filer, u.resultat]).toEqual([1, 3]);
    expect(feldateradeForhor(u.s).map((f) => f.fil.prov)).toEqual(['Biologi 4.1 Begrepp', '6.1 Begrepp', 'Biologi 6.4 Begrepp']);
  });

  it('två körningar av samma quiz hålls isär på klockslaget', () => {
    let s = bygg();
    // de två körningarna 22 okt hade kunnat hamna långt bort: flytta lektionsdatumet till 2 nov i båda
    s = { ...s, resultat: (s.resultat ?? []).map((r) => (r.prov === '6.1 - 6.5, 7.1 - 7.4' ? { ...r, datum: '2026-11-02' } : r)), filregister: (s.filregister ?? []).map((f) => (f.prov === '6.1 - 6.5, 7.1 - 7.4' ? { ...f, datum: '2026-11-02' } : f)) };
    const fel = feldateradeForhor(s).filter((f) => f.fil.prov === '6.1 - 6.5, 7.1 - 7.4');
    expect(fel.map((f) => [f.kord.tid, f.resultat])).toEqual([['12:51', 1], ['13:44', 2]]);
    const u = rattaForhorsdatum(s, [fel[0].fil.id]);
    expect((u.s.resultat ?? []).filter((r) => r.prov === '6.1 - 6.5, 7.1 - 7.4').map((r) => [r.tid, r.datum]).sort()).toEqual([['12:51', '2026-10-22'], ['13:44', '2026-11-02'], ['13:44', '2026-11-02']]);
  });

  it('efter rättningen jämför trendkollen förhör från olika dagar i stället för samma', () => {
    const s = bygg();
    const dagar = (x: Struktur) => [...new Set(trendkoll(x, { klassId: 'k', amneId: 'bi' }).elever.flatMap((e) => e.steg.flatMap((st) => [st.foreDatum, st.datum])))].sort();
    expect(dagar(s)).toEqual(['2026-10-23']);
    const efter = dagar(rattaForhorsdatum(s).s);
    expect(efter.length).toBeGreaterThan(1);
    expect(efter[0] < '2026-10-23').toBe(true);
  });
});
