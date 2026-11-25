// @vitest-environment jsdom
/**
 * Del 264 · Spara till och hämta från GitHub: två knappar bredvid varandra i toppraden, läget med datum under,
 * och en versionslista där en äldre version kan återställas. Inget skrivs över utan fråga, och en hämtning
 * går att ångra.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type Struktur } from '@planner/kernel';
import { App } from '../src/App';
import { datumText, synkstatus, versionsbeskrivning } from '../src/GitHubSynk';
import { bekraftaHamtning, fromBase64, hamtaVersioner, laddaVersion, lasOsparat, lasSynk, markeraOsparat, sparaGitHubConfig, sparaTillGitHub, toBase64, type GitHubConfig, type GitHubVersion } from '../src/github';
import { exportJson, lasStruktur } from '../src/store';

const CFG: GitHubConfig = { owner: 'Mattias1970', repo: 'classroom-planner-data', branch: 'main', path: 'studio/struktur.json', token: 'tok' };

/** En app med innehåll: en eller två klasser. */
function bygg(klasser: string[] = ['8A']): Struktur {
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  for (const namn of klasser) {
    s = laggTillKlass(s, { id: `k${namn}`, tjanstId: 'tj', namn });
    s = laggTillAmne(s, { id: `ma${namn}`, klassId: `k${namn}`, namn: 'Matematik', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  }
  return s;
}

interface Sparad { sha: string; datum: string; message: string; json: string }
/** Ett låtsas-GitHub med versionshistorik för studio/struktur.json. Nyast sist i `versioner`. */
function github(versioner: Sparad[], opt: { skrivskyddad?: boolean } = {}) {
  const anrop: Array<{ url: string; metod: string; body?: { message: string; content: string; sha?: string } }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metod = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { message: string; content: string; sha?: string }) : undefined;
    anrop.push({ url, metod, body });
    const svar = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.includes('/commits?')) {
      return versioner.length === 0 ? svar([]) : svar([...versioner].reverse().map((v) => ({ sha: v.sha, commit: { message: v.message, committer: { date: v.datum } } })));
    }
    if (url.includes('/contents/studio/struktur.json')) {
      if (metod === 'PUT') {
        if (opt.skrivskyddad === true) return svar({ message: 'Resource not accessible by personal access token' }, 403);
        const ny: Sparad = { sha: `c${versioner.length + 1}`, datum: new Date().toISOString(), message: body!.message, json: fromBase64(body!.content) };
        versioner.push(ny);
        return svar({ content: { sha: `blob-${ny.sha}` }, commit: { sha: ny.sha } });
      }
      const ref = decodeURIComponent(url.split('ref=')[1] ?? 'main');
      const v = ref === 'main' ? versioner[versioner.length - 1] : versioner.find((x) => x.sha === ref);
      return v === undefined ? svar({}, 404) : svar({ sha: `blob-${v.sha}`, content: toBase64(v.json), encoding: 'base64' });
    }
    if (url.includes('/git/trees/')) return svar({ tree: [] });
    return svar({}, 404);
  }));
  return anrop;
}

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
let rot: ReturnType<typeof createRoot> | null = null;
let fragor: string[] = [];
let svaraJa = true;
beforeEach(() => {
  localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; fragor = []; svaraJa = true;
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, 'confirm').mockImplementation((text?: string) => { fragor.push(text ?? ''); return svaraJa; });
});
afterEach(() => { if (rot !== null) act(() => rot!.unmount()); rot = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function starta(s: Struktur | null, kopplad = true): Promise<HTMLElement> {
  if (s !== null) localStorage.setItem('classroom-planner.studio.v2', JSON.stringify(s));
  if (kopplad) sparaGitHubConfig(CFG);
  const host = document.createElement('div'); document.body.appendChild(host);
  rot = createRoot(host);
  act(() => { rot!.render(<App />); });
  await flush();
  return host;
}
const grupp = (host: HTMLElement) => host.querySelector('[role="group"][aria-label="GitHub – spara och hämta"]') as HTMLElement;
const knapp = (host: HTMLElement, text: string) => [...grupp(host).querySelectorAll('button')].find((b) => b.textContent!.includes(text)) as HTMLButtonElement;
const status = (host: HTMLElement) => grupp(host).querySelector('[role="status"]')!.textContent!;
const klicka = async (b: HTMLElement) => { act(() => { b.click(); }); await flush(); };
const klasser = () => lasStruktur().klasser.map((k) => k.namn);
/** Innehållet i en sparfil utan tidsstämpeln för när den skrevs. */
const innehall = (json: string) => { const { exportedAt: _tid, ...rest } = JSON.parse(json) as Record<string, unknown>; return rest; };

describe('Del 264 · datum och läge', () => {
  it('datumText: i dag, i går och äldre datum — med året när det inte är i år', () => {
    const nu = new Date(2026, 10, 25, 7, 30);
    expect(datumText(new Date(2026, 10, 25, 7, 21).toISOString(), nu)).toBe('i dag 07:21');
    expect(datumText(new Date(2026, 10, 24, 16, 24).toISOString(), nu)).toBe('i går 16:24');
    expect(datumText(new Date(2026, 10, 23, 9, 5).toISOString(), nu)).toBe('23 nov 09:05');
    expect(datumText(new Date(2025, 11, 3, 14, 0).toISOString(), nu)).toBe('3 dec 2025 14:00');
  });

  it('raden under knapparna säger när GitHubs version sparades och om den finns här', () => {
    const nu = new Date(2026, 10, 25, 7, 30);
    const v: GitHubVersion = { sha: 'c2', datum: new Date(2026, 10, 24, 16, 24).toISOString(), text: '' };
    const bas = { klar: true, tom: false, versioner: [v], fel: null, synk: null, osparat: null, nu };
    const synk = { sha: 'c2', tid: v.datum, riktning: 'sparat' as const };
    expect(synkstatus({ ...bas, klar: false })).toMatchObject({ ton: 'neutral', text: 'Inte kopplat till GitHub — fyll i nyckeln under Datarepo' });
    expect(synkstatus({ ...bas, synk })).toEqual({ ton: 'ok', text: 'GitHub: i går 16:24 · ✓ samma här', framhav: null });
    expect(synkstatus({ ...bas, synk, osparat: new Date(2026, 10, 25, 7, 10).toISOString() })).toEqual({ ton: 'osparat', text: 'GitHub: i går 16:24 · ● ändrat här sedan i dag 07:10 — inte sparat', framhav: 'spara' });
    expect(synkstatus({ ...bas, synk: { ...synk, sha: 'c1' } })).toEqual({ ton: 'varning', text: 'GitHub: i går 16:24 — nyare än det som finns här', framhav: 'hamta' });
    expect(synkstatus(bas)).toEqual({ ton: 'varning', text: 'GitHub: i går 16:24 — inte hämtad hit', framhav: 'hamta' });
    expect(synkstatus({ ...bas, tom: true })).toEqual({ ton: 'varning', text: 'GitHub: i går 16:24 — tryck Hämta för att fylla appen', framhav: 'hamta' });
    expect(synkstatus({ ...bas, synk: { ...synk, sha: 'c1' }, osparat: v.datum }).text).toBe('GitHub: i går 16:24 från en annan dator · ● och ändrat här — inte sparat');
    expect(synkstatus({ ...bas, synk: { ...synk, aterstalld: new Date(2026, 10, 20, 8, 0).toISOString() }, osparat: v.datum }).text).toBe('Här: återställd version från 20 nov 08:00 — inte sparad som senaste');
    expect(synkstatus({ ...bas, versioner: [] })).toEqual({ ton: 'neutral', text: 'Inget sparat på GitHub än — tryck Spara', framhav: 'spara' });
    expect(synkstatus({ ...bas, versioner: null, fel: 'GitHub 500' }).text).toBe('GitHub svarar inte: GitHub 500');
  });
});

describe('Del 264 · versionerna på GitHub', () => {
  it('varje sparning blir en version med datum och beskrivning; en äldre version går att läsa', async () => {
    const lager: Sparad[] = [{ sha: 'c1', datum: '2026-11-20T08:00:00Z', message: 'Studio: uppdatera studio/struktur.json (2026-11-20T08:00:00.000Z)', json: '{"gammal":true}' }];
    const anrop = github(lager);
    const sha = await sparaTillGitHub(CFG, '{"ny":true}', '2 klasser · 58 elever · 312 resultat · 4 planeringar');
    expect(sha).toBe('c2');
    expect(anrop.find((a) => a.metod === 'PUT')!.body!.message).toBe('Studio: sparat · 2 klasser · 58 elever · 312 resultat · 4 planeringar');
    expect(lasSynk()).toMatchObject({ sha: 'c2', riktning: 'sparat' });
    const lista = await hamtaVersioner(CFG);
    expect(lista.map((v) => [v.sha, v.text])).toEqual([['c2', '2 klasser · 58 elever · 312 resultat · 4 planeringar'], ['c1', '']]);
    expect(lista[1].datum).toBe('2026-11-20T08:00:00Z');
    expect(await laddaVersion(CFG, lista[1])).toBe('{"gammal":true}');
    expect(await laddaVersion(CFG, lista[0])).toBe('{"ny":true}');
  });

  it('inget sparat än → tom lista; en nyckel som bara får läsa ger ett begripligt fel', async () => {
    github([], { skrivskyddad: true });
    expect(await hamtaVersioner(CFG)).toEqual([]);
    await expect(sparaTillGitHub(CFG, '{}', 'x')).rejects.toThrow('nyckeln får inte skriva till Mattias1970/classroom-planner-data. Den behöver "Contents: Read and write"');
    expect(lasSynk()).toBeNull();
  });

  it('en hämtning av den senaste gör läget synkat; en äldre version räknas som osparad tills den sparas', () => {
    const senaste: GitHubVersion = { sha: 'c2', datum: '2026-11-24T15:24:00Z', text: '' };
    const aldre: GitHubVersion = { sha: 'c1', datum: '2026-11-20T08:00:00Z', text: '' };
    markeraOsparat();
    bekraftaHamtning(senaste, senaste);
    expect(lasSynk()).toMatchObject({ sha: 'c2', riktning: 'hamtat' });
    expect(lasSynk()!.aterstalld).toBeUndefined();
    expect(lasOsparat()).toBeNull();
    bekraftaHamtning(aldre, senaste);
    expect(lasSynk()).toMatchObject({ sha: 'c2', riktning: 'hamtat', aterstalld: '2026-11-20T08:00:00Z' });   // ingen krock vid nästa sparning
    expect(lasOsparat()).not.toBeNull();
  });
});

describe('Del 264 · knapparna i toppraden', () => {
  it('två knappar bredvid varandra på alla sidor, med GitHubs datum under', async () => {
    const lager: Sparad[] = [{ sha: 'c1', datum: '2026-11-20T08:00:00Z', message: 'x', json: exportJson(bygg()) }];
    github(lager);
    const host = await starta(bygg());
    const g = grupp(host);
    expect(g.closest('.v3-topp')).not.toBeNull();
    expect([...g.querySelectorAll('.gh-knappar button')].map((b) => b.textContent)).toEqual(['⬆ Spara till GitHub', '⬇ Hämta från GitHub', '🕘 Versioner']);
    expect(status(host)).toBe(`GitHub: ${datumText('2026-11-20T08:00:00Z')} — inte hämtad hit`);
    // Samma knappar på en annan sida
    await klicka([...host.querySelectorAll('button.v3-nav')].find((b) => b.textContent === 'Resultat') as HTMLElement);
    expect(knapp(host, 'Spara till GitHub')).toBeDefined();
    expect(knapp(host, 'Hämta från GitHub')).toBeDefined();
  });

  it('Spara: frågar när GitHubs version inte finns här, sparar allt som en ny version och visar "samma här"', async () => {
    const lager: Sparad[] = [{ sha: 'c1', datum: '2026-11-20T08:00:00Z', message: 'x', json: '{"annat":1}' }];
    const anrop = github(lager);
    const host = await starta(bygg(['8A', '8B']));
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(fragor).toHaveLength(1);
    expect(fragor[0]).toContain(`På GitHub finns redan en version, sparad ${datumText('2026-11-20T08:00:00Z')}`);
    expect(fragor[0]).toContain('Den andra finns kvar under Versioner och kan återställas.');
    const put = anrop.filter((a) => a.metod === 'PUT');
    expect(put).toHaveLength(1);
    expect(put[0].body!.message).toBe(`Studio: sparat · ${versionsbeskrivning(lasStruktur())}`);
    expect(put[0].body!.message).toContain('2 klasser');
    expect(innehall(fromBase64(put[0].body!.content))).toEqual(innehall(exportJson(lasStruktur())));
    expect(lager.map((v) => v.sha)).toEqual(['c1', 'c2']);                 // den gamla versionen finns kvar
    expect(status(host)).toMatch(/^GitHub: i dag \d\d:\d\d · ✓ samma här$/);
    expect(host.querySelector('p.status')!.textContent).toContain('✓ Sparat till GitHub i dag');
    // En gång till direkt: ingen fråga (versionen är vår egen)
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(fragor).toHaveLength(1);
    expect(anrop.filter((a) => a.metod === 'PUT')).toHaveLength(2);
  });

  it('Avbryt i frågan: ingenting skrivs över', async () => {
    const lager: Sparad[] = [{ sha: 'c1', datum: '2026-11-20T08:00:00Z', message: 'x', json: '{"annat":1}' }];
    const anrop = github(lager);
    const host = await starta(bygg());
    svaraJa = false;
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(fragor).toHaveLength(1);
    expect(anrop.filter((a) => a.metod === 'PUT')).toHaveLength(0);
    expect(lager).toHaveLength(1);
  });

  it('en ändring i appen syns som osparad och Spara lyfts fram; efter sparning är läget "samma här" igen', async () => {
    const lager: Sparad[] = [];
    github(lager);
    const host = await starta(bygg());
    expect(status(host)).toBe('Inget sparat på GitHub än — tryck Spara');
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(fragor).toHaveLength(0);                                        // inget fanns att skriva över
    expect(status(host)).toMatch(/✓ samma här$/);
    expect(knapp(host, 'Spara till GitHub').classList.contains('viktig')).toBe(false);
    // Ändra något i appen: ångra-knappen finns inte än, så lägg till ett läsår via strukturen på Översikt
    await klicka([...host.querySelectorAll('button.v3-nav')].find((b) => b.textContent === 'Datarepo') as HTMLElement);
    expect(status(host)).toMatch(/✓ samma här$/);                          // att byta sida är ingen ändring
    act(() => { markeraOsparat(); });
    expect(status(host)).toMatch(/· ● ändrat här sedan i dag \d\d:\d\d — inte sparat$/);
    expect(knapp(host, 'Spara till GitHub').classList.contains('viktig')).toBe(true);
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(status(host)).toMatch(/✓ samma här$/);
    expect(lager).toHaveLength(2);
  });

  it('ny dator: appen är tom, Hämta lyfts fram och fyller appen utan fråga — och går att ångra', async () => {
    const lager: Sparad[] = [{ sha: 'c1', datum: '2026-11-24T15:24:00Z', message: 'Studio: sparat · 2 klasser · 0 elever · 0 resultat · 0 planeringar', json: exportJson(bygg(['8A', '8B'])) }];
    const anrop = github(lager);
    const host = await starta(null);
    expect(klasser()).toEqual([]);
    expect(status(host)).toBe(`GitHub: ${datumText('2026-11-24T15:24:00Z')} — tryck Hämta för att fylla appen`);
    expect(knapp(host, 'Hämta från GitHub').classList.contains('viktig')).toBe(true);
    // Spara på en tom app gör ingenting
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(anrop.filter((a) => a.metod === 'PUT')).toHaveLength(0);
    expect(host.querySelector('p.status')!.textContent).toContain('Appen är tom här');
    // Hämta fyller appen
    await klicka(knapp(host, 'Hämta från GitHub'));
    expect(fragor).toHaveLength(0);
    expect(klasser()).toEqual(['8A', '8B']);
    expect(status(host)).toBe(`GitHub: ${datumText('2026-11-24T15:24:00Z')} · ✓ samma här`);
    expect(host.querySelector('p.status')!.textContent).toContain('Hämtat från GitHub — versionen sparad');
    expect(lasOsparat()).toBeNull();
    // ↩ Ångra tar tillbaka det som fanns före hämtningen
    await klicka(host.querySelector('button[aria-label="Ångra"]') as HTMLElement);
    expect(klasser()).toEqual([]);
  });

  it('Hämta när det finns data här: frågar först och varnar för osparade ändringar; samma version hämtas inte igen', async () => {
    const lager: Sparad[] = [{ sha: 'c1', datum: '2026-11-24T15:24:00Z', message: 'x', json: exportJson(bygg(['8A', '8B'])) }];
    github(lager);
    const host = await starta(bygg(['8A']));
    act(() => { markeraOsparat(); });
    svaraJa = false;
    await klicka(knapp(host, 'Hämta från GitHub'));
    expect(fragor[0]).toContain(`Hämta den senaste versionen från GitHub (sparad ${datumText('2026-11-24T15:24:00Z')})?`);
    expect(fragor[0]).toContain('⚠ Här finns ändringar som inte är sparade till GitHub — de försvinner.');
    expect(fragor[0]).toContain('Du kan ångra direkt efteråt med ↩.');
    expect(klasser()).toEqual(['8A']);                                     // Avbryt: inget ändrat
    svaraJa = true;
    await klicka(knapp(host, 'Hämta från GitHub'));
    expect(klasser()).toEqual(['8A', '8B']);
    // Nu finns den senaste här: en ny tryckning hämtar inte igen
    await klicka(knapp(host, 'Hämta från GitHub'));
    expect(fragor).toHaveLength(2);
    expect(host.querySelector('p.status')!.textContent).toContain('Du har redan den senaste versionen från GitHub');
  });

  it('Versioner: listan visar datum och innehåll; en äldre version återställs här, och blir den senaste först när den sparas', async () => {
    const lager: Sparad[] = [
      { sha: 'c1', datum: '2026-11-20T08:00:00Z', message: 'Studio: sparat · 1 klasser · 0 elever · 0 resultat · 0 planeringar', json: exportJson(bygg(['8A'])) },
      { sha: 'c2', datum: '2026-11-22T15:24:00Z', message: 'Studio: uppdatera studio/struktur.json (2026-11-22T15:24:00.000Z)', json: exportJson(bygg(['8A', '8B'])) },
      { sha: 'c3', datum: '2026-11-24T15:24:00Z', message: 'Studio: sparat · 3 klasser · 0 elever · 0 resultat · 0 planeringar', json: exportJson(bygg(['8A', '8B', '8C'])) },
    ];
    const anrop = github(lager);
    const host = await starta(null);
    await klicka(knapp(host, 'Hämta från GitHub'));
    expect(klasser()).toEqual(['8A', '8B', '8C']);
    await klicka(knapp(host, 'Versioner'));
    const meny = host.querySelector('[role="dialog"][aria-label="Versioner på GitHub"]')!;
    const rader = [...meny.querySelectorAll('ol.gh-lista li')];
    expect(rader.map((li) => li.querySelector('.gh-datum')!.textContent)).toEqual(['2026-11-24T15:24:00Z', '2026-11-22T15:24:00Z', '2026-11-20T08:00:00Z'].map((d) => datumText(d)));
    expect(rader.map((li) => li.querySelector('.gh-text')!.textContent)).toEqual([
      'senastefinns här3 klasser · 0 elever · 0 resultat · 0 planeringar', 'utan beskrivning', '1 klasser · 0 elever · 0 resultat · 0 planeringar',
    ]);
    expect(rader.map((li) => li.querySelector('button')!.textContent)).toEqual(['Hämta', 'Återställ', 'Återställ']);
    expect((rader[0].querySelector('button') as HTMLButtonElement).disabled).toBe(true);        // den finns redan här
    // Återställ den äldsta
    await klicka(rader[2].querySelector('button') as HTMLElement);
    expect(fragor).toHaveLength(1);
    expect(fragor[0]).toContain(`Återställa versionen från ${datumText('2026-11-20T08:00:00Z')}?`);
    expect(fragor[0]).toContain('På GitHub ändras inget förrän du trycker Spara till GitHub');
    expect(klasser()).toEqual(['8A']);
    expect(anrop.filter((a) => a.metod === 'PUT')).toHaveLength(0);        // GitHub är orört
    expect(status(host)).toBe(`Här: återställd version från ${datumText('2026-11-20T08:00:00Z')} — inte sparad som senaste`);
    expect(knapp(host, 'Spara till GitHub').classList.contains('viktig')).toBe(true);
    expect(host.querySelector('[role="dialog"][aria-label="Versioner på GitHub"]')).toBeNull();
    // ↩ ångrar återställningen — då visas inte längre den återställda versionen
    await klicka(host.querySelector('button[aria-label="Ångra"]') as HTMLElement);
    expect(klasser()).toEqual(['8A', '8B', '8C']);
    expect(status(host)).toMatch(/^GitHub: .* · ● ändrat här sedan i dag \d\d:\d\d — inte sparat$/);
    // Återställ igen och spara: den återställda blir en ny senaste version, utan krockfråga, och alla äldre finns kvar
    await klicka(knapp(host, 'Versioner'));
    await klicka([...host.querySelectorAll('ol.gh-lista li')][2].querySelector('button') as HTMLElement);
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(fragor).toHaveLength(2);                                        // bara de två återställningsfrågorna
    expect(lager.map((v) => v.sha)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(innehall(lager[3].json)).toEqual(innehall(exportJson(lasStruktur())));
    expect(klasser()).toEqual(['8A']);
    expect(status(host)).toMatch(/^GitHub: i dag \d\d:\d\d · ✓ samma här$/);
  });

  it('en annan dator har sparat sedan sist: läget varnar och Spara frågar innan den versionen ersätts', async () => {
    const lager: Sparad[] = [];
    github(lager);
    const host = await starta(bygg(['8A']));
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(lager).toHaveLength(1);
    // Den andra datorn sparar
    lager.push({ sha: 'annan', datum: new Date(Date.now() + 60000).toISOString(), message: 'Studio: sparat · 2 klasser', json: exportJson(bygg(['8A', '8B'])) });
    act(() => { markeraOsparat(); });
    svaraJa = false;
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(fragor).toHaveLength(1);
    expect(fragor[0]).toContain('På GitHub finns en nyare version, sparad');
    expect(fragor[0]).toContain('från en annan dator eller webbläsare');
    expect(fragor[0]).toContain('Har du arbetat på en annan dator: välj Avbryt och tryck Hämta från GitHub först.');
    expect(lager).toHaveLength(2);                                         // Avbryt: inget skrevs
    expect(status(host)).toContain('från en annan dator · ● och ändrat här — inte sparat');
  });

  it('inte kopplat: knapparna leder till Datarepo med en förklaring; en nyckel utan skrivrätt ger ett tydligt fel', async () => {
    github([], { skrivskyddad: true });
    let host = await starta(bygg(), false);
    expect(status(host)).toBe('Inte kopplat till GitHub — fyll i nyckeln under Datarepo');
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(host.querySelector('p.status')!.textContent).toContain('GitHub är inte kopplat i den här webbläsaren');
    expect(host.querySelector('input[aria-label="Token"]')).not.toBeNull();                    // Datarepo-sidan visas
    act(() => rot!.unmount()); rot = null; document.body.innerHTML = '';
    host = await starta(bygg(), true);
    await klicka(knapp(host, 'Spara till GitHub'));
    expect(host.querySelector('p.status')!.textContent).toContain('Det gick inte att spara till GitHub: GitHub 403: nyckeln får inte skriva');
  });
});
