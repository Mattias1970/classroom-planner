// @vitest-environment jsdom
/**
 * Del 262 · Lektionsplan öppnas på aktuell del: dagens lektion — annars nästa kommande — rullas högst upp när
 * ämnet eller fliken öppnas. En ändring i planeringen flyttar inte vyn.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { bokFromImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '2': { name: 'Samband och förändring', col: '#b23a48' }, '3': { name: 'Geometri', col: '#2f5aa8' } } },
  lektioner: {
    '2': [
      { id: 1, type: 'regular', avsnitt: '2.3 Andelen', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.4 Procent', del: 1 },
      { id: 3, type: 'regular', avsnitt: '2.5 Ränta', del: 1 }, { id: 4, type: 'repetition', avsnitt: 'Blandade uppgifter', del: 1 }, { id: 5, type: 'repetition', avsnitt: 'Träna', del: 1 },
    ],
    '3': [
      { id: 1, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 1 }, { id: 2, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 2 },
      { id: 3, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 1 }, { id: 4, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 2 },
    ],
  },
}));
/** Nio lektioner från mån 9/11: kapitel 2 t.o.m. mån 16/11, kapitel 3 börjar tis 17/11 och slutar mån 23/11. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-11-09', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma',
    schema: [{ dag: 1, start: '10:50', slut: '12:00' }, { dag: 2, start: '10:15', slut: '11:15' }, { dag: 3, start: '08:25', slut: '09:15' }, { dag: 5, start: '12:50', slut: '13:40' }] });
  return registreraPlanering(s, { id: 'p', amneId: 'ma', bokId: 'ma', skapad: '2026-11-01' });
}

let rot: ReturnType<typeof createRoot> | null = null;
/** Raderna i lektionsplanen som har rullats fram, i ordning. */
let rullade: Array<{ text: string; val: unknown }> = [];
beforeEach(() => {
  localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; rullade = [];
  Element.prototype.scrollIntoView = function (this: Element, val?: unknown) { if (this.tagName === 'TR') rullade.push({ text: this.textContent ?? '', val }); };
});
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.useRealTimers(); vi.restoreAllMocks(); });

function starta(idag: string): HTMLElement {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${idag}T07:00:00Z`));
  localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'amne', amneNamn: 'Matematik' }));
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  return host;
}
const flik = (host: HTMLElement, text: string) => [...host.querySelectorAll('button.flik')].find((b) => b.textContent!.includes(text)) as HTMLButtonElement;
const aktuell = (host: HTMLElement) => host.querySelector('table.plan tr[data-aktuell-rad]') as HTMLElement | null;
const datum = (rad: Element | null) => rad?.querySelectorAll('td')[2]?.textContent ?? null;

describe('Del 262 · Lektionsplan öppnas på aktuell lektion', () => {
  it('ska kapitel 3 börja i dag är det lektion 1 i kapitel 3 som rullas högst upp — inte lektion 1 i planeringen', () => {
    const host = starta('2026-11-17');
    const rad = aktuell(host)!;
    expect(datum(rad)).toBe('2026-11-17');
    expect(rad.querySelector('.lekt-avsnitt')!.textContent).toBe('3.1 Omkrets och area');
    expect(rad.querySelector('.lekt-nr')!.textContent).toBe('6');
    expect(datum(rad.previousElementSibling)).toBe('2026-11-16');         // det som varit ligger ovanför
    expect(host.querySelectorAll('table.plan tr[data-aktuell-rad]')).toHaveLength(1);
    // Raden rullades fram en gång, med överkanten högst upp
    expect(rullade).toHaveLength(1);
    expect(rullade[0].text).toContain('3.1 Omkrets och area');
    expect(rullade[0].val).toEqual({ block: 'start' });
  });

  it('en dag utan lektion: nästa kommande lektion; när allt har varit: den sista', () => {
    let host = starta('2026-11-19');                                        // torsdag — ingen lektion
    expect(datum(aktuell(host))).toBe('2026-11-20');
    expect(rullade.map((x) => x.text.includes('3.2 Cirkelns area'))).toEqual([true]);
    act(() => rot!.unmount()); rot = null; vi.useRealTimers(); document.body.innerHTML = ''; localStorage.clear(); rullade = [];
    host = starta('2027-02-01');
    expect(datum(aktuell(host))).toBe('2026-11-23');
    expect(rullade).toHaveLength(1);
  });

  it('en ändring i planeringen flyttar inte vyn; en annan flik och tillbaka, eller ett klick på den öppna fliken, går till aktuell lektion igen', () => {
    const host = starta('2026-11-17');
    expect(rullade).toHaveLength(1);
    // Bocka av en lektion: planeringen ritas om, men ingen ny rullning
    act(() => { (host.querySelector('input[aria-label="Lektion 2 avklarad"]') as HTMLInputElement).click(); });
    expect((host.querySelector('input[aria-label="Lektion 2 avklarad"]') as HTMLInputElement).checked).toBe(true);
    expect(rullade).toHaveLength(1);
    // En annan flik: ingen lektionsplan, ingen rullning
    act(() => { flik(host, 'Begrepp').click(); });
    expect(aktuell(host)).toBeNull();
    expect(rullade).toHaveLength(1);
    // Tillbaka till Lektionsplan
    act(() => { flik(host, 'Lektionsplan').click(); });
    expect(rullade).toHaveLength(2);
    expect(rullade[1].text).toContain('3.1 Omkrets och area');
    // Klick på den redan öppna fliken
    act(() => { flik(host, 'Lektionsplan').click(); });
    expect(rullade).toHaveLength(3);
    expect(datum(aktuell(host))).toBe('2026-11-17');
  });
});
