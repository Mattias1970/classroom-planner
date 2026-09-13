/**
 * SuperTeach · Delkapitel i kumulativa förhör.
 *
 * Läxförhören byggs på: Biologi41 är ungefär halva Biologi412, och
 * Biologi41 + Biologi42 är hela Biologi412. Genom att spåra vilken fråga
 * som dök upp först i vilket rum kan varje fråga knytas till det
 * delkapitel den introducerades i. Då går det att se om eleven fortfarande
 * kommer ihåg 4.1-delen när provet heter 41234.
 *
 * (Ring 1, I2: ingen fetch/DOM/lagring.)
 */
import type { Elev, Struktur } from './typer.js';
import { begreppUrFacit, type Resultat, type ResultatKalla } from './resultat.js';
import { fragenyckel, svarText } from './trendkoll.js';
import { koderForProv } from './elevrapport.js';

export interface DelkapitelFilter { klassId: string; amneId?: string; kallor?: ResultatKalla[]; fran?: string; till?: string; elevId?: string; }

/** Ett tillfälle med frågor grupperade per delkapitel. */
export interface Tillfalle { nyckel: string; prov: string; datum: string; tid?: string; kalla: ResultatKalla; rum?: string; resultat: Resultat[] }

/** Läxförhöret inleder lektionen, exit ticket avslutar den; övningar hamnar sist. */
const TYP_ORDNING: Record<ResultatKalla, number> = {
  'socrative-laxforhor': 0, magma: 1, digiexam: 2, 'socrative-exit': 3, 'socrative-ovning': 4,
};

/** Det som behövs för att ordna ett tillfälle i tid. */
export interface TidsNyckel { datum: string; tid?: string; kalla: ResultatKalla; prov: string }

/** Kronologisk ordning: datum, sedan klockslag när det finns, annars lektionens rytm. */
export function jamforTillfalle(a: TidsNyckel, b: TidsNyckel): number {
  if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);
  if (a.tid !== undefined && b.tid !== undefined && a.tid !== b.tid) return a.tid.localeCompare(b.tid);
  if (a.kalla !== b.kalla) return TYP_ORDNING[a.kalla] - TYP_ORDNING[b.kalla];
  return a.prov.localeCompare(b.prov, 'sv');
}

// Samma memoisering som i dashboard.ts: tillfällena räknas om bara när strukturen
// eller filtret ändras, inte vid varje omritning av gränssnittet.
const tillfallenCache = new WeakMap<Struktur, Map<string, Tillfalle[]>>();

function tillfallenFor(s: Struktur, f: DelkapitelFilter): Tillfalle[] {
  let per = tillfallenCache.get(s);
  if (per === undefined) { per = new Map(); tillfallenCache.set(s, per); }
  // elevId påverkar inte urvalet av tillfällen — bara hur de sedan läses
  const nyckel = JSON.stringify([f.klassId, f.amneId ?? '', f.kallor ?? null, f.fran ?? null, f.till ?? null]);
  const cachad = per.get(nyckel);
  if (cachad !== undefined) return cachad;
  const ut = tillfallenForRaknad(s, f);
  per.set(nyckel, ut);
  return ut;
}

function tillfallenForRaknad(s: Struktur, f: DelkapitelFilter): Tillfalle[] {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === f.klassId).map((e) => e.id));
  const rs = (s.resultat ?? []).filter((r) => elevIds.has(r.elevId)
    && (f.amneId === undefined || r.amneId === f.amneId)
    && (f.kallor === undefined || f.kallor.includes(r.kalla))
    && (f.fran === undefined || r.datum >= f.fran) && (f.till === undefined || r.datum <= f.till)
    && (r.svar ?? []).length > 0);
  const grupper = new Map<string, Resultat[]>();
  for (const r of rs) {
    const n = `${r.datum}|${r.kalla}|${r.prov}`;
    grupper.set(n, [...(grupper.get(n) ?? []), r]);
  }
  return [...grupper.values()].map((resultat) => {
    // Klockslag: tidigaste kända bland resultaten (sätts vid filimport)
    const tid = resultat.map((r) => r.tid).filter((t): t is string => t !== undefined).sort()[0];
    return {
      nyckel: `${resultat[0].datum}|${resultat[0].kalla}|${resultat[0].prov}`,
      prov: resultat[0].prov, datum: resultat[0].datum, ...(tid !== undefined ? { tid } : {}),
      kalla: resultat[0].kalla, ...(resultat[0].rum !== undefined ? { rum: resultat[0].rum } : {}), resultat,
    };
  }).sort(jamforTillfalle);
}

