/**
 * Studio-store: hela strukturen (skolår, lärare, tjänster, klasser, ämnen,
 * böcker, planeringar) persisteras som ETT dokument, med minnesfallback och
 * export/import för backup. All logik bor i kärnan — här finns bara läs/skriv.
 *
 * Del 254 · Dokumentet ligger i webbläsarens stora lagring (IndexedDB) när `startaLagring()` har körts —
 * det gör appen innan den ritas. Den lilla lagringen (localStorage, drygt 5 miljoner tecken) är kvar som
 * reserv för webbläsare utan stor lagring, och för inställningarna.
 */
import { useSyncExternalStore } from 'react';
import { saneraIdn, tomStruktur, uppdateraAmnesnamn, type Struktur } from '@planner/kernel';
import { bedOmSkydd, oppnaIndexedDb, webblasarensUtrymme, type Dokumentlager } from './storlagring.js';

const KEY = 'classroom-planner.studio.v2';
const mem = new Map<string, string>();

function lsGet(k: string): string | null {
  // localStorage är sanningen när den fungerar (även null); minnet är
  // enbart fallback när lagring kastar (t.ex. privat läge).
  try { return window.localStorage.getItem(k); }
  catch { return mem.get(k) ?? null; }
}
/** Skriver till lagringen. false = webbläsaren tog inte emot värdet (lagringen är full eller avstängd). */
function lsSet(k: string, v: string): boolean {
  mem.set(k, v);
  try { window.localStorage.setItem(k, v); return true; } catch { return false; }
}

// ── Del 241 · Strukturen hålls i minnet ───────────────────────────────────────────────────
// lasStruktur() anropas från ett par hundra ställen, ofta flera gånger per klick. Förut tolkades hela
// JSON-dokumentet om varje gång (och skrevs ut två gånger för att jämföras) — flera megabyte per anrop.
// Nu lämnas samma objekt ut så länge lagringens innehåll är oförändrat: en textjämförelse i stället för
// en tolkning. Att objektet är detsamma gör också att kärnans cachar (som sitter på objekten) träffar.
//
// `ra` är lagringens innehåll när objektet lästes eller sparades. Ändras lagringen från annat håll (en
// annan flik, en återställd backup) stämmer `ra` inte längre och dokumentet tolkas om.
let minne: { ra: string | null; s: Struktur; kontroll?: string } | null = null;
const FRYS = () => (globalThis as { __cpFrysDelat?: boolean }).__cpFrysDelat === true;

function minns(ra: string | null, s: Struktur): Struktur {
  // I testerna sparas ett avtryck, så att den som ändrar i den delade strukturen på plats avslöjas vid nästa läsning
  minne = FRYS() ? { ra, s, kontroll: JSON.stringify(s) } : { ra, s };
  return s;
}

// ── Del 241 · Sparfel: lagringen tog inte emot strukturen ─────────────────────────────────
/** `stor`: felet kom från den stora lagringen (disken är full eller webbläsaren vägrar) — inte 5-miljonersgränsen. */
export interface Sparfel { tecken: number; stor?: true }
let sparfel: Sparfel | null = null;
const sparfelLyssnare = new Set<() => void>();
function sattSparfel(v: Sparfel | null): void {
  if ((v === null) === (sparfel === null) && v?.tecken === sparfel?.tecken && v?.stor === sparfel?.stor) return;
  sparfel = v; for (const l of sparfelLyssnare) l();
}
/** Senaste sparningen gick inte att skriva till webbläsarens lagring (null = allt är sparat). */
export function useSparfel(): Sparfel | null {
  return useSyncExternalStore((cb) => { sparfelLyssnare.add(cb); return () => sparfelLyssnare.delete(cb); }, () => sparfel, () => sparfel);
}
/** Ungefärlig gräns för webbläsarens lagring per adress (Chrome, Edge och Firefox: drygt 5 miljoner tecken). */
export const LAGRINGSGRANS_TECKEN = 5_200_000;
/** Hur mycket av webbläsarens lagring strukturen tar (tecken) — för mätaren under Datarepo. */
export function lagradeTecken(): number {
  return stor !== null ? stor.tecken : (lsGet(KEY) ?? '').length;
}

