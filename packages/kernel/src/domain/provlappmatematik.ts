/**
 * Del 260 · Provlappen i matematik — ordnad efter matematikens fem förmågor.
 *
 * Matematikens provlapp ska säga vad eleven behöver visa i varje förmåga: begrepp, metod, problemlösning,
 * resonemang och kommunikation. För betyget E måste alla fem visas på E-nivå.
 *
 *  - Begrepp: varje begrepp med beskrivning (bokfilens förklaringar) och sidan där teorin står.
 *  - Metod: alla metoder som introduceras i delkapitlen, med teorisidor. Metoderna är delkapitlens mål;
 *    varje mål sorteras till en förmåga efter hur det börjar ('Beräkna …' → metod, 'Resonera …' → resonemang),
 *    eller uttryckligt med ett förled i bokfilen ('Metod: …', 'Problemlösning: …').
 *  - Problemlösning, resonemang, kommunikation: vad som krävs för E, C och A, typiska uppgifter per nivå
 *    (bokfilens kapitelMeta.formagor, annars hänvisningar till bokens uppgifter) och var förmågan övas i boken
 *    ('Förmågorna i fokus').
 *  - Checklista: per delkapitel bokens nivåer med uppgifter och sidor, och kapitlets repetitionsdelar.
 *
 * (Ring 1, I2: ren funktion — ingen fetch, DOM eller lagring.)
 */
import { delkapitelKod } from './bok.js';
import type { Bok, Kapitel, Lektion, NivaEtiketter } from './typer.js';
import { vagTyp, type VagTyp } from './vagtillprovet.js';

export type Formaga = 'begrepp' | 'metod' | 'problemlosning' | 'resonemang' | 'kommunikation';
type Niva = 'E' | 'C' | 'A';

/** Förmågorna i den ordning de står på lappen, med vad de betyder och vad som krävs på varje nivå. */
export const FORMAGOR: Array<{ id: Formaga; namn: string; betyder: string; krav: Record<Niva, string> }> = [
  {
    id: 'begrepp', namn: 'Begrepp', betyder: 'Du kan orden, vet vad de betyder och använder dem rätt.',
    krav: {
      E: 'Du känner igen begreppen, kan förklara dem med egna ord och använder dem i uppgifter du känner igen.',
      C: 'Du använder begreppen rätt också i nya uppgifter och kan beskriva hur de hänger ihop.',
      A: 'Du använder begreppen säkert i ovana uppgifter och kan förklara likheter och skillnader mellan dem.',
    },
  },
  {
    id: 'metod', namn: 'Metod', betyder: 'Du kan räkna: välja en metod och genomföra den så att svaret blir rätt.',
    krav: {
      E: 'Du väljer en metod som fungerar och räknar i huvudsak rätt i uppgifter du känner igen.',
      C: 'Du väljer lämpliga metoder och räknar rätt också när uppgiften har flera steg.',
      A: 'Du väljer effektiva metoder, räknar säkert i flera steg och anpassar metoden när uppgiften är ovan.',
    },
  },
  {
    id: 'problemlosning', namn: 'Problemlösning', betyder: 'Du kan lösa uppgifter där metoden inte är given: förstå frågan, välja strategi, genomföra och kontrollera.',
    krav: {
      E: 'Du löser enkla problem i situationer du känner igen och bedömer om svaret är rimligt.',
      C: 'Du löser problem i flera steg, också i mindre välkända situationer, och kontrollerar ditt svar.',
      A: 'Du löser sammansatta problem i nya situationer, prövar olika strategier och kan förklara varför lösningen håller.',
    },
  },
  {
    id: 'resonemang', namn: 'Resonemang', betyder: 'Du kan förklara varför något stämmer, och följa och pröva andras tankar.',
    krav: {
      E: 'Du kan förklara hur du har tänkt och följa någon annans resonemang.',
      C: 'Du motiverar dina slutsatser med matematiska argument och kan pröva om någon annans resonemang håller.',
      A: 'Du resonerar i flera led, drar allmänna slutsatser och visar när något alltid gäller — eller ger ett motexempel.',
    },
  },
  {
    id: 'kommunikation', namn: 'Kommunikation', betyder: 'Du kan redovisa så att någon annan kan följa din lösning.',
    krav: {
      E: 'Din lösning går att följa: figur eller uppställning, uträkning, enhet och svar.',
      C: 'Du redovisar tydligt steg för steg, med rätt matematiskt språk och rätt symboler.',
      A: 'Du redovisar fullständigt och välordnat med korrekt matematiskt språk, så att lösningen går att förstå utan att fråga dig.',
    },
  },
];

