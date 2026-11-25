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
  /** Del 239 · Mappen på den här datorn där datarepot är klonat (valfritt) — bara för att visa var filerna ligger lokalt. */
  lokalMapp?: string;
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

/**
 * Del 264 · En sparad version på GitHub: varje gång strukturen sparas blir det en ny version (en commit på
 * filen), och de äldre finns kvar — därför går det att rulla tillbaka.
 */
export interface GitHubVersion {
  /** Versionens identitet (commitens sha). */
  sha: string;
  /** När versionen sparades (ISO). */
  datum: string;
  /** Vad den innehöll när den sparades ('2 klasser · 58 elever · …'), eller '' för äldre versioner utan beskrivning. */
  text: string;
}

/**
 * Del 264 · Vad den här webbläsaren senast sparade till eller hämtade från GitHub: vilken version, när och åt
 * vilket håll. Med den syns det om en annan dator har sparat sedan dess — då frågar appen innan något skrivs över.
 */
export interface GitHubSynk {
  /** Den version på GitHub som den här webbläsaren senast var överens med. */
  sha: string;
  /** När synken gjordes här (ISO). */
  tid: string;
  riktning: 'sparat' | 'hamtat';
  /** Satt när en ÄLDRE version har hämtats in (återställning): den versionens datum. */
  aterstalld?: string;
}
const SYNK_KEY = 'classroom-planner.studio.github.synk';
/** Tidpunkten för den första ändringen som inte är sparad till GitHub (ISO), eller inget när allt är sparat. */
const OSPARAT_KEY = 'classroom-planner.studio.github.osparat';
const synkLyssnare = new Set<() => void>();
let synkVersion = 0;
const synkAndrad = () => { synkVersion += 1; for (const cb of synkLyssnare) cb(); };
/** För useSyncExternalStore: knapparna ritas om när synkläget ändras, var det än sker i appen. */
export function prenumereraSynk(cb: () => void): () => void { synkLyssnare.add(cb); return () => { synkLyssnare.delete(cb); }; }
export function synkLage(): number { return synkVersion; }

export function lasSynk(): GitHubSynk | null {
  try {
    const raw = window.localStorage.getItem(SYNK_KEY);
    const v = raw === null ? null : (JSON.parse(raw) as Partial<GitHubSynk>);
    return v !== null && typeof v.sha === 'string' && typeof v.tid === 'string'
      ? { sha: v.sha, tid: v.tid, riktning: v.riktning === 'hamtat' ? 'hamtat' : 'sparat', ...(typeof v.aterstalld === 'string' ? { aterstalld: v.aterstalld } : {}) } : null;
  } catch { return null; }
}
function noteraSynk(synk: Omit<GitHubSynk, 'tid'> | null, osparat: boolean): void {
  try {
    if (synk === null) window.localStorage.removeItem(SYNK_KEY);
    else window.localStorage.setItem(SYNK_KEY, JSON.stringify({ ...synk, tid: new Date().toISOString() } satisfies GitHubSynk));
    if (osparat) window.localStorage.setItem(OSPARAT_KEY, new Date().toISOString()); else window.localStorage.removeItem(OSPARAT_KEY);
  } catch { /* ignoreras */ }
  synkAndrad();
}
export function lasOsparat(): string | null {
  try { return window.localStorage.getItem(OSPARAT_KEY); } catch { return null; }
}
/** Noterar att det finns ändringar som inte är sparade till GitHub (första gången efter en synk). */
export function markeraOsparat(): void {
  try { if (window.localStorage.getItem(OSPARAT_KEY) === null) { window.localStorage.setItem(OSPARAT_KEY, new Date().toISOString()); synkAndrad(); } } catch { /* ignoreras */ }
}

/**
 * En ändring har gjorts i appen: den är osparad, och det som visas är inte längre exakt en återställd
 * version (också ↩ Ångra efter en återställning är en sådan ändring).
 */
export function noteraAndring(): void {
  try {
    const synk = lasSynk();
    if (synk?.aterstalld !== undefined) {
      window.localStorage.setItem(SYNK_KEY, JSON.stringify({ sha: synk.sha, tid: synk.tid, riktning: synk.riktning } satisfies GitHubSynk));
      synkAndrad();
    }
  } catch { /* ignoreras */ }
  markeraOsparat();
}

