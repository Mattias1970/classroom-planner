/**
 * Del 140: bokens mål per lektion och kapitel importeras för matteböcker; en
 * planeringsmall (lektionsantal + lektionsplaner per radnyckel) slås ihop med
 * planeringen från början.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { slaIhopPlaneringsmall, tolkaPlaneringsmall } from '../src/domain/planeringsmall.js';
import {
  amnesPlanFor, hamtaLektionsplan, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare,
  sattLektionsplan, sparaBok,
} from '../src/domain/struktur.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] };
const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Sanoma', ämne: 'Matematik', årskurs: 8,
    kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8', mal: ['Räkna med bråk', 'Potenser'], malSidor: 's. 6–7' }, '2': { name: 'Samband', col: '#b23a48' } } },
  lektioner: {
    '1': [
      { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–10', två: '11–20', tre: '—', mal: 'Täljare och nämnare\nBlandad form' },
      { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '—', två: '11–20', tre: '21–30', mal: ['Förlänga', 'Förkorta'] },
      { id: 3, type: 'regular', avsnitt: '1.2 Potenser', del: 1, ett: '31–38', två: '39–46', tre: '—', mal: '—' },
      { id: 4, type: 'regular', avsnitt: '1.2 Potenser', del: 2, ett: '—', två: '39–46', tre: '47–54' },
    ],
    '2': [
      { id: 1, type: 'regular', avsnitt: '2.1 Andelen', del: 1, ett: '1–6', två: '7–12', tre: '—' },
      { id: 2, type: 'regular', avsnitt: '2.1 Andelen', del: 2, ett: '—', två: '7–12', tre: '13–18' },
    ],
  },
}));
const SCHEMA = [{ dag: 1, start: '09:00', slut: '10:00' }, { dag: 3, start: '09:00', slut: '10:00' }, { dag: 5, start: '09:00', slut: '10:00' }];

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, LA); s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma 8' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k8b', namn: 'Matematik', bokId: 'ma', schema: SCHEMA });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: 'ma', skapad: '2026-08-10' });
}
const MALL = JSON.stringify({
  schema: 'classroom-planner-planeringsmall', version: 1, namn: 'Ma Y kap 1–2', bokId: 'ma',
  lektionerPerDelkapitel: [{ antal: 3 }, { fran: '2:1', antal: 2 }],
  lektionsplaner: {
    '1:1': { mal: 'Grunderna i bråk', genomgang: 'Rita kvadraten', exempelRakna: 'uppg. 5, 6a' },
    '1:2': { mal: 'Fördjupning + problemlösning' },
    '1:2#3': { mal: 'Repetition 1.1', uppgNiva1: '184–185', uppgNiva2: '', uppgNiva3: '17, 25, 28', filmer: ['Bråk|https://app.binogi.se/l/x'] },
    '2:1': { mal: 'Andelen' },
    '9:9': { mal: 'finns inte' },
  },
});
beforeEach(resetIdRaknare);

describe('Del 140: mål ur matteboken', () => {
  it('lektionens mal (sträng eller lista) och kapitlets mal/malSidor läses in; "—" ger inget mål', () => {
    const k1 = MA.kapitel[0];
    expect(k1.mal).toEqual(['Räkna med bråk', 'Potenser']); expect(k1.malSidor).toBe('s. 6–7');
    const l = k1.delkapitel[0].lektioner;
    expect(l[0].mal).toBe('Täljare och nämnare\nBlandad form');
    expect(l[1].mal).toBe('Förlänga\nFörkorta');
    expect(k1.delkapitel[1].lektioner[0].mal).toBeUndefined();
    expect(MA.kapitel[1].mal).toBeUndefined();
  });
});

describe('Del 140: planeringsmall', () => {
  it('tolkas: okänt schema och fel bok avvisas, tomma fält rensas', () => {
    expect(() => tolkaPlaneringsmall('{"schema":"x"}')).toThrow(/planeringsmall/);
    const m = tolkaPlaneringsmall(MALL);
    expect(m.lektionerPerDelkapitel).toEqual([{ antal: 3 }, { fran: '2:1', antal: 2 }]);
    expect(m.lektionsplaner['1:2#3']).toEqual({ mal: 'Repetition 1.1', uppgNiva1: '184–185', uppgNiva3: '17, 25, 28', filmer: ['Bråk|https://app.binogi.se/l/x'] });
    const s = bygg();
    expect(() => slaIhopPlaneringsmall(s, 'am', { ...m, bokId: 'annan' })).toThrow(/annan bok/);
  });

  it('slås ihop från början: 3 lektioner per delkapitel i kap 1, 2 i kap 2; planerna hamnar på rätt rad via nyckel', () => {
    let s = bygg();
    // läraren har redan skrivit en genomgång på lektion 1 — den ska behållas
    s = sattLektionsplan(s, { id: 'lp1', amneId: 'am', lektionsIndex: 0, genomgang: 'Min egen genomgång' });
    const m = tolkaPlaneringsmall(MALL);
    const ut = slaIhopPlaneringsmall(s, 'am', m);
    const rader = amnesPlanFor(ut.s, 'am')!.a;
    expect(rader.map((r) => r.nyckel)).toEqual(['1:1', '1:2', '1:2#3', '1:3', '1:4', '1:4#3', '2:1', '2:2']);
    expect(ut.saknade).toEqual(['9:9']);
    expect(ut.antalPlaner).toBe(4);
    const p0 = hamtaLektionsplan(ut.s, 'am', 0)!;
    expect(p0.genomgang).toBe('Min egen genomgång');     // behölls
    expect(p0.mal).toBe('Grunderna i bråk'); expect(p0.exempelRakna).toBe('uppg. 5, 6a');
    const p2 = hamtaLektionsplan(ut.s, 'am', 2)!;
    expect(p2.mal).toBe('Repetition 1.1'); expect(p2.uppgNiva1).toBe('184–185'); expect(p2.filmer).toEqual(['Bråk|https://app.binogi.se/l/x']);
    expect(hamtaLektionsplan(ut.s, 'am', 6)!.mal).toBe('Andelen');
    // ersattTexter skriver över lärarens text
    const over = slaIhopPlaneringsmall(s, 'am', m, { ersattTexter: true });
    expect(hamtaLektionsplan(over.s, 'am', 0)!.genomgang).toBe('Rita kvadraten');
    // idempotent: en andra sammanslagning ändrar inget
    const igen = slaIhopPlaneringsmall(ut.s, 'am', m);
    expect(igen.antalPlaner).toBe(0);
    expect(igen.s.lektionsplaner.length).toBe(ut.s.lektionsplaner.length);
  });
});
