/**
 * Del 229/231 · Binogi-förslag per delkapitel.
 *
 * Binogi har inget öppet API, så appen matchar varje delkapitel (rubrik, begrepp, begreppsförklaringar,
 * genomgångstext) mot Binogis egen lektionskatalog (binogikatalog.data.ts — hämtad ur app.binogi.se,
 * alla adresser kontrollerade) och visar förslag med poäng och träffar. Varje lektion bär sin egen
 * begreppslista och ord ur titel/avsnitt/kapitel. Läraren öppnar, bekräftar och lägger på lektionen;
 * egna katalogposter kan läggas till. Binogis sökning kan dessutom nås utan inloggning:
 * https://app.binogi.se/search/<sökord>.
 */
import type { Bok, Delkapitel, Kapitel, Struktur } from './typer.js';
import { BINOGI_LEKTIONER } from './binogikatalog.data.js';
import { amnesPlanFor, hamtaLektionsplan, sattLektionsplan } from './struktur.js';
import { delkapitelKod } from './bok.js';
import { delat } from './minne.js';

export interface BinogiPost {
  titel: string;
  /** Lektionens slug i adressen https://app.binogi.se/l/<slug>. */
  slug: string;
  amne: 'Kemi' | 'Fysik' | 'Biologi' | 'Teknik' | 'Matematik';
  /** Binogis kapitel ('Organisk kemi') och avsnitt ('Kolväten') lektionen ligger i. */
  kapitel?: string;
  avsnitt?: string[];
  /** Ord och begrepp lektionen handlar om — det som matchas mot delkapitlet. */
  nyckelord: string[];
  /** Lektionens egen begreppslista i Binogi (väger tyngst i matchningen). */
  begrepp?: string[];
  /** Adressen är kontrollerad i Binogi. */
  verifierad: boolean;
}

export interface BinogiForslag {
  post: BinogiPost;
  url: string;
  /** Poäng: hur väl lektionen passar delkapitlet (högre = bättre). */
  poang: number;
  /** Vad som matchade (begrepp/ord i delkapitlet). */
  traffar: string[];
  /** Filmen finns redan bland delkapitlets filmer i boken. */
  redanIBoken: boolean;
}

export interface DelkapitelForslag {
  kod: string;
  namn: string;
  forslag: BinogiForslag[];
  /** Söksträng att använda i Binogi när inget passar. */
  sokord: string[];
}

export const BINOGI_BAS = 'https://app.binogi.se/l/';

/** Binogis adressmönster ur en titel: 'Kolets kretslopp' → 'kolets-kretslopp', 'Förbränning' → 'foerbraenning'. */
export function binogiSlug(titel: string): string {
  return titel.toLowerCase()
    .replace(/å/g, 'aa').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function binogiUrl(post: BinogiPost): string { return `${BINOGI_BAS}${post.slug}`; }

/** Sökadress utanför Binogi (Binogi saknar öppen sökning): Google begränsat till app.binogi.se. */
export function binogiSokUrl(ord: string[]): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:app.binogi.se ${ord.join(' ')}`)}`;
}

/** Sökadress i Binogi (fungerar utan inloggning): https://app.binogi.se/search/<ord>. */
export function binogiSokIAppen(ord: string[]): string { return `https://app.binogi.se/search/${encodeURIComponent(ord.join(' '))}`; }

/** Delningslänk som elever kan öppna utan att logga in. */
export function binogiDelningslank(post: BinogiPost): string { return `${BINOGI_BAS}${post.slug}?share`; }

/** Hela katalogen: Binogis egna lektioner (kontrollerade adresser). */
export const BINOGI_KATALOG: readonly BinogiPost[] = BINOGI_LEKTIONER;

/** Ord som finns i nästan alla NO-texter och inte skiljer lektioner åt. */
const GENERISKA = new Set(['och', 'kemi', 'fysik', 'biologi', 'teknik', 'organisk', 'oorganisk', 'atom', 'atomer', 'atomen', 'molekyl', 'molekyler', 'ämne', 'ämnen', 'ämnet', 'förening', 'föreningar', 'energi', 'vatten', 'material', 'egenskaper', 'handlar', 'blir', 'sitta', 'ihop', 'vad', 'hur', 'olika', 'introduktion', 'exempel', 'mer', 'några', 'viktiga', 'har', 'är', 'finns', 'inte', 'bara', 'din', 'kan', 'det', 'den', 'ett', 'till', 'från', 'med', 'för', 'som', 'ger', 'många', 'former', 'behöver']);