/** Nästa ändring av strukturen i appen är en hämtning från GitHub — den räknas inte som en osparad ändring. */
let hamtningPagar = false;
export function tagHamtningsmarke(): boolean { const v = hamtningPagar; hamtningPagar = false; return v; }
/**
 * Anropas precis innan en hämtad version läggs in i appen. Är det den senaste är GitHub och den här
 * webbläsaren lika; är det en äldre (återställning) räknas den som osparad tills den sparas som ny senaste.
 */
export function bekraftaHamtning(version: GitHubVersion, senaste: GitHubVersion): void {
  hamtningPagar = true;
  const aldre = version.sha !== senaste.sha;
  noteraSynk({ sha: senaste.sha, riktning: 'hamtat', ...(aldre ? { aterstalld: version.datum } : {}) }, aldre);
}

export function konfigKomplett(cfg: GitHubConfig): boolean {
  return cfg.owner.trim() !== '' && cfg.repo.trim() !== '' && cfg.path.trim() !== '' && cfg.token.trim() !== '';
}

/** Del 239 · Adressen till en mapp ('tree') eller fil ('blob') i datarepot på github.com. */
export function githubLank(cfg: GitHubConfig, sokvag: string, typ: 'tree' | 'blob' = 'tree'): string {
  const led = sokvag.split('/').filter((x) => x !== '').map(encodeURIComponent).join('/');
  return `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${typ}/${encodeURIComponent(cfg.branch)}${led === '' ? '' : `/${led}`}`;
}

/** Del 239 · Samma sökväg i den lokala klonen (med datorns egna snedstreck), eller null när mappen inte är angiven. */
export function lokalSokvag(cfg: GitHubConfig, sokvag: string): string | null {
  const rot = (cfg.lokalMapp ?? '').trim().replace(/[\\/]+$/, '');
  if (rot === '') return null;
  const skilje = rot.includes('\\') || /^[A-Za-z]:/.test(rot) ? '\\' : '/';
  return `${rot}${skilje}${sokvag.split('/').join(skilje)}`;
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

/** Början på meddelandet för en sparning med beskrivning — resten är beskrivningen som visas i versionslistan. */
const SPARAT_FORLED = 'Studio: sparat · ';

/**
 * Del 264 · De sparade versionerna av strukturen på GitHub, nyast först (filens commits). Tom lista när
 * ingenting är sparat där än.
 */
export async function hamtaVersioner(cfg: GitHubConfig, antal = 30): Promise<GitHubVersion[]> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits?path=${encodeURIComponent(cfg.path)}&sha=${encodeURIComponent(cfg.branch)}&per_page=${antal}`, { headers: headers(cfg) });
  if (r.status === 404 || r.status === 409) return [];          // 409: tomt repo
  if (r.status === 401 || r.status === 403) throw new Error(`GitHub ${r.status}: nyckeln ger inte åtkomst till ${cfg.owner}/${cfg.repo} — kontrollera den under Datarepo.`);
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte läsa versionerna`);
  const lista = (await r.json()) as Array<{ sha?: string; commit?: { message?: string; committer?: { date?: string } } }>;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((c) => {
    const datum = c.commit?.committer?.date;
    if (typeof c.sha !== 'string' || typeof datum !== 'string') return [];
    const rad = (c.commit?.message ?? '').split('\n')[0];
    return [{ sha: c.sha, datum, text: rad.startsWith(SPARAT_FORLED) ? rad.slice(SPARAT_FORLED.length) : '' }];
  });
}

