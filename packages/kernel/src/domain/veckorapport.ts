/**
 * Del 194 · Veckorapporter.
 *
 *  - Varje vecka får en rapport med veckonummer: vad som hänt i varje ämne
 *    (lektioner, Exit tickets, läxförhör, Magma, DigiExam, inlämningar som
 *    förföll). Beskrivande siffror, inga orsaksförklaringar.
 *  - Rapporten blir "dags" fredag 16:00. Appen kan inte köra något av sig själv,
 *    så kärnan svarar på frågan "vilka veckor saknar rapport nu?" och studion
 *    visar ett larm med en att-göra-lista (ladda upp inlämningar i Teams, spara
 *    inlämningar från Magma och Socrative) tills rapporten är skapad och
 *    punkterna bockade.
 *  - Rapporterna sparas i strukturen (texterna fryses när rapporten skapas).
 *
 * (Ring 1, I2.)
 */
import { kortDatum } from './dashboard.js';
import { inlamningsOversikt } from './inlamningar.js';
import { tolkaMagmaNamn } from './magmaprov.js';
import { amnesPlanFor, elevIKlassen } from './struktur.js';
import { isoVecka } from './skolar.js';
import { datumText, periodText } from './samtalsperiod.js';
import type { IsoDatum, Struktur } from './typer.js';

/** Klockslaget då veckans rapport blir dags (fredag). */
export const VECKORAPPORT_TID = '16:00';

/** Standardpunkterna i att-göra-listan som hör till varje veckorapport. */
export const VECKORAPPORT_TODO: readonly string[] = [
  'Ladda upp inlämningar i Teams',
  'Spara inlämningar från Magma',
  'Spara inlämningar från Socrative',
];

export interface Vecka { ar: number; vecka: number; /** Måndag. */ fran: IsoDatum; /** Fredag. */ till: IsoDatum }
export interface VeckorapportTodo { id: string; text: string; klar: boolean }
export interface VeckorapportAmne { amneId: string; amne: string; klassNamn: string; text: string }
export interface Veckorapport extends Vecka {
  id: string;
  /** När rapporten skapades (datum + klockslag, svensk tid). */
  skapad: string;
  amnen: VeckorapportAmne[];
  todo: VeckorapportTodo[];
}

