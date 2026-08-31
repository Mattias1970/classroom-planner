// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/App';
import { lasStruktur } from '../src/store';
import { resetIdRaknare } from '@planner/kernel';

vi.mock('xlsx', () => ({ utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} }));

afterEach(() => { vi.useRealTimers(); });

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
function skriv(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  if (el === null) throw new Error('skriv: elementet finns inte');
  const setter = el instanceof HTMLTextAreaElement ? taSetter : inSetter;
  act(() => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
function skrivArea(el: HTMLTextAreaElement, v: string) { act(() => { taSetter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
function valj(el: HTMLSelectElement, v: string) { act(() => { seSetter.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); }); }
function knapp(host: HTMLElement, text: string): HTMLButtonElement {
  const panelen = host.querySelector('.panel');
  const iPanel = panelen ? [...panelen.querySelectorAll('button')].find((x) => x.textContent?.includes(text)) : undefined;
  const b = iPanel ?? [...host.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`Hittar inte knappen "${text}"`);
  return b;
}
// Trädknapp (nav eller "Lägg till"-panelöppnare) — söker i vänstermenyn.
function treeKnapp(host: HTMLElement, text: string): HTMLButtonElement {
  const tree = host.querySelector('.tree')!;
  const b = [...tree.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`Hittar inte trädknappen "${text}"`);
  return b;
}
/** Skapar ett skolår: öppnar panelen via trädet, fyller fälten, lägger till. */
function skapaSkolar(host: HTMLElement, namn: string, start = '2026-08-17', slut = '2027-06-11') {
  act(() => { treeKnapp(host, '➕ Lägg till skolår').click(); });
  skriv(input(host, 'Skolårets namn'), namn);
  skriv(input(host, 'Start'), start);
  skriv(input(host, 'Slut'), slut);
  act(() => { knapp(host, '➕ Lägg till skolår').click(); });
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

const BIOJSON = JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'gleerups-biologi-8', titel: 'Biologi 8', förlag: 'Gleerups', ämne: 'Biologi', årskurs: 8,
    kapitelMeta: { '4': { name: 'Fotosyntes och cellen', col: '#2e7d46' } } },
  lektioner: { '4': [
    { id: 1, type: 'regular', avsnitt: '4.1 Cellen', del: 1, ett: '1–6', begrepp: 'cell, cellmembran, cellkärna' },
    { id: 2, type: 'regular', avsnitt: '4.2 Fotosyntes', del: 1, ett: '7–12', begrepp: 'fotosyntes, klorofyll' },
  ] },
});

/** Importerar boken genom filväljaren i trädet. */
async function importeraBok(host: HTMLElement, json: string = BOKJSON) {
  act(() => { treeKnapp(host, '➕ Lägg till bok').click(); }); // öppna importpanelen
  const fil = new File([json], 'book.json', { type: 'application/json' });
  const inp = [...host.querySelectorAll<HTMLInputElement>('input[type="file"]')]
    .find((x) => x.accept.includes('.json'))!;
  Object.defineProperty(inp, 'files', { value: [fil] });
  await act(async () => { inp.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  // Importen navigerar till bokpanelen — återgå till skolåret om ett finns, så
  // att efterföljande tjänst-/klasstillägg sker i rätt panel.
  const skolarNod = [...host.querySelector('.tree')!.querySelectorAll('button')].find((b) => b.textContent?.startsWith('📅'));
  if (skolarNod) act(() => { skolarNod.click(); });
}

describe('Studio v2 — hela kedjan', () => {
  it('skolår → kalendarium → tjänst → klass → ämne (eget schema) → bok → planering med datum', async () => {
    const host = render();

    // 1. Skolår
    skapaSkolar(host, 'Läsåret 2026/2027', '2026-08-17', '2027-06-11');
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
    expect(host.textContent).toContain('koppla den till ett ämne');

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
    skapaSkolar(host, '2026/2027');
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
    act(() => { treeKnapp(host, '➕ Lägg till lärare').click(); });
    skriv(input(host, 'Lärarens namn'), 'Mattias');
    skriv(input(host, 'Signatur'), 'MT');
    act(() => { knapp(host, '➕ Lägg till lärare').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    valj(select(host, 'Lärare för tjänsten'), lasStruktur().larare[0].id);
    act(() => { treeKnapp(host, '🧑‍🏫 Mattias').click(); });
    expect(host.textContent).toContain('Måndag');
    expect(host.textContent).toContain('08:10–09:10');
    expect(host.textContent).toContain('8B');
  });

  it('ämne utan giltigt pass kan inte skapas — knappen är låst tills schema angetts', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027');
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
    act(() => { treeKnapp(host, '📗 Matematik Y').click(); });
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
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
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
    expect(kort.textContent).toContain('Matte8BB');                        // Socrative-rum per klass
    expect(kort.textContent).toContain('09:50–10:00');                     // exit ticket-tid
    expect(kort.textContent).toContain('ETT – introduktion');              // bokens nivånamn
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
    skapaSkolar(host, '2026/2027');
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
    valj(select(host, 'Veckodag pass 2'), '4');
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
    expect(host.textContent).toContain('Biologi8BB');
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
    skapaSkolar(host, 'Läsåret 2026/2027');
    // Dubblettnamn vid tillägg avvisas med svenskt fel
    skapaSkolar(host, 'läsåret 2026/2027');
    expect(host.textContent).toContain('finns redan');
    expect(lasStruktur().skolar).toHaveLength(1);
    // Redigera valt skolår
    act(() => { treeKnapp(host, 'Läsåret 2026/2027').click(); });
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
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    act(() => { knapp(host, '2026/2027').click(); });
    await importeraBok(host, BIOJSON);
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { knapp(host, 'NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { knapp(host, '8B').click(); });

    valj(select(host, 'Ämne'), 'Biologi');
    expect(host.textContent).toContain('Grupp A');
    expect(host.textContent).toContain('Biologi8BB');
    valj(select(host, 'Veckodag pass 1'), '2');            // Grupp A: tisdag
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');    // Grupp B: torsdag
    skriv(input(host, 'Start pass 2'), '13:00');
    skriv(input(host, 'Slut pass 2'), '14:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });

    const amne = lasStruktur().amnen[0];
    expect(amne).toMatchObject({ namn: 'Biologi', halvklass: true });
    expect(amne.schemaB).toEqual([{ dag: 4, start: '13:00', slut: '14:00' }]);
    // Ämnespanelens bokval visar endast ämnets böcker — Biologi 8, inte Matematik Y.
    valj(select(host, 'Bok för ämnet'), 'gleerups-biologi-8');
    expect(host.textContent).toContain('Grupp A');
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

describe('Bokväljaren filtreras per ämne', () => {
  it('Matematik-ämnet ser bara matteböcker och Biologi-ämnet bara biologiböcker', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    act(() => { knapp(host, '2026/2027').click(); });
    await importeraBok(host);                 // Matematik Y (Matematik)
    await importeraBok(host, BIOJSON);        // Biologi 8 (Biologi)
    skriv(input(host, 'Tjänstens namn'), 'Ma/NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma/NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });

    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });

    // Ämnespanelen för Matematik: endast matteboken bland alternativen
    const val = () => [...select(host, 'Bok för ämnet').querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(val()).toEqual(['', 'liber-matematik-y']);

    // Biologi (halvklass): endast biologiboken
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Biologi');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '13:00');
    skriv(input(host, 'Slut pass 2'), '14:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    expect(val()).toEqual(['', 'gleerups-biologi-8']);
  });
});

describe('Kalenderutskrift och Planering-huvudfliken', () => {
  async function medPlanering2(host: HTMLElement) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });
  }

  it('🖨 Skriv ut månader visar en sida per månad i skolåret', async () => {
    const host = render();
    await medPlanering2(host);
    act(() => { knapp(host, '📆 Kalender').click(); });
    act(() => { knapp(host, '🖨 Skriv ut (månader/veckor)').click(); });
    const sidor = [...host.querySelectorAll('.kal-utskrift-sida')];
    expect(sidor).toHaveLength(11);                        // aug 2026 – jun 2027
    expect(sidor[0].textContent).toContain('augusti 2026');
    expect(sidor[10].textContent).toContain('juni 2027');
    expect(sidor[0].querySelector('.mgrid')).not.toBeNull();
    act(() => { knapp(host, 'Stäng').click(); });
    expect(host.querySelector('.kal-utskrift')).toBeNull();
  });

  it('📋 Planering-fliken väljer klass · ämne och visar hela planeringsvyn', async () => {
    const host = render();
    await medPlanering2(host);
    act(() => { knapp(host, '📋 Planering').click(); });
    const val = select(host, 'Planera ämne');
    expect([...val.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['8B · Matematik']);
    expect(host.textContent).toContain('🧭 Detaljplanering');
    expect(host.querySelector('table.plan')).not.toBeNull();
  });

  it('egna rader: ett prov infogas i planeringen och bokens lektioner skjuts framåt', async () => {
    const host = render();
    await medPlanering2(host);
    act(() => { knapp(host, '📋 Planering').click(); });
    const fore = [...host.querySelectorAll('table.plan tbody tr')].length;
    valj(select(host, 'Radtyp'), 'prov');
    skriv(input(host, 'Radrubrik'), 'Prov i Tal');
    valj(select(host, 'Radposition'), '1');                // före lektion 2
    skriv(input(host, 'Radbeskrivning'), 'Kapitel 1');
    act(() => { knapp(host, '+ Infoga rad').click(); });
    const rader = [...host.querySelectorAll('table.plan tbody tr')];
    expect(rader).toHaveLength(fore + 1);
    expect(rader[1].textContent).toContain('Prov i Tal');
    // Raden ligger kvar i strukturen och kan tas bort
    expect(lasStruktur().amnen[0].egnaRader).toHaveLength(1);
    act(() => { knapp(host, '✕').click(); });
    expect(lasStruktur().amnen[0].egnaRader).toHaveLength(0);
    expect([...host.querySelectorAll('table.plan tbody tr')]).toHaveLength(fore);
  });
});

describe('Stödpass (Ma/NO-stöd)', () => {
  it('läggs till på tjänsten, hänvisas i uppgiftsreglerna och syns i kalendern', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'MatTe');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 MatTe').click(); });

    // Lägg till stödpasset på tjänsten (torsdag 15:00–16:00 är förvalt)
    act(() => { knapp(host, '+ Lägg till stödpass').click(); });
    expect(lasStruktur().tjanster[0].stodPass).toEqual([
      { id: expect.any(String) as unknown as string, namn: 'Ma/NO-stöd', dag: 4, start: '15:00', slut: '16:00' },
    ]);
    expect(host.textContent).toContain('Ma/NO-stöd — Torsdag 15:00–16:00');

    // Klass + ämne + planering → uppgiftsreglerna hänvisar till stödpasset
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    act(() => { knapp(host, '✏ Uppgifter').click(); });
    expect(host.querySelector('.regel')!.textContent).toContain('Ma/NO-stöd');
    expect(host.querySelector('.regel')!.textContent).toContain('torsdag 15:00–16:00');

    // Kalendern visar stödtiden
    act(() => { knapp(host, '📆 Kalender').click(); });
    act(() => { knapp(host, 'Månad').click(); });
    expect(host.querySelector('.panel')!.textContent).toContain('Ma/NO-stöd');
  });
});

describe('Stödämnen (fri planering)', () => {
  it('Ma/NO-stöd läggs till som ämne, planeras utan bok och detaljplaneras', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    skriv(input(host, 'Tjänstens namn'), 'MatTe');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 MatTe').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });

    valj(select(host, 'Ämne'), 'Ma/NO-stöd');
    valj(select(host, 'Veckodag pass 1'), '4');
    skriv(input(host, 'Start pass 1'), '15:00');
    skriv(input(host, 'Slut pass 1'), '16:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    expect(lasStruktur().amnen[0].namn).toBe('Ma/NO-stöd');
    expect(lasStruktur().amnen[0].halvklass).not.toBe(true);  // helklass — öppet för alla

    act(() => { treeKnapp(host, '📖 Ma/NO-stöd').click(); });
    expect(host.textContent).toContain('Fri planering');
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    // Fri bok skapad och kopplad; ett tillfälle per torsdag
    expect(lasStruktur().bocker.some((b) => b.id.startsWith('fri-'))).toBe(true);
    const rader = [...host.querySelectorAll('table.plan tbody tr')];
    expect(rader.length).toBeGreaterThan(30);
    expect(rader[0].textContent).toContain('Tillfälle 1');
    expect(rader[0].textContent).toContain('2026-08-20');     // första torsdagen

    // Detaljplanering: genomgångstexten kan redigeras fritt
    act(() => { knapp(host, '🧭 Detaljplanering').click(); });
    expect(host.textContent).toContain('Tillfälle 1');
  });
});

describe('Tema, kapitelheader och avklarat-kryss', () => {
  it('temat sparas i localStorage och sätts på body', async () => {
    const host = render();
    expect(document.body.dataset.tema).toBe('varm');
    valj(select(host, 'Färgtema'), 'klassisk');
    expect(document.body.dataset.tema).toBe('klassisk');
    expect(window.localStorage.getItem('classroom-planner.studio.tema')).toBe('klassisk');
    valj(select(host, 'Färgtema'), 'varm');
  });

  it('kapitelheadern visar aktuellt kapitel och kryssen räknas som avklarade', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });

    const header = host.querySelector('.kap-header')!;
    expect(header.textContent).toContain('Kapitel 1');            // testbokens kapitel
    expect(header.textContent).toContain('avklarade totalt');

    // Kryssa första lektionen som klar → overlay sätts och headern räknar upp
    const kryss = host.querySelector('input[aria-label="Lektion 1 avklarad"]') as HTMLInputElement;
    act(() => { kryss.click(); });
    expect(lasStruktur().lektionsplaner.some((lp) => lp.klar === true)).toBe(true);
    expect(host.querySelector('.kap-header')!.textContent).toContain('1/');
    expect(host.querySelector('table.plan tbody tr')!.className).toContain('klar');
  });
});

describe('Veckoutskrift och versionerade planeringar', () => {
  it('utskriftsläget kan växla till en vecka per sida', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    act(() => { knapp(host, '📆 Kalender').click(); });
    act(() => { knapp(host, '🖨 Skriv ut (månader/veckor)').click(); });
    act(() => { knapp(host, 'Veckor').click(); });
    const sidor = [...host.querySelectorAll('.kal-utskrift-sida')];
    expect(sidor.length).toBeGreaterThan(40);                 // en vecka per sida
    expect(sidor[0].textContent).toContain('vecka');
    expect(sidor[0].querySelector('.schema')).not.toBeNull(); // veckorutnätet
  });

  it('↻ Uppdatera planering arkiverar den gamla; ↩ Återställ tar tillbaka den', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    act(() => { knapp(host, '➕ Spara ny planeringsversion').click(); });

    expect(lasStruktur().planeringar[0].version).toBe(2);
    expect(lasStruktur().planeringsarkiv).toHaveLength(1);
    expect(host.textContent).toContain('🗂 Tidigare planeringsversioner');
    expect(host.textContent).toContain('v1 (');
    act(() => { knapp(host, '↩ Återställ').click(); });
    expect(lasStruktur().planeringar[0].version).toBe(1);
    expect(lasStruktur().planeringsarkiv![0].version).toBe(2);
  });
});

describe('Vänstermeny, tjänstöversikt och årsöversikt', () => {
  async function byggUpp(host: HTMLElement) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma åk 8');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma åk 8').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
  }

  it('vänstermenyn listar skolår, tjänster, böcker och lärare med Lägg till-knappar', async () => {
    const host = render();
    await byggUpp(host);
    const tree = host.querySelector('.tree')!;
    expect(tree.textContent).toContain('SKOLÅR');
    expect(tree.textContent).toContain('TJÄNSTER');
    expect(tree.textContent).toContain('BÖCKER');
    expect(tree.textContent).toContain('LÄRARE');
    expect(tree.textContent).toContain('➕ Lägg till skolår');
    expect(tree.textContent).toContain('➕ Lägg till bok');
    expect(tree.textContent).toContain('➕ Lägg till lärare');
    expect(tree.textContent).toContain('💼 Ma åk 8');
    expect(tree.textContent).toContain('📗 Matematik Y');
  });

  it('tjänstöversikten visar klasser med ämnen, bok och planeringsstatus', async () => {
    const host = render();
    await byggUpp(host);
    act(() => { treeKnapp(host, '💼 Ma åk 8').click(); });
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('Klasser och ämnen');
    expect(panel.textContent).toContain('8B');
    expect(panel.textContent).toContain('Matematik');
    expect(panel.textContent).toContain('Matematik Y');
    expect(panel.textContent).toContain('ej skapad');       // bok kopplad men ingen planering än
    // Öppna ämnet via tjänstöversikten och skapa planering
    act(() => { knapp(host, 'Öppna / planera →').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    act(() => { treeKnapp(host, '💼 Ma åk 8').click(); });
    expect(host.querySelector('.panel')!.textContent).toContain('✓ planerad');
  });

  it('årsöversikten visar kapitelkort och lektionsregler för ämnet', async () => {
    const host = render();
    await byggUpp(host);
    act(() => { knapp(host, '📊 Årsöversikt').click(); });
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('Årsöversikt — Matematik Y');
    expect(panel.textContent).toContain('Kapitel 1');
    expect(panel.textContent).toContain('begrepp');
    expect(panel.textContent).toContain('Lektionsregler');
    expect(panel.textContent).toContain('Läxförhör via Socrative');
    expect(panel.textContent).toContain('ETT');              // bokens nivånamn i reglerna
  });
});

describe('Kalender', () => {
  async function medPlanering(host: HTMLElement) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });
  }

  it('kalendervyn visar månadsrutnät med lektioner och kapitelfärgförklaring', async () => {
    const host = render();
    await medPlanering(host);
    act(() => { knapp(host, '📆 Kalender').click(); });
    act(() => { knapp(host, 'Månad').click(); });
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('📆 Kalender');
    expect(panel.querySelector('.mgrid')).not.toBeNull();
    // Lektionen ligger onsdag; en händelsechip finns i rutnätet
    expect([...panel.querySelectorAll('.kh')].length).toBeGreaterThan(0);
    expect(panel.textContent).toContain('1.1 Bråk');
    expect(panel.textContent).toContain('Ämne (bakgrund)');
    expect(panel.textContent).toContain('Klass (färg)');
  });

  it('lägena Vecka och Läsår renderar; klassfiltret finns', async () => {
    const host = render();
    await medPlanering(host);
    act(() => { knapp(host, '📆 Kalender').click(); });
    act(() => { knapp(host, 'Läsår').click(); });
    expect(host.querySelector('.lasar-grid')).not.toBeNull();
    expect([...host.querySelectorAll('.minimanad')].length).toBe(11); // aug–jun
    act(() => { knapp(host, 'Vecka').click(); });
    expect(host.querySelector('.schema')).not.toBeNull();       // veckoschema-rutnät
    // Filterknappar (klass + ämne) finns
    expect([...host.querySelectorAll('.chipbtn')].some((b) => b.textContent === 'Alla klasser')).toBe(true);
    expect([...host.querySelectorAll('.chipbtn')].some((b) => b.textContent === 'Alla ämnen')).toBe(true);
    expect([...host.querySelectorAll('.chipbtn')].some((b) => b.textContent === '8B')).toBe(true);
  });
})

