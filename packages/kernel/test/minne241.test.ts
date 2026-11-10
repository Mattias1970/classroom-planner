/**
 * Del 241 · Delade (cachade) värden: planen, passen, röda dagar och Binogi-förslagen räknas en gång och
 * återanvänds tills det de beror på byts ut. Samma svar som förut — bara inte uträknat om och om igen.
 */
import { describe, expect, it } from 'vitest';
import {
  amnesPlanFor, bokFromImport, foreslaBinogiFilmer, helgdagar, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst,
  registreraPlanering, samlaSlots, sparaBok, tomStruktur, uppdateraAmne, uppdateraSkolar, veckorapportLarm, type Struktur,
} from '../src/index.js';
import { delat, TrippelCache } from '../src/domain/minne.js';

const BOK = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } },
  lektioner: { '4': [
    { id: 1, type: 'regular', avsnitt: '4.1 Liv', del: 1, begrepp: 'ekologi, biotop' },
    { id: 2, type: 'regular', avsnitt: '4.2 Näringskedjor', del: 1, begrepp: 'näringskedja, producent' },
    { id: 3, type: 'exam', avsnitt: 'PROV', del: 1 },
  ] },
}));

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', schema: [{ dag: 1, start: '09:00', slut: '10:00' }, { dag: 4, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  return registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: 'bio', skapad: '2026-08-10' });
}

describe('Del 241 · planen räknas en gång och återanvänds tills skolår, ämne eller bok byts ut', () => {
  it('samma struktur ger samma planobjekt; en ändring någon annanstans (nya resultat) räknar inte om planen', () => {
    const s = bygg();
    const p1 = amnesPlanFor(s, 'bi', '2026-09-01')!;
    expect(amnesPlanFor(s, 'bi', '2026-09-01')).toBe(p1);
    expect(amnesPlanFor(s, 'bi', '2026-10-01')).toBe(p1);   // utan laborationer spelar `idag` ingen roll
    const s2 = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Exit 4.1', datum: '2026-08-24', rader: [{ namn: 'Anna Berg', poang: 1, maxPoang: 2 }] }).s;
    expect(s2).not.toBe(s);
    expect(amnesPlanFor(s2, 'bi', '2026-09-01')).toBe(p1);
    expect(p1.a.slice(0, 3).map((r) => [r.datum, r.lektion.avsnitt])).toEqual([['2026-08-17', '4.1 Liv'], ['2026-08-20', '4.2 Näringskedjor'], ['2026-08-24', 'PROV']]);
  });

  it('ändras ämnets schema eller skolårets dagar räknas planen om — med det nya innehållet', () => {
    const s = bygg();
    const p1 = amnesPlanFor(s, 'bi')!;
    const s2 = uppdateraAmne(s, 'bi', { schema: [{ dag: 2, start: '10:00', slut: '11:00' }] });
    const p2 = amnesPlanFor(s2, 'bi')!;
    expect(p2).not.toBe(p1);
    expect(p2.a.slice(0, 2).map((r) => r.datum)).toEqual(['2026-08-18', '2026-08-25']);
    expect(amnesPlanFor(s, 'bi')).toBe(p1);                  // den gamla strukturen har kvar sin plan
    const s3 = uppdateraSkolar(s, 'la', { dagar: [{ datum: '2026-08-17', typ: 'heldag', label: 'Uppstart' }] });
    expect(amnesPlanFor(s3, 'bi')!.a[0].datum).toBe('2026-08-20');   // första måndagen är upptagen
  });

  it('utan planering finns ingen plan (kravPlanering) — och det cachas inte fel', () => {
    let s = bygg();
    s = { ...s, planeringar: [] };
    expect(amnesPlanFor(s, 'bi')).toBeNull();
    expect(amnesPlanFor(s, 'bi', undefined, false)).not.toBeNull();
  });

  it('delade värden är frysta i testerna: den som ändrar i en cachad plan får ett fel direkt', () => {
    const p = amnesPlanFor(bygg(), 'bi')!;
    expect(Object.isFrozen(p) && Object.isFrozen(p.a) && Object.isFrozen(p.a[0])).toBe(true);
    expect(() => { (p.a as unknown[]).push({}); }).toThrow(TypeError);
    expect(() => { (p.a[0] as { datum: string | null }).datum = '2000-01-01'; }).toThrow(TypeError);
    // Map och Set lämnas ifred, och djupet är begränsat
    const x = delat({ a: { b: { c: { d: 1 } } }, m: new Map() }, 1);
    expect(Object.isFrozen(x.a)).toBe(true);
    expect(Object.isFrozen(x.a.b)).toBe(false);
  });
});

describe('Del 241 · pass, röda dagar, veckorapportlarm och Binogi-förslag', () => {
  it('passen delas per skolår, schema och klass', () => {
    const s = bygg();
    const la = s.skolar[0]; const schema = s.amnen[0].schema;
    const a = samlaSlots(la, schema, 'k');
    expect(samlaSlots(la, schema, 'k')).toBe(a);
    expect(samlaSlots(la, schema, null)).not.toBe(a);
    expect(samlaSlots(la, schema, null)).toEqual(a);          // inga aktiviteter → samma pass
    expect(samlaSlots(la, [...schema], 'k')).toEqual(a);      // ett annat schemaobjekt med samma innehåll ger samma svar
    expect(a.slice(0, 2)).toEqual([{ datum: '2026-08-17', vecka: 34, start: '09:00', slut: '10:00' }, { datum: '2026-08-20', vecka: 34, start: '09:00', slut: '10:00' }]);
    expect(a.some((x) => x.datum === '2026-12-24' || x.datum === '2027-05-06')).toBe(false);   // julafton, Kristi himmelsfärdsdag
  });

  it('röda dagar räknas en gång per år', () => {
    expect(helgdagar(2027)).toBe(helgdagar(2027));
    expect(helgdagar(2027).get('2027-05-06')).toBe('Kristi himmelsfärdsdag');
    expect(helgdagar(2026).get('2026-06-19')).toBe('Midsommarafton');
  });

  it('veckorapportlarmet ger samma svar varje gång', () => {
    const s = bygg();
    const nu = { datum: '2026-09-11', tid: '16:30' };
    const forsta = veckorapportLarm(s, nu);
    expect(veckorapportLarm(s, nu)).toEqual(forsta);
    expect(forsta.saknade.length).toBeGreaterThan(0);
  });

  it('Binogi-förslagen delas per bok och kapitel (utan egna poster)', () => {
    const a = foreslaBinogiFilmer(BOK, 4, [], 2);
    expect(foreslaBinogiFilmer(BOK, 4, [], 2)).toBe(a);
    expect(foreslaBinogiFilmer(BOK, 4, [], 4)).not.toBe(a);
    expect(a.map((d) => d.kod)).toEqual(['4.1', '4.2']);
  });

  it('TrippelCache: alla tre objekten måste vara desamma för en träff', () => {
    const c = new TrippelCache<object, object, object, number>();
    const [a, b, d] = [{}, {}, {}];
    let n = 0;
    expect(c.hamta(a, b, d, 'x', () => ++n)).toBe(1);
    expect(c.hamta(a, b, d, 'x', () => ++n)).toBe(1);
    expect(c.hamta(a, b, d, 'y', () => ++n)).toBe(2);
    expect(c.hamta(a, b, {}, 'x', () => ++n)).toBe(3);
    expect(c.hamta({}, b, d, 'x', () => ++n)).toBe(4);
  });
});
