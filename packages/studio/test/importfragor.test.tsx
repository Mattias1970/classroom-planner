// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, resultatForElev, tomStruktur, type Struktur } from '@planner/kernel';
import { ImportFragor } from '../src/ImportFragor';
import { sparaStruktur } from '../src/store';

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 181 · frågor vid import', () => {
  it('visar kandidaterna med befintligt resultat; svaret importerar raden på vald elev', async () => {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '10:00', slut: '11:00' }] });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg Testsson', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Anna Lind Testsson', grupp: 'A' });
    s = { ...s, resultat: [{ id: 'r1', elevId: 'e1', amneId: 'ma', kalla: 'magma', prov: 'Ma 8B Kap 1 Diagnos', datum: '2026-10-01', poang: 9, maxPoang: 10 }] };
    const underlag = { klassId: 'k', amneId: 'ma', kalla: 'magma' as const, prov: 'Ma 8B Kap 1 Diagnos', datum: '2026-10-08', rader: [{ namn: 'Anna Testsson', poang: 6, maxPoang: 10 }] };
    const u = importeraResultat(s, underlag);
    expect(u.fragor).toHaveLength(1);
    sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    let klar = false;
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); };
    await act(async () => root.render(<ImportFragor vantande={[{ etikett: '8B · Matematik · Ma 8B Kap 1 Diagnos', underlag, fragor: u.fragor }]} kor={kor} onKlar={() => { klar = true; }} />));
    expect(div.textContent).toContain('”Anna Testsson”');
    expect(div.textContent).toContain('Anna Berg Testsson — har redan 9/10 p (2026-10-01)');
    expect(div.textContent).toContain('Anna Lind Testsson — inget resultat på provet ännu');
    const spara = () => [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Spara svaren'))! as HTMLButtonElement;
    expect(spara().disabled).toBe(true);
    // Samma person, annat tillfälle → båda behålls
    await act(async () => { (div.querySelector('input[aria-label="Anna Testsson: Anna Berg Testsson, annat datum"]') as HTMLInputElement).click(); });
    expect(spara().disabled).toBe(false);
    await act(async () => { spara().click(); });
    expect(klar).toBe(true);
    expect(resultatForElev(s, 'e1').map((r) => [r.datum, r.poang])).toEqual([['2026-10-08', 6], ['2026-10-01', 9]]);
    expect(resultatForElev(s, 'e2')).toHaveLength(0);
  });
});
