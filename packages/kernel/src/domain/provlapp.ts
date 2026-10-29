/**
 * Del 151 · Provlappen — det eleverna får inför kapitlets prov, autogenererad
 * ur planeringen (Ring 1, I2: ingen fetch/DOM/lagring; Word-filen byggs i
 * UI-lagret ur denna struktur).
 *
 * Lappen byggs ur Vägen till provet: avsnitten före provet i planeringsordning
 * med mål, begrepp (med bokens förklaringar), sidor och uppgifter per nivå,
 * plus övningsförslag för E-, C- och A-nivå. Bokens nivåer översätts:
 *   ETT/TVÅ/TRE (Matematik X/Y/Z)  →  E / C / A
 *   Grön/Blå/Röd (Prio)            →  E = Grön + Blå · C = Röd · A = Röd + fördjupning
 * Kapitlets repetitionsdelar (Blandade uppgifter, Träna, Utveckla, Förmågorna i
 * fokus, Perspektiv, Finalen …) sorteras in på nivåerna efter sin typ.
 * Lärarens egen text på provlektionen (LektionsPlan.provlappNotis) tas med.
 * Del 199: ett omfång av delkapitel (LektionsPlan.provlappOmfang, '6.1-6.5, 7.1-7.5')
 * ger en lapp över just de delkapitlen, även över flera kapitel.
 */
import type { Bok, NivaEtiketter, Struktur } from './typer.js';
import { amnesPlanFor, hamtaLektionsplan, lektionsNamn } from './struktur.js';
import { vagTillProvet, vagTyp, type VagBox, type VagTyp } from './vagtillprovet.js';

export type Betygsniva = 'E' | 'C' | 'A';

export interface ProvlappAvsnitt {
  rubrik: string;
  typ: VagTyp;
  sidor: string;
  /** Det eleven ska kunna (bokens mål för avsnittet). */
  mal: string[];
  begrepp: string[];
  /** Uppgifter per boknivå (sammanslagna över avsnittets lektioner). */
  uppgifter: { niva1: string; niva2: string; niva3: string };
  /** Genomgångens innehåll och bokens exempel — det som gåtts igenom på lektionerna. */
  genomgang: string[];
  exempel: string[];
}

export interface ProvlappOvning {
  avsnitt: string;
  /** Uppgifterna i boken, t.ex. 'ETT 1–10 (s. 11)' eller 'Grön 1–8 · Blå 9–16'. */
  uppgifter: string;
}

export interface Provlapp {
  amne: string;
  klass: string;
  bok: string;
  kapitelNr: number;
  kapitelNamn: string;
  /** Del 199 · Omfånget som text när lappen täcker ett urval av delkapitel ('6.1–6.5 · 7.1–7.5'); null = hela kapitlet. */
  omfang: string | null;
  /** Del 199 · Kapitlen lappen täcker, i ordning (ett vid helt kapitel). */
  kapitel: Array<{ nr: number; namn: string; mal: string[] }>;
  provNamn: string;
  /** Provets datum (YYYY-MM-DD) eller null när provet inte har fått ett datum. */
  provDatum: string | null;
  provVecka: number | null;
  /** Bokens nivåetiketter och hur de översatts till betygsnivåer. */
  nivaer: NivaEtiketter;
  nivaKarta: Record<Betygsniva, string>;
  /** Kapitlets övergripande mål ('Här får du lära dig'). */
  kapitelMal: string[];
  avsnitt: ProvlappAvsnitt[];
  /** Alla begrepp i kapitlet med bokens förklaring när den finns. */
  begrepp: Array<{ begrepp: string; forklaring: string | null }>;
  /** Övningsförslag per betygsnivå, i planeringsordning. */
  ovningar: Record<Betygsniva, ProvlappOvning[]>;
  /** Lärarens egen text på provlektionen (hjälpmedel, tider, extra råd). */
  notis: string | null;
  /** Sidor med repetition att läsa (Sammanfattning o.d.). */
  repetitionSidor: string[];
}

function har(v: string | undefined | null): v is string { return v !== undefined && v !== null && v.trim() !== '' && v.trim() !== '—'; }

