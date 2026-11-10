// @vitest-environment jsdom
/**
 * Del 239 · Hela vägen i appen: vid start hittas en ny Socrative-rapport i datarepot, appen frågar,
 * "Ja" hämtar filen och öppnar Resultat → 📥 Importera med filen framme för granskning.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { sparaGitHubConfig } from '../src/github';
import { lasStruktur, sparaStruktur } from '../src/store';

const FILNAMN = 'Class_2026_08_24__07_02_QZ_Biologi_4.1_Begrepp.xlsx';
const SOKVAG = `resultat/ak8/8B/Biologi/socrative/${FILNAMN}`;

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  return laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
}

/** En Socrative-klassrapport som riktig xlsx, base64-kodad som GitHub lämnar den. */
function rapportBase64(): string {
  const ark = XLSX.utils.aoa_to_sheet([
    ['Biologi 4.1 Begrepp'], ['Mon Aug 24 2026'], ['BIOLOGI41'],
    ['Presence', 'Student Name', 'Student ID', 'Score (%)', 'Score (#)', 'Läran om samspelet i naturen.', 'En naturtyp med en viss sorts växter och djur.'],
    [null, null, null, null, 2, '1 point', '1 point'],
    ['Yes', 'Berg, Anna', 'ANNA', '100', 2, 'A. • ekologi', 'B. • biotop'],
    ['Yes', 'Ali, Omar', 'OMAR', '50', 1, 'C. • population', 'B. • biotop'],
  ]);
  const bok = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(bok, ark, 'Rapport');
  return XLSX.write(bok, { type: 'base64', bookType: 'xlsx' }) as string;
}

const vanta = async (varv = 6) => { for (let i = 0; i < varv; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
let rot: ReturnType<typeof createRoot> | null = null;

beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.unstubAllGlobals(); });

describe('Del 239 · appen startar, hittar nya resultat i datarepot och frågar', () => {
  it('Ja → filen hämtas och ligger framme under 📥 Importera för rätt klass och ämne', async () => {
    sparaStruktur(bygg());
    sparaGitHubConfig({ owner: 'o', repo: 'classroom-planner-data', branch: 'main', path: 'studio/struktur.json', token: 't' });
    const b64 = rapportBase64();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) return new Response(JSON.stringify({ tree: [{ path: SOKVAG, type: 'blob' }, { path: 'books/x/book.json', type: 'blob' }] }), { status: 200 });
      if (url.includes('/contents/resultat/')) return new Response(JSON.stringify({ content: b64, encoding: 'base64' }), { status: 200 });
      return new Response('{}', { status: 404 });
    }));
    const host = document.createElement('div'); document.body.appendChild(host);
    rot = createRoot(host);
    act(() => { rot!.render(<App />); });
    await vanta();

    const fraga = host.querySelector('[aria-label="Nya resultat i datarepot"]')!;
    expect(fraga.textContent).toContain('Datarepot har 1 fil med resultat som inte är laddade i appen');
    expect(fraga.textContent).toContain('8B Biologi · Socrative');
    expect(fraga.textContent).toContain('resultat/ak8/8B/Biologi/socrative/');

    await act(async () => { ([...fraga.querySelectorAll('button')].find((b) => b.textContent?.includes('Ja, ladda den')) as HTMLButtonElement).click(); await new Promise((r) => setTimeout(r, 0)); });
    await vanta(10);

    // Resultat-sidan är öppen med importen utfälld och filen framme för granskning
    expect(host.querySelector('[aria-label="Nya resultat i datarepot"]')).toBeNull();
    const importen = host.querySelector('details.st-import') as HTMLDetailsElement;
    expect(importen.open).toBe(true);
    const tabell = [...host.querySelectorAll('table.st-tabell')].find((t) => t.textContent?.includes('Tolkning'));
    expect(tabell, 'granskningstabellen för Socrative-filer').toBeDefined();
    expect(tabell!.textContent).toContain('Class_2026_08_24__07_0');   // filnamnet kortas i tabellen
    expect(tabell!.textContent).toContain('klar att importera');
    expect(tabell!.textContent).toContain('Biologi 4.1 Begrepp');
    expect(host.textContent).toContain('1 fil hämtade från datarepot');

    // Importera → resultaten finns i appen, filen är registrerad som importerad (inte uppladdad en gång till)
    const importera = [...host.querySelectorAll('button')].find((b) => /Importera \d+ fil/.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
    expect(importera, 'knappen Importera N filer').toBeDefined();
    await act(async () => { importera!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await vanta();
    const s = lasStruktur();
    expect((s.resultat ?? []).map((r) => r.elevId).sort()).toEqual(['e1', 'e2']);
    expect((s.filregister ?? []).map((f) => f.filnamn)).toEqual([FILNAMN]);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });
});
