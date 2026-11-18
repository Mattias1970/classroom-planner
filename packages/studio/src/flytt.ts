/**
 * Del 259 · Dra och släpp i planeringen: frågorna som ställs innan en flytt görs.
 *
 *  1. Berör flytten pass som har varit frågas om de får skrivas om.
 *  2. Får ett prov, en diagnos eller ett annat fast kort nytt datum på köpet visas vilka — och läraren säger ja
 *     eller nej. Inget ändras utan svar, och allt går att ångra med ↩.
 */
import type { FlyttadeKort, Struktur } from '@planner/kernel';

const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
/** 'fre 13/11' */
export function dagOchDatum(datum: string | null): string {
  if (datum === null) return 'utan datum';
  const d = new Date(`${datum}T00:00:00Z`);
  return `${DAG[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/**
 * Gör flytten med frågorna ovan. `forsok(tillat)` räknar ut flytten (kastar "har varit" när genomförda pass
 * berörs och `tillat` är false); `kor` genomför den så att den går att ångra.
 */
export function flyttaMedFragor(forsok: (tillatGenomford: boolean) => FlyttadeKort, namn: string, kor: (fn: () => Struktur, m: string) => void): void {
  let r: FlyttadeKort;
  try { r = forsok(false); }
  catch (e) {
    if (!/har varit/.test((e as Error).message)) { kor(() => { throw e; }, ''); return; }
    if (!window.confirm(`Flytta ${namn}?\n\n⚠ Det berör pass som har varit — passen skrivs om, även genomförda. Det går att ångra med ↩ Ångra.`)) return;
    try { r = forsok(true); } catch (e2) { kor(() => { throw e2; }, ''); return; }
  }
  if (r.fran === null) return;   // låg redan där
  if (r.flyttadeFasta.length > 0) {
    const lista = r.flyttadeFasta.map((f) => `• ${f.rubrik}: ${dagOchDatum(f.fran)} → ${dagOchDatum(f.till)}`).join('\n');
    if (!window.confirm(`Flytten ändrar också datum på:\n\n${lista}\n\nOK = flytta. Avbryt = låt allt ligga som det är.`)) return;
  }
  const s = r.s;
  kor(() => s, `${namn} flyttad — ${r.andrade} ${r.andrade === 1 ? 'lektion har' : 'lektioner har'} fått nytt pass.`);
}
