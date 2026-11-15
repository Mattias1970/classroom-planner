/**
 * Del 255 · Packad struktur: varje fråge-, svars- och facittext sparas en gång. Packningen är förlustfri —
 * uppackat är strukturen densamma, tecken för tecken — och svar med okänd form lämnas orörda.
 */
import { describe, expect, it } from 'vitest';
import { arPackad, packaStruktur, packaUpp, radvisJson, type PackadStruktur } from '../src/domain/packning.js';
import { importeraResultat, type FragaSvar } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const ELEVER = ['Anna Berg', 'Omar Ali', 'Li Testsson', 'Maja Provlund'];
function bygg(forhor = 3, fragor = 12): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  for (const [i, namn] of ELEVER.entries()) s = laggTillElev(s, { id: `e${i}`, klassId: 'k', namn, grupp: 'A' });
  for (let q = 0; q < forhor; q++) {
    const rader = ELEVER.map((namn, e) => {
      const svar: FragaSvar[] = Array.from({ length: fragor }, (_, j) => ({
        fraga: `Fråga ${j + 1}: ett begrepp i biologin som eleverna ska känna igen och kunna namnge med rätt ord.`,
        svar: (e + j) % 3 === 0 ? `A. • begrepp ${j}` : `B. • något annat ${j}`,
        // rätt, fel och inte rättat — och frågor både med och utan facit
        ratt: j === fragor - 1 ? null : (e + j) % 3 === 0,
        ...(j % 4 === 3 ? {} : { facit: `A. • begrepp ${j}` }),
      }));
      return { namn, poang: svar.filter((x) => x.ratt === true).length, maxPoang: fragor, svar };
    });
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: q % 2 === 0 ? 'socrative-exit' : 'socrative-laxforhor', prov: `Biologi 6.${q + 1} Begrepp`, datum: `2026-09-${String(10 + q).padStart(2, '0')}`, tid: '09:21', rum: 'BIOLOGI8BB', rader }).s;
  }
  return s;
}

