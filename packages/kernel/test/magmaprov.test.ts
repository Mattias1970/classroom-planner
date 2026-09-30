import { describe, it, expect } from 'vitest';
import { magmaAnalys, magmaOmdome, tolkaMagmaRapport, magmaUppgiftsStatistik, magmaDatumUrBladnamn, magmaProvnamnUrFilnamn, type MagmaCell } from '../src/domain/magmaprov';
import { importeraResultat, resultatForElev, niva, resultatProcent } from '../src/domain/resultat';
import { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur';
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
