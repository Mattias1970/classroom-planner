/**
 * GitHub-synk (studio): sparar och laddar hela strukturen som en JSON-fil i
 * planner-data-repot via GitHub Contents API. Detta ligger utanför kärnan
 * (I2: kärnan är fri från fetch) — här bor nätverkslagret.
 *
 * Konfigurationen (owner/repo/gren/sökväg/token) lagras i localStorage. Token
 * är användarens egen fine-grained PAT med Contents: Read and write, scopad
 * till datarepot. Den lämnar aldrig webbläsaren annat än till api.github.com.
 */
export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
}

const CFG_KEY = 'classroom-planner.studio.github';

export function lasGitHubConfig(): GitHubConfig {
  const tom: GitHubConfig = { owner: '', repo: 'classroom-planner-data', branch: 'main', path: 'studio/struktur.json', token: '' };
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    return raw === null ? tom : { ...tom, ...(JSON.parse(raw) as Partial<GitHubConfig>) };
  } catch { return tom; }
}

export function sparaGitHubConfig(cfg: GitHubConfig): void {
  try { window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignoreras */ }
}

export function konfigKomplett(cfg: GitHubConfig): boolean {
  return cfg.owner.trim() !== '' && cfg.repo.trim() !== '' && cfg.path.trim() !== '' && cfg.token.trim() !== '';
}