describe('Del 255 · packaStruktur / packaUpp', () => {
  it('uppackat är strukturen densamma — tecken för tecken', () => {
    const s = bygg();
    const p = packaStruktur(s);
    expect(arPackad(p)).toBe(true);
    expect(arPackad(s)).toBe(false);
    expect(JSON.stringify(packaUpp(p))).toBe(JSON.stringify(s));
    expect(packaUpp(p)).toEqual(s);
    // …också efter en vända som text, så som den sparas
    expect(JSON.stringify(packaUpp(JSON.parse(JSON.stringify(p)) as PackadStruktur))).toBe(JSON.stringify(s));
  });

  it('strukturen själv rörs inte', () => {
    const s = bygg();
    const fore = JSON.stringify(s);
    packaUpp(packaStruktur(s));
    expect(JSON.stringify(s)).toBe(fore);
  });

  it('varje text sparas en gång, och frågornas ordning en gång per förhör', () => {
    const s = bygg(3, 12);
    const p = packaStruktur(s);
    expect(new Set(p.texter).size).toBe(p.texter.length);
    // 12 frågetexter + 12 rätta svar/facit + 12 andra svar — oavsett antal elever och förhör
    expect(p.texter).toHaveLength(36);
    expect(p.fragelistor).toHaveLength(1);                       // samma frågor i samma ordning i alla tre förhören
    expect(p.resultat).toHaveLength(12);
    expect(p.resultat![0].svar).toEqual({ q: 0, s: expect.any(Array), r: expect.stringMatching(/^[01-]{12}$/) });
    expect((p.resultat![0].svar as { r: string }).r.endsWith('-')).toBe(true);   // sista frågan är inte rättad
    expect(p.fragelistor[0].c.filter((c) => c === null)).toHaveLength(3);        // var fjärde fråga saknar facit
  });

  it('blir mycket mindre — och skillnaden växer med antalet elever och förhör', () => {
    const s = bygg(10, 30);
    const plain = JSON.stringify(s).length;
    const packad = JSON.stringify(packaStruktur(s)).length;
    expect(packad).toBeLessThan(plain * 0.25);
  });

  it('svar med okänd form lämnas orörda — inget går förlorat', () => {
    const s = bygg(1, 3);
    const r0 = s.resultat![0];
    const udda: Struktur = { ...s, resultat: [
      { ...r0, svar: r0.svar!.map((sv) => ({ ...sv, extra: 'något nytt' } as FragaSvar)) },     // ett fält packningen inte känner
      { ...s.resultat![1], svar: s.resultat![1].svar!.map(({ fraga, svar, ratt, facit }) => ({ ratt, fraga, svar, ...(facit !== undefined ? { facit } : {}) })) },   // annan nyckelordning
      { ...s.resultat![2], svar: [] },
      (({ svar: _svar, ...utan }) => utan)(s.resultat![3]),                                       // inga svar alls (t.ex. Magma)
    ] };
    const p = packaStruktur(udda);
    expect(p.resultat!.map((r) => Array.isArray(r.svar) || r.svar === undefined)).toEqual([true, true, true, true]);
    expect(JSON.stringify(packaUpp(p))).toBe(JSON.stringify(udda));
  });

  it('en struktur utan resultat packas och packas upp som den är', () => {
    const tom = tomStruktur();
    expect(JSON.stringify(packaUpp(packaStruktur(tom)))).toBe(JSON.stringify(tom));
    const { resultat: _r, ...utan } = bygg(1, 2);
    expect(JSON.stringify(packaUpp(packaStruktur(utan as Struktur)))).toBe(JSON.stringify(utan));
  });

  it('en skadad fil ger ett tydligt fel i stället för påhittade svar', () => {
    const p = JSON.parse(JSON.stringify(packaStruktur(bygg(1, 3)))) as PackadStruktur;
    expect(() => packaUpp({ ...p, texter: p.texter.slice(0, 2) })).toThrow(/Filen är skadad/);
    expect(() => packaUpp({ ...p, fragelistor: [] })).toThrow(/Filen är skadad/);
    expect(() => packaUpp({ ...p, resultat: [{ ...p.resultat![0], svar: { q: 0, s: [0], r: '1' } }] })).toThrow(/Filen är skadad/);
    expect(() => packaUpp({ ...p, resultat: [{ ...p.resultat![0], svar: { q: 0, s: [0, 1, 2], r: '1x0' } }] })).toThrow(/Filen är skadad/);
    expect(() => packaUpp({ ...p, texter: undefined as unknown as string[] })).toThrow(/Filen är skadad/);
  });
});

describe('Del 255 · radvisJson', () => {
  it('samma innehåll som JSON.stringify — en post per rad', () => {
    const fil = { schema: 'x', version: 3, packad: packaStruktur(bygg(2, 4)), tom: [], inget: undefined, objekt: {} };
    const text = radvisJson(fil);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(fil)));
    const rader = text.split('\n');
    expect(rader[0]).toBe('{');
    expect(rader).toContain('"schema":"x",');
    expect(rader).toContain('"resultat":[');
    // varje resultat på en egen rad
    expect(rader.filter((r) => r.startsWith('{"id":') && r.includes('"prov":"Biologi 6.1 Begrepp"'))).toHaveLength(4);
    // mycket mindre än med indrag
    expect(text.length).toBeLessThan(JSON.stringify(fil, null, 2).length * 0.6);
  });
  it('enkla värden och tomma listor skrivs som vanligt', () => {
    expect(radvisJson(3)).toBe('3');
    expect(radvisJson([])).toBe('[]');
    expect(radvisJson({})).toBe('{}');
    expect(JSON.parse(radvisJson({ a: [1, undefined, 'x'], b: { c: [{ d: 1 }] } }))).toEqual({ a: [1, null, 'x'], b: { c: [{ d: 1 }] } });
  });
});
