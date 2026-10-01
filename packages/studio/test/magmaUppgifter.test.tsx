// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { byggKapitel, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, sparaBok, tomStruktur, type Bok, type MagmaPdfItem, type Struktur } from '@planner/kernel';
import { MagmaImport } from '../src/MagmaImport';
import { sparaStruktur } from '../src/store';

// Resultatfil (xlsx) med fyra uppgifter: Anna 4/4, Omar 1/4 (bara uppgift 2 rätt) — fejkade namn
const FEJK_MAGMA: Array<Array<string | number | null>> = [
  ['', '', '1', '2', '3', '4'],
  ['Anna', 'Berg', 1, 1, 1, 1],
  ['Omar', 'Ali', 0, 1, 0, 0],
];
vi.mock('xlsx', () => ({
  read: () => ({ SheetNames: ['2026-09-30'], Sheets: { '2026-09-30': {} } }),
  utils: { sheet_to_json: () => FEJK_MAGMA },
}));
// Testets PDF i Magmas layout (egna uppgifter): division, potens, problem, resonemang
const i = (text: string, x: number, y: number, h: number, sida = 1): MagmaPdfItem => ({ text, x, y, h, sida });
const PDF: MagmaPdfItem[] = [
  i('8b 1.4 - 1.5', 42, 813, 9), i('Hej, jag heter', 310, 815, 9),
  i('1', 21, 743, 10), i('3', 18, 714, 14), i('/', 29, 714, 14), i('2', 42, 723, 14), i('5', 42, 708, 14), i('=', 55, 714, 14), i('Svar', 358, 570, 10),
  i('2', 21, 487, 10), i('Skriv talet utan potens och beräkna värdet.', 18, 468, 10), i('0,4', 18, 451, 14), i('2', 37, 455, 10), i('=', 47, 451, 14),
  i('8b 1.4 - 1.5', 42, 813, 9, 2),
  i('3', 21, 743, 10, 2), i('Du häller upp hälften av mjölken.', 18, 583, 10, 2), i('Hur mycket mjölk häller du upp?', 18, 569, 10, 2),
  i('4', 21, 487, 10, 2), i('Blir svaret större om du dividerar med 1/3', 18, 468, 10, 2), i('än med 3? Visa hur du tänker.', 18, 454, 10, 2), i('Välj en', 18, 397, 10, 2),
];
vi.mock('../src/pdfLasare', () => ({ lasPdfAllaSidor: async () => PDF, lasPdfItems: async () => [] }));

const TOM = { sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—', niva1: '—', niva2: '—', niva3: '—' };
const BOK: Bok = {
  id: 'ma-y', titel: 'Matematik Y', forlag: 'Liber', amne: 'Matematik', arskurs: 8, nivaer: { niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' },
  kapitel: [byggKapitel(1, 'Tal', '#b5532c', [
    { id: 1, typ: 'regular', avsnitt: '1.3 Multiplikation av bråk', del: 1, ...TOM },
    { id: 2, typ: 'regular', avsnitt: '1.4 Division av bråk', del: 1, ...TOM },
    { id: 3, typ: 'regular', avsnitt: '1.5 Potenser', del: 1, ...TOM, begrepp: 'potens, bas, exponent' },
  ])],
};

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: BOK.id, schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  return s;
}
const sov = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 153 · Magma-uppgifter ur PDF och analys per delkapitel', () => {
  it('PDF + resultatfil → uppgifter klassade, diagram per delkapitel/förmåga och vad eleven behöver förbättra; klassningen kan ändras', async () => {
    let s = bygg();
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<MagmaImport s={s} klass={s.klasser[0]} amne={s.amnen[0]} kor={kor} />));
    rendera();

    const pdf = div.querySelector('input[aria-label="Magma-PDF:er"]') as HTMLInputElement;
    Object.defineProperty(pdf, 'files', { value: [new File(['x'], '8b_1.4_-_1.5.pdf')] });
    await act(async () => { pdf.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); await sov(); });
    expect(s.magmaTester).toHaveLength(1);
    expect(s.magmaTester![0].uppgifter.map((u) => [u.delkapitel, u.formagor.join('')])).toEqual([['1.4', 'M'], ['1.5', 'M'], ['1.4', 'P'], ['1.4', 'R']]);
    expect(div.textContent).toContain('inga — importera resultatfilen med samma namn');

    const xlsx = div.querySelector('input[aria-label="Magma-filer"]') as HTMLInputElement;
    Object.defineProperty(xlsx, 'files', { value: [new File(['x'], '8b_1.4_-_1.5.xlsx')] });
    await act(async () => { xlsx.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); });
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 1 Magma-prov'))!.click(); });
    expect(div.textContent).toContain('2 elever');

    expect(div.querySelector('svg[aria-label="Magma per delkapitel och förmåga"]')).not.toBeNull();
    const tabell = div.querySelector('.st-magma-dktabell')!;
    const omar = [...tabell.querySelectorAll('tr')].find((r) => r.textContent?.includes('Omar Ali'))!;
    expect([...omar.querySelectorAll('td')].map((c) => c.textContent)).toEqual(['Omar Ali', '0', '100', '50', '0', '0', '1.4']);   // 1.4 · 1.5 · M · P · R · behöver förbättra
    expect(div.textContent).toContain('Svåraste uppgifterna');

    // Läraren flyttar uppgift 3 till 1.3 — gäller överallt och analysen räknar om
    await act(async () => { (div.querySelector('button[aria-expanded="false"]') as HTMLButtonElement).click(); });
    const sel = div.querySelector('select[aria-label="Delkapitel för uppgift 3"]') as HTMLSelectElement;
    expect(sel.value).toBe('1.4');
    await act(async () => { sel.value = '1.3'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(Object.values(s.magmaKlassning ?? {})).toEqual([{ delkapitel: '1.3', formagor: ['P'] }]);
    const rubriker = [...div.querySelectorAll('.st-magma-dktabell th')].map((th) => th.textContent);
    expect(rubriker.slice(0, 4)).toEqual(['Elev', '1.3', '1.4', '1.5']);
  });
});
