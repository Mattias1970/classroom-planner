import { describe, expect, it } from 'vitest';
import { arRatt, fragenyckel, jamforProv, trendkoll } from '../src/domain/trendkoll.js';
import { harledSvarsnyckel, tolkaSocrativeRapport } from '../src/domain/socrative.js';
import { importeraResultat, type FragaSvar } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const F1 = 'Vetenskapen om samspelet i naturen kallas?';
const F2 = 'Ett avgränsat område med växter och djur kallas?';
const F3 = 'Alla individer av en art i ett område kallas?';

function svar(par: Array<[string, string, boolean | null]>): FragaSvar[] {
  return par.map(([fraga, s, ratt]) => ({ fraga, svar: s, ratt }));
}

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  for (const [id, namn] of [['a', 'Anna Berg'], ['b', 'Omar Ali']] as const) s = laggTillElev(s, { id, klassId: 'k', namn, grupp: 'A' });
  // Biologi41 (4.1): två frågor. Anna 1 rätt, Omar 0 rätt.
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Biologi 4.1 Begrepp', datum: '2026-08-21', rum: 'Biologi41', rader: [
    { namn: 'Anna Berg', poang: 1, maxPoang: 2, svar: svar([[F1, 'ekologi', true], [F2, 'population', false]]) },
    { namn: 'Omar Ali', poang: 0, maxPoang: 2, svar: svar([[F1, 'biologi', false], [F2, 'population', false]]) },
  ] }).s;
  // Biologi412 (4.1+4.2): samma två frågor ordagrant + en ny.
  // Anna: F1 rätt→fel (glömt), F2 fel→rätt (lärt). Omar: F1 fel→rätt (lärt), F2 fel→fel.
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: '4.1-4.2 Begrepp', datum: '2026-08-28', rum: 'Biologi412', rader: [
    { namn: 'Anna Berg', poang: 2, maxPoang: 3, svar: svar([[`  ${F1.toUpperCase()}  `, 'biologi', false], [F2, 'ekosystem', true], [F3, 'population', true]]) },
    { namn: 'Omar Ali', poang: 1, maxPoang: 3, svar: svar([[F1, 'ekologi', true], [F2, 'art', false], [F3, 'flock', false]]) },
  ] }).s;
  return s;
}

describe('fragenyckel och arRatt', () => {
  it('ignorerar skiftläge, skiljetecken och mellanslag', () => {
    expect(fragenyckel('  Vad är ETT ekosystem?? ')).toBe(fragenyckel('vad är ett ekosystem'));
  });
  it('jämför svar utan alternativbokstav och bullet', () => {
    expect(arRatt('A. • ekologi', 'ekologi')).toBe(true);
    expect(arRatt('B. • biologi', 'ekologi')).toBe(false);
    expect(arRatt('', 'ekologi')).toBeNull();
    expect(arRatt('ekologi', null)).toBeNull();
  });
});

describe('harledSvarsnyckel', () => {
  it('tar facit från eleverna med full poäng', () => {
    const rader = [
      { namn: 'A', sidId: '', deltog: true, poang: 2, maxPoang: 2, svar: ['ekologi', 'ekosystem'] },
      { namn: 'B', sidId: '', deltog: true, poang: 1, maxPoang: 2, svar: ['biologi', 'ekosystem'] },
      { namn: 'C', sidId: '', deltog: false, poang: 0, maxPoang: 2, svar: ['', ''] },
    ];
    expect(harledSvarsnyckel(rader, 2)).toEqual(['ekologi', 'ekosystem']);
  });
  it('lämnar null när det står oavgjort', () => {
    const rader = [
      { namn: 'A', sidId: '', deltog: true, poang: 1, maxPoang: 2, svar: ['ekologi'] },
      { namn: 'B', sidId: '', deltog: true, poang: 1, maxPoang: 2, svar: ['biologi'] },
    ];
    expect(harledSvarsnyckel(rader, 1)).toEqual([null]);
  });
  it('rapportparsern plockar frågor och nyckel', () => {
    const rapport = tolkaSocrativeRapport([
      ['Biologi 4.1 Begrepp'], [], ['BIOLOGI41'],
      ['Presence', 'Student Name', 'Student ID', 'Score (%)', 'Score (#)', F1, F2],
      [null, null, null, null, 2, '1 point', '1 point'],
      ['Yes', 'Berg, Anna', 'ANNA', '100', 2, 'A. • ekologi', 'B. • ekosystem'],
      ['Yes', 'Ali, Omar', 'OMAR', '50', 1, 'C. • biologi', 'B. • ekosystem'],
    ]);
    expect(rapport.fragor).toEqual([F1, F2]);
    expect(rapport.nyckel).toEqual(['A. • ekologi', 'B. • ekosystem']);
    expect(rapport.rader[1].svar).toEqual(['C. • biologi', 'B. • ekosystem']);
  });
});

