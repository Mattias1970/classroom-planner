/**
 * Del 157 · Sätt ihop planering — lektionskort ur olika planeringar och böcker (Ring 1, I2).
 *
 * Läraren öppnar två källor sida vid sida (vilken planering som helst — även andra
 * klassers — eller en bok ur biblioteket), väljer lektionskort, t.ex. de fem första ur
 * den ena och fyra ur den andra, och sparar följden som en namngiven sammansatt
 * planering (med versioner). Korten bär en kopia av källans detaljplanering.
 *
 * Den sammansatta planeringen kopplas sedan till ett ämne från ett datum: den läggs
 * på ämnets teoripass från och med datumet (aldrig bakåt — genomfört rörs inte), och
 * därefter fortsätter ämnets egen bok med nästa rad som inte redan finns bland korten.
 * Kopplingen blir en ny planeringsversion; den tidigare arkiveras och kan återställas.
 */
import { laggIn, type SparLage } from './sparat.js';
import {
  amnesPlanFor, hamtaLektionsplan, kopplaOmLektionsplaner, nyttId, planeringsRader, registreraPlanering,
} from './struktur.js';
import type { Bok, Lektion, LektionsPlan, SammansattLektion, SammansattPlanering, Struktur } from './typer.js';

export const SAMMANSATT_SCHEMA = 'classroom-planner-sammansatt' as const;

/** En källa att hämta lektionskort ur. */
export type Kalla = { typ: 'amne'; amneId: string } | { typ: 'bok'; bokId: string };

export interface KallVal { kalla: Kalla; namn: string; grupp: 'Planeringar' | 'Böcker' }

/** Ett lektionskort i en källa. */
export interface KallLektion {
  /** Position i källan (0-baserad). */
  index: number;
  bokId: string;
  kapitel: number;
  kapitelNamn: string;
  /** Kapitlets färg ur boken. */
  farg: string;
  nyckel: string;
  lektion: Lektion;
  /** Datum och vecka i källplaneringen (null för en bok eller en lektion som inte ryms). */
  datum: string | null;
  vecka: number | null;
  /** Källplaneringens detaljplanering för lektionen, om någon. */
  plan: Omit<LektionsPlan, 'id' | 'amneId' | 'lektionsIndex'> | null;
  kallaNamn: string;
}

export function kallNyckel(k: Kalla): string { return k.typ === 'amne' ? `amne:${k.amneId}` : `bok:${k.bokId}`; }
export function kallaUrNyckel(n: string): Kalla | null {
  if (n.startsWith('amne:')) return { typ: 'amne', amneId: n.slice(5) };
  if (n.startsWith('bok:')) return { typ: 'bok', bokId: n.slice(4) };
  return null;
}

/** Alla källor: ämnen med planering (klass · ämne · bok) och böckerna i biblioteket. */
export function kallor(s: Struktur): KallVal[] {
  const planeringar: KallVal[] = s.planeringar
    .map((p) => ({ p, a: s.amnen.find((x) => x.id === p.amneId) }))
    .filter((x) => x.a !== undefined)
    .map(({ p, a }) => ({ kalla: { typ: 'amne' as const, amneId: a!.id }, namn: kallNamnAmne(s, a!.id, p.bokId), grupp: 'Planeringar' as const }))
    .sort((x, y) => x.namn.localeCompare(y.namn, 'sv'));
  const bocker: KallVal[] = s.bocker
    .filter((b) => !b.id.startsWith('fri-'))
    .map((b) => ({ kalla: { typ: 'bok' as const, bokId: b.id }, namn: `${b.titel}${b.arskurs > 0 ? ` (åk ${b.arskurs})` : ''}`, grupp: 'Böcker' as const }))
    .sort((x, y) => x.namn.localeCompare(y.namn, 'sv'));
  return [...planeringar, ...bocker];
}

function kallNamnAmne(s: Struktur, amneId: string, bokId?: string): string {
  const a = s.amnen.find((x) => x.id === amneId);
  const k = s.klasser.find((x) => x.id === a?.klassId);
  const b = s.bocker.find((x) => x.id === (bokId ?? s.planeringar.find((p) => p.amneId === amneId)?.bokId ?? a?.bokId));
  return `${k?.namn ?? ''} ${a?.namn ?? ''}${b !== undefined ? ` · ${b.titel}` : ''}`.trim();
}

