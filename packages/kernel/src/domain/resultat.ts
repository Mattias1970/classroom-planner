/**
 * SuperTeach · Resultat — ren domänlogik (Ring 1, I2: ingen fetch/DOM/lagring).
 *
 * Tar emot NORMALISERADE rader (namn + poäng) från valfri källa — Socrative-
 * export (xlsx), Magma-resultat (xlsx), DigiExam — och matchar dem mot
 * klassens elever. Själva filparsningen sker i UI-lagret (adaptrar);
 * här bor matchning, krav och sammanställning.
 *
 * BAM-kraven: läxförhör ≥ 90 %, exit ticket ≥ 70 %. Magma/DigiExam har inget
 * fast krav — de bedöms i sitt sammanhang.
 */
import type { Elev, Struktur } from './typer.js';
import { nyttId } from './struktur.js';

export type ResultatKalla = 'socrative-laxforhor' | 'socrative-exit' | 'magma' | 'digiexam';

/** Ett provresultat för en elev — alltid kopplat till en matchad elev. */
export interface Resultat {
  id: string;
  elevId: string;
  /** Ämnet resultatet hör till (valfritt — quiz kan vara ämnesöverskridande). */
  amneId?: string;
  kalla: ResultatKalla;
  /** Quiz-/testnamn, t.ex. 'Quiz 1.1a', 'Biologi612' eller Magma-testets namn. */
  prov: string;
  /** ISO-datum (YYYY-MM-DD) när provet genomfördes. */
  datum: string;
  poang: number;
  maxPoang: number;
}

/** En rad ur en resultatfil, före elevmatchning. */
export interface ImportRad { namn: string; poang: number; maxPoang: number; }

export interface ImportUnderlag {
  klassId: string;
  kalla: ResultatKalla;
  prov: string;
  datum: string;
  amneId?: string;
  rader: ImportRad[];
}

export interface ImportUtfall {
  s: Struktur;
  /** Antal rader som matchades mot en elev. */
  traffar: number;
  /** Namn som inte kunde matchas — visas för läraren för manuell hantering. */
  omatchade: string[];
}

/** BAM-kravet för en källa i procent, eller null när inget fast krav finns. */
export function kravFor(kalla: ResultatKalla): number | null {
  if (kalla === 'socrative-laxforhor') return 90;
  if (kalla === 'socrative-exit') return 70;
  return null;
}

/** Resultatets procent (0–100, avrundad till heltal); null vid maxPoang 0. */
export function resultatProcent(r: Pick<Resultat, 'poang' | 'maxPoang'>): number | null {
  if (r.maxPoang <= 0) return null;
  return Math.round((r.poang / r.maxPoang) * 100);
}

/** true/false mot källans BAM-krav; null när källan saknar krav eller procent saknas. */
export function klaratKrav(r: Pick<Resultat, 'poang' | 'maxPoang' | 'kalla'>): boolean | null {
  const krav = kravFor(r.kalla);
  const pct = resultatProcent(r);
  if (krav === null || pct === null) return null;
  return pct >= krav;
}

