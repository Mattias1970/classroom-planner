import { describe, expect, it } from 'vitest';
import {
  importeraInlamningar, importeraResultat, klassensUtvarderingar, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst,
  antalStycken, avslutaSamtal, angraAvslutatSamtal, bokFromImport, gemensamText, kodEtikett, medStorBokstav, periodText, provnamnMedStorBokstav, registreraPlanering, resetIdRaknare, samtalsPeriod, samtalsStycken, samtalsText, sattSamtalsKapitel, sattSamtalsPeriod, sattSamtalsUtvardering, sparaBok, STATUS_TEXT, tolkaTeamsTilldelningar, tomStruktur, utvardering, type Struktur,
} from '../src/index.js';

const IDAG = '2026-10-07';
function bygg(): Struktur {
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });      // stark, stigande
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });       // svag läxläsning, glömmer begrepp, ej godkänd prov
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Pia Provlund', grupp: 'A' });   // utmärkt
  const imp = (kalla: 'socrative-laxforhor' | 'socrative-exit' | 'digiexam', prov: string, datum: string, rum: string | undefined, rader: Array<[string, number, number, Array<[string, string, string]>?]>) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, ...(rum !== undefined ? { rum } : {}), rader: rader.map(([namn, poang, maxPoang, svar]) => ({ namn, poang, maxPoang, ...(svar !== undefined ? { svar: svar.map(([fraga, svar, facit]) => ({ fraga, svar, facit, ratt: svar === facit })) } : {}) })) }).s;
  };
  // Exit tickets: Anna 60 → 90, Omar 50 → 50, Pia 100
  imp('socrative-exit', 'Biologi41', '2026-08-24', 'BIOLOGI41', [['Anna Berg', 3, 5], ['Omar Ali', 2, 5], ['Pia Provlund', 5, 5]]);
  imp('socrative-exit', 'Biologi42', '2026-08-28', 'BIOLOGI42', [['Anna Berg', 3, 5], ['Omar Ali', 3, 5], ['Pia Provlund', 5, 5]]);
  imp('socrative-exit', 'Biologi43', '2026-09-04', 'BIOLOGI43', [['Anna Berg', 4, 5], ['Omar Ali', 2, 5], ['Pia Provlund', 5, 5]]);
  imp('socrative-exit', 'Biologi44', '2026-09-09', 'BIOLOGI44', [['Anna Berg', 5, 5], ['Omar Ali', 3, 5], ['Pia Provlund', 5, 5]]);
  // Läxförhör med frågor: Omar har fel på samma begrepp gång på gång
  const fragor = (ratt: boolean[]): Array<[string, string, string]> => ['ekologi', 'biotop', 'habitat', 'nisch', 'population', 'opportunist'].map((b, i) => [`Vad är ${b}?`, ratt[i] ? 'rätt' : 'fel', 'rätt']);
  imp('socrative-laxforhor', 'Biologi41', '2026-08-28', 'BIOLOGI41', [['Anna Berg', 5, 6, fragor([true, true, true, true, true, false])], ['Omar Ali', 2, 6, fragor([true, false, false, false, false, true])], ['Pia Provlund', 6, 6, fragor([true, true, true, true, true, true])]]);
  imp('socrative-laxforhor', 'Biologi412', '2026-09-04', 'BIOLOGI412', [['Anna Berg', 6, 6, fragor([true, true, true, true, true, true])], ['Omar Ali', 2, 6, fragor([true, false, false, false, false, true])], ['Pia Provlund', 6, 6, fragor([true, true, true, true, true, true])]]);
  imp('socrative-laxforhor', 'Biologi4123', '2026-09-09', 'BIOLOGI4123', [['Anna Berg', 6, 6, fragor([true, true, true, true, true, true])], ['Omar Ali', 3, 6, fragor([true, false, false, false, true, true])], ['Pia Provlund', 6, 6, fragor([true, true, true, true, true, true])]]);
  imp('socrative-laxforhor', 'Biologi41234', '2026-09-16', 'BIOLOGI41234', [['Anna Berg', 6, 6, fragor([true, true, true, true, true, true])], ['Omar Ali', 2, 6, fragor([true, false, false, false, false, true])], ['Pia Provlund', 6, 6, fragor([true, true, true, true, true, true])]]);
  // DigiExam: Omar ej godkänd
  imp('digiexam', 'Ekologi E-prov', '2026-09-30', undefined, [['Anna Berg', 11, 14], ['Omar Ali', 5, 14], ['Pia Provlund', 14, 14]]);
  // Inlämningar
  const st = (a: string, o: string, p: string) => [a, o, p];
  const upg: Array<[string, string, string[]]> = [
    ['Biologi 4.1 Begrepp', '2026-08-24', st('Inlämnat', 'Inte inlämnat', 'Inlämnat')], ['Biologi 4.1 Testa dig själv 1 - 6', '2026-08-24', st('Inlämnat', 'Inte inlämnat', 'Inlämnat')],
    ['Biologi 4.2 Begrepp', '2026-08-28', st('Inlämnad sent', 'Inlämnat', 'Inlämnat')], ['Biologi Laboration - Ekologi', '2026-09-03', st('Inlämnat', 'Inte inlämnat', 'Inlämnat')],
    ['Biologi 4.3 Begrepp', '2026-09-09', st('Inlämnat', 'Inte inlämnat', 'Inlämnat')], ['Biologi 4.3 Testa dig själv 1 - 5', '2026-09-09', st('Inlämnat', 'Visade', 'Inlämnat')],
    ['Biologi 6.5 Begrepp', '2026-10-09', st('Inlämnat', 'Inte inlämnat', 'Inte inlämnat')],
  ];
  const rader: unknown[][] = [[null, null, null, 'Fullständigt namn', 'Förnamn', 'Efternamn', 'E-postadress', 'Tilldelningar', 'Förfallodatum', 'Märke', 'Status', 'Feedback']];
  for (const [u, d, stat] of upg) ['Anna Berg', 'Omar Ali', 'Pia Provlund'].forEach((n, i) => rader.push([null, null, null, n, n.split(' ')[0], n.split(' ')[1], '', u, `${d} 00:00:00`, null, stat[i], null]));
  s = importeraInlamningar(s, 'k', tolkaTeamsTilldelningar(rader)).s;
  return s;
}

