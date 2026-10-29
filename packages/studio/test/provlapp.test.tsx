// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { Packer } from 'docx';
import {
  byggKapitel, laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst, provlapp, provlappForOmfang, registreraPlanering,
  resetIdRaknare, sattLektionsplan, sparaBok, tomStruktur, type Bok, type Lektion, type Struktur,
} from '@planner/kernel';
import { ProvlappPanel } from '../src/Provlapp';
import { provlappDokument, provlappFilnamn } from '../src/provlappWord';
import { sparaStruktur } from '../src/store';

const TOM = { sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—' };
const lekt = (id: number, typ: Lektion['typ'], avsnitt: string, del: number, extra: Partial<Lektion> = {}): Lektion =>
  ({ id, typ, avsnitt, del, niva1: '—', niva2: '—', niva3: '—', ...TOM, ...extra });
const BOK: Bok = {
  id: 'ma-y', titel: 'Matematik Y', forlag: 'Liber', amne: 'Matematik', arskurs: 8,
  nivaer: { niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' },
  kapitel: [byggKapitel(1, 'Taluppfattning', '#b5532c', [
    lekt(1, 'regular', '1.1 Räkna med bråk', 1, { niva1: '1–10', niva2: '11–20', sidorTeori: 's. 8–10', mal: 'förkorta och förlänga bråk', begrepp: 'täljare, nämnare' }),
    lekt(2, 'regular', '1.1 Räkna med bråk', 2, { niva2: '11–20', niva3: '21–30', sidorTeori: 's. 8–10' }),
  ])],
};
BOK.kapitel[0].resurser.forklaringar = { täljare: 'Talet ovanför bråkstrecket.' };

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: 'Matematik', bokId: BOK.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: BOK.id, skapad: '2026-09-10' });
  // Läraren lägger in ett eget prov efter kapitlet — namnet behöver inte innehålla "prov"
  return laggTillEgenRad(s, 'am', { id: 'er1', position: 2, rubrik: 'Kapiteltest 1', typ: 'prov' }, '2026-09-14');
}

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 151 · Provlapp på provets lektionskort', () => {
  it('knappen genererar lappen ur planeringen och visar den för läsning', async () => {
    const s = bygg();
    sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => root.render(<ProvlappPanel s={s} amneId="am" lektionsIndex={2} farg="#b5532c" notis="" sattNotis={() => {}} />));
    expect(div.textContent).toContain('PROVLAPP');
    expect(div.querySelector('[role="document"]')).toBeNull();          // inget förrän knappen trycks
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Generera provlapp'))!;
    await act(async () => { knapp.click(); });
    const vy = div.querySelector('[role="document"]')!;
    expect(vy.getAttribute('aria-label')).toBe('Provlapp Kapiteltest 1');
    expect(vy.textContent).toContain('1.1 Räkna med bråk');
    expect(vy.textContent).toContain('förkorta och förlänga bråk');
    expect(vy.textContent).toContain('Talet ovanför bråkstrecket.');
    expect(vy.textContent).toContain('ETT 1–10 (s. 8–10)');
    expect(vy.textContent).toContain('TRE 21–30 (s. 8–10)');
    expect([...div.querySelectorAll('button')].some((b) => b.textContent?.includes('Ladda ner Word'))).toBe(true);
  });

  it('Word-filen byggs ur samma lapp och innehåller mål, begrepp och övningar per nivå', async () => {
    const s = bygg();
    const p = provlapp(s, 'am', 2, '2026-09-14')!;
    expect(provlappFilnamn(p)).toBe('Provlapp Matematik 8B kap 1');
    const buf = await Packer.toBuffer(provlappDokument(p, '#b5532c'));
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    const text = xml.replace(/<[^>]+>/g, '');
    for (const del of ['PROVLAPP · MATEMATIK Y · KAPITEL 1', 'Taluppfattning', 'Kapiteltest 1', 'förkorta och förlänga bråk',
      'Begrepp du ska kunna förklara', 'Talet ovanför bråkstrecket.', 'Övningsförslag för varje nivå', 'ETT 1–10 (s. 8–10)', 'TVÅ 11–20 (s. 8–10)', 'TRE 21–30 (s. 8–10)', 'Checklista inför provet']) {
      expect(text).toContain(del);
    }
  });

  it('Del 199: omfånget skrivs in på kortet, sparas på lektionsplanen och styr lappen; Word-filen får omfånget i namn och huvud', async () => {
    const BOK2: Bok = { ...BOK, id: 'ma-y2', kapitel: [BOK.kapitel[0], byggKapitel(2, 'Geometri', '#2f5aa8', [
      lekt(1, 'regular', '2.1 Vinklar', 1, { niva1: '1–10', sidorTeori: 's. 30–33', mal: 'mäta vinklar', begrepp: 'vinkel' }),
      lekt(2, 'regular', '2.2 Area', 1, { niva1: '11–20', sidorTeori: 's. 34–37', mal: 'räkna area' }),
    ])] };
    BOK2.kapitel[0].mal = ['bråk']; BOK2.kapitel[1].mal = ['vinklar och area'];
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK2);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: 'Matematik', bokId: BOK2.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: BOK2.id, skapad: '2026-09-10' });
    s = laggTillEgenRad(s, 'am', { id: 'er1', position: 4, rubrik: 'Prov kapitel 1–2', typ: 'prov' }, '2026-09-14');
    sparaStruktur(s);
    let omfang = '';
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<ProvlappPanel s={s} amneId="am" lektionsIndex={4} farg="#b5532c" notis="" sattNotis={() => {}} omfang={omfang} sattOmfang={(v) => { omfang = v; s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: 4, provlappOmfang: v }); sparaStruktur(s); rendera(); }} />));
    rendera();
    const falt = div.querySelector('input[aria-label="Provlappens omfång"]') as HTMLInputElement;
    expect(falt).not.toBeNull();
    // Felaktigt omfång visas som varning
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(falt, '1.1-2.2'); falt.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(div.textContent).toContain('inom ett kapitel');
    await act(async () => { const f = div.querySelector('input[aria-label="Provlappens omfång"]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(f, '1.1, 2.1-2.2'); f.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(div.textContent).not.toContain('inom ett kapitel');
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Generera provlapp'))!.click(); });
    const vy = div.querySelector('[role="document"]')!;
    expect(vy.textContent).toContain('KAPITEL 1 OCH 2');
    expect(vy.textContent).toContain('Omfattar: 1.1 · 2.1–2.2');
    expect(vy.textContent).toContain('Det här får du lära dig i kapitlen');
    expect(vy.textContent).toContain('2.2 Area');
    // Word
    const p = provlapp(s, 'am', 4, '2026-09-14')!;
    expect(p.omfang).toBe('1.1 · 2.1–2.2');
    expect(provlappFilnamn(p)).toBe('Provlapp Matematik 8B 1.1 2.1-2.2');
    const buf = await Packer.toBuffer(provlappDokument(p, '#b5532c'));
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    const text = xml.replace(/<[^>]+>/g, '');
    for (const del of ['PROVLAPP · MATEMATIK Y · KAPITEL 1 OCH 2', 'Omfattar', '1.1 · 2.1–2.2', 'Kapitlens mål', 'Kapitel 2 Geometri', '2.1 Vinklar', 'ETT 11–20 (s. 34–37)']) expect(text).toContain(del);
    // Fristående: samma lapp utan provlektion
    expect(provlappForOmfang(s, 'am', [{ fran: '2.1', till: '2.2' }], { namn: 'Geometriprov', datum: null, vecka: null, notis: null })!.avsnitt.map((a) => a.rubrik)).toEqual(['2.1 Vinklar', '2.2 Area']);
  });
});

