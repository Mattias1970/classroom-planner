/**
 * Del 255 · Packad struktur: varje fråge-, svars- och facittext sparas en gång.
 *
 * Ett importerat förhör bär frågans text, elevens svar och facit för varje elev och varje fråga — samma
 * meningar trettio gånger per förhör. Det är det som fyller lagringen. Packningen byter texterna mot nummer
 * i en gemensam textlista, och frågornas ordning i ett förhör sparas en gång som en frågelista som alla
 * elevers resultat pekar på.
 *
 * Packningen är förlustfri: `packaUpp(packaStruktur(s))` ger samma struktur, tecken för tecken som JSON.
 * Svar som inte har exakt den kända formen lämnas orörda.
 */
import type { FragaSvar, Resultat } from './resultat.js';
import type { Struktur } from './typer.js';

/** En elevs svar på ett förhör: frågelistan, svarstexternas nummer och rätt/fel som tecken ('1', '0', '-' = inte rättat). */
export interface PackadeSvar { q: number; s: number[]; r: string }
/** Frågorna i ett förhör, i ordning: frågetextens nummer och facits nummer (null = inget facit). */
export interface Fragelista { f: number[]; c: Array<number | null> }
export type PackatResultat = Omit<Resultat, 'svar'> & { svar?: FragaSvar[] | PackadeSvar };
export interface PackadStruktur extends Omit<Struktur, 'resultat'> {
  packad: 1;
  texter: string[];
  fragelistor: Fragelista[];
  resultat?: PackatResultat[];
}

const UTAN_FACIT = 'fraga,svar,ratt';
const MED_FACIT = 'fraga,svar,ratt,facit';

/** Svaren har exakt den kända formen (samma nycklar i samma ordning, rätt typer) — bara då packas de. */
function kanPackas(svar: FragaSvar[]): boolean {
  if (svar.length === 0) return false;
  for (const sv of svar) {
    if (sv === null || typeof sv !== 'object') return false;
    const nycklar = Object.keys(sv).join(',');
    if (nycklar !== UTAN_FACIT && nycklar !== MED_FACIT) return false;
    if (typeof sv.fraga !== 'string' || typeof sv.svar !== 'string') return false;
    if (sv.ratt !== true && sv.ratt !== false && sv.ratt !== null) return false;
    if (nycklar === MED_FACIT && typeof sv.facit !== 'string') return false;
  }
  return true;
}

/** Är värdet en packad struktur? */
export function arPackad(v: unknown): v is PackadStruktur {
  return typeof v === 'object' && v !== null && (v as { packad?: unknown }).packad === 1;
}

/** Packar strukturens resultat. Allt annat i strukturen lämnas som det är. */
export function packaStruktur(s: Struktur): PackadStruktur {
  const texter: string[] = [];
  const textNr = new Map<string, number>();
  const nr = (t: string): number => {
    let n = textNr.get(t);
    if (n === undefined) { n = texter.length; texter.push(t); textNr.set(t, n); }
    return n;
  };
  const fragelistor: Fragelista[] = [];
  const listNr = new Map<string, number>();
  const packa = (r: Resultat): PackatResultat => {
    const svar = r.svar;
    if (!Array.isArray(svar) || !kanPackas(svar)) return r;
    const f = svar.map((sv) => nr(sv.fraga));
    const c = svar.map((sv) => (sv.facit === undefined ? null : nr(sv.facit)));
    const nyckel = `${f.join(',')}|${c.join(',')}`;
    let q = listNr.get(nyckel);
    if (q === undefined) { q = fragelistor.length; fragelistor.push({ f, c }); listNr.set(nyckel, q); }
    const packade: PackadeSvar = { q, s: svar.map((sv) => nr(sv.svar)), r: svar.map((sv) => (sv.ratt === true ? '1' : sv.ratt === false ? '0' : '-')).join('') };
    return { ...r, svar: packade };
  };
  // resultat behåller sin plats bland nycklarna; det nya läggs sist — så blir uppackningen tecken för tecken densamma
  return { ...s, ...(s.resultat !== undefined ? { resultat: s.resultat.map(packa) } : {}), packad: 1, texter, fragelistor };
}

/** Packar upp en packad struktur. Kastar om filen pekar på texter eller frågelistor som inte finns (skadad fil). */
export function packaUpp(p: PackadStruktur): Struktur {
  const { texter, fragelistor } = p;
  if (!Array.isArray(texter) || !Array.isArray(fragelistor)) throw new Error('Filen är skadad: textlistan eller frågelistorna saknas.');
  const text = (n: unknown): string => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= texter.length || typeof texter[n] !== 'string') throw new Error('Filen är skadad: ett svar pekar på en text som inte finns.');
    return texter[n];
  };
  const upp = (r: PackatResultat): Resultat => {
    const sv = r.svar;
    if (sv === undefined || Array.isArray(sv)) return r as Resultat;
    const lista = fragelistor[sv.q];
    if (lista === undefined || !Array.isArray(lista.f) || !Array.isArray(lista.c) || !Array.isArray(sv.s) || typeof sv.r !== 'string'
      || lista.f.length !== sv.s.length || lista.c.length !== sv.s.length || sv.r.length !== sv.s.length) {
      throw new Error('Filen är skadad: ett resultat stämmer inte med sin frågelista.');
    }
    const svar: FragaSvar[] = sv.s.map((s, i) => {
      const tecken = sv.r[i];
      if (tecken !== '1' && tecken !== '0' && tecken !== '-') throw new Error('Filen är skadad: okänt tecken för rätt/fel.');
      const c = lista.c[i];
      return { fraga: text(lista.f[i]), svar: text(s), ratt: tecken === '1' ? true : tecken === '0' ? false : null, ...(c === null ? {} : { facit: text(c) }) };
    });
    return { ...r, svar };
  };
  const resten: Record<string, unknown> = { ...p };
  delete resten.packad; delete resten.texter; delete resten.fragelistor;
  if (p.resultat !== undefined) resten.resultat = p.resultat.map(upp);
  return resten as unknown as Struktur;
}

/**
 * JSON med en post per rad: nycklarna i `djup` nivåer får var sin rad, och listor därunder ett element per rad.
 * Samma innehåll som JSON.stringify — men en ny elev eller ett nytt resultat blir en ny rad i filen i stället
 * för en ändring mitt i en enda jätterad, och filen blir mycket mindre än med indrag.
 */
export function radvisJson(v: unknown, djup = 2): string {
  const rad = (x: unknown, kvar: number): string => {
    if (kvar >= 0 && Array.isArray(x) && x.length > 0) return `[\n${x.map((e) => JSON.stringify(e) ?? 'null').join(',\n')}\n]`;
    if (kvar > 0 && typeof x === 'object' && x !== null && !Array.isArray(x)) {
      const poster = Object.entries(x as Record<string, unknown>).filter(([, e]) => JSON.stringify(e) !== undefined);
      if (poster.length === 0) return '{}';
      return `{\n${poster.map(([k, e]) => `${JSON.stringify(k)}:${rad(e, kvar - 1)}`).join(',\n')}\n}`;
    }
    return JSON.stringify(x) ?? 'null';
  };
  return rad(v, djup);
}
