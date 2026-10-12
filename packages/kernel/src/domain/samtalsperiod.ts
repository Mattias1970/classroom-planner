/**
 * Del 191 · Perioden rapporten inför utvecklingssamtal gäller: från ett datum (terminsstart, eller
 * förra samtalet) till samtalsdatumet. När samtalen är klara sparas datumet, och nästa rapport
 * börjar där den förra slutade — en uppdatering från det datumet.
 *
 * (Ring 1, I2.)
 */
import type { Struktur } from './typer.js';

export interface SamtalsPeriodVal {
  /** Periodens första dag; saknas = förra samtalets datum, annars skolårets start. */
  fran?: string;
  /** Samtalsdatumet; saknas = idag. */
  till?: string;
  /** Datumen för tidigare genomförda samtal (senaste sist). */
  tidigare?: string[];
}

export interface SamtalsPeriod {
  fran: string;
  till: string;
  /** Förra samtalets datum, när det finns. */
  forra: string | null;
  /** Periodens början är skolårets start (inget tidigare samtal och inget eget val). */
  franTerminsstart: boolean;
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function skolarStart(s: Struktur, amneId: string): string | null {
  const amne = s.amnen.find((a) => a.id === amneId);
  const klass = s.klasser.find((k) => k.id === amne?.klassId);
  const tjanst = s.tjanster.find((t) => t.id === klass?.tjanstId);
  return s.skolar.find((x) => x.id === tjanst?.skolarId)?.start ?? null;
}

/** Perioden för ämnets rapport. */
export function samtalsPeriod(s: Struktur, amneId: string, idag: string): SamtalsPeriod {
  const v = s.samtalsPeriod?.[amneId] ?? {};
  const forra = v.tidigare !== undefined && v.tidigare.length > 0 ? v.tidigare[v.tidigare.length - 1] : null;
  const start = skolarStart(s, amneId);
  const fran = v.fran ?? forra ?? start ?? '0000-01-01';
  const till = v.till ?? idag;
  return { fran, till: till < fran ? fran : till, forra, franTerminsstart: v.fran === undefined && forra === null };
}

/** Ligger datumet i perioden (båda ändarna inräknade)? */
export function inomPeriod(datum: string, p: Pick<SamtalsPeriod, 'fran' | 'till'>): boolean {
  return datum >= p.fran && datum <= p.till;
}

/** Sätter periodens början och/eller slut (null = tillbaka till standard). Från får inte ligga efter till. */
export function sattSamtalsPeriod(s: Struktur, amneId: string, patch: { fran?: string | null; till?: string | null }, idag: string): Struktur {
  if (!s.amnen.some((a) => a.id === amneId)) throw new Error('Okänt ämne.');
  const alla = { ...(s.samtalsPeriod ?? {}) };
  const nu: SamtalsPeriodVal = { ...(alla[amneId] ?? {}) };
  for (const [k, v] of [['fran', patch.fran], ['till', patch.till]] as const) {
    if (v === undefined) continue;
    if (v === null) delete nu[k];
    else if (!DATUM.test(v)) throw new Error('Ange datumet som ÅÅÅÅ-MM-DD.');
    else nu[k] = v;
  }
  const p = samtalsPeriod({ ...s, samtalsPeriod: { ...alla, [amneId]: nu } }, amneId, idag);
  if ((nu.till ?? idag) < p.fran) throw new Error('Periodens slut ligger före dess början.');
  if (Object.keys(nu).length === 0) delete alla[amneId]; else alla[amneId] = nu;
  const { samtalsPeriod: _g, ...rest } = s; void _g;
  return Object.keys(alla).length === 0 ? rest : { ...rest, samtalsPeriod: alla };
}

/**
 * Samtalen är genomförda: samtalsdatumet sparas och nästa rapport börjar dagen därpå-i-praktiken
 * (från samma datum, så att inget faller mellan stolarna). Eget från/till nollställs.
 */
export function avslutaSamtal(s: Struktur, amneId: string, idag: string): Struktur {
  const p = samtalsPeriod(s, amneId, idag);
  const alla = { ...(s.samtalsPeriod ?? {}) };
  const tidigare = [...(alla[amneId]?.tidigare ?? []), p.till];
  alla[amneId] = { tidigare };
  return { ...s, samtalsPeriod: alla };
}

/** Ångra det senast sparade samtalet (perioden blir som före). */
export function angraAvslutatSamtal(s: Struktur, amneId: string): Struktur {
  const alla = { ...(s.samtalsPeriod ?? {}) };
  const tidigare = (alla[amneId]?.tidigare ?? []).slice(0, -1);
  if (tidigare.length === 0) delete alla[amneId]; else alla[amneId] = { tidigare };
  const { samtalsPeriod: _g, ...rest } = s; void _g;
  return Object.keys(alla).length === 0 ? rest : { ...rest, samtalsPeriod: alla };
}

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** '2026-10-15' → '15 oktober 2026'. */
export function datumText(iso: string): string {
  if (!DATUM.test(iso)) return iso;
  return `${Number(iso.slice(8, 10))} ${MANADER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** '17 augusti–15 oktober 2026' (året bara en gång när det är samma). */
export function periodText(p: Pick<SamtalsPeriod, 'fran' | 'till'>): string {
  const f = datumText(p.fran); const t = datumText(p.till);
  const sammaAr = p.fran.slice(0, 4) === p.till.slice(0, 4);
  return sammaAr ? `${f.replace(/ \d{4}$/, '')}–${t}` : `${f}–${t}`;
}
