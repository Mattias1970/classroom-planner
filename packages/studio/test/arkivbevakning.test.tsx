// @vitest-environment jsdom
/**
 * Del 239 · Bevakning av resultatarkivet: filer som inte kunde laddas upp köas och skickas automatiskt,
 * och när appen startar (eller aktiveras) frågar den om nya resultat i datarepot ska laddas.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { bokFromImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraFil, resetIdRaknare, sparaBok, tomStruktur, type ArkivKalla, type Struktur } from '@planner/kernel';
import { ArkivBevakning } from '../src/ArkivBevakning';
import { arkiveraFiler, koadeUppladdningar, kollaArkivet, skickaKoade, tagVantandeFiler, uppladdningsText } from '../src/resultatarkiv';
import { githubLank, lokalSokvag, sparaGitHubConfig, type GitHubConfig } from '../src/github';
import { lasStruktur, sparaStruktur } from '../src/store';

const CFG: GitHubConfig = { owner: 'o', repo: 'classroom-planner-data', branch: 'main', path: 'studio/struktur.json', token: 't' };
const A = 'resultat/ak8/8B/Biologi/socrative/a.xlsx';
const B = 'resultat/ak8/8B/Biologi/socrative/b.xlsx';
const M = 'resultat/ak8/8B/Matematik/magma/m.xlsx';

function bygg(): Struktur {
  const BOK = bokFromImport(JSON.stringify({ schema: 'classroom-planner-bok', version: 1, bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } }, lektioner: { '4': [{ id: 1, type: 'regular', avsnitt: '4.1 Liv', del: 1 }] } }));
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '08:10', slut: '09:10' }] });
  // a.xlsx är redan importerad här
  return registreraFil(s, { amneId: 'bi', filnamn: 'a.xlsx', importerad: '2026-09-01T10:00:00Z', kalla: 'socrative-exit', prov: 'Biologi41' });
}

/** Ett låtsas-GitHub: filträdet, PUT (kan slås av) och filinnehåll. */
function github(trad: string[], opt: { putGar?: () => boolean } = {}) {
  const anrop: Array<{ url: string; metod: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metod = init?.method ?? 'GET';
    anrop.push({ url, metod });
    if (url.includes('/git/trees/')) return new Response(JSON.stringify({ tree: trad.map((path) => ({ path, type: 'blob' })) }), { status: 200 });
    if (metod === 'PUT') {
      if (opt.putGar !== undefined && !opt.putGar()) throw new TypeError('Failed to fetch');
      trad.push(decodeURIComponent(url.split('/contents/')[1]));
      return new Response('{}', { status: 201 });
    }
    const sokvag = decodeURIComponent(url.split('/contents/')[1]?.split('?')[0] ?? '');
    if (trad.includes(sokvag)) return new Response(JSON.stringify({ content: btoa(`innehåll ${sokvag.split('/').pop()}`.replace(/å/g, 'a')), encoding: 'base64' }), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
  return anrop;
}

const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const rotter: Array<ReturnType<typeof createRoot>> = [];

function montera() {
  const div = document.createElement('div'); document.body.appendChild(div);
  const root = createRoot(div); rotter.push(root);
  const logg: string[] = [];
  const oppnade: Array<{ klassId: string; amneId: string; kalla: ArkivKalla }> = [];
  let s = lasStruktur();
  const rendera = () => act(() => root.render(
    <ArkivBevakning s={s} uppdatera={() => { s = lasStruktur(); rendera(); }} meddela={(m) => logg.push(m)}
      oppnaImport={(klassId, amneId, kalla) => oppnade.push({ klassId, amneId, kalla })} oppnaDatarepo={() => logg.push('datarepo')} />));
  rendera();
  return { div, logg, oppnade, root, satt: (ny: Struktur) => { sparaStruktur(ny); s = ny; rendera(); } };
}
const knapp = (div: HTMLElement, text: string) => [...div.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

beforeEach(async () => {
  localStorage.clear(); document.body.innerHTML = ''; sparaStruktur(bygg());
  tagVantandeFiler('bi', 'socrative'); tagVantandeFiler('ma', 'magma');
  // Töm uppladdningskön mellan testerna
  sparaGitHubConfig(CFG); github([]); await skickaKoade(); localStorage.removeItem('classroom-planner.studio.github'); vi.unstubAllGlobals();
});
afterEach(() => { for (const r of rotter.splice(0)) act(() => r.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Del 239 · var filerna ligger', () => {
  it('länk till mappen på github.com och sökvägen i den lokala klonen', () => {
    expect(githubLank(CFG, 'resultat/ak8/8B/Biologi/socrative')).toBe('https://github.com/o/classroom-planner-data/tree/main/resultat/ak8/8B/Biologi/socrative');
    expect(githubLank(CFG, 'resultat/ak8/8B/Biologi/socrative/Class 1.xlsx', 'blob')).toBe('https://github.com/o/classroom-planner-data/blob/main/resultat/ak8/8B/Biologi/socrative/Class%201.xlsx');
    expect(lokalSokvag(CFG, 'resultat/ak8')).toBeNull();
    expect(lokalSokvag({ ...CFG, lokalMapp: 'C:\\Users\\test\\Code\\classroom-planner-data\\' }, 'resultat/ak8/8B')).toBe('C:\\Users\\test\\Code\\classroom-planner-data\\resultat\\ak8\\8B');
    expect(lokalSokvag({ ...CFG, lokalMapp: '/home/test/data' }, 'resultat/ak8')).toBe('/home/test/data/resultat/ak8');
  });
});

describe('Del 239 · filer som inte kunde laddas upp skickas automatiskt senare', () => {
  it('utan GitHub-konfiguration köas filen; när datarepot är ifyllt laddas den upp vid nästa kontroll', async () => {
    const u = await arkiveraFiler('bi', 'socrative', [new File(['hej'], 'ny.xlsx')]);
    expect(u[0].fel).toMatch(/väntar här och laddas upp automatiskt/);
    expect(uppladdningsText(u)).toContain('0 av 1 i datarepot');
    expect((await koadeUppladdningar()).map((x) => x.sokvag)).toEqual(['resultat/ak8/8B/Biologi/socrative/ny.xlsx']);
    expect(await kollaArkivet()).toBeNull();   // ingen konfiguration → inget att fråga om

    sparaGitHubConfig(CFG);
    const anrop = github([A]);
    const k = (await kollaArkivet())!;
    expect(k.skickade).toEqual(['resultat/ak8/8B/Biologi/socrative/ny.xlsx']);
    expect(anrop.filter((a) => a.metod === 'PUT')).toHaveLength(1);
    expect(await koadeUppladdningar()).toEqual([]);
    expect(lasStruktur().resultatArkiv!.find((x) => x.filnamn === 'ny.xlsx')!.uppladdad).not.toBe('');
    expect(k.jamforelse.nya).toEqual([]);   // den egna filen är inte "ny" — den är importerad här
  });

  it('nätfel vid uppladdning: filen ligger kvar i kön och går iväg när nätet är tillbaka', async () => {
    sparaGitHubConfig(CFG);
    let nat = false;
    github([], { putGar: () => nat });
    const u = await arkiveraFiler('bi', 'socrative', [new File(['hej'], 'ny.xlsx')]);
    expect(u[0].fel).toMatch(/Failed to fetch — filen väntar här/);
    expect((await skickaKoade())).toMatchObject({ skickade: [], kvar: 1 });
    nat = true;
    expect((await skickaKoade())).toMatchObject({ skickade: ['resultat/ak8/8B/Biologi/socrative/ny.xlsx'], kvar: 0, fel: null });
  });
});

describe('Del 239 · appen frågar om nya resultat i datarepot ska laddas', () => {
  it('utan GitHub-konfiguration görs inga anrop och ingen fråga visas', async () => {
    const anrop = github([A, B]);
    const { div } = montera(); await flush();
    expect(anrop).toHaveLength(0);
    expect(div.textContent).toBe('');
  });

  it('vid start: frågan visar antal och mapp; Ja hämtar filerna, lägger dem framme och öppnar importen', async () => {
    sparaGitHubConfig(CFG);
    github([A, B, M, 'resultat/ak8/8A/Biologi/socrative/annan-klass.xlsx']);
    const { div, logg, oppnade } = montera(); await flush();
    const fraga = div.querySelector('[aria-label="Nya resultat i datarepot"]')!;
    expect(fraga.textContent).toContain('Datarepot har 2 filer med resultat som inte är laddade i appen');
    expect(fraga.textContent).toContain('8B Biologi · Socrative');
    expect(fraga.textContent).toContain('resultat/ak8/8B/Biologi/socrative/');
    expect(fraga.textContent).toContain('8B Matematik · Magma');
    expect(fraga.textContent).not.toContain('a.xlsx');           // redan importerad här
    expect(fraga.textContent).not.toContain('annan-klass.xlsx'); // klassen finns inte här
    expect((fraga.querySelector('a') as HTMLAnchorElement).href).toBe('https://github.com/o/classroom-planner-data/tree/main/resultat/ak8/8B/Biologi/socrative');

    await act(async () => { knapp(div, 'Ja, ladda dem')!.click(); await new Promise((r) => setTimeout(r, 0)); }); await flush();
    expect(oppnade).toEqual([{ klassId: 'k', amneId: 'bi', kalla: 'socrative' }]);
    expect(logg[0]).toContain('2 filer hämtade från datarepot');
    expect(div.querySelector('[aria-label="Nya resultat i datarepot"]')).toBeNull();
    // Filerna ligger i kön för importsidorna
    expect(div.textContent).toContain('väntar på granskning och import');
    let hamtade: File[] = []; let magma: File[] = [];
    act(() => { hamtade = tagVantandeFiler('bi', 'socrative'); magma = tagVantandeFiler('ma', 'magma'); });
    expect(hamtade.map((f) => f.name)).toEqual(['b.xlsx']);
    expect(await hamtade[0].text()).toBe('innehall b.xlsx');
    expect(magma.map((f) => f.name)).toEqual(['m.xlsx']);
    expect(div.textContent).toBe('');   // inget kvar att visa
  });

  it('Inte nu tystar frågan tills det kommer fler nya filer', async () => {
    sparaGitHubConfig(CFG);
    const trad = [A, B];
    github(trad);
    const forsta = montera(); await flush();
    await act(async () => { knapp(forsta.div, 'Inte nu')!.click(); });
    expect(forsta.div.querySelector('[aria-label="Nya resultat i datarepot"]')).toBeNull();
    act(() => forsta.root.unmount()); rotter.splice(0);
    // Nästa start: samma fil → ingen fråga
    const andra = montera(); await flush();
    expect(andra.div.querySelector('[aria-label="Nya resultat i datarepot"]')).toBeNull();
    act(() => andra.root.unmount()); rotter.splice(0);
    // En ny fil har kommit → frågan visas igen, med båda
    trad.push(M);
    const tredje = montera(); await flush();
    expect(tredje.div.querySelector('[aria-label="Nya resultat i datarepot"]')!.textContent).toContain('2 filer');
  });

  it('frågan försvinner när filerna importerats; aktivering av fönstret kontrollerar igen först efter en stund', async () => {
    sparaGitHubConfig(CFG);
    const anrop = github([A, B]);
    const { div, satt } = montera(); await flush();
    expect(div.querySelector('[aria-label="Nya resultat i datarepot"]')).not.toBeNull();
    const trad1 = anrop.filter((a) => a.url.includes('/git/trees/')).length;
    // Fönstret aktiveras direkt igen → ingen ny kontroll (minst tio minuter emellan)
    await act(async () => { window.dispatchEvent(new Event('focus')); }); await flush();
    expect(anrop.filter((a) => a.url.includes('/git/trees/')).length).toBe(trad1);
    // b.xlsx importeras → inget kvar att fråga om
    satt(registreraFil(lasStruktur(), { amneId: 'bi', filnamn: 'b.xlsx', importerad: '2026-09-02T10:00:00Z', kalla: 'socrative-laxforhor', prov: 'Biologi412' }));
    expect(div.querySelector('[aria-label="Nya resultat i datarepot"]')).toBeNull();
    // Efter tio minuter kontrolleras arkivet igen när fönstret aktiveras
    const nu = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(nu + 11 * 60 * 1000);
    await act(async () => { window.dispatchEvent(new Event('focus')); }); await flush();
    expect(anrop.filter((a) => a.url.includes('/git/trees/')).length).toBe(trad1 + 1);
  });

  it('går datarepot inte att läsa vid start (utgången nyckel) sägs det — ingen fråga, inget kraschar', async () => {
    sparaGitHubConfig(CFG);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const { div, logg } = montera(); await flush();
    expect(logg).toEqual(['☁ Datarepot kunde inte kontrolleras efter nya resultat: GitHub 401: kunde inte läsa repots filträd. Se Datarepo.']);
    expect(div.textContent).toBe('');
  });

  it('vid start laddas köade filer upp och läraren får veta var de hamnade', async () => {
    await arkiveraFiler('bi', 'socrative', [new File(['hej'], 'ny.xlsx')]);   // ingen konfiguration än → kö
    sparaGitHubConfig(CFG);
    github([A]);
    const { div, logg } = montera(); await flush();
    expect(logg).toEqual(['☁ 1 fil som väntade laddades upp till datarepot: resultat/ak8/8B/Biologi/socrative/.']);
    expect(div.querySelector('[aria-label="Nya resultat i datarepot"]')).toBeNull();
  });
});
