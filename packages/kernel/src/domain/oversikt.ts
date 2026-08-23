/**
 * Årsöversikt (v2): aggregerar en klass/ämnes planering till kapitelkort och
 * viktiga datum, motsvarande v1:s årsöversikt fast härlett ur en PlaneradLektion[]
 * (bok utlagd på schemat inom skolåret). Ren kärna — ingen presentation.
 */
import type { Bok, PlaneradLektion } from './typer.js';

export interface KapitelKort {
  nr: number;
  namn: string;
  farg: string;
  antalLektioner: number;
  begreppAntal: number;
  filmAntal: number;
  /** Första och sista vecka kapitlet infaller (null om inget datum ryms). */
  forstaVecka: number | null;
  sistaVecka: number | null;
}

export interface ViktigDatum {
  kapitel: number;
  typ: 'repetition' | 'diagnos' | 'prov' | 'övrigt';
  etikett: string;
  datum: string | null;
  vecka: number | null;
}

const TYP_ETIKETT: Record<string, ViktigDatum['typ']> = {
  repetition: 'repetition', review: 'diagnos', test: 'diagnos', exam: 'prov', ovaformagor: 'övrigt',
};

/** Kapitelkort med antal och veckospann ur planeringen. */
export function kapitelKort(bok: Bok, plan: PlaneradLektion[]): KapitelKort[] {
  return bok.kapitel.map((k) => {
    const rader = plan.filter((p) => p.kapitel === k.nr);
    const veckor = rader.map((p) => p.vecka).filter((v): v is number => v !== null);
    return {
      nr: k.nr, namn: k.namn, farg: k.farg,
      antalLektioner: rader.length,
      begreppAntal: k.begreppslista.length,
      filmAntal: k.resurser.filmer.length,
      forstaVecka: veckor.length > 0 ? veckor[0] : null,
      sistaVecka: veckor.length > 0 ? veckor[veckor.length - 1] : null,
    };
  });
}

/** Viktiga datum: repetitions-, diagnos- och provlektioner med datum/vecka. */
export function viktigaDatum(plan: PlaneradLektion[]): ViktigDatum[] {
  return plan
    .filter((p) => p.lektion.typ !== 'regular')
    .map((p) => ({
      kapitel: p.kapitel,
      typ: TYP_ETIKETT[p.lektion.typ] ?? 'övrigt',
      etikett: p.lektion.avsnitt,
      datum: p.datum,
      vecka: p.vecka,
    }));
}