// ── Del 254 · Den stora lagringen ─────────────────────────────────────────────────────────
// När den är igång är MINNET sanningen under sessionen: lasStruktur() lämnar ut objektet direkt och
// sparaStruktur() byter det och skriver ut det till IndexedDB i bakgrunden (sist vinner, flera sparningar
// i samma klick blir en skrivning). Andra flikar får veta via en kanal och läser om.
const DOK = 'struktur';
const STAMPEL = 'stampel';
const RESERV = 'reserv:';
/** Så många undanlagda kopior sparas (äldsta tas bort). */
const MAX_RESERVER = 3;

/** Meddelanden mellan appens flikar (BroadcastChannel i webbläsaren). */
export interface Kanal { skicka(m: string): void; lyssna(cb: (m: string) => void): void }

let stor: { lager: Dokumentlager; kanal: Kanal | null; stampel: string; tecken: number } | null = null;
let smutsig = false;
let planerad = false;
let skriver = false;
let vilar: Array<() => void> = [];
const strukturLyssnare = new Set<() => void>();
let stampelNr = 0;
const nyStampel = (): string => `${Date.now().toString(36)}-${(stampelNr++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Anropas när strukturen bytts från annat håll (en annan flik sparade) — läs om med lasStruktur(). */
export function prenumereraStruktur(cb: () => void): () => void {
  strukturLyssnare.add(cb);
  return () => { strukturLyssnare.delete(cb); };
}
/** true = strukturen ligger i den stora lagringen (IndexedDB), false = den lilla (localStorage). */
export function storLagring(): boolean { return stor !== null; }
/** Löses när allt som sparats har skrivits ut till lagringen (direkt om inget väntar). */
export function vantaPaLagring(): Promise<void> {
  if (!smutsig && !planerad && !skriver) return Promise.resolve();
  return new Promise((resolve) => { vilar.push(resolve); });
}
function slappVilande(): void {
  if (smutsig || planerad || skriver) return;
  const v = vilar; vilar = []; for (const f of v) f();
}

function planeraSkrivning(): void {
  smutsig = true;
  if (planerad) return;
  planerad = true;
  // Mikrouppgift: skrivningen går iväg när klicket är färdigbehandlat, inte en stund senare
  queueMicrotask(() => { planerad = false; void skrivUt(); });
}
async function skrivUt(): Promise<void> {
  if (skriver || stor === null) { slappVilande(); return; }
  skriver = true;
  try {
    while (smutsig && stor !== null && minne !== null) {
      smutsig = false;
      const text = JSON.stringify(minne.s);
      const st = nyStampel();
      try {
        await stor.lager.skriv([[DOK, text], [STAMPEL, st]]);
        stor.stampel = st; stor.tecken = text.length;
        sattSparfel(null);
        try { stor.kanal?.skicka(st); } catch { /* de andra flikarna ser det när de får fokus */ }
      } catch {
        // Den stora lagringen tog inte emot dokumentet (disken full eller webbläsaren vägrar). Minnet gäller
        // resten av sessionen och felet visas; nästa sparning försöker igen.
        sattSparfel({ tecken: text.length, stor: true });
      }
    }
  } finally { skriver = false; slappVilande(); }
}

/** En annan flik har sparat: läs om dokumentet — om inte den här fliken själv har osparat på väg ut. */
async function laddaOm(): Promise<void> {
  // …eller har något som inte gick att spara: då är minnet det enda stället där det finns
  if (stor === null || smutsig || planerad || skriver || sparfel !== null) return;
  try {
    const [text, st] = await stor.lager.las([DOK, STAMPEL]);
    if (stor === null || smutsig || planerad || skriver || sparfel !== null) return;
    if (typeof text !== 'string' || typeof st !== 'string' || st === stor.stampel) return;
    const tolkad = tolka(text);
    if (tolkad === null) return;
    stor.stampel = st; stor.tecken = text.length;
    minns(null, tolkad.s);
    for (const l of strukturLyssnare) l();
  } catch { /* läsningen gick inte — fliken behåller det den har */ }
}
async function kollaStampel(): Promise<void> {
  if (stor === null) return;
  try {
    const [st] = await stor.lager.las([STAMPEL]);
    if (stor !== null && typeof st === 'string' && st !== stor.stampel) await laddaOm();
  } catch { /* nästa fokus försöker igen */ }
}

function webblasarKanal(): Kanal | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    const k = new BroadcastChannel('classroom-planner.studio');
    return { skicka: (m) => k.postMessage(m), lyssna: (cb) => { k.onmessage = (e: MessageEvent) => { if (typeof e.data === 'string') cb(e.data); }; } };
  } catch { return null; }
}
/** Lokal tid som 2026-11-16T00:21:05 — den står i listan över undanlagda kopior. */
const datumstampel = (): string => {
  const d = new Date(); const tva = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${tva(d.getMonth() + 1)}-${tva(d.getDate())}T${tva(d.getHours())}:${tva(d.getMinutes())}:${tva(d.getSeconds())}`;
};

