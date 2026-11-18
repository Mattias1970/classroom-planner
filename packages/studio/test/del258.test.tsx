// @vitest-environment jsdom
/**
 * Del 258 · Kapitelrubriken visar kapitlet för dagens eller nästa lektion och säger vilken lektion det är.
 * Visas en lektion ur ett annat kapitel i Detaljplanering följer rubriken den lektionen.
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
    '2': [{ id: 1, type: 'regular', avsnitt: '2.4 Procent', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.5 Förändringsfaktor', del: 1 }],
    '3': [{ id: 1, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 1 }, { id: 2, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 1 }],
  },
}));
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
  return registreraPlanering(s, { id: 'p', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Del 258 · kapitelrubriken', () => {
  it('visar kapitlet för nästa lektion och säger vilken — och följer lektionen som visas i Detaljplanering', async () => {
    // Onsdag 19 aug: 2.4 gjordes i går, 2.5 är i morgon, 3.1 börjar tisdag 25 aug
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-19T07:00:00Z'));
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'planering' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    await act(async () => { (host.querySelector('[aria-label="Planera ämne"] [role="tab"]') as HTMLButtonElement).click(); });

    const rubrik = () => host.querySelector('.kap-header')!;
    const brickor = () => [...rubrik().querySelectorAll('.kap-badge')].map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
    // Lektionsplan: nästa lektion är 2.5 → kapitel 2, och det står vilken lektion som avgör
    expect(rubrik().querySelector('.kap-eyebrow')!.textContent).toBe('Aktuellt kapitel');
    expect(rubrik().querySelector('.kap-h1')!.textContent).toBe('Kapitel 2 · Samband och förändring');
    expect(brickor()).toContain('2 lektioner i kapitlet');
    expect(brickor().find((b) => b.includes('nästa lektion'))).toBe('tor 20 aug nästa lektion: 2.5 Förändringsfaktor');

    // Detaljplanering öppnar på nästa lektion (2.5): rubriken är densamma
    const flik = (text: string) => [...host.querySelectorAll('.flikar .flik')].find((b) => b.textContent!.includes(text)) as HTMLButtonElement;
    await act(async () => { flik('Detaljplanering').click(); });
    expect((host.querySelector('select[aria-label="Välj lektion"]') as HTMLSelectElement).selectedOptions[0].textContent).toContain('2.5 Förändringsfaktor');
    expect(rubrik().querySelector('.kap-h1')!.textContent).toBe('Kapitel 2 · Samband och förändring');
    expect(rubrik().querySelector('.kap-eyebrow')!.textContent).toBe('Aktuellt kapitel');

    // Bläddra till 3.1: rubriken följer lektionen som visas — och säger vilket kapitel som pågår nu
    const nasta = [...host.querySelectorAll('button')].find((b) => b.textContent === '▶' && b.classList.contains('sm')) as HTMLButtonElement;
    await act(async () => { nasta.click(); });
    expect((host.querySelector('select[aria-label="Välj lektion"]') as HTMLSelectElement).selectedOptions[0].textContent).toContain('3.1 Omkrets och area');
    expect(rubrik().querySelector('.kap-eyebrow')!.textContent).toBe('Kapitel för lektionen som visas');
    expect(rubrik().querySelector('.kap-h1')!.textContent).toBe('Kapitel 3 · Geometri');
    expect(brickor()).toContain('Kapitel 2 pågår nu enligt planeringen');
    expect(brickor().find((b) => b.includes('nästa lektion'))).toBe('tor 20 aug nästa lektion: 2.5 Förändringsfaktor');

    // Tillbaka till Lektionsplan: rubriken visar åter det aktuella kapitlet
    await act(async () => { flik('Lektionsplan').click(); });
    expect(rubrik().querySelector('.kap-eyebrow')!.textContent).toBe('Aktuellt kapitel');
    expect(rubrik().querySelector('.kap-h1')!.textContent).toBe('Kapitel 2 · Samband och förändring');
    expect(brickor().some((b) => b.includes('pågår nu'))).toBe(false);
  });

  it('dagens lektion: står som "idag"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-25T07:00:00Z'));
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'planering' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    await act(async () => { (host.querySelector('[aria-label="Planera ämne"] [role="tab"]') as HTMLButtonElement).click(); });
    expect(host.querySelector('.kap-h1')!.textContent).toBe('Kapitel 3 · Geometri');
    expect(host.querySelector('.kap-nasta')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('idag dagens lektion: 3.1 Omkrets och area');
  });
});
