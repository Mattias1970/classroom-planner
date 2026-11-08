/**
 * Del 134 · Pedagogisk planering och provlapp — underlaget för Word-dokumentet
 * till elever och vårdnadshavare (samma layout som Planering_Ekologi.docx):
 * syfte, viktiga begrepp, innehåll per delkapitel, Binogi-filmer, prov och
 * bedömning, samt veckoplaneringen dag för dag med läxförhör, genomgång,
 * arbete, exit ticket, begrepp, läxa och filmer.
 *
 * Allt hämtas ur planeringen (amnesPlanFor) och boken — ändras planeringen
 * ändras dokumentet. (Ring 1, I2: ingen DOM, ingen docx-generering här.)
 */
import { delkapitelKod } from './bok.js';
import { begreppForLektion } from './lektionskort.js';
import { NO_TK_AMNEN, socrativeRum } from './amnen.js';
import { binogiFilmerFor } from './binogifilmer.js';
import { foreslaBinogiFilmer } from './binogikatalog.js';
import { amnesPlanFor, hamtaLektionsplan, lektionsNamn } from './struktur.js';
import { isoVecka } from './skolar.js';
import type { Bok, PlaneradLektion, Struktur } from './typer.js';
import { planensKapitelOrdning, type KapitelOrdning } from './kapitelordning.js';

export interface PlanFilm { titel: string; url: string }

export interface PlanDag {
  datum: string;
  /** 'Måndag' … 'Fredag'. */
  dag: string;
  vecka: number;
  /** Lektionens nummer i planeringen (1-baserat). */
  nr: number;
  typ: 'lektion' | 'laboration' | 'prov' | 'repetition' | 'annat';
  /** Halvklass: 'A' | 'B'; helklass undefined. */
  grupp?: 'A' | 'B';
  /** '6.2' när lektionen hör till ett delkapitel. */
  kod: string | null;
  avsnitt: string;
  sidor: string | null;
  /** Läxförhör som inleder lektionen: vilka begrepp och i vilket rum. */
  laxforhor: { begrepp: string; rum: string; ovaRum: string | null } | null;
  genomgang: string | null;
  /** 'lektionsplan' = lärarens egen text för lektionen, 'bok' = bokens centrala innehåll. */
  genomgangKalla: 'lektionsplan' | 'bok' | null;
  arbete: string | null;
  exit: { rum: string; begrepp: string } | null;
  begrepp: string[];
  /** Läxa till nästa lektion: text + rummet att öva i. */
  laxa: { till: string; text: string; ovaRum: string | null } | null;
  filmer: PlanFilm[];
  /** Del 226 · Provdagen: hur provet är upplagt — lärarens egen text (lektionsplanens genomgång), annars NO-standarden. */
  provText: string[];
}

/** Del 226 · Standardupplägg för NO-prov när läraren inte skrivit eget på provlektionen. */
export const PROV_UPPLAGG_NO: readonly string[] = [
  'Lektion 1 (NO-lektion): E-prov (begrepp och modeller), ECA Undersökningsprov',
  'Lektion 2 (Ma-lektion): CA-prov (begrepp och modeller)',
];

export interface PlanVecka { vecka: number; dagar: PlanDag[] }

