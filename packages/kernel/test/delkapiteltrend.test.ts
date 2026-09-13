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

describe('Del 80: delkapitel ur quiznamnet när rummet är klassrummet', async () => {
  const { koderForTillfalle, fragematris } = await import('../src/domain/delkapiteltrend.js');
  it('läser koder ur provnamnet när rummet saknar siffror', () => {
    expect(koderForTillfalle({ prov: 'x', rum: 'Biologi412' })).toEqual(['4.1', '4.2']);
    expect(koderForTillfalle({ prov: 'Biologi 4.1 Begrepp', rum: 'BIOLOGI8BB' })).toEqual(['4.1']);
    expect(koderForTillfalle({ prov: '4.1-4.3 Begrepp', rum: 'BIOLOGI8BB' })).toEqual(['4.1', '4.2', '4.3']);
    expect(koderForTillfalle({ prov: '4.1–4.2 Begrepp' })).toEqual(['4.1', '4.2']);
    expect(koderForTillfalle({ prov: 'Fotosyntes' })).toEqual([]);
  });

  it('matrisen får rätt delkapitel även med klassrum', () => {
    let s = bygg();
    s = { ...s, resultat: (s.resultat ?? []).map((r) => ({ ...r, rum: 'BIOLOGI8BB' })) };
    const m = fragematris(s, f);
    expect(m.fragor.map((x) => x.kod)).toEqual(['4.1', '4.1', '4.2', '4.3']);
    expect(m.rader.map((r) => r.test)).toEqual(['test41', 'test412', 'test4123']);
  });
});

describe('Del 86: klockslag och ordning inom en dag', async () => {
  const { fragematris, jamforTillfalle } = await import('../src/domain/delkapiteltrend.js');
  it('läxförhör före exit ticket när klockslag saknas', () => {
    const rad = (kalla: 'socrative-laxforhor' | 'socrative-exit' | 'socrative-ovning', tid?: string) =>
      ({ nyckel: 'x', prov: 'p', datum: '2026-09-02', kalla, ...(tid !== undefined ? { tid } : {}), resultat: [] });
    expect(jamforTillfalle(rad('socrative-exit'), rad('socrative-laxforhor'))).toBeGreaterThan(0);
    expect(jamforTillfalle(rad('socrative-ovning'), rad('socrative-exit'))).toBeGreaterThan(0);
    // Klockslag vinner över typordningen
    expect(jamforTillfalle(rad('socrative-exit', '08:15'), rad('socrative-laxforhor', '09:50'))).toBeLessThan(0);
    expect(jamforTillfalle({ ...rad('socrative-exit'), datum: '2026-09-01' }, rad('socrative-laxforhor'))).toBeLessThan(0);
  });

  it('matrisen sorterar läxförhöret först och tar med klockslaget', () => {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Exit 4.1', datum: '2026-08-21', tid: '09:50',
      rader: [{ namn: 'Anna Berg', poang: 1, maxPoang: 1, svar: [{ fraga: A, svar: 'r', ratt: true }] }] }).s;
    const m = fragematris(s, f);
    const dagen = m.rader.filter((r) => r.datum === '2026-08-21');
    expect(dagen.map((r) => r.kalla)).toEqual(['socrative-laxforhor', 'socrative-exit']);
    expect(dagen[1].tid).toBe('09:50');
  });
});

