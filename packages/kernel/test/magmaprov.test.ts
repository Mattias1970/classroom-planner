import { describe, it, expect } from 'vitest';
import { magmaAnalys, magmaOmdome, taBortAllaMagma, taBortMagmaProv, tolkaMagmaNamn, tolkaMagmaRapport, magmaUppgiftsStatistik, magmaDatumUrBladnamn, magmaProvnamnUrFilnamn, type MagmaCell } from '../src/domain/magmaprov';
import { importeraResultat, resultatForElev, niva, resultatProcent } from '../src/domain/resultat';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur';
import { tomStruktur } from '../src/domain/typer';

/** Magmas exportform: rad 1 uppgiftsnummer, sedan Förnamn | Efternamn | 1/0 …; tomt = deltog inte. */
const MATRIS: MagmaCell[][] = [
  ['', '', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '', ''],
  ['Anna', 'Berg', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, null, null],
  ['Omar', 'Ali', 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, null, null],
  ['Elsa', 'Lindqvist', 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, null, null],
  ['Kalle', 'Testsson', null, null, null, null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null],
];

describe('magmaOmdome — 70/85/95', () => {
  it('gränserna är inklusive nedåt och procenten avrundas inte', () => {
    expect(magmaOmdome(100)).toBe('Utmärkt');
    expect(magmaOmdome(95)).toBe('Utmärkt');
    expect(magmaOmdome(94.9)).toBe('Bra');
    expect(magmaOmdome(85)).toBe('Bra');
    expect(magmaOmdome(84.9)).toBe('Godkänt');
    expect(magmaOmdome(70)).toBe('Godkänt');
    expect(magmaOmdome(69.9)).toBe('Under godkänt');
    expect(magmaOmdome(0)).toBe('Under godkänt');
    expect(magmaOmdome(null)).toBeNull();
  });
});

