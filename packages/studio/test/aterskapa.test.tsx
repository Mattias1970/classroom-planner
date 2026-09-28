// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  bokFromValfriImport, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering,
  resetIdRaknare, sparaBok, tomStruktur, type ResultatKalla, type Struktur,
} from '@planner/kernel';
import { App } from '../src/App';
import { lasStruktur } from '../src/store';

const BOK = JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'mattebok', titel: 'Testmatte 8', förlag: 'Testförlaget', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' }, '2': { name: 'Geometri', col: '#2e7d46' } } },
  lektioner: {
    '1': [
      { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1 }, { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2 },
      { id: 3, type: 'regular', avsnitt: '1.2 Decimaltal', del: 1 }, { id: 4, type: 'regular', avsnitt: '1.3 Procent', del: 1 },
      { id: 5, type: 'repetition', avsnitt: 'Blandade uppgifter', del: 1 }, { id: 6, type: 'exam', avsnitt: 'Prov kapitel 1', del: 1 },
    ],
    '2': [{ id: 1, type: 'regular', avsnitt: '2.1 Vinklar', del: 1 }],
  },
});

function termin(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = sparaBok(s, bokFromValfriImport(BOK));
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'mattebok', schema: [1, 3, 5].map((dag) => ({ dag, start: '08:10', slut: '09:10' })) });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  s = registreraPlanering(s, { id: 'pl1', amneId: 'ma', bokId: 'mattebok', skapad: '2026-08-10' });
  const q = (st: Struktur, kalla: ResultatKalla, datum: string, prov: string, rum?: string) => importeraResultat(st, {
    klassId: 'k', amneId: 'ma', kalla, prov, datum, ...(rum !== undefined ? { rum } : {}), rader: [{ namn: 'Anna Testsson', poang: 8, maxPoang: 10 }],
  }).s;
  s = q(s, 'socrative-exit', '2026-08-17', 'Quiz 1.1', 'Matte11');
  s = q(s, 'socrative-laxforhor', '2026-08-19', 'Quiz 1.1', 'Matte11');
  s = q(s, 'socrative-exit', '2026-08-19', 'Quiz 1.1 del 2', 'Matte11');
  s = q(s, 'socrative-laxforhor', '2026-08-21', 'Quiz 1.1', 'Matte11');
  s = q(s, 'socrative-ovning', '2026-08-24', 'Övning bråk', 'MATTE8BB');
  s = q(s, 'socrative-laxforhor', '2026-08-26', 'Quiz 1.1-1.2', 'Matte112');
  s = q(s, 'socrative-exit', '2026-08-26', 'Quiz 1.3', 'Matte13');
  s = q(s, 'digiexam', '2026-08-31', 'Prov kapitel 1');
  return s;
}

const seSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
const inSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
function valj(el: HTMLSelectElement, v: string) { act(() => { seSetter.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); }); }
function skriv(el: HTMLInputElement, v: string) { act(() => { inSetter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
function knapp(rot: ParentNode, text: string): HTMLButtonElement {
  const b = [...rot.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (b === undefined) throw new Error(`Ingen knapp "${text}"`);
  return b as HTMLButtonElement;
}
const lage = () => document.querySelector('[role="dialog"][aria-label="Återskapa genomförd planering"]') as HTMLElement;

beforeEach(() => {
  localStorage.clear(); resetIdRaknare(); document.body.innerHTML = '';
  localStorage.setItem('cp.layout', JSON.stringify('v3'));
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'planering' }));
  localStorage.setItem('cp.planeringAmne', JSON.stringify('ma'));
});

describe('Del 156: återskapa-läget i planeringen', () => {
  it('läser quizzarna pass för pass, visar det osäkra, låter läraren ändra och godkänner som ny planeringsversion', () => {
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(termin()));
    const host = document.createElement('div'); document.body.appendChild(host);
    act(() => { createRoot(host).render(<App />); });

    act(() => { knapp(host, 'Återskapa genomförd planering').click(); });
    expect(lage()).not.toBeNull();
    expect(lage().querySelector('.ak-lage')!.textContent).toContain('Återskapa-läge');
    skriv(lage().querySelector('input[aria-label="Återskapa pass före"]') as HTMLInputElement, '2026-09-01');

    const rader = () => [...lage().querySelectorAll('.ak-tabell tbody tr')] as HTMLElement[];
    expect(rader()).toHaveLength(7);
    expect(rader()[0].textContent).toContain('Exit Matte11');
    expect(rader()[0].textContent).toContain('1.1 Bråk');
    expect(rader()[2].textContent).toContain('↻ igen');
    expect(rader()[2].textContent).toContain('extra lektion (Testa dig själv)');
    expect(lage().querySelector('.ak-efter')!.textContent).toContain('fortsätter planeringen med: 2.1 Vinklar');
    expect(lage().querySelector('.ak-efter')!.textContent).toContain('Blandade uppgifter');

    // Bara det som ska kontrolleras: övningen utan exit och passet utan quiz
    const kontroll = knapp(lage(), 'att kontrollera');
    expect(kontroll.textContent).toContain('⚠ 2');
    act(() => { kontroll.click(); });
    expect(rader().map((r) => r.querySelector('.ak-pass')!.textContent)).toEqual(['mån 24 aug08:10', 'fre 28 aug08:10']);

    // 28 aug: läraren väljer Annat med egen rubrik
    valj(lage().querySelector('select[aria-label="Vad gjordes 2026-08-28 08:10"]') as HTMLSelectElement, 'annat');
    skriv(lage().querySelector('input[aria-label="Rubrik 2026-08-28 08:10"]') as HTMLInputElement, 'Studiebesök');
    expect(rader()).toHaveLength(2);                                         // raden ligger kvar medan den ändras
    expect(rader()[1].textContent).toContain('Studiebesök');
    expect(knapp(lage(), 'att kontrollera').textContent).toContain('⚠ 1');   // lärarens val räknas som kontrollerat
    act(() => { knapp(lage(), 'visa alla').click(); });
    expect(rader()).toHaveLength(7);

    // Godkänn i två steg
    act(() => { knapp(lage(), 'Godkänn som genomförd planering').click(); });
    expect(lage().querySelector('.ak-fot')!.textContent).toContain('v1) arkiveras och kan återställas');
    act(() => { knapp(lage(), 'Bekräfta').click(); });
    expect(lage()).toBeNull();

    const s = lasStruktur();
    const pl = s.planeringar.find((p) => p.amneId === 'ma')!;
    expect(pl.version).toBe(2);
    expect(s.planeringsarkiv!.map((p) => p.id)).toEqual(['pl1']);
    expect(pl.genomfort!.a.find((l) => l.datum === '2026-08-28')).toMatchObject({ typ: 'annat', rubrik: 'Studiebesök', vald: 'annat' });
    expect(host.querySelector('.ak-facitchip')!.textContent).toBe('🕰 Facit t.o.m. 2026-09-01');
  });
});
