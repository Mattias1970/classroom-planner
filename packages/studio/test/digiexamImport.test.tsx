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
    expect((div.querySelector(`input[aria-label="Provnamn för ${FILNAMN}"]`) as HTMLInputElement).value).toBe('8b ekologi eprov');
    expect((div.querySelector(`input[aria-label="Provdatum för ${FILNAMN}"]`) as HTMLInputElement).value).toBe('2026-09-30');
    expect((div.querySelector(`input[aria-label="Maxpoäng för ${FILNAMN}"]`) as HTMLInputElement).value).toBe('4');
    expect(div.textContent).toContain('0 poäng — hoppas över');
    expect(div.querySelectorAll('.st-de-del')).toHaveLength(1);   // Annas fråga 3 = 0,5
    expect(div.querySelectorAll('.st-de-noll')).toHaveLength(2);  // Omars fråga 2 och 4
    expect(div.textContent).not.toContain('⚠ omatchade');

    // Läraren rättar maxpoängen (provet hade 5 poäng, ingen fick fullt på sista) och importerar
    const max = div.querySelector(`input[aria-label="Maxpoäng för ${FILNAMN}"]`) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(max, '5'); max.dispatchEvent(new Event('input', { bubbles: true })); });
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 1 DigiExam-prov'))!;
    await act(async () => { knapp.click(); });

    const res = (s.resultat ?? []).filter((r) => r.kalla === 'digiexam');
    expect(res).toHaveLength(2);
    const omar = res.find((r) => r.elevId === 'e2')!;
    expect(omar).toMatchObject({ prov: '8b ekologi eprov', datum: '2026-09-30', amneId: 'bi', poang: 2, maxPoang: 5 });
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
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 1 DigiExam-prov'))!;
    await act(async () => { knapp.click(); });
    expect(s.elever.map((e) => [e.namn, e.epost])).toEqual([['Anna Berg', 'anna.berg@elevmail.test'], ['Omar Ali', 'omar.ali@elevmail.test']]);
    expect((s.resultat ?? []).filter((r) => r.kalla === 'digiexam')).toHaveLength(2);
  });
});
