import { describe, expect, it } from 'vitest';
import {
  arRatt, aterkommandeFel, begreppsnyckel, enaFragorPaBegrepp, fragematris, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass,
  laggTillSkolar, laggTillTjanst, tolkaSocrativeRapport, tomStruktur, trendkoll, type FragaSvar, type Struktur,
} from '../src/index.js';

// Samma begrepp, omskriven beskrivning
const EKO_V1 = 'Vetenskapen om samspelet i naturen kallas?';
const EKO_V2 = 'Läran om hur levande varelser samspelar med varandra och sin miljö.';
const BIOTOP = 'En naturtyp med en viss sorts växter och djur.';
const POP = 'Alla individer av en art i ett område.';

type Rad = [fraga: string, svar: string, ratt: boolean | null, facit?: string];
const svar = (rader: Rad[]): FragaSvar[] => rader.map(([fraga, s, ratt, facit]) => ({ fraga, svar: s, ratt, ...(facit !== undefined ? { facit } : {}) }));

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  for (const [id, namn] of [['a', 'Anna Berg'], ['b', 'Omar Ali']] as const) s = laggTillElev(s, { id, klassId: 'k', namn, grupp: 'A' });
  return s;
}

function forhor(s: Struktur, prov: string, datum: string, rum: string, anna: Rad[], omar: Rad[]): Struktur {
  return importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov, datum, rum, rader: [
    { namn: 'Anna Berg', poang: anna.filter((r) => r[2] === true).length, maxPoang: anna.length, svar: svar(anna) },
    { namn: 'Omar Ali', poang: omar.filter((r) => r[2] === true).length, maxPoang: omar.length, svar: svar(omar) },
  ] }).s;
}

/** Biologi41 med första formuleringen, Biologi412 med omskriven ekologi-fråga + en ny fråga. */
function omskriven(): Struktur {
  let s = forhor(grund(), 'Bi 4.1', '2026-08-21', 'Biologi41',
    [[EKO_V1, 'A • ekologi', true, 'A • ekologi'], [BIOTOP, 'C • population', false, 'B • biotop']],
    [[EKO_V1, 'B • biotop', false, 'A • ekologi'], [BIOTOP, 'B • biotop', true, 'B • biotop']]);
  s = forhor(s, 'Bi 4.1-4.2', '2026-08-28', 'Biologi412',
    [[EKO_V2, 'D • biotop', false, 'C • Ekologi'], [BIOTOP, 'A • biotop', true, 'A • biotop'], [POP, 'B • population', true, 'B • population']],
    [[EKO_V2, 'C • Ekologi', true, 'C • Ekologi'], [BIOTOP, 'A • biotop', true, 'A • biotop'], [POP, 'D • art', false, 'B • population']]);
  return s;
}