export interface PedagogiskPlanering {
  amne: string;
  klass: string;
  /** Första (eller enda) kapitlet. */
  kapitel: { nr: number; namn: string; sidor: string };
  /** Del 217 · Alla kapitel i omfånget, med varje kapitels eget syfte ("Här får du lära dig"). */
  kapitelLista: Array<{ nr: number; namn: string; sidor: string; syfte: string[]; syfteSidor: string | null; /** Del 218 · bokens "Några viktiga begrepp" på öppningsuppslaget. */ viktigaBegrepp: string[]; /** Del 226 · kapitlets eget omfång ('6.1–6.5'); null = hela kapitlet. */ omfang: string | null }>;
  /** Del 217 · Omfånget som text ('6.1–6.5 · 7.1–7.3'); null = hela kapitlet. */
  omfang: string | null;
  /** Syftet: kapitlets "Här får du lära dig" (öppningsuppslaget). Saknas det i boken används delkapitlens mål. */
  syfte: string[];
  /** Sidan där "Här får du lära dig" står, t.ex. 's. 229'. */
  syfteSidor: string | null;
  /** true när syftet är delkapitlens mål — kapitlets egna saknas i bokfilen. */
  syfteFranDelkapitel: boolean;
  /** Viktiga begrepp i bokordning (alla valda delkapitel, platt). */
  begrepp: string[];
  /** Del 220 · Begreppen per delkapitel, i bokordning. */
  begreppPerDelkapitel: Array<{ kod: string; namn: string; begrepp: string[] }>;
  /** Innehåll per delkapitel: kod, namn, sidor och text — Del 220: bokens sammanfattning av delkapitlet, annars lektionsplanens, annars bokens mål/genomgång. */
  innehall: Array<{ kod: string; namn: string; sidor: string; text: string; /** 'bok' när texten är bokens sammanfattning. */ kalla: 'bok' | 'lektionsplan' | 'mal' }>;
  /**
   * Del 220 · Socrative-rummen i omfånget: varje rum med vad det övar (delkapitel) och när det
   * används. Exit ticket-rummen (Biologi61) övar ett delkapitel; läxförhörsrummen (Biologi612) är
   * kumulativa. Klassens eget rum (klassRum) står inte här — det används bara live på lektionen.
   */
  socrativeRum: Array<{ rum: string; delkapitel: string; anvands: 'exit ticket' | 'läxförhör' | 'exit ticket och läxförhör' }>;
  /** Filmer per delkapitel. */
  filmer: Array<{ kod: string; namn: string; filmer: PlanFilm[] }>;
  /** Kumulativa övningsrum i ordning: Biologi61, Biologi612 … */
  ovaRum: string[];
  /** Del 222 · Rummet som övar alla valda delkapitel i varje kapitel: Biologi612345 (6.1–6.5), Biologi7123 (7.1–7.3). */
  ovaRumAlla: string[];
  /** Klassrummet där läxförhör och exit tickets körs. */
  klassRum: string;
  prov: { datum: string | null; rubrik: string } | null;
  sammanfattningSidor: string | null;
  veckor: PlanVecka[];
  /**
   * Del 224 · Laborationerna i planeringen (omfånget), i datumordning: nyckel (radens stabila
   * nyckel), namn, frågeställningen (lektionsplanens labFraga, annars laborationens syfte) och
   * om den är genomförd — lärarens val (genomforda) eller, utan val, datum före idag.
   */
  laborationer: PlanLaboration[];
}

/** Del 224 · En laboration i planeringen. */
export interface PlanLaboration {
  nyckel: string;
  /** Radens index i planeringen — för att spara namn och frågeställning i lektionsplanen. */
  lektionsIndex: number;
  namn: string;
  fraga: string | null;
  datum: string | null;
  genomford: boolean;
}

const DAGAR = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
function veckodag(datum: string): string { return DAGAR[new Date(`${datum}T00:00:00Z`).getUTCDay()] ?? ''; }
function har(v: string | undefined): v is string { return v !== undefined && v.trim() !== '' && v.trim() !== '—'; }

/** 'Biologi612 (läxförhör)' → 'Biologi612'. */
function rumUr(text: string): string | null {
  const m = /^([A-Za-zÅÄÖåäö]+\d+)/.exec(text.trim());
  return m === null ? null : m[1];
}

/** Rummet var som helst i en text: 'Alla begrepp t.o.m. 6.2 – Biologi612 ≥ 90 %' → 'Biologi612'. */
function rumITexten(text: string): string | null {
  const m = /[A-Za-zÅÄÖåäö]{3,}\d{2,}/.exec(text);
  return m === null ? null : m[0];
}

/** Delkapitlen ett rum täcker: Biologi612 → '6.1–6.2', Biologi61 → '6.1'. */
function rumTillKoder(rum: string): string | null {
  const m = /^[^\d]+(\d)(\d+)$/.exec(rum);
  if (m === null) return null;
  const delar = m[2].split('');
  return delar.length === 1 ? `${m[1]}.${delar[0]}` : `${m[1]}.${delar[0]}–${m[1]}.${delar[delar.length - 1]}`;
}

/** Del 226 · '6.1–6.5' för sammanhängande koder, annars '6.1, 6.3' / '6.1–6.3, 6.5'. */
function omfangText(koder: string[]): string {
  const nr = koder.map((k) => Number(k.split('.')[1])).sort((a, b) => a - b);
  const kap = koder[0]?.split('.')[0] ?? '';
  const delar: string[] = [];
  for (let i = 0; i < nr.length;) {
    let j = i; while (j + 1 < nr.length && nr[j + 1] === nr[j] + 1) j++;
    delar.push(j > i ? `${kap}.${nr[i]}–${kap}.${nr[j]}` : `${kap}.${nr[i]}`);
    i = j + 1;
  }
  return delar.join(', ');
}

