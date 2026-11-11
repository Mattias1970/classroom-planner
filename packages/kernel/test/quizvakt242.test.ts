/**
 * Del 242 · Vakten vid quizimporten: rätt klass, för få svar, elever i fel klass och ett facit som förklarar allas poäng.
 */
import { describe, expect, it } from 'vitest';
import {
  arFilSparrad, behallFil, begreppsnyckel, bokFromImport, eleverIFelKlass, filerMedFaSvar, filnamnsNyckel, harledSvarsnyckel, harledSvarsnyckelMedKvalitet, havSparr,
  importeraResultat, jamforArkiv, klassForRapport, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, rattaFacit, registreraFil, registreraPlanering, sparaBok,
  rensaEleverIFelKlass, rosterUtanAndraKlasser, sammaPerson, sparraFil, svarsandelForRapport, svarText, tomStruktur, type FragaSvar, type Struktur,
} from '../src/index.js';

const A_NAMN = ['Anna Berg', 'Omar Ali', 'Pia Provlund', 'Kim Testsson', 'Lo Övnegård', 'Mira Berg'];
const B_NAMN = ['Tove Testsson', 'Sam Provlund', 'Elsa Övnegård', 'Hugo Ali', 'Vera Berg', 'Nils Testsson'];

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = sparaBok(s, bokFromImport(JSON.stringify({ schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '6': { name: 'Kroppen', col: '#2f8f5a' } } },
    lektioner: { '6': Array.from({ length: 10 }, (_, i) => ({ id: i + 1, type: 'regular', avsnitt: `6.${i + 1} Avsnitt`, del: 1 })) } })));
  for (const [kid, namn, elever, dag] of [['ka', '8A', A_NAMN, 1], ['kb', '8B', B_NAMN, 2]] as const) {
    s = laggTillKlass(s, { id: kid, tjanstId: 'tj', namn });
    // 8A läser Biologi måndagar 09:00, 8B tisdagar 09:00
    s = laggTillAmne(s, { id: `bi-${kid}`, klassId: kid, namn: 'Biologi', bokId: 'bio', schema: [{ dag, start: '09:00', slut: '10:00' }] });
    s = registreraPlanering(s, { id: `pl-${kid}`, amneId: `bi-${kid}`, bokId: 'bio', skapad: '2026-08-10' });
    elever.forEach((n, i) => { s = laggTillElev(s, { id: `${kid}-${i}`, klassId: kid, namn: n, grupp: i % 2 === 0 ? 'A' : 'B' }); });
  }
  return s;
}
const sv = (fraga: string, svar: string, ratt: boolean | null, facit?: string): FragaSvar => ({ fraga, svar, ratt, ...(facit !== undefined ? { facit } : {}) });