/** Regeln för betyget E — står överst på lappen. */
export const REGEL_E = 'För betyget E måste du visa alla fem förmågorna på E-nivå: begrepp, metod, problemlösning, resonemang och kommunikation. Det räcker inte att vara stark i en förmåga om en annan saknas.';

const har = (x: string | undefined | null): x is string => x !== undefined && x !== null && x.trim() !== '' && x.trim() !== '—';
const sid = (x: string | undefined | null): string | null => (har(x) ? `s. ${x.trim().replace(/^s\.\s*/i, '')}` : null);

const FORLED: Array<[RegExp, Formaga]> = [
  [/^begrepp\s*:\s*/i, 'begrepp'], [/^metod(er)?\s*:\s*/i, 'metod'], [/^problemlösning\s*:\s*/i, 'problemlosning'],
  [/^resonemang\s*:\s*/i, 'resonemang'], [/^kommunikation\s*:\s*/i, 'kommunikation'],
];

/**
 * Vilken förmåga ett mål hör till. Ett förled i bokfilen ('Metod: …') avgör; annars hur målet börjar.
 * Det som inte känns igen är en metod — delkapitlens mål i en mattebok är nästan alltid saker man ska kunna räkna.
 */
export function malensFormaga(mal: string): { formaga: Formaga; text: string } {
  const m = mal.trim();
  for (const [re, formaga] of FORLED) if (re.test(m)) return { formaga, text: m.replace(re, '').trim() };
  const l = m.toLowerCase();
  if (/^(resonera|motivera|förklara (varför|samband|hur)|argumentera|avgöra|bedöma|värdera|jämföra och förklara|dra slutsats|undersöka|generalisera)/.test(l)) return { formaga: 'resonemang', text: m };
  if (/^(redovisa|rita figur|rita och|teckna|skriva ut|skriv ut|presentera|visa din lösning|visa dina)/.test(l)) return { formaga: 'kommunikation', text: m };
  if (/problem|^välja (rätt |lämplig )?(strategi|metod|formel)|^tolka/.test(l)) return { formaga: 'problemlosning', text: m };
  if (/^(namnge|känna igen|veta|förstå|beskriva|förklara vad|skilja (på|mellan)|kunna begreppen|ge exempel på)/.test(l)) return { formaga: 'begrepp', text: m };
  return { formaga: 'metod', text: m };
}

export interface MatteRad { text: string; sidor: string | null }
/** En ruta i checklistan: en nivå i ett delkapitel, eller en av kapitlets repetitionsdelar. */
export interface MatteKryss { namn: string; uppgifter: string | null; sidor: string | null; betyg: Niva[] }

export interface MatteAvsnitt {
  kod: string;
  rubrik: string;
  /** Sidorna där delkapitlets teori står ('s. 106–107'). */
  teoriSidor: string | null;
  begrepp: Array<{ begrepp: string; forklaring: string | null; sidor: string | null }>;
  /** Det eleven ska kunna i delkapitlet, sorterat per förmåga, med teorisidor. */
  mal: Record<Formaga, MatteRad[]>;
  /** Bokens nivåer i delkapitlet (ETT, TVÅ, TRE …) med uppgifter och sidor. */
  kryss: MatteKryss[];
}

export interface MatteFormaga {
  id: Formaga; namn: string; betyder: string;
  krav: Record<Niva, string>;
  /** Typiska uppgifter per nivå — bokfilens egna (kapitelMeta.formagor) och, för problemlösning, var i boken nivån övas ('I boken: …'). */
  typiska: Record<Niva, string[]>;
  /** Sant när `typiska` kommer ur bokfilen (utskrivna uppgifter), falskt när det är hänvisningar. */
  utskrivna: boolean;
  /** Var förmågan övas i boken ('Förmågorna i fokus s. 151–152: Vilket påstående stämmer? …'). */
  iBoken: string[];
}

