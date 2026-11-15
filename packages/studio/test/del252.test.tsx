// @vitest-environment jsdom
/**
 * Del 252 · Lektionstest: "0 av 25" förklaras i klartext med text under musen, och mönstret per elev pekar ut vem
 * som visar mer efter att ha övat hemma och vem som visar mer på lektionen.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type ResultatKalla, type Struktur } from '@planner/kernel';
import { App } from '../src/App';

const NAMN = ['Anna Berg', 'Omar Ali', 'Pia Provlund', 'Kim Testsson', 'Hugo Hemsson', 'Lea Lektlund'];
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  NAMN.forEach((n, i) => { s = laggTillElev(s, { id: `e${i}`, klassId: 'k', namn: n, grupp: 'A' }); });
  const imp = (kalla: ResultatKalla, prov: string, datum: string, poang: number[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rader: NAMN.map((namn, i) => ({ namn, poang: poang[i], maxPoang: 10 })) }).s;
  };
  ['2026-09-07', '2026-09-14', '2026-09-21'].forEach((d, i) => { imp('socrative-laxforhor', `Läxa ${i + 1}`, d, [9, 9, 9, 9, 9, 5]); imp('socrative-exit', `Exit ${i + 1}`, d, [8, 8, 8, 8, 4, 8]); });
  imp('socrative-exit', 'Bara exit', '2026-09-28', [8, 8, 8, 8, 8, 8]);
  return s;
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; });

describe('Del 252 · Lektionstest förklarar sig', () => {
  it('kolumnen heter "Gjorde båda", en lektion med bara ett test säger det i klartext, och mönstret per elev visas', () => {
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    localStorage.setItem('st.kallor', JSON.stringify(['socrative-laxforhor', 'socrative-exit']));
    localStorage.setItem('st.omfang', JSON.stringify('allt'));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'resultat' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    const amne = host.querySelector('select[aria-label="SuperTeach ämne"]') as HTMLSelectElement;
    act(() => { amne.value = 'bi'; amne.dispatchEvent(new Event('change', { bubbles: true })); });

    const widget = host.querySelector('.st-lektionstest')!;
    const tabell = widget.querySelector('table.st-tabell')!;
    // Rubrikerna har ett ⓘ-märke och en förklaring under musen
    const rubriker = [...tabell.querySelectorAll('thead th')];
    expect(rubriker.map((th) => th.textContent)).toEqual(['Lektion', 'Läxförhör ⓘ', 'Exit ticket ⓘ', 'Δ snitt ⓘ', 'Δ median ⓘ', 'Gjorde båda ⓘ']);
    expect(rubriker[5].getAttribute('title')).toContain('BÅDE läxförhöret och exit ticketen');
    expect(rubriker[3].getAttribute('title')).toContain('Bara elever som gjorde båda testen räknas');

    const sista = (tr: Element) => tr.querySelector('td:last-child')!;
    const rader = [...tabell.querySelectorAll('tbody tr')];
    // Lektion med båda testen: 6 av 6
    expect(sista(rader[0]).textContent).toBe('6 av 6');
    expect(sista(rader[0]).getAttribute('title')).toContain('6 av 6 elever gjorde både läxförhöret och exit ticketen');
    // Lektion med bara exit ticket: klartext i stället för "0 av 6"
    expect(sista(rader[3]).textContent).toBe('bara exit ticket · 6 elever ⓘ');
    expect(sista(rader[3]).getAttribute('title')).toContain('hade bara exit ticket — inget läxförhör');
    expect(sista(rader[3]).getAttribute('title')).toContain('Inget är fel och inget behöver tas bort');
    expect(widget.textContent).not.toContain('0 av 6');

    // Mönster per elev
    const monster = widget.querySelector('[aria-label="Mönster per elev"]')!;
    const rad = (text: string) => [...monster.querySelectorAll('.st-larmonster-rad')].find((r) => r.textContent!.includes(text))!;
    expect([...rad('efter att ha övat hemma').querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Hugo Hemsson läx +7 · exit -33']);
    expect([...rad('på lektionen än efter läxan').querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Lea Lektlund läx -33 · exit +7']);
    expect(rad('efter att ha övat hemma').getAttribute('title')).toContain('kompenserar med att öva hemma');
    expect(rad('efter att ha övat hemma').querySelector('button')!.getAttribute('title')).toContain('i snitt över 3 lektioner med båda testen. Följ upp med eleven.');
  });
});
