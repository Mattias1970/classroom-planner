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
export interface Tillfalle { nyckel: string; prov: string; datum: string; rum?: string; resultat: Resultat[] }

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
    nyckel, prov: resultat[0].prov, datum: resultat[0].datum,
    ...(resultat[0].rum !== undefined ? { rum: resultat[0].rum } : {}), resultat,
  }));
}

/**
 * Knyter varje fråga till det delkapitel där den först ställdes.
 * Rummet ger delkapitlen ('Biologi412' → 4.1 och 4.2); det som är NYTT
 * jämfört med tidigare tillfällen är det delkapitel frågan hör till.
 * Frågor i ett förstagångsrum med flera delar får dess sista del.
 */
export function fragansDelkapitel(tillfallen: Tillfalle[]): Map<string, string> {
  const karta = new Map<string, string>();
  const sedda = new Set<string>();
  for (const t of tillfallen) {
    const koder = t.rum === undefined ? null : tolkaRumKoder(t.rum);
    const alla = koder === null ? [] : koder.delar.map((d) => `${koder.kapitel}.${d}`);
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
  nyckel: string; prov: string; datum: string; rum?: string;
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
      nyckel: t.nyckel, prov: t.prov, datum: t.datum, ...(t.rum !== undefined ? { rum: t.rum } : {}),
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
