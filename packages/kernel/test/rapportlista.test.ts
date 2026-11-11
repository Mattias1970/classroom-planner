/**
 * Del 244 · Rapportlistan från Socrative: tolkning, vilka rum som är våra, och listan mot inlästa filer.
 */
import { describe, expect, it } from 'vitest';
import {
  importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillRapporter, laggTillSkolar, laggTillTjanst, rapportForFil, rapportlage, registreraFil,
  rumInfo, sparraFil, summeraRapporter, tolkaRapportlista, tomRapportlista, tomStruktur, utcForSvenskTid, type FragaSvar, type ResultatKalla, type Struktur,
} from '../src/index.js';

const NAMN = ['Anna Berg', 'Omar Ali', 'Pia Provlund', 'Kim Testsson', 'Tove Testsson', 'Sam Provlund', 'Elsa Övnegård', 'Hugo Ali', 'Mira Berg', 'Noa Ali'];

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  for (const [kid, namn] of [['kb', '8B'], ['ka', '8A']] as const) {
    s = laggTillKlass(s, { id: kid, tjanstId: 'tj', namn });
    s = laggTillAmne(s, { id: `bi-${kid}`, klassId: kid, namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
    s = laggTillAmne(s, { id: `ma-${kid}`, klassId: kid, namn: 'Matematik', schema: [{ dag: 2, start: '09:00', slut: '10:00' }] });
    NAMN.forEach((n, i) => { s = laggTillElev(s, { id: `${kid}-${i}`, klassId: kid, namn: `${n} ${namn}`, grupp: 'A' }); });
  }
  return s;
}

/** Importerar en fil för 8B Biologi: `antal` elever svarar på alla fem frågorna. */
function fil(s: Struktur, filnamn: string, prov: string, kalla: ResultatKalla, antal: number, rum = 'BIOLOGI8BB'): Struktur {
  const svar: FragaSvar[] = Array.from({ length: 5 }, (_, i) => ({ fraga: `F${i + 1}`, svar: 'A. x', ratt: true, facit: 'A. x' }));
  const datum = `${filnamn.slice(6, 10)}-${filnamn.slice(11, 13)}-${filnamn.slice(14, 16)}`;
  const u = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla, prov, datum, rum, rader: NAMN.slice(0, antal).map((n) => ({ namn: `${n} 8B`, poang: 5, maxPoang: 5, svar })) });
  return registreraFil(u.s, { amneId: 'bi-kb', filnamn, importerad: 'nu', kalla, prov, datum, rum, traffar: u.traffar });
}

describe('Del 244 · tolkaRapportlista', () => {
  it('listan som den kopieras från Socrative: en uppgift per rad, rubriker hoppas över', () => {
    const text = ['ARCHIVE', 'DELETE', 'ALL', 'NAME', 'DATE', 'ROOM', 'TYPE',
      '6.1-6.5,7.1-7.3', '11/2/2026', '10:06 PM', 'BIOLOGI8AA', 'Quiz',
      'Nervsystemet 7.5', '10/30/2026', '1:28 PM', 'BIOLOGI8BB', 'Quiz',
      'Biologi 4.1 Begrepp', '8/24/2026', '1:04 AM', 'BIOLOGI8BB', 'Quiz', '1-50 of 2008'].join('\n');
    expect(tolkaRapportlista(text)).toEqual([
      { quiz: '6.1-6.5,7.1-7.3', slut: '2026-11-02T22:06', rum: 'BIOLOGI8AA', typ: 'Quiz' },
      { quiz: 'Nervsystemet 7.5', slut: '2026-10-30T13:28', rum: 'BIOLOGI8BB', typ: 'Quiz' },
      { quiz: 'Biologi 4.1 Begrepp', slut: '2026-08-24T01:04', rum: 'BIOLOGI8BB', typ: 'Quiz' },
    ]);
  });

  it('tabbavgränsat, datum och tid i samma ruta, 24-timmarstid och ISO-datum; dubbletter räknas en gång', () => {
    const text = 'Kap 6.1-6.5, 7.1\t10/12/2026 10:21 AM\tBIOLOGI8BB\tQuiz\nSamhälle och styrning\t2026-10-08\t11:58\tSO8BB\tSpace Race\nKap 6.1-6.5, 7.1\t10/12/2026\t10:21 AM\tBIOLOGI8BB\tQuiz\n';
    expect(tolkaRapportlista(text)).toEqual([
      { quiz: 'Kap 6.1-6.5, 7.1', slut: '2026-10-12T10:21', rum: 'BIOLOGI8BB', typ: 'Quiz' },
      { quiz: 'Samhälle och styrning', slut: '2026-10-08T11:58', rum: 'SO8BB', typ: 'Space Race' },
    ]);
    expect(tolkaRapportlista('bara text utan rapporter')).toEqual([]);
  });

  it('listan sparas, fylls på utan dubbletter och kan tömmas', () => {
    const a = tolkaRapportlista('Q1\t9/21/2026\t10:19 AM\tBIOLOGI8BB\tQuiz');
    const b = tolkaRapportlista('Q1\t9/21/2026\t10:19 AM\tBIOLOGI8BB\tQuiz\nQ2\t9/21/2026\t10:44 AM\tBIOLOGI8BB\tQuiz');
    const s1 = laggTillRapporter(grund(), a);
    const s2 = laggTillRapporter(s1.s, b);
    expect([s1.nya, s2.nya, s2.s.socrativeRapporter!.map((r) => r.quiz)]).toEqual([1, 1, ['Q2', 'Q1']]);
    expect(laggTillRapporter(s2.s, b).s).toBe(s2.s);
    expect(tomRapportlista(s2.s).socrativeRapporter).toBeUndefined();
  });
});

