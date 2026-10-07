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
import { elevIKlassen } from './struktur.js';
import type { Struktur } from './typer.js';

export type SamtalsStatus = 'svart' | 'nar' | 'bra' | 'mycketBra' | 'utmarkt';
export const STATUS_TEXT: Record<SamtalsStatus, string> = {
  svart: 'har svårt att nå målen', nar: 'når målen', bra: 'går bra', mycketBra: 'mycket bra', utmarkt: 'utmärkt',
};
export const STATUS_ORDNING: SamtalsStatus[] = ['svart', 'nar', 'bra', 'mycketBra', 'utmarkt'];

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

export interface Utvardering {
  elevId: string;
  namn: string;
  amne: string;
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
  const delar: Array<[number | null, number]> = [
    [niva(u.laxlasning.nu, [75, 90, 94, 97]), 2],
    [niva(u.lektioner.nu, [55, 70, 81, 91]), 1],
    [niva(u.inlamningar.procent, [50, 75, 90, 100]), 1],
  ];
  const med = delar.filter((d): d is [number, number] => d[0] !== null);
  if (med.length === 0) return 'nar';
  const v = med.reduce((a, [n, w]) => a + n * w, 0) / med.reduce((a, [, w]) => a + w, 0);
  return STATUS_ORDNING[Math.max(0, Math.min(4, Math.round(v)))];
}

const pct = (v: number | null) => (v === null ? '–' : `${v} %`);

/** Rubrikerna som inleder styckena (fet stil i visning och Word). */
export const SAMTALS_RUBRIKER = ['Lektionerna', 'Närvaro', 'Läxläsning', 'Inlämningar', 'Prov'] as const;

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
  };
  rader.push(inled[status]);

  // Lektionerna: Exit tickets — att ta till sig genomgångarna i kombination med fokus och arbete på lektionen
  const l = u.lektioner;
  const lagt = l.nu !== null && l.nu < 70;
  if (l.antal === 0) rader.push('Lektionerna: inga Exit tickets ännu — de visar vad som fastnar under lektionen.');
  else if (l.trend === 'upp') rader.push(`Lektionerna: Exit tickets har gått från ${pct(l.borjan)} i början till ${pct(l.nu)} nu — en fin utveckling som visar att ${fornamn} tar till sig genomgångarna och håller bra fokus och arbete på lektionerna.`);
  else if (lagt) rader.push(`Lektionerna: Exit tickets ligger på ${pct(l.nu)}${l.trend === 'ner' ? ` (från ${pct(l.borjan)} i början)` : ''}. Låga Exit tickets kan bero på sämre fokus på genomgångarna och på att frågorna och begreppen inte blir arbetade med när de inte lämnas in — att ta till sig genomgången, hålla fokus och arbeta på lektionen är det som lyfter det.`);
  else if (l.trend === 'ner') rader.push(`Lektionerna: Exit tickets låg på ${pct(l.borjan)} i början och ${pct(l.nu)} på de senaste — ${fornamn} tar till sig genomgångarna; med samma fokus och arbete på lektionerna som i början kommer det tillbaka.`);
  else if (l.antal === 1) rader.push(`Lektionerna: ett Exit ticket hittills, ${pct(l.nu)} — en bra start att bygga vidare på.`);
  else rader.push(`Lektionerna: Exit tickets ligger stabilt kring ${pct(l.nu)} (${l.klarade} av ${l.bedomda} över gränsen 70 %) — ${fornamn} tar till sig genomgångarna och arbetar med bra fokus på lektionerna.`);

  // Närvaro (ur quizsvaren): låg närvaro → delta mer på lektionerna
  const n = u.narvaro;
  if (n.procent !== null && n.lektioner > 0) {
    if (n.procent < 50) rader.push(`Närvaro: ${fornamn} har varit med på ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %). Utan att komma till skolan går det inte att nå målen eller se resultat på Läxförhören — det första steget är att delta på lektionerna, och därifrån bygger vi vidare tillsammans.`);
    else if (n.procent < 80) rader.push(`Närvaro: ${fornamn} har varit med på ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %). Lärandet sker på lektionerna — genom att delta mer kommer genomgångar, Exit tickets och arbetet med begreppen på plats, och resultaten följer med.`);
    else if (n.procent < 95) rader.push(`Närvaro: ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %) — bra, och varje lektion räknas.`);
    else rader.push(`Närvaro: ${n.narvarande} av ${n.lektioner} lektioner (${n.procent} %) — ${fornamn} är med på lektionerna, en stark grund för lärandet.`);
  }

  // Läxläsning: läxförhörens utveckling, glömda begrepp, Socrative hemma
  const x = u.laxlasning;
  const socrative = 'Alla läxförhör går att öva hemma på Socrative.com — både inför kommande förhör och på de olika delkapitlen.';
  if (x.antal === 0) rader.push(`Läxläsning: inga läxförhör ännu. ${socrative}`);
  else {
    let s = x.trend === 'upp' ? `Läxläsning: läxförhören har gått från ${pct(x.borjan)} till ${pct(x.nu)} — läxläsningen ger resultat och lärandet syns!`
      : x.trend === 'ner' ? `Läxläsning: läxförhören har gått från ${pct(x.borjan)} till ${pct(x.nu)}.`
      : x.antal === 1 ? `Läxläsning: ett läxförhör hittills, ${pct(x.nu)}.`
      : `Läxläsning: läxförhören ligger kring ${pct(x.nu)} (${x.klarade} av ${x.bedomda} över gränsen 90 %).`;
    if (x.tendens === 'gorsEj') s += ` ${x.glomdaBegrepp.length} begrepp har glömts mer än en gång, vilket tyder på att läxorna ofta inte blir gjorda. Glöms begrepp ofta blir kunskaperna inte beständiga — då blir det svårt att nå målen över tid, och nationella prov kan bli en svår utmaning. En fokuserad läxläsning, en kort stund varje dag, vänder det snabbt. ${socrative}`;
    else if (x.tendens === 'kontinuerligt') s += ` ${x.glomdaBegrepp.length === 1 ? 'Ett begrepp' : `${x.glomdaBegrepp.length} begrepp`} har glömts mer än en gång — läs läxan lite varje dag i stället för allt på en gång, så fastnar de. ${socrative}`;
    else if (x.trend === 'ner' || (x.trend === 'stabil' && x.nu !== null && x.nu < 90)) s += ` En mer fokuserad läxläsning inför varje förhör lyfter resultaten. ${socrative}`;
    else if (x.nu !== null && x.nu >= 90) s += ` Begreppen sitter — fortsätt så. ${socrative}`;
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
    s += i.trend === 'upp' ? ' — inlämningarna har blivit fler på senare tid, bra!' : i.trend === 'ner' ? ' — inlämningarna har blivit färre på senare tid; lämna in direkt efter lektionen så hålls det ihop.' : i.procent !== null && i.procent >= 90 ? ' — mycket bra ordning.' : i.procent !== null && i.procent < 50 ? ' — här finns mest att vinna: varje inlämning är ett tillfälle att arbeta med begreppen och frågorna, och att visa vad du lärt dig.' : '.';
    rader.push(s);
  }

  // Prov
  if (u.digiexam.length > 0) {
    const d = u.digiexam.map((q) => ({ ...q, prov: provnamnMedStorBokstav(q.prov) })).map((p) => !p.skrivit ? `${p.prov}: inte skrivit ännu` : p.godkand === true ? `${p.prov}: godkänd${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''}` : p.godkand === false ? `${p.prov}: inte godkänd ännu${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''} — omprovet är chansen att visa det` : `${p.prov}: skrivet${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''}`);
    rader.push(`Prov: ${d.join('; ')}.`);
  }

  // Avslutning
  const avslut: Record<SamtalsStatus, string> = {
    svart: `Med läxan lite varje dag, fokus på lektionerna och inlämningarna i tid kommer ${fornamn} att se sin utveckling redan till nästa förhör — jag hjälper till på vägen.`,
    nar: `Nästa steg i utvecklingen är att lyfta något av läxförhören eller inlämningarna ett snäpp — ${fornamn} har allt som behövs.`,
    bra: `Fortsätt så här, ${fornamn} — med samma rutiner är nästa nivå nära.`,
    mycketBra: `Mycket bra jobbat, ${fornamn} — håll i rutinerna så fortsätter lärandet uppåt.`,
    utmarkt: `Fantastiskt arbete, ${fornamn} — fortsätt utmana dig själv med de svårare frågorna, där finns nästa steg i utvecklingen.`,
  };
  rader.push(avslut[status]);
  // Läxförhör, Exit ticket och Inlämning skrivs med stor bokstav (visas i blå stil)
  return rader.slice(0, 7).map(medStorBokstav).join('\n');
}

