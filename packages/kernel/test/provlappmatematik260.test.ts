/**
 * Del 260 · Provlappen i matematik följer de fem förmågorna: begrepp, metod, problemlösning, resonemang och
 * kommunikation. Regeln för E står överst; sist finns en checklista per delkapitel.
 */
import { describe, expect, it } from 'vitest';
import {
  FORMAGOR, REGEL_E, bokFromImport, formagorIFokus, laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst,
  malensFormaga, matteLapp, provlapp, provlappText, registreraPlanering, sparaBok, tomStruktur, type Struktur,
} from '../src/index.js';

const lektion = (id: number, avsnitt: string, del: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'regular', avsnitt, del, ett: '—', två: '—', tre: '—', sidor_teori: '—', begrepp: '—', soc_start: '—', exit: '—', genomgang: '—', bam_gora: '—', ex: '—', laxa: '—', ...extra,
});

/** En liten bok i bokfilens format — som Matematik Y kapitel 3, med två delkapitel och kapitlets repetitionsdelar. */
const BOKFIL = (meta: Record<string, unknown> = {}) => JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma-260', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '3': { name: 'Geometri', col: '#4a3f9f', mal: ['Metoder för beräkning av area, omkrets och volym'], ...meta } } },
  lektioner: { '3': [
    lektion(1, '3.1 Omkrets och area', 1, { ett: '1–10', två: '11–20', sidor_teori: '106–107', begrepp: 'omkrets, area', bam_gora: 'ETT/TVÅ – minst ETT (1–10, s. 108), fortsätt TVÅ (11–20, s. 109–110)',
      mal: ['Beräkna omkretsen av polygoner och cirklar (O = π · d)', 'Rita figur, teckna beräkningar och skriva ut enheter'] }),
    lektion(2, '3.1 Omkrets och area', 2, { två: '11–20', tre: '21–30', sidor_teori: '106–107', begrepp: 'area, triangel', bam_gora: 'TVÅ/TRE – minst TVÅ (11–20, s. 109–110), fortsätt TRE (21–30, s. 111)',
      mal: ['Beräkna omkretsen av polygoner och cirklar (O = π · d)', 'Resonera om hur omkrets och area ändras vid skala', 'Lösa problem med sammansatta figurer'] }),
    lektion(3, '3.2 Cirkelns area', 1, { ett: '31–36', två: '37–42', sidor_teori: '113–114', begrepp: 'cirkelns area', sidor_uppgifter: { ett: 's. 115', två: '116' }, mal: ['Beräkna en cirkels area med A = π · r²', 'Namnge cirkelns delar'] }),
    lektion(4, 'Blandade uppgifter', 1, { ett: '136–144', två: '145–153', sidor_teori: '143–144', begrepp: 'alla kapitlets begrepp', mal: ['Välja rätt formel för omkrets, area och volym'] }),
    lektion(5, 'Blandade uppgifter', 2, { två: '145–153', tre: '154–162', sidor_teori: '144–145' }),
    lektion(6, 'Diagnos', 1, { type: 'test' }),
    lektion(7, 'Träna Geometri', 1, { type: 'repetition', sidor_teori: '146–148' }),
    lektion(8, 'Utveckla Geometri', 1, { type: 'repetition', sidor_teori: '149' }),
    lektion(9, 'Förmågorna i fokus', 1, { type: 'ovaformagor', sidor_teori: '150–155', genomgang: 'Begrepp och metod (s. 150): Vad minns du? 1–12. Problemlösning (s. 151-152): fyrfältsproblem Hagen. Resonemang (s. 153): En lådas volym 1–5. Kommunikation (s. 154–155): värdera fyra lösningar.' }),
    lektion(10, 'Sammanfattning', 1, { type: 'review', sidor_teori: '156–157' }),
  ] },
});

function bygg(bokfil: string): Struktur {
  const bok = bokFromImport(bokfil);
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: 'Matematik', bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-09-10' });
  return laggTillEgenRad(s, 'am', { id: 'er1', position: 10, rubrik: 'Prov kapitel 3', typ: 'prov' }, '2026-09-14');
}