const DYGN = 86400000;
const plusDagar = (datum: IsoDatum, n: number): IsoDatum => new Date(new Date(`${datum}T00:00:00Z`).getTime() + n * DYGN).toISOString().slice(0, 10);
const veckodag = (datum: IsoDatum): number => (new Date(`${datum}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = måndag

/** Veckan (ISO) som datumet ligger i: år, veckonummer, måndag och fredag. */
export function veckaFor(datum: IsoDatum): Vecka {
  const fran = plusDagar(datum, -veckodag(datum));
  const torsdag = plusDagar(fran, 3);
  return { ar: Number(torsdag.slice(0, 4)), vecka: isoVecka(datum), fran, till: plusDagar(fran, 4) };
}

export function veckaEtikett(v: Pick<Vecka, 'vecka'>): string { return `v.${v.vecka}`; }

/** "v.41 (5–9 oktober 2026)". */
export function veckaText(v: Vecka): string {
  const [, fm, fd] = v.fran.split('-').map(Number);
  const [, tm] = v.till.split('-').map(Number);
  return fm === tm ? `v.${v.vecka} (${fd}–${datumText(v.till)})` : `v.${v.vecka} (${periodText(v)})`;
}

/** Nu: datum och klockslag i svensk tid. */
export interface Tidpunkt { datum: IsoDatum; tid: string }

/** Har fredagens klockslag passerat för veckan? */
export function veckanArDags(v: Pick<Vecka, 'till'>, nu: Tidpunkt): boolean {
  return v.till < nu.datum || (v.till === nu.datum && nu.tid >= VECKORAPPORT_TID);
}

/** Rapporten för en vecka, om den finns. */
export function veckorapportFor(s: Struktur, v: Pick<Vecka, 'ar' | 'vecka'>): Veckorapport | undefined {
  return (s.veckorapporter ?? []).find((r) => r.ar === v.ar && r.vecka === v.vecka);
}

/** Alla rapporter, senaste veckan först. */
export function veckorapporter(s: Struktur): Veckorapport[] {
  return [...(s.veckorapporter ?? [])].sort((a, b) => b.fran.localeCompare(a.fran));
}

/** Ämnen som har en planerad lektion i veckan — en vecka utan lektioner (lov) får ingen rapport. */
function amnenMedLektioner(s: Struktur, v: Vecka): string[] {
  return s.amnen.filter((a) => lektionerIVeckan(s, a.id, v).length > 0).map((a) => a.id);
}

function lektionerIVeckan(s: Struktur, amneId: string, v: Vecka): Array<{ datum: IsoDatum; avsnitt: string }> {
  let plan: ReturnType<typeof amnesPlanFor> = null;
  try { plan = amnesPlanFor(s, amneId, v.till, false); } catch { plan = null; }
  if (plan === null) return [];
  const sett = new Set<string>();
  const ut: Array<{ datum: IsoDatum; avsnitt: string }> = [];
  for (const r of [...plan.a, ...plan.b]) {
    if (r.datum === null || r.datum < v.fran || r.datum > v.till) continue;
    const nyckel = `${r.datum}|${r.lektion.avsnitt}`;
    if (sett.has(nyckel)) continue;
    sett.add(nyckel); ut.push({ datum: r.datum, avsnitt: r.lektion.avsnitt });
  }
  return ut.sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Veckor som är dags (fredag 16:00 har passerat) men saknar rapport, från skolårets start till nu.
 * Veckor utan planerade lektioner i något ämne (lov) räknas inte. Äldsta först.
 */
export function veckorUtanRapport(s: Struktur, nu: Tidpunkt): Vecka[] {
  const start = [...s.skolar].map((x) => x.start).sort()[0];
  if (start === undefined) return [];
  const ut: Vecka[] = [];
  for (let v = veckaFor(start); veckanArDags(v, nu); v = veckaFor(plusDagar(v.fran, 7))) {
    if (veckorapportFor(s, v) !== undefined) continue;
    if (amnenMedLektioner(s, v).length === 0) continue;
    ut.push(v);
  }
  return ut;
}

export interface VeckorapportLarm {
  /** Veckor som är dags men saknar rapport, äldsta först. */
  saknade: Vecka[];
  /** Rapporter där att-göra-listan inte är klar, senaste först. */
  oklara: Veckorapport[];
}

/** Larmet: veckor utan rapport och rapporter med obockade punkter. Tomt larm = inget att göra. */
export function veckorapportLarm(s: Struktur, nu: Tidpunkt): VeckorapportLarm {
  return { saknade: veckorUtanRapport(s, nu), oklara: veckorapporter(s).filter((r) => r.todo.some((t) => !t.klar)) };
}

const pct = (poang: number, max: number) => (max === 0 ? 0 : Math.round((poang / max) * 100));
const kort = (datum: IsoDatum) => kortDatum(datum);

/** Veckans text för ett ämne — beskrivande siffror, inga orsaksförklaringar. */
export function veckorapportText(s: Struktur, amneId: string, v: Vecka): string {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) return '';
  const elever = s.elever.filter((e) => e.klassId === amne.klassId && elevIKlassen(e, v.till));
  const antalElever = elever.length;
  const rader: string[] = [];
  const lektioner = lektionerIVeckan(s, amneId, v);
  rader.push(lektioner.length === 0 ? 'Lektioner: inga planerade.' : `Lektioner: ${lektioner.length} — ${lektioner.map((l) => `${kort(l.datum)} ${l.avsnitt}`).join(', ')}.`);

  const res = (s.resultat ?? []).filter((r) => r.amneId === amneId && r.datum >= v.fran && r.datum <= v.till);
  const typAv = (r: (typeof res)[number]) => r.inkluderadSom ?? r.kalla;
  const perProv = (typ: string) => {
    const grupper = new Map<string, { datum: string; prov: string; sum: number; n: number }>();
    for (const r of res) {
      if (typAv(r) !== typ) continue;
      const nyckel = `${r.datum}|${r.prov}`;
      const g = grupper.get(nyckel) ?? { datum: r.datum, prov: r.prov, sum: 0, n: 0 };
      g.sum += pct(r.poang, r.maxPoang); g.n += 1; grupper.set(nyckel, g);
    }
    return [...grupper.values()].sort((a, b) => a.datum.localeCompare(b.datum));
  };
  const provRad = (etikett: string, typ: string) => {
    const lista = perProv(typ);
    if (lista.length === 0) return;
    rader.push(`${etikett}: ${lista.map((g) => `${g.prov} (${kort(g.datum)}) snitt ${Math.round(g.sum / g.n)} %, ${g.n}${antalElever > 0 ? ` av ${antalElever}` : ''} elever`).join('; ')}.`);
  };
  provRad('Exit tickets', 'socrative-exit');
  provRad('Läxförhör', 'socrative-laxforhor');
  // Magma: diagnoser och screening (förhör i Magma räknas redan ovan via inkluderadSom)
  const magma = perProv('magma').filter((g) => { const t = tolkaMagmaNamn(g.prov).typ; return t === 'diagnos' || t === 'screening'; });
  if (magma.length > 0) rader.push(`Magma: ${magma.map((g) => `${g.prov} (${kort(g.datum)}) snitt ${Math.round(g.sum / g.n)} %, ${g.n}${antalElever > 0 ? ` av ${antalElever}` : ''} elever`).join('; ')}.`);
  const digi = (s.resultat ?? []).filter((r) => r.amneId === amneId && r.kalla === 'digiexam' && r.datum >= v.fran && r.datum <= v.till);
  if (digi.length > 0) {
    const prov = [...new Set(digi.map((r) => r.prov))];
    rader.push(`DigiExam: ${prov.map((p) => { const mina = digi.filter((r) => r.prov === p); return `${p} (${kort(mina[0].datum)}) ${mina.length}${antalElever > 0 ? ` av ${antalElever}` : ''} elever skrev`; }).join('; ')}.`);
  }
  // Inlämningar som förföll i veckan
  const o = inlamningsOversikt(s, amne.klassId, amneId, v.till);
  const forfoll = o.forfallna.filter((u) => u.forfallo >= v.fran && u.forfallo <= v.till);
  if (forfoll.length > 0) rader.push(`Inlämningar som förföll: ${forfoll.map((u) => `${u.uppgift} (${kort(u.forfallo)}) ${u.inlamnade + u.sena} av ${u.antal} inlämnade`).join('; ')}.`);
  return rader.join('\n');
}

/**
 * Skapar veckans rapport: en text per ämne som hade lektioner (alla klasser) och att-göra-listan.
 * Kastar om veckan redan har en rapport.
 */
export function skapaVeckorapport(s: Struktur, v: Vecka, nu: Tidpunkt): { s: Struktur; rapport: Veckorapport } {
  if (veckorapportFor(s, v) !== undefined) throw new Error(`Veckorapporten för ${veckaEtikett(v)} finns redan.`);
  const amnen = amnenMedLektioner(s, v).map((id) => {
    const a = s.amnen.find((x) => x.id === id)!;
    const klass = s.klasser.find((k) => k.id === a.klassId);
    return { amneId: id, amne: a.namn, klassNamn: klass?.namn ?? '', text: veckorapportText(s, id, v) };
  }).sort((a, b) => a.klassNamn.localeCompare(b.klassNamn, 'sv') || a.amne.localeCompare(b.amne, 'sv'));
  const rapport: Veckorapport = {
    ...v, id: `vr-${v.ar}-${v.vecka}`, skapad: `${nu.datum} ${nu.tid}`, amnen,
    todo: VECKORAPPORT_TODO.map((text, i) => ({ id: `t${i + 1}`, text, klar: false })),
  };
  return { s: { ...s, veckorapporter: [...(s.veckorapporter ?? []), rapport] }, rapport };
}

/** Bockar av (eller av-bockar) en punkt i rapportens att-göra-lista. */
export function sattVeckorapportTodo(s: Struktur, rapportId: string, todoId: string, klar: boolean): Struktur {
  const lista = (s.veckorapporter ?? []).map((r) => (r.id !== rapportId ? r : { ...r, todo: r.todo.map((t) => (t.id === todoId ? { ...t, klar } : t)) }));
  return { ...s, veckorapporter: lista };
}

/** Tar bort en rapport (den kan skapas igen). */
export function taBortVeckorapport(s: Struktur, rapportId: string): Struktur {
  const kvar = (s.veckorapporter ?? []).filter((r) => r.id !== rapportId);
  const { veckorapporter: _v, ...rest } = s; void _v;
  return kvar.length > 0 ? { ...rest, veckorapporter: kvar } : rest;
}