/** Lägger undan en kopia (äldre innehåll som inte längre gäller) och håller antalet kopior nere. */
async function laggUndan(lager: Dokumentlager, text: string, extra: Array<[string, unknown]> = []): Promise<void> {
  const gamla = (await lager.nycklar()).filter((n) => n.startsWith(RESERV)).sort();
  let nyckel = `${RESERV}${datumstampel()}`;
  for (let i = 2; gamla.includes(nyckel); i++) nyckel = `${RESERV}${datumstampel()}-${i}`;
  await lager.skriv([...extra, [nyckel, text]], gamla.slice(0, Math.max(0, gamla.length + 1 - MAX_RESERVER)));
}

/**
 * Del 254 · Sätter igång den stora lagringen. Körs en gång innan appen ritas (main.tsx).
 *
 * - Finns dokumentet redan där gäller det.
 * - Annars flyttas det som ligger i den lilla lagringen över: skrivs, läses tillbaka och jämförs tecken för
 *   tecken — först därefter tas det bort ur den lilla lagringen. En kopia läggs undan som reserv.
 * - Går något fel, eller saknar webbläsaren stor lagring, gäller den lilla lagringen precis som förut.
 *
 * Ger aldrig något fel ifrån sig.
 */
export async function startaLagring(val: { lager?: Dokumentlager | null; kanal?: Kanal | null } = {}): Promise<void> {
  if (stor !== null) return;
  try {
    const lager = val.lager !== undefined ? val.lager : await oppnaIndexedDb();
    if (lager === null) return;
    const [sparad, sparadStampel] = await lager.las([DOK, STAMPEL]);
    let lilla: string | null = null;
    try { lilla = window.localStorage.getItem(KEY); } catch { lilla = null; }
    let text: string | null = typeof sparad === 'string' ? sparad : null;
    let stampel = typeof sparadStampel === 'string' ? sparadStampel : nyStampel();
    if (text === null && lilla !== null) {
      // Flytten: skriv, läs tillbaka, jämför. Stämmer det inte rörs ingenting.
      stampel = nyStampel();
      await laggUndan(lager, lilla, [[DOK, lilla], [STAMPEL, stampel]]);
      const [tillbaka] = await lager.las([DOK]);
      if (tillbaka !== lilla) return;
      text = lilla;
    } else if (text !== null && lilla !== null && lilla !== text) {
      // En äldre version av appen har sparat i den lilla lagringen efter flytten: lägg undan det, rör inte dokumentet
      await laggUndan(lager, lilla);
    }
    const tolkad = text === null ? { s: tomStruktur(), andrad: false } : tolka(text);
    if (tolkad === null) {
      // Dokumentet går inte att läsa: lägg undan det innan något nytt skrivs över det
      await laggUndan(lager, text!);
    }
    const kanal = val.kanal !== undefined ? val.kanal : webblasarKanal();
    stor = { lager, kanal, stampel, tecken: (text ?? '').length };
    minns(null, tolkad?.s ?? tomStruktur());
    sattSparfel(null);
    // Nu är den stora lagringen sanningen — först nu töms den lilla, så att inställningarna får plats igen
    if (lilla !== null) { try { window.localStorage.removeItem(KEY); } catch { /* ligger kvar, läggs undan nästa start */ } }
    mem.delete(KEY);
    if (tolkad?.andrad === true) planeraSkrivning();
    kanal?.lyssna((st) => { if (stor !== null && st !== stor.stampel) void laddaOm(); });
    try {
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void kollaStampel(); });
    } catch { /* ingen sida att lyssna på */ }
    bedOmSkydd();
  } catch { /* den lilla lagringen gäller som förut */ }
}

