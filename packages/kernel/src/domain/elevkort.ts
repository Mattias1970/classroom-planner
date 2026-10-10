/**
 * Del 154 · Elevkortet — enkla resultatdata per elev, en serie per källa
 * (läxförhör, exit tickets, övningar, DigiExam, Magma) för var sitt diagram,
 * samt vårdnadshavarnas e-post (Ring 1, I2: ingen fetch/DOM/lagring).
 *
 * Beskrivande: antal, snitt, senaste och hur många som nått gränsen — inga
 * orsaksslutsatser. Gränserna är källornas egna: läxförhör/övning 90 %, exit
 * 70 %, Magma 70 % (Godkänt), DigiExam provets poänggräns (E-prov: mer än hälften).
 */
import type { Elev, Struktur, Vardnadshavare } from './typer.js';
import { koderForProv } from './delkapitelkoder.js';
import { godkantGransFor, klaratKrav, kravFor, nivaText, resultatProcent, sammaPersonUtanMellannamn, TYPNAMN, type Resultat, type ResultatKalla } from './resultat.js';

export const ELEVKORT_KALLOR: ResultatKalla[] = ['socrative-laxforhor', 'socrative-exit', 'socrative-ovning', 'digiexam', 'magma'];
const RUBRIK: Record<ResultatKalla, string> = {
  'socrative-laxforhor': 'Läxförhör', 'socrative-exit': 'Exit tickets', 'socrative-ovning': 'Övningar', digiexam: 'DigiExam-prov', magma: 'Magma-test',
};

export interface ElevkortPunkt {
  datum: string;
  prov: string;
  /** Procent rätt (avrundad) eller null. */
  procent: number | null;
  poang: number;
  maxPoang: number;
  /** Nådd gräns: true/false, null när källan saknar gräns (övning har 90 %; DigiExam utan tolkbar gräns). */
  klarat: boolean | null;
  /** 'Bra', 'Godkänt', 'Under godkänd nivå', '8 av 14 p (godkänt från 8)' … */
  omdome: string;
  omprov?: boolean;
  /** Del 172 · Delkapitelkoder provet täcker (ur rum/quiznamn), tom när inget går att läsa ut (t.ex. screening). */
  koder: string[];
}

export interface ElevkortSerie {
  kalla: ResultatKalla;
  rubrik: string;
  /** Gränsen i procent som linje i diagrammet (DigiExam: senaste provets gräns i procent). */
  gransProcent: number | null;
  gransText: string;
  punkter: ElevkortPunkt[];
  antal: number;
  snitt: number | null;
  senaste: number | null;
  klarade: number;
  /** Antal med känd gräns (nämnaren i 'klarade X av Y'). */
  bedomda: number;
}

export interface Elevkort {
  elev: Elev;
  klass: string;
  amne: string | null;
  vardnadshavare: Vardnadshavare[];
  serier: ElevkortSerie[];
  /** Totalt antal resultat i urvalet. */
  antal: number;
}

const snitt = (v: number[]) => (v.length === 0 ? null : Math.round(v.reduce((a, b) => a + b, 0) / v.length));

function punkt(r: Resultat): ElevkortPunkt {
  const procent = resultatProcent(r);
  const p = (x: number) => String(x).replace('.', ',');
  if (r.kalla === 'digiexam') {
    const g = godkantGransFor(r);
    return {
      datum: r.datum, prov: r.prov, procent, poang: r.poang, maxPoang: r.maxPoang, koder: koderForProv(r.prov, r.rum),
      klarat: g === null ? null : r.poang >= g,
      omdome: `${p(r.poang)} av ${p(r.maxPoang)} p${g !== null ? (r.poang >= g ? ' · godkänt' : ` · ej godkänt (gräns ${g})`) : ' · gräns saknas'}`,
      ...(r.omprov === true || /omprov/i.test(r.prov) ? { omprov: true } : {}),
    };
  }
  return { datum: r.datum, prov: r.prov, procent, poang: r.poang, maxPoang: r.maxPoang, koder: koderForProv(r.prov, r.rum), klarat: klaratKrav(r), omdome: nivaText(r.kalla, procent) };
}