describe('Del 242 · alternativbokstaven och facit', () => {
  it('alternativ F och längre tas bort precis som A–E', () => {
    expect(svarText('F. Mitokondrier')).toBe('Mitokondrier');
    expect(begreppsnyckel('F. Mitokondrier')).toBe('mitokondrier');
    expect(begreppsnyckel('C. Mitokondrier')).toBe('mitokondrier');
    expect(svarText('t.ex. hjärta')).toBe('t.ex. hjärta');   // bara A–J räknas som alternativbokstav
  });

  it('ingen har alla rätt: nyckeln väljs så att den förklarar allas poäng — inte den bästa elevens felsvar', () => {
    // Rätt svar: x1 x2 x3. Bästa eleven (2 p) har fel på fråga 3 — förut blev hennes 'fel3' facit.
    const rader = [
      { namn: 'A', sidId: '', deltog: true, poang: 2, maxPoang: 3, svar: ['A. x1', 'B. x2', 'C. fel3'] },
      { namn: 'B', sidId: '', deltog: true, poang: 1, maxPoang: 3, svar: ['A. fel1', 'B. fel2', 'D. x3'] },
      { namn: 'C', sidId: '', deltog: true, poang: 1, maxPoang: 3, svar: ['B. fel1', 'C. fel2', 'D. x3'] },
      { namn: 'D', sidId: '', deltog: true, poang: 2, maxPoang: 3, svar: ['A. x1', 'A. felB', 'D. x3'] },
    ];
    const k = harledSvarsnyckelMedKvalitet(rader, 3);
    expect(k.nyckel).toEqual(['A. x1', 'B. x2', 'D. x3']);
    expect(k).toMatchObject({ avvikelse: 0, exakt: true });
    expect(harledSvarsnyckel(rader, 3)).toEqual(k.nyckel);
  });

  it('har någon alla rätt gäller den elevens svar som förut, och oavgjort lämnas öppet', () => {
    const rader = [
      { namn: 'A', sidId: '', deltog: true, poang: 2, maxPoang: 2, svar: ['ekologi', 'ekosystem'] },
      { namn: 'B', sidId: '', deltog: true, poang: 1, maxPoang: 2, svar: ['biologi', 'ekosystem'] },
    ];
    expect(harledSvarsnyckelMedKvalitet(rader, 2)).toEqual({ nyckel: ['ekologi', 'ekosystem'], avvikelse: 0, exakt: true });
    const oavgjort = [
      { namn: 'A', sidId: '', deltog: true, poang: 1, maxPoang: 2, svar: ['ekologi'] },
      { namn: 'B', sidId: '', deltog: true, poang: 1, maxPoang: 2, svar: ['biologi'] },
    ];
    expect(harledSvarsnyckelMedKvalitet(oavgjort, 1)).toMatchObject({ nyckel: [null], exakt: false });
  });

  it('rattaFacit: ett importerat quiz med fel facit rättas — svaren ommarkeras efter nyckeln som förklarar poängen', () => {
    let s = bygg();
    // Som det sparades förut: facit = bästa elevens svar, så fråga 2 är felrättad för alla
    const rad = (namn: string, poang: number, s1: string, s2: string) => ({ namn, poang, maxPoang: 2,
      svar: [sv('Fråga ett', s1, s1 === 'A. x1', 'A. x1'), sv('Fråga två', s2, s2 === 'C. fel2', 'C. fel2')] });
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-exit', prov: 'Exit 7.1', datum: '2026-10-09', rum: 'BIOLOGI8BB', rader: [
      rad('Tove Testsson', 1, 'A. x1', 'C. fel2'), rad('Sam Provlund', 1, 'B. fel1', 'D. x2'), rad('Elsa Övnegård', 1, 'C. fel1', 'D. x2'), rad('Hugo Ali', 2, 'A. x1', 'D. x2'),
    ] }).s;
    const u = rattaFacit(s);
    expect(u.quiz).toBe(1);
    expect(u.svar).toBe(4);   // fråga två: alla fyra byter mellan rätt och fel
    const tove = u.s.resultat!.find((r) => r.elevId === 'kb-0')!;
    expect(tove.svar!.map((x) => [x.ratt, x.facit])).toEqual([[true, 'A. x1'], [false, 'D. x2']]);
    expect(rattaFacit(u.s).s).toBe(u.s);   // en gång räcker
    expect(s.resultat!.find((r) => r.elevId === 'kb-0')!.svar![1].ratt).toBe(true);   // originalet orört
  });

  it('rattaFacit rör inte quiz med för få svar eller där poängen inte går ihop', () => {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-exit', prov: 'Felstart', datum: '2026-09-28', rader: [
      { namn: 'Tove Testsson', poang: 0, maxPoang: 4, svar: [sv('F1', 'A. x', false), sv('F2', '', null), sv('F3', '', null), sv('F4', '', null)] },
    ] }).s;
    expect(rattaFacit(s).s).toBe(s);
  });
});

