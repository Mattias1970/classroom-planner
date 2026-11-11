// @vitest-environment jsdom
/**
 * Del 244 · 📋 Rapportlistan i appen: listan från Socrative klistras in, läget visas per rum, filer släpps i
 * rutan — och en fil från ett rum som inte är vårt sorteras bort.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { lasStruktur, sparaStruktur } from '../src/store';

const B_NAMN = ['Tove Testsson', 'Sam Provlund', 'Elsa Övnegård', 'Hugo Ali'];
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'kb', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi-kb', klassId: 'kb', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  B_NAMN.forEach((n, i) => { s = laggTillElev(s, { id: `kb-${i}`, klassId: 'kb', namn: n, grupp: 'A' }); });
  return s;
}
function rapport(filnamn: string, quiz: string, rum: string): File {
  const soc = (n: string) => { const [f, ...e] = n.split(' '); return `${e.join(' ')}, ${f}`; };
  const fragor = ['Läran om samspelet i naturen.', 'En naturtyp med en viss sorts växter och djur.'];
  const ark = XLSX.utils.aoa_to_sheet([
    [quiz], ['Mon Sep 21 2026'], [rum], [], [],
    ['Presence', 'Student Name', 'Student ID', 'Score (%)', 'Score (#)', ...fragor],
    [null, null, null, null, 2, '1 point', '1 point'],
    ...B_NAMN.map((n) => ['Yes', soc(n), n.split(' ')[0].toUpperCase(), '100', 2, 'A. Ekologi', 'B. Biotop']),
  ]);
  const bok = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(bok, ark, 'Rapport');
  return new File([XLSX.write(bok, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], filnamn);
}
const vanta = async (varv = 6) => { for (let i = 0; i < varv; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const knapp = (host: Element, text: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof text === 'string' ? (b.textContent ?? '').includes(text) : text.test(b.textContent ?? ''))) as HTMLButtonElement | undefined;
const skriv = (el: HTMLTextAreaElement, v: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
/** Släpper filer i rutan (jsdom saknar DataTransfer — händelsen får filerna direkt). */
async function slapp(host: HTMLElement, filer: File[]) {
  const ruta = host.querySelector('[aria-label="Släpp Socrative-filer här"]')!;
  const e = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { files: filer } });
  await act(async () => { ruta.dispatchEvent(e); await new Promise((r) => setTimeout(r, 0)); });
  await vanta();
}
const rad = (tabell: Element, rum: string) => [...tabell.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td')?.textContent === rum)!;
const celler = (tr: Element) => [...tr.querySelectorAll('td')].map((td) => td.textContent);

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; });

const LISTA = ['NAME', 'DATE', 'ROOM', 'TYPE',
  'Läxa 6.1', '9/21/2026', '10:19 AM', 'BIOLOGI8BB', 'Quiz',
  'Exit 6.2', '9/21/2026', '10:44 AM', 'BIOLOGI8BB', 'Quiz',
  'Samhälle och styrning', '10/8/2026', '11:58 AM', 'SO8BB', 'Quiz'].join('\n');

describe('Del 244 · rapportlistan och uppladdningen', () => {
  it('listan klistras in, läget visas per rum, filerna släpps i rutan — och ett annat rum sorteras bort', async () => {
    sparaStruktur(bygg());
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'resultat' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    const panel = host.querySelector('[aria-label="Rapportlista"]')!;
    expect(panel.textContent).toContain('ingen lista inläst');

    // 1. Klistra in listan från Socrative
    act(() => { knapp(panel, 'Klistra in listan')!.click(); });
    skriv(panel.querySelector('textarea[aria-label="Rapportlista från Socrative"]') as HTMLTextAreaElement, LISTA);
    act(() => { knapp(panel, 'Läs in 3 rapporter')!.click(); });
    expect(lasStruktur().socrativeRapporter).toHaveLength(3);
    let tabell = host.querySelector('table[aria-label="Rapporter per rum"]')!;
    //                                   rum           hör till                  rapporter inlästa läxf exit övn fåsvar saknas
    expect(celler(rad(tabell, 'BIOLOGI8BB'))).toEqual(['BIOLOGI8BB', '8B Biologi · klassrum', '2', '0', '0', '0', '0', '0', '2']);
    expect(celler(rad(tabell, 'SO8BB')).slice(0, 4)).toEqual(['SO8BB', 'annat rum — sorteras bort', '1', 'behöver inte laddas upp']);
    expect(host.querySelector('table[aria-label="Rapporter som saknas"]')!.textContent).toContain('Läxa 6.1');
    expect(host.querySelector('table[aria-label="Rapporter som saknas"]')!.textContent).not.toContain('Samhälle');

    // 2. Släpp två filer: en av våra och en från SO-rummet
    await slapp(host, [rapport('Class_2026_09_21__07_13_QZ_Läxa 6.1.xlsx', 'Läxa 6.1', 'BIOLOGI8BB'), rapport('Class_2026_10_08__09_30_QZ_Samhälle och styrning.xlsx', 'Samhälle och styrning', 'SO8BB')]);
    const granskning = [...host.querySelectorAll('table.st-tabell')].find((t) => t.textContent?.includes('Tolkning'))!;
    expect(granskning.textContent).toContain('📋 i listan');
    expect(granskning.textContent).toContain('annat rum (SO8BB) — sorteras bort');
    // rummet är klassens, men planering saknas i testet — läraren väljer typ
    const typ = host.querySelector('select[aria-label="Typ för Class_2026_09_21__07_13_QZ_Läxa 6.1.xlsx"]') as HTMLSelectElement;
    await act(async () => { typ.value = 'socrative-laxforhor'; typ.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { knapp(host, /Importera 1 fil/)!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await vanta();
    expect((lasStruktur().filregister ?? []).map((f) => f.rum)).toEqual(['BIOLOGI8BB']);

    // 3. Läget uppdateras: ett riktigt läxförhör inläst, ett kvar att ladda upp
    tabell = host.querySelector('table[aria-label="Rapporter per rum"]')!;
    expect(celler(rad(tabell, 'BIOLOGI8BB'))).toEqual(['BIOLOGI8BB', '8B Biologi · klassrum', '2', '1', '1', '0', '0', '0', '1']);
    const saknas = host.querySelector('table[aria-label="Rapporter som saknas"]')!;
    expect(saknas.textContent).toContain('Exit 6.2');
    expect(saknas.textContent).not.toContain('Läxa 6.1');
  });
});
