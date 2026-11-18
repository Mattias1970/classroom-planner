// @vitest-environment jsdom
/**
 * Del 260 · Provlappen i matematik på skärm och i Word: regeln för E, de fem förmågorna (begrepp med beskrivning
 * och sida, metoder med teorisida, typiska uppgifter på E-, C- och A-nivå) och en checklista per delkapitel.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { bokFromImport, laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst, provlapp, registreraPlanering, resetIdRaknare, sattLektionsplan, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { ProvlappVisning } from '../src/Provlapp';
import { provlappDokument } from '../src/provlappWord';

const lektion = (id: number, avsnitt: string, del: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'regular', avsnitt, del, ett: '—', två: '—', tre: '—', sidor_teori: '—', begrepp: '—', soc_start: '—', exit: '—', genomgang: '—', bam_gora: '—', ex: '—', laxa: '—', ...extra,
});
const BOKFIL = JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma-260', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '3': {
    name: 'Geometri', col: '#4a3f9f', mal: ['Metoder för beräkning av area, omkrets och volym'],
    forklaringar: { omkrets: 'Sträckan runt en figur.', area: 'Hur stor yta en figur täcker.' },
    filmer: ['3.1 · Cirkelns omkrets|https://app.binogi.se/l/cirkelns-omkrets'],
    formagor: {
      problemlosning: { E: ['Golvlist runt ett rum. (Svar: 14 m)'], C: ['Bordsskivans area.'], A: ['Kon och cylinder med samma volym.'] },
      resonemang: { E: ['Samma omkrets, samma area?'] },
    },
  } } },
  lektioner: { '3': [
    lektion(1, '3.1 Omkrets och area', 1, { ett: '1–10', två: '11–20', tre: '21–30', sidor_teori: '106–107', begrepp: 'omkrets, area, polygon', sidor_uppgifter: { ett: '108', två: '109–110', tre: '111' },
      mal: ['Beräkna omkretsen av polygoner och cirklar', 'Rita figur, teckna beräkningar och skriva ut enheter', 'Resonera om hur omkrets och area ändras vid skala'] }),
    lektion(2, 'Blandade uppgifter', 1, { ett: '136–144', två: '145–153', tre: '154–162', sidor_teori: '143–145', mal: ['Välja rätt formel för omkrets, area och volym'] }),
    lektion(3, 'Diagnos', 1, { type: 'test' }),
    lektion(4, 'Förmågorna i fokus', 1, { type: 'ovaformagor', sidor_teori: '150–155', genomgang: 'Problemlösning (s. 151–152): fyrfältsproblem Hagen. Resonemang (s. 153): En lådas volym.' }),
  ] },
});

function bygg(): Struktur {
  const bok = bokFromImport(BOKFIL);
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: 'Matematik', bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-09-10' });
  s = laggTillEgenRad(s, 'am', { id: 'er1', position: 4, rubrik: 'Prov kapitel 3', typ: 'prov' }, '2026-09-14');
  return sattLektionsplan(s, { id: 'lp0', amneId: 'am', lektionsIndex: 0, sammanfattning: 'Omkrets är sträckan runt, area är ytan.' });
}
const rader = (el: Element, selektor: string) => [...el.querySelectorAll(selektor)].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 260 · matematikens provlapp på skärmen', () => {
  it('regeln för E, kravtabellen, de fem förmågorna med innehåll, repetitionsdelen och checklistan', async () => {
    const p = provlapp(bygg(), 'am', 4, '2026-09-14')!;
    const div = document.createElement('div'); document.body.appendChild(div);
    await act(async () => createRoot(div).render(<ProvlappVisning p={p} farg="#4a3f9f" />));
    const vy = div.querySelector('[role="document"]')!;
    expect(vy.querySelector('[aria-label="Regeln för betyget E"]')!.textContent).toBe('För betyget E måste du visa alla fem förmågorna på E-nivå: begrepp, metod, problemlösning, resonemang och kommunikation. Det räcker inte att vara stark i en förmåga om en annan saknas.');
    // Kravtabellen: en rad per förmåga med E, C och A
    const krav = vy.querySelector('table[aria-label="Vad som krävs i varje förmåga"]')!;
    expect([...krav.querySelectorAll('th')].map((x) => x.textContent)).toEqual(['Förmåga', 'E', 'C', 'A']);
    expect([...krav.querySelectorAll('tbody tr td:first-child b')].map((x) => x.textContent)).toEqual(['Begrepp', 'Metod', 'Problemlösning', 'Resonemang', 'Kommunikation']);
    expect([...vy.querySelectorAll('section.provlapp-formaga')].map((x) => x.getAttribute('aria-label'))).toEqual(['Begrepp', 'Metod', 'Problemlösning', 'Resonemang', 'Kommunikation', 'Repetera', 'Checklista']);

    // Begrepp: beskrivning och sida; ett begrepp utan beskrivning i bokfilen får ett streck
    const begrepp = vy.querySelector('section[aria-label="Begrepp"]')!;
    expect(begrepp.textContent).toContain('3.1 Omkrets och area · teori s. 106–107');
    expect(rader(begrepp, 'tbody tr')).toEqual([['omkrets', 'Sträckan runt en figur.', 's. 106–107'], ['area', 'Hur stor yta en figur täcker.', 's. 106–107'], ['polygon', '—', 's. 106–107']]);
    // Metod: delkapitlets metoder med teorisida
    expect(rader(vy.querySelector('section[aria-label="Metod"]')!, 'tbody tr')).toEqual([['3.1 Omkrets och area', 'Beräkna omkretsen av polygoner och cirklar', 's. 106–107']]);
    // Problemlösning: kapitlets mål, typiska uppgifter per nivå och var i boken nivån övas
    const pl = vy.querySelector('section[aria-label="Problemlösning"]')!;
    expect(rader(pl, ':scope > table tbody tr')).toEqual([['Blandade uppgifter', 'Välja rätt formel för omkrets, area och volym', 's. 143–145']]);
    expect(pl.querySelector('.provlapp-typiska b')!.textContent).toBe('Typiska uppgifter');
    expect(rader(pl, '.provlapp-typiska tr')).toEqual([
      ['E-nivå', 'Golvlist runt ett rum. (Svar: 14 m)I boken: Blandade uppgifter: ETT 136–144 (s. 143–145)'],
      ['C-nivå', 'Bordsskivans area.I boken: Blandade uppgifter: TVÅ 145–153 (s. 143–145)'],
      ['A-nivå', 'Kon och cylinder med samma volym.I boken: Blandade uppgifter: TRE 154–162 (s. 143–145)'],
    ]);
    expect(pl.textContent).toContain('Öva i boken: Förmågorna i fokus s. 151–152: fyrfältsproblem Hagen');
    // Resonemang och kommunikation: mål ur delkapitlet; nivåer utan uppgift visar ett streck
    const res = vy.querySelector('section[aria-label="Resonemang"]')!;
    expect(rader(res, ':scope > table tbody tr')).toEqual([['3.1 Omkrets och area', 'Resonera om hur omkrets och area ändras vid skala', 's. 106–107']]);
    expect(rader(res, '.provlapp-typiska tr')).toEqual([['E-nivå', 'Samma omkrets, samma area?'], ['C-nivå', '—'], ['A-nivå', '—']]);
    const kom = vy.querySelector('section[aria-label="Kommunikation"]')!;
    expect(rader(kom, ':scope > table tbody tr')).toEqual([['3.1 Omkrets och area', 'Rita figur, teckna beräkningar och skriva ut enheter', 's. 106–107']]);
    expect(kom.querySelector('.provlapp-typiska')).toBeNull();
    // Repetera: lärarens sammanfattning och bokens film
    const rep = vy.querySelector('section[aria-label="Repetera"]')!;
    expect(rep.textContent).toContain('Sammanfattning: Omkrets är sträckan runt, area är ytan.');
    expect(rep.querySelector('a[href="https://app.binogi.se/l/cirkelns-omkrets"]')!.textContent).toBe('Cirkelns omkrets');
    // Checklistan: bokens nivåer med uppgifter, sidor och betygsnivå — och kapitlets delar
    const check = vy.querySelector('section[aria-label="Checklista"]')!;
    expect(check.querySelector('h4')!.textContent).toBe('6. Checklista — har du gjort?');
    expect([...check.querySelectorAll('tbody tr')].map((r) => [r.querySelector('td')!.textContent, [...r.querySelectorAll('.provlapp-kryss')].map((x) => x.textContent)])).toEqual([
      ['3.1 Omkrets och area', ['☐ ETT 1–10 (s. 108) E', '☐ TVÅ 11–20 (s. 109–110) C', '☐ TRE 21–30 (s. 111) A']],
      ['Hela kapitlet', ['☐ Blandade uppgifter ETT 136–144 · TVÅ 145–153 · TRE 154–162 (s. 143–145)', '☐ Diagnos', '☐ Förmågorna i fokus (s. 150–155)']],
    ]);
    // Den allmänna lappens delar står inte på matematiklappen
    expect(vy.textContent).not.toContain('Så visar du djup och bredd');
    expect(vy.querySelector('img.provlapp-figur')).toBeNull();
  });
});

describe('Del 260 · matematikens provlapp i Word', () => {
  it('samma innehåll: regeln, kravtabellen, förmågorna, typiska uppgifter, filmlänk och checklistan', async () => {
    const p = provlapp(bygg(), 'am', 4, '2026-09-14')!;
    const zip = await JSZip.loadAsync(await Packer.toBuffer(provlappDokument(p, '#4a3f9f')));
    const text = (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    const delar = ['Provlappen följer matematikens fem förmågor', 'Kapitlets mål', 'För betyget E måste du visa alla fem förmågorna på E-nivå',
      'FörmågaECA', '1. Begrepp', '3.1 Omkrets och area  (teori s. 106–107)', 'BegreppBeskrivningSida', 'omkretsSträckan runt en figur.s. 106–107',
      '2. Metod', 'DelkapitelMetoder du ska kunnaTeori', '• Beräkna omkretsen av polygoner och cirklar',
      '3. Problemlösning', 'Typiska uppgifter', 'E-nivå• Golvlist runt ett rum. (Svar: 14 m)• I boken: Blandade uppgifter: ETT 136–144 (s. 143–145)',
      'Öva i boken: Förmågorna i fokus s. 151–152: fyrfältsproblem Hagen', '4. Resonemang', 'C-nivå—', '5. Kommunikation',
      'Repetera: sammanfattning och filmer', 'Sammanfattning: Omkrets är sträckan runt, area är ytan.', 'Cirkelns omkrets',
      '6. Checklista — har du gjort?', '☐  ETT 1–10 (s. 108) — E-nivå', '☐  TVÅ 11–20 (s. 109–110) — C-nivå', '☐  TRE 21–30 (s. 111) — A-nivå',
      'Hela kapitlet', '☐  Blandade uppgifter ETT 136–144 · TVÅ 145–153 · TRE 154–162 (s. 143–145)', '☐  Diagnos'];
    for (const del of delar) expect(text).toContain(del);
    // Ordningen följer förmågorna, med checklistan sist
    const lagen = ['1. Begrepp', '2. Metod', '3. Problemlösning', '4. Resonemang', '5. Kommunikation', '6. Checklista'].map((x) => text.indexOf(x));
    expect([...lagen].sort((a, b) => a - b)).toEqual(lagen);
    expect(text).not.toContain('Så visar du djup och bredd');
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('https://app.binogi.se/l/cirkelns-omkrets');
  });
});
