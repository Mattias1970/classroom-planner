/**
 * Studio-store: hela strukturen (skolår, lärare, tjänster, klasser, ämnen,
 * böcker, planeringar) persisteras som ETT dokument i localStorage, med
 * minnesfallback och export/import för backup. All logik bor i kärnan —
 * här finns bara läs/skriv.
 */
import { useSyncExternalStore } from 'react';
import { saneraIdn, tomStruktur, uppdateraAmnesnamn, type Struktur } from '@planner/kernel';

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
let sparfel: { tecken: number } | null = null;
const sparfelLyssnare = new Set<() => void>();
function sattSparfel(v: { tecken: number } | null): void {
  if ((v === null) === (sparfel === null) && v?.tecken === sparfel?.tecken) return;
  sparfel = v; for (const l of sparfelLyssnare) l();
}
/** Senaste sparningen gick inte att skriva till webbläsarens lagring (null = allt är sparat). */
export function useSparfel(): { tecken: number } | null {
  return useSyncExternalStore((cb) => { sparfelLyssnare.add(cb); return () => sparfelLyssnare.delete(cb); }, () => sparfel, () => sparfel);
}
/** Ungefärlig gräns för webbläsarens lagring per adress (Chrome, Edge och Firefox: drygt 5 miljoner tecken). */
export const LAGRINGSGRANS_TECKEN = 5_200_000;
/** Hur mycket av webbläsarens lagring strukturen tar (tecken) — för mätaren under Datarepo. */
export function lagradeTecken(): number {
  return (lsGet(KEY) ?? '').length;
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
  const raw = lsGet(KEY);
  if (minne !== null && raw === minne.ra) {
    if (minne.kontroll !== undefined && JSON.stringify(minne.s) !== minne.kontroll) {
      throw new Error('lasStruktur(): den delade strukturen har ändrats på plats — returnera en kopia i stället (se store.ts, Del 241).');
    }
    return minne.s;
  }
  if (raw === null) { minne = null; return tomStruktur(); }
  try {
    const inlast = { ...tomStruktur(), ...(JSON.parse(raw) as Struktur) };
    // saneraIdn: äldre sessioner kunde ge dubblett-id:n (t.ex. två ämnen med
    // samma id) — då markeras/öppnas fel ämne i trädet. Dubbletter döps om,
    // och resultatet SPARAS direkt: annars får dubbletterna nya id:n vid varje
    // läsning, vald-id:t pekar fel och panelen blir blank.
    // Del 243: ämnen som bytt namn ('Matematik spec' → 'MaNOTk-stöd') döps om och sparas direkt
    const ren = uppdateraAmnesnamn(saneraIdn(inlast));
    const renText = JSON.stringify(ren);
    if (renText !== JSON.stringify(inlast)) { lsSet(KEY, renText); return minns(lsGet(KEY), ren); }
    return minns(raw, ren);
  } catch { minne = null; return tomStruktur(); }
}

export function sparaStruktur(s: Struktur): void {
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