describe('Del 260 · de fem förmågorna och regeln för E', () => {
  it('förmågorna står i ordningen begrepp, metod, problemlösning, resonemang, kommunikation — var och en med krav för E, C och A', () => {
    expect(FORMAGOR.map((f) => f.namn)).toEqual(['Begrepp', 'Metod', 'Problemlösning', 'Resonemang', 'Kommunikation']);
    for (const f of FORMAGOR) for (const niva of ['E', 'C', 'A'] as const) expect(f.krav[niva].length).toBeGreaterThan(20);
    expect(REGEL_E).toContain('alla fem förmågorna på E-nivå');
    for (const namn of ['begrepp', 'metod', 'problemlösning', 'resonemang', 'kommunikation']) expect(REGEL_E).toContain(namn);
  });

  it('ett mål sorteras till en förmåga efter hur det börjar — eller med ett förled i bokfilen', () => {
    expect(malensFormaga('Beräkna en cirkels area med A = π · r²').formaga).toBe('metod');
    expect(malensFormaga('Omvandla mellan m³, dm³ och cm³').formaga).toBe('metod');
    expect(malensFormaga('Namnge geometriska kroppar').formaga).toBe('begrepp');
    expect(malensFormaga('Veta vad kapital, ränta och räntesats är').formaga).toBe('begrepp');
    expect(malensFormaga('Skilja på procent och procentenheter').formaga).toBe('begrepp');
    expect(malensFormaga('Lösa vardagsproblem med andelar (rabatt, undersökningar)').formaga).toBe('problemlosning');
    expect(malensFormaga('Välja rätt formel för omkrets, area och volym').formaga).toBe('problemlosning');
    expect(malensFormaga('Resonera om hur omkrets och area ändras vid skala').formaga).toBe('resonemang');
    expect(malensFormaga('Förklara sambanden mellan enheterna').formaga).toBe('resonemang');
    expect(malensFormaga('Avgöra vilka utvikningar som går att vika till en kub').formaga).toBe('resonemang');
    expect(malensFormaga('Rita figur, teckna beräkningar och skriva ut enheter').formaga).toBe('kommunikation');
    expect(malensFormaga('Resonemang: jämföra två lösningar')).toEqual({ formaga: 'resonemang', text: 'jämföra två lösningar' });
    expect(malensFormaga('Metod: förklara stegen i balansmetoden')).toEqual({ formaga: 'metod', text: 'förklara stegen i balansmetoden' });
  });

  it('"Förmågorna i fokus" delas upp per förmåga med sidor', () => {
    expect(formagorIFokus('Begrepp och metod (s. 150): Vad minns du? 1–12. Problemlösning (s. 151-152): Hagen. Resonemang (s. 153): En lådas volym.')).toEqual({
      begrepp: 's. 150: Vad minns du? 1–12', metod: 's. 150: Vad minns du? 1–12', problemlosning: 's. 151–152: Hagen', resonemang: 's. 153: En lådas volym',
    });
    expect(formagorIFokus('Enskilt, par, alla')).toEqual({});
  });
});

describe('Del 260 · bokfilen: sidor för uppgifterna och typiska uppgifter per förmåga', () => {
  it('uppgifternas sidor läses ur "sidor_uppgifter" eller ur gör-raden; kapitlets förmågor ur kapitelMeta', () => {
    const bok = bokFromImport(BOKFIL({ formagor: { problemlösning: { E: ['En E-uppgift'], C: 'En C-uppgift', A: ['', 'En A-uppgift'] }, okänt: { E: ['x'] } } }));
    const [d31, d32] = bok.kapitel[0].delkapitel;
    expect(d31.lektioner[0].uppgiftSidor).toEqual({ niva1: '108', niva2: '109–110' });
    expect(d31.lektioner[1].uppgiftSidor).toEqual({ niva2: '109–110', niva3: '111' });
    expect(d32.lektioner[0].uppgiftSidor).toEqual({ niva1: '115', niva2: '116' });
    expect(bok.kapitel[0].formagor).toEqual({ problemlosning: { E: ['En E-uppgift'], C: ['En C-uppgift'], A: ['En A-uppgift'] } });
    expect(bokFromImport(BOKFIL()).kapitel[0].formagor).toBeUndefined();
  });
});

