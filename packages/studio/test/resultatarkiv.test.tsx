// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bokFromImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { arkiveraFiler, hamtaArkivFil, laggVantandeFiler, listaArkiv, tagVantandeFiler, uppladdningsText } from '../src/resultatarkiv';
import { sparaGitHubConfig } from '../src/github';
import { lasStruktur, sparaStruktur } from '../src/store';

function bygg(): Struktur {
  const BOK = bokFromImport(JSON.stringify({ schema: 'classroom-planner-bok', version: 1, bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } }, lektioner: { '4': [{ id: 1, type: 'regular', avsnitt: '4.1 Liv', del: 1 }] } }));
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  return laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); sparaStruktur(bygg()); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Del 203 · resultatarkivet i UI-lagret', () => {
  it('utan GitHub-konfiguration registreras importen men inget laddas upp', async () => {
    const u = await arkiveraFiler('bi', 'socrative', [new File(['x'], 'Biologi41.xlsx')]);
    expect(u[0]).toMatchObject({ sokvag: 'resultat/ak8/8B/Biologi/socrative/Biologi41.xlsx' });
    expect(u[0].fel).toMatch(/ingen GitHub-konfiguration/);
    expect(lasStruktur().resultatArkiv).toEqual([{ sokvag: 'resultat/ak8/8B/Biologi/socrative/Biologi41.xlsx', filnamn: 'Biologi41.xlsx', amneId: 'bi', kalla: 'socrative', uppladdad: '', importerad: true }]);
    expect(uppladdningsText(u)).toContain('0 av 1 i datarepot');
  });

  it('med konfiguration laddas filen upp (PUT med base64) och registreras; listning och hämtning avkodar base64', async () => {
    sparaGitHubConfig({ owner: 'o', repo: 'classroom-planner-data', branch: 'main', path: 'studio/struktur.json', token: 't' });
    const anrop: Array<{ url: string; metod: string; body?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      anrop.push({ url, metod: init?.method ?? 'GET', ...(typeof init?.body === 'string' ? { body: init.body } : {}) });
      if (url.includes('/git/trees/')) return new Response(JSON.stringify({ tree: [{ path: 'resultat/ak8/8B/Biologi/socrative/Biologi41.xlsx', type: 'blob' }, { path: 'resultat/ak8/8B/Biologi/magma/x.xlsx', type: 'blob' }, { path: 'books/b/book.json', type: 'blob' }] }), { status: 200 });
      if (init?.method === 'PUT') return new Response('{}', { status: 201 });
      if (url.includes('/contents/') && url.includes('Biologi41')) return new Response(JSON.stringify({ content: btoa('hej'), encoding: 'base64' }), { status: 200 });
      return new Response('{}', { status: 404 });
    }));
    const u = await arkiveraFiler('bi', 'socrative', [new File(['hej'], 'Biologi41.xlsx')]);
    expect(u[0].fel).toBeNull();
    const put = anrop.find((a) => a.metod === 'PUT')!;
    expect(put.url).toContain('/contents/resultat/ak8/8B/Biologi/socrative/Biologi41.xlsx');
    expect(JSON.parse(put.body!).content).toBe(btoa('hej'));
    expect(lasStruktur().resultatArkiv![0].uppladdad).not.toBe('');
    expect(uppladdningsText(u)).toBe(' ☁ 1 fil i datarepot.');
    expect(await listaArkiv()).toEqual(['resultat/ak8/8B/Biologi/socrative/Biologi41.xlsx', 'resultat/ak8/8B/Biologi/magma/x.xlsx']);
    const fil = await hamtaArkivFil('resultat/ak8/8B/Biologi/socrative/Biologi41.xlsx');
    expect(fil.name).toBe('Biologi41.xlsx');
    expect(await fil.text()).toBe('hej');
    // Redan uppladdad fil laddas inte upp igen
    const fore = anrop.length;
    await arkiveraFiler('bi', 'socrative', [new File(['hej'], 'Biologi41.xlsx')]);
    expect(anrop.length).toBe(fore);
  });

  it('kön av väntande filer tas ut per ämne och källa', () => {
    laggVantandeFiler({ amneId: 'bi', klassId: 'k', kalla: 'socrative', filer: [new File(['a'], 'a.xlsx')] });
    laggVantandeFiler({ amneId: 'bi', klassId: 'k', kalla: 'magma', filer: [new File(['b'], 'b.xlsx')] });
    expect(tagVantandeFiler('bi', 'socrative').map((f) => f.name)).toEqual(['a.xlsx']);
    expect(tagVantandeFiler('bi', 'socrative')).toEqual([]);
    expect(tagVantandeFiler('bi', 'magma').map((f) => f.name)).toEqual(['b.xlsx']);
  });
});
