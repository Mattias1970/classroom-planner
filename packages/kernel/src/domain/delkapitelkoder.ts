/**
 * SuperTeach · Delkapitelkoder ur rum och quiznamn. Eget litet modul så att
 * både resultat.ts och elevrapport.ts kan använda det utan importcykel.
 * (Ring 1, I2.)
 */
import { delkapitelKod } from './bok.js';

/** 'Biologi412' → { kapitel: 4, delar: [1, 2] }; 'Matte8B' → null. */
export function tolkaRumKoder(rum: string): { kapitel: number; delar: number[] } | null {
  const m = /^[^\d]+(\d)(\d+)$/.exec(rum.trim());
  if (m === null) return null;
  return { kapitel: Number(m[1]), delar: m[2].split('').map(Number) };
}

/**
 * Delkapitelkoder som ett prov täcker. Rummet först ('Biologi412' → 4.1, 4.2).
 * När rummet är klassrummet ('BIOLOGI8BB') läses koderna ur quiznamnet, och då
 * måste hela namnet tolkas: 'Bi 4.1-4.3 Begrepp' täcker 4.1, 4.2 OCH 4.3, och
 * '4.1 - 4.4 begrepp' alla fyra. Ett kumulativt förhör testar av de tidigare
 * delkapitlen igen — fråga 1 är densamma i alla prov.
 */
export function koderForProv(prov: string, rum?: string): string[] {
  const viaRum = rum !== undefined ? tolkaRumKoder(rum) : null;
  if (viaRum !== null) return viaRum.delar.map((d) => `${viaRum.kapitel}.${d}`);
  const koder: string[] = [];
  // Intervall först: '4.1-4.3', '4.1 – 4.4', '4.1-3'
  for (const m of prov.matchAll(/(\d+)\.(\d+)\s*[-–—]\s*(?:(\d+)\.)?(\d+)/g)) {
    const kap = Number(m[1]); const fran = Number(m[2]); const till = Number(m[4]);
    if (m[3] !== undefined && Number(m[3]) !== kap) continue;
    for (let d = fran; d <= till && d - fran < 12; d++) koder.push(`${kap}.${d}`);
  }
  for (const m of prov.matchAll(/(\d+)\.(\d+)/g)) koder.push(`${Number(m[1])}.${Number(m[2])}`);
  if (koder.length > 0) return [...new Set(koder)].sort((a, b) => a.localeCompare(b, 'sv', { numeric: true }));
  const kod = delkapitelKod(prov);
  return kod === null ? [] : [kod];
}

