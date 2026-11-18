/**
 * Del 259 · Dra och släpp: korten byter plats som de ligger på raden — också diagnoser och prov. Ett helt
 * avsnitt kan dras till höger om ett annat. Och en egen rad (prov) syns också när en inlagd planering styr.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { amnesPlanFor, laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sparaBok } from '../src/domain/struktur.js';
import { flyttaAvsnittEfter, flyttaKortTill, laggInEgenRadIPlan, laggTillEgenRadIPlan, laggTillLektionEfter, osynligaEgnaRader } from '../src/domain/planutkast.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '2': { name: 'Samband och förändring', col: '#b23a48' }, '3': { name: 'Geometri', col: '#2f5aa8' } } },
  lektioner: {
    '2': [
      { id: 1, type: 'regular', avsnitt: '2.3 Andelen', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.4 Procent', del: 1 },
      { id: 3, type: 'regular', avsnitt: '2.5 Förändringsfaktor', del: 1 }, { id: 4, type: 'repetition', avsnitt: 'Blandade uppgifter', del: 1 }, { id: 5, type: 'repetition', avsnitt: 'Träna', del: 1 },
    ],
    '3': [
      { id: 1, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 1 }, { id: 2, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 2 },
      { id: 3, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 1 }, { id: 4, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 2 },
    ],
  },
}));
/** 8A: måndag, tisdag, onsdag och fredag. Planeringen följer en annan klass — ett inlagt utkast styr. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-11-09', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma',
    schema: [{ dag: 1, start: '10:50', slut: '12:00' }, { dag: 2, start: '10:15', slut: '11:15' }, { dag: 3, start: '08:25', slut: '09:15' }, { dag: 5, start: '12:50', slut: '13:40' }] });
  s = registreraPlanering(s, { id: 'p', amneId: 'ma', bokId: 'ma', skapad: '2026-11-01' });
  return { ...s, amnen: s.amnen.map((a) => (a.id !== 'ma' ? a : { ...a, planFranUtkast: {
    namn: 'Följer 8B', fran: '2026-11-09',
    teori: ['2:1', '2:2', '2:3', '3:1', 'u:diag', '2:4', '2:5', 'u:ov', '3:2', '3:3', '3:4'], labbar: [],
    egna: [{ id: 'diag', rubrik: 'Diagnos Kapitel 2 - Magma', typ: 'diagnos' as const }, { id: 'ov', rubrik: 'Övning', typ: 'ovning' as const }],
  } })) };
}
const IDAG = '2026-11-18';
const rader = (s: Struktur) => amnesPlanFor(s, 'ma', IDAG)!.a.filter((r) => r.datum !== null).map((r) => `${r.datum!.slice(5)} ${r.lektion.avsnitt}${r.lektion.typ === 'regular' && /^\d/.test(r.lektion.avsnitt) ? ` D${r.lektion.del}` : ''}`);

beforeEach(resetIdRaknare);

describe('Del 259 · utgångsläget (som i 8A)', () => {
  it('3.1 del 1 ligger före diagnosen, del 2 en vecka senare', () => {
    expect(rader(bygg())).toEqual([
      '11-09 2.3 Andelen D1', '11-10 2.4 Procent D1', '11-11 2.5 Förändringsfaktor D1',
      '11-13 3.1 Omkrets och area D1', '11-16 Diagnos Kapitel 2 - Magma', '11-17 Blandade uppgifter', '11-18 Träna', '11-20 Övning',
      '11-23 3.1 Omkrets och area D2', '11-24 3.2 Cirkelns area D1', '11-25 3.2 Cirkelns area D2',
    ]);
  });
});

describe('Del 259 · flyttaAvsnittEfter (rutorna i Vägen till provet)', () => {
  it('3.1 dras till höger om diagnosen: diagnosen hamnar på fredagen och 3.1 samlas där del 2 redan låg', () => {
    const u = flyttaAvsnittEfter(bygg(), 'ma', ['3:1', '3:2'], ['u:diag'], IDAG, true);
    expect(rader(u.s)).toEqual([
      '11-09 2.3 Andelen D1', '11-10 2.4 Procent D1', '11-11 2.5 Förändringsfaktor D1',
      '11-13 Diagnos Kapitel 2 - Magma', '11-16 Blandade uppgifter', '11-17 Träna', '11-18 Övning',
      '11-20 3.1 Omkrets och area D1', '11-23 3.1 Omkrets och area D2', '11-24 3.2 Cirkelns area D1', '11-25 3.2 Cirkelns area D2',
    ]);
    expect(u.fran).toBe('2026-11-13');
    // Diagnosen fick ett nytt datum fast den inte var det som drogs — det talas om
    expect(u.flyttadeFasta).toEqual([{ nyckel: 'u:diag', rubrik: 'Diagnos Kapitel 2 - Magma', fran: '2026-11-16', till: '2026-11-13' }]);
    expect(u.andrade).toBe(5);
  });

  it('…och sedan ett prov efter diagnosen: prov på måndagen, kapitel 3 börjar veckan efter', () => {
    let s = flyttaAvsnittEfter(bygg(), 'ma', ['3:1', '3:2'], ['u:diag'], IDAG, true).s;
    s = laggTillLektionEfter(s, 'ma', 'u:diag', { rubrik: 'Prov kapitel 2', typ: 'prov' }, IDAG, true).s;
    expect(rader(s)).toEqual([
      '11-09 2.3 Andelen D1', '11-10 2.4 Procent D1', '11-11 2.5 Förändringsfaktor D1',
      '11-13 Diagnos Kapitel 2 - Magma',          // fredag vecka 46
      '11-16 Prov kapitel 2',                     // måndag vecka 47
      '11-17 Blandade uppgifter', '11-18 Träna', '11-20 Övning',
      '11-23 3.1 Omkrets och area D1',            // första matematiklektionen vecka 48
      '11-24 3.1 Omkrets och area D2', '11-25 3.2 Cirkelns area D1', '11-27 3.2 Cirkelns area D2',
    ]);
  });

  it('åt vänster: avsnittet läggs direkt efter målets sista lektion', () => {
    const u = flyttaAvsnittEfter(bygg(), 'ma', ['3:3', '3:4'], ['u:ov'], '2026-11-19', false);   // bara kommande pass berörs
    expect(rader(u.s).slice(7)).toEqual(['11-20 Övning', '11-23 3.2 Cirkelns area D1', '11-24 3.2 Cirkelns area D2', '11-25 3.1 Omkrets och area D2']);
    expect(u.flyttadeFasta).toEqual([]);
  });

  it('pass som har varit skrivs inte om utan bekräftelse', () => {
    expect(() => flyttaAvsnittEfter(bygg(), 'ma', ['3:1', '3:2'], ['u:diag'], IDAG)).toThrow(/har varit/);
  });

  it('avsnitt utan daterade lektioner ger ett tydligt fel', () => {
    expect(() => flyttaAvsnittEfter(bygg(), 'ma', ['9:9'], ['u:diag'], IDAG, true)).toThrow(/inga daterade lektioner att flytta/);
    expect(() => flyttaAvsnittEfter(bygg(), 'ma', ['3:1'], ['9:9'], IDAG, true)).toThrow(/att lägga efter/);
  });
});

describe('Del 259 · flyttaKortTill (ett kort i taget)', () => {
  it('diagnosen själv kan dras: den byter plats med lektionen före', () => {
    const u = flyttaKortTill(bygg(), 'ma', ['u:diag'], '2:3', IDAG, true);
    expect(rader(u.s).slice(3, 6)).toEqual(['11-13 Diagnos Kapitel 2 - Magma', '11-16 3.1 Omkrets och area D1', '11-17 Blandade uppgifter']);
    expect(u.flyttadeFasta).toEqual([]);                    // det flyttade kortet räknas inte som medflyttat
    expect(u.andrade).toBe(2);                              // bara de två som bytte plats
  });

  it('ett kort som släpps efter en diagnos hamnar på passet efter den — inte först', () => {
    const u = flyttaKortTill(bygg(), 'ma', ['3:3'], 'u:diag', '2026-11-12', false);
    expect(rader(u.s).slice(3, 7)).toEqual(['11-13 3.1 Omkrets och area D1', '11-16 Diagnos Kapitel 2 - Magma', '11-17 3.2 Cirkelns area D1', '11-18 Blandade uppgifter']);
    expect(u.flyttadeFasta).toEqual([]);                    // diagnosen ligger före det som berörs
  });

  it('en lektion som dras förbi en diagnos flyttar diagnosen ett pass — och det talas om', () => {
    const u = flyttaKortTill(bygg(), 'ma', ['3:1'], '2:5', '2026-11-12', false);
    expect(rader(u.s).slice(3, 7)).toEqual(['11-13 Diagnos Kapitel 2 - Magma', '11-16 Blandade uppgifter', '11-17 Träna', '11-18 3.1 Omkrets och area D1']);
    expect(u.flyttadeFasta.map((f) => [f.rubrik, f.fran, f.till])).toEqual([['Diagnos Kapitel 2 - Magma', '2026-11-16', '2026-11-13']]);
  });

  it('null = först; ligger kortet redan där ändras ingenting', () => {
    expect(rader(flyttaKortTill(bygg(), 'ma', ['2:3'], null, IDAG, true).s).slice(0, 3)).toEqual(['11-09 2.5 Förändringsfaktor D1', '11-10 2.3 Andelen D1', '11-11 2.4 Procent D1']);
    const s = bygg();
    expect(flyttaKortTill(s, 'ma', ['3:1'], '2:3', IDAG)).toEqual({ s, fran: null, andrade: 0, flyttadeFasta: [] });
  });

  it('indata rörs inte, och lektionerna efter det berörda ligger kvar', () => {
    const s = bygg(); const fore = JSON.stringify(s);
    const u = flyttaKortTill(s, 'ma', ['u:diag'], '2:3', IDAG, true);
    expect(JSON.stringify(s)).toBe(fore);
    expect(rader(u.s).slice(5)).toEqual(rader(s).slice(5));
  });

  it('fungerar också utan inlagt utkast (bokens ordning)', () => {
    let s = bygg();
    s = { ...s, amnen: s.amnen.map((a) => { if (a.id !== 'ma') return a; const { planFranUtkast: _u, ...rest } = a; void _u; return rest; }) };
    expect(rader(s).slice(0, 3)).toEqual(['11-09 2.3 Andelen D1', '11-10 2.4 Procent D1', '11-11 2.5 Förändringsfaktor D1']);
    const u = flyttaKortTill(s, 'ma', ['2:1'], '2:3', '2026-11-01');
    expect(rader(u.s).slice(0, 4)).toEqual(['11-09 2.4 Procent D1', '11-10 2.5 Förändringsfaktor D1', '11-11 2.3 Andelen D1', '11-13 Blandade uppgifter']);
  });
});

describe('Del 259 · en egen rad syns också när en inlagd planering styr', () => {
  const PROV = { id: 'prov1', position: 5, rubrik: 'Prov kapitel 2', typ: 'prov' as const };
  it('förut: raden lades till men syntes inte — nu listas den som osynlig och kan läggas in', () => {
    const s = laggTillEgenRad(bygg(), 'ma', PROV, IDAG);
    expect(rader(s).some((r) => r.includes('Prov kapitel 2'))).toBe(false);
    expect(osynligaEgnaRader(s, 'ma', IDAG).map((r) => r.rubrik)).toEqual(['Prov kapitel 2']);
    const ut = laggInEgenRadIPlan(s, 'ma', 'prov1', IDAG);
    expect(rader(ut).filter((r) => r.includes('Prov kapitel 2'))).toHaveLength(1);
    expect(osynligaEgnaRader(ut, 'ma', IDAG)).toEqual([]);
  });
  it('laggTillEgenRadIPlan: raden syns direkt, efter lektionen den står efter i bokens följd', () => {
    const s = laggTillEgenRadIPlan(bygg(), 'ma', PROV, IDAG);
    const r = rader(s);
    expect(r.filter((x) => x.includes('Prov kapitel 2'))).toHaveLength(1);
    // position 5 = före 3.1 del 1 i bokens följd → direkt efter kapitel 2:s sista lektion (Träna)
    expect(r[r.findIndex((x) => x.includes('Prov kapitel 2')) - 1]).toContain('Träna');
    expect(r).toHaveLength(12);
  });
  it('utan inlagd planering fungerar det som förut', () => {
    let s = bygg();
    s = { ...s, amnen: s.amnen.map((a) => { if (a.id !== 'ma') return a; const { planFranUtkast: _u, ...rest } = a; void _u; return rest; }) };
    const ut = laggTillEgenRadIPlan(s, 'ma', PROV, '2026-11-01');
    expect(rader(ut).slice(4, 7)).toEqual(['11-16 Träna', '11-17 Prov kapitel 2', '11-18 3.1 Omkrets och area D1']);
    expect(osynligaEgnaRader(ut, 'ma', '2026-11-01')).toEqual([]);
  });
});
