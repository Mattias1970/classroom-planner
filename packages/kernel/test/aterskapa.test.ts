import { beforeEach, describe, expect, it } from 'vitest';
import { aterskapaPlanering, aterskapaNyckel, godkannAterskapad } from '../src/domain/aterskapa.js';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { importeraResultat, type ResultatKalla } from '../src/domain/resultat.js';
import { planForAmne } from '../src/domain/studieguide.js';
import {
  aterstallPlanering, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sparaBok,
} from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

beforeEach(resetIdRaknare);

// Bok: 1.1 (två delar), 1.2, 1.3, Blandade uppgifter, Prov — sedan kapitel 2
const BOK = JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'mattebok', titel: 'Testmatte 8', förlag: 'Testförlaget', ämne: 'Matematik', årskurs: 8,
    kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' }, '2': { name: 'Geometri', col: '#2e7d46' } } },
  lektioner: {
    '1': [
      { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8' },
      { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '9–16' },
      { id: 3, type: 'regular', avsnitt: '1.2 Decimaltal', del: 1, ett: '17–24' },
      { id: 4, type: 'regular', avsnitt: '1.3 Procent', del: 1, ett: '25–32' },
      { id: 5, type: 'repetition', avsnitt: 'Blandade uppgifter', del: 1 },
      { id: 6, type: 'exam', avsnitt: 'Prov kapitel 1', del: 1 },
    ],
    '2': [{ id: 1, type: 'regular', avsnitt: '2.1 Vinklar', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.2 Trianglar', del: 1 }],
  },
});

/** Helklass Matematik mån/ons/fre 08:10 från måndag 17 aug. */
function klass(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = sparaBok(s, bokFromValfriImport(BOK));
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'mattebok', schema: [1, 3, 5].map((dag) => ({ dag, start: '08:10', slut: '09:10' })) });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
  return registreraPlanering(s, { id: 'pl1', amneId: 'ma', bokId: 'mattebok', skapad: '2026-08-10' });
}

function quiz(s: Struktur, kalla: ResultatKalla, datum: string, prov: string, rum?: string, amneId = 'ma'): Struktur {
  return importeraResultat(s, {
    klassId: 'k', amneId, kalla, prov, datum, ...(rum !== undefined ? { rum } : {}),
    rader: [{ namn: 'Anna Testsson', poang: 8, maxPoang: 10 }, { namn: 'Pia Provlund', poang: 9, maxPoang: 10 }],
  }).s;
}

function termin(): Struktur {
  let s = klass();
  s = quiz(s, 'socrative-exit', '2026-08-17', 'Quiz 1.1', 'Matte11');            // nytt avsnitt 1.1
  s = quiz(s, 'socrative-laxforhor', '2026-08-19', 'Quiz 1.1', 'Matte11');       // läxförhöret nästa lektion
  s = quiz(s, 'socrative-exit', '2026-08-19', 'Quiz 1.1 del 2', 'Matte11');      // samma exit igen → del 2
  s = quiz(s, 'socrative-laxforhor', '2026-08-21', 'Quiz 1.1', 'Matte11');       // samma förhör igen → extra lektion
  s = quiz(s, 'socrative-ovning', '2026-08-24', 'Övning bråk', 'MATTE8BB');      // förhör utan exit (1.2 dyker upp i nästa läxförhör)
  s = quiz(s, 'socrative-laxforhor', '2026-08-26', 'Quiz 1.1-1.2', 'Matte112');
  s = quiz(s, 'socrative-exit', '2026-08-26', 'Quiz 1.3', 'Matte13');            // nytt avsnitt 1.3
  // 28 aug: inget quiz
  s = quiz(s, 'digiexam', '2026-08-31', 'Prov kapitel 1');                         // prov
  s = quiz(s, 'socrative-ovning', '2026-08-29', 'Hemövning', 'MATTE8BB');        // lördag — utanför schemat
  return s;
}

