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
export interface Tjanst {
  id: string; skolarId: string; namn: string; larareId?: string;
  /** Återkommande stödpass (t.ex. Ma/NO-stöd) — öppen tid där elever gör klart obligatoriska uppgifter. */
  stodPass?: StodPass[];
}

/** Ett stödpass: ett namngivet veckopass utanför den ordinarie lektionsplaneringen. */
export interface StodPass { id: string; namn: string; dag: number; start: string; slut: string; }

export interface Klass { id: string; tjanstId: string; namn: string; }

/**
 * Elev i en klass. Varje klass är delad i Grupp A och Grupp B — halvklass-
 * ämnen (Biologi/Fysik/Kemi/Teknik) läses gruppvis med olika tider, så
 * gruppen avgör vilka lektioner som gäller för eleven.
 */
export interface Elev { id: string; klassId: string; namn: string; grupp: 'A' | 'B'; /** E-post (valfri) — används vid resultatmatchning. */ epost?: string; /** Student ID i Socratives roster (valfri) — säkraste matchningen. */ socrativeId?: string; }

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
  /**
   * Halvklasspass är laborationer för både A och B (NO-ämnen). Bokens lektioner läggs
   * bara på helklasspass — och på halvklasspass där laborationen tagits bort (labUndantag).
   */
  laborationsstandard?: boolean;
  /** Laborationsplaneringen — läggs ut i ordning på halvklasspassen. */
  laborationer?: Laboration[];
  /**
   * Genomförd planering rörs aldrig: pass före detta datum behåller den vanliga
   * lektionsföljden (bokens lektioner i tur och ordning i varje grupp), oavsett
   * laborationer eller passval. Sätts när laborationerna slås på.
   */
  planFrystTill?: string;
  /** Äldre form av passVal: halvklasspass (nyckel 'YYYY-MM-DD|HH:MM') som i stället får nästa teorilektion. */
  labUndantag?: string[];
  /**
   * Val per pass (nyckel = grupp A:s 'YYYY-MM-DD|HH:MM'). Standard utan val: helklasspass →
   * nästa teorilektion ur boken, halvklasspass → nästa laboration ur listan. Ett val byter:
   * teori på halvklasstid, laboration på helklasstid, eller en helt egen lektion/laboration.
   */
  passVal?: Record<string, PassVal>;
  /** NO+Tk-blockkurs: gemensamt id för de fyra delämnena som läses i följd. */
  noGrupp?: string;
  /** Position 0–3 i NO+Tk-blockens läsordning. */
  noOrder?: number;
  /** Egna rader (prov, diagnoser, övningar …) infogade i planeringen. */
  egnaRader?: EgenRad[];
  /**
   * Del 129: antal lektioner per delkapitel — som en logg med giltighet framåt. Varje
   * post gäller från lektionen `fran` (radnyckel) och framåt; saknas `fran` gäller den
   * från början. Senaste posten är ämnets inställning (1–4, standard 1). Delkapitel
   * som redan har fler lektioner i boken behåller dem. Loggen gör att det som redan
   * genomförts med en tidigare inställning aldrig ändras.
   */
  lektionerPerDelkapitel?: Array<{ fran?: string; antal: number }>;
  /** Del 129: antal lektioner för ett enskilt delkapitel (nyckel 'kapitel:kod', t.ex. '4:4.2'). */
  antalLektioner?: Record<string, number>;
  /** Del 129: borttagna och ersatta lektioner, per radnyckel ('kapitel:lektionsId', 'er:<id>' eller '…#2'). */
  lektionsVal?: Record<string, LektionsVal>;
}

/**
 * Del 129: vad som hänt med en lektion i planeringen.
 *  - bort: lektionen tas bort — efterföljande lektioner flyttas fram ett pass
 *  - ersatt: lektionen byts mot en egen lektion (rubrik/typ/beskrivning) eller en
 *    annan lektion ur boken (kapitel + lektionsId); den behåller sin plats
 */
