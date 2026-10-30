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
import { NO_TK_AMNEN } from './amnen.js';
import { amnesPlanFor, hamtaLektionsplan, lektionsNamn } from './struktur.js';
import { vagTillProvet, vagTyp, type VagBox, type VagTyp } from './vagtillprovet.js';
import { fragematris } from './delkapiteltrend.js';

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
  /** Del 206 · Lärarens sammanfattning av delkapitlet (LektionsPlan.sammanfattning, en per lektion). */
  sammanfattning: string[];
  /** Del 206 · Laborationsfrågor som hör till delkapitlet (LektionsPlan.labFraga). */
  labFragor: string[];
  /** Del 206 · Ramar för att visa djup (orsakssamband i flera led) och bredd (flera exempel i ett led), byggda ur avsnittets egna begrepp och mål. Del 209: bokens egna exempel när de finns. */
  djupBredd: DjupBredd | null;
  /** Del 209 · Bokens exempel på enkel laborationsbeskrivning för avsnittet. */
  labb: string | null;
  /** Del 209 · Filmer som hör till avsnittet (bokens filmresurser, t.ex. Binogi). */
  filmer: Array<{ titel: string; url: string }>;
  /** Del 210 · Frågorna klassen haft i läxförhör och exit tickets (Socrative) för avsnittet, med senaste andel rätt. */
  fragor: ProvlappFraga[];
  /** Del 213 · Bokens Testa dig själv-frågor för avsnittet. */
  testaFragor: string[];
}

/** Del 213 · Så övar du i NO: E-nivån (begrepp, sammanfattning, laborationer, flashcards) och C/A (samband, exempel, Testa dig själv, Finalen, filmer). */
export interface NoOvning {
  /** Socrative-rum för läxförhör och exit tickets i omfånget, i planeringsordning. */
  rum: string[];
  /** Laborationerna i omfångets kapitel: namn och lärarens frågeställning. */
  laborationer: Array<{ namn: string; fraga: string | null }>;
  /** Presentationer (PowerPoint) som använts på lektionerna — flashcards på sammanfattningen. */
  presentationer: string[];
  /** Finalen per kapitel ('Finalen s. 269–270'). */
  finalen: string[];
  /** Alla filmer i omfånget, per avsnitt. */
  filmer: Array<{ avsnitt: string; titel: string; url: string }>;
}

/** Del 210 · En fråga ur klassens Socrative-resultat: begreppet (ur facit) eller frågetexten, och hur det gick senast. */
export interface ProvlappFraga {
  /** Frågetexten — i begreppsförhören är det begreppets beskrivning. */
  fraga: string;
  begrepp: string | null;
  /** Andel rätt (0–100) vid senaste tillfället frågan ställdes; null när inget bedömt svar finns. */
  procent: number | null;
  /** Provet/rummet frågan senast ställdes i. */
  senast: string;
}

/** Del 210 · Gräns för "öva extra": under detta antal procent rätt markeras begreppet. */
export const PROVLAPP_OVA_GRANS = 60;

/**
 * Del 210 · Klassens Socrative-frågor per delkapitelkod, ur frågematrisen (läxförhör + exit tickets).
 * För varje fråga tas det senaste tillfället den ställdes.
 */
export function fragorPerDelkapitel(s: Struktur, klassId: string, amneId: string): Map<string, ProvlappFraga[]> {
  const ut = new Map<string, ProvlappFraga[]>();
  if (klassId === '') return ut;
  const m = fragematris(s, { klassId, amneId, kallor: ['socrative-laxforhor', 'socrative-exit'] });
  m.fragor.forEach((fr, i) => {
    if (fr.kod === '—') return;
    const med = m.rader.filter((r) => r.celler[i] !== null).sort((a, b) => a.datum.localeCompare(b.datum));
    const sista = med[med.length - 1];
    if (sista === undefined) return;
    const cell = sista.celler[i]!;
    ut.set(fr.kod, [...(ut.get(fr.kod) ?? []), { fraga: fr.fraga, begrepp: fr.begrepp ?? null, procent: cell.procent, senast: sista.prov }]);
  });
  return ut;
}

