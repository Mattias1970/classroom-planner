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
import type { Resultat, ResultatKalla } from './resultat.js';
import { fragenyckel } from './trendkoll.js';
import { tolkaRumKoder } from './elevrapport.js';

export interface DelkapitelFilter { klassId: string; amneId?: string; kallor?: ResultatKalla[]; fran?: string; till?: string; elevId?: string; }

/** Ett tillfälle med frågor grupperade per delkapitel. */
export interface Tillfalle { nyckel: string; prov: string; datum: string; kalla: ResultatKalla; rum?: string; resultat: Resultat[] }

function tillfallenFor(s: Struktur, f: DelkapitelFilter): Tillfalle[] {
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
  return [...grupper.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([nyckel, resultat]) => ({
    nyckel, prov: resultat[0].prov, datum: resultat[0].datum, kalla: resultat[0].kalla,
    ...(resultat[0].rum !== undefined ? { rum: resultat[0].rum } : {}), resultat,
  }));
}

/**
 * Knyter varje fråga till det delkapitel där den först ställdes.
 * Rummet ger delkapitlen ('Biologi412' → 4.1 och 4.2); det som är NYTT
 * jämfört med tidigare tillfällen är det delkapitel frågan hör till.
 * Frågor i ett förstagångsrum med flera delar får dess sista del.
 */
/**
 * Delkapitelkoder för ett tillfälle. Rummet först ('Biologi412' → 4.1, 4.2);
 * när rummet är klassrummet ('BIOLOGI8BB') läses koderna ur quiznamnet i
 * stället: 'Biologi 4.1 Begrepp' → 4.1, '4.1-4.3 Begrepp' → 4.1, 4.2, 4.3.
 */
export function koderForTillfalle(t: { prov: string; rum?: string }): string[] {
  const viaRum = t.rum === undefined ? null : tolkaRumKoder(t.rum);
  if (viaRum !== null) return viaRum.delar.map((d) => `${viaRum.kapitel}.${d}`);
  const koder: string[] = [];
  // Intervall först: '4.1-4.3' eller '4.1–4.3'
  for (const m of t.prov.matchAll(/(\d+)\.(\d+)\s*[-–]\s*(?:(\d+)\.)?(\d+)/g)) {
    const kap = Number(m[1]); const fran = Number(m[2]); const till = Number(m[4]);
    if (m[3] !== undefined && Number(m[3]) !== kap) continue;
    for (let d = fran; d <= till && d - fran < 12; d++) koder.push(`${kap}.${d}`);
  }
  if (koder.length === 0) {
    for (const m of t.prov.matchAll(/(\d+)\.(\d+)/g)) koder.push(`${Number(m[1])}.${Number(m[2])}`);
  }
  return [...new Set(koder)];
}

export function fragansDelkapitel(tillfallen: Tillfalle[]): Map<string, string> {
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
  nyckel: string; prov: string; datum: string; kalla: ResultatKalla; rum?: string;
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
      nyckel: t.nyckel, prov: t.prov, datum: t.datum, kalla: t.kalla, ...(t.rum !== undefined ? { rum: t.rum } : {}),
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
  const hemvist = fragansDelkapitel(tillfallen);
  const per = new Map<string, { fraga: string; historik: BegreppsFel['historik'] }>();
  for (const t of tillfallen) {
    const r = t.resultat.find((x) => x.elevId === elevId);
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
  for (const elev of s.elever.filter((e) => e.klassId === f.klassId)) {
    for (const b of aterkommandeFel(s, elev.id, f)) {
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
}

/** Klassens utfall på en fråga i ett tillfälle. */
export interface FragaCell { bedomda: number; ratt: number; procent: number | null; }

export interface FragaRad {
  nyckel: string; prov: string; datum: string; kalla: ResultatKalla; rum?: string;
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
  const forstaGangen = new Map<string, { fraga: string; ursprung: string; rum?: string; ordning: number }>();
  let raknare = 0;
  for (const t of tillfallen) {
    for (const r of t.resultat) {
      for (const sv of r.svar ?? []) {
        const n = fragenyckel(sv.fraga);
        if (forstaGangen.has(n)) continue;
        forstaGangen.set(n, { fraga: sv.fraga, ursprung: t.prov, ...(t.rum !== undefined ? { rum: t.rum } : {}), ordning: raknare++ });
      }
    }
  }
  const nycklar = [...forstaGangen.keys()].sort((a, b) => {
    const ka = hemvist.get(a) ?? '—'; const kb = hemvist.get(b) ?? '—';
    return ka.localeCompare(kb, 'sv', { numeric: true }) || forstaGangen.get(a)!.ordning - forstaGangen.get(b)!.ordning;
  });
  const fragor: MatrisFraga[] = nycklar.map((n, i) => {
    const post = forstaGangen.get(n)!;
    return { nr: i + 1, fraga: post.fraga, kod: hemvist.get(n) ?? '—', ursprung: post.ursprung, ...(post.rum !== undefined ? { ursprungRum: post.rum } : {}) };
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
      nyckel: t.nyckel, prov: t.prov, datum: t.datum, kalla: t.kalla, ...(t.rum !== undefined ? { rum: t.rum } : {}),
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