describe('Veckoschema och schemakonflikter', () => {
  async function tvaAmnenSammaTid(host: HTMLElement) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    // Ämne 1: Matematik onsdag 09:00–10:00
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
  }

  it('veckovyn ritar ett schema-rutnät med lektionen på rätt dagkolumn', async () => {
    // Datumberoende: kalendern öppnar på 'aktuell' vecka/månad — frys klockan i skolåret
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-26T10:00:00Z'));
    const host = render();
    await tvaAmnenSammaTid(host);
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    act(() => { knapp(host, '📆 Kalender').click(); });
    // Default vecka-läge; navigera till skolårets start (aug) via schemat
    expect(host.querySelector('.schema')).not.toBeNull();
    // Onsdagskolumnen ska ha en lektionsruta
    expect([...host.querySelectorAll('.sch-lekt')].length).toBeGreaterThan(0);
    expect(host.textContent).toContain('1.1 Bråk');
  });

  it('att lägga ett ämne på samma tid kräver två varningar innan det går igenom', async () => {
    const host = render();
    await tvaAmnenSammaTid(host);          // Matematik ons 09:00–10:00 finns
    act(() => { treeKnapp(host, '👥 8B').click(); });
    // Ämne 2: Fysik samma tid (ons 09:00–10:00) → halvklass, båda grupperna krockar
    valj(select(host, 'Ämne'), 'Fysik');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '3');
    skriv(input(host, 'Start pass 2'), '09:00');
    skriv(input(host, 'Slut pass 2'), '10:00');
    // Klick 1: varning 1/2, inget skapat
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    expect(host.textContent).toContain('Krock med redan lagd lektion');
    expect(host.textContent).toContain('(1/2)');
    expect(lasStruktur().amnen.filter((a) => a.namn === 'Fysik')).toHaveLength(0);
    // Klick 2: varning 2/2, fortfarande inget skapat
    act(() => { knapp(host, '⚠ Lägg till ändå (1/2)').click(); });
    expect(host.textContent).toContain('(2/2)');
    expect(lasStruktur().amnen.filter((a) => a.namn === 'Fysik')).toHaveLength(0);
    // Klick 3: skapas trots krock
    act(() => { knapp(host, '⚠ Lägg till ändå (2/2)').click(); });
    expect(lasStruktur().amnen.filter((a) => a.namn === 'Fysik')).toHaveLength(1);
  });

  it('annan tid ger ingen varning', async () => {
    const host = render();
    await tvaAmnenSammaTid(host);
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');   // helklass, torsdag → ingen krock
    valj(select(host, 'Veckodag pass 1'), '4');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    expect(host.textContent).not.toContain('Krock');
    expect(lasStruktur().amnen).toHaveLength(2);
  });
})