/** Del 206 · Så visar eleven djup och bredd i ett avsnitt — ramar, inte färdiga svar. */
export interface DjupBredd {
  /** Begreppen (eller målet) ramen bygger på. */
  kedja: string[];
  /** 'Förklara i flera led hur fotosyntes leder till … → … → cellandning. Varje pil svarar på varför.' */
  djup: string;
  /** 'Ge tre olika exempel på …, och säg vad de har gemensamt.' */
  bredd: string;
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
  /** Del 206 · Sant för NO-ämnen: lappen tar med laborationsbeskrivning på E-nivå. */
  noAmne: boolean;
  /** Del 206 · E-nivåns tre krav i ord (begrepp, sammanfattning, enkel laborationsbeskrivning för NO). */
  kravE: string[];
  /** Del 213 · NO: så övar du för E och för C/A. null för andra ämnen. */
  noOvning: NoOvning | null;
  /** Del 213 · Varifrån begreppens beskrivningar kommer: Socrative (senaste versionen av läxförhören) eller boken. */
  begreppKalla: 'socrative' | 'bok' | 'blandat';
}

/** Del 206 · Ramar för djup och bredd ur avsnittets begrepp (minst två) eller mål. null när inget finns att bygga på. */
export function djupBreddFor(begrepp: string[], mal: string[]): DjupBredd | null {
  const b = begrepp.map((x) => x.trim()).filter((x) => x !== '');
  if (b.length >= 2) {
    const forsta = b[0]; const sista = b[b.length - 1];
    const mellan = b.length > 2 ? ` (via ${b.slice(1, -1).slice(0, 2).join(', ')})` : '';
    return {
      kedja: b.slice(0, 4),
      djup: `Förklara i flera led hur ${forsta} hänger ihop med ${sista}${mellan}: ${forsta} → … → ${sista}. Varje pil ska svara på varför.`,
      bredd: `Ge tre olika exempel på ${forsta} och säg vad exemplen har gemensamt.`,
    };
  }
  const m = mal.map((x) => x.trim()).filter((x) => x !== '')[0] ?? b[0];
  if (m === undefined) return null;
  return {
    kedja: [m],
    djup: `Välj något ur "${m}" och förklara orsak → följd → följd i flera led. Varje pil ska svara på varför.`,
    bredd: `Ge tre olika exempel som visar "${m}" och säg vad de har gemensamt.`,
  };
}

