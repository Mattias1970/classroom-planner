/**
 * Del 261 · Den pedagogiska planeringen i matematik bär samma provinformation som provlappen — de fem förmågorna
 * (begrepp, metod, problemlösning, resonemang, kommunikation) — och veckoplaneringen följer matematikens upplägg:
 * ett Socrative-rum per klass, läxan ur bokfilen och arbete på bokens nivåer. NO-ämnena är oförändrade.
 */
import { describe, expect, it } from 'vitest';
import {
  MATTE_STUDIETEKNIK, REGEL_E, arMatematik, bokFromImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, matteOvaInforProv,
  pedagogiskPlanering, pedagogiskPlaneringForOmfang, provlappForOmfang, registreraPlanering, sattLektionsplan, slaIhopUppgifter, sparaBok, tomStruktur, type Struktur,
} from '../src/index.js';

const lektion = (id: number, avsnitt: string, del: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'regular', avsnitt, del, ett: '—', två: '—', tre: '—', sidor_teori: '—', begrepp: '—', soc_start: 'Matte8AA (8A) / Matte8BB (8B)', exit: 'Matte8AA (8A) / Matte8BB (8B)', genomgang: '—', bam_gora: '—', ex: '—', laxa: '—', ...extra,
});
const BOKFIL = (amne = 'Matematik') => JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma-261', titel: 'Matematik Y', förlag: 'Liber', ämne: amne, årskurs: 8, kapitelMeta: { '3': {
    name: 'Geometri', col: '#4a3f9f', mal: ['Metoder för beräkning av area, omkrets och volym'],
    forklaringar: { omkrets: 'Sträckan runt en figur.' },
    formagor: { problemlosning: { E: ['Golvlist runt ett rum.'], C: ['Bordsskivans area.'], A: ['Kon och cylinder.'] } },
  } } },
  lektioner: { '3': [
    lektion(1, '3.1 Omkrets och area', 1, { ett: '1–10', två: '11–20', sidor_teori: '106–107', begrepp: 'omkrets, area', ex: 'Exempel s. 107: halvcirkel.', laxa: 'Begreppen 3.1. Lämna in ETT.', sidor_uppgifter: { ett: '108', två: '109–110' },
      mal: ['Beräkna omkretsen av polygoner och cirklar', 'Resonera om hur omkrets och area ändras vid skala'] }),
    lektion(2, '3.1 Omkrets och area', 2, { två: '11–20', tre: '21–30', sidor_teori: '106–107', begrepp: 'omkrets, area', laxa: 'Begreppen 3.1. Lämna in TVÅ.', sidor_uppgifter: { två: '109–110', tre: '111' } }),
    lektion(3, '3.2 Cirkelns area', 1, { ett: '31–36', två: '37–42', sidor_teori: '113–114', begrepp: 'cirkelns area', mal: ['Beräkna en cirkels area med A = π · r²'] }),
    lektion(4, 'Blandade uppgifter', 1, { ett: '136–144', två: '145–153', tre: '154–162', sidor_teori: '143–145', begrepp: 'alla kapitlets begrepp', mal: ['Välja rätt formel för omkrets, area och volym'], laxa: 'Begreppen i kapitel 3.' }),
    lektion(5, 'Diagnos', 1, { type: 'test', exit: '—' }),
    lektion(6, 'Träna Geometri', 1, { type: 'repetition', sidor_teori: '146–148' }),
    lektion(7, 'Utveckla Geometri', 1, { type: 'repetition', sidor_teori: '149' }),
    lektion(8, 'Förmågorna i fokus', 1, { type: 'ovaformagor', sidor_teori: '150–155', genomgang: 'Problemlösning (s. 151–152): Hagen.' }),
  ] },
});

function bygg(amne = 'Matematik'): Struktur {
  const bok = bokFromImport(BOKFIL(amne));
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: amne, bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-09-10' });
}