describe('Del 206 · Provlappen visar djup och bredd med bild, E-krav och lärarens sammanfattning', () => {
  it('vyn: sammanfattning per avsnitt, djup-/breddfrågor ur begreppen, figuren som bild, E-kraven', async () => {
    const s = sattLektionsplan(bygg(), { id: 'lp0', amneId: 'am', lektionsIndex: 0, sammanfattning: 'Ett bråk är en del av en helhet.' });
    sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => root.render(<ProvlappPanel s={s} amneId="am" lektionsIndex={2} farg="#b5532c" notis="" sattNotis={() => {}} />));
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Generera provlapp'))!;
    await act(async () => { knapp.click(); });
    const vy = div.querySelector('[role="document"]')!;
    expect(vy.textContent).toContain('Sammanfattning: Ett bråk är en del av en helhet.');
    expect(vy.textContent).toContain('Djup: Förklara i flera led hur täljare hänger ihop med nämnare');
    expect(vy.textContent).toContain('Bredd: Ge tre olika exempel på täljare');
    expect(vy.textContent).toContain('Så visar du djup och bredd');
    const img = vy.querySelector<HTMLImageElement>('img.provlapp-figur')!;
    expect(img).not.toBeNull();
    expect(decodeURIComponent(img.src)).toContain('DJUP — orsakssamband i flera led');
    expect(decodeURIComponent(img.src)).toContain('täljare');
    expect(vy.textContent).toContain('För E-nivå krävs');
    expect(vy.textContent).toContain('Kunna begreppen');
    expect(vy.textContent).not.toContain('laborationsbeskrivning');   // matematik
  });

  it('Word-filen får djup/bredd, E-kraven och bilden som PNG när en ges', async () => {
    const p = provlapp(bygg(), 'am', 2, '2026-09-14')!;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 248, 255, 255, 63, 0, 5, 254, 2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    const buf = await Packer.toBuffer(provlappDokument(p, '#b5532c', png));
    const zip = await JSZip.loadAsync(buf);
    const text = (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    for (const del of ['Så visar du djup och bredd', 'Djup: Förklara i flera led hur täljare hänger ihop med nämnare', 'Bredd: Ge tre olika exempel på täljare', 'För E-nivå krävs', 'Kunna sammanfattningen']) expect(text).toContain(del);
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
  });
});

