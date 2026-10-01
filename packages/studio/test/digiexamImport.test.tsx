// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { DigiExamImport } from '../src/DigiExamImport';
import { sparaStruktur } from '../src/store';

// Fejkad DigiExam-export (bladet Grades) som XLSX.read/sheet_to_json 'läser' — verkliga elevnamn hör inte hemma i kodrepot.
const FEJK_DIGIEXAM: Array<Array<string | number | null>> = [
  ['First Name', 'Last Name', 'E-mail', 'Student Code', 'Final Grade', 'Fråga 1', 'Fråga 2', 'Fråga 3', 'Fråga 4'],
  ['Anna', 'Berg', 'anna.berg@elevmail.test', 'anna.berg@elevmail.test', 3.5, 1, 1, 0.5, 1],
  ['Omar', 'Ali', 'omar.ali@elevmail.test', 'omar.ali@elevmail.test', 2, 1, 0, 1, 0],
  ['Pia', 'Provlund', 'pia.provlund@elevmail.test', 'pia.provlund@elevmail.test', 0, 0, 0, 0, 0],
];
vi.mock('xlsx', () => ({
  read: () => ({ SheetNames: ['Grades'], Sheets: { Grades: {} } }),
  utils: { sheet_to_json: () => FEJK_DIGIEXAM },
}));

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:15', slut: '10:30' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  // Omar heter annorlunda i rostern men har e-posten — kopplingen ska gå via e-posten
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar A.', grupp: 'B', epost: 'omar.ali@elevmail.test' });
  return s;
}

const sov = () => new Promise((r) => setTimeout(r, 0));
const FILNAMN = '2026-09-30-2249-8b-ekologi-eprov.xlsx';

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 150 · DigiExamImport', () => {
  it('läser exporten, kopplar via e-post och namn, hoppar över nollrader och sparar poäng per fråga per elev', async () => {
    let s = bygg();
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<DigiExamImport s={s} klass={s.klasser[0]} amne={s.amnen[0]} kor={kor} />));
    rendera();
    const input = div.querySelector('input[aria-label="DigiExam-filer"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], FILNAMN)] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); });
    expect(div.textContent).toContain('4 frågor · 2 elever · 2 matchade · 1 med 0 poäng hoppas över');
    expect((div.querySelector(`input[aria-label="Provnamn för ${FILNAMN}"]`) as HTMLInputElement).value).toBe('Ekologi E-prov');
    expect((div.querySelector(`input[aria-label="Provdatum för ${FILNAMN}"]`) as HTMLInputElement).value).toBe('2026-09-30');
    expect((div.querySelector(`input[aria-label="Maxpoäng för ${FILNAMN}"]`) as HTMLInputElement).value).toBe('4');
    expect((div.querySelector(`input[aria-label="Gräns för godkänt för ${FILNAMN}"]`) as HTMLInputElement).value).toBe('3');   // E-prov: mer än hälften av 4
    expect(div.textContent).toContain('0 poäng — hoppas över');
    expect(div.querySelectorAll('.st-de-del')).toHaveLength(1);   // Annas fråga 3 = 0,5
    expect(div.querySelectorAll('.st-de-noll')).toHaveLength(2);  // Omars fråga 2 och 4
    expect(div.textContent).not.toContain('⚠ omatchade');

    // Läraren rättar maxpoängen (provet hade 5 poäng, ingen fick fullt på sista) och importerar
    const max = div.querySelector(`input[aria-label="Maxpoäng för ${FILNAMN}"]`) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(max, '5'); max.dispatchEvent(new Event('input', { bubbles: true })); });
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 1 DigiExam-fil'))!;
    await act(async () => { knapp.click(); });

    const res = (s.resultat ?? []).filter((r) => r.kalla === 'digiexam');
    expect(res).toHaveLength(2);
    const omar = res.find((r) => r.elevId === 'e2')!;
    expect(omar).toMatchObject({ prov: 'Ekologi E-prov', datum: '2026-09-30', amneId: 'bi', poang: 2, maxPoang: 5, godkantGrans: 3, provNyckel: 'ekologi eprov' });
    expect(omar.svar?.map((x) => [x.svar, x.ratt])).toEqual([['1', true], ['0', false], ['1', true], ['0', false]]);
    const anna = res.find((r) => r.elevId === 'e1')!;
    expect(anna.svar?.[2]).toEqual({ fraga: 'Fråga 3', svar: '0,5', ratt: false });
    // Annas e-post sparades på eleven vid namnmatchningen
    expect(s.elever.find((e) => e.id === 'e1')!.epost).toBe('anna.berg@elevmail.test');
    expect(s.filregister?.[0]).toMatchObject({ filnamn: FILNAMN, kalla: 'digiexam', traffar: 2 });
    // Analys och sparade prov visas
    expect(div.textContent).toContain('DigiExam-analys');
    expect(div.querySelector('svg[aria-label="Andel full poäng per fråga"]')).not.toBeNull();
    expect(div.textContent).toContain('Sparade DigiExam-prov');
    expect(div.textContent).toContain('2 elever · medel 55 %');   // (70 + 40) / 2
  });

  it('skapar eleverna med e-post när klassen är tom', async () => {
    let s = bygg();
    s = { ...s, elever: [] };
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<DigiExamImport s={s} klass={s.klasser[0]} amne={s.amnen[0]} kor={kor} />));
    rendera();
    expect(div.textContent).toContain('8B har inga elever än');
    const input = div.querySelector('input[aria-label="DigiExam-filer"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], FILNAMN)] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); });
    expect(div.textContent).toContain('2 nya elever skapas');
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 1 DigiExam-fil'))!;
    await act(async () => { knapp.click(); });
    expect(s.elever.map((e) => [e.namn, e.epost])).toEqual([['Anna Berg', 'anna.berg@elevmail.test'], ['Omar Ali', 'omar.ali@elevmail.test']]);
    expect((s.resultat ?? []).filter((r) => r.kalla === 'digiexam')).toHaveLength(2);
  });
});

