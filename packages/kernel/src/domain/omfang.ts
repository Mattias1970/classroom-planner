/**
 * SuperTeach · Omfång — vilket urval av resultat som analyseras.
 *
 *   'kapitel'   Läxförhören i det kapitel som är aktivt just nu (standard).
 *   'termin'    Hela terminen för valt ämne.
 *   'no-termin' Hela terminen för alla NO-ämnen i klassen (Biologi, Fysik, Kemi, Teknik).
 *   'no-lasar'  Hela läsåret för alla NO-ämnen — utvecklingen på årskursnivå.
 *   'allt'      Ingen avgränsning (allt i valt ämne/klass) — periodfältet styr.
 *
 * Omfånget översätts till ett DashboardFilter (kapitel, amneIds, datumintervall)
 * som alla kernel-funktioner redan förstår. (Ring 1, I2.)
 */
import type { DashboardFilter } from './dashboard.js';
import { koderForProv } from './delkapitelkoder.js';
import { planForAmne } from './studieguide.js';
import type { Struktur } from './typer.js';

export type Omfang = 'kapitel' | 'termin' | 'no-termin' | 'no-lasar' | 'allt';

export const OMFANG_NAMN: Record<Omfang, string> = {
  kapitel: 'Aktivt kapitel', termin: 'Hela terminen', 'no-termin': 'Alla NO-ämnen · terminen', 'no-lasar': 'Alla NO-ämnen · läsåret', allt: 'Allt',
};

/** NO-ämnena i en klass (stödämnen räknas inte). */
export function noAmnenIKlass(s: Struktur, klassId: string): string[] {
  const NO = new Set(['biologi', 'fysik', 'kemi', 'teknik']);
  return s.amnen.filter((a) => a.klassId === klassId && NO.has(a.namn.trim().toLowerCase())).map((a) => a.id);
}

/**
 * Kapitlet som är aktivt idag: kapitlet för den senaste planerade lektionen
 * till och med idag. Saknas plan: det högsta kapitel som har resultat.
 */
export function aktivtKapitel(s: Struktur, amneId: string, idag: string): number | null {
  try {
    const plan = planForAmne(s, amneId, idag).filter((p) => p.datum !== null && p.datum <= idag);
    const sista = plan[plan.length - 1];
    if (sista !== undefined) return sista.kapitel;
  } catch { /* ingen plan */ }
  let hogst: number | null = null;
  for (const r of (s.resultat ?? []).filter((x) => x.amneId === amneId)) {
    for (const kod of koderForProv(r.prov, r.rum)) {
      const n = Number(kod.split('.')[0]);
      if (Number.isFinite(n) && (hogst === null || n > hogst)) hogst = n;
    }
  }
  return hogst;
}

/** Terminens datumintervall: HT = 1 aug–31 dec, VT = 1 jan–30 jun. */
export function terminIntervall(idag: string): { fran: string; till: string; namn: string } {
  const ar = Number(idag.slice(0, 4)); const man = Number(idag.slice(5, 7));
  return man >= 7 ? { fran: `${ar}-08-01`, till: `${ar}-12-31`, namn: `HT ${ar}` } : { fran: `${ar}-01-01`, till: `${ar}-06-30`, namn: `VT ${ar}` };
}

/** Läsårets intervall ur skolåret (valt skolår, annars det som pågår) om det finns, annars aug–juni runt idag. */
export function lasarIntervall(s: Struktur, idag: string, skolarId?: string): { fran: string; till: string; namn: string } {
  const sk = (skolarId !== undefined ? s.skolar.find((x) => x.id === skolarId) : undefined)
    ?? s.skolar.find((x) => x.start <= idag && x.slut >= idag) ?? s.skolar[0];
  if (sk !== undefined) return { fran: sk.start, till: sk.slut, namn: sk.namn };
  const ar = Number(idag.slice(0, 4)); const man = Number(idag.slice(5, 7));
  const startAr = man >= 7 ? ar : ar - 1;
  return { fran: `${startAr}-08-01`, till: `${startAr + 1}-06-30`, namn: `${startAr}/${startAr + 1}` };
}