/** Normaliserar ett elevnamn för matchning: gemener, enkla mellanslag, utan kommatecken. */
function normalisera(namn: string): string {
  return namn.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Ordningsoberoende nyckel: 'Anna Berg', 'Berg, Anna' och 'BERG anna' blir samma. */
function namnNyckel(namn: string): string {
  return normalisera(namn).split(' ').sort().join(' ');
}

/**
 * Matchar ett namn ur en resultatfil mot klassens elever.
 * Exakt (normaliserad) träff vinner; annars ordningsoberoende ('Efternamn, Förnamn');
 * annars entydig förnamnsträff (Socrative låter elever skriva bara förnamn).
 */
export function matchaElev(s: Struktur, klassId: string, namn: string): Elev | null {
  const elever = s.elever.filter((e) => e.klassId === klassId);
  const mal = normalisera(namn);
  const exakt = elever.find((e) => normalisera(e.namn) === mal);
  if (exakt) return exakt;
  const nyckel = namnNyckel(namn);
  const flippad = elever.filter((e) => namnNyckel(e.namn) === nyckel);
  if (flippad.length === 1) return flippad[0];
  const fornamn = elever.filter((e) => normalisera(e.namn).split(' ')[0] === mal);
  if (fornamn.length === 1) return fornamn[0];
  return null;
}

/**
 * Importerar en resultatomgång. Matchade rader blir Resultat på strukturen;
 * en ny import av samma (elev, källa, prov) ERSÄTTER det gamla resultatet
 * (omkörningar och rättade filer skriver inte dubbletter). Omatchade namn
 * returneras för manuell hantering — de tystas aldrig bort.
 */
export function importeraResultat(s: Struktur, u: ImportUnderlag): ImportUtfall {
  if (!s.klasser.some((k) => k.id === u.klassId)) throw new Error('Okänd klass.');
  if (u.amneId !== undefined && !s.amnen.some((a) => a.id === u.amneId && a.klassId === u.klassId)) {
    throw new Error('Okänt ämne för klassen.');
  }
  if (u.prov.trim() === '') throw new Error('Provet måste ha ett namn.');
  const omatchade: string[] = [];
  const nya: Resultat[] = [];
  for (const rad of u.rader) {
    const elev = matchaElev(s, u.klassId, rad.namn);
    if (elev === null) { omatchade.push(rad.namn); continue; }
    nya.push({
      id: nyttId('res'), elevId: elev.id, kalla: u.kalla, prov: u.prov.trim(),
      datum: u.datum, poang: rad.poang, maxPoang: rad.maxPoang,
      ...(u.amneId !== undefined ? { amneId: u.amneId } : {}),
    });
  }
  const ersatta = new Set(nya.map((r) => `${r.elevId}|${r.kalla}|${r.prov}`));
  const kvar = (s.resultat ?? []).filter((r) => !ersatta.has(`${r.elevId}|${r.kalla}|${r.prov}`));
  return { s: { ...s, resultat: [...kvar, ...nya] }, traffar: nya.length, omatchade };
}

/** Alla resultat för en elev, senaste datum först. */
export function resultatForElev(s: Struktur, elevId: string): Resultat[] {
  return (s.resultat ?? [])
    .filter((r) => r.elevId === elevId)
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.prov.localeCompare(b.prov));
}

export interface ProvRad { elev: Elev; resultat: Resultat | null; }

/** Klassens sammanställning för ett prov: en rad per elev (null = saknar resultat). */
export function provSammanstallning(s: Struktur, klassId: string, prov: string): ProvRad[] {
  const perElev = new Map((s.resultat ?? []).filter((r) => r.prov === prov).map((r) => [r.elevId, r]));
  return s.elever
    .filter((e) => e.klassId === klassId)
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
    .map((elev) => ({ elev, resultat: perElev.get(elev.id) ?? null }));
}

/** Alla provnamn som förekommer för en klass, i bokstavsordning per källa. */
export function provLista(s: Struktur, klassId: string): Array<{ kalla: ResultatKalla; prov: string }> {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === klassId).map((e) => e.id));
  const set = new Map<string, { kalla: ResultatKalla; prov: string }>();
  for (const r of s.resultat ?? []) {
    if (elevIds.has(r.elevId)) set.set(`${r.kalla}|${r.prov}`, { kalla: r.kalla, prov: r.prov });
  }
  return [...set.values()].sort((a, b) => a.kalla.localeCompare(b.kalla) || a.prov.localeCompare(b.prov, 'sv'));
}

// ── Aggregering: ämnesvis och över alla aktuella ämnen, med källfilter ──

