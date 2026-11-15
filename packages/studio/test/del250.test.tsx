// @vitest-environment jsdom
/**
 * Del 250 · Resultat: periodfältet visar planeringens period, och frågematrisens typval avgör vilka förhör som
 * visas — bara exit, läxförhör + exit eller alla tre. "Alla" ligger ovanför typerna.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, sattNoPeriod, tomStruktur, type FragaSvar, type ResultatKalla, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', noGrupp: 'no', noOrder: 0, schema: [{ dag: 1, start: '09:15', slut: '10:30' }, { dag: 5, start: '08:25', slut: '09:35' }] });
  s = sattNoPeriod(s, 'bi', { fran: '2026-08-20', till: '2026-11-06' });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Provlund', grupp: 'A' });
  const sv = (fragor: string[], ratt: boolean): FragaSvar[] => fragor.map((fraga) => ({ fraga, svar: ratt ? 'A. rätt' : 'B. fel', ratt, facit: 'A. rätt' }));
  const imp = (kalla: ResultatKalla, prov: string, datum: string, tid: string, fragor: string[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, tid, rum: 'BIOLOGI8BB', rader: [
      { namn: 'Anna Testsson', poang: fragor.length, maxPoang: fragor.length, svar: sv(fragor, true) },
      { namn: 'Omar Provlund', poang: 0, maxPoang: fragor.length, svar: sv(fragor, false) },
    ] }).s;
  };
  imp('socrative-exit', 'Biologi 6.1 Begrepp', '2026-09-17', '09:31', ['Cellens hud.']);
  imp('socrative-laxforhor', '6.1 Begrepp + cellens delar', '2026-09-21', '09:13', ['Cellens hud.', 'Cellens chef.']);
  imp('socrative-ovning', '6.1 Begrepp + cellens delar', '2026-09-22', '13:00', ['Cellens hud.', 'Cellens chef.']);
  imp('socrative-exit', 'Biologi 6.2 Begrepp', '2026-10-23', '09:23', ['Kroppens minsta blodkärl.']);
  return s;
}

let rot: ReturnType<typeof createRoot> | null = null;
function starta(kallor: ResultatKalla[]): HTMLElement {
  localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
  localStorage.setItem('st.kallor', JSON.stringify(kallor));
  localStorage.setItem('st.omfang', JSON.stringify('allt'));
  localStorage.setItem('cp.layout', JSON.stringify('v3'));
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'resultat' }));
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  const amne = host.querySelector('select[aria-label="SuperTeach ämne"]') as HTMLSelectElement;
  act(() => { amne.value = 'bi'; amne.dispatchEvent(new Event('change', { bubbles: true })); });
  return host;
}
const typval = (host: HTMLElement) => host.querySelector('[aria-label="Typ av förhör"]')!;
const chip = (host: HTMLElement, t: string) => [...typval(host).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === t)!;
const tanda = (host: HTMLElement) => ['Alla', 'Läxförhör', 'Exit', 'Övning'].map((t) => chip(host, t).getAttribute('aria-pressed') === 'true');
const typer = (host: HTMLElement) => [...host.querySelectorAll('.st-fmtabell tbody tr')].map((tr) => tr.querySelector('.st-typ')!.textContent);

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; });

describe('Del 250 · frågematrisens typval', () => {
  it('"Alla" ligger överst i gruppen och omfamnar de tre typerna', () => {
    const host = starta(['socrative-laxforhor', 'socrative-exit', 'socrative-ovning']);
    expect([...typval(host).querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Alla', 'Läxförhör', 'Exit', 'Övning']);
    expect(chip(host, 'Alla').classList.contains('st-typval-alla')).toBe(true);
    expect(typval(host).classList.contains('alla')).toBe(true);
    expect(tanda(host)).toEqual([true, true, true, true]);
    // alla tre typerna visas
    expect(typer(host).sort()).toEqual(['Exit', 'Exit', 'Läxförhör', 'Övning']);
  });

  it('bara Exit valt överst: matrisen visar bara exit tickets och typvalet säger det — inte "Alla"', () => {
    const host = starta(['socrative-exit']);
    expect(tanda(host)).toEqual([false, false, true, false]);
    expect(typval(host).classList.contains('alla')).toBe(false);
    expect(typer(host)).toEqual(['Exit', 'Exit']);

    // Läxförhör tänds i matrisen: båda typerna visas, fast källvalet överst bara har Exit
    act(() => { chip(host, 'Läxförhör').click(); });
    expect(tanda(host)).toEqual([false, true, true, false]);
    expect(typer(host).sort()).toEqual(['Exit', 'Exit', 'Läxförhör']);

    // Alla: exit tickets, läxförhör och övning
    act(() => { chip(host, 'Alla').click(); });
    expect(tanda(host)).toEqual([true, true, true, true]);
    expect(typer(host).sort()).toEqual(['Exit', 'Exit', 'Läxförhör', 'Övning']);

    // Släck Exit: läxförhör och övning kvar
    act(() => { chip(host, 'Exit').click(); });
    expect(tanda(host)).toEqual([false, true, false, true]);
    expect(typer(host).sort()).toEqual(['Läxförhör', 'Övning']);
  });
});

describe('Del 250 · periodfältet', () => {
  it('visar planeringens period för ämnet (v.34–45), inte ett fast exempel — och förklarar varifrån den kommer', () => {
    const host = starta(['socrative-exit']);
    const falt = host.querySelector('input[aria-label="Filter period"]') as HTMLInputElement;
    expect(falt.value).toBe('');
    expect(falt.placeholder).toBe('v.34–45');
    expect(falt.closest('label')!.getAttribute('title')).toContain('Hela perioden är v.34–45 (20/8–6/11) — enligt planeringen och förhörens datum');
  });
});
