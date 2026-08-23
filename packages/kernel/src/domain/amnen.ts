/**
 * Ämnen (v2): planeringens fasta ämnen, halvklassregler och Socrative-rum.
 *
 * Matematik läses i helklass. Biologi, Fysik, Kemi och Teknik läses i
 * halvklass: varje klass är delad i Grupp A och Grupp B med varsin tid.
 * Varje ämne har ETT Socrative-rum per klass för läxförhör och exit tickets
 * (halvklassgrupperna delar rum). Mönstret är
 * <ämnesprefix><klassnamn><klassnamnets sista tecken>:
 * Matematik 8A → Matte8AA, Matematik 8B → Matte8BB, Fysik 8A → Fysik8AA.
 */
export const STANDARD_AMNEN = ['Matematik', 'Biologi', 'Fysik', 'Kemi', 'Teknik'] as const;

const HALVKLASS = new Set<string>(['Biologi', 'Fysik', 'Kemi', 'Teknik']);

/** Läses ämnet i halvklass (Grupp A/B med olika tider)? */
export function arHalvklass(amnesNamn: string): boolean {
  return HALVKLASS.has(amnesNamn);
}

const PREFIX: Record<string, string> = { Matematik: 'Matte' };

export type Grupp = 'A' | 'B';

/** Socrative-rum för ett ämne och en klass: 'Matte8AA', 'Matte8BB', 'Fysik8AA' … */
export function socrativeRum(amnesNamn: string, klassNamn: string): string {
  const prefix = PREFIX[amnesNamn] ?? amnesNamn.replace(/\s+/g, '');
  const namn = klassNamn.replace(/\s+/g, '');
  return `${prefix}${namn}${namn.slice(-1)}`;
}
