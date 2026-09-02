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
