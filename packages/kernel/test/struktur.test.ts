import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  giltigtPass, klassSchema, laggTillAmne, laggTillKlass, laggTillLarare, laggTillSkolar,
  laggTillTjanst, larareSchema, nyttId, registreraPlanering, resetIdRaknare, sattLarare,
  schemaKonflikter, skapaPlanering, sparaBok, taBortBok, taBortKlass, taBortLarare,
  taBortSkolar, taBortTjanst, uppdateraAmne,
} from '../src/domain/struktur.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] };

const BOK = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'liber-matematik-y', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8,
    kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8', två: '9–16', tre: '—', sidor_teori: 's. 10–13', begrepp: 'täljare, nämnare' },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '—', två: '17–24', tre: '25–32', sidor_teori: 's. 13–15' },
    { id: 3, type: 'exam', avsnitt: '1 Prov', del: 1 },
  ] },
}));

/** Bygger trädet Skolår → Tjänst → Klass → Ämne (Ma, ons 09:00) med bok. */
function bygg(): { s: Struktur; amneId: string } {
  let s = tomStruktur();
  s = laggTillSkolar(s, LA);
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma/NO 8' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, {
    id: 'am', klassId: 'k8b', namn: 'Matematik', bokId: BOK.id,
    schema: [{ dag: 3, start: '09:00', slut: '10:00' }],
  });
  return { s, amneId: 'am' };
}

beforeEach(resetIdRaknare);

describe('trädet: referensintegritet och kaskad', () => {
  it('kräver förälder i varje led och eget schema för ämnen', () => {
    let s = tomStruktur();
    expect(() => laggTillTjanst(s, { id: 't', skolarId: 'saknas', namn: 'X' })).toThrow(/skolår/);
    s = laggTillSkolar(s, LA);
    s = laggTillTjanst(s, { id: 't', skolarId: 'la', namn: 'X' });
    expect(() => laggTillKlass(s, { id: 'k', tjanstId: 'fel', namn: '8A' })).toThrow(/tjänst/);
    s = laggTillKlass(s, { id: 'k', tjanstId: 't', namn: '8A' });
    expect(() => laggTillAmne(s, { id: 'a', klassId: 'k', namn: 'Ma', schema: [] })).toThrow(/lektionspass/);
    expect(() => laggTillAmne(s, { id: 'a', klassId: 'k', namn: 'Ma', schema: [{ dag: 6, start: '09:00', slut: '10:00' }] })).toThrow(/lektionspass/);
    expect(() => laggTillAmne(s, { id: 'a', klassId: 'k', namn: 'Ma', bokId: 'okänd', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] })).toThrow(/Okänd bok/);
    expect(giltigtPass({ dag: 1, start: '09:00', slut: '08:00' })).toBe(false);
  });

  it('borttag kaskaderar: skolår → tjänst → klass → ämne → planering', () => {
    const { s } = bygg();
    const med = registreraPlanering(s, { id: 'p', amneId: 'am', bokId: BOK.id, skapad: '2026-08-23' });
    expect(taBortKlass(med, 'k8b').amnen).toHaveLength(0);
    expect(taBortKlass(med, 'k8b').planeringar).toHaveLength(0);
    expect(taBortTjanst(med, 'tj').klasser).toHaveLength(0);
    const utan = taBortSkolar(med, 'la');
    expect(utan.tjanster).toHaveLength(0);
    expect(utan.amnen).toHaveLength(0);
    expect(utan.planeringar).toHaveLength(0);
    expect(utan.bocker).toHaveLength(1); // böcker är fristående — kaskaderar inte
  });

  it('taBortBok kopplar loss ämnen och tar bort bokens planeringar', () => {
    const { s } = bygg();
    const med = registreraPlanering(s, { id: 'p', amneId: 'am', bokId: BOK.id, skapad: 'nu' });
    const utan = taBortBok(med, BOK.id);
    expect(utan.amnen[0].bokId).toBeUndefined();
    expect(utan.planeringar).toHaveLength(0);
  });

  it('nyttId är unikt och resetbart', () => {
    expect(nyttId('k')).toBe('k-test-1');
    expect(nyttId('k')).toBe('k-test-2');
    resetIdRaknare();
    expect(nyttId('k')).toBe('k-test-1');
  });
});

