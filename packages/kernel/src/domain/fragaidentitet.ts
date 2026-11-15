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
 * Del 249 · En fråga hör till sitt KAPITEL. Frågor ur olika kapitel blandas aldrig ihop — inte ens när texten
 * är identisk: 'Cellandning' i kapitel 4 och samma fråga i ett kapitel 6-quiz är två frågor, var och en i sitt
 * kapitels kolumner och summor. Kapitel 6-frågan får i stället en länk bakåt ("samma kunskap som i kapitel 4"),
 * så att man ser hur många som minns. Inom kapitlet gäller begreppet som förut: en omskriven fråga är samma
 * fråga. Ett kumulativt läxförhör över flera kapitel ('6.1 - 6.5, 7.1 - 7.4') lägger varje fråga i det av sina
 * kapitel där frågan (texten eller begreppet) redan finns, annars i quizets nyaste kapitel.
 *
 * Utåt skiljs två frågor med samma text åt av ett dolt kapitelmärke sist i texten (' [1a2b3c4d]') — visa
 * frågetexten med `utanKapitelmarke`.
 *
 * Del 243 · Bildfrågor ('Vad pekar nummer 6 på?') är egna frågor. De beskriver inget begrepp utan pekar i en
 * bild, så de knyts aldrig till begreppet: en bildfråga och en textfråga med samma rätta svar är två olika
 * frågor, även i olika quiz. Och samma bildtext med ett annat rätt svar (ny bild) är en ny fråga.
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

/**
 * Del 253 · Ett begrepp med ett annat namn inom parentes är samma svar under båda namnen:
 * 'Autonoma (självständiga) nervsystemet' = 'autonoma nervsystemet' = 'självständiga nervsystemet', och
 * 'DNA (arvsmassa)' = 'DNA' = 'arvsmassa'. Ger de andra namnen (som begreppsnycklar) — utan själva begreppet.
 */
export function begreppsvarianter(svar: string | undefined | null): string[] {
  const b = begreppUrFacit(svar);
  if (b === null) return [];
  const m = /^(.*?)\s*\(([^()]+)\)\s*(.*)$/.exec(b);
  if (m === null) return [];
  const [, fore, inom, efter] = m;
  if (fore.trim() === '' && efter.trim() === '') return [];
  const kandidater = [`${fore} ${efter}`];
  // Parentesen sist: det andra namnet står för hela begreppet. Mitt i: det ersätter ordet närmast före.
  if (efter.trim() === '') kandidater.push(inom);
  else kandidater.push(`${fore.trim().split(/\s+/).slice(0, -1).join(' ')} ${inom} ${efter}`);
  const hel = begreppsnyckel(b);
  const ut: string[] = [];
  for (const k of kandidater) {
    const n = begreppsnyckel(k.trim());
    if (n !== null && n !== hel && !ut.includes(n)) ut.push(n);
  }
  return ut;
}

/** Begreppet bakom varje fråga i ett tillfälle: facit ur rapporten, annars ett svar som rättats som rätt. */
function begreppPerFraga(rs: Resultat[]): { begrepp: Map<string, string | null>; varianter: Map<string, string[]> } {
  const ut = new Map<string, string | null>();
  const varianter = new Map<string, string[]>();
  for (const r of rs) {
    for (const sv of r.svar ?? []) {
      const n = fragenyckel(sv.fraga);
      if (ut.get(n) !== undefined && ut.get(n) !== null) continue;
      const kalla = sv.facit !== undefined ? sv.facit : sv.ratt === true ? sv.svar : null;
      const b = kalla === null ? null : begreppsnyckel(kalla);
      if (b !== null || !ut.has(n)) ut.set(n, b);
      if (b !== null) varianter.set(n, begreppsvarianter(kalla));
    }
  }
  return { begrepp: ut, varianter };
}

/** FNV-1a (32 bit) → 8 hex-tecken. Kapitelmärket som skiljer samma frågetext i två kapitel åt. */
function kortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Frågetexten som den ska visas — utan det dolda kapitelmärket (Del 249). */
export function utanKapitelmarke(fraga: string): string {
  return fraga.replace(/ \[[0-9a-f]{8}\]$/, '');
}

/** Del 249 · Samma kunskap i ett tidigare kapitel: frågan som länken pekar på (texten som den står i utdata). */
export interface TidigareKunskap { fraga: string; kapitel: string }

