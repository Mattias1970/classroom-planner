/**
 * Del 159 · Områden på lektionskorten. Läraren kan dölja ett område (t.ex. Magma eller
 * Läxförhör) för ett ämne; det syns då inte på något av ämnets lektionskort förrän det
 * slås på igen. Innehållet i lektionsplanerna ligger kvar.
 */
import type { LektionsOmrade, Struktur } from './typer.js';

export const LEKTIONSOMRADEN: ReadonlyArray<{ id: LektionsOmrade; namn: string; ikon: string }> = [
  { id: 'provlapp', namn: 'Provlapp', ikon: '📝' },
  { id: 'tavlan', namn: 'Tavlan', ikon: '📋' },
  { id: 'laxforhor', namn: 'Läxförhör', ikon: '📱' },
  { id: 'genomgang', namn: 'Genomgång', ikon: '□' },
  { id: 'begrepp', namn: 'Begrepp', ikon: '💡' },
  { id: 'arbete', namn: 'Arbete', ikon: '✏' },
  { id: 'magma', namn: 'Magma', ikon: '🟫' },
  { id: 'filmer', namn: 'Filmer', ikon: '🎬' },
  { id: 'laxa', namn: 'Läxa', ikon: '📚' },
  { id: 'exit', namn: 'Exit ticket', ikon: '📱' },
  { id: 'detaljerad', namn: 'Detaljerad planering (NO)', ikon: '🧪' },
];

/** Ämnets dolda områden, i lektionskortets ordning. */
export function doldaOmraden(s: Struktur, amneId: string): LektionsOmrade[] {
  const dolda = new Set(s.amnen.find((a) => a.id === amneId)?.doldaOmraden ?? []);
  return LEKTIONSOMRADEN.filter((o) => dolda.has(o.id)).map((o) => o.id);
}

/** Döljer (dold = true) eller visar ett område på ämnets lektionskort. */
export function sattOmradeDolt(s: Struktur, amneId: string, omrade: LektionsOmrade, dold: boolean): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  if (!LEKTIONSOMRADEN.some((o) => o.id === omrade)) throw new Error('Okänt område.');
  const nu = new Set(amne.doldaOmraden ?? []);
  if (dold) nu.add(omrade); else nu.delete(omrade);
  const lista = LEKTIONSOMRADEN.filter((o) => nu.has(o.id)).map((o) => o.id);
  return {
    ...s,
    amnen: s.amnen.map((a) => {
      if (a.id !== amneId) return a;
      const { doldaOmraden: _d, ...rest } = a; void _d;
      return lista.length > 0 ? { ...rest, doldaOmraden: lista } : rest;
    }),
  };
}

/** Visar alla ämnets områden igen. */
export function visaAllaOmraden(s: Struktur, amneId: string): Struktur {
  return doldaOmraden(s, amneId).reduce((acc, o) => sattOmradeDolt(acc, amneId, o, false), s);
}
