/**
 * Del 250 · Perioden som resultaten gäller — ur planeringen och förhörens datum. (Ring 1, I2.)
 *
 * Periodfältet överst visade ett fast exempel ('v.34–42') som såg ut som den valda perioden. Den riktiga perioden
 * för ett ämne är planeringens: delämnets period i NO+Tk-blocket (lärarens egna datum eller blockets), annars
 * första till sista planerade lektion. Förhör som ligger utanför planeringen vidgar perioden, så att inget
 * genomfört förhör hamnar utanför.
 */
import type { Amne, IsoDatum, Struktur } from './typer.js';
import { isoVecka } from './skolar.js';
import { amnenForKlass, elevernaIKlassen, noPeriodFor } from './struktur.js';
import { planForAmne } from './studieguide.js';

export interface ResultatPeriod {
  fran: IsoDatum;
  till: IsoDatum;
  /** 'v.34–45' (eller 'v.34' när perioden ryms i en vecka). */
  veckor: string;
  /** Vad perioden bygger på: planeringen, förhörens datum eller båda. */
  kalla: 'planering' | 'forhor' | 'planering+forhor';
}

/** Ämnets period enligt planeringen: delämnets period i NO+Tk-blocket, annars första–sista planerade lektion. */
export function planeringsperiod(s: Struktur, amne: Amne): { fran: IsoDatum; till: IsoDatum } | null {
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const skolar = s.skolar.find((la) => la.id === s.tjanster.find((t) => t.id === klass?.tjanstId)?.skolarId);
  if (skolar !== undefined) {
    const no = noPeriodFor(skolar, amne);
    if (no !== null) return { fran: no.fran, till: no.till };
  }
  const datum = planForAmne(s, amne.id).map((r) => r.datum).filter((d): d is IsoDatum => typeof d === 'string' && d !== '').sort();
  return datum.length === 0 ? null : { fran: datum[0], till: datum[datum.length - 1] };
}

/**
 * Perioden för klassens resultat i ett ämne (eller i alla ämnen, amneId ''): planeringens period, vidgad så att
 * den rymmer alla förhör. Med alla ämnen räknas bara ämnen som har förhör eller vars period har börjat.
 * null när varken planering eller förhör finns.
 */
export function resultatPeriod(s: Struktur, klassId: string, amneId: string, idag: IsoDatum): ResultatPeriod | null {
  const amnen = amneId !== '' ? s.amnen.filter((a) => a.id === amneId) : amnenForKlass(s, klassId);
  if (amnen.length === 0) return null;
  const elevIds = new Set(elevernaIKlassen(s, klassId).map((e) => e.id));
  const amneIds = new Set(amnen.map((a) => a.id));
  const forhor = (s.resultat ?? []).filter((r) => elevIds.has(r.elevId) && r.amneId !== undefined && amneIds.has(r.amneId));
  const medForhor = new Set(forhor.map((r) => r.amneId));
  const planer = amnen
    .map((a) => ({ a, p: planeringsperiod(s, a) }))
    .filter((x): x is { a: Amne; p: { fran: IsoDatum; till: IsoDatum } } => x.p !== null && (amneId !== '' || medForhor.has(x.a.id) || x.p.fran <= idag))
    .map((x) => x.p);
  const datum = forhor.map((r) => r.datum).sort();
  const start = [...planer.map((p) => p.fran), ...(datum.length > 0 ? [datum[0]] : [])].sort();
  const slut = [...planer.map((p) => p.till), ...(datum.length > 0 ? [datum[datum.length - 1]] : [])].sort();
  if (start.length === 0) return null;
  const fran = start[0]; const till = slut[slut.length - 1];
  const vf = isoVecka(fran); const vt = isoVecka(till);
  return {
    fran, till, veckor: vf === vt && fran.slice(0, 4) === till.slice(0, 4) ? `v.${vf}` : `v.${vf}–${vt}`,
    kalla: planer.length > 0 && datum.length > 0 ? 'planering+forhor' : planer.length > 0 ? 'planering' : 'forhor',
  };
}
