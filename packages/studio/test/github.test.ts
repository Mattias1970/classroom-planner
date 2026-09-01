import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fromBase64, hamtaBockerFranGitHub, konfigKomplett, laddaFranGitHub, sparaTillGitHub, toBase64, type GitHubConfig,
} from '../src/github.js';

const CFG: GitHubConfig = { owner: 'Mattias1970', repo: 'classroom-planner-data', branch: 'main', path: 'studio/struktur.json', token: 'tok' };

describe('github-synk', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('base64 klarar UTF-8 (åäö) tur och retur', () => {
    const t = 'Läsåret 2026/2027 — Fysik åk 8';
    expect(fromBase64(toBase64(t))).toBe(t);
  });

  it('konfigKomplett kräver owner, repo, path och token', () => {
    expect(konfigKomplett(CFG)).toBe(true);
    expect(konfigKomplett({ ...CFG, token: '' })).toBe(false);
    expect(konfigKomplett({ ...CFG, owner: '' })).toBe(false);
  });

  it('sparaTillGitHub uppdaterar en befintlig fil med dess sha', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ sha: 'abc123' }) }); // hamtaSha
    f.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });                   // PUT
    await sparaTillGitHub(CFG, '{"x":1}');
    expect(f).toHaveBeenCalledTimes(2);
    const [url, opts] = f.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/repos/Mattias1970/classroom-planner-data/contents/studio/struktur.json');
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body as string) as { sha?: string; content: string; branch: string };
    expect(body.sha).toBe('abc123');            // uppdaterar med sha
    expect(fromBase64(body.content)).toBe('{"x":1}');
    expect(body.branch).toBe('main');
  });

  it('sparaTillGitHub skapar ny fil när sha saknas (404)', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }); // hamtaSha → 404
    f.mockResolvedValueOnce({ ok: true, status: 201, text: async () => '' });     // PUT
    await sparaTillGitHub(CFG, '{}');
    const body = JSON.parse((f.mock.calls[1] as [string, RequestInit])[1].body as string) as { sha?: string };
    expect(body.sha).toBeUndefined();           // ingen sha ⇒ skapar
  });

  it('laddaFranGitHub dekodar filens innehåll', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ sha: 's' }) });                 // hamtaSha
    f.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ content: toBase64('{"ok":true}') }) }); // GET
    expect(await laddaFranGitHub(CFG)).toBe('{"ok":true}');
  });

  it('kastar tydligt fel när konfigurationen är ofullständig', async () => {
    await expect(sparaTillGitHub({ ...CFG, token: '' }, '{}')).rejects.toThrow('ofullständig');
  });
});

describe('hamtaBockerFranGitHub — bokdata ur books/', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const cfg = { owner: 'Mattias1970', repo: 'classroom-planner-data', branch: 'main', path: 'studio/planering.json', token: 'x' };
  const b64 = (t: string) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));

  it('hittar book.json rekursivt (books/ma/…, books/no/biologi/…) och hoppar över annat', async () => {
    const svar: Record<string, unknown> = {
      '?recursive=1': { tree: [
        { path: 'books/ma/liber-matematik-y/book.json', type: 'blob' },
        { path: 'books/no/biologi/spektrum-biologi/book.json', type: 'blob' },
        { path: 'books/no/biologi/spektrum-biologi/planeringar/2026-2027-8B.md', type: 'blob' },
        { path: 'books/README.md', type: 'blob' },
        { path: 'books/tk', type: 'tree' },
      ] },
      'books/ma/liber-matematik-y/book.json?ref=main': { content: b64('{"id":"y"}') },
      'books/no/biologi/spektrum-biologi/book.json?ref=main': { content: b64('{"id":"s"}') },
    };
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      const nyckel = Object.keys(svar).find((k) => url.endsWith(k));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(svar[nyckel ?? '']) });
    });
    const ut = await hamtaBockerFranGitHub(cfg);
    expect(ut.map((b) => b.id)).toEqual(['liber-matematik-y', 'spektrum-biologi']);   // mappen närmast book.json
    expect(ut[1].json).toBe('{"id":"s"}');
  });

  it('platta strukturen books/<bok-id>/book.json fungerar som förut', async () => {
    const svar: Record<string, unknown> = {
      '?recursive=1': { tree: [{ path: 'books/sanoma-prio-8/book.json', type: 'blob' }] },
      'books/sanoma-prio-8/book.json?ref=main': { content: b64('{"id":"p"}') },
    };
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      const nyckel = Object.keys(svar).find((k) => url.endsWith(k));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(svar[nyckel ?? '']) });
    });
    const ut = await hamtaBockerFranGitHub(cfg);
    expect(ut.map((b) => b.id)).toEqual(['sanoma-prio-8']);
  });

  it('tydligt fel när repot/branchen inte kan läsas', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 });
    await expect(hamtaBockerFranGitHub(cfg)).rejects.toThrow('branchen');
  });
});