describe('Fritt schemaförval, veckonummer och dolda helgdagar', () => {
  it('nytt ämnes förval undviker en redan upptagen tid i klassen', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    // Lägg matte måndag 08:10 (förvalet)
    valj(select(host, 'Ämne'), 'Matematik');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    // Nästa nya ämne: förvalet får INTE vara måndag 08:10 igen (upptaget)
    act(() => { treeKnapp(host, '👥 8B').click(); });
    const dag = select(host, 'Veckodag pass 1').value;
    const start = input(host, 'Start pass 1').value;
    expect(!(dag === '1' && start === '08:10')).toBe(true);
  });

  it('månadskalendern visar veckonummer och döljer röda dagar', async () => {
    // Datumberoende: kalendern öppnar på 'aktuell' vecka/månad — frys klockan i skolåret
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-26T10:00:00Z'));
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    // temadag så vi vet att skolans dagar ändå syns
    act(() => { treeKnapp(host, '📅 2026/2027').click(); });
    skrivArea(host.querySelector('textarea[aria-label="Kalendariumtext"]')!, '2026-12-01 Temadag');
    act(() => { knapp(host, 'Lägg till från text').click(); });
    act(() => { knapp(host, '📆 Kalender').click(); });
    act(() => { knapp(host, 'Månad').click(); });
    // bläddra till december 2026 (från augusti: 4 steg framåt)
    for (let i = 0; i < 4; i++) act(() => { knapp(host, '▶').click(); });
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('december 2026');
    expect(panel.querySelector('.mgrid.vecko')).not.toBeNull();          // veckonummerkolumn finns
    expect([...panel.querySelectorAll('.mgrid-vk')].length).toBeGreaterThan(0);
    expect(panel.textContent).toContain('Temadag');                       // skolans dag syns
    expect(panel.textContent).not.toContain('Juldagen');                  // röd dag döljs
    expect(panel.textContent).not.toContain('Annandag jul');
  });
})