describe('Del 209 · bokens exempel, labb och filmer på skärm och i Word', () => {
  const BOK209: Bok = {
    ...BOK, id: 'ma-209',
    kapitel: [{ ...BOK.kapitel[0], delkapitel: BOK.kapitel[0].delkapitel.map((d) => ({ ...d, lektioner: d.lektioner.map((l) => ({ ...l, sammanfattning: 'Bråk är delar av en helhet.', djup: 'Förklara i flera led varför 1/2 = 2/4.', bredd: 'Ge tre bråk som är lika med en halv.', labb: 'Labb: vad söker vi, hur ser vi, koppling.' })) })), resurser: { ...BOK.kapitel[0].resurser, filmer: [{ titel: '1.1 · Bråk på Binogi', url: 'https://app.binogi.se/l/brak' }] } }],
  };
  function bygg209(): Struktur {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK209);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: 'Matematik', bokId: BOK209.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: BOK209.id, skapad: '2026-09-10' });
    return laggTillEgenRad(s, 'am', { id: 'er1', position: 2, rubrik: 'Kapiteltest 1', typ: 'prov' }, '2026-09-14');
  }
  it('skärm: bokens sammanfattning, djup/bredd, labb och filmlänk', async () => {
    const s = bygg209(); sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    await act(async () => createRoot(div).render(<ProvlappPanel s={s} amneId="am" lektionsIndex={2} farg="#b5532c" notis="" sattNotis={() => {}} />));
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Generera provlapp'))!.click(); });
    const vy = div.querySelector('[role="document"]')!;
    expect(vy.textContent).toContain('Sammanfattning: Bråk är delar av en helhet.');
    expect(vy.textContent).toContain('Djup: Förklara i flera led varför 1/2 = 2/4.');
    expect(vy.textContent).toContain('Labb (E): Labb: vad söker vi');
    expect(vy.querySelector('a[href="https://app.binogi.se/l/brak"]')!.textContent).toBe('Bråk på Binogi');
  });
  it('Word: labb och filmlänk som hyperlänk', async () => {
    const p = provlapp(bygg209(), 'am', 2, '2026-09-14')!;
    const zip = await JSZip.loadAsync(await Packer.toBuffer(provlappDokument(p, '#b5532c')));
    const text = (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    expect(text).toContain('Labb (E): Labb: vad söker vi');
    expect(text).toContain('Bråk på Binogi');
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('https://app.binogi.se/l/brak');
  });
});