describe('lärare och scheman', () => {
  it('lärarens schema härleds ur tjänstens klassers ämnespass; konflikter upptäcks', () => {
    let { s } = bygg();
    s = laggTillAmne(s, { id: 'am2', klassId: 'k8b', namn: 'Fysik', schema: [{ dag: 3, start: '09:30', slut: '10:30' }] });
    s = laggTillLarare(s, { id: 'lar', namn: 'Mattias', signatur: 'MT' });
    s = sattLarare(s, 'tj', 'lar');
    const schema = larareSchema(s, 'lar');
    expect(schema.map((r) => `${r.dag} ${r.start} ${r.amnesNamn}`)).toEqual([
      '3 09:00 Matematik', '3 09:30 Fysik',
    ]);
    expect(schemaKonflikter(schema)).toHaveLength(1); // 09:00–10:00 överlappar 09:30–10:30
    expect(klassSchema(s, 'k8b')).toHaveLength(2);
    // koppla bort lärare: tjänsten består, schemat töms
    const utan = taBortLarare(s, 'lar');
    expect(utan.tjanster[0].larareId).toBeUndefined();
    expect(larareSchema(utan, 'lar')).toHaveLength(0);
    expect(() => sattLarare(s, 'tj', 'okänd')).toThrow(/Okänd lärare/);
  });

  it('ämnen planeras utan lärare — planering kräver bara skolår + schema + bok', () => {
    const { s } = bygg();
    expect(s.tjanster[0].larareId).toBeUndefined();
    const plan = skapaPlanering(LA, s.amnen[0].schema, BOK);
    expect(plan.filter((p) => p.datum !== null)).toHaveLength(3);
  });
});

describe('skapaPlanering: bok + ämnesschema + skolår → datum', () => {
  it('lägger lektionerna på onsdagar från läsårsstart', () => {
    const { s } = bygg();
    const plan = skapaPlanering(LA, s.amnen[0].schema, BOK);
    expect(plan.map((p) => p.datum)).toEqual(['2026-08-19', '2026-08-26', '2026-09-02']);
    expect(plan[0]).toMatchObject({ kapitel: 1, vecka: 34, start: '09:00', slutTid: '10:00' });
    expect(plan[0].lektion.avsnitt).toBe('1.1 Bråk');
  });

  it('temadag och halvdag tar bort pass — resten förskjuts; utanför läsåret ⇒ datum null', () => {
    const la: Skolar = { ...LA, dagar: [
      { datum: '2026-08-19', typ: 'heldag', label: 'Temadag' },
      { datum: '2026-08-26', typ: 'halvdag', slut: '08:30', label: 'Idrottsdag' },
    ] };
    const { s } = bygg();
    const plan = skapaPlanering(la, s.amnen[0].schema, BOK);
    expect(plan.map((p) => p.datum)).toEqual(['2026-09-02', '2026-09-09', '2026-09-16']);
    // kort skolår: allt ryms inte
    const kort = skapaPlanering({ ...LA, slut: '2026-08-31' }, s.amnen[0].schema, BOK);
    expect(kort.map((p) => p.datum)).toEqual(['2026-08-19', '2026-08-26', null]);
  });

  it('registreraPlanering ersätter tidigare för samma ämne och validerar referenser', () => {
    const { s } = bygg();
    let m = registreraPlanering(s, { id: 'p1', amneId: 'am', bokId: BOK.id, skapad: 'a' });
    m = registreraPlanering(m, { id: 'p2', amneId: 'am', bokId: BOK.id, skapad: 'b' });
    expect(m.planeringar.map((p) => p.id)).toEqual(['p2']);
    expect(() => registreraPlanering(s, { id: 'x', amneId: 'saknas', bokId: BOK.id, skapad: '' })).toThrow(/Okänt ämne/);
  });

  it('uppdateraAmne byter bok ("" kopplar loss) och validerar schema', () => {
    const { s } = bygg();
    expect(uppdateraAmne(s, 'am', { bokId: '' }).amnen[0].bokId).toBeUndefined();
    expect(() => uppdateraAmne(s, 'am', { schema: [] })).toThrow(/lektionspass/);
  });
});

// ── Skolår är unika; halvklasser; elever med Grupp A/B ───────
import {
  elevSchema, laggTillElev, taBortElev, uppdateraElev, uppdateraSkolar,
} from '../src/domain/struktur.js';
import { STANDARD_AMNEN, arHalvklass, socrativeRum } from '../src/domain/amnen.js';

