import { describe, expect, it } from 'vitest';
import {
  arVeckorapportAmne, bokFromImport, importeraInlamningar, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare,
  sattVeckorapportTodo, skapaVeckorapport, sparaBok, taBortVeckorapport, tolkaTeamsTilldelningar, tomStruktur, veckaFor, veckaText, veckanArDags, veckorUtanRapport, veckorapportLarm, veckorapportText, veckorapporter, VECKORAPPORT_TODO, type Struktur,
} from '../src/index.js';

function bygg(): Struktur {
  const BIO = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } },
    lektioner: { '4': [
      { id: 1, type: 'regular', avsnitt: '4.1 Ekosystem', del: 1 }, { id: 2, type: 'regular', avsnitt: '4.1 Ekosystem', del: 2 },
      { id: 3, type: 'regular', avsnitt: '4.2 Näringskedjor', del: 1 }, { id: 4, type: 'regular', avsnitt: '4.2 Näringskedjor', del: 2 },
    ] },
  }));
  resetIdRaknare();
  // Skolåret börjar måndag 17/8; biologi måndag och onsdag
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BIO);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 3, start: '10:00', slut: '11:00' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: 'bio', skapad: '2026-08-10' });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Pia Provlund', grupp: 'A' });
  const imp = (kalla: 'socrative-laxforhor' | 'socrative-exit', prov: string, datum: string, p: number[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rum: prov.toUpperCase(), rader: ['Anna Berg', 'Omar Ali', 'Pia Provlund'].slice(0, p.length).map((namn, i) => ({ namn, poang: p[i], maxPoang: 10 })) }).s;
  };
  imp('socrative-exit', 'Biologi41', '2026-08-17', [6, 4, 8]);
  imp('socrative-exit', 'Biologi412', '2026-08-19', [8, 6]);
  imp('socrative-laxforhor', 'Biologi41', '2026-08-19', [9, 3, 9]);
  imp('socrative-exit', 'Biologi42', '2026-08-24', [10, 5, 10]);
  const rader: unknown[][] = [[null, null, null, 'Fullständigt namn', 'Förnamn', 'Efternamn', 'E-postadress', 'Tilldelningar', 'Förfallodatum', 'Märke', 'Status', 'Feedback']];
  const stat = ['Inlämnat', 'Inte inlämnat', 'Inlämnad sent'];
  ['Anna Berg', 'Omar Ali', 'Pia Provlund'].forEach((n, i) => rader.push([null, null, null, n, n.split(' ')[0], n.split(' ')[1], '', 'Biologi 4.1 Begrepp', '2026-08-21 00:00:00', null, stat[i], null]));
  s = importeraInlamningar(s, 'k', tolkaTeamsTilldelningar(rader)).s;
  return s;
}

