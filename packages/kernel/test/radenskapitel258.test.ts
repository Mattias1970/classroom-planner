/**
 * Del 258 · Kapitlet en planrad hör till ges av delkapitelkoden i rubriken. Ett eget kort med '2.1 …' direkt
 * efter kapitel 1 hör till kapitel 2 — förut ärvde det kapitel 1 av raden före.
 */
import { describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { amnesPlanFor, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, radensKapitel, registreraPlanering, sparaBok } from '../src/domain/struktur.js';
import { foljPlanering } from '../src/domain/planutkast.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '2': { name: 'Samband och förändring', col: '#b23a48' }, '3': { name: 'Geometri', col: '#2f5aa8' } } },
  lektioner: {
    '2': [{ id: 1, type: 'regular', avsnitt: '2.4 Procent', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.5 Förändringsfaktor', del: 1 }],
    '3': [{ id: 1, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 1 }, { id: 2, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 1 }],
  },
}));
const SCHEMA = [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }];
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'kb', tjanstId: 'tj', namn: '8B' });
  s = laggTillKlass(s, { id: 'ka', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'mb', klassId: 'kb', namn: 'Matematik', bokId: 'ma', schema: SCHEMA });
  s = laggTillAmne(s, { id: 'ma', klassId: 'ka', namn: 'Matematik', bokId: 'ma', schema: SCHEMA });
  s = registreraPlanering(s, { id: 'p1', amneId: 'mb', bokId: 'ma', skapad: '2026-08-10' });
  return registreraPlanering(s, { id: 'p2', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
}
const IDAG = '2026-08-17';

describe('Del 258 · radensKapitel', () => {
  const rad = (kapitel: number, avsnitt: string) => ({ kapitel, lektion: { avsnitt } });
  it('delkapitelkoden i rubriken avgör — när boken har kapitlet', () => {
    expect(radensKapitel(rad(2, '3.1 Omkrets och area'), [1, 2, 3])).toBe(3);
    expect(radensKapitel(rad(3, '3.1 Omkrets och area'), [1, 2, 3])).toBe(3);
    expect(radensKapitel(rad(2, '3.1 Omkrets och area · Del 2'), [1, 2, 3])).toBe(3);
  });
  it('utan kod, eller med en kod boken inte har, gäller radens eget kapitel', () => {
    expect(radensKapitel(rad(2, 'Övning'), [1, 2, 3])).toBe(2);
    expect(radensKapitel(rad(2, 'Prov kapitel 2'), [1, 2, 3])).toBe(2);
    expect(radensKapitel(rad(2, '9.4 Något annat'), [1, 2, 3])).toBe(2);
  });
});

describe('Del 258 · egna kort i en följd planering hör till sitt kapitel', () => {
  it('källans egna kort med 3.1 i rubriken hör till kapitel 3 — i källan och i klassen som följer den', () => {
    // 8B har lagt in en egen introduktionslektion till 3.1 direkt efter kapitel 2
    let s = bygg();
    s = { ...s, amnen: s.amnen.map((a) => (a.id === 'mb' ? { ...a, planFranUtkast: { namn: 'egen ordning', fran: '2026-08-18', teori: ['2:1', '2:2', 'u:intro', '3:1', '3:2'], labbar: [], egna: [{ id: 'intro', rubrik: '3.1 Omkrets och area', typ: 'lektion' as const }] } } : a)) };
    const rader = (id: string, x: Struktur) => amnesPlanFor(x, id, IDAG)!.a.map((r) => [r.lektion.avsnitt, r.kapitel, r.nyckel.startsWith('u:')]);
    const vantat = [
      ['2.4 Procent', 2, false],
      ['2.5 Förändringsfaktor', 2, false],
      ['3.1 Omkrets och area', 3, true],     // eget kort direkt efter kapitel 2 — hör till kapitel 3, inte 2
      ['3.1 Omkrets och area', 3, false],
      ['3.2 Cirkelns area', 3, false],
    ];
    expect(rader('mb', s)).toEqual(vantat);
    const u = foljPlanering(s, 'ma', 'mb', '2026-08-18', IDAG);
    expect(rader('ma', u.s)).toEqual(vantat);
  });

  it('ett eget kort utan delkapitelkod ärver kapitlet före, som förut', () => {
    let s = bygg();
    s = { ...s, amnen: s.amnen.map((a) => (a.id === 'ma' ? { ...a, planFranUtkast: { namn: 'x', fran: '2026-08-18', teori: ['2:1', 'u:ov', '2:2', '3:1', '3:2'], labbar: [], egna: [{ id: 'ov', rubrik: 'Övning', typ: 'ovning' as const }] } } : a)) };
    expect(amnesPlanFor(s, 'ma', IDAG)!.a.map((r) => [r.lektion.avsnitt, r.kapitel])).toEqual([['2.4 Procent', 2], ['Övning', 2], ['2.5 Förändringsfaktor', 2], ['3.1 Omkrets och area', 3], ['3.2 Cirkelns area', 3]]);
  });
});