describe('Del 261 · matematik eller inte', () => {
  it('bokens ämne eller ämnets namn avgör — aldrig ett NO- eller teknikämne', () => {
    expect(arMatematik('Matematik', 'Matematik')).toBe(true);
    expect(arMatematik('Matematik', 'Ma 8B')).toBe(true);
    expect(arMatematik('Geografi', 'Matematik')).toBe(true);
    expect(arMatematik('Biologi', 'Biologi')).toBe(false);
    expect(arMatematik('Matematik', 'Teknik')).toBe(false);
    expect(arMatematik('Geografi', 'Geografi')).toBe(false);
    expect(slaIhopUppgifter(['1–10', '11–20'])).toBe('1–20');
    expect(slaIhopUppgifter(['—', ''])).toBe('');
  });
});

describe('Del 261 · den pedagogiska planeringen bär provlappens matematikinformation', () => {
  it('samma underlag som provlappen för samma delkapitel: regeln för E, förmågorna, begreppen, metoderna, typiska uppgifter och checklistan', () => {
    const s = bygg();
    const pl = pedagogiskPlanering(s, 'am', 3, '2026-09-14')!;
    const lapp = provlappForOmfang(s, 'am', [{ fran: '3.1', till: '3.2' }], { namn: 'Prov kapitel 3', datum: null, vecka: null, notis: null }, '2026-09-14')!;
    expect(pl.matte).not.toBeNull();
    expect(pl.matte).toEqual(lapp.matte);
    const m = pl.matte!;
    expect(m.regelE).toBe(REGEL_E);
    expect(m.formagor.map((f) => f.namn)).toEqual(['Begrepp', 'Metod', 'Problemlösning', 'Resonemang', 'Kommunikation']);
    expect(m.avsnitt.map((a) => a.kod)).toEqual(['3.1', '3.2']);
    expect(m.avsnitt[0].begrepp[0]).toEqual({ begrepp: 'omkrets', forklaring: 'Sträckan runt en figur.', sidor: 's. 106–107' });
    expect(m.avsnitt[0].mal.metod.map((x) => x.text)).toEqual(['Beräkna omkretsen av polygoner och cirklar']);
    expect(m.formagor[2].typiska.E[0]).toBe('Golvlist runt ett rum.');
    expect(m.avsnitt[0].kryss.map((k) => `${k.namn} ${k.uppgifter} ${k.sidor}`)).toEqual(['ETT 1–10 s. 108', 'TVÅ 11–20 s. 109–110', 'TRE 21–30 s. 111']);
    expect(m.repetition.map((k) => k.namn)).toEqual(['Blandade uppgifter', 'Diagnos', 'Träna Geometri', 'Utveckla Geometri', 'Förmågorna i fokus']);
  });

  it('ett omfång tar bara med de valda delkapitlen; lärarens egna uppgiftsintervall gäller — som på provlappen', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp0', amneId: 'am', lektionsIndex: 0, uppgNiva1: '1–8' });
    const pl = pedagogiskPlaneringForOmfang(s, 'am', [{ fran: '3.1', till: '3.1' }], '2026-09-14')!;
    expect(pl.matte!.avsnitt.map((a) => a.kod)).toEqual(['3.1']);
    expect(pl.matte!.avsnitt[0].kryss.map((k) => `${k.namn} ${k.uppgifter}`)).toEqual(['ETT 1–8', 'TVÅ 11–20', 'TRE 21–30']);
    expect(pl.matte).toEqual(provlappForOmfang(s, 'am', [{ fran: '3.1', till: '3.1' }], { namn: 'Prov', datum: null, vecka: null, notis: null }, '2026-09-14')!.matte);
  });

  it('andra ämnen har ingen matematikdel — NO-ämnena behåller sina övningsrum', () => {
    const pl = pedagogiskPlanering(bygg('Biologi'), 'am', 3, '2026-09-14')!;
    expect(pl.matte).toBeNull();
    expect(pl.ovaRum.length).toBeGreaterThan(0);
    expect(pl.veckor[0].dagar[0].arbete).toBe('Exempel s. 107: halvcirkel.');
  });
});

