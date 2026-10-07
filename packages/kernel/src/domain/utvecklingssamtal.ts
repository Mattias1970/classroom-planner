/**
 * Del 164 · Utvärdering inför utvecklingssamtal — en kort text per elev och ämne
 * (högst sju rader) med positiv grundton, byggd på läxförhör, exit tickets,
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

/** Texten: högst sju rader, positiv grundton, beskrivande. */
export function samtalsText(u: Omit<Utvardering, 'text'>, fornamn: string): string {
  const status = u.egenStatus ?? u.status;
  const rader: string[] = [];
  const inled: Record<SamtalsStatus, string> = {
    svart: `${fornamn} har just nu svårt att nå målen i ${u.amne.toLowerCase()}, men det finns tydliga steg som snabbt ger resultat.`,
    nar: `${fornamn} når målen i ${u.amne.toLowerCase()} — en stabil grund att bygga vidare på.`,
    bra: `Det går bra för ${fornamn} i ${u.amne.toLowerCase()}.`,
    mycketBra: `Det går mycket bra för ${fornamn} i ${u.amne.toLowerCase()}.`,
    utmarkt: `${fornamn} visar utmärkta resultat i ${u.amne.toLowerCase()} — riktigt starkt arbete!`,
  };
  rader.push(inled[status]);

  // Lektioner: exit tickets
  const l = u.lektioner;
  if (l.antal === 0) rader.push('Exit tickets: inga resultat ännu.');
  else if (l.trend === 'upp') rader.push(`Lektionerna: exit tickets har gått från ${pct(l.borjan)} i början till ${pct(l.nu)} nu — fin utveckling som visar att ${fornamn} tar till sig genomgångarna.`);
  else if (l.trend === 'ner') rader.push(`Lektionerna: exit tickets låg på ${pct(l.borjan)} i början och ${pct(l.nu)} på de senaste — ett aktivt lektionsarbete med anteckningar under genomgången tar tillbaka det.`);
  else if (l.antal === 1) rader.push(`Lektionerna: ett exit ticket hittills, ${pct(l.nu)}.`);
  else rader.push(`Lektionerna: exit tickets ligger stabilt kring ${pct(l.nu)} (${l.klarade} av ${l.bedomda} över gränsen 70 %).`);

  // Läxläsning: läxförhör + glömda begrepp
  const x = u.laxlasning;
  if (x.antal === 0) rader.push('Läxläsning: inga läxförhör ännu.');
  else {
    let s = x.trend === 'upp' ? `Läxläsning: läxförhören har gått från ${pct(x.borjan)} till ${pct(x.nu)} — läxläsningen ger resultat!`
      : x.trend === 'ner' ? `Läxläsning: läxförhören har gått från ${pct(x.borjan)} till ${pct(x.nu)}.`
      : x.antal === 1 ? `Läxläsning: ett läxförhör hittills, ${pct(x.nu)}.`
      : `Läxläsning: läxförhören ligger kring ${pct(x.nu)} (${x.klarade} av ${x.bedomda} över gränsen 90 %).`;
    if (x.tendens === 'gorsEj') s += ` ${x.glomdaBegrepp.length} begrepp har glömts mer än en gång, vilket tyder på att läxorna ofta inte blir gjorda — en fokuserad läxläsning, en kort stund varje dag, vänder det snabbt.`;
    else if (x.tendens === 'kontinuerligt') s += ` ${x.glomdaBegrepp.length === 1 ? 'Ett begrepp' : `${x.glomdaBegrepp.length} begrepp`} har glömts mer än en gång — läs läxan lite varje dag i stället för allt på en gång, så fastnar de.`;
    else if (x.trend === 'ner' || (x.trend === 'stabil' && x.nu !== null && x.nu < 90)) s += ' En mer fokuserad läxläsning inför varje förhör lyfter resultaten.';
    else if (x.nu !== null && x.nu >= 90) s += ' Begreppen sitter — fortsätt så.';
    rader.push(s);
  }

  // Inlämningar
  const i = u.inlamningar;
  const del = (namn: string, d: InlamningsDel) => (d.antal === 0 ? null : `${namn} ${d.inlamnade}/${d.antal}`);
  const delar = [del('begrepp', i.begrepp), del('frågor', i.fragor), del('laborationer', i.laborationer)].filter((v): v is string => v !== null);
  if (delar.length === 0) rader.push('Inlämningar: inga uppgifter att följa upp ännu.');
  else {
    let s = `Inlämningar: ${delar.join(', ')} (${pct(i.procent)} av det som ska vara inne)`;
    s += i.trend === 'upp' ? ' — inlämningarna har blivit fler på senare tid, bra!' : i.trend === 'ner' ? ' — inlämningarna har blivit färre på senare tid; lämna in direkt efter lektionen så hålls det ihop.' : i.procent !== null && i.procent >= 90 ? ' — mycket bra ordning.' : i.procent !== null && i.procent < 50 ? ' — här finns mest att vinna: varje inlämning är ett tillfälle att visa vad du kan.' : '.';
    rader.push(s);
  }

  // DigiExam
  if (u.digiexam.length > 0) {
    const d = u.digiexam.map((p) => !p.skrivit ? `${p.prov}: inte skrivit ännu` : p.godkand === true ? `${p.prov}: godkänd${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''}` : p.godkand === false ? `${p.prov}: inte godkänd ännu${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''} — omprovet är chansen att visa det` : `${p.prov}: skrivet${p.poang !== null && p.maxPoang !== null ? ` (${p.poang} av ${p.maxPoang} p)` : ''}`);
    rader.push(`Prov: ${d.join('; ')}.`);
  }

  // Avslutning
  const avslut: Record<SamtalsStatus, string> = {
    svart: `Med läxan lite varje dag och inlämningarna i tid kommer ${fornamn} att se skillnad redan till nästa förhör — jag hjälper till på vägen.`,
    nar: `Nästa steg är att lyfta något av läxförhören eller inlämningarna ett snäpp — ${fornamn} har allt som behövs.`,
    bra: `Fortsätt så här, ${fornamn} — med samma rutiner är nästa nivå nära.`,
    mycketBra: `Mycket bra jobbat, ${fornamn} — håll i rutinerna så fortsätter det uppåt.`,
    utmarkt: `Fantastiskt arbete, ${fornamn} — fortsätt utmana dig själv med de svårare frågorna.`,
  };
  rader.push(avslut[status]);
  return rader.slice(0, 7).join('\n');
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

  const egen = s.samtalsUtvarderingar?.[`${elevId}|${amneId}`];
  const bas = {
    elevId, namn: elev.namn, amne: amne.namn, lektioner, laxlasning: { ...lax, glomdaBegrepp: glomda, tendens }, inlamningar, digiexam,
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