/**
 * Knyter varje fråga till det delkapitel där den först ställdes.
 * Rummet ger delkapitlen ('Biologi412' → 4.1 och 4.2); det som är NYTT
 * jämfört med tidigare tillfällen är det delkapitel frågan hör till.
 * Frågor i ett förstagångsrum med flera delar får dess sista del.
 */
/** Delkapitelkoder för ett tillfälle — rummet först, annars quiznamnet. */
export function koderForTillfalle(t: { prov: string; rum?: string }): string[] {
  return koderForProv(t.prov, t.rum);
}

const hemvistCache = new WeakMap<Tillfalle[], Map<string, string>>();

export function fragansDelkapitel(tillfallen: Tillfalle[]): Map<string, string> {
  const c = hemvistCache.get(tillfallen);
  if (c !== undefined) return c;
  const karta = fragansDelkapitelRaknad(tillfallen);
  hemvistCache.set(tillfallen, karta);
  return karta;
}

function fragansDelkapitelRaknad(tillfallen: Tillfalle[]): Map<string, string> {
  const karta = new Map<string, string>();
  const sedda = new Set<string>();
  for (const t of tillfallen) {
    const alla = koderForTillfalle(t);
    const nya = alla.filter((k) => !sedda.has(k));
    const hemvist = nya.length > 0 ? nya[nya.length - 1] : alla[alla.length - 1] ?? '—';
    for (const k of alla) sedda.add(k);
    for (const r of t.resultat) {
      for (const sv of r.svar ?? []) {
        const n = fragenyckel(sv.fraga);
        if (!karta.has(n)) karta.set(n, hemvist);
      }
    }
  }
  return karta;
}

export interface Segment {
  /** Delkapitelkod, t.ex. '4.1'. */
  kod: string;
  antalFragor: number;
  /** Antal bedömda svar (elever × frågor). */
  bedomda: number;
  ratt: number;
  /** Andel rätt i segmentet (0–100), null utan bedömda svar. */
  procent: number | null;
}

export interface SegmentTillfalle {
  nyckel: string; prov: string; datum: string; tid?: string; kalla: ResultatKalla; rum?: string;
  segment: Segment[];
  antalFragor: number;
  /** Andel rätt i hela tillfället. */
  procent: number | null;
}

/**
 * Varje tillfälle uppdelat i delkapitelsegment, kronologiskt. Med `elevId`
 * gäller siffrorna en elev, annars hela klassen.
 */
export function delkapitelSegment(s: Struktur, f: DelkapitelFilter): SegmentTillfalle[] {
  const tillfallen = tillfallenFor(s, f);
  const hemvist = fragansDelkapitel(tillfallen);
  return tillfallen.map((t) => {
    const rader = f.elevId === undefined ? t.resultat : t.resultat.filter((r) => r.elevId === f.elevId);
    const per = new Map<string, { fragor: Set<string>; bedomda: number; ratt: number }>();
    for (const r of rader) {
      for (const sv of r.svar ?? []) {
        const n = fragenyckel(sv.fraga);
        const kod = hemvist.get(n) ?? '—';
        const post = per.get(kod) ?? { fragor: new Set<string>(), bedomda: 0, ratt: 0 };
        post.fragor.add(n);
        if (sv.ratt !== null) { post.bedomda += 1; if (sv.ratt) post.ratt += 1; }
        per.set(kod, post);
      }
    }
    const segment: Segment[] = [...per.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'sv', { numeric: true }))
      .map(([kod, v]) => ({
        kod, antalFragor: v.fragor.size, bedomda: v.bedomda, ratt: v.ratt,
        procent: v.bedomda === 0 ? null : Math.round((v.ratt / v.bedomda) * 100),
      }));
    const bedomda = segment.reduce((n, x) => n + x.bedomda, 0);
    const ratt = segment.reduce((n, x) => n + x.ratt, 0);
    return {
      nyckel: t.nyckel, prov: t.prov, datum: t.datum, ...(t.tid !== undefined ? { tid: t.tid } : {}),
      kalla: t.kalla, ...(t.rum !== undefined ? { rum: t.rum } : {}),
      segment, antalFragor: segment.reduce((n, x) => n + x.antalFragor, 0),
      procent: bedomda === 0 ? null : Math.round((ratt / bedomda) * 100),
    };
  });
}