/** Del 264 · Strukturen som den såg ut i en viss version (också filer över 1 MB). */
export async function laddaVersion(cfg: GitHubConfig, version: GitHubVersion): Promise<string> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const r = await fetch(`${api(cfg)}?ref=${encodeURIComponent(version.sha)}`, { headers: headers(cfg) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte hämta versionen`);
  const data = (await r.json()) as { content?: string; encoding?: string; sha?: string; size?: number };
  const text = await innehallUr(cfg, data, cfg.path);
  if (text.trim() === '') throw new Error('Versionen är tom på GitHub.');
  return text;
}

/**
 * Sparar JSON till datarepot (skapar eller uppdaterar filen). Varje sparning blir en ny version; `beskrivning`
 * ('2 klasser · 58 elever …') följer med och visas i versionslistan. Returnerar den nya versionens sha när
 * GitHub anger den.
 */
export async function sparaTillGitHub(cfg: GitHubConfig, json: string, beskrivning?: string): Promise<string | null> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const sha = await hamtaSha(cfg);
  const body = {
    message: beskrivning !== undefined && beskrivning.trim() !== '' ? `${SPARAT_FORLED}${beskrivning.trim()}` : `Studio: uppdatera ${cfg.path} (${new Date().toISOString()})`,
    content: toBase64(json),
    branch: cfg.branch,
    ...(sha !== null ? { sha } : {}),
  };
  const r = await fetch(api(cfg), { method: 'PUT', headers: headers(cfg), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    // Del 264 · en nyckel som bara får läsa ger 403 — säg vad som behövs i stället för GitHubs råa svar
    if (r.status === 403 || r.status === 401) throw new Error(`GitHub ${r.status}: nyckeln får inte skriva till ${cfg.owner}/${cfg.repo}. Den behöver "Contents: Read and write" för datarepot — byt nyckel under Datarepo.`);
    throw new Error(`GitHub ${r.status}: ${t.slice(0, 120)}`);
  }
  // Del 264 · minns vilken version den här webbläsaren nu har gemensam med GitHub
  let nySha: string | null = null;
  try { nySha = ((await r.json()) as { commit?: { sha?: string } }).commit?.sha ?? null; } catch { nySha = null; }
  noteraSynk(nySha === null ? null : { sha: nySha, riktning: 'sparat' }, false);
  return nySha;
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

/** Del 203 · Laddar upp en binär fil (xlsx, pdf …) till datarepot. */
export async function sparaBinarFilTillGitHub(cfg: GitHubConfig, sokvag: string, bytes: ArrayBuffer): Promise<void> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${sokvag.split('/').map(encodeURIComponent).join('/')}`;
  const info = await fetch(`${url}?ref=${encodeURIComponent(cfg.branch)}`, { headers: headers(cfg) });
  const sha = info.status === 404 ? null : ((await info.json()) as { sha?: string }).sha ?? null;
  const u8 = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  const body = { message: `Resultatfil: ${sokvag} (${new Date().toISOString()})`, content: btoa(bin), branch: cfg.branch, ...(sha !== null ? { sha } : {}) };
  const r = await fetch(url, { method: 'PUT', headers: headers(cfg), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 120)}`);
}

/** Del 203 · Hämtar en binär fil ur datarepot. */
export async function hamtaBinarFilFranGitHub(cfg: GitHubConfig, sokvag: string): Promise<Uint8Array> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig.');
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${sokvag.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(cfg.branch)}`;
  const r = await fetch(url, { headers: headers(cfg) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte hämta ${sokvag}`);
  const data = (await r.json()) as { content?: string; encoding?: string; sha?: string };
  let b64 = data.content !== undefined && data.content !== '' && data.encoding !== 'none' ? data.content : null;
  if (b64 === null && data.sha !== undefined) {
    const rb = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/blobs/${data.sha}`, { headers: headers(cfg) });
    if (!rb.ok) throw new Error(`GitHub ${rb.status}: kunde inte hämta filinnehållet (blob).`);
    b64 = ((await rb.json()) as { content?: string }).content ?? null;
  }
  if (b64 === null) throw new Error(`GitHub lämnade tomt innehåll för ${sokvag}.`);
  const bin = atob(b64.replace(/\n/g, ''));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Del 203 · Sökvägarna i datarepot som matchar mönstret (utan att hämta innehållet). */
export async function listaFilerIGitHub(cfg: GitHubConfig, monster: RegExp): Promise<string[]> {
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig — fyll i ☁ GitHub först.');
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`;
  const r = await fetch(url, { headers: headers(cfg) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: kunde inte läsa repots filträd.`);
  const trad = (await r.json()) as { tree?: Array<{ path: string; type: string }> };
  return (trad.tree ?? []).filter((x) => x.type === 'blob' && monster.test(x.path)).map((x) => x.path);
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
