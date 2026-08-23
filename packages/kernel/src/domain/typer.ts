/**
 * Classroom Planner v2 — domäntyper (Ring 1, ren kärna).
 *
 * Trädet:  Skolår ─ Tjänst ─ Klass ─ Ämne ─ (Bok, Planering)
 * Böcker är fristående: lektioner utan koppling till schema, lärare eller
 * klass. En planering uppstår när ett ämnes bok läggs på klassens schema.
 * En lärare kopplas till en tjänst; lärarens schema HÄRLEDS ur tjänstens
 * klassers ämnespass — det lagras aldrig separat.
 */

// ── Skolår ───────────────────────────────────────────────────
/** 'YYYY-MM-DD'. */
export type IsoDatum = string;

/** Avvikande dag i skolåret. Röda dagar beräknas och lagras inte här. */
export interface SkolarDag {
  datum: IsoDatum;
  /** T.ex. 'Höstlov', 'Temadag', 'Idrottsdag', 'Öppet hus'. */
  label: string;
  typ: 'lov' | 'heldag' | 'halvdag';
  /** Endast halvdag: pass som börjar vid/efter denna tid utgår ('HH:MM'). */
  slut?: string;
}

export interface Skolar {
  id: string;
  /** 'Läsåret 2026/2027'. */
  namn: string;
  start: IsoDatum;
  slut: IsoDatum;
  dagar: SkolarDag[];
}

// ── Personal & organisation ──────────────────────────────────
export interface Larare { id: string; namn: string; signatur: string; }

/** En tjänst hör till ett skolår och kan (men måste inte) ha en lärare. */
export interface Tjanst { id: string; skolarId: string; namn: string; larareId?: string; }

export interface Klass { id: string; tjanstId: string; namn: string; }

/**
 * Elev i en klass. Varje klass är delad i Grupp A och Grupp B — halvklass-
 * ämnen (Biologi/Fysik/Kemi/Teknik) läses gruppvis med olika tider, så
 * gruppen avgör vilka lektioner som gäller för eleven.
 */
export interface Elev { id: string; klassId: string; namn: string; grupp: 'A' | 'B'; }

/** Lektionspass: veckodag 1=mån … 5=fre, tider 'HH:MM'. */
export interface Pass { dag: number; start: string; slut: string; }

/**
 * Ett ämne som en klass läser inom tjänsten. Schemat ligger här:
 * klassens schema är unionen av dess ämnens pass (olika ämnen har olika
 * tider). Planering kan skapas utan lärare.
 */
export interface Amne {
  id: string;
  klassId: string;
  namn: string;
  /** Fristående bok ur biblioteket; undefined = ingen bok vald ännu. */
  bokId?: string;
  /** Helklassens schema — eller Grupp A:s när ämnet läses i halvklass. */
  schema: Pass[];
  /** Halvklass (Biologi/Fysik/Kemi/Teknik): Grupp A och B har olika tider. */
  halvklass?: boolean;
  /** Grupp B:s schema (krävs när halvklass är satt). */
  schemaB?: Pass[];
  /** NO+Tk-blockkurs: gemensamt id för de fyra delämnena som läses i följd. */
  noGrupp?: string;
  /** Position 0–3 i NO+Tk-blockens läsordning. */
  noOrder?: number;
}

// ── Bok (fristående bibliotek) ───────────────────────────────
/** Bokens namn på de tre uppgiftsnivåerna (intro / E / C–A). */
export interface NivaEtiketter { niva1: string; niva2: string; niva3: string; }

export type LektionsTyp = 'regular' | 'test' | 'repetition' | 'review' | 'ovaformagor' | 'exam';

export interface Lektion {
  id: number;
  typ: LektionsTyp;
  /** Rubrik ur boken, t.ex. '4.6 Ekvationer' eller 'Blandade uppgifter'. */
  avsnitt: string;
  del: number;
  /** Uppgiftsintervall per nivå ('—' om saknas). */
  niva1: string; niva2: string; niva3: string;
  sidorTeori: string;
  begrepp: string;
  genomgang: string;
  laxa: string;
  /** Exempel att räkna tillsammans under genomgången. */
  ex: string;
  /** Startuppgift/läxförhörsfråga (Socrative) om boken anger en. */
  socStart: string;
  /** Exit ticket-uppgift om boken anger en. */
  exit: string;
}

