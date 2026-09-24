/**
 * Del 141 · Elevurval — ett gemensamt elevfilter för hela SuperTeach-dashboarden.
 *
 * Läraren väljer elever på tre sätt: via trendkluster ("alla i riskzon"), via
 * närvaro ("under 80 %") eller genom att bocka i elever. Urvalet ger en lista
 * elev-id:n som sedan begränsar strukturen (`begransaTillElever`) så att ALLA
 * grafer — kort, frågematris, trendkoll, kluster, närvaro — räknas på samma
 * elever utan att någon kernel-funktion behöver känna till filtret.
 */
import type { Elev, Struktur } from './typer.js';
import { KLUSTER_NAMN, type Kluster, type KlusterGrupp, type ElevNarvaro } from './dashboard.js';

export type NarvaroRiktning = 'under' | 'over';

export type ElevUrvalVal =
  | { typ: 'alla' }
  | { typ: 'kluster'; kluster: Kluster[] }
  | { typ: 'narvaro'; grans: number; riktning: NarvaroRiktning }
  /** `franKluster`: urvalet började som ett trendkluster som läraren sedan justerat namn för namn (Del 148). */
  | { typ: 'elever'; elevIds: string[]; etikett?: string; franKluster?: Kluster[] };

export interface ElevUrval {
  /** null = alla elever (inget filter). */
  elevIds: string[] | null;
  /** Kort beskrivning för filterchippen: 'Riskzon', 'närvaro under 80 %', '4 elever'. */
  etikett: string;
  /**
   * Del 149 · Gruppens namn när urvalet inte är hela klassen: urvalets namn
   * ('Riskzon', 'Riskzon (ändrat)', 'Närvaro under 80 %') eller 'Egen grupp'
   * för ett fritt namnurval. null = hela klassen.
   */
  grupp: string | null;
}

/** Räknar ut vilka elever ett val pekar ut. Kluster och närvaro ska komma från den OFILTRERADE klassen. */
export function elevUrval(val: ElevUrvalVal, kluster: KlusterGrupp[], narvaro: ElevNarvaro[]): ElevUrval {
  const u = elevUrvalBas(val, kluster, narvaro);
  if (u.elevIds === null) return { ...u, grupp: null };
  let grupp: string;
  if (val.typ === 'kluster') grupp = u.etikett;
  else if (val.typ === 'narvaro') grupp = u.etikett.charAt(0).toUpperCase() + u.etikett.slice(1);
  else if (val.typ === 'elever' && val.franKluster !== undefined && val.franKluster.length > 0) {
    const namn = val.franKluster.map((k) => KLUSTER_NAMN[k]).join(' + ');
    grupp = urvalAvvikerFranKluster(val, kluster) ? `${namn} (ändrat)` : namn;
  } else if (val.typ === 'elever' && val.etikett !== undefined) grupp = `Sök ${val.etikett}`;
  else grupp = 'Egen grupp';
  return { ...u, grupp };
}

function elevUrvalBas(val: ElevUrvalVal, kluster: KlusterGrupp[], narvaro: ElevNarvaro[]): Omit<ElevUrval, 'grupp'> {
  switch (val.typ) {
    case 'alla':
      return { elevIds: null, etikett: 'alla elever' };
    case 'kluster': {
      const valda = kluster.filter((g) => val.kluster.includes(g.kluster));
      const ids = [...new Set(valda.flatMap((g) => g.elever.map((e) => e.id)))];
      return { elevIds: ids, etikett: valda.map((g) => KLUSTER_NAMN[g.kluster]).join(' + ') || 'inget kluster' };
    }
    case 'narvaro': {
      const grans = Math.max(0, Math.min(100, Math.round(val.grans)));
      const ids = narvaro
        .filter((n) => n.narvaroProcent !== null && (val.riktning === 'under' ? n.narvaroProcent < grans : n.narvaroProcent >= grans))
        .map((n) => n.elev.id);
      return { elevIds: ids, etikett: `närvaro ${val.riktning === 'under' ? 'under' : 'minst'} ${grans} %` };
    }
    case 'elever': {
      const ids = [...new Set(val.elevIds)];
      if (val.franKluster !== undefined && val.franKluster.length > 0) {
        const namn = val.franKluster.map((k) => KLUSTER_NAMN[k]).join(' + ');
        return { elevIds: ids, etikett: urvalAvvikerFranKluster(val, kluster) ? `${namn} · ändrat urval` : namn };
      }
      return { elevIds: ids, etikett: val.etikett ?? `${ids.length} elev${ids.length === 1 ? '' : 'er'}` };
    }
  }
}

/** Elev-id:n i ett eller flera kluster (dedupade). */
export function klusterElevIds(kluster: KlusterGrupp[], valda: Kluster[]): string[] {
  return [...new Set(kluster.filter((g) => valda.includes(g.kluster)).flatMap((g) => g.elever.map((e) => e.id)))];
}

/** Sant när ett namnurval som började i ett kluster inte längre är exakt klustrets elever. */
export function urvalAvvikerFranKluster(val: ElevUrvalVal, kluster: KlusterGrupp[]): boolean {
  if (val.typ !== 'elever' || val.franKluster === undefined || val.franKluster.length === 0) return false;
  const a = new Set(val.elevIds);
  const b = new Set(klusterElevIds(kluster, val.franKluster));
  return a.size !== b.size || [...a].some((id) => !b.has(id));
}

/**
 * Strukturen begränsad till de valda eleverna: elever och deras resultat.
 * Allt annat (böcker, planeringar, filregister) lämnas orört. null = ingen ändring.
 */
export function begransaTillElever(s: Struktur, elevIds: string[] | null): Struktur {
  if (elevIds === null) return s;
  const valda = new Set(elevIds);
  return {
    ...s,
    elever: s.elever.filter((e) => valda.has(e.id)),
    ...(s.resultat !== undefined ? { resultat: s.resultat.filter((r) => valda.has(r.elevId)) } : {}),
  };
}

/** Elever i klassen sorterade på namn — grunden för bocklistan i filtret. */
export function klassensElever(s: Struktur, klassId: string): Elev[] {
  return s.elever.filter((e) => e.klassId === klassId).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
}