export interface MatteLapp {
  regelE: string;
  formagor: MatteFormaga[];
  avsnitt: MatteAvsnitt[];
  /** Mål som hör till hela kapitlet (Blandade uppgifter: 'Välja rätt formel …', 'Lösa problem i flera steg …') — utan begrepp och rutor. */
  blandat: MatteAvsnitt[];
  /** Kapitlets repetitionsdelar: Blandade uppgifter, Diagnos, Träna, Utveckla, Förmågorna i fokus, Sammanfattning. */
  repetition: MatteKryss[];
}

const nivaNamn = (n: NivaEtiketter, i: 1 | 2 | 3) => (i === 1 ? n.niva1 : i === 2 ? n.niva2 : n.niva3);

/** Bokens nivåer → betygsnivåer: ETT/TVÅ/TRE = E/C/A; Grön/Blå/Röd: Grön + Blå = E, Röd = C och A. */
function betygFor(n: NivaEtiketter, i: 1 | 2 | 3): Niva[] {
  const ettTvaTre = /^ett$/i.test(n.niva1.trim()) && /^två$/i.test(n.niva2.trim()) && /^tre$/i.test(n.niva3.trim());
  if (ettTvaTre) return [i === 1 ? 'E' : i === 2 ? 'C' : 'A'];
  return i === 3 ? ['C', 'A'] : ['E'];
}

/** '1–10' + '11–20' → '1–20'; olika intervall utan kontakt skrivs med punkt emellan. */
function slaIhop(intervall: string[]): string | null {
  const delar = [...new Set(intervall.filter(har).map((x) => x.trim().replace(/-/g, '–')))];
  if (delar.length === 0) return null;
  const tal = delar.map((d) => /^(\d+)\s*–\s*(\d+)$/.exec(d)).map((m) => (m === null ? null : [Number(m[1]), Number(m[2])] as [number, number]));
  if (!tal.every((t): t is [number, number] => t !== null)) return delar.join(' · ');
  const ut: Array<[number, number]> = [];
  for (const [a, b] of [...tal].sort((x, y) => x[0] - y[0])) {
    const sista = ut[ut.length - 1];
    if (sista !== undefined && a <= sista[1] + 1) sista[1] = Math.max(sista[1], b); else ut.push([a, b]);
  }
  return ut.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(' · ');
}
const sidorIhop = (sidor: Array<string | undefined>): string | null => {
  const s = slaIhop(sidor.filter(har).map((x) => x.trim().replace(/^s\.\s*/i, '')));
  return s === null ? null : `s. ${s}`;
};

/** Delar 'Begrepp och metod (s. 150): … Problemlösning (s. 151–152): … Resonemang (s. 153): …' i en del per förmåga. */
export function formagorIFokus(text: string): Partial<Record<Formaga, string>> {
  const ut: Partial<Record<Formaga, string>> = {};
  const re = /(Begrepp och metod|Begrepp|Metod|Problemlösning|Resonemang|Kommunikation)\s*\(s\.\s*([\d–\-\s]+)\)\s*:\s*/g;
  const traffar = [...text.matchAll(re)];
  traffar.forEach((m, i) => {
    const slut = i + 1 < traffar.length ? traffar[i + 1].index! : text.length;
    const innehall = text.slice(m.index! + m[0].length, slut).trim().replace(/[.;]\s*$/, '');
    const rad = `s. ${m[2].trim().replace(/-/g, '–')}${innehall !== '' ? `: ${innehall}` : ''}`;
    const till: Formaga[] = /^begrepp och metod$/i.test(m[1]) ? ['begrepp', 'metod'] : [m[1].toLowerCase().replace('ö', 'o') as Formaga];
    for (const f of till) if (ut[f] === undefined) ut[f] = rad;
  });
  return ut;
}