/** Del 206 · E-nivåns laborationsbeskrivning i tre steg: vad vi söker, hur vi ser resultatet, kopplingen. `fraga` = lärarens labfråga när den finns. */
export function labMall(fraga: string | null): Array<{ steg: string; text: string }> {
  return [
    { steg: 'Vad söker vi?', text: fraga !== null ? `Frågan: ${fraga}` : 'Skriv frågan laborationen ska svara på.' },
    { steg: 'Hur ser vi resultatet?', text: 'Beskriv vad vi gjorde och vad vi såg, mätte eller jämförde.' },
    { steg: 'Koppling', text: 'Vad säger resultatet om frågan? Svara på frågan med hjälp av det du såg.' },
  ];
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

function avsnittUrBox(s: Struktur, amneId: string, bok: Bok, b: VagBox, fragor: Map<string, ProvlappFraga[]>): ProvlappAvsnitt {
  const lekt = b.lektioner;
  const planer = lekt.map((l) => hamtaLektionsplan(s, amneId, l.index));
  const iBoken = lekt.map((l) => l.bok).find((x) => x !== undefined);
  const egenSamm = planer.map((lp) => lp?.sammanfattning).filter(har).map((x) => x.trim());
  const ram = djupBreddFor(b.begrepp, b.mal);
  const djupBredd: DjupBredd | null = iBoken?.djup !== undefined || iBoken?.bredd !== undefined
    ? { kedja: ram?.kedja ?? b.begrepp.slice(0, 4), djup: iBoken.djup ?? ram?.djup ?? '', bredd: iBoken.bredd ?? ram?.bredd ?? '' }
    : ram;
  const prefix = b.kod !== null ? `${b.kod} · ` : null;
  const filmer = prefix === null ? [] : bok.kapitel.flatMap((k) => k.resurser.filmer).filter((f) => f.titel.startsWith(prefix)).map((f) => ({ titel: f.titel.slice(prefix.length), url: f.url }));
  return {
    sammanfattning: [...new Set(egenSamm.length > 0 ? egenSamm : (iBoken?.sammanfattning !== undefined ? [iBoken.sammanfattning] : []))],
    labFragor: [...new Set(planer.map((lp) => lp?.labFraga).filter(har).map((x) => x.trim()))],
    djupBredd,
    labb: iBoken?.labb ?? null,
    filmer,
    fragor: b.kod !== null ? (fragor.get(b.kod) ?? []) : [],
    testaFragor: iBoken?.testaFragor ?? [],
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
  const fragor = fragorPerDelkapitel(s, amne.klassId, amneId);
  const avsnitt = boxar.map((b) => avsnittUrBox(s, amneId, bok, b, fragor));
  const noAmne = (NO_TK_AMNEN as readonly string[]).includes(amne.namn);
  const hitta = (b: string): string | null => {
    for (const k of kapitel) {
      const nyckel = Object.keys(k.forklaringar).find((x) => x.toLowerCase().trim() === b.toLowerCase().trim());
      if (nyckel !== undefined) return k.forklaringar[nyckel];
    }
    return null;
  };
  // Hela kapitlet: bokens begreppslista först; ett omfång: bara avsnittens begrepp
  const begreppOrdning = [...(omfang === null ? kapitel.flatMap((k) => k.begreppslista) : []), ...avsnitt.flatMap((a) => a.begrepp)];
  // Del 213 (NO): beskrivningen ur Socrative — begreppsförhörens frågetext är beskrivningen, facit är begreppet; senaste versionen vinner
  const socBeskrivning = new Map<string, string>();
  if (noAmne) for (const a of avsnitt) for (const f of a.fragor) if (f.begrepp !== null && f.fraga.trim() !== '') socBeskrivning.set(f.begrepp.toLowerCase().trim(), f.fraga.trim());
  const socExtra = noAmne ? [...new Set(avsnitt.flatMap((a) => a.fragor).map((f) => f.begrepp).filter((b): b is string => b !== null))] : [];
  const begrepp = [...new Set([...begreppOrdning, ...socExtra].map((b) => b.trim()).filter((b) => b !== ''))]
    .filter((b, i, arr) => arr.findIndex((x) => x.toLowerCase() === b.toLowerCase()) === i)
    .map((b) => ({ begrepp: b, forklaring: socBeskrivning.get(b.toLowerCase()) ?? hitta(b) }));
  const antalSoc = begrepp.filter((b) => socBeskrivning.has(b.begrepp.toLowerCase())).length;
  const begreppKalla: Provlapp['begreppKalla'] = antalSoc === 0 ? 'bok' : antalSoc === begrepp.length ? 'socrative' : 'blandat';

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
  const noOvning = noAmne ? byggNoOvning(s, amneId, bok, kapitel.map((k) => k.nr), avsnitt) : null;
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
    noAmne,
    kravE: [
      'Kunna begreppen: förklara varje begrepp med egna ord och ge ett exempel.',
      'Kunna sammanfattningen: berätta det viktigaste i varje avsnitt.',
      ...(noAmne ? ['Göra en enkel laborationsbeskrivning: vad vi söker, hur vi ser resultatet och hur resultatet kopplas till det vi söker.'] : []),
    ],
    noOvning,
    begreppKalla,
  };
}

/** Rumsnamnet ur ett fält som 'Biologi612 (läxförhör)' eller 'Biologi61 (exit ticket)'. */
function rumUr(text: string | undefined): string | null {
  if (!har(text)) return null;
  const m = /^([A-Za-zÅÄÖåäö]+\d+)/.exec(text.trim());
  return m === null ? null : m[1];
}

/** Del 213 · Underlaget för "Så övar du" i NO ur planeringen: rum, laborationer, presentationer, Finalen och filmer. */
function byggNoOvning(s: Struktur, amneId: string, bok: Bok, kapitelNr: number[], avsnitt: ProvlappAvsnitt[]): NoOvning {
  const ap = amnesPlanFor(s, amneId);
  const rader = ap === null ? [] : ap.a.map((r, index) => ({ r, index })).filter(({ r }) => kapitelNr.includes(r.kapitel));
  const rum: string[] = []; const presentationer: string[] = []; const laborationer: NoOvning['laborationer'] = [];
  for (const { r, index } of rader) {
    const lp = hamtaLektionsplan(s, amneId, index);
    for (const x of [lp?.laxforhorRum, rumUr(r.lektion.socStart), rumUr(r.lektion.exit)]) if (har(x) && !rum.includes(x)) rum.push(x);
    if (har(lp?.presentation) && !presentationer.includes(lp.presentation.trim())) presentationer.push(lp.presentation.trim());
    if (r.lektion.typ === 'laboration' || (r.nyckel?.startsWith('lab:') ?? false)) {
      const namn = lektionsNamn(r.lektion, lp);
      if (!laborationer.some((l) => l.namn === namn)) laborationer.push({ namn, fraga: har(lp?.labFraga) ? lp.labFraga.trim() : null });
    } else if (har(lp?.labFraga)) {
      const fraga = lp.labFraga.trim();
      if (!laborationer.some((l) => l.fraga === fraga)) laborationer.push({ namn: lektionsNamn(r.lektion, lp), fraga });
    }
  }
  const finalen = kapitelNr.flatMap((nr) => {
    const kap = bok.kapitel.find((k) => k.nr === nr);
    const f = kap?.extraLektioner.find((l) => /finalen/i.test(l.avsnitt));
    return f === undefined ? [] : [`Finalen kapitel ${nr}${har(f.sidorTeori) ? ` (s. ${f.sidorTeori.replace(/^s\.\s*/i, '')})` : ''}`];
  });
  const filmer = avsnitt.flatMap((a) => a.filmer.map((f) => ({ avsnitt: a.rubrik, titel: f.titel, url: f.url })));
  return { rum, laborationer, presentationer, finalen, filmer };
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
  // Del 209: tål 'och', 'samt', '&', 'till', decimalkomma (6,5) och slarvfel som '6-5' för 6.5
  const delar = text.replace(/(\d),(\d)/g, '$1.$2').replace(/\b(och|samt)\b|&/gi, ',').split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x !== '');
  const spann: DelkapitelSpann[] = [];
  for (const rad of delar) {
    let d = rad.replace(/\btill\b/gi, '–').replace(/\s+/g, ' ').trim();
    const slarv = /^(\d+)\.(\d+)\s*[-–—]\s*(\d+)-(\d+)$/.exec(d);   // '6.1 - 6-5' → '6.1 - 6.5'
    if (slarv !== null && slarv[1] === slarv[3]) d = `${slarv[1]}.${slarv[2]}-${slarv[3]}.${slarv[4]}`;
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

/** Del 213 · "Så övar du" för NO som textrader — delas av textversionen, vyn och Word. */
export function noOvningPunkter(p: Provlapp): { E: string[]; CA: string[] } {
  const o = p.noOvning;
  if (o === null) return { E: [], CA: [] };
  const E = [
    `Träna på begreppen: begreppslistan ovan och socrative.com${o.rum.length > 0 ? ` — rum ${o.rum.join(', ')}` : ''}.`,
    'Träna på sammanfattningen: läs den för varje avsnitt och berätta den med egna ord.',
    `Gå igenom det viktigaste från laborationerna — vad vi testade, hur vi testade och hur vi såg resultatet${o.laborationer.length > 0 ? `: ${o.laborationer.map((l) => (l.fraga !== null ? `${l.namn} (${l.fraga})` : l.namn)).join(' · ')}` : ''}.`,
    `Öva sammanfattningen som flashcards i PowerPoint${o.presentationer.length > 0 ? ` (${o.presentationer.join(', ')})` : ''}.`,
  ];
  const tds = p.avsnitt.filter((a) => a.testaFragor.length > 0);
  const CA = [
    'Använd begreppen när du förklarar — inte bara rabbla dem.',
    'Öva orsak och samband i flera led: A → B → C, där varje pil svarar på varför (se djup-frågorna ovan).',
    'Lär dig exemplen och detaljerna i varje avsnitt.',
    `Öva på Testa dig själv-frågorna${tds.length > 0 ? ` (${tds.map((a) => `${a.rubrik.split(' ')[0]}: ${a.testaFragor.length} frågor`).join(', ')})` : ''}.`,
    o.finalen.length > 0 ? `Öva på ${o.finalen.join(' och ')}.` : 'Öva på Finalen i slutet av kapitlet.',
    `Se filmerna på Binogi${o.filmer.length > 0 ? ` — alla länkar nedan (${o.filmer.length} filmer)` : ''}.`,
  ];
  return { E, CA };
}

function noOvningText(p: Provlapp): string[] {
  const { E, CA } = noOvningPunkter(p);
  const r: string[] = [];
  r.push(''); r.push('SÅ ÖVAR DU FÖR E');
  E.forEach((x) => r.push(`• ${x}`));
  r.push(''); r.push('SÅ ÖVAR DU FÖR C OCH A');
  CA.forEach((x) => r.push(`• ${x}`));
  const tds = p.avsnitt.filter((a) => a.testaFragor.length > 0);
  if (tds.length > 0) {
    r.push(''); r.push('TESTA DIG SJÄLV-FRÅGOR');
    for (const a of tds) { r.push(a.rubrik); a.testaFragor.forEach((f, i) => r.push(`  ${i + 1}. ${f}`)); }
  }
  return r;
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
  r.push(''); r.push('SÅ VISAR DU DJUP OCH BREDD');
  r.push('Djup = orsakssamband i flera led (A → B → C, varje pil svarar på varför). Bredd = flera exempel i ett led (A: exempel 1, 2, 3).');
  for (const a of p.avsnitt.filter((x) => x.typ === 'delkapitel' && x.djupBredd !== null)) {
    r.push(a.rubrik);
    r.push(`  Djup: ${a.djupBredd!.djup}`);
    r.push(`  Bredd: ${a.djupBredd!.bredd}`);
    if (a.labb !== null) r.push(`  Labb (E): ${a.labb}`);
  }
  const medFragor = p.avsnitt.filter((a) => a.fragor.length > 0);
  if (medFragor.length > 0) {
    r.push(''); r.push('BEGREPP FRÅN LÄXFÖRHÖR OCH EXIT TICKETS');
    r.push(`(andel rätt i klassen senast · ⚠ = under ${PROVLAPP_OVA_GRANS} % — öva extra)`);
    for (const a of medFragor) { r.push(a.rubrik); a.fragor.forEach((f) => r.push(`  • ${f.begrepp ?? f.fraga}${f.procent !== null ? ` – ${f.procent} %${f.procent < PROVLAPP_OVA_GRANS ? ' ⚠' : ''}` : ''}`)); }
  }
  const medFilm = p.avsnitt.filter((a) => a.filmer.length > 0);
  if (medFilm.length > 0) {
    r.push(''); r.push('FILMER');
    for (const a of medFilm) { r.push(a.rubrik); a.filmer.forEach((f) => r.push(`  • ${f.titel} – ${f.url}`)); }
  }
  r.push(''); r.push('FÖR E-NIVÅ KRÄVS');
  p.kravE.forEach((k) => r.push(`• ${k}`));
  if (p.noAmne) {
    r.push('Laborationsbeskrivning i tre steg:');
    const fragor = p.avsnitt.flatMap((a) => a.labFragor);
    labMall(fragor[0] ?? null).forEach((m) => r.push(`  ${m.steg} ${m.text}`));
  }
  if (p.noOvning !== null) {
    noOvningText(p).forEach((rad) => r.push(rad));
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
