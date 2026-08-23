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

/**
 * NO+Tk är en blockkurs där Biologi, Fysik, Kemi och Teknik läses i följd,
 * var för sig, med lika många lektioner (fjärdedel av läsåret var).
 */
export const NO_TK = 'NO+Tk';
export const NO_TK_AMNEN = ['Biologi', 'Fysik', 'Kemi', 'Teknik'] as const;

/** Fast bakgrundsfärg per ämne i kalendern (olika ämnen → olika bakgrund). */
const AMNE_BG: Record<string, string> = {
  Matematik: '#8d4a2f', Biologi: '#2e7d46', Fysik: '#2f5aa8', Kemi: '#7b3fa0', Teknik: '#b06a12',
};
export function amneBakgrund(amnesNamn: string): string {
  if (AMNE_BG[amnesNamn]) return AMNE_BG[amnesNamn];
  let h = 0; for (const c of amnesNamn) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 32%)`;
}

/** Ljus, egen färg per klass för klassnamnet (läsbart på mörk ämnesbakgrund). */
const KLASS_LJUS = ['#ffd8a8', '#b2f2bb', '#a5d8ff', '#eebefa', '#ffec99', '#c3fae8', '#ffc9c9', '#d8f5a2'];
export function klassFarg(klassNamn: string): string {
  let h = 0; for (const c of klassNamn) h = (h * 33 + c.charCodeAt(0)) % 9973;
  return KLASS_LJUS[h % KLASS_LJUS.length];
}
