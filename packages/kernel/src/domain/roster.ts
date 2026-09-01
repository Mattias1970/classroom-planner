/**
 * SuperTeach · Socrative-roster — ren tolkning av en elevlista (roster)
 * som exporterats eller skapats för Socrative, samt import till en klass.
 * (Ring 1, I2: ingen fetch/DOM/lagring; xlsx/csv-avläsningen sker i
 * UI-lagret som skickar in kalkylbladet som en cellmatris.)
 *
 * Roster-filens form (Socratives mall, kolumnordningen varierar):
 *   rubrikrad: First Name | Last Name | Student ID | (Email)
 * Svenska rubriker (Förnamn/Efternamn/ID/E-post) och en enda namnkolumn
 * ('Student Name' eller 'Namn' med 'Efternamn, Förnamn') godtas också.
 * Saknas rubrikrad tolkas raderna som Förnamn | Efternamn | ID.
 */
import type { Cell } from './socrative.js';
import type { Elev, Struktur } from './typer.js';

export interface RosterRad {
  fornamn: string;
  efternamn: string;
  /** Student ID i rostern (det eleven loggar in med). */
  sidId: string;
  epost?: string;
}

function text(c: Cell): string { return c === null || c === undefined ? '' : String(c).trim(); }

type Kolumn = 'fornamn' | 'efternamn' | 'namn' | 'sidId' | 'epost';

function tolkaRubrik(cell: string): Kolumn | null {
  const r = cell.toLowerCase().replace(/[_-]/g, ' ').trim();
  if (/^(first ?name|förnamn|fornamn|given name)$/.test(r)) return 'fornamn';
  if (/^(last ?name|efternamn|surname|family name)$/.test(r)) return 'efternamn';
  if (/^(student ?name|name|namn|elev)$/.test(r)) return 'namn';
  if (/^(student ?id|id|elev ?id|användarnamn|anvandarnamn)$/.test(r)) return 'sidId';
  if (/^(e ?mail|e ?post|epost)$/.test(r)) return 'epost';
  return null;
}

/** Delar 'Efternamn, Förnamn' eller 'Förnamn Efternamn' i två delar. */
export function delaNamn(namn: string): { fornamn: string; efternamn: string } {
  const n = namn.replace(/\s+/g, ' ').trim();
  if (n.includes(',')) {
    const [efter, ...rest] = n.split(',');
    return { fornamn: rest.join(',').trim(), efternamn: efter.trim() };
  }
  const delar = n.split(' ');
  if (delar.length === 1) return { fornamn: n, efternamn: '' };
  return { fornamn: delar.slice(0, -1).join(' '), efternamn: delar[delar.length - 1] };
}

/** Tolkar en roster ur en cellmatris (xlsx/csv). Kastar svenska fel. */
export function tolkaSocrativeRoster(celler: Cell[][]): RosterRad[] {
  let rubrikIndex = -1;
  let karta = new Map<Kolumn, number>();
  for (let i = 0; i < Math.min(celler.length, 10); i++) {
    const rad = celler[i] ?? [];
    const k = new Map<Kolumn, number>();
    rad.forEach((c, j) => { const t = tolkaRubrik(text(c)); if (t !== null && !k.has(t)) k.set(t, j); });
    if (k.has('namn') || (k.has('fornamn') && k.has('efternamn')) || k.has('fornamn')) { rubrikIndex = i; karta = k; break; }
  }
  if (rubrikIndex === -1) {
    // Ingen rubrikrad: Förnamn | Efternamn | ID
    karta = new Map<Kolumn, number>([['fornamn', 0], ['efternamn', 1], ['sidId', 2]]);
  }
  const rader: RosterRad[] = [];
  for (let i = rubrikIndex + 1; i < celler.length; i++) {
    const rad = celler[i] ?? [];
    const hamta = (k: Kolumn): string => { const j = karta.get(k); return j === undefined ? '' : text(rad[j]); };
    let fornamn = hamta('fornamn'); let efternamn = hamta('efternamn');
    if (fornamn === '' && efternamn === '') {
      const helt = hamta('namn');
      if (helt === '') continue;
      ({ fornamn, efternamn } = delaNamn(helt));
    }
    if (fornamn === '' && efternamn === '') continue;
    const epost = hamta('epost');
    rader.push({ fornamn, efternamn, sidId: hamta('sidId'), ...(epost !== '' ? { epost } : {}) });
  }
  if (rader.length === 0) throw new Error('Rostern innehåller inga elevrader — är det en Socrative-roster (First Name/Last Name/Student ID)?');
  return rader;
}

/** Elevnamn som appen lagrar det: 'Förnamn Efternamn'. */
export function rosterNamn(r: RosterRad): string {
  return `${r.fornamn} ${r.efternamn}`.replace(/\s+/g, ' ').trim();
}

function nyckel(namn: string): string {
  return namn.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim().split(' ').sort().join(' ');
}

export interface RosterImportResultat {
  struktur: Struktur;
  /** Namn på nya elever. */
  tillagda: string[];
  /** Befintliga elever som fick e-post och/eller Student ID ifyllt. */
  uppdaterade: string[];
  /** Redan befintliga elever som hoppades över. */
  hoppade: string[];
}

/**
 * Importerar rosterrader till en klass. Matchar ordningsoberoende mot
 * befintliga elever ('Berg, Anna' = 'Anna Berg'); nya elever läggs till i
 * angiven grupp, befintliga får e-post/Student ID ifyllt från rostern.
 * Rena funktionen skapar id:n via `nyttId`.
 */
export function importeraRoster(
  s: Struktur, klassId: string, rader: RosterRad[], grupp: Elev['grupp'], nyttId: () => string,
): RosterImportResultat {
  if (!s.klasser.some((k) => k.id === klassId)) throw new Error('Rostern måste importeras till en befintlig klass.');
  const befintliga = new Map(s.elever.filter((e) => e.klassId === klassId).map((e) => [nyckel(e.namn), e]));
  const tillagda: string[] = []; const uppdaterade: string[] = []; const hoppade: string[] = [];
  let elever = s.elever;
  const sedda = new Set<string>();
  for (const r of rader) {
    const namn = rosterNamn(r);
    const n = nyckel(namn);
    if (sedda.has(n)) continue;
    sedda.add(n);
    const finns = befintliga.get(n);
    if (finns !== undefined) {
      const patch: Partial<Elev> = {};
      if (r.epost !== undefined && (finns.epost ?? '') === '') patch.epost = r.epost;
      if (r.sidId !== '' && (finns.socrativeId ?? '') === '') patch.socrativeId = r.sidId;
      if (Object.keys(patch).length > 0) {
        elever = elever.map((e) => (e.id === finns.id ? { ...e, ...patch } : e));
        uppdaterade.push(namn);
      } else {
        hoppade.push(namn);
      }
      continue;
    }
    const ny: Elev = { id: nyttId(), klassId, namn, grupp,
      ...(r.epost !== undefined ? { epost: r.epost } : {}), ...(r.sidId !== '' ? { socrativeId: r.sidId } : {}) };
    elever = [...elever, ny];
    tillagda.push(namn);
  }
  return { struktur: { ...s, elever }, tillagda, uppdaterade, hoppade };
}