export interface BegreppsFel {
  fraga: string;
  /** Delkapitlet frågan hör till. */
  kod: string;
  antalFel: number;
  antalRatt: number;
  senasteFel: string;
  /** Antal rätt efter det senaste felet. */
  rattEfterSenasteFel: number;
  historik: Array<{ datum: string; prov: string; ratt: boolean }>;
}

/**
 * Begrepp eleven svarat fel på mer än en gång och ännu inte visat att den
 * lärt sig: frågan lämnar listan när eleven svarat rätt två gånger efter
 * det senaste felet (alla svar sedan dess måste vara rätt — ett nytt fel
 * nollställer räkningen).
 */
export function aterkommandeFel(s: Struktur, elevId: string, f: DelkapitelFilter, gransFel = 2, gransRatt = 2): BegreppsFel[] {
  const tillfallen = tillfallenFor(s, f);
  return aterkommandeFelUr(elevId, tillfallen, fragansDelkapitel(tillfallen), null, gransFel, gransRatt);
}

function aterkommandeFelUr(
  elevId: string, tillfallen: Tillfalle[], hemvist: Map<string, string>,
  perElevTillfalle: Array<Map<string, Resultat>> | null, gransFel = 2, gransRatt = 2,
): BegreppsFel[] {
  const per = new Map<string, { fraga: string; historik: BegreppsFel['historik'] }>();
  for (const [ti, t] of tillfallen.entries()) {
    const r = perElevTillfalle !== null ? perElevTillfalle[ti].get(elevId) : t.resultat.find((x) => x.elevId === elevId);
    if (r === undefined) continue;
    for (const sv of r.svar ?? []) {
      if (sv.ratt === null) continue;
      const n = fragenyckel(sv.fraga);
      const post = per.get(n) ?? { fraga: sv.fraga, historik: [] };
      post.historik.push({ datum: t.datum, prov: t.prov, ratt: sv.ratt });
      per.set(n, post);
    }
  }
  const ut: BegreppsFel[] = [];
  for (const [n, post] of per) {
    const fel = post.historik.filter((h) => !h.ratt);
    if (fel.length < gransFel) continue;
    const senasteFelIndex = post.historik.map((h) => h.ratt).lastIndexOf(false);
    const efter = post.historik.slice(senasteFelIndex + 1);
    const rattEfter = efter.filter((h) => h.ratt).length;
    if (rattEfter >= gransRatt) continue; // eleven har visat att den kan det nu
    ut.push({
      fraga: post.fraga, kod: hemvist.get(n) ?? '—',
      antalFel: fel.length, antalRatt: post.historik.length - fel.length,
      senasteFel: post.historik[senasteFelIndex].datum,
      rattEfterSenasteFel: rattEfter, historik: post.historik,
    });
  }
  return ut.sort((a, b) => b.antalFel - a.antalFel || a.kod.localeCompare(b.kod, 'sv', { numeric: true }));
}

export interface KlassBegreppsFel { fraga: string; kod: string; elever: Array<{ elev: Elev; antalFel: number }>; antalElever: number; }