describe('Del 260 · matteLapp', () => {
  it('begrepp med beskrivning och teorisida, metoder med teorisida, och målen sorterade per förmåga', () => {
    const bok = bokFromImport(BOKFIL({ forklaringar: { Omkrets: 'Sträckan runt en figur.', 'cirkelns area': 'A = π · r²' } }));
    const m = matteLapp(bok, ['3.1', '3.2']);
    expect(m.regelE).toBe(REGEL_E);
    expect(m.avsnitt.map((a) => [a.rubrik, a.teoriSidor])).toEqual([['3.1 Omkrets och area', 's. 106–107'], ['3.2 Cirkelns area', 's. 113–114']]);
    expect(m.avsnitt[0].begrepp).toEqual([
      { begrepp: 'omkrets', forklaring: 'Sträckan runt en figur.', sidor: 's. 106–107' },
      { begrepp: 'area', forklaring: null, sidor: 's. 106–107' },        // en gång, fast det står i båda lektionerna
      { begrepp: 'triangel', forklaring: null, sidor: 's. 106–107' },
    ]);
    expect(m.avsnitt[1].begrepp).toEqual([{ begrepp: 'cirkelns area', forklaring: 'A = π · r²', sidor: 's. 113–114' }]);
    expect(m.avsnitt[0].mal.metod).toEqual([{ text: 'Beräkna omkretsen av polygoner och cirklar (O = π · d)', sidor: 's. 106–107' }]);   // en gång
    expect(m.avsnitt[0].mal.kommunikation.map((x) => x.text)).toEqual(['Rita figur, teckna beräkningar och skriva ut enheter']);
    expect(m.avsnitt[0].mal.resonemang.map((x) => x.text)).toEqual(['Resonera om hur omkrets och area ändras vid skala']);
    expect(m.avsnitt[0].mal.problemlosning.map((x) => x.text)).toEqual(['Lösa problem med sammansatta figurer']);
    expect(m.avsnitt[1].mal.begrepp.map((x) => x.text)).toEqual(['Namnge cirkelns delar']);
    // Blandade uppgifters mål hör till hela kapitlet
    expect(m.blandat.map((a) => [a.rubrik, a.mal.problemlosning.map((x) => x.text)])).toEqual([['Blandade uppgifter', ['Välja rätt formel för omkrets, area och volym']]]);
  });

  it('checklistan: bokens nivåer per delkapitel med uppgifter, sidor och betygsnivå — och kapitlets repetitionsdelar', () => {
    const m = matteLapp(bokFromImport(BOKFIL()), ['3.1', '3.2']);
    expect(m.avsnitt[0].kryss).toEqual([
      { namn: 'ETT', uppgifter: '1–10', sidor: 's. 108', betyg: ['E'] },
      { namn: 'TVÅ', uppgifter: '11–20', sidor: 's. 109–110', betyg: ['C'] },
      { namn: 'TRE', uppgifter: '21–30', sidor: 's. 111', betyg: ['A'] },
    ]);
    expect(m.avsnitt[1].kryss).toEqual([
      { namn: 'ETT', uppgifter: '31–36', sidor: 's. 115', betyg: ['E'] },
      { namn: 'TVÅ', uppgifter: '37–42', sidor: 's. 116', betyg: ['C'] },
    ]);
    expect(m.repetition.map((k) => [k.namn, k.uppgifter, k.sidor])).toEqual([
      ['Blandade uppgifter', 'ETT 136–144 · TVÅ 145–153 · TRE 154–162', 's. 143–145'],
      ['Diagnos', null, null],
      ['Träna Geometri', null, 's. 146–148'],
      ['Utveckla Geometri', null, 's. 149'],
      ['Förmågorna i fokus', null, 's. 150–155'],
      ['Sammanfattning', null, 's. 156–157'],
    ]);
    // Lärarens egna uppgiftsintervall går före bokens
    const egna = matteLapp(bokFromImport(BOKFIL()), ['3.1'], new Map([['3.1', { niva1: '1–8', niva2: '', niva3: '' }]]));
    expect(egna.avsnitt[0].kryss.map((k) => `${k.namn} ${k.uppgifter}`)).toEqual(['ETT 1–8', 'TVÅ 11–20', 'TRE 21–30']);
    // Grön/Blå/Röd: grön och blå är E-nivå, röd är C och A
    const farger = matteLapp({ ...bokFromImport(BOKFIL()), nivaer: { niva1: 'Grön', niva2: 'Blå', niva3: 'Röd' } }, ['3.1']);
    expect(farger.avsnitt[0].kryss.map((k) => [k.namn, k.betyg.join('/')])).toEqual([['Grön', 'E'], ['Blå', 'E'], ['Röd', 'C/A']]);
  });

  it('typiska uppgifter: utan bokfilens egna hänvisas problemlösningen till bokens nivåer; med dem står de först', () => {
    const utan = matteLapp(bokFromImport(BOKFIL()), ['3.1', '3.2']).formagor;
    expect(utan.map((f) => f.id)).toEqual(['begrepp', 'metod', 'problemlosning', 'resonemang', 'kommunikation']);
    const pl = utan[2];
    expect(pl.utskrivna).toBe(false);
    expect(pl.typiska).toEqual({
      E: ['Blandade uppgifter: ETT 136–144 (s. 143–145)'], C: ['Blandade uppgifter: TVÅ 145–153 (s. 143–145)'],
      A: ['Blandade uppgifter: TRE 154–162 (s. 143–145)', 'Utveckla Geometri (s. 149)'],
    });
    expect(pl.iBoken).toEqual(['Förmågorna i fokus s. 151–152: fyrfältsproblem Hagen']);
    expect(utan[3].iBoken).toEqual(['Förmågorna i fokus s. 153: En lådas volym 1–5']);
    expect(utan[4].iBoken).toEqual(['Förmågorna i fokus s. 154–155: värdera fyra lösningar']);
    expect(utan[3].typiska).toEqual({ E: [], C: [], A: [] });

    const med = matteLapp(bokFromImport(BOKFIL({ formagor: { problemlosning: { E: ['Golvlist runt ett rum'], C: ['Bordsskivans area'], A: ['Kon och cylinder'] }, resonemang: { E: ['Samma omkrets, samma area?'] } } })), ['3.1']).formagor;
    expect(med[2].utskrivna).toBe(true);
    expect(med[2].typiska.E).toEqual(['Golvlist runt ett rum', 'I boken: Blandade uppgifter: ETT 136–144 (s. 143–145)']);
    expect(med[2].typiska.A).toEqual(['Kon och cylinder', 'I boken: Blandade uppgifter: TRE 154–162 (s. 143–145)', 'I boken: Utveckla Geometri (s. 149)']);
    expect(med[3]).toMatchObject({ utskrivna: true, typiska: { E: ['Samma omkrets, samma area?'], C: [], A: [] } });
  });
});