describe('Del 164 · utvärdering inför utvecklingssamtal', () => {
  it('status, utveckling, läxläsning, inlämningar och prov per elev — texten är högst sju rader', () => {
    const s = bygg();
    const alla = klassensUtvarderingar(s, 'k', 'bi', IDAG);
    expect(alla.map((u) => [u.namn, u.status])).toEqual([['Anna Berg', 'utmarkt'], ['Omar Ali', 'svart'], ['Pia Provlund', 'utmarkt']]);
    const anna = alla[0]; const omar = alla[1]; const pia = alla[2];
    expect(anna.lektioner).toMatchObject({ antal: 4, borjan: 60, nu: 90, trend: 'upp' });
    expect(anna.laxlasning).toMatchObject({ trend: 'upp', glomdaBegrepp: [], tendens: 'ingen' });
    expect(anna.inlamningar).toMatchObject({ begrepp: { inlamnade: 3, antal: 3 }, fragor: { inlamnade: 2, antal: 2 }, laborationer: { inlamnade: 1, antal: 1 }, procent: 100 });
    expect(anna.digiexam).toEqual([{ prov: 'Ekologi E-prov', skrivit: true, godkand: true, poang: 11, maxPoang: 14 }]);
    expect(omar.laxlasning.glomdaBegrepp).toEqual(['Vad är biotop?', 'Vad är habitat?', 'Vad är nisch?', 'Vad är population?']);
    expect(omar.laxlasning.tendens).toBe('kontinuerligt');
    expect(omar.inlamningar.procent).toBe(17);
    expect(omar.digiexam[0]).toMatchObject({ godkand: false, poang: 5 });
    expect(pia.digiexam[0].godkand).toBe(true);
    for (const u of alla) {
      expect(u.text.split('\n\n').length).toBeLessThanOrEqual(7);
      expect(u.text).not.toMatch(/exit tickets/);   // alltid stor bokstav
      expect(u.text).toContain(u.namn.split(' ')[0]);
    }
    console.log(alla.map((u) => `--- ${u.namn} (${u.status})\n${u.text}`).join('\n'));
    // Del 191: kärnfull text — siffrorna, inga orsaksförklaringar, perioden i inledningen, "Nästa steg" sist
    expect(anna.text.split('\n')[0]).toBe('Anna visar utmärkta resultat i biologi (underlag 17 augusti–7 oktober 2026).');
    expect(anna.text).toContain('Lektionerna: Exit tickets från 60 % till 90 % (2 av 4 över 70 %).');
    expect(anna.text).toContain('Närvaro: 5 av 5 lektioner (100 %).');
    expect(anna.text).toContain('Läxläsning: Läxförhör från 92 % till 100 % (3 av 4 över 90 %).');
    expect(anna.text).toContain('Inlämningar: begrepp 3/3, frågor 2/2, laborationer 1/1 (100 % av det som ska vara inne).');
    expect(anna.text).toContain('Prov: Ekologi E-prov godkänt (11 av 14 p).');
    expect(anna.text.split('\n').pop()).toBe('Nästa steg: utmana sig med de svårare uppgifterna.');
    expect(omar.text.split('\n')[0]).toBe('Omar har svårt att nå målen i biologi just nu (underlag 17 augusti–7 oktober 2026).');
    expect(omar.text).toContain('Lektionerna: Exit tickets kring 50 % (0 av 4 över 70 %).');
    expect(omar.text).toContain('Läxläsning: Läxförhör från 33 % till 42 % (0 av 4 över 90 %). Fyra begrepp har glömts mer än en gång.');
    expect(omar.text).toContain('Prov: Ekologi E-prov inte godkänt (5 av 14 p).');
    // Nästa steg: högst två fokus — omprovet först, sedan det som väger tyngst
    expect(omar.text.split('\n').pop()).toBe('Nästa steg: omprovet på Ekologi E-prov och hålla fokus på lektionerna.');
    expect(omar.text).not.toMatch(/kan bero på|hemligheten|nationella prov/);
    const medLab = samtalsText({ ...omar, digiexam: [], narvaro: { procent: 100, lektioner: 5, narvarande: 5 } }, 'Omar');
    expect(medLab.split('\n').pop()).toBe('Nästa steg: hålla fokus på lektionerna och läsa läxan en kort stund varje dag.');
    expect(pia.text).toContain('utmärkta resultat');
    const st = samtalsStycken(anna.text);
    expect(st.map((x) => x.etikett)).toEqual([null, 'Lektionerna', 'Närvaro', 'Läxläsning', 'Inlämningar', 'Prov', 'Nästa steg']);
    expect(anna.narvaro).toMatchObject({ lektioner: 5, narvarande: 5, procent: 100 });
    expect(st[1].delar[0]).toEqual({ text: 'Exit tickets', exit: true });
    expect(st[3].delar.filter((d) => d.exit).map((d) => d.text)[0]).toMatch(/^Läxförhör/);
    expect(anna.text).not.toMatch(/\bläxförhör/);
    expect(provnamnMedStorBokstav('8b ekologi eprov')).toBe('8b Ekologi eprov');   // svensk skrivregel: bara första ordet
    const sv = samtalsText({ ...omar, digiexam: [], laxlasning: { ...omar.laxlasning, glomdaBegrepp: ['a', 'b', 'c', 'd', 'e'], tendens: 'gorsEj' } }, 'Omar');
    expect(sv.split('\n').pop()).toBe('Nästa steg: hålla fokus på lektionerna och läsa läxan en kort stund varje dag (Läxförhören går att öva på Socrative.com).');
    const lag = samtalsText({ ...omar, narvaro: { procent: 60, lektioner: 10, narvarande: 6 } }, 'Omar');
    expect(lag).toContain('Närvaro: 6 av 10 lektioner (60 %).');
    expect(lag.split('\n').pop()).toBe('Nästa steg: omprovet på Ekologi E-prov och vara med på lektionerna.');
    expect(lag.split('\n').length).toBeLessThanOrEqual(7);
    expect(sv.split('\n').length).toBeLessThanOrEqual(7);
    expect(medStorBokstav('ett läxförhör och en inlämning, exit ticket')).toBe('ett Läxförhör och en Inlämning, Exit ticket');
    expect(STATUS_TEXT.svart).toBe('har svårt att nå målen');

    // Läraren sätter egen status och text
    const s2 = sattSamtalsUtvardering(s, 'e2', 'bi', { status: 'nar', text: 'Egen text.' });
    const o2 = utvardering(s2, 'e2', 'bi', IDAG)!;
    expect(o2).toMatchObject({ status: 'svart', egenStatus: 'nar', egenText: 'Egen text.' });
    expect(o2.text.startsWith('Omar når målen')).toBe(true);
    const s3 = sattSamtalsUtvardering(s2, 'e2', 'bi', { status: null, text: null });
    expect(s3.samtalsUtvarderingar).toBeUndefined();
  });
});