/** Samma lista för hela klassen: vilka begrepp som fastnar för flest elever. */
export function aterkommandeFelKlass(s: Struktur, f: DelkapitelFilter): KlassBegreppsFel[] {
  const per = new Map<string, KlassBegreppsFel>();
  // Indexera varje tillfälles resultat per elev EN gång; aterkommandeFel per elev
  // gjorde annars 30 × (filtrera alla resultat + räkna hemvist)
  const tillfallen = tillfallenFor(s, f);
  const hemvist = fragansDelkapitel(tillfallen);
  const perElevTillfalle = tillfallen.map((t) => new Map(t.resultat.map((r) => [r.elevId, r])));
  for (const elev of s.elever.filter((e) => e.klassId === f.klassId)) {
    for (const b of aterkommandeFelUr(elev.id, tillfallen, hemvist, perElevTillfalle)) {
      const n = fragenyckel(b.fraga);
      const post = per.get(n) ?? { fraga: b.fraga, kod: b.kod, elever: [], antalElever: 0 };
      post.elever.push({ elev, antalFel: b.antalFel });
      post.antalElever = post.elever.length;
      per.set(n, post);
    }
  }
  return [...per.values()].sort((a, b) => b.antalElever - a.antalElever);
}

// ── Del 75: frågematris — fråga × testtillfälle ──────────────

/**
 * Kort testnamn ur delkapitelkoder: ['4.1','4.2'] → 'test412', ['4.3'] → 'test43'.
 * Blandas kapitel eller saknas koder används koderna rakt av.
 */
export function testEtikett(koder: string[], prefix = 'test'): string {
  const unika = [...new Set(koder)].sort((a, b) => a.localeCompare(b, 'sv', { numeric: true }));
  if (unika.length === 0) return `${prefix}?`;
  const kapitel = [...new Set(unika.map((k) => k.split('.')[0]))];
  if (kapitel.length !== 1) return prefix + unika.join('/');
  return prefix + kapitel[0] + unika.map((k) => k.split('.')[1]).join('');
}

export interface MatrisFraga {
  /** Löpnummer 1..N, grupperat efter ursprungsdelkapitel. */
  nr: number;
  fraga: string;
  /** Delkapitlet frågan hör till ('4.1'). */
  kod: string;
  /** Provet där frågan först ställdes. */
  ursprung: string;
  ursprungRum?: string;
  /** Begreppet frågan beskriver, ur facit i Socrative-rapporten (finns när frågan importerats med facit). */
  begrepp?: string;
}

/** Klassens utfall på en fråga i ett tillfälle. */
export interface FragaCell { bedomda: number; ratt: number; procent: number | null; }

export interface FragaRad {
  nyckel: string; prov: string; datum: string; tid?: string; kalla: ResultatKalla; rum?: string;
  /** Kort testnamn ur de delkapitel provet täcker: 'test41', 'test412'. */
  test: string;
  /** En cell per fråga i `fragor`; null = frågan ingick inte i provet. */
  celler: Array<FragaCell | null>;
  /** Per elev: true/false/null (obesvarad). Sätts bara när elevId angetts. */
  elevCeller?: Array<boolean | null>;
}

export interface Fragematris {
  fragor: MatrisFraga[];
  rader: FragaRad[];
  /** Kolumngrupper: delkapitlet och dess intervall av frågenummer. */
  grupper: Array<{ kod: string; etikett: string; ursprung: string; fran: number; till: number }>;
}

/**
 * Matris med en rad per testtillfälle och en kolumn per fråga. Frågorna
 * numreras i den ordning delkapitlen introduceras, så kolumnerna grupperar
 * sig som Test41 · Test42 · Test43 … precis som i lärarens kalkylblad.
 */
