// @vitest-environment jsdom
/**
 * Del 253 · Frågematrisen: en fråga som skrivits om men har samma svar står under samma frågenummer, och förhören
 * med den äldre formuleringen har tjock ram. Frågor med olika svar står kvar var för sig.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type FragaSvar, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

const MYELIN = 'Skyddande fettlager som omger vissa nervtrådar.';
const SJALV_DA = 'Del av nervsystemet som vi inte kan styra med vår vilja.';
const SJALV_NU = 'De delar av nervsystemet som vi inte kan påverka med vår vilja.';
const HINNOR = 'Omger och skyddar hjärnan.';
type Par = [string, string];

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Provlund', grupp: 'A' });
  const sv = (par: Par[], ratt: boolean): FragaSvar[] => par.map(([fraga, facit]) => ({ fraga, svar: ratt ? facit : 'E. • annat', ratt, facit }));
  const imp = (kalla: 'socrative-exit' | 'socrative-laxforhor', prov: string, datum: string, par: Par[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, tid: '09:21', rum: 'BIOLOGI8BB', rader: [
      { namn: 'Anna Testsson', poang: par.length, maxPoang: par.length, svar: sv(par, true) },
      { namn: 'Omar Provlund', poang: 0, maxPoang: par.length, svar: sv(par, false) },
    ] }).s;
  };
  imp('socrative-exit', 'Nervsystemet 7.1', '2026-10-09', [[MYELIN, 'A. • myelin'], [SJALV_DA, 'B. • självständiga nervsystemet']]);
  imp('socrative-laxforhor', 'Kap 7.1', '2026-10-12', [[SJALV_NU, 'A. • Autonoma (självständiga) nervsystemet'], [HINNOR, 'B. • hjärnhinnor']]);
  return s;
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.restoreAllMocks(); });

describe('Del 253 · omskriven fråga i frågematrisen', () => {
  it('samma svar → samma frågenummer med tjock ram runt det äldre förhöret; olika svar → egna kolumner', () => {
    const fel = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    localStorage.setItem('st.kallor', JSON.stringify(['socrative-laxforhor', 'socrative-exit']));
    localStorage.setItem('st.omfang', JSON.stringify('allt'));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'resultat' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });

    const tabell = host.querySelector('.st-fmtabell')!;
    // Tre frågor: myelin (bara exit), självständiga nervsystemet (båda) och hjärnhinnor (bara läxförhöret)
    const nr = [...tabell.querySelectorAll('thead th.st-fmnr')];
    expect(nr.map((th) => th.textContent)).toEqual(['1', '2', '3']);
    expect(nr.map((th) => th.classList.contains('omskriven'))).toEqual([false, true, false]);
    expect(nr[1].getAttribute('title')).toContain(SJALV_NU);
    expect(nr[1].getAttribute('title')).toContain('frågan har skrivits om — samma svar');

    const rader = [...tabell.querySelectorAll('tbody tr')];
    const rutor = (tr: Element) => [...tr.querySelectorAll('td.st-fmruta')];
    const exit = rader.find((tr) => tr.textContent!.includes('Nervsystemet 7.1'))!;
    const laxa = rader.find((tr) => tr.textContent!.includes('Kap 7.1'))!;
    // Tjock ram bara på exit ticketens ruta för fråga 2 — där stod den äldre formuleringen
    expect(rutor(exit).map((td) => td.classList.contains('aldre'))).toEqual([false, true, false]);
    expect(rutor(laxa).map((td) => td.classList.contains('aldre'))).toEqual([false, false, false]);
    expect(rutor(exit)[1].getAttribute('title')).toContain(`äldre formulering, samma svar: ”${SJALV_DA}”`);
    // Olika svar hålls isär: myelin finns inte i läxförhöret, hjärnhinnor inte i exit ticketen
    expect(rutor(laxa)[0].getAttribute('title')).toContain('ingick inte');
    expect(rutor(exit)[2].getAttribute('title')).toContain('ingick inte');

    // Förklaringen under matrisen
    expect(host.querySelector('[aria-label="Förklaring omskriven fråga"]')!.textContent).toContain('Tjock ram = förhöret ställde frågan i en äldre formulering');

    // Frågan i detalj: nu gällande text och svar, och den äldre formuleringen med datum
    act(() => { (rutor(exit)[1] as HTMLElement).click(); });
    const vald = host.querySelector('.st-fmvald')!;
    expect(vald.textContent).toContain(SJALV_NU);
    expect(vald.textContent).toContain('Autonoma (självständiga) nervsystemet');
    const aldre = vald.querySelector('[aria-label="Äldre formulering av frågan"]')!;
    expect(aldre.textContent).toContain('Frågan har skrivits om — samma svar');
    expect(aldre.textContent).toContain(`”${SJALV_DA}”`);
    expect(aldre.textContent).toContain('svaret skrevs då självständiga nervsystemet');

    // En fråga som inte skrivits om har ingen sådan ruta
    act(() => { (rutor(exit)[0] as HTMLElement).click(); });
    expect(host.querySelector('[aria-label="Äldre formulering av frågan"]')).toBeNull();
    expect(fel).not.toHaveBeenCalled();
  });
});