describe('Del 87: klockslag styr ordningen inom dagen', async () => {
  const { jamforTillfalle } = await import('../src/domain/delkapiteltrend.js');
  const t = (tid: string, kalla: 'socrative-laxforhor' | 'socrative-exit', prov = 'p') =>
    ({ datum: '2026-08-21', tid, kalla, prov });
  it('tidigt före sent, oavsett typ', () => {
    expect(jamforTillfalle(t('08:22', 'socrative-laxforhor'), t('09:27', 'socrative-exit'))).toBeLessThan(0);
    expect(jamforTillfalle(t('09:27', 'socrative-exit'), t('08:22', 'socrative-laxforhor'))).toBeGreaterThan(0);
    // Omvänd ordning = negerad jämförelse
    const rader = [t('10:18', 'socrative-exit'), t('09:17', 'socrative-laxforhor'), t('08:31', 'socrative-exit')];
    expect([...rader].sort(jamforTillfalle).map((x) => x.tid)).toEqual(['08:31', '09:17', '10:18']);
    expect([...rader].sort((a, b) => -jamforTillfalle(a, b)).map((x) => x.tid)).toEqual(['10:18', '09:17', '08:31']);
  });
});

describe('Del 90: nuläget — senaste svaret räknas', async () => {
  const { nulage } = await import('../src/domain/delkapiteltrend.js');
  it('Anna: A gick fel sist, B rätt efter tidigare fel', () => {
    const n = nulage(bygg(), 'a', f);
    expect(n.fragor.map((x) => `${x.nr}:${x.ratt}`)).toEqual(['1:false', '2:false', '3:true', '4:true']);
    expect(n.kvar.map((x) => x.nr)).toEqual([1, 2]);
    expect(n.kan.map((x) => x.nr)).toEqual([3, 4]);
    expect(n.procent).toBe(50);
    expect(n.senastProv).toBe('4.1-4.3 Begrepp');
    expect(n.delkapitel.map((d) => `${d.kod}:${d.procent}`)).toEqual(['4.1:0', '4.2:100', '4.3:100']);
    expect(n.fragor[0]).toMatchObject({ tidigareFel: 0, antalGanger: 3 }); // rätt, rätt, fel
  });

  it('Omar: fråga 1 var fel två gånger men är rätt nu — räknas som kan, och som fixat', () => {
    const n = nulage(bygg(), 'b', f);
    expect(n.kan.map((x) => x.nr)).toEqual([1, 2, 3]);
    expect(n.kvar.map((x) => x.nr)).toEqual([4]);
    expect(n.fixat.map((x) => `${x.nr}:${x.tidigareFel}`)).toEqual(['1:1', '2:2']);
    expect(n.procent).toBe(75);
  });

  it('elev utan svar ger tomt nuläge', () => {
    let s = bygg();
    s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
    expect(nulage(s, 'c', f)).toMatchObject({ fragor: [], procent: null, senastProv: null });
  });
});

describe('Del 92: övningar som liknar läxförhör eller exit', async () => {
  const { ovningsDubbletter } = await import('../src/domain/delkapiteltrend.js');
  function medOvning(kalla: 'socrative-ovning' | 'socrative-exit', fragor: string[]) {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov: 'Extrapass', datum: '2026-09-10', rum: 'BIOLOGI8BB',
      rader: [{ namn: 'Anna Berg', poang: fragor.length, maxPoang: fragor.length, svar: sv(fragor.map((q) => [q, true])) }] }).s;
    return s;
  }

  it('identiska frågor flaggas med 100 % överlapp mot rätt tillfälle', () => {
    const d = ovningsDubbletter(medOvning('socrative-ovning', [A, B]), f);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ overlapp: 100, gemensamma: 2, identiska: true });
    expect(d[0].liknar).toMatchObject({ prov: 'Biologi 4.1 Begrepp', kalla: 'socrative-laxforhor' });
    expect(d[0].ovning).toMatchObject({ prov: 'Extrapass', antalFragor: 2 });
  });

  it('delvis överlapp under gränsen ger ingen träff, och bara övningar granskas', () => {
    // A finns i förhören, 'Ny fråga' gör det inte → 50 % överlapp
    const s = medOvning('socrative-ovning', [A, 'En helt ny fråga om resiliens']);
    expect(ovningsDubbletter(s, f)).toEqual([]);
    expect(ovningsDubbletter(s, f, 40)[0]).toMatchObject({ overlapp: 50, identiska: false });
    // Samma quiz men märkt som exit ticket granskas inte
    expect(ovningsDubbletter(medOvning('socrative-exit', [A, B]), f)).toEqual([]);
  });
});

