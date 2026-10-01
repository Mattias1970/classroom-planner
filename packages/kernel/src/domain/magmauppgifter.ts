/**
 * Del 153 · Magma-testens uppgifter (Ring 1, I2: ingen fetch/DOM/lagring; PDF:en
 * läses i UI-lagret med pdf.js och skickas hit som text-items med koordinater).
 *
 * Ett Magma-test är två filer: resultatet (xlsx, magmaprov.ts) och uppgifterna
 * (pdf). Här tolkas PDF:en till uppgifter med:
 *   • en innehållsnyckel per uppgift — samma uppgift i olika test (en diagnos
 *     som återanvänder uppgifter ur ett test) får samma nyckel och jämförs som
 *     Socrative-frågor;
 *   • en testnyckel — två test med exakt samma uppgifter (olika kopior, olika
 *     namn) räknas som ett och samma test i resultaten;
 *   • en klassning: delkapitel (ur bokens delkapitelnamn och begrepp, begränsat
 *     av testets avsnitt i titeln) och förmåga B/M/P/R. Läraren kan ändra
 *     klassningen; ändringen gäller uppgiften i alla test.
 * Analysen räknar sedan per uppgift, per delkapitel och per förmåga — så att
 * olika test kan jämföras genom delkapitlen när uppgifterna inte är desamma.
 */
import type { FragaSvar } from './resultat.js';

export type MagmaFormaga = 'B' | 'M' | 'P' | 'R';
export const FORMAGA_NAMN: Record<MagmaFormaga, string> = { B: 'Begrepp', M: 'Metod', P: 'Problemlösning', R: 'Resonemang' };

/** En text-item ur PDF:en (pdf.js): text, position och höjd, samt sidnummer (1-baserat). */
export interface MagmaPdfItem { text: string; x: number; y: number; h: number; sida: number; }

export interface MagmaKlass { delkapitel: string | null; formagor: MagmaFormaga[]; }

export interface MagmaUppgiftDef extends MagmaKlass {
  /** Uppgiftens nummer i testet ('1' …). */
  nr: string;
  /** Innehållsnyckel — samma uppgift i olika test har samma nyckel. */
  nyckel: string;
  /** Läsbar uppgiftstext (bråk som 2/3, exponenter som ²). */
  text: string;
  flerval: boolean;
  sida: number;
}

export interface MagmaTestDef {
  /** Testets namn ur PDF:ens sidhuvud ('1.1 - 1.3 Test'). */
  titel: string;
  filnamn: string;
  /** Nyckel för hela uppgiftsuppsättningen — samma uppgifter = samma test. */
  testNyckel: string;
  uppgifter: MagmaUppgiftDef[];
}

/** Bokens delkapitel för klassningen: kod, namn och begrepp. */
export interface MagmaDelkapitelInfo { kod: string; namn: string; begrepp: string[]; }

// ── Hjälpare ──────────────────────────────────────────────────────────────────

