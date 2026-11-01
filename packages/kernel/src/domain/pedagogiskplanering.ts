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
import { socrativeRum } from './amnen.js';
import { amnesPlanFor, hamtaLektionsplan, lektionsNamn } from './struktur.js';
import { isoVecka } from './skolar.js';
import type { Bok, PlaneradLektion, Struktur } from './typer.js';

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
}

export interface PlanVecka { vecka: number; dagar: PlanDag[] }

export interface PedagogiskPlanering {
  amne: string;
  klass: string;
  /** Första (eller enda) kapitlet. */
  kapitel: { nr: number; namn: string; sidor: string };
  /** Del 217 · Alla kapitel i omfånget, med varje kapitels eget syfte ("Här får du lära dig"). */
  kapitelLista: Array<{ nr: number; namn: string; sidor: string; syfte: string[]; syfteSidor: string | null }>;
  /** Del 217 · Omfånget som text ('6.1–6.5 · 7.1–7.3'); null = hela kapitlet. */
  omfang: string | null;
  /** Syftet: kapitlets "Här får du lära dig" (öppningsuppslaget). Saknas det i boken används delkapitlens mål. */
  syfte: string[];
  /** Sidan där "Här får du lära dig" står, t.ex. 's. 229'. */
  syfteSidor: string | null;
  /** true när syftet är delkapitlens mål — kapitlets egna saknas i bokfilen. */
  syfteFranDelkapitel: boolean;
  /** Viktiga begrepp i bokordning. */
  begrepp: string[];
  /** Innehåll per delkapitel: kod, namn, sidor, sammanfattning (lektionsplanens, annars genomgångens punkter). */
  innehall: Array<{ kod: string; namn: string; sidor: string; text: string }>;
  /** Filmer per delkapitel. */
  filmer: Array<{ kod: string; namn: string; filmer: PlanFilm[] }>;
  /** Kumulativa övningsrum i ordning: Biologi61, Biologi612 … */
  ovaRum: string[];
  /** Klassrummet där läxförhör och exit tickets körs. */
  klassRum: string;
  prov: { datum: string | null; rubrik: string } | null;
  sammanfattningSidor: string | null;
  veckor: PlanVecka[];
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
  return ut;
}

/**
 * Bygger underlaget för ett kapitel. `kapitelNr` undefined = det kapitel som pågår
 * (första lektionen på eller efter `idag`, annars den sista). null när ämnet saknar
 * bok eller planering.
 */
export function pedagogiskPlanering(s: Struktur, amneId: string, kapitelNr?: number, idag?: string): PedagogiskPlanering | null {
  const pl = pedagogiskPlaneringKapitel(s, amneId, kapitelNr, idag, null);
  return pl;
}

/**
 * Del 217 · Pedagogisk planering för ett omfång av delkapitel över ett eller flera kapitel
 * ('6.1-6.5, 7.1-7.3'). Varje kapitel byggs för sig (bara de valda delkapitlen; laborationer,
 * repetition och prov som ligger mellan första valda lektion och kapitlets prov tas med) och
 * slås ihop: syfte per kapitel, begrepp, innehåll och filmer för de valda delkapitlen, och
 * veckoplaneringen i datumordning. null när inget delkapitel i omfånget finns.
 */