describe('Del 99: övningar med samma quiz räknas in i huvudsviten', async () => {
  const { harmoniseraOvningar, nulage } = await import('../src/domain/delkapiteltrend.js');
  const { trendkoll } = await import('../src/domain/trendkoll.js');

  it('övning med samma frågor som läxförhöret räknas som läxförhör; övning med egna frågor lämnas', () => {
    let s = bygg();
    // Samma quiz som 4.1-4.2 (A, B, C) kört som övning en vecka senare — Anna vänder B
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-ovning', prov: 'Extra 4.1-4.2', datum: '2026-09-11', rum: 'BIOLOGI8BB',
      rader: [{ namn: 'Anna Berg', poang: 3, maxPoang: 3, svar: sv([[A, true], [B, true], [C, true]]) }] }).s;
    // Övning med helt egna frågor
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-ovning', prov: 'Kahoot-lek', datum: '2026-09-12', rum: 'BIOLOGI8BB',
      rader: [{ namn: 'Anna Berg', poang: 1, maxPoang: 2, svar: sv([['Vad heter Sveriges landskapsdjur?', true], ['Hur många ben har en spindel?', false]]) }] }).s;
    const h = harmoniseraOvningar(s, f);
    expect(h.inkluderade).toHaveLength(1);
    expect(h.inkluderade[0]).toMatchObject({ prov: 'Extra 4.1-4.2', som: 'socrative-laxforhor', liknar: '4.1-4.2 Begrepp', overlapp: 100 });
    const extra = h.s.resultat!.find((r) => r.prov === 'Extra 4.1-4.2')!;
    expect(extra.kalla).toBe('socrative-laxforhor');
    expect(extra.inkluderadSom).toBe('socrative-laxforhor');
    expect(h.s.resultat!.find((r) => r.prov === 'Kahoot-lek')!.kalla).toBe('socrative-ovning');
    // Originalet orört
    expect(s.resultat!.find((r) => r.prov === 'Extra 4.1-4.2')!.kalla).toBe('socrative-ovning');
    // Samma struktur + filter ger samma svar (cache)
    expect(harmoniseraOvningar(s, f)).toBe(h);
  });

  it('efter harmonisering syns övningen i nuläget och trendkollen', () => {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-ovning', prov: 'Extra 4.1-4.2', datum: '2026-09-11', rum: 'BIOLOGI8BB',
      rader: [{ namn: 'Anna Berg', poang: 3, maxPoang: 3, svar: sv([[A, true], [B, true], [C, true]]) }] }).s;
    // Utan harmonisering: filtret på läxförhör ser inte övningen → B är fortfarande fel för Anna
    const fLax = { ...f, kallor: ['socrative-laxforhor'] as ('socrative-laxforhor')[] };
    expect(nulage(s, 'a', fLax).kvar.map((x) => x.nr)).toEqual([1, 2]);
    const h = harmoniseraOvningar(s, f).s;
    expect(nulage(h, 'a', fLax).kvar.map((x) => x.nr)).toEqual([]); // A och B rätt i övningen
    const tk = trendkoll(h, { klassId: 'k', amneId: 'bi' });
    expect(tk.elever.find((e) => e.elev.id === 'a')!.steg.map((x) => x.prov)).toContain('Extra 4.1-4.2');
  });
});

