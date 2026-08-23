// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import { lasStruktur } from '../src/store';
import { resetIdRaknare } from '@planner/kernel';

vi.mock('xlsx', () => ({ utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} }));

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

function render(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(<App />); });
  return host;
}
const inSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const taSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
const seSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
function skriv(el: HTMLInputElement, v: string) { act(() => { inSetter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
function skrivArea(el: HTMLTextAreaElement, v: string) { act(() => { taSetter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
function valj(el: HTMLSelectElement, v: string) { act(() => { seSetter.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); }); }
function knapp(host: HTMLElement, text: string): HTMLButtonElement {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`Hittar inte knappen "${text}"`);
  return b;
}
const input = (host: HTMLElement, label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const select = (host: HTMLElement, label: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;

const BOKJSON = JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'liber-matematik-y', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8,
    kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8', två: '9–16', tre: '—', sidor_teori: 's. 10–13', begrepp: 'täljare, nämnare' },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '—', två: '17–24', tre: '25–32', sidor_teori: 's. 13–15' },
  ] },
});

/** Importerar boken genom filväljaren i trädet. */
async function importeraBok(host: HTMLElement) {
  const fil = new File([BOKJSON], 'book.json', { type: 'application/json' });
  const inp = [...host.querySelectorAll<HTMLInputElement>('input[type="file"]')]
    .find((x) => x.accept.includes('.json'))!;
  Object.defineProperty(inp, 'files', { value: [fil] });
  await act(async () => { inp.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

describe('Studio v2 — hela kedjan', () => {
  it('skolår → kalendarium → tjänst → klass → ämne (eget schema) → bok → planering med datum', async () => {
    const host = render();

    // 1. Skolår
    skriv(input(host, 'Skolårets namn'), 'Läsåret 2026/2027');
    skriv(input(host, 'Start'), '2026-08-17');
    skriv(input(host, 'Slut'), '2027-06-11');
    act(() => { knapp(host, '➕ Skolår').click(); });
    expect(lasStruktur().skolar).toHaveLength(1);
    act(() => { knapp(host, 'Läsåret 2026/2027').click(); });

    // 2. Kalendarium: temadag + höstlov (tar bort onsdagspass 19/8 resp. v.44)
    skrivArea(host.querySelector('textarea[aria-label="Kalendariumtext"]')!, '2026-08-19 Temadag\n2026-10-26--2026-10-30 Höstlov');
    act(() => { knapp(host, 'Lägg till från text').click(); });
    expect(lasStruktur().skolar[0].dagar).toHaveLength(6);
    expect(host.textContent).toContain('Höstlov');

    // 3. Bok importeras fristående (utan koppling till schema/lärare/klass)
    await importeraBok(host);
    expect(lasStruktur().bocker.map((b) => b.titel)).toEqual(['Matematik Y']);
    expect(host.textContent).toContain('utan koppling till schema');

    // 4. Tjänst (utan lärare) → klass
    skriv(input(host, 'Tjänstens namn'), 'Ma åk 8');
    act(() => { knapp(host, '➕ Tjänst').click(); });
    act(() => { knapp(host, 'Ma åk 8').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Klass').click(); });
    act(() => { knapp(host, '8B').click(); });

    // 5. Ämne med eget schema (onsdag 09:00) + bok
    skriv(input(host, 'Ämnets namn'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    const amne = lasStruktur().amnen[0];
    expect(amne).toMatchObject({ namn: 'Matematik', bokId: 'liber-matematik-y' });
    expect(amne.schema).toEqual([{ dag: 3, start: '09:00', slut: '10:00' }]);

    // 6. Planeringen visas direkt: temadag 19/8 hoppas — första lektionen 26/8
    expect(host.textContent).toContain('2026-08-26');
    expect(host.textContent).toContain('1.1 Bråk');
    expect(host.textContent).toContain('ETT'); // bokens nivånamn i tabellhuvudet
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    expect(lasStruktur().planeringar).toHaveLength(1);
    expect(host.textContent).toContain('2 lektioner får datum');
  });

  it('lärare kopplas till tjänsten och får härlett schema; ämnen planeras utan lärare', async () => {
    const host = render();
    skriv(input(host, 'Skolårets namn'), '2026/2027');
    act(() => { knapp(host, '➕ Skolår').click(); });
    act(() => { knapp(host, '2026/2027').click(); });
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Tjänst').click(); });
    act(() => { knapp(host, 'Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Klass').click(); });
    act(() => { knapp(host, '8B').click(); });
    skriv(input(host, 'Ämnets namn'), 'Matematik');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); }); // default måndag 08:10 — inget bokval, ingen lärare
    expect(lasStruktur().amnen).toHaveLength(1);

    // Lärare läggs till och kopplas — schemat härleds ur ämnespasset
    act(() => { knapp(host, '🧑‍🏫 Lärare').click(); });
    skriv(input(host, 'Lärarens namn'), 'Mattias');
    skriv(input(host, 'Signatur'), 'MT');
    act(() => { knapp(host, '➕ Lärare').click(); });
    act(() => { knapp(host, '💼 Ma').click(); });
    valj(select(host, 'Lärare för tjänsten'), lasStruktur().larare[0].id);
    act(() => { knapp(host, '🧑‍🏫 Lärare').click(); });
    expect(host.textContent).toContain('Måndag');
    expect(host.textContent).toContain('08:10–09:10');
    expect(host.textContent).toContain('8B');
  });

  it('ämne utan giltigt pass kan inte skapas — knappen är låst tills schema angetts', async () => {
    const host = render();
    skriv(input(host, 'Skolårets namn'), '2026/2027');
    act(() => { knapp(host, '➕ Skolår').click(); });
    act(() => { knapp(host, '2026/2027').click(); });
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Tjänst').click(); });
    act(() => { knapp(host, 'Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Klass').click(); });
    act(() => { knapp(host, '8B').click(); });
    skriv(input(host, 'Ämnets namn'), 'Fysik');
    skriv(input(host, 'Slut pass 1'), '07:00'); // start 08:10 > slut ⇒ ogiltigt
    expect(knapp(host, '➕ Lägg till ämne').disabled).toBe(true);
    skriv(input(host, 'Slut pass 1'), '09:10');
    expect(knapp(host, '➕ Lägg till ämne').disabled).toBe(false);
  });

  it('bokpanelen visar sidregister-data, begrepp och flipp-resurser per kapitel', async () => {
    const host = render();
    await importeraBok(host);
    act(() => { knapp(host, '📗 Matematik Y').click(); });
    expect(host.textContent).toContain('s. 10–15');       // kapitlets sidspann
    expect(host.textContent).toContain('täljare, nämnare');
    act(() => { knapp(host, 'Öppna').click(); });
    expect(host.textContent).toContain('Flippat klassrum');
    // Film läggs till i kapitlets öppna filmlista
    skriv(input(host, 'Filmtitel'), 'Bråk — introduktion');
    skriv(input(host, 'Filmlänk'), 'https://example.com/brak');
    act(() => { knapp(host, '➕ Film').click(); });
    expect(lasStruktur().bocker[0].kapitel[0].resurser.filmer).toEqual([
      { titel: 'Bråk — introduktion', url: 'https://example.com/brak' },
    ]);
  });
});
