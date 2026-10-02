// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  amnesPlanFor, bokFromImport, hamtaLektionsplan, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering,
  resetIdRaknare, sattLektionsplan, sparaBok, tomStruktur, type Struktur,
} from '@planner/kernel';
import { PlaneringsTavla } from '../src/PlaneringsTavla';
import { sparaStruktur } from '../src/store';

const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1 },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2 },
    { id: 3, type: 'regular', avsnitt: '1.2 Procent', del: 1 },
    { id: 4, type: 'exam', avsnitt: '1 Prov', del: 1 },
  ] },
}));
const IDAG = '2026-08-24';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
  return sattLektionsplan(s, { id: 'lp', amneId: 'ma', lektionsIndex: 2, filmer: ['Procent|https://exempel.se/p'] });
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const tsetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;

describe('Del 158 · Planeringstavlan', () => {
  it('veckor som bakgrund, tom lektion fylls i, borttag flyttar fram, utkastet ersätter planeringen från startdatum', async () => {
    let s = bygg();
    sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const rendera = () => act(() => root.render(<PlaneringsTavla s={s} amneId="ma" bok={MA} kor={kor} idag={IDAG} />));
    rendera();
    const knapp = (txt: string) => [...div.querySelectorAll('button')].find((b) => b.textContent?.includes(txt))!;
    const veckor = () => [...div.querySelectorAll('.pt-veckanr')].map((x) => x.textContent);
    const rubriker = () => [...div.querySelectorAll('.pt-kort .pt-rubrik')].map((x) => x.textContent);
    expect(veckor().slice(0, 2)).toEqual(['v. 35', 'v. 36']);
    expect(div.querySelector('.pt-kort .pt-tid')!.textContent).toContain('tis 25/8 · 10:00–11:00');
    expect(rubriker().slice(0, 2)).toEqual(['1.2 Procent', '1 Prov']);
    // Bokens lektioner före startdatum är låsta i paletten
    expect([...div.querySelectorAll('.pt-chip.fore')].length).toBe(2);

    // Tom lektion: välj kortet, lägg det först
    await act(async () => { knapp('Ny lektion').click(); });
    await act(async () => { (div.querySelector('button[aria-label="Lägg Ny lektion här"]') as HTMLButtonElement).click(); });
    expect(rubriker().slice(0, 3)).toEqual(['✎ Ny lektion', '1.2 Procent', '1 Prov']);
    // Lektionskortet öppnas — fyll i rubrik, genomgång och uppgifter
    const red = () => div.querySelector('[aria-label="Lektionskort i utkastet"]')!;
    expect(red()).not.toBeNull();
    const rubrikFalt = red().querySelector('input[aria-label="Kortets rubrik"]') as HTMLInputElement;
    await act(async () => { setter.call(rubrikFalt, 'Bråk i vardagen'); rubrikFalt.dispatchEvent(new Event('input', { bubbles: true })); rubrikFalt.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const ta = red().querySelector('textarea[aria-label="Genomgång"]') as HTMLTextAreaElement;
    await act(async () => { tsetter.call(ta, 'Recept och rabatter'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    const n1 = red().querySelector(`input[aria-label="Uppgifter ${MA.nivaer.niva1}"]`) as HTMLInputElement;
    await act(async () => { setter.call(n1, 'Stencil 1'); n1.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { knapp('Spara lektionskortet').click(); });
    expect(rubriker()[0]).toBe('✎ Bråk i vardagen');

    // Bokens lektionskort visar sina filmer
    await act(async () => { (div.querySelector('button[aria-label="Lektionskort 1.2 Procent"]') as HTMLButtonElement).click(); });
    expect((red().querySelector('textarea[aria-label="Filmer"]') as HTMLTextAreaElement).value).toBe('Procent|https://exempel.se/p');

    // Dra ett kort (drag & drop): provet först
    const data = new Map<string, string>();
    const dt = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '' };
    const provKort = [...div.querySelectorAll('.pt-kort')].find((k) => k.textContent?.includes('1 Prov'))!;
    const forsta = div.querySelector('.pt-kort')!;
    await act(async () => { const e = new Event('dragstart', { bubbles: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); provKort.dispatchEvent(e); });
    await act(async () => { const e = new Event('drop', { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); forsta.dispatchEvent(e); });
    expect(rubriker().slice(0, 3)).toEqual(['1 Prov', '✎ Bråk i vardagen', '1.2 Procent']);
    // Ta bort provet igen → de följande flyttas fram
    await act(async () => { (div.querySelector('button[aria-label="Ta bort 1 Prov"]') as HTMLButtonElement).click(); });
    expect(rubriker().slice(0, 3)).toEqual(['✎ Bråk i vardagen', '1.2 Procent', 'Tomt pass']);

    // Provdatum → provet hamnar på första teoripasset den dagen (repetition fyller ut)
    const prov = div.querySelector('input[aria-label="Provdatum"]') as HTMLInputElement;
    await act(async () => { setter.call(prov, '2026-09-03'); prov.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { knapp('Lägg provet på provdatum').click(); });
    expect(rubriker().slice(0, 4)).toEqual(['✎ Bråk i vardagen', '1.2 Procent', '✎ Repetition inför provet', '✎ Prov kapitel 1']);
    expect(div.querySelector('.pt-kort.provdag')!.textContent).toContain('tor 3/9');

    // Namn, spara och ersätt
    const namn = div.querySelector('input[aria-label="Planeringens namn"]') as HTMLInputElement;
    await act(async () => { setter.call(namn, 'Kapitel 1 kort'); namn.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { knapp('Spara utkast').click(); });
    expect(s.planUtkast?.map((x) => x.namn)).toEqual(['Kapitel 1 kort']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => { knapp('Ersätt nuvarande planering från 2026-08-24').click(); });
    const plan = amnesPlanFor(s, 'ma', IDAG)!.a;
    expect(plan.slice(0, 6).map((r) => `${r.datum} ${r.lektion.avsnitt}`)).toEqual([
      '2026-08-18 1.1 Bråk', '2026-08-20 1.1 Bråk', '2026-08-25 Bråk i vardagen', '2026-08-27 1.2 Procent',
      '2026-09-01 Repetition inför provet', '2026-09-03 Prov kapitel 1']);
    expect(hamtaLektionsplan(s, 'ma', 2)).toMatchObject({ genomgang: 'Recept och rabatter', uppgNiva1: 'Stencil 1' });
    expect(hamtaLektionsplan(s, 'ma', 3)?.filmer).toEqual(['Procent|https://exempel.se/p']);
    expect(div.textContent).toContain('Inlagd planering: Kapitel 1 kort från 2026-08-24');
  });
});

