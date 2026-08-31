/**
 * Kalender (v2): lägger ut ett skolårs alla planeringar på datum och bygger
 * rutnät för månads-, vecko-, termins- och läsårsvyer. Ren kärna: tar en
 * struktur och ett skolår, returnerar datum→händelser och månadsrutor med
 * lov/temadags-markeringar. Ingen presentation.
 */
import { amneBakgrund } from './amnen.js';
import { isoVecka } from './skolar.js';
import { noBudget, samlaSlots, skapaPlanering } from './struktur.js';
import type { IsoDatum, Skolar, Struktur } from './typer.js';

export interface KalenderHandelse {
  datum: IsoDatum;
  start: string;
  slut: string;
  klassId: string;
  klassNamn: string;
  amnesNamn: string;
  grupp?: 'A' | 'B';
  kapitel: number;
  kapitelFarg: string;
  /** Bakgrundsfärg i kalendern (per ämne). */
  amnesFarg: string;
  avsnitt: string;
  vecka: number;
  /** Koppling till planeringen — klick i kalendern öppnar lektionssidan. */
  amneId?: string;
  lektionsIndex?: number;
}

export interface KalenderDagRuta {
  datum: IsoDatum;
  dag: number;          // 1=mån … 7=sön
  iManad: boolean;      // hör datumet till den visade månaden?
  helg: boolean;
  ledig: string | null; // etikett för lov/röd dag/temadag (heldag)
  halvdag: string | null;
  handelser: KalenderHandelse[];
}

