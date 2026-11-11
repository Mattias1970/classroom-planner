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
 *     inte ut EN fråga i just det quizet)
 *   – facit saknas och ingen elev har svarat rätt
 *
 * Del 242 · Begreppet gäller inom ämnet — inte per kapitel. De kumulativa läxförhören spänner över flera
 * kapitel ('6.1 - 6.5, 7.1 - 7.4') medan exit ticketen hör till ett ('Nervsystemet 7.4'); med kapitlet i
 * nyckeln hamnade samma fråga i två kolumner så fort den skrivits om. Frågor med identisk text hålls ihop
 * precis som tidigare.
 *
 * Del 243 · Bildfrågor ('Vad pekar nummer 6 på?') är egna frågor. De beskriver inget begrepp utan pekar i en
 * bild, så de knyts aldrig till begreppet: en bildfråga och en textfråga med samma rätta svar är två olika
 * frågor, även i olika quiz. Och samma bildtext med ett annat rätt svar (ny bild) är en ny fråga.
 */
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

/**
 * Del 243 · En bildfråga hänvisar till en bild i stället för att beskriva begreppet: 'Vad pekar nummer 3 på?',
 * 'Vad visar bilden?', 'Vilken del är markerad med B?'. ('bildas' och 'telefonnummer' är inga bildord.)
 */
const BILDORD = /(?<!\p{L})(pekar|pilen|pilarna|pil\s+\d|bilden|bilderna|bild\s+\d|på\s+bild|figuren|figur\s+\d|(?:nummer|nr\.?|siffran?|bokstaven)\s*(?:\d+|[a-j])(?!\p{L})|markera[dt]e?|inringa[dt]e?)(?!\p{L})/iu;
export function arBildfraga(fraga: string): boolean {
  return BILDORD.test(fraga);
}

/** Två stavningar av samma begrepp ('cellmenbran'/'cellmembran', 'ribosom'/'ribosomer') — inte två olika begrepp. */
function sammaBegrepp(a: string, b: string): boolean {
  if (a === b) return true;
  const [kort, lang] = a.length <= b.length ? [a, b] : [b, a];
  if (kort.length >= 4 && lang.startsWith(kort) && lang.length - kort.length <= 3) return true;
  const tillatet = lang.length >= 9 ? 2 : lang.length >= 6 ? 1 : 0;
  if (tillatet === 0 || lang.length - kort.length > tillatet) return false;
  // redigeringsavstånd (Levenshtein), en rad i taget
  let rad = Array.from({ length: kort.length + 1 }, (_, i) => i);
  for (let i = 1; i <= lang.length; i++) {
    const ny = [i];
    for (let j = 1; j <= kort.length; j++) ny[j] = Math.min(rad[j] + 1, ny[j - 1] + 1, rad[j - 1] + (lang[i - 1] === kort[j - 1] ? 0 : 1));
    rad = ny;
  }
  return rad[kort.length] <= tillatet;
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
      const begrepp = begreppPerFraga(g);
      // Ett begrepp som i det här quizet är rätt svar på flera frågor pekar inte ut EN fråga här — de frågorna
      // går på sin text. I ett annat quiz, där begreppet bara hör till en fråga, gäller det som vanligt.
      // Del 243: bildfrågor räknas inte — de knyts aldrig till begreppet och gör det därför inte tvetydigt
      const bild = new Set([...begrepp.keys()].filter((n) => arBildfraga(n)));
      const antal = new Map<string, number>();
      for (const [n, b] of begrepp) if (b !== null && !bild.has(n)) antal.set(b, (antal.get(b) ?? 0) + 1);
      const tvetydiga = new Set([...antal].filter(([, n]) => n > 1).map(([b]) => b));
      return { datum: g[0].datum, tid: tidAv(g), omfang: g[0].amneId ?? '', resultat: g, begrepp, tvetydiga, bild, bildtillagg: new Map<string, string>() };
    })
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.tid.localeCompare(b.tid));

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
      if (b === null || t.tvetydiga.has(b) || t.bild.has(n)) continue;
      ena(`f|${n}`, `b|${t.omfang}|${b}`);
      kopplingar += 1;
    }
  }

  // Del 243: samma bildtext med olika rätta svar (ny bild) är olika frågor — texten får då begreppet efter sig,
  // 'Vad pekar nummer 1 på? (Hornhinna)'. Stavningsvarianter av samma begrepp räknas som ett.
  const bildsvar = new Map<string, Array<{ t: (typeof tillfallen)[number]; n: string; b: string }>>();
  for (const t of tillfallen) {
    for (const n of t.bild) {
      const b = t.begrepp.get(n);
      if (b === null || b === undefined) continue;
      const k = `${t.omfang}|${n}`;
      const l = bildsvar.get(k);
      if (l === undefined) bildsvar.set(k, [{ t, n, b }]); else l.push({ t, n, b });
    }
  }
  let delade = 0;
  for (const forekomster of bildsvar.values()) {
    const kluster: Array<typeof forekomster> = [];
    for (const f of forekomster) {
      const k = kluster.find((kl) => kl.some((x) => sammaBegrepp(x.b, f.b)));
      if (k === undefined) kluster.push([f]); else k.push(f);
    }
    if (kluster.length < 2) continue;
    for (const kl of kluster) {
      const senasteB = kl[kl.length - 1].b;   // tillfällena är i tidsordning: den senaste stavningen gäller
      const visat = senasteB.charAt(0).toUpperCase() + senasteB.slice(1);
      for (const f of kl) f.t.bildtillagg.set(f.n, visat);
    }
    delade += 1;
  }
  if (kopplingar === 0 && delade === 0) return rs;

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
  const tillaggFor = new Map<Resultat, Map<string, string>>();
  for (const t of tillfallen) if (t.bildtillagg.size > 0) for (const r of t.resultat) tillaggFor.set(r, t.bildtillagg);
  return rs.map((r) => {
    if (!SOCRATIVE.has(r.kalla) || r.svar === undefined) return r;
    const tillagg = tillaggFor.get(r);
    let andrad = false;
    const svar = r.svar.map((sv) => {
      const b = tillagg?.get(fragenyckel(sv.fraga));
      const text = b !== undefined ? `${sv.fraga} (${b})` : nyText(sv);
      if (text === null) return sv;
      andrad = true;
      return { ...sv, fraga: text };
    });
    return andrad ? { ...r, svar } : r;
  });
}