function typFor(r: PlaneradLektion): PlanDag['typ'] {
  if (r.lektion.typ === 'laboration') return 'laboration';
  if (r.lektion.typ === 'exam' || /\bprov\b/i.test(r.lektion.avsnitt)) return 'prov';
  if (r.lektion.typ === 'repetition' || r.lektion.typ === 'review' || r.lektion.typ === 'test') return 'repetition';
  return r.lektion.typ === 'regular' ? 'lektion' : 'annat';
}

/** Filmer för ett delkapitel: bokens (prefix '6.1 …' / '6.1 · …') + lektionsplanernas. */
function filmerFor(bok: Bok, kapitelNr: number, kod: string | null, lpFilmer: string[]): PlanFilm[] {
  const kap = bok.kapitel.find((k) => k.nr === kapitelNr);
  const ut: PlanFilm[] = [];
  const sedda = new Set<string>();
  const lagg = (titel: string, url: string) => { if (url.startsWith('http') && !sedda.has(url)) { sedda.add(url); ut.push({ titel, url }); } };
  if (kod !== null) {
    for (const f of kap?.resurser.filmer ?? []) {
      if (!f.titel.startsWith(`${kod} `)) continue;
      const titel = f.titel.replace(/^\S+\s*(·\s*)?/, '').replace(/\s*—\s*genomgång$/, '').trim();
      lagg(titel === '' ? f.titel : titel, f.url);
    }
  }
  for (const f of lpFilmer) {
    const [titel, ...rest] = f.split('|'); const url = rest.join('|').trim();
    if (url === '') lagg(titel.trim(), titel.trim()); else lagg(titel.trim(), url);
  }
  // Del 226 · inbyggd Binogi-lista när varken bokfilen eller lektionsplanen har filmer för delkapitlet
  if (ut.length === 0) for (const f of binogiFilmerFor(bok, kod)) lagg(f.titel, f.url);
  // Del 233 · annars Binogis katalog (kontrollerade adresser): de bästa träffarna på delkapitlets begrepp och rubrik
  if (ut.length === 0 && kod !== null) {
    const d = foreslaBinogiFilmer(bok, kapitelNr, [], 2).find((x) => x.kod === kod);
    for (const f of d?.forslag ?? []) if (f.poang >= 6) lagg(f.post.titel, f.url);
  }
  return ut;
}

/**
 * Bygger underlaget för ett kapitel. `kapitelNr` undefined = det kapitel som pågår
 * (första lektionen på eller efter `idag`, annars den sista). null när ämnet saknar
 * bok eller planering.
 */
export function pedagogiskPlanering(s: Struktur, amneId: string, kapitelNr?: number, idag?: string, genomforda?: ReadonlySet<string> | null): PedagogiskPlanering | null {
  const pl = pedagogiskPlaneringKapitel(s, amneId, kapitelNr, idag, null, genomforda ?? null);
  return pl;
}

/**
 * Del 217 · Pedagogisk planering för ett omfång av delkapitel över ett eller flera kapitel
 * ('6.1-6.5, 7.1-7.3'). Varje kapitel byggs för sig (bara de valda delkapitlen; laborationer,
 * repetition och prov som ligger mellan första valda lektion och kapitlets prov tas med) och
 * slås ihop: syfte per kapitel, begrepp, innehåll och filmer för de valda delkapitlen, och
 * veckoplaneringen i datumordning. null när inget delkapitel i omfånget finns.
 */
