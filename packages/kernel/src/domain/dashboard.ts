/**
 * SuperTeach · Dashboard — rena aggregat för dashboardvyn (Ring 1, I2).
 *
 * Dashboarden svarar på FRÅGOR per källa ("Gör eleven läxor?" = läxförhör,
 * "Lär sig eleven på lektionen?" = exit tickets …) och visar klassens
 * utveckling över tid, en elev × provtillfälle-matris och en kurva per
 * elev. All filtrering (ämne, källor, veckointervall, elevsökning) sker här.
 */
import { isoVecka } from './skolar.js';
import { klaratKrav, kravFor, resultatProcent, type Resultat, type ResultatKalla } from './resultat.js';
import type { Elev, Struktur } from './typer.js';

export interface DashboardFilter {
  klassId: string;
  amneId?: string;
  /** Tom/undefined = alla källor. */
  kallor?: ResultatKalla[];
  /** Veckointervall (ISO-veckor); till < från tolkas som årsskifte (v.35–3). */
  veckaFran?: number;
  veckaTill?: number;
  /** Datumintervall (YYYY-MM-DD, inklusive) — används av sittplatsanalysen. */
  fran?: string;
  till?: string;
}

/** Elever i klassen som matchar fritextsökning på namn/e-post/Student ID. */
export function sokElever(s: Struktur, klassId: string, sok: string): Elev[] {
  const q = sok.toLowerCase().trim();
  return s.elever
    .filter((e) => e.klassId === klassId)
    .filter((e) => q === '' || [e.namn, e.epost ?? '', e.socrativeId ?? ''].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
}

function inomVeckor(datum: string, f: DashboardFilter): boolean {
  if (f.veckaFran === undefined && f.veckaTill === undefined) return true;
  const v = isoVecka(datum);
  const fran = f.veckaFran ?? 1; const till = f.veckaTill ?? 53;
  return fran <= till ? v >= fran && v <= till : v >= fran || v <= till;
}

/** Klassens resultat som matchar filtret, äldsta datum först. */
export function dashboardResultat(s: Struktur, f: DashboardFilter): Resultat[] {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === f.klassId).map((e) => e.id));
  return (s.resultat ?? [])
    .filter((r) => elevIds.has(r.elevId))
    .filter((r) => f.amneId === undefined || f.amneId === '' || r.amneId === f.amneId)
    .filter((r) => f.kallor === undefined || f.kallor.length === 0 || f.kallor.includes(r.kalla))
    .filter((r) => inomVeckor(r.datum, f))
    .filter((r) => (f.fran === undefined || r.datum >= f.fran) && (f.till === undefined || r.datum <= f.till))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.prov.localeCompare(b.prov, 'sv'));
}

/** Ett provtillfälle (källa + prov + datum) med klassens sammandrag. */
export interface ProvTillfalle {
  nyckel: string;
  kalla: ResultatKalla;
  prov: string;
  datum: string;
  vecka: number;
  antal: number;
  snittProcent: number | null;
  /** Andel (0–100) som klarade BAM-kravet; null utan krav. */
  andelKlarade: number | null;
  krav: number | null;
}