export function kallaNamn(s: Struktur, k: Kalla): string {
  if (k.typ === 'amne') return kallNamnAmne(s, k.amneId);
  return s.bocker.find((b) => b.id === k.bokId)?.titel ?? k.bokId;
}

function kapitelInfo(bok: Bok | undefined, nr: number): { namn: string; farg: string } {
  const k = bok?.kapitel.find((x) => x.nr === nr);
  return { namn: k?.namn ?? `Kapitel ${nr}`, farg: k?.farg ?? '#5c6b7a' };
}

function utanPosition(p: LektionsPlan | null): KallLektion['plan'] {
  if (p === null) return null;
  const { id: _i, amneId: _a, lektionsIndex: _l, ...rest } = p;
  void _i; void _a; void _l;
  return JSON.parse(JSON.stringify(rest)) as KallLektion['plan'];
}

/** Lektionskorten i en källa: planeringens lektioner i ordning (med datum) eller bokens rader. */
export function kallLektioner(s: Struktur, k: Kalla, idag?: string): KallLektion[] {
  const namn = kallaNamn(s, k);
  if (k.typ === 'bok') {
    const bok = s.bocker.find((b) => b.id === k.bokId);
    if (bok === undefined) return [];
    return planeringsRader(bok, {}).map((r, index) => {
      const ki = kapitelInfo(bok, r.kapitel);
      return { index, bokId: bok.id, kapitel: r.kapitel, kapitelNamn: ki.namn, farg: ki.farg, nyckel: r.nyckel, lektion: r.lektion, datum: null, vecka: null, plan: null, kallaNamn: namn };
    });
  }
  const bokId = s.planeringar.find((p) => p.amneId === k.amneId)?.bokId ?? s.amnen.find((a) => a.id === k.amneId)?.bokId;
  const bok = s.bocker.find((b) => b.id === bokId);
  if (bok === undefined) return [];
  const plan = amnesPlanFor(s, k.amneId, idag)?.a ?? [];
  return plan.map((p, index) => {
    const ki = kapitelInfo(bok, p.kapitel);
    return {
      index, bokId: bok.id, kapitel: p.kapitel, kapitelNamn: ki.namn, farg: ki.farg, nyckel: p.nyckel ?? `${p.kapitel}:${p.lektion.id}`,
      lektion: p.lektion, datum: p.datum, vecka: p.vecka, plan: utanPosition(hamtaLektionsplan(s, k.amneId, index)), kallaNamn: namn,
    };
  });
}

/** Ett källkort som kort i den sammansatta planeringen (kopia — originalet påverkas aldrig). */
export function tillSammansatt(k: KallLektion): SammansattLektion {
  return JSON.parse(JSON.stringify({
    bokId: k.bokId, kapitel: k.kapitel, nyckel: k.nyckel, lektion: k.lektion, kalla: k.kallaNamn, ...(k.plan !== null ? { plan: k.plan } : {}),
  })) as SammansattLektion;
}

/** Sparar följden som en sammansatt planering: nytt namn, ny version eller ersätt. */
export function sparaSammansatt(s: Struktur, lektioner: SammansattLektion[], lage: SparLage, sparad: string): { s: Struktur; id: string } {
  if (lektioner.length === 0) throw new Error('Lägg till minst ett lektionskort först.');
  const id = nyttId('sam');
  const post: SammansattPlanering = { schema: SAMMANSATT_SCHEMA, schemaVersion: 1, id, namn: '', version: 0, sparad, lektioner: JSON.parse(JSON.stringify(lektioner)) as SammansattLektion[] };
  const lista = laggIn(s.sammansattaPlaneringar ?? [], post, lage);
  const sparat = lage.typ === 'ersatt' ? lage.id : id;
  return { s: { ...s, sammansattaPlaneringar: lista }, id: sparat };
}