export function fragematris(s: Struktur, f: DelkapitelFilter): Fragematris {
  const tillfallen = tillfallenFor(s, f);
  const hemvist = fragansDelkapitel(tillfallen);
  // Frågornas ordning: efter delkapitel, sedan efter när de först dök upp
  const forstaGangen = new Map<string, { fraga: string; ursprung: string; rum?: string; ordning: number; begrepp?: string }>();
  let raknare = 0;
  for (const t of tillfallen) {
    for (const r of t.resultat) {
      for (const sv of r.svar ?? []) {
        const n = fragenyckel(sv.fraga);
        const facit = begreppUrFacit(sv.facit);
        const finns = forstaGangen.get(n);
        if (finns !== undefined) { if (finns.begrepp === undefined && facit !== null) finns.begrepp = facit; continue; }
        forstaGangen.set(n, { fraga: sv.fraga, ursprung: t.prov, ...(t.rum !== undefined ? { rum: t.rum } : {}), ordning: raknare++, ...(facit !== null ? { begrepp: facit } : {}) });
      }
    }
  }
  const nycklar = [...forstaGangen.keys()].sort((a, b) => {
    const ka = hemvist.get(a) ?? '—'; const kb = hemvist.get(b) ?? '—';
    return ka.localeCompare(kb, 'sv', { numeric: true }) || forstaGangen.get(a)!.ordning - forstaGangen.get(b)!.ordning;
  });
  const fragor: MatrisFraga[] = nycklar.map((n, i) => {
    const post = forstaGangen.get(n)!;
    return { nr: i + 1, fraga: post.fraga, kod: hemvist.get(n) ?? '—', ursprung: post.ursprung, ...(post.rum !== undefined ? { ursprungRum: post.rum } : {}), ...(post.begrepp !== undefined ? { begrepp: post.begrepp } : {}) };
  });
  const index = new Map(nycklar.map((n, i) => [n, i]));
  const rader: FragaRad[] = tillfallen.map((t) => {
    const celler: Array<FragaCell | null> = fragor.map(() => null);
    const elevCeller: Array<boolean | null> = fragor.map(() => null);
    for (const r of t.resultat) {
      for (const sv of r.svar ?? []) {
        const i = index.get(fragenyckel(sv.fraga));
        if (i === undefined) continue;
        const cell = celler[i] ?? { bedomda: 0, ratt: 0, procent: null };
        if (sv.ratt !== null) { cell.bedomda += 1; if (sv.ratt) cell.ratt += 1; }
        cell.procent = cell.bedomda === 0 ? null : Math.round((cell.ratt / cell.bedomda) * 100);
        celler[i] = cell;
        if (f.elevId !== undefined && r.elevId === f.elevId) elevCeller[i] = sv.ratt;
      }
    }
    // Testnamnet byggs av de delkapitel provet faktiskt innehåller: 4.1 + 4.2 → test412
    const koder = fragor.filter((_, i) => celler[i] !== null).map((fr) => fr.kod).filter((k) => k !== '—');
    return {
      nyckel: t.nyckel, prov: t.prov, datum: t.datum, ...(t.tid !== undefined ? { tid: t.tid } : {}),
      kalla: t.kalla, ...(t.rum !== undefined ? { rum: t.rum } : {}),
      test: testEtikett(koder), celler, ...(f.elevId !== undefined ? { elevCeller } : {}),
    };
  });
  const grupper: Fragematris['grupper'] = [];
  for (const fr of fragor) {
    const sista = grupper[grupper.length - 1];
    if (sista !== undefined && sista.kod === fr.kod) sista.till = fr.nr;
    else grupper.push({ kod: fr.kod, etikett: testEtikett([fr.kod], 'Test'), ursprung: fr.ursprung, fran: fr.nr, till: fr.nr });
  }
  return { fragor, rader, grupper };
}

export interface FragefilterVal {
  /** Lägsta andel rätt (0–100) som frågan ska ha i klassen. */
  min?: number;
  /** Högsta andel rätt. */
  max?: number;
  /** Bara dessa tillfällen (nycklar ur matrisen); tom eller utelämnad = alla. */
  tillfallen?: string[];
}

export interface FragefilterRad extends MatrisFraga {
  bedomda: number;
  ratt: number;
  /** Andel rätt över de valda tillfällena. */
  procent: number;
  /** Antal tillfällen frågan ställdes i urvalet. */
  antalTillfallen: number;
}

/**
 * Plockar ut frågor efter hur väl klassen svarat, över valda tillfällen —
 * t.ex. "alla frågor under 50 % i test412 och test4123".
 */
export function filtreraFragor(m: Fragematris, val: FragefilterVal = {}): FragefilterRad[] {
  const valda = val.tillfallen !== undefined && val.tillfallen.length > 0
    ? m.rader.filter((r) => val.tillfallen!.includes(r.nyckel))
    : m.rader;
  const min = val.min ?? 0; const max = val.max ?? 100;
  return m.fragor.map((fr, i) => {
    let bedomda = 0; let ratt = 0; let antal = 0;
    for (const rad of valda) {
      const c = rad.celler[i];
      if (c === null) continue;
      antal += 1; bedomda += c.bedomda; ratt += c.ratt;
    }
    return { ...fr, bedomda, ratt, procent: bedomda === 0 ? 0 : Math.round((ratt / bedomda) * 100), antalTillfallen: antal };
  }).filter((r) => r.bedomda > 0 && r.procent >= min && r.procent <= max)
    .sort((a, b) => a.procent - b.procent || a.nr - b.nr);
}