describe('Del 242 · rätt klass', () => {
  it('klassrummet avgör: en rapport körd i BIOLOGI8AA hör till 8A även när 8B är vald', () => {
    const s = bygg();
    expect(klassForRapport(s, 'kb', 'BIOLOGI8AA', A_NAMN.map((namn) => ({ namn })))).toEqual({ klassId: 'ka', amneId: 'bi-ka', skal: 'rum' });
    expect(klassForRapport(s, 'kb', 'biologi8bb', B_NAMN.map((namn) => ({ namn })))).toEqual({ klassId: 'kb', amneId: 'bi-kb', skal: 'rum' });
  });

  it('utan klassrum avgör var eleverna finns; annars gäller den valda klassen', () => {
    const s = bygg();
    expect(klassForRapport(s, 'kb', 'Biologi41', ['Berg, Anna', 'Ali, Omar', 'Provlund, Pia', 'Okänd, Ny'].map((namn) => ({ namn })))).toEqual({ klassId: 'ka', amneId: null, skal: 'elever' });
    expect(klassForRapport(s, 'kb', 'Biologi41', ['Testsson, Tove', 'Provlund, Sam'].map((namn) => ({ namn })))).toMatchObject({ klassId: 'kb', skal: 'vald' });
    expect(klassForRapport(s, 'kb', 'Biologi41', ['Helt Okänd', 'Annan Okänd'].map((namn) => ({ namn })))).toMatchObject({ klassId: 'kb', skal: 'vald' });
    // Bara ett förnamn räcker inte för att peka ut en annan klass
    expect(sammaPerson('Anna', 'Anna Berg')).toBe(false);
    expect(sammaPerson('Berg, Anna', 'Anna Berg')).toBe(true);
  });

  it('elever som redan finns i en annan klass läggs inte till i den valda', () => {
    const s = bygg();
    const u = rosterUtanAndraKlasser(s, 'kb', [{ namn: 'Berg, Anna' }, { namn: 'Ny Elev' }, { namn: 'Ali, Omar' }]);
    expect(u.rader).toEqual([{ namn: 'Ny Elev' }]);
    expect(u.iAndraKlasser).toEqual([{ namn: 'Berg, Anna', klassNamn: '8A' }, { namn: 'Ali, Omar', klassNamn: '8A' }]);
  });
});

