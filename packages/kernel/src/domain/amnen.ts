/**
 * Ämnen (v2): planeringens fasta ämnen, halvklassregler och Socrative-rum.
 *
 * Matematik läses i helklass. Biologi, Fysik, Kemi och Teknik läses i
 * halvklass: varje klass är delad i Grupp A och Grupp B med varsin tid.
 * Varje ämne har Socrative-rum för läxförhör och exit tickets, ett per
 * grupp, med namnmönstret <ämnesprefix><klassnamn><grupp>:
 * Matematik → Matte8AA/Matte8AB, Biologi → Biologi8AA/Biologi8AB, osv.
 */
export const STANDARD_AMNEN = ['Matematik', 'Biologi', 'Fysik', 'Kemi', 'Teknik'] as const;

const HALVKLASS = new Set<string>(['Biologi', 'Fysik', 'Kemi', 'Teknik']);

/** Läses ämnet i halvklass (Grupp A/B med olika tider)? */
export function arHalvklass(amnesNamn: string): boolean {
  return HALVKLASS.has(amnesNamn);
}

const PREFIX: Record<string, string> = { Matematik: 'Matte' };

export type Grupp = 'A' | 'B';

/** Socrative-rum för ett ämne, en klass och en grupp: 'Matte8AA', 'Biologi8BB' … */
export function socrativeRum(amnesNamn: string, klassNamn: string, grupp: Grupp): string {
  const prefix = PREFIX[amnesNamn] ?? amnesNamn.replace(/\s+/g, '');
  return `${prefix}${klassNamn.replace(/\s+/g, '')}${grupp}`;
}