/** Hur bokens tre nivåer läses som E/C/A. ETT/TVÅ/TRE → E/C/A; annars (Grön/Blå/Röd) E = 1+2, C = 3, A = 3. */
export function nivaKarta(n: NivaEtiketter): { karta: Record<Betygsniva, Array<1 | 2 | 3>>; text: Record<Betygsniva, string> } {
  const ettTvaTre = /^ett$/i.test(n.niva1.trim()) && /^två$/i.test(n.niva2.trim()) && /^tre$/i.test(n.niva3.trim());
  const karta: Record<Betygsniva, Array<1 | 2 | 3>> = ettTvaTre ? { E: [1], C: [2], A: [3] } : { E: [1, 2], C: [3], A: [3] };
  const namn = (k: Array<1 | 2 | 3>) => k.map((i) => (i === 1 ? n.niva1 : i === 2 ? n.niva2 : n.niva3)).join(' + ');
  return { karta, text: { E: namn(karta.E), C: namn(karta.C), A: `${namn(karta.A)} och fördjupning` } };
}

/** '1–10' och '11–20' → '1–20' när intervallen hänger ihop; annars '1–10 · 21–30'. */
function slaIhop(intervall: string[]): string {
  const delar = intervall.filter(har).map((x) => x.trim());
  if (delar.length === 0) return '—';
  const tal = delar.map((d) => /^(\d+)\s*[–-]\s*(\d+)$/.exec(d)).map((m) => (m === null ? null : [Number(m[1]), Number(m[2])] as [number, number]));
  if (tal.every((t): t is [number, number] => t !== null)) {
    const sorterade = [...tal].sort((a, b) => a[0] - b[0]);
    const ut: Array<[number, number]> = [];
    for (const [a, b] of sorterade) {
      const sista = ut[ut.length - 1];
      if (sista !== undefined && a <= sista[1] + 1) sista[1] = Math.max(sista[1], b); else ut.push([a, b]);
    }
    return ut.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(' · ');
  }
  return [...new Set(delar)].join(' · ');
}

function avsnittUrBox(b: VagBox): ProvlappAvsnitt {
  const lekt = b.lektioner;
  return {
    rubrik: b.rubrik, typ: b.typ, sidor: b.sidor,
    mal: b.mal, begrepp: b.begrepp,
    uppgifter: {
      niva1: slaIhop(lekt.map((l) => l.uppgifter.niva1)),
      niva2: slaIhop(lekt.map((l) => l.uppgifter.niva2)),
      niva3: slaIhop(lekt.map((l) => l.uppgifter.niva3)),
    },
    genomgang: [...new Set(lekt.map((l) => l.genomgang).filter(har))],
    exempel: [...new Set(lekt.map((l) => l.exempel).filter(har))],
  };
}

/** Uppgiftstext för ett avsnitt på en betygsnivå: 'ETT 1–10' / 'Grön 1–8 · Blå 9–16', med sidor. */
function uppgiftsText(a: ProvlappAvsnitt, n: NivaEtiketter, nivaer: Array<1 | 2 | 3>): string | null {
  const delar = nivaer
    .map((i) => ({ namn: i === 1 ? n.niva1 : i === 2 ? n.niva2 : n.niva3, u: i === 1 ? a.uppgifter.niva1 : i === 2 ? a.uppgifter.niva2 : a.uppgifter.niva3 }))
    .filter((x) => har(x.u));
  if (delar.length === 0) return null;
  return `${delar.map((x) => `${x.namn} ${x.u}`).join(' · ')}${har(a.sidor) ? ` (${a.sidor})` : ''}`;
}

/** Vilka betygsnivåer ett repetitionsavsnitt hör till. */
const REPETITION_NIVA: Partial<Record<VagTyp, Betygsniva[]>> = {
  diagnos: ['E'], trana: ['E'], blandade: ['E', 'C', 'A'], sammanfattning: ['E'],
  formagor: ['C', 'A'], utveckla: ['A'], perspektiv: ['C', 'A'], finalen: ['A'], annat: ['E', 'C'],
};

