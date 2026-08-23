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

/**
 * Socrative-BEGREPPSRUM per kapitel/delkapitel och aggregat (viktigt i NO):
 * Biologi41 = begreppen för Biologi 4.1; Biologi42 = 4.2;
 * Biologi412 = 4.1–4.2; Biologi4123 = 4.1–4.3. Mönster:
 * <ämnesprefix><kapitel><delkapitelnummer i följd>.
 */
export function begreppsRum(amnesNamn: string, kapitel: number, delar: number[]): string {
  const prefix = PREFIX[amnesNamn] ?? amnesNamn.replace(/\s+/g, '');
  return `${prefix}${kapitel}${delar.join('')}`;
}

/** Tolkar '4.2 Fotosyntes' → { kap: 4, del: 2 } (null för repetition/prov m.m.). */
export function delkapitelUrAvsnitt(avsnitt: string): { kap: number; del: number } | null {
  const m = /^(\d+)\.(\d+)/.exec(avsnitt.trim());
  return m === null ? null : { kap: Number(m[1]), del: Number(m[2]) };
}

/**
 * Föreslagna Socrative-rum för en lektion i delkapitel kap.del:
 * exit = delkapitlets rum (Biologi42); läxförhör = aggregatet t.o.m.
 * aktuellt delkapitel (Biologi412 vid 4.2), så tidigare begrepp repeteras.
 */
export function foreslagnaRum(amnesNamn: string, kap: number, del: number): { exit: string; laxforhor: string } {
  const alla = Array.from({ length: del }, (_, i) => i + 1);
  return {
    exit: begreppsRum(amnesNamn, kap, [del]),
    laxforhor: begreppsRum(amnesNamn, kap, alla),
  };
}

/** Ljus, egen färg per klass för klassnamnet (läsbart på mörk ämnesbakgrund). */
const KLASS_LJUS = ['#ffd8a8', '#b2f2bb', '#a5d8ff', '#eebefa', '#ffec99', '#c3fae8', '#ffc9c9', '#d8f5a2'];
export function klassFarg(klassNamn: string): string {
  let h = 0; for (const c of klassNamn) h = (h * 33 + c.charCodeAt(0)) % 9973;
  return KLASS_LJUS[h % KLASS_LJUS.length];
}
