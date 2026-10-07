// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { Utvecklingssamtal } from '../src/Utvecklingssamtal';
import { sparaStruktur } from '../src/store';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  const imp = (kalla: 'socrative-laxforhor' | 'socrative-exit', prov: string, datum: string, a: number, o: number) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rum: prov.toUpperCase(), rader: [{ namn: 'Anna Berg', poang: a, maxPoang: 10 }, { namn: 'Omar Ali', poang: o, maxPoang: 10 }] }).s;
  };
  imp('socrative-exit', 'Biologi41', '2026-08-24', 7, 4); imp('socrative-exit', 'Biologi42', '2026-08-28', 9, 5);
  imp('socrative-laxforhor', 'Biologi41', '2026-08-28', 9, 6); imp('socrative-laxforhor', 'Biologi412', '2026-09-04', 10, 6);
  return s;
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 164 · Utvecklingssamtal', () => {
  it('lista med status per elev; texten kan ändras, statusen ändras och texten följer', async () => {
    let s = bygg(); sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const rendera = () => act(() => root.render(<Utvecklingssamtal s={s} klass={s.klasser[0]} amneId="bi" kor={kor} idag="2026-10-07" onTillbaka={() => {}} />));
    rendera();
    expect(div.textContent).toContain('Utvecklingssamtal · 8B · Biologi');
    const status = (namn: string) => (div.querySelector(`select[aria-label="Status ${namn}"]`) as HTMLSelectElement);
    expect(status('Anna Berg').value).toBe('mycketBra');
    expect(status('Omar Ali').value).toBe('svart');
    // Öppna Omar: texten har högst sju rader och börjar positivt
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Omar Ali'))!.click(); });
    const ta = div.querySelector('textarea[aria-label="Text Omar Ali"]') as HTMLTextAreaElement;
    expect(ta.value.split('\n').length).toBeLessThanOrEqual(7);
    expect(ta.value).toContain('Omar har just nu svårt att nå målen');
    // Ändra status → texten följer
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(status('Omar Ali'), 'nar'); status('Omar Ali').dispatchEvent(new Event('change', { bubbles: true })); });
    expect(s.samtalsUtvarderingar?.['e2|bi']?.status).toBe('nar');
    expect((div.querySelector('textarea[aria-label="Text Omar Ali"]') as HTMLTextAreaElement).value).toContain('Omar når målen');
    // Egen text sparas
    const tsetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    const ta2 = div.querySelector('textarea[aria-label="Text Omar Ali"]') as HTMLTextAreaElement;
    await act(async () => { tsetter.call(ta2, 'Min egen text.'); ta2.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Spara text'))!.click(); });
    expect(s.samtalsUtvarderingar?.['e2|bi']?.text).toBe('Min egen text.');
    expect(div.textContent).toContain('egen text');
    expect([...div.querySelectorAll('button')].some((b) => b.textContent?.includes('Alla till Word'))).toBe(true);
  });
});
