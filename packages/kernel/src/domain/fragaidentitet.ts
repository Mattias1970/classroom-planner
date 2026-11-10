/**
 * SuperTeach · Frågans identitet — begreppet (det rätta svaret) före frågetexten.
 * (Ring 1, I2.)
 *
 * En begreppsfråga beskriver ett begrepp, och det rätta svaret ÄR begreppet.
 * När läraren skriver om beskrivningen i Socrative är det fortfarande samma
 * fråga: den ska hamna i samma kolumn som sina tidigare versioner, inte bli en
 * ny. Därför knyts Socrative-frågor ihop på begreppet. Frågetexten gäller som
 * förut när begreppet inte går att lita på:
 *
 *   – svaret är inget begrepp (sant/falskt, ja/nej, tal och uträkningar)
 *   – två olika frågor i samma quiz har samma rätta svar (begreppet pekar då
 *     inte ut EN fråga)
 *   – facit saknas och ingen elev har svarat rätt
 *
 * Begreppet gäller inom ämne och kapitel: samma ord i ett annat kapitel är en
 * annan fråga. Frågor med identisk text hålls ihop precis som tidigare.
 */
import { koderForProv } from './delkapitelkoder.js';
import { begreppUrFacit, type FragaSvar, type Resultat, type ResultatKalla } from './resultat.js';

const SOCRATIVE: ReadonlySet<ResultatKalla> = new Set<ResultatKalla>(['socrative-laxforhor', 'socrative-exit', 'socrative-ovning']);
const INGET_BEGREPP: ReadonlySet<string> = new Set(['true', 'false', 'sant', 'falskt', 'ja', 'nej', 'rätt', 'fel']);

