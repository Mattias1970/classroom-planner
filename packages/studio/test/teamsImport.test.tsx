// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraInlamningar, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tolkaTeamsTilldelningar, tomStruktur, type Struktur } from '@planner/kernel';
import { TeamsImport } from '../src/TeamsImport';
import { sparaStruktur } from '../src/store';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  const rader = tolkaTeamsTilldelningar([
    [null, null, null, 'Fullständigt namn', 'Förnamn', 'Efternamn', 'E-postadress', 'Tilldelningar', 'Förfallodatum', 'Märke', 'Status', 'Feedback'],
    [null, null, null, 'Anna Berg', 'Anna', 'Berg', '', 'Biologi 6.5 Begrepp', '2026-10-09 00:00:00', null, 'Inlämnat', null],
    [null, null, null, 'Omar Ali', 'Omar', 'Ali', '', 'Biologi 6.5 Begrepp', '2026-10-09 00:00:00', null, 'Visade', null],
    [null, null, null, 'Anna Berg', 'Anna', 'Berg', '', 'Biologi 6.4 Testa dig själv 1 - 6', '2026-10-01 00:00:00', null, 'Inlämnad sent', null],
    [null, null, null, 'Omar Ali', 'Omar', 'Ali', '', 'Biologi 6.4 Testa dig själv 1 - 6', '2026-10-01 00:00:00', null, 'Inte inlämnat', null],
  ]);
  return importeraInlamningar(s, 'k', rader).s;
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 163 · Teams-inlämningar', () => {
  it('diagram och tabell per uppgift; underkänd inlämning räknas som saknad', async () => {
    let s = bygg(); sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const amne = s.amnen[0]; const klass = s.klasser[0];
    const rendera = () => act(() => root.render(<TeamsImport s={s} klass={klass} amne={amne} kor={kor} idag="2026-10-07" />));
    rendera();
    expect(div.querySelector('svg[aria-label="Inlämningar per uppgift"]')).not.toBeNull();
    expect(div.textContent).toContain('Biologi · 2 uppgifter');
    // Procenten gäller bara det som ska vara inne (6.4, förfallen 1/10): Anna sen, Omar saknas → 50 %
    expect(div.querySelector('.st-inl-talruta b')!.textContent).toBe('50 %');
    expect(div.textContent).toContain('1 förfallna uppgifter · 1 inlämningar saknas');
    expect(div.querySelector('.st-inl-talruta.kommande b')!.textContent).toBe('1');
    expect(div.textContent).toContain('Kommande (1)');
    const rad = [...div.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Biologi 6.5 Begrepp'))!;
    expect(rad.classList.contains('st-inl-kommande')).toBe(true);
    expect(rad.textContent).toContain('1 har lämnat in i förväg');
    // Öppna den förfallna uppgiften och underkänn Anna (t.ex. utan bild) → 0 %
    const rad64 = [...div.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Biologi 6.4 Testa dig själv'))!;
    await act(async () => { (rad64.querySelector('button.linkbtn') as HTMLButtonElement).click(); });
    await act(async () => { (div.querySelector('button[aria-label="Underkänn Anna Berg"]') as HTMLButtonElement).click(); });
    expect(s.inlamningar!.find((x) => x.elevId === 'e1' && x.uppgift === 'Biologi 6.4 Testa dig själv')?.underkand).toBe(true);
    expect(div.querySelector('.st-inl-talruta b')!.textContent).toBe('0 %');
    // Per elev
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent === 'Per elev')!.click(); });
    const annaRad = [...div.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Anna Berg'))!;
    expect(annaRad.textContent).toContain('0 %');
    expect(annaRad.textContent).toContain('6.4 Testa dig själv');
    expect(annaRad.textContent).toContain('1 av 1 inlämnade');
  });
});