// ── Del 90: nuläget — vad eleven kan NU ──────────────────────
//
// Läxförhören är kumulativa: samma fråga återkommer i varje nytt förhör.
// Det som betyder något är därför det SENASTE svaret på varje fråga, inte
// att eleven missade den för tre veckor sedan. Nuläget läser matrisen
// bakifrån och tar första bedömda svaret per fråga.

export interface FragaNu {
  fraga: string;
  kod: string;
  nr: number;
  /** Senaste bedömda svaret. */
  ratt: boolean;
  senastProv: string;
  senastDatum: string;
  /** Antal fel tidigare (före det senaste svaret). */
  tidigareFel: number;
  /** Antal gånger frågan ställts. */
  antalGanger: number;
  /** Begreppet frågan beskriver, när det gick att slå upp i boken. */
  begrepp?: string;
}

export interface DelkapitelNu {
  kod: string;
  ratt: number;
  fel: number;
  /** Andel rätt på det eleven senast svarat i delkapitlet (0–100). */
  procent: number | null;
  /** Senaste provet som testade delkapitlet. */
  senastProv: string | null;
  senastDatum: string | null;
}

export interface Nulage {
  /** Alla frågor eleven svarat på, med sitt senaste svar. */
  fragor: FragaNu[];
  /** Delkapitlen, sammanräknade på senaste svaren. */
  delkapitel: DelkapitelNu[];
  /** Kan nu: senaste svaret rätt. */
  kan: FragaNu[];
  /** Kvar att lära: senaste svaret fel. */
  kvar: FragaNu[];
  /** Vände till rätt: tidigare fel men senaste svaret rätt. */
  fixat: FragaNu[];
  /** Andel rätt av de senaste svaren (0–100). */
  procent: number | null;
  /** Provet som ger den färskaste bilden. */
  senastProv: string | null;
  senastDatum: string | null;
}

/** Elevens aktuella kunskapsläge: senaste svaret på varje fråga. */
/**
 * Begreppet bakom varje fråga, hämtat ur elevernas RÄTTA svar: den som svarade
 * rätt på 'En naturtyp med vissa typiska …' valde 'B • biotop', och det svaret
 * är begreppet. Säkrare än att matcha frågetexten mot boken, vars förklaringar
 * kan vara formulerade annorlunda. Räknas per struktur och filter.
 */
const begreppCache = new WeakMap<Struktur, Map<string, Map<string, string>>>();
export function begreppUrSvar(s: Struktur, f: DelkapitelFilter): Map<string, string> {
  let per = begreppCache.get(s);
  if (per === undefined) { per = new Map(); begreppCache.set(s, per); }
  const nyckel = `${f.klassId}|${f.amneId ?? ''}`;
  const c = per.get(nyckel); if (c !== undefined) return c;
  const karta = new Map<string, string>();
  const rakna = new Map<string, Map<string, number>>();
  for (const t of tillfallenFor(s, { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}) })) {
    for (const r of t.resultat) {
      for (const sv of r.svar ?? []) {
        if (sv.ratt !== true) continue;
        const text = svarText(sv.svar);
        // En ensam bokstav ('B') är alternativet, inte begreppet — ger ingen ledning
        if (text.length <= 2) continue;
        const n = fragenyckel(sv.fraga);
        const m = rakna.get(n) ?? new Map<string, number>();
        m.set(text, (m.get(text) ?? 0) + 1);
        rakna.set(n, m);
      }
    }
  }
  // Vanligaste rätta svaret per fråga (skydd mot enstaka felmärkta rader)
  for (const [n, m] of rakna) karta.set(n, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  per.set(nyckel, karta);
  return karta;
}