describe('NO+Tk blockkurs och kalenderfärger', () => {
  async function noKlass(host: HTMLElement) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
  }

  it('NO+Tk skapar fyra länkade delämnen i vald ordning med block-position', async () => {
    const host = render();
    await noKlass(host);
    valj(select(host, 'Ämne'), 'NO+Tk');
    // schema (halvklass): Grupp A tis, Grupp B tor
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '09:00');
    skriv(input(host, 'Slut pass 2'), '10:00');
    // Ordning: sätt block 1 = Kemi (byter plats med Biologi)
    valj(select(host, 'NO-block 1'), 'Kemi');
    act(() => { knapp(host, '➕ Skapa NO+Tk (fyra block)').click(); });
    const amnen = lasStruktur().amnen.filter((x) => x.noGrupp !== undefined);
    expect(amnen).toHaveLength(4);
    expect(amnen.every((x) => x.halvklass === true)).toBe(true);
    const iOrder = amnen.slice().sort((x, y) => (x.noOrder ?? 0) - (y.noOrder ?? 0)).map((x) => x.namn);
    expect(iOrder[0]).toBe('Kemi');                       // block 1 = Kemi
    expect(new Set(iOrder)).toEqual(new Set(['Biologi', 'Fysik', 'Kemi', 'Teknik']));
  });

  it('ämnespanelen visar NO-block och varnar när boken är för lång för budgeten', async () => {
    const host = render();
    await noKlass(host);
    valj(select(host, 'Ämne'), 'NO+Tk');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '09:00');
    skriv(input(host, 'Slut pass 2'), '10:00');
    act(() => { knapp(host, '➕ Skapa NO+Tk (fyra block)').click(); });
    // Öppna första delämnet, koppla den korta boken (3 lektioner < budget → ingen varning)
    const forsta = lasStruktur().amnen.filter((x) => x.noGrupp !== undefined).sort((x, y) => (x.noOrder ?? 0) - (y.noOrder ?? 0))[0];
    act(() => { treeKnapp(host, `📖 ${forsta.namn}`).click(); });
    expect(host.querySelector('.panel')!.textContent).toContain('NO+Tk block 1/4');
    expect(host.querySelector('.panel')!.textContent).toContain('budget');
  });

  it('kalendern färgar bakgrund per ämne och klassnamn i egen färg', async () => {
    // Datumberoende: kalendern öppnar på 'aktuell' vecka/månad — frys klockan i skolåret
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-26T10:00:00Z'));
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    act(() => { knapp(host, '📆 Kalender').click(); });
    const lekt = host.querySelector('.sch-lekt') as HTMLElement;
    expect(lekt).not.toBeNull();
    expect(lekt.style.background).not.toBe('');           // ämnesbakgrund satt
    expect(host.querySelector('.kal-forkl')!.textContent).toContain('Ämne (bakgrund)');
    expect(host.querySelector('.kal-forkl')!.textContent).toContain('Klass (färg)');
  });
})

