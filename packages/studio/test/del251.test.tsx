// @vitest-environment jsdom
/**
 * Del 251 · Frågematrisen med alla ämnen: Biologis delkapitel står under Biologi och Kemis under Kemi — kapitel 7.1
 * finns i båda och blandas inte ihop.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type FragaSvar, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillAmne(s, { id: 'ke', klassId: 'k', namn: 'Kemi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Provlund', grupp: 'A' });
  const sv = (fragor: string[], ratt: boolean): FragaSvar[] => fragor.map((fraga) => ({ fraga, svar: ratt ? 'A. rätt' : 'B. fel', ratt, facit: 'A. rätt' }));
  const imp = (amneId: string, prov: string, datum: string, rum: string, fragor: string[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId, kalla: 'socrative-exit', prov, datum, tid: '09:21', rum, rader: [
      { namn: 'Anna Testsson', poang: fragor.length, maxPoang: fragor.length, svar: sv(fragor, true) },
      { namn: 'Omar Provlund', poang: 0, maxPoang: fragor.length, svar: sv(fragor, false) },
    ] }).s;
  };
  imp('bi', 'Nervsystemet 7.1', '2026-10-09', 'BIOLOGI8BB', ['Nervcellens långa utskott.', 'Kopplingen mellan två nervceller.']);
  imp('ke', 'Kol 10.1', '2026-11-09', 'KEMI8BB', ['Ämne som bara innehåller kolatomer.']);
  imp('ke', 'Kemi 7.1 Begrepp', '2026-11-13', 'KEMI8BB', ['Visar vilken form en molekyl har.', 'Talar om vilka atomer som ingår i en molekyl.']);
  return s;
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.restoreAllMocks(); });

describe('Del 251 · frågematrisen med alla ämnen', () => {
  it('Biologi och Kemi står var för sig — 7.1 i Biologi och 7.1 i Kemi är olika delkapitel', () => {
    const fel = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    localStorage.setItem('st.kallor', JSON.stringify(['socrative-laxforhor', 'socrative-exit']));
    localStorage.setItem('st.omfang', JSON.stringify('allt'));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'resultat' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    expect((host.querySelector('select[aria-label="SuperTeach ämne"]') as HTMLSelectElement).value).toBe('');   // alla ämnen

    const tabell = host.querySelector('.st-fmtabell')!;
    // Ämnesraden överst: Biologi över sina två frågor, Kemi över sina tre
    expect([...tabell.querySelectorAll('thead tr.st-fmamnen th.st-fmamne')].map((th) => [th.textContent, (th as HTMLTableCellElement).colSpan])).toEqual([['Biologi', 2], ['Kemi', 3]]);
    // Delkapitlen: koden har ämnet före sig, och Kemis 7.1 är en egen grupp
    expect([...tabell.querySelectorAll('thead th.st-fmgrupp')].map((th) => [th.querySelector('.st-fmgruppnamn')!.textContent, th.querySelector('small')!.textContent!.split(' · ').slice(0, 2).join(' · ')])).toEqual([
      ['Nervsystemet 7.1', 'Bi 7.1 · 2 frågor'], ['Kol 10.1', 'Ke 10.1 · 1 frågor'], ['Kemi 7.1 Begrepp', 'Ke 7.1 · 2 frågor'],
    ]);
    // Raderna säger vilket ämne förhöret hör till, och Kemi-förhöret har inget i Biologis kolumner
    const rader = [...tabell.querySelectorAll('tbody tr')];
    expect(rader.map((tr) => tr.querySelector('.st-fmprov')!.textContent).sort()).toEqual(['BiNervsystemet 7.1', 'KeKemi 7.1 Begrepp', 'KeKol 10.1']);
    const kemi71 = rader.find((tr) => tr.textContent!.includes('Kemi 7.1 Begrepp'))!;
    expect([...kemi71.querySelectorAll('td.st-fmruta')].map((td) => td.getAttribute('title')!.includes('% rätt'))).toEqual([false, false, false, true, true]);
    // det överblivna mellanslaget i tabellhuvudet är borta: inga varningar om tabellens uppbyggnad
    expect(fel.mock.calls.filter((c) => String(c[0]).includes('validateDOMNesting'))).toEqual([]);
  });
});