export function nulage(s: Struktur, elevId: string, f: DelkapitelFilter): Nulage {
  const m = fragematris(s, { ...f, elevId });
  const begrepp = begreppUrSvar(s, f);
  const fragor: FragaNu[] = [];
  m.fragor.forEach((fr, i) => {
    let senast: { ratt: boolean; prov: string; datum: string } | null = null;
    let tidigareFel = 0; let antal = 0;
    for (const rad of m.rader) { // kronologisk ordning
      const svar = rad.elevCeller?.[i];
      if (svar === null || svar === undefined) continue;
      antal += 1;
      if (senast !== null && !senast.ratt) tidigareFel += 1;
      senast = { ratt: svar, prov: rad.prov, datum: rad.datum };
    }
    if (senast === null) return;
    // Facit ur rapporten först, annars vanligaste rätta svaret i klassen
    const b = fr.begrepp ?? begrepp.get(fragenyckel(fr.fraga));
    fragor.push({
      fraga: fr.fraga, kod: fr.kod, nr: fr.nr, ratt: senast.ratt,
      senastProv: senast.prov, senastDatum: senast.datum, tidigareFel, antalGanger: antal,
      ...(b !== undefined ? { begrepp: b } : {}),
    });
  });
  const perDel = new Map<string, FragaNu[]>();
  for (const fr of fragor) perDel.set(fr.kod, [...(perDel.get(fr.kod) ?? []), fr]);
  const delkapitel: DelkapitelNu[] = [...perDel.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'sv', { numeric: true }))
    .map(([kod, lista]) => {
      const ratt = lista.filter((x) => x.ratt).length;
      const senast = [...lista].sort((a, b) => a.senastDatum.localeCompare(b.senastDatum)).pop() ?? null;
      return {
        kod, ratt, fel: lista.length - ratt,
        procent: lista.length === 0 ? null : Math.round((ratt / lista.length) * 100),
        senastProv: senast?.senastProv ?? null, senastDatum: senast?.senastDatum ?? null,
      };
    });
  const kan = fragor.filter((x) => x.ratt);
  const senasteRad = [...m.rader].reverse().find((r) => (r.elevCeller ?? []).some((c) => c !== null)) ?? null;
  return {
    fragor, delkapitel, kan,
    kvar: fragor.filter((x) => !x.ratt),
    fixat: fragor.filter((x) => x.ratt && x.tidigareFel > 0),
    procent: fragor.length === 0 ? null : Math.round((kan.length / fragor.length) * 100),
    senastProv: senasteRad?.prov ?? null, senastDatum: senasteRad?.datum ?? null,
  };
}

// ── Del 92: övningar som egentligen är läxförhör eller exit ──
//
// Ett quiz som märkts som Övning kan i själva verket vara samma frågor som
// ett läxförhör eller en exit ticket — då bör det räknas dit i stället, och
// inte ligga vid sidan om.

export interface OvningsMatchning {
  /** Övningen. */
  ovning: { nyckel: string; prov: string; datum: string; rum?: string; antalFragor: number };
  /** Tillfället den liknar mest. */
  liknar: { nyckel: string; prov: string; datum: string; kalla: ResultatKalla };
  /** Andel av övningens frågor som också finns i det andra provet (0–100). */
  overlapp: number;
  /** Antal gemensamma frågor. */
  gemensamma: number;
  /** Sant när frågorna är identiska åt båda håll. */
  identiska: boolean;
}

/**
 * Letar upp övningar vars frågor sammanfaller med ett läxförhör eller en
 * exit ticket. `grans` är minsta överlapp i procent för att räknas som träff.
 */
