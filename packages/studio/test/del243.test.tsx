// @vitest-environment jsdom
/**
 * Del 243 · 'Matematik spec' heter 'MaNOTk-stöd' (sparad data döps om vid inläsning), och NO+Tk-perioderna
 * står i den ordning delämnena läses.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { amnesForkortning, arStodAmne, friBok, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, sattNoPeriod, STOD_AMNEN, tomStruktur, uppdateraAmnesnamn, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { exportJson, importJson, lasStruktur } from '../src/store';

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma/NO' });
  return laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; });

describe("Del 243 · 'Matematik spec' heter 'MaNOTk-stöd'", () => {
  const gammal = (): Struktur => {
    let s: Struktur = { ...grund(), bocker: [friBok('fb', 'Matematik spec', 4)] };
    s = laggTillAmne(s, { id: 'sp', klassId: 'k', namn: 'Matematik spec', bokId: 'fb', schema: [{ dag: 2, start: '13:00', slut: '14:00' }] });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
    return { ...s, planeringar: [{ id: 'p1', amneId: 'sp', bokId: 'fb', namn: 'Matematik spec 8A · Matematik spec (fri planering) · v1 (2026-09-05)', version: 1 } as unknown as Struktur['planeringar'][number]] };
  };

  it('stödämnet, förkortningen i schemat och listan över stödämnen', () => {
    expect(STOD_AMNEN).toEqual(['Matematik stöd', 'MaNOTk-stöd', 'Ma/NO-stöd']);
    expect(arStodAmne('MaNOTk-stöd')).toBe(true);
    expect(amnesForkortning('MaNOTk-stöd')).toBe('MaNOTk');
  });

  it('sparad data döps om: ämnet, den fria boken och planeringens namn — Matematik rörs inte', () => {
    const s = gammal();
    const ny = uppdateraAmnesnamn(s);
    expect(ny.amnen.map((a) => a.namn)).toEqual(['MaNOTk-stöd', 'Matematik']);
    expect(ny.bocker.map((b) => [b.amne, b.titel])).toEqual([['MaNOTk-stöd', 'MaNOTk-stöd (fri planering)']]);
    expect(ny.planeringar.map((p) => p.namn)).toEqual(['MaNOTk-stöd 8A · MaNOTk-stöd (fri planering) · v1 (2026-09-05)']);
    expect(uppdateraAmnesnamn(ny)).toBe(ny);   // inget kvar att byta: samma objekt
    expect(s.amnen[0].namn).toBe('Matematik spec');   // indata muteras inte
  });

  it('appen döper om vid start och sparar direkt; en gammal backup döps om när den läses in', () => {
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(gammal()));
    expect(lasStruktur().amnen.map((a) => a.namn)).toEqual(['MaNOTk-stöd', 'Matematik']);
    expect(localStorage.getItem('classroom-planner.studio.v2')).not.toContain('Matematik spec');
    expect(importJson(exportJson(gammal())).amnen[0].namn).toBe('MaNOTk-stöd');
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    expect(host.textContent).toContain('MaNOTk-stöd');
    expect(host.textContent).not.toContain('Matematik spec');
  });
});

describe('Del 243 · NO+Tk-perioderna står i kronologisk ordning', () => {
  it('delämnena sorteras på periodens startdatum, inte på blocknumret', () => {
    let s = grund();
    ['Biologi', 'Fysik', 'Kemi', 'Teknik'].forEach((namn, i) => {
      s = laggTillAmne(s, { id: `no${i}`, klassId: 'k', namn, noGrupp: 'no', noOrder: i, schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
    });
    // Kemi läses före Fysik
    s = sattNoPeriod(s, 'no0', { fran: '2026-08-20', till: '2026-11-06' });
    s = sattNoPeriod(s, 'no1', { fran: '2027-01-21', till: '2027-03-25' });
    s = sattNoPeriod(s, 'no2', { fran: '2026-11-09', till: '2027-01-18' });
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(s));
    localStorage.setItem('cp.layout', JSON.stringify('v3'));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    const tabell = host.querySelector('table[aria-label="NO+Tk-perioder 8A"]')!;
    expect([...tabell.querySelectorAll('tbody tr td:first-child b')].map((b) => b.textContent)).toEqual(['Biologi', 'Kemi', 'Fysik', 'Teknik']);
    const fran = [...tabell.querySelectorAll<HTMLInputElement>('tbody input[aria-label$="från datum"]')].map((i) => i.value);
    expect(fran).toEqual([...fran].sort());
  });
});