describe('Del 171 · matematikmallen — Magma-diagnoser styr', () => {
  it('alla diagnoser sammanfattas med nivå (70–80 når, 81–90 bra, 91–95 mycket bra, >95 utmärkt); snittet ger status', () => {
    resetIdRaknare();
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '12:50', slut: '13:40' }] });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
    const imp = (prov: string, datum: string, a: number, o: number, max = 20) => {
      s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov, datum, rader: [{ namn: 'Anna Berg', poang: a, maxPoang: max }, { namn: 'Omar Ali', poang: o, maxPoang: max }] }).s;
    };
    imp('1.1 - 1.2 diagnos', '2026-09-05', 19, 13);
    imp('1.3 - 1.4 diagnos', '2026-09-19', 18, 15);
    imp('1.5 - 1.6 diagnos', '2026-09-26', 20, 16);
    imp('Stockholm stads screening', '2026-09-30', 46, 30, 50);
    const alla = klassensUtvarderingar(s, 'k', 'ma', IDAG);
    const anna = alla[0]; const omar = alla[1];
    expect(anna.mall).toBe('ma');
    expect(anna.diagnoser.lista.map((d) => [d.procent, d.niva])).toEqual([[95, 'mycketBra'], [90, 'bra'], [100, 'utmarkt'], [92, 'mycketBra']]);
    expect(anna.diagnoser.snitt).toBe(95);   // Del 179: screeningen ligger separat och räknas inte in i snittet
    expect(anna.status).toBe('mycketBra');
    expect(omar.diagnoser.lista.map((d) => d.procent)).toEqual([65, 75, 80, 60]);
    expect(omar.status).toBe('nar');   // snitt 73
    // Del 172: diagnoserna över varandra — en rad per diagnos (namn, tab, procent och nivå), sist snittet
    expect(anna.text).toContain('Diagnoser:\n  1.1 - 1.2 Diagnos\t95 % (mycket bra)\n  1.3 - 1.4 Diagnos\t90 % (går bra)\n  1.5 - 1.6 Diagnos\t100 % (utmärkt)\n  Snitt av tre diagnoser\t95 % (mycket bra)\n');
    // Del 179: screeningen i ett eget stycke
    expect(anna.text).toContain('\nScreening:\n  Stockholm stads screening\t92 % (mycket bra)\n');
    expect(omar.text.split('\n').pop()).toBe('Nästa steg: träna uppgifterna som blev fel igen i Magma.');   // en diagnos under 70 %; screeningen räknas separat
    const st = samtalsStycken(anna.text);
    expect(st[1].etikett).toBe('Diagnoser');
    expect(st[1].underrader.map((r) => [r.text, r.varde])).toEqual([
      ['1.1 - 1.2 Diagnos', '95 % (mycket bra)'], ['1.3 - 1.4 Diagnos', '90 % (går bra)'], ['1.5 - 1.6 Diagnos', '100 % (utmärkt)'],
      ['Snitt av tre diagnoser', '95 % (mycket bra)'], ['Diagnoserna ligger på en jämn nivå.', null]]);
    expect(st[2].etikett).toBe('Screening');
    expect(st[3].etikett).toBe('Inlämningar');   // Del 172: Lektionerna/Läxläsning ersätts av Förhören per kapitel (inga förhör här)
    expect(st[4].etikett).toBe('Nästa steg');
    // Del 184: screeningen (60 %) ingår inte i trenden — 65 → 75, 80 är uppåt
    expect(samtalsStycken(omar.text)[1].underrader.at(-1)).toEqual({ text: 'Diagnoserna går uppåt.', varde: null });
    expect(anna.text).not.toContain('Laborationer');
    for (const u of alla) expect(antalStycken(u.text)).toBeLessThanOrEqual(8);
  });
});

