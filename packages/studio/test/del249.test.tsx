// @vitest-environment jsdom
/**
 * Del 249 · Frågematrisen: frågor ur olika kapitel blandas inte ihop. En kapitel 6-fråga som prövar samma kunskap
 * som en kapitel 4-fråga står i kapitel 6, med lila-blå ram och en länk bakåt.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type FragaSvar, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

const CELL_V1 = 'Nedbrytningen av sockermolekyler för att frigöra energi.';
const CELL_V2 = 'Den kemiska reaktion i cellen som omvandlar glukos och syre till koldioxid och vatten.';
const FOTO = 'Växternas sätt att bilda socker med hjälp av solljus.';
const KARNA = 'Cellens chef som styr det mesta som händer i cellen.';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Provlund', grupp: 'A' });
  const sv = (par: Array<[string, string, boolean]>): FragaSvar[] => par.map(([fraga, facit, ratt]) => ({ fraga, svar: ratt ? facit : 'X. fel', ratt, facit }));
  const imp = (prov: string, datum: string, anna: FragaSvar[], omar: FragaSvar[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov, datum, tid: '10:13', rum: 'BIOLOGI8BB', rader: [
      { namn: 'Anna Testsson', poang: anna.filter((x) => x.ratt).length, maxPoang: anna.length, svar: anna },
      { namn: 'Omar Provlund', poang: omar.filter((x) => x.ratt).length, maxPoang: omar.length, svar: omar },
    ] }).s;
  };
  imp('Biologi 4.2 Begrepp', '2026-08-24', sv([[CELL_V1, 'A. Cellandning', true], [FOTO, 'B. Fotosyntes', true]]), sv([[CELL_V1, 'A. Cellandning', false], [FOTO, 'B. Fotosyntes', true]]));
  imp('6.1 Begrepp + cellens delar', '2026-09-17', sv([[CELL_V2, 'C. Cellandning', true], [KARNA, 'D. Cellkärna', true]]), sv([[CELL_V2, 'C. Cellandning', true], [KARNA, 'D. Cellkärna', false]]));
  return s;
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; });

function starta(omfang: 'kapitel' | 'allt'): HTMLElement {
  localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
  localStorage.setItem('st.kallor', JSON.stringify(['socrative-laxforhor', 'socrative-exit']));
  localStorage.setItem('st.omfang', JSON.stringify(omfang));
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'resultat' }));
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  const amne = host.querySelector('select[aria-label="SuperTeach ämne"]') as HTMLSelectElement;
  act(() => { amne.value = 'bi'; amne.dispatchEvent(new Event('change', { bubbles: true })); });
  return host;
}

describe('Del 249 · frågematrisen håller isär kapitlen', () => {
  it('kapitel 6-frågan står i kapitel 6 med lila-blå ram; klicket visar länken till kapitel 4', () => {
    const host = starta('allt');

    const tabell = host.querySelector('.st-fmtabell')!;
    // Huvudet: två frågor per kapitel — kapitel 4 har bara sina egna
    expect([...tabell.querySelectorAll('thead th.st-fmgrupp')].map((th) => th.querySelector('small')!.textContent!.split(' · ').slice(0, 2).join(' · '))).toEqual(['4.2 · 2 frågor', '6.1 · 2 frågor']);
    const nummer = [...tabell.querySelectorAll('thead th.st-fmnr')];
    expect(nummer.map((th) => [th.textContent, th.classList.contains('repris')])).toEqual([['1', false], ['2', false], ['3', true], ['4', false]]);
    expect(nummer[2].getAttribute('title')).toContain('↺ samma kunskap som fråga 1 i kapitel 4');

    // Rutorna: kapitel 4-förhöret har inget i kapitel 6-kolumnerna och tvärtom; bara den ställda rutan får ramen
    const rader = [...tabell.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td.st-fmruta')]);
    const titel = (td: Element) => td.getAttribute('title')!;
    const kap4 = rader.find((r) => titel(r[0]).includes('% rätt'))!;
    const kap6 = rader.find((r) => titel(r[2]).includes('% rätt'))!;
    expect(kap4.map((td) => td.classList.contains('repris'))).toEqual([false, false, false, false]);
    expect(titel(kap4[2])).toContain('ingick inte i Biologi 4.2 Begrepp');
    expect(kap6.map((td) => td.classList.contains('repris'))).toEqual([false, false, true, false]);
    expect(titel(kap6[0])).toContain('ingick inte i 6.1 Begrepp + cellens delar');
    expect(titel(kap6[2])).toContain('100 % rätt (2/2) · ↺ samma kunskap som fråga 1 i kapitel 4');
    expect(titel(kap4[0])).toContain('50 % rätt (1/2)');
    expect(host.querySelector('[aria-label="Förklaring samma kunskap"]')!.textContent).toContain('Lila-blå ram = samma kunskap som i ett tidigare kapitel');

    // Klick på kapitel 6-frågan: frågan, rätt svar och länken bakåt med resultatet då
    act(() => { (kap6[2] as HTMLElement).click(); });
    const vald = host.querySelector('.st-fmvald')!;
    expect(vald.textContent).toContain(CELL_V2);
    const lank = vald.querySelector('[aria-label="Samma kunskap i ett tidigare kapitel"]')!;
    expect(lank.textContent).toContain('↺ Samma kunskap som i kapitel 4 — fråga 1');
    expect(lank.textContent).toContain(CELL_V1);
    expect(lank.textContent).toContain('Biologi 4.2 Begrepp: 50 %');
    // … och därifrån till den tidigare frågan, som inte har någon länk
    act(() => { [...lank.querySelectorAll('button')].find((b) => b.textContent === 'visa fråga 1')!.click(); });
    expect(host.querySelector('.st-fmvald')!.textContent).toContain(CELL_V1);
    expect(host.querySelector('[aria-label="Samma kunskap i ett tidigare kapitel"]')).toBeNull();
  });

  it('visas bara det aktiva kapitlet finns ramen och länken kvar, fast kapitel 4 inte står i matrisen', () => {
    const host = starta('kapitel');
    const tabell = host.querySelector('.st-fmtabell')!;
    expect([...tabell.querySelectorAll('thead th.st-fmgrupp')].map((th) => th.querySelector('small')!.textContent!.split(' · ')[0])).toEqual(['6.1']);
    const nummer = [...tabell.querySelectorAll('thead th.st-fmnr')];
    expect(nummer.map((th) => th.classList.contains('repris'))).toEqual([true, false]);
    expect(nummer[0].getAttribute('title')).toContain('↺ samma kunskap som i kapitel 4');
    act(() => { (tabell.querySelector('tbody td.st-fmruta.repris') as HTMLElement).click(); });
    const lank = host.querySelector('[aria-label="Samma kunskap i ett tidigare kapitel"]')!;
    expect(lank.textContent).toContain('↺ Samma kunskap som i kapitel 4');
    expect(lank.textContent).toContain(CELL_V1);
    expect(lank.textContent).not.toContain('Då:');
  });
});