export function pedagogiskPlaneringForOmfang(s: Struktur, amneId: string, spann: Array<{ fran: string; till: string }>, idag?: string): PedagogiskPlanering | null {
  const kodDelar = (kod: string): [number, number] | null => { const m = /^(\d+)\.(\d+)$/.exec(kod.trim()); return m === null ? null : [Number(m[1]), Number(m[2])]; };
  const perKapitel = new Map<number, Array<[number, number]>>();
  for (const sp of spann) {
    const a = kodDelar(sp.fran); const b = kodDelar(sp.till);
    if (a === null || b === null || a[0] !== b[0]) continue;
    perKapitel.set(a[0], [...(perKapitel.get(a[0]) ?? []), [a[1], b[1]]]);
  }
  const delar: PedagogiskPlanering[] = [];
  for (const [nr, intervall] of [...perKapitel.entries()].sort((x, y) => x[0] - y[0])) {
    const inom = (kod: string | null): boolean => { const k = kod === null ? null : kodDelar(kod); return k !== null && k[0] === nr && intervall.some(([f, t]) => k[1] >= f && k[1] <= t); };
    const pl = pedagogiskPlaneringKapitel(s, amneId, nr, idag, inom);
    if (pl !== null && pl.innehall.length > 0) delar.push(pl);
  }
  if (delar.length === 0) return null;
  const forsta = delar[0];
  const omfang = spann.map((x) => (x.fran === x.till ? x.fran : `${x.fran}–${x.till}`)).join(' · ');
  const veckor: PlanVecka[] = [];
  for (const d of delar.flatMap((pl) => pl.veckor.flatMap((v) => v.dagar)).sort((a, b) => a.datum.localeCompare(b.datum))) {
    const v = veckor[veckor.length - 1];
    if (v !== undefined && v.vecka === d.vecka) v.dagar.push(d); else veckor.push({ vecka: d.vecka, dagar: [d] });
  }
  const provDelar = delar.map((pl) => pl.prov).filter((x): x is NonNullable<PedagogiskPlanering['prov']> => x !== null);
  return {
    amne: forsta.amne, klass: forsta.klass, kapitel: forsta.kapitel,
    kapitelLista: delar.flatMap((pl) => pl.kapitelLista),
    omfang,
    syfte: delar.flatMap((pl) => pl.syfte), syfteSidor: forsta.syfteSidor, syfteFranDelkapitel: delar.some((pl) => pl.syfteFranDelkapitel),
    begrepp: [...new Set(delar.flatMap((pl) => pl.begrepp))],
    innehall: delar.flatMap((pl) => pl.innehall), filmer: delar.flatMap((pl) => pl.filmer),
    ovaRum: [...new Set(delar.flatMap((pl) => pl.ovaRum))], klassRum: forsta.klassRum,
    prov: provDelar[provDelar.length - 1] ?? null,
    sammanfattningSidor: delar.map((pl) => pl.sammanfattningSidor).filter((x): x is string => x !== null).join(', ') || null,
    veckor,
  };
}

