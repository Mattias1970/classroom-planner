import { describe, expect, it } from 'vitest';
import {
  arBildfraga, arRatt, aterkommandeFel, begreppsnyckel, delkapitelSegment, enaFragor, enaFragorPaBegrepp, fragematris, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass,
  laggTillSkolar, laggTillTjanst, tolkaSocrativeRapport, tomStruktur, trendkoll, utanKapitelmarke, type FragaSvar, type Struktur,
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

  it('Del 242/249: det kumulativa förhöret över kapitel 6–7 lägger den omskrivna frågan i kapitel 7, där den redan finns', () => {
    // Som i de riktiga quizen: 'Nervsystemet 7.4' (exit) och sedan '6.1 - 6.5, 7.1 - 7.4' (läxförhör) med omskriven fråga
    let s = forhor(grund(), 'Nervsystemet 7.4', '2026-10-19', 'BIOLOGI8BB',
      [['Synnerven leder nervimpulserna från synsinnescellerna till syncentrum.', 'B. Synnerv', true, 'B. Synnerv']],
      [['Synnerven leder nervimpulserna från synsinnescellerna till syncentrum.', 'A. Näthinna', false, 'B. Synnerv']]);
    s = forhor(s, '6.1 - 6.5, 7.1 - 7.4', '2026-10-23', 'BIOLOGI8BB',
      [['Leder nervimpulserna från synsinnescellerna till syncentrum.', 'F. Synnerv', true, 'F. Synnerv'], [EKO_V1, 'A. Ekologi', true, 'A. Ekologi']],
      [['Leder nervimpulserna från synsinnescellerna till syncentrum.', 'F. Synnerv', true, 'F. Synnerv'], [EKO_V1, 'A. Ekologi', true, 'A. Ekologi']]);
    const m = fragematris(s, { klassId: 'k', amneId: 'bi' });
    expect(m.fragor.map((f) => f.begrepp).sort()).toEqual(['Ekologi', 'Synnerv']);   // två kolumner; alternativbokstaven F är borta ur begreppet
    const syn = m.fragor.findIndex((f) => f.begrepp === 'Synnerv');
    expect(m.fragor[syn].fraga).toBe('Leder nervimpulserna från synsinnescellerna till syncentrum.');
    expect(m.rader.map((r) => r.celler[syn]?.procent)).toEqual([50, 100]);
  });

  it('Del 242: ett begrepp som är rätt svar på två frågor i ETT quiz hindrar inte sammanslagningen i de andra', () => {
    // Quiz 1 och 3 har en fråga med svaret ekologi (omskriven emellan); quiz 2 har två frågor med det svaret
    let s = forhor(grund(), 'Bi 4.1', '2026-08-21', 'Biologi41', [[EKO_V1, 'A. ekologi', true, 'A. ekologi']], [[EKO_V1, 'A. ekologi', true, 'A. ekologi']]);
    s = forhor(s, 'Bi 4.1b', '2026-08-24', 'Biologi41',
      [[EKO_V1, 'A. ekologi', true, 'A. ekologi'], [BIOTOP, 'A. ekologi', true, 'A. ekologi']],
      [[EKO_V1, 'A. ekologi', true, 'A. ekologi'], [BIOTOP, 'A. ekologi', true, 'A. ekologi']]);
    s = forhor(s, 'Bi 4.1-4.2', '2026-08-28', 'Biologi412', [[EKO_V2, 'C. ekologi', true, 'C. ekologi']], [[EKO_V2, 'C. ekologi', true, 'C. ekologi']]);
    const m = fragematris(s, { klassId: 'k', amneId: 'bi' });
    expect(m.fragor.map((f) => f.fraga)).toEqual([EKO_V2, BIOTOP]);   // ekologi-frågan är EN kolumn över alla tre quiz
    expect(m.rader.map((r) => r.celler[0] !== null)).toEqual([true, true, true]);
    expect(m.rader.map((r) => r.celler[1] !== null)).toEqual([false, true, false]);
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

describe('Del 243 · Bildfrågor är egna frågor', () => {
  const BILD6 = 'Vad pekar nummer 6 på?';
  const CHEF = 'Cellens ”chef” och styr det mesta som händer i cellen.';
  const kolumner = (s: Struktur) => [...new Set(enaFragorPaBegrepp(s.resultat ?? []).flatMap((r) => (r.svar ?? []).map((sv) => sv.fraga)))].sort();

  it('arBildfraga: frågor som pekar i en bild — inte ord som bildas eller telefonnummer', () => {
    for (const f of ['Vad pekar nummer 1 på?', 'Vad visar bilden?', 'Vilken del är markerad med B?', 'Vad heter delen vid pilen?', 'Vad är nr 3 i figuren?', 'Vad är siffran 4?']) expect(arBildfraga(f), f).toBe(true);
    for (const f of [CHEF, 'När en cell delar sig och bildar två exakt likadana celler.', 'Bildas av bukspottkörteln och töms till tunntarmen.',
      'Kallas arbetsminne, är det minne där vi till exempel lägger ett telefonnummer på minnet i några sekunder.', 'De smaker som våra smaksinnesceller kan uppfatta.']) expect(arBildfraga(f), f).toBe(false);
  });

  it('en bildfråga och en textfråga med samma svar i olika quiz slås inte ihop', () => {
    let s = forhor(grund(), 'Exit 6.1', '2026-09-01', 'Biologi61',
      [[CHEF, 'A. Cellkärna', true, 'A. Cellkärna']], [[CHEF, 'B. Ribosom', false, 'A. Cellkärna']]);
    s = forhor(s, 'Cellens delar', '2026-09-08', 'BIOLOGI8BB',
      [[BILD6, 'C. Cellkärna', true, 'C. Cellkärna']], [[BILD6, 'C. Cellkärna', true, 'C. Cellkärna']]);
    expect(kolumner(s)).toEqual([CHEF, BILD6].sort());
  });

  it('bildfrågan med samma svar i samma quiz hindrar inte att textfrågan följer sin omskrivna version', () => {
    const CHEF2 = 'Styr det mesta som händer i cellen och innehåller arvsmassan.';
    let s = forhor(grund(), 'Förhör 1', '2026-09-01', 'BIOLOGI8BB',
      [[CHEF, 'A. Cellkärna', true, 'A. Cellkärna'], [BILD6, 'C. Cellkärna', true, 'C. Cellkärna']],
      [[CHEF, 'B. Ribosom', false, 'A. Cellkärna'], [BILD6, 'C. Cellkärna', true, 'C. Cellkärna']]);
    s = forhor(s, 'Förhör 2', '2026-09-08', 'BIOLOGI8BB',
      [[CHEF2, 'D. Cellkärna', true, 'D. Cellkärna'], [BILD6, 'C. Cellkärna', true, 'C. Cellkärna']],
      [[CHEF2, 'D. Cellkärna', true, 'D. Cellkärna'], [BILD6, 'A. Lysosom', false, 'C. Cellkärna']]);
    expect(kolumner(s)).toEqual([CHEF2, BILD6].sort());
  });

  it('samma bildtext med ett annat rätt svar (ny bild) är en ny fråga — begreppet skrivs ut efter texten', () => {
    const B1 = 'Vad pekar nummer 1 på?';
    let s = forhor(grund(), 'Cellen', '2026-09-01', 'BIOLOGI8BB', [[B1, 'A. Cellmenbran', true, 'A. Cellmenbran']], [[B1, 'B. Lysosom', false, 'A. Cellmenbran']]);
    // stavfelet rättat i nästa version: fortfarande samma fråga
    s = forhor(s, 'Cellen igen', '2026-09-08', 'BIOLOGI8BB', [[B1, 'A. Cellmembran', true, 'A. Cellmembran']], [[B1, 'A. Cellmembran', true, 'A. Cellmembran']]);
    expect(kolumner(s)).toEqual([B1]);
    // ny bild (ögat) med samma frågetext: en ny fråga
    s = forhor(s, 'Ögat', '2026-10-20', 'BIOLOGI8BB', [[B1, 'C. Hornhinna', true, 'C. Hornhinna']], [[B1, 'D. Lins', false, 'C. Hornhinna']]);
    expect(kolumner(s)).toEqual(['Vad pekar nummer 1 på? (Cellmembran)', 'Vad pekar nummer 1 på? (Hornhinna)']);
    const m = fragematris(s, { klassId: 'k', amneId: 'bi' });
    expect(m.fragor.map((f) => f.fraga).sort()).toEqual(['Vad pekar nummer 1 på? (Cellmembran)', 'Vad pekar nummer 1 på? (Hornhinna)']);
  });
});

describe('Del 249 · Frågor ur olika kapitel blandas inte ihop', () => {
  const f = { klassId: 'k', amneId: 'bi' };
  const CELL_V1 = 'Nedbrytningen av sockermolekyler (och andra ämnen) för att frigöra energi.';
  const CELL_V2 = 'Den kemiska reaktion i cellen som omvandlar glukos och syre till koldioxid och vatten.';
  const FOTO = 'Växternas sätt att bilda socker med hjälp av solljus.';
  const KARNA = 'Cellens ”chef” som styr det mesta som händer i cellen.';

  /** Kapitel 4 (4.2) frågar om cellandning; kapitel 6 (6.1) frågar samma sak med ny formulering. */
  function tvaKapitel(text61 = CELL_V2): Struktur {
    let s = forhor(grund(), 'Biologi 4.2 Begrepp', '2026-08-24', 'BIOLOGI8BB',
      [[CELL_V1, 'A. Cellandning', true, 'A. Cellandning'], [FOTO, 'B. Fotosyntes', true, 'B. Fotosyntes']],
      [[CELL_V1, 'B. Fotosyntes', false, 'A. Cellandning'], [FOTO, 'B. Fotosyntes', true, 'B. Fotosyntes']]);
    s = forhor(s, '6.1 Begrepp + cellens delar', '2026-09-17', 'BIOLOGI8BB',
      [[text61, 'C. Cellandning', true, 'C. Cellandning'], [KARNA, 'D. Cellkärna', true, 'D. Cellkärna']],
      [[text61, 'C. Cellandning', true, 'C. Cellandning'], [KARNA, 'A. Ribosom', false, 'D. Cellkärna']]);
    return s;
  }

  it('samma begrepp i kapitel 4 och kapitel 6 är två frågor — var och en i sitt kapitels kolumner', () => {
    const m = fragematris(tvaKapitel(), f);
    expect(m.fragor.map((x) => [x.nr, x.kod, x.fraga])).toEqual([[1, '4.2', CELL_V1], [2, '4.2', FOTO], [3, '6.1', CELL_V2], [4, '6.1', KARNA]]);
    expect(m.grupper.map((g) => [g.kod, g.till - g.fran + 1])).toEqual([['4.2', 2], ['6.1', 2]]);
    // kapitel 4-förhöret har bara sina frågor, kapitel 6-förhöret bara sina — inget räknas in i det andra kapitlet
    expect(m.rader.map((r) => [r.prov, r.celler.map((c) => c?.procent ?? null)])).toEqual([
      ['Biologi 4.2 Begrepp', [50, 100, null, null]],
      ['6.1 Begrepp + cellens delar', [null, null, 100, 50]],
    ]);
    expect(delkapitelSegment(tvaKapitel(), f).map((t) => t.segment.map((x) => [x.kod, x.antalFragor]))).toEqual([[['4.2', 2]], [['6.1', 2]]]);
  });

  it('kapitel 6-frågan länkas bakåt: samma kunskap som fråga 1 i kapitel 4 — så att man ser hur många som minns', () => {
    const m = fragematris(tvaKapitel(), f);
    expect(m.fragor.map((x) => x.tidigare)).toEqual([undefined, undefined, { kapitel: '4', fraga: CELL_V1, nr: 1, kod: '4.2' }, undefined]);
  });

  it('identisk frågetext i två kapitel är också två frågor, med samma text i båda kolumnerna', () => {
    const s = tvaKapitel(CELL_V1);
    const m = fragematris(s, f);
    expect(m.fragor.map((x) => [x.kod, x.fraga])).toEqual([['4.2', CELL_V1], ['4.2', FOTO], ['6.1', CELL_V1], ['6.1', KARNA]]);
    expect(m.fragor[2].tidigare).toEqual({ kapitel: '4', fraga: CELL_V1, nr: 1, kod: '4.2' });
    expect(m.rader[1].celler.map((c) => c?.procent ?? null)).toEqual([null, null, 100, 50]);
    // utåt skiljs de åt av ett dolt kapitelmärke, som aldrig visas
    const texter = [...new Set(enaFragorPaBegrepp(s.resultat ?? []).flatMap((r) => (r.svar ?? []).map((sv) => sv.fraga)))];
    expect(texter).toHaveLength(4);
    expect(texter.map(utanKapitelmarke).filter((x) => x === CELL_V1)).toHaveLength(2);
    expect(texter.filter((x) => /\[[0-9a-f]{8}\]$/.test(x))).toHaveLength(1);
  });

  it('inom kapitlet gäller begreppet som förut: nästa kapitel 6-förhör med omskriven fråga hamnar i kapitel 6-kolumnen', () => {
    const CELL_V3 = 'Reaktionen där cellen frigör energi ur glukos med hjälp av syre.';
    const s = forhor(tvaKapitel(), '6.1-6.2 Begrepp och Cellens delar', '2026-09-25', 'BIOLOGI8BB',
      [[CELL_V3, 'B. Cellandning', true, 'B. Cellandning'], [KARNA, 'D. Cellkärna', true, 'D. Cellkärna']],
      [[CELL_V3, 'A. Fotosyntes', false, 'B. Cellandning'], [KARNA, 'D. Cellkärna', true, 'D. Cellkärna']]);
    const m = fragematris(s, f);
    expect(m.fragor.map((x) => [x.kod, x.fraga])).toEqual([['4.2', CELL_V1], ['4.2', FOTO], ['6.1', CELL_V3], ['6.1', KARNA]]);
    expect(m.rader.map((r) => r.celler.map((c) => c?.procent ?? null))).toEqual([[50, 100, null, null], [null, null, 100, 50], [null, null, 50, 100]]);
    expect(m.fragor[2].tidigare?.nr).toBe(1);
  });

  it('ett kumulativt förhör över kapitel 6–7 med en gammal kapitel 4-fråga: frågan står i förhörets kapitel, länkad bakåt', () => {
    let s = tvaKapitel();
    s = forhor(s, 'Nervsystemet 7.1', '2026-10-09', 'BIOLOGI8BB',
      [['Nervcellens långa utskott.', 'A. Axon', true, 'A. Axon']], [['Nervcellens långa utskott.', 'A. Axon', true, 'A. Axon']]);
    s = forhor(s, 'Kap 6.1-6.5, 7.1', '2026-10-12', 'BIOLOGI8BB',
      [[CELL_V2, 'A. Cellandning', true, 'A. Cellandning'], [FOTO, 'B. Fotosyntes', false, 'B. Fotosyntes'], ['Nervcellens långa utskott.', 'C. Axon', true, 'C. Axon']],
      [[CELL_V2, 'A. Cellandning', true, 'A. Cellandning'], [FOTO, 'B. Fotosyntes', true, 'B. Fotosyntes'], ['Nervcellens långa utskott.', 'C. Axon', true, 'C. Axon']]);
    const m = fragematris(s, f);
    // cellandning finns redan i kapitel 6 → samma kolumn; fotosyntes finns bara i kapitel 4 → egen fråga i förhörets
    // nyaste delkapitel (6.5 är nytt här), länkad till kapitel 4
    const foto = m.fragor.filter((x) => x.fraga === FOTO);
    expect(foto.map((x) => x.kod)).toEqual(['4.2', '6.5']);
    expect(foto[1].tidigare).toMatchObject({ kapitel: '4', nr: foto[0].nr });
    expect(m.fragor.filter((x) => x.begrepp === 'Cellandning').map((x) => x.kod)).toEqual(['4.2', '6.1']);
    const kumulativt = m.rader.at(-1)!;
    expect(kumulativt.celler[foto[0].nr - 1]).toBeNull();           // räknas inte i kapitel 4
    expect(kumulativt.celler[foto[1].nr - 1]?.procent).toBe(50);
  });

  it('bildfrågor: samma text i två kapitel länkas bara när svaret är detsamma', () => {
    const BILD = 'Vad pekar nummer 1 på?';
    const bygg = (svar7: string) => {
      let s = forhor(grund(), 'Biologi 6.1 Cellen', '2026-09-17', 'BIOLOGI8BB', [[BILD, 'A. Cellmembran', true, 'A. Cellmembran']], [[BILD, 'A. Cellmembran', true, 'A. Cellmembran']]);
      s = forhor(s, 'Nervsystemet 7.3', '2026-10-16', 'BIOLOGI8BB', [[BILD, svar7, true, svar7]], [[BILD, svar7, true, svar7]]);
      return fragematris(s, f);
    };
    const nyBild = bygg('C. Hornhinna');
    expect(nyBild.fragor.map((x) => [x.kod, x.fraga, x.tidigare])).toEqual([['6.1', BILD, undefined], ['7.3', BILD, undefined]]);
    const sammaBild = bygg('B. Cellmembran');
    expect(sammaBild.fragor.map((x) => [x.kod, x.tidigare?.kapitel])).toEqual([['6.1', undefined], ['7.3', '6']]);
  });

  it('enaFragor ger länkarna i utdatats texter, och ett ensamt tillfälle lämnas orört', () => {
    const s = tvaKapitel();
    const e = enaFragor(s.resultat ?? []);
    expect([...e.tidigare.entries()].map(([n, l]) => [n.startsWith('den kemiska reaktion'), l.kapitel, l.fraga])).toEqual([[true, '4', CELL_V1]]);
    expect(e.resultat).toBe(s.resultat);   // inga texter behövde skrivas om
    const ett = (s.resultat ?? []).filter((r) => r.prov === 'Biologi 4.2 Begrepp');
    expect(enaFragor(ett).resultat).toBe(ett);
  });
});
