/**
 * Kalendarium (del 28) — ren kärna (invariant I2).
 *
 * Skolans avvikande dagar: temadagar, studiedagar, halvdagar (öppet hus,
 * betygsutdelning …). Schemamotorn hoppar över spärrade pass, så lektioner
 * som går bort försvinner ur planeringen och resten förskjuts framåt —
 * ingen lektion hamnar på en spärrad tid. Dagarna visas i kalendern.
 */
export interface KalenderDag {
  /** 'YYYY-MM-DD'. */
  datum: string;
  /** T.ex. 'Temadag', 'Studiedag', 'Öppet hus'. */
  label: string;
  /** heldag = inga lektioner alls; halvdag = skoldagen slutar 'slut'. */
  typ: 'heldag' | 'halvdag';
  /** Endast halvdag: pass som börjar vid/efter denna tid utgår ('HH:MM'). */
  slut?: string;
}

const DATUM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KOMPAKT_RE = /^(\d{4})(\d{2})(\d{2})$/;
const TID_RE = /\b(\d{1,2}[:.]\d{2})\b/;

function normDatum(t: string): string | null {
  const m = t.match(DATUM_RE) ?? t.match(KOMPAKT_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  const mm = Number(mo), dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${mo}-${d}`;
}
function normTid(t: string): string {
  const [h, m] = t.replace('.', ':').split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

/** Sorterar på datum och låter sista raden vinna vid dubblettdatum. */
export function normaliseraKalendarium(dagar: KalenderDag[]): KalenderDag[] {
  const map = new Map<string, KalenderDag>();
  for (const d of dagar) map.set(d.datum, d);
  return [...map.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Tolkar klistrad text/CSV — en dag per rad, t.ex.:
 *   2026-09-15  Temadag
 *   2026-10-02; halvdag 11:30; Öppet hus
 *   20261218 halvdag 12.00 Julavslutning
 * Rader utan giltigt datum ignoreras; # inleder kommentar.
 * Kastar Error (svensk text) om ingen rad gick att tolka.
 */
export function parseKalendarium(text: string): KalenderDag[] {
  const dagar: KalenderDag[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const tokens = line.split(/[;,\t]+|\s+/).map((t) => t.trim()).filter(Boolean);
    const datum = tokens.length > 0 ? normDatum(tokens[0]) : null;
    if (!datum) continue;
    const rest = tokens.slice(1);
    const halv = rest.some((t) => /^halvdag$/i.test(t));
    const tidTok = rest.find((t) => TID_RE.test(t));
    const label = rest
      .filter((t) => !/^halvdag$/i.test(t) && !(tidTok !== undefined && t === tidTok))
      .join(' ')
      .trim();
    if (halv && tidTok) {
      dagar.push({ datum, typ: 'halvdag', slut: normTid(tidTok.match(TID_RE)![1]), label: label || 'Halvdag' });
    } else {
      dagar.push({ datum, typ: 'heldag', label: label || 'Temadag' });
    }
  }
  if (dagar.length === 0) {
    throw new Error('Inga giltiga rader hittades. Format: "2026-09-15 Temadag" eller "2026-10-02 halvdag 11:30 Öppet hus" — en dag per rad.');
  }
  return normaliseraKalendarium(dagar);
}

/**
 * Heldagshändelser ur en .ics-fil (DTSTART;VALUE=DATE) blir heldagar.
 * Flerdagshändelser expanderas (DTEND är exklusiv enligt RFC 5545, max 30 dagar).
 * Tidsatta händelser rör inte kalendariet — de är lektionspass, inte lediga dagar.
 */
export function kalendariumFromIcs(icsText: string): KalenderDag[] {
  const lines: string[] = [];
  for (const raw of icsText.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  const dagar: KalenderDag[] = [];
  let cur: { start?: string; end?: string; summary?: string; helDag?: boolean } | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.helDag && cur.start) {
        const start = normDatum(cur.start);
        if (start) {
          const end = cur.end ? normDatum(cur.end) : null;
          const label = (cur.summary ?? '').trim() || 'Ledig dag';
          const d0 = new Date(`${start}T00:00:00Z`);
          for (let i = 0; i < 30; i++) {
            const d = new Date(d0); d.setUTCDate(d.getUTCDate() + i);
            const isoD = d.toISOString().slice(0, 10);
            if (end !== null && isoD >= end) break;      // DTEND exklusiv
            dagar.push({ datum: isoD, typ: 'heldag', label });
            if (end === null) break;                      // endagshändelse
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
  if (dagar.length === 0) {
    throw new Error('Filen innehåller inga heldagshändelser. Temadagar och halvdagar ska vara heldagshändelser i kalendern (halvdagar kan i stället klistras in som text: "2026-10-02 halvdag 11:30 Öppet hus").');
  }
  return normaliseraKalendarium(dagar);
}

/** Dagen i kalendariet för ett datum, eller null. */
export function kalenderDagFor(datum: string, dagar: KalenderDag[]): KalenderDag | null {
  return dagar.find((d) => d.datum === datum) ?? null;
}

/**
 * Spärretikett för ett lektionspass: heldag spärrar alltid; halvdag spärrar
 * pass som börjar vid/efter sluttiden. null = passet får schemaläggas.
 */
export function sparrEtikett(datum: string, passStart: string, dagar: KalenderDag[]): string | null {
  const d = kalenderDagFor(datum, dagar);
  if (!d) return null;
  if (d.typ === 'heldag') return d.label;
  return d.slut !== undefined && passStart >= d.slut ? `${d.label} (halvdag ${d.slut})` : null;
}
