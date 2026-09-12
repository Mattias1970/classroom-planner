/**
 * SuperTeach · Trendkoll — lär eleven sig eller glömmer den?
 *
 * De aggregerande läxförhören återanvänder frågorna: rummet Biologi41
 * innehåller delkapitel 4.1, Biologi412 innehåller 4.1 OCH 4.2, och de
 * första frågorna är ordagrant desamma. Genom att para ihop frågor med
 * identisk text mellan två förhör kan varje elevs svar jämföras:
 *
 *   fel → rätt   = eleven har lärt sig
 *   rätt → fel   = eleven har glömt (eller gissade rätt förra gången)
 *
 * Netto (lärt − glömt) per elev och över tid svarar på frågan om eleven
 * glömmer mer än den lär sig. Ämne/kapitel/delkapitel läses ur rummet
 * ('Biologi412' = ämne Biologi, kapitel 4, delkapitel 1 och 2), men
 * funktionerna fungerar för vilket ämne som helst.
 */
import type { Elev, Struktur } from './typer.js';
import type { Resultat, ResultatKalla } from './resultat.js';

/** Normaliserad frågetext — skiljetecken, mellanslag och skiftläge ignoreras. */
// Samma frågetexter normaliseras tusentals gånger per omritning — cacha resultatet
const nyckelCache = new Map<string, string>();
export function fragenyckel(fraga: string): string {
  const c = nyckelCache.get(fraga);
  if (c !== undefined) return c;
  const n = fraga.toLowerCase().replace(/[.,;:!?"'()[\]{}…]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nyckelCache.size > 20000) nyckelCache.clear();
  nyckelCache.set(fraga, n);
  return n;
}

/** 'B • ekosystem' → 'ekosystem' — svarstexten utan alternativbokstav och punkt. */
export function svarText(svar: string): string {
  // Socrative skriver 'B • biotop', 'B. biotop' eller 'b) biotop' — bokstaven följs av punkt, parentes eller bullet
  return svar.replace(/^[a-e]\s*(?:[.)]|[•·])\s*/i, '').replace(/[•·]/g, ' ').replace(/\s+/g, ' ').trim();
}

function svarNyckel(svar: string): string {
  // Socrative skriver 'A. • ekologi'; alternativbokstaven räcker inte, texten avgör
  return svar.toLowerCase().replace(/^[a-e]\s*[.)]\s*/i, '').replace(/[•·]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Sant/falskt/null (obesvarad eller okänt facit) för ett svar. */
export function arRatt(svar: string, facit: string | null): boolean | null {
  const s = svarNyckel(svar);
  if (s === '') return null;
  if (facit === null) return null;
  return s === svarNyckel(facit);
}

export type Overgang = 'lart' | 'glomt' | 'kvar-ratt' | 'kvar-fel';

export interface FragaJamforelse {
  fraga: string;
  fore: boolean | null;
  efter: boolean | null;
  overgang: Overgang | null;
}

export interface ElevJamforelse {
  elev: Elev;
  fragor: FragaJamforelse[];
  lart: number;
  glomt: number;
  kvarRatt: number;
  kvarFel: number;
  /** lärt − glömt. */
  netto: number;
}

export interface ParJamforelse {
  /** Tidigare provet. */
  fore: { prov: string; datum: string; rum?: string };
  /** Senare provet. */
  efter: { prov: string; datum: string; rum?: string };
  /** Antal frågor som förekommer ordagrant i båda. */
  gemensamma: number;
  elever: ElevJamforelse[];
  lart: number;
  glomt: number;
  netto: number;
  /** Andel av de gemensamma svaren som var rätt förra gången och blev fel (0–100). */
  glomskeProcent: number | null;
  /** Andel av de tidigare felen som blev rätt (0–100). */
  inlarningsProcent: number | null;
}

function svarKarta(r: Resultat): Map<string, { svar: string; ratt: boolean | null }> {
  const m = new Map<string, { svar: string; ratt: boolean | null }>();
  for (const f of r.svar ?? []) m.set(fragenyckel(f.fraga), { svar: f.svar, ratt: f.ratt });
  return m;
}

/** Jämför två resultatuppsättningar (samma prov vid två tillfällen) fråga för fråga. */
export function jamforProv(
  fore: Resultat[], efter: Resultat[], elever: Elev[],
): ParJamforelse | null {
  if (fore.length === 0 || efter.length === 0) return null;
  const forePerElev = new Map(fore.map((r) => [r.elevId, r]));
  const efterPerElev = new Map(efter.map((r) => [r.elevId, r]));
  // Gemensamma frågor = snittet av frågemängderna, byggt en gång per prov (inte per elevpar)
  const efterFragor = new Set<string>();
  for (const r of efter) for (const f of r.svar ?? []) efterFragor.add(fragenyckel(f.fraga));
  const gemensammaFragor = new Map<string, string>();
  for (const r of fore) {
    for (const f of r.svar ?? []) {
      const n = fragenyckel(f.fraga);
      if (efterFragor.has(n) && !gemensammaFragor.has(n)) gemensammaFragor.set(n, f.fraga);
    }
  }
  if (gemensammaFragor.size === 0) return null;
  const rader: ElevJamforelse[] = [];
  for (const elev of elever) {
    const a = forePerElev.get(elev.id); const b = efterPerElev.get(elev.id);
    if (a === undefined || b === undefined) continue;
    const ka = svarKarta(a); const kb = svarKarta(b);
    const fragor: FragaJamforelse[] = [...gemensammaFragor.entries()].map(([n, text]) => {
      const f1 = ka.get(n)?.ratt ?? null; const f2 = kb.get(n)?.ratt ?? null;
      const overgang: Overgang | null = f1 === null || f2 === null ? null
        : f1 && f2 ? 'kvar-ratt' : !f1 && f2 ? 'lart' : f1 && !f2 ? 'glomt' : 'kvar-fel';
      return { fraga: text, fore: f1, efter: f2, overgang };
    });
    const rakna = (o: Overgang) => fragor.filter((f) => f.overgang === o).length;
    const lart = rakna('lart'); const glomt = rakna('glomt');
    rader.push({ elev, fragor, lart, glomt, kvarRatt: rakna('kvar-ratt'), kvarFel: rakna('kvar-fel'), netto: lart - glomt });
  }
  const lart = rader.reduce((n, r) => n + r.lart, 0);
  const glomt = rader.reduce((n, r) => n + r.glomt, 0);
  const varRatt = rader.reduce((n, r) => n + r.kvarRatt + r.glomt, 0);
  const varFel = rader.reduce((n, r) => n + r.kvarFel + r.lart, 0);
  return {
    fore: { prov: fore[0].prov, datum: fore[0].datum, ...(fore[0].rum !== undefined ? { rum: fore[0].rum } : {}) },
    efter: { prov: efter[0].prov, datum: efter[0].datum, ...(efter[0].rum !== undefined ? { rum: efter[0].rum } : {}) },
    gemensamma: gemensammaFragor.size,
    elever: rader, lart, glomt, netto: lart - glomt,
    glomskeProcent: varRatt === 0 ? null : Math.round((glomt / varRatt) * 100),
    inlarningsProcent: varFel === 0 ? null : Math.round((lart / varFel) * 100),
  };
}

/** Ett steg i elevens utveckling: en jämförelse mellan två prov. */
export interface TrendSteg {
  netto: number;
  lart: number;
  glomt: number;
  /** Provet som jämförs mot (det senare av de två). */
  prov: string;
  datum: string;
  /** Det tidigare provet. */
  foreProv: string;
  foreDatum: string;
  /** Frågorna som gick från fel till rätt. */
  lartFragor: string[];
  /** Frågorna som gick från rätt till fel. */
  glomtFragor: string[];
  /** 'begrepp — innebörd' för samma frågor, när begreppet kunde läsas ur de rätta svaren. */
  lartBegrepp: string[];
  glomtBegrepp: string[];
}

export interface TrendkollElev {
  elev: Elev;
  lart: number;
  glomt: number;
  netto: number;
  /** Netto per jämförelse, kronologiskt — visar om glömskan ökar. */
  serie: number[];
  /** Samma jämförelser med datum och vilka begrepp som vändes. */
  steg: TrendSteg[];
  /** 'lar' = lär mer än glömmer, 'glommer' = tvärtom, 'jamn' = lika. */
  omdome: 'lar' | 'glommer' | 'jamn';
}

export interface Trendkoll {
  par: ParJamforelse[];
  elever: TrendkollElev[];
  lart: number;
  glomt: number;
  netto: number;
  glomskeProcent: number | null;
  inlarningsProcent: number | null;
  /** Elever vars glömska överstiger inlärningen. */
  glommer: Elev[];
  sammanfattning: string;
}

export interface TrendkollFilter { klassId: string; amneId?: string; kallor?: ResultatKalla[]; fran?: string; till?: string; }

/**
 * Trendkoll för en klass: parar ihop tillfällen kronologiskt (varje tillfälle
 * mot nästa som delar minst en fråga) och summerar lärt/glömt.
 */
export function trendkoll(s: Struktur, f: TrendkollFilter): Trendkoll {
  const elever = s.elever.filter((e) => e.klassId === f.klassId);
  const elevIds = new Set(elever.map((e) => e.id));
  const rs = (s.resultat ?? []).filter((r) => elevIds.has(r.elevId)
    && (f.amneId === undefined || r.amneId === f.amneId)
    && (f.kallor === undefined || f.kallor.includes(r.kalla))
    && (f.fran === undefined || r.datum >= f.fran) && (f.till === undefined || r.datum <= f.till)
    && (r.svar ?? []).length > 0);
  // Gruppera per tillfälle (datum + prov), kronologiskt
  const grupper = new Map<string, Resultat[]>();
  for (const r of rs) {
    const n = `${r.datum}|${r.kalla}|${r.prov}`;
    grupper.set(n, [...(grupper.get(n) ?? []), r]);
  }
  const tillfallen = [...grupper.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  const par: ParJamforelse[] = [];
  for (let i = 0; i < tillfallen.length - 1; i++) {
    for (let j = i + 1; j < tillfallen.length; j++) {
      const p = jamforProv(tillfallen[i], tillfallen[j], elever);
      if (p !== null) { par.push(p); break; } // varje tillfälle mot närmast följande med gemensamma frågor
    }
  }
  // Begreppet bakom frågan ur de rätta svaren i urvalet
  const begreppAv = new Map<string, string>();
  for (const t of tillfallen) for (const r of t) for (const sv of r.svar ?? []) {
    if (sv.ratt === true) { const txt = svarText(sv.svar); if (txt !== '' && !begreppAv.has(fragenyckel(sv.fraga))) begreppAv.set(fragenyckel(sv.fraga), txt); }
  }
  const medBegrepp = (fraga: string): string => { const b = begreppAv.get(fragenyckel(fraga)); return b === undefined ? fraga : `${b} — ${fraga}`; };
  const perElev: TrendkollElev[] = elever.map((elev) => {
    const rader = par.map((p) => p.elever.find((e) => e.elev.id === elev.id)).filter((r): r is ElevJamforelse => r !== undefined);
    const lart = rader.reduce((n, r) => n + r.lart, 0);
    const glomt = rader.reduce((n, r) => n + r.glomt, 0);
    // Bygg ur paren direkt — rader är filtrerad och har inte samma index
    const steg: TrendSteg[] = par
      .map((p) => ({ p, r: p.elever.find((e) => e.elev.id === elev.id) }))
      .filter((x): x is { p: ParJamforelse; r: ElevJamforelse } => x.r !== undefined)
      .map(({ p, r }) => ({
        netto: r.netto, lart: r.lart, glomt: r.glomt,
        prov: p.efter.prov, datum: p.efter.datum, foreProv: p.fore.prov, foreDatum: p.fore.datum,
        lartFragor: r.fragor.filter((f) => f.overgang === 'lart').map((f) => f.fraga),
        glomtFragor: r.fragor.filter((f) => f.overgang === 'glomt').map((f) => f.fraga),
        lartBegrepp: r.fragor.filter((f) => f.overgang === 'lart').map((f) => medBegrepp(f.fraga)),
        glomtBegrepp: r.fragor.filter((f) => f.overgang === 'glomt').map((f) => medBegrepp(f.fraga)),
      }));
    return {
      elev, lart, glomt, netto: lart - glomt, serie: rader.map((r) => r.netto), steg,
      omdome: (lart > glomt ? 'lar' : glomt > lart ? 'glommer' : 'jamn') as TrendkollElev['omdome'],
    };
  }).filter((r) => r.serie.length > 0);
  const lart = par.reduce((n, p) => n + p.lart, 0);
  const glomt = par.reduce((n, p) => n + p.glomt, 0);
  const varRatt = par.reduce((n, p) => n + p.elever.reduce((m, e) => m + e.kvarRatt + e.glomt, 0), 0);
  const varFel = par.reduce((n, p) => n + p.elever.reduce((m, e) => m + e.kvarFel + e.lart, 0), 0);
  const glommer = perElev.filter((r) => r.omdome === 'glommer').map((r) => r.elev);
  const sammanfattning = par.length === 0
    ? 'Inga förhör med gemensamma frågor i urvalet — trendkollen kräver att samma fråga ställs igen (t.ex. i ett kumulativt läxförhör).'
    : `${lart} svar gick från fel till rätt och ${glomt} från rätt till fel (netto ${lart - glomt >= 0 ? '+' : ''}${lart - glomt}). `
      + (glommer.length === 0 ? 'Ingen elev glömmer mer än den lär sig.' : `${glommer.length} elever glömmer mer än de lär sig: ${glommer.map((e) => e.namn).join(', ')}.`);
  return {
    par, elever: perElev, lart, glomt, netto: lart - glomt,
    glomskeProcent: varRatt === 0 ? null : Math.round((glomt / varRatt) * 100),
    inlarningsProcent: varFel === 0 ? null : Math.round((lart / varFel) * 100),
    glommer, sammanfattning,
  };
}
