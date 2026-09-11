import { describe, expect, it } from 'vitest';
import { bokFromBiologiImport } from '../src/domain/biologibok.js';
import { nastaProv, planForAmne, studieguide } from '../src/domain/studieguide.js';
import { importeraResultat, type FragaSvar } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const NOBOK = JSON.stringify({
  id: 'spektrum-biologi', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
  kapitel: [{
    nummer: 4, titel: 'Ekologi', sidor: 's. 80–120', mal: ['Förstå ekosystem'],
    delkapitel: [
      { nummer: '4.1', titel: 'Liv i samspel', sidor: 's. 82', begrepp: ['ekologi', 'population'], extraBegrepp: [], genomgangLank: 'https://app.binogi.se/l/ekosystem',
        forklaringar: { ekologi: 'Vetenskapen om hur organismer samspelar med varandra och sin omgivning.', population: 'Alla individer av en art inom ett ekosystem.' } },
      { nummer: '4.2', titel: 'Energi och materia', sidor: 's. 88', begrepp: ['näringskedja', 'producent'], extraBegrepp: [],
        forklaringar: { 'näringskedja': 'Näringens väg från växt till växtätare till rovdjur och så vidare.', producent: 'Den som tillverkar något, som de gröna växterna vid sin fotosyntes.' } },
    ],
    sammanfattning: { sidor: 's. 118' }, finalen: { sidor: 's. 119', antalUppgifter: 20 },
  }],
});
const EKO = 'Vetenskapen om hur organismer samspelar med varandra och sin omgivning.';
const POP = 'Alla individer av en art inom ett ekosystem.';
const NAR = 'Näringens väg från växt till växtätare till rovdjur och så vidare.';
const sv = (par: Array<[string, boolean]>): FragaSvar[] => par.map(([fraga, ratt]) => ({ fraga, svar: ratt ? 'r' : 'f', ratt }));

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = sparaBok(s, bokFromBiologiImport(NOBOK));
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'spektrum-biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }, { dag: 4, start: '09:00', slut: '10:00' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: 'spektrum-biologi', skapad: '2026-08-17' });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  // Läxförhör 4.1: ekologi rätt, population fel. Exit 4.2: näringskedja fel (producent aldrig testad)
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Biologi 4.1 Begrepp', datum: '2026-08-24', rum: 'Biologi41',
    rader: [{ namn: 'Anna Berg', poang: 1, maxPoang: 2, svar: sv([[EKO, true], [POP, false]]) }] }).s;
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Biologi 4.2 Begrepp', datum: '2026-08-27', rum: 'Biologi42',
    rader: [{ namn: 'Anna Berg', poang: 0, maxPoang: 1, svar: sv([[NAR, false]]) }] }).s;
  return s;
}
const f = { klassId: 'k', amneId: 'bi' };

describe('studieguide', () => {
  it('hittar provet i planen och räknar dagar kvar', () => {
    const plan = planForAmne(bygg(), 'bi');
    expect(plan.length).toBeGreaterThan(0);
    const prov = nastaProv(plan, '2026-08-18');
    expect(prov).not.toBeNull();
    expect(prov!.datum >= '2026-08-18').toBe(true);
    expect(prov!.rubrik).toBe('PROV');
    const g = studieguide(bygg(), 'a', f, '2026-08-18');
    expect(g.provDatum).toBe(prov!.datum);
    expect(g.dagarKvar).toBeGreaterThanOrEqual(0);
    expect(g.rubrik).toMatch(/kvar till provet i Biologi|Provet i Biologi är idag/);
  });

  it('svagaste delkapitlet först; fel och otestade begrepp att plugga, med förklaring och rum', () => {
    const g = studieguide(bygg(), 'a', f, '2026-08-28');
    expect(g.delar.map((d) => d.kod)).toEqual(['4.2', '4.1']); // 4.2: 0 %, 4.1: 50 %
    const d42 = g.delar[0];
    expect(d42.plugga.map((p) => `${p.begrepp}:${p.status}`)).toEqual(['näringskedja:fel', 'producent:otestat']);
    expect(d42.plugga[0].forklaring).toContain('Näringens väg');
    expect(d42.rum).toBe('Biologi42');
    expect(d42.rumUrl).toContain('BIOLOGI42');
    const d41 = g.delar[1];
    expect(d41.plugga.map((p) => p.begrepp)).toEqual(['population']);
    expect(d41.sitter).toEqual(['ekologi']);
    expect(d41.filmer.map((x) => x.url)).toContain('https://app.binogi.se/l/ekosystem');
    expect(g.text.some((t) => t.includes('3 begrepp behöver du plugga in'))).toBe(true);
    expect(g.text.some((t) => t.includes('Börja med 4.2'))).toBe(true);
  });

  it('dagsplanen fördelar delkapitlen och slutar med repetition; utan prov blir det tre dagar', () => {
    const g = studieguide(bygg(), 'a', f, '2026-08-28');
    expect(g.plan.length).toBeGreaterThan(0);
    expect(g.plan.flatMap((d) => d.delar)).toEqual(expect.arrayContaining(['4.1', '4.2']));
    let s = bygg();
    s = { ...s, planeringar: [] }; // ingen planering → inget prov
    const utan = studieguide(s, 'a', f, '2026-08-28');
    expect(utan.provDatum).toBeNull();
    expect(utan.plan).toHaveLength(3);
    expect(utan.plan[2].delar).toContain('repetition');
    expect(utan.rubrik).toBe('Plugga inför nästa prov i Biologi');
  });
});
