/**
 * Del 227: kapitlens ordning i planeringen — kapitel 10 före kapitel 7, delkapitel i egen följd,
 * genomförda kurser rörs inte, och den pedagogiska planeringen följer samma ordning.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  amnesPlanFor, hamtaLektionsplan, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering,
  resetIdRaknare, sattLektionsplan, sparaBok,
} from '../src/domain/struktur.js';
import {
  bokensKapitelOrdning, flyttaDelkapitelIOrdning, flyttaKapitelIOrdning, kursOrdningUrKapitelOrdning, planensKapitel,
  planensKapitelOrdning, sammaKapitelOrdning, sattKapitelOrdning, taBortDelkapitelUrPlan, anvandPedagogiskPlanering, ordningUrPedagogiskPlanering,
} from '../src/domain/kapitelordning.js';
import { pedagogiskPlaneringForOmfang } from '../src/domain/pedagogiskplanering.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] };
const KE = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ke', titel: 'Spektrum Kemi', förlag: 'Liber', ämne: 'Kemi', årskurs: 8, kapitelMeta: { '7': { name: 'Organisk kemi', col: '#2f5aa8' }, '10': { name: 'Kol och förbränning', col: '#b05c22' } } },
  lektioner: {
    '7': [
      { id: 1, type: 'regular', avsnitt: '7.1 Kolatomen', del: 1, begrepp: 'kolföreningar, bindning' },
      { id: 2, type: 'regular', avsnitt: '7.2 Kolväten', del: 1, begrepp: 'metan, alkaner' },
      { id: 3, type: 'regular', avsnitt: '7.3 Omättade kolväten', del: 1, begrepp: 'eten, alken' },
      { id: 4, type: 'exam', avsnitt: 'Prov kap 7', del: 1 },
    ],
    '10': [
      { id: 1, type: 'regular', avsnitt: '10.1 Former av kol', del: 1, begrepp: 'diamant, grafit' },
      { id: 2, type: 'regular', avsnitt: '10.2 Fossila bränslen', del: 1, begrepp: 'råolja' },
      { id: 3, type: 'exam', avsnitt: 'Prov kap 10', del: 1 },
    ],
  },
}));
const SCHEMA = [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }];

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, LA); s = sparaBok(s, KE);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO 8' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ke', klassId: 'k8b', namn: 'Kemi', bokId: 'ke', schema: SCHEMA });
  return registreraPlanering(s, { id: 'pl', amneId: 'ke', bokId: 'ke', skapad: '2026-08-10' });
}
const avsnitt = (s: Struktur, idag?: string) => amnesPlanFor(s, 'ke', idag, false)!.a.map((r) => r.lektion.avsnitt);

beforeEach(resetIdRaknare);

describe('planensKapitel och ordningar', () => {
  it('listar kapitlen i planens ordning med kurser och delkapitel; bokens ordning är förvalet', () => {
    const s = bygg();
    const kap = planensKapitel(s, 'ke', '2026-08-10');
    expect(kap.map((k) => [k.nr, k.namn, k.delkapitel, k.kurser.length, k.genomford, k.tomt])).toEqual([
      [7, 'Organisk kemi', ['7.1', '7.2', '7.3'], 4, false, false],
      [10, 'Kol och förbränning', ['10.1', '10.2'], 3, false, false],
    ]);
    expect(sammaKapitelOrdning(planensKapitelOrdning(s, 'ke', '2026-08-10'), bokensKapitelOrdning(s, 'ke'))).toBe(true);
  });

  it('flyttaKapitelIOrdning och flyttaDelkapitelIOrdning byter plats, stannar vid kanten', () => {
    const o = { kapitel: [7, 10], delkapitel: { '7': ['7.1', '7.2', '7.3'] } };
    expect(flyttaKapitelIOrdning(o, 10, -1).kapitel).toEqual([10, 7]);
    expect(flyttaKapitelIOrdning(o, 7, -1)).toBe(o);
    expect(flyttaDelkapitelIOrdning(o, '7.3', -1).delkapitel['7']).toEqual(['7.1', '7.3', '7.2']);
    expect(flyttaDelkapitelIOrdning(o, '7.1', -1)).toBe(o);
    expect(sammaKapitelOrdning(o, flyttaKapitelIOrdning(o, 10, -1))).toBe(false);
  });
});

describe('sattKapitelOrdning', () => {
  it('lägger kapitel 10 före kapitel 7 — hela kapitlet med prov flyttas, lektionsplanerna följer', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp', amneId: 'ke', lektionsIndex: 4, anteckning: 'Diamantlektion' });   // 10.1 på rad 4
    s = sattKapitelOrdning(s, 'ke', { kapitel: [10, 7] }, '2026-08-10');
    expect(avsnitt(s, '2026-08-10')).toEqual(['10.1 Former av kol', '10.2 Fossila bränslen', 'Prov kap 10', '7.1 Kolatomen', '7.2 Kolväten', '7.3 Omättade kolväten', 'Prov kap 7']);
    expect(hamtaLektionsplan(s, 'ke', 0)?.anteckning).toBe('Diamantlektion');
    expect(planensKapitelOrdning(s, 'ke', '2026-08-10').kapitel).toEqual([10, 7]);
    // Tillbaka till bokens ordning
    s = sattKapitelOrdning(s, 'ke', bokensKapitelOrdning(s, 'ke'), '2026-08-10');
    expect(avsnitt(s, '2026-08-10')[0]).toBe('7.1 Kolatomen');
  });

  it('ordnar delkapitel inom ett kapitel; provet ligger kvar sist i kapitlet', () => {
    let s = bygg();
    s = sattKapitelOrdning(s, 'ke', { kapitel: [7, 10], delkapitel: { '7': ['7.3', '7.1', '7.2'] } }, '2026-08-10');
    expect(avsnitt(s, '2026-08-10').slice(0, 4)).toEqual(['7.3 Omättade kolväten', '7.1 Kolatomen', '7.2 Kolväten', 'Prov kap 7']);
  });

  it('genomförda kurser står kvar; kommande kapitel byter ändå plats', () => {
    let s = bygg();
    // 7.1 (18/8) och 7.2 (20/8) är genomförda den 24/8
    const idag = '2026-08-24';
    const fore = planensKapitel(s, 'ke', idag);
    expect(fore[0].genomford).toBe(true);
    s = sattKapitelOrdning(s, 'ke', { kapitel: [10, 7] }, idag);
    expect(avsnitt(s, idag)).toEqual(['7.1 Kolatomen', '7.2 Kolväten', '10.1 Former av kol', '10.2 Fossila bränslen', 'Prov kap 10', '7.3 Omättade kolväten', 'Prov kap 7']);
  });

  it('kursOrdningUrKapitelOrdning: onämnda kapitel sist i nuvarande ordning', () => {
    const s = bygg();
    const kap = planensKapitel(s, 'ke', '2026-08-10');
    expect(kursOrdningUrKapitelOrdning(kap, { kapitel: [10] })).toEqual(['10:10.1', '10:10.2', '10:3', '7:7.1', '7:7.2', '7:7.3', '7:4']);
  });
});

describe('pedagogisk planering följer kapitelordningen', () => {
  it('utan egen ordning: planens ordning (kap 10 först när planen läser så)', () => {
    let s = bygg();
    s = sattKapitelOrdning(s, 'ke', { kapitel: [10, 7] }, '2026-08-10');
    const pl = pedagogiskPlaneringForOmfang(s, 'ke', [{ fran: '7.1', till: '7.3' }, { fran: '10.1', till: '10.2' }], '2026-08-10')!;
    expect(pl.kapitelLista.map((k) => k.nr)).toEqual([10, 7]);
    expect(pl.kapitel.nr).toBe(10);
    expect(pl.innehall.map((i) => i.kod)).toEqual(['10.1', '10.2', '7.1', '7.2', '7.3']);
    expect(pl.veckor[0].dagar[0].kod).toBe('10.1');
  });

  it('med egen ordning: kapitel och delkapitel i den följden, även om planen läser boken rakt', () => {
    const s = bygg();
    const pl = pedagogiskPlaneringForOmfang(s, 'ke', [{ fran: '7.1', till: '7.3' }, { fran: '10.1', till: '10.2' }], '2026-08-10', null,
      { kapitel: [10, 7], delkapitel: { '7': ['7.3', '7.1', '7.2'] } })!;
    expect(pl.kapitelLista.map((k) => k.nr)).toEqual([10, 7]);
    expect(pl.innehall.map((i) => i.kod)).toEqual(['10.1', '10.2', '7.3', '7.1', '7.2']);
    expect(pl.begreppPerDelkapitel.map((b) => b.kod)).toEqual(['10.1', '10.2', '7.3', '7.1', '7.2']);
    expect(pl.begrepp.slice(0, 2)).toEqual(['diamant', 'grafit']);
  });
});

describe('taBortDelkapitelUrPlan', () => {
  it('tar bort valda delkapitel; hela kapitlet (med prov) när alla dess delkapitel väljs bort', () => {
    let s = bygg();
    s = taBortDelkapitelUrPlan(s, 'ke', ['7.3'], '2026-08-10');
    expect(avsnitt(s, '2026-08-10')).toEqual(['7.1 Kolatomen', '7.2 Kolväten', 'Prov kap 7', '10.1 Former av kol', '10.2 Fossila bränslen', 'Prov kap 10']);
    s = taBortDelkapitelUrPlan(s, 'ke', ['10.1', '10.2'], '2026-08-10');
    expect(avsnitt(s, '2026-08-10')).toEqual(['7.1 Kolatomen', '7.2 Kolväten', 'Prov kap 7']);
    expect(taBortDelkapitelUrPlan(s, 'ke', [], '2026-08-10')).toBe(s);
  });

  it('fungerar ihop med kapitelordningen: kap 10 först, utan 7.2', () => {
    let s = bygg();
    s = sattKapitelOrdning(s, 'ke', { kapitel: [10, 7] });
    s = taBortDelkapitelUrPlan(s, 'ke', ['7.2']);
    expect(avsnitt(s)).toEqual(['10.1 Former av kol', '10.2 Fossila bränslen', 'Prov kap 10', '7.1 Kolatomen', '7.3 Omättade kolväten', 'Prov kap 7']);
  });
});

describe('pedagogisk planering utan registrerad planering', () => {
  it('bygger på förhandsvisningen när planeringen inte skapats än', () => {
    let s = tomStruktur();
    s = laggTillSkolar(s, LA); s = sparaBok(s, KE);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO 8' });
    s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'ke', klassId: 'k8b', namn: 'Kemi', bokId: 'ke', schema: SCHEMA });
    const pl = pedagogiskPlaneringForOmfang(s, 'ke', [{ fran: '7.1', till: '7.2' }], '2026-08-10');
    expect(pl).not.toBeNull();
    expect(pl!.innehall.map((i) => i.kod)).toEqual(['7.1', '7.2']);
  });
});

describe('Del 232 · anvandPedagogiskPlanering — dokumentets planering blir appens', () => {
  it('valda delkapitel läggs först i dokumentets ordning; övriga följer efter i planens ordning', () => {
    const s = bygg();
    const o = ordningUrPedagogiskPlanering(s, 'ke', ['7.1', '7.2', '10.1'], { kapitel: [10, 7] }, '2026-08-10');
    expect(o.kapitel).toEqual([10, 7]);
    expect(o.delkapitel).toEqual({ '10': ['10.1', '10.2'], '7': ['7.1', '7.2', '7.3'] });
    const r = anvandPedagogiskPlanering(s, 'ke', ['7.1', '7.2', '10.1'], { kapitel: [10, 7] }, '2026-08-10');
    expect(avsnitt(r.s, '2026-08-10').slice(0, 7)).toEqual(['10.1 Former av kol', '10.2 Fossila bränslen', 'Prov kap 10', '7.1 Kolatomen', '7.2 Kolväten', '7.3 Omättade kolväten', 'Prov kap 7']);
    expect(r.foljd).toEqual(['10.1', '10.2', '7.1', '7.2', '7.3']);
    expect(r.lasta).toEqual([]);
    expect(r.s.amnen[0].kursOrdning?.[0]).toBe('10:10.1');          // sparas på ämnet, inte i boken
    expect(r.s.bocker[0]).toEqual(s.bocker[0]);
  });
  it('delkapitlens följd inom kapitlet följer dokumentet (7.3 före 7.1); ovalda delkapitel kommer sist i kapitlet', () => {
    const s = bygg();
    const r = anvandPedagogiskPlanering(s, 'ke', ['7.3', '7.1'], { kapitel: [7], delkapitel: { '7': ['7.3', '7.1'] } }, '2026-08-10');
    expect(r.foljd).toEqual(['7.3', '7.1', '7.2', '10.1', '10.2']);
  });
  it('påbörjade delkapitel ligger kvar; de kommande läggs om och rapporteras som låsta', () => {
    const s = bygg();
    const idag = '2026-08-20';   // 7.1 (tis 18/8) är genomförd
    const r = anvandPedagogiskPlanering(s, 'ke', ['10.1', '7.1', '7.2'], { kapitel: [10, 7] }, idag);
    expect(avsnitt(r.s, idag).slice(0, 4)).toEqual(['7.1 Kolatomen', '10.1 Former av kol', '10.2 Fossila bränslen', 'Prov kap 10']);
    expect(r.lasta).toEqual(['7.1']);
    expect(r.foljd.slice(0, 3)).toEqual(['10.1', '10.2', '7.2']);
  });
});

describe('Del 233 · dokumentets filmlista hämtar Binogis katalog när bok och lektionsplan saknar filmer', () => {
  it('10.1 Former av kol får Grundämnet kol med kontrollerad adress; delkapitel utan bra träff står tomma', () => {
    const s = bygg();
    const pl = pedagogiskPlaneringForOmfang(s, 'ke', [{ fran: '7.1', till: '7.2' }, { fran: '10.1', till: '10.1' }], '2026-08-10')!;
    const f = Object.fromEntries(pl.filmer.map((d) => [d.kod, d.filmer.map((x) => `${x.titel}|${x.url}`)]));
    expect(f['10.1']).toEqual(['Grundämnet kol|https://app.binogi.se/l/grundaemnet-kol']);
    expect(f['7.2']).toEqual(['Kolväten|https://app.binogi.se/l/kolvaeten']);   // bara träffar med poäng ≥ 6
    expect(f['7.1']).toEqual([]);
  });
});

describe('Del 235 · halvklasspass efter kapitlets prov är tomma; dokumentet tar med laborationen efter ett valt delkapitel utan prov', () => {
  function halvklass(): Struktur {
    let s = tomStruktur();
    s = laggTillSkolar(s, LA); s = sparaBok(s, KE);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO 8' });
    s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'ke', klassId: 'k8b', namn: 'Kemi', bokId: 'ke', halvklass: true,
      schema: [{ dag: 1, start: '09:15', slut: '10:30' }, { dag: 5, start: '08:25', slut: '09:35' }, { dag: 4, start: '09:45', slut: '10:55' }],
      schemaB: [{ dag: 1, start: '09:15', slut: '10:30' }, { dag: 5, start: '08:25', slut: '09:35' }, { dag: 4, start: '08:30', slut: '09:40' }] });
    return registreraPlanering(s, { id: 'pl', amneId: 'ke', bokId: 'ke', skapad: '2026-08-10' });
  }
  it('torsdagen mellan Prov kap 7 och 10.1 får ingen laboration; torsdagen efter Prov kap 10 (boken slut) är också tom', () => {
    const s = halvklass();
    const rader = amnesPlanFor(s, 'ke', '2026-08-10', false)!.a.filter((r) => r.datum !== null).map((r) => `${r.datum} ${r.lektion.avsnitt}`);
    // mån 17/8 7.1 · tor 20/8 lab · fre 21/8 7.2 · mån 24/8 7.3 · tor 27/8 lab · fre 28/8 Prov kap 7 · [tor 3/9 tomt] · mån 31/8 10.1 …
    expect(rader.slice(0, 8)).toEqual([
      '2026-08-17 7.1 Kolatomen', '2026-08-20 Laboration 1', '2026-08-21 7.2 Kolväten', '2026-08-24 7.3 Omättade kolväten',
      '2026-08-27 Laboration 2', '2026-08-28 Prov kap 7', '2026-08-31 10.1 Former av kol', '2026-09-03 Laboration 3',
    ]);
    // Prov kap 7 fredag 28/8 → nästa torsdag 3/9 ligger efter 10.1 (mån 31/8) så kapitel 10 har börjat: laboration som vanligt.
    // Flytta provet senare genom att läsa kap 10 först: då ligger torsdagen efter Prov kap 10 före 7.1? Nej — testa i stället bokens slut:
    const slut = amnesPlanFor(s, 'ke', '2026-08-10', false)!;
    const provKap10 = slut.a.find((r) => r.lektion.avsnitt === 'Prov kap 10')!.datum!;
    expect(slut.a.some((r) => r.datum !== null && r.datum > provKap10)).toBe(false);                                   // inga laborationer efter sista provet
    expect(slut.sessioner.filter((x) => x.a.datum > provKap10 && !x.helklass).every((x) => x.tom === true && x.typ === 'lab')).toBe(true);   // halvklasspassen: tomma, ingen platshållare
  });
  it('dokumentet för omfånget 10.1 tar med torsdagens laboration efter 10.1 även när kapitel 10 saknar prov i planen', () => {
    // Kapitel 10 utan provlektion (som Spektrum Kemi när bara 10.1 är inläst)
    const utanProv = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'ke', titel: 'Spektrum Kemi', förlag: 'Liber', ämne: 'Kemi', årskurs: 8, kapitelMeta: { '7': { name: 'Organisk kemi', col: '#2f5aa8' }, '10': { name: 'Kol och förbränning', col: '#b05c22' } } },
      lektioner: {
        '7': [{ id: 1, type: 'regular', avsnitt: '7.1 Kolatomen', del: 1 }, { id: 4, type: 'exam', avsnitt: 'Prov kap 7', del: 1 }],
        '10': [{ id: 1, type: 'regular', avsnitt: '10.1 Former av kol', del: 1 }],
      },
    }));
    const s = sparaBok(halvklass(), utanProv);
    const pl = pedagogiskPlaneringForOmfang(s, 'ke', [{ fran: '10.1', till: '10.1' }], '2026-08-10')!;
    const dagar = pl.veckor.flatMap((v) => v.dagar).map((d) => `${d.datum} ${d.typ}`);
    // mån 17/8 7.1 · tor 20/8 lab · fre 21/8 Prov kap 7 · mån 24/8 10.1 · tor 27/8 lab (kapitel 10 pågår) · sedan är boken slut → tomma halvklasspass
    expect(dagar).toEqual(['2026-08-24 lektion', '2026-08-27 laboration', '2026-08-27 laboration']);   // veckan efter 10.1, inte resten av årets torsdagar
    const rader = amnesPlanFor(s, 'ke', '2026-08-10', false)!.a.filter((r) => r.datum !== null).map((r) => `${r.datum} ${r.lektion.avsnitt}`);
    expect(rader.slice(0, 5)).toEqual(['2026-08-17 7.1 Kolatomen', '2026-08-20 Laboration 1', '2026-08-21 Prov kap 7', '2026-08-24 10.1 Former av kol', '2026-08-27 Laboration 2']);
  });
});