describe('Del 172 · matematik — gemensam kapiteltext och förhör per kapitel', () => {
  const MA = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: {
      '1': { name: 'Tal', col: '#2f5aa8', mal: ['räkna med negativa tal', 'använda potenser'] },
      '2': { name: 'Geometri', col: '#2f8a58' },
    } },
    lektioner: {
      '1': [
        { id: 1, type: 'regular', avsnitt: '1.1 Negativa tal', del: 1 },
        { id: 2, type: 'regular', avsnitt: '1.2 Potenser', del: 1 },
        { id: 3, type: 'regular', avsnitt: '1.3 Tal i bråkform', del: 1 },
      ],
      '2': [
        { id: 1, type: 'regular', avsnitt: '2.1 Vinklar', del: 1 },
        { id: 2, type: 'regular', avsnitt: '2.2 Omkrets', del: 1 },
      ],
    },
  }));
  function bygg(): Struktur {
    resetIdRaknare();
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, MA);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
    // En lektion i veckan (tisdag) från 18/8: 1.1, 1.2, 1.3, 2.1 är genomförda 7/10; 2.2 ligger den 15/9? nej — 13/10 (framtid)
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 2, start: '12:50', slut: '13:40' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    const imp = (kalla: 'socrative-laxforhor' | 'socrative-exit' | 'magma', prov: string, datum: string, p: number, max = 10) => {
      s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla, prov, datum, ...(kalla === 'magma' ? {} : { rum: 'Matte8AA' }), rader: [{ namn: 'Anna Berg', poang: p, maxPoang: max }] }).s;
    };
    imp('socrative-exit', '1.1 Exit', '2026-08-18', 8); imp('socrative-exit', '1.2 Exit', '2026-08-25', 7);
    imp('socrative-laxforhor', '1.1 - 1.2 Läxförhör', '2026-09-01', 9); imp('socrative-laxforhor', '1.1 - 1.3 Läxförhör', '2026-09-08', 10);
    imp('socrative-exit', '2.1 Exit', '2026-09-15', 6);
    imp('magma', '1.1 - 1.3 diagnos', '2026-09-10', 18, 20); imp('magma', 'Stockholm stads screening', '2026-09-30', 46, 50); imp('magma', '2.1 diagnos', '2026-09-22', 10, 20);
    return s;
  }
  const IDAG2 = '2026-10-07';

  it('genomförda kapitel ur planeringen; flera kapitel kräver ett val; gemensam text ur bokens mål och delkapitel', () => {
    const s = bygg();
    const g = gemensamText(s, 'ma', IDAG2);
    expect(g.kapitel.map((k) => [k.nr, k.namn, k.delkapitel.map((d) => d.kod)])).toEqual([[1, 'Tal', ['1.1', '1.2', '1.3']], [2, 'Geometri', ['2.1', '2.2']]]);
    expect(g.behoverVal).toBe(true);
    expect(g.egen).toBe(false);
    // Del 191: perioden (terminsstart–idag) inleder texten
    expect(g.period).toMatchObject({ fran: '2026-08-17', till: IDAG2, forra: null, franTerminsstart: true });
    expect(g.text).toBe(
      'Under perioden 17 augusti–7 oktober 2026 har klassen arbetat med kapitel 1 Tal — delkapitlen 1.1 Negativa tal, 1.2 Potenser och 1.3 Tal i bråkform. Kapitlet handlar om: räkna med negativa tal; använda potenser.\n'
      + 'Klassen har arbetat med kapitel 2 Geometri — delkapitlen 2.1 Vinklar och 2.2 Omkrets.');
    // Urval: bara kapitel 1
    const s2 = sattSamtalsKapitel(s, 'ma', { koder: ['1.1', '1.2', '1.3'] });
    const g2 = gemensamText(s2, 'ma', IDAG2);
    expect(g2.behoverVal).toBe(false);
    expect(g2.valda.map((k) => k.nr)).toEqual([1]);
    expect(g2.text).not.toContain('Geometri');
    // Egen text vinner; null tar bort
    const s3 = sattSamtalsKapitel(s2, 'ma', { text: 'Vi har jobbat med tal.' });
    expect(gemensamText(s3, 'ma', IDAG2)).toMatchObject({ text: 'Vi har jobbat med tal.', egen: true });
    expect(sattSamtalsKapitel(s3, 'ma', { text: null, koder: null }).samtalsKapitel).toBeUndefined();
    expect(kodEtikett(['1.1', '1.2', '1.3'])).toBe('1.1–1.3');
    expect(kodEtikett(['1.1', '1.3'])).toBe('1.1, 1.3');
  });

  it('per elev: diagnoser och förhör bara för valda kapitel; kapitel utan förhör nämns inte', () => {
    const s = sattSamtalsKapitel(bygg(), 'ma', { koder: ['1.1', '1.2', '1.3'] });
    const anna = utvardering(s, 'e1', 'ma', IDAG2)!;
    // Diagnosen för 2.1 ligger utanför urvalet; screeningen (utan koder) är alltid med
    expect(anna.diagnoser.lista.map((d) => d.prov)).toEqual(['1.1 - 1.3 diagnos', 'Stockholm stads screening']);
    expect(anna.kapitel).toEqual([{ nr: 1, namn: 'Tal',
      exit: [{ etikett: '1.1', prov: '1.1 Exit', datum: '2026-08-18', procent: 80 }, { etikett: '1.2', prov: '1.2 Exit', datum: '2026-08-25', procent: 70 }],
      laxforhor: [{ etikett: '1.1–1.2', prov: '1.1 - 1.2 Läxförhör', datum: '2026-09-01', procent: 90 }, { etikett: '1.1–1.3', prov: '1.1 - 1.3 Läxförhör', datum: '2026-09-08', procent: 100 }],
      magmaExit: [], magmaLaxforhor: [] }]);
    const st = samtalsStycken(anna.text);
    expect(st.map((x) => x.etikett)).toEqual([null, 'Diagnoser', 'Screening', 'Förhören', 'Närvaro', 'Inlämningar', 'Nästa steg']);
    expect(st[3].underrader).toEqual([
      { text: 'Kapitel 1 Tal · Exit tickets', varde: '1.1 80 %, 1.2 70 %' },
      { text: 'Kapitel 1 Tal · Läxförhör', varde: '1.1–1.2 90 %, 1.1–1.3 100 %' },
    ]);
    expect(anna.text).not.toContain('Lektionerna');
    expect(anna.text).not.toContain('Läxläsning');
    // Alla kapitel: kapitel 2 har bara ett Exit ticket — Läxförhör nämns inte för det
    const alla = utvardering(sattSamtalsKapitel(s, 'ma', { koder: null }), 'e1', 'ma', IDAG2)!;
    expect(alla.diagnoser.lista.map((d) => d.prov)).toEqual(['1.1 - 1.3 diagnos', '2.1 diagnos', 'Stockholm stads screening']);
    const u2 = samtalsStycken(alla.text)[3].underrader.map((r) => r.text);
    expect(u2).toContain('Kapitel 2 Geometri · Exit tickets');
    expect(u2).not.toContain('Kapitel 2 Geometri · Läxförhör');
    // Utan förhör alls: stycket Förhören utelämnas
    const tom = utvardering(sattSamtalsKapitel(s, 'ma', { koder: ['2.2'] }), 'e1', 'ma', IDAG2)!;
    expect(samtalsStycken(tom.text).map((x) => x.etikett)).not.toContain('Förhören');
  });
});