function addDays(iso: IsoDatum, n: number): IsoDatum {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function veckodag(iso: IsoDatum): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Alla lektionshändelser i skolåret, per klass (och grupp för halvklass),
 * ur varje ämnes registrerade planering. Sorterade på datum + starttid.
 */
export function kalenderHandelser(s: Struktur, skolarId: string): KalenderHandelse[] {
  const skolar = s.skolar.find((x) => x.id === skolarId);
  if (!skolar) return [];
  const ut: KalenderHandelse[] = [];
  for (const plan of s.planeringar) {
    const amne = s.amnen.find((a) => a.id === plan.amneId);
    if (!amne) continue;
    const klass = s.klasser.find((k) => k.id === amne.klassId);
    if (!klass) continue;
    const tjanst = s.tjanster.find((t) => t.id === klass.tjanstId);
    if (!tjanst || tjanst.skolarId !== skolarId) continue;
    const bok = s.bocker.find((b) => b.id === plan.bokId);
    if (!bok) continue;
    const farg = (kap: number) => bok.kapitel.find((k) => k.nr === kap)?.farg ?? '#5c6b7a';
    const amnesFarg = amneBakgrund(amne.namn);
    // NO+Tk: delämnet börjar efter föregående delämnens block (offset).
    const offset = amne.noGrupp !== undefined && amne.noOrder !== undefined
      ? amne.noOrder * noBudget(skolar, amne.schema) : 0;
    const grupper: Array<{ grupp?: 'A' | 'B'; schema: typeof amne.schema }> = amne.halvklass === true
      ? [{ grupp: 'A', schema: amne.schema }, { grupp: 'B', schema: amne.schemaB ?? [] }]
      : [{ grupp: undefined, schema: amne.schema }];
    for (const g of grupper) {
      for (const [lektionsIndex, p] of skapaPlanering(skolar, g.schema, bok, offset, amne.egnaRader ?? []).entries()) {
        if (p.datum === null || p.start === null || p.slutTid === null || p.vecka === null) continue;
        ut.push({
          datum: p.datum, start: p.start, slut: p.slutTid,
          klassId: klass.id, klassNamn: klass.namn, amnesNamn: amne.namn, grupp: g.grupp,
          kapitel: p.kapitel, kapitelFarg: farg(p.kapitel), amnesFarg, avsnitt: p.lektion.avsnitt, vecka: p.vecka,
          amneId: amne.id, lektionsIndex,
        });
      }
    }
  }
  // Stödpass (t.ex. Ma/NO-stöd): tjänstens öppna veckotider, utan klass och kapitel.
  for (const tjanst of s.tjanster.filter((t) => t.skolarId === skolarId)) {
    for (const sp of tjanst.stodPass ?? []) {
      for (const slot of samlaSlots(skolar, [sp])) {
        ut.push({
          datum: slot.datum, start: slot.start, slut: slot.slut,
          klassId: '', klassNamn: '', amnesNamn: sp.namn,
          kapitel: 0, kapitelFarg: '#5c6b7a', amnesFarg: '#eef1f5',
          avsnitt: `${sp.namn} — öppen stödtid`, vecka: slot.vecka,
        });
      }
    }
  }
  return ut.sort((a, b) => a.datum.localeCompare(b.datum) || a.start.localeCompare(b.start));
}

/** Grupperar händelser per datum för snabb uppslagning i rutnäten. */
export function handelserPerDatum(handelser: KalenderHandelse[]): Map<IsoDatum, KalenderHandelse[]> {
  const m = new Map<IsoDatum, KalenderHandelse[]>();
  for (const h of handelser) {
    const lista = m.get(h.datum) ?? [];
    lista.push(h); m.set(h.datum, lista);
  }
  return m;
}

function dagRuta(datum: IsoDatum, iManad: boolean, skolar: Skolar, perDatum: Map<IsoDatum, KalenderHandelse[]>): KalenderDagRuta {
  const dag = veckodag(datum);
  const egen = skolar.dagar.find((d) => d.datum === datum);
  // Röda dagar (helgdagar) markeras INTE i kalendern — bara skolans egna
  // lov, temadagar och halvdagar. (Lektioner hamnar ändå aldrig på röda dagar.)
  const ledig = (egen && egen.typ !== 'halvdag') ? egen.label : null;
  return {
    datum, dag, iManad,
    helg: dag >= 6,
    ledig,
    halvdag: egen?.typ === 'halvdag' ? `${egen.label}${egen.slut !== undefined ? ` ${egen.slut}` : ''}` : null,
    handelser: perDatum.get(datum) ?? [],
  };
}

/**
 * Månadsrutnät (måndag först) med in-/utanför-månad-markering. Alltid hela
 * veckor så rutnätet blir rektangulärt.
 */
export function manadsRutor(ar: number, manad0: number, skolar: Skolar, perDatum: Map<IsoDatum, KalenderHandelse[]>): KalenderDagRuta[] {
  const forsta = `${ar}-${String(manad0 + 1).padStart(2, '0')}-01`;
  let d = addDays(forsta, -(veckodag(forsta) - 1)); // backa till måndag
  const rutor: KalenderDagRuta[] = [];
  for (let i = 0; i < 42; i++) {
    const iManad = Number(d.slice(5, 7)) === manad0 + 1;
    rutor.push(dagRuta(d, iManad, skolar, perDatum));
    d = addDays(d, 1);
    if (i >= 34 && veckodag(d) === 1 && Number(d.slice(5, 7)) !== manad0 + 1) break;
  }
  return rutor;
}

/** Månaderna ett skolår sträcker sig över, i ordning ([år, månad0]). */
export function skolarManader(skolar: Skolar): Array<[number, number]> {
  const ut: Array<[number, number]> = [];
  let y = Number(skolar.start.slice(0, 4));
  let m = Number(skolar.start.slice(5, 7)) - 1;
  const slutY = Number(skolar.slut.slice(0, 4));
  const slutM = Number(skolar.slut.slice(5, 7)) - 1;
  while (y < slutY || (y === slutY && m <= slutM)) {
    ut.push([y, m]);
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return ut;
}

/** En veckas sju dagrutor (måndag–söndag) som innehåller datumet. */
export function veckaRutor(datum: IsoDatum, skolar: Skolar, perDatum: Map<IsoDatum, KalenderHandelse[]>): KalenderDagRuta[] {
  const mandag = addDays(datum, -(veckodag(datum) - 1));
  return Array.from({ length: 7 }, (_, i) => dagRuta(addDays(mandag, i), true, skolar, perDatum));
}

export { isoVecka };
