/**
 * Del 164 · Utvärdering inför utvecklingssamtal — en kort text per elev och ämne
 * (högst sju stycken, åtskilda av blankrad) med positiv grundton, byggd på läxförhör, Exit tickets,
 * inlämningar (Teams) och DigiExam-prov.
 *
 *  Status (beräknad, läraren kan ändra den): har svårt att nå målen · når målen ·
 *  går bra · mycket bra · utmärkt. Nivåerna följer förhörsgränserna (läxförhör 90 %,
 *  exit 70 %) och bedömningsnivåerna Bra / Mycket bra / Utmärkt; ett DigiExam-prov som
 *  inte är godkänt väger tyngst och ger "har svårt att nå målen" tills omprovet är klarat.
 *
 *  Utveckling = början jämfört med nu: snittet av de första förhören mot de senaste
 *  (halvorna när det finns minst fyra, annars första mot sista). Beskrivande — inga
 *  orsakspåståenden.
 */
import { aterkommandeFel } from './delkapiteltrend.js';
import { elevNarvaro } from './dashboard.js';
import { digiexamLarm } from './digiexam.js';
import { elevkort, type ElevkortSerie } from './elevkort.js';
import { inlamningsOversikt, type InlamningsTyp } from './inlamningar.js';
import { tolkaMagmaNamn } from './magmaprov.js';
import { gemensamText, kapitelKoder, kapitelNamn, kodEtikett, type SamtalsKapitel } from './samtalskapitel.js';
import { delkapitelKod } from './bok.js';
import { amnesPlanFor, elevIKlassen } from './struktur.js';
import type { PlaneradLektion, Struktur } from './typer.js';

/** Del 173 · 'saknas' = underlag saknas: utan resultat går det inte att säga att eleven når målen. */
export type SamtalsStatus = 'svart' | 'nar' | 'bra' | 'mycketBra' | 'utmarkt' | 'saknas';
export const STATUS_TEXT: Record<SamtalsStatus, string> = {
  svart: 'har svårt att nå målen', nar: 'når målen', bra: 'går bra', mycketBra: 'mycket bra', utmarkt: 'utmärkt', saknas: 'underlag saknas',
};
/** Nivåerna i ordning (index 0–4 = nivå); 'underlag saknas' sist. */
export const STATUS_ORDNING: SamtalsStatus[] = ['svart', 'nar', 'bra', 'mycketBra', 'utmarkt', 'saknas'];

export type SamtalsTrend = 'upp' | 'stabil' | 'ner';

export interface SerieUtveckling {
  antal: number;
  /** Snitt i början respektive nu (procent), null utan resultat. */
  borjan: number | null;
  nu: number | null;
  trend: SamtalsTrend | null;
  klarade: number;
  bedomda: number;
}

export interface InlamningsDel { inlamnade: number; antal: number; }

export type SamtalsMall = 'no' | 'ma';

/** Magma-diagnosens nivå: under 70 % svårt, 70–80 når målen, 81–90 bra, 91–95 mycket bra, över 95 utmärkt. */
export function magmaNiva(procent: number): SamtalsStatus {
  return procent > 95 ? 'utmarkt' : procent >= 91 ? 'mycketBra' : procent >= 81 ? 'bra' : procent >= 70 ? 'nar' : 'svart';
}

/**
 * Del 173 · Diagnosens slag: 'kapitel' = diagnos på hela kapitlet (täcker kapitlets alla genomförda delkapitel eller
 * heter "kap 1"/"kapitel 1") — den väger tyngst i slutresultatet; 'delkapitel' = diagnos på en del av kapitlet (visar
 * utvecklingen fram till kapiteldiagnosen); 'screening' = Stockholms stads screening (ingen delkapitelkod).
 */
export type DiagnosTyp = 'kapitel' | 'delkapitel' | 'screening';
export interface Diagnos {
  prov: string; datum: string; procent: number; niva: SamtalsStatus; poang: number; maxPoang: number; typ: DiagnosTyp; koder: string[];
  /** Del 179 · Datumet diagnosen ligger på i planeringen (diagnoslektionen efter delkapitlet/kapitlet); null när planen saknar det. */
  planDatum: string | null;
  /** Kapitlet ur namnet eller koderna. */
  kapitel: number | null;
}

/** Del 172 · Ett förhör (Exit ticket/Läxförhör) i ett kapitel: '1.1' eller '1.1–1.3', procent och datum. */
export interface KapitelForhor { etikett: string; prov: string; datum: string; procent: number }
/**
 * Del 172 · Elevens Exit tickets och Läxförhör i ett kapitel ur urvalet (matematik). Tomma listor nämns inte i texten.
 * Del 178 · magmaExit/magmaLaxforhor: Magma-filer döpta "… Exit ticket 2.1a" / "… Läxförhör 2.1 - 2.4" (samlas under Magma).
 */
export interface KapitelResultat { nr: number; namn: string; exit: KapitelForhor[]; laxforhor: KapitelForhor[]; magmaExit: KapitelForhor[]; magmaLaxforhor: KapitelForhor[] }