describe('Del 173 · utan underlag går det inte att säga att eleven når målen', () => {
  it('matematik utan diagnoser → underlag saknas; NO utan resultat → underlag saknas', () => {
    resetIdRaknare();
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '12:50', slut: '13:40' }] });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
    // Bara Anna har gjort en diagnos — och bara ett Exit ticket i matte, vilket inte räcker som underlag i matematik
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov: '1.1 - 1.2 diagnos', datum: '2026-09-05', rader: [{ namn: 'Anna Berg', poang: 15, maxPoang: 20 }] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'socrative-exit', prov: '1.1 Exit', datum: '2026-09-01', rum: 'Matte8AA', rader: [{ namn: 'Omar Ali', poang: 9, maxPoang: 10 }] }).s;
    const [anna, omar] = klassensUtvarderingar(s, 'k', 'ma', IDAG);
    expect(anna.status).toBe('nar');
    expect(omar.status).toBe('saknas');
    expect(STATUS_TEXT.saknas).toBe('underlag saknas');
    expect(omar.text).toContain('Det finns inget underlag för Omar i matematik (underlag 17 augusti–7 oktober 2026), så det går inte att säga hur Omar ligger till i förhållande till målen');
    expect(omar.text).not.toContain('når målen i');
    expect(omar.text).toContain('Nästa steg: göra diagnoserna i Magma.');
    const bio = utvardering(s, 'e1', 'bi', IDAG)!;
    expect(bio.status).toBe('saknas');
    expect(bio.text).toContain('Det finns inget underlag för Anna i biologi');
  });
});

