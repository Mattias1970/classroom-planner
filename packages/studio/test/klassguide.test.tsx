// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { bokFromValfriImport, laggTillSkolar, resetIdRaknare, sparaBok, tomStruktur } from '@planner/kernel';
import { App } from '../src/App';
import { lasStruktur } from '../src/store';

// Schema-PDF:en läses med pdf.js i appen; här ersätts läsaren med textbitarna från kernelns fixtur (fejkat schema).
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../kernel/test/fixtures/mittschema.json'), 'utf-8')) as unknown[];
vi.mock('../src/pdfLasare', () => ({ lasPdfItems: async () => ITEMS }));

const MATTEJSON = JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'liber-matematik-y', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': Array.from({ length: 12 }, (_, i) => ({ id: i + 1, type: 'regular', avsnitt: `1.${i + 1} Avsnitt`, del: 1, ett: '1–8', sidor_teori: 's. 10' })) },
});

const seSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
const taSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
function valj(el: HTMLSelectElement, v: string) { act(() => { seSetter.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); }); }
function skriv(el: HTMLTextAreaElement, v: string) { act(() => { taSetter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
function knapp(rot: ParentNode, text: string): HTMLButtonElement {
  const b = [...rot.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (b === undefined) throw new Error(`Ingen knapp "${text}"`);
  return b as HTMLButtonElement;
}
function klick(b: HTMLElement) { act(() => { b.click(); }); }
const guide = () => document.querySelector('[role="dialog"][aria-label="Ny klass steg för steg"]') as HTMLElement;

beforeEach(() => {
  localStorage.clear(); resetIdRaknare(); document.body.innerHTML = '';
  localStorage.setItem('cp.layout', JSON.stringify('v3'));
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'oversikt' }));
});

function render(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(<App />); });
  return host;
}

