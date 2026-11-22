// @vitest-environment jsdom
/**
 * Del 261 · Word-dokumentet "Pedagogisk planering och provlapp" i matematik: prov och bedömning följer de fem
 * förmågorna med samma innehåll som provlappen, och NO-ämnenas delar (B, U, R, laborationer, övningsrum) står inte
 * där. I NO-ämnena är dokumentet oförändrat.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { bokFromImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, pedagogiskPlanering, provlappForOmfang, registreraPlanering, resetIdRaknare, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { byggPedagogiskPlanering } from '../src/pedagogiskWord';
import { provlappDokument } from '../src/provlappWord';
import { PedagogiskPlaneringKnapp } from '../src/PedagogiskPlaneringKnapp';

const lektion = (id: number, avsnitt: string, del: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'regular', avsnitt, del, ett: '—', två: '—', tre: '—', sidor_teori: '—', begrepp: '—', soc_start: 'Matte8AA (8A) / Matte8BB (8B)', exit: 'Matte8AA (8A) / Matte8BB (8B)', genomgang: '—', bam_gora: '—', ex: '—', laxa: '—', ...extra,
});
const BOKFIL = (amne: string) => JSON.stringify({
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
    lektion(3, 'Blandade uppgifter', 1, { ett: '136–144', två: '145–153', tre: '154–162', sidor_teori: '143–145', mal: ['Välja rätt formel för omkrets, area och volym'] }),
    lektion(4, 'Diagnos', 1, { type: 'test', exit: '—' }),
    lektion(5, 'Förmågorna i fokus', 1, { type: 'ovaformagor', sidor_teori: '150–155', genomgang: 'Problemlösning (s. 151–152): Hagen.' }),
  ] },
});

function bygg(amne: string): Struktur {
  const bok = bokFromImport(BOKFIL(amne));
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: amne, bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-09-10' });
}
const textUr = async (dok: Parameters<typeof Packer.toBuffer>[0]) => (await (await JSZip.loadAsync(await Packer.toBuffer(dok))).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 261 · den pedagogiska planeringen i matematik (Word)', () => {
  it('prov och bedömning följer de fem förmågorna, med regeln för E, checklistan, råden per nivå och studieteknik i matematik', async () => {
    const text = await textUr(byggPedagogiskPlanering(pedagogiskPlanering(bygg('Matematik'), 'am', 3, '2026-09-14')!));
    const delar = ['Pedagogisk planering och provlapp', 'Syfte', 'Innehåll – sammanfattning av varje delkapitel', 'Socrative – läxförhör och exit ticket', 'Binogi – filmer',
      'Prov och bedömning', 'Förmågor och betygsnivåer i matematik', 'I matematik bedöms fem förmågor: begrepp, metod, problemlösning, resonemang och kommunikation.',
      'För betyget E måste du visa alla fem förmågorna på E-nivå', 'FörmågaECA',
      '1. Begrepp', '3.1 Omkrets och area  (teori s. 106–107)', 'BegreppBeskrivningSida', 'omkretsSträckan runt en figur.s. 106–107',
      '2. Metod', 'DelkapitelMetoder du ska kunnaTeori', '• Beräkna omkretsen av polygoner och cirklar',
      '3. Problemlösning', 'Typiska uppgifter', 'E-nivå• Golvlist runt ett rum.• I boken: Blandade uppgifter: ETT 136–144 (s. 143–145)', 'C-nivå• Bordsskivans area.', 'A-nivå• Kon och cylinder.',
      'Öva i boken: Förmågorna i fokus s. 151–152: Hagen', '4. Resonemang', '• Resonera om hur omkrets och area ändras vid skala', '5. Kommunikation',
      '6. Checklista — har du gjort?', '☐  ETT 1–10 (s. 108) — E-nivå', '☐  TVÅ 11–20 (s. 109–110) — C-nivå', '☐  TRE 21–30 (s. 111) — A-nivå', 'Hela kapitlet', '☐  Diagnos',
      'Studera inför provet', 'Gör ETT i varje delkapitel (checklistan) och rätta mot facit.', 'För högre nivå (C)', 'Gör TVÅ i varje delkapitel och Blandade uppgifter (s. 143–145).',
      'För högsta nivå (A)', 'Arbeta med Förmågorna i fokus (s. 150–155).', 'Studieteknik – så övar du matematik', 'Skriv varje steg på en egen rad, med likhetstecknen under varandra.', 'Planering'];
    for (const del of delar) expect(text, del).toContain(del);
    // Ordningen: förmågorna, checklistan, råden, studieteknik och sist veckoplaneringen
    const lagen = ['Prov och bedömning', '1. Begrepp', '2. Metod', '3. Problemlösning', '4. Resonemang', '5. Kommunikation', '6. Checklista', 'Studera inför provet', 'Studieteknik – så övar du matematik', 'Vecka (dag och inlämningar)'].map((x) => text.indexOf(x));
    expect([...lagen].sort((a, b) => a - b)).toEqual(lagen);
    // NO-ämnenas delar står inte i matematikens planering
    for (const no of ['B – Beskriv och förklara', 'U – Undersökning', 'R – Resonera och ta ställning', 'Kort om förmågorna: Resonemang samt Undersökning', 'laboration', 'Hypotes', 'Finalen',
      'Viktiga begrepp per delkapitel', 'Rum (Room Name)', 'Biologi612', 'Begrepp Matte8', 'Öva i Socrative', 'Frågor']) expect(text, no).not.toContain(no);
    // Klassen nämns fortfarande inte (Del 225)
    expect(text).not.toContain('Matte8BB');
  });

  it('veckoplaneringen: läxförhör på förra delkapitlet, arbete på bokens nivåer och läxan ur bokfilen — ingen NO-inlämning', async () => {
    const text = await textUr(byggPedagogiskPlanering(pedagogiskPlanering(bygg('Matematik'), 'am', 3, '2026-09-14')!));
    const tabell = text.slice(text.indexOf('Vecka (dag och inlämningar)'));
    expect(tabell).toContain('Arbete:Exempel s. 107: halvcirkel.Egen räkning: ETT 1–10 · TVÅ 11–20');
    expect(tabell).toContain('Läxförhör:Begrepp 3.1Socrative: klassens rum(börja med uppgifterna när du är klar med förhöret)');
    expect(tabell).toContain('Begreppen 3.1. Lämna in ETT.');
    expect(tabell).toContain('Arbete:Egen räkning: TVÅ 11–20 · TRE 21–30');
    expect(tabell).not.toContain('Inlämning:');
    expect(tabell).not.toContain('börja med frågorna');
  });

  it('samma provinformation som provlappen: varje rad i förmågorna och checklistan finns i båda dokumenten', async () => {
    const s = bygg('Matematik');
    const planering = await textUr(byggPedagogiskPlanering(pedagogiskPlanering(s, 'am', 3, '2026-09-14')!));
    const lapp = await textUr(provlappDokument(provlappForOmfang(s, 'am', [{ fran: '3.1', till: '3.1' }], { namn: 'Prov kapitel 3', datum: null, vecka: null, notis: null }, '2026-09-14')!, '#4a3f9f'));
    const fran = (t: string) => t.slice(t.indexOf('För betyget E '), t.indexOf('Uppgifter i boken') + 400).replace(/Studera inför provet[\s\S]*$/, '');
    const klipp = (t: string) => fran(t).slice(0, fran(t).indexOf('☐  Förmågorna i fokus (s. 150–155)') + 34);
    expect(klipp(planering)).toBe(klipp(lapp));
    expect(klipp(planering).length).toBeGreaterThan(1500);
  });

  it('NO-ämnena är oförändrade: B, U och R, viktiga begrepp per delkapitel och övningsrummen står kvar', async () => {
    const text = await textUr(byggPedagogiskPlanering(pedagogiskPlanering(bygg('Biologi'), 'am', 3, '2026-09-14')!));
    for (const del of ['Viktiga begrepp per delkapitel', 'Socrative – öva begreppen', 'Rum (Room Name)', 'B – Beskriv och förklara', 'U – Undersökning', 'R – Resonera och ta ställning', 'Studieteknik – hur man läser en text',
      'Kort om förmågorna: Resonemang samt Undersökning', 'börja med frågorna', 'Inlämning:']) expect(text, del).toContain(del);
    for (const ma of ['För betyget E måste du visa alla fem förmågorna', '6. Checklista', 'Studieteknik – så övar du matematik', 'Egen räkning']) expect(text, ma).not.toContain(ma);
  });
});

describe('Del 261 · rutan för pedagogisk planering', () => {
  it('säger i matematik att prov och bedömning följer de fem förmågorna — inte i NO', async () => {
    for (const [amne, vantat] of [['Matematik', true], ['Biologi', false]] as const) {
      document.body.innerHTML = '';
      const div = document.createElement('div'); document.body.appendChild(div);
      const rot = createRoot(div);
      await act(async () => rot.render(<PedagogiskPlaneringKnapp s={bygg(amne)} amneId="am" aktivtKapitel={3} />));
      await act(async () => { (div.querySelector('button.flik') as HTMLButtonElement).click(); });
      const notis = div.querySelector('[aria-label="Matematikens förmågor"]');
      expect(notis !== null).toBe(vantat);
      if (vantat) expect(notis!.textContent).toContain('begrepp, metod, problemlösning, resonemang och kommunikation');
      await act(async () => rot.unmount());
    }
  });
});