describe('Del 152 · samma prov, omprov, gräns och provlarm', () => {
  it('två ordinarie filer redovisas ihop, dubblett i den mindre blir omprov, omprovsfil sparas som omprov — och larmet visar vem som inte är godkänd', async () => {
    let s = bygg();
    s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Pia Provlund', grupp: 'A' });
    s = laggTillElev(s, { id: 'e4', klassId: 'k', namn: 'Kalle Testsson', grupp: 'B' });
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<DigiExamImport s={s} klass={s.klasser[0]} amne={s.amnen[0]} kor={kor} />));
    rendera();
    // Mocken ger samma blad för alla filer: Anna 3,5 · Omar 2 · Pia 0 (nollrad). Max 4 → gräns 3.
    const input = div.querySelector('input[aria-label="DigiExam-filer"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [
      new File(['x'], '2026-09-30-2249-ekologi-eprov.xlsx'),
      new File(['x'], '2026-09-30-2248-8b-ekologi-eprov.xlsx'),
      new File(['x'], '2026-09-30-2248-8b-ekologi-omprov-e-prov.xlsx'),
    ] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); });
    expect(div.textContent).toContain('samma prov som 2 fil(er) till — redovisas ihop');
    expect(div.textContent).toContain('2 elev(er) finns redan på ett tidigare tillfälle av samma prov');
    expect((div.querySelector('select[aria-label="Roll för 2026-09-30-2248-8b-ekologi-omprov-e-prov.xlsx"]') as HTMLSelectElement).value).toBe('omprov');
    expect((div.querySelector('input[aria-label="Provnamn för 2026-09-30-2248-8b-ekologi-omprov-e-prov.xlsx"]') as HTMLInputElement).value).toBe('Ekologi E-prov – omprov');
    // Omprovet får ett senare datum
    const omDatum = div.querySelector('input[aria-label="Provdatum för 2026-09-30-2248-8b-ekologi-omprov-e-prov.xlsx"]') as HTMLInputElement;
    expect(div.textContent).toContain('Omprovet ska ha ett senare datum');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(omDatum, '2026-10-07'); omDatum.dispatchEvent(new Event('input', { bubbles: true })); });
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 3 DigiExam-filer'))!;
    await act(async () => { knapp.click(); });

    const res = (s.resultat ?? []).filter((r) => r.kalla === 'digiexam');
    const ord = res.filter((r) => r.prov === 'Ekologi E-prov');
    expect(ord.map((r) => r.elevId).sort()).toEqual(['e1', 'e2']);                  // ett resultat per elev på det ordinarie provet
    expect(ord.every((r) => r.omprov !== true && r.provNyckel === 'ekologi eprov' && r.godkantGrans === 3)).toBe(true);
    const om = res.filter((r) => r.prov === 'Ekologi E-prov – omprov');
    expect(om.every((r) => r.omprov === true)).toBe(true);
    expect(om.some((r) => r.datum === '2026-10-07')).toBe(true);

    // Larmet: Omar 2/4 på alla försök → inte godkänd; Pia och Kalle har inte skrivit
    const larm = div.querySelector('[aria-label="Provlarm"]')!;
    expect(larm.textContent).toContain('Alla är inte godkända');
    expect(larm.textContent).toContain('Ekologi E-prov');
    expect(larm.textContent).toContain('godkänt från 3 av 4 p · 1 av 4 godkända');
    expect(larm.textContent).toMatch(/Inte godkända \(1\):\s*Omar A\./);
    expect(larm.textContent).toContain('Har inte skrivit (2):');
    expect(larm.textContent).toContain('Kalle Testsson');
    expect(div.textContent).toContain('✗ har inte skrivit');
  });

  it('prov utan tolkbar gräns importeras inte förrän läraren anger den', async () => {
    let s = bygg();
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<DigiExamImport s={s} klass={s.klasser[0]} amne={s.amnen[0]} kor={kor} />));
    rendera();
    const input = div.querySelector('input[aria-label="DigiExam-filer"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'ekologi-slutprov.xlsx')] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); });
    expect(div.textContent).toContain('Gränsen för godkänt går inte att tolka');
    expect(div.textContent).toContain('1 fil(er) saknar gräns för godkänt');
    const knapp = () => [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera'))!;
    expect(knapp().textContent).toContain('Importera 0');
    expect((knapp() as HTMLButtonElement).disabled).toBe(true);
    const grans = div.querySelector('input[aria-label="Gräns för godkänt för ekologi-slutprov.xlsx"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(grans, '3'); grans.dispatchEvent(new Event('input', { bubbles: true })); });
    expect((knapp() as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { knapp().click(); });
    expect((s.resultat ?? []).every((r) => r.godkantGrans === 3)).toBe(true);
  });
});