export interface EnadeFragor {
  resultat: Resultat[];
  /** Frågenyckel (ur utdatats frågetext) → frågan i ett tidigare kapitel som prövar samma kunskap. */
  tidigare: Map<string, TidigareKunskap>;
}

/**
 * Skriver om frågetexterna så att samma fråga har samma text i alla tillfällen — och olika frågor olika text.
 * Inom ett kapitel hålls en fråga ihop på begreppet (senaste formuleringen gäller); frågor ur olika kapitel hålls
 * isär, och den senare får en länk till den tidigare (`tidigare`). Indata muteras inte; resultat som inte ändras
 * lämnas som samma objekt.
 */
export function enaFragor(rs: Resultat[]): EnadeFragor {
  const tidigare = new Map<string, TidigareKunskap>();
  const grupper = new Map<string, Resultat[]>();
  for (const r of rs) {
    if (!SOCRATIVE.has(r.kalla) || (r.svar ?? []).length === 0) continue;
    const n = `${r.datum}|${r.kalla}|${r.prov}`;
    const g = grupper.get(n);
    if (g === undefined) grupper.set(n, [r]); else g.push(r);
  }
  if (grupper.size < 2) return { resultat: rs, tidigare };
  const tidAv = (g: Resultat[]): string => g.map((r) => r.tid).filter((t): t is string => t !== undefined).sort()[0] ?? '';
  const tillfallen = [...grupper.values()]
    .map((g) => {
      const { begrepp, varianter: allaVarianter } = begreppPerFraga(g);
      // Ett begrepp som i det här quizet är rätt svar på flera frågor pekar inte ut EN fråga här — de frågorna
      // går på sin text. I ett annat quiz, där begreppet bara hör till en fråga, gäller det som vanligt.
      // Del 243: bildfrågor räknas inte — de knyts aldrig till begreppet och gör det därför inte tvetydigt
      const bild = new Set([...begrepp.keys()].filter((n) => arBildfraga(n)));
      const antal = new Map<string, number>();
      for (const [n, b] of begrepp) if (b !== null && !bild.has(n)) antal.set(b, (antal.get(b) ?? 0) + 1);
      const tvetydiga = new Set([...antal].filter(([, n]) => n > 1).map(([b]) => b));
      // Del 253: det andra namnet inom parentes ('Autonoma (självständiga) nervsystemet') gäller bara när det inte
      // är en annan frågas svar i samma quiz — och inte två frågors andra namn
      const varAntal = new Map<string, number>();
      for (const [n, vs] of allaVarianter) if (!bild.has(n)) for (const v of vs) varAntal.set(v, (varAntal.get(v) ?? 0) + 1);
      const varianter = new Map<string, string[]>();
      for (const [n, vs] of allaVarianter) {
        const b = begrepp.get(n);
        if (bild.has(n) || b === null || b === undefined || tvetydiga.has(b)) continue;
        const ok = vs.filter((v) => !antal.has(v) && varAntal.get(v) === 1);
        if (ok.length > 0) varianter.set(n, ok);
      }
      return {
        datum: g[0].datum, tid: tidAv(g), omfang: g[0].amneId ?? '', koder: koderForProv(g[0].prov, g[0].rum), resultat: g, begrepp, varianter, tvetydiga, bild,
        kap: new Map<string, string>(), bildtillagg: new Map<string, string>(),
      };
    })
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.tid.localeCompare(b.tid));

  // Slå ihop inom kapitlet: frågetext ↔ begrepp (union–find). Textnoderna börjar med 'f|', begreppsnoderna med 'b|',
  // och båda bär kapitlet ('<ämne>:<kapitel>') — därför möts aldrig frågor ur olika kapitel.
  const foralder = new Map<string, string>();
  const rot = (x: string): string => {
    let r = x;
    for (let p = foralder.get(r); p !== undefined && p !== r; p = foralder.get(r)) r = p;
    foralder.set(x, r);
    return r;
  };
  const ena = (a: string, b: string): void => { const ra = rot(a); const rb = rot(b); if (ra !== rb) foralder.set(ra, rb); };

  // Del 249: kapitlet per fråga och tillfälle. Vad som redan finns i vilket kapitel minns vi per ämne.
  const textKap = new Map<string, string[]>();      // '<ämne>|<frågenyckel>' → kapitel där texten finns, i tidsordning
  const begreppKap = new Map<string, string[]>();   // '<ämne>|<begrepp>'     → kapitel där begreppet är en fråga
  const seddaKoder = new Map<string, Set<string>>();
  const lankFran = new Map<string, string>();       // textnod (senare kapitel) → nod i det tidigare kapitlet
  const identBegrepp = new Map<string, string>();   // textnod → begreppet (för bildfrågor: samma text räcker inte)
  const kapAv = (kod: string): string => kod.split('.')[0];
  const sist = <T,>(l: T[] | undefined, ok: (x: T) => boolean): T | undefined => (l ?? []).filter(ok).pop();
  for (const t of tillfallen) {
    const sedda = seddaKoder.get(t.omfang) ?? new Set<string>();
    seddaKoder.set(t.omfang, sedda);
    const nya = t.koder.filter((k) => !sedda.has(k));
    const nyaste = nya.length > 0 ? nya[nya.length - 1] : t.koder[t.koder.length - 1];
    for (const k of t.koder) sedda.add(k);
    const quizKap = new Set(t.koder.map(kapAv));
    const iQuizet = (c: string): boolean => quizKap.size === 0 || quizKap.has(c);
    const nyttKap = nyaste !== undefined ? kapAv(nyaste) : '';
    for (const [n, b] of t.begrepp) {
      const palitligt = b !== null && !t.tvetydiga.has(b) && !t.bild.has(n);
      const tk = `${t.omfang}|${n}`; const bk = `${t.omfang}|${b ?? ''}`;
      const andraNamn = t.varianter.get(n) ?? [];
      const viaAndraNamn = (ok: (x: string) => boolean): string | undefined => {
        for (const v of andraNamn) { const k = sist(begreppKap.get(`${t.omfang}|${v}`), ok); if (k !== undefined) return k; }
        return undefined;
      };
      const c = sist(textKap.get(tk), iQuizet) ?? (palitligt ? sist(begreppKap.get(bk), iQuizet) ?? viaAndraNamn(iQuizet) : undefined) ?? nyttKap;
      const cf = `${t.omfang}:${c}`;
      const nod = `f|${cf}|${n}`;
      t.kap.set(n, cf);
      const nyText = !(textKap.get(tk) ?? []).includes(c);
      const nyttBegrepp = palitligt && !(begreppKap.get(bk) ?? []).includes(c);
      // Samma kunskap i ett tidigare kapitel? Samma text (med samma svar, när båda är kända) eller samma begrepp.
      if (nyText && !lankFran.has(nod)) {
        const annat = (x: string): boolean => x !== c;
        const viaText = sist(textKap.get(tk), annat);
        const viaBegrepp = palitligt ? sist(begreppKap.get(bk), annat) : undefined;
        if (viaText !== undefined) {
          const mal = `f|${t.omfang}:${viaText}|${n}`;
          const forr = identBegrepp.get(mal);
          const sammaSvar = b === null || forr === undefined ? !t.bild.has(n) : sammaBegrepp(b, forr);
          if (sammaSvar) lankFran.set(nod, mal);
        }
        if (!lankFran.has(nod) && viaBegrepp !== undefined) lankFran.set(nod, `b|${t.omfang}:${viaBegrepp}|${b}`);
      }
      if (nyText) textKap.set(tk, [...(textKap.get(tk) ?? []), c]);
      if (nyttBegrepp) begreppKap.set(bk, [...(begreppKap.get(bk) ?? []), c]);
      if (b !== null) identBegrepp.set(nod, b);
      if (palitligt) ena(nod, `b|${cf}|${b}`);
      // Del 253: samma svar under sitt andra namn — frågan har skrivits om, begreppet är detsamma
      for (const v of andraNamn) {
        ena(nod, `b|${cf}|${v}`);
        const vk = `${t.omfang}|${v}`;
        if (!(begreppKap.get(vk) ?? []).includes(c)) begreppKap.set(vk, [...(begreppKap.get(vk) ?? []), c]);
      }
    }
  }

  // Del 243: samma bildtext med olika rätta svar (ny bild) i samma kapitel är olika frågor — texten får då
  // begreppet efter sig, 'Vad pekar nummer 1 på? (Hornhinna)'. Stavningsvarianter av samma begrepp räknas som ett.
  const bildsvar = new Map<string, Array<{ t: (typeof tillfallen)[number]; n: string; b: string }>>();
  for (const t of tillfallen) {
    for (const n of t.bild) {
      const b = t.begrepp.get(n);
      if (b === null || b === undefined) continue;
      const k = `${t.kap.get(n)}|${n}`;
      const l = bildsvar.get(k);
      if (l === undefined) bildsvar.set(k, [{ t, n, b }]); else l.push({ t, n, b });
    }
  }
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
  }

  // Senaste formuleringen per grupp; en grupp som rymmer två frågor ur samma quiz löses upp
  const senaste = new Map<string, { nyckel: string; text: string }>();
  const upplosta = new Set<string>();
  for (const t of tillfallen) {
    const iQuizet = new Map<string, string>();
    for (const r of t.resultat) {
      for (const sv of r.svar ?? []) {
        const n = fragenyckel(sv.fraga);
        const g = rot(`f|${t.kap.get(n)}|${n}`);
        const forra = iQuizet.get(g);
        if (forra !== undefined && forra !== n) upplosta.add(g);
        iQuizet.set(g, n);
        senaste.set(g, { nyckel: n, text: sv.fraga });
      }
    }
  }

  // Varje förekomst får sin identitet (gruppen, eller frågan själv när gruppen lösts upp) och sin grundtext.
  // Två identiteter med samma text — samma fråga i två kapitel — skiljs åt: den första behåller texten, de
  // senare får kapitelmärket efter sig.
  interface Ident { id: string; text: string; cf: string; grupp?: boolean }
  const identFor = (cf: string, n: string, egenText: string, tillagg: string | undefined): Ident => {
    const nod = `f|${cf}|${n}`;
    if (tillagg !== undefined) return { id: `${nod}|bild|${tillagg}`, text: `${egenText} (${tillagg})`, cf };
    const g = rot(nod);
    if (upplosta.has(g)) return { id: nod, text: egenText, cf };
    return { id: g, text: senaste.get(g)?.text ?? egenText, cf, grupp: true };
  };
  const utText = new Map<string, string>();          // identitet → texten i utdata
  const tagna = new Map<string, string>();           // frågenyckel → identiteten som har den
  const textFor = (i: Ident): string => {
    const klar = utText.get(i.id);
    if (klar !== undefined) return klar;
    let text = i.text;
    const agare = tagna.get(fragenyckel(text));
    if (agare !== undefined && agare !== i.id) text = `${i.text} [${kortHash(i.cf)}]`;
    tagna.set(fragenyckel(text), i.id);
    utText.set(i.id, text);
    return text;
  };
  const nodIdent = new Map<string, string>();        // textnod → identitet (för länkarna)
  const ut = new Map<Resultat, Resultat>();
  for (const t of tillfallen) {
    for (const r of t.resultat) {
      let andrad = false;
      const svar = (r.svar ?? []).map((sv: FragaSvar) => {
        const n = fragenyckel(sv.fraga);
        const cf = t.kap.get(n) ?? `${t.omfang}:`;
        const i = identFor(cf, n, sv.fraga, t.bildtillagg.get(n));
        nodIdent.set(`f|${cf}|${n}`, i.id);
        const text = textFor(i);
        if (text === sv.fraga) return sv;
        andrad = true;
        // Del 253: frågan har skrivits om sedan dess (samma svar) — den äldre formuleringen följer med
        const aldre = i.grupp === true && fragenyckel(sv.fraga) !== fragenyckel(i.text);
        return { ...sv, fraga: text, ...(aldre ? { aldreFraga: sv.fraga } : {}) };
      });
      if (andrad) ut.set(r, { ...r, svar });
    }
  }

  // Länkarna bakåt, uttryckta i utdatats texter
  for (const [fran, till] of lankFran) {
    const franId = nodIdent.get(fran);
    const tillId = till.startsWith('f|') ? nodIdent.get(till) : (upplosta.has(rot(till)) ? undefined : rot(till));
    const franText = franId === undefined ? undefined : utText.get(franId);
    const tillText = tillId === undefined ? undefined : utText.get(tillId);
    if (franText === undefined || tillText === undefined || franId === tillId) continue;
    const kapitel = till.split('|')[1].split(':').pop() ?? '';
    if (!tidigare.has(fragenyckel(franText))) tidigare.set(fragenyckel(franText), { fraga: tillText, kapitel });
  }
  return { resultat: ut.size === 0 ? rs : rs.map((r) => ut.get(r) ?? r), tidigare };
}

/** Som `enaFragor`, men bara resultaten — för den som inte behöver länkarna bakåt. */
export function enaFragorPaBegrepp(rs: Resultat[]): Resultat[] {
  return enaFragor(rs).resultat;
}
