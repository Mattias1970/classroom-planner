import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import {
  forstaKommandePass, kallLektioner, kallor, kopplaLossSammansatt, kopplaSammansatt, sparaSammansatt, tillSammansatt,
} from '../src/domain/sammansatt.js';
import { planForAmne } from '../src/domain/studieguide.js';
import {
  amnesPlanFor, aterstallPlanering, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sattLektionsplan, sparaBok,
} from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

beforeEach(resetIdRaknare);

function bok(id: string, amne: string, kapitel: Record<string, string[]>): string {
  const kapitelMeta: Record<string, { name: string; col: string }> = {};
  const lektioner: Record<string, unknown[]> = {};
  for (const [nr, avsnitt] of Object.entries(kapitel)) {
    kapitelMeta[nr] = { name: `Kapitel ${nr}`, col: nr === '6' ? '#8c3b2e' : '#2f5aa8' };
    lektioner[nr] = avsnitt.map((a, i) => ({ id: i + 1, type: 'regular', avsnitt: a, del: 1, ett: `${i + 1}–${i + 5}`, begrepp: `begrepp ${a}` }));
  }
  return JSON.stringify({ schema: 'classroom-planner-bok', version: 1, bok: { id, titel: `Spektrum ${amne}`, förlag: 'Liber', ämne: amne, årskurs: 8, kapitelMeta }, lektioner });
}

const MON_ONS_FRE = [1, 3, 5].map((dag) => ({ dag, start: '08:10', slut: '09:10' }));

function skola(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k8a', tjanstId: 'tj', namn: '8A' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = sparaBok(s, bokFromValfriImport(bok('bi', 'Biologi', { '4': ['4.1 Liv', '4.2 Energi', '4.3 System', '4.4 Bruka', '4.5 Ekologi'], '6': ['6.1 Celler', '6.2 Matspjälkning', '6.3 Andningen', '6.4 Blodet', '6.5 Immunförsvaret'] })));
  s = sparaBok(s, bokFromValfriImport(bok('ke', 'Kemi', { '1': ['1.1 Atomer', '1.2 Grundämnen', '1.3 Molekyler', '1.4 Blandningar', '1.5 Lösningar', '1.6 Syror'] })));
  s = laggTillAmne(s, { id: 'bi8a', klassId: 'k8a', namn: 'Biologi', bokId: 'bi', schema: MON_ONS_FRE });
  s = laggTillAmne(s, { id: 'ke8b', klassId: 'k8b', namn: 'Kemi', bokId: 'ke', schema: [2, 4].map((dag) => ({ dag, start: '10:10', slut: '11:10' })) });
  s = registreraPlanering(s, { id: 'pl-bi', amneId: 'bi8a', bokId: 'bi', skapad: '2026-08-10' });
  s = registreraPlanering(s, { id: 'pl-ke', amneId: 'ke8b', bokId: 'ke', skapad: '2026-08-10' });
  // 8B Kemi har detaljplanering på första lektionen
  return sattLektionsplan(s, { id: 'lp-ke', amneId: 'ke8b', lektionsIndex: 0, presentation: 'Atomer.pptx', mal: 'Förklara vad en atom är' });
}

