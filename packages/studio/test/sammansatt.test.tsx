// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  bokFromValfriImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, planForAmne, registreraPlanering, resetIdRaknare, sattLektionsplan, sparaBok,
  tomStruktur, type Struktur,
} from '@planner/kernel';
import { App } from '../src/App';
import { lasStruktur } from '../src/store';

function bok(id: string, amne: string, kapitel: Record<string, string[]>): string {
  const kapitelMeta: Record<string, { name: string; col: string }> = {};
  const lektioner: Record<string, unknown[]> = {};
  for (const [nr, avsnitt] of Object.entries(kapitel)) {
    kapitelMeta[nr] = { name: `Kapitel ${nr}`, col: nr === '6' ? '#8c3b2e' : '#2f5aa8' };
    lektioner[nr] = avsnitt.map((a, i) => ({ id: i + 1, type: 'regular', avsnitt: a, del: 1, ett: `${i + 1}–${i + 5}`, begrepp: `begrepp ${a}` }));
  }
  return JSON.stringify({ schema: 'classroom-planner-bok', version: 1, bok: { id, titel: `Spektrum ${amne}`, förlag: 'Liber', ämne: amne, årskurs: 8, kapitelMeta }, lektioner });
}

const MON_ONS_FRE = [1, 3, 5].map((dag) => ({ dag, start: '08:10', slut: '09:10' }));

function skola(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k8a', tjanstId: 'tj', namn: '8A' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = sparaBok(s, bokFromValfriImport(bok('bi', 'Biologi', { '4': ['4.1 Liv', '4.2 Energi', '4.3 System', '4.4 Bruka', '4.5 Ekologi'], '6': ['6.1 Celler', '6.2 Matspjälkning', '6.3 Andningen', '6.4 Blodet', '6.5 Immunförsvaret'] })));
  s = sparaBok(s, bokFromValfriImport(bok('ke', 'Kemi', { '1': ['1.1 Atomer', '1.2 Grundämnen', '1.3 Molekyler', '1.4 Blandningar', '1.5 Lösningar', '1.6 Syror'] })));
  s = laggTillAmne(s, { id: 'bi8a', klassId: 'k8a', namn: 'Biologi', bokId: 'bi', schema: MON_ONS_FRE });
  s = laggTillAmne(s, { id: 'ke8b', klassId: 'k8b', namn: 'Kemi', bokId: 'ke', schema: [2, 4].map((dag) => ({ dag, start: '10:10', slut: '11:10' })) });
  s = registreraPlanering(s, { id: 'pl-bi', amneId: 'bi8a', bokId: 'bi', skapad: '2026-08-10' });
  s = registreraPlanering(s, { id: 'pl-ke', amneId: 'ke8b', bokId: 'ke', skapad: '2026-08-10' });
  // 8B Kemi har detaljplanering på första lektionen
  return sattLektionsplan(s, { id: 'lp-ke', amneId: 'ke8b', lektionsIndex: 0, presentation: 'Atomer.pptx', mal: 'Förklara vad en atom är' });
}


const seSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
const inSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
function valj(el: Element | null, v: string) { act(() => { seSetter.call(el, v); el!.dispatchEvent(new Event('change', { bubbles: true })); }); }
function skriv(el: Element | null, v: string) { act(() => { inSetter.call(el, v); el!.dispatchEvent(new Event('input', { bubbles: true })); }); }
function knapp(rot: ParentNode, text: string): HTMLButtonElement {
  const b = [...rot.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (b === undefined) throw new Error(`Ingen knapp "${text}"`);
  return b as HTMLButtonElement;
}
const klick = (b: HTMLElement) => act(() => { b.click(); });
const lage = () => document.querySelector('[role="dialog"][aria-label="Sätt ihop planering"]') as HTMLElement;

beforeEach(() => {
  localStorage.clear(); resetIdRaknare(); document.body.innerHTML = '';
  localStorage.setItem('cp.layout', JSON.stringify('v3'));
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'planering' }));
  localStorage.setItem('cp.planeringAmne', JSON.stringify('bi8a'));
});

