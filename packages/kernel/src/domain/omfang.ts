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
    const plan = planForAmne(s, amneId).filter((p) => p.datum !== null && p.datum <= idag);
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

/** Läsårets intervall ur skolåret om det finns, annars aug–juni runt idag. */
export function lasarIntervall(s: Struktur, idag: string): { fran: string; till: string; namn: string } {
  const sk = s.skolar.find((x) => x.start <= idag && x.slut >= idag) ?? s.skolar[0];
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