describe('Del 238 · Frågans identitet är begreppet (det rätta svaret)', () => {
  it('begreppsnyckel: alternativbokstav och skiftläge spelar ingen roll; sant/falskt och tal är inga begrepp', () => {
    expect(begreppsnyckel('A • Ekologi')).toBe('ekologi');
    expect(begreppsnyckel('c) ekologi')).toBe('ekologi');
    expect(begreppsnyckel('B • Ekologi.')).toBe('ekologi'); // skiljetecken i svaret gör inget nytt begrepp
    for (const begrepp of ['pH', 'DNA', 'x-axeln', 'omättat kolväte']) expect(begreppsnyckel(begrepp)).not.toBeNull();
    for (const inget of ['True', 'Falskt', 'ja', '12', '-3', '0,4', 'x = 3', '', undefined]) expect(begreppsnyckel(inget)).toBeNull();
  });

  it('begreppsnyckel: uträkningar och svar som pekar på alternativen är inga begrepp', () => {
    for (const inget of ['x + 2', 'x − 2', 'a/b', 'x', 'A • Alla ovanstående', 'Inget av ovanstående', 'Båda', 'C • Alla alternativen']) expect(begreppsnyckel(inget)).toBeNull();
  });

  it('en omskriven fråga hamnar i samma kolumn som sin tidigare version', () => {
    const m = fragematris(omskriven(), { klassId: 'k', amneId: 'bi' });
    expect(m.fragor).toHaveLength(3); // inte 4: ekologi-frågan är EN fråga
    const eko = m.fragor.findIndex((f) => f.begrepp?.toLowerCase() === 'ekologi');
    expect(m.fragor[eko].fraga).toBe(EKO_V2); // senaste formuleringen visas
    expect(m.fragor[eko].kod).toBe('4.1'); // och den hör kvar till delkapitlet där den först ställdes
    expect(m.rader.map((r) => r.celler[eko]?.procent)).toEqual([50, 50]);
  });

  it('trendkollen jämför den omskrivna frågan: lärt och glömt räknas', () => {
    const tk = trendkoll(omskriven(), { klassId: 'k', amneId: 'bi' });
    expect(tk.par[0].gemensamma).toBe(2);
    const anna = tk.par[0].elever.find((e) => e.elev.id === 'a')!;
    expect(anna.glomt).toBe(1); // ekologi rätt → fel trots ny formulering
    expect(anna.lart).toBe(1); // biotop fel → rätt
  });

  it('återkommande fel följer begreppet över formuleringarna', () => {
    let s = omskriven();
    s = forhor(s, 'Bi 4.1-4.3', '2026-09-04', 'Biologi4123',
      [[EKO_V2, 'D • biotop', false, 'C • Ekologi']], [[EKO_V2, 'C • Ekologi', true, 'C • Ekologi']]);
    // Omar: fel (v1) · rätt (v2) · rätt (v2); Anna: rätt (v1) · fel (v2) · fel (v2)
    const fel = aterkommandeFel(s, 'a', { klassId: 'k', amneId: 'bi' });
    expect(fel.map((f) => f.fraga)).toEqual([EKO_V2]);
    expect(fel[0].historik.map((h) => h.ratt)).toEqual([true, false, false]);
  });

  it('utan sparat facit läses begreppet ur ett svar som rättats som rätt', () => {
    let s = forhor(grund(), 'Bi 4.1', '2026-08-21', 'Biologi41', [[EKO_V1, 'A • ekologi', true]], [[EKO_V1, 'B • biotop', false]]);
    s = forhor(s, 'Bi 4.1-4.2', '2026-08-28', 'Biologi412', [[EKO_V2, 'D • biotop', false]], [[EKO_V2, 'C • ekologi', true]]);
    expect(fragematris(s, { klassId: 'k', amneId: 'bi' }).fragor).toHaveLength(1);
  });

  it('två frågor med samma rätta svar i samma quiz slås inte ihop — då gäller frågetexten', () => {
    let s = forhor(grund(), 'Bi 4.1', '2026-08-21', 'Biologi41',
      [[EKO_V1, 'A • ekologi', true, 'A • ekologi'], [EKO_V2, 'A • ekologi', true, 'A • ekologi']],
      [[EKO_V1, 'A • ekologi', true, 'A • ekologi'], [EKO_V2, 'B • biotop', false, 'A • ekologi']]);
    s = forhor(s, 'Bi 4.1-4.2', '2026-08-28', 'Biologi412', [[EKO_V1, 'A • ekologi', true, 'A • ekologi']], [[EKO_V1, 'A • ekologi', true, 'A • ekologi']]);
    expect(fragematris(s, { klassId: 'k', amneId: 'bi' }).fragor).toHaveLength(2);
  });

  it('sant/falskt och tal som svar knyter aldrig ihop olika frågor', () => {
    let s = forhor(grund(), 'Bi 4.1', '2026-08-21', 'Biologi41', [['Växter gör fotosyntes.', 'True', true, 'True']], [['Växter gör fotosyntes.', 'False', false, 'True']]);
    s = forhor(s, 'Bi 4.1-4.2', '2026-08-28', 'Biologi412', [['Svampar är nedbrytare.', 'True', true, 'True']], [['Svampar är nedbrytare.', 'True', true, 'True']]);
    expect(fragematris(s, { klassId: 'k', amneId: 'bi' }).fragor).toHaveLength(2);
  });

  it('samma begrepp i ett annat kapitel är en annan fråga', () => {
    let s = forhor(grund(), 'Bi 4.1', '2026-08-21', 'Biologi41', [[EKO_V1, 'A • ekologi', true, 'A • ekologi']], [[EKO_V1, 'A • ekologi', true, 'A • ekologi']]);
    s = forhor(s, 'Bi 6.1', '2026-10-02', 'Biologi61', [[EKO_V2, 'A • ekologi', true, 'A • ekologi']], [[EKO_V2, 'A • ekologi', true, 'A • ekologi']]);
    expect(fragematris(s, { klassId: 'k', amneId: 'bi' }).fragor).toHaveLength(2);
  });

  it('hela vägen från Socrative-rapporten: omskriven fråga med omkastade alternativ blir en kolumn', () => {
    // Samma väg som filimporten: frågetext ur rubrikraden, facit härlett ur eleverna med full poäng
    const importera = (s: Struktur, datum: string, celler: Parameters<typeof tolkaSocrativeRapport>[0]): Struktur => {
      const rapport = tolkaSocrativeRapport(celler);
      return importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: rapport.quiz, datum, rum: rapport.rum,
        rader: rapport.rader.filter((r) => r.deltog).map((r) => ({ namn: r.namn, poang: r.poang, maxPoang: r.maxPoang,
          svar: rapport.fragor.map((fraga, j) => ({ fraga, svar: r.svar![j] ?? '', ratt: arRatt(r.svar![j] ?? '', rapport.nyckel[j]), ...(rapport.nyckel[j] !== null ? { facit: rapport.nyckel[j]! } : {}) })) })) }).s;
    };
    const rubrik = (...fragor: string[]) => ['Presence', 'Student Name', 'Student ID', 'Score (%)', 'Score (#)', ...fragor];
    let s = importera(grund(), '2026-08-21', [
      ['Biologi 4.1 Begrepp'], [], ['BIOLOGI41'], rubrik(EKO_V1, BIOTOP), [null, null, null, null, 2, '1 point', '1 point'],
      ['Yes', 'Anna Berg', 'ANNA', '100', 2, 'A. • ekologi', 'B. • biotop'],
      ['Yes', 'Omar Ali', 'OMAR', '50', 1, 'C. • population', 'B. • biotop'],
    ]);
    s = importera(s, '2026-08-28', [
      ['Biologi 4.1-4.2 Begrepp'], [], ['BIOLOGI412'], rubrik(BIOTOP, EKO_V2, POP), [null, null, null, null, 3, '1 point', '1 point', '1 point'],
      ['Yes', 'Anna Berg', 'ANNA', '67', 2, 'D. • biotop', 'A. • population', 'B. • population'],
      ['Yes', 'Omar Ali', 'OMAR', '100', 3, 'D. • biotop', 'C. • Ekologi', 'B. • population'],
    ]);
    const m = fragematris(s, { klassId: 'k', amneId: 'bi' });
    expect(m.fragor.map((f) => f.begrepp?.toLowerCase())).toEqual(['ekologi', 'biotop', 'population']);
    expect(m.fragor[0].fraga).toBe(EKO_V2);
    expect(m.rader.map((r) => r.celler[0]?.procent)).toEqual([50, 50]); // Anna rätt → fel, Omar fel → rätt
    expect(m.rader[0].celler[2]).toBeNull(); // population fanns inte i första förhöret
  });

  it('exit ticket och läxförhör: frågans nummer är detsamma före och efter att frågan uppdaterats', () => {
    const prov = (st: Struktur, kalla: 'socrative-exit' | 'socrative-laxforhor', namn: string, datum: string, rum: string, rader: Rad[]): Struktur =>
      importeraResultat(st, { klassId: 'k', amneId: 'bi', kalla, prov: namn, datum, rum, rader: [
        { namn: 'Anna Berg', poang: rader.length, maxPoang: rader.length, svar: svar(rader) },
      ] }).s;
    // Exit ticket på 4.1 (rum Biologi41) och läxförhöret nästa lektion — samma formuleringar
    let s = prov(grund(), 'socrative-exit', 'Exit 4.1', '2026-08-21', 'Biologi41',
      [[BIOTOP, 'B • biotop', true, 'B • biotop'], [EKO_V1, 'A • ekologi', true, 'A • ekologi']]);
    s = prov(s, 'socrative-laxforhor', 'Bi 4.1', '2026-08-24', 'Biologi41',
      [[BIOTOP, 'A • biotop', true, 'A • biotop'], [EKO_V1, 'C • ekologi', true, 'C • ekologi']]);
    const nummer = (st: Struktur) => Object.fromEntries(fragematris(st, { klassId: 'k', amneId: 'bi' }).fragor.map((f) => [f.begrepp!.toLowerCase(), f.nr]));
    const fore = nummer(s);
    expect(fore).toEqual({ biotop: 1, ekologi: 2 });

    // Läraren skriver om ekologi-frågan; nästa läxförhör (4.1–4.2) har den nya texten och en ny fråga
    s = prov(s, 'socrative-laxforhor', 'Bi 4.1-4.2', '2026-08-28', 'Biologi412',
      [[EKO_V2, 'D • ekologi', true, 'D • ekologi'], [BIOTOP, 'A • biotop', true, 'A • biotop'], [POP, 'B • population', true, 'B • population']]);
    const m = fragematris(s, { klassId: 'k', amneId: 'bi' });
    expect(nummer(s)).toEqual({ ...fore, population: 3 });   // samma nummer som förut; bara den nya frågan tillkommer
    expect(m.fragor[1].fraga).toBe(EKO_V2);
    // Fråga 2 har svar i alla tre proven — exit ticketen, läxförhöret och det nya läxförhöret
    expect(m.rader.map((r) => [r.kalla, r.celler[1]?.procent])).toEqual([['socrative-exit', 100], ['socrative-laxforhor', 100], ['socrative-laxforhor', 100]]);
    // Samma sak när bara läxförhören visas
    const lax = fragematris(s, { klassId: 'k', amneId: 'bi', kallor: ['socrative-laxforhor'] });
    expect(lax.fragor.map((f) => f.begrepp!.toLowerCase())).toEqual(['biotop', 'ekologi', 'population']);
  });

  it('muterar inte indata och lämnar oförändrade resultat som samma objekt', () => {
    const s = omskriven();
    const fore = JSON.stringify(s.resultat);
    const ut = enaFragorPaBegrepp(s.resultat ?? []);
    expect(JSON.stringify(s.resultat)).toBe(fore);
    const sena = (s.resultat ?? []).filter((r) => r.datum === '2026-08-28');
    for (const r of sena) expect(ut).toContain(r); // senaste formuleringen: inget att skriva om
    expect(ut.filter((r) => r.datum === '2026-08-21').every((r) => r.svar?.[0].fraga === EKO_V2)).toBe(true);
  });
});
