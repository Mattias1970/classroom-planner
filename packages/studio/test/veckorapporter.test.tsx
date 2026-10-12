// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { bokFromImport, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { VeckorapportLarm, Veckorapporter } from '../src/Veckorapporter';
import { sparaStruktur } from '../src/store';

function bygg(): Struktur {
  const BIO = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } },
    lektioner: { '4': [{ id: 1, type: 'regular', avsnitt: '4.1 Ekosystem', del: 1 }, { id: 2, type: 'regular', avsnitt: '4.1 Ekosystem', del: 2 }, { id: 3, type: 'regular', avsnitt: '4.2 Näringskedjor', del: 1 }] },
  }));
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BIO);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: 'bio', skapad: '2026-08-10' });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Biologi41', datum: '2026-08-17', rum: 'BIOLOGI41', rader: [{ namn: 'Anna Berg', poang: 7, maxPoang: 10 }] }).s;
  return s;
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 194 · Veckorapporter', () => {
  it('larm fredag 16:00 → skapa rapporten → att-göra-listan bockas → larmet försvinner', async () => {
    let s = bygg(); sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    let nu = { datum: '2026-08-21', tid: '15:00' };
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const rendera = () => act(() => root.render(<Veckorapporter s={s} kor={kor} nu={nu} />));
    rendera();
    // Fredag 15:00: inget larm
    expect(div.querySelector('[role="alert"]')).toBeNull();
    expect(div.textContent).toContain('Inga veckorapporter än');
    nu = { datum: '2026-08-21', tid: '16:00' }; rendera();
    const larm = () => div.querySelector('[role="alert"]');
    expect(larm()!.textContent).toContain('v.34 (17–21 augusti 2026) är dags (fredag 16:00)');
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Skapa veckorapport v.34'))!.click(); });
    expect(s.veckorapporter).toHaveLength(1);
    expect(s.veckorapporter![0]).toMatchObject({ vecka: 34, skapad: '2026-08-21 16:00' });
    expect(s.veckorapporter![0].amnen[0].text).toContain('Vad vi gjort: kapitel 4 Ekologi — 4.1 Ekosystem (1 lektion).');
    expect(s.veckorapporter![0].amnen[0].text).toContain('Exit tickets: Biologi41 (mån 17 aug) snitt 70 %, 1 av 1 elever.');
    // Rapporten i listan, larmet visar att-göra-listan
    expect(div.textContent).toContain('8B · Biologi');
    expect(larm()!.textContent).toContain('Ladda upp inlämningar i Teams');
    const rutor = () => [...larm()!.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(rutor()).toHaveLength(3);
    for (let i = 0; i < 3; i += 1) await act(async () => { rutor()[i].click(); });
    expect(s.veckorapporter![0].todo.every((t) => t.klar)).toBe(true);
    expect(larm()).toBeNull();
    expect(div.textContent).toContain('3/3 klara');
    // Ta bort → veckan saknas igen
    window.confirm = () => true;
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Ta bort'))!.click(); });
    expect(s.veckorapporter).toBeUndefined();
    expect(larm()!.textContent).toContain('v.34');
  });

  it('larmet ensamt: inget skolår → inget larm', () => {
    const div = document.createElement('div'); document.body.appendChild(div);
    act(() => createRoot(div).render(<VeckorapportLarm s={tomStruktur()} kor={() => {}} nu={{ datum: '2026-08-21', tid: '17:00' }} />));
    expect(div.querySelector('[role="alert"]')).toBeNull();
  });
});
