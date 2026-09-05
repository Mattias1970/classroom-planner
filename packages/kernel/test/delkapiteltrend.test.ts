import { describe, expect, it } from 'vitest';
import { aterkommandeFel, aterkommandeFelKlass, delkapitelSegment, fragansDelkapitel } from '../src/domain/delkapiteltrend.js';
import { importeraResultat, type FragaSvar } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

// Frågor: A och B hör till 4.1, C till 4.2, D till 4.3
const A = 'Vad kallas samspelet i naturen?';
const B = 'Vad är en population?';
const C = 'Vad är en näringskedja?';
const D = 'Vad är övergödning?';

function sv(par: Array<[string, boolean]>): FragaSvar[] {
  return par.map(([fraga, ratt]) => ({ fraga, svar: ratt ? 'rätt' : 'fel', ratt }));
}

/** Anna glömmer 4.1 med tiden, Omar lär sig. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
  const imp = (prov: string, datum: string, rum: string, anna: FragaSvar[], omar: FragaSvar[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov, datum, rum, rader: [
      { namn: 'Anna Berg', poang: anna.filter((x) => x.ratt).length, maxPoang: anna.length, svar: anna },
      { namn: 'Omar Ali', poang: omar.filter((x) => x.ratt).length, maxPoang: omar.length, svar: omar },
    ] }).s;
  };
  imp('Biologi 4.1 Begrepp', '2026-08-21', 'Biologi41', sv([[A, true], [B, true]]), sv([[A, false], [B, false]]));
  imp('4.1-4.2 Begrepp', '2026-08-28', 'Biologi412', sv([[A, true], [B, false], [C, true]]), sv([[A, true], [B, false], [C, true]]));
  imp('4.1-4.3 Begrepp', '2026-09-04', 'Biologi4123', sv([[A, false], [B, false], [C, true], [D, true]]), sv([[A, true], [B, true], [C, true], [D, false]]));
  return s;
}
const f = { klassId: 'k', amneId: 'bi' };

describe('fragansDelkapitel', () => {
  it('knyter frågan till det delkapitel där den först ställdes', () => {
    const s = bygg();
    const tillfallen = [...new Set((s.resultat ?? []).map((r) => r.prov))];
    expect(tillfallen).toHaveLength(3);
    const karta = fragansDelkapitel([
      { nyckel: '1', prov: 'p1', datum: '2026-08-21', rum: 'Biologi41', resultat: (s.resultat ?? []).filter((r) => r.rum === 'Biologi41') },
      { nyckel: '2', prov: 'p2', datum: '2026-08-28', rum: 'Biologi412', resultat: (s.resultat ?? []).filter((r) => r.rum === 'Biologi412') },
      { nyckel: '3', prov: 'p3', datum: '2026-09-04', rum: 'Biologi4123', resultat: (s.resultat ?? []).filter((r) => r.rum === 'Biologi4123') },
    ]);
    expect([...karta.values()].sort()).toEqual(['4.1', '4.1', '4.2', '4.3']);
  });
});

describe('delkapitelSegment', () => {
  it('delar upp varje tillfälle i delkapitel — 4.1-delen syns även i 41234', () => {
    const seg = delkapitelSegment(bygg(), f);
    expect(seg.map((t) => t.segment.map((x) => x.kod))).toEqual([['4.1'], ['4.1', '4.2'], ['4.1', '4.2', '4.3']]);
    // Klassen: 4.1 börjar på 50 % (Anna 2/2, Omar 0/2), sedan 50 %, sedan 50 %
    expect(seg.map((t) => t.segment.map((x) => `${x.kod}:${x.procent}`))).toEqual([
      ['4.1:50'], ['4.1:50', '4.2:100'], ['4.1:50', '4.2:100', '4.3:50'],
    ]);
    expect(seg[2].antalFragor).toBe(4);
    expect(seg[0]).toMatchObject({ prov: 'Biologi 4.1 Begrepp', rum: 'Biologi41', procent: 50 });
  });

  it('med elevId gäller siffrorna en elev: Anna tappar 4.1, Omar tar igen det', () => {
    const anna = delkapitelSegment(bygg(), { ...f, elevId: 'a' }).map((t) => t.segment.find((x) => x.kod === '4.1')!.procent);
    expect(anna).toEqual([100, 50, 0]);
    const omar = delkapitelSegment(bygg(), { ...f, elevId: 'b' }).map((t) => t.segment.find((x) => x.kod === '4.1')!.procent);
    expect(omar).toEqual([0, 50, 100]);
  });
});

describe('aterkommandeFel', () => {
  it('Anna: B fastnar (rätt, fel, fel), A har bara ett fel och kommer inte med', () => {
    const fel = aterkommandeFel(bygg(), 'a', f);
    expect(fel.map((x) => x.fraga)).toEqual([B]);
    expect(fel[0]).toMatchObject({ kod: '4.1', antalFel: 2, antalRatt: 1, senasteFel: '2026-09-04', rattEfterSenasteFel: 0 });
    expect(fel[0].historik).toHaveLength(3);
  });

  it('Omar: A och B faller bort — två fel men rätt två gånger sedan dess', () => {
    let s = bygg();
    // Ett fjärde förhör där Omar har allt rätt: nu har han två rätt efter sista felet
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: '4.1-4.4 Begrepp', datum: '2026-09-11', rum: 'Biologi41234', rader: [
      { namn: 'Omar Ali', poang: 4, maxPoang: 4, svar: sv([[A, true], [B, true], [C, true], [D, true]]) },
      { namn: 'Anna Berg', poang: 1, maxPoang: 4, svar: sv([[A, false], [B, false], [C, false], [D, true]]) },
    ] }).s;
    expect(aterkommandeFel(s, 'b', f)).toEqual([]); // A: fel×1, B: fel×2 men rätt 2 ggr sedan dess
    // Anna har nu fyra fel på B och fortsatt inget rätt
    const anna = aterkommandeFel(s, 'a', f);
    expect(anna.map((x) => `${x.fraga}:${x.antalFel}`)).toEqual([`${B}:3`, `${A}:2`]); // C har bara ett fel
  });

  it('ett nytt fel nollställer räkningen av rätta svar', () => {
    const fel = aterkommandeFel(bygg(), 'b', f);
    // Omar: B fel, fel, rätt → bara ett rätt efter sista felet, alltså kvar
    expect(fel.map((x) => x.fraga)).toEqual([B]);
    expect(fel[0]).toMatchObject({ antalFel: 2, rattEfterSenasteFel: 1 });
  });
});

describe('aterkommandeFelKlass', () => {
  it('rangordnar begrepp efter hur många elever som fastnat', () => {
    const lista = aterkommandeFelKlass(bygg(), f);
    expect(lista[0]).toMatchObject({ fraga: B, kod: '4.1', antalElever: 2 });
    expect(lista[0].elever.map((e) => e.elev.namn)).toEqual(['Anna Berg', 'Omar Ali']);
  });
});

describe('Del 75: frågematris och frågefilter', async () => {
  const { fragematris, filtreraFragor } = await import('../src/domain/delkapiteltrend.js');

  it('numrerar frågorna per delkapitel och ger en cell per fråga och tillfälle', () => {
    const m = fragematris(bygg(), f);
    expect(m.fragor.map((x) => `${x.nr}:${x.kod}`)).toEqual(['1:4.1', '2:4.1', '3:4.2', '4:4.3']);
    expect(m.grupper).toEqual([
      { kod: '4.1', etikett: 'Test41', ursprung: 'Biologi 4.1 Begrepp', fran: 1, till: 2 },
      { kod: '4.2', etikett: 'Test42', ursprung: '4.1-4.2 Begrepp', fran: 3, till: 3 },
      { kod: '4.3', etikett: 'Test43', ursprung: '4.1-4.3 Begrepp', fran: 4, till: 4 },
    ]);
    // Första förhöret innehöll bara fråga 1 och 2
    expect(m.rader[0].celler.map((c) => c?.procent ?? null)).toEqual([50, 50, null, null]);
    expect(m.rader[2].celler.map((c) => c?.procent ?? null)).toEqual([50, 50, 100, 50]);
    expect(m.rader[0].celler[0]).toMatchObject({ bedomda: 2, ratt: 1 });
    expect(m.rader[0].elevCeller).toBeUndefined();
  });

  it('med elevId ges rätt/fel/tomt per ruta', () => {
    const m = fragematris(bygg(), { ...f, elevId: 'a' });
    expect(m.rader.map((r) => r.elevCeller)).toEqual([
      [true, true, null, null],
      [true, false, true, null],
      [false, false, true, true],
    ]);
  });

  it('filtrerar frågor på andel rätt och valda tillfällen', () => {
    const m = fragematris(bygg(), f);
    const svaga = filtreraFragor(m, { max: 50 });
    expect(svaga.map((x) => `${x.nr}:${x.procent}`)).toEqual(['2:33', '4:50']); // fråga 1 ligger på 67 %
    expect(svaga[0]).toMatchObject({ bedomda: 6, ratt: 2, antalTillfallen: 3 });
    // Bara sista tillfället
    const bara3 = filtreraFragor(m, { tillfallen: [m.rader[2].nyckel] });
    expect(bara3.map((x) => `${x.nr}:${x.procent}`)).toEqual(['1:50', '2:50', '4:50', '3:100']);
    expect(filtreraFragor(m, { min: 90 }).map((x) => x.nr)).toEqual([3]);
    expect(filtreraFragor(m, { min: 101 })).toEqual([]);
  });
});

describe('Del 78: testnamn ur delkapitel', async () => {
  const { fragematris, testEtikett } = await import('../src/domain/delkapiteltrend.js');
  it('bygger namnet av delkapitelsiffrorna', () => {
    expect(testEtikett(['4.1'])).toBe('test41');
    expect(testEtikett(['4.1', '4.2'])).toBe('test412');
    expect(testEtikett(['4.1', '4.2', '4.3', '4.4'])).toBe('test41234');
    expect(testEtikett(['4.2'], 'Test')).toBe('Test42');
    expect(testEtikett([])).toBe('test?');
    expect(testEtikett(['4.1', '5.1'])).toBe('test4.1/5.1');
  });
  it('varje rad får testnamn efter vilka delkapitel provet innehåller', () => {
    const m = fragematris(bygg(), f);
    expect(m.rader.map((r) => r.test)).toEqual(['test41', 'test412', 'test4123']);
    expect(m.grupper.map((g) => g.etikett)).toEqual(['Test41', 'Test42', 'Test43']);
  });
});
