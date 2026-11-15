// @vitest-environment jsdom
/**
 * Del 254 · Appens data ligger i webbläsarens stora lagring. Det som låg i den lilla flyttas över första gången,
 * kontrolleras och läggs undan som reserv; sedan sparas allt i den stora — också mer än den lilla rymmer.
 * Flikar håller varandra uppdaterade. Utan stor lagring gäller den lilla precis som förut.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import type { Dokumentlager } from '../src/storlagring';
import type { Kanal } from '../src/store';

const KEY = 'classroom-planner.studio.v2';
function bygg(klass = '8B'): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  return laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: klass });
}

/** Ett dokumentlager i minnet som beter sig som IndexedDB: allt är asynkront och en skrivning är allt eller inget. */
function minneslager() {
  const data = new Map<string, unknown>();
  const skrivningar: Array<Array<[string, unknown]>> = [];
  const lage = { vagra: false, forvrang: false };
  const lager: Dokumentlager = {
    las: async (nycklar) => nycklar.map((n) => data.get(n)),
    skriv: async (poster, taBort = []) => {
      await Promise.resolve();
      if (lage.vagra) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      skrivningar.push(poster);
      for (const [n, v] of poster) data.set(n, lage.forvrang && n === 'struktur' ? `${String(v)}x` : v);
      for (const n of taBort) data.delete(n);
    },
    nycklar: async () => [...data.keys()],
  };
  return { lager, data, skrivningar, lage };
}
/** En kanal mellan flikar: det en skickar får alla andra. */
function kanalnav() {
  const lyssnare: Array<{ agare: object; cb: (m: string) => void }> = [];
  return (): Kanal => {
    const agare = {};
    return { skicka: (m) => { for (const l of lyssnare) if (l.agare !== agare) l.cb(m); }, lyssna: (cb) => { lyssnare.push({ agare, cb }); } };
  };
}
/** Den lilla lagringen tar inte emot strukturen (som när den är full). */
function fullLillaLagring() {
  const riktig = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    riktig.call(this, k, v);
  });
}
/** En egen kopia av store-modulen — som en egen flik. */
async function flik() { vi.resetModules(); return import('../src/store'); }
const reserver = (data: Map<string, unknown>) => [...data.keys()].filter((n) => n.startsWith('reserv:'));

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { vi.restoreAllMocks(); });