describe('Del 261 · veckoplaneringen i matematik', () => {
  it('läxförhöret prövar förra lektionens delkapitel, läxan är bokfilens text och arbetet har bokens nivåer — inga övningsrum', () => {
    const pl = pedagogiskPlanering(bygg(), 'am', 3, '2026-09-14')!;
    const dagar = pl.veckor.flatMap((v) => v.dagar);
    expect(dagar.map((d) => d.avsnitt).slice(0, 4)).toEqual(['3.1 Omkrets och area', '3.1 Omkrets och area', '3.2 Cirkelns area', 'Blandade uppgifter']);
    // Första lektionen: inget läxförhör (inget är läst än); läxan är bokfilens
    expect(dagar[0].laxforhor).toBeNull();
    expect(dagar[0].laxa).toMatchObject({ text: 'Begreppen 3.1. Lämna in ETT.', ovaRum: null });
    expect(dagar[0].arbete).toBe('Exempel s. 107: halvcirkel.\nEgen räkning: ETT 1–10 · TVÅ 11–20');
    expect(dagar[0].exit).toEqual({ rum: 'Matte8BB', begrepp: 'Begrepp 3.1' });
    // Andra lektionen i 3.1 och första i 3.2: läxförhör på 3.1 i klassens rum, inget övningsrum
    expect(dagar[1].laxforhor).toEqual({ begrepp: 'Begrepp 3.1', rum: 'Matte8BB', ovaRum: null });
    expect(dagar[1].arbete).toBe('Egen räkning: TVÅ 11–20 · TRE 21–30');
    expect(dagar[2].laxforhor).toEqual({ begrepp: 'Begrepp 3.1', rum: 'Matte8BB', ovaRum: null });
    expect(dagar[2].laxa!.text).toBe('Begrepp 3.2');                 // bokfilen saknar läxtext → delkapitlets begrepp
    // Efter sista delkapitlet: hela kapitlets begrepp
    expect(dagar[3].laxforhor).toEqual({ begrepp: 'Begrepp kapitel 3', rum: 'Matte8BB', ovaRum: null });
    expect(dagar[3].exit).toEqual({ rum: 'Matte8BB', begrepp: 'Begrepp kapitel 3' });   // inte bokfilens rumstext
    // Inga rum att lista — matematik har bara klassens eget
    expect(pl.socrativeRum).toEqual([]);
    expect(pl.ovaRum).toEqual([]);
    expect(pl.ovaRumAlla).toEqual([]);
  });

  it('lärarens egen läxtext på lektionen går före bokfilens', () => {
    const s = sattLektionsplan(bygg(), { id: 'lp0', amneId: 'am', lektionsIndex: 0, laxa: 'Gör klart ETT och läs s. 106.' });
    expect(pedagogiskPlanering(s, 'am', 3, '2026-09-14')!.veckor[0].dagar[0].laxa!.text).toBe('Gör klart ETT och läs s. 106.');
  });
});

describe('Del 261 · så övar du inför ett matematikprov', () => {
  it('råden per nivå använder bokens nivånamn och kapitlets delar med sidor', () => {
    const ova = matteOvaInforProv(pedagogiskPlanering(bygg(), 'am', 3, '2026-09-14')!.matte!);
    expect(ova.E).toContain('Gör ETT i varje delkapitel (checklistan) och rätta mot facit.');
    expect(ova.E).toContain('Gör diagnosen och öva mer på det som blev fel i Träna Geometri (s. 146–148).');
    expect(ova.C[0]).toBe('Gör TVÅ i varje delkapitel och Blandade uppgifter (s. 143–145).');
    expect(ova.A.slice(0, 2)).toEqual(['Gör TRE i varje delkapitel och Utveckla Geometri (s. 149).', 'Arbeta med Förmågorna i fokus (s. 150–155).']);
    expect(MATTE_STUDIETEKNIK).toHaveLength(6);
  });
});