describe('Del 244 · rummen vi använder', () => {
  it('klassrum, begreppsrum, ämnesrum — och rum som inte är våra', () => {
    const s = grund();
    expect(rumInfo(s, 'BIOLOGI8AA')).toMatchObject({ slag: 'klassrum', klassId: 'ka', amneId: 'bi-ka' });
    expect(rumInfo(s, 'Matte8BB')).toMatchObject({ slag: 'klassrum', klassId: 'kb', amneId: 'ma-kb' });
    expect(rumInfo(s, 'Biologi41')).toMatchObject({ slag: 'begreppsrum', amnesNamn: 'Biologi' });
    expect(rumInfo(s, 'Matte8B')).toMatchObject({ slag: 'amnesrum', amnesNamn: 'Matematik' });
    expect(rumInfo(s, 'SO8BB').slag).toBe('annat');
    expect(rumInfo(s, 'KEMI28').slag).toBe('annat');   // läraren har inget ämne Kemi i den här strukturen
  });

  it('svensk tid till UTC: sommartid +2, vintertid +1', () => {
    expect(utcForSvenskTid('2026-09-21T10:19')).toBe('2026-09-21T08:19:00.000Z');
    expect(utcForSvenskTid('2026-11-02T12:42')).toBe('2026-11-02T11:42:00.000Z');
  });
});

