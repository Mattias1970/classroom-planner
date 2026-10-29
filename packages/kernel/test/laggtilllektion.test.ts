import { describe, expect, it } from 'vitest';
import {
  amnesPlanFor, bokFromImport, flyttaLektionEfter, laggTillAmne, laggTillKlass, laggTillLektionEfter, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare,
  sattAntalLektionerIPlan, sattLektionerPerDelkapitelIPlan, sparaBok, tillampaUtkast, tomStruktur, utkastFranPlan, type Struktur,
} from '../src/index.js';

function bygg(): Struktur {
  const BOK = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'b', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#000' } } },
    lektioner: { '1': [1, 2, 3, 4].map((i) => ({ id: i, type: 'regular', avsnitt: `1.${i} Avsnitt`, del: 1 })) },
  }));
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'b', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'b', skapad: '2026-08-10' });
}
const rad = (s: Struktur, idag?: string) => (amnesPlanFor(s, 'ma', idag, false)?.a ?? []).map((r) => `${r.datum} ${r.lektion.avsnitt}`);

describe('Del 200 · lägg till en lektion efter en rad — även under ett utkast', () => {
  it('utan utkast: övningen hamnar på passet efter raden, resten flyttas senare', () => {
    const s = bygg();
    const r = laggTillLektionEfter(s, 'ma', '1:2', { rubrik: 'Repetition', typ: 'ovning' }, '2026-08-17');
    expect(r).toMatchObject({ datum: '2026-09-02', senarelagda: 2, fasta: 0 });
    expect(rad(r.s, '2026-08-17')).toEqual(['2026-08-19 1.1 Avsnitt', '2026-08-26 1.2 Avsnitt', '2026-09-02 Repetition', '2026-09-09 1.3 Avsnitt', '2026-09-16 1.4 Avsnitt']);
  });

  it('under ett utkast med ett fast prov: provet ligger kvar, det nya kortet hamnar efter raden', () => {
    let s = bygg();
    const u = utkastFranPlan(s, 'ma', '2026-08-17', '2026-08-17', 'U');
    s = tillampaUtkast(s, 'ma', { ...u, teori: ['1:1', '1:2', 'u:prov', '1:3', '1:4'], egna: [{ id: 'prov', rubrik: 'Prov', typ: 'prov' }] }, '2026-08-17');
    expect(rad(s, '2026-08-17')[2]).toBe('2026-09-02 Prov');
    const r = laggTillLektionEfter(s, 'ma', '1:1', { rubrik: 'Extra', typ: 'ovning' }, '2026-08-17');
    expect(r).toMatchObject({ datum: '2026-08-26', senarelagda: 3, fasta: 1 });
    expect(rad(r.s, '2026-08-17')).toEqual(['2026-08-19 1.1 Avsnitt', '2026-08-26 Extra', '2026-09-02 Prov', '2026-09-09 1.2 Avsnitt', '2026-09-16 1.3 Avsnitt', '2026-09-23 1.4 Avsnitt']);
    // Efter sista raden: läggs sist
    const r2 = laggTillLektionEfter(r.s, 'ma', '1:4', { rubrik: 'Sist', typ: 'ovning' }, '2026-08-17');
    expect(rad(r2.s, '2026-08-17').slice(-2)).toEqual(['2026-09-23 1.4 Avsnitt', '2026-09-30 Sist']);
    expect(r2.senarelagda).toBe(0);
  });

  it('efter en genomförd rad: spärrat utan flaggan, annars skrivs passen om', () => {
    const s = bygg();
    const idag = '2026-09-10';   // 19/8, 26/8, 2/9, 9/9 har varit
    expect(() => laggTillLektionEfter(s, 'ma', '1:1', { rubrik: 'X', typ: 'ovning' }, idag)).toThrow(/har varit/);
    const r = laggTillLektionEfter(s, 'ma', '1:1', { rubrik: 'X', typ: 'ovning' }, idag, true);
    expect(rad(r.s, idag)).toEqual(['2026-08-19 1.1 Avsnitt', '2026-08-26 X', '2026-09-02 1.2 Avsnitt', '2026-09-09 1.3 Avsnitt', '2026-09-16 1.4 Avsnitt']);
    expect(() => laggTillLektionEfter(s, 'ma', '1:1', { rubrik: '  ', typ: 'ovning' }, idag, true)).toThrow(/rubrik/);
    expect(() => laggTillLektionEfter(s, 'ma', '9:9', { rubrik: 'X', typ: 'ovning' }, idag, true)).toThrow(/finns inte/);
  });
});