/** Elevkortet för en elev, valfritt avgränsat till ett ämne. */
export function elevkort(s: Struktur, elevId: string, amneId?: string): Elevkort | null {
  const elev = s.elever.find((e) => e.id === elevId);
  if (elev === undefined) return null;
  const klass = s.klasser.find((k) => k.id === elev.klassId)?.namn ?? '';
  const amne = amneId === undefined || amneId === '' ? null : s.amnen.find((a) => a.id === amneId)?.namn ?? null;
  const egna = (s.resultat ?? []).filter((r) => r.elevId === elevId && (amneId === undefined || amneId === '' || r.amneId === amneId));
  const serier = ELEVKORT_KALLOR.map((kalla): ElevkortSerie => {
    const rs = egna.filter((r) => r.kalla === kalla).sort((a, b) => a.datum.localeCompare(b.datum) || (a.tid ?? '').localeCompare(b.tid ?? '') || a.prov.localeCompare(b.prov, 'sv'));
    const punkter = rs.map(punkt);
    const procent = punkter.map((x) => x.procent).filter((x): x is number => x !== null);
    const bedomda = punkter.filter((x) => x.klarat !== null);
    let gransProcent = kravFor(kalla);
    let gransText = gransProcent === null ? '' : `gräns ${gransProcent} %`;
    if (kalla === 'digiexam') {
      const sista = rs[rs.length - 1];
      const g = sista === undefined ? null : godkantGransFor(sista);
      gransProcent = g === null || sista.maxPoang <= 0 ? null : Math.round((g / sista.maxPoang) * 100);
      gransText = g === null ? (sista === undefined ? 'E-prov: mer än hälften av poängen' : 'gräns saknas') : `godkänt från ${g} av ${sista.maxPoang} p`;
    }
    if (kalla === 'magma') gransText = 'Godkänt 70 % · Bra 85 % · Utmärkt 95 %';
    return {
      kalla, rubrik: RUBRIK[kalla] ?? TYPNAMN[kalla], gransProcent, gransText, punkter,
      antal: punkter.length, snitt: snitt(procent), senaste: procent.length > 0 ? procent[procent.length - 1] : null,
      klarade: bedomda.filter((x) => x.klarat === true).length, bedomda: bedomda.length,
    };
  });
  return { elev, klass, amne, vardnadshavare: elev.vardnadshavare ?? [], serier, antal: egna.length };
}

// ── Vårdnadshavare ───────────────────────────────────────────────────────────

/** Enkel kontroll av en e-postadress: något@något.toppdomän, utan mellanslag. */
export function giltigEpost(epost: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-zåäö]{2,}$/i.test(epost.trim());
}

/** Lägger till en vårdnadshavare (e-posten normaliseras till gemener; samma adress ersätts). Kastar svenska fel. */
export function laggTillVardnadshavare(s: Struktur, elevId: string, v: Vardnadshavare): Struktur {
  const epost = v.epost.trim().toLowerCase();
  if (!giltigEpost(epost)) throw new Error(`"${v.epost.trim()}" är ingen giltig e-postadress.`);
  if (!s.elever.some((e) => e.id === elevId)) throw new Error('Eleven finns inte.');
  const namn = v.namn?.trim() ?? '';
  return {
    ...s,
    elever: s.elever.map((e) => {
      if (e.id !== elevId) return e;
      const kvar = (e.vardnadshavare ?? []).filter((x) => x.epost !== epost);
      return { ...e, vardnadshavare: [...kvar, { epost, ...(namn !== '' ? { namn } : {}) }] };
    }),
  };
}

export function taBortVardnadshavare(s: Struktur, elevId: string, epost: string): Struktur {
  const mal = epost.trim().toLowerCase();
  return {
    ...s,
    elever: s.elever.map((e) => {
      if (e.id !== elevId) return e;
      const kvar = (e.vardnadshavare ?? []).filter((x) => x.epost !== mal);
      if (kvar.length > 0) return { ...e, vardnadshavare: kvar };
      const { vardnadshavare: _bort, ...rest } = e;
      return rest;
    }),
  };
}

/** mailto-länk till elevens vårdnadshavare (tom sträng när inga adresser finns). */
export function vardnadshavareMailto(elev: Pick<Elev, 'vardnadshavare'>, amne = '', text = ''): string {
  const till = (elev.vardnadshavare ?? []).map((v) => v.epost).join(',');
  if (till === '') return '';
  const delar = [amne !== '' ? `subject=${encodeURIComponent(amne)}` : '', text !== '' ? `body=${encodeURIComponent(text)}` : ''].filter((x) => x !== '');
  return `mailto:${till}${delar.length > 0 ? `?${delar.join('&')}` : ''}`;
}

// ── Del 160 · Slå ihop två elever ───────────────────────────────────────────

export interface Sammanslagning {
  s: Struktur;
  /** Resultat som flyttades till eleven som behålls. */
  flyttade: number;
  /** Resultat som fanns hos båda (samma källa, prov, datum, tid och ämne) — elevens egna behålls. */
  dubbletter: number;
}

/**
 * Slår ihop två elevposter som är samma elev: allt från `franId` (resultat, sittplatser,
 * vårdnadshavare, tidigare namn) flyttas till `tillId`, som behåller namn och grupp.
 * Namnet på den sammanslagna posten blir ett tidigare namn, så resultatfiler med det
 * namnet matchar eleven även framöver. Posten `franId` tas bort.
 */