describe('skolår är unika (högst ett av varje namn)', () => {
  it('avvisar dubblettnamn vid tillägg och namnbyte, oavsett skiftläge', () => {
    let s = laggTillSkolar(tomStruktur(), LA);
    expect(() => laggTillSkolar(s, { ...LA, id: 'la2', namn: ' 2026/2027 ' })).toThrow(/finns redan/);
    s = laggTillSkolar(s, { ...LA, id: 'la2', namn: '2027/2028' });
    expect(() => uppdateraSkolar(s, 'la2', { namn: '2026/2027' })).toThrow(/finns redan/);
    expect(uppdateraSkolar(s, 'la2', { namn: '2027/2028 HT' }).skolar[1].namn).toBe('2027/2028 HT');
    expect(() => uppdateraSkolar(s, 'la2', { slut: '2026-01-01' })).toThrow(/efter startdatumet/);
  });
});

describe('halvklasser och Socrative-rum per ämne', () => {
  it('Matematik är helklass; Biologi/Fysik/Kemi/Teknik är halvklass; rumsnamn följer mönstret', () => {
    expect(STANDARD_AMNEN).toEqual(['Matematik', 'Biologi', 'Fysik', 'Kemi', 'Teknik']);
    expect(arHalvklass('Matematik')).toBe(false);
    for (const a of ['Biologi', 'Fysik', 'Kemi', 'Teknik']) expect(arHalvklass(a)).toBe(true);
    expect(socrativeRum('Matematik', '8A')).toBe('Matte8AA');
    expect(socrativeRum('Matematik', '8B')).toBe('Matte8BB');
    expect(socrativeRum('Biologi', '8A')).toBe('Biologi8AA');
    expect(socrativeRum('Teknik', '8 F')).toBe('Teknik8FF');
  });
  it('halvklassämnen kräver giltigt Grupp B-schema; klasschemat märker grupperna', () => {
    let { s } = bygg();
    expect(() => laggTillAmne(s, { id: 'bi', klassId: 'k8b', namn: 'Biologi', halvklass: true, schema: [{ dag: 1, start: '10:00', slut: '11:00' }] }))
      .toThrow(/Grupp B/);
    s = laggTillAmne(s, {
      id: 'bi', klassId: 'k8b', namn: 'Biologi', halvklass: true,
      schema: [{ dag: 1, start: '10:00', slut: '11:00' }],
      schemaB: [{ dag: 4, start: '10:00', slut: '11:00' }],
    });
    const rader = klassSchema(s, 'k8b');
    expect(rader.map((r) => `${r.dag} ${r.amnesNamn}${r.grupp ?? ''}`)).toEqual([
      '1 BiologiA', '3 Matematik', '4 BiologiB',
    ]);
    expect(() => uppdateraAmne(s, 'bi', { schemaB: [] })).toThrow(/Grupp B/);
  });
});