describe('Del 194 · veckorapporter — veckonummer, fredag 16:00, att-göra-lista', () => {
  it('veckan: ISO-veckonummer, måndag–fredag, dags fredag 16:00', () => {
    expect(veckaFor('2026-10-12')).toEqual({ ar: 2026, vecka: 42, fran: '2026-10-12', till: '2026-10-16' });
    expect(veckaFor('2026-10-11')).toEqual({ ar: 2026, vecka: 41, fran: '2026-10-05', till: '2026-10-09' });
    expect(veckaFor('2027-01-01')).toMatchObject({ ar: 2026, vecka: 53, fran: '2026-12-28', till: '2027-01-01' });
    expect(veckaText(veckaFor('2026-10-07'))).toBe('v.41 (5–9 oktober 2026)');
    expect(veckaText(veckaFor('2026-08-31'))).toBe('v.36 (31 augusti–4 september 2026)');
    const v = veckaFor('2026-10-07');
    expect(veckanArDags(v, { datum: '2026-10-09', tid: '15:59' })).toBe(false);
    expect(veckanArDags(v, { datum: '2026-10-09', tid: '16:00' })).toBe(true);
    expect(veckanArDags(v, { datum: '2026-10-12', tid: '07:00' })).toBe(true);
  });

  it('veckor utan rapport från skolårets start; veckor utan lektioner räknas inte; larm med att-göra-lista tills allt är bockat', () => {
    let s = bygg();
    // Torsdag v.34 — inget är dags än
    expect(veckorUtanRapport(s, { datum: '2026-08-20', tid: '12:00' })).toEqual([]);
    // Fredag 16:00 v.34 → v.34 är dags
    const nu = { datum: '2026-08-21', tid: '16:00' };
    expect(veckorUtanRapport(s, nu).map((v) => v.vecka)).toEqual([34]);
    // Måndag v.36: v.34 och v.35 saknas
    expect(veckorUtanRapport(s, { datum: '2026-08-31', tid: '08:00' }).map((v) => v.vecka)).toEqual([34, 35]);
    // Texten för v.34 — beskrivande siffror
    const v34 = veckaFor('2026-08-17');
    expect(veckorapportText(s, 'bi', v34)).toBe(
      'Vad vi gjort: kapitel 4 Ekologi — 4.1 Ekosystem (2 lektioner).\n'
      + 'Läxförhör: Biologi41 (ons 19 aug) snitt 70 %, 3 av 3 elever.\n'
      + 'Exit tickets: Biologi41 (mån 17 aug) snitt 60 %, 3 av 3 elever; Biologi412 (ons 19 aug) snitt 70 %, 2 av 3 elever.\n'
      + 'Inlämningar (Teams): Biologi 4.1 Begrepp (fre 21 aug) 2 av 3 inlämnade.');
    // Bara NO och matematik får veckorapport
    expect(arVeckorapportAmne('Biologi')).toBe(true); expect(arVeckorapportAmne('Matematik')).toBe(true);
    expect(arVeckorapportAmne('Teknik')).toBe(false); expect(arVeckorapportAmne('Matematik stöd')).toBe(false);
    // Skapa rapporten
    const r = skapaVeckorapport(s, v34, nu);
    s = r.s;
    expect(r.rapport).toMatchObject({ id: 'vr-2026-34', ar: 2026, vecka: 34, fran: '2026-08-17', till: '2026-08-21', skapad: '2026-08-21 16:00' });
    expect(r.rapport.amnen.map((a) => [a.klassNamn, a.amne])).toEqual([['8B', 'Biologi']]);
    expect(r.rapport.amnen[0].text).toContain('Vad vi gjort: kapitel 4 Ekologi — 4.1 Ekosystem (2 lektioner).');
    expect(r.rapport.todo.map((t) => [t.text, t.klar])).toEqual(VECKORAPPORT_TODO.map((t) => [t, false]));
    expect(() => skapaVeckorapport(s, v34, nu)).toThrow(/finns redan/);
    expect(veckorUtanRapport(s, nu)).toEqual([]);
    // Larmet: inga saknade veckor men listan är inte klar
    let larm = veckorapportLarm(s, nu);
    expect(larm.saknade).toEqual([]);
    expect(larm.oklara.map((x) => x.vecka)).toEqual([34]);
    s = sattVeckorapportTodo(s, 'vr-2026-34', 't1', true);
    s = sattVeckorapportTodo(s, 'vr-2026-34', 't2', true);
    expect(veckorapportLarm(s, nu).oklara).toHaveLength(1);
    s = sattVeckorapportTodo(s, 'vr-2026-34', 't3', true);
    larm = veckorapportLarm(s, nu);
    expect(larm).toEqual({ saknade: [], oklara: [] });
    // v.35 utan resultat: bara lektionerna
    const v35 = veckaFor('2026-08-24');
    expect(veckorapportText(s, 'bi', v35)).toBe('Vad vi gjort: kapitel 4 Ekologi — 4.2 Näringskedjor (2 lektioner).\nLäxförhör: inga i veckan.\nExit tickets: Biologi42 (mån 24 aug) snitt 83 %, 3 av 3 elever.\nInlämningar (Teams): inga förföll i veckan.');
    expect(veckorapportText(s, 'bi', veckaFor('2027-07-05'))).toBe('');
    s = skapaVeckorapport(s, v35, { datum: '2026-08-28', tid: '16:30' }).s;
    expect(veckorapporter(s).map((x) => x.vecka)).toEqual([35, 34]);
    // Ta bort → veckan saknas igen
    s = taBortVeckorapport(s, 'vr-2026-35');
    expect(veckorUtanRapport(s, { datum: '2026-08-31', tid: '08:00' }).map((v) => v.vecka)).toEqual([35]);
    expect(taBortVeckorapport(s, 'vr-2026-34').veckorapporter).toBeUndefined();
  });
});
