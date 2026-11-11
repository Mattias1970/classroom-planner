// @vitest-environment jsdom
/**
 * Del 242 · Vakten vid quizen, hela vägen i appen: en 8A-rapport som läses in medan 8B är vald hamnar i 8A,
 * ett felstartat quiz (under 30 % av de möjliga svaren) laddas inte utan att läraren sagt ja och spärras,
 * och 8A-elever som redan hamnat i 8B flyttas hem.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraFil, resetIdRaknare, tomStruktur, type FragaSvar, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { lasStruktur, sparaStruktur } from '../src/store';

const A_NAMN = ['Anna Berg', 'Omar Ali', 'Pia Provlund', 'Kim Testsson'];
const B_NAMN = ['Tove Testsson', 'Sam Provlund', 'Elsa Övnegård', 'Hugo Ali'];

/** 8B står först — det är klassen läraren arbetar med. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  for (const [kid, namn, elever] of [['kb', '8B', B_NAMN], ['ka', '8A', A_NAMN]] as const) {
    s = laggTillKlass(s, { id: kid, tjanstId: 'tj', namn });
    s = laggTillAmne(s, { id: `bi-${kid}`, klassId: kid, namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
    elever.forEach((n, i) => { s = laggTillElev(s, { id: `${kid}-${i}`, klassId: kid, namn: n, grupp: 'A' }); });
  }
  return s;
}

/** En Socrative-klassrapport som riktig xlsx-fil. Namn skrivs 'Efternamn, Förnamn' som i Socrative. */
function rapport(filnamn: string, quiz: string, rum: string, fragor: string[], rader: Array<[namn: string, deltog: boolean, svar: string[]]>, facit: string[]): File {
  const soc = (n: string) => { const [f, ...e] = n.split(' '); return `${e.join(' ')}, ${f}`; };
  const ark = XLSX.utils.aoa_to_sheet([
    [quiz], ['Mon Sep 21 2026'], [rum], [], [],
    ['Presence', 'Student Name', 'Student ID', 'Score (%)', 'Score (#)', ...fragor],
    [null, null, null, null, fragor.length, ...fragor.map(() => '1 point')],
    ...rader.map(([namn, deltog, svar]) => {
      const poang = svar.filter((v, j) => v !== '' && v === facit[j]).length;
      return [deltog ? 'Yes' : 'No', soc(namn), namn.split(' ')[0].toUpperCase(), String(Math.round((100 * poang) / fragor.length)), poang, ...svar];
    }),
  ]);
  const bok = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(bok, ark, 'Rapport');
  return new File([XLSX.write(bok, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], filnamn);
}

const vanta = async (varv = 6) => { for (let i = 0; i < varv; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
let rot: ReturnType<typeof createRoot> | null = null;
function starta(s: Struktur, vy: 'resultat' | 'oversikt' = 'resultat'): HTMLElement {
  sparaStruktur(s);
  localStorage.setItem('cp3.vy', JSON.stringify({ typ: vy }));
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  return host;
}
async function lasIn(host: HTMLElement, filer: File[]) {
  const input = host.querySelector('input[aria-label="Socrative-filer"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: filer, configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
  await vanta();
}
const knapp = (host: Element, text: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof text === 'string' ? (b.textContent ?? '').includes(text) : text.test(b.textContent ?? ''))) as HTMLButtonElement | undefined;
const granskning = (host: HTMLElement) => [...host.querySelectorAll('table.st-tabell')].find((t) => t.textContent?.includes('Tolkning'));

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; });

const FRAGOR = ['Läran om samspelet i naturen.', 'En naturtyp med en viss sorts växter och djur.'];
const FACIT = ['A. Ekologi', 'B. Biotop'];

describe('Del 242 · en 8A-rapport som läses in medan 8B är vald', () => {
  it('importeras till 8A — resultaten hamnar inte i 8B och 8A:s elever läggs inte till i 8B', async () => {
    const host = starta(bygg());
    expect((host.querySelector('select[aria-label="SuperTeach klass"]') as HTMLSelectElement).selectedOptions[0].textContent).toBe('8B');
    await lasIn(host, [rapport('Class_2026_09_21__07_02_QZ_Biologi_6.1.xlsx', 'Biologi 6.1', 'BIOLOGI8AA', FRAGOR,
      A_NAMN.map((n, i) => [n, i < 3, i < 3 ? [FACIT[0], i === 0 ? FACIT[1] : 'C. Population'] : ['', '']] as [string, boolean, string[]]), FACIT)]);
    const tabell = granskning(host)!;
    expect(tabell.textContent).toContain('8A · Biologi');
    expect(tabell.textContent).toContain('klar att importera till 8A');
    expect(host.textContent).toContain('1 fil hör till 8A, inte till 8B');
    expect(host.textContent).toContain('kördes i rummet BIOLOGI8AA');
    expect(host.textContent).not.toContain('Lägg till 4 elever i 8B');

    await act(async () => { knapp(host, /Importera 1 fil/)!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await vanta();
    const s = lasStruktur();
    expect((s.resultat ?? []).map((r) => [r.amneId, r.elevId]).sort()).toEqual([['bi-ka', 'ka-0'], ['bi-ka', 'ka-1'], ['bi-ka', 'ka-2']]);
    expect(s.elever.filter((e) => e.klassId === 'kb').map((e) => e.namn)).toEqual(B_NAMN);
    expect((s.filregister ?? []).map((f) => f.amneId)).toEqual(['bi-ka']);
    expect(host.textContent).toContain('1 hörde till 8A och importerades dit, inte till 8B');
  });

  it('utan klassrum avgör var eleverna finns — filen går till samma ämne i den klassen', async () => {
    const host = starta(bygg());
    const amnesval = host.querySelector('select[aria-label="SuperTeach ämne"]') as HTMLSelectElement;
    await act(async () => { amnesval.value = 'bi-kb'; amnesval.dispatchEvent(new Event('change', { bubbles: true })); });
    await lasIn(host, [rapport('Class_2026_09_21__07_02_QZ_Biologi_6.1.xlsx', 'Biologi 6.1', 'Biologi61', FRAGOR,
      A_NAMN.map((n) => [n, true, FACIT] as [string, boolean, string[]]), FACIT)]);
    expect(host.textContent).toContain('1 fil hör till 8A, inte till 8B');
    expect(host.textContent).toContain('eleverna finns i 8A');
    // rummet är okänt, så läraren väljer typ själv
    const typ = host.querySelector('select[aria-label="Typ för Class_2026_09_21__07_02_QZ_Biologi_6.1.xlsx"]') as HTMLSelectElement;
    await act(async () => { typ.value = 'socrative-ovning'; typ.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { knapp(host, /Importera 1 fil/)!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await vanta();
    expect(new Set((lasStruktur().resultat ?? []).map((r) => r.amneId))).toEqual(new Set(['bi-ka']));
    expect(lasStruktur().elever).toHaveLength(8);
  });
});

describe('Del 242 · ett quiz med under 30 % av elevernas möjliga svar', () => {
  const felstart = () => rapport('Class_2026_09_28__07_17_QZ_Felstart.xlsx', 'Felstart', 'BIOLOGI8BB', ['F1', 'F2', 'F3', 'F4', 'F5'],
    B_NAMN.map((n, i) => [n, i === 0, i === 0 ? ['A. x', '', '', '', ''] : ['', '', '', '', '']] as [string, boolean, string[]]), ['A. x', 'A. x', 'A. x', 'A. x', 'A. x']);

  it('appen frågar innan filen laddas; Nej spärrar filnamnet och filen laddas inte igen', async () => {
    const host = starta(bygg());
    await lasIn(host, [felstart()]);
    const fraga = host.querySelector('[aria-label="Quiz med för få svar"]')!;
    expect(fraga.textContent).toContain('1 fil har under 30 % av elevernas möjliga svar');
    expect(fraga.textContent).toContain('5 %: 1 av 20 möjliga svar, 1 elever');
    expect(granskning(host)!.textContent).toContain('för få svar — väntar på ditt val');
    expect(knapp(host, /Importera 0 filer/)!.disabled).toBe(true);

    await act(async () => { knapp(fraga, 'Nej — spärra filen')!.click(); });
    expect(lasStruktur().sparradeFiler!.map((f) => [f.filnamn, f.prov, f.orsak])).toEqual([['Class_2026_09_28__07_17_QZ_Felstart.xlsx', 'Felstart', 'fa-svar']]);
    expect(lasStruktur().resultat ?? []).toEqual([]);
    expect(granskning(host)).toBeUndefined();

    // Samma fil en gång till (som "(1)"-kopia): spärrad, går inte att importera
    const kopia = felstart(); const igen = new File([await kopia.arrayBuffer()], 'Class_2026_09_28__07_17_QZ_Felstart (1).xlsx');
    await lasIn(host, [igen]);
    expect(granskning(host)!.textContent).toContain('🚫 spärrad');
    expect(knapp(host, /Importera 0 filer/)!.disabled).toBe(true);
    expect(host.textContent).toContain('🚫 1 spärrade filer');
  });

  it('Ladda ändå importerar filen, och appen frågar sedan inte om den igen', async () => {
    const host = starta(bygg());
    await lasIn(host, [felstart()]);
    await act(async () => { knapp(host.querySelector('[aria-label="Quiz med för få svar"]')!, 'Ladda ändå')!.click(); });
    await act(async () => { knapp(host, /Importera 1 fil/)!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await vanta();
    expect(lasStruktur().resultat).toHaveLength(1);
    expect(lasStruktur().filregister![0].behallTrotsFaSvar).toBe(true);
    expect(host.querySelector('.quizvakt')).toBeNull();
  });

  it('redan importerade quiz med för få svar: appen frågar överst — Ta bort tar bort resultaten och spärrar filen', async () => {
    let s = bygg();
    const svar = (n: number): FragaSvar[] => Array.from({ length: 5 }, (_, i) => ({ fraga: `F${i + 1}`, svar: i < n ? 'A. x' : '', ratt: i < n ? true : null, facit: 'A. x' }));
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-laxforhor', prov: 'Felstart', datum: '2026-09-28', rader: [{ namn: 'Tove Testsson', poang: 1, maxPoang: 5, svar: svar(1) }] }).s;
    s = registreraFil(s, { amneId: 'bi-kb', filnamn: 'Class_2026_09_28__07_17_QZ_Felstart.xlsx', importerad: 'nu', kalla: 'socrative-laxforhor', prov: 'Felstart', datum: '2026-09-28', traffar: 1 });
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-laxforhor', prov: 'Riktigt quiz', datum: '2026-09-28', rader: B_NAMN.map((namn) => ({ namn, poang: 5, maxPoang: 5, svar: svar(5) })) }).s;
    s = registreraFil(s, { amneId: 'bi-kb', filnamn: 'Class_2026_09_28__07_20_QZ_Riktigt.xlsx', importerad: 'nu', kalla: 'socrative-laxforhor', prov: 'Riktigt quiz', datum: '2026-09-28', traffar: 4 });
    const host = starta(s, 'oversikt');
    const fraga = host.querySelector('[aria-label="Quiz med för få svar"]')!;
    expect(fraga.textContent).toContain('1 importerat quiz har under 30 % av elevernas möjliga svar');
    expect(fraga.textContent).toContain('Felstart');
    expect(fraga.textContent).not.toContain('Riktigt quiz');
    await act(async () => { knapp(fraga, 'Ta bort och spärra filen')!.click(); });
    const efter = lasStruktur();
    expect([...new Set(efter.resultat!.map((r) => r.prov))]).toEqual(['Riktigt quiz']);
    expect(efter.sparradeFiler!.map((f) => f.filnamn)).toEqual(['Class_2026_09_28__07_17_QZ_Felstart.xlsx']);
    expect(host.querySelector('.quizvakt')).toBeNull();
  });
});

describe('Del 242 · 8A-elever som redan hamnat i 8B', () => {
  it('appen frågar överst och flyttar hem dem — med resultat och fil', async () => {
    let s = bygg();
    A_NAMN.forEach((n, i) => { s = laggTillElev(s, { id: `fel-${i}`, klassId: 'kb', namn: n, grupp: 'A' }); });
    s = importeraResultat(s, { klassId: 'kb', amneId: 'bi-kb', kalla: 'socrative-ovning', autoTyp: true, prov: 'Biologi 6.1', datum: '2026-09-21', rum: 'BIOLOGI8AA', rader: A_NAMN.map((namn) => ({ namn, poang: 1, maxPoang: 1 })) }).s;
    s = registreraFil(s, { amneId: 'bi-kb', filnamn: 'Class_2026_09_21__07_02_QZ_Biologi_6.1.xlsx', importerad: 'nu', kalla: 'socrative-ovning', prov: 'Biologi 6.1', datum: '2026-09-21', rum: 'BIOLOGI8AA', traffar: 4 });
    const host = starta(s, 'oversikt');
    const fraga = host.querySelector('[aria-label="Elever i fel klass"]')!;
    expect(fraga.textContent).toContain('8B innehåller 4 elever som också finns i 8A och hör hemma där');
    expect(fraga.textContent).toContain('4 resultat och 1 quizfil flyttas till 8A');
    await act(async () => { knapp(fraga, 'Ja, flytta hem dem till 8A')!.click(); });
    const efter = lasStruktur();
    expect(efter.elever.filter((e) => e.klassId === 'kb').map((e) => e.namn)).toEqual(B_NAMN);
    expect(efter.resultat!.map((r) => [r.amneId, r.elevId]).sort()).toEqual([['bi-ka', 'ka-0'], ['bi-ka', 'ka-1'], ['bi-ka', 'ka-2'], ['bi-ka', 'ka-3']]);
    expect(efter.filregister!.map((f) => f.amneId)).toEqual(['bi-ka']);
    expect(host.querySelector('[aria-label="Elever i fel klass"]')).toBeNull();
    expect(host.textContent).toContain('4 elever flyttade hem från 8B till 8A');
    // ↩ Ångra lägger tillbaka allt
    await act(async () => { (host.querySelector('button[aria-label="Ångra"]') as HTMLButtonElement).click(); });
    expect(lasStruktur().elever.filter((e) => e.klassId === 'kb')).toHaveLength(8);
  });

  it('Inte nu tystar frågan för just de eleverna', async () => {
    let s = bygg();
    A_NAMN.forEach((n, i) => { s = laggTillElev(s, { id: `fel-${i}`, klassId: 'kb', namn: n, grupp: 'A' }); });
    const host = starta(s, 'oversikt');
    await act(async () => { knapp(host.querySelector('[aria-label="Elever i fel klass"]')!, 'Inte nu')!.click(); });
    expect(host.querySelector('[aria-label="Elever i fel klass"]')).toBeNull();
    expect(lasStruktur().elever).toHaveLength(12);
  });
});