describe('elever med Grupp A/B', () => {
  it('elevens schema = helklasspass + halvklasspass för elevens grupp; kaskad vid klassborttag', () => {
    let { s } = bygg(); // Matematik helklass ons 09:00
    s = laggTillAmne(s, {
      id: 'bi', klassId: 'k8b', namn: 'Biologi', halvklass: true,
      schema: [{ dag: 1, start: '10:00', slut: '11:00' }],
      schemaB: [{ dag: 4, start: '10:00', slut: '11:00' }],
    });
    expect(() => laggTillElev(s, { id: 'e0', klassId: 'saknas', namn: 'X', grupp: 'A' })).toThrow(/klass/);
    s = laggTillElev(s, { id: 'e1', klassId: 'k8b', namn: 'Alva', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k8b', namn: 'Bo', grupp: 'B' });
    expect(elevSchema(s, 'e1').map((r) => `${r.dag} ${r.amnesNamn}${r.grupp ?? ''}`)).toEqual(['1 BiologiA', '3 Matematik']);
    expect(elevSchema(s, 'e2').map((r) => `${r.dag} ${r.amnesNamn}${r.grupp ?? ''}`)).toEqual(['3 Matematik', '4 BiologiB']);
    s = uppdateraElev(s, 'e1', { grupp: 'B' });
    expect(elevSchema(s, 'e1').some((r) => r.grupp === 'B')).toBe(true);
    expect(taBortElev(s, 'e2').elever.map((e) => e.id)).toEqual(['e1']);
    expect(taBortKlass(s, 'k8b').elever).toHaveLength(0);
  });
});

// ── Schemakonflikter (samma tid) ─────────────────────────────
import { passKonflikter, passOverlapp } from '../src/domain/struktur.js';

describe('passKonflikter — varnar för lektioner på samma tid', () => {
  it('passOverlapp kräver samma dag och överlappande tider', () => {
    expect(passOverlapp({ dag: 1, start: '09:00', slut: '10:00' }, { dag: 1, start: '09:30', slut: '10:30' })).toBe(true);
    expect(passOverlapp({ dag: 1, start: '09:00', slut: '10:00' }, { dag: 1, start: '10:00', slut: '11:00' })).toBe(false);
    expect(passOverlapp({ dag: 1, start: '09:00', slut: '10:00' }, { dag: 2, start: '09:00', slut: '10:00' })).toBe(false);
  });

  it('flaggar krock mot klassens andra ämnen', () => {
    const { s } = bygg(); // Matematik ons 09:00–10:00 i 8B
    const krock = passKonflikter(s, 'k8b', [{ dag: 3, start: '09:30', slut: '10:30' }]);
    expect(krock).toHaveLength(1);
    expect(krock[0]).toMatchObject({ amnesNamn: 'Matematik', dag: 3 });
    // annan tid samma dag ⇒ ingen krock
    expect(passKonflikter(s, 'k8b', [{ dag: 3, start: '10:00', slut: '11:00' }])).toHaveLength(0);
    // samma ämne ignoreras vid redigering
    expect(passKonflikter(s, 'k8b', [{ dag: 3, start: '09:30', slut: '10:30' }], 'am')).toHaveLength(0);
  });

  it('flaggar krock mot lärarens andra klasser (dubbelbokning)', () => {
    let { s } = bygg();
    s = laggTillLarare(s, { id: 'lar', namn: 'M', signatur: 'M' });
    s = sattLarare(s, 'tj', 'lar');
    s = laggTillKlass(s, { id: 'k8a', tjanstId: 'tj', namn: '8A' });
    // 8A får matte samtidigt som 8B (ons 09:00) ⇒ läraren dubbelbokad
    const krock = passKonflikter(s, 'k8a', [{ dag: 3, start: '09:00', slut: '10:00' }]);
    expect(krock.some((r) => r.klassNamn === '8B')).toBe(true);
  });
});

import { ledigtStandardpass } from '../src/domain/struktur.js';
describe('ledigtStandardpass — undviker krock i tjänstens schema', () => {
  it('ger 08:10-passet när det är ledigt, annars en ledig dag/tid', () => {
    const { s } = bygg(); // Matematik ons 09:00–10:00 i 8B
    expect(ledigtStandardpass(s, 'k8b')).toEqual({ dag: 1, start: '08:10', slut: '09:10' }); // måndag fri
    // fyll måndag–fredag 08:10 i tjänstens andra klass så 08:10 är upptaget överallt
    let full = s;
    full = laggTillLarare(full, { id: 'l', namn: 'M', signatur: 'M' });
    full = sattLarare(full, 'tj', 'l');
    full = laggTillKlass(full, { id: 'kx', tjanstId: 'tj', namn: '8X' });
    full = laggTillAmne(full, { id: 'amx', klassId: 'kx', namn: 'Matematik',
      schema: [1, 2, 3, 4, 5].map((d) => ({ dag: d, start: '08:10', slut: '09:10' })) });
    const p = ledigtStandardpass(full, 'k8b');
    expect(p.start).not.toBe('08:10'); // 08:10 upptaget alla dagar ⇒ senare tid
    expect(giltigtPass(p)).toBe(true);
  });
});

// ── NO+Tk-blockkurs: lika budget, offset, över-budget-varning ──
import { antalSlots, noBudget, noOverBudget, skapaPlanering as skapaPl } from '../src/domain/struktur.js';
import { amneBakgrund, klassFarg, NO_TK_AMNEN } from '../src/domain/amnen.js';

describe('NO+Tk blockplanering', () => {
  const la: Skolar = { id: 'la', namn: 'x', start: '2026-08-17', slut: '2027-06-11', dagar: [] };
  const schema = [{ dag: 2, start: '09:00', slut: '10:00' }]; // en lektion/vecka
  it('budget = en fjärdedel av läsårets slots; fyra delämnen', () => {
    expect(NO_TK_AMNEN).toEqual(['Biologi', 'Fysik', 'Kemi', 'Teknik']);
    const n = antalSlots(la, schema);
    expect(n).toBeGreaterThan(30);
    expect(noBudget(la, schema)).toBe(Math.floor(n / 4));
  });
  it('offset gör att delämne 2 börjar efter delämne 1:s block', () => {
    const budget = noBudget(la, schema);
    const forsta = skapaPl(la, schema, BOK).filter((p) => p.datum !== null); // liten bok (3 lekt)
    const andra = skapaPl(la, schema, BOK, budget).filter((p) => p.datum !== null);
    expect(andra[0].datum! > forsta[forsta.length - 1].datum!).toBe(true); // andra börjar senare
  });
  it('noOverBudget varnar när bokens lektioner överstiger budgeten', () => {
    expect(noOverBudget(BOK, 2)).toBe(true);   // BOK har 3 lektioner > 2
    expect(noOverBudget(BOK, 5)).toBe(false);
  });
});

describe('kalenderfärger', () => {
  it('olika ämnen får olika bakgrund; klassfärg är deterministisk och ljus', () => {
    expect(amneBakgrund('Matematik')).not.toBe(amneBakgrund('Biologi'));
    expect(amneBakgrund('Fysik')).not.toBe(amneBakgrund('Kemi'));
    expect(klassFarg('8A')).toBe(klassFarg('8A'));      // stabil
    expect(klassFarg('8A')).not.toBe(klassFarg('8B'));  // olika klasser
  });
});

// ── NO-planering: begreppsrum + lektionsplaner ──
import { begreppsRum, delkapitelUrAvsnitt, foreslagnaRum } from '../src/domain/amnen.js';
import { hamtaLektionsplan, sattLektionsplan, taBortAmne } from '../src/domain/struktur.js';

describe('begreppsrum (NO)', () => {
  it('följer mönstret Biologi41 / Biologi412 / Biologi4123 / Biologi42', () => {
    expect(begreppsRum('Biologi', 4, [1])).toBe('Biologi41');
    expect(begreppsRum('Biologi', 4, [1, 2])).toBe('Biologi412');
    expect(begreppsRum('Biologi', 4, [1, 2, 3])).toBe('Biologi4123');
    expect(begreppsRum('Biologi', 4, [2])).toBe('Biologi42');
    expect(begreppsRum('Matematik', 1, [3])).toBe('Matte13'); // ämnesprefix gäller
  });
  it('delkapitelUrAvsnitt tolkar avsnittskoden', () => {
    expect(delkapitelUrAvsnitt('4.2 Fotosyntes')).toEqual({ kap: 4, del: 2 });
    expect(delkapitelUrAvsnitt('Repetition 1 (Blandade uppgifter)')).toBeNull();
  });
  it('foreslagnaRum: exit = delkapitlet, läxförhör = aggregatet t.o.m. delkapitlet', () => {
    expect(foreslagnaRum('Biologi', 4, 3)).toEqual({ exit: 'Biologi43', laxforhor: 'Biologi4123' });
    expect(foreslagnaRum('Fysik', 2, 1)).toEqual({ exit: 'Fysik21', laxforhor: 'Fysik21' });
  });
});

describe('lektionsplaner (detaljerad NO-planering)', () => {
  it('sattLektionsplan gör upsert per (ämne, position); hamtaLektionsplan läser', () => {
    let { s } = bygg();
    s = sattLektionsplan(s, { id: 'lp1', amneId: 'am', lektionsIndex: 0, presentation: 'Fotosyntes.pptx', labFraga: 'Hur påverkar ljus tillväxten?' });
    expect(hamtaLektionsplan(s, 'am', 0)?.presentation).toBe('Fotosyntes.pptx');
    // upsert ersätter
    s = sattLektionsplan(s, { id: 'lp2', amneId: 'am', lektionsIndex: 0, presentation: 'Cellen.pptx' });
    expect(s.lektionsplaner).toHaveLength(1);
    expect(hamtaLektionsplan(s, 'am', 0)?.presentation).toBe('Cellen.pptx');
    expect(hamtaLektionsplan(s, 'am', 5)).toBeNull();
    expect(() => sattLektionsplan(s, { id: 'x', amneId: 'saknas', lektionsIndex: 0 })).toThrow('Ämnet finns inte');
  });
});

describe('borttaget ämne lämnar inget innehåll efter sig', () => {
  it('taBortAmne städar lektionsplaner och planeringar; klass/tjänst kaskadstädar', () => {
    let { s } = bygg();
    s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: 0, anteckning: 'Gammalt innehåll' });
    s = taBortAmne(s, 'am');
    expect(s.lektionsplaner).toHaveLength(0);
    expect(s.planeringar.filter((p) => p.amneId === 'am')).toHaveLength(0);
    // kaskad via klass
    let { s: s2 } = bygg();
    s2 = sattLektionsplan(s2, { id: 'lp', amneId: 'am', lektionsIndex: 0, anteckning: 'x' });
    s2 = taBortKlass(s2, 'k8b');
    expect(s2.lektionsplaner).toHaveLength(0);
  });

  it('nya ämnen ärver inte borttagna ämnens innehåll även om räknaren startar om', () => {
    resetIdRaknare();
    let { s } = bygg();
    const id1 = nyttId('am');
    s = laggTillAmne(s, { id: id1, klassId: 'k8b', namn: 'Biologi', schema: [{ dag: 1, start: '10:00', slut: '11:00' }] });
    s = sattLektionsplan(s, { id: 'lp', amneId: id1, lektionsIndex: 0, anteckning: 'Biologianteckning' });
    s = taBortAmne(s, id1);
    resetIdRaknare();                       // simulerar omladdad sida (räknaren om från 0)
    const id2 = nyttId('am');
    s = laggTillAmne(s, { id: id2, klassId: 'k8b', namn: 'Fysik', schema: [{ dag: 2, start: '10:00', slut: '11:00' }] });
    // Även om id2 skulle råka bli lika med id1 finns inget gammalt innehåll kvar:
    expect(hamtaLektionsplan(s, id2, 0)).toBeNull();
  });
});

