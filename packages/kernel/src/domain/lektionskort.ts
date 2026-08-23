/**
 * Lektionskort (v2): ren tidslogik för BAM-strukturen
 * Läxförhör → Genomgång → Arbete → Exit ticket, med klockslag härledda ur
 * passets start- och sluttid. Kortet visar också tavelrubriken
 * ("Ämne start–slut"), delkapitlets begrepp och arbetsnivåerna
 * (del 1: nivå 1/2 med minimum nivå 1; del 2: nivå 2/3 med minimum nivå 2).
 */
import { delkapitelKod } from './bok.js';
import type { Bok, Lektion } from './typer.js';

export function tillMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function tillKlockslag(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
function round5(n: number): number { return Math.round(n / 5) * 5; }
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }

export interface BamSegment {
  namn: 'Läxförhör' | 'Genomgång' | 'Arbete' | 'Exit ticket' | 'Instruktion' | 'Prov';
  ikon: string;
  start: string;
  slut: string;
  minuter: number;
}

/**
 * BAM-tidslinje för ett pass. Vanliga lektioner: läxförhör 5–10 min,
 * genomgång 10–20, exit ticket sist (10 min vid ≥50-minuterspass, annars 8),
 * arbete resten. Prov: kort instruktion + provtid. Deterministisk (5-min-steg)
 * så att kortet alltid visar samma klockslag för samma pass.
 */
export function bamTidslinje(lektion: Pick<Lektion, 'typ'>, start: string, slut: string): BamSegment[] {
  const s0 = tillMin(start), s1 = tillMin(slut);
  const total = Math.max(0, s1 - s0);
  if (total === 0) return [];
  if (lektion.typ === 'exam') {
    const instr = Math.min(5, total);
    return [
      { namn: 'Instruktion', ikon: '📋', start, slut: tillKlockslag(s0 + instr), minuter: instr },
      { namn: 'Prov', ikon: '📝', start: tillKlockslag(s0 + instr), slut, minuter: total - instr },
    ];
  }
  const laxforhor = clamp(round5(total * 0.15), 5, 10);
  const genomgang = clamp(round5(total * 0.25), 10, 20);
  const exit = total >= 50 ? 10 : 8;
  const arbete = Math.max(0, total - laxforhor - genomgang - exit);
  const punkter = [laxforhor, genomgang, arbete, exit];
  const namn: BamSegment['namn'][] = ['Läxförhör', 'Genomgång', 'Arbete', 'Exit ticket'];
  const ikoner = ['📱', '🧑‍🏫', '✏️', '🎫'];
  const ut: BamSegment[] = [];
  let t = s0;
  for (let i = 0; i < 4; i++) {
    if (punkter[i] <= 0) continue;
    ut.push({ namn: namn[i], ikon: ikoner[i], start: tillKlockslag(t), slut: tillKlockslag(t + punkter[i]), minuter: punkter[i] });
    t += punkter[i];
  }
  return ut;
}

/** Exit ticketens starttid: passets slut minus exit-segmentets längd. */
export function exitStart(lektion: Pick<Lektion, 'typ'>, start: string, slut: string): string | null {
  const seg = bamTidslinje(lektion, start, slut).find((x) => x.namn === 'Exit ticket');
  return seg?.start ?? null;
}

/** Tavelrubriken högst upp: 'Ma 09:00–10:00'. */
export function tavelrubrik(amnesKort: string, start: string, slut: string): string {
  return `${amnesKort} ${start}–${slut}`;
}

/** Delkapitlets begrepp för en lektion (faller tillbaka på lektionens egna). */
export function begreppForLektion(bok: Bok, kapitelNr: number, lektion: Lektion): string[] {
  const kod = delkapitelKod(lektion.avsnitt);
  const kap = bok.kapitel.find((k) => k.nr === kapitelNr);
  if (kod !== null && kap) {
    const d = kap.delkapitel.find((x) => x.kod === kod);
    if (d && d.begrepp.length > 0) return d.begrepp;
  }
  return lektion.begrepp === '—' ? [] : lektion.begrepp.split(',').map((b) => b.trim()).filter((b) => b !== '');
}

/** Arbetsblockets nivåer: del 1 ⇒ [nivå1, nivå2] (minimum nivå1), del 2 ⇒ [nivå2, nivå3] (minimum nivå2). */
export function arbetsNivaer(lektion: Pick<Lektion, 'del'>): { arbetar: [1, 2] | [2, 3]; minimum: 1 | 2 } {
  return lektion.del === 2 ? { arbetar: [2, 3], minimum: 2 } : { arbetar: [1, 2], minimum: 1 };
}