export function pedagogiskPlaneringForOmfang(s: Struktur, amneId: string, spann: Array<{ fran: string; till: string }>, idag?: string, genomforda?: ReadonlySet<string> | null, ordning?: KapitelOrdning): PedagogiskPlanering | null {
  const kodDelar = (kod: string): [number, number] | null => { const m = /^(\d+)\.(\d+)$/.exec(kod.trim()); return m === null ? null : [Number(m[1]), Number(m[2])]; };
  const perKapitel = new Map<number, Array<[number, number]>>();
  for (const sp of spann) {
    const a = kodDelar(sp.fran); const b = kodDelar(sp.till);
    if (a === null || b === null || a[0] !== b[0]) continue;
    perKapitel.set(a[0], [...(perKapitel.get(a[0]) ?? []), [a[1], b[1]]]);
  }
  // Del 227 · Kapitlen i lärarens ordning (annars planens: kap 10 före kap 7 om planen läser så); onämnda kapitel sist i nummerordning
  const o = ordning ?? planensKapitelOrdning(s, amneId, idag);
  const kapFoljd = [...o.kapitel.filter((nr) => perKapitel.has(nr)), ...[...perKapitel.keys()].filter((nr) => !o.kapitel.includes(nr)).sort((x, y) => x - y)];
  const delar: PedagogiskPlanering[] = [];
  for (const nr of kapFoljd) {
    const intervall = perKapitel.get(nr)!;
    const inom = (kod: string | null): boolean => { const k = kod === null ? null : kodDelar(kod); return k !== null && k[0] === nr && intervall.some(([f, t]) => k[1] >= f && k[1] <= t); };
    const pl = pedagogiskPlaneringKapitel(s, amneId, nr, idag, inom, genomforda ?? null);
    if (pl === null || pl.innehall.length === 0) continue;
    delar.push(ordnaDelkapitel(pl, o.delkapitel?.[String(nr)]));
  }
  if (delar.length === 0) return null;
  const forsta = delar[0];
  // Del 234 · omfångets etikett i planeringens ordning ('10.1 · 7.1–7.6'), inte som läraren råkade skriva det
  const omfang = delar.map((pl) => pl.kapitelLista[0].omfang ?? `kap ${pl.kapitel.nr}`).join(' · ');
  const veckor: PlanVecka[] = [];
  for (const d of delar.flatMap((pl) => pl.veckor.flatMap((v) => v.dagar)).sort((a, b) => a.datum.localeCompare(b.datum))) {
    const v = veckor[veckor.length - 1];
    if (v !== undefined && v.vecka === d.vecka) v.dagar.push(d); else veckor.push({ vecka: d.vecka, dagar: [d] });
  }
  const provDelar = delar.map((pl) => pl.prov).filter((x): x is NonNullable<PedagogiskPlanering['prov']> => x !== null);
  // Del 226 · Flera kapitel: läxförhör och läxa inför repetition/prov i sista kapitlet täcker alla valda delkapitel
  if (delar.length > 1) {
    const sista = delar[delar.length - 1];
    const allaKoder = delar.map((pl) => pl.kapitelLista[0].omfang ?? `kap ${pl.kapitel.nr}`).join(', ');
    const allaRum = delar.flatMap((pl) => pl.ovaRumAlla).join(', ');
    const sistaRum = sista.ovaRumAlla[0];
    for (const d of sista.veckor.flatMap((v) => v.dagar)) {
      if (d.typ === 'lektion' || d.typ === 'laboration') continue;
      if (d.laxforhor !== null && sistaRum !== undefined && d.laxforhor.ovaRum === sistaRum) d.laxforhor = { ...d.laxforhor, begrepp: `Begrepp ${allaKoder}`, ovaRum: allaRum };
    }
    for (const d of sista.veckor.flatMap((v) => v.dagar)) {
      if (d.laxa !== null && sistaRum !== undefined && d.laxa.ovaRum === sistaRum && d.laxa.text === `Begrepp ${sista.kapitelLista[0].omfang ?? ''}`) d.laxa = { ...d.laxa, text: `Begrepp ${allaKoder}`, ovaRum: allaRum };
    }
  }
  return {
    amne: forsta.amne, klass: forsta.klass, kapitel: forsta.kapitel,
    kapitelLista: delar.flatMap((pl) => pl.kapitelLista),
    omfang,
    syfte: delar.flatMap((pl) => pl.syfte), syfteSidor: forsta.syfteSidor, syfteFranDelkapitel: delar.some((pl) => pl.syfteFranDelkapitel),
    begrepp: [...new Set(delar.flatMap((pl) => pl.begrepp))],
    begreppPerDelkapitel: delar.flatMap((pl) => pl.begreppPerDelkapitel),
    innehall: delar.flatMap((pl) => pl.innehall), filmer: delar.flatMap((pl) => pl.filmer),
    socrativeRum: delar.flatMap((pl) => pl.socrativeRum).filter((r, i, arr) => arr.findIndex((x) => x.rum === r.rum) === i),
    ovaRum: [...new Set(delar.flatMap((pl) => pl.ovaRum))], ovaRumAlla: delar.flatMap((pl) => pl.ovaRumAlla), klassRum: forsta.klassRum,
    prov: provDelar[provDelar.length - 1] ?? null,
    sammanfattningSidor: delar.map((pl) => pl.sammanfattningSidor).filter((x): x is string => x !== null).join(', ') || null,
    veckor,
    laborationer: delar.flatMap((pl) => pl.laborationer).filter((l, i, arr) => arr.findIndex((x) => x.nyckel === l.nyckel) === i).sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? '')),
  };
}