// ── saneraIdn + hel-/halvklasspass ──
import { delaHalvklassPass, kombineraHalvklassPass, saneraIdn } from '../src/domain/struktur.js';

describe('saneraIdn — dubblett-id:n från äldre sessioner', () => {
  it('ger senare dubbletter nya id:n så trädet blir entydigt', () => {
    resetIdRaknare();
    let { s } = bygg(); // ämne 'am' i 8B
    // Simulera gammal data: ett ANNAT ämne råkar ha SAMMA id 'am' (annan klass)
    s = { ...s, klasser: [...s.klasser, { id: 'k8a', tjanstId: 'tj', namn: '8A' }] };
    s = { ...s, amnen: [...s.amnen, { id: 'am', klassId: 'k8a', namn: 'Biologi', schema: [{ dag: 1, start: '10:00', slut: '11:00' }] }] };
    const ren = saneraIdn(s);
    const idn = ren.amnen.map((a) => a.id);
    expect(new Set(idn).size).toBe(idn.length);            // alla unika
    expect(ren.amnen[0].id).toBe('am');                    // första behåller sitt id
    expect(ren.amnen[1].id).not.toBe('am');                // dubbletten döps om
    expect(ren.amnen[1].namn).toBe('Biologi');
  });
});

describe('hel-/halvklasspass för NO', () => {
  const hel: Pass = { dag: 1, start: '09:00', slut: '10:00' };
  const a: Pass = { dag: 2, start: '09:00', slut: '10:00' };
  const b: Pass = { dag: 4, start: '09:00', slut: '10:00' };
  it('delaHalvklassPass: helklass hamnar i båda grupperna, A/B i sin', () => {
    const { schema, schemaB } = delaHalvklassPass([
      { ...hel, omfattning: 'hel' }, { ...a, omfattning: 'A' }, { ...b, omfattning: 'B' },
    ]);
    expect(schema).toEqual([hel, a]);       // Grupp A: helklass + A-pass
    expect(schemaB).toEqual([hel, b]);      // Grupp B: helklass + B-pass
  });
  it('kombineraHalvklassPass återskapar omfattningen ur schema/schemaB', () => {
    const rader = kombineraHalvklassPass([hel, a], [hel, b]);
    expect(rader).toEqual([
      { ...hel, omfattning: 'hel' },
      { ...a, omfattning: 'A' },
      { ...b, omfattning: 'B' },
    ]);
  });
  it('tur och retur är stabil', () => {
    const rader = kombineraHalvklassPass([hel, a], [hel, b]);
    const { schema, schemaB } = delaHalvklassPass(rader);
    expect(kombineraHalvklassPass(schema, schemaB)).toEqual(rader);
  });
});
