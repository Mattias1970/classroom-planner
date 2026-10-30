import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { byggKapitel } from '../src/domain/bok.js';
import { djupBreddFor, fragorPerDelkapitel, labMall, nivaKarta, omfangText, provlapp, provlappForOmfang, provlappText, tolkaOmfang } from '../src/domain/provlapp.js';
import { importeraResultat } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillEgenRad, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, sattLektionsplan, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur, type Bok, type Lektion, type Struktur } from '../src/domain/typer.js';

const HAR = dirname(fileURLToPath(import.meta.url));
const SPEKTRUM = bokFromValfriImport(readFileSync(join(HAR, 'fixtures', 'spektrum-biologi-kap6.json'), 'utf8'));

const TOM = { sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—' };
function lekt(id: number, typ: Lektion['typ'], avsnitt: string, del: number, extra: Partial<Lektion> = {}): Lektion {
  return { id, typ, avsnitt, del, niva1: '—', niva2: '—', niva3: '—', ...TOM, ...extra };
}
const MATTE: Bok = {
  id: 'ma-y', titel: 'Matematik Y', forlag: 'Liber', amne: 'Matematik', arskurs: 8,
  nivaer: { niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' },
  kapitel: [byggKapitel(1, 'Tal', '#123456', [
    lekt(1, 'regular', '1.1 Räkna med bråk', 1, { niva1: '1–8', niva2: '9–15', sidorTeori: 's. 8–10', mal: 'förkorta bråk\nförlänga bråk', begrepp: 'bråk, täljare', genomgang: 'Andel och bråk', ex: '2/5 av kvadraten' }),
    lekt(2, 'regular', '1.1 Räkna med bråk', 2, { niva2: '16–22', niva3: '23–30', sidorTeori: 's. 11–13', mal: 'förlänga bråk\njämföra bråk' }),
    lekt(3, 'regular', '1.2 Potenser', 1, { niva1: '31–36', niva2: '37–42', sidorTeori: 's. 14–16', begrepp: 'potens, bas, exponent' }),
    lekt(4, 'regular', '1.2 Potenser', 2, { niva2: '43–48', niva3: '49–55', sidorTeori: 's. 17–18' }),
    lekt(5, 'repetition', 'Blandade uppgifter', 1, { niva1: '56–63', niva2: '64–70', niva3: '71–78', sidorTeori: 's. 19–21', mal: 'Repetera hela kapitlet inför diagnosen.' }),
    lekt(6, 'repetition', 'Träna Taluppfattning', 1, { niva1: '1–20', sidorTeori: 's. 22–23' }),
    lekt(7, 'review', 'Sammanfattning', 1, { sidorTeori: 's. 24' }),
  ])],
};
MATTE.kapitel[0].resurser.forklaringar = { 'Bråk': 'Ett tal skrivet som täljare över nämnare.', potens: '4³ = 4 · 4 · 4' };
MATTE.kapitel[0].mal = ['räkna med bråk', 'potenser och tiopotenser'];

function bygg(bok: Bok, amneNamn: string): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: amneNamn, bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 5, start: '10:00', slut: '11:00' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-09-10' });
}

describe('Del 151 · Provlappen ur planeringen', () => {
  it('översätter bokens nivåer: ETT/TVÅ/TRE → E/C/A, Grön/Blå/Röd → E = Grön + Blå, C = Röd', () => {
    expect(nivaKarta({ niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' })).toEqual({ karta: { E: [1], C: [2], A: [3] }, text: { E: 'ETT', C: 'TVÅ', A: 'TRE och fördjupning' } });
    expect(nivaKarta({ niva1: 'Grön', niva2: 'Blå', niva3: 'Röd' })).toEqual({ karta: { E: [1, 2], C: [3], A: [3] }, text: { E: 'Grön + Blå', C: 'Röd', A: 'Röd och fördjupning' } });
  });

  it('Matematik Y: mål och uppgifter per avsnitt, begrepp med förklaringar, övningar per E/C/A och lärarens notis', () => {
    let s = laggTillEgenRad(bygg(MATTE, 'Matematik'), 'am', { id: 'er1', position: 7, rubrik: 'Prov kapitel 1', typ: 'prov' }, '2026-09-14');
    s = sattLektionsplan(s, { id: 'lp7', amneId: 'am', lektionsIndex: 7, provlappNotis: 'Miniräknare tillåten på del 2.' });
    expect(provlapp(s, 'am', 0, '2026-09-14')).toBeNull();              // inte ett prov
    const p = provlapp(s, 'am', 7, '2026-09-14')!;
    expect(p).toMatchObject({ amne: 'Matematik', klass: '8B', bok: 'Matematik Y', kapitelNr: 1, kapitelNamn: 'Tal', provNamn: 'Prov kapitel 1', provDatum: '2026-10-09', provVecka: 41, notis: 'Miniräknare tillåten på del 2.' });
    expect(p.kapitelMal).toEqual(['räkna med bråk', 'potenser och tiopotenser']);
    expect(p.avsnitt.map((a) => [a.rubrik, a.typ])).toEqual([['1.1 Räkna med bråk', 'delkapitel'], ['1.2 Potenser', 'delkapitel'], ['Blandade uppgifter', 'blandade'], ['Träna Taluppfattning', 'trana'], ['Sammanfattning', 'sammanfattning']]);
    const d11 = p.avsnitt[0];
    expect(d11.mal).toEqual(['förkorta bråk', 'förlänga bråk', 'jämföra bråk']);
    expect(d11.uppgifter).toEqual({ niva1: '1–8', niva2: '9–22', niva3: '23–30' });   // 9–15 och 16–22 slås ihop
    expect(d11.genomgang).toEqual(['Andel och bråk']); expect(d11.exempel).toEqual(['2/5 av kvadraten']);
    expect(p.begrepp).toEqual([
      { begrepp: 'bråk', forklaring: 'Ett tal skrivet som täljare över nämnare.' }, { begrepp: 'täljare', forklaring: null },
      { begrepp: 'potens', forklaring: '4³ = 4 · 4 · 4' }, { begrepp: 'bas', forklaring: null }, { begrepp: 'exponent', forklaring: null },
    ]);
    expect(p.ovningar.E).toEqual([
      { avsnitt: '1.1 Räkna med bråk', uppgifter: 'ETT 1–8 (s. 8–13)' }, { avsnitt: '1.2 Potenser', uppgifter: 'ETT 31–36 (s. 14–18)' },
      { avsnitt: 'Blandade uppgifter', uppgifter: 'ETT 56–63 (s. 19–21)' }, { avsnitt: 'Träna Taluppfattning', uppgifter: 'ETT 1–20 (s. 22–23)' },
      { avsnitt: 'Sammanfattning', uppgifter: 's. 24' },
    ]);
    expect(p.ovningar.C).toEqual([
      { avsnitt: '1.1 Räkna med bråk', uppgifter: 'TVÅ 9–22 (s. 8–13)' }, { avsnitt: '1.2 Potenser', uppgifter: 'TVÅ 37–48 (s. 14–18)' },
      { avsnitt: 'Blandade uppgifter', uppgifter: 'TVÅ 64–70 (s. 19–21)' },
    ]);
    expect(p.ovningar.A).toEqual([
      { avsnitt: '1.1 Räkna med bråk', uppgifter: 'TRE 23–30 (s. 8–13)' }, { avsnitt: '1.2 Potenser', uppgifter: 'TRE 49–55 (s. 14–18)' },
      { avsnitt: 'Blandade uppgifter', uppgifter: 'TRE 71–78 (s. 19–21)' },
    ]);
    expect(p.repetitionSidor).toEqual(['Sammanfattning s. 24']);
    const text = provlappText(p);
    expect(text).toContain('PROVLAPP · Matematik 8B · Matematik Y');
    expect(text).toContain('Prov: Prov kapitel 1 · 2026-10-09 (v. 41)');
    expect(text).toContain('• bråk – Ett tal skrivet som täljare över nämnare.');
    expect(text).toContain('E-nivå\n  • 1.1 Räkna med bråk: ETT 1–8 (s. 8–13)');
    expect(text).toContain('Miniräknare tillåten på del 2.');
  });

  it('Spektrum (utan nivåer): delkapitlens mål och begrepp, Testa dig själv som E-övning', () => {
    const s = bygg(SPEKTRUM, 'Biologi');
    const ap = s; const idx = 8; // PROV efter 6.1–6.8
    const p = provlapp(ap, 'am', idx, '2026-09-14')!;
    expect(p).not.toBeNull();
    expect(p.provNamn).toBe('PROV');
    expect(p.avsnitt.map((a) => a.rubrik.slice(0, 3))).toEqual(['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8']);
    expect(p.avsnitt[0].begrepp).toContain('cellteorin');
    expect(p.avsnitt[0].exempel).toEqual(['Testa dig själv 6.1 · uppgift 1–7']);
    expect(p.begrepp.some((b) => b.forklaring !== null)).toBe(true);
    // Utan nivåuppgifter i boken finns inga uppgiftsintervall — övningslistorna är tomma, exemplen (Testa dig själv) står under avsnitten
    expect(p.ovningar.E).toEqual([]);
    expect(provlappText(p)).toContain('DET HÄR SKA DU KUNNA');
  });
});

describe('Del 199 · provlapp för ett omfång av delkapitel (6.1–6.5, 7.1–7.5)', () => {
  it('tolkar omfånget', () => {
    expect(tolkaOmfang('6.1-6.5, 7.1-7.5')).toEqual({ spann: [{ fran: '6.1', till: '6.5' }, { fran: '7.1', till: '7.5' }], fel: null });
    expect(tolkaOmfang('6.1 – 6.5; 7.3')).toEqual({ spann: [{ fran: '6.1', till: '6.5' }, { fran: '7.3', till: '7.3' }], fel: null });
    expect(tolkaOmfang('6.6-7.2').fel).toMatch(/inom ett kapitel/);
    expect(tolkaOmfang('6.5-6.1').fel).toMatch(/före början/);
    expect(tolkaOmfang('kap 6').fel).toMatch(/6\.1-6\.5/);
    expect(tolkaOmfang('')).toEqual({ spann: [], fel: null });
    expect(omfangText([{ fran: '6.1', till: '6.5' }, { fran: '7.3', till: '7.3' }])).toBe('6.1–6.5 · 7.3');
  });

  it('Spektrum: bara 6.1–6.5 tas med, sammanfattningen följer med, begreppen är avsnittens', () => {
    const s = bygg(SPEKTRUM, 'Biologi');
    const p = provlappForOmfang(s, 'am', [{ fran: '6.1', till: '6.5' }], { namn: 'Prov kroppen', datum: '2026-11-06', vecka: 45, notis: null }, '2026-09-14')!;
    expect(p).not.toBeNull();
    expect(p.omfang).toBe('6.1–6.5');
    expect(p.kapitel).toEqual([{ nr: 6, namn: p.kapitelNamn, mal: p.kapitelMal }]);
    expect(p.avsnitt.filter((a) => a.typ === 'delkapitel').map((a) => a.rubrik.slice(0, 3))).toEqual(['6.1', '6.2', '6.3', '6.4', '6.5']);
    expect(p.avsnitt.some((a) => a.rubrik.startsWith('6.6'))).toBe(false);
    expect(p.begrepp.map((b) => b.begrepp)).toContain('cellteorin');
    expect(p.begrepp.map((b) => b.begrepp)).not.toContain('rörben');   // 6.6
    expect(provlappText(p)).toContain('Omfattar: 6.1–6.5 (kapitel 6');
    // Okänt omfång → null
    expect(provlappForOmfang(s, 'am', [{ fran: '9.1', till: '9.2' }], { namn: 'x', datum: null, vecka: null, notis: null })).toBeNull();
  });

  it('Matematik: två kapitel i ett omfång ger båda kapitlens mål; provlektionens omfång styr provlapp()', () => {
    const BOK: Bok = { ...MATTE, id: 'ma-y2', kapitel: [MATTE.kapitel[0], byggKapitel(2, 'Geometri', '#654321', [
      lekt(1, 'regular', '2.1 Vinklar', 1, { niva1: '1–10', niva2: '11–20', sidorTeori: 's. 30–33', mal: 'mäta vinklar', begrepp: 'vinkel, grader' }),
      lekt(2, 'regular', '2.2 Area', 1, { niva1: '21–30', niva3: '31–40', sidorTeori: 's. 34–37', mal: 'räkna area' }),
      lekt(3, 'regular', '2.3 Volym', 1, { niva1: '41–50', sidorTeori: 's. 38–40' }),
    ])] };
    BOK.kapitel[1].mal = ['vinklar och area'];
    let s = laggTillEgenRad(bygg(BOK, 'Matematik'), 'am', { id: 'er1', position: 10, rubrik: 'Prov kapitel 1–2', typ: 'prov' }, '2026-09-14');
    const idx = 10;
    s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: idx, provlappOmfang: '1.2, 2.1-2.2' });
    const p = provlapp(s, 'am', idx, '2026-09-14')!;
    expect(p.omfang).toBe('1.2 · 2.1–2.2');
    expect(p.provNamn).toBe('Prov kapitel 1–2');
    expect(p.kapitel.map((k) => k.nr)).toEqual([1, 2]);
    expect(p.kapitelMal).toEqual(['räkna med bråk', 'potenser och tiopotenser', 'vinklar och area']);
    expect(p.avsnitt.map((a) => a.rubrik)).toEqual(['1.2 Potenser', 'Sammanfattning', '2.1 Vinklar', '2.2 Area']);
    expect(p.ovningar.E.map((o) => o.avsnitt)).toEqual(['1.2 Potenser', 'Sammanfattning', '2.1 Vinklar', '2.2 Area']);
    expect(p.ovningar.E[0].uppgifter).toBe('ETT 31–36 (s. 14–18)');
    expect(p.begrepp.map((b) => b.begrepp)).toEqual(['potens', 'bas', 'exponent', 'vinkel', 'grader']);
    expect(provlappText(p)).toContain('DET HÄR FÅR DU LÄRA DIG I KAPITLEN');
    // Felaktigt omfång → hela kapitlet som förut
    const s2 = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: idx, provlappOmfang: 'kap 1' });
    expect(provlapp(s2, 'am', idx, '2026-09-14')!.omfang).toBeNull();
  });
});

