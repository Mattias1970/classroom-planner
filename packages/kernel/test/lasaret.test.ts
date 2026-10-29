/**
 * Del 205 · Läsåret: lov/temadagar som intervall (även bakåt), tid som försvinner bakåt i tiden,
 * och NO+Tk-perioder med lärarens egna datum i stället för fyra lika block.
 */
import { describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { SKOLDAG_SLUT, SKOLDAG_START } from '../src/domain/skolar.js';
import {
  amnesOffset, amnesPlanFor, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillSkolarDagar, laggTillTjanst, noBudget, noFonster, noPeriodFor,
  registreraPlanering, samlaSlots, sattNoPeriod, sparaBok,
} from '../src/domain/struktur.js';
import { laggTillSchemaPeriod, taBortSchemaPeriod } from '../src/domain/planutkast.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const BOK = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'b', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [1, 2, 3, 4, 5, 6].map((id) => ({ id, type: 'regular', avsnitt: `1.${id} Del ${id}`, del: 1 })) },
}));
const IDAG = '2026-09-15';
const SCHEMA = [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '13:00', slut: '14:00' }];

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'a', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma-a', klassId: 'a', namn: 'Matematik', bokId: 'b', schema: SCHEMA });
  return registreraPlanering(s, { id: 'pa', amneId: 'ma-a', bokId: 'b', skapad: '2026-08-10' });
}
const rad = (s: Struktur, id = 'ma-a') => amnesPlanFor(s, id, IDAG)!.a.filter((r) => r.datum !== null).map((r) => `${r.datum!.slice(5)}:${r.nyckel}`);
const la = (s: Struktur) => s.skolar[0];

