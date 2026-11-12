// @vitest-environment jsdom
/**
 * Del 246 · Samläsning i appen: 8A kryssas i på MaNOTk-stöd, och passet står i kalendern för båda klasserna.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, sattSamlasning, skapaFriPlanering, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { lasStruktur } from '../src/store';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma/NO' });
  s = laggTillKlass(s, { id: 'kb', tjanstId: 'tj', namn: '8B' });
  s = laggTillKlass(s, { id: 'ka', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'stod', klassId: 'kb', namn: 'MaNOTk-stöd', schema: [{ dag: 4, start: '14:55', slut: '15:45' }] });
  return skapaFriPlanering(s, 'stod', '2026-08-17T08:00:00Z');
}
let rot: ReturnType<typeof createRoot> | null = null;
function starta(s: Struktur, layout: 'v2' | 'v3', vy?: string): HTMLElement {
  localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(s));
  localStorage.setItem('cp.layout', JSON.stringify(layout));
  if (vy !== undefined) localStorage.setItem('cp3.vy', JSON.stringify({ typ: vy }));
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  return host;
}
const knapp = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text)) as HTMLButtonElement;

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.useRealTimers(); });

describe('Del 246 · ett lektionspass kan ha flera klasser', () => {
  it('🗓 Schema: 8A kryssas i på MaNOTk-stöd — och kan kryssas ur igen', () => {
    const host = starta(bygg(), 'v2');
    const trad = (text: string) => [...host.querySelector('.tree')!.querySelectorAll('button')].find((b) => b.textContent?.includes(text) && !b.textContent.includes('fri planering'))!;
    act(() => { trad('⊞ fäll ut').click(); });
    act(() => { trad('MaNOTk-stöd').click(); });
    act(() => { knapp(host, '🗓 Schema').click(); });
    const ruta = host.querySelector('[aria-label="Samläsning"]')!;
    expect(ruta.textContent).toContain('ett lektionspass kan ha flera klasser');
    const kryss = () => host.querySelector('input[aria-label="MaNOTk-stöd tillsammans med 8A"]') as HTMLInputElement;
    expect(kryss().checked).toBe(false);
    act(() => { kryss().click(); });
    expect(lasStruktur().amnen.find((a) => a.id === 'stod')!.medKlassIds).toEqual(['ka']);
    expect(host.querySelector('[aria-label="Samläsning"]')!.textContent).toContain('8A+8B har MaNOTk-stöd tillsammans');
    expect(host.textContent).toContain('MaNOTk-stöd läses av 8A+8B tillsammans');
    act(() => { kryss().click(); });
    expect('medKlassIds' in lasStruktur().amnen.find((a) => a.id === 'stod')!).toBe(false);
  });

  it('kalendern: passet står som 8A+8B och syns både när 8A och när 8B är vald', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-11T07:00:00Z'));
    const host = starta(sattSamlasning(bygg(), 'stod', ['ka']), 'v3', 'kalender');
    const chip = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('.kal-filter .chipbtn')].find((b) => b.textContent === text)!;
    const pass = () => [...host.querySelectorAll('.sch-lekt')].map((x) => x.querySelector('b')!.textContent);
    act(() => { chip('Alla klasser').click(); });
    expect(pass()).toEqual(['8A+8B MaNOTk-stöd']);   // ett pass, inte två
    act(() => { chip('8A').click(); });
    expect(pass()).toEqual(['8A+8B MaNOTk-stöd']);
    act(() => { chip('8B').click(); });
    expect(pass()).toEqual(['8A+8B MaNOTk-stöd']);
  });
});
