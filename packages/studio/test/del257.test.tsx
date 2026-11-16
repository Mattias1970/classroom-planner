// @vitest-environment jsdom
/** Del 257 · Alla menyval under Planering visar en beskrivning när musen stannar över dem. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PLANERINGSMENY, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma/NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  return laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 2, start: '09:00', slut: '10:00' }], halvklass: true, schemaB: [{ dag: 3, start: '09:00', slut: '10:00' }] });
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.restoreAllMocks(); });

describe('Del 257 · beskrivningar på menyvalen i Planering', () => {
  it('varje flik i ämnets meny har en beskrivning — också när den inte går att använda än', async () => {
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'planering' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });

    // Ämnesflikarna: klass och ämne, och att planering saknas
    const amnen = [...host.querySelectorAll('[aria-label="Planera ämne"] [role="tab"]')];
    expect(amnen.map((b) => b.getAttribute('title')).sort()).toEqual([
      'Öppnar Biologi i 8A. Ämnet har ingen planering än — välj bok och tryck ▶ Skapa planering.',
      'Öppnar Matematik i 8A. Ämnet har ingen planering än — välj bok och tryck ▶ Skapa planering.',
    ]);
    const flikFor = (amne: string) => amnen.find((b) => b.textContent!.includes(amne)) as HTMLButtonElement;
    await act(async () => { flikFor('Matematik').click(); });

    const titel = (text: string) => {
      const el = [...host.querySelectorAll('.flikar .flik')].find((b) => b.textContent!.includes(text));
      expect(el, text).toBeDefined();
      return el!.getAttribute('title') ?? '';
    };
    // Ingen flik saknar beskrivning
    for (const el of host.querySelectorAll('.flikar .flik')) expect(el.getAttribute('title') ?? '', el.textContent ?? '').not.toBe('');
    expect(titel('Lektionsplan')).toBe(PLANERINGSMENY.planering);
    expect(titel('Detaljplanering')).toBe(PLANERINGSMENY.detalj);
    expect(titel('Schema')).toBe(PLANERINGSMENY.installningar);
    expect(titel('Årsöversikt')).toBe(PLANERINGSMENY.arsoversikt);
    expect(titel('Skriv ut')).toBe(PLANERINGSMENY.skrivUt);
    // Ämnet har ingen bok: det står först, sedan vad valet gör
    expect(titel('Kortrad')).toBe(`Koppla en bok först — ${PLANERINGSMENY.kortrad}`);
    expect(titel('Planeringstavla')).toBe(`Koppla en bok först — ${PLANERINGSMENY.tavla}`);
    for (const [text, val] of [['Översikt', 'oversikt'], ['Uppgifter', 'uppgifter'], ['Begrepp', 'begrepp'], ['Filmer', 'filmer'], ['Magma', 'magma'], ['Anteckningar', 'anteckningar'], ['Provlapp', 'provlapp'], ['Planeringsmall', 'planeringsmall']] as const) {
      expect(titel(text)).toBe(`Koppla en bok först — ${PLANERINGSMENY[val]}`);
    }
    expect(titel('Vecka → Word')).toBe(`Koppla en bok först — ${PLANERINGSMENY.veckaWord}`);
    expect(titel('Kapitel → Word')).toBe(`Koppla en bok först — ${PLANERINGSMENY.kapitelWord}`);
    expect(titel('Pedagogisk planering')).toContain(PLANERINGSMENY.pedagogiskPlanering);

    // Spara, Hämta och Kalender
    const knapp = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent!.trim().startsWith(text))!.getAttribute('title');
    expect(knapp('💾 Spara')).toBe(PLANERINGSMENY.spara);
    expect(knapp('📂 Hämta')).toBe(PLANERINGSMENY.hamta);
    expect(knapp('Kalender →')).toBe(PLANERINGSMENY.kalender);

    // NO-ämnet i halvklass har också Laborationer (och ingen Magma)
    await act(async () => { flikFor('Biologi').click(); });
    expect(titel('Laborationer')).toBe(`Koppla en bok först — ${PLANERINGSMENY.laborationer}`);
    expect([...host.querySelectorAll('.flikar .flik')].some((b) => b.textContent!.includes('Magma'))).toBe(false);
    for (const el of host.querySelectorAll('.flikar .flik')) expect(el.getAttribute('title') ?? '', el.textContent ?? '').not.toBe('');
  });
});