describe('Del 157: sätt ihop planering ur två källor', () => {
  it('källor: alla planeringar (även andra klasser) och alla böcker; korten har datum, kapitelfärg och detaljplanering', () => {
    const s = skola();
    expect(kallor(s).map((k) => `${k.grupp}: ${k.namn}`)).toEqual([
      'Planeringar: 8A Biologi · Spektrum Biologi', 'Planeringar: 8B Kemi · Spektrum Kemi',
      'Böcker: Spektrum Biologi (åk 8)', 'Böcker: Spektrum Kemi (åk 8)',
    ]);
    const ke = kallLektioner(s, { typ: 'amne', amneId: 'ke8b' }, '2026-08-26');
    expect(ke[0]).toMatchObject({ datum: '2026-08-18', lektion: { avsnitt: '1.1 Atomer' }, kallaNamn: '8B Kemi · Spektrum Kemi' });
    expect(ke[0].plan).toMatchObject({ presentation: 'Atomer.pptx' });
    expect(ke[1].plan).toBeNull();
    const bi = kallLektioner(s, { typ: 'bok', bokId: 'bi' });
    expect(bi.filter((k) => k.kapitel === 6).map((k) => [k.lektion.avsnitt, k.farg])[0]).toEqual(['6.1 Celler', '#8c3b2e']);
    expect(bi[0].datum).toBeNull();
  });

  it('5 kort ur en planering + 4 ur en bok sparas som namngiven planering med versioner; kopplas till ett ämne från nästa pass', () => {
    let s = skola();
    const ke = kallLektioner(s, { typ: 'amne', amneId: 'ke8b' }, '2026-08-26').slice(0, 5);
    const kap6 = kallLektioner(s, { typ: 'bok', bokId: 'bi' }).filter((k) => k.kapitel === 6).slice(0, 4);
    const kort = [...ke, ...kap6].map(tillSammansatt);
    let r = sparaSammansatt(s, kort, { typ: 'nytt', namn: 'Kemi och kroppen' }, '2026-08-26T20:00:00Z');
    s = r.s;
    expect(() => sparaSammansatt(s, kort, { typ: 'nytt', namn: 'Kemi och kroppen' }, 'x')).toThrow('finns redan');
    r = sparaSammansatt(s, kort.slice(0, 8), { typ: 'ny-version', namn: 'Kemi och kroppen' }, '2026-08-26T21:00:00Z');
    s = r.s;
    expect(s.sammansattaPlaneringar!.map((p) => `${p.namn} v${p.version} (${p.lektioner.length})`)).toEqual(['Kemi och kroppen v1 (9)', 'Kemi och kroppen v2 (8)']);
    const v1 = s.sammansattaPlaneringar![0];

    // 8A Biologi idag onsdag 26 aug: 4 genomförda pass (4.1–4.4)
    expect(forstaKommandePass(s, 'bi8a', '2026-08-26')).toBe('2026-08-26');
    const fore = planForAmne(s, 'bi8a', '2026-08-26');
    const k = kopplaSammansatt(s, v1.id, 'bi8a', '2026-08-19', '2026-08-26', '2026-08-26T21:30:00Z');
    expect(k.fran).toBe('2026-08-26');                                // aldrig bakåt i tiden
    s = k.s;
    const plan = planForAmne(s, 'bi8a', '2026-08-26');
    expect(plan.slice(0, 4)).toEqual(fore.slice(0, 4));               // genomfört orört
    expect(plan.slice(4, 14).map((p) => [p.datum, p.lektion.avsnitt])).toEqual([
      ['2026-08-26', '1.1 Atomer'], ['2026-08-28', '1.2 Grundämnen'], ['2026-08-31', '1.3 Molekyler'], ['2026-09-02', '1.4 Blandningar'], ['2026-09-04', '1.5 Lösningar'],
      ['2026-09-07', '6.1 Celler'], ['2026-09-09', '6.2 Matspjälkning'], ['2026-09-11', '6.3 Andningen'], ['2026-09-14', '6.4 Blodet'],
      ['2026-09-16', '4.5 Ekologi'],                                  // ämnets bok fortsätter efter 4.4 …
    ]);
    expect(plan.slice(14).map((p) => p.lektion.avsnitt)).toEqual(['6.5 Immunförsvaret']);   // … och 6.1–6.4 kommer inte igen
    // Kortens detaljplanering kopierad till sin nya plats
    expect(s.lektionsplaner.find((p) => p.amneId === 'bi8a' && p.lektionsIndex === 4)).toMatchObject({ presentation: 'Atomer.pptx', mal: 'Förklara vad en atom är' });
    expect(s.lektionsplaner.find((p) => p.id === 'lp-ke')!.lektionsIndex).toBe(0);           // originalet orört
    // Ny version; den gamla kan återställas
    const aktiv = s.planeringar.find((p) => p.amneId === 'bi8a')!;
    expect(aktiv).toMatchObject({ version: 2, sammansatt: { namn: 'Kemi och kroppen', version: 1, fran: '2026-08-26' } });
    expect(planForAmne(aterstallPlanering(s, 'pl-bi'), 'bi8a', '2026-08-26')[4].lektion.avsnitt).toBe('4.5 Ekologi');
    // Koppla loss: boken igen från samma pass
    const loss = kopplaLossSammansatt(s, 'bi8a', '2026-08-26', '2026-08-27T08:00:00Z');
    expect(planForAmne(loss, 'bi8a', '2026-08-26')[4].lektion.avsnitt).toBe('4.5 Ekologi');
    expect(loss.planeringar.find((p) => p.amneId === 'bi8a')!.version).toBe(3);
  });

  it('halvklass med laborationer: korten läggs bara på teoripassen, laborationerna ligger kvar', () => {
    let s = skola();
    s = laggTillAmne(s, {
      id: 'bi8b', klassId: 'k8b', namn: 'Biologi', bokId: 'bi', halvklass: true, laborationsstandard: true,
      schema: [{ dag: 1, start: '10:10', slut: '11:10' }, { dag: 4, start: '08:10', slut: '09:10' }],
      schemaB: [{ dag: 1, start: '10:10', slut: '11:10' }, { dag: 4, start: '10:10', slut: '11:10' }],
      laborationer: [{ id: 'l1', rubrik: 'Mikroskopet' }, { id: 'l2', rubrik: 'Hjärtat' }],
    });
    s = registreraPlanering(s, { id: 'pl-bi8b', amneId: 'bi8b', bokId: 'bi', skapad: '2026-08-10' });
    const kort = kallLektioner(s, { typ: 'bok', bokId: 'ke' }).slice(0, 2).map(tillSammansatt);
    const r = sparaSammansatt(s, kort, { typ: 'nytt', namn: 'Kemistart' }, 'x');
    s = kopplaSammansatt(r.s, r.id, 'bi8b', '2026-08-24', '2026-08-24', 'y').s;
    const ap = amnesPlanFor(s, 'bi8b', '2026-08-24')!;
    const fonster = (l: typeof ap.a) => l.filter((p) => p.datum !== null && p.datum >= '2026-08-24' && p.datum <= '2026-09-03').map((p) => [p.datum, p.start, p.lektion.avsnitt]);
    expect(fonster(ap.a)).toEqual([
      ['2026-08-24', '10:10', '1.1 Atomer'], ['2026-08-27', '08:10', '🧪 Mikroskopet'], ['2026-08-31', '10:10', '1.2 Grundämnen'], ['2026-09-03', '08:10', '🧪 Hjärtat'],
    ]);
    expect(fonster(ap.b)).toEqual([
      ['2026-08-24', '10:10', '1.1 Atomer'], ['2026-08-27', '10:10', '🧪 Mikroskopet'], ['2026-08-31', '10:10', '1.2 Grundämnen'], ['2026-09-03', '10:10', '🧪 Hjärtat'],
    ]);
    // Passens rubriker (halvklassvyn) följer
    expect(ap.sessioner!.find((x) => x.nyckel === '2026-08-31|10:10')!.rubrik).toBe('1.2 Grundämnen');
  });
});