describe('Del 206 · Provlappen: sammanfattning, djup och bredd, E-krav och laborationsbeskrivning', () => {
  it('djupBreddFor bygger ramar ur begreppen (minst två), annars ur målet, annars null', () => {
    const d = djupBreddFor(['fotosyntes', 'klorofyll', 'glukos', 'cellandning', 'energi'], [])!;
    expect(d.kedja).toEqual(['fotosyntes', 'klorofyll', 'glukos', 'cellandning']);
    expect(d.djup).toBe('Förklara i flera led hur fotosyntes hänger ihop med energi (via klorofyll, glukos): fotosyntes → … → energi. Varje pil ska svara på varför.');
    expect(d.bredd).toBe('Ge tre olika exempel på fotosyntes och säg vad exemplen har gemensamt.');
    expect(djupBreddFor(['bråk', 'täljare'], [])!.djup).toBe('Förklara i flera led hur bråk hänger ihop med täljare: bråk → … → täljare. Varje pil ska svara på varför.');
    const m = djupBreddFor([], ['förkorta bråk'])!;
    expect(m.kedja).toEqual(['förkorta bråk']);
    expect(m.djup).toContain('orsak → följd → följd');
    expect(djupBreddFor([], [])).toBeNull();
    expect(djupBreddFor(['potens'], [])!.kedja).toEqual(['potens']);
  });

  it('labMall: tre steg, med lärarens fråga när den finns', () => {
    expect(labMall(null).map((m) => m.steg)).toEqual(['Vad söker vi?', 'Hur ser vi resultatet?', 'Koppling']);
    expect(labMall('Hur påverkar ljuset fotosyntesen?')[0].text).toBe('Frågan: Hur påverkar ljuset fotosyntesen?');
    expect(labMall(null)[0].text).toContain('Skriv frågan');
  });

  it('Matematik: inga labkrav; lärarens sammanfattning tas med per avsnitt; djup/bredd ur avsnittets begrepp', () => {
    let s = laggTillEgenRad(bygg(MATTE, 'Matematik'), 'am', { id: 'er1', position: 7, rubrik: 'Prov kapitel 1', typ: 'prov' }, '2026-09-14');
    s = sattLektionsplan(s, { id: 'lp0', amneId: 'am', lektionsIndex: 0, sammanfattning: 'Bråk är delar av en helhet.' });
    const p = provlapp(s, 'am', 7, '2026-09-14')!;
    expect(p.noAmne).toBe(false);
    expect(p.kravE).toHaveLength(2);
    expect(p.avsnitt[0].sammanfattning).toEqual(['Bråk är delar av en helhet.']);
    expect(p.avsnitt[0].djupBredd?.kedja).toEqual(['bråk', 'täljare']);
    expect(p.avsnitt[1].djupBredd?.kedja).toEqual(['potens', 'bas', 'exponent']);
    expect(p.avsnitt[2].djupBredd?.kedja).toEqual(['Repetera hela kapitlet inför diagnosen.']);  // bara mål
    const text = provlappText(p);
    expect(text).toContain('SÅ VISAR DU DJUP OCH BREDD');
    expect(text).toContain('Djup: Förklara i flera led hur bråk hänger ihop med täljare');
    expect(text).toContain('FÖR E-NIVÅ KRÄVS');
    expect(text).not.toContain('Laborationsbeskrivning');
  });

  it('Biologi: tre E-krav inkl. laborationsbeskrivning, labfrågan ur lektionsplanen tas med', () => {
    let s = bygg(SPEKTRUM, 'Biologi');
    s = laggTillEgenRad(s, 'am', { id: 'er1', position: 3, rubrik: 'Prov kap 6', typ: 'prov' }, '2026-09-14');
    s = sattLektionsplan(s, { id: 'lp1', amneId: 'am', lektionsIndex: 1, labFraga: 'Hur påverkar ljuset fotosyntesen?' });
    const p = provlapp(s, 'am', 3, '2026-09-14')!;
    expect(p.noAmne).toBe(true);
    expect(p.kravE).toHaveLength(3);
    expect(p.kravE[2]).toContain('laborationsbeskrivning');
    expect(p.avsnitt.flatMap((a) => a.labFragor)).toEqual(['Hur påverkar ljuset fotosyntesen?']);
    const text = provlappText(p);
    expect(text).toContain('Laborationsbeskrivning i tre steg:');
    expect(text).toContain('Vad söker vi? Frågan: Hur påverkar ljuset fotosyntesen?');
  });
});