// Under utveckling (npm run dev) byter Vite ut moduler under gång. Byts den här — eller kärnan den bygger på —
// får den nya kopian inget veta om den stora lagringen och appen skulle se tom ut. Då laddas sidan om i stället:
// den läser allt ur lagringen igen. Gäller bara utvecklingsläget; i den byggda appen finns inget `hot`.
if (import.meta.hot) import.meta.hot.accept(() => { if (stor !== null) window.location.reload(); });

/** En undanlagd kopia: innehållet som låg i den lilla lagringen vid flytten, eller ett dokument som inte gick att läsa. */
export interface Reservkopia { nyckel: string; datum: string; tecken: number }
/** Läget i webbläsarens lagring — för mätaren under Datarepo. */
export interface Lagringsinfo {
  stor: boolean; tecken: number;
  /** Byte som adressen använder respektive får använda enligt webbläsaren (null = webbläsaren säger inget). */
  anvant: number | null; utrymme: number | null;
  /** Webbläsaren har lovat att inte rensa datan när disken blir trång. */
  skyddad: boolean | null;
  reserver: Reservkopia[];
}
export async function lagringsinfo(): Promise<Lagringsinfo> {
  const bas = { stor: stor !== null, tecken: lagradeTecken() };
  if (stor === null) return { ...bas, anvant: null, utrymme: null, skyddad: null, reserver: [] };
  const u = await webblasarensUtrymme();
  let reserver: Reservkopia[] = [];
  try {
    const nycklar = (await stor.lager.nycklar()).filter((n) => n.startsWith(RESERV)).sort();
    const varden = await stor.lager.las(nycklar);
    reserver = nycklar.map((nyckel, i) => ({ nyckel, datum: nyckel.slice(RESERV.length, RESERV.length + 19), tecken: typeof varden[i] === 'string' ? (varden[i] as string).length : 0 }));
  } catch { reserver = []; }
  return { ...bas, ...u, reserver };
}
/** Texten i en undanlagd kopia (null = finns inte). */
export async function lasReservkopia(nyckel: string): Promise<string | null> {
  if (stor === null || !nyckel.startsWith(RESERV)) return null;
  try { const [v] = await stor.lager.las([nyckel]); return typeof v === 'string' ? v : null; } catch { return null; }
}
/** En undanlagd kopia som backupfil (samma format som ⬇ Backup), så att den kan läsas in med Återställ. Kastar om texten inte går att läsa. */
export function reservSomBackup(text: string): string {
  return exportJson({ ...tomStruktur(), ...(JSON.parse(text) as Struktur) });
}
export async function taBortReservkopia(nyckel: string): Promise<void> {
  if (stor === null || !nyckel.startsWith(RESERV)) return;
  try { await stor.lager.skriv([], [nyckel]); } catch { /* ligger kvar */ }
}