describe('Del 254 · flytten från den lilla lagringen', () => {
  it('det som låg i den lilla lagringen flyttas över, läggs undan som reserv och tas bort ur den lilla', async () => {
    const text = JSON.stringify(bygg('8B'));
    localStorage.setItem(KEY, text);
    localStorage.setItem('st.omfang', '"allt"');
    const { lager, data } = minneslager();
    const store = await flik();
    await store.startaLagring({ lager, kanal: null });

    expect(store.storLagring()).toBe(true);
    expect(data.get('struktur')).toBe(text);                       // tecken för tecken
    expect(reserver(data)).toHaveLength(1);
    expect(data.get(reserver(data)[0])).toBe(text);
    expect(localStorage.getItem(KEY)).toBeNull();                  // den lilla lagringen är tömd på strukturen…
    expect(localStorage.getItem('st.omfang')).toBe('"allt"');      // …men inställningarna ligger kvar
    expect(store.lasStruktur().klasser.map((k) => k.namn)).toEqual(['8B']);
    expect(store.lasStruktur()).toBe(store.lasStruktur());
    expect(store.lagradeTecken()).toBe(text.length);
  });

  it('stämmer inte det som lästes tillbaka rörs ingenting — den lilla lagringen gäller', async () => {
    const text = JSON.stringify(bygg('8B'));
    localStorage.setItem(KEY, text);
    const m = minneslager(); m.lage.forvrang = true;
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    expect(store.storLagring()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(text);
    expect(store.lasStruktur().klasser.map((k) => k.namn)).toEqual(['8B']);
  });

  it('vägrar den stora lagringen skrivningen ligger allt kvar i den lilla', async () => {
    const text = JSON.stringify(bygg('8B'));
    localStorage.setItem(KEY, text);
    const m = minneslager(); m.lage.vagra = true;
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    expect(store.storLagring()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(text);
    expect(m.data.size).toBe(0);
  });

  it('utan stor lagring fungerar allt som förut', async () => {
    const store = await flik();
    await store.startaLagring({ lager: null, kanal: null });
    expect(store.storLagring()).toBe(false);
    const s = bygg();
    store.sparaStruktur(s);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(s));
    expect(store.lasStruktur()).toBe(s);
  });

  it('nästa start läser ur den stora lagringen — och lägger undan det en äldre version sparat i den lilla', async () => {
    const m = minneslager();
    m.data.set('struktur', JSON.stringify(bygg('8B'))); m.data.set('stampel', 'a');
    localStorage.setItem(KEY, JSON.stringify(bygg('gammal')));
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    expect(store.lasStruktur().klasser.map((k) => k.namn)).toEqual(['8B']);      // den stora gäller
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(reserver(m.data).map((n) => (JSON.parse(m.data.get(n) as string) as Struktur).klasser[0].namn)).toEqual(['gammal']);
    const info = await store.lagringsinfo();
    expect(info.stor).toBe(true);
    expect(info.reserver).toHaveLength(1);
    // Kopian kan laddas ner som en vanlig backup och tas bort
    const kopia = await store.lasReservkopia(info.reserver[0].nyckel);
    expect(store.importJson(store.reservSomBackup(kopia!)).klasser[0].namn).toBe('gammal');
    await store.taBortReservkopia(info.reserver[0].nyckel);
    expect((await store.lagringsinfo()).reserver).toEqual([]);
  });

  it('ett dokument som inte går att läsa läggs undan innan något nytt sparas över det', async () => {
    const m = minneslager();
    m.data.set('struktur', 'inte json'); m.data.set('stampel', 'a');
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    expect(store.lasStruktur().klasser).toEqual([]);
    expect(reserver(m.data).map((n) => m.data.get(n))).toEqual(['inte json']);
  });

  it('högst tre undanlagda kopior sparas — den äldsta tas bort', async () => {
    const m = minneslager();
    for (const d of ['2026-01-01T10:00:00', '2026-02-01T10:00:00', '2026-03-01T10:00:00']) m.data.set(`reserv:${d}`, d);
    localStorage.setItem(KEY, JSON.stringify(bygg()));
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    expect(reserver(m.data)).toHaveLength(3);
    expect(reserver(m.data)).not.toContain('reserv:2026-01-01T10:00:00');
  });
});

describe('Del 254 · sparning i den stora lagringen', () => {
  it('mer än den lilla lagringen rymmer sparas utan fel — och finns kvar vid nästa start', async () => {
    const m = minneslager();
    const lilla = fullLillaLagring();
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    const s = bygg('8A');
    store.sparaStruktur(s);
    expect(store.lasStruktur()).toBe(s);                           // direkt, utan att vänta på lagringen
    await store.vantaPaLagring();
    expect(m.data.get('struktur')).toBe(JSON.stringify(s));
    expect(lilla.mock.calls.filter(([k]) => k === KEY)).toEqual([]);   // den lilla lagringen används inte alls

    const nasta = await flik();                                    // sidan laddas om
    await nasta.startaLagring({ lager: m.lager, kanal: null });
    expect(nasta.lasStruktur().klasser.map((k) => k.namn)).toEqual(['8A']);
  });

  it('flera sparningar i samma klick blir en skrivning med det sista', async () => {
    const m = minneslager();
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    store.sparaStruktur(bygg('1')); store.sparaStruktur(bygg('2')); store.sparaStruktur(bygg('3'));
    await store.vantaPaLagring();
    expect(m.skrivningar).toHaveLength(1);
    expect((JSON.parse(m.data.get('struktur') as string) as Struktur).klasser[0].namn).toBe('3');
  });

  it('sparas något medan en skrivning pågår skrivs det ut efteråt — det sista vinner', async () => {
    const m = minneslager();
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    store.sparaStruktur(bygg('1'));
    await Promise.resolve();                                       // skrivningen har gått iväg
    store.sparaStruktur(bygg('2'));
    await store.vantaPaLagring();
    expect((JSON.parse(m.data.get('struktur') as string) as Struktur).klasser[0].namn).toBe('2');
  });

  it('tar lagringen inte emot dokumentet visas felet, minnet gäller, och nästa sparning som går igenom tar bort det', async () => {
    const m = minneslager();
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    const { App } = await import('../src/App');
    const host = document.createElement('div'); document.body.appendChild(host);
    const rot = createRoot(host);
    await act(async () => { rot.render(<App />); });
    expect(host.querySelector('.sparfel')).toBeNull();

    m.lage.vagra = true;
    const s = bygg('8A');
    await act(async () => { store.sparaStruktur(s); await store.vantaPaLagring(); });
    expect(store.lasStruktur()).toBe(s);
    expect(host.querySelector('.sparfel')!.textContent).toContain('Det senaste kunde inte sparas i webbläsaren.');
    expect(host.querySelector('.sparfel')!.textContent).toContain('disken kan vara full');
    expect(host.querySelector('.sparfel')!.textContent).not.toContain('lagringen är full');

    m.lage.vagra = false;
    await act(async () => { store.sparaStruktur(bygg('8B')); await store.vantaPaLagring(); });
    expect(host.querySelector('.sparfel')).toBeNull();
    act(() => rot.unmount());
  });
});

describe('Del 254 · två flikar', () => {
  it('det ena fliken sparar syns i den andra', async () => {
    const m = minneslager(); const kanal = kanalnav();
    const a = await flik(); await a.startaLagring({ lager: m.lager, kanal: kanal() });
    const b = await flik(); await b.startaLagring({ lager: m.lager, kanal: kanal() });
    const sagtTill = vi.fn();
    b.prenumereraStruktur(sagtTill);

    a.sparaStruktur(bygg('8A'));
    await a.vantaPaLagring();
    await vi.waitFor(() => expect(sagtTill).toHaveBeenCalledTimes(1));
    expect(b.lasStruktur().klasser.map((k) => k.namn)).toEqual(['8A']);
    expect(sagtTill).toHaveBeenCalledTimes(1);

    // och åt andra hållet — den som sparade får inget eget meddelande tillbaka
    const aSagtTill = vi.fn(); a.prenumereraStruktur(aSagtTill);
    b.sparaStruktur(bygg('8B'));
    await b.vantaPaLagring();
    await vi.waitFor(() => expect(aSagtTill).toHaveBeenCalledTimes(1));
    expect(a.lasStruktur().klasser.map((k) => k.namn)).toEqual(['8B']);
    expect(sagtTill).toHaveBeenCalledTimes(1);
  });

  it('en flik som har något som inte gick att spara behåller sitt — det finns ingen annanstans', async () => {
    const m = minneslager(); const kanal = kanalnav();
    const a = await flik(); await a.startaLagring({ lager: m.lager, kanal: kanal() });
    const b = await flik(); await b.startaLagring({ lager: m.lager, kanal: kanal() });
    m.lage.vagra = true;
    b.sparaStruktur(bygg('bara i B'));
    await b.vantaPaLagring();
    m.lage.vagra = false;
    a.sparaStruktur(bygg('8A'));
    await a.vantaPaLagring();
    await new Promise((r) => setTimeout(r, 10));
    expect(b.lasStruktur().klasser.map((k) => k.namn)).toEqual(['bara i B']);
  });

  it('appen ritar om när en annan flik har sparat', async () => {
    const m = minneslager(); const kanal = kanalnav();
    m.data.set('struktur', JSON.stringify(bygg('8B'))); m.data.set('stampel', 'a');
    const a = await flik(); await a.startaLagring({ lager: m.lager, kanal: kanal() });
    const { App } = await import('../src/App');
    const host = document.createElement('div'); document.body.appendChild(host);
    const rot = createRoot(host);
    await act(async () => { rot.render(<App />); });
    expect(host.textContent).toContain('8B');
    expect(host.textContent).not.toContain('8Q');

    // "den andra fliken": en egen kopia av modulen mot samma lagring
    const kvar = a;
    const b = await flik(); await b.startaLagring({ lager: m.lager, kanal: kanal() });
    await act(async () => { b.sparaStruktur(bygg('8Q')); await b.vantaPaLagring(); await new Promise((r) => setTimeout(r, 10)); });
    expect(kvar.lasStruktur().klasser.map((k) => k.namn)).toEqual(['8Q']);
    expect(host.textContent).toContain('8Q');
    act(() => rot.unmount());
  });
});
