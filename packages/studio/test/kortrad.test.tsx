// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { amnesPlanFor, bokFromImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { Kortrad } from '../src/Kortrad';
import { sparaStruktur } from '../src/store';

function bygg(): Struktur {
  const BOK = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'b', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
    lektioner: { '1': [1, 2, 3, 4].map((i) => ({ id: i, type: 'regular', avsnitt: `1.${i} Avsnitt`, del: 1 })) },
  }));
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'b', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'b', skapad: '2026-08-10' });
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; Element.prototype.scrollIntoView = vi.fn(); });

describe('Del 202 · Kortraden', () => {
  it('korten i veckor med karta; klick öppnar lektionen; ➕ lägger in efter; drag flyttar; 🗑 tar bort', async () => {
    let s = bygg(); sparaStruktur(s);
    const idag = '2026-08-17';
    const oppnade: number[] = [];
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const rendera = () => act(() => root.render(<Kortrad s={s} amneId="ma" bok={s.bocker[0]} plan={amnesPlanFor(s, 'ma', idag)!.a} idag={idag} kor={kor} oppnaLektion={(i) => oppnade.push(i)} />));
    rendera();
    const rubriker = () => [...div.querySelectorAll('.kortrad-kort-rubrik')].map((e) => e.textContent);
    expect(rubriker()).toEqual(['1.1 Avsnitt', '1.2 Avsnitt', '1.3 Avsnitt', '1.4 Avsnitt']);
    expect([...div.querySelectorAll('.kortrad-vecka-rubrik')].map((e) => e.textContent)).toEqual(['v.34 ons 19 aug', 'v.35 ons 26 aug', 'v.36 ons 2 sep', 'v.37 ons 9 sep']);
    expect(div.querySelectorAll('.kortrad-karta-kort')).toHaveLength(4);
    // Klick → lektionssidan
    await act(async () => { (div.querySelector('[aria-label="Lektion 2: 1.2 Avsnitt"]') as HTMLElement).click(); });
    expect(oppnade).toEqual([1]);
    // ➕ efter 1.1
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Repetition');
    await act(async () => { (div.querySelector('[aria-label="Lägg till lektion efter 1"]') as HTMLButtonElement).click(); });
    expect(rubriker()).toEqual(['1.1 Avsnitt', 'Repetition', '1.2 Avsnitt', '1.3 Avsnitt', '1.4 Avsnitt']);
    // Drag 1.4 → efter 1.1
    const dt = { effectAllowed: '', setData: vi.fn(), getData: () => '1:4' };
    await act(async () => {
      const fran = div.querySelector('[aria-label="Lektion 5: 1.4 Avsnitt"]') as HTMLElement;
      fran.dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer: dt }));
    });
    await act(async () => {
      const till = div.querySelector('[aria-label="Lektion 1: 1.1 Avsnitt"]') as HTMLElement;
      till.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: dt }));
    });
    expect(rubriker()).toEqual(['1.1 Avsnitt', '1.4 Avsnitt', 'Repetition', '1.2 Avsnitt', '1.3 Avsnitt']);
    // 🗑 på Repetition
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => { (div.querySelector('[aria-label="Ta bort lektion 3"]') as HTMLButtonElement).click(); });
    expect(rubriker()).toEqual(['1.1 Avsnitt', '1.4 Avsnitt', '1.2 Avsnitt', '1.3 Avsnitt']);
    // Vertikal
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Vertikal'))!.click(); });
    expect(div.querySelector('.kortrad-vertikal')).not.toBeNull();
    prompt.mockRestore(); confirm.mockRestore();
  });
});