describe('Del 157: 🧩 Sätt ihop planering', () => {
  it('två källor sida vid sida: 5 kort ur 8B Kemi + 4 ur Biologibokens kapitel 6 → sparas med namn → läggs på 8A Biologi', () => {
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(skola()));
    const host = document.createElement('div'); document.body.appendChild(host);
    act(() => { createRoot(host).render(<App />); });
    klick(knapp(host, 'Sätt ihop planering'));
    expect(lage()).not.toBeNull();

    // Vänster: 8B:s Kemiplanering, de första fem
    const v = lage().querySelector('[aria-label="Vänster källa"]') as HTMLElement;
    expect((v.querySelector('select') as HTMLSelectElement).value).toBe('amne:bi8a');       // förval: ämnet som är öppet
    valj(v.querySelector('select'), 'amne:ke8b');
    expect(v.querySelectorAll('.si-kort')).toHaveLength(6);
    klick(knapp(v, '✓ Välj'));
    expect([...v.querySelectorAll('.si-nr')].map((x) => x.textContent)).toEqual(['1', '2', '3', '4', '5']);
    klick(knapp(v, 'Lägg till 5 valda'));

    // Höger: Biologiboken, kapitel 6, fyra kort (klick för klick, i vald ordning)
    const h = lage().querySelector('[aria-label="Höger källa"]') as HTMLElement;
    valj(h.querySelector('select'), 'bok:bi');
    valj(h.querySelector('select[aria-label="Höger kapitel"]'), '6');
    for (const t of ['6.1 Celler', '6.2 Matspjälkning', '6.4 Blodet', '6.3 Andningen']) klick(h.querySelector(`[aria-label="Höger: ${t}"]`) as HTMLElement);
    klick(knapp(h, 'Lägg till 4 valda'));

    const rader = () => [...lage().querySelectorAll('.si-rad b')].map((x) => x.textContent);
    expect(rader()).toEqual(['1.1 Atomer', '1.2 Grundämnen', '1.3 Molekyler', '1.4 Blandningar', '1.5 Lösningar', '6.1 Celler', '6.2 Matspjälkning', '6.4 Blodet', '6.3 Andningen']);
    expect(lage().querySelector('.si-mitt')!.textContent).toContain('9 lektioner · 2 källor · 1 med detaljplan');
    // Byt plats på 6.4 och 6.3
    klick(lage().querySelector('[aria-label="Flytta upp 9"]') as HTMLElement);
    expect(rader().slice(7)).toEqual(['6.3 Andningen', '6.4 Blodet']);

    // Lägg på är låst tills planeringen sparats
    expect(knapp(lage(), 'Lägg på kommande lektioner').disabled).toBe(true);
    skriv(lage().querySelector('[aria-label="Namn på planeringen"]'), 'Kemi och kroppen');
    klick(knapp(lage(), '💾 Spara'));
    expect(lasStruktur().sammansattaPlaneringar!.map((p) => `${p.namn} v${p.version}`)).toEqual(['Kemi och kroppen v1']);
    expect(lage().querySelector('.si-ok')!.textContent).toContain('Kemi och kroppen v1');
    // Ändring → ny version
    klick(lage().querySelector('[aria-label="Ta bort 9"]') as HTMLElement);
    klick(knapp(lage(), 'Spara som ny version'));
    expect(lasStruktur().sammansattaPlaneringar!.map((p) => `${p.namn} v${p.version} (${p.lektioner.length})`)).toEqual(['Kemi och kroppen v1 (9)', 'Kemi och kroppen v2 (8)']);

    // Lägg på 8A Biologi (förvalt) från nästa pass
    expect((lage().querySelector('[aria-label="Ämne att lägga planeringen på"]') as HTMLSelectElement).value).toBe('bi8a');
    klick(knapp(lage(), 'Lägg på kommande lektioner'));
    const s = lasStruktur();
    const aktiv = s.planeringar.find((p) => p.amneId === 'bi8a')!;
    expect(aktiv).toMatchObject({ version: 2, sammansatt: { namn: 'Kemi och kroppen', version: 2 } });
    const idag = new Date().toISOString().slice(0, 10);
    const kommande = planForAmne(s, 'bi8a', idag).filter((p) => p.datum !== null && p.datum >= aktiv.sammansatt!.fran).map((p) => p.lektion.avsnitt);
    expect(kommande.slice(0, 8)).toEqual(['1.1 Atomer', '1.2 Grundämnen', '1.3 Molekyler', '1.4 Blandningar', '1.5 Lösningar', '6.1 Celler', '6.2 Matspjälkning', '6.3 Andningen']);
    // Kemins detaljplan följde med kortet
    const i = planForAmne(s, 'bi8a', idag).findIndex((p) => p.lektion.avsnitt === '1.1 Atomer');
    expect(s.lektionsplaner.find((p) => p.amneId === 'bi8a' && p.lektionsIndex === i)).toMatchObject({ presentation: 'Atomer.pptx' });
    expect(lage().textContent).toContain('Ämnet har nu Kemi och kroppen v2');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(host.querySelector('.si-chip')!.textContent).toContain('🧩 Kemi och kroppen v2 från');
  });
});