export function taBortSammansatt(s: Struktur, id: string): Struktur {
  return { ...s, sammansattaPlaneringar: (s.sammansattaPlaneringar ?? []).filter((x) => x.id !== id) };
}

/** Första passet i ämnets plan på eller efter `idag` (standard för "från"). */
export function forstaKommandePass(s: Struktur, amneId: string, idag: string): string | null {
  const plan = amnesPlanFor(s, amneId, idag, false)?.a ?? [];
  return plan.map((p) => p.datum).filter((d): d is string => d !== null && d >= idag).sort()[0] ?? null;
}

/**
 * Kopplar en sammansatt planering till ett ämne från `fran` (tidigast idag och efter
 * ett eventuellt facit). Ny planeringsversion — den aktiva arkiveras; facit följer med.
 * Korten får sina kopierade detaljplaneringar; övriga lektionsplaner följer sina lektioner.
 */
export function kopplaSammansatt(s: Struktur, sammansattId: string, amneId: string, fran: string, idag: string, skapad: string): { s: Struktur; fran: string } {
  const post = (s.sammansattaPlaneringar ?? []).find((x) => x.id === sammansattId);
  if (post === undefined) throw new Error('Okänd sammansatt planering.');
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  const aktiv = s.planeringar.find((p) => p.amneId === amneId);
  const bokId = aktiv?.bokId ?? amne.bokId;
  if (bokId === undefined) throw new Error('Ämnet saknar bok — välj en bok för ämnet först.');
  const saknas = [...new Set(post.lektioner.map((l) => l.bokId))].filter((b) => !s.bocker.some((x) => x.id === b));
  if (saknas.length > 0) throw new Error(`Böcker saknas i biblioteket: ${saknas.join(', ')} — hämta böcker från datarepot först.`);
  const franRatt = [fran, idag, aktiv?.genomfort?.till ?? ''].sort().reverse()[0];

  const fore = amnesPlanFor(s, amneId, idag, false)?.a ?? [];
  let ut = registreraPlanering(s, {
    id: nyttId('pl'), amneId, bokId, skapad,
    ...(aktiv?.genomfort !== undefined ? { genomfort: aktiv.genomfort } : {}),
    sammansatt: { namn: post.namn, version: post.version, fran: franRatt, lektioner: JSON.parse(JSON.stringify(post.lektioner)) as SammansattLektion[] },
  });
  const efter = amnesPlanFor(ut, amneId, idag, false)?.a ?? [];
  ut = kopplaOmLektionsplaner(ut, amneId, fore, efter);
  // Kortens kopierade detaljplaneringar på sina nya platser
  const nya: LektionsPlan[] = [];
  efter.forEach((p, i) => {
    const m = /^ko:(\d+)$/.exec(p.nyckel ?? '');
    const kort = m === null ? undefined : post.lektioner[Number(m[1])];
    if (kort?.plan !== undefined) nya.push({ ...JSON.parse(JSON.stringify(kort.plan)) as LektionsPlan, id: nyttId('lp'), amneId, lektionsIndex: i });
  });
  const platser = new Set(nya.map((p) => p.lektionsIndex));
  ut = { ...ut, lektionsplaner: [...ut.lektionsplaner.filter((p) => !(p.amneId === amneId && platser.has(p.lektionsIndex))), ...nya] };
  return { s: ut, fran: franRatt };
}

/** Tar bort den sammansatta följden från ämnet (ny version utan följd — den gamla arkiveras). */
export function kopplaLossSammansatt(s: Struktur, amneId: string, idag: string, skapad: string): Struktur {
  const aktiv = s.planeringar.find((p) => p.amneId === amneId);
  if (aktiv?.sammansatt === undefined) return s;
  const fore = amnesPlanFor(s, amneId, idag, false)?.a ?? [];
  const { sammansatt: _bort, id: _id, version: _v, namn: _n, ...rest } = aktiv;
  void _bort; void _id; void _v; void _n;
  const ut = registreraPlanering(s, { ...rest, id: nyttId('pl'), skapad });
  return kopplaOmLektionsplaner(ut, amneId, fore, amnesPlanFor(ut, amneId, idag, false)?.a ?? []);
}