describe('Del 242 · quiz med under 30 % av elevernas möjliga svar', () => {
  const fragor = (n: number, besvarade: number): FragaSvar[] => Array.from({ length: n }, (_, i) => sv(`Fråga ${i + 1}`, i < besvarade ? 'A. x' : '', i < besvarade ? true : null, 'A. x'));
  function medQuiz(): Struktur {
    let s = bygg();
    // Felstart: två elever svarar på 2 av 10 frågor → 4 av 60 möjliga svar
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-laxforhor', prov: 'Bi 6.1-6.3', datum: '2026-09-28', tid: '09:17', rader: [
      { namn: 'Tove Testsson', poang: 2, maxPoang: 10, svar: fragor(10, 2) }, { namn: 'Sam Provlund', poang: 2, maxPoang: 10, svar: fragor(10, 2) },
    ] }).s;
    s = registreraFil(s, { amneId: 'bi-kb', filnamn: 'Class_2026_09_28__07_17_QZ_Bi 6.1-6.3.xlsx', importerad: '2026-09-28T10:00:00Z', kalla: 'socrative-laxforhor', prov: 'Bi 6.1-6.3', datum: '2026-09-28', traffar: 2 });
    // Det riktiga quizet tre minuter senare: fem elever svarar på allt
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-laxforhor', prov: 'Ny 6.1 - 6.3', datum: '2026-09-28', tid: '09:20', rader: B_NAMN.slice(0, 5).map((namn) => ({ namn, poang: 10, maxPoang: 10, svar: fragor(10, 10) })) }).s;
    return registreraFil(s, { amneId: 'bi-kb', filnamn: 'Class_2026_09_28__07_20_QZ_Ny 6.1 - 6.3.xlsx', importerad: '2026-09-28T10:00:00Z', kalla: 'socrative-laxforhor', prov: 'Ny 6.1 - 6.3', datum: '2026-09-28', traffar: 5 });
  }

  it('den felstartade filen pekas ut, det riktiga quizet inte', () => {
    const svaga = filerMedFaSvar(medQuiz());
    expect(svaga.map((x) => x.fil.prov)).toEqual(['Bi 6.1-6.3']);
    expect(svaga[0].andel).toMatchObject({ besvarade: 4, mojliga: 60, elever: 6, fragor: 10, deltog: 2 });
    expect(Math.round(svaga[0].andel.andel * 100)).toBe(7);
  });

  it('spärra: filen och just dess resultat tas bort, och filnamnet kommer ihåg — även som "(1)"-kopia och i datarepot', () => {
    const s = medQuiz();
    const fil = filerMedFaSvar(s)[0].fil;
    const u = sparraFil(s, fil.id, '2026-11-11');
    expect(u.resultat!.map((r) => r.prov)).toEqual(Array(5).fill('Ny 6.1 - 6.3'));
    expect(u.filregister!.map((f) => f.prov)).toEqual(['Ny 6.1 - 6.3']);
    expect(u.sparradeFiler).toEqual([{ filnamn: fil.filnamn, orsak: 'fa-svar', sparrad: '2026-11-11', prov: 'Bi 6.1-6.3', amneId: 'bi-kb', datum: '2026-09-28', andel: 4 / 60 }]);
    expect(arFilSparrad(u, 'Class_2026_09_28__07_17_QZ_Bi 6.1-6.3 (1).xlsx')).toBe(true);
    expect(arFilSparrad(u, 'Class_2026_09_28__07_20_QZ_Ny 6.1 - 6.3.xlsx')).toBe(false);
    expect(filnamnsNyckel('Fil 50% (2).xlsx')).toBe('fil 50-.xlsx');
    // Datarepot: den spärrade filen är inte "ny", den andra oimporterade är det
    const j = jamforArkiv(u, ['resultat/ak8/8B/Biologi/socrative/Class_2026_09_28__07_17_QZ_Bi 6.1-6.3.xlsx', 'resultat/ak8/8B/Biologi/socrative/Class_2026_10_02__06_36_QZ_Annat.xlsx']);
    expect(j.nya.map((r) => r.tolk!.filnamn)).toEqual(['Class_2026_10_02__06_36_QZ_Annat.xlsx']);
    expect(filerMedFaSvar(u)).toEqual([]);
    expect(arFilSparrad(havSparr(u, fil.filnamn), fil.filnamn)).toBe(false);
  });

  it('behåll: filen ligger kvar och appen frågar inte igen', () => {
    const s = medQuiz();
    const u = behallFil(s, filerMedFaSvar(s)[0].fil.id);
    expect(filerMedFaSvar(u)).toEqual([]);
    expect(u.resultat).toHaveLength(7);
  });

  it('halvklass: svarar bara grupp A räknas grupp A som de möjliga eleverna', () => {
    const s = bygg();   // grupp A: Tove, Elsa, Vera
    const hel = (namn: string) => ({ namn, deltog: true, svar: ['x', 'y', 'z', 'w'] });
    const a = svarsandelForRapport(s, 'kb', '2026-09-28', [hel('Testsson, Tove'), hel('Övnegård, Elsa'), { namn: 'Berg, Vera', deltog: false }], 4);
    expect(a).toMatchObject({ besvarade: 8, mojliga: 12, elever: 3 });
    // Felstart i helklass: en elev svarar på en fråga av fyra
    const f = svarsandelForRapport(s, 'kb', '2026-09-28', [{ namn: 'Testsson, Tove', deltog: true, svar: ['x', '', '', ''] }, { namn: 'Provlund, Sam', deltog: true, svar: ['', '', '', ''] }], 4);
    expect(f).toMatchObject({ besvarade: 1, mojliga: 24 });
  });
});