export interface Utvardering {
  elevId: string;
  namn: string;
  amne: string;
  /** Mallen: 'ma' för matematik (Magma-diagnoser styr), annars 'no'. */
  mall: SamtalsMall;
  /** Matematik: alla Magma-diagnoser i datumordning (kapiteldiagnoser och screening), snitt och nivå. */
  diagnoser: {
    lista: Diagnos[];
    /** Snitt av alla diagnoser. */
    snitt: number | null;
    /** Slutresultatet som statusen bygger på: snittet av kapiteldiagnoserna när sådana finns, annars snittet av alla. */
    slut: number | null;
    /** Snitt av delkapiteldiagnoserna (utvecklingen fram till kapiteldiagnosen); null utan sådana. */
    delkapitelSnitt: number | null;
    senaste: number | null;
    trend: SamtalsTrend | null;
  };
  /** Del 172 · Matematik: Exit tickets och Läxförhör per kapitel i rapportens urval (ur quiznamnens delkapitelkoder). */
  kapitel: KapitelResultat[];
  /** Beräknad status. */
  status: SamtalsStatus;
  /** Lärarens egen status, om satt. */
  egenStatus?: SamtalsStatus;
  lektioner: SerieUtveckling;
  laxlasning: SerieUtveckling & {
    /** Begrepp eleven haft fel på mer än en gång utan att ha rättat till dem. */
    glomdaBegrepp: string[];
    tendens: 'ingen' | 'kontinuerligt' | 'gorsEj';
  };
  inlamningar: {
    begrepp: InlamningsDel; fragor: InlamningsDel; laborationer: InlamningsDel;
    /** Andel av förfallna uppgifter som är inlämnade. */
    procent: number | null;
    /** Första halvan mot andra halvan av de förfallna uppgifterna. */
    trend: SamtalsTrend | null;
  };
  digiexam: Array<{ prov: string; godkand: boolean | null; skrivit: boolean; poang: number | null; maxPoang: number | null }>;
  /** Närvaro ur quizsvaren: andel lektioner med läxförhör/exit ticket där eleven svarat; null utan lektioner. */
  narvaro: { procent: number | null; lektioner: number; narvarande: number };
  /** Genererad text, högst sju rader. */
  text: string;
  /** Lärarens redigerade text, om någon. */
  egenText?: string;
}

const snitt = (v: number[]): number | null => (v.length === 0 ? null : Math.round(v.reduce((a, b) => a + b, 0) / v.length));

function utveckling(serie: ElevkortSerie): SerieUtveckling {
  const p = serie.punkter.map((x) => x.procent).filter((x): x is number => x !== null);
  let borjan: number | null = null; let nu: number | null = null;
  if (p.length >= 4) { const h = Math.floor(p.length / 2); borjan = snitt(p.slice(0, h)); nu = snitt(p.slice(p.length - h)); }
  else if (p.length >= 2) { borjan = p[0]; nu = snitt(p.slice(-2)); }
  else if (p.length === 1) { borjan = p[0]; nu = p[0]; }
  const trend: SamtalsTrend | null = borjan === null || nu === null || p.length < 2 ? null : nu - borjan >= 5 ? 'upp' : nu - borjan <= -5 ? 'ner' : 'stabil';
  return { antal: p.length, borjan, nu, trend, klarade: serie.klarade, bedomda: serie.bedomda };
}

/** Nivå 0–4 ur ett snitt mot källans gränser (0 = under, 1 = når, 2 = bra, 3 = mycket bra, 4 = utmärkt). */
function niva(v: number | null, g: [number, number, number, number]): number | null {
  if (v === null) return null;
  return v >= g[3] ? 4 : v >= g[2] ? 3 : v >= g[1] ? 2 : v >= g[0] ? 1 : 0;
}

/** Status ur nivåerna: läxförhör väger dubbelt; ett ej godkänt DigiExam-prov ger "har svårt". */
export function beraknaStatus(u: Omit<Utvardering, 'status' | 'text' | 'elevId' | 'namn' | 'amne'>): SamtalsStatus {
  if (u.digiexam.some((p) => p.skrivit && p.godkand === false)) return 'svart';
  // Matematik: Magma-diagnoserna styr — snittet av alla diagnoser (70–80 når målen, 81–90 bra, 91–95 mycket bra, över 95 utmärkt).
  // Utan diagnoser saknas underlag — då går det inte att säga att eleven når målen (Del 173).
  if (u.mall === 'ma') return u.diagnoser.slut === null ? 'saknas' : magmaNiva(u.diagnoser.slut);
  const delar: Array<[number | null, number]> = [
    [niva(u.laxlasning.nu, [75, 90, 94, 97]), 2],
    [niva(u.lektioner.nu, [55, 70, 81, 91]), 1],
    [niva(u.inlamningar.procent, [50, 75, 90, 100]), 1],
  ];
  const med = delar.filter((d): d is [number, number] => d[0] !== null);
  if (med.length === 0) return 'saknas';
  const v = med.reduce((a, [n, w]) => a + n * w, 0) / med.reduce((a, [, w]) => a + w, 0);
  return STATUS_ORDNING[Math.max(0, Math.min(4, Math.round(v)))];
}

const pct = (v: number | null) => (v === null ? '–' : `${v} %`);

