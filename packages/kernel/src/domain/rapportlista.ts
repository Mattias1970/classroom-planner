/**
 * SuperTeach · Rapportlistan — facit över vilka Socrative-rapporter som finns. (Ring 1, I2.)
 *
 * Socratives sida Reports listar varje körd aktivitet: namn, datum och klockslag, rum och typ. Läraren klistrar
 * in listan här, och appen jämför den med filerna som lästs in: vilka rapporter är importerade, vilka är
 * spärrade som felstartade, vilka saknas — och vilka hör till rum som inte är våra och ska sorteras bort.
 *
 * Tiden i listan är när aktiviteten AVSLUTADES (lokal tid), filnamnets tid är när den STARTADE (UTC). Ett rum
 * kör en aktivitet i taget, så en fil hör till den rapport i samma rum vars fönster (förra rapportens slut,
 * rapportens slut] rymmer filens start. Quiznamnet ska också stämma.
 */
import { socrativeRum } from './amnen.js';
import type { FilPost, ResultatKalla } from './resultat.js';
import { LAGSTA_SVARSANDEL, svarsandelForFil, type Svarsandel } from './quizvakt.js';
import { filnamnsNyckel, type SparradFil } from './sparradefiler.js';
import { svenskTid, tolkaSocrativeFilnamn } from './socrative.js';
import { planForAmne } from './studieguide.js';
import type { Struktur } from './typer.js';

export interface ListadRapport {
  quiz: string;
  /** När aktiviteten avslutades, lokal tid: 'YYYY-MM-DDTHH:MM'. */
  slut: string;
  rum: string;
  /** Socratives typ: 'Quiz', 'Space Race', 'Exit Ticket' … */
  typ?: string;
}

const rumN = (rum: string): string => rum.replace(/\s+/g, '').toUpperCase();
/** Quiznamn utan skiljetecken — filnamnet tappar komman ('6.1-6.5,7.1-7.2' → '6.1-6.57.1-7.2'). */
export const quizN = (quiz: string): string => quiz.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const nyckel = (r: ListadRapport): string => `${rumN(r.rum)}|${r.slut}|${quizN(r.quiz)}`;

const DATUM_US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DATUM_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const TID = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)?$/i;
const TYPER = /^(quiz|space race|exit ticket|short answer|multiple choice|true ?\/ ?false|quick question)$/i;
const RUBRIK = /^(all|name|date|room|type|archive|delete|reports?)$/i;
const tva = (n: number): string => String(n).padStart(2, '0');