/** Normaliserar text för jämförelse: gemener, utan skiljetecken. */
function norm(t: string): string { return t.toLowerCase().replace(/[^a-zåäö0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim(); }

/** Ordstam för enkel böjningsmatchning: 'alkanerna' ~ 'alkan' (första 5 tecknen när ordet är längre). */
function stam(ord: string): string { const o = norm(ord); return o.length > 7 ? o.slice(0, 6) : o; }

/** Delkapitlets text att matcha mot: rubrik, begrepp, förklaringar och lektionernas texter. */
function delkapitelText(kap: Kapitel, d: Delkapitel): { text: string; begrepp: string[] } {
  const begrepp = [...new Set([...d.begrepp, ...d.lektioner.flatMap((l) => (l.begrepp ?? '').split(',').map((b) => b.trim()))])].filter((b) => b !== '' && b !== '—');
  const forklaringar = Object.entries(kap.resurser.forklaringar ?? {}).filter(([b]) => begrepp.some((x) => norm(x) === norm(b))).map(([, f]) => f);
  const text = norm([d.namn, ...begrepp, ...forklaringar, ...d.lektioner.map((l) => `${l.avsnitt} ${l.genomgang ?? ''} ${l.sammanfattning ?? ''}`)].join(' '));
  return { text, begrepp };
}

// Del 241 · Det som bara beror på katalogposten (normaliserade ord och ordstammar) räknas en gång per post, och
// det som bara beror på delkapitlet en gång per delkapitel — förut normaliserades samma ord om för varje
// kombination av post och delkapitel (642 lektioner × alla delkapitel, vid varje omritning av Planering).
interface PostForberedd {
  /** Titelns ord (minst tre tecken, inte generiska) med ordstam. */
  titelOrd: Array<{ o: string; st: string }>;
  /** Postens egna begrepp, normaliserade. */
  egna: ReadonlySet<string>;
  /** Begrepp + nyckelord i ordning: originalordet, normaliserat, ordstam och om ordet är generiskt. */
  ord: Array<{ ord: string; n: string; st: string; generisk: boolean }>;
}
const forberedda = new WeakMap<BinogiPost, PostForberedd>();
function forbered(post: BinogiPost): PostForberedd {
  const c = forberedda.get(post);
  if (c !== undefined) return c;
  const ut: PostForberedd = {
    titelOrd: norm(post.titel).split(' ').filter((x) => x.length >= 3 && !GENERISKA.has(x)).map((o) => ({ o, st: stam(o) })),
    egna: new Set((post.begrepp ?? []).map(norm)),
    ord: [...(post.begrepp ?? []), ...post.nyckelord].map((ord) => { const n = norm(ord); return { ord, n, st: stam(n), generisk: GENERISKA.has(n) }; }),
  };
  forberedda.set(post, ut);
  return ut;
}

interface DelkapitelForberett { text: string; begreppN: ReadonlySet<string>; begreppStam: ReadonlySet<string>; rubrikStam: ReadonlySet<string> }
function forberedDelkapitel(text: string, begrepp: string[], rubrik: string): DelkapitelForberett {
  const begreppN = begrepp.map(norm);
  return { text, begreppN: new Set(begreppN), begreppStam: new Set(begreppN.map(stam)), rubrikStam: new Set(norm(rubrik).split(' ').map(stam)) };
}

/** Poängsätter en katalogpost mot ett delkapitel. */
function poangsatt(post: BinogiPost, d: DelkapitelForberett): { poang: number; traffar: string[] } {
  const p = forbered(post);
  const traffar: string[] = [];
  const raknade = new Set<string>();
  let poang = 0;
  // Titelns ord i delkapitlets rubrik väger tyngst (4): 'Förbränning' ↔ '10.4 Förbränning påverkar miljön', 'Eld' ↔ '10.5 Eld behöver …'
  for (const { o, st } of p.titelOrd) {
    if (d.rubrikStam.has(st)) { poang += 4; traffar.push(`${o} (rubriken)`); raknade.add(st); }
  }
  for (const { ord, n, st, generisk } of p.ord) {
    if (raknade.has(st) || generisk) continue;
    raknade.add(st);
    const vikt = p.egna.has(n) ? 1 : 0;                                                     // Binogis egen begreppslista väger extra
    if (d.begreppN.has(n)) { poang += 3 + vikt; traffar.push(ord); continue; }             // exakt ett av delkapitlets begrepp
    if (n.length >= 4 && d.begreppStam.has(st)) { poang += 2 + vikt; traffar.push(ord); continue; }
    if (n.length >= 4 && d.text.includes(n)) { poang += 1; traffar.push(ord); }            // nämns i texten
  }
  return { poang, traffar };
}

/**
 * Förslag per delkapitel i ett kapitel. `extra` = lärarens egna katalogposter. Poster från andra
 * ämnen än bokens tas bara med när de passar mycket bra (poäng ≥ 5). Max `max` förslag per delkapitel.
 */
export function foreslaBinogiFilmer(bok: Bok, kapitelNr: number, extra: readonly BinogiPost[] = [], max = 4): DelkapitelForslag[] {
  // Del 241: utan egna poster beror förslagen bara på boken — de sparas på bokobjektet (ett kapitel frågas
  // annars en gång per delkapitel av den pedagogiska planeringen). Resultatet delas — ändra inte i det.
  if (extra.length > 0) return raknaBinogiForslag(bok, kapitelNr, extra, max);
  let perBok = forslagCache.get(bok);
  if (perBok === undefined) { perBok = new Map(); forslagCache.set(bok, perBok); }
  const nyckel = `${kapitelNr}|${max}`;
  const cachad = perBok.get(nyckel);
  if (cachad !== undefined) return cachad;
  const ut = delat(raknaBinogiForslag(bok, kapitelNr, extra, max), 3);
  perBok.set(nyckel, ut);
  return ut;
}
const forslagCache = new WeakMap<Bok, Map<string, DelkapitelForslag[]>>();

function raknaBinogiForslag(bok: Bok, kapitelNr: number, extra: readonly BinogiPost[], max: number): DelkapitelForslag[] {
  const kap = bok.kapitel.find((k) => k.nr === kapitelNr);
  if (kap === undefined) return [];
  const katalog = [...extra, ...BINOGI_KATALOG];
  const bokAmne = (bok.amne ?? '').toLowerCase();
  return kap.delkapitel.map((d) => {
    const { text, begrepp } = delkapitelText(kap, d);
    const forberett = forberedDelkapitel(text, begrepp, d.namn);
    const egnaUrl = new Set(kap.resurser.filmer.filter((f) => f.titel.startsWith(`${d.kod} `) || f.titel.startsWith(`${d.kod}·`) || f.titel.startsWith(`${d.kod} ·`)).map((f) => f.url));
    const forslag = katalog.map((post) => {
      const { poang, traffar } = poangsatt(post, forberett);
      const sammaAmne = post.amne.toLowerCase() === bokAmne;
      return { post, url: binogiUrl(post), poang: sammaAmne ? poang : poang - 2, traffar, redanIBoken: egnaUrl.has(binogiUrl(post)) };
    }).filter((f) => f.poang >= 3 && (f.traffar.length >= 2 || f.traffar.some((x) => x.endsWith('(rubriken)'))))
      .sort((a, b) => b.poang - a.poang || b.traffar.filter((x) => x.endsWith('(rubriken)')).length - a.traffar.filter((x) => x.endsWith('(rubriken)')).length || a.post.titel.localeCompare(b.post.titel, 'sv'))
      .slice(0, max);
    return { kod: d.kod, namn: d.namn, forslag, sokord: begrepp.slice(0, 3) };
  });
}

export interface BinogiPaPlan {
  s: Struktur;
  /** Filmer som lades på lektioner: delkapitel, titel, lektionens index. */
  tillagda: Array<{ kod: string; titel: string; lektionsIndex: number }>;
  /** Delkapitel utan tillräckligt bra förslag. */
  utanForslag: string[];
}

/**
 * Del 231 · Lägger Binogis bästa film på varje delkapitel i planeringen — på delkapitlets första
 * lektion (daterad från `fran`, annars hela planen), bara där lektionen inte redan har en film och förslaget
 * når `minPoang`. Körs när en planering skapas (valbart i rutan) och från 🎬 Filmer / Pedagogisk planering.
 */
export function laggBinogiFilmerPaPlan(s: Struktur, amneId: string, val: { minPoang?: number; fran?: string; kapitel?: number[]; extra?: readonly BinogiPost[] } = {}): BinogiPaPlan {
  const amne = s.amnen.find((a) => a.id === amneId);
  const bok = s.bocker.find((b) => b.id === amne?.bokId);
  const plan = amnesPlanFor(s, amneId, undefined, false);
  if (amne === undefined || bok === undefined || plan === null) return { s, tillagda: [], utanForslag: [] };
  const minPoang = val.minPoang ?? 6;
  let ut = s;
  const tillagda: BinogiPaPlan['tillagda'] = [];
  const utanForslag: string[] = [];
  const gjorda = new Set<string>();
  plan.a.forEach((r, i) => {
    if (val.fran !== undefined && r.datum !== null && r.datum < val.fran) return;   // genomförda lektioner lämnas; odaterade räknas som kommande
    if (val.kapitel !== undefined && !val.kapitel.includes(r.kapitel)) return;
    const kod = delkapitelKod(r.lektion.avsnitt);
    if (kod === null || gjorda.has(kod)) return;
    gjorda.add(kod);
    const forslag = foreslaBinogiFilmer(bok, r.kapitel, val.extra ?? []).find((d) => d.kod === kod)?.forslag ?? [];
    const basta = forslag.find((f) => f.poang >= minPoang && f.post.verifierad);
    if (basta === undefined) { utanForslag.push(kod); return; }
    const bef = hamtaLektionsplan(ut, amneId, i);
    const filmer = bef?.filmer ?? [];
    if (filmer.some((f) => f.split('|').pop() === basta.url) || basta.redanIBoken) return;
    ut = sattLektionsplan(ut, { ...(bef ?? { id: `lp-${amneId}-${i}`, amneId, lektionsIndex: i }), filmer: [...filmer, `${basta.post.titel}|${basta.url}`] });
    tillagda.push({ kod, titel: basta.post.titel, lektionsIndex: i });
  });
  return { s: ut, tillagda, utanForslag };
}