/** Ett kapitel; `inom` begränsar till vissa delkapitel (null = alla). */
function pedagogiskPlaneringKapitel(s: Struktur, amneId: string, kapitelNr: number | undefined, idag: string | undefined, inom: ((kod: string | null) => boolean) | null): PedagogiskPlanering | null {
  const amne = s.amnen.find((a) => a.id === amneId);
  const klass = s.klasser.find((k) => k.id === amne?.klassId);
  const bok = s.bocker.find((b) => b.id === amne?.bokId);
  const ap = amnesPlanFor(s, amneId, idag);
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
    const sistaDatum = provRad?.r.datum ?? valdaDatum[valdaDatum.length - 1];
    const kvar = rader.filter((x) => {
      const kod = delkapitelKod(x.r.lektion.avsnitt);
      if (kod !== null) return inom(kod);
      return forstaDatum !== undefined && sistaDatum !== undefined && x.r.datum! >= forstaDatum && x.r.datum! <= sistaDatum;
    });
    rader.splice(0, rader.length, ...kvar);
  }

  const dagar: PlanDag[] = rader.map(({ r, index, grupp }, i) => {
    const lp = hamtaLektionsplan(s, amneId, index);
    const kod = delkapitelKod(r.lektion.avsnitt);
    const typ = typFor(r);
    const begrepp = lp?.begreppText !== undefined && lp.begreppText.trim() !== ''
      ? lp.begreppText.split(',').map((b) => b.trim()).filter((b) => b !== '')
      : begreppForLektion(bok, r.kapitel, r.lektion);
    const laxRum = har(r.lektion.socStart) ? rumUr(r.lektion.socStart) : null;
    const laxforhor = laxRum !== null || har(lp?.laxforhorRum)
      ? { begrepp: `Begrepp ${rumTillKoder(lp?.laxforhorRum ?? laxRum ?? '') ?? (lp?.laxforhorRum ?? laxRum ?? '')}`, rum: klassRum, ovaRum: lp?.laxforhorRum ?? laxRum }
      : null;
    const exitRum = har(r.lektion.exit) ? rumUr(r.lektion.exit) : null;
    const exit = typ === 'lektion' && (exitRum !== null || har(lp?.exitQuiz))
      ? { rum: klassRum, begrepp: kod !== null ? `Begrepp ${kod}` : (lp?.exitQuiz ?? r.lektion.exit) }
      : null;
    const nastaRad = rader.slice(i + 1).find((x) => x.grupp === grupp || x.grupp === undefined || grupp === undefined);
    // Läxan är ALLTID kumulativ: alla begrepp till och med det här delkapitlet, i det
    // kumulativa rummet (Biologi612) — samma begrepp och rum som nästa lektions läxförhör.
    const laxaRum = (har(r.lektion.laxa) ? rumITexten(r.lektion.laxa) : null) ?? exitRum;
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
    return {
      datum: r.datum!, dag: veckodag(r.datum!), vecka: r.vecka ?? isoVecka(r.datum!), nr: index + 1, typ,
      ...(grupp !== undefined ? { grupp } : {}),
      kod, avsnitt: lektionsNamn(r.lektion, lp),
      sidor: har(lp?.sidorTeori) ? lp!.sidorTeori! : (har(r.lektion.sidorTeori) ? r.lektion.sidorTeori : null),
      laxforhor, genomgang, genomgangKalla, arbete: typ === 'lektion' || typ === 'repetition' ? arbete : null, exit, begrepp, laxa,
      filmer: filmerFor(bok, nr, kod, lp?.filmer ?? []),
    };
  });
  const veckor: PlanVecka[] = [];
  for (const d of dagar) {
    const v = veckor[veckor.length - 1];
    if (v !== undefined && v.vecka === d.vecka) v.dagar.push(d); else veckor.push({ vecka: d.vecka, dagar: [d] });
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
    const text = har(lp?.sammanfattning) ? lp!.sammanfattning!
      : (forsta !== undefined && har(forsta.mal) ? forsta.mal! : (forsta !== undefined && har(forsta.genomgang) && forsta.genomgang !== forsta.avsnitt ? forsta.genomgang : ''));
    return { kod: d.kod, namn: d.namn, sidor: d.sidor, text };
  });
  const filmer = valdaDelkapitel.map((d) => {
    const idx = ap.a.findIndex((r) => r.kapitel === nr && delkapitelKod(r.lektion.avsnitt) === d.kod);
    return { kod: d.kod, namn: d.namn, filmer: filmerFor(bok, nr, d.kod, idx >= 0 ? hamtaLektionsplan(s, amneId, idx)?.filmer ?? [] : []) };
  });
  const valdaLektioner = inom === null ? alla : [...valdaDelkapitel.flatMap((d) => d.lektioner), ...kap.extraLektioner];
  const ovaRum = [...new Set(valdaLektioner.map((l) => (har(l.exit) ? rumUr(l.exit) : null)).filter((x): x is string => x !== null))];
  const begreppslista = inom === null ? kap.begreppslista : [...new Set(valdaDelkapitel.flatMap((d) => d.begrepp))];
  const provRad = dagar.find((d) => d.typ === 'prov') ?? null;
  const provLektion = alla.find((l) => l.typ === 'exam');
  const prov = provRad !== null ? { datum: provRad.datum, rubrik: provRad.avsnitt } : (provLektion !== undefined ? { datum: null, rubrik: provLektion.avsnitt } : null);
  const sammanfattningSidor = provLektion !== undefined && har(provLektion.sidorTeori) ? provLektion.sidorTeori : (kap.sidor !== '—' ? kap.sidor : null);
  return {
    amne: amne.namn, klass: klass.namn, kapitel: { nr, namn: kap.namn, sidor: kap.sidor },
    kapitelLista: [{ nr, namn: kap.namn, sidor: kap.sidor, syfte, syfteSidor: kap.malSidor ?? null }],
    omfang: null,
    syfte, syfteSidor: kap.malSidor ?? null, syfteFranDelkapitel, begrepp: begreppslista, innehall, filmer, ovaRum, klassRum, prov, sammanfattningSidor, veckor,
  };
}