const REPETITION: VagTyp[] = ['blandade', 'diagnos', 'trana', 'utveckla', 'formagor', 'sammanfattning'];
const REPETITION_BETYG: Partial<Record<VagTyp, Niva[]>> = { diagnos: ['E'], trana: ['E'], blandade: ['E', 'C', 'A'], utveckla: ['A'], formagor: ['E', 'C', 'A'], sammanfattning: ['E'] };

/**
 * Bygger matematiklappen för delkapitlen `koder` (i den ordning de ska stå). `uppgifter` är lärarens egna
 * uppgiftsintervall per delkapitel när de skiljer sig från bokens (annars används bokens).
 */
export function matteLapp(bok: Bok, koder: string[], uppgifter: Map<string, { niva1: string; niva2: string; niva3: string }> = new Map()): MatteLapp {
  const n = bok.nivaer;
  const kapitelNr = [...new Set(koder.map((k) => Number(k.split('.')[0])))];
  const kapitel = kapitelNr.map((nr) => bok.kapitel.find((k) => k.nr === nr)).filter((k): k is Kapitel => k !== undefined);
  const forklaring = (b: string): string | null => {
    for (const k of kapitel) {
      const nyckel = Object.keys(k.resurser.forklaringar ?? {}).find((x) => x.toLowerCase().trim() === b.toLowerCase().trim());
      if (nyckel !== undefined) return k.resurser.forklaringar![nyckel];
    }
    return null;
  };
  const sedda = new Set<string>();
  const avsnitt: MatteAvsnitt[] = [];
  for (const kod of koder) {
    const dk = kapitel.flatMap((k) => k.delkapitel).find((d) => d.kod === kod);
    if (dk === undefined) continue;
    const begrepp: MatteAvsnitt['begrepp'] = [];
    const mal: Record<Formaga, MatteRad[]> = { begrepp: [], metod: [], problemlosning: [], resonemang: [], kommunikation: [] };
    for (const l of dk.lektioner) {
      for (const b of l.begrepp.split(',').map((x) => x.trim()).filter(har)) {
        if (sedda.has(b.toLowerCase()) || /^alla kapitlets begrepp$/i.test(b)) continue;
        sedda.add(b.toLowerCase());
        begrepp.push({ begrepp: b, forklaring: forklaring(b), sidor: sid(l.sidorTeori) });
      }
      for (const m of (l.mal ?? '').split('\n').map((x) => x.trim()).filter(har)) {
        const { formaga, text } = malensFormaga(m);
        if (!mal[formaga].some((x) => x.text === text)) mal[formaga].push({ text, sidor: sid(l.sidorTeori) });
      }
    }
    const egna = uppgifter.get(kod);
    const kryss: MatteKryss[] = [];
    for (const i of [1, 2, 3] as const) {
      const falt = `niva${i}` as 'niva1' | 'niva2' | 'niva3';
      const u = har(egna?.[falt]) ? egna[falt].trim() : slaIhop(dk.lektioner.map((l) => l[falt]));
      if (!har(u)) continue;
      kryss.push({ namn: nivaNamn(n, i), uppgifter: u, sidor: sidorIhop(dk.lektioner.map((l) => l.uppgiftSidor?.[falt])), betyg: betygFor(n, i) });
    }
    avsnitt.push({ kod, rubrik: `${kod} ${dk.namn}`, teoriSidor: sidorIhop(dk.lektioner.map((l) => l.sidorTeori)), begrepp, mal, kryss });
  }

  // Kapitlets repetitionsdelar, en ruta per del (Blandade uppgifter del 1 och 2 slås ihop)
  const repetition: MatteKryss[] = [];
  const blandat: MatteAvsnitt[] = [];
  const fokus: Partial<Record<Formaga, string[]>> = {};
  for (const k of kapitel) {
    const flera = kapitel.length > 1 ? ` (kapitel ${k.nr})` : '';
    const grupper = new Map<string, { typ: VagTyp; lektioner: Lektion[] }>();
    for (const l of k.extraLektioner) {
      const typ = vagTyp(l);
      if (!REPETITION.includes(typ) || delkapitelKod(l.avsnitt) !== null) continue;
      const g = grupper.get(l.avsnitt) ?? { typ, lektioner: [] };
      g.lektioner.push(l); grupper.set(l.avsnitt, g);
    }
    for (const [namn, g] of grupper) {
      const nivaer = ([1, 2, 3] as const)
        .map((i) => ({ i, u: slaIhop(g.lektioner.map((l) => l[`niva${i}` as 'niva1' | 'niva2' | 'niva3'])) }))
        .filter((x) => x.u !== null).map((x) => `${nivaNamn(n, x.i)} ${x.u}`);
      repetition.push({ namn: `${namn}${flera}`, uppgifter: nivaer.length > 0 ? nivaer.join(' · ') : null, sidor: sidorIhop(g.lektioner.map((l) => l.sidorTeori)), betyg: REPETITION_BETYG[g.typ] ?? ['E'] });
      if (g.typ === 'blandade') {
        const mal: Record<Formaga, MatteRad[]> = { begrepp: [], metod: [], problemlosning: [], resonemang: [], kommunikation: [] };
        for (const l of g.lektioner) for (const m of (l.mal ?? '').split('\n').map((x) => x.trim()).filter(har)) {
          const { formaga, text } = malensFormaga(m);
          if (!mal[formaga].some((x) => x.text === text)) mal[formaga].push({ text, sidor: sid(l.sidorTeori) });
        }
        if (Object.values(mal).some((x) => x.length > 0)) blandat.push({ kod: '', rubrik: `${namn}${flera}`, teoriSidor: sidorIhop(g.lektioner.map((l) => l.sidorTeori)), begrepp: [], mal, kryss: [] });
      }
      if (g.typ === 'formagor') {
        for (const [f, rad] of Object.entries(formagorIFokus(g.lektioner.map((l) => l.genomgang).join(' '))) as Array<[Formaga, string]>) {
          (fokus[f] ??= []).push(`${namn}${flera} ${rad}`);
        }
      }
    }
  }

  const blandade = (i: 1 | 2 | 3): string[] => kapitel.flatMap((k) => {
    const lekt = k.extraLektioner.filter((l) => vagTyp(l) === 'blandade');
    const u = slaIhop(lekt.map((l) => l[`niva${i}` as 'niva1' | 'niva2' | 'niva3']));
    if (u === null) return [];
    const sidor = sidorIhop(lekt.map((l) => l.sidorTeori));
    return [`Blandade uppgifter${kapitel.length > 1 ? ` kapitel ${k.nr}` : ''}: ${nivaNamn(n, i)} ${u}${sidor !== null ? ` (${sidor})` : ''}`];
  });
  const utveckla = kapitel.flatMap((k) => k.extraLektioner.filter((l) => vagTyp(l) === 'utveckla').map((l) => `${l.avsnitt}${har(l.sidorTeori) ? ` (${sid(l.sidorTeori)})` : ''}`));

  const formagor: MatteFormaga[] = FORMAGOR.map((f) => {
    const egna: Record<Niva, string[]> = { E: [], C: [], A: [] };
    for (const k of kapitel) for (const niva of ['E', 'C', 'A'] as const) egna[niva].push(...(k.formagor?.[f.id]?.[niva] ?? []));
    const utskrivna = egna.E.length + egna.C.length + egna.A.length > 0;
    let typiska = egna;
    if (f.id === 'problemlosning') {
      // Var i boken nivån övas: Blandade uppgifter per nivå och, för A, Utveckla. Står efter bokfilens utskrivna uppgifter.
      const perNiva = (niva: Niva): string[] => ([1, 2, 3] as const).filter((i) => betygFor(n, i).includes(niva)).flatMap((i) => blandade(i));
      const bok: Record<Niva, string[]> = { E: perNiva('E'), C: perNiva('C'), A: [...perNiva('A'), ...utveckla] };
      const med = (niva: Niva) => [...egna[niva], ...bok[niva].map((x) => (utskrivna ? `I boken: ${x}` : x))];
      typiska = { E: med('E'), C: med('C'), A: med('A') };
    }
    return { id: f.id, namn: f.namn, betyder: f.betyder, krav: f.krav, typiska, utskrivna, iBoken: fokus[f.id] ?? [] };
  });
  return { regelE: REGEL_E, formagor, avsnitt, blandat, repetition };
}