describe('Del 205 · lov och temadagar som intervall', () => {
  it('ett intervall blir en post per vardag; helger hoppas; halvdag får sluttid', () => {
    const s = laggTillSkolarDagar(grund(), 'la', { fran: '2026-10-23', till: '2026-10-27', typ: 'lov', label: 'Höstlov' });
    expect(la(s).dagar.map((d) => d.datum)).toEqual(['2026-10-23', '2026-10-26', '2026-10-27']);
    expect(la(s).dagar[0]).toMatchObject({ typ: 'lov', label: 'Höstlov' });
    const h = laggTillSkolarDagar(s, 'la', { fran: '2026-12-18', till: '2026-12-18', typ: 'halvdag', label: 'Julavslutning', slut: '12:00' });
    expect(h.skolar[0].dagar.find((d) => d.datum === '2026-12-18')).toMatchObject({ typ: 'halvdag', slut: '12:00' });
    expect(h.skolar[0].dagar.map((d) => d.datum)).toEqual(['2026-10-23', '2026-10-26', '2026-10-27', '2026-12-18']); // sorterat
  });

  it('bakåt i tiden: lektioner som låg på dagarna flyttas — även genomförda', () => {
    const s = grund();
    expect(rad(s).slice(0, 4)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:1:4']);
    const t = laggTillSkolarDagar(s, 'la', { fran: '2026-08-18', till: '2026-08-21', typ: 'heldag', label: 'Uppstartsdagar' });
    expect(rad(t).slice(0, 4)).toEqual(['08-25:1:1', '08-27:1:2', '09-01:1:3', '09-03:1:4']);
  });

  it('validering', () => {
    const s = grund();
    expect(() => laggTillSkolarDagar(s, 'la', { fran: '2026-10-27', till: '2026-10-23', typ: 'lov', label: 'x' })).toThrow(/före startdatumet/);
    expect(() => laggTillSkolarDagar(s, 'la', { fran: '2026-10-24', till: '2026-10-25', typ: 'lov', label: 'x' })).toThrow(/Inga vardagar/);
    expect(() => laggTillSkolarDagar(s, 'la', { fran: '2026-10-23', till: '2026-10-23', typ: 'lov', label: ' ' })).toThrow(/namn/);
    expect(() => laggTillSkolarDagar(s, 'la', { fran: '2026-10-23', till: '2026-10-23', typ: 'halvdag', label: 'x' })).toThrow(/TT:MM/);
    expect(() => laggTillSkolarDagar(s, 'fel', { fran: '2026-10-23', till: '2026-10-23', typ: 'lov', label: 'x' })).toThrow(/Okänt skolår/);
  });
});

describe('Del 205 · tid som försvinner — bakåt i tiden med tillatGenomford', () => {
  it('utan flaggan avvisas datum som varit; med flaggan läggs perioden och tas bort i sin helhet', () => {
    const s = grund();
    const p = { fran: '2026-08-18', till: '2026-08-21', start: SKOLDAG_START, slut: SKOLDAG_SLUT, label: 'Lägerskola' };
    expect(() => laggTillSchemaPeriod(s, 'la', p, IDAG)).toThrow(/redan varit/);
    const r = laggTillSchemaPeriod(s, 'la', p, IDAG, true);
    expect(r.dagar).toHaveLength(4);
    expect(rad(r.s).slice(0, 3)).toEqual(['08-25:1:1', '08-27:1:2', '09-01:1:3']);
    const b = taBortSchemaPeriod(r.s, 'la', r.grupp, IDAG, true);
    expect(b).toMatchObject({ borttagna: 4, kvar: 0 });
    expect(rad(b.s)).toEqual(rad(s));
  });
});

describe('Del 205 · NO+Tk-perioder', () => {
  function no(): Struktur {
    let s = grund();
    s = laggTillAmne(s, { id: 'bi', klassId: 'a', namn: 'Biologi', bokId: 'b', schema: SCHEMA, noGrupp: 'no', noOrder: 0 });
    s = laggTillAmne(s, { id: 'fy', klassId: 'a', namn: 'Fysik', bokId: 'b', schema: SCHEMA, noGrupp: 'no', noOrder: 1 });
    s = registreraPlanering(s, { id: 'pbi', amneId: 'bi', bokId: 'b', skapad: '2026-08-10' });
    return registreraPlanering(s, { id: 'pfy', amneId: 'fy', bokId: 'b', skapad: '2026-08-10' });
  }
  const amne = (s: Struktur, id: string) => s.amnen.find((a) => a.id === id)!;

  it('utan egen period: fyra lika block som förut', () => {
    const s = no();
    const budget = noBudget(la(s), SCHEMA);
    expect(noFonster(la(s), amne(s, 'bi'))).toEqual({ offset: 0, budget });
    expect(noFonster(la(s), amne(s, 'fy'))).toEqual({ offset: budget, budget });
    expect(amnesOffset(la(s), amne(s, 'fy'))).toBe(budget);
    expect(noFonster(la(s), amne(s, 'ma-a'))).toEqual({ offset: 0, budget: Number.POSITIVE_INFINITY });
    const p = noPeriodFor(la(s), amne(s, 'bi'))!;
    expect(p.egen).toBe(false);
    expect(p.fran).toBe('2026-08-18');
    expect(rad(s, 'fy')[0].startsWith('08-')).toBe(false);
  });

  it('egen period: passen mellan datumen, offset före; lektionerna läggs om — även bakåt; null återställer', () => {
    let s = no();
    s = sattNoPeriod(s, 'fy', { fran: '2026-08-17', till: '2026-09-30' });
    const slots = samlaSlots(la(s), SCHEMA, 'a');
    const inom = slots.filter((x) => x.datum >= '2026-08-17' && x.datum <= '2026-09-30').length;
    expect(noFonster(la(s), amne(s, 'fy'))).toEqual({ offset: 0, budget: inom });
    expect(rad(s, 'fy').slice(0, 2)).toEqual(['08-18:1:1', '08-20:1:2']);
    expect(noPeriodFor(la(s), amne(s, 'fy'))).toEqual({ fran: '2026-08-17', till: '2026-09-30', egen: true });
    s = sattNoPeriod(s, 'bi', { fran: '2026-10-01', till: '2026-12-18' });
    expect(noFonster(la(s), amne(s, 'bi')).offset).toBe(inom);
    expect(rad(s, 'bi')[0] >= '10-01').toBe(true);
    const t = sattNoPeriod(s, 'fy', null);
    expect(amne(t, 'fy').noPeriod).toBeUndefined();
    expect(noFonster(la(t), amne(t, 'fy'))).toEqual({ offset: noBudget(la(t), SCHEMA), budget: noBudget(la(t), SCHEMA) });
  });

  it('validering', () => {
    const s = no();
    expect(() => sattNoPeriod(s, 'ma-a', { fran: '2026-08-17', till: '2026-09-30' })).toThrow(/NO\+Tk/);
    expect(() => sattNoPeriod(s, 'fy', { fran: '2026-09-30', till: '2026-08-17' })).toThrow(/före startdatumet/);
    expect(() => sattNoPeriod(s, 'fy', { fran: '17/8', till: '2026-09-30' })).toThrow(/ÅÅÅÅ-MM-DD/);
    expect(() => sattNoPeriod(s, 'nix', null)).toThrow(/Okänt ämne/);
  });
});