describe('Del 109: begreppet ur elevernas rätta svar', async () => {
  const { begreppUrSvar, nulage } = await import('../src/domain/delkapiteltrend.js');
  const { svarText } = await import('../src/domain/trendkoll.js');
  it('svarText tar bort alternativbokstav och punkt', () => {
    expect(svarText('B • biotop')).toBe('biotop');
    expect(svarText('c) nisch')).toBe('nisch');
    expect(svarText('ekologi')).toBe('ekologi');
  });
  it('rätta svaret ger begreppet, även när boken saknar förklaringen', () => {
    let s = bygg();
    // Byt ut svarstexterna till Socrative-form: bara den som svarat rätt avslöjar begreppet
    s = { ...s, resultat: (s.resultat ?? []).map((r) => ({ ...r, svar: (r.svar ?? []).map((sv) => ({
      ...sv, svar: sv.fraga === A ? (sv.ratt ? 'A • ekologi' : 'C • biotop') : sv.fraga === B ? (sv.ratt ? 'E • population' : 'A • ekologi') : sv.svar })) })) };
    const karta = begreppUrSvar(s, f);
    expect(karta.get(A.toLowerCase().replace(/[.,;:!?"'()[\]{}…]/g, ' ').replace(/\s+/g, ' ').trim())).toBe('ekologi');
    const nu = nulage(s, 'a', f);
    expect(nu.fragor.find((x) => x.fraga === A)?.begrepp).toBe('ekologi');
    expect(nu.fragor.find((x) => x.fraga === B)?.begrepp).toBe('population');
  });
});

describe('Del 109: begreppet ur facit (rapportens nyckel) går före rätta svar och bok', async () => {
  const { begreppUrFacit } = await import('../src/domain/resultat.js');
  const { fragematris, nulage } = await import('../src/domain/delkapiteltrend.js');
  it('facit rensas från alternativbokstav och bullet', () => {
    expect(begreppUrFacit('A • ekologi')).toBe('ekologi');
    expect(begreppUrFacit('b) biotop')).toBe('biotop');
    expect(begreppUrFacit('  negativ återkoppling ')).toBe('negativ återkoppling');
    expect(begreppUrFacit('')).toBeNull();
    expect(begreppUrFacit(undefined)).toBeNull();
  });
  it('en fråga importerad med facit får begreppet oavsett vad eleverna svarade', () => {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Med facit', datum: '2026-09-10', rum: 'Biologi41',
      rader: [{ namn: 'Anna Berg', poang: 0, maxPoang: 1, svar: [{ fraga: A, svar: 'C • biologi', ratt: false, facit: 'A • ekologi' }] }] }).s;
    expect(fragematris(s, f).fragor.find((x) => x.fraga === A)!.begrepp).toBe('ekologi');
    const nu = nulage(s, 'a', f);
    expect(nu.fragor.find((x) => x.fraga === A)!.begrepp).toBe('ekologi');
    // En ensam bokstav i svaret räknas aldrig som begrepp
    expect(nulage(bygg(), 'a', f).fragor.every((x) => x.begrepp === undefined || x.begrepp.length > 2)).toBe(true);
  });
});

describe('Del 111: en manuellt satt typ räknas inte om av harmoniseringen', async () => {
  const { harmoniseraOvningar } = await import('../src/domain/delkapiteltrend.js');
  const { andraKalla } = await import('../src/domain/resultat.js');
  it('läraren märker ett läxförhör som övning → det förblir övning i analysen', () => {
    let s = bygg();
    // 4.1-4.2 Begrepp delar alla frågor med de andra förhören → skulle annars räknas in igen
    s = andraKalla(s, { amneId: 'bi', prov: '4.1-4.2 Begrepp', datum: '2026-08-28', franKalla: 'socrative-laxforhor', tillKalla: 'socrative-ovning' });
    const r = s.resultat!.find((x) => x.prov === '4.1-4.2 Begrepp')!;
    expect(r).toMatchObject({ kalla: 'socrative-ovning', manuellTyp: true });
    const h = harmoniseraOvningar(s, f);
    expect(h.inkluderade).toEqual([]);
    expect(h.s.resultat!.find((x) => x.prov === '4.1-4.2 Begrepp')!.kalla).toBe('socrative-ovning');
  });
});
