import { describe, expect, it } from 'vitest';
import {
  byggSittplatser, foreslaSittplatsDatum, hittaDatum, matchaSittplatsElev, sittplatsAnalys, sparaSittplatsering, tolkaSlideRutor,
} from '../src/domain/sittplatser.js';
import { importeraResultat } from '../src/domain/resultat.js';
import { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const sp = (t: string, x: number, y: number, w = 1_000_000, h = 500_000) =>
  `<p:sp><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;

// 2 rader × 3 kolumner + rubrik med datum
const SLIDE = `<p:sld>${sp('Placering 8B 3 sep 2026', 500_000, 100_000, 6_000_000, 400_000)}
${sp('Anna', 1_000_000, 1_000_000)}${sp('Omar', 2_500_000, 1_000_000)}${sp('Pia P', 4_000_000, 1_000_000)}
${sp('Ted', 1_000_000, 2_000_000)}${sp('Kateder', 2_500_000, 2_000_000)}${sp('Elsa &amp; co', 4_000_000, 2_000_000)}</p:sld>`;

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  for (const [id, namn] of [['a', 'Anna Berg'], ['b', 'Omar Ali'], ['c', 'Pia Provlund'], ['d', 'Pia Persson'], ['e', 'Ted Testsson']] as const) {
    s = laggTillElev(s, { id, klassId: 'k', namn, grupp: 'A' });
  }
  return s;
}

describe('tolkaSlideRutor + datum', () => {
  it('läser textrutor med position, avkodar entiteter och normaliserar', () => {
    const r = tolkaSlideRutor(SLIDE);
    expect(r.map((x) => x.text)).toEqual(['Placering 8B 3 sep 2026', 'Anna', 'Omar', 'Pia P', 'Ted', 'Kateder', 'Elsa & co']);
    expect(r.every((x) => x.x >= 0 && x.x <= 1 && x.y >= 0 && x.y <= 1)).toBe(true);
  });
  it('hittaDatum klarar flera format och föreslår bild → filnamn → idag', () => {
    expect(hittaDatum('2026-09-03', '2026-09-03')).toBe('2026-09-03');
    expect(hittaDatum('Placering 3/9-2026', '2026-01-01')).toBe('2026-09-03');
    expect(hittaDatum('3.9.26', '2026-01-01')).toBe('2026-09-03');
    expect(hittaDatum('3 sep 2026', '2026-01-01')).toBe('2026-09-03');
    expect(hittaDatum('12 september', '2026-01-01')).toBe('2026-09-12');
    expect(hittaDatum('placering_20260903.pptx', '2026-01-01')).toBe('2026-09-03');
    expect(hittaDatum('Placering 8B', '2026-01-01')).toBeNull();
    expect(foreslaSittplatsDatum(tolkaSlideRutor(SLIDE), 'x.pptx', '2026-09-10')).toEqual({ datum: '2026-09-03', kalla: 'bild' });
    expect(foreslaSittplatsDatum([], 'Placering 8B 2026-08-24.pptx', '2026-09-10')).toEqual({ datum: '2026-08-24', kalla: 'filnamn' });
    expect(foreslaSittplatsDatum([], 'Placering.pptx', '2026-09-10')).toEqual({ datum: '2026-09-10', kalla: 'idag' });
  });
});

describe('byggSittplatser', () => {
  it('matchar förnamn (unikt), förnamn + initial, hoppar okända, ger rad/kolumn', () => {
    const s = grund();
    const pl = byggSittplatser(tolkaSlideRutor(SLIDE), s.elever);
    const av = (t: string) => pl.find((p) => p.text === t)!;
    expect(av('Anna')).toMatchObject({ elevId: 'a', rad: 1, kol: 0 });
    expect(av('Omar')).toMatchObject({ elevId: 'b', rad: 1, kol: 1 });
    expect(av('Pia P')).toMatchObject({ elevId: null }); // två Pia P — Provlund/Persson — tvetydigt
    expect(av('Ted')).toMatchObject({ elevId: 'e', rad: 2, kol: 0 });
    expect(av('Kateder').elevId).toBeNull();
    expect(matchaSittplatsElev('Pia Pr', s.elever)?.id).toBe('c');
    expect(matchaSittplatsElev('Provlund, Pia', s.elever)?.id).toBe('c');
  });
});

describe('sittplatsAnalys', () => {
  function medResultat(): Struktur {
    let s = grund();
    const rad = (namn: string, p: number) => ({ namn, poang: p, maxPoang: 10 });
    // Placering 1 (från 2026-08-20): Anna–Omar grannar på rad 0, Ted ensam på rad 2
    s = sparaSittplatsering(s, { id: 'p1', klassId: 'k', datum: '2026-08-20', kalla: 'p1.pptx', platser: [
      { elevId: 'a', text: 'Anna', rad: 0, kol: 0, x: 0.1, y: 0.1 }, { elevId: 'b', text: 'Omar', rad: 0, kol: 1, x: 0.3, y: 0.1 },
      { elevId: 'c', text: 'Pia', rad: 0, kol: 2, x: 0.5, y: 0.1 }, { elevId: 'e', text: 'Ted', rad: 2, kol: 0, x: 0.1, y: 0.5 },
    ] });
    // Placering 2 (från 2026-09-01): Omar flyttad bredvid Ted
    s = sparaSittplatsering(s, { id: 'p2', klassId: 'k', datum: '2026-09-01', kalla: 'p2.pptx', platser: [
      { elevId: 'a', text: 'Anna', rad: 0, kol: 0, x: 0.1, y: 0.1 }, { elevId: 'c', text: 'Pia', rad: 0, kol: 2, x: 0.5, y: 0.1 },
      { elevId: 'e', text: 'Ted', rad: 2, kol: 0, x: 0.1, y: 0.5 }, { elevId: 'b', text: 'Omar', rad: 2, kol: 1, x: 0.3, y: 0.5 },
    ] });
    s = importeraResultat(s, { klassId: 'k', kalla: 'socrative-exit', prov: 'E1', datum: '2026-08-25', rader: [rad('Anna Berg', 9), rad('Omar Ali', 8), rad('Pia Provlund', 7), rad('Ted Testsson', 3)] }).s;
    s = importeraResultat(s, { klassId: 'k', kalla: 'socrative-exit', prov: 'E2', datum: '2026-09-05', rader: [rad('Anna Berg', 9), rad('Omar Ali', 5), rad('Pia Provlund', 8), rad('Ted Testsson', 4)] }).s;
    return s;
  }

  it('giltighetstid, grannsnitt, skillnad och kluster-r', () => {
    const a = sittplatsAnalys(medResultat(), 'p1', { klassId: 'k' })!;
    expect(a.giltigTill).toBe('2026-08-31');
    expect(a.antalRader).toBe(3); expect(a.antalKolumner).toBe(3);
    const anna = a.rader.find((r) => r.elev?.id === 'a')!;
    expect(anna).toMatchObject({ snitt: 90, grannSnitt: 80, skillnad: 10 });
    expect(anna.grannar.map((g) => g.id)).toEqual(['b']);
    expect(a.rader.find((r) => r.elev?.id === 'e')!.grannSnitt).toBeNull(); // Ted ensam
    expect(a.flyttar).toEqual([]);
    expect(a.klusterR === null || (a.klusterR >= -1 && a.klusterR <= 1)).toBe(true);
  });

  it('flyttar: Omar bytte plats och tappade 30 procentenheter', () => {
    const a = sittplatsAnalys(medResultat(), 'p2', { klassId: 'k' })!;
    expect(a.giltigTill).toBeNull();
    expect(a.flyttar).toHaveLength(1);
    expect(a.flyttar[0]).toMatchObject({ elev: { id: 'b' }, fran: { rad: 0, kol: 1, snitt: 80, grannSnitt: 80 }, till: { rad: 2, kol: 1, snitt: 50, grannSnitt: 40 }, delta: -30 });
  });

  it('sparaSittplatsering validerar och ersätter samma datum', () => {
    const s = grund();
    expect(() => sparaSittplatsering(s, { id: 'x', klassId: 'finns-ej', datum: '2026-09-01', kalla: '', platser: [] })).toThrow('befintlig klass');
    expect(() => sparaSittplatsering(s, { id: 'x', klassId: 'k', datum: '1/9', kalla: '', platser: [] })).toThrow('YYYY-MM-DD');
    expect(() => sparaSittplatsering(s, { id: 'x', klassId: 'k', datum: '2026-09-01', kalla: '', platser: [{ elevId: null, text: 'Kateder', rad: 0, kol: 0, x: 0, y: 0 }] })).toThrow('knytas');
    const pl = [{ elevId: 'a', text: 'Anna', rad: 0, kol: 0, x: 0, y: 0 }];
    let t = sparaSittplatsering(s, { id: 'x', klassId: 'k', datum: '2026-09-01', kalla: 'a.pptx', platser: pl });
    t = sparaSittplatsering(t, { id: 'y', klassId: 'k', datum: '2026-09-01', kalla: 'b.pptx', platser: pl });
    expect(t.sittplatser!.map((p) => p.id)).toEqual(['y']);
  });
});
