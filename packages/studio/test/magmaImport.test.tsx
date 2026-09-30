// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { MagmaImport } from '../src/MagmaImport';
import { sparaStruktur } from '../src/store';

// Fejkad Magma-export som XLSX.read/sheet_to_json 'läser' — verkliga elevnamn hör inte hemma i kodrepot.
const FEJK_MAGMA: Array<Array<string | number | null>> = [
  ['', '', '1', '2', '3', '4', '', ''],
  ['Anna', 'Berg', 1, 1, 1, 1, null, null],
  ['Omar', 'Ali', 1, 0, 1, 1, null, null],
  ['Pia', 'Provlund', null, null, null, null, null, null],
];
vi.mock('xlsx', () => ({
  read: () => ({ SheetNames: ['2026-09-30'], Sheets: { '2026-09-30': {} } }),
  utils: { sheet_to_json: () => FEJK_MAGMA },
}));

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  return s;
}

const sov = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('MagmaImport', () => {
  it('läser filen, visar rätt/fel per uppgift och sparar resultat per elev med omdöme', async () => {
    let s = bygg();
    sparaStruktur(s);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const rendera = () => act(() => root.render(<MagmaImport s={s} klass={s.klasser[0]} amne={s.amnen[0]} kor={kor} />));
    rendera();
    const input = div.querySelector('input[aria-label="Magma-filer"]') as HTMLInputElement;
    const fil = new File(['x'], '8b_1.4_-_1.5.xlsx');
    Object.defineProperty(input, 'files', { value: [fil] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await sov(); await sov(); });
    expect(div.textContent).toContain('4 uppgifter · 2 deltog · 2 matchade');
    expect((div.querySelector('input[aria-label="Provnamn för 8b_1.4_-_1.5.xlsx"]') as HTMLInputElement).value).toBe('8b 1.4 - 1.5');
    expect((div.querySelector('input[aria-label="Provdatum för 8b_1.4_-_1.5.xlsx"]') as HTMLInputElement).value).toBe('2026-09-30');
    expect(div.textContent).toContain('deltog inte');
    expect(div.querySelectorAll('.st-magma-fel')).toHaveLength(1);   // Omars uppgift 2
    expect(div.textContent).toContain('Utmärkt'); expect(div.textContent).toContain('Godkänt'); // 100 % och 75 %
    const knapp = [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Importera 1 Magma-prov'))!;
    await act(async () => { knapp.click(); });
    const res = (s.resultat ?? []).filter((r) => r.kalla === 'magma');
    expect(res).toHaveLength(2);
    const omar = res.find((r) => r.elevId === 'e2')!;
    expect(omar).toMatchObject({ prov: '8b 1.4 - 1.5', datum: '2026-09-30', amneId: 'ma', poang: 3, maxPoang: 4 });
    expect(omar.svar?.map((x) => x.ratt)).toEqual([true, false, true, true]);
    expect(s.filregister?.[0]).toMatchObject({ filnamn: '8b_1.4_-_1.5.xlsx', kalla: 'magma', traffar: 2 });
    // Sparade prov visas per elev
    expect(div.textContent).toContain('Sparade Magma-prov');
    expect(div.textContent).toContain('Utmärkt 1 · Bra 0 · Godkänt 1 · Under godkänt 0');
  });
});
