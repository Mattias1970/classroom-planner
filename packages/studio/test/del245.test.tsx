// @vitest-environment jsdom
/**
 * Del 245 · Ett ämne med schema men utan planering syns i kalendern, och appen säger vilket ämne det gäller.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { friBok, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.useRealTimers(); });

describe('Del 245 · kalendern visar schemalagda pass även utan planering', () => {
  it('8A Matematik utan planering: passen står i veckan som "Ingen planering" och ämnet pekas ut', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-11T07:00:00Z'));
    let s: Struktur = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = { ...s, bocker: [friBok('fb', 'Matematik', 60)] };
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'kb', tjanstId: 'tj', namn: '8B' });
    s = laggTillKlass(s, { id: 'ka', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'ma-b', klassId: 'kb', namn: 'Matematik', bokId: 'fb', schema: [{ dag: 3, start: '10:15', slut: '11:20' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'ma-b', bokId: 'fb', skapad: 'nu' });
    s = laggTillAmne(s, { id: 'ma-a', klassId: 'ka', namn: 'Matematik', bokId: 'fb', schema: [{ dag: 2, start: '08:30', slut: '09:30' }, { dag: 4, start: '13:00', slut: '14:00' }] });
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(s));
    localStorage.setItem('cp.layout', JSON.stringify('v3'));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'kalender' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });

    // 8A finns nu bland klasserna i kalendern
    const chip = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('.kal-filter .chipbtn')].find((b) => b.textContent === text)!;
    expect(chip('8A')).toBeDefined();
    act(() => { chip('Alla klasser').click(); });
    const not = host.querySelector('[aria-label="Ämnen utan planering"]')!;
    expect(not.textContent).toContain('Ingen planering: 8A Matematik');
    expect(not.textContent).not.toContain('8B');
    // veckans två pass för 8A visas streckade bredvid 8B:s planerade lektion
    const oplanerade = [...host.querySelectorAll('.sch-lekt.oplanerad')].map((x) => x.textContent);
    expect(oplanerade).toHaveLength(2);
    expect(oplanerade.every((x) => x!.includes('8A Matematik') && x!.includes('Ingen planering'))).toBe(true);
    expect(host.querySelectorAll('.sch-lekt:not(.oplanerad)').length).toBe(1);   // 8B:s planerade lektion
    // med bara 8B vald står inget om 8A
    act(() => { chip('8B').click(); });
    expect(host.querySelector('[aria-label="Ämnen utan planering"]')).toBeNull();
    expect(host.querySelectorAll('.sch-lekt.oplanerad')).toHaveLength(0);
  });
});