describe('Del 173 · diagnosen på hela kapitlet väger tyngst; utvecklingen beskrivs', () => {
  it('status ur kapiteldiagnosen, delkapiteldiagnoserna ger utvecklingstexten', () => {
    resetIdRaknare();
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '12:50', slut: '13:40' }] });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
    const imp = (prov: string, datum: string, a: number, o: number, max = 20) => {
      s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov, datum, rader: [{ namn: 'Anna Berg', poang: a, maxPoang: max }, { namn: 'Omar Ali', poang: o, maxPoang: max }] }).s;
    };
    imp('1.1 - 1.2 diagnos', '2026-09-05', 12, 19);   // Anna 60 %, Omar 95 %
    imp('1.3 - 1.4 diagnos', '2026-09-19', 14, 18);   // Anna 70 %, Omar 90 %
    imp('Diagnos kap 1', '2026-10-01', 17, 15);       // Anna 85 %, Omar 75 % — hela kapitlet
    const [anna, omar] = klassensUtvarderingar(s, 'k', 'ma', IDAG);
    expect(anna.diagnoser.lista.map((d) => d.typ)).toEqual(['delkapitel', 'delkapitel', 'kapitel']);
    expect(anna.diagnoser).toMatchObject({ slut: 85, delkapitelSnitt: 65, snitt: 72 });
    expect(anna.status).toBe('bra');     // kapiteldiagnosen 85 %, inte snittet 72 %
    expect(omar.status).toBe('nar');     // kapiteldiagnosen 75 % trots 95/90 på delkapitlen
    const st = samtalsStycken(anna.text)[1];
    expect(st.underrader.map((r) => r.text)).toEqual([
      '1.1 - 1.2 Diagnos', '1.3 - 1.4 Diagnos', 'Kap 1 Diagnos (hela kapitlet)', 'Slutresultat (hela kapitlet)',
      'Från 65 % på delkapitlen till 85 % på hela kapitlet — kunskaperna har befästs.']);
    expect(anna.text.split('\n').pop()).toBe('Nästa steg: träna uppgifterna som blev fel igen i Magma.');
    expect(st.underrader[3].varde).toBe('85 % (går bra)');
    expect(samtalsStycken(omar.text)[1].underrader.at(-1)!.text).toBe('93 % på delkapitlen men 75 % på hela kapitlet.');
    expect(omar.text.split('\n').pop()).toBe('Nästa steg: repetera delkapitlen i Magma.');
  });
});

