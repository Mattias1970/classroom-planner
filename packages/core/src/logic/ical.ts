/**
 * iCal-import (kravspec del 6, P2-gap "Google Kalender-import är stub").
 * Ren kärna: parsar .ics-text och föreslår återkommande lektionspass.
 * Hanterar radvikning (RFC 5545), TZID-/flytande lokaltid och UTC (Z, som
 * konverteras till Europe/Stockholm via Intl).
 */
import type { SchedulePass } from '../records/lesson-record.js';

export interface IcsEvent {
  weekday: number;     // 1=mån … 7=sön
  start: string;       // 'HH:MM'
  end: string;
  summary: string;
  date: string;        // 'YYYY-MM-DD'
}

/** Viker upp fortsättningsrader (rad som börjar med blanksteg/tab hör till föregående). */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

function stockholm(d: Date): { date: string; time: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = { mån: 1, tis: 2, ons: 3, tor: 4, fre: 5, lör: 6, sön: 7 }[get('weekday').replace('.', '')] ?? 0;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: wd,
  };
}

/** '20260817T090000[Z]' → datum/tid/veckodag; ren DATE (heldag) ger null. */
function parseDt(value: string): { date: string; time: string; weekday: number } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined) return null; // heldagshändelse — inte ett lektionspass
  if (z === 'Z') return stockholm(new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`));
  // TZID/flytande: tolka som lokal väggklocka
  const wd = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, weekday: wd === 0 ? 7 : wd };
}

/** Extraherar alla tidsatta händelser ur en .ics-fil. Okända/trasiga händelser hoppas över. */
export function parseIcsEvents(icsText: string): IcsEvent[] {
  const lines = unfold(icsText);
  const events: IcsEvent[] = [];
  let cur: Partial<Record<'DTSTART' | 'DTEND' | 'SUMMARY', string>> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.DTSTART && cur.DTEND) {
        const s = parseDt(cur.DTSTART), e = parseDt(cur.DTEND);
        if (s && e) events.push({ weekday: s.weekday, start: s.time, end: e.time, summary: cur.SUMMARY ?? '', date: s.date });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = line.match(/^(DTSTART|DTEND|SUMMARY)(?:;[^:]*)?:(.*)$/);
    if (m) cur[m[1] as 'DTSTART' | 'DTEND' | 'SUMMARY'] = m[2];
  }
  return events;
}

/**
 * Föreslår ett veckoschema ur kalenderhändelser: unika (veckodag, start, slut)
 * mån–fre, valfritt filtrerade på titeltext, sorterade i veckodagsordning.
 */
export function suggestSchedulePasses(events: IcsEvent[], titleFilter = ''): SchedulePass[] {
  const filter = titleFilter.trim().toLowerCase();
  const seen = new Set<string>();
  const out: SchedulePass[] = [];
  for (const e of events) {
    if (e.weekday < 1 || e.weekday > 5) continue;
    if (filter && !e.summary.toLowerCase().includes(filter)) continue;
    if (e.start >= e.end) continue;
    const key = `${e.weekday}:${e.start}:${e.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day: e.weekday, start: e.start, end: e.end });
  }
  return out.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}