describe('jamforProv', () => {
  it('räknar fel→rätt och rätt→fel på de gemensamma frågorna', () => {
    const s = bygg();
    const fore = s.resultat!.filter((r) => r.rum === 'Biologi41');
    const efter = s.resultat!.filter((r) => r.rum === 'Biologi412');
    const p = jamforProv(fore, efter, s.elever)!;
    expect(p.gemensamma).toBe(2); // F3 är ny och räknas inte
    expect(p).toMatchObject({ lart: 2, glomt: 1, netto: 1 });
    const anna = p.elever.find((e) => e.elev.id === 'a')!;
    expect(anna).toMatchObject({ lart: 1, glomt: 1, netto: 0, kvarFel: 0, kvarRatt: 0 });
    expect(anna.fragor.map((f) => f.overgang)).toEqual(['glomt', 'lart']);
    const omar = p.elever.find((e) => e.elev.id === 'b')!;
    expect(omar).toMatchObject({ lart: 1, glomt: 0, kvarFel: 1, netto: 1 });
    expect(p.glomskeProcent).toBe(100); // ett svar var rätt förut, det blev fel
    expect(p.inlarningsProcent).toBe(67); // 2 av 3 fel blev rätt
  });

  it('null när proven saknar gemensamma frågor', () => {
    const s = bygg();
    const fore = s.resultat!.filter((r) => r.rum === 'Biologi41').map((r) => ({ ...r, svar: [{ fraga: 'Helt annan fråga', svar: 'x', ratt: true }] }));
    expect(jamforProv(fore, s.resultat!.filter((r) => r.rum === 'Biologi412'), s.elever)).toBeNull();
  });
});

describe('trendkoll', () => {
  it('sammanställer klass och elever och pekar ut den som glömmer mer än den lär sig', () => {
    const t = trendkoll(bygg(), { klassId: 'k', amneId: 'bi' });
    expect(t.par).toHaveLength(1);
    expect(t).toMatchObject({ lart: 2, glomt: 1, netto: 1 });
    expect(t.elever.map((e) => `${e.elev.id}:${e.omdome}:${e.netto}`)).toEqual(['a:jamn:0', 'b:lar:1']);
    expect(t.glommer).toEqual([]);
    expect(t.sammanfattning).toContain('2 svar gick från fel till rätt och 1 från rätt till fel (netto +1)');
  });

  it('utan frågedata blir det ingen jämförelse', () => {
    let s = bygg();
    s = { ...s, resultat: s.resultat!.map((r) => ({ ...r, svar: undefined })) };
    const t = trendkoll(s, { klassId: 'k' });
    expect(t.par).toEqual([]);
    expect(t.sammanfattning).toContain('kräver att samma fråga ställs igen');
  });
});

describe('Del 95: steg med datum och vilka begrepp som vändes', () => {
  it('varje jämförelse bär provnamn, datum och frågorna som gick åt vardera hållet', () => {
    const t = trendkoll(bygg(), { klassId: 'k', amneId: 'bi' });
    const anna = t.elever.find((e) => e.elev.id === 'a')!;
    expect(anna.steg).toHaveLength(1);
    expect(anna.steg[0]).toMatchObject({
      netto: 0, lart: 1, glomt: 1,
      foreProv: 'Biologi 4.1 Begrepp', foreDatum: '2026-08-21',
      prov: '4.1-4.2 Begrepp', datum: '2026-08-28',
    });
    expect(anna.steg[0].glomtFragor).toEqual([F1]);
    expect(anna.steg[0].lartFragor).toEqual([F2]);
    const omar = t.elever.find((e) => e.elev.id === 'b')!;
    expect(omar.steg[0]).toMatchObject({ lart: 1, glomt: 0 });
    expect(omar.steg[0].lartFragor).toEqual([F1]);
    expect(omar.serie).toEqual(omar.steg.map((x) => x.netto));
  });
});
