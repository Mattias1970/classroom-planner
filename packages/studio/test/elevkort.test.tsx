// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type ResultatKalla, type Struktur } from '@planner/kernel';
import { Elevkort } from '../src/Elevkort';
import { sparaStruktur } from '../src/store';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  const imp = (kalla: ResultatKalla, prov: string, datum: string, poang: number, max: number) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla, prov, datum, rader: [{ namn: 'Anna Berg', poang, maxPoang: max }] }).s;
  };
  imp('socrative-laxforhor', 'Matte11', '2026-09-01', 9, 10);
  imp('socrative-exit', 'Matte11', '2026-09-01', 3, 5);
  imp('digiexam', 'Ekologi E-prov', '2026-09-14', 9, 14);
  imp('magma', '1.1 - 1.3 Test', '2026-09-30', 14, 16);
  return s;
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 154 · Elevkortet', () => {
  it('nyckeltal och ett eget diagram per källa; vårdnadshavares e-post läggs till och tas bort; eleven kan slås av', async () => {
    let s = bygg();
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<Elevkort s={s} elevId="e1" amneId="ma" kor={kor} onTillbaka={() => {}} />));
    rendera();
    expect(div.textContent).toContain('🪪 Anna Berg');
    expect([...div.querySelectorAll('.ek-tal-rubrik')].map((x) => x.textContent)).toEqual(['✅ Läxförhör', '🎟 Exit tickets', '✏️ Övningar', '📝 DigiExam-prov', '🧠 Magma-test']);
    // Separata diagram — DigiExam och Magma i egna rutor, inte med Socrative
    expect([...div.querySelectorAll('svg.ek-diagram')].map((x) => x.getAttribute('aria-label'))).toEqual(['Diagram Läxförhör', 'Diagram Exit tickets', 'Diagram DigiExam-prov', 'Diagram Magma-test']);
    expect(div.textContent).toContain('Inga övningar i urvalet.');
    expect(div.textContent).toContain('godkänt från 8 av 14 p');
    expect(div.textContent).toContain('1 av 1 nådde gränsen');

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const skriv = async (label: string, v: string) => { const el = div.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement; await act(async () => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
    const knapp = () => [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Lägg till e-post'))!;
    await skriv('Vårdnadshavarens e-post', 'fel adress');
    await act(async () => { knapp().click(); });
    expect(div.querySelector('[role="alert"]')!.textContent).toContain('ingen giltig e-postadress');
    await skriv('Vårdnadshavarens namn', 'Lena Berg');
    await skriv('Vårdnadshavarens e-post', 'Lena.Berg@Exempel.se');
    await act(async () => { knapp().click(); });
    expect(s.elever[0].vardnadshavare).toEqual([{ epost: 'lena.berg@exempel.se', namn: 'Lena Berg' }]);
    expect((div.querySelector('a[href^="mailto:lena.berg@exempel.se?subject="]') as HTMLAnchorElement).textContent).toContain('Skriv till vårdnadshavaren');
    await act(async () => { (div.querySelector('button[aria-label="Ta bort lena.berg@exempel.se"]') as HTMLButtonElement).click(); });
    expect(s.elever[0].vardnadshavare).toBeUndefined();

    // Av: eleven ingår inte i klassen
    const vaxel = div.querySelector('input[aria-label="Eleven ingår i klassen"]') as HTMLInputElement;
    await act(async () => { vaxel.click(); });
    expect(s.elever[0].aktiv).toBe(false);
    expect(div.textContent).toContain('ingår inte i klassen — ingen rapportering');
    // Slutdatum före startdatum avvisas med ett tydligt fel
    await act(async () => { (div.querySelector('input[aria-label="Eleven ingår i klassen"]') as HTMLInputElement).click(); });
    await skriv('Börjar datum', '2026-10-01');
    await skriv('Slutar datum', '2026-09-01');
    expect(div.querySelector('[role="alert"]')!.textContent).toContain('Slutdatum kan inte ligga före startdatum');
    expect(s.elever[0]).toMatchObject({ startDatum: '2026-10-01' });
    expect(s.elever[0].slutDatum).toBeUndefined();
  });
});

describe('Del 157 · byt namn i elevkortet', () => {
  it('✏️ Byt namn sparar nytt namn och visar det tidigare; krock ger fel', async () => {
    let s = bygg();
    s = { ...s, elever: [...s.elever, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' as const }] };
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<Elevkort s={s} elevId="e1" amneId="ma" kor={kor} onTillbaka={() => {}} />));
    rendera();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const namnfalt = () => div.querySelector('input[aria-label="Elevens nya namn"]') as HTMLInputElement;
    await act(async () => { (div.querySelector('button[aria-label="Byt namn"]') as HTMLButtonElement).click(); });
    await act(async () => { setter.call(namnfalt(), 'Omar Ali'); namnfalt().dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Spara'))!.click(); });
    expect(div.querySelector('[role="alert"]')!.textContent).toContain('Det finns redan en elev som heter Omar Ali');
    await act(async () => { setter.call(namnfalt(), 'Anna Berg-Lund'); namnfalt().dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Spara'))!.click(); });
    expect(s.elever.find((e) => e.id === 'e1')).toMatchObject({ namn: 'Anna Berg-Lund', tidigareNamn: ['Anna Berg'] });
    expect(div.textContent).toContain('🪪 Anna Berg-Lund');
    expect(div.textContent).toContain('Tidigare namn: Anna Berg');
  });
});

describe('Del 157 · byt ordning på för- och efternamn', () => {
  it('⇄ Byt ordning vänder George Loa till Loa George', async () => {
    let s = bygg();
    s = { ...s, elever: s.elever.map((e) => (e.id === 'e1' ? { ...e, namn: 'George Loa' } : e)) };
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<Elevkort s={s} elevId="e1" kor={kor} onTillbaka={() => {}} />));
    rendera();
    await act(async () => { (div.querySelector('button[aria-label="Byt namn"]') as HTMLButtonElement).click(); });
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Byt ordning'))!.click(); });
    expect((div.querySelector('input[aria-label="Elevens nya namn"]') as HTMLInputElement).value).toBe('Loa George');
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Spara'))!.click(); });
    expect(s.elever.find((e) => e.id === 'e1')!.namn).toBe('Loa George');
  });
});
