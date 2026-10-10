import { describe, expect, it } from 'vitest';
import {
  importeraInlamningar, importeraResultat, klassensUtvarderingar, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst,
  antalStycken, bokFromImport, gemensamText, kodEtikett, medStorBokstav, provnamnMedStorBokstav, registreraPlanering, resetIdRaknare, samtalsStycken, samtalsText, sattSamtalsKapitel, sattSamtalsUtvardering, sparaBok, STATUS_TEXT, tolkaTeamsTilldelningar, tomStruktur, utvardering, type Struktur,
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
    expect(anna.text).toContain('från 60 % i början till 90 % nu');
    expect(anna.text).toContain('Ekologi E-prov: godkänd (11 av 14 p)');
    expect(omar.text).toContain('har just nu svårt att nå målen');
    expect(omar.text).toContain('4 begrepp har glömts mer än en gång');
    expect(omar.text).toContain('inte godkänd ännu (5 av 14 p)');
    expect(omar.text).toContain('Frågorna är hemligheten till nästa nivå');   // Omar saknar frågor
    expect(anna.text).toContain('Alla frågorna är gjorda — där finns hemligheten till nästa nivå');
    // Slutsatsen tar hänsyn till inlämningarna: Omar saknar både laborationen (eget kunskapskrav) och frågorna; Anna har allt
    const omarSlut = omar.text.split('\n').pop()!;
    expect(omarSlut).toContain('Laborationerna är ett eget kunskapskrav — en laboration saknas');
    expect(omarSlut).toContain('Och gör frågorna till varje avsnitt — det är Inlämningarna som öppnar vägen till högre nivå.');
    expect(anna.text.split('\n').pop()).toContain('Laborationer och frågor är inlämnade');
    const medLab = samtalsText({ ...omar, inlamningar: { ...omar.inlamningar, laborationer: { inlamnade: 1, antal: 1 } } }, 'Omar');
    expect(medLab.split('\n').pop()).toContain('Gör frågorna till varje avsnitt');
    expect(medLab).not.toContain('eget kunskapskrav');
    expect(pia.text).toContain('utmärkta resultat');
    expect(omar.text).toContain('Låga Exit tickets kan bero på sämre fokus på genomgångarna');
    expect(anna.text).toContain('Alla Läxförhör går att öva hemma på Socrative.com');
    const st = samtalsStycken(anna.text);
    expect(st.map((x) => x.etikett)).toEqual([null, 'Lektionerna', 'Närvaro', 'Läxläsning', 'Inlämningar', 'Prov', null]);
    expect(anna.narvaro).toMatchObject({ lektioner: 5, narvarande: 5, procent: 100 });
    expect(anna.text).toContain('Närvaro: 5 av 5 lektioner (100 %, räknat på lektioner med genomförda quizzar)');
    expect(st[1].delar[0]).toEqual({ text: 'Exit tickets', exit: true });
    // Läxförhör och Inlämning med stor bokstav och blå stil, provnamn med stor bokstav
    expect(st[3].delar.filter((d) => d.exit).map((d) => d.text)[0]).toMatch(/^Läxförhör/);
    expect(st[3].delar.some((d) => d.exit && d.text.startsWith('Inlämning')) || !anna.text.includes('inlämning')).toBe(true);
    expect(anna.text).not.toMatch(/\bläxförhör/);
    expect(provnamnMedStorBokstav('8b ekologi eprov')).toBe('8b Ekologi Eprov');
    // Många glömda begrepp utan utveckling → läxorna görs ej: beständiga kunskaper och nationella prov nämns
    const sv = samtalsText({ ...omar, laxlasning: { ...omar.laxlasning, glomdaBegrepp: ['a', 'b', 'c', 'd', 'e'], tendens: 'gorsEj' } }, 'Omar');
    expect(sv).toContain('kunskaperna inte beständiga');
    expect(sv).toContain('nationella prov kan bli en svår utmaning');
    const lag = samtalsText({ ...omar, narvaro: { procent: 60, lektioner: 10, narvarande: 6 } }, 'Omar');
    expect(lag).toContain('Närvaro: Omar har varit med på 6 av 10 lektioner (60 %, räknat på lektioner med genomförda quizzar)');
    expect(lag).toContain('genom att delta mer');
    expect(lag.split('\n').length).toBeLessThanOrEqual(7);
    const mycketLag = samtalsText({ ...omar, narvaro: { procent: 30, lektioner: 10, narvarande: 3 } }, 'Omar');
    expect(mycketLag).toContain('Utan att komma till skolan går det inte att nå målen eller se resultat på Läxförhören');
    expect(mycketLag).toContain('det första steget är att delta på lektionerna');
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
    expect(anna.diagnoser.snitt).toBe(94);
    expect(anna.status).toBe('mycketBra');
    expect(omar.diagnoser.lista.map((d) => d.procent)).toEqual([65, 75, 80, 60]);
    expect(omar.status).toBe('nar');   // snitt 70
    // Del 172: diagnoserna över varandra — en rad per diagnos (namn, tab, procent och nivå), sist snittet
    expect(anna.text).toContain('Diagnoser:\n  1.1 - 1.2 Diagnos\t95 % (mycket bra)\n  1.3 - 1.4 Diagnos\t90 % (går bra)\n  1.5 - 1.6 Diagnos\t100 % (utmärkt)\n  Stockholm Stads Screening\t92 % (mycket bra)\n  Snitt av 4 diagnoser\t94 % (mycket bra)\n');
    expect(omar.text).toContain('\n  2 diagnoser under 70 % — träna på de uppgifterna igen i Magma');
    const st = samtalsStycken(anna.text);
    expect(st[1].etikett).toBe('Diagnoser');
    expect(st[1].underrader.map((r) => [r.text, r.varde])).toEqual([
      ['1.1 - 1.2 Diagnos', '95 % (mycket bra)'], ['1.3 - 1.4 Diagnos', '90 % (går bra)'], ['1.5 - 1.6 Diagnos', '100 % (utmärkt)'],
      ['Stockholm Stads Screening', '92 % (mycket bra)'], ['Snitt av 4 diagnoser', '94 % (mycket bra)']]);
    expect(st[2].etikett).toBe('Inlämningar');   // Del 172: Lektionerna/Läxläsning ersätts av Förhören per kapitel (inga förhör här)
    expect(samtalsStycken(omar.text)[1].underrader.at(-1)).toEqual({ text: '2 diagnoser under 70 % — träna på de uppgifterna igen i Magma så sitter metoderna.', varde: null });
    expect(anna.text).not.toContain('Laborationer');
    for (const u of alla) expect(antalStycken(u.text)).toBeLessThanOrEqual(7);
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
    expect(g.text).toBe(
      'Klassen har arbetat med kapitel 1 Tal — delkapitlen 1.1 Negativa tal, 1.2 Potenser och 1.3 Tal i bråkform. Kapitlet handlar om: räkna med negativa tal; använda potenser.\n'
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
      laxforhor: [{ etikett: '1.1–1.2', prov: '1.1 - 1.2 Läxförhör', datum: '2026-09-01', procent: 90 }, { etikett: '1.1–1.3', prov: '1.1 - 1.3 Läxförhör', datum: '2026-09-08', procent: 100 }] }]);
    const st = samtalsStycken(anna.text);
    expect(st.map((x) => x.etikett)).toEqual([null, 'Diagnoser', 'Förhören', 'Närvaro', 'Inlämningar', null]);
    expect(st[2].underrader).toEqual([
      { text: 'Kapitel 1 Tal · Exit tickets', varde: '1.1 80 %, 1.2 70 %' },
      { text: 'Kapitel 1 Tal · Läxförhör', varde: '1.1–1.2 90 %, 1.1–1.3 100 %' },
      { text: 'Alla Läxförhör går att öva hemma på Socrative.com — både inför kommande förhör och på de olika delkapitlen.', varde: null },
    ]);
    expect(anna.text).not.toContain('Lektionerna');
    expect(anna.text).not.toContain('Läxläsning');
    // Alla kapitel: kapitel 2 har bara ett Exit ticket — Läxförhör nämns inte för det
    const alla = utvardering(sattSamtalsKapitel(s, 'ma', { koder: null }), 'e1', 'ma', IDAG2)!;
    expect(alla.diagnoser.lista.map((d) => d.prov)).toEqual(['1.1 - 1.3 diagnos', '2.1 diagnos', 'Stockholm stads screening']);
    const u2 = samtalsStycken(alla.text)[2].underrader.map((r) => r.text);
    expect(u2).toContain('Kapitel 2 Geometri · Exit tickets');
    expect(u2).not.toContain('Kapitel 2 Geometri · Läxförhör');
    // Utan förhör alls: stycket Förhören utelämnas
    const tom = utvardering(sattSamtalsKapitel(s, 'ma', { koder: ['2.2'] }), 'e1', 'ma', IDAG2)!;
    expect(samtalsStycken(tom.text).map((x) => x.etikett)).not.toContain('Förhören');
  });
});
