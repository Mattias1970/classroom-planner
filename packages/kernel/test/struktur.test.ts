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
    expect(nyttId('k')).toBe('k-1');
    expect(nyttId('k')).toBe('k-2');
    resetIdRaknare();
    expect(nyttId('k')).toBe('k-1');
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