/** 'läxförhör', 'exit ticket', 'inlämning' → med stor bokstav, även inne i meningar (rubriken 'Inlämningar:' berörs inte). */
export function medStorBokstav(rad: string): string {
  return rad.replace(/\bläxförhör/g, 'Läxförhör').replace(/\bexit ticket/g, 'Exit ticket').replace(/\binlämning/g, 'Inlämning');
}

/** '8b ekologi eprov' → '8b Ekologi Eprov'; 'Ekologi E-prov' behålls. */
export function provnamnMedStorBokstav(namn: string): string {
  return namn.replace(/(^|\s)([a-zåäö])/g, (_m, f: string, b: string) => `${f}${b.toUpperCase()}`);
}

/** Orden som visas i fet blå stil: Exit ticket(s), Läxförhör(en), Inlämning(ar). */
export const SAMTALS_BLA = /Exit tickets?|Läxförhör\w*|Inlämning\w*/g;

export interface SamtalsDel { text: string; /** Exit ticket / Läxförhör / Inlämning — visas i fet blå stil. */ exit: boolean }
export interface SamtalsStycke { /** Rubriken (Lektionerna, Läxläsning, Inlämningar, Prov) — fet stil; null för inledning och avslut. */ etikett: string | null; delar: SamtalsDel[] }

/** Delar upp texten i stycken för visning: rubrik + delar där "Exit tickets" är markerat. */
export function samtalsStycken(text: string): SamtalsStycke[] {
  return text.split('\n').filter((r) => r.trim() !== '').map((rad) => {
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
    return { etikett: rubrik, delar };
  });
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

  const nv = elevNarvaro(s, { klassId: elev.klassId, amneId }).find((x) => x.elev.id === elevId);
  const narvaro = { procent: nv?.narvaroProcent ?? null, lektioner: nv?.lektioner ?? 0, narvarande: nv?.narvarande ?? 0 };

  const egen = s.samtalsUtvarderingar?.[`${elevId}|${amneId}`];
  const bas = {
    elevId, namn: elev.namn, amne: amne.namn, lektioner, laxlasning: { ...lax, glomdaBegrepp: glomda, tendens }, inlamningar, digiexam, narvaro,
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