export function ovningsDubbletter(s: Struktur, f: DelkapitelFilter, grans = 60): OvningsMatchning[] {
  const tillfallen = tillfallenFor(s, { ...f, kallor: undefined });
  const fragorFor = (t: Tillfalle): Set<string> => {
    const ut = new Set<string>();
    for (const r of t.resultat) for (const sv of r.svar ?? []) ut.add(fragenyckel(sv.fraga));
    return ut;
  };
  const ovningar = tillfallen.filter((t) => t.kalla === 'socrative-ovning');
  const ovriga = tillfallen.filter((t) => t.kalla === 'socrative-laxforhor' || t.kalla === 'socrative-exit');
  const ut: OvningsMatchning[] = [];
  for (const ov of ovningar) {
    const mina = fragorFor(ov);
    if (mina.size === 0) continue;
    let bast: OvningsMatchning | null = null;
    for (const annan of ovriga) {
      const deras = fragorFor(annan);
      if (deras.size === 0) continue;
      const gemensamma = [...mina].filter((q) => deras.has(q)).length;
      const overlapp = Math.round((gemensamma / mina.size) * 100);
      if (overlapp < grans) continue;
      if (bast === null || overlapp > bast.overlapp) {
        bast = {
          ovning: { nyckel: ov.nyckel, prov: ov.prov, datum: ov.datum, ...(ov.rum !== undefined ? { rum: ov.rum } : {}), antalFragor: mina.size },
          liknar: { nyckel: annan.nyckel, prov: annan.prov, datum: annan.datum, kalla: annan.kalla },
          overlapp, gemensamma, identiska: gemensamma === mina.size && gemensamma === deras.size,
        };
      }
    }
    if (bast !== null) ut.push(bast);
  }
  return ut.sort((a, b) => b.overlapp - a.overlapp);
}


// ── Del 99: övningar som använder samma quiz räknas in i huvudsviten ──
//
// En övning som ställer samma frågor som ett läxförhör eller en exit ticket
// är i praktiken samma test kört igen. Den ska då räknas som den typen i
// analysen (trendkoll, nuläge, matris, kurvor), inte ligga vid sidan av.
// Övningar med egna frågor lämnas som separata tester.

export interface Inkluderad {
  resultatIds: string[];
  prov: string;
  datum: string;
  /** Typen övningen räknas som. */
  som: ResultatKalla;
  /** Provet den matchade. */
  liknar: string;
  overlapp: number;
}

export interface HarmoniseradStruktur {
  s: Struktur;
  inkluderade: Inkluderad[];
}

const harmoniseraCache = new WeakMap<Struktur, Map<string, HarmoniseradStruktur>>();

/**
 * Returnerar en struktur där övningar med gemensamma frågor (≥ `grans` % av
 * övningens frågor) har fått den matchade typen. Originalet rörs inte; resultatet
 * bär `inkluderadSom` så gränssnittet kan visa att det ursprungligen var en övning.
 */
export function harmoniseraOvningar(s: Struktur, f: DelkapitelFilter, grans = 60): HarmoniseradStruktur {
  let per = harmoniseraCache.get(s);
  if (per === undefined) { per = new Map(); harmoniseraCache.set(s, per); }
  const nyckel = `${f.klassId}|${f.amneId ?? ''}|${grans}`;
  const cachad = per.get(nyckel);
  if (cachad !== undefined) return cachad;

  const matchningar = ovningsDubbletter(s, { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}) }, grans);
  if (matchningar.length === 0) { const ut = { s, inkluderade: [] }; per.set(nyckel, ut); return ut; }
  const somTyp = new Map(matchningar.map((m) => [m.ovning.nyckel, m]));
  const inkluderade: Inkluderad[] = [];
  const resultat = (s.resultat ?? []).map((r) => {
    if (r.kalla !== 'socrative-ovning') return r;
    // Övning är en egen testtyp. Bara övningar som importen själv klassade som övning
    // (autoTyp) får räknas in som förhör när de kör samma quiz — allt läraren valt,
    // eller som importerats som övning med avsikt, stannar som övning.
    if (r.autoTyp !== true || r.manuellTyp === true) return r;
    const m = somTyp.get(`${r.datum}|${r.kalla}|${r.prov}`);
    if (m === undefined) return r;
    let post = inkluderade.find((x) => x.prov === r.prov && x.datum === r.datum);
    if (post === undefined) {
      post = { resultatIds: [], prov: r.prov, datum: r.datum, som: m.liknar.kalla, liknar: m.liknar.prov, overlapp: m.overlapp };
      inkluderade.push(post);
    }
    post.resultatIds.push(r.id);
    return { ...r, kalla: m.liknar.kalla, inkluderadSom: m.liknar.kalla };
  });
  const ut = { s: { ...s, resultat }, inkluderade };
  per.set(nyckel, ut);
  return ut;
}