describe('Del 156: återskapa genomförd planering ur quizzarna', () => {
  it('exit = nytt avsnitt, samma exit igen = nästa del, samma förhör igen = extra lektion, dold genomgång, pass utan quiz och prov', () => {
    const a = aterskapaPlanering(termin(), 'ma', '2026-09-01');
    expect(a.grupper).toHaveLength(1);
    const g = a.grupper[0];
    expect(g.grupp).toBeNull();
    const rad = (datum: string) => g.lektioner.find((l) => l.datum === datum)!;
    expect(g.lektioner.map((l) => l.datum)).toEqual(['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26', '2026-08-28', '2026-08-31']);

    expect(rad('2026-08-17')).toMatchObject({ typ: 'avsnitt', rubrik: '1.1 Bråk', rader: ['1:1'], saker: true, kod: '1.1' });
    expect(rad('2026-08-19')).toMatchObject({ typ: 'avsnitt', rader: ['1:2'], saker: true });
    expect(rad('2026-08-19').skal).toContain('nästa del');
    expect(rad('2026-08-21')).toMatchObject({ typ: 'extra', rubrik: '1.1 Bråk – extra lektion (Testa dig själv)', saker: true });
    expect(rad('2026-08-21').quiz[0].upprepat).toBe(true);
    // Övning utan exit, men 1.2 finns i nästa läxförhör och ingen exit introducerade det
    expect(rad('2026-08-24')).toMatchObject({ typ: 'avsnitt', rubrik: '1.2 Decimaltal', rader: ['1:3'], saker: false });
    expect(rad('2026-08-26')).toMatchObject({ typ: 'avsnitt', rubrik: '1.3 Procent', saker: true });
    expect(rad('2026-08-28')).toMatchObject({ typ: 'annat', rubrik: 'Lektion utan quiz', saker: false });
    expect(rad('2026-08-31')).toMatchObject({ typ: 'prov', rubrik: 'Prov kapitel 1', rader: ['1:6'], saker: true });
    expect(rad('2026-08-17').underlag).toEqual(['Exit · Matte11']);

    expect(g.hoppade).toEqual(['Blandade uppgifter']);
    expect(g.fortsatter).toBe('2.1 Vinklar');
    expect(a.utanforSchema).toEqual([{ datum: '2026-08-29', kalla: 'socrative-ovning', prov: 'Hemövning' }]);
    expect(a.summa).toMatchObject({ avsnitt: 4, extra: 1, prov: 1, annat: 1 });
  });

  it('lärarens val byter passets innehåll och påverkar vilken bokrad som kommer sedan', () => {
    const s = termin();
    const val = {
      [aterskapaNyckel(null, '2026-08-24', '08:10')]: { typ: 'extra' as const },           // inte 1.2 ändå
      [aterskapaNyckel(null, '2026-08-28', '08:10')]: { typ: 'nasta' as const },           // genomgång utan exit
    };
    const g = aterskapaPlanering(s, 'ma', '2026-09-01', val).grupper[0];
    const rad = (datum: string) => g.lektioner.find((l) => l.datum === datum)!;
    expect(rad('2026-08-24')).toMatchObject({ typ: 'extra', val: 'extra', vald: 'extra', forslag: 'avsnitt' });
    // 1.2 har inte gåtts igenom: nästa i boken efter 1.3 är Blandade uppgifter
    expect(rad('2026-08-28')).toMatchObject({ typ: 'avsnitt', rubrik: 'Blandade uppgifter', val: 'nasta' });
    expect(g.hoppade).toEqual(['1.2 Decimaltal']);
  });

  it('godkänt blir facit: det gjorda före idag, boken från nästa rad, ny version (den gamla kan återställas), lektionsplanerna följer med', () => {
    let s = termin();
    const fore = planForAmne(s, 'ma', '2026-09-01');
    expect(fore[3].lektion.avsnitt).toBe('1.3 Procent');                 // utan facit: bokens följd
    s = { ...s, lektionsplaner: [{ id: 'lp', amneId: 'ma', lektionsIndex: 3, presentation: 'Procent.pptx' }] };
    const val = { [aterskapaNyckel(null, '2026-08-28', '08:10')]: { typ: 'installd' as const } };
    s = godkannAterskapad(s, aterskapaPlanering(s, 'ma', '2026-09-01', val), '2026-09-01T18:00:00Z');

    const plan = planForAmne(s, 'ma', '2026-09-01');
    expect(plan.slice(0, 7).map((p) => [p.datum, p.lektion.avsnitt])).toEqual([
      ['2026-08-17', '1.1 Bråk'],
      ['2026-08-19', '1.1 Bråk'],
      ['2026-08-21', '1.1 Bråk – extra lektion (Testa dig själv)'],
      ['2026-08-24', '1.2 Decimaltal'],
      ['2026-08-26', '1.3 Procent'],
      ['2026-08-31', 'Prov kapitel 1'],                                      // 28 aug inställd → ingen lektion
      ['2026-09-02', '2.1 Vinklar'],                                         // boken fortsätter efter provet
    ]);
    // Extra lektionen har avsnittets uppgifter
    expect(plan[2].lektion.niva1).toBe('1–8');
    // Lektionsplanen för 1.3 flyttade från index 3 till 4
    expect(s.lektionsplaner.find((p) => p.id === 'lp')!.lektionsIndex).toBe(4);

    const aktiv = s.planeringar.find((p) => p.amneId === 'ma')!;
    expect(aktiv.version).toBe(2);
    expect(aktiv.genomfort!.till).toBe('2026-09-01');
    expect(aktiv.genomfort!.a.find((l) => l.datum === '2026-08-28')).toMatchObject({ typ: 'installd', vald: 'installd' });
    // Nytt återskapande minns lärarens val
    expect(aterskapaPlanering(s, 'ma', '2026-09-05').grupper[0].lektioner.find((l) => l.datum === '2026-08-28')!.typ).toBe('installd');
    // Återställ den gamla versionen → bokens följd igen
    s = aterstallPlanering(s, 'pl1');
    expect(planForAmne(s, 'ma', '2026-09-01')[3].lektion.avsnitt).toBe('1.3 Procent');
  });

  it('halvklass: grupp A och B var för sig; halvklasspass utan quiz föreslås som laboration', () => {
    let s = klass();
    s = sparaBok(s, bokFromValfriImport(BOK.replace('"ämne": "Matematik"', '"ämne": "Biologi"').replace('"ämne":"Matematik"', '"ämne":"Biologi"')));
    s = laggTillAmne(s, {
      id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'mattebok', halvklass: true, laborationsstandard: true,
      schema: [{ dag: 1, start: '10:10', slut: '11:10' }, { dag: 4, start: '08:10', slut: '09:10' }],
      schemaB: [{ dag: 1, start: '10:10', slut: '11:10' }, { dag: 4, start: '10:10', slut: '11:10' }],
      laborationer: [{ id: 'lab1', rubrik: 'Mikroskopet' }],
    });
    s = registreraPlanering(s, { id: 'pl2', amneId: 'bi', bokId: 'mattebok', skapad: '2026-08-10' });
    s = quiz(s, 'socrative-exit', '2026-08-17', 'Bi 1.1', 'Biologi11', 'bi');     // måndag helklass, båda grupperna
    s = quiz(s, 'socrative-laxforhor', '2026-08-24', 'Bi 1.1', 'Biologi11', 'bi');
    s = quiz(s, 'socrative-exit', '2026-08-24', 'Bi 1.2', 'Biologi12', 'bi');
    const a = aterskapaPlanering(s, 'bi', '2026-08-25');
    expect(a.grupper.map((g) => g.grupp)).toEqual(['A', 'B']);
    const [ga, gb] = a.grupper;
    expect(ga.lektioner.map((l) => [l.datum, l.start, l.typ, l.rubrik])).toEqual([
      ['2026-08-17', '10:10', 'avsnitt', '1.1 Bråk'],
      ['2026-08-20', '08:10', 'laboration', '🧪 Mikroskopet'],
      ['2026-08-24', '10:10', 'avsnitt', '1.2 Decimaltal'],
    ]);
    expect(ga.lektioner[1]).toMatchObject({ halvklasspass: true, saker: false });
    expect(gb.lektioner.map((l) => [l.datum, l.start, l.typ])).toEqual([
      ['2026-08-17', '10:10', 'avsnitt'], ['2026-08-20', '10:10', 'laboration'], ['2026-08-24', '10:10', 'avsnitt'],
    ]);
    // Samma exit hittades i båda grupperna (eleverna i grupp A resp. B)
    expect(ga.lektioner[0].quiz[0].antal).toBe(1);
    expect(ga.hoppade).toEqual(['1.1 Bråk']);            // del 2 av 1.1 hoppades över

    s = godkannAterskapad(s, a, '2026-08-25T12:00:00Z');
    const plan = planForAmne(s, 'bi', '2026-08-25');
    const perGrupp = (datum: string, start: string) => plan.filter((p) => p.datum === datum && p.start === start).map((p) => p.lektion.avsnitt);
    expect(perGrupp('2026-08-20', '08:10')).toEqual(['🧪 Mikroskopet']);   // grupp A:s halvklasspass
    expect(perGrupp('2026-08-20', '10:10')).toEqual(['🧪 Mikroskopet']);   // grupp B:s
    // Nästa helklasspass efter facit: bokens rad efter 1.2
    expect(perGrupp('2026-08-31', '10:10')[0]).toBe('1.3 Procent');
  });

  it('importen: samma fil igen ersätter raderna, samma quiz en annan dag sparas som ett nytt tillfälle', () => {
    let s = klass();
    s = quiz(s, 'socrative-laxforhor', '2026-08-19', 'Quiz 1.1', 'Matte11');
    s = quiz(s, 'socrative-laxforhor', '2026-08-19', 'Quiz 1.1', 'Matte11');     // samma fil en gång till
    expect(s.resultat!.filter((r) => r.elevId === 'e1')).toHaveLength(1);
    s = quiz(s, 'socrative-laxforhor', '2026-08-21', 'Quiz 1.1', 'Matte11');     // förhöret körs igen
    expect(s.resultat!.filter((r) => r.elevId === 'e1').map((r) => r.datum).sort()).toEqual(['2026-08-19', '2026-08-21']);
  });
});
