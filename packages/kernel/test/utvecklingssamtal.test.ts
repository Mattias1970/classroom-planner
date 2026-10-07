import { describe, expect, it } from 'vitest';
import {
  importeraInlamningar, importeraResultat, klassensUtvarderingar, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst,
  medStorBokstav, provnamnMedStorBokstav, resetIdRaknare, samtalsStycken, samtalsText, sattSamtalsUtvardering, STATUS_TEXT, tolkaTeamsTilldelningar, tomStruktur, utvardering, type Struktur,
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
    expect(pia.text).toContain('utmärkta resultat');
    expect(omar.text).toContain('Låga Exit tickets kan bero på sämre fokus på genomgångarna');
    expect(anna.text).toContain('Alla Läxförhör går att öva hemma på Socrative.com');
    const st = samtalsStycken(anna.text);
    expect(st.map((x) => x.etikett)).toEqual([null, 'Lektionerna', 'Närvaro', 'Läxläsning', 'Inlämningar', 'Prov', null]);
    expect(anna.narvaro).toMatchObject({ lektioner: 5, narvarande: 5, procent: 100 });
    expect(anna.text).toContain('Närvaro: 5 av 5 lektioner (100 %)');
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
    expect(lag).toContain('Närvaro: Omar har varit med på 6 av 10 lektioner (60 %)');
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