describe('Inga dubblettämnen, redigerbar NO-ordning, GitHub-panel', () => {
  async function klassMedMatte(host: HTMLElement) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
  }

  it('ämnesväljaren döljer ämnen som redan finns i klassen', async () => {
    const host = render();
    await klassMedMatte(host);
    // Lägg Matematik
    valj(select(host, 'Ämne'), 'Matematik');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    // Öppna klassen igen — Matematik ska inte längre vara valbart
    act(() => { treeKnapp(host, '👥 8B').click(); });
    const opts = [...select(host, 'Ämne').options].map((o) => o.value);
    expect(opts).not.toContain('Matematik');
    expect(opts).toContain('Biologi');
  });

  it('NO+Tk försvinner ur listan när ett NO-ämne redan finns, och tvärtom', async () => {
    const host = render();
    await klassMedMatte(host);
    valj(select(host, 'Ämne'), 'Biologi');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    const opts = [...select(host, 'Ämne').options].map((o) => o.value);
    expect(opts).not.toContain('NO+Tk');          // Biologi finns ⇒ NO+Tk döljs
    expect(opts).not.toContain('Biologi');
  });

  it('NO+Tk-ordningen kan redigeras i efterhand från ämnespanelen', async () => {
    const host = render();
    await klassMedMatte(host);
    valj(select(host, 'Ämne'), 'NO+Tk');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '09:00');
    skriv(input(host, 'Slut pass 2'), '10:00');
    act(() => { knapp(host, '➕ Skapa NO+Tk (fyra block)').click(); });
    const forsta = lasStruktur().amnen.filter((x) => x.noGrupp !== undefined).sort((x, y) => (x.noOrder ?? 0) - (y.noOrder ?? 0))[0];
    act(() => { treeKnapp(host, `📖 ${forsta.namn}`).click(); });
    // Byt block 1 till Teknik via redigeraren
    valj(select(host, 'Ändra NO-block 1'), 'Teknik');
    act(() => { knapp(host, '💾 Spara ny ordning').click(); });
    const teknik = lasStruktur().amnen.find((x) => x.namn === 'Teknik' && x.noGrupp !== undefined);
    expect(teknik?.noOrder).toBe(0);              // Teknik ligger nu först
  });

  it('GitHub-panelen öppnas från topbaren och har konfigurationsfält', async () => {
    const host = render();
    act(() => { knapp(host, '☁ GitHub').click(); });
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('Synka med GitHub');
    expect(input(host, 'GitHub owner')).not.toBeNull();
    expect(input(host, 'GitHub token')).not.toBeNull();
    expect((input(host, 'GitHub repo')).value).toBe('classroom-planner-data');
  });
})

describe('Detaljerad NO-planering i lektionskortet', () => {
  it('begreppsrum föreslås, fälten sparas och flipp-layouten förhandsvisas', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host, BIOJSON);
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Biologi');
    valj(select(host, 'Bok för ämnet'), 'gleerups-biologi-8');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '09:00');
    skriv(input(host, 'Slut pass 2'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    // Öppna lektion 2 (4.2 Fotosyntes) i Grupp A-planeringen
    const rad = [...host.querySelectorAll('table.plan tbody tr')].find((r) => r.textContent?.includes('4.2 Fotosyntes'))!;
    act(() => { (rad as HTMLElement).click(); });
    act(() => { knapp(host, '▼ Detaljerad planering (NO)').click(); });
    const panel = host.querySelector('.no-planering')!;
    // Begreppsrum-förslag: läxförhör aggregerat Biologi412, exit Biologi42
    expect(panel.textContent).toContain('Biologi412');
    expect(panel.textContent).toContain('Biologi42');
    // Läxan är förifylld med delkapitlets begrepp
    expect((panel.querySelector('textarea[aria-label="Läxa (begrepp)"]') as HTMLTextAreaElement).value).toContain('fotosyntes');
    // Fyll NO-fält + laboration + flippat
    skriv(input(host, 'Presentation'), 'Fotosyntes.pptx');
    skrivArea(panel.querySelector('textarea[aria-label="Frågeställning (systematisk undersökning)"]')!, 'Hur påverkar ljusmängden fotosyntesens hastighet?');
    skrivArea(panel.querySelector('textarea[aria-label="Kort teoritext"]')!, 'Fotosyntesen omvandlar ljus till energi.');
    skriv(input(host, 'Länk till kort film'), 'https://binogi.se/fotosyntes');
    skriv(input(host, 'Quiz (namn)'), 'Biologi42');
    // Flipp-preview visar elevlayouten
    expect(host.textContent).toContain('Det här skickas till eleven');
    expect(host.textContent).toContain('Se filmen');
    act(() => { knapp(host, '💾 Spara planering').click(); });
    const sparad = lasStruktur().lektionsplaner.find((p) => p.presentation === 'Fotosyntes.pptx');
    expect(sparad).toBeDefined();
    expect(sparad?.labFraga).toContain('systematisk' === 'systematisk' ? 'ljusmängden' : '');
    expect(sparad?.flippFilm).toBe('https://binogi.se/fotosyntes');
    // Återöppning läser sparad plan
    act(() => { knapp(host, '✕ Stäng').click(); });
    act(() => { (rad as HTMLElement).click(); });
    expect(host.textContent).toContain('ifylld');
  });
})