export interface OmfangResultat {
  /** Fälten att lägga på filtret. */
  filter: Pick<DashboardFilter, 'kapitel' | 'amneIds' | 'fran' | 'till'>;
  /** Läsbar etikett: 'Kap 4 · läxförhör', 'HT 2026 · Biologi', 'HT 2026 · Biologi, Fysik, Kemi'. */
  etikett: string;
  /** Kapitelnumret när omfånget är 'kapitel' (null om inget hittades). */
  kapitel: number | null;
}

/** Översätter ett omfång till filterfält + etikett. */
export function omfangFilter(s: Struktur, klassId: string, amneId: string, omfang: Omfang, idag: string): OmfangResultat {
  const amne = s.amnen.find((a) => a.id === amneId);
  const amneNamn = amne?.namn ?? 'ämnet';
  if (omfang === 'allt') return { filter: {}, etikett: amneId === '' ? 'alla ämnen' : amneNamn, kapitel: null };
  if (omfang === 'kapitel') {
    const kap = amneId === '' ? null : aktivtKapitel(s, amneId, idag);
    return { filter: kap === null ? {} : { kapitel: kap }, etikett: kap === null ? `${amneNamn} · inget aktivt kapitel` : `Kap ${kap} · ${amneNamn}`, kapitel: kap };
  }
  if (omfang === 'termin') {
    const t = terminIntervall(idag);
    return { filter: { fran: t.fran, till: t.till }, etikett: `${t.namn} · ${amneNamn}`, kapitel: null };
  }
  const ids = noAmnenIKlass(s, klassId);
  const namn = s.amnen.filter((a) => ids.includes(a.id)).map((a) => a.namn).join(', ') || 'inga NO-ämnen';
  const t = omfang === 'no-termin' ? terminIntervall(idag) : lasarIntervall(s, idag);
  return { filter: { amneIds: ids, fran: t.fran, till: t.till }, etikett: `${t.namn} · ${namn}`, kapitel: null };
}

// ── Del 150: omfång i tre delar — ämne, block och tid ──
//
//   Ämne   'kurs'  = den valda kursen (förvald: aktiv kurs)
//          'no'    = alla NO-ämnen i klassen
//          'alla'  = alla ämnen i klassen
//   Block  'aktivt' = kapitlet som pågår · ett kapitelnummer · 'alla'   (bara för en kurs)
//   Tid    'termin' · 'lasar' (valt läsår) · 'allt'
//
// Delarna kombineras fritt; perioden i veckor (v.35–43) läggs ovanpå.

export type OmfangAmnen = 'kurs' | 'no' | 'alla';
export type OmfangBlock = 'aktivt' | 'alla' | number;
export type OmfangTid = 'termin' | 'lasar' | 'allt';
export interface OmfangVal { amnen: OmfangAmnen; block: OmfangBlock; tid: OmfangTid }

/** Standard: aktiv kurs, kapitlet som pågår, läsåret. */
export const STANDARD_OMFANG: OmfangVal = { amnen: 'kurs', block: 'aktivt', tid: 'lasar' };

/** Äldre sparade omfång (Del 90-talet) översatta till de tre delarna. */
export function omfangFranGammal(o: Omfang): OmfangVal {
  switch (o) {
    case 'kapitel': return { amnen: 'kurs', block: 'aktivt', tid: 'lasar' };
    case 'termin': return { amnen: 'kurs', block: 'alla', tid: 'termin' };
    case 'no-termin': return { amnen: 'no', block: 'alla', tid: 'termin' };
    case 'no-lasar': return { amnen: 'no', block: 'alla', tid: 'lasar' };
    case 'allt': return { amnen: 'kurs', block: 'alla', tid: 'allt' };
  }
}

/**
 * Aktiv kurs i en klass: ämnet vars planering har en lektion närmast idag
 * (nästa lektion vinner över en passerad), annars ämnet med senaste resultat,
 * annars klassens första ämne. null när klassen saknar ämnen.
 */