describe('tolkaMagmaRapport', () => {
  it('läser uppgifter, rätt/fel per elev, andel rätt och vilka som inte deltog', () => {
    const r = tolkaMagmaRapport(MATRIS, '2026-09-30');
    expect(r.datum).toBe('2026-09-30');
    expect(r.uppgifter.map((u) => u.nr)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(r.rader.map((x) => x.namn)).toEqual(['Anna Berg', 'Omar Ali', 'Elsa Lindqvist', 'Kalle Testsson']);
    const anna = r.rader[0]; const omar = r.rader[1]; const elsa = r.rader[2]; const kalle = r.rader[3];
    expect(anna).toMatchObject({ deltog: true, poang: 10, maxPoang: 10, procent: 100, fel: [] });
    expect(omar).toMatchObject({ deltog: true, poang: 8, maxPoang: 10, procent: 80, fel: ['3', '10'] });
    expect(elsa).toMatchObject({ deltog: true, poang: 6, maxPoang: 10, procent: 60, fel: ['2', '3', '7', '10'] });
    expect(kalle).toMatchObject({ deltog: false, poang: 0, maxPoang: 10, procent: null, fel: [] });
    expect(omar.svar[2]).toEqual({ fraga: 'Uppgift 3', svar: '0', ratt: false });
    expect(omar.svar[0]).toEqual({ fraga: 'Uppgift 1', svar: '1', ratt: true });
    expect(kalle.svar[0]).toEqual({ fraga: 'Uppgift 1', svar: '', ratt: null });
    expect(magmaOmdome(omar.procent)).toBe('Godkänt');
    expect(magmaOmdome(elsa.procent)).toBe('Under godkänt');
  });

  it('tål text som rätt/fel, bråk och procent, uppgiftsrubriker som "Uppgift 3" och sammanfattningsrader', () => {
    const m: MagmaCell[][] = [
      ['Namn', 'Uppgift 1', 'Uppg. 2', 'Uppgift 3'],
      ['Anna Berg', 'Rätt', '2/2', '100%'],
      ['Omar Ali', 'fel', '1/2', '50 %'],
      ['Medelvärde', 0.5, 0.75, 0.75],
    ];
    const r = tolkaMagmaRapport(m);
    expect(r.datum).toBeNull();
    expect(r.uppgifter.map((u) => u.nr)).toEqual(['1', '2', '3']);
    expect(r.rader).toHaveLength(2);
    expect(r.rader[0]).toMatchObject({ poang: 4, maxPoang: 4, procent: 100, fel: [] });
    expect(r.rader[1]).toMatchObject({ poang: 1.5, maxPoang: 4, fel: ['1', '2', '3'] });
    expect(r.rader[1].procent).toBeCloseTo(37.5);
  });

  it('obesvarade uppgifter räknas som fel för elever som deltog', () => {
    const r = tolkaMagmaRapport([['', '', '1', '2', '3', '4'], ['Anna', 'Berg', 1, null, 1, null]]);
    expect(r.rader[0]).toMatchObject({ deltog: true, poang: 2, maxPoang: 4, procent: 50 });
    expect(r.rader[0].svar.map((s) => s.ratt)).toEqual([true, null, true, null]);
  });

  it('kastar svenska fel för fel filtyp', () => {
    expect(() => tolkaMagmaRapport([['Quiz 1'], ['Student Name', 'Score']])).toThrow('Hittar ingen rubrikrad');
    expect(() => tolkaMagmaRapport([['', '', '1', '2', '3']])).toThrow('inga elevrader');
    expect(() => tolkaMagmaRapport([['1', '2', '3'], ['Anna', 1, 1]])).toThrow('namnkolumnerna saknas');
  });

  it('uppgiftsstatistik: andel rätt per uppgift bland de som deltog', () => {
    const st = magmaUppgiftsStatistik(tolkaMagmaRapport(MATRIS));
    expect(st[0]).toEqual({ nr: '1', ratt: 3, fel: 0, andelRatt: 100 });
    expect(st[2]).toEqual({ nr: '3', ratt: 1, fel: 2, andelRatt: 33 });
    expect(st[9]).toEqual({ nr: '10', ratt: 1, fel: 2, andelRatt: 33 });
  });

  it('datum ur bladnamn och provnamn ur filnamn', () => {
    expect(magmaDatumUrBladnamn('2026-09-30')).toBe('2026-09-30');
    expect(magmaDatumUrBladnamn('30/9/2026')).toBe('2026-09-30');
    expect(magmaDatumUrBladnamn('Blad1')).toBeNull();
    expect(magmaProvnamnUrFilnamn('8b_1.4_-_1.5.xlsx')).toBe('8b 1.4 - 1.5');
    expect(magmaProvnamnUrFilnamn('1.1_-_1.3_Test.xlsx')).toBe('1.1 - 1.3 Test');
  });
});

describe('Magma-resultat sparas per elev', () => {
  it('importeras med svar per uppgift och bedöms enligt Magma-skalan', () => {
    let s = tomStruktur();
    s = laggTillSkolar(s, { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
    s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Elsa Lindqvist', grupp: 'A' });
    const r = tolkaMagmaRapport(MATRIS, '2026-09-30');
    const u = importeraResultat(s, {
      klassId: 'k', kalla: 'magma', prov: '1.1 - 1.3 Test', datum: r.datum ?? '2026-09-30',
      rader: r.rader.filter((x) => x.deltog).map((x) => ({ namn: x.namn, poang: x.poang, maxPoang: x.maxPoang, svar: x.svar })),
    });
    expect(u.traffar).toBe(3);
    expect(u.omatchade).toEqual([]);
    const omar = resultatForElev(u.s, 'e2');
    expect(omar).toHaveLength(1);
    expect(omar[0]).toMatchObject({ kalla: 'magma', prov: '1.1 - 1.3 Test', datum: '2026-09-30', poang: 8, maxPoang: 10 });
    expect(omar[0].svar?.filter((x) => x.ratt === false).map((x) => x.fraga)).toEqual(['Uppgift 3', 'Uppgift 10']);
    expect(niva('magma', resultatProcent(omar[0]))).toBe('Godkänt');
    expect(niva('magma', resultatProcent(resultatForElev(u.s, 'e1')[0]))).toBe('Utmärkt');
    expect(niva('magma', resultatProcent(resultatForElev(u.s, 'e3')[0]))).toBe('Under godkänd nivå');
  });
});

describe('magmaAnalys — sparade prov per klass', () => {
  it('ger andel rätt per uppgift, omdömesfördelning, svaga uppgifter och elevernas serier med trend', () => {
    const elever = [
      { id: 'e1', klassId: 'k', namn: 'Anna Berg' }, { id: 'e2', klassId: 'k', namn: 'Omar Ali' }, { id: 'e3', klassId: 'k', namn: 'Pia Provlund' }, { id: 'x', klassId: 'annan', namn: 'Elsa Lindqvist' },
    ];
    const sv = (...r: boolean[]) => r.map((ratt, i) => ({ fraga: `Uppgift ${i + 1}`, svar: ratt ? '1' : '0', ratt }));
    const resultat = [
      { id: '1', elevId: 'e1', amneId: 'ma', kalla: 'magma', prov: 'T1', datum: '2026-09-03', poang: 4, maxPoang: 4, svar: sv(true, true, true, true) },
      { id: '2', elevId: 'e2', amneId: 'ma', kalla: 'magma', prov: 'T1', datum: '2026-09-03', poang: 1, maxPoang: 4, svar: sv(true, false, false, false) },
      { id: '2b', elevId: 'e3', amneId: 'ma', kalla: 'magma', prov: 'T1', datum: '2026-09-03', poang: 2, maxPoang: 4, svar: sv(true, false, true, false) },
      { id: '3', elevId: 'e1', amneId: 'ma', kalla: 'magma', prov: 'T2', datum: '2026-09-30', poang: 3, maxPoang: 4, svar: sv(true, true, true, false) },
      { id: '4', elevId: 'e2', amneId: 'ma', kalla: 'magma', prov: 'T2', datum: '2026-09-30', poang: 4, maxPoang: 4, svar: sv(true, true, true, true) },
      { id: '5', elevId: 'x', amneId: 'ma', kalla: 'magma', prov: 'T2', datum: '2026-09-30', poang: 0, maxPoang: 4 },
      { id: '6', elevId: 'e1', amneId: 'ma', kalla: 'socrative-exit', prov: 'Q', datum: '2026-09-30', poang: 1, maxPoang: 1 },
    ];
    const a = magmaAnalys({ elever, resultat }, 'k', 'ma');
    expect(a.prov.map((p) => p.prov)).toEqual(['T1', 'T2']);
    expect(a.prov[0]).toMatchObject({ antal: 3, medel: 58, svaga: ['2', '4'] });
    expect(a.prov[0].fordelning).toEqual({ 'Under godkänt': 2, 'Godkänt': 0, 'Bra': 0, 'Utmärkt': 1 });
    expect(a.prov[0].uppgifter.find((u) => u.nr === '2')).toEqual({ nr: '2', ratt: 1, fel: 2, andelRatt: 33 });
    expect(a.prov[0].uppgifter.find((u) => u.nr === '3')).toEqual({ nr: '3', ratt: 2, fel: 1, andelRatt: 67 });
    expect(a.prov[1]).toMatchObject({ antal: 2, medel: 88, svaga: [] });
    expect(a.elever.map((e) => e.namn)).toEqual(['Anna Berg', 'Omar Ali', 'Pia Provlund']);
    expect(a.elever[0]).toMatchObject({ procent: [100, 75], senaste: 75, trend: -25, omdome: 'Godkänt' });
    expect(a.elever[1]).toMatchObject({ procent: [25, 100], senaste: 100, trend: 75, omdome: 'Utmärkt' });
    expect(a.elever[2]).toMatchObject({ procent: [50, null], senaste: 50, trend: null, omdome: 'Under godkänt' });
    expect(magmaAnalys({ elever, resultat }, 'k', 'bi').prov).toEqual([]);
  });
});

describe('Del 176 · två Magma-diagnoser med samma namn kombineras', () => {
  const sv = (ratt: Array<boolean | null>) => ratt.map((r, i) => ({ fraga: `Uppgift ${i + 1}`, svar: r === null ? '' : r ? '1' : '0', ratt: r }));
  function bas() {
    let s = tomStruktur();
    s = laggTillSkolar(s, { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
    s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Pia Provlund', grupp: 'A' });
    return s;
  }
  it('det senaste försöket räknas — utom när det har mycket färre gjorda uppgifter; elever från båda importerna finns kvar', () => {
    let s = bas();
    // Första importen 5/9: Anna 6/10 (alla gjorda), Omar 7/10 (alla gjorda)
    s = importeraResultat(s, { klassId: 'k', kalla: 'magma', prov: '1.1 - 1.3 diagnos', datum: '2026-09-05', rader: [
      { namn: 'Anna Berg', poang: 6, maxPoang: 10, svar: sv([true, true, true, true, true, true, false, false, false, false]) },
      { namn: 'Omar Ali', poang: 7, maxPoang: 10, svar: sv([true, true, true, true, true, true, true, false, false, false]) },
    ] }).s;
    // Andra importen 12/9 (samma namn): Anna 9/10 (alla gjorda) → senaste räknas; Omar 3/10 med bara 4 gjorda → det tidigare behålls; Pia bara här
    s = importeraResultat(s, { klassId: 'k', kalla: 'magma', prov: '1.1 - 1.3 diagnos', datum: '2026-09-12', rader: [
      { namn: 'Anna Berg', poang: 9, maxPoang: 10, svar: sv([true, true, true, true, true, true, true, true, true, false]) },
      { namn: 'Omar Ali', poang: 3, maxPoang: 10, svar: sv([true, true, true, false, null, null, null, null, null, null]) },
      { namn: 'Pia Provlund', poang: 10, maxPoang: 10, svar: sv(Array(10).fill(true) as boolean[]) },
    ] }).s;
    expect(resultatForElev(s, 'e1')).toHaveLength(1);
    expect(resultatForElev(s, 'e1')[0]).toMatchObject({ datum: '2026-09-12', poang: 9 });
    expect(resultatForElev(s, 'e2')).toHaveLength(1);
    expect(resultatForElev(s, 'e2')[0]).toMatchObject({ datum: '2026-09-05', poang: 7 });
    expect(resultatForElev(s, 'e3')[0]).toMatchObject({ datum: '2026-09-12', poang: 10 });
    // Analysen ser ett enda prov med alla tre eleverna
    const a = magmaAnalys(s, 'k');
    expect(a.prov).toHaveLength(1);
    expect(a.prov[0]).toMatchObject({ prov: '1.1 - 1.3 diagnos', antal: 3, medel: 87 });
    expect(a.elever.map((e) => [e.namn, e.senaste])).toEqual([['Anna Berg', 90], ['Omar Ali', 70], ['Pia Provlund', 100]]);
  });
  it('utan svar per uppgift jämförs maxpoängen; en äldre import efter en nyare ersätter inte den nyare', () => {
    let s = bas();
    s = importeraResultat(s, { klassId: 'k', kalla: 'magma', prov: 'Kap 1 diagnos', datum: '2026-09-20', rader: [{ namn: 'Anna Berg', poang: 18, maxPoang: 20 }] }).s;
    // Äldre fil importeras efteråt → det senaste (20/9) räknas fortfarande
    s = importeraResultat(s, { klassId: 'k', kalla: 'magma', prov: 'Kap 1 diagnos', datum: '2026-09-13', rader: [{ namn: 'Anna Berg', poang: 10, maxPoang: 20 }] }).s;
    expect(resultatForElev(s, 'e1')[0]).toMatchObject({ datum: '2026-09-20', poang: 18 });
    // Nyare men med mycket färre uppgifter (5 av 20) → det tidigare behålls
    s = importeraResultat(s, { klassId: 'k', kalla: 'magma', prov: 'Kap 1 diagnos', datum: '2026-09-27', rader: [{ namn: 'Anna Berg', poang: 5, maxPoang: 5 }] }).s;
    expect(resultatForElev(s, 'e1')[0]).toMatchObject({ datum: '2026-09-20', poang: 18 });
  });
});

describe('Del 178 · namnkonvention "Ämne Klass Kapitel Typ Del" och borttagning', () => {
  it('tolkar diagnos, exit ticket, läxförhör och screening ur filnamnet', () => {
    expect(tolkaMagmaNamn('Ma 8B Kap 1 Diagnos 1.3 - 1.4')).toEqual({ amne: 'Ma', klass: '8B', kapitel: 1, typ: 'diagnos', del: '1.3 - 1.4', kort: 'Diagnos 1.3 - 1.4' });
    expect(tolkaMagmaNamn('Ma 8B Kap 2 Exit ticket 2.1a.xlsx')).toMatchObject({ klass: '8B', kapitel: 2, typ: 'exit', del: '2.1a', kort: 'Exit ticket 2.1a' });
    expect(tolkaMagmaNamn('Ma 8B Kap 2 Läxförhör 2.1 - 2.4')).toMatchObject({ kapitel: 2, typ: 'laxforhor', del: '2.1 - 2.4', kort: 'Läxförhör 2.1 - 2.4' });
    expect(tolkaMagmaNamn('Ma 8A Kap 1 Diagnos')).toMatchObject({ klass: '8A', kapitel: 1, typ: 'diagnos', del: '', kort: 'Diagnos' });
    expect(tolkaMagmaNamn('Stockholm stads screening')).toMatchObject({ amne: null, klass: null, kapitel: null, typ: 'screening', kort: 'Stockholm stads screening' });
    // Äldre namn utan konventionen
    expect(tolkaMagmaNamn('1.1 - 1.3 diagnos')).toMatchObject({ amne: null, kapitel: null, typ: 'diagnos', del: '1.1 - 1.3' });
    expect(tolkaMagmaNamn('Diagnos kap 1')).toMatchObject({ kapitel: 1, typ: 'diagnos', del: '' });
  });
  it('tar bort ett Magma-prov på namnet (alla datum) eller alla Magma-resultat i ämnet — Socrative-resultat rörs inte', () => {
    let s = tomStruktur();
    s = laggTillSkolar(s, { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '10:00', slut: '11:00' }] });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov: 'Ma 8B Kap 1 Diagnos 1.3 - 1.4', datum: '2026-09-05', rader: [{ namn: 'Anna Berg', poang: 8, maxPoang: 10 }] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov: 'Ma 8B Kap 1 Diagnos 1.1 - 1.2', datum: '2026-08-29', rader: [{ namn: 'Anna Berg', poang: 9, maxPoang: 10 }] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'socrative-exit', prov: '1.1 Exit', datum: '2026-08-20', rum: 'Matte8BB', rader: [{ namn: 'Anna Berg', poang: 9, maxPoang: 10 }] }).s;
    s = { ...s, filregister: [{ id: 'f1', amneId: 'ma', filnamn: 'Ma 8B Kap 1 Diagnos 1.3 - 1.4.xlsx', importerad: '', kalla: 'magma', prov: 'Ma 8B Kap 1 Diagnos 1.3 - 1.4' }] };
    const s2 = taBortMagmaProv(s, 'ma', 'ma 8b kap 1 diagnos 1.3 - 1.4');
    expect(resultatForElev(s2, 'e1').map((r) => r.prov)).toEqual(['Ma 8B Kap 1 Diagnos 1.1 - 1.2', '1.1 Exit']);
    expect(s2.filregister).toEqual([]);
    const s3 = taBortAllaMagma(s, 'ma');
    expect(resultatForElev(s3, 'e1').map((r) => r.prov)).toEqual(['1.1 Exit']);
  });
});
