/**
 * Lektionskort (v2): ren tidslogik för BAM-strukturen
 * Läxförhör → Genomgång → Arbete → Exit ticket, med klockslag härledda ur
 * passets start- och sluttid. Kortet visar också tavelrubriken
 * ("Ämne start–slut"), delkapitlets begrepp och arbetsnivåerna
 * (del 1: nivå 1/2 med minimum nivå 1; del 2: nivå 2/3 med minimum nivå 2).
 */
import { delkapitelKod } from './bok.js';
import type { BamDel, Bok, Lektion } from './typer.js';

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

/** Ett segment på tavlan: som BamSegment men med fritt namn (lärarens egna delar). */
export interface TavelSegment { namn: string; ikon: string; start: string; slut: string; minuter: number; text?: string }

const BAM_IKON: Record<string, string> = { 'Läxförhör': '📱', 'Genomgång': '🧑‍🏫', 'Arbete': '✏️', 'Exit ticket': '🎫', 'Instruktion': '📋', 'Prov': '📝', 'Laboration': '🧪', 'Diskussion': '💬', 'Film': '🎬', 'Paus': '☕' };

/** Standard-BAM som redigerbara delar — utgångspunkten när läraren trycker "Ändra BAM". */
export function standardBamDelar(lektion: Pick<Lektion, 'typ'>, start: string, slut: string): BamDel[] {
  return bamTidslinje(lektion, start, slut).map((x) => ({ namn: x.namn, minuter: x.minuter, ikon: x.ikon }));
}

/**
 * Del 143 · Tavlans tidslinje: lärarens egna delar (lp.bam) lagda efter varandra från
 * passets start, annars standard-BAM. Delar med 0 minuter hoppas över. Summan kan
 * skilja sig från passets längd — se `bamAvvikelse`.
 */
export function tavelTidslinje(lektion: Pick<Lektion, 'typ'>, start: string, slut: string, bam?: BamDel[]): TavelSegment[] {
  if (bam === undefined) return bamTidslinje(lektion, start, slut).map((x) => ({ ...x }));
  const ut: TavelSegment[] = [];
  let t = tillMin(start);
  for (const d of bam) {
    const min = Math.max(0, Math.round(d.minuter));
    if (min === 0) continue;
    ut.push({ namn: d.namn, ikon: d.ikon ?? BAM_IKON[d.namn] ?? '▪', start: tillKlockslag(t), slut: tillKlockslag(t + min), minuter: min, ...(d.text !== undefined && d.text !== '' ? { text: d.text } : {}) });
    t += min;
  }
  return ut;
}

/** Minuter som delarna avviker från passets längd: 0 = stämmer, >0 = för långt, <0 = tid över. */
export function bamAvvikelse(start: string, slut: string, bam: BamDel[]): number {
  const summa = bam.reduce((a, d) => a + Math.max(0, Math.round(d.minuter)), 0);
  return summa - Math.max(0, tillMin(slut) - tillMin(start));
}

/** Exit ticketens start med hänsyn till lärarens BAM (delen som heter Exit ticket, annars sista delen). */
export function exitStartFor(lektion: Pick<Lektion, 'typ'>, start: string, slut: string, bam?: BamDel[]): string | null {
  if (bam === undefined) return exitStart(lektion, start, slut);
  const seg = tavelTidslinje(lektion, start, slut, bam);
  return (seg.find((x) => /exit/i.test(x.namn)) ?? null)?.start ?? null;
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
/**
 * Lektionens uppgiftsintervall: bokens värden, med lärarens eventuella
 * överstyrningar (LektionsPlan.uppgNiva1–3) applicerade.
 */
export function effektivaNivaer(
  lektion: Pick<Lektion, 'niva1' | 'niva2' | 'niva3'>,
  lp?: { uppgNiva1?: string; uppgNiva2?: string; uppgNiva3?: string } | null,
): { niva1: string; niva2: string; niva3: string } {
  const v = (o: string | undefined, bok: string): string => (o !== undefined && o.trim() !== '' ? o : bok);
  return {
    niva1: v(lp?.uppgNiva1, lektion.niva1),
    niva2: v(lp?.uppgNiva2, lektion.niva2),
    niva3: v(lp?.uppgNiva3, lektion.niva3),
  };
}

export function arbetsNivaer(lektion: Pick<Lektion, 'del'>): { arbetar: [1, 2] | [2, 3]; minimum: 1 | 2 } {
  return lektion.del === 2 ? { arbetar: [2, 3], minimum: 2 } : { arbetar: [1, 2], minimum: 1 };
}