describe('Del 209 · bokens sammanfattning, djup/bredd/labb-exempel och filmer per delkapitel; tolerant omfång', () => {
  const BIO = bokFromValfriImport(JSON.stringify({
    id: 'bio-209', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
    kapitel: [{ nummer: 7, titel: 'Nervsystemet', sidor: '272–303', mal: ['hur nervsystemet fungerar'], delkapitel: [
      { nummer: '7.1', titel: 'Så fungerar ditt nervsystem', sidor: '274–278', begrepp: ['nervimpuls', 'synaps', 'reflex'], extraBegrepp: [], testaDigSjalv: { sida: 278, fragor: ['Vad är en nervimpuls?'] },
        sammanfattning: 'Nervceller leder impulser över synapser.', djup: 'Förklara reflexen i flera led: känselkropp → ryggmärg → muskel.', bredd: 'Ge tre exempel på det självständiga nervsystemet.', labb: 'Reaktionstid: vad söker vi, hur ser vi resultatet, koppling.',
        filmer: [{ titel: 'Nervsystemet', url: 'https://app.binogi.se/l/nervsystemet' }, { titel: 'Nervreflexer', url: 'https://app.binogi.se/l/nervreflexer' }] },
      { nummer: '7.2', titel: 'Vår hjärnbark gör oss unika', sidor: '279–283', begrepp: ['hjärncentra', 'hippocampus'], extraBegrepp: [], testaDigSjalv: { sida: 283, fragor: [] } },
    ] }],
  }));

  it('tolkaOmfang tål "och", "till", decimalkomma och slarvfelet 6-5', () => {
    expect(tolkaOmfang('6.1 - 6-5 och 7.1 - 7.5').spann).toEqual([{ fran: '6.1', till: '6.5' }, { fran: '7.1', till: '7.5' }]);
    expect(tolkaOmfang('6,1 till 6,5 samt 7.1–7.5').spann).toEqual([{ fran: '6.1', till: '6.5' }, { fran: '7.1', till: '7.5' }]);
    expect(tolkaOmfang('6.1 & 7.3').spann).toEqual([{ fran: '6.1', till: '6.1' }, { fran: '7.3', till: '7.3' }]);
    expect(tolkaOmfang('kap 6').fel).not.toBeNull();
  });

  it('bokens fält hamnar på lappen: sammanfattning som fallback, bokens djup/bredd före ramen, labb och filmer per avsnitt', () => {
    const s = bygg(BIO, 'Biologi');
    const p = provlapp(s, 'am', 2, '2026-09-14')!;   // PROV efter 7.1–7.2 (+ PERSPEKTIV/FINALEN? – provet är sista raden)
    const a71 = p.avsnitt.find((a) => a.rubrik.startsWith('7.1'))!;
    expect(a71.sammanfattning).toEqual(['Nervceller leder impulser över synapser.']);
    expect(a71.djupBredd).toEqual({ kedja: ['nervimpuls', 'synaps', 'reflex'], djup: 'Förklara reflexen i flera led: känselkropp → ryggmärg → muskel.', bredd: 'Ge tre exempel på det självständiga nervsystemet.' });
    expect(a71.labb).toBe('Reaktionstid: vad söker vi, hur ser vi resultatet, koppling.');
    expect(a71.filmer).toEqual([{ titel: 'Nervsystemet', url: 'https://app.binogi.se/l/nervsystemet' }, { titel: 'Nervreflexer', url: 'https://app.binogi.se/l/nervreflexer' }]);
    const a72 = p.avsnitt.find((a) => a.rubrik.startsWith('7.2'))!;
    expect(a72.sammanfattning).toEqual([]);
    expect(a72.djupBredd?.djup).toContain('Förklara i flera led hur hjärncentra hänger ihop med hippocampus');   // ramen
    expect(a72.labb).toBeNull(); expect(a72.filmer).toEqual([]);
    // Lärarens egen sammanfattning går före bokens
    const s2 = sattLektionsplan(s, { id: 'lp0', amneId: 'am', lektionsIndex: 0, sammanfattning: 'Min egen.' });
    expect(provlapp(s2, 'am', 2, '2026-09-14')!.avsnitt[0].sammanfattning).toEqual(['Min egen.']);
    const text = provlappText(p);
    expect(text).toContain('Labb (E): Reaktionstid');
    expect(text).toContain('FILMER');
    expect(text).toContain('• Nervreflexer – https://app.binogi.se/l/nervreflexer');
  });
});