/** Filter för resultatvyer: ämne och/eller källor (Exit, Läxförhör, Magma, DigiExam). */
export interface ResultatFilter { amneId?: string; kallor?: ResultatKalla[]; }

function matcharFilter(r: Resultat, f: ResultatFilter | undefined): boolean {
  if (f?.amneId !== undefined && r.amneId !== f.amneId) return false;
  if (f?.kallor !== undefined && f.kallor.length > 0 && !f.kallor.includes(r.kalla)) return false;
  return true;
}

/** Alla resultat som matchar filtret, senaste datum först. */
export function filtreraResultat(s: Struktur, f?: ResultatFilter): Resultat[] {
  return (s.resultat ?? [])
    .filter((r) => matcharFilter(r, f))
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.prov.localeCompare(b.prov, 'sv'));
}

/** Sammandrag för en källa: antal prov, snittprocent och klarade krav. */
export interface KallAggregat {
  kalla: ResultatKalla;
  antal: number;
  /** Snitt av resultatens procent; null när inget resultat har maxpoäng. */
  snittProcent: number | null;
  /** Antal som klarade källans BAM-krav (endast källor med krav). */
  klarade: number;
  /** Antal resultat som kunde bedömas mot kravet. */
  medKrav: number;
}

const ALLA_KALLOR: ResultatKalla[] = ['socrative-laxforhor', 'socrative-exit', 'magma', 'digiexam'];

function aggregera(resultat: Resultat[]): KallAggregat[] {
  return ALLA_KALLOR.map((kalla) => {
    const rs = resultat.filter((r) => r.kalla === kalla);
    const procenten = rs.map(resultatProcent).filter((p): p is number => p !== null);
    const bedomda = rs.map(klaratKrav).filter((k): k is boolean => k !== null);
    return {
      kalla,
      antal: rs.length,
      snittProcent: procenten.length > 0 ? Math.round(procenten.reduce((a, b) => a + b, 0) / procenten.length) : null,
      klarade: bedomda.filter(Boolean).length,
      medKrav: bedomda.length,
    };
  }).filter((a) => a.antal > 0);
}

/** En elevs sammandrag per källa, valfritt begränsat till ett ämne/källor. */
export function aggregatForElev(s: Struktur, elevId: string, f?: ResultatFilter): KallAggregat[] {
  return aggregera((s.resultat ?? []).filter((r) => r.elevId === elevId && matcharFilter(r, f)));
}

/** En rad per elev i en översikt: sammandrag per källa + totalsnitt. */
export interface ElevAggregatRad {
  elev: Elev;
  perKalla: KallAggregat[];
  snittProcent: number | null;
}

function oversiktFor(s: Struktur, elever: Elev[], f: ResultatFilter | undefined): ElevAggregatRad[] {
  return elever
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
    .map((elev) => {
      const rs = (s.resultat ?? []).filter((r) => r.elevId === elev.id && matcharFilter(r, f));
      const procenten = rs.map(resultatProcent).filter((p): p is number => p !== null);
      return {
        elev,
        perKalla: aggregera(rs),
        snittProcent: procenten.length > 0 ? Math.round(procenten.reduce((a, b) => a + b, 0) / procenten.length) : null,
      };
    });
}

/** Ämnesvis översikt: klassens elever × källor för ETT ämne. */
export function amnesOversikt(s: Struktur, amneId: string, kallor?: ResultatKalla[]): ElevAggregatRad[] {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (!amne) throw new Error('Okänt ämne.');
  const elever = s.elever.filter((e) => e.klassId === amne.klassId);
  return oversiktFor(s, elever, { amneId, ...(kallor !== undefined ? { kallor } : {}) });
}

/** Aggregerad översikt över ALLA aktuella ämnen för en klass, med källfilter. */
export function klassOversikt(s: Struktur, klassId: string, f?: ResultatFilter): ElevAggregatRad[] {
  return oversiktFor(s, s.elever.filter((e) => e.klassId === klassId), f);
}
