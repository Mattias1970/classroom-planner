/**
 * Betygsdatum och ämnesvisa lektionsregler (del 14) — ren kärna (I2).
 *
 * Betygssättningsdatum anges i inställningarna och visas som egen rubrik
 * under Viktiga datum i årsöversikten — för alla ämnen.
 *
 * Lektionsreglerna har en gemensam grunduppsättning; varje ämne kan ha en
 * delvis anpassad uppsättning som ersätter grunden för just det ämnet.
 */

export interface Betygsdatum {
  id: string;
  label: string;   // t.ex. "Betygssättning HT"
  datum: string;   // ISO "YYYY-MM-DD"
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Validerar ett betygsdatum. Tom lista = giltigt. */
export function validateBetygsdatum(b: Betygsdatum): string[] {
  const fel: string[] = [];
  if (b.label.trim() === '') fel.push('Rubrik saknas.');
  if (!ISO_DATUM.test(b.datum) || Number.isNaN(Date.parse(b.datum))) {
    fel.push(`Ogiltigt datum "${b.datum}" (format ÅÅÅÅ-MM-DD).`);
  }
  return fel;
}

/** Sorterar kronologiskt. */
export function sorteraBetygsdatum(lista: Betygsdatum[]): Betygsdatum[] {
  return [...lista].sort((a, b) => a.datum.localeCompare(b.datum));
}

export function nyttBetygsdatumId(existing: string[]): string {
  let n = 1;
  while (existing.includes(`bd-${n}`)) n++;
  return `bd-${n}`;
}

export interface Lektionsregel {
  rubrik: string;
  text: string;
}

/** Gemensam grunduppsättning — utgångspunkt för varje ämne. */
export const DEFAULT_LEKTIONSREGLER: Lektionsregel[] = [
  {
    rubrik: 'Lektionsstruktur (BAM)',
    text: 'Tavlan högst upp: [Ämne] [starttid]–[sluttid]. Läxförhör via Socrative → Genomgång → Arbete → Exit ticket i slutet av lektionen (Socrative, samma rum).',
  },
  {
    rubrik: 'Uppgiftsnivåer',
    text: 'Grön = introduktion · Blå = E-nivå · Röd = C/A-nivå. Varje delkapitel har två lektioner: del 1 arbetar Grön/Blå (minimum grönt klart), del 2 arbetar Blå/Röd (minimum blått klart).',
  },
  {
    rubrik: 'Inlämning',
    text: 'Gröna och blå uppgifter är obligatoriska: fotografera beräkningarna och ladda upp i Google Classroom. Röda uppgifter är frivilliga och görs om lektionstid finns. Det som inte hinns med görs klart hemma eller på stödtid.',
  },
  {
    rubrik: 'Läxor',
    text: 'Läxa till varje delkapitel: alla begrepp som hör till delkapitlet. Läxförhör sker i början av nästa lektion via Socrative.',
  },
];

/** Ämne → egen regeluppsättning; ämnen utan post använder grunden. */
export type AmnesreglerMap = Record<string, Lektionsregel[]>;

export interface ReglerResultat {
  regler: Lektionsregel[];
  /** true = ämnet har en egen (delvis anpassad) uppsättning. */
  anpassade: boolean;
}

/** Regler för ett ämne: egna om de finns, annars den gemensamma grunden. */
export function reglerForAmne(map: AmnesreglerMap, amne: string): ReglerResultat {
  const egna = map[amne];
  if (egna !== undefined && egna.length > 0) return { regler: egna, anpassade: true };
  return { regler: DEFAULT_LEKTIONSREGLER, anpassade: false };
}

/** Rensar tomma regler; returnerar null om inget meningsfullt återstår (= återgå till grunden). */
export function normaliseraRegler(regler: Lektionsregel[]): Lektionsregel[] | null {
  const rensade = regler
    .map((r) => ({ rubrik: r.rubrik.trim(), text: r.text.trim() }))
    .filter((r) => r.rubrik !== '' || r.text !== '');
  return rensade.length > 0 ? rensade : null;
}

/** Ett kapitels datumspann (första–sista placerade pass). */
export interface KapitelSpann { kapitel: number; forsta: string; sista: string; }

/**
 * Placerar betygsdatum i kapitelkolumnerna under Viktiga datum (del 15):
 * ett datum hör till det sista kapitlet som hunnit börja (forsta <= datum);
 * datum före allt hamnar i första kapitlet. Ingen egen yta — raderna
 * integreras i respektive kapitelkolumn.
 */
export function placeraBetygsdatum(
  lista: Betygsdatum[], spann: KapitelSpann[],
): Record<number, Betygsdatum[]> {
  const ut: Record<number, Betygsdatum[]> = {};
  const sorterade = [...spann].sort((a, b) => a.forsta.localeCompare(b.forsta));
  if (sorterade.length === 0) return ut;
  for (const b of sorteraBetygsdatum(lista)) {
    let vald = sorterade[0];
    for (const sp of sorterade) if (sp.forsta <= b.datum) vald = sp;
    if (vald === undefined) continue;
    ut[vald.kapitel] = [...(ut[vald.kapitel] ?? []), b];
  }
  return ut;
}