/** Lappens innehåll ur ett antal avsnittsboxar — delas av hela-kapitlet-lappen och omfångslappen. */
function byggLapp(s: Struktur, amneId: string, bok: Bok, boxar: VagBox[], kapitel: Array<{ nr: number; namn: string; mal: string[]; forklaringar: Record<string, string>; begreppslista: string[] }>, prov: { namn: string; datum: string | null; vecka: number | null; notis: string | null }, omfang: string | null): Provlapp {
  const amne = s.amnen.find((a) => a.id === amneId)!;
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const n = bok.nivaer;
  const { karta, text } = nivaKarta(n);
  const avsnitt = boxar.map(avsnittUrBox);
  const hitta = (b: string): string | null => {
    for (const k of kapitel) {
      const nyckel = Object.keys(k.forklaringar).find((x) => x.toLowerCase().trim() === b.toLowerCase().trim());
      if (nyckel !== undefined) return k.forklaringar[nyckel];
    }
    return null;
  };
  // Hela kapitlet: bokens begreppslista först; ett omfång: bara avsnittens begrepp
  const begreppOrdning = [...(omfang === null ? kapitel.flatMap((k) => k.begreppslista) : []), ...avsnitt.flatMap((a) => a.begrepp)];
  const begrepp = [...new Set(begreppOrdning.map((b) => b.trim()).filter((b) => b !== ''))].map((b) => ({ begrepp: b, forklaring: hitta(b) }));

  const ovningar: Record<Betygsniva, ProvlappOvning[]> = { E: [], C: [], A: [] };
  for (const a of avsnitt) {
    if (a.typ === 'delkapitel') {
      for (const niva of ['E', 'C', 'A'] as Betygsniva[]) {
        const u = uppgiftsText(a, n, karta[niva]);
        if (u !== null) ovningar[niva].push({ avsnitt: a.rubrik, uppgifter: u });
      }
    } else {
      const nivaer = REPETITION_NIVA[a.typ] ?? ['E', 'C'];
      for (const niva of nivaer) {
        const u = uppgiftsText(a, n, karta[niva]) ?? uppgiftsText(a, n, [1, 2, 3]) ?? (har(a.sidor) ? a.sidor : null);
        ovningar[niva].push({ avsnitt: a.rubrik, uppgifter: u ?? 'se boken' });
      }
    }
  }
  const forsta = kapitel[0];
  return {
    amne: amne.namn, klass: klass?.namn ?? '', bok: bok.titel,
    kapitelNr: forsta.nr, kapitelNamn: kapitel.length === 1 ? forsta.namn : kapitel.map((k) => `${k.nr} ${k.namn}`).join(' · '),
    omfang, kapitel: kapitel.map(({ nr, namn, mal }) => ({ nr, namn, mal })),
    provNamn: prov.namn, provDatum: prov.datum, provVecka: prov.vecka,
    nivaer: n, nivaKarta: text,
    kapitelMal: kapitel.flatMap((k) => k.mal),
    avsnitt, begrepp, ovningar,
    notis: prov.notis,
    repetitionSidor: avsnitt.filter((a) => a.typ === 'sammanfattning' && har(a.sidor)).map((a) => `${a.rubrik} ${a.sidor}`),
  };
}

const kapInfo = (bok: Bok, nr: number) => {
  const kap = bok.kapitel.find((k) => k.nr === nr);
  return kap === undefined ? null : { nr: kap.nr, namn: kap.namn, mal: kap.mal ?? [], forklaringar: kap.resurser.forklaringar ?? {}, begreppslista: kap.begreppslista };
};

/**
 * Provlappen för provlektionen på position `lektionsIndex` i ämnets planering.
 * null när raden inte är ett prov, ämnet saknar bok/planering eller kapitlet saknas.
 * Del 199: har lektionsplanen ett omfång (provlappOmfang, t.ex. '6.1-6.5, 7.1-7.5') byggs lappen för det.
 */