function tolkaDatum(t: string): string | null {
  const us = DATUM_US.exec(t);
  if (us !== null) {
    let m = Number(us[1]); let d = Number(us[2]);
    if (m > 12 && d <= 12) [m, d] = [d, m];   // dag/månad i stället för månad/dag
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${us[3]}-${tva(m)}-${tva(d)}` : null;
  }
  return DATUM_ISO.test(t) ? t : null;
}
function tolkaTid(t: string): string | null {
  const m = TID.exec(t);
  if (m === null) return null;
  let h = Number(m[1]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h <= 23 && Number(m[2]) <= 59 ? `${tva(h)}:${m[2]}` : null;
}

/**
 * Tolkar rapportlistan som den kopieras från Socratives sida Reports (markera allt, kopiera, klistra in):
 * namn, datum, klockslag, rum och typ i följd — på var sin rad eller tabbavgränsat. Rubriker och annat skräp
 * hoppas över. Datum som '11/2/2026' (månad/dag/år) eller '2026-11-02', tid som '10:06 PM' eller '22:06'.
 */
export function tolkaRapportlista(text: string): ListadRapport[] {
  const bitar = text.split(/\r?\n|\t/).map((x) => x.trim()).filter((x) => x !== '')
    // datum och tid i samma ruta ('11/2/2026 10:06 PM') delas
    .flatMap((x) => { const m = /^(\S+)\s+(\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*[AP]M)?)$/i.exec(x); return m !== null && tolkaDatum(m[1]) !== null ? [m[1], m[2]] : [x]; });
  const ut: ListadRapport[] = [];
  const sedda = new Set<string>();
  for (let i = 1; i + 2 < bitar.length; i++) {
    const datum = tolkaDatum(bitar[i]);
    const tid = datum === null ? null : tolkaTid(bitar[i + 1]);
    if (datum === null || tid === null) continue;
    const quiz = bitar[i - 1]; const rum = bitar[i + 2];
    if (RUBRIK.test(quiz) || tolkaDatum(rum) !== null || TYPER.test(rum)) continue;
    const typ = bitar[i + 3] !== undefined && TYPER.test(bitar[i + 3]) ? bitar[i + 3] : undefined;
    const r: ListadRapport = { quiz, slut: `${datum}T${tid}`, rum, ...(typ !== undefined ? { typ } : {}) };
    if (!sedda.has(nyckel(r))) { sedda.add(nyckel(r)); ut.push(r); }
    i += typ !== undefined ? 3 : 2;
  }
  return ut;
}

/** Lägger rapporterna till den sparade listan (samma rum, sluttid och quiz räknas som samma rapport). */
export function laggTillRapporter(s: Struktur, nya: ListadRapport[]): { s: Struktur; nya: number } {
  const finns = new Set((s.socrativeRapporter ?? []).map(nyckel));
  const till = nya.filter((r) => { const n = nyckel(r); if (finns.has(n)) return false; finns.add(n); return true; });
  if (till.length === 0) return { s, nya: 0 };
  const alla = [...(s.socrativeRapporter ?? []), ...till].sort((a, b) => b.slut.localeCompare(a.slut) || a.rum.localeCompare(b.rum));
  return { s: { ...s, socrativeRapporter: alla }, nya: till.length };
}

/** Tömmer den sparade rapportlistan. */
export function tomRapportlista(s: Struktur): Struktur {
  if (s.socrativeRapporter === undefined) return s;
  const { socrativeRapporter: _bort, ...rest } = s;
  void _bort;
  return rest;
}

// ───────────────────────── Rummen vi använder ─────────────────────────

export type RumsSlag = 'klassrum' | 'planrum' | 'begreppsrum' | 'amnesrum' | 'annat';
export interface RumInfo {
  rum: string;
  /** klassrum = ämnets rum för klassen ('BIOLOGI8AA'); planrum = står i en planering som läxförhörs- eller exitrum;
   *  begreppsrum = ämne + kapitelsiffror ('Biologi41'); amnesrum = börjar på ett av våra ämnen ('Matte8B');
   *  annat = inget av våra rum ('SO8BB') — sorteras bort. */
  slag: RumsSlag;
  klassId?: string;
  amneId?: string;
  /** Ämnets namn (för begreppsrum, där klassen avgörs av eleverna i filen). */
  amnesNamn?: string;
}

/** Rummets början för ämnet: 'MATTE' för Matematik, annars ämnesnamnet utan mellanslag ('BIOLOGI'). */
const rumsprefix = (amnesNamn: string): string => (amnesNamn === 'Matematik' ? 'MATTE' : amnesNamn.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase());

/** Vilket av våra rum är det här? Klassrummet pekar ut klass och ämne; ett rum som inte hör till något av våra ämnen är inte vårt. */
export function rumInfo(s: Struktur, rum: string): RumInfo {
  const n = rumN(rum);
  for (const a of s.amnen) {
    const k = s.klasser.find((x) => x.id === a.klassId);
    if (k !== undefined && rumN(socrativeRum(a.namn, k.namn)) === n) return { rum, slag: 'klassrum', klassId: k.id, amneId: a.id, amnesNamn: a.namn };
  }
  const iPlan = s.amnen.filter((a) => planForAmne(s, a.id).some((r) => [r.lektion.exit, r.lektion.socStart].some((x) => typeof x === 'string' && x !== '' && rumN(x) === n)));
  // Samma planrum används av alla klasser som läser ämnet — klassen avgörs då av eleverna i filen
  if (iPlan.length > 0) return { rum, slag: 'planrum', amnesNamn: iPlan[0].namn, ...(iPlan.length === 1 ? { klassId: iPlan[0].klassId, amneId: iPlan[0].id } : {}) };
  const amne = [...s.amnen].sort((a, b) => rumsprefix(b.namn).length - rumsprefix(a.namn).length).find((a) => rumsprefix(a.namn) !== '' && n.startsWith(rumsprefix(a.namn)));
  if (amne !== undefined) return { rum, slag: /^\d+$/.test(n.slice(rumsprefix(amne.namn).length)) ? 'begreppsrum' : 'amnesrum', amnesNamn: amne.namn };
  return { rum, slag: 'annat' };
}

// ───────────────────────── Listan mot filerna ─────────────────────────

/** UTC-tidpunkten för en svensk lokal tid 'YYYY-MM-DDTHH:MM' (sommartid +2, vintertid +1). */
export function utcForSvenskTid(lokal: string): string {
  for (const timmar of [2, 1]) {
    const utc = new Date(Date.parse(`${lokal}:00Z`) - timmar * 3600_000).toISOString();
    const t = svenskTid(utc);
    if (`${t.datum}T${t.tid}` === lokal) return utc;
  }
  return new Date(Date.parse(`${lokal}:00Z`) - 3600_000).toISOString();
}

export type RapportLage = 'importerad' | 'sparrad' | 'saknas' | 'annat-rum' | 'utanfor';
export interface ListadRapportRad {
  rapport: ListadRapport;
  rum: RumInfo;
  lage: RapportLage;
  /** Den inlästa filen (importerad) eller den spärrade filens namn. */
  fil?: FilPost;
  filnamn?: string;
  /** Importerad som: läxförhör, exit ticket eller övning. */
  kalla?: ResultatKalla;
  andel?: Svarsandel | null;
  /** Ett riktigt genomfört test: importerat med minst 30 % av de möjliga svaren (eller behållet av läraren). */
  riktig: boolean;
}

const MAX_OPPET_MS = 21 * 24 * 3600_000;   // en aktivitet som legat öppen längre än tre veckor räknas inte

/**
 * Hör en fil som startade då till rapporten, givet förra rapportens slut i samma rum? Listan visar slutets minut
 * och filnamnet startens, så gränserna är inklusiva; flera filer i samma fönster avgörs av den som startade först.
 */
function iFonster(startUtc: string, slutUtc: string, forraSlutUtc: string | null): boolean {
  const start = Date.parse(startUtc); const slut = Date.parse(slutUtc);
  if (start > slut || slut - start > MAX_OPPET_MS) return false;
  return forraSlutUtc === null || start >= Date.parse(forraSlutUtc);
}

/**
 * Jämför rapportlistan med det som lästs in. Varje rapport får ett läge: importerad (med typ och svarsandel),
 * spärrad (felstartad, laddas inte igen), saknas, annat rum (inte vårt — sorteras bort) eller utanför läsåret.
 */
export function rapportlage(s: Struktur): ListadRapportRad[] {
  const lista = s.socrativeRapporter ?? [];
  if (lista.length === 0) return [];
  const iLasar = (datum: string): boolean => s.skolar.length === 0 || s.skolar.some((la) => datum >= la.start && datum <= la.slut);
  const rumCache = new Map<string, RumInfo>();
  const rumFor = (rum: string): RumInfo => { const n = rumN(rum); let i = rumCache.get(n); if (i === undefined) { i = rumInfo(s, rum); rumCache.set(n, i); } return i; };

  // Filerna appen känner till: importerade (med rum) och spärrade (rummet via ämnet)
  interface Kand { startUtc: string; rum: string | null; quiz: string; fil?: FilPost; sparr?: SparradFil; tagen: boolean }
  const kandidater: Kand[] = [];
  const medNamn = new Set<string>();   // samma fil som '(1)'-kopia räknas en gång
  for (const f of s.filregister ?? []) {
    const info = tolkaSocrativeFilnamn(f.filnamn.replace(/ \(\d+\)(\.xlsx)$/i, '$1'));
    if (info === null || medNamn.has(filnamnsNyckel(f.filnamn))) continue;
    medNamn.add(filnamnsNyckel(f.filnamn));
    kandidater.push({ startUtc: info.startUtc, rum: f.rum !== undefined ? rumN(f.rum) : null, quiz: quizN(f.prov), fil: f, tagen: false });
  }
  for (const f of s.sparradeFiler ?? []) {
    const info = tolkaSocrativeFilnamn(f.filnamn.replace(/ \(\d+\)(\.xlsx)$/i, '$1'));
    if (info === null || medNamn.has(filnamnsNyckel(f.filnamn))) continue;
    medNamn.add(filnamnsNyckel(f.filnamn));
    const a = s.amnen.find((x) => x.id === f.amneId); const k = a === undefined ? undefined : s.klasser.find((x) => x.id === a.klassId);
    kandidater.push({ startUtc: info.startUtc, rum: f.rum !== undefined ? rumN(f.rum) : a !== undefined && k !== undefined ? rumN(socrativeRum(a.namn, k.namn)) : null,
      quiz: quizN(f.prov ?? info.quiz), sparr: f, tagen: false });
  }

  kandidater.sort((x, y) => x.startUtc.localeCompare(y.startUtc));

  // Per rum i tidsordning: förra rapportens slut är fönstrets början
  const perRum = new Map<string, ListadRapport[]>();
  for (const r of lista) { const n = rumN(r.rum); const l = perRum.get(n); if (l === undefined) perRum.set(n, [r]); else l.push(r); }
  const rader = new Map<ListadRapport, ListadRapportRad>();
  for (const [n, rs] of perRum) {
    const rum = rumFor(rs[0].rum);
    rs.sort((a, b) => a.slut.localeCompare(b.slut));
    let forra: string | null = null;
    for (const r of rs) {
      const slutUtc = utcForSvenskTid(r.slut);
      const bas = { rapport: r, rum, riktig: false };
      if (!iLasar(r.slut.slice(0, 10))) rader.set(r, { ...bas, lage: 'utanfor' });
      else if (rum.slag === 'annat') rader.set(r, { ...bas, lage: 'annat-rum' });
      else {
        const q = quizN(r.quiz);
        const k = kandidater.find((x) => !x.tagen && x.quiz === q && (x.rum === null || x.rum === n) && iFonster(x.startUtc, slutUtc, forra));
        if (k === undefined) rader.set(r, { ...bas, lage: 'saknas' });
        else if (k.sparr !== undefined) { k.tagen = true; rader.set(r, { ...bas, lage: 'sparrad', filnamn: k.sparr.filnamn }); }
        else {
          k.tagen = true;
          const fil = k.fil!;
          const andel = svarsandelForFil(s, fil);
          const riktig = fil.behallTrotsFaSvar === true || andel === null || andel.andel >= LAGSTA_SVARSANDEL;
          rader.set(r, { ...bas, lage: 'importerad', fil, filnamn: fil.filnamn, kalla: fil.kalla, andel, riktig });
        }
      }
      forra = slutUtc;
    }
  }
  return lista.map((r) => rader.get(r)!);
}

export interface RumSummering {
  rum: string;
  info: RumInfo;
  /** Rapporter i listan för rummet (inom läsåret). */
  totalt: number;
  importerade: number;
  sparrade: number;
  saknas: number;
  /** Riktigt genomförda test per typ. */
  laxforhor: number;
  exit: number;
  ovning: number;
  /** Importerade men med under 30 % av de möjliga svaren (läraren har inte tagit ställning än). */
  faSvar: number;
}

/** Summerar läget per rum — våra rum först, sedan rum som sorteras bort. Rapporter utanför läsåret räknas inte. */
export function summeraRapporter(rader: ListadRapportRad[]): RumSummering[] {
  const ut = new Map<string, RumSummering>();
  for (const r of rader) {
    if (r.lage === 'utanfor') continue;
    const n = rumN(r.rapport.rum);
    let x = ut.get(n);
    if (x === undefined) { x = { rum: n, info: r.rum, totalt: 0, importerade: 0, sparrade: 0, saknas: 0, laxforhor: 0, exit: 0, ovning: 0, faSvar: 0 }; ut.set(n, x); }
    x.totalt += 1;
    if (r.lage === 'importerad') {
      x.importerade += 1;
      if (!r.riktig) x.faSvar += 1;
      else if (r.kalla === 'socrative-laxforhor') x.laxforhor += 1;
      else if (r.kalla === 'socrative-exit') x.exit += 1;
      else if (r.kalla === 'socrative-ovning') x.ovning += 1;
    } else if (r.lage === 'sparrad') x.sparrade += 1;
    else if (r.lage === 'saknas') x.saknas += 1;
  }
  const ordning: Record<RumsSlag, number> = { klassrum: 0, planrum: 1, begreppsrum: 2, amnesrum: 3, annat: 4 };
  return [...ut.values()].sort((a, b) => ordning[a.info.slag] - ordning[b.info.slag] || a.rum.localeCompare(b.rum));
}

/**
 * Vilken rapport i listan hör en fil till, innan den importerats? (rum och quiz ur filen, start ur filnamnet.)
 * null när listan är tom eller filen inte finns i den.
 */
export function rapportForFil(s: Struktur, fil: { filnamn: string; rum: string; quiz: string }): ListadRapport | null {
  const info = tolkaSocrativeFilnamn(fil.filnamn.replace(/ \(\d+\)(\.xlsx)$/i, '$1'));
  if (info === null) return null;
  const n = rumN(fil.rum); const q = quizN(fil.quiz);
  const rs = (s.socrativeRapporter ?? []).filter((r) => rumN(r.rum) === n).sort((a, b) => a.slut.localeCompare(b.slut));
  let forra: string | null = null;
  for (const r of rs) {
    const slutUtc = utcForSvenskTid(r.slut);
    if (quizN(r.quiz) === q && iFonster(info.startUtc, slutUtc, forra)) return r;
    forra = slutUtc;
  }
  return null;
}

/** Filnamnsnyckeln används av den som vill jämföra en rapports fil med en annan (utan '(1)', gemener). */
export const rapportFilnyckel = filnamnsNyckel;