export interface LektionsVal {
  bort?: boolean;
  ersatt?: { rubrik: string; typ?: EgenRad['typ']; beskrivning?: string } | { kapitel: number; lektionId: number };
}

/** Egen rad som läraren infogar i ämnets planering utöver bokens lektioner. */
/**
 * Vad ett pass ska innehålla när standarden inte gäller.
 *  - typ 'teori' + kalla 'nasta': nästa teorilektion i planeringen (ur boken)
 *  - typ 'lab'   + kalla 'nasta': nästa laboration i planeringen (ur listan)
 *  - kalla 'egen': en helt ny lektion/laboration med egen rubrik och egen detaljplanssida;
 *    tar inte något ur bokens eller listans kö.
 */
export interface PassVal {
  typ: 'teori' | 'lab';
  kalla: 'nasta' | 'egen';
  rubrik?: string;
  beskrivning?: string;
}

/** En laboration i NO-ämnets laborationsplanering. */
export interface Laboration {
  id: string;
  rubrik: string;
  /** Delkapitel laborationen hör till ('4.2'), om något. */
  delkapitel?: string;
  syfte?: string;
  material?: string;
  genomforande?: string;
  sakerhet?: string;
  /** Eleverna lämnar in labbrapport. */
  rapport?: boolean;
}

export interface EgenRad {
  id: string;
  /** Infogas på denna position i planeringen (0-baserad). Efterföljande lektioner skjuts framåt. */
  position: number;
  rubrik: string;
  typ: 'prov' | 'diagnos' | 'ovning' | 'annat';
  /** Kort beskrivning — visas som genomgångstext på lektionskortet. */
  beskrivning?: string;
}

// ── Bok (fristående bibliotek) ───────────────────────────────
/** Bokens namn på de tre uppgiftsnivåerna (intro / E / C–A). */
export interface NivaEtiketter { niva1: string; niva2: string; niva3: string; }

export type LektionsTyp = 'regular' | 'test' | 'repetition' | 'review' | 'ovaformagor' | 'exam' | 'laboration';

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
  /** Lank till genomgangsfilm ur boken (NO/flippat) - visas i Genomgang-ytan. */
  genomgangLank?: string;
  laxa: string;
  /** Exempel att räkna tillsammans under genomgången. */
  ex: string;
  /** Startuppgift/läxförhörsfråga (Socrative) om boken anger en. */
  /** Bokens mål för delkapitlet — 'Det här ska eleven lära sig' (radbrutna punkter). */
  mal?: string;
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
  /** Begreppsförklaringar ur boken: begrepp → kort beskrivning. */
  forklaringar?: Record<string, string>;
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
  /**
   * Kapitlets mål ur öppningsuppslagets "Här får du lära dig" — syftet i den
   * pedagogiska planeringen. Skilt från delkapitlens mål (sammanfattningarna).
   */
  mal?: string[];
  /** Sidan där "Här får du lära dig" står, t.ex. 's. 229'. */
  malSidor?: string;
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
  /** Versionsnummer per ämne (1, 2, 3 …) — sätts av registreraPlanering. */
  version?: number;
  /** Unikt namn, t.ex. 'Matematik 8B · Prio Matematik 8 · v2 (2026-08-27)'. */
  namn?: string;
}

export interface PlaneradLektion {
  kapitel: number;
  lektion: Lektion;
  /** null = ryms inte inom skolåret (hamnar efter slutdatum). */
  datum: IsoDatum | null;
  vecka: number | null;
  start: string | null;
  slutTid: string | null;
  /**
   * Stabil nyckel för raden (Del 129): 'kapitel:lektionsId' för bokens lektioner,
   * '…#2' för extra lektioner på ett delkapitel, 'er:<id>' för egna rader,
   * 'lab:<id>' för laborationer, 'pass:<nyckel>' för egna passlektioner.
   * Lektionsplaner följer nyckeln när planeringen ändras.
   */
  nyckel?: string;
}