describe('Del 155: lathund — ny klass steg för steg', () => {
  it('från tom app: läsår → schema-PDF (bara vald klass) → bok väljs automatiskt → planeringar → elever → klart', async () => {
    // Biblioteket har en matematikbok; inga klasser än
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(sparaBok(tomStruktur(), bokFromValfriImport(MATTEJSON))));
    const host = render();

    // Översikten visar "Kom igång" när det saknas klasser
    const komIgang = host.querySelector('.kg-komigang') as HTMLElement;
    expect(komIgang.textContent).toContain('Lägg till din första klass');
    klick(knapp(komIgang, 'Ny klass – steg för steg'));
    expect(guide()).not.toBeNull();

    // 1 · Läsår: inget finns → skapa-rutan är öppen med förslag
    expect(knapp(guide(), 'Nästa').disabled).toBe(true);
    klick(knapp(guide(), 'Skapa läsår'));
    expect(lasStruktur().skolar).toHaveLength(1);
    klick(knapp(guide(), 'Nästa'));

    // 2 · Klass & schema: ladda upp PDF, båda klasserna förvalda, välj bort 8A
    expect(guide().querySelector('h3')!.textContent).toContain('Klass och schema');
    expect(knapp(guide(), 'Nästa').disabled).toBe(true);
    klick(knapp(guide(), 'Ladda upp schemat'));
    const fil = guide().querySelector('input[aria-label="Schema-PDF"]') as HTMLInputElement;
    Object.defineProperty(fil, 'files', { value: [new File(['%PDF'], 'schema.pdf', { type: 'application/pdf' })] });
    await act(async () => { fil.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    const kl8A = guide().querySelector('input[aria-label="Klass 8A"]') as HTMLInputElement;
    const kl8B = guide().querySelector('input[aria-label="Klass 8B"]') as HTMLInputElement;
    expect(kl8A.checked).toBe(true); expect(kl8B.checked).toBe(true);
    klick(kl8A);
    klick(knapp(guide(), 'Lägg in 8B'));
    const s2 = lasStruktur();
    expect(s2.klasser.map((k) => k.namn)).toEqual(['8B']);
    expect(s2.amnen.map((a) => a.namn).sort()).toEqual(['Biologi', 'Fysik', 'Kemi', 'Matematik', 'Teknik']);
    expect(guide().querySelector('.kg-sammanfattning')!.textContent).toContain('Matematik (4 pass/v)');
    expect(guide().querySelector('.kg-stegknapp.klar')).not.toBeNull();
    klick(knapp(guide(), 'Nästa'));

    // 3 · Böcker: den enda matematikboken är redan vald; NO saknar bok → hämta från datarepot erbjuds
    const bokval = guide().querySelector('select[aria-label="Bok för Matematik"]') as HTMLSelectElement;
    expect(bokval.value).toBe('liber-matematik-y');
    expect(lasStruktur().amnen.find((a) => a.namn === 'Matematik')!.bokId).toBe('liber-matematik-y');
    expect(knapp(guide(), 'Hämta böcker från datarepot')).toBeTruthy();
    expect(guide().querySelectorAll('.kg-saknas')).toHaveLength(4);
    klick(knapp(guide(), 'Nästa'));

    // 4 · Planering: bara ämnen med bok får planering, ingenting annat rörs
    klick(knapp(guide(), 'Skapa planeringar'));
    const mat = lasStruktur().amnen.find((a) => a.namn === 'Matematik')!;
    expect(lasStruktur().planeringar.map((p) => p.amneId)).toEqual([mat.id]);
    expect(guide().querySelector('.kg-info')!.textContent).toContain('Planering skapad för Matematik');
    expect(guide().querySelector('.kg-info')!.textContent).toContain('Utan bok (hoppades över): Biologi, Fysik, Kemi, Teknik');
    klick(knapp(guide(), 'Nästa'));

    // 5 · Elever: klistra in-listan är utfälld direkt
    const lista = guide().querySelector('textarea[aria-label="Elevlista"]') as HTMLTextAreaElement;
    expect((lista.closest('details') as HTMLDetailsElement).open).toBe(true);
    skriv(lista, 'Testsson, Ted\nProvlund, Pia');
    klick(knapp(guide(), 'Lägg till alla'));
    expect(lasStruktur().elever.map((e) => e.namn)).toEqual(['Testsson, Ted', 'Provlund, Pia']);
    expect(guide().textContent).not.toContain('Ta bort klass');
    klick(knapp(guide(), 'Klart'));

    // 6 · Klart: checklistan visar det som återstår (NO-böcker) och kan öppna planeringen
    const check = guide().querySelector('.kg-checklista') as HTMLElement;
    expect(check.textContent).toContain('Elever: 2');
    expect(check.textContent).toContain('Bok saknas för Biologi, Fysik, Kemi, Teknik');
    expect(check.textContent).toContain('Planering saknas för Biologi, Fysik, Kemi, Teknik');
    expect(knapp(check, 'gör klart')).toBeTruthy();   // böcker/planering för NO
    klick(knapp(guide(), 'Öppna planeringen'));
    expect(guide()).toBeNull();
    expect((host.querySelector('select[aria-label="Filter ämne"]') as HTMLSelectElement).value).toBe(mat.id);
  });

  it('för hand: ny klass i befintligt läsår, ämne med pass i den inbäddade klasspanelen; guiden öppnas igen där klassen står', () => {
    const s0 = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(sparaBok(s0, bokFromValfriImport(MATTEJSON))));
    const host = render();
    klick(knapp(host.querySelector('.kg-komigang')!, 'Ny klass – steg för steg'));
    expect((guide().querySelector('select[aria-label="Läsår för klassen"]') as HTMLSelectElement).value).toBe('la');
    klick(knapp(guide(), 'Nästa'));
    klick(knapp(guide(), 'Lägg in för hand'));
    const namn = guide().querySelector('input[aria-label="Klassens namn i guiden"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(namn, '8F'); namn.dispatchEvent(new Event('input', { bubbles: true })); });
    klick(knapp(guide(), 'Skapa klassen'));
    expect(lasStruktur().klasser.map((k) => k.namn)).toEqual(['8F']);
    expect(lasStruktur().tjanster.map((t) => t.namn)).toEqual(['Ma/NO']);
    // Den inbäddade klasspanelen: välj Matematik med boken och lägg till (standardpass förifyllt)
    const inb = guide().querySelector('.kg-inbaddad') as HTMLElement;
    valj(inb.querySelector('select[aria-label="Ämne"]') as HTMLSelectElement, 'Matematik');
    klick(knapp(inb, 'Lägg till ämne'));
    expect(lasStruktur().amnen.map((a) => a.namn)).toEqual(['Matematik']);
    expect(knapp(guide(), 'Nästa').disabled).toBe(false);
    // Stäng med Esc och öppna igen från genvägen — checklistan räknas ur strukturen
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(guide()).toBeNull();
    klick(knapp(host, 'Ny klass – steg för steg'));
    klick(knapp(guide(), 'Nästa'));
    valj(guide().querySelector('select[aria-label="Befintlig klass"]') as HTMLSelectElement, lasStruktur().klasser[0].id);
    klick(knapp(guide(), 'Nästa'));
    expect((guide().querySelector('select[aria-label="Bok för Matematik"]') as HTMLSelectElement).value).toBe('liber-matematik-y');
  });
});