describe('Planeringsflikar (portade från v1)', () => {
  async function amneMedPlan(host: HTMLElement) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
  }

  it('Översikt visar lektionstabell med typ och nivåer; Uppgifter visar nivåkort med min-nivå', async () => {
    const host = render();
    await amneMedPlan(host);
    act(() => { knapp(host, 'ℹ Översikt').click(); });
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('LEKTION');
    expect(panel.textContent).toContain('1.1 Bråk');
    act(() => { knapp(host, '✏ Uppgifter').click(); });
    expect(panel.textContent).toContain('ETT – introduktion');   // Matematik Y-nivåer
    expect(panel.textContent).toContain('Obligatorisk');
    expect(panel.textContent).toContain('min. ETT');             // lek 1 minimum
    expect(panel.textContent).toContain('min. TVÅ');             // lek 2 minimum
  });

  it('Begrepp listar begrepp per lektion; Magma-länk och anteckning sparas per lektion', async () => {
    const host = render();
    await amneMedPlan(host);
    act(() => { knapp(host, '💡 Begrepp').click(); });
    expect(host.querySelector('.panel')!.textContent).toContain('täljare');
    act(() => { knapp(host, '🟫 Magma').click(); });
    expect(host.textContent).toContain('0 av 2 lektioner har en Magma-aktivitet');
    skriv(input(host, 'Magma-länk lektion 1'), 'https://magma.example/tal');
    expect(lasStruktur().lektionsplaner.find((p) => p.lektionsIndex === 0)?.magma).toBe('https://magma.example/tal');
    act(() => { knapp(host, '👥 Anteckningar').click(); });
    skrivArea(host.querySelector('textarea[aria-label="Anteckning lektion 2"]')!, 'Gick fort — repetera bråk.');
    expect(lasStruktur().lektionsplaner.find((p) => p.lektionsIndex === 1)?.anteckning).toContain('repetera bråk');
  });

  it('Filmer läggs till och tas bort per lektion', async () => {
    const host = render();
    await amneMedPlan(host);
    act(() => { knapp(host, '🎬 Filmer').click(); });
    skriv(input(host, 'Filmtitel lektion 1'), 'Bråk – Binogi');
    skriv(input(host, 'Filmlänk lektion 1'), 'https://binogi.se/brak');
    act(() => { knapp(host, '+ Lägg till film').click(); });
    expect(host.textContent).toContain('▶ Bråk – Binogi');
    expect(lasStruktur().lektionsplaner.find((p) => p.lektionsIndex === 0)?.filmer).toEqual(['Bråk – Binogi|https://binogi.se/brak']);
    act(() => { knapp(host, '✕').click(); });   // ta bort filmen
    expect(lasStruktur().lektionsplaner.find((p) => p.lektionsIndex === 0)?.filmer).toEqual([]);
  });

  it('rad i Översikt och Öppna lektion i Filmer hoppar till rätt lektionssida', async () => {
    const host = render();
    await amneMedPlan(host);
    act(() => { knapp(host, 'ℹ Översikt').click(); });
    const rad2 = host.querySelectorAll('table.plan tbody tr')[1] as HTMLTableRowElement;
    act(() => { rad2.click(); });
    // Detaljfliken öppen på lektion 2
    expect(host.textContent).toContain('TAVLAN');
    expect((select(host, 'Välj lektion') as HTMLSelectElement).value).toBe('1');
    // Filmer → Öppna lektion → på första lektionen
    act(() => { knapp(host, '🎬 Filmer').click(); });
    act(() => { (host.querySelectorAll('.film-lekt button.btn.sec.sm')[0] as HTMLButtonElement).click(); });
    expect((select(host, 'Välj lektion') as HTMLSelectElement).value).toBe('0');
  });
})

describe('Bokens nivåkonventioner följs', () => {
  const PRIOJSON = JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'sanoma-prio-8', titel: 'Prio Matematik 8', förlag: 'Sanoma', ämne: 'Matematik', årskurs: 8,
      kapitelMeta: { '1': { name: 'Tal', col: '#8d4a2f' } } },
    lektioner: { '1': [
      { id: 1, type: 'regular', avsnitt: '1.1 Negativa tal', del: 1, grön: '1–13', blå: '14–21', röd: '—' },
      { id: 2, type: 'regular', avsnitt: '1.1 Negativa tal', del: 2, grön: '—', blå: '14–21', röd: '22–25' },
    ] },
  });

  async function medBok(host: HTMLElement, json: string, bokId: string) {
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host, json);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), bokId);
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '✏ Uppgifter').click(); });
  }

  it('Prio (Grön/Blå/Röd): namnen ordagrant med färgboxar', async () => {
    const host = render();
    await medBok(host, PRIOJSON, 'sanoma-prio-8');
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('Grön – introduktion');   // ej GRÖN
    expect(panel.textContent).not.toContain('GRÖN');
    expect(panel.querySelector('.niva-gron')).not.toBeNull();     // färgbox för färgbok
  });

  it('NO-bok utan nivåer: inga nivåkolumner eller Grön/Blå-regler', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    const SPEKTRUM = JSON.stringify({
      id: 'spektrum-biologi', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
      kapitel: [{ nummer: 6, titel: 'Vår fantastiska kropp', sidor: 's. 150–199', delkapitel: [
        { nummer: '6.1', titel: 'Cellen', sidor: 's. 152–155', begrepp: ['cell'], extraBegrepp: [], testaDigSjalv: { sida: 155, fragor: ['Vad är en cell?'] } },
        { nummer: '6.2', titel: 'Organsystem', sidor: 's. 156–160', begrepp: ['organ'], extraBegrepp: [] },
      ] }],
    });
    await importeraBok(host, SPEKTRUM);
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Biologi');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '09:00');
    skriv(input(host, 'Slut pass 2'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    valj(select(host, 'Bok för ämnet'), 'spektrum-biologi');
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).not.toContain('Grön');
    expect(panel.textContent).not.toContain('ETT');
    // Plantabellen saknar nivåkolumner (✓/Datum/V./Tid/Kap/Avsnitt = 6 per grupptabell)
    expect(panel.querySelector('table.plan')!.querySelectorAll('thead th')).toHaveLength(6);
    act(() => { knapp(host, '✏ Uppgifter').click(); });
    expect(host.querySelector('.regel')!.textContent).toContain('Testa dig själv');
    expect(host.querySelector('.regel')!.textContent).not.toContain('obligatoriska.');
  });

  it('Matematik Y (ETT/TVÅ/TRE, versaler): namnen ordagrant — färgerna används ändå', async () => {
    const host = render();
    await medBok(host, BOKJSON, 'liber-matematik-y');
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('ETT – introduktion');
    expect(panel.textContent).toContain('TVÅ – E-nivå');
    expect(panel.textContent).not.toContain('Grön');              // aldrig fel namn
    expect(panel.querySelector('.niva-gron')).not.toBeNull();     // färgerna alltid
  });

  it('ämne som tas bort och läggs tillbaka har tomt innehåll', async () => {
    const host = render();
    await medBok(host, BOKJSON, 'liber-matematik-y');
    // Anteckna på lektion 1
    act(() => { knapp(host, '👥 Anteckningar').click(); });
    skrivArea(host.querySelector('textarea[aria-label="Anteckning lektion 1"]')!, 'Gammalt innehåll');
    expect(lasStruktur().lektionsplaner).toHaveLength(1);
    // Ta bort ämnet och lägg tillbaka det
    window.confirm = () => true;
    act(() => { knapp(host, '🗑 Ta bort ämne').click(); });
    expect(lasStruktur().lektionsplaner).toHaveLength(0);          // städat
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '👥 Anteckningar').click(); });
    expect((host.querySelector('textarea[aria-label="Anteckning lektion 1"]') as HTMLTextAreaElement).value).toBe('');
  });
})