describe('Del 260 · provlappen för ett matematikprov', () => {
  it('lappen har matematikdelen och texten följer förmågorna, med regeln för E överst och checklistan sist', () => {
    const s = bygg(BOKFIL({ forklaringar: { omkrets: 'Sträckan runt en figur.' }, formagor: { problemlosning: { E: ['Golvlist runt ett rum'] } } }));
    const p = provlapp(s, 'am', 10, '2026-09-14')!;
    expect(p.matte).not.toBeNull();
    expect(p.matte!.avsnitt.map((a) => a.kod)).toEqual(['3.1', '3.2']);
    const text = provlappText(p);
    const ordning = ['DET HÄR FÅR DU LÄRA DIG I KAPITLET', 'FÖR BETYGET E', 'BEGREPP\n', 'METOD\n', 'PROBLEMLÖSNING\n', 'RESONEMANG\n', 'KOMMUNIKATION\n', 'CHECKLISTA — HAR DU GJORT?'].map((x) => text.indexOf(x));
    expect(ordning.every((x) => x >= 0)).toBe(true);
    expect([...ordning].sort((a, b) => a - b)).toEqual(ordning);
    expect(text).toContain(REGEL_E);
    expect(text).toContain('E: Du känner igen begreppen, kan förklara dem med egna ord');
    expect(text).toContain('3.1 Omkrets och area (s. 106–107)\n  • omkrets – Sträckan runt en figur. (s. 106–107)');
    expect(text).toContain('  • Beräkna omkretsen av polygoner och cirklar (O = π · d) (s. 106–107)');
    expect(text).toContain('Blandade uppgifter (s. 143–145)\n  • Välja rätt formel för omkrets, area och volym (s. 143–144)');
    expect(text).toContain('Typiska uppgifter:\n  E-nivå: Golvlist runt ett rum\n  E-nivå: I boken: Blandade uppgifter: ETT 136–144 (s. 143–145)');
    expect(text).toContain('Öva i boken: Förmågorna i fokus s. 151–152: fyrfältsproblem Hagen');
    expect(text).toContain('3.1 Omkrets och area\n  ☐ ETT 1–10 (s. 108) — E-nivå\n  ☐ TVÅ 11–20 (s. 109–110) — C-nivå\n  ☐ TRE 21–30 (s. 111) — A-nivå');
    expect(text).toContain('Hela kapitlet\n  ☐ Blandade uppgifter: ETT 136–144 · TVÅ 145–153 · TRE 154–162 (s. 143–145)\n  ☐ Diagnos\n  ☐ Träna Geometri (s. 146–148)');
    expect(text).not.toContain('SÅ VISAR DU DJUP OCH BREDD');
  });

  it('ett omfång tar bara med de valda delkapitlen', () => {
    let s = bygg(BOKFIL());
    s = { ...s, lektionsplaner: [...s.lektionsplaner, { id: 'lp', amneId: 'am', lektionsIndex: 10, provlappOmfang: '3.2' }] };
    const p = provlapp(s, 'am', 10, '2026-09-14')!;
    expect(p.matte!.avsnitt.map((a) => a.kod)).toEqual(['3.2']);
  });
});