function snitt(xs: number[]): number | null {
  return xs.length === 0 ? null : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

/** Provtillfällen i klassen, kronologiskt. */
export function provTillfallen(s: Struktur, f: DashboardFilter): ProvTillfalle[] {
  const grupper = new Map<string, Resultat[]>();
  for (const r of dashboardResultat(s, f)) {
    const n = `${r.datum}|${r.kalla}|${r.prov}`;
    grupper.set(n, [...(grupper.get(n) ?? []), r]);
  }
  return [...grupper.entries()].map(([nyckel, rs]) => {
    const { kalla, prov, datum } = rs[0];
    const procent = rs.map(resultatProcent).filter((p): p is number => p !== null);
    const bedomda = rs.map(klaratKrav).filter((k): k is boolean => k !== null);
    return {
      nyckel, kalla, prov, datum, vecka: isoVecka(datum), antal: rs.length,
      snittProcent: snitt(procent),
      andelKlarade: bedomda.length === 0 ? null : Math.round((bedomda.filter(Boolean).length / bedomda.length) * 100),
      krav: kravFor(kalla),
    };
  });
}

export type Trend = 'upp' | 'ned' | 'jamn';

/** Jämför senare halvan med tidigare halvan av en serie; kräver ≥ 3 punkter. */
export function trendFor(serie: number[]): Trend | null {
  if (serie.length < 3) return null;
  const mitt = Math.floor(serie.length / 2);
  const a = snitt(serie.slice(0, mitt)) ?? 0; const b = snitt(serie.slice(mitt)) ?? 0;
  return b - a > 5 ? 'upp' : a - b > 5 ? 'ned' : 'jamn';
}

export type KortKalla = ResultatKalla | 'helhet';

/** Frågan varje kort besvarar (dashboardens bärande idé). */
export const KORT_FRAGA: Record<KortKalla, { rubrik: string; fraga: string }> = {
  'socrative-laxforhor': { rubrik: 'Läxförhör', fraga: 'Gör eleven läxor?' },
  'socrative-exit': { rubrik: 'Exit tickets', fraga: 'Lär sig eleven på lektionen?' },
  magma: { rubrik: 'Magma test', fraga: 'Kan eleven begreppen?' },
  digiexam: { rubrik: 'DigiExam prov', fraga: 'Klarar eleven proven?' },
  helhet: { rubrik: 'Helhet', fraga: 'Hur går det sammantaget?' },
};

export interface FrageKort {
  kalla: KortKalla;
  rubrik: string;
  fraga: string;
  antalProv: number;
  antalElever: number;
  snittProcent: number | null;
  andelKlarade: number | null;
  krav: number | null;
  trend: Trend | null;
  /** Snittprocent per provtillfälle, kronologiskt (sparkline). */
  serie: number[];
}

const KORT_ORDNING: KortKalla[] = ['socrative-laxforhor', 'socrative-exit', 'magma', 'digiexam', 'helhet'];

/** Ett kort per källa + helhet. Källor utan resultat får antalProv 0. */
export function frageKort(s: Struktur, f: DashboardFilter): FrageKort[] {
  const alla = provTillfallen(s, f);
  const rs = dashboardResultat(s, f);
  return KORT_ORDNING.map((kalla) => {
    const t = kalla === 'helhet' ? alla : alla.filter((x) => x.kalla === kalla);
    const r = kalla === 'helhet' ? rs : rs.filter((x) => x.kalla === kalla);
    const serie = t.map((x) => x.snittProcent).filter((p): p is number => p !== null);
    const bedomda = r.map(klaratKrav).filter((k): k is boolean => k !== null);
    return {
      kalla, ...KORT_FRAGA[kalla],
      antalProv: t.length,
      antalElever: new Set(r.map((x) => x.elevId)).size,
      snittProcent: snitt(r.map(resultatProcent).filter((p): p is number => p !== null)),
      andelKlarade: bedomda.length === 0 ? null : Math.round((bedomda.filter(Boolean).length / bedomda.length) * 100),
      krav: kalla === 'helhet' ? null : kravFor(kalla),
      trend: trendFor(serie),
      serie,
    };
  });
}

export interface MatrisCell { procent: number | null; klarat: boolean | null; poang: number; maxPoang: number; }
export interface MatrisRad { elev: Elev; celler: Array<MatrisCell | null>; snitt: number | null; klarade: number; bedomda: number; }
export interface ElevMatris { tillfallen: ProvTillfalle[]; rader: MatrisRad[]; }

/** Elev × provtillfälle med procent/krav per cell (heatmap-underlag). */
export function elevMatris(s: Struktur, f: DashboardFilter, sok = ''): ElevMatris {
  const tillfallen = provTillfallen(s, f);
  const index = new Map(tillfallen.map((t, i) => [t.nyckel, i]));
  const perElev = new Map<string, Array<MatrisCell | null>>();
  for (const r of dashboardResultat(s, f)) {
    const i = index.get(`${r.datum}|${r.kalla}|${r.prov}`);
    if (i === undefined) continue;
    const rad = perElev.get(r.elevId) ?? tillfallen.map(() => null);
    rad[i] = { procent: resultatProcent(r), klarat: klaratKrav(r), poang: r.poang, maxPoang: r.maxPoang };
    perElev.set(r.elevId, rad);
  }
  const rader = sokElever(s, f.klassId, sok).map((elev) => {
    const celler = perElev.get(elev.id) ?? tillfallen.map(() => null);
    const p = celler.map((c) => c?.procent ?? null).filter((x): x is number => x !== null);
    const bed = celler.map((c) => c?.klarat ?? null).filter((x): x is boolean => x !== null);
    return { elev, celler, snitt: snitt(p), klarade: bed.filter(Boolean).length, bedomda: bed.length };
  });
  return { tillfallen, rader };
}

export interface KurvPunkt { datum: string; vecka: number; kalla: ResultatKalla; prov: string; procent: number; krav: number | null; klarat: boolean | null; }

/** En elevs resultat som kurvpunkter, kronologiskt. */
export function elevKurva(s: Struktur, elevId: string, f: DashboardFilter): KurvPunkt[] {
  return dashboardResultat(s, f)
    .filter((r) => r.elevId === elevId)
    .map((r) => ({ datum: r.datum, vecka: isoVecka(r.datum), kalla: r.kalla, prov: r.prov,
      procent: resultatProcent(r) ?? 0, krav: kravFor(r.kalla), klarat: klaratKrav(r) }))
    .filter((p) => p.procent !== null);
}

/** Klassens kurva: snitt + andel klarade per provtillfälle. */
export function klassKurva(s: Struktur, f: DashboardFilter): ProvTillfalle[] {
  return provTillfallen(s, f).filter((t) => t.snittProcent !== null);
}

/** Tolkar 'v.35–43', '35-43' eller '35' till ett veckointervall. */
export function tolkaVeckor(text: string): { veckaFran: number; veckaTill: number } | null {
  const m = /^\s*v?\.?\s*(\d{1,2})\s*(?:[–-]\s*v?\.?\s*(\d{1,2}))?\s*$/i.exec(text);
  if (m === null) return null;
  const fran = Number(m[1]); const till = m[2] === undefined ? fran : Number(m[2]);
  if (fran < 1 || fran > 53 || till < 1 || till > 53) return null;
  return { veckaFran: fran, veckaTill: till };
}

// ── Del 58: veckoserier, samband, trendkluster, gruppjämförelse ──

/** Snitt per ISO-vecka och källa (+ helhet) — underlag för 'Läxförhör vs Exit tickets'. */
export interface VeckoSerier { veckor: number[]; serier: Record<KortKalla, Array<number | null>>; }

export function veckoSerier(s: Struktur, f: DashboardFilter): VeckoSerier {
  const rs = dashboardResultat(s, f);
  const veckor = [...new Set(rs.map((r) => isoVecka(r.datum)))];
  // kronologisk ordning bevaras eftersom dashboardResultat är datumsorterad
  const per = (k: KortKalla): Array<number | null> => veckor.map((v) => snitt(rs
    .filter((r) => isoVecka(r.datum) === v && (k === 'helhet' || r.kalla === k))
    .map(resultatProcent).filter((p): p is number => p !== null)));
  return { veckor, serier: {
    'socrative-laxforhor': per('socrative-laxforhor'), 'socrative-exit': per('socrative-exit'),
    magma: per('magma'), digiexam: per('digiexam'), helhet: per('helhet'),
  } };
}

/** Pearsons korrelationskoefficient; null vid < 3 par eller nollvarians. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n; const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx; const dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
}

/** Snittprocent per elev och källa (elever utan resultat i källan saknas i kartan). */
function elevSnittPerKalla(rs: Resultat[], kalla: ResultatKalla): Map<string, number> {
  const per = new Map<string, number[]>();
  for (const r of rs) {
    if (r.kalla !== kalla) continue;
    const p = resultatProcent(r); if (p === null) continue;
    per.set(r.elevId, [...(per.get(r.elevId) ?? []), p]);
  }
  return new Map([...per.entries()].map(([id, ps]) => [id, snitt(ps) ?? 0]));
}

export interface Samband { a: ResultatKalla; b: ResultatKalla; r: number; n: number; text: string; }

const SAMBAND_PAR: Array<[ResultatKalla, ResultatKalla, string]> = [
  ['socrative-laxforhor', 'socrative-exit', 'Läxförhör ↔ exit ticket'],
  ['socrative-laxforhor', 'magma', 'Läxförhör ↔ Magma'],
  ['socrative-exit', 'magma', 'Exit ticket ↔ Magma'],
  ['socrative-laxforhor', 'digiexam', 'Läxförhör ↔ prov'],
  ['socrative-exit', 'digiexam', 'Exit ticket ↔ prov'],
  ['magma', 'digiexam', 'Magma ↔ prov'],
];

/** Korrelation mellan elevers snitt i två källor (≥ 3 elever med båda). */
export function sambandsanalys(s: Struktur, f: DashboardFilter): Samband[] {
  const rs = dashboardResultat(s, { ...f, kallor: undefined });
  const ut: Samband[] = [];
  for (const [a, b, text] of SAMBAND_PAR) {
    const ma = elevSnittPerKalla(rs, a); const mb = elevSnittPerKalla(rs, b);
    const ids = [...ma.keys()].filter((id) => mb.has(id));
    const r = pearson(ids.map((id) => ma.get(id)!), ids.map((id) => mb.get(id)!));
    if (r !== null) ut.push({ a, b, r, n: ids.length, text });
  }
  return ut;
}

export type Kluster = 'stigande' | 'stabil' | 'riskzon' | 'ojamn';
export const KLUSTER_NAMN: Record<Kluster, string> = { stigande: 'Stigande', stabil: 'Stabil', riskzon: 'Riskzon', ojamn: 'Ojämn utveckling' };
export interface KlusterGrupp { kluster: Kluster; elever: Elev[]; serie: number[]; }

/**
 * Delar in elever efter hur de trendar: Riskzon = snitt under lägsta krav
 * i urvalet (annars < 60 %), Ojämn = stora kast mellan tillfällen,
 * Stigande = trend upp, annars Stabil. `serie` = klustrets snitt per tillfälle.
 */
export function trendKluster(s: Struktur, f: DashboardFilter): KlusterGrupp[] {
  const tillfallen = provTillfallen(s, f);
  const krav = tillfallen.map((t) => t.krav).filter((k): k is number => k !== null);
  const grans = krav.length > 0 ? Math.min(...krav) : 60;
  const per = new Map<Kluster, Elev[]>([['stigande', []], ['stabil', []], ['riskzon', []], ['ojamn', []]]);
  const kurvor = new Map<string, number[]>();
  for (const elev of sokElever(s, f.klassId, '')) {
    const k = elevKurva(s, elev.id, f).map((p) => p.procent);
    if (k.length === 0) continue;
    kurvor.set(elev.id, k);
    const m = snitt(k) ?? 0;
    const hopp = k.slice(1).map((v, i) => Math.abs(v - k[i]));
    const kluster: Kluster = m < grans ? 'riskzon'
      : hopp.length >= 2 && (snitt(hopp) ?? 0) > 25 ? 'ojamn'
        : trendFor(k) === 'upp' ? 'stigande' : 'stabil';
    per.get(kluster)!.push(elev);
  }
  return (['stigande', 'stabil', 'riskzon', 'ojamn'] as Kluster[]).map((kluster) => {
    const elever = per.get(kluster)!;
    const langd = Math.max(0, ...elever.map((e) => kurvor.get(e.id)!.length));
    const serie: number[] = [];
    for (let i = 0; i < langd; i++) {
      const v = snitt(elever.map((e) => kurvor.get(e.id)![i]).filter((x): x is number => x !== undefined));
      if (v !== null) serie.push(v);
    }
    return { kluster, elever, serie };
  });
}

export interface GruppSnitt { grupp: 'A' | 'B'; antalElever: number; perKalla: Record<KortKalla, number | null>; }

/** Snitt per grupp (A/B) och källa — 'Grupp A vs B'-widgeten. */
export function gruppSnitt(s: Struktur, f: DashboardFilter): GruppSnitt[] {
  const rs = dashboardResultat(s, f);
  const elever = s.elever.filter((e) => e.klassId === f.klassId);
  return (['A', 'B'] as const).map((grupp) => {
    const ids = new Set(elever.filter((e) => e.grupp === grupp).map((e) => e.id));
    const egna = rs.filter((r) => ids.has(r.elevId));
    const per = (k: KortKalla) => snitt(egna.filter((r) => k === 'helhet' || r.kalla === k).map(resultatProcent).filter((p): p is number => p !== null));
    return { grupp, antalElever: ids.size, perKalla: {
      'socrative-laxforhor': per('socrative-laxforhor'), 'socrative-exit': per('socrative-exit'),
      magma: per('magma'), digiexam: per('digiexam'), helhet: per('helhet') } };
  });
}

/** Förändring i procentenheter: senare halvan av tillfällena mot tidigare; null vid < 2 tillfällen. */
export function periodDelta(serie: number[]): number | null {
  if (serie.length < 2) return null;
  const mitt = Math.floor(serie.length / 2);
  return (snitt(serie.slice(mitt)) ?? 0) - (snitt(serie.slice(0, mitt)) ?? 0);
}

// ── Del 59: närvaro härledd ur läxförhör och exit tickets ──
//
// Regel: varje Socrative-tillfälle (läxförhör eller exit ticket) är en
// lektion där eleven förväntas svara. Saknat resultat = frånvaro den
// lektionen. Två tillfällen samma dag (läxförhör + exit) räknas som EN
// lektion; eleven är närvarande om hen svarat på minst ett av dem.

const NARVARO_KALLOR: ResultatKalla[] = ['socrative-laxforhor', 'socrative-exit'];

/** En lektion (datum + ämne) med de Socrative-tillfällen som hölls då. */
export interface NarvaroLektion {
  datum: string;
  vecka: number;
  /** Veckodag 1 = måndag … 7 = söndag. */
  veckodag: number;
  /** Tidigaste kända klockslag HH:MM, annars null. */
  tid: string | null;
  amneId: string | undefined;
  prov: string[];
  narvarande: string[];
  franvarande: string[];
  /** Andel närvarande (0–100). */
  narvaroProcent: number;
  /** Klassens snittresultat på lektionens tillfällen. */
  snittProcent: number | null;
}

function veckodagFor(datum: string): number {
  const d = new Date(`${datum}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Lektioner med härledd närvaro, kronologiskt. Källfiltret ignoreras (närvaro bygger alltid på Socrative). */
export function narvaroLektioner(s: Struktur, f: DashboardFilter): NarvaroLektion[] {
  const rs = dashboardResultat(s, { ...f, kallor: NARVARO_KALLOR });
  const alla = sokElever(s, f.klassId, '').map((e) => e.id);
  const grupper = new Map<string, Resultat[]>();
  for (const r of rs) {
    const n = `${r.datum}|${r.amneId ?? ''}`;
    grupper.set(n, [...(grupper.get(n) ?? []), r]);
  }
  return [...grupper.values()].map((g) => {
    const narv = new Set(g.map((r) => r.elevId));
    const narvarande = alla.filter((id) => narv.has(id));
    const franvarande = alla.filter((id) => !narv.has(id));
    const tider = g.map((r) => r.tid).filter((t): t is string => t !== undefined).sort();
    return {
      datum: g[0].datum, vecka: isoVecka(g[0].datum), veckodag: veckodagFor(g[0].datum),
      tid: tider[0] ?? null, amneId: g[0].amneId,
      prov: [...new Set(g.map((r) => r.prov))],
      narvarande, franvarande,
      narvaroProcent: alla.length === 0 ? 0 : Math.round((narvarande.length / alla.length) * 100),
      snittProcent: snitt(g.map(resultatProcent).filter((p): p is number => p !== null)),
    };
  });
}

export interface ElevNarvaro { elev: Elev; lektioner: number; narvarande: number; narvaroProcent: number | null; franvaroDatum: string[]; }

/** Närvaro per elev över lektionerna i urvalet. */
export function elevNarvaro(s: Struktur, f: DashboardFilter, sok = ''): ElevNarvaro[] {
  const lekt = narvaroLektioner(s, f);
  return sokElever(s, f.klassId, sok).map((elev) => {
    const narvarande = lekt.filter((l) => l.narvarande.includes(elev.id)).length;
    return {
      elev, lektioner: lekt.length, narvarande,
      narvaroProcent: lekt.length === 0 ? null : Math.round((narvarande / lekt.length) * 100),
      franvaroDatum: lekt.filter((l) => l.franvarande.includes(elev.id)).map((l) => l.datum),
    };
  });
}

export interface NarvaroKort {
  rubrik: string; fraga: string;
  antalLektioner: number;
  /** Klassens genomsnittliga närvaro (0–100). */
  narvaroProcent: number | null;
  /** Elever med närvaro under 80 %. */
  riskElever: Elev[];
  trend: Trend | null;
  /** Närvaro per lektion, kronologiskt. */
  serie: number[];
  /** Närvaro per vecka (snitt av lektionerna). */
  perVecka: Array<{ vecka: number; procent: number }>;
}

/** KPI-kort 'Närvaro — Är eleven på lektionen?'. */
export function narvaroKort(s: Struktur, f: DashboardFilter): NarvaroKort {
  const lekt = narvaroLektioner(s, f);
  const serie = lekt.map((l) => l.narvaroProcent);
  const veckor = [...new Set(lekt.map((l) => l.vecka))];
  return {
    rubrik: 'Närvaro', fraga: 'Är eleven på lektionen?',
    antalLektioner: lekt.length,
    narvaroProcent: snitt(serie),
    riskElever: elevNarvaro(s, f).filter((e) => e.narvaroProcent !== null && e.narvaroProcent < 80).map((e) => e.elev),
    trend: trendFor(serie),
    serie,
    perVecka: veckor.map((v) => ({ vecka: v, procent: snitt(lekt.filter((l) => l.vecka === v).map((l) => l.narvaroProcent)) ?? 0 })),
  };
}

/** Cell i 'Tid på dagen'-värmekartan: veckodag × klockslagsintervall → snittresultat. */
export interface TidCell { veckodag: number; pass: string; antal: number; snittProcent: number | null; narvaroProcent: number | null; }
export const TID_PASS = ['08–10', '10–12', '12–14', '14–16'] as const;

function passFor(tid: string): string | null {
  const h = Number(tid.slice(0, 2));
  if (Number.isNaN(h)) return null;
  return h < 10 ? '08–10' : h < 12 ? '10–12' : h < 14 ? '12–14' : '14–16';
}

/** Veckodag (1–5) × pass med snittresultat och närvaro; lektioner utan klockslag hoppas över. */
export function tidPaDagen(s: Struktur, f: DashboardFilter): TidCell[] {
  const lekt = narvaroLektioner(s, f).filter((l) => l.tid !== null && l.veckodag <= 5);
  const ut: TidCell[] = [];
  for (let dag = 1; dag <= 5; dag++) {
    for (const pass of TID_PASS) {
      const egna = lekt.filter((l) => l.veckodag === dag && passFor(l.tid!) === pass);
      ut.push({
        veckodag: dag, pass, antal: egna.length,
        snittProcent: snitt(egna.map((l) => l.snittProcent).filter((p): p is number => p !== null)),
        narvaroProcent: snitt(egna.map((l) => l.narvaroProcent)),
      });
    }
  }
  return ut;
}

/** Korrelation elevens närvaro ↔ elevens helhetssnitt (Pearson r), null vid < 3 elever. */
export function sambandNarvaro(s: Struktur, f: DashboardFilter): { r: number; n: number } | null {
  const rs = dashboardResultat(s, { ...f, kallor: undefined });
  const helhet = new Map<string, number[]>();
  for (const r of rs) { const p = resultatProcent(r); if (p !== null) helhet.set(r.elevId, [...(helhet.get(r.elevId) ?? []), p]); }
  const par = elevNarvaro(s, f).filter((e) => e.narvaroProcent !== null && helhet.has(e.elev.id));
  const r = pearson(par.map((e) => e.narvaroProcent!), par.map((e) => snitt(helhet.get(e.elev.id)!) ?? 0));
  return r === null ? null : { r, n: par.length };
}

// ── Del 63: trendlinje för fokusvyn ──────────────────────────

/**
 * Minsta-kvadrat-linje över index för en serie med luckor. Returnerar det
 * anpassade värdet på varje index (null-index behålls som null när serien har
 * färre än två mätpunkter). Används för att rita trenden ovanpå kurvan.
 */
export function trendLinje(varden: Array<number | null>): Array<number | null> {
  const pts = varden.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return varden.map(() => null);
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n; const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0; let sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); }
  const k = sxx === 0 ? 0 : sxy / sxx; const m = my - k * mx;
  const forsta = pts[0][0]; const sista = pts[n - 1][0];
  return varden.map((_, i) => (i < forsta || i > sista ? null : Math.round((k * i + m) * 10) / 10));
}