describe('Del 244 · listan mot inlästa filer', () => {
  // Rummet kör en aktivitet i taget: filnamnet har STARTEN (UTC), listan har SLUTET (svensk tid)
  const LISTA = [
    'Läxa 6.1\t9/21/2026\t10:19 AM\tBIOLOGI8BB\tQuiz',        // startade 09:13 (07:13 UTC)
    'Exit 6.2\t9/21/2026\t10:44 AM\tBIOLOGI8BB\tQuiz',        // startade 10:20
    'Läxa 6.1-6.2\t9/25/2026\t9:35 AM\tBIOLOGI8BB\tQuiz',     // saknas
    'Felstart\t9/28/2026\t9:18 AM\tBIOLOGI8BB\tQuiz',         // 1 elev av 10
    'Läxa 6.1-6.3\t9/28/2026\t9:34 AM\tBIOLOGI8BB\tQuiz',
    'Läxa 6.1-6.4\t10/5/2026\t9:20 AM\tBIOLOGI8BB\tQuiz',     // startade fredag 2/10, låg öppen över helgen
    'Läxa 6.1-6.4\t10/5/2026\t10:12 AM\tBIOLOGI8BB\tQuiz',    // samma quiz igen, startade 09:21
    'Läxa 6.1\t9/21/2026\t2:35 PM\tBIOLOGI8AA\tQuiz',
    'Samhälle\t10/8/2026\t11:58 AM\tSO8BB\tQuiz',
    'Gammalt\t6/17/2026\t8:52 PM\tBIOLOGI8BB\tQuiz',
  ].join('\n');
  const medFiler = (): Struktur => {
    let s = grund();
    s = fil(s, 'Class_2026_09_21__07_13_QZ_Läxa 6.1.xlsx', 'Läxa 6.1', 'socrative-laxforhor', 9);
    s = fil(s, 'Class_2026_09_21__08_20_QZ_Exit 6.2 (1).xlsx', 'Exit 6.2', 'socrative-exit', 8);
    s = fil(s, 'Class_2026_09_28__07_17_QZ_Felstart.xlsx', 'Felstart', 'socrative-laxforhor', 1);
    s = fil(s, 'Class_2026_09_28__07_20_QZ_Läxa 6.1-6.3.xlsx', 'Läxa 6.1-6.3', 'socrative-ovning', 9);
    s = fil(s, 'Class_2026_10_02__06_36_QZ_Läxa 6.1-6.4.xlsx', 'Läxa 6.1-6.4', 'socrative-laxforhor', 9);
    s = fil(s, 'Class_2026_10_05__07_21_QZ_Läxa 6.1-6.4.xlsx', 'Läxa 6.1-6.4', 'socrative-laxforhor', 10);
    return laggTillRapporter(s, tolkaRapportlista(LISTA)).s;
  };
  const lage = (s: Struktur) => Object.fromEntries(rapportlage(s).map((r) => [`${r.rapport.rum} ${r.rapport.slut.slice(5)} ${r.rapport.quiz}`, `${r.lage}${r.filnamn !== undefined ? ` ${r.filnamn.slice(6, 23)}` : ''}`]));

  it('varje rapport får sitt läge — filen hör till rapporten vars fönster rymmer filens start', () => {
    expect(lage(medFiler())).toEqual({
      'BIOLOGI8BB 09-21T10:19 Läxa 6.1': 'importerad 2026_09_21__07_13',
      'BIOLOGI8BB 09-21T10:44 Exit 6.2': 'importerad 2026_09_21__08_20',
      'BIOLOGI8BB 09-25T09:35 Läxa 6.1-6.2': 'saknas',
      'BIOLOGI8BB 09-28T09:18 Felstart': 'importerad 2026_09_28__07_17',
      'BIOLOGI8BB 09-28T09:34 Läxa 6.1-6.3': 'importerad 2026_09_28__07_20',
      'BIOLOGI8BB 10-05T09:20 Läxa 6.1-6.4': 'importerad 2026_10_02__06_36',
      'BIOLOGI8BB 10-05T10:12 Läxa 6.1-6.4': 'importerad 2026_10_05__07_21',
      'BIOLOGI8AA 09-21T14:35 Läxa 6.1': 'saknas',
      'SO8BB 10-08T11:58 Samhälle': 'annat-rum',
      'BIOLOGI8BB 06-17T20:52 Gammalt': 'utanfor',
    });
  });

  it('summeringen per rum: riktiga test per typ, för få svar, saknade — andra rum sist, äldre rapporter räknas inte', () => {
    const sum = summeraRapporter(rapportlage(medFiler()));
    expect(sum.map((x) => [x.rum, x.info.slag, x.totalt, x.importerade, x.laxforhor, x.exit, x.ovning, x.faSvar, x.sparrade, x.saknas])).toEqual([
      ['BIOLOGI8AA', 'klassrum', 1, 0, 0, 0, 0, 0, 0, 1],
      ['BIOLOGI8BB', 'klassrum', 7, 6, 3, 1, 1, 1, 0, 1],
      ['SO8BB', 'annat', 1, 0, 0, 0, 0, 0, 0, 0],
    ]);
  });

  it('en spärrad fil räknas som sedd, inte som saknad', () => {
    const s = medFiler();
    const felstart = s.filregister!.find((f) => f.prov === 'Felstart')!;
    const sparrad = sparraFil(s, felstart.id, '2026-11-11');
    expect(lage(sparrad)['BIOLOGI8BB 09-28T09:18 Felstart']).toBe('sparrad 2026_09_28__07_17');
    expect(summeraRapporter(rapportlage(sparrad)).find((x) => x.rum === 'BIOLOGI8BB')).toMatchObject({ importerade: 5, sparrade: 1, faSvar: 0, saknas: 1 });
  });

  it('rapportForFil: en fil som ännu inte importerats pekas ut i listan på rum, start och quiznamn', () => {
    const s = medFiler();
    expect(rapportForFil(s, { filnamn: 'Class_2026_09_25__06_37_QZ_Läxa 6.1-6.2 (1).xlsx', rum: 'BIOLOGI8BB', quiz: 'Läxa 6.1-6.2' })?.slut).toBe('2026-09-25T09:35');
    expect(rapportForFil(s, { filnamn: 'Class_2026_09_25__06_37_QZ_Läxa 6.1-6.2.xlsx', rum: 'BIOLOGI8AA', quiz: 'Läxa 6.1-6.2' })).toBeNull();   // fel rum
    expect(rapportForFil(s, { filnamn: 'Class_2026_09_25__08_37_QZ_Läxa 6.1-6.2.xlsx', rum: 'BIOLOGI8BB', quiz: 'Läxa 6.1-6.2' })).toBeNull();   // startade efter att rapporten avslutats
    expect(rapportForFil(grund(), { filnamn: 'Class_2026_09_25__06_37_QZ_X.xlsx', rum: 'BIOLOGI8BB', quiz: 'X' })).toBeNull();                    // ingen lista
  });

  it('utan lista finns inget att visa', () => {
    expect(rapportlage(grund())).toEqual([]);
  });
});