/** Del 173 · Små tal skrivs med bokstäver i löpande text (svensk skrivregel): 0–12. */
const ORDTAL = ['noll', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'];
export function antalOrd(n: number, stor = false): string {
  const o = n >= 0 && n < ORDTAL.length ? ORDTAL[n] : String(n);
  return stor ? o.charAt(0).toUpperCase() + o.slice(1) : o;
}

/** Del 172 · Indrag som markerar att en textrad hör till föregående stycke (diagnosraderna). */
export const UNDERRAD = '  ';

/** Rubrikerna som inleder styckena (fet stil i visning och Word). */
export const SAMTALS_RUBRIKER = ['Diagnoser', 'Screening', 'Förhören', 'Lektionerna', 'Närvaro', 'Läxläsning', 'Inlämningar', 'Prov'] as const;

/**
 * Texten: högst sju stycken (status, Lektionerna, Läxläsning, Inlämningar, Prov, avslut),
 * positiv grundton, om utveckling och lärande. Styckena inleds med rubrik + kolon;
 * "Exit tickets" skrivs alltid så (visas i fet blå stil).
 */
export function samtalsText(u: Omit<Utvardering, 'text'>, fornamn: string): string {
  const status = u.egenStatus ?? u.status;
  const amne = u.amne.toLowerCase();
  const rader: string[] = [];
  const inled: Record<SamtalsStatus, string> = {
    svart: `${fornamn} har just nu svårt att nå målen i ${amne}, men lärande är utveckling — och det finns tydliga steg som snabbt ger resultat.`,
    nar: `${fornamn} når målen i ${amne} — en stabil grund att utvecklas vidare från.`,
    bra: `Det går bra för ${fornamn} i ${amne}, och utvecklingen pekar åt rätt håll.`,
    mycketBra: `Det går mycket bra för ${fornamn} i ${amne} — ett lärande som syns i resultaten.`,
    utmarkt: `${fornamn} visar utmärkta resultat i ${amne} — riktigt starkt och målmedvetet arbete!`,
    saknas: u.mall === 'ma'
      ? `Det finns inga diagnosresultat för ${fornamn} i ${amne} ännu, så det går inte att säga hur ${fornamn} ligger till i förhållande till målen — nästa diagnos blir det första underlaget.`
      : `Det finns inga resultat för ${fornamn} i ${amne} ännu, så det går inte att säga hur ${fornamn} ligger till i förhållande till målen — nästa förhör blir det första underlaget.`,
  };
  rader.push(inled[status]);

  // Matematik: Diagnoser (Magma) — alla diagnoser över varandra, en rad per diagnos ("namn<tab>xx % (nivå)"),
  // indragna med två blanksteg så att de hör till stycket Diagnoser; sist snittet och en kommentar.
  if (u.mall === 'ma') {
    const d = u.diagnoser;
    // Del 179 · Screeningen ligger separat (eget stycke), inte i diagnoslistan
    const diag = d.lista.filter((x) => x.typ !== 'screening');
    const screening = d.lista.filter((x) => x.typ === 'screening');
    if (diag.length === 0) rader.push('Diagnoser: inga Magma-diagnoser ännu.');
    else {
      rader.push('Diagnoser:');
      for (const x of diag) rader.push(`${UNDERRAD}${diagnosNamn(x.prov)}${x.typ === 'kapitel' ? ' (hela kapitlet)' : ''}\t${x.procent} % (${STATUS_TEXT[x.niva]})`);
      const kap = d.lista.filter((x) => x.typ === 'kapitel');
      // Slutresultatet: kapiteldiagnosen väger tyngst; delkapiteldiagnoserna visar utvecklingen fram till den
      if (kap.length > 0 && diag.length > 1) rader.push(`${UNDERRAD}Slutresultat (${kap.length === 1 ? 'diagnosen på hela kapitlet' : 'diagnoserna på hela kapitlen'})\t${pct(d.slut)} (${STATUS_TEXT[magmaNiva(d.slut ?? 0)]})`);
      else if (diag.length > 1) rader.push(`${UNDERRAD}Snitt av ${antalOrd(diag.length)} diagnoser\t${pct(d.snitt)} (${STATUS_TEXT[magmaNiva(d.snitt ?? 0)]})`);
      // Utveckling: delkapiteldiagnoserna jämfört med kapiteldiagnosen, annars de första diagnoserna mot de senaste
      let utv = '';
      if (kap.length > 0 && d.delkapitelSnitt !== null && d.slut !== null) {
        const diff = d.slut - d.delkapitelSnitt;
        utv = diff >= 5 ? `Utvecklingen är tydlig: från ${pct(d.delkapitelSnitt)} på delkapiteldiagnoserna till ${pct(d.slut)} på diagnosen för hela kapitlet — det som övats under kapitlet har befästs.`
          : diff <= -5 ? `På delkapiteldiagnoserna låg resultatet på ${pct(d.delkapitelSnitt)}, men på diagnosen för hela kapitlet på ${pct(d.slut)} — repetera delkapitlen igen i Magma, så att det som gick bra tidigare håller i längden.`
          : `Resultatet håller i sig: ${pct(d.delkapitelSnitt)} på delkapiteldiagnoserna och ${pct(d.slut)} på diagnosen för hela kapitlet — kunskaperna är beständiga.`;
      } else if (d.trend === 'upp') utv = 'Diagnoserna går uppåt — ett lärande som syns!';
      else if (d.trend === 'ner') utv = 'De senaste diagnoserna ligger lägre än de första — gå igenom uppgifterna som blev fel, där finns nästa steg.';
      else if (diag.length > 1) utv = 'Diagnoserna ligger på en jämn nivå.';
      const svaga = diag.filter((x) => x.niva === 'svart');
      const kommentar = [utv,
        svaga.length > 0 ? `${svaga.length === 1 ? 'En diagnos ligger' : `${antalOrd(svaga.length, true)} diagnoser ligger`} under 70 % — träna på de uppgifterna igen i Magma så att metoderna befästs.` : '',
      ].filter((x) => x !== '').join(' ');
      if (kommentar !== '') rader.push(`${UNDERRAD}${kommentar}`);
    }
    if (screening.length > 0) {
      rader.push('Screening:');
      for (const x of screening) rader.push(`${UNDERRAD}${provnamnMedStorBokstav(x.prov)}\t${x.procent} % (${STATUS_TEXT[x.niva]})`);
    }
  }

  // Matematik: Exit tickets och Läxförhör per kapitel i urvalet — bara kapitel som har förhör nämns,
  // finns inga alls utelämnas stycket helt. (NO-mallen beskriver Lektionerna och Läxläsningen nedan.)
  const l = u.lektioner;
  const lagt = l.nu !== null && l.nu < 70;
  if (u.mall === 'ma') {
    const med = u.kapitel.filter((k) => k.exit.length > 0 || k.laxforhor.length > 0 || k.magmaExit.length > 0 || k.magmaLaxforhor.length > 0);
    if (med.length > 0) {
      rader.push('Förhören:');
      const rad = (f: KapitelForhor[]) => f.map((x) => `${x.etikett !== '' ? `${x.etikett} ` : ''}${x.procent} %`).join(', ');
      for (const k of med) {
        if (k.exit.length > 0) rader.push(`${UNDERRAD}${kapitelNamn(k)} · Exit tickets\t${rad(k.exit)}`);
        if (k.laxforhor.length > 0) rader.push(`${UNDERRAD}${kapitelNamn(k)} · Läxförhör\t${rad(k.laxforhor)}`);
        if (k.magmaExit.length > 0) rader.push(`${UNDERRAD}${kapitelNamn(k)} · Magma Exit tickets\t${rad(k.magmaExit)}`);
        if (k.magmaLaxforhor.length > 0) rader.push(`${UNDERRAD}${kapitelNamn(k)} · Magma Läxförhör\t${rad(k.magmaLaxforhor)}`);
      }
      if (med.some((k) => k.laxforhor.length > 0)) rader.push(`${UNDERRAD}Alla Läxförhör går att öva hemma på Socrative.com — både inför kommande förhör och som repetition av de olika delkapitlen.`);
    }
  }
  else if (l.antal === 0) rader.push('Lektionerna: inga Exit tickets ännu — de visar vad som fastnar under lektionen.');
  else if (l.trend === 'upp') rader.push(`Lektionerna: resultaten på Exit tickets har gått från ${pct(l.borjan)} i början till ${pct(l.nu)} nu — en fin utveckling som visar att ${fornamn} tar till sig genomgångarna, håller fokus och arbetar bra på lektionerna.`);
  else if (lagt) rader.push(`Lektionerna: resultaten på Exit tickets ligger på ${pct(l.nu)}${l.trend === 'ner' ? ` (från ${pct(l.borjan)} i början)` : ''}. Låga resultat på Exit tickets kan bero på att fokus på genomgångarna brister och på att frågorna och begreppen inte blir bearbetade när de inte lämnas in. Att ta till sig genomgången, hålla fokus och arbeta på lektionen är det som lyfter resultaten.`);
  else if (l.trend === 'ner') rader.push(`Lektionerna: resultaten på Exit tickets låg på ${pct(l.borjan)} i början och på ${pct(l.nu)} de senaste gångerna. ${fornamn} tar till sig genomgångarna, och med samma fokus och arbete på lektionerna som i början kommer resultaten tillbaka.`);
  else if (l.antal === 1) rader.push(`Lektionerna: en Exit ticket hittills (${pct(l.nu)}) — en bra start att bygga vidare på.`);
  else rader.push(`Lektionerna: resultaten på Exit tickets ligger stabilt kring ${pct(l.nu)} (${l.klarade} av ${l.bedomda} över gränsen 70 %) — ${fornamn} tar till sig genomgångarna och arbetar med bra fokus på lektionerna.`);

  // Närvaro (ur quizsvaren): låg närvaro → delta mer på lektionerna
  const n = u.narvaro;
  if (n.procent !== null && n.lektioner > 0) {
    if (n.procent < 50) rader.push(`Närvaro: ${fornamn} har varit med på ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %, räknat på lektioner med genomförda quizzar). Utan att komma till skolan går det inte att nå målen eller se resultat på Läxförhören — det första steget är att vara med på lektionerna, och därifrån bygger vi vidare tillsammans.`);
    else if (n.procent < 80) rader.push(`Närvaro: ${fornamn} har varit med på ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %, räknat på lektioner med genomförda quizzar). Lärandet sker på lektionerna — genom att vara med oftare får ${fornamn} med sig genomgångarna, Exit tickets och arbetet med begreppen, och resultaten följer med.`);
    else if (n.procent < 95) rader.push(`Närvaro: ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %, räknat på lektioner med genomförda quizzar) — bra, och varje lektion räknas.`);
    else rader.push(`Närvaro: ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %, räknat på lektioner med genomförda quizzar) — ${fornamn} är med på lektionerna, en stark grund för lärandet.`);
  }

  // Läxläsning: läxförhörens utveckling, glömda begrepp, Socrative hemma (NO-mallen)
  const x = u.laxlasning;
  const socrative = 'Alla läxförhör går att öva hemma på Socrative.com — både inför kommande förhör och som repetition av de olika delkapitlen.';
  if (u.mall === 'ma') { /* matematik: förhören står per kapitel ovan */ }
  else if (x.antal === 0) rader.push(`Läxläsning: inga läxförhör ännu. ${socrative}`);
  else {
    let s = x.trend === 'upp' ? `Läxläsning: läxförhören har gått från ${pct(x.borjan)} till ${pct(x.nu)} — läxläsningen ger resultat och lärandet syns!`
      : x.trend === 'ner' ? `Läxläsning: läxförhören har gått från ${pct(x.borjan)} till ${pct(x.nu)}.`
      : x.antal === 1 ? `Läxläsning: ett läxförhör hittills (${pct(x.nu)}).`
      : `Läxläsning: läxförhören ligger kring ${pct(x.nu)} (${x.klarade} av ${x.bedomda} över gränsen 90 %).`;
    if (x.tendens === 'gorsEj') s += ` ${antalOrd(x.glomdaBegrepp.length, true)} begrepp har glömts mer än en gång, vilket tyder på att läxorna ofta inte blir gjorda. När begrepp glöms ofta blir kunskaperna inte beständiga — då blir det svårt att nå målen över tid, och nationella prov kan bli en svår utmaning. En fokuserad läxläsning, en kort stund varje dag, vänder det snabbt. ${socrative}`;
    else if (x.tendens === 'kontinuerligt') s += ` ${antalOrd(x.glomdaBegrepp.length, true)} begrepp har glömts mer än en gång — läs läxan en kort stund varje dag i stället för allt på en gång, så fastnar ${x.glomdaBegrepp.length === 1 ? 'det' : 'de'}. ${socrative}`;
    else if (x.trend === 'ner' || (x.trend === 'stabil' && x.nu !== null && x.nu < 90)) s += ` En mer fokuserad läxläsning inför varje förhör lyfter resultaten. ${socrative}`;
    else if (x.nu !== null && x.nu >= 90) s += ` Begreppen blir rätt i de senaste förhören — fortsätt så. ${socrative}`;
    else s += ` ${socrative}`;
    rader.push(s);
  }

  // Inlämningar
  const i = u.inlamningar;
  const del = (namn: string, d: InlamningsDel) => (d.antal === 0 ? null : `${namn} ${d.inlamnade}/${d.antal}`);
  const delar = [del('begrepp', i.begrepp), del('frågor', i.fragor), del('laborationer', i.laborationer)].filter((v): v is string => v !== null);
  if (delar.length === 0) rader.push('Inlämningar: inga uppgifter att följa upp ännu.');
  else {
    let s = `Inlämningar: ${delar.join(', ')} (${pct(i.procent)} av det som ska vara inne)`;
    s += i.trend === 'upp' ? ' — inlämningarna har blivit fler på senare tid, bra!' : i.trend === 'ner' ? ' — inlämningarna har blivit färre på senare tid; lämna in direkt efter lektionen så hålls det ihop.' : i.procent !== null && i.procent >= 90 ? ' — mycket bra ordning.' : i.procent !== null && i.procent < 50 ? ' — här finns mest att vinna: varje inlämning är ett tillfälle att arbeta med begreppen och frågorna och att visa vad man har lärt sig.' : '.';
    // Frågorna (Testa dig själv) är vägen till högre nivå (NO)
    const fr = i.fragor;
    if (u.mall === 'ma') { /* matematik: uppgifterna lämnas in som foto — ingen fråge-/labbtext */ }
    else if (fr.antal > 0 && fr.inlamnade < fr.antal) s += ` Frågorna är hemligheten till nästa nivå — den som inte gör dem får svårt att nå en högre nivå, så ${fr.inlamnade === 0 ? 'börja med dem' : 'gör alla frågorna'} till varje avsnitt.`;
    else if (fr.antal > 0) s += ' Alla frågorna är gjorda — där finns hemligheten till nästa nivå, fortsätt så.';
    rader.push(s);
  }

  // Prov
  if (u.digiexam.length > 0) {
    const d = u.digiexam.map((q) => ({ ...q, prov: provnamnMedStorBokstav(q.prov) })).map((p) => !p.skrivit ? `${p.prov}: inte skrivet ännu` : p.godkand === true ? `${p.prov}: godkänt${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''}` : p.godkand === false ? `${p.prov}: inte godkänt ännu${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''} — omprovet är chansen att visa det` : `${p.prov}: skrivet${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''}`);
    rader.push(`Prov: ${d.join('; ')}.`);
  }

  // Avslutning
  const avslut: Record<SamtalsStatus, string> = {
    svart: `Om ${fornamn} läser läxan en kort stund varje dag i stället för allt kvällen före förhöret, håller fokus på lektionerna och lämnar in uppgifterna i tid kommer utvecklingen att synas redan på nästa förhör — jag hjälper till på vägen.`,
    nar: `Nästa steg i utvecklingen är att lyfta något av läxförhören eller inlämningarna ett snäpp — ${fornamn} har allt som behövs.`,
    bra: `Fortsätt så här, ${fornamn} — med samma rutiner är nästa nivå nära.`,
    mycketBra: `Mycket bra jobbat, ${fornamn} — håll i rutinerna så fortsätter lärandet uppåt.`,
    utmarkt: `Fantastiskt arbete, ${fornamn} — fortsätt utmana dig själv med de svårare frågorna, där finns nästa steg i utvecklingen.`,
    saknas: u.mall === 'ma'
      ? `Det viktigaste nu är att ${fornamn} gör diagnoserna i Magma och förhören på lektionerna — först då kan vi se hur ${fornamn} ligger till i förhållande till målen och vad nästa steg är.`
      : `Det viktigaste nu är att ${fornamn} är med på lektionerna och gör förhören — först då kan vi se hur ${fornamn} ligger till i förhållande till målen och vad nästa steg är.`,
  };
  // Slutsatsen tar hänsyn till inlämningarna: laborationerna är ett eget kunskapskrav (undersökning),
  // frågorna är vägen till högre nivå
  const lab = u.inlamningar.laborationer; const fragor = u.inlamningar.fragor;
  const labSaknas = u.mall !== 'ma' && lab.antal > 0 && lab.inlamnade < lab.antal;
  const fragorSaknas = u.mall !== 'ma' && fragor.antal > 0 && fragor.inlamnade < fragor.antal;
  let slut = avslut[status];
  if (labSaknas) slut += ` Laborationerna är ett eget kunskapskrav — ${lab.antal - lab.inlamnade === 1 ? 'en laboration saknas, och den' : `${antalOrd(lab.antal - lab.inlamnade)} laborationer saknas, och de`} behöver lämnas in för att det kravet ska kunna bedömas.`;
  if (fragorSaknas) slut += ` ${labSaknas ? 'Gör också frågorna' : 'Gör frågorna'} till varje avsnitt — det är inlämningarna som öppnar vägen till högre nivå.`;
  else if (u.mall !== 'ma' && lab.antal > 0 && !labSaknas && fragor.antal > 0) slut += ' Laborationer och frågor är inlämnade — det ger underlag för hela bedömningen och för högre nivå.';
  rader.push(slut);
  // Läxförhör, Exit ticket och Inlämning skrivs med stor bokstav (visas i blå stil).
  // Högst sju stycken — underraderna (indragna) hör till sitt stycke och räknas inte.
  let stycken = 0;
  // Matematik har ett stycke till (Screening) — högst åtta
  const tak = u.mall === 'ma' ? 8 : 7;
  const klippta = rader.filter((r) => { if (!r.startsWith(UNDERRAD)) stycken += 1; return stycken <= tak; });
  return klippta.map(medStorBokstav).join('\n');
}

/**
 * Del 182 · Diagnosens namn i texten: med namnkonventionen visas "Kap 1 Diagnos 1.3 - 1.4" (utan ämne
 * och klass — filen kan heta 8B men gälla 8A:s elever); äldre namn visas som de är, med stor bokstav.
 */
export function diagnosNamn(prov: string): string {
  const nm = tolkaMagmaNamn(prov);
  return nm.kapitel !== null ? `Kap ${nm.kapitel} ${nm.kort}` : provnamnMedStorBokstav(prov);
}

/** 'läxförhör', 'exit ticket', 'inlämning' → med stor bokstav, även inne i meningar (rubriken 'Inlämningar:' berörs inte). */
export function medStorBokstav(rad: string): string {
  return rad.replace(/\bläxförhör/g, 'Läxförhör').replace(/\bexit ticket/g, 'Exit ticket').replace(/\binlämning/g, 'Inlämning');
}

/** '8b ekologi eprov' → '8b Ekologi Eprov'; 'Ekologi E-prov' behålls. */
export function provnamnMedStorBokstav(namn: string): string {
  // Svensk skrivregel: bara det första ordet (som börjar med bokstav) får stor bokstav — 'stockholm stads screening' → 'Stockholm stads screening'
  return namn.replace(/(^|\s)([a-zåäöA-ZÅÄÖ])/, (_m, f: string, b: string) => `${f}${b.toUpperCase()}`);
}

/** Orden som visas i fet blå stil: Exit ticket(s), Läxförhör(en), Inlämning(ar). */
export const SAMTALS_BLA = /Exit tickets?|Läxförhör\w*|Inlämning\w*/g;

export interface SamtalsDel { text: string; /** Exit ticket / Läxförhör / Inlämning — visas i fet blå stil. */ exit: boolean }
/** En underrad i ett stycke: "namn<tab>värde" (t.ex. en diagnos) eller löpande text (varde null). */
export interface SamtalsUnderrad { text: string; varde: string | null }
export interface SamtalsStycke {
  /** Rubriken (Diagnoser, Lektionerna, Läxläsning, Inlämningar, Prov) — fet stil; null för inledning och avslut. */
  etikett: string | null;
  delar: SamtalsDel[];
  /** Rader under stycket (indragna med UNDERRAD i texten) — diagnoserna över varandra. */
  underrader: SamtalsUnderrad[];
}

/**
 * Delar upp texten i stycken för visning: rubrik + delar där "Exit tickets" är markerat.
 * En rad som börjar med indrag (UNDERRAD) hör till föregående stycke som underrad.
 */
export function samtalsStycken(text: string): SamtalsStycke[] {
  const stycken: SamtalsStycke[] = [];
  for (const rad of text.split('\n')) {
    if (rad.trim() === '') continue;
    if (/^\s/.test(rad) && stycken.length > 0) {
      const [namn, ...rest] = rad.trim().split('\t');
      stycken[stycken.length - 1].underrader.push({ text: namn, varde: rest.length > 0 ? rest.join(' ').trim() : null });
      continue;
    }
    stycken.push(tolkaStycke(rad));
  }
  return stycken;
}

/** Antal stycken i texten (underrader räknas inte). */
export function antalStycken(text: string): number { return samtalsStycken(text).length; }

function tolkaStycke(rad: string): SamtalsStycke {
  {
    const m = rad.match(/^([^:]{2,24}):\s*(.*)$/);
    const rubrik = m !== null && (SAMTALS_RUBRIKER as readonly string[]).includes(m[1].trim()) ? m[1].trim() : null;
    const rest = rubrik === null ? rad : m![2];
    const delar: SamtalsDel[] = [];
    const re = new RegExp(SAMTALS_BLA.source, 'g');
    let i = 0; let tr: RegExpExecArray | null;
    while ((tr = re.exec(rest)) !== null) {
      if (tr.index > i) delar.push({ text: rest.slice(i, tr.index), exit: false });
      delar.push({ text: tr[0], exit: true });
      i = tr.index + tr[0].length;
    }
    if (i < rest.length) delar.push({ text: rest.slice(i), exit: false });
    return { etikett: rubrik, delar, underrader: [] };
  }
}

/** Utvärderingen för en elev i ett ämne. null när eleven saknas. */
export function utvardering(s: Struktur, elevId: string, amneId: string, idag?: string): Utvardering | null {
  const elev = s.elever.find((e) => e.id === elevId);
  const amne = s.amnen.find((a) => a.id === amneId);
  if (elev === undefined || amne === undefined) return null;
  const kort = elevkort(s, elevId, amneId);
  if (kort === null) return null;
  const serie = (k: string) => kort.serier.find((x) => x.kalla === k)!;
  const lektioner = utveckling(serie('socrative-exit'));
  const lax = utveckling(serie('socrative-laxforhor'));
  const glomda = aterkommandeFel(s, elevId, { klassId: elev.klassId, amneId }).map((b) => b.fraga);
  const tendens: Utvardering['laxlasning']['tendens'] = glomda.length >= 5 && lax.trend !== 'upp' ? 'gorsEj' : glomda.length > 0 ? 'kontinuerligt' : 'ingen';

  // Inlämningar: förfallna uppgifter i ämnet, per typ
  const o = inlamningsOversikt(s, elev.klassId, amneId, idag);
  const mina = (typ: InlamningsTyp): InlamningsDel => {
    const upg = o.forfallna.filter((u) => u.typ === typ);
    const inl = upg.filter((u) => !u.saknas.some((x) => x.elevId === elevId)).length;
    return { inlamnade: inl, antal: upg.length };
  };
  const elevRad = o.elever.find((e) => e.elevId === elevId);
  const ordnade = o.forfallna;
  let inlTrend: SamtalsTrend | null = null;
  if (ordnade.length >= 4) {
    const h = Math.floor(ordnade.length / 2);
    const andel = (lista: typeof ordnade) => (lista.filter((u) => !u.saknas.some((x) => x.elevId === elevId)).length / lista.length) * 100;
    const d = andel(ordnade.slice(ordnade.length - h)) - andel(ordnade.slice(0, h));
    inlTrend = d >= 15 ? 'upp' : d <= -15 ? 'ner' : 'stabil';
  }
  const inlamningar = { begrepp: mina('begrepp'), fragor: mina('testa'), laborationer: mina('laboration'), procent: elevRad === undefined || elevRad.antal === 0 ? null : elevRad.procent, trend: inlTrend };

  // DigiExam: per prov godkänd / ej / ej skrivit (ordinarie + omprov räknas ihop)
  const larm = digiexamLarm(s, elev.klassId, amneId, idag);
  const digiexam = larm.map((p) => {
    const ej = p.ejGodkanda.find((e) => e.elevId === elevId);
    const ejSkrivit = p.ejSkrivit.some((e) => e.elevId === elevId);
    const basta = (s.resultat ?? []).filter((r) => r.kalla === 'digiexam' && r.elevId === elevId && (r.provNyckel === p.provNyckel || r.prov === p.prov)).sort((a, b) => b.poang - a.poang)[0];
    return {
      prov: p.prov, skrivit: !ejSkrivit, godkand: ejSkrivit ? null : ej !== undefined ? false : p.grans === null ? null : true,
      poang: ej?.poang ?? basta?.poang ?? null, maxPoang: ej?.maxPoang ?? basta?.maxPoang ?? null,
    };
  });

  const mall: SamtalsMall = /^matematik/i.test(amne.namn) ? 'ma' : 'no';
  // Del 172 · Kapitlen i rapportens urval: diagnoser utanför urvalet lämnas (screening utan koder är alltid med),
  // och Exit tickets/Läxförhör sorteras in per kapitel ur quiznamnens delkapitelkoder.
  const urval = mall === 'ma' ? gemensamText(s, amneId, idag ?? '9999-12-31').valda : [];
  const urvalKoder = new Set(urval.flatMap(kapitelKoder));
  const iUrval = (koder: string[]) => urval.length === 0 || koder.length === 0 || koder.some((k) => urvalKoder.has(k));
  const magmaAlla = serie('magma');
  // Del 178 · Magma-filer döpta "Exit ticket …"/"Läxförhör …" är förhör, inte diagnoser
  const magmaTypAv = (x: { prov: string }) => tolkaMagmaNamn(x.prov).typ;
  const magma = { ...magmaAlla, punkter: magmaAlla.punkter.filter((x) => iUrval(x.koder) && (magmaTypAv(x) === 'diagnos' || magmaTypAv(x) === 'screening')) };
  // Diagnosens slag: screening (inga koder), kapiteldiagnos ("Kap 1 Diagnos" utan delkapitel, eller en diagnos som täcker
  // kapitlets alla genomförda delkapitel), annars delkapiteldiagnos ("Kap 1 Diagnos 1.3 - 1.4")
  const typFor = (prov: string, koder: string[]): DiagnosTyp => {
    const nm = tolkaMagmaNamn(prov);
    if (nm.typ === 'screening') return 'screening';
    // Namnkonventionen "Kap 1 Diagnos" (utan delkapitel) = hela kapitlet; "Kap 1 Diagnos 1.3 - 1.4" = delkapitel
    if (nm.kapitel !== null) return koder.length === 0 ? 'kapitel' : 'delkapitel';
    if (koder.length === 0) return 'delkapitel';
    const kapNr = koder[0].split('.')[0];
    const alla = (urval.find((k) => String(k.nr) === kapNr) ?? gemensamText(s, amneId, idag ?? '9999-12-31').kapitel.find((k) => String(k.nr) === kapNr))?.delkapitel.map((x) => x.kod) ?? [];
    const tackt = alla.length > 0 && alla.every((c) => koder.includes(c));
    return tackt ? 'kapitel' : 'delkapitel';
  };
  // Del 179 · Diagnosens datum ur planeringen (diagnoslektionen efter delkapitlen/kapitlet) används för ordningen;
  // vid samma datum sorteras efter delkapitel (1.3 före 1.4) och diagnosen på hela kapitlet sist i sitt kapitel.
  const planRader = mall === 'ma' ? (amnesPlanFor(s, amneId, idag, false)?.a ?? []).filter((r) => r.datum !== null) : [];
  const kodNr = (k: string) => k.split('.').map(Number);
  const jmfKod = (a: string, b: string) => { const [ka, da] = kodNr(a); const [kb, db] = kodNr(b); return ka - kb || da - db; };
  const planDatumFor = (typ: DiagnosTyp, kapitel: number | null, koder: string[]): string | null => {
    if (typ === 'screening' || planRader.length === 0) return null;
    const iKap = (r: PlaneradLektion) => kapitel === null || r.kapitel === kapitel;
    if (koder.length > 0) {
      const sista = koder.slice().sort(jmfKod)[koder.length - 1];
      let i = -1;
      planRader.forEach((r, j) => { const k = delkapitelKod(r.lektion.avsnitt); if (k !== null && koder.includes(k) && jmfKod(k, sista) === 0) i = j; });
      if (i < 0) return null;
      for (let j = i + 1; j < planRader.length; j += 1) {
        const r = planRader[j];
        if (r.kapitel !== planRader[i].kapitel) break;
        const k = delkapitelKod(r.lektion.avsnitt);
        if (k !== null && !koder.includes(k) && typ !== 'kapitel') break;
        if (r.lektion.typ === 'test') return r.datum;
      }
      return planRader[i].datum;
    }
    const egna = planRader.filter(iKap);
    const test = egna.filter((r) => r.lektion.typ === 'test');
    return (test.length > 0 ? test[test.length - 1] : egna[egna.length - 1])?.datum ?? null;
  };
  const lista: Diagnos[] = magma.punkter.filter((x) => x.procent !== null).map((x) => {
    const typ = typFor(x.prov, x.koder);
    const nm = tolkaMagmaNamn(x.prov);
    const kapitel = nm.kapitel ?? (x.koder.length > 0 ? Number(x.koder[0].split('.')[0]) : null);
    return { prov: x.prov, datum: x.datum, procent: x.procent!, niva: magmaNiva(x.procent!), poang: x.poang, maxPoang: x.maxPoang, typ, koder: x.koder, planDatum: planDatumFor(typ, kapitel, x.koder), kapitel };
  }).sort((a, b) => {
    if ((a.typ === 'screening') !== (b.typ === 'screening')) return a.typ === 'screening' ? 1 : -1;   // screeningen sist (visas separat)
    const da = a.planDatum ?? a.datum; const db = b.planDatum ?? b.datum;
    if (da !== db) return da.localeCompare(db);
    if ((a.kapitel ?? 0) !== (b.kapitel ?? 0)) return (a.kapitel ?? 0) - (b.kapitel ?? 0);
    if ((a.typ === 'kapitel') !== (b.typ === 'kapitel')) return a.typ === 'kapitel' ? 1 : -1;
    const ka = a.koder.slice().sort(jmfKod)[0]; const kb = b.koder.slice().sort(jmfKod)[0];
    if (ka !== undefined && kb !== undefined) return jmfKod(ka, kb);
    return a.prov.localeCompare(b.prov, 'sv', { numeric: true });
  });
  const mu = utveckling(magma);
  const kapDiag = lista.filter((x) => x.typ === 'kapitel');
  const delDiag = lista.filter((x) => x.typ === 'delkapitel');
  const kapitel: KapitelResultat[] = urval.map((k: SamtalsKapitel) => {
    const kk = new Set(kapitelKoder(k));
    const forhor = (kalla: string, magmaTyp?: 'exit' | 'laxforhor'): KapitelForhor[] => serie(kalla).punkter
      .filter((x) => x.procent !== null && x.koder.some((c) => kk.has(c)) && (magmaTyp === undefined || magmaTypAv(x) === magmaTyp))
      .map((x) => ({ etikett: kodEtikett(x.koder.filter((c) => kk.has(c))), prov: x.prov, datum: x.datum, procent: x.procent! }));
    return {
      nr: k.nr, namn: k.namn, exit: forhor('socrative-exit'), laxforhor: forhor('socrative-laxforhor'),
      magmaExit: forhor('magma', 'exit'), magmaLaxforhor: forhor('magma', 'laxforhor'),
    };
  });
  // Del 179 · Screeningen ligger separat: snittet räknas på diagnoserna; finns bara screening styr den statusen
  const utanScreening = lista.filter((x) => x.typ !== 'screening');
  const grund = utanScreening.length > 0 ? utanScreening : lista;
  const diagnoser = {
    lista, snitt: snitt(grund.map((x) => x.procent)),
    slut: kapDiag.length > 0 ? snitt(kapDiag.map((x) => x.procent)) : snitt(grund.map((x) => x.procent)),
    delkapitelSnitt: snitt(delDiag.map((x) => x.procent)),
    senaste: lista.length > 0 ? lista[lista.length - 1].procent : null, trend: mu.trend,
  };
  const nv = elevNarvaro(s, { klassId: elev.klassId, amneId }).find((x) => x.elev.id === elevId);
  const narvaro = { procent: nv?.narvaroProcent ?? null, lektioner: nv?.lektioner ?? 0, narvarande: nv?.narvarande ?? 0 };

  const egen = s.samtalsUtvarderingar?.[`${elevId}|${amneId}`];
  const bas = {
    elevId, namn: elev.namn, amne: amne.namn, mall, diagnoser, kapitel, lektioner, laxlasning: { ...lax, glomdaBegrepp: glomda, tendens }, inlamningar, digiexam, narvaro,
    ...(egen?.status !== undefined ? { egenStatus: egen.status } : {}), ...(egen?.text !== undefined ? { egenText: egen.text } : {}),
  };
  const status = beraknaStatus(bas);
  const fornamn = elev.namn.split(' ')[0];
  return { ...bas, status, text: samtalsText({ ...bas, status }, fornamn) };
}

/** Utvärderingar för alla elever i klassen (de som ingår i klassen), i namnordning. */
export function klassensUtvarderingar(s: Struktur, klassId: string, amneId: string, idag?: string): Utvardering[] {
  return s.elever.filter((e) => e.klassId === klassId && elevIKlassen(e, idag)).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
    .map((e) => utvardering(s, e.id, amneId, idag)).filter((u): u is Utvardering => u !== null);
}

/** Sparar lärarens egen status och/eller text för en elev och ett ämne; null tar bort. */
export function sattSamtalsUtvardering(s: Struktur, elevId: string, amneId: string, patch: { status?: SamtalsStatus | null; text?: string | null }): Struktur {
  const nyckel = `${elevId}|${amneId}`;
  const alla = { ...(s.samtalsUtvarderingar ?? {}) };
  const nu = { ...(alla[nyckel] ?? {}) };
  if (patch.status === null) delete nu.status; else if (patch.status !== undefined) nu.status = patch.status;
  if (patch.text === null || patch.text?.trim() === '') delete nu.text; else if (patch.text !== undefined) nu.text = patch.text;
  if (Object.keys(nu).length === 0) delete alla[nyckel]; else alla[nyckel] = nu;
  const { samtalsUtvarderingar: _g, ...rest } = s; void _g;
  return Object.keys(alla).length === 0 ? rest : { ...rest, samtalsUtvarderingar: alla };
}
