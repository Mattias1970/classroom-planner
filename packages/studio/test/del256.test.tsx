// @vitest-environment jsdom
/**
 * Del 256 · Förhör som fått en avlägsen lektions datum: appen frågar, rättar på "Ja" (går att ångra) och låter
 * bli på "Inte nu". Och vyerna Resultat och Elever klarar att datan kommer först efter att de ritats.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraFil, resetIdRaknare, tomStruktur, type FragaSvar, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { exportJson, lasStruktur } from '../src/store';

const ELEVER = ['Anna Testsson', 'Omar Provlund'];
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  for (const [i, namn] of ELEVER.entries()) s = laggTillElev(s, { id: `e${i}`, klassId: 'k', namn, grupp: 'A' });
  const sv = (ratt: boolean): FragaSvar[] => [{ fraga: 'Nervcellens långa utskott.', svar: ratt ? 'A. • axon' : 'B. • dendrit', ratt, facit: 'A. • axon' }];
  const imp = (filnamn: string, prov: string, tid: string) => {
    const u = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov, datum: '2026-10-23', tid, rum: 'BIOLOGI8AA',
      rader: ELEVER.map((namn, i) => ({ namn, poang: i === 0 ? 1 : 0, maxPoang: 1, svar: sv(i === 0) })) });
    s = registreraFil(u.s, { amneId: 'bi', filnamn, importerad: '2026-11-10T20:00:00.000Z', kalla: 'socrative-exit', prov, datum: '2026-10-23', rum: 'BIOLOGI8AA', traffar: u.traffar });
  };
  imp('Class_2026_09_21__12_35_QZ_6.1 Begrepp.xlsx', '6.1 Begrepp', '14:35');          // kördes 21 sep
  imp('Class_2026_10_15__10_54_QZ_Nervsystemet 7.1.xlsx', 'Nervsystemet 7.1', '12:54'); // kördes 15 okt
  imp('Class_2026_10_23__09_00_QZ_Nervsystemet 7.5.xlsx', 'Nervsystemet 7.5', '11:00'); // kördes 23 okt — rätt
  return s;
}
const datumFor = (prov: string) => [...new Set((lasStruktur().resultat ?? []).filter((r) => r.prov === prov).map((r) => r.datum))];

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.restoreAllMocks(); });
function starta(): HTMLElement {
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  return host;
}

describe('Del 256 · förhör med fel datum', () => {
  it('appen frågar, "Ja" sätter dagen förhören kördes, och ↩ ångrar', async () => {
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    const host = starta();
    const fraga = host.querySelector('[aria-label="Förhör med fel datum"]')!;
    expect(fraga.textContent).toContain('2 importerade förhör har fått ett annat datum än dagen de kördes.');
    expect(fraga.textContent).toContain('4 resultat');
    expect([...fraga.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '6.1 Begrepp (8A Biologi) — sparat 23/10, kördes 21/9 kl. 14:35',
      'Nervsystemet 7.1 (8A Biologi) — sparat 23/10, kördes 15/10 kl. 12:54',
    ]);
    expect(datumFor('6.1 Begrepp')).toEqual(['2026-10-23']);                  // inget ändras innan läraren svarat

    await act(async () => { ([...fraga.querySelectorAll('button')].find((b) => b.textContent === 'Ja, rätta datumen') as HTMLButtonElement).click(); });
    expect(datumFor('6.1 Begrepp')).toEqual(['2026-09-21']);
    expect(datumFor('Nervsystemet 7.1')).toEqual(['2026-10-15']);
    expect(datumFor('Nervsystemet 7.5')).toEqual(['2026-10-23']);
    expect(host.querySelector('[aria-label="Förhör med fel datum"]')).toBeNull();
    expect(host.textContent).toContain('2 förhör har fått dagen de kördes (4 resultat).');

    await act(async () => { (host.querySelector('button[aria-label="Ångra"]') as HTMLButtonElement).click(); });
    expect(datumFor('6.1 Begrepp')).toEqual(['2026-10-23']);
    expect(host.querySelector('[aria-label="Förhör med fel datum"]')).not.toBeNull();
  });

  it('"Inte nu" tystar frågan och ändrar ingenting', async () => {
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    const host = starta();
    const fraga = host.querySelector('[aria-label="Förhör med fel datum"]')!;
    await act(async () => { ([...fraga.querySelectorAll('button')].find((b) => b.textContent === 'Inte nu') as HTMLButtonElement).click(); });
    expect(host.querySelector('[aria-label="Förhör med fel datum"]')).toBeNull();
    expect(datumFor('6.1 Begrepp')).toEqual(['2026-10-23']);
    act(() => rot!.unmount()); rot = null; document.body.innerHTML = '';
    expect(starta().querySelector('[aria-label="Förhör med fel datum"]')).toBeNull();   // frågan kommer inte tillbaka vid nästa start
  });

  it('utan feldaterade förhör finns ingen fråga', () => {
    const s = bygg();
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify({ ...s, filregister: (s.filregister ?? []).filter((f) => f.prov === 'Nervsystemet 7.5') }));
    expect(starta().querySelector('[aria-label="Förhör med fel datum"]')).toBeNull();
  });
});

describe('Del 256 · vyerna klarar att datan kommer efter att de ritats', () => {
  for (const vy of ['resultat', 'elever'] as const) {
    it(`${vy}: en backup som läses in i en tom app ger ingen vit sida`, async () => {
      const fel = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem('cp3.vy', JSON.stringify({ typ: vy }));
      const host = starta();
      expect(host.textContent).toContain('Skapa klasser och elever');
      await act(async () => { (host.querySelector('.v3-anvandare') as HTMLButtonElement).click(); });
      const filval = host.querySelector('.v3-verktyg input[type=file][accept="application/json"]') as HTMLInputElement;
      const fil = new File([exportJson(bygg())], 'backup.json', { type: 'application/json' });
      Object.defineProperty(filval, 'files', { value: [fil], configurable: true });
      await act(async () => { filval.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 50)); });
      expect(lasStruktur().klasser.map((k) => k.namn)).toEqual(['8A']);
      expect(host.textContent).not.toContain('Skapa klasser och elever');
      expect(host.querySelector('.v3-anvandare')).not.toBeNull();
      expect(fel.mock.calls.filter((c) => String(c[0]).includes('Hooks') || String(c[0]).includes('hooks'))).toEqual([]);
    });
  }
});
