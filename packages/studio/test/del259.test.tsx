// @vitest-environment jsdom
/**
 * Del 259 · Dra och släpp i planeringen: rutorna i "Vägen till provet" kan dras, i Kortrad kan också en diagnos
 * dras, och en egen rad (prov) som inte syns under en inlagd planering pekas ut och kan läggas in.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { amnesPlanFor, bokFromImport, laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { Kortrad } from '../src/Kortrad';
import { lasStruktur, sparaStruktur } from '../src/store';

const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '2': { name: 'Samband och förändring', col: '#b23a48' }, '3': { name: 'Geometri', col: '#2f5aa8' } } },
  lektioner: {
    '2': [
      { id: 1, type: 'regular', avsnitt: '2.3 Andelen', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.4 Procent', del: 1 },
      { id: 3, type: 'regular', avsnitt: '2.5 Förändringsfaktor', del: 1 }, { id: 4, type: 'repetition', avsnitt: 'Blandade uppgifter', del: 1 }, { id: 5, type: 'repetition', avsnitt: 'Träna', del: 1 },
    ],
    '3': [
      { id: 1, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 1 }, { id: 2, type: 'regular', avsnitt: '3.1 Omkrets och area', del: 2 },
      { id: 3, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 1 }, { id: 4, type: 'regular', avsnitt: '3.2 Cirkelns area', del: 2 },
    ],
  },
}));
/** 8A följer en annan klass: 3.1 del 1 fre 13/11, diagnosen mån 16/11, 3.1 del 2 mån 23/11. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-11-09', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma',
    schema: [{ dag: 1, start: '10:50', slut: '12:00' }, { dag: 2, start: '10:15', slut: '11:15' }, { dag: 3, start: '08:25', slut: '09:15' }, { dag: 5, start: '12:50', slut: '13:40' }] });
  s = registreraPlanering(s, { id: 'p', amneId: 'ma', bokId: 'ma', skapad: '2026-11-01' });
  return { ...s, amnen: s.amnen.map((a) => (a.id !== 'ma' ? a : { ...a, planFranUtkast: {
    namn: 'Följer 8B', fran: '2026-11-09',
    teori: ['2:1', '2:2', '2:3', '3:1', 'u:diag', '2:4', '2:5', 'u:ov', '3:2', '3:3', '3:4'], labbar: [],
    egna: [{ id: 'diag', rubrik: 'Diagnos Kapitel 2 - Magma', typ: 'diagnos' as const }, { id: 'ov', rubrik: 'Övning', typ: 'ovning' as const }],
  } })) };
}
const IDAG = '2026-11-18';
const datumFor = (rubrik: string, del?: number) => amnesPlanFor(lasStruktur(), 'ma', IDAG)!.a.find((r) => r.lektion.avsnitt === rubrik && (del === undefined || r.lektion.del === del))?.datum;
const dt = () => ({ effectAllowed: '', setData: vi.fn(), getData: () => '' });
async function draOchSlapp(fran: Element, till: Element) {
  const d = dt();
  await act(async () => { fran.dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer: d })); });
  await act(async () => { till.dispatchEvent(Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), { dataTransfer: d })); });
  await act(async () => { till.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: d })); });
}

let rot: ReturnType<typeof createRoot> | null = null;
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.useRealTimers(); vi.restoreAllMocks(); });

function startaAmnessidan(): HTMLElement {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${IDAG}T19:00:00Z`));
  localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(bygg()));
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'amne', amneNamn: 'Matematik' }));
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  return host;
}
const rutor = (host: HTMLElement) => [...host.querySelectorAll('[aria-label="Vägen till provet"] .v3-vagbox')] as HTMLElement[];
const ruta = (host: HTMLElement, text: string) => rutor(host).find((b) => b.textContent!.includes(text))!;
async function valjKapitel(host: HTMLElement, nr: string) {
  const sel = [...host.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.textContent === '3 Geometri')) as HTMLSelectElement;
  await act(async () => { sel.value = nr; sel.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('Del 259 · rutorna i Vägen till provet kan dras', () => {
  it('3.1 dras till höger om diagnosen: appen frågar, diagnosen hamnar på fredagen och ↩ ångrar', async () => {
    const host = startaAmnessidan();
    await valjKapitel(host, '3');
    expect(rutor(host).map((b) => b.querySelector('b')!.textContent!.trim().replace(/^\S+\s/, ''))).toEqual(['3.1 Omkrets och area', 'Diagnos Kapitel 2 - Magma', '3.2 Cirkelns area']);
    expect(rutor(host).every((b) => b.getAttribute('draggable') === 'true')).toBe(true);
    expect(ruta(host, '3.1 Omkrets').getAttribute('title')).toContain('dra rutan för att flytta avsnittet');
    expect(host.querySelector('.v3-kedja-tips')!.textContent).toContain('Dra en ruta och släpp den på en annan');

    const fragor: string[] = [];
    vi.spyOn(window, 'confirm').mockImplementation((m) => { fragor.push(String(m)); return true; });
    await draOchSlapp(ruta(host, '3.1 Omkrets'), ruta(host, 'Diagnos Kapitel 2'));
    // Två frågor: passen har varit, och diagnosen får nytt datum
    expect(fragor).toHaveLength(2);
    expect(fragor[0]).toContain('Det berör pass som har varit');
    expect(fragor[1]).toContain('• Diagnos Kapitel 2 - Magma: mån 16/11 → fre 13/11');
    expect(datumFor('Diagnos Kapitel 2 - Magma')).toBe('2026-11-13');
    expect(datumFor('3.1 Omkrets och area', 1)).toBe('2026-11-20');
    expect(datumFor('3.1 Omkrets och area', 2)).toBe('2026-11-23');
    expect(datumFor('3.2 Cirkelns area', 1)).toBe('2026-11-24');           // det som ligger efter är orört
    expect(host.textContent).toContain('3.1 Omkrets och area flyttad — 5 lektioner har fått nytt pass.');

    await act(async () => { (host.querySelector('button[aria-label="Ångra"]') as HTMLButtonElement).click(); });
    expect(datumFor('Diagnos Kapitel 2 - Magma')).toBe('2026-11-16');
    expect(datumFor('3.1 Omkrets och area', 1)).toBe('2026-11-13');
  });

  it('svarar läraren nej på frågan om diagnosens datum ändras ingenting', async () => {
    const host = startaAmnessidan();
    await valjKapitel(host, '3');
    const svar = [true, false];
    vi.spyOn(window, 'confirm').mockImplementation(() => svar.shift() ?? false);
    await draOchSlapp(ruta(host, '3.1 Omkrets'), ruta(host, 'Diagnos Kapitel 2'));
    expect(datumFor('Diagnos Kapitel 2 - Magma')).toBe('2026-11-16');
    expect(datumFor('3.1 Omkrets och area', 1)).toBe('2026-11-13');
  });

  it('åt vänster, bara kommande pass: ingen fråga', async () => {
    const host = startaAmnessidan();
    await valjKapitel(host, '3');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    // 3.2 (24–25/11) släpps på 3.1: del 2 av 3.1 ligger 23/11, så 3.2 hamnar efter den — redan där → ingenting händer
    await draOchSlapp(ruta(host, '3.2 Cirkelns'), ruta(host, '3.1 Omkrets'));
    expect(confirm).not.toHaveBeenCalled();
    expect(datumFor('3.2 Cirkelns area', 1)).toBe('2026-11-24');
  });
});

describe('Del 259 · Kortrad: också en diagnos kan dras', () => {
  it('diagnosen dras till före 3.1 del 1 och byter plats med den', async () => {
    let s = bygg(); sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div); rot = root;
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const rendera = () => act(() => root.render(<Kortrad s={s} amneId="ma" bok={s.bocker[0]} plan={amnesPlanFor(s, 'ma', IDAG)!.a} idag={IDAG} kor={kor} oppnaLektion={() => {}} />));
    rendera();
    const rubriker = () => [...div.querySelectorAll('.kortrad-kort-rubrik')].map((e) => e.textContent);
    expect(rubriker().slice(2, 6)).toEqual(['2.5 Förändringsfaktor', '3.1 Omkrets och area', 'Diagnos Kapitel 2 - Magma', 'Blandade uppgifter']);
    const kort = (text: string) => [...div.querySelectorAll('.kortrad-kort')].find((k) => k.textContent!.includes(text))!;
    const fragor: string[] = [];
    vi.spyOn(window, 'confirm').mockImplementation((m) => { fragor.push(String(m)); return true; });
    const d = { effectAllowed: '', setData: vi.fn(), getData: () => 'u:diag' };
    await act(async () => { kort('Diagnos Kapitel 2').dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer: d })); });
    await act(async () => { kort('2.5 Förändringsfaktor').dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: d })); });
    expect(rubriker().slice(2, 6)).toEqual(['2.5 Förändringsfaktor', 'Diagnos Kapitel 2 - Magma', '3.1 Omkrets och area', 'Blandade uppgifter']);
    expect(fragor).toHaveLength(1);                              // bara frågan om pass som har varit — inget annat prov flyttas
    expect(fragor[0]).toContain('Det berör pass som har varit');
  });
});

describe('Del 259 · en egen rad som inte syns pekas ut och kan läggas in', () => {
  it('provet som lades till under en inlagd planering syns inte — "Lägg in i planeringen" gör det synligt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(`${IDAG}T19:00:00Z`));
    const s = laggTillEgenRad(bygg(), 'ma', { id: 'prov1', position: 5, rubrik: 'Prov kapitel 2', typ: 'prov' }, IDAG);
    localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(s));
    localStorage.setItem('cp3.vy', JSON.stringify({ typ: 'planering' }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    await act(async () => { (host.querySelector('[aria-label="Planera ämne"] [role="tab"]') as HTMLButtonElement).click(); });
    expect(datumFor('Prov kapitel 2')).toBeUndefined();
    const varning = host.querySelector('.egenrad-osynlig')!;
    expect(varning.textContent).toContain('syns inte i planeringen');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => { (varning.querySelector('button') as HTMLButtonElement).click(); });
    expect(datumFor('Prov kapitel 2')).toBeDefined();
    expect(host.querySelector('.egenrad-osynlig')).toBeNull();
    expect(host.textContent).toContain('"Prov kapitel 2" inlagd i planeringen');
  });
});