describe('Del 242 · 8A-elever som hamnat i 8B flyttas hem', () => {
  /** 8B har fått 8A:s sex elever (ur en 8A-rapport) och deras resultat från ett 8A-quiz. */
  function blandad(): Struktur {
    let s = bygg();
    A_NAMN.forEach((n, i) => { s = laggTillElev(s, { id: `fel-${i}`, klassId: 'kb', namn: n, grupp: 'A' }); });
    const svar = [sv('Fråga ett', 'A. x', true, 'A. x')];
    // 8A-quizet, importerat i 8B (klassat som övning eftersom tiden inte passade 8B:s schema)
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-ovning', autoTyp: true, prov: 'Biologi 6.1', datum: '2026-09-21', tid: '09:02', rum: 'BIOLOGI8AA', rader: A_NAMN.slice(0, 4).map((namn) => ({ namn, poang: 1, maxPoang: 1, svar })) }).s;
    s = registreraFil(s, { amneId: 'bi-kb', filnamn: 'Class_2026_09_21__07_02_QZ_Biologi_6.1.xlsx', importerad: '2026-09-21T12:00:00Z', kalla: 'socrative-ovning', prov: 'Biologi 6.1', datum: '2026-09-21', rum: 'BIOLOGI8AA', traffar: 4 });
    // 8B:s eget quiz
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-laxforhor', prov: 'Biologi 6.1', datum: '2026-09-22', rum: 'BIOLOGI8BB', rader: B_NAMN.map((namn) => ({ namn, poang: 1, maxPoang: 1, svar })) }).s;
    return registreraFil(s, { amneId: 'bi-kb', filnamn: 'Class_2026_09_22__07_02_QZ_Biologi_6.1.xlsx', importerad: '2026-09-22T12:00:00Z', kalla: 'socrative-laxforhor', prov: 'Biologi 6.1', datum: '2026-09-22', rum: 'BIOLOGI8BB', traffar: 6 });
  }

  it('förslaget: 8A:s elever i 8B hör till 8A — med vad som flyttas', () => {
    const f = eleverIFelKlass(blandad());
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ franKlassId: 'kb', tillKlassId: 'ka', resultat: 4, dubbletter: 0, filer: 1, utanAmne: 0 });
    expect(f[0].par.map((p) => p.namn).sort()).toEqual([...A_NAMN].sort());
    expect(eleverIFelKlass(bygg())).toEqual([]);
  });

  it('rensningen: eleverna är borta ur 8B, resultaten och filen ligger i 8A:s Biologi, 8B:s eget är orört', () => {
    const s = blandad();
    const u = rensaEleverIFelKlass(s, eleverIFelKlass(s)[0], '2026-11-11').s;
    expect(u.elever.filter((e) => e.klassId === 'kb').map((e) => e.namn)).toEqual(B_NAMN);
    expect(u.elever.filter((e) => e.klassId === 'ka').map((e) => e.namn)).toEqual(A_NAMN);
    const hemma = u.resultat!.filter((r) => r.amneId === 'bi-ka');
    expect(hemma.map((r) => r.elevId).sort()).toEqual(['ka-0', 'ka-1', 'ka-2', 'ka-3']);
    expect(u.resultat!.filter((r) => r.amneId === 'bi-kb')).toHaveLength(6);
    expect(u.resultat!.filter((r) => r.amneId === 'bi-kb').every((r) => r.elevId.startsWith('kb-'))).toBe(true);
    expect(u.filregister!.map((f) => [f.amneId, f.datum])).toEqual([['bi-ka', '2026-09-21'], ['bi-kb', '2026-09-22']]);
    // Tiden 09:02 en måndag är 8A:s lektion → filen räknas om från övning till läxförhör
    expect(hemma.every((r) => r.kalla === 'socrative-laxforhor')).toBe(true);
    expect(eleverIFelKlass(u)).toEqual([]);
    expect(s.elever).toHaveLength(18);   // originalet orört
  });

  it('ett resultat som redan finns hemma tas inte dit en gång till', () => {
    let s = blandad();
    s = importeraResultat(s, { klassId: 'ka', amneId: 'bi-ka', kalla: 'socrative-ovning', prov: 'Biologi 6.1', datum: '2026-09-21', tid: '09:02', rum: 'BIOLOGI8AA', rader: [{ namn: 'Anna Berg', poang: 1, maxPoang: 1 }] }).s;
    const f = eleverIFelKlass(s)[0];
    expect(f).toMatchObject({ resultat: 3, dubbletter: 1 });
  });

  it('enstaka namne i en annan klass rörs inte, och lika stora klasser utan ledtråd lämnas', () => {
    let s = bygg();
    s = laggTillElev(s, { id: 'x', klassId: 'kb', namn: 'Anna Berg', grupp: 'A' });
    expect(eleverIFelKlass(s)).toEqual([]);
    // Båda klasserna har exakt samma elever och inga resultat: går inte att avgöra
    let t = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    t = laggTillTjanst(t, { id: 'tj', skolarId: 'la', namn: 'NO' });
    for (const kid of ['ka', 'kb']) { t = laggTillKlass(t, { id: kid, tjanstId: 'tj', namn: kid === 'ka' ? '8A' : '8B' }); A_NAMN.forEach((n, i) => { t = laggTillElev(t, { id: `${kid}-${i}`, klassId: kid, namn: n, grupp: 'A' }); }); }
    expect(eleverIFelKlass(t)).toEqual([]);
  });
});