/** Normaliserad frågetext — skiljetecken, mellanslag och skiftläge ignoreras. */
// Samma frågetexter normaliseras tusentals gånger per omritning — cacha resultatet
const nyckelCache = new Map<string, string>();
export function fragenyckel(fraga: string): string {
  const c = nyckelCache.get(fraga);
  if (c !== undefined) return c;
  const n = fraga.toLowerCase().replace(/[.,;:!?"'()[\]{}…]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nyckelCache.size > 20000) nyckelCache.clear();
  nyckelCache.set(fraga, n);
  return n;
}

/**
 * 'A • Ekologi' → 'ekologi'; null när svaret inte duger som begrepp:
 * sant/falskt, tal och uträkningar ('12', 'x + 2', 'a/b'), samt svar som bara
 * pekar på de andra alternativen ('Alla ovanstående').
 */
export function begreppsnyckel(svar: string | undefined | null): string | null {
  const b = begreppUrFacit(svar);
  if (b === null) return null;
  const ra = b.toLowerCase();
  if (/^[\d+\-−,.]/.test(ra) || /[=+*×÷^√<>]/.test(ra)) return null;
  // Ett begrepp är ett ord: minst två bokstäver i följd ('x − 2' och 'a/b' är uttryck)
  if (!/\p{L}{2}/u.test(ra)) return null;
  const n = fragenyckel(ra);
  if (n === '' || INGET_BEGREPP.has(n)) return null;
  if (/\b(ovan|ovanstående|alternativen|alternativ)$/.test(n) || /^(alla|båda|bägge|ingen|inget|inga)( (av )?(dem|dessa|svaren))?$/.test(n)) return null;
  return n;
}

/** Begreppet bakom varje fråga i ett tillfälle: facit ur rapporten, annars ett svar som rättats som rätt. */
function begreppPerFraga(rs: Resultat[]): Map<string, string | null> {
  const ut = new Map<string, string | null>();
  for (const r of rs) {
    for (const sv of r.svar ?? []) {
      const n = fragenyckel(sv.fraga);
      if (ut.get(n) !== undefined && ut.get(n) !== null) continue;
      const b = sv.facit !== undefined ? begreppsnyckel(sv.facit) : sv.ratt === true ? begreppsnyckel(sv.svar) : null;
      if (b !== null || !ut.has(n)) ut.set(n, b);
    }
  }
  return ut;
}

/**
 * Skriver om frågetexten i Socrative-resultaten så att alla versioner av samma
 * fråga (samma begrepp) bär EN text — den senaste formuleringen. Allt som sedan
 * parar ihop frågor på text (frågematris, trendkoll, återkommande fel) ser dem
 * som en och samma fråga. Indata muteras inte; resultat utan ändring returneras
 * som samma objekt.
 */
export function enaFragorPaBegrepp(rs: Resultat[]): Resultat[] {
  const grupper = new Map<string, Resultat[]>();
  for (const r of rs) {
    if (!SOCRATIVE.has(r.kalla) || (r.svar ?? []).length === 0) continue;
    const n = `${r.datum}|${r.kalla}|${r.prov}`;
    const g = grupper.get(n);
    if (g === undefined) grupper.set(n, [r]); else g.push(r);
  }
  if (grupper.size < 2) return rs;
  const tidAv = (g: Resultat[]): string => g.map((r) => r.tid).filter((t): t is string => t !== undefined).sort()[0] ?? '';
  const tillfallen = [...grupper.values()]
    .map((g) => {
      const kapitel = koderForProv(g[0].prov, g[0].rum)[0]?.split('.')[0] ?? '';
      return { datum: g[0].datum, tid: tidAv(g), omfang: `${g[0].amneId ?? ''}|${kapitel}`, resultat: g, begrepp: begreppPerFraga(g) };
    })
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.tid.localeCompare(b.tid));

  // Begrepp som i något quiz är rätt svar på flera frågor pekar inte ut en fråga
  const tvetydiga = new Set<string>();
  for (const t of tillfallen) {
    const sedda = new Set<string>();
    for (const b of t.begrepp.values()) {
      if (b === null) continue;
      const nod = `${t.omfang}|${b}`;
      if (sedda.has(nod)) tvetydiga.add(nod);
      sedda.add(nod);
    }
  }

  // Slå ihop: frågetext ↔ begrepp (union–find). Textnoderna börjar med 'f|', begreppsnoderna med 'b|'.
  const foralder = new Map<string, string>();
  const rot = (x: string): string => {
    let r = x;
    for (let p = foralder.get(r); p !== undefined && p !== r; p = foralder.get(r)) r = p;
    foralder.set(x, r);
    return r;
  };
  const ena = (a: string, b: string): void => { const ra = rot(a); const rb = rot(b); if (ra !== rb) foralder.set(ra, rb); };
  let kopplingar = 0;
  for (const t of tillfallen) {
    for (const [n, b] of t.begrepp) {
      if (b === null || tvetydiga.has(`${t.omfang}|${b}`)) continue;
      ena(`f|${n}`, `b|${t.omfang}|${b}`);
      kopplingar += 1;
    }
  }
  if (kopplingar === 0) return rs;

  // Senaste formuleringen per grupp; en grupp som rymmer två frågor ur samma quiz löses upp
  const senaste = new Map<string, { nyckel: string; text: string }>();
  const upplosta = new Set<string>();
  for (const t of tillfallen) {
    const iQuizet = new Map<string, string>();
    for (const r of t.resultat) {
      for (const sv of r.svar ?? []) {
        const n = fragenyckel(sv.fraga);
        const g = rot(`f|${n}`);
        const forra = iQuizet.get(g);
        if (forra !== undefined && forra !== n) upplosta.add(g);
        iQuizet.set(g, n);
        senaste.set(g, { nyckel: n, text: sv.fraga });
      }
    }
  }

  const nyText = (sv: FragaSvar): string | null => {
    const n = fragenyckel(sv.fraga);
    const g = rot(`f|${n}`);
    if (upplosta.has(g)) return null;
    const s = senaste.get(g);
    return s === undefined || s.nyckel === n ? null : s.text;
  };
  return rs.map((r) => {
    if (!SOCRATIVE.has(r.kalla) || r.svar === undefined) return r;
    let andrad = false;
    const svar = r.svar.map((sv) => {
      const text = nyText(sv);
      if (text === null) return sv;
      andrad = true;
      return { ...sv, fraga: text };
    });
    return andrad ? { ...r, svar } : r;
  });
}