/** Del 227 · Delkapitlen i ett kapitel i lärarens följd: innehåll, begrepp per delkapitel, filmer och den platta begreppslistan. */
function ordnaDelkapitel(pl: PedagogiskPlanering, foljd: string[] | undefined): PedagogiskPlanering {
  if (foljd === undefined || foljd.length === 0) return pl;
  const rang = (kod: string) => { const i = foljd.indexOf(kod); return i === -1 ? 1e9 : i; };
  const sortera = <T extends { kod: string }>(xs: T[]): T[] => xs.map((x, i) => [x, i] as const).sort((a, b) => rang(a[0].kod) - rang(b[0].kod) || a[1] - b[1]).map(([x]) => x);
  const begreppPerDelkapitel = sortera(pl.begreppPerDelkapitel);
  const begrepp = [...new Set([...begreppPerDelkapitel.flatMap((d) => d.begrepp), ...pl.begrepp])];
  return { ...pl, innehall: sortera(pl.innehall), begreppPerDelkapitel, filmer: sortera(pl.filmer), begrepp };
}

/** Ett kapitel; `inom` begränsar till vissa delkapitel (null = alla). */
function pedagogiskPlaneringKapitel(s: Struktur, amneId: string, kapitelNr: number | undefined, idag: string | undefined, inom: ((kod: string | null) => boolean) | null, genomforda: ReadonlySet<string> | null): PedagogiskPlanering | null {
  const amne = s.amnen.find((a) => a.id === amneId);
  const klass = s.klasser.find((k) => k.id === amne?.klassId);
  const bok = s.bocker.find((b) => b.id === amne?.bokId);
  // Del 227 · även innan planeringen registrerats: dokumentet bygger då på förhandsvisningen (samma plan som ämnessidan visar)
  const ap = amnesPlanFor(s, amneId, idag, false);
  if (amne === undefined || klass === undefined || bok === undefined || ap === null) return null;
  const dagensIdag = idag ?? '';
  const nasta = ap.a.find((r) => r.datum !== null && r.datum >= dagensIdag) ?? ap.a[ap.a.length - 1];
  const nr = kapitelNr ?? nasta?.kapitel ?? bok.kapitel[0]?.nr;
  const kap = bok.kapitel.find((k) => k.nr === nr);
  if (kap === undefined) return null;
  const klassRum = socrativeRum(amne.namn, klass.namn);

  // Rader i kapitlet: grupp A i ordning, plus grupp B:s pass som inte finns i A (halvklass)
  const aDatum = new Set(ap.a.map((r) => `${r.datum}|${r.start}`));
  const rader: Array<{ r: PlaneradLektion; index: number; grupp?: 'A' | 'B' }> = [];
  ap.a.forEach((r, index) => { if (r.kapitel === nr && r.datum !== null) rader.push({ r, index, ...(amne.halvklass === true && ap.b.some((x) => x.datum === r.datum && x.start === r.start) ? {} : amne.halvklass === true ? { grupp: 'A' as const } : {}) }); });
  ap.b.forEach((r, index) => { if (r.kapitel === nr && r.datum !== null && !aDatum.has(`${r.datum}|${r.start}`)) rader.push({ r, index, grupp: 'B' }); });
  rader.sort((x, y) => x.r.datum!.localeCompare(y.r.datum!) || (x.r.start ?? '').localeCompare(y.r.start ?? ''));
  if (inom !== null) {
    // Del 217: bara valda delkapitel; laborationer, repetition och prov tas med från första valda lektion t.o.m. kapitlets prov
    const valdaDatum = rader.filter((x) => inom(delkapitelKod(x.r.lektion.avsnitt))).map((x) => x.r.datum!);
    const forstaDatum = valdaDatum[0];
    const provRad = rader.find((x) => typFor(x.r) === 'prov');
    // Del 235 · utan prov i planen: laborationerna närmast efter sista valda lektion tas med — fram till nästa
    // teorilektion i planen (oavsett kapitel) och högst en vecka framåt
    const sistaValda = valdaDatum[valdaDatum.length - 1];
    const nastaTeori = sistaValda === undefined ? undefined : ap.a.find((r) => r.datum !== null && r.datum > sistaValda && !(r.nyckel ?? '').startsWith('lab:') && !(r.nyckel ?? '').startsWith('pass:'));
    const enVecka = sistaValda === undefined ? undefined : new Date(Date.parse(sistaValda) + 7 * 86_400_000).toISOString().slice(0, 10);
    const sistaDatum = provRad?.r.datum ?? (sistaValda === undefined ? undefined
      : rader.filter((x) => x.r.datum! >= sistaValda && x.r.datum! < (nastaTeori?.datum ?? '9999') && x.r.datum! <= enVecka!).map((x) => x.r.datum!).pop());
    const kvar = rader.filter((x) => {
      const kod = delkapitelKod(x.r.lektion.avsnitt);
      if (kod !== null) return inom(kod);
      return forstaDatum !== undefined && sistaDatum !== undefined && x.r.datum! >= forstaDatum && x.r.datum! <= sistaDatum;
    });
    rader.splice(0, rader.length, ...kvar);
  }

  // Del 222 · Ett omfång (6.1–6.5) ska inte peka på rum eller begrepp utanför urvalet: kumulativa rum
  // klipps till de valda delkapitlen (Biologi612345678 → Biologi612345, "Begrepp 6.1–6.8" → "Begrepp 6.1–6.5").
  const valdaNr = kap.delkapitel.filter((d) => inom === null || inom(d.kod)).map((d) => Number(d.kod.split('.')[1])).filter((n) => Number.isFinite(n));
  const klipp = (rum: string | null): string | null => {
    if (rum === null || inom === null) return rum;
    const m = /^([^\d]+)(\d)(\d+)$/.exec(rum);
    if (m === null || Number(m[2]) !== nr) return rum;
    const nrn = m[3].split('').map(Number);
    if (nrn.every((x) => valdaNr.includes(x))) return rum;
    const kvar = nrn.filter((x) => valdaNr.includes(x));
    return kvar.length === 0 ? null : `${m[1]}${m[2]}${kvar.join('')}`;
  };
  // Del 220 · Socrative-rummen som planeringen pekar på: exit ticket-rummet övar lektionens delkapitel,
  // läxförhörs- och läxrummen de delkapitel namnet täcker (kumulativt: Biologi612 = 6.1–6.2)
  const rumKarta = new Map<string, { delkapitel: string; exit: boolean; lax: boolean }>();
  const laggRum = (rum: string | null | undefined, delkapitel: string | null, slag: 'exit' | 'lax') => {
    if (rum === null || rum === undefined) return;
    const f = rumKarta.get(rum) ?? { delkapitel: delkapitel ?? rumTillKoder(rum) ?? '—', exit: false, lax: false };
    f[slag] = true; rumKarta.set(rum, f);
  };
  const dagar: PlanDag[] = rader.map(({ r, index, grupp }, i) => {
    const lp = hamtaLektionsplan(s, amneId, index);
    const kod = delkapitelKod(r.lektion.avsnitt);
    const typ = typFor(r);
    const begrepp = lp?.begreppText !== undefined && lp.begreppText.trim() !== ''
      ? lp.begreppText.split(',').map((b) => b.trim()).filter((b) => b !== '')
      : begreppForLektion(bok, r.kapitel, r.lektion);
    const laxRum = klipp(har(r.lektion.socStart) ? rumUr(r.lektion.socStart) : null);
    // Del 236 · Laborationer har aldrig läxförhör eller läxa: läxan går till nästa teorilektion i stället
    const laxforhor = typ !== 'laboration' && (laxRum !== null || har(lp?.laxforhorRum))
      ? { begrepp: `Begrepp ${rumTillKoder(lp?.laxforhorRum ?? laxRum ?? '') ?? (lp?.laxforhorRum ?? laxRum ?? '')}`, rum: klassRum, ovaRum: lp?.laxforhorRum ?? laxRum }
      : null;
    const exitRum = har(r.lektion.exit) ? rumUr(r.lektion.exit) : null;
    const exit = typ === 'lektion' && (exitRum !== null || har(lp?.exitQuiz))
      ? { rum: klassRum, begrepp: kod !== null ? `Begrepp ${kod}` : (lp?.exitQuiz ?? r.lektion.exit) }
      : null;
    const nastaRad = rader.slice(i + 1).find((x) => typFor(x.r) !== 'laboration' && (x.grupp === grupp || x.grupp === undefined || grupp === undefined));
    // Läxan är ALLTID kumulativ: alla begrepp till och med det här delkapitlet, i det
    // kumulativa rummet (Biologi612) — samma begrepp och rum som nästa lektions läxförhör.
    const laxaRum = klipp((har(r.lektion.laxa) ? rumITexten(r.lektion.laxa) : null) ?? exitRum);
    const laxaKoder = laxaRum !== null ? rumTillKoder(laxaRum) : null;
    const laxa = typ === 'lektion' && begrepp.length > 0 && nastaRad !== undefined && nastaRad.r.datum !== null
      ? {
        till: `${veckodag(nastaRad.r.datum).toLowerCase()} v${isoVecka(nastaRad.r.datum)}`,
        text: har(lp?.laxa) ? lp!.laxa! : `Begrepp ${laxaKoder ?? kod ?? ''}`.trim(),
        ovaRum: laxaRum,
      }
      : null;
    const genomgang = har(lp?.genomgang) ? lp!.genomgang! : (har(r.lektion.genomgang) && r.lektion.genomgang !== r.lektion.avsnitt ? r.lektion.genomgang : null);
    const genomgangKalla = genomgang === null ? null : (har(lp?.genomgang) ? 'lektionsplan' as const : 'bok' as const);
    const arbete = har(lp?.uppgNiva1) ? lp!.uppgNiva1! : (har(r.lektion.ex) ? r.lektion.ex : (har(r.lektion.niva1) ? `Uppgifter ${r.lektion.niva1}` : null));
    const provText = typ !== 'prov' ? [] : (har(lp?.genomgang) ? lp!.genomgang!.split('\n').map((x) => x.trim()).filter((x) => x !== '')
      : ((NO_TK_AMNEN as readonly string[]).includes(amne.namn) ? [...PROV_UPPLAGG_NO] : []));
    if (typ === 'lektion') laggRum(exitRum, kod, 'exit');
    laggRum(laxforhor?.ovaRum, null, 'lax');
    laggRum(laxa?.ovaRum, null, 'lax');
    return {
      datum: r.datum!, dag: veckodag(r.datum!), vecka: r.vecka ?? isoVecka(r.datum!), nr: index + 1, typ,
      ...(grupp !== undefined ? { grupp } : {}),
      kod, avsnitt: lektionsNamn(r.lektion, lp),
      sidor: har(lp?.sidorTeori) ? lp!.sidorTeori! : (har(r.lektion.sidorTeori) ? r.lektion.sidorTeori : null),
      laxforhor, genomgang, genomgangKalla, arbete: typ === 'lektion' || typ === 'repetition' ? arbete : null, exit, begrepp, laxa,
      filmer: filmerFor(bok, nr, kod, lp?.filmer ?? []),
      provText,
    };
  });
  const veckor: PlanVecka[] = [];
  for (const d of dagar) {
    const v = veckor[veckor.length - 1];
    if (v !== undefined && v.vecka === d.vecka) v.dagar.push(d); else veckor.push({ vecka: d.vecka, dagar: [d] });
  }

  // Del 224 · laborationerna i omfånget med frågeställning; genomförd = lärarens val, annars datum före idag
  const laborationer: PlanLaboration[] = [];
  for (const { r, index } of rader) {
    const lp = hamtaLektionsplan(s, amneId, index);
    const arLab = typFor(r) === 'laboration' || (r.nyckel?.startsWith('lab:') ?? false);
    if (!arLab && !har(lp?.labFraga)) continue;
    const nyckel = r.nyckel ?? `${r.datum}|${r.start ?? ''}`;
    if (laborationer.some((l) => l.nyckel === nyckel)) continue;   // halvklass: samma labb för grupp A och B
    const egen = r.nyckel?.startsWith('lab:') === true ? (amne.laborationer ?? []).find((l) => l.id === r.nyckel!.slice(4)) : undefined;
    const fraga = har(lp?.labFraga) ? lp!.labFraga!.trim() : (egen?.syfte !== undefined && har(egen.syfte) ? egen.syfte.trim() : null);
    laborationer.push({ nyckel, lektionsIndex: index, namn: lektionsNamn(r.lektion, lp), fraga, datum: r.datum,
      genomford: genomforda !== null ? genomforda.has(nyckel) : (r.datum !== null && r.datum < dagensIdag) });
  }
  const alla = [...kap.delkapitel.flatMap((d) => d.lektioner), ...kap.extraLektioner];
  // Syftet står på kapitlets öppningsuppslag ("Här får du lära dig", t.ex. s. 229).
  // Saknas det i bokfilen faller vi tillbaka på delkapitlens mål (sammanfattningarna).
  const kapitelMal = (kap.mal ?? []).filter((x) => x.trim() !== '');
  const delkapitelMal = [...new Set(alla.flatMap((l) => (l.mal ?? '').split('\n').map((x) => x.trim()).filter((x) => x !== '')))];
  const syfte = kapitelMal.length > 0 ? kapitelMal : delkapitelMal;
  const syfteFranDelkapitel = kapitelMal.length === 0;
  const valdaDelkapitel = inom === null ? kap.delkapitel : kap.delkapitel.filter((d) => inom(d.kod));
  const innehall = valdaDelkapitel.map((d) => {
    const forsta = d.lektioner[0];
    const idx = ap.a.findIndex((r) => r.kapitel === nr && r.lektion.id === forsta?.id);
    const lp = idx >= 0 ? hamtaLektionsplan(s, amneId, idx) : null;
    // Del 220 · bokens sammanfattning av delkapitlet först, sedan lärarens egen, sist bokens mål/genomgång
    const bokSamm = d.lektioner.map((l) => l.sammanfattning).find((x): x is string => x !== undefined && har(x));
    const [text, kalla]: [string, 'bok' | 'lektionsplan' | 'mal'] = bokSamm !== undefined ? [bokSamm.trim(), 'bok']
      : har(lp?.sammanfattning) ? [lp!.sammanfattning!, 'lektionsplan']
        : [forsta !== undefined && har(forsta.mal) ? forsta.mal! : (forsta !== undefined && har(forsta.genomgang) && forsta.genomgang !== forsta.avsnitt ? forsta.genomgang : ''), 'mal'];
    return { kod: d.kod, namn: d.namn, sidor: d.sidor, text, kalla };
  });
  const begreppPerDelkapitel = valdaDelkapitel.map((d) => ({ kod: d.kod, namn: d.namn, begrepp: [...new Set(d.begrepp.map((b) => b.trim()).filter((b) => b !== ''))] }));
  const rumLista = [...rumKarta.entries()]
    .map(([rum, f]) => ({ rum, delkapitel: f.delkapitel, anvands: f.exit && f.lax ? 'exit ticket och läxförhör' as const : f.exit ? 'exit ticket' as const : 'läxförhör' as const }))
    .sort((a, b) => a.delkapitel.localeCompare(b.delkapitel, 'sv') || a.rum.localeCompare(b.rum, 'sv'));
  const filmer = valdaDelkapitel.map((d) => {
    const idx = ap.a.findIndex((r) => r.kapitel === nr && delkapitelKod(r.lektion.avsnitt) === d.kod);
    return { kod: d.kod, namn: d.namn, filmer: filmerFor(bok, nr, d.kod, idx >= 0 ? hamtaLektionsplan(s, amneId, idx)?.filmer ?? [] : []) };
  });
  const valdaLektioner = inom === null ? alla : [...valdaDelkapitel.flatMap((d) => d.lektioner), ...kap.extraLektioner];
  const ovaRum = [...new Set(valdaLektioner.map((l) => (har(l.exit) ? rumUr(l.exit) : null)).filter((x): x is string => x !== null))];
  // Del 222 · rummet för alla valda delkapitel: prefixet ur första exit-rummet + kapitel + delkapitelnumren
  const prefixM = ovaRum.length > 0 ? /^([^\d]+)\d/.exec(ovaRum[0]) : null;
  const ovaRumAlla = prefixM !== null && valdaNr.length > 0 ? [`${prefixM[1]}${nr}${valdaNr.join('')}`] : ovaRum.slice(-1);
  const begreppslista = inom === null ? kap.begreppslista : [...new Set(valdaDelkapitel.flatMap((d) => d.begrepp))];
  const provRad = dagar.find((d) => d.typ === 'prov') ?? null;
  const provLektion = alla.find((l) => l.typ === 'exam');
  const prov = provRad !== null ? { datum: provRad.datum, rubrik: provRad.avsnitt } : (provLektion !== undefined ? { datum: null, rubrik: provLektion.avsnitt } : null);
  const sammanfattningSidor = provLektion !== undefined && har(provLektion.sidorTeori) ? provLektion.sidorTeori : (kap.sidor !== '—' ? kap.sidor : null);
  return {
    amne: amne.namn, klass: klass.namn, kapitel: { nr, namn: kap.namn, sidor: kap.sidor },
    kapitelLista: [{ nr, namn: kap.namn, sidor: kap.sidor, syfte, syfteSidor: kap.malSidor ?? null, viktigaBegrepp: kap.viktigaBegrepp ?? [], omfang: inom === null ? null : omfangText(valdaNr.map((n) => `${nr}.${n}`)) }],
    omfang: null,
    syfte, syfteSidor: kap.malSidor ?? null, syfteFranDelkapitel, begrepp: begreppslista, begreppPerDelkapitel, innehall, socrativeRum: rumLista, filmer, ovaRum, ovaRumAlla, klassRum, prov, sammanfattningSidor, veckor, laborationer,
  };
}