export function provlapp(s: Struktur, amneId: string, lektionsIndex: number, idag?: string): Provlapp | null {
  const amne = s.amnen.find((a) => a.id === amneId);
  const bok: Bok | undefined = s.bocker.find((b) => b.id === amne?.bokId);
  const ap = amnesPlanFor(s, amneId, idag);
  if (amne === undefined || bok === undefined || ap === null) return null;
  const rad = ap.a[lektionsIndex];
  if (rad === undefined || vagTyp(rad.lektion) !== 'prov') return null;
  const lp = hamtaLektionsplan(s, amneId, lektionsIndex);
  const prov = { namn: lektionsNamn(rad.lektion, lp), datum: rad.datum, vecka: rad.vecka, notis: har(lp?.provlappNotis) ? lp.provlappNotis.trim() : null };
  if (har(lp?.provlappOmfang)) {
    const omf = tolkaOmfang(lp.provlappOmfang);
    if (omf.fel === null && omf.spann.length > 0) return provlappForOmfang(s, amneId, omf.spann, prov, idag);
  }
  const vag = vagTillProvet(s, amneId, rad.kapitel, idag);
  const kap = kapInfo(bok, rad.kapitel);
  if (vag === null || kap === null) return null;
  // Avsnitten före provet: boxar med minst en lektion före provlektionen (eller odaterade delkapitel ur boken)
  const provDatum = rad.datum;
  const fore = vag.boxar.filter((b) => b.typ !== 'prov' && b.typ !== 'laboration' && (b.lektioner.length === 0 || b.lektioner.some((l) => l.index < lektionsIndex || l.datum === null || (provDatum !== null && l.datum < provDatum))));
  return byggLapp(s, amneId, bok, fore, [kap], prov, null);
}

// ── Del 199 · Provlapp för ett omfång av delkapitel (6.1–6.5, 7.1–7.5) ──────────

export interface DelkapitelSpann { fran: string; till: string }

const KOD = /^(\d+)\.(\d+)$/;
const kodDelar = (kod: string): [number, number] | null => { const m = KOD.exec(kod.trim()); return m === null ? null : [Number(m[1]), Number(m[2])]; };

/**
 * Tolkar ett omfång som läraren skriver: '6.1-6.5, 7.1-7.5' (även '6.1–6.5; 7.1 – 7.5', eller '7.3' för ett
 * enda delkapitel). Varje spann måste ligga i ett kapitel med början före slutet.
 */
export function tolkaOmfang(text: string): { spann: DelkapitelSpann[]; fel: string | null } {
  const delar = text.split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x !== '');
  const spann: DelkapitelSpann[] = [];
  for (const d of delar) {
    const m = /^(\d+\.\d+)\s*(?:[-–—]\s*(\d+\.\d+))?$/.exec(d);
    if (m === null) return { spann: [], fel: `"${d}" — skriv som 6.1-6.5 (eller bara 7.3).` };
    const fran = m[1]; const till = m[2] ?? m[1];
    const a = kodDelar(fran)!; const b = kodDelar(till)!;
    if (a[0] !== b[0]) return { spann: [], fel: `"${d}" — ett spann måste ligga inom ett kapitel (skriv t.ex. 6.6-6.8, 7.1-7.2).` };
    if (a[1] > b[1]) return { spann: [], fel: `"${d}" — slutet ligger före början.` };
    spann.push({ fran, till });
  }
  return { spann, fel: null };
}

export function omfangText(spann: DelkapitelSpann[]): string {
  return spann.map((x) => (x.fran === x.till ? x.fran : `${x.fran}–${x.till}`)).join(' · ');
}

/**
 * Provlappen för ett omfång av delkapitel, över ett eller flera kapitel. Delkapitlen i varje spann tas med
 * (alla deras lektioner, oavsett datum) tillsammans med kapitlets sammanfattning; begreppen är avsnittens.
 * `prov` är provets namn/datum (från provlektionen, eller ett valfritt namn när lappen görs fristående).
 * null när ämnet saknar bok/planering eller inget delkapitel i omfånget finns i boken.
 */