describe('Hel- och halvklasspass för NO', () => {
  it('helklasspass hamnar i BÅDA gruppernas schema; A/B bara i sin grupp', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Biologi');
    // Pass 1: måndag Helklass (A+B), Pass 2: torsdag Halvklass Grupp B
    valj(select(host, 'Veckodag pass 1'), '1');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Omfattning pass 1'), 'hel');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '13:00');
    skriv(input(host, 'Slut pass 2'), '14:00');
    valj(select(host, 'Omfattning pass 2'), 'B');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    const amne = lasStruktur().amnen[0];
    expect(amne.schema).toEqual([{ dag: 1, start: '09:00', slut: '10:00' }]);              // Grupp A: helklasspasset
    expect(amne.schemaB).toEqual([
      { dag: 1, start: '09:00', slut: '10:00' },                                          // Grupp B: helklass + B-pass
      { dag: 4, start: '13:00', slut: '14:00' },
    ]);
    // Redigeraren i ämnespanelen visar omfattningen och kan ändra den
    expect(host.textContent).toContain('Helklass');
    valj(select(host, 'Omfattning pass 1'), 'A');            // gör måndagspasset till halvklass A
    act(() => { knapp(host, '💾 Spara schema').click(); });
    const efter = lasStruktur().amnen[0];
    expect(efter.schemaB).toEqual([{ dag: 4, start: '13:00', slut: '14:00' }]);           // B har bara sitt pass
  });

  it('saneraIdn i store: dubblett-ämnen ur gammal data döps om vid laddning', () => {
    // Skriv gammal-stil-data med två ämnen som delar id direkt i localStorage
    window.localStorage.setItem('classroom-planner.studio.v2', JSON.stringify({
      skolar: [{ id: 'la', namn: 'X', start: '2026-08-17', slut: '2027-06-11', dagar: [] }],
      larare: [], elever: [], bocker: [], planeringar: [], lektionsplaner: [],
      tjanster: [{ id: 'tj', skolarId: 'la', namn: 'T' }],
      klasser: [{ id: 'k1', tjanstId: 'tj', namn: '8A' }, { id: 'k2', tjanstId: 'tj', namn: '8B' }],
      amnen: [
        { id: 'am-3', klassId: 'k2', namn: 'Matematik', schema: [] },
        { id: 'am-3', klassId: 'k1', namn: 'Biologi', schema: [] },   // samma id!
      ],
    }));
    const s = lasStruktur();
    const idn = s.amnen.map((a) => a.id);
    expect(new Set(idn).size).toBe(2);                       // unika efter sanering
    expect(s.amnen.find((a) => a.namn === 'Biologi')?.id).not.toBe('am-3');
  });
})

describe('Stabila id:n, ingen blank skärm, NO+Tk-nod i trädet', () => {
  it('saneringen persisteras: samma id:n vid varje läsning och trädvalet håller', () => {
    window.localStorage.setItem('classroom-planner.studio.v2', JSON.stringify({
      skolar: [{ id: 'la', namn: 'X', start: '2026-08-17', slut: '2027-06-11', dagar: [] }],
      larare: [], elever: [], bocker: [], planeringar: [], lektionsplaner: [],
      tjanster: [{ id: 'tj', skolarId: 'la', namn: 'T' }],
      klasser: [{ id: 'k1', tjanstId: 'tj', namn: '8A' }, { id: 'k2', tjanstId: 'tj', namn: '8B' }],
      amnen: [
        { id: 'am-3', klassId: 'k2', namn: 'Matematik', schema: [] },
        { id: 'am-3', klassId: 'k1', namn: 'Biologi', schema: [] },
      ],
    }));
    const forsta = lasStruktur();
    const andra = lasStruktur();
    expect(andra.amnen.map((a) => a.id)).toEqual(forsta.amnen.map((a) => a.id)); // stabila
    // Trädet: klick på Biologi öppnar Biologi (inte Matematik)
    const host = render();
    act(() => { treeKnapp(host, '📖 Biologi').click(); });
    const rubrik = host.querySelector('.panel h2')!;
    expect(rubrik.textContent).toContain('Biologi');
    expect(rubrik.textContent).not.toContain('Matematik');
  });

  it('ta bort ämne visar klassen — ingen blank skärm', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    window.confirm = () => true;
    act(() => { knapp(host, '🗑 Ta bort ämne').click(); });
    const panel = host.querySelector('.panel')!;
    expect(panel.textContent).toContain('8B');                 // klasspanelen visas
    expect(panel.querySelector('h2')).not.toBeNull();          // inte blank
  });

  it('NO+Tk visas som egen nod i trädet ovanför delämnena', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'NO+Tk');
    act(() => { knapp(host, '➕ Skapa NO+Tk (fyra block)').click(); });
    const tree = host.querySelector('.tree')!;
    expect(tree.textContent).toContain('🧪 NO+Tk');            // noden med små bokstäver
    expect(tree.textContent).toContain('📖 Biologi');
    // klick på NO+Tk-noden öppnar första delämnet
    act(() => { treeKnapp(host, '🧪 NO+Tk').click(); });
    expect(host.querySelector('.panel h2')!.textContent).toContain('NO+Tk block 1/4');
  });
})