function api(cfg: GitHubConfig): string {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
}
function headers(cfg: GitHubConfig): HeadersInit {
  return { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' };
}

/** UTF-8-säker base64 (åäö i JSON). */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Hämtar filens nuvarande sha (krävs för att uppdatera), eller null om den saknas. */
export async function hamtaSha(cfg: GitHubConfig): Promise<string | null> {
  const r = await fetch(`${api(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, { headers: headers(cfg) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte läsa filinfo`);
  const data = (await r.json()) as { sha?: string };
  return data.sha ?? null;
}

/** Sparar JSON till datarepot (skapar eller uppdaterar filen). */
export async function sparaTillGitHub(cfg: GitHubConfig, json: string): Promise<void> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const sha = await hamtaSha(cfg);
  const body = {
    message: `Studio: uppdatera ${cfg.path} (${new Date().toISOString()})`,
    content: toBase64(json),
    branch: cfg.branch,
    ...(sha !== null ? { sha } : {}),
  };
  const r = await fetch(api(cfg), { method: 'PUT', headers: headers(cfg), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub ${r.status}: ${t.slice(0, 120)}`);
  }
}

/** Laddar JSON från datarepot; kastar om filen saknas. */
/**
 * Contents-API:t lämnar `content` tomt för filer över 1 MB (med
 * encoding 'none'). Då hämtas innehållet via blobs-API:t, som klarar
 * upp till 100 MB. Strukturen växer förbi 1 MB så fort frågesvar och
 * QR-bilder finns med — därför gick 'Ladda från GitHub' sönder med
 * 'Unexpected end of JSON input'.
 */
async function hamtaBlob(cfg: GitHubConfig, sha: string): Promise<string> {
  const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/blobs/${sha}`, { headers: headers(cfg) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte hämta filinnehållet (blob).`);
  const data = (await r.json()) as { content?: string; encoding?: string };
  if (data.content === undefined || data.content === '') throw new Error('GitHub lämnade tomt innehåll för filen.');
  return data.encoding === 'base64' ? fromBase64(data.content) : data.content;
}

/** Läser innehållet ur ett contents-svar, med blobs-API:t som reserv för stora filer. */
async function innehallUr(cfg: GitHubConfig, data: { content?: string; encoding?: string; sha?: string; size?: number }, sokvag: string): Promise<string> {
  if (data.content !== undefined && data.content !== '' && data.encoding !== 'none') return fromBase64(data.content);
  if (data.sha !== undefined) return hamtaBlob(cfg, data.sha);
  throw new Error(`Oväntat svar från GitHub för ${sokvag} (varken innehåll eller sha).`);
}

export async function laddaFranGitHub(cfg: GitHubConfig): Promise<string> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const sha = await hamtaSha(cfg);
  if (sha === null) throw new Error(`Filen ${cfg.path} finns inte i repot ännu — spara från den dator som har datan först.`);
  const r = await fetch(`${api(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, { headers: headers(cfg) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte hämta filen`);
  const data = (await r.json()) as { content?: string; encoding?: string; sha?: string; size?: number };
  const text = await innehallUr(cfg, data, cfg.path);
  if (text.trim() === '') throw new Error(`Filen ${cfg.path} är tom i repot.`);
  return text;
}

export { toBase64, fromBase64 };

/** Generisk fil-läsning på valfri sökväg i samma repo/gren. */
async function hamtaFilInnehall(cfg: GitHubConfig, sokvag: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${sokvag}?ref=${encodeURIComponent(cfg.branch)}`;
  const r = await fetch(url, { headers: headers(cfg) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte hämta ${sokvag}`);
  const data = (await r.json()) as { content?: string; encoding?: string; sha?: string; size?: number };
  return innehallUr(cfg, data, sokvag);
}

/**
 * Listar och hämtar alla böcker ur datarepots books/-katalog
 * (books/<bok-id>/book.json). Returnerar [bok-id → JSON-text].
 */
/**
 * Hittar alla book.json under books/ på VALFRIT djup via git trees-API:t
 * (ett anrop), så att repot kan organiseras t.ex. books/ma/…, books/no/biologi/….
 * Bokens id = mappen närmast book.json (books/no/biologi/spektrum-biologi/ → spektrum-biologi).
 */
export async function hamtaBockerFranGitHub(cfg: GitHubConfig): Promise<Array<{ id: string; json: string }>> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig — fyll i ☁ GitHub först.');
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`;
  const r = await fetch(url, { headers: headers(cfg) });
  if (r.status === 404) throw new Error('Hittade inte repot eller branchen — kontrollera ☁ GitHub-inställningarna.');
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte läsa repots filträd.`);
  const trad = (await r.json()) as { tree?: Array<{ path: string; type: string }> };
  const sokvagar = (trad.tree ?? [])
    .filter((t) => t.type === 'blob' && /^books\/.+\/book\.json$/.test(t.path))
    .map((t) => t.path)
    .sort((a, b) => a.localeCompare(b, 'sv'));
  const ut: Array<{ id: string; json: string }> = [];
  for (const sokvag of sokvagar) {
    const json = await hamtaFilInnehall(cfg, sokvag);
    if (json !== null) {
      const delar = sokvag.split('/');
      ut.push({ id: delar[delar.length - 2], json });
    }
  }
  if (ut.length === 0) throw new Error("Inga book.json hittades under books/ (valfritt djup: books/ma/…, books/no/biologi/… fungerar).");
  return ut;
}


/** Sparar valfri fil i datarepot (skapar eller uppdaterar) — t.ex. rapportmallar/<id>.json. */
export async function sparaFilTillGitHub(cfg: GitHubConfig, sokvag: string, innehall: string): Promise<void> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${sokvag}`;
  const info = await fetch(`${url}?ref=${encodeURIComponent(cfg.branch)}`, { headers: headers(cfg) });
  const sha = info.status === 404 ? null : ((await info.json()) as { sha?: string }).sha ?? null;
  const body = { message: `Studio: ${sokvag} (${new Date().toISOString()})`, content: toBase64(innehall), branch: cfg.branch, ...(sha !== null ? { sha } : {}) };
  const r = await fetch(url, { method: 'PUT', headers: headers(cfg), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 120)}`);
}

/** Hämtar alla filer i datarepot vars sökväg matchar mönstret. */
export async function hamtaFilerFranGitHub(cfg: GitHubConfig, monster: RegExp): Promise<Array<{ sokvag: string; json: string }>> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig — fyll i ☁ GitHub först.');
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`;
  const r = await fetch(url, { headers: headers(cfg) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte läsa repots filträd.`);
  const trad = (await r.json()) as { tree?: Array<{ path: string; type: string }> };
  const ut: Array<{ sokvag: string; json: string }> = [];
  for (const t of (trad.tree ?? []).filter((x) => x.type === 'blob' && monster.test(x.path))) {
    const json = await hamtaFilInnehall(cfg, t.path);
    if (json !== null) ut.push({ sokvag: t.path, json });
  }
  return ut;
}

/** Anslutningstest: vem tokenen är, om repot nås och vilka filer som finns (böcker, struktur, mallar). */
export async function testaAnslutning(cfg: GitHubConfig): Promise<{ anvandare: string | null; repo: string; bocker: string[]; struktur: boolean; mallar: number; fel: string | null }> {
  const ut = { anvandare: null as string | null, repo: `${cfg.owner}/${cfg.repo}@${cfg.branch}`, bocker: [] as string[], struktur: false, mallar: 0, fel: null as string | null };
  if (!konfigKomplett(cfg)) { ut.fel = 'Fyll i ägare, repo, gren, sökväg och token.'; return ut; }
  try {
    const me = await fetch('https://api.github.com/user', { headers: headers(cfg) });
    if (me.status === 401) { ut.fel = 'Tokenen avvisas (401). Skapa en ny fine-grained PAT med Contents: Read and write på datarepot.'; return ut; }
    if (me.ok) ut.anvandare = ((await me.json()) as { login?: string }).login ?? null;
    const tr = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`, { headers: headers(cfg) });
    if (tr.status === 404) { ut.fel = `Repot ${cfg.owner}/${cfg.repo} eller grenen ${cfg.branch} hittas inte — eller så saknar tokenen åtkomst till just det repot.`; return ut; }
    if (tr.status === 403) { ut.fel = 'Åtkomst nekad (403). Tokenen behöver rättigheten Contents på datarepot.'; return ut; }
    if (!tr.ok) { ut.fel = `GitHub svarade ${tr.status} när filträdet lästes.`; return ut; }
    const trad = (await tr.json()) as { tree?: Array<{ path: string; type: string }>; truncated?: boolean };
    const filer = (trad.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path);
    ut.bocker = filer.filter((p) => /^books\/.+\/book\.json$/.test(p));
    ut.struktur = filer.includes(cfg.path);
    ut.mallar = filer.filter((p) => /^rapportmallar\/.+\.json$/.test(p)).length;
    if (trad.truncated === true) ut.fel = 'Filträdet är för stort för ett anrop — böcker kan saknas i listan.';
  } catch (e) {
    ut.fel = `Nätverksfel: ${e instanceof Error ? e.message : String(e)}. Blockerar nätverket api.github.com?`;
  }
  return ut;
}
