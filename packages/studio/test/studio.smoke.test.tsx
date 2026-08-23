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
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
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
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { knapp(host, 'Ma åk 8').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { knapp(host, '8B').click(); });

    // 5. Ämne med eget schema (onsdag 09:00) + bok
    valj(select(host, 'Ämne'), 'Matematik');
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
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
    act(() => { knapp(host, '2026/2027').click(); });
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { knapp(host, 'Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { knapp(host, '8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); }); // default måndag 08:10 — inget bokval, ingen lärare
    expect(lasStruktur().amnen).toHaveLength(1);

    // Lärare läggs till och kopplas — schemat härleds ur ämnespasset
    act(() => { knapp(host, '🧑‍🏫 Lärare').click(); });
    skriv(input(host, 'Lärarens namn'), 'Mattias');
    skriv(input(host, 'Signatur'), 'MT');
    act(() => { knapp(host, '➕ Lägg till lärare').click(); });
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
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
    act(() => { knapp(host, '2026/2027').click(); });
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { knapp(host, 'Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { knapp(host, '8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
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

describe('Lektionskort i planeringen', () => {
  it('klick på planeringsrad öppnar kort med tavelrubrik, BAM-tider, Socrative-rum, nivåer och begrepp', async () => {
    const host = render();
    skriv(input(host, 'Skolårets namn'), '2026/2027');
    skriv(input(host, 'Start'), '2026-08-17');
    skriv(input(host, 'Slut'), '2027-06-11');
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
    act(() => { knapp(host, '2026/2027').click(); });
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { knapp(host, 'Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });   // default Socrative-rum: Matte8B
    act(() => { knapp(host, '8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });

    // Öppna första radens lektionskort
    const rad = [...host.querySelectorAll('table.plan tbody tr')][0] as HTMLTableRowElement;
    act(() => { rad.click(); });
    const kort = host.querySelector('[data-testid="lektionskort"]')!;
    expect(kort.textContent).toContain('Matematik 09:00–10:00');          // tavelrubriken
    expect(kort.textContent).toContain('Läxförhör');
    expect(kort.textContent).toContain('Matte8BA · Matte8BB');             // Socrative-rum per grupp
    expect(kort.textContent).toContain('09:50–10:00');                     // exit ticket-tid
    expect(kort.textContent).toContain('ETT – INTRODUKTION');              // bokens nivånamn
    expect(kort.textContent).toContain('minimum: ETT');                    // del 1
    expect(kort.textContent).toContain('täljare');                         // delkapitlets begrepp
    expect(kort.textContent).toContain('Teams, Classroom m.fl.');          // plattformsneutral inlämning
    // Del 2-raden: minimum TVÅ
    act(() => { rad.click(); });                                           // stäng
    const rad2 = [...host.querySelectorAll('table.plan tbody tr')][1] as HTMLTableRowElement;
    act(() => { rad2.click(); });
    expect(host.querySelector('[data-testid="lektionskort"]')!.textContent).toContain('minimum: TVÅ');
  });
});

describe('Spara-knappar och automatisk nästa veckodag', () => {
  async function tillKlass(host: HTMLElement) {
    skriv(input(host, 'Skolårets namn'), '2026/2027');
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
    act(() => { knapp(host, '2026/2027').click(); });
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { knapp(host, 'Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { knapp(host, '8B').click(); });
  }

  it('➕ Pass hoppar till nästa veckodag med samma tider; fredag slår om till måndag', async () => {
    const host = render();
    await tillKlass(host);
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Pass').click(); });          // mån → tis
    expect(select(host, 'Veckodag pass 2').value).toBe('2');
    expect(input(host, 'Start pass 2').value).toBe('09:00'); // tider kopieras
    valj(select(host, 'Veckodag pass 2'), '5');
    act(() => { knapp(host, '➕ Pass').click(); });          // fre → mån (omslag)
    expect(select(host, 'Veckodag pass 3').value).toBe('1');
  });

  it('elever läggs till med grupp; elevens lektioner följer gruppen', async () => {
    const host = render();
    await tillKlass(host);
    // Halvklassämne: Biologi med Grupp A (tis) och Grupp B (tor)
    valj(select(host, 'Ämne'), 'Biologi');
    valj(select(host, 'Veckodag pass 1'), '2');
    valj(select(host, 'Grupp B veckodag pass 1'), '4');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '8B').click(); });        // tillbaka till klassen
    skriv(input(host, 'Elevens namn'), 'Alva');
    act(() => { knapp(host, '➕ Lägg till elev').click(); });     // Grupp A
    skriv(input(host, 'Elevens namn'), 'Bo');
    valj(select(host, 'Grupp för ny elev'), 'B');
    act(() => { knapp(host, '➕ Lägg till elev').click(); });
    expect(lasStruktur().elever.map((e) => `${e.namn}:${e.grupp}`)).toEqual(['Alva:A', 'Bo:B']);
    expect(host.textContent).toContain('Grupp A: 1 · Grupp B: 1');
    // Alvas schema: tisdag (Grupp A), rum Biologi8BA
    const visa = [...host.querySelectorAll('button[title="Visa elevens lektioner"]')][0] as HTMLButtonElement;
    act(() => { visa.click(); });
    expect(host.textContent).toContain('Tisdag');
    expect(host.textContent).toContain('Biologi8BA');
    expect(host.textContent).not.toContain('Torsdag 08:10');
    // Byt Alva till Grupp B — schemat följer med
    valj(select(host, 'Grupp för Alva'), 'B');
    act(() => { visa.click(); }); act(() => { visa.click(); });
    expect(host.textContent).toContain('Biologi8BB');
  });

  it('ämnets schema redigeras, sparas uttryckligen och planeringen räknas om', async () => {
    const host = render();
    await tillKlass(host);
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    expect(host.textContent).toContain('2026-08-19');            // onsdag
    // Ändra till torsdag — osparad markering syns, planeringen orörd
    valj(select(host, 'Veckodag pass 1'), '4');
    expect(host.textContent).toContain('osparade ändringar');
    expect(lasStruktur().amnen[0].schema[0].dag).toBe(3);
    // Spara — kvitto + omräknade datum
    act(() => { knapp(host, '💾 Spara schema').click(); });
    expect(lasStruktur().amnen[0].schema[0].dag).toBe(4);
    expect(host.textContent).toContain('✓ Sparat!');
    expect(host.textContent).toContain('2026-08-20');            // torsdag
    expect(host.textContent).not.toContain('2026-08-19');
  });
});

describe('Skolår: redigering och unika namn', () => {
  it('valt skolår kan redigeras och sparas; dubblettnamn avvisas', async () => {
    const host = render();
    skriv(input(host, 'Skolårets namn'), 'Läsåret 2026/2027');
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
    // Dubblettnamn vid tillägg avvisas med svenskt fel
    skriv(input(host, 'Skolårets namn'), 'läsåret 2026/2027');
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
    expect(host.textContent).toContain('finns redan');
    expect(lasStruktur().skolar).toHaveLength(1);
    // Redigera valt skolår
    act(() => { knapp(host, 'Läsåret 2026/2027').click(); });
    skriv(input(host, 'Redigera skolårets namn'), 'Läsåret 2027/2028');
    skriv(input(host, 'Redigera slut'), '2028-06-09');
    expect(host.textContent).toContain('osparade ändringar');
    act(() => { knapp(host, '💾 Spara skolår').click(); });
    expect(host.textContent).toContain('✓ Sparat!');
    expect(lasStruktur().skolar[0]).toMatchObject({ namn: 'Läsåret 2027/2028', slut: '2028-06-09' });
  });
});

describe('Halvklassämne i planeringen', () => {
  it('Biologi får Grupp A- och B-scheman, två planeringar och gruppmärkta lektionskort', async () => {
    const host = render();
    skriv(input(host, 'Skolårets namn'), '2026/2027');
    skriv(input(host, 'Start'), '2026-08-17');
    skriv(input(host, 'Slut'), '2027-06-11');
    act(() => { knapp(host, '➕ Lägg till skolår').click(); });
    act(() => { knapp(host, '2026/2027').click(); });
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { knapp(host, 'NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { knapp(host, '8B').click(); });

    valj(select(host, 'Ämne'), 'Biologi');
    expect(host.textContent).toContain('Grupp A · rum Biologi8BA');
    expect(host.textContent).toContain('Grupp B · rum Biologi8BB');
    valj(select(host, 'Veckodag pass 1'), '2');            // Grupp A: tisdag
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Grupp B veckodag pass 1'), '4');    // Grupp B: torsdag
    skriv(input(host, 'Grupp B start pass 1'), '13:00');
    skriv(input(host, 'Grupp B slut pass 1'), '14:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });

    const amne = lasStruktur().amnen[0];
    expect(amne).toMatchObject({ namn: 'Biologi', halvklass: true });
    expect(amne.schemaB).toEqual([{ dag: 4, start: '13:00', slut: '14:00' }]);
    // Bok saknas för Biologi (Matematik Y filtreras bort) — koppla ändå via ämnespanelens bokval? Nej:
    // bokväljaren i ämnespanelen visar alla böcker; välj Matematik Y för planeringstestet.
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    expect(host.textContent).toContain('Grupp A · rum Biologi8BA');
    expect(host.textContent).toContain('2026-08-18');       // tisdag (Grupp A)
    expect(host.textContent).toContain('2026-08-20');       // torsdag (Grupp B)
    // Grupp B:s första rad → kort märkt Grupp B med rum Biologi8BB och exit 13:50
    const tabeller = [...host.querySelectorAll('table.plan')];
    expect(tabeller).toHaveLength(2);
    const radB = tabeller[1].querySelector('tbody tr') as HTMLTableRowElement;
    act(() => { radB.click(); });
    const kort = host.querySelector('[data-testid="lektionskort"]')!;
    expect(kort.textContent).toContain('Grupp B');
    expect(kort.textContent).toContain('Biologi8BB');
    expect(kort.textContent).toContain('13:50–14:00');
  });
});
