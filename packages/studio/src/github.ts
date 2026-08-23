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
export async function laddaFranGitHub(cfg: GitHubConfig): Promise<string> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const sha = await hamtaSha(cfg);
  if (sha === null) throw new Error('Filen finns inte i repot ännu — spara först.');
  const r = await fetch(`${api(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, { headers: headers(cfg) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte hämta filen`);
  const data = (await r.json()) as { content?: string };
  if (data.content === undefined) throw new Error('Oväntat svar från GitHub (ingen content).');
  return fromBase64(data.content);
}

export { toBase64, fromBase64 };