/** FNV-1a (32 bit) → 8 hex-tecken. Stabil och ren. */
export function kortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const OSYNLIGA = /[​-‏⁠﻿\s]/g;
const UPPHOJT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const upphojt = (s: string) => [...s].map((c) => UPPHOJT[c] ?? c).join('');
const arTal = (s: string) => /^-?\d+(?:[,.]\d+)?$/.test(s);
const normTitel = (s: string) => s.toLowerCase().replace(/\.(pdf|xlsx|xls)$/i, '').replace(/[_–—-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Texten som inte hör till uppgiften: sidhuvud, namnruta, svarsruta, sidnummer. */
function brus(it: MagmaPdfItem, titel: string): boolean {
  const t = it.text.trim();
  if (t === '' || /^(svar|hej, jag heter|:)$/i.test(t)) return true;
  if (t === titel && it.y > 790) return true;
  if (it.y < 30) return true;               // sidfot (sidnummer)
  return false;
}

/**
 * Läsbar text ur en uppgifts items: staplade tal (täljare över nämnare) blir 2/3,
 * små upphöjda tal blir exponenter, raderna läses uppifrån och ned.
 */
function lasbarText(items: MagmaPdfItem[]): string {
  const kvar = [...items];
  type Tok = { text: string; x: number; y: number; h: number };
  const tok: Tok[] = [];
  // Bråk: två tal med samma x (±3) och höjd, 8–17 punkter isär i y
  const anvand = new Set<MagmaPdfItem>();
  for (const a of kvar) {
    if (anvand.has(a) || !arTal(a.text.trim())) continue;
    const b = kvar.find((c) => c !== a && !anvand.has(c) && arTal(c.text.trim()) && Math.abs(c.x - a.x) <= 7 && Math.abs(c.h - a.h) <= 1 && a.y - c.y >= 8 && a.y - c.y <= 17);
    if (b !== undefined) { anvand.add(a); anvand.add(b); tok.push({ text: `${a.text.trim()}/${b.text.trim()}`, x: a.x, y: (a.y + b.y) / 2, h: a.h }); }
  }
  for (const a of kvar) if (!anvand.has(a)) tok.push({ text: a.text.trim(), x: a.x, y: a.y, h: a.h });
  // Exponenter: litet tal strax ovanför och till höger om ett tal
  for (const e of tok) {
    if (!arTal(e.text)) continue;
    const baser = tok.filter((b) => b !== e && b.h - e.h >= 2 && e.y - b.y >= 2 && e.y - b.y <= 9 && e.x > b.x && e.x - b.x <= 90 && /[\d)]$/.test(b.text));
    const bas = baser.sort((a, b) => b.x - a.x)[0];
    if (bas !== undefined) { e.text = upphojt(e.text); e.y = bas.y; e.h = bas.h; }
  }
  // Rader uppifrån och ned (tolerans 7), vänster till höger
  tok.sort((a, b) => b.y - a.y || a.x - b.x);
  const rader: Tok[][] = [];
  for (const t of tok) {
    const r = rader.find((rad) => Math.abs(rad[0].y - t.y) <= 7);
    if (r !== undefined) r.push(t); else rader.push([t]);
  }
  return rader.map((r) => r.sort((a, b) => a.x - b.x).map((t) => t.text).join(' ').replace(/\s+([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, '$1').replace(/\s+/g, ' ').trim())
    .filter((r) => r !== '').join('\n');
}

/** Innehållsnyckel: items ordnade på x (avrundat) och sedan uppifrån — oberoende av var på sidan uppgiften står. */
function innehallsNyckel(items: MagmaPdfItem[]): string {
  const ordnade = [...items].sort((a, b) => Math.round(a.x / 2) - Math.round(b.x / 2) || b.y - a.y);
  return kortHash(ordnade.map((i) => i.text.replace(OSYNLIGA, '')).filter((x) => x !== '').join('|'));
}

// ── Klassning ────────────────────────────────────────────────────────────────

/** Testets avsnittsintervall ur titeln: '1.1 - 1.3 Test' → 1.1–1.3; 'efter avsnitt 1.3' → x.1–1.3; 'Kap 1' → 1.*. */
export function magmaAvsnittIntervall(titel: string): { kapitel: number; fran: number; till: number } | null {
  const t = titel.toLowerCase();
  const m = /(\d+)\.(\d+)\s*[-–]\s*(\d+)\.(\d+)/.exec(t);
  if (m !== null) return { kapitel: Number(m[1]), fran: Number(m[2]), till: Number(m[4]) };
  const e = /efter\s+avsnitt\s+(\d+)\.(\d+)/.exec(t);
  if (e !== null) return { kapitel: Number(e[1]), fran: 1, till: Number(e[2]) };
  const k = /kap(?:itel)?\.?\s*(\d+)/.exec(t);
  if (k !== null) return { kapitel: Number(k[1]), fran: 1, till: 99 };
  return null;
}

/** Förmåga ur uppgiftens text: R (förklara, visa, varför), P (vardagsproblem), B (representationer), annars M. */
export function klassaFormaga(text: string, flerval: boolean): MagmaFormaga[] {
  const t = text.toLowerCase();
  const R = /förklara|motivera|visa hur du tänker|visa att|varför|får du samma|stämmer det|blir värdet/.test(t);
  const B = /vilken uträkning|vilket tal är lika|vilken omvandling|vilken av pilarna|vilket av talen|bilden visar|diagrammet visar|andel/.test(t)
    || (/^skriv i (blandad form|bråkform)\.?$/m.test(t) && !/\d\/\d/.test(t));
  const P = !/andel/.test(t) && !/hur mycket är\s*[\d(]/.test(t) && /hur mycket|hur lång|hur stor|hur många|efter hur|hur långt/.test(t) && t.length > 30;
  if (flerval && B) return ['B'];
  const ut: MagmaFormaga[] = [];
  if (P) ut.push('P');
  if (R) ut.push('R');
  if (B && ut.length === 0) ut.push('B');
  return ut.length > 0 ? ut : ['M'];
}

const ord = (s: string) => s.toLowerCase().replace(/[^a-zåäö0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4);

/**
 * Delkapitel ur uppgiftens text: räknesätt och nyckelord matchas mot bokens
 * delkapitelnamn ('Division av bråk', 'Potenser', 'Tiopotenser' …) och begrepp,
 * begränsat till testets avsnitt. null när inget delkapitel passar.
 */
export function klassaDelkapitel(text: string, delkapitel: MagmaDelkapitelInfo[], titel: string): string | null {
  const iv = magmaAvsnittIntervall(titel);
  const iKap = delkapitel.filter((d) => iv === null || Number(d.kod.split('.')[0]) === iv.kapitel);
  const iIntervall = iKap.filter((d) => { if (iv === null) return true; const n = Number(d.kod.split('.')[1]); return n >= iv.fran && n <= iv.till; });
  if (iKap.length === 0) return null;
  const t = text.toLowerCase();
  const harBrak = /\d\/\d|bråk|hälften|halva|tredjedel|fjärdedel/.test(t);
  // Delkapitel vars namn passar — helst inom testets avsnitt, annars i kapitlet (en repetitionsuppgift ur ett tidigare avsnitt)
  const medNamn = (re: RegExp, kravBrak = true): string | null => {
    for (const lista of [iIntervall, iKap]) {
      const d = lista.find((x) => re.test(x.namn.toLowerCase()) && (!kravBrak || !/bråk/.test(x.namn.toLowerCase()) || harBrak));
      if (d !== undefined) return d.kod;
    }
    return null;
  };
  // 1. Potenser och tiopotenser
  if (/tiopotens|grundpotensform|miljon|miljard|[⋅·×]\s*10[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(t)) { const k = medNamn(/tiopotens/, false); if (k !== null) return k; }
  if (/[⁰¹²³⁴⁵⁶⁷⁸⁹]|potens|dubbelt så|fördubbl/.test(t)) { const k = medNamn(/^potens|\bpotenser\b/, false); if (k !== null) return k; }
  // 2. Bråkens grunder: förkorta, förlänga, blandad form, jämföra, andel, tallinje
  if (/förkorta|förläng|blandad form|bråkform|lika med|storleksordning|mgn|pilarna|litermått|omvandling|andel/.test(t)
    && !/[+−⋅·×]/.test(t) && !/\d\s\/\s/.test(t) && !/beräkna/.test(t)) {
    const k = medNamn(/räkna med bråk|tal i bråkform|^bråk/, false);
    if (k !== null) return k;
  }
  // 3. Räknesätt (för delkapitel 'av bråk' krävs att uppgiften har bråk)
  if (/hälften|halva/.test(t) && !/[\/⋅·×]/.test(t)) {
    // 'Hälften av' är multiplikation eller division med bråk — det som ingår i testets avsnitt
    const inom = iIntervall.find((d) => /division|multiplikation/.test(d.namn.toLowerCase()));
    if (inom !== undefined) return inom.kod;
  }
  if (/divid|division|\s\/\s|\/\s\d|\d\s\//.test(t) || /hälften/.test(t)) { const k = medNamn(/division/); if (k !== null) return k; }
  if (/multiplic|⋅|·|×/.test(t)) { const k = medNamn(/multiplikation/); if (k !== null) return k; }
  if (/[+−]|\s-\s|addera|subtrahera/.test(t)) { const k = medNamn(/addition|subtraktion/); if (k !== null) return k; }
  // 4. Bokens begrepp
  const textOrd = new Set(ord(t));
  let bast: { kod: string; poang: number } | null = null;
  for (const d of iIntervall.length > 0 ? iIntervall : iKap) {
    const termer = d.begrepp.flatMap((b) => ord(b)).filter((w) => !/^(bråk|tal|räkna|med|och|metod)$/.test(w));
    const poang = termer.filter((w) => [...textOrd].some((x) => x.startsWith(w.slice(0, Math.max(5, w.length - 3))))).length;
    if (poang > 0 && (bast === null || poang > bast.poang)) bast = { kod: d.kod, poang };
  }
  return bast?.kod ?? null;
}

// ── PDF → test ───────────────────────────────────────────────────────────────

/**
 * Tolkar ett Magma-tests PDF (alla sidors items) till uppgifter. Uppgiftsnumret
 * står i vänstermarginalen (x ≈ 21, liten text) och uppgifterna numreras 1, 2, 3 …;
 * uppgiftens innehåll är allt mellan dess nummer och nästa nummer på sidan.
 */
export function tolkaMagmaPdf(items: MagmaPdfItem[], filnamn: string, delkapitel: MagmaDelkapitelInfo[] = []): MagmaTestDef {
  const huvud = items.find((i) => i.sida === 1 && i.y > 790 && i.x < 200 && !/hej, jag heter/i.test(i.text))?.text.trim();
  const titel = huvud !== undefined && huvud !== '' ? huvud : filnamn.replace(/\.pdf$/i, '').replace(/_/g, ' ').trim();
  // Uppgiftsnummer: kort heltal i vänstermarginalen, mindre text än formlerna, i följd 1, 2, 3 …
  const kandidater = items
    .filter((i) => /^\d{1,3}$/.test(i.text.trim()) && i.x >= 19 && i.x <= 26 && i.h <= 12 && i.y > 30 && i.y < 790)
    .sort((a, b) => a.sida - b.sida || b.y - a.y);
  const nummer: MagmaPdfItem[] = [];
  for (const k of kandidater) if (Number(k.text) === nummer.length + 1) nummer.push(k);
  if (nummer.length === 0) throw new Error('Hittar inga uppgiftsnummer i PDF:en — är det en utskrift av ett Magma-test?');
  const uppgifter: MagmaUppgiftDef[] = nummer.map((n, j) => {
    const nasta = nummer[j + 1];
    const egna = items.filter((i) => i !== n && i.sida === n.sida && i.y <= n.y + 2 && (nasta === undefined || nasta.sida !== n.sida || i.y > nasta.y + 2) && !brus(i, titel));
    const flerval = egna.some((i) => /^välj (en|i ordning)/i.test(i.text.trim()));
    const innehall = egna.filter((i) => !/^välj (en|i ordning)/i.test(i.text.trim()));
    const text = lasbarText(innehall);
    return {
      nr: n.text.trim(), nyckel: innehallsNyckel(innehall), text, flerval, sida: n.sida,
      formagor: klassaFormaga(text, flerval), delkapitel: klassaDelkapitel(text, delkapitel, titel),
    };
  });
  return { titel, filnamn, testNyckel: kortHash(uppgifter.map((u) => u.nyckel).join(',')), uppgifter };
}

// ── Lagring ──────────────────────────────────────────────────────────────────

interface MedMagma { magmaTester?: MagmaTestDef[]; magmaKlassning?: Record<string, MagmaKlass>; }

/** Sparar testet (samma titel ersätts). */
export function sparaMagmaTest<S extends MedMagma>(s: S, def: MagmaTestDef): S {
  const kvar = (s.magmaTester ?? []).filter((t) => normTitel(t.titel) !== normTitel(def.titel));
  return { ...s, magmaTester: [...kvar, def] };
}

export function taBortMagmaTest<S extends MedMagma>(s: S, titel: string): S {
  return { ...s, magmaTester: (s.magmaTester ?? []).filter((t) => normTitel(t.titel) !== normTitel(titel)) };
}

/** Lärarens klassning av en uppgift — gäller i alla test där uppgiften finns. null tar bort ändringen. */
export function sattMagmaKlassning<S extends MedMagma>(s: S, nyckel: string, klass: MagmaKlass | null): S {
  const ut = { ...(s.magmaKlassning ?? {}) };
  if (klass === null) delete ut[nyckel]; else ut[nyckel] = klass;
  return { ...s, magmaKlassning: ut };
}

/**
 * Uppgiftens gällande klassning: lärarens om den finns, annars den automatiska.
 * Samma uppgift i flera test klassas lika överallt — det test med smalast
 * avsnittsintervall i titeln avgör ('8b 1.4 - 1.5' före 'Diagnos Kap 1').
 */
export function magmaKlassFor(s: MedMagma, u: MagmaUppgiftDef): MagmaKlass & { andrad: boolean } {
  const k = s.magmaKlassning?.[u.nyckel];
  if (k !== undefined) return { ...k, andrad: true };
  const bredd = (titel: string) => { const iv = magmaAvsnittIntervall(titel); return iv === null ? 1000 : iv.till - iv.fran; };
  const kandidater = (s.magmaTester ?? []).flatMap((t) => t.uppgifter.filter((x) => x.nyckel === u.nyckel).map((x) => ({ x, b: bredd(t.titel) })));
  const bast = kandidater.filter((c) => c.x.delkapitel !== null).sort((a, b) => a.b - b.b)[0]?.x ?? u;
  return { delkapitel: bast.delkapitel, formagor: bast.formagor, andrad: false };
}

/** Testdefinitionen för ett importerat prov: provnamnet (ur xlsx-filens namn) mot PDF:ens titel eller filnamn. */
export function magmaTestForProv(s: MedMagma, prov: string): MagmaTestDef | null {
  const p = normTitel(prov);
  return (s.magmaTester ?? []).find((t) => normTitel(t.titel) === p || normTitel(t.filnamn) === p) ?? null;
}

/** Andra test med exakt samma uppgifter (samma test, annat namn eller annan kopia). */
export function sammaTestSom(s: MedMagma, def: MagmaTestDef): MagmaTestDef[] {
  return (s.magmaTester ?? []).filter((t) => t !== def && normTitel(t.titel) !== normTitel(def.titel) && t.testNyckel === def.testNyckel);
}

/** Uppgifter i testet som också finns i andra test: nr → [{titel, nr}]. */
export function deladeUppgifter(s: MedMagma, def: MagmaTestDef): Map<string, Array<{ titel: string; nr: string }>> {
  const ut = new Map<string, Array<{ titel: string; nr: string }>>();
  for (const u of def.uppgifter) {
    const andra = (s.magmaTester ?? []).filter((t) => t !== def && t.testNyckel !== def.testNyckel)
      .flatMap((t) => t.uppgifter.filter((x) => x.nyckel === u.nyckel).map((x) => ({ titel: t.titel, nr: x.nr })));
    if (andra.length > 0) ut.set(u.nr, andra);
  }
  return ut;
}

// ── Analys: per uppgift, delkapitel och förmåga ──────────────────────────────

interface MinRes { elevId: string; amneId?: string; kalla: string; prov: string; datum: string; svar?: FragaSvar[]; }
interface MinElev { id: string; klassId: string; namn: string; }

export interface Andel { ratt: number; totalt: number; andel: number | null; }
const andel = (ratt: number, totalt: number): Andel => ({ ratt, totalt, andel: totalt > 0 ? Math.round((ratt / totalt) * 100) : null });

export interface MagmaUppgiftUtfallX extends Andel {
  nyckel: string; text: string; delkapitel: string | null; formagor: MagmaFormaga[];
  /** Var uppgiften förekommer: test och nummer. */
  forekomster: Array<{ titel: string; nr: string }>;
}

export interface MagmaElevDelkapitel {
  elevId: string; namn: string;
  delkapitel: Record<string, Andel>;
  formagor: Record<MagmaFormaga, Andel>;
  /** Delkapitel under 70 % rätt (minst två uppgifter) — sämst först. */
  behoverForbattra: string[];
}

export interface MagmaDelkapitelAnalys {
  /** Delkapitel i ordning med klassens andel rätt. */
  delkapitel: Array<{ kod: string } & Andel>;
  formagor: Array<{ formaga: MagmaFormaga } & Andel>;
  /** Varje uppgift (över alla test) — samma uppgift i flera test räknas ihop. */
  uppgifter: MagmaUppgiftUtfallX[];
  elever: MagmaElevDelkapitel[];
  /** Test som har identiska uppgifter (räknas som samma test). */
  sammaTest: string[][];
  /** Prov med resultat men utan uppgifts-PDF — kan inte delas upp på delkapitel. */
  utanPdf: string[];
}

const FORMAGOR: MagmaFormaga[] = ['B', 'M', 'P', 'R'];
const tomFormagor = (): Record<MagmaFormaga, { ratt: number; totalt: number }> => ({ B: { ratt: 0, totalt: 0 }, M: { ratt: 0, totalt: 0 }, P: { ratt: 0, totalt: 0 }, R: { ratt: 0, totalt: 0 } });
const kodOrdning = (a: string, b: string) => { const [a1, a2] = a.split('.').map(Number); const [b1, b2] = b.split('.').map(Number); return a1 - b1 || a2 - b2; };

/**
 * Klassens Magma-resultat uppdelade på uppgift, delkapitel och förmåga. Varje
 * elevsvar kopplas via provets PDF till uppgiftens nyckel och klassning. Har en
 * elev gjort samma test två gånger (två kopior) räknas det senaste försöket.
 */
export function magmaDelkapitelAnalys(s: MedMagma & { elever: MinElev[]; resultat?: MinRes[] }, klassId: string, amneId?: string): MagmaDelkapitelAnalys {
  const elever = s.elever.filter((e) => e.klassId === klassId).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const ids = new Set(elever.map((e) => e.id));
  const rs = (s.resultat ?? []).filter((r) => r.kalla === 'magma' && ids.has(r.elevId) && (amneId === undefined || amneId === '' || r.amneId === amneId));
  const utanPdf = new Set<string>();
  // Senaste försöket per (elev, testnyckel)
  const senaste = new Map<string, { r: MinRes; def: MagmaTestDef }>();
  for (const r of rs) {
    const def = magmaTestForProv(s, r.prov);
    if (def === null) { utanPdf.add(r.prov); continue; }
    const k = `${r.elevId}|${def.testNyckel}`;
    const f = senaste.get(k);
    if (f === undefined || r.datum > f.r.datum) senaste.set(k, { r, def });
  }
  const perUppg = new Map<string, MagmaUppgiftUtfallX>();
  const perDk = new Map<string, { ratt: number; totalt: number }>();
  const perF = tomFormagor();
  const perElev = new Map<string, { dk: Map<string, { ratt: number; totalt: number }>; f: Record<MagmaFormaga, { ratt: number; totalt: number }> }>();
  for (const { r, def } of senaste.values()) {
    const e = perElev.get(r.elevId) ?? { dk: new Map(), f: tomFormagor() };
    perElev.set(r.elevId, e);
    for (const sv of r.svar ?? []) {
      const nr = sv.fraga.replace(/^Uppgift\s*/i, '');
      const u = def.uppgifter.find((x) => x.nr === nr);
      if (u === undefined) continue;
      const k = magmaKlassFor(s, u);
      const ratt = sv.ratt === true ? 1 : 0;
      const pu = perUppg.get(u.nyckel) ?? { nyckel: u.nyckel, text: u.text, delkapitel: k.delkapitel, formagor: k.formagor, forekomster: [], ratt: 0, totalt: 0, andel: null };
      pu.ratt += ratt; pu.totalt += 1; perUppg.set(u.nyckel, pu);
      if (k.delkapitel !== null) {
        const d = perDk.get(k.delkapitel) ?? { ratt: 0, totalt: 0 }; d.ratt += ratt; d.totalt += 1; perDk.set(k.delkapitel, d);
        const ed = e.dk.get(k.delkapitel) ?? { ratt: 0, totalt: 0 }; ed.ratt += ratt; ed.totalt += 1; e.dk.set(k.delkapitel, ed);
      }
      for (const f of k.formagor) { perF[f].ratt += ratt; perF[f].totalt += 1; e.f[f].ratt += ratt; e.f[f].totalt += 1; }
    }
  }
  for (const t of s.magmaTester ?? []) for (const u of t.uppgifter) {
    const pu = perUppg.get(u.nyckel);
    if (pu !== undefined && !pu.forekomster.some((f) => f.titel === t.titel && f.nr === u.nr)) pu.forekomster.push({ titel: t.titel, nr: u.nr });
  }
  const uppgifter = [...perUppg.values()].map((u) => ({ ...u, ...andel(u.ratt, u.totalt) }))
    .sort((a, b) => (a.andel ?? 101) - (b.andel ?? 101));
  const koder = [...perDk.keys()].sort(kodOrdning);
  const sammaTest = [...new Map((s.magmaTester ?? []).map((t) => [t.testNyckel, (s.magmaTester ?? []).filter((x) => x.testNyckel === t.testNyckel).map((x) => x.titel)])).values()].filter((g) => g.length > 1);
  return {
    delkapitel: koder.map((kod) => ({ kod, ...andel(perDk.get(kod)!.ratt, perDk.get(kod)!.totalt) })),
    formagor: FORMAGOR.filter((f) => perF[f].totalt > 0).map((f) => ({ formaga: f, ...andel(perF[f].ratt, perF[f].totalt) })),
    uppgifter,
    elever: elever.filter((e) => perElev.has(e.id)).map((e) => {
      const p = perElev.get(e.id)!;
      const dk: Record<string, Andel> = {};
      for (const [kod, v] of [...p.dk.entries()].sort((a, b) => kodOrdning(a[0], b[0]))) dk[kod] = andel(v.ratt, v.totalt);
      const f = Object.fromEntries(FORMAGOR.map((x) => [x, andel(p.f[x].ratt, p.f[x].totalt)])) as Record<MagmaFormaga, Andel>;
      const behov = Object.entries(dk).filter(([, a]) => a.andel !== null && a.andel < 70 && a.totalt >= 2).sort((a, b) => (a[1].andel ?? 0) - (b[1].andel ?? 0)).map(([kod]) => kod);
      return { elevId: e.id, namn: e.namn, delkapitel: dk, formagor: f, behoverForbattra: behov };
    }),
    sammaTest, utanPdf: [...utanPdf].sort(),
  };
}