describe('Del 179 · diagnosernas ordning: datum ur planeringen, vid samma datum delkapitel först och hela kapitlet sist; screening separat', () => {
  it('fyra diagnoser importerade samma dag sorteras 1.1–1.2, 1.3–1.4, Kap 1 (hela) — och kapitel 2 efter; planeringens diagnosdatum styr', () => {
    const MA = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' }, '2': { name: 'Geometri', col: '#2f8a58' } } },
      lektioner: {
        '1': [
          { id: 1, type: 'regular', avsnitt: '1.1 Negativa tal', del: 1 }, { id: 2, type: 'regular', avsnitt: '1.2 Potenser', del: 1 },
          { id: 3, type: 'test', avsnitt: 'Diagnos 1.1 - 1.2', del: 1 },
          { id: 4, type: 'regular', avsnitt: '1.3 Bråk', del: 1 }, { id: 5, type: 'regular', avsnitt: '1.4 Procent', del: 1 },
          { id: 6, type: 'test', avsnitt: 'Diagnos 1.3 - 1.4', del: 1 },
          { id: 7, type: 'test', avsnitt: 'Diagnos kapitel 1', del: 1 },
        ],
        '2': [{ id: 1, type: 'regular', avsnitt: '2.1 Vinklar', del: 1 }, { id: 2, type: 'test', avsnitt: 'Diagnos 2.1', del: 1 }],
      },
    }));
    resetIdRaknare();
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, MA);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 2, start: '10:00', slut: '11:00' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    // Allt importerat samma dag, i "fel" ordning
    const imp = (prov: string, p: number) => { s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov, datum: '2026-10-09', rader: [{ namn: 'Anna Berg', poang: p, maxPoang: 10 }] }).s; };
    imp('Ma 8B Kap 2 Diagnos 2.1', 7); imp('Ma 8B Kap 1 Diagnos', 9); imp('Ma 8B Kap 1 Diagnos 1.3 - 1.4', 8); imp('Stockholm stads screening', 9); imp('Ma 8B Kap 1 Diagnos 1.1 - 1.2', 6);
    const anna = utvardering(s, 'e1', 'ma', '2026-10-20')!;
    // Planeringen: tis 18/8 1.1, 25/8 1.2, 1/9 diagnos 1.1–1.2, 8/9 1.3, 15/9 1.4, 22/9 diagnos 1.3–1.4, 29/9 diagnos kap 1, 6/10 2.1, 13/10 diagnos 2.1
    expect(anna.diagnoser.lista.map((d) => [d.prov, d.typ, d.planDatum])).toEqual([
      ['Ma 8B Kap 1 Diagnos 1.1 - 1.2', 'delkapitel', '2026-09-01'],
      ['Ma 8B Kap 1 Diagnos 1.3 - 1.4', 'delkapitel', '2026-09-22'],
      ['Ma 8B Kap 1 Diagnos', 'kapitel', '2026-09-29'],
      ['Ma 8B Kap 2 Diagnos 2.1', 'delkapitel', '2026-10-13'],
      ['Stockholm stads screening', 'screening', null],
    ]);
    const st = samtalsStycken(anna.text);
    expect(st[1].underrader.slice(0, 4).map((r) => r.text)).toEqual(['Kap 1 Diagnos 1.1 - 1.2', 'Kap 1 Diagnos 1.3 - 1.4', 'Kap 1 Diagnos (hela kapitlet)', 'Kap 2 Diagnos 2.1']);
    expect(st[2]).toMatchObject({ etikett: 'Screening', underrader: [{ text: 'Stockholm stads screening', varde: '90 % (går bra)' }] });
    // Statusen bygger på kapiteldiagnosen (90 %) — screeningen räknas inte in
    expect(anna.diagnoser.slut).toBe(90);
  });
});