describe('Del 154 · provdatum ur DigiExams provlista', () => {
  it('inklistrad provlista ger filerna provets datum; den senare sittningen blir omprov för elever som redan skrivit', async () => {
    let s = bygg();
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<DigiExamImport s={s} klass={s.klasser[0]} amne={s.amnen[0]} kor={kor} />));
    rendera();
    const input = div.querySelector('input[aria-label="DigiExam-filer"]') as HTMLInputElement;
    // Den mindre filen ('8b-…', 3 rader i verkligheten) skrevs först i sorteringen men DAGEN EFTER — mocken ger samma blad
    Object.defineProperty(input, 'files', { value: [new File(['x'], '2026-09-30-2248-8b-ekologi-eprov.xlsx'), new File(['x'], '2026-09-30-2249-ekologi-eprov.xlsx')] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); });
    expect(div.textContent).toContain('⚠ exportens datum — inte provets');
    const lista = div.querySelector('textarea[aria-label="DigiExams provlista"]') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(lista, '[8B Ekologi - Eprov](https://app.digiexam.com/app#/exam/grades/1)\nBiologi\nStart time: 2026-09-15 12:50\nExam ID: 1\n[Ekologi - Eprov](https://app.digiexam.com/app#/exam/grades/2)\nBiologi\nStart time: 2026-09-14 09:14\nExam ID: 2');
      lista.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(div.textContent).toContain('2 prov i listan');
    expect((div.querySelector('input[aria-label="Provdatum för 2026-09-30-2249-ekologi-eprov.xlsx"]') as HTMLInputElement).value).toBe('2026-09-14');
    expect((div.querySelector('input[aria-label="Provdatum för 2026-09-30-2248-8b-ekologi-eprov.xlsx"]') as HTMLInputElement).value).toBe('2026-09-15');
    expect(div.textContent).not.toContain('exportens datum — inte provets');
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 2 DigiExam-filer'))!.click(); });
    const res = (s.resultat ?? []).filter((r) => r.kalla === 'digiexam');
    expect(res.filter((r) => r.prov === 'Ekologi E-prov').map((r) => r.datum)).toEqual(['2026-09-14', '2026-09-14']);
    expect(res.filter((r) => r.omprov === true).map((r) => [r.prov, r.datum])).toEqual([['Ekologi E-prov – omprov', '2026-09-15'], ['Ekologi E-prov – omprov', '2026-09-15']]);
    expect(localStorage.getItem('cp.digiexamProvlista') ?? '').toContain('Ekologi - Eprov');   // sparas till nästa import
  });
});
