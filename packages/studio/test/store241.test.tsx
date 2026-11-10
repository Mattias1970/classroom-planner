// @vitest-environment jsdom
/**
 * Del 241 · Strukturen hålls i minnet: lasStruktur() lämnar samma objekt så länge lagringen är oförändrad,
 * och en sparning som webbläsaren inte tar emot (lagringen full) syns i stället för att tyst försvinna.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { lagradeTecken, lasStruktur, sparaStruktur } from '../src/store';

const KEY = 'classroom-planner.studio.v2';
function bygg(klass = '8B'): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  return laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: klass });
}
/** Lagringen säger ifrån för strukturen (som när den är full); allt annat sparas som vanligt. */
function fullLagring() {
  const riktig = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    riktig.call(this, k, v);
  });
}

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { vi.restoreAllMocks(); });

describe('Del 241 · lasStruktur() tolkar inte om dokumentet i onödan', () => {
  it('samma objekt så länge lagringen är oförändrad — och det sparade objektet är det som läses', () => {
    const s = bygg();
    sparaStruktur(s);
    expect(lasStruktur()).toBe(s);
    expect(lasStruktur()).toBe(s);
    expect(lagradeTecken()).toBe(JSON.stringify(s).length);
  });

  it('ändras lagringen från annat håll (annan flik, återställd backup) läses det nya', () => {
    sparaStruktur(bygg('8B'));
    localStorage.setItem(KEY, JSON.stringify(bygg('8A')));
    const last = lasStruktur();
    expect(last.klasser.map((k) => k.namn)).toEqual(['8A']);
    expect(lasStruktur()).toBe(last);                       // och sedan samma objekt igen
    localStorage.clear();
    expect(lasStruktur().klasser).toEqual([]);
    localStorage.setItem(KEY, 'inte json');
    expect(lasStruktur().klasser).toEqual([]);
  });

  it('en struktur som ändras på plats avslöjas i testerna vid nästa läsning', () => {
    sparaStruktur(bygg());
    (lasStruktur().klasser as unknown[]).push({ id: 'x' });
    expect(() => lasStruktur()).toThrow(/ändrats på plats/);
    sparaStruktur(bygg());                                   // en ny sparning ställer allt till rätta
    expect(lasStruktur().klasser).toHaveLength(1);
  });
});

describe('Del 241 · en sparning som inte går fram', () => {
  it('minnet gäller resten av sessionen — nästa läsning ger det senast gjorda, inte den äldre lagrade versionen', () => {
    const gammal = bygg('8B');
    sparaStruktur(gammal);
    fullLagring();
    const ny = bygg('8A');
    sparaStruktur(ny);
    expect(lasStruktur()).toBe(ny);
    expect(JSON.parse(localStorage.getItem(KEY)!).klasser[0].namn).toBe('8B');   // lagringen har kvar det gamla
    // En ändring till ovanpå den osparade bygger vidare på den, inte på den gamla
    const nasta = laggTillKlass(lasStruktur(), { id: 'k2', tjanstId: 'tj', namn: '8C' });
    sparaStruktur(nasta);
    expect(lasStruktur().klasser.map((k) => k.namn)).toEqual(['8A', '8C']);
  });

  it('appen säger till överst när lagringen är full, och varningen försvinner när en sparning går igenom', async () => {
    sparaStruktur(bygg());
    const host = document.createElement('div'); document.body.appendChild(host);
    const rot = createRoot(host);
    act(() => { rot.render(<App />); });
    expect(host.querySelector('.sparfel')).toBeNull();
    const spion = fullLagring();
    act(() => { sparaStruktur(laggTillKlass(lasStruktur(), { id: 'k2', tjanstId: 'tj', namn: '8C' })); });
    const ruta = host.querySelector('.sparfel')!;
    expect(ruta.getAttribute('role')).toBe('alert');
    expect(ruta.textContent).toContain('Det senaste kunde inte sparas i webbläsaren — lagringen är full');
    expect(ruta.textContent).toContain('Spara strukturen till datarepot eller ta en ⬇ Backup nu');
    spion.mockRestore();
    act(() => { sparaStruktur(lasStruktur()); });
    expect(host.querySelector('.sparfel')).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!).klasser.map((k: { namn: string }) => k.namn)).toEqual(['8B', '8C']);
    act(() => rot.unmount());
  });
});