export function provlappForOmfang(s: Struktur, amneId: string, spann: DelkapitelSpann[], prov: { namn: string; datum: string | null; vecka: number | null; notis: string | null }, idag?: string): Provlapp | null {
  const amne = s.amnen.find((a) => a.id === amneId);
  const bok: Bok | undefined = s.bocker.find((b) => b.id === amne?.bokId);
  if (amne === undefined || bok === undefined) return null;
  const boxar: VagBox[] = []; const kapitel: NonNullable<ReturnType<typeof kapInfo>>[] = [];
  for (const sp of spann) {
    const a = kodDelar(sp.fran); const b = kodDelar(sp.till);
    if (a === null || b === null) continue;
    const nr = a[0];
    const vag = vagTillProvet(s, amneId, nr, idag);
    const kap = kapInfo(bok, nr);
    if (vag === null || kap === null) continue;
    const inom = (kod: string | null) => { const k = kod === null ? null : kodDelar(kod); return k !== null && k[0] === nr && k[1] >= a[1] && k[1] <= b[1]; };
    const valda = vag.boxar.filter((x) => x.typ === 'delkapitel' && inom(x.kod));
    if (valda.length === 0) continue;
    boxar.push(...valda);
    const samman = vag.boxar.find((x) => x.typ === 'sammanfattning');
    if (samman !== undefined && !boxar.includes(samman)) boxar.push(samman);
    if (!kapitel.some((k) => k.nr === nr)) kapitel.push(kap);
  }
  if (boxar.length === 0 || kapitel.length === 0) return null;
  return byggLapp(s, amneId, bok, boxar, kapitel, prov, omfangText(spann));
}

/** Provlappen som ren text (förhandsvisning, urklipp, Classroom-inlägg). */
export function provlappText(p: Provlapp): string {
  const r: string[] = [];
  r.push(`PROVLAPP · ${p.amne} ${p.klass} · ${p.bok}`);
  r.push(p.omfang === null ? `Kapitel ${p.kapitelNr}: ${p.kapitelNamn}` : `Omfattar: ${p.omfang} (${p.kapitel.map((k) => `kapitel ${k.nr} ${k.namn}`).join(', ')})`);
  r.push(`Prov: ${p.provNamn}${p.provDatum !== null ? ` · ${p.provDatum}${p.provVecka !== null ? ` (v. ${p.provVecka})` : ''}` : ' · datum ej satt'}`);
  if (p.notis !== null) { r.push(''); r.push(p.notis); }
  if (p.kapitelMal.length > 0) {
    r.push(''); r.push(p.kapitel.length > 1 ? 'DET HÄR FÅR DU LÄRA DIG I KAPITLEN' : 'DET HÄR FÅR DU LÄRA DIG I KAPITLET');
    for (const k of p.kapitel) { if (p.kapitel.length > 1 && k.mal.length > 0) r.push(`Kapitel ${k.nr} ${k.namn}`); k.mal.forEach((m) => r.push(`• ${m}`)); }
  }
  r.push(''); r.push('DET HÄR SKA DU KUNNA');
  for (const a of p.avsnitt.filter((x) => x.typ === 'delkapitel' || x.mal.length > 0)) {
    r.push(`${a.rubrik}${har(a.sidor) ? ` (${a.sidor})` : ''}`);
    a.mal.forEach((m) => r.push(`  • ${m}`));
    if (a.mal.length === 0 && a.begrepp.length > 0) r.push(`  Begrepp: ${a.begrepp.join(', ')}`);
  }
  if (p.begrepp.length > 0) {
    r.push(''); r.push('BEGREPP DU SKA KUNNA FÖRKLARA');
    p.begrepp.forEach((b) => r.push(`• ${b.begrepp}${b.forklaring !== null ? ` – ${b.forklaring}` : ''}`));
  }
  r.push(''); r.push('ÖVNINGSFÖRSLAG');
  r.push(`(E = ${p.nivaKarta.E} · C = ${p.nivaKarta.C} · A = ${p.nivaKarta.A})`);
  for (const niva of ['E', 'C', 'A'] as Betygsniva[]) {
    r.push(`${niva}-nivå`);
    if (p.ovningar[niva].length === 0) r.push('  —');
    p.ovningar[niva].forEach((o) => r.push(`  • ${o.avsnitt}: ${o.uppgifter}`));
  }
  if (p.repetitionSidor.length > 0) { r.push(''); r.push(`Läs igenom: ${p.repetitionSidor.join(' · ')}`); }
  return r.join('\n');
}