describe('Del 210 · begrepp från klassens läxförhör och exit tickets per delkapitel', () => {
  it('frågorna hamnar under sitt delkapitel med senaste andel rätt; under 60 % flaggas i texten', () => {
    let s = bygg(SPEKTRUM, 'Biologi');
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali' });
    const sv = (par: Array<[string, string, boolean]>) => par.map(([fraga, facit, ratt]) => ({ fraga, svar: ratt ? 'A' : 'B', ratt, facit }));
    // Läxförhör 6.1 (rum Biologi61): två frågor — cellteorin alla rätt, cellandning hälften
    s = importeraResultat(s, { klassId: 'k', amneId: 'am', kalla: 'socrative-laxforhor', prov: 'Bi 6.1 begrepp', rum: 'Biologi61', datum: '2026-09-21', rader: [
      { namn: 'Anna Berg', poang: 2, maxPoang: 2, svar: sv([['Vilket begrepp? 1', 'A • cellteorin', true], ['Vilket begrepp? 2', 'B • cellandning', true]]) },
      { namn: 'Omar Ali', poang: 1, maxPoang: 2, svar: sv([['Vilket begrepp? 1', 'A • cellteorin', true], ['Vilket begrepp? 2', 'B • cellandning', false]]) },
    ] }).s;
    // Kumulativt förhör 6.1–6.2 en vecka senare: cellandning nu alla rätt, enzym 0 %
    s = importeraResultat(s, { klassId: 'k', amneId: 'am', kalla: 'socrative-laxforhor', prov: 'Bi 6.1-6.2 begrepp', rum: 'Biologi612', datum: '2026-09-28', rader: [
      { namn: 'Anna Berg', poang: 2, maxPoang: 3, svar: sv([['Vilket begrepp? 1', 'A • cellteorin', true], ['Vilket begrepp? 2', 'B • cellandning', true], ['Vilket begrepp? 3', 'C • enzym', false]]) },
      { namn: 'Omar Ali', poang: 2, maxPoang: 3, svar: sv([['Vilket begrepp? 1', 'A • cellteorin', true], ['Vilket begrepp? 2', 'B • cellandning', true], ['Vilket begrepp? 3', 'C • enzym', false]]) },
    ] }).s;
    const per = fragorPerDelkapitel(s, 'k', 'am');
    expect(per.get('6.1')?.map((f) => [f.begrepp, f.procent, f.senast])).toEqual([['cellteorin', 100, 'Bi 6.1-6.2 begrepp'], ['cellandning', 100, 'Bi 6.1-6.2 begrepp']]);
    expect(per.get('6.2')?.map((f) => [f.begrepp, f.procent])).toEqual([['enzym', 0]]);
    const p = provlapp(s, 'am', 8, '2026-09-14')!;
    expect(p.avsnitt[0].fragor.map((f) => f.begrepp)).toEqual(['cellteorin', 'cellandning']);
    expect(p.avsnitt[1].fragor).toEqual([{ fraga: 'Vilket begrepp? 3', begrepp: 'enzym', procent: 0, senast: 'Bi 6.1-6.2 begrepp' }]);
    expect(p.avsnitt[2].fragor).toEqual([]);
    const text = provlappText(p);
    expect(text).toContain('BEGREPP FRÅN LÄXFÖRHÖR OCH EXIT TICKETS');
    expect(text).toContain('• cellandning – 100 %');
    expect(text).toContain('• enzym – 0 % ⚠');
    // Utan resultat: tomt, ingen rubrik
    expect(provlappText(provlapp(bygg(SPEKTRUM, 'Biologi'), 'am', 8, '2026-09-14')!)).not.toContain('BEGREPP FRÅN LÄXFÖRHÖR');
  });
});