describe('Del 191 · perioden: från terminsstart (eller förra samtalet) till samtalsdatumet', () => {
  it('standard = terminsstart–idag; sparat samtal flyttar starten; bara resultat i perioden räknas', () => {
    const s = bygg();
    expect(samtalsPeriod(s, 'bi', IDAG)).toEqual({ fran: '2026-08-17', till: IDAG, forra: null, franTerminsstart: true });
    expect(periodText({ fran: '2026-08-17', till: '2026-10-07' })).toBe('17 augusti–7 oktober 2026');
    expect(periodText({ fran: '2026-10-07', till: '2027-02-10' })).toBe('7 oktober 2026–10 februari 2027');
    // Samtalen klara den 7/10: nästa rapport börjar där
    const s2 = avslutaSamtal(s, 'bi', IDAG);
    expect(samtalsPeriod(s2, 'bi', '2027-02-10')).toEqual({ fran: IDAG, till: '2027-02-10', forra: IDAG, franTerminsstart: false });
    const anna = utvardering(s2, 'e1', 'bi', '2027-02-10')!;
    // Inget nytt sedan 7/10 utom inlämningen 9/10 → Exit tickets och Läxförhör saknas i perioden
    expect(anna.lektioner.antal).toBe(0);
    expect(anna.laxlasning.antal).toBe(0);
    expect(anna.inlamningar.begrepp).toEqual({ inlamnade: 1, antal: 1 });
    expect(anna.text.split('\n')[0]).toContain('(underlag 7 oktober 2026–10 februari 2027)');
    expect(anna.text).toContain('Lektionerna: inga Exit tickets.');
    // Eget från/till
    const s3 = sattSamtalsPeriod(s2, 'bi', { fran: '2026-09-01', till: '2026-09-10' }, '2027-02-10');
    const p3 = samtalsPeriod(s3, 'bi', '2027-02-10');
    expect(p3).toMatchObject({ fran: '2026-09-01', till: '2026-09-10', forra: IDAG });
    const a3 = utvardering(s3, 'e1', 'bi', '2027-02-10')!;
    expect(a3.lektioner.antal).toBe(2);   // 4/9 och 9/9
    expect(a3.digiexam).toEqual([]);      // provet 30/9 ligger utanför
    expect(() => sattSamtalsPeriod(s2, 'bi', { till: '2026-01-01' }, '2027-02-10')).toThrow(/före dess början/);
    expect(() => sattSamtalsPeriod(s2, 'bi', { fran: '1/9' }, '2027-02-10')).toThrow(/ÅÅÅÅ-MM-DD/);
    // Ångra det sparade samtalet
    expect(angraAvslutatSamtal(s2, 'bi').samtalsPeriod).toBeUndefined();
    // Den gemensamma texten följer perioden
    const s4 = sattSamtalsPeriod(s, 'bi', { till: '2026-09-01' }, IDAG);
    expect(gemensamText(s4, 'bi', IDAG).period.till).toBe('2026-09-01');
  });
});
