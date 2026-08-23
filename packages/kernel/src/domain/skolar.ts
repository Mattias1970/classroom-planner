/**
 * Skolår (v2): röda dagar beräknas, lov/temadagar/idrottsdagar/halvdagar
 * läggs till manuellt, via klistrad text/CSV eller via AI-tolkat kalendarium
 * (.ics eller prompten "Kalendarium" som ger samma textformat).
 */
import type { IsoDatum, Skolar, SkolarDag } from './typer.js';

function iso(d: Date): IsoDatum { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

/** Svenska röda dagar (mån–fre-relevanta) för ett kalenderår. */
export function helgdagar(year: number): Map<IsoDatum, string> {
  const out = new Map<IsoDatum, string>();
  const fixa: Array<[number, number, string]> = [
    [0, 1, 'Nyårsdagen'], [0, 6, 'Trettondedag jul'], [4, 1, 'Första maj'],
    [5, 6, 'Sveriges nationaldag'], [11, 24, 'Julafton'], [11, 25, 'Juldagen'],
    [11, 26, 'Annandag jul'], [11, 31, 'Nyårsafton'],
  ];
  for (const [m, d, label] of fixa) out.set(iso(new Date(Date.UTC(year, m, d))), label);
  const påsk = easterSunday(year);
  out.set(iso(addDays(påsk, -2)), 'Långfredagen');
  out.set(iso(addDays(påsk, 1)), 'Annandag påsk');
  out.set(iso(addDays(påsk, 39)), 'Kristi himmelsfärdsdag');
  const jun19 = new Date(Date.UTC(year, 5, 19));
  out.set(iso(addDays(jun19, (5 - jun19.getUTCDay() + 7) % 7)), 'Midsommarafton');
  return out;
}

const DATUM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KOMPAKT_RE = /^(\d{4})(\d{2})(\d{2})$/;
const TID_RE = /\b(\d{1,2}[:.]\d{2})\b/;

function normDatum(t: string): IsoDatum | null {
  const m = t.match(DATUM_RE) ?? t.match(KOMPAKT_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${mo}-${d}`;
}
function normTid(t: string): string {
  const [h, m] = t.replace('.', ':').split(':');
  return `${h.padStart(2, '0')}:${m}`;
}
function datumSpann(a: IsoDatum, b: IsoDatum, label: string, typ: 'lov'): SkolarDag[] {
  const ut: SkolarDag[] = [];
  const d0 = new Date(`${a}T00:00:00Z`);
  for (let i = 0; i < 60; i++) {
    const d = addDays(d0, i);
    const di = iso(d);
    if (di > b) break;
    ut.push({ datum: di, label, typ });
  }
  return ut;
}

/** Sorterar på datum; sista posten per datum vinner. */
export function normaliseraDagar(dagar: SkolarDag[]): SkolarDag[] {
  const map = new Map<string, SkolarDag>();
  for (const d of dagar) map.set(d.datum, d);
  return [...map.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Tolkar kalendariumtext — en rad per dag eller lovintervall:
 *   2026-09-15 Temadag
 *   2026-10-26--2026-10-30 Höstlov
 *   2026-12-18 halvdag 12:00 Julavslutning
 *   2027-02-05 Idrottsdag
 * '#' inleder kommentar. Kastar Error om ingen rad gick att tolka.
 */
export function parseKalendarium(text: string): SkolarDag[] {
  const dagar: SkolarDag[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const spann = line.match(/^(\d{4}-\d{2}-\d{2})\s*(?:--|–|—|till)\s*(\d{4}-\d{2}-\d{2})\s+(.+)$/);
    if (spann) { dagar.push(...datumSpann(spann[1], spann[2], spann[3].trim(), 'lov')); continue; }
    const tokens = line.split(/[;,\t]+|\s+/).map((t) => t.trim()).filter(Boolean);
    const datum = tokens.length > 0 ? normDatum(tokens[0]) : null;
    if (!datum) continue;
    const rest = tokens.slice(1);
    const halv = rest.some((t) => /^halvdag$/i.test(t));
    const tidTok = rest.find((t) => TID_RE.test(t));
    const label = rest.filter((t) => !/^halvdag$/i.test(t) && t !== tidTok).join(' ').trim();
    if (halv && tidTok) dagar.push({ datum, typ: 'halvdag', slut: normTid(tidTok.match(TID_RE)![1]), label: label || 'Halvdag' });
    else dagar.push({ datum, typ: /lov$/i.test(label) ? 'lov' : 'heldag', label: label || 'Temadag' });
  }
  if (dagar.length === 0) {
    throw new Error('Inga giltiga rader. Format: "2026-09-15 Temadag", "2026-10-26--2026-10-30 Höstlov" eller "2026-12-18 halvdag 12:00 Julavslutning".');
  }
  return normaliseraDagar(dagar);
}

/** Heldagshändelser ur .ics (VALUE=DATE) → heldagar; flerdagars expanderas (DTEND exklusiv). */
export function kalendariumFromIcs(icsText: string): SkolarDag[] {
  const lines: string[] = [];
  for (const raw of icsText.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  const dagar: SkolarDag[] = [];
  let cur: { start?: string; end?: string; summary?: string; helDag?: boolean } | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.helDag && cur.start) {
        const start = normDatum(cur.start);
        if (start) {
          const end = cur.end ? normDatum(cur.end) : null;
          const label = (cur.summary ?? '').trim() || 'Ledig dag';
          const typ: SkolarDag['typ'] = /lov$/i.test(label) ? 'lov' : 'heldag';
          const d0 = new Date(`${start}T00:00:00Z`);
          for (let i = 0; i < 60; i++) {
            const di = iso(addDays(d0, i));
            if (end !== null && di >= end) break;
            dagar.push({ datum: di, typ, label });
            if (end === null) break;
          }
        }
      }
      cur = null; continue;
    }
    if (!cur) continue;
    let m = line.match(/^DTSTART;[^:]*VALUE=DATE[^:]*:(\d{8})$/);
    if (m) { cur.start = m[1]; cur.helDag = true; continue; }
    m = line.match(/^DTEND;[^:]*VALUE=DATE[^:]*:(\d{8})$/);
    if (m) { cur.end = m[1]; continue; }
    m = line.match(/^SUMMARY(?:;[^:]*)?:(.*)$/);
    if (m) cur.summary = m[1];
  }
  if (dagar.length === 0) throw new Error('Filen innehåller inga heldagshändelser (temadagar/lov ska vara heldagshändelser i kalendern).');
  return normaliseraDagar(dagar);
}

/** Ledighetsetikett för ett datum: skolårets dag eller röd dag, annars null. */
export function ledigEtikett(datum: IsoDatum, skolar: Skolar): string | null {
  const egen = skolar.dagar.find((d) => d.datum === datum);
  if (egen && egen.typ !== 'halvdag') return egen.label;
  return helgdagar(Number(datum.slice(0, 4))).get(datum) ?? null;
}

/** Spärretikett för ett pass (heldag/lov/röd dag spärrar allt; halvdag från sluttiden). */
export function passSparr(datum: IsoDatum, passStart: string, skolar: Skolar): string | null {
  const röd = ledigEtikett(datum, skolar);
  if (röd) return röd;
  const egen = skolar.dagar.find((d) => d.datum === datum);
  if (egen?.typ === 'halvdag' && egen.slut !== undefined && passStart >= egen.slut) {
    return `${egen.label} (halvdag ${egen.slut})`;
  }
  return null;
}

export function isoVecka(datum: IsoDatum): number {
  const d = new Date(`${datum}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}