/** Delkapitel '4.6' med sina lektioner (del 1/2) och begrepp. */
export interface Delkapitel {
  kod: string;
  namn: string;
  sidor: string;
  begrepp: string[];
  lektioner: Lektion[];
}

/** Kapitelresurser — öppna listor som läraren fyller på. */
export interface KapitelResurser {
  filmer: Array<{ titel: string; url: string }>;
  /** Word-fil med teorisammanfattning för flippat klassrum. */
  flippSammanfattningUrl?: string;
  flippFilmUrl?: string;
  flippQuizUrl?: string;
}

export interface Kapitel {
  nr: number;
  namn: string;
  farg: string;
  /** Sammanfattat sidspann, t.ex. 's. 157–212'. */
  sidor: string;
  delkapitel: Delkapitel[];
  /** Lektioner utan delkapitelkod: blandade uppgifter, prov, träna … */
  extraLektioner: Lektion[];
  /** Kapitlets alla begrepp i bokordning (härledd, dedupad). */
  begreppslista: string[];
  resurser: KapitelResurser;
}

export interface Bok {
  id: string;
  titel: string;
  forlag: string;
  amne: string;
  arskurs: number;
  nivaer: NivaEtiketter;
  kapitel: Kapitel[];
}

// ── Planering ────────────────────────────────────────────────
/** En bok utlagd på ett ämnes schema inom ett skolår. */
export interface Planering {
  id: string;
  amneId: string;
  bokId: string;
  skapad: string;
}

export interface PlaneradLektion {
  kapitel: number;
  lektion: Lektion;
  /** null = ryms inte inom skolåret (hamnar efter slutdatum). */
  datum: IsoDatum | null;
  vecka: number | null;
  start: string | null;
  slutTid: string | null;
}

// ── Aggregat ─────────────────────────────────────────────────
/**
 * Detaljerad, redigerbar lektionsplan (NO-planering): presentation,
 * sammanfattning, mål, läxa, Socrative-rum, flippat underlag och laboration.
 * En overlay per (ämne, lektionsposition) ovanpå bokens lektion.
 */
export interface LektionsPlan {
  id: string;
  amneId: string;
  /** Position i ämnets planering (0-baserad). */
  lektionsIndex: number;
  /** Namn på presentationen som används på lektionen. */
  presentation?: string;
  /** Sammanfattning av delkapitlet. */
  sammanfattning?: string;
  /** Vad eleverna ska lära sig (ur kapitlets sammanfattning). */
  mal?: string;
  /** Läxa — default: delkapitlets begrepp. */
  laxa?: string;
  /** Socrative-rum för läxförhöret (t.ex. Biologi412 = begrepp 4.1–4.2). */
  laxforhorRum?: string;
  /** Namn på exit-quizet (rum = delkapitlets begreppsrum). */
  exitQuiz?: string;
  /** Flippat underlag: kort teoritext till eleven. */
  flippTeori?: string;
  /** Flippat underlag: länk till kort film. */
  flippFilm?: string;
  /** Flippat underlag: namn på quiz. */
  flippQuiz?: string;
  /** Laboration: länk till laborationen … */
  labLank?: string;
  /** … eller frågeställning som analyseras med systematisk undersökning. */
  labFraga?: string;
}

export interface Struktur {
  skolar: Skolar[];
  larare: Larare[];
  tjanster: Tjanst[];
  klasser: Klass[];
  elever: Elev[];
  amnen: Amne[];
  bocker: Bok[];
  planeringar: Planering[];
  lektionsplaner: LektionsPlan[];
}

export function tomStruktur(): Struktur {
  return { skolar: [], larare: [], tjanster: [], klasser: [], elever: [], amnen: [], bocker: [], planeringar: [], lektionsplaner: [] };
}