export function aktivKurs(s: Struktur, klassId: string, idag: string): string | null {
  const amnen = s.amnen.filter((a) => a.klassId === klassId);
  if (amnen.length === 0) return null;
  const dagar = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${idag}T00:00:00Z`)) / 86_400_000);
  let bast: { id: string; avstand: number } | null = null;
  for (const a of amnen) {
    if (!s.planeringar.some((p) => p.amneId === a.id)) continue;
    let plan: ReturnType<typeof planForAmne> = [];
    try { plan = planForAmne(s, a.id, idag); } catch { continue; }
    const datum = plan.map((p) => p.datum).filter((d): d is string => d !== null);
    const nasta = datum.find((d) => d >= idag);
    const forra = [...datum].reverse().find((d) => d < idag);
    // En kommande lektion väger tyngre än en passerad (passerad = avstånd + 1000)
    const avstand = nasta !== undefined ? dagar(nasta) : forra !== undefined ? 1000 - dagar(forra) : Infinity;
    if (avstand !== Infinity && (bast === null || avstand < bast.avstand)) bast = { id: a.id, avstand };
  }
  if (bast !== null) return bast.id;
  const senast = [...(s.resultat ?? [])].filter((r) => r.amneId !== undefined && amnen.some((a) => a.id === r.amneId))
    .sort((a, b) => b.datum.localeCompare(a.datum))[0];
  return senast?.amneId ?? amnen[0].id;
}

export interface OmfangUtfall extends OmfangResultat {
  /** Ämnet dashboarden ska få ('' = inget enskilt ämne — alla eller NO via amneIds). */
  amneId: string;
  /** Tidsramen som gäller ('allt' → null) — visas i topplistans Period. */
  tid: { fran: string; till: string; namn: string } | null;
  /** Kapitlen som finns för kursen (till blockväljaren). */
  kapitelIKursen: number[];
}

/** Översätter omfångets tre delar till filterfält och etikett. `kursId` = vald kurs ('' om ingen). */
export function omfangFilterVal(s: Struktur, klassId: string, kursId: string, val: OmfangVal, idag: string, skolarId?: string): OmfangUtfall {
  const kurs = s.amnen.find((a) => a.id === kursId);
  const amnen: OmfangAmnen = val.amnen === 'kurs' && kurs === undefined ? 'alla' : val.amnen;
  const bok = kurs === undefined ? undefined : s.bocker.find((b) => b.id === kurs.bokId);
  const kapitelIKursen = bok?.kapitel.map((k) => k.nr) ?? [];
  const tid = val.tid === 'termin' ? terminIntervall(idag) : val.tid === 'lasar' ? lasarIntervall(s, idag, skolarId) : null;
  const filter: OmfangResultat['filter'] = tid === null ? {} : { fran: tid.fran, till: tid.till };
  const delar: string[] = [];
  let kapitel: number | null = null;
  if (amnen === 'kurs' && kurs !== undefined) {
    delar.push(kurs.namn);
    kapitel = val.block === 'aktivt' ? aktivtKapitel(s, kurs.id, idag) : typeof val.block === 'number' ? val.block : null;
    if (kapitel !== null) { filter.kapitel = kapitel; delar.push(`Kap ${kapitel}`); }
    else if (val.block === 'aktivt') delar.push('inget aktivt kapitel');
  } else if (amnen === 'no') {
    const ids = noAmnenIKlass(s, klassId);
    filter.amneIds = ids;
    delar.push(s.amnen.filter((a) => ids.includes(a.id)).map((a) => a.namn).join(', ') || 'inga NO-ämnen');
  } else delar.push('alla ämnen');
  delar.push(tid === null ? 'all tid' : tid.namn);
  return { filter, etikett: delar.join(' · '), kapitel, amneId: amnen === 'kurs' && kurs !== undefined ? kurs.id : '', tid, kapitelIKursen };
}