/** Tolkar ett lagrat dokument. null = går inte att läsa. `andrad`: saneringen ändrade något som ska sparas. */
function tolka(raw: string): { s: Struktur; andrad: boolean } | null {
  try {
    const inlast = { ...tomStruktur(), ...(JSON.parse(raw) as Struktur) };
    // saneraIdn: äldre sessioner kunde ge dubblett-id:n (t.ex. två ämnen med
    // samma id) — då markeras/öppnas fel ämne i trädet. Dubbletter döps om,
    // och resultatet SPARAS direkt: annars får dubbletterna nya id:n vid varje
    // läsning, vald-id:t pekar fel och panelen blir blank.
    // Del 243: ämnen som bytt namn ('Matematik spec' → 'MaNOTk-stöd') döps om och sparas direkt
    const ren = uppdateraAmnesnamn(saneraIdn(inlast));
    return { s: ren, andrad: JSON.stringify(ren) !== JSON.stringify(inlast) };
  } catch { return null; }
}

/** Liten JSON-inställning vid sidan av strukturen, t.ex. vilka trädnoder som är öppna. */
export function lasInstallning<T>(nyckel: string, standard: T): T {
  const raw = lsGet(nyckel);
  if (raw === null) return standard;
  try { return JSON.parse(raw) as T; } catch { return standard; }
}

export function sparaInstallning(nyckel: string, varde: unknown): void {
  lsSet(nyckel, JSON.stringify(varde));
}

export function lasStruktur(): Struktur {
  if (stor !== null) {
    // Del 254: den stora lagringen är igång — minnet är sanningen under sessionen
    if (minne === null) return minns(null, tomStruktur());
    if (minne.kontroll !== undefined && JSON.stringify(minne.s) !== minne.kontroll) {
      throw new Error('lasStruktur(): den delade strukturen har ändrats på plats — returnera en kopia i stället (se store.ts, Del 241).');
    }
    return minne.s;
  }
  const raw = lsGet(KEY);
  if (minne !== null && raw === minne.ra) {
    if (minne.kontroll !== undefined && JSON.stringify(minne.s) !== minne.kontroll) {
      throw new Error('lasStruktur(): den delade strukturen har ändrats på plats — returnera en kopia i stället (se store.ts, Del 241).');
    }
    return minne.s;
  }
  if (raw === null) { minne = null; return tomStruktur(); }
  const tolkad = tolka(raw);
  if (tolkad === null) { minne = null; return tomStruktur(); }
  if (tolkad.andrad) { lsSet(KEY, JSON.stringify(tolkad.s)); return minns(lsGet(KEY), tolkad.s); }
  return minns(raw, tolkad.s);
}

export function sparaStruktur(s: Struktur): void {
  if (stor !== null) { minns(null, s); planeraSkrivning(); return; }
  const text = JSON.stringify(s);
  if (lsSet(KEY, text)) { minns(text, s); sattSparfel(null); return; }
  // Lagringen tog inte emot strukturen (full). Minnet gäller resten av sessionen — annars skulle nästa
  // läsning ge den äldre, lagrade versionen och det senast gjorda försvinna utan ett ord — och felet visas.
  minns(lsGet(KEY), s);
  sattSparfel({ tecken: text.length });
}

export function exportJson(s: Struktur): string {
  return JSON.stringify({ schema: 'classroom-planner-studio', version: 2, struktur: s, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJson(text: string): Struktur {
  const raw = JSON.parse(text) as { schema?: string; struktur?: Struktur };
  if (raw.schema !== 'classroom-planner-studio' || !raw.struktur) {
    throw new Error('Filen är inte en Studio-backup (schema "classroom-planner-studio").');
  }
  return uppdateraAmnesnamn({ ...tomStruktur(), ...raw.struktur });
}