export function slaIhopElever(s: Struktur, franId: string, tillId: string): Sammanslagning {
  if (franId === tillId) throw new Error('Välj två olika elever.');
  const fran = s.elever.find((e) => e.id === franId);
  const till = s.elever.find((e) => e.id === tillId);
  if (fran === undefined || till === undefined) throw new Error('Eleven finns inte.');
  if (fran.klassId !== till.klassId) throw new Error('Eleverna går i olika klasser — byt klass först.');

  const nyckel = (r: Resultat) => [r.kalla, r.prov.trim().toLowerCase(), r.datum, r.tid ?? '', r.amneId ?? ''].join('|');
  const tillsNycklar = new Set((s.resultat ?? []).filter((r) => r.elevId === tillId).map(nyckel));
  let flyttade = 0; let dubbletter = 0;
  const resultat: Resultat[] = [];
  for (const r of s.resultat ?? []) {
    if (r.elevId !== franId) { resultat.push(r); continue; }
    if (tillsNycklar.has(nyckel(r))) { dubbletter += 1; continue; }
    resultat.push({ ...r, elevId: tillId }); flyttade += 1;
  }

  const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim();
  const tidigare = [...new Set([...(till.tidigareNamn ?? []), fran.namn, ...(fran.tidigareNamn ?? [])])].filter((n) => norm(n) !== norm(till.namn));
  const vh = [...(till.vardnadshavare ?? [])];
  for (const v of fran.vardnadshavare ?? []) if (!vh.some((x) => x.epost === v.epost)) vh.push(v);
  const start = [till.startDatum, fran.startDatum].filter((d): d is string => d !== undefined).sort()[0];
  const slut = till.slutDatum === undefined || fran.slutDatum === undefined ? undefined : [till.slutDatum, fran.slutDatum].sort()[1];
  const aktiv = till.aktiv !== false || fran.aktiv !== false;
  const { tidigareNamn: _t, vardnadshavare: _v, startDatum: _s, slutDatum: _e, aktiv: _a, ...bas } = till;
  void _t; void _v; void _s; void _e; void _a;
  const ny: Elev = {
    ...bas,
    ...(till.epost === undefined && fran.epost !== undefined ? { epost: fran.epost } : {}),
    ...(till.socrativeId === undefined && fran.socrativeId !== undefined ? { socrativeId: fran.socrativeId } : {}),
    ...(tidigare.length > 0 ? { tidigareNamn: tidigare } : {}),
    ...(vh.length > 0 ? { vardnadshavare: vh } : {}),
    ...(start !== undefined && (till.startDatum !== undefined && fran.startDatum !== undefined) ? { startDatum: start } : {}),
    ...(slut !== undefined ? { slutDatum: slut } : {}),
    ...(aktiv ? {} : { aktiv: false }),
  };

  const ut: Struktur = {
    ...s,
    elever: s.elever.filter((e) => e.id !== franId).map((e) => (e.id === tillId ? ny : e)),
    ...(s.resultat !== undefined ? { resultat } : {}),
    ...(s.sittplatser !== undefined ? {
      sittplatser: s.sittplatser.map((x) => ({ ...x, platser: x.platser.map((p) => (p.elevId === franId ? { ...p, elevId: tillId } : p)) })),
    } : {}),
  };
  return { s: ut, flyttade, dubbletter };
}

// ── Del 180 · Dubbletter på grund av mellannamn ─────────────────────────────

export interface Dubblett { /** Posten som slås ihop (det kortare namnet). */ fran: Elev; /** Posten som behålls (namnet med mellannamn). */ till: Elev }

/** Elever i klassen som är samma person med och utan mellannamn ('Alice Hultman' och 'Alice Alexandrou Hultman'). */
export function hittaDubbletter(s: Struktur, klassId: string): Dubblett[] {
  const elever = s.elever.filter((e) => e.klassId === klassId);
  const par: Dubblett[] = [];
  const tagna = new Set<string>();
  for (const a of elever) {
    if (tagna.has(a.id)) continue;
    for (const b of elever) {
      if (a.id === b.id || tagna.has(b.id) || a.namn.trim().toLowerCase() === b.namn.trim().toLowerCase()) continue;
      if (!sammaPersonUtanMellannamn(a.namn, b.namn)) continue;
      // Behåll det längre namnet (med mellannamn)
      const [fran, till] = a.namn.split(' ').length <= b.namn.split(' ').length ? [a, b] : [b, a];
      par.push({ fran, till }); tagna.add(a.id); tagna.add(b.id);
      break;
    }
  }
  return par.sort((x, y) => x.till.namn.localeCompare(y.till.namn, 'sv'));
}

/** Slår ihop alla dubbletter i klassen; resultaten flyttas till namnet med mellannamn. */
export function slaIhopDubbletter(s: Struktur, klassId: string): { s: Struktur; ihop: Array<{ fran: string; till: string; flyttade: number }> } {
  let ut = s;
  const ihop: Array<{ fran: string; till: string; flyttade: number }> = [];
  for (const d of hittaDubbletter(s, klassId)) {
    const r = slaIhopElever(ut, d.fran.id, d.till.id);
    ut = r.s; ihop.push({ fran: d.fran.namn, till: d.till.namn, flyttade: r.flyttade });
  }
  return { s: ut, ihop };
}
