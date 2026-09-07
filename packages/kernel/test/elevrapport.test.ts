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

describe('Del 67: etiketter, normerad spridning, klusterkurvor, borttagning', async () => {
  const { kapitelEtikett, tillfalleEtiketter, normeraBand, normeradSpridning, klusterKurvor, provTillfallen } = await import('../src/domain/dashboard.js');
  const { taBortFil, rensaResultat, registreraFil } = await import('../src/domain/resultat.js');

  it('kapitelEtikett ur rum eller provnamn', () => {
    expect(kapitelEtikett('x', 'Biologi41')).toBe('Kap 4.1');
    expect(kapitelEtikett('x', 'Biologi4123')).toBe('Kap 4.1–3');
    expect(kapitelEtikett('Quiz 1.2a', 'Matte8B')).toBe('Kap 1.2');
    expect(kapitelEtikett('Fotosyntes')).toBe('Fotosyntes');
  });

  it('tillfalleEtiketter: rad 3 är hela provnamnet (kortformen är kapitelkoden)', async () => {
    const { tillfalleKortEtikett } = await import('../src/domain/dashboard.js');
    const t = provTillfallen(bygg(), { klassId: 'k', amneId: 'bi' });
    expect(tillfalleEtiketter(t[0])).toEqual(['v34', 'Tor 20/8', 'Biologi 4.1 Begrepp (Biologi41)']);
    expect(tillfalleKortEtikett(t[0])).toBe('Kap 4.1');
    const kum = t.find((x) => x.rum === 'Biologi412')!;
    expect(tillfalleEtiketter(kum)).toEqual(['v35', 'Må 24/8', '4.1-4.2 Begrepp (Biologi412)']);
    expect(tillfalleKortEtikett(kum)).toBe('Kap 4.1–2');
  });

  it('normeraBand: 20 band om 3 procentenheter, utanför ±30 hamnar i kanten', () => {
    const b = normeraBand([70, 71, 73, 100, 10], 70);
    expect(b).toHaveLength(20);
    expect(b[10]).toBeCloseTo(0.4); // [0,3): 70, 71
    expect(b[11]).toBeCloseTo(0.2); // [3,6): 73
    expect(b[19]).toBeCloseTo(0.2); // +30 → yttersta
    expect(b[0]).toBeCloseTo(0.2);  // −60 → yttersta
    expect(normeraBand([], 50).every((x) => x === 0)).toBe(true);
  });

  it('normeradSpridning och klusterKurvor följer klassens tillfällen', () => {
    const f = { klassId: 'k', amneId: 'bi' };
    const n = normeradSpridning(bygg(), f);
    expect(n).toHaveLength(4);
    expect(n[0].band.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const kk = klusterKurvor(bygg(), f);
    expect(kk.map((k) => k.kluster)).toEqual(['stigande', 'stabil', 'riskzon', 'ojamn']);
    expect(kk.every((k) => k.index.length === 4 && k.band.length === 4)).toBe(true);
    const medElever = kk.filter((k) => k.antal > 0);
    expect(medElever.length).toBeGreaterThan(0);
    for (const k of medElever) expect(k.index.some((i) => i !== null)).toBe(true);
  });

  it('taBortFil tar bort filens resultat; rensaResultat tömmer klassen/ämnet', () => {
    let s = registreraFil(bygg(), { amneId: 'bi', filnamn: 'exit41.xlsx', importerad: '2026-08-20T10:00:00Z', kalla: 'socrative-exit', prov: 'Biologi 4.1 Begrepp', rum: 'Biologi41', traffar: 3 });
    const filId = s.filregister![0].id;
    const fore = s.resultat!.length;
    s = taBortFil(s, filId);
    expect(s.filregister).toHaveLength(0);
    expect(s.resultat).toHaveLength(fore - 3);
    expect(s.resultat!.some((r) => r.prov === 'Biologi 4.1 Begrepp')).toBe(false);
    expect(provTillfallen(rensaResultat(s, 'k'), { klassId: 'k' })).toEqual([]);
  });
});

describe('Del 89: kumulativa provnamn täcker alla delkapitel', async () => {
  const { koderForProv } = await import('../src/domain/elevrapport.js');
  it('intervall i quiznamnet expanderas', () => {
    expect(koderForProv('Biologi 4.1 Begrepp')).toEqual(['4.1']);
    expect(koderForProv('Bi 4.1-4.3 Begrepp')).toEqual(['4.1', '4.2', '4.3']);
    expect(koderForProv('4.1 - 4.4 begrepp')).toEqual(['4.1', '4.2', '4.3', '4.4']);
    expect(koderForProv('4.1–4.2 Begrepp')).toEqual(['4.1', '4.2']);
    expect(koderForProv('Kap 4.2 och 4.4 blandat')).toEqual(['4.2', '4.4']);
    // Rummet vinner när det bär koderna
    expect(koderForProv('vad som helst', 'Biologi412')).toEqual(['4.1', '4.2']);
    // Klassrummet säger inget → quiznamnet gäller
    expect(koderForProv('Bi 4.1-4.3 Begrepp', 'BIOLOGI8BB')).toEqual(['4.1', '4.2', '4.3']);
    expect(koderForProv('Fotosyntes')).toEqual([]);
  });

  it('ett kumulativt läxförhör räknas som test av alla ingående delkapitel', () => {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Bi 4.1-4.3 Begrepp', datum: '2026-09-04', rum: 'BIOLOGI8BB',
      rader: [{ namn: 'Anna Berg', poang: 10, maxPoang: 10 }] }).s;
    const r = elevrapport(s, 'a', 'bi');
    // 4.3 var 'ej-testat' innan; nu klarat via det kumulativa förhöret
    expect(r.kapitel[0].delkapitel.map((d) => `${d.kod}:${d.status}`)).toEqual(['4.1:klarat', '4.2:klarat', '4.3:klarat']);
    expect(r.kapitel[0].delkapitel[2].senaste.map((x) => x.prov)).toEqual(['Bi 4.1-4.3 Begrepp']);
  });
});

describe('Del 94: begreppet bakom frågetexten', async () => {
  const { begreppForFraga } = await import('../src/domain/elevrapport.js');
  const F = {
    biotop: 'En naturtyp med vissa typiska djur- och växtsamhällen.',
    nisch: 'Det utrymme, exempelvis mellan höga och låga temperaturer, där en organism har de bästa förutsättningarna att överleva och utvecklas.',
    ekologi: 'Vetenskapen om hur organismer samspelar med varandra och sin omgivning.',
  };
  it('exakt text, skiljetecken och skiftläge spelar ingen roll', () => {
    expect(begreppForFraga(F, 'En naturtyp med vissa typiska djur- och växtsamhällen.')).toBe('biotop');
    expect(begreppForFraga(F, 'EN NATURTYP MED VISSA TYPISKA DJUR- OCH VÄXTSAMHÄLLEN')).toBe('biotop');
  });
  it('nedkortad fråga matchar på början', () => {
    expect(begreppForFraga(F, 'Det utrymme, exempelvis mellan höga och låga…')).toBe('nisch');
  });
  it('quiztext med tappade bokstäver matchar på ordöverlappning', () => {
    expect(begreppForFraga(F, 'Vetenskapen om hur organismer samspelar med varandra och sin omgivning')).toBe('ekologi');
  });
  it('okänd text ger null', () => {
    expect(begreppForFraga(F, 'Vad är summan av 2 och 3?')).toBeNull();
    expect(begreppForFraga({}, 'vad som helst')).toBeNull();
    expect(begreppForFraga(F, '')).toBeNull();
  });
});