// ── Aggregat ─────────────────────────────────────────────────
/**
 * Detaljerad, redigerbar lektionsplan (NO-planering): presentation,
 * sammanfattning, mål, läxa, Socrative-rum, flippat underlag och laboration.
 * En overlay per (ämne, lektionsposition) ovanpå bokens lektion.
 */
/** Del 143 · En del av lektionens BAM-struktur, redigerad av läraren: namn, längd i minuter och ikon. */
export interface BamDel {
  namn: string;
  minuter: number;
  ikon?: string;
  /** Kort anteckning som visas på tavlan (rum, uppgifter …). */
  text?: string;
}

export interface LektionsPlan {
  id: string;
  amneId: string;
  /** Position i ämnets planering (0-baserad). */
  lektionsIndex: number;
  /** Lärarens egna lektionsdelar med tider (Del 143). Saknas → standard-BAM ur passets längd. */
  bam?: BamDel[];
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
  /** Genomgångstext (det läraren berättar). */
  genomgang?: string;
  /** Filmlänkar för lektionen ('Titel|https://…'). */
  filmer?: string[];
  /** Magma-aktivitet (länk). */
  magma?: string;
  /** Anteckningar om klassen för lektionen. */
  anteckning?: string;
  /** Överstyr bokens uppgiftsintervall (nivå 1/2/3), t.ex. 'Uppg. 1–8'. */
  uppgNiva1?: string;
  uppgNiva2?: string;
  uppgNiva3?: string;
  /** Lektionen är genomförd (avklarat-kryss i lektionsplanen). */
  klar?: boolean;
  /** Tavlan: Vad ska vi göra (kort instruktion till eleverna). */
  vadGora?: string;
  /** Tavlan: Vad ska vi lära oss (lärandemål/begrepp i klartext). */
  laraOss?: string;
  /** Tavlan: Exempel vi räknar tillsammans (överstyra bokens ex). */
  exempelRakna?: string;
  /** Överstyr teorisidorna i lektionshuvudet. */
  sidorTeori?: string;
  /** Överstyr BOKENS EXEMPEL-rutan i Genomgång. */
  bokExempel?: string;
  /** Överstyr lektionens begrepp (kommaseparerade) — kort, läxchips och quiz. */
  begreppText?: string;
  /** Överstyr lektionens namn (avsnitt) — för att rätta stavfel utan att röra boken. */
  avsnittText?: string;
}

export interface Struktur {
  /** Rapportmallar för rapportdesignern — sparas också som rapportmallar/<id>.json i datarepot. */
  rapportmallar?: import('./rapportmall.js').Rapportmall[];
  /** QR-koder för Socrative-rum (rumsnamn → bild som data-URL). */
  socrativeQr?: Record<string, string>;
  /** Delningslänkar till Socrative-rum (rumsnamn → https://api.socrative.com/rc/…). */
  socrativeLankar?: Record<string, string>;
  /** Arkiverade planeringsversioner — skrivs aldrig över, kan återställas. */
  planeringsarkiv?: Planering[];
  /** Del 139: lärarens lektionsregler per bok (overlay — bokdata rörs inte). */
  lektionsregler?: Record<string, import('./lektionsregler.js').Lektionsregel[]>;
  /** Del 138: namngivna sparade planeringar (namn + version) — kan öppnas igen eller ligga i datarepot. */
  sparadePlaneringar?: import('./sparat.js').SparadPlanering[];
  /** Del 138: namngivna sparade SuperTeach-data (resultat + filregister) med koppling till planering. */
  sparadSuperTeach?: import('./sparat.js').SparadSuperTeach[];
  /** SuperTeach: importerade provresultat (läxförhör, exit tickets, Magma, DigiExam). */
  resultat?: import('./resultat.js').Resultat[];
  /** SuperTeach: register över importerade resultatfiler per ämne. */
  filregister?: import('./resultat.js').FilPost[];
  /** SuperTeach: sittplatsplaceringar importerade från PowerPoint. */
  sittplatser?: import('./sittplatser.js').Sittplatsering[];
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
