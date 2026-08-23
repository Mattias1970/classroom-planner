/**
 * Studio-store: hela strukturen (skolår, lärare, tjänster, klasser, ämnen,
 * böcker, planeringar) persisteras som ETT dokument i localStorage, med
 * minnesfallback och export/import för backup. All logik bor i kärnan —
 * här finns bara läs/skriv.
 */
import { tomStruktur, type Struktur } from '@planner/kernel';

const KEY = 'classroom-planner.studio.v2';
const mem = new Map<string, string>();

function lsGet(k: string): string | null {
  // localStorage är sanningen när den fungerar (även null); minnet är
  // enbart fallback när lagring kastar (t.ex. privat läge).
  try { return window.localStorage.getItem(k); }
  catch { return mem.get(k) ?? null; }
}
function lsSet(k: string, v: string): void {
  mem.set(k, v);
  try { window.localStorage.setItem(k, v); } catch { /* minnesfallback räcker */ }
}

export function lasStruktur(): Struktur {
  const raw = lsGet(KEY);
  if (raw === null) return tomStruktur();
  try { return { ...tomStruktur(), ...(JSON.parse(raw) as Struktur) }; }
  catch { return tomStruktur(); }
}

export function sparaStruktur(s: Struktur): void {
  lsSet(KEY, JSON.stringify(s));
}

export function exportJson(s: Struktur): string {
  return JSON.stringify({ schema: 'classroom-planner-studio', version: 2, struktur: s, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJson(text: string): Struktur {
  const raw = JSON.parse(text) as { schema?: string; struktur?: Struktur };
  if (raw.schema !== 'classroom-planner-studio' || !raw.struktur) {
    throw new Error('Filen är inte en Studio-backup (schema "classroom-planner-studio").');
  }
  return { ...tomStruktur(), ...raw.struktur };
}
