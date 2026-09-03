import { describe, expect, it } from 'vitest';
import { bokFromBiologiImport } from '../src/domain/biologibok.js';
import { delkapitelForResultat, elevrapport, elevrapportText, tolkaRumKoder } from '../src/domain/elevrapport.js';
import { klassSpridning, spridningsOpacitet } from '../src/domain/dashboard.js';
import { importeraResultat } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const NOBOK = JSON.stringify({
  id: 'spektrum-biologi', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
  kapitel: [{
    nummer: 4, titel: 'Ekologi', sidor: 's. 80–120', mal: ['Förstå ekosystem'],
    delkapitel: [
      { nummer: '4.1', titel: 'Liv i samspel', sidor: 's. 82', begrepp: ['ekosystem', 'population'], extraBegrepp: [], genomgangLank: 'https://app.binogi.se/l/ekosystem',
        forklaringar: { ekosystem: 'Alla organismer i ett område och miljön de lever i.', population: 'Alla individer av en art i ett område.' } },
      { nummer: '4.2', titel: 'Energi och materia', sidor: 's. 88', begrepp: ['näringskedja', 'producent'], extraBegrepp: [], forklaringar: { producent: 'Organism som gör sin egen näring, t.ex. växter.' } },
      { nummer: '4.3', titel: 'Känsliga system', sidor: 's. 94', begrepp: ['övergödning'], extraBegrepp: [] },
    ],
    sammanfattning: { sidor: 's. 118' }, finalen: { sidor: 's. 119', antalUppgifter: 20 },
  }],
});

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = sparaBok(s, bokFromBiologiImport(NOBOK));
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'spektrum-biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
  s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
  const rad = (namn: string, p: number) => ({ namn, poang: p, maxPoang: 10 });
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Biologi 4.1 Begrepp', datum: '2026-08-20', rum: 'Biologi41', rader: [rad('Anna Berg', 9), rad('Omar Ali', 5), rad('Pia Provlund', 7)] }).s;
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: '4.1-4.2 Begrepp', datum: '2026-08-24', rum: 'Biologi412', rader: [rad('Anna Berg', 10), rad('Omar Ali', 8), rad('Pia Provlund', 9)] }).s;
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Biologi 4.2 Begrepp', datum: '2026-08-24', rum: 'Biologi42', rader: [rad('Anna Berg', 8), rad('Omar Ali', 9)] }).s;
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'magma', prov: 'Fotosyntes', datum: '2026-08-26', rader: [rad('Anna Berg', 6)] }).s;
  return s;
}

describe('rum/prov → delkapitel', () => {
  it('tolkar enskilda och kumulativa rum samt provnamn', () => {
    expect(tolkaRumKoder('Biologi41')).toEqual({ kapitel: 4, delar: [1] });
    expect(tolkaRumKoder('Biologi4123')).toEqual({ kapitel: 4, delar: [1, 2, 3] });
    expect(tolkaRumKoder('Matte8B')).toBeNull();
    const r = { id: 'x', elevId: 'a', kalla: 'socrative-exit' as const, prov: 'Quiz 1.2a', datum: '2026-09-01', poang: 1, maxPoang: 1 };
    expect(delkapitelForResultat(r)).toEqual(['1.2']);
    expect(delkapitelForResultat({ ...r, rum: 'Biologi412' })).toEqual(['4.1', '4.2']);
    expect(delkapitelForResultat({ ...r, prov: 'Fotosyntes' })).toEqual([]);
  });
});

describe('elevrapport', () => {
  it('Omar: 4.1 att öva (exit 50 % < 70 trots läxförhör 80 % < 90), 4.2 att öva (läxförhör 80 < 90), 4.3 ej testat', () => {
    const r = elevrapport(bygg(), 'b', 'bi');
    expect(r.bokNamn).toBe('Spektrum Biologi');
    const kap = r.kapitel[0];
    expect(kap.delkapitel.map((d) => `${d.kod}:${d.status}`)).toEqual(['4.1:ova', '4.2:ova', '4.3:ej-testat']);
    expect(kap.attOva.map((b) => b.begrepp)).toEqual(['ekosystem', 'population', 'näringskedja', 'producent']);
    expect(kap.attOva[0].forklaring).toBe('Alla organismer i ett område och miljön de lever i.');
    expect(kap.attOva[2].forklaring).toBeNull();
    expect(kap.filmer.map((f) => f.titel)).toEqual(['Genomgång 4.1 Liv i samspel']);
    expect(r.sammanfattning).toContain('behöver öva 4.1, 4.2 (4 begrepp)');
    expect(r.okopplade).toEqual([]);
  });

  it('Anna: allt klarat, Magma-testet utan delkapitel hamnar under okopplade', () => {
    const r = elevrapport(bygg(), 'a', 'bi');
    expect(r.kapitel[0].delkapitel.map((d) => d.status)).toEqual(['klarat', 'klarat', 'ej-testat']);
    expect(r.kapitel[0].attOva).toEqual([]);
    expect(r.okopplade.map((x) => x.prov)).toEqual(['Fotosyntes']);
    expect(r.sammanfattning).toContain('klarat kraven i 2 delkapitel');
  });

  it('senaste resultatet per källa avgör: Pia klarar 4.1-exit (70 %) men inte läxförhöret (90 < 90? nej, 90 ≥ 90 klarat)', () => {
    const r = elevrapport(bygg(), 'c', 'bi');
    expect(r.kapitel[0].delkapitel[0].status).toBe('klarat');
    expect(r.kapitel[0].delkapitel[1].status).toBe('klarat'); // bara läxförhöret täcker 4.2 för Pia
  });

  it('elevrapportText innehåller rubriker, begrepp och filmer', () => {
    const t = elevrapportText(elevrapport(bygg(), 'b', 'bi'));
    expect(t).toContain('Omar Ali — Biologi');
    expect(t).toContain('4.1 Liv i samspel: ✗ öva (50 %, 80 %)');
    expect(t).toContain('• producent — Organism som gör sin egen näring');
    expect(t).toContain('▶ Genomgång 4.1 Liv i samspel (4.1) https://app.binogi.se/l/ekosystem');
  });
});

describe('klassSpridning', () => {
  it('ger min/max/sd per tillfälle och opacitet som avtar linjärt från snittet', () => {
    const sp = klassSpridning(bygg(), { klassId: 'k', amneId: 'bi', kallor: ['socrative-exit'] });
    expect(sp[0]).toMatchObject({ prov: 'Biologi 4.1 Begrepp', varden: [90, 70, 50], min: 50, max: 90, snittProcent: 70, sd: 20 });
    expect(spridningsOpacitet(70, 70, 50, 90)).toBe(1);
    expect(spridningsOpacitet(90, 70, 50, 90)).toBe(0);
    expect(spridningsOpacitet(80, 70, 50, 90)).toBeCloseTo(0.5);
    // asymmetrisk: max ligger längre bort → skalan sätts av den längsta sidan
    expect(spridningsOpacitet(40, 60, 40, 100)).toBeCloseTo(0.5);
  });
});
