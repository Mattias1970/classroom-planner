/**
 * Sidregister (v2): tabell över bokens sidnummer — en rad per kapitel,
 * teoridel, delkapitel och avsnitt (Del 1/Del 2 + extra lektioner) med
 * begrepp. Exporteras som Excel i appen (xlsx) från dessa rader; CSV finns
 * som ren-text-fallback här i kärnan.
 */
import type { Bok } from '../domain/typer.js';

export interface SidregisterRad {
  niva: 'Kapitel' | 'Teori' | 'Delkapitel' | 'Avsnitt';
  kod: string;
  namn: string;
  sidor: string;
  begrepp: string;
}

export function bokSidregister(bok: Bok): SidregisterRad[] {
  const rader: SidregisterRad[] = [];
  for (const k of bok.kapitel) {
    rader.push({ niva: 'Kapitel', kod: String(k.nr), namn: k.namn, sidor: k.sidor, begrepp: k.begreppslista.join(', ') });
    for (const d of k.delkapitel) {
      rader.push({ niva: 'Delkapitel', kod: d.kod, namn: d.namn, sidor: d.sidor, begrepp: d.begrepp.join(', ') });
      for (const l of d.lektioner) {
        rader.push({ niva: 'Teori', kod: d.kod, namn: `${d.namn} — teori del ${l.del}`, sidor: l.sidorTeori, begrepp: '' });
        rader.push({
          niva: 'Avsnitt', kod: `${d.kod}:${l.id}`, namn: `${l.avsnitt} · Del ${l.del}`,
          sidor: l.sidorTeori, begrepp: l.begrepp === '—' ? '' : l.begrepp,
        });
      }
    }
    for (const l of k.extraLektioner) {
      rader.push({ niva: 'Avsnitt', kod: `${k.nr}:${l.id}`, namn: l.avsnitt, sidor: l.sidorTeori, begrepp: '' });
    }
  }
  return rader;
}

function csvCell(s: string): string {
  return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semikolonseparerad CSV (svensk Excel) med BOM. */
export function bokSidregisterCsv(bok: Bok): string {
  const rader = bokSidregister(bok);
  const head = 'Nivå;Kod;Namn;Sidor;Begrepp';
  const body = rader.map((r) => [r.niva, r.kod, r.namn, r.sidor, r.begrepp].map(csvCell).join(';'));
  return `\uFEFF${[head, ...body].join('\r\n')}\r\n`;
}
