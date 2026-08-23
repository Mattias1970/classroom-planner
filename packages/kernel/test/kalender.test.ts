import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  handelserPerDatum, kalenderHandelser, manadsRutor, skolarManader, veckaRutor,
} from '../src/domain/kalender.js';
import {
  laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering,
  resetIdRaknare, sparaBok,
} from '../src/domain/struktur.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [
  { datum: '2026-08-19', typ: 'heldag', label: 'Temadag' },
] };
const BOK = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'b', titel: 'B', förlag: 'F', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#8d4a2f' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8' },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '—', två: '9–16' },
  ] },
}));

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, LA);
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k8b', namn: 'Matematik', bokId: 'b', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: 'b', skapad: 'nu' });
  return s;
}

beforeEach(resetIdRaknare);

describe('kalenderHandelser', () => {
  it('lägger ut registrerade planeringar på onsdagar med kapitelfärg', () => {
    // Temadag 2026-08-19 spärrar första onsdagen ⇒ lektionerna skjuts fram.
    const h = kalenderHandelser(bygg(), 'la');
    expect(h.map((x) => x.datum)).toEqual(['2026-08-26', '2026-09-02']);
    expect(h[0]).toMatchObject({ klassNamn: '8B', amnesNamn: 'Matematik', kapitel: 1, kapitelFarg: '#8d4a2f', avsnitt: '1.1 Bråk', vecka: 35 });
  });
  it('halvklassämne ger händelser för både Grupp A och B', () => {
    let s = bygg();
    s = laggTillAmne(s, {
      id: 'bi', klassId: 'k8b', namn: 'Biologi', halvklass: true,
      schema: [{ dag: 1, start: '10:00', slut: '11:00' }],
      schemaB: [{ dag: 4, start: '10:00', slut: '11:00' }],
    });
    s = registreraPlanering(s, { id: 'pl2', amneId: 'bi', bokId: 'b', skapad: 'nu' });
    const bio = kalenderHandelser(s, 'la').filter((x) => x.amnesNamn === 'Biologi');
    expect(bio.map((x) => `${x.datum} ${x.grupp}`)).toContain('2026-08-24 A'); // måndag v.35
    expect(bio.some((x) => x.grupp === 'B')).toBe(true);
  });
  it('okänt skolår ger inga händelser', () => {
    expect(kalenderHandelser(bygg(), 'saknas')).toEqual([]);
  });
});

describe('rutnät', () => {
  const s = bygg();
  const perDatum = handelserPerDatum(kalenderHandelser(s, 'la'));
  it('manadsRutor: hela veckor, temadag och helg markeras, händelser placeras', () => {
    const rutor = manadsRutor(2026, 7, LA, perDatum); // augusti 2026
    expect(rutor.length % 7).toBe(0);
    expect(rutor[0].dag).toBe(1); // börjar måndag
    const d19 = rutor.find((r) => r.datum === '2026-08-19')!;
    expect(d19.ledig).toBe('Temadag');
    expect(rutor.find((r) => r.datum === '2026-08-26')!.handelser).toHaveLength(1);
    expect(rutor.some((r) => r.helg && r.dag === 6)).toBe(true);
    // dagar utanför augusti är markerade
    expect(rutor.some((r) => !r.iManad)).toBe(true);
  });
  it('röda dagar markeras som lediga', () => {
    const rutor = manadsRutor(2027, 0, LA, perDatum); // januari 2027
    expect(rutor.find((r) => r.datum === '2027-01-01')!.ledig).toBe('Nyårsdagen');
  });
  it('veckaRutor ger måndag–söndag med rätt händelse', () => {
    const v = veckaRutor('2026-08-26', LA, perDatum);
    expect(v).toHaveLength(7);
    expect(v[0].dag).toBe(1);
    expect(v.find((r) => r.datum === '2026-08-26')!.handelser).toHaveLength(1);
  });
  it('skolarManader räknar upp alla månader aug 2026 – jun 2027', () => {
    const m = skolarManader(LA);
    expect(m[0]).toEqual([2026, 7]);
    expect(m[m.length - 1]).toEqual([2027, 5]);
    expect(m).toHaveLength(11);
  });
});