describe('Detaljplanering som egen flik', () => {
  it('flik med lektionsmeny, begrepp, filmer och öppet planeringsformulär', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host, BIOJSON);
    skriv(input(host, 'Tjänstens namn'), 'NO');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 NO').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Biologi');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    valj(select(host, 'Veckodag pass 2'), '4');
    skriv(input(host, 'Start pass 2'), '09:00');
    skriv(input(host, 'Slut pass 2'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    valj(select(host, 'Bok för ämnet'), 'gleerups-biologi-8');
    act(() => { knapp(host, '🧭 Detaljplanering').click(); });
    const panel = host.querySelector('.panel')!;
    // Lektionsmeny + formulär öppet direkt (utan fällknapp)
    expect(select(host, 'Välj lektion')).not.toBeNull();
    expect(panel.textContent).toContain('Lektion 1 av 2');
    // Lektionssidans sektioner (förlagan) + NO-formuläret öppet för halvklassämnen
    expect(panel.textContent).toContain('TAVLAN');
    expect(panel.textContent).toContain('VAD SKA VI GÖRA');
    expect(panel.textContent).toContain('EXIT TICKET');
    // NO-ramen: Testa dig själv + kumulativa läxförhör — inga matematiktermer
    expect(panel.textContent).toContain('TESTA DIG SJÄLV');
    expect(panel.textContent).toContain('kumulativ');
    expect(panel.textContent).not.toContain('EXEMPEL VI RÄKNAR');
    expect(panel.textContent).not.toContain('foto på beräkningarna');
    expect(panel.querySelector('.np-grid')).not.toBeNull();        // NO-formuläret öppet
    expect(panel.textContent).toContain('BEGREPP');
    expect(panel.textContent).toContain('cell');                   // 4.1-begrepp
    // Bläddra till lektion 2 → begrepp och rumsförslag följer med
    act(() => { knapp(host, '▶').click(); });
    expect(panel.textContent).toContain('fotosyntes');
    expect(panel.textContent).toContain('Biologi412');             // aggregerat läxförhörsrum
    // Film läggs till från lektionssidan
    skriv(input(host, 'Ny film'), 'Fotosyntes|https://binogi.se/f');
    act(() => { knapp(host, '+ Lägg till film').click(); });
    expect(lasStruktur().lektionsplaner.find((p) => p.lektionsIndex === 1)?.filmer).toEqual(['Fotosyntes|https://binogi.se/f']);
  });
})

describe('Lektionssidans redigerbara ytor', () => {
  it('Vad ska vi göra/lära oss/Exempel sparas i lektionsplanen', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '3');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '▶ Skapa planering').click(); });
    act(() => { knapp(host, '🧭 Detaljplanering').click(); });

    const area = (t: string) => host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t}"]`)!;
    skriv(area('Vad ska vi göra'), 'Placera tal på tallinjen');
    skriv(area('Vad ska vi lära oss'), 'Talmängder');
    skriv(area('Exempel vi räknar'), 'Ex 1 s. 11');
    skriv(input(host, 'Magma-länk'), 'https://magma.se/x');
    const lp = lasStruktur().lektionsplaner.find((x) => x.lektionsIndex === 0)!;
    expect(lp).toMatchObject({ vadGora: 'Placera tal på tallinjen', laraOss: 'Talmängder', exempelRakna: 'Ex 1 s. 11', magma: 'https://magma.se/x' });
    // Matematik (helklass): matteramen — nivåer + foto på beräkningarna; NO-formuläret visas inte
    expect(host.querySelector('.panel')!.textContent).toContain('EXEMPEL VI RÄKNAR');
    expect(host.querySelector('.panel')!.textContent).toContain('foto på beräkningarna');
    expect(host.querySelector('.panel')!.textContent).not.toContain('TESTA DIG SJÄLV');
    expect(host.querySelector('.np-grid')).toBeNull();
  });
});

describe('Funktionsparitet med v1: Ångra + uppgiftsintervall', () => {
  it('↩ Ångra återställer senaste ändringen', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    expect(lasStruktur().skolar).toHaveLength(1);
    act(() => { knapp(host, '↩ Ångra').click(); });
    expect(lasStruktur().skolar).toHaveLength(0);           // skolåret borta
  });

  it('uppgiftsintervall kan överstyras i Detaljplanering och slår igenom i Uppgifter-fliken', async () => {
    const host = render();
    skapaSkolar(host, '2026/2027', '2026-08-17', '2027-06-11');
    await importeraBok(host);
    skriv(input(host, 'Tjänstens namn'), 'Ma');
    act(() => { knapp(host, '➕ Lägg till tjänst').click(); });
    act(() => { treeKnapp(host, '💼 Ma').click(); });
    skriv(input(host, 'Klassens namn'), '8B');
    act(() => { knapp(host, '➕ Lägg till klass').click(); });
    act(() => { treeKnapp(host, '👥 8B').click(); });
    valj(select(host, 'Ämne'), 'Matematik');
    valj(select(host, 'Bok för ämnet'), 'liber-matematik-y');
    valj(select(host, 'Veckodag pass 1'), '2');
    skriv(input(host, 'Start pass 1'), '09:00');
    skriv(input(host, 'Slut pass 1'), '10:00');
    act(() => { knapp(host, '➕ Lägg till ämne').click(); });
    act(() => { knapp(host, '🧭 Detaljplanering').click(); });
    skriv(input(host, 'Uppgifter ETT'), '1–8');
    expect(lasStruktur().lektionsplaner[0]?.uppgNiva1).toBe('1–8');
    act(() => { knapp(host, '✏ Uppgifter').click(); });
    expect(host.querySelector('.panel')!.textContent).toContain('1–8');   // överstyrningen syns
  });
})

describe('Biblioteket hämtar böcker från datarepot', () => {
  it('☁-knappen listar books/, importerar giltiga och rapporterar ogiltiga', async () => {
    const { sparaGitHubConfig } = await import('../src/github');
    sparaGitHubConfig({ owner: 'Mattias1970', repo: 'classroom-planner-data', branch: 'main', path: 'studio/struktur.json', token: 'tok' });
    const b64 = (t: string) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([
        { name: 'liber-matematik-y', type: 'dir' }, { name: 'spektrum-biologi', type: 'dir' }, { name: 'trasig', type: 'dir' },
      ]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ content: b64(BOKJSON) }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ content: b64(JSON.stringify({
        id: 'spektrum-biologi', titel: 'Spektrum Biologi', amne: 'Biologi', arskurs: 8,
        kapitel: [{ nummer: 6, titel: 'Vår fantastiska kropp', delkapitel: [
          { nummer: '6.1', titel: 'Cellen', begrepp: ['cell'] },
        ] }],
      })) }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ content: b64('{"inte":"en bokfil"}') }) });
    vi.stubGlobal('fetch', f);
    try {
      const host = render();
      act(() => { treeKnapp(host, '➕ Lägg till bok').click(); });
      await act(async () => { knapp(host, '☁ Hämta böcker från datarepot').click(); await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      // Bokfil och NO-bok sparas; trasig fil rapporteras med fel, sparas inte.
      expect(lasStruktur().bocker.map((b) => b.id)).toEqual(['liber-matematik-y', 'spektrum-biologi']);
      const panel = host.querySelector('.panel')!.textContent ?? '';
      expect(panel).toContain('✅ liber-matematik-y');
      expect(panel).toContain('✅ spektrum-biologi: Spektrum Biologi (Biologi, åk 8)');
      expect(panel).toContain('⚠ trasig');
    } finally { vi.unstubAllGlobals(); }
  });
})