describe('Del 200 · fler lektioner på ett delkapitel syns även under ett utkast', () => {
  it('antal 1 → 3 lägger in #2 och #3 efter delkapitlets sista lektion; provet ligger kvar', () => {
    let s = bygg();
    const u = utkastFranPlan(s, 'ma', '2026-08-17', '2026-08-17', 'U');
    s = tillampaUtkast(s, 'ma', { ...u, teori: ['1:1', '1:2', 'u:prov', '1:3', '1:4'], egna: [{ id: 'prov', rubrik: 'Prov', typ: 'prov' }] }, '2026-08-17');
    const s2 = sattAntalLektionerIPlan(s, 'ma', '1:1.2', 3, '2026-08-17');
    expect(rad(s2, '2026-08-17')).toEqual(['2026-08-19 1.1 Avsnitt', '2026-08-26 1.2 Avsnitt', '2026-09-02 Prov', '2026-09-09 1.2 Avsnitt', '2026-09-16 1.2 Avsnitt', '2026-09-23 1.3 Avsnitt', '2026-09-30 1.4 Avsnitt']);
    // Tillbaka till 1: extralektionerna försvinner
    expect(rad(sattAntalLektionerIPlan(s2, 'ma', '1:1.2', 1, '2026-08-17'), '2026-08-17')).toEqual(rad(s, '2026-08-17'));
    // Ämnesinställningen 2 per delkapitel från 1:3
    const s3 = sattLektionerPerDelkapitelIPlan(s, 'ma', 2, '1:3', '2026-08-17');
    expect(rad(s3, '2026-08-17')).toEqual(['2026-08-19 1.1 Avsnitt', '2026-08-26 1.2 Avsnitt', '2026-09-02 Prov', '2026-09-09 1.3 Avsnitt', '2026-09-16 1.3 Avsnitt', '2026-09-23 1.4 Avsnitt', '2026-09-30 1.4 Avsnitt']);
  });
});

describe('Del 202 · flytta en lektion efter en annan', () => {
  it('framåt och bakåt, med ett fast prov som ligger kvar; först i raden med null', () => {
    let s = bygg();
    const u = utkastFranPlan(s, 'ma', '2026-08-17', '2026-08-17', 'U');
    s = tillampaUtkast(s, 'ma', { ...u, teori: ['1:1', '1:2', 'u:prov', '1:3', '1:4'], egna: [{ id: 'prov', rubrik: 'Prov', typ: 'prov' }] }, '2026-08-17');
    const idag = '2026-08-17';
    // 1.4 flyttas till efter 1.1
    const r = flyttaLektionEfter(s, 'ma', '1:4', '1:1', idag);
    expect(r).toMatchObject({ fran: '2026-08-26', datum: '2026-08-26' });
    expect(rad(r.s, idag)).toEqual(['2026-08-19 1.1 Avsnitt', '2026-08-26 1.4 Avsnitt', '2026-09-02 Prov', '2026-09-09 1.2 Avsnitt', '2026-09-16 1.3 Avsnitt']);
    // 1.1 flyttas till efter 1.3 (bakåt i raden)
    const r2 = flyttaLektionEfter(r.s, 'ma', '1:1', '1:3', idag);
    expect(rad(r2.s, idag)).toEqual(['2026-08-19 1.4 Avsnitt', '2026-08-26 1.2 Avsnitt', '2026-09-02 Prov', '2026-09-09 1.3 Avsnitt', '2026-09-16 1.1 Avsnitt']);
    // Först: null
    const r3 = flyttaLektionEfter(r2.s, 'ma', '1:3', null, idag);
    expect(rad(r3.s, idag)).toEqual(['2026-08-19 1.3 Avsnitt', '2026-08-26 1.4 Avsnitt', '2026-09-02 Prov', '2026-09-09 1.2 Avsnitt', '2026-09-16 1.1 Avsnitt']);
    // Redan på plats → oförändrat; genomförda pass kräver flaggan
    expect(flyttaLektionEfter(r3.s, 'ma', '1:4', '1:3', idag).s).toBe(r3.s);
    expect(() => flyttaLektionEfter(r3.s, 'ma', '1:1', '1:3', '2026-09-10')).toThrow(/har varit/);
    expect(rad(flyttaLektionEfter(r3.s, 'ma', '1:1', '1:3', '2026-09-10', true).s, '2026-09-10')).toEqual(['2026-08-19 1.3 Avsnitt', '2026-08-26 1.1 Avsnitt', '2026-09-02 Prov', '2026-09-09 1.4 Avsnitt', '2026-09-16 1.2 Avsnitt']);
  });
});
