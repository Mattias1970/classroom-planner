/**
 * Utskriftslayout (del 20) — ren kärna (invariant I2).
 *
 * Läraren ritar med gummiband ytor på ett tomt A4-blad; varje yta visar
 * ett fält ur lektionsplaneringen. Layouten beskriver hur EN lektion
 * återges; vid utskrift staplas alla lektioner efter varandra under en
 * kapitelrubrik. All geometri räknas i millimeter (A4 = 210 × 297).
 */
import type { LessonRecord } from '../records/lesson-record.js';

export const BLAD = { breddMm: 210, hojdMm: 297, marginalMm: 12 } as const;

export type LayoutAlign = 'left' | 'center' | 'right';

export interface LayoutBox {
  id: string;
  falt: string;
  xMm: number; yMm: number; wMm: number; hMm: number;
  fontPt: number;
  align: LayoutAlign;
  /** Visa fältets etikett före värdet ("Genomgång: …"). */
  visaEtikett: boolean;
}

export interface UtskriftsLayout { boxar: LayoutBox[] }

/** Alla fält ur lektionsplaneringen som kan placeras på bladet. */
export const LAYOUT_FALT: ReadonlyArray<{ id: string; etikett: string }> = [
  { id: 'lektionsnr', etikett: 'Lektionsnummer' },
  { id: 'datum', etikett: 'Datum' },
  { id: 'tid', etikett: 'Tid' },
  { id: 'avsnitt', etikett: 'Avsnitt' },
  { id: 'typ', etikett: 'Lektionstyp' },
  { id: 'del', etikett: 'Del' },
  { id: 'grön', etikett: 'Grön' },
  { id: 'blå', etikett: 'Blå' },
  { id: 'röd', etikett: 'Röd' },
  { id: 'sidor_teori', etikett: 'Teorisidor' },
  { id: 'begrepp', etikett: 'Begrepp' },
  { id: 'genomgang', etikett: 'Genomgång' },
  { id: 'soc_start', etikett: 'Läxförhör (Socrative)' },
  { id: 'exit', etikett: 'Exit ticket' },
  { id: 'bam_gora', etikett: 'BAM — göra' },
  { id: 'bam_lara', etikett: 'BAM — lära' },
  { id: 'bam_ex', etikett: 'BAM — exempel' },
  { id: 'ex', etikett: 'Exempel' },
  { id: 'laxa', etikett: 'Läxa' },
] as const;

export function faltEtikett(faltId: string): string {
  return LAYOUT_FALT.find((f) => f.id === faltId)?.etikett ?? faltId;
}

const TYP_ETIKETT: Record<string, string> = {
  regular: 'Lektion', test: 'Diagnos', repetition: 'Repetition',
  review: 'Repetition', ovaformagor: 'Öva förmågor', exam: 'PROV',
};

export interface LayoutExtra { datum?: string; tid?: string; lektionsNr?: number }

/** Värdet för ett layoutfält, för en given lektion. */
export function layoutFaltVarde(faltId: string, lesson: LessonRecord, extra: LayoutExtra = {}): string {
  switch (faltId) {
    case 'lektionsnr': return extra.lektionsNr !== undefined ? `L${extra.lektionsNr}` : '';
    case 'datum': return extra.datum ?? '';
    case 'tid': return extra.tid ?? '';
    case 'typ': return TYP_ETIKETT[lesson.type] ?? lesson.type;
    case 'del': return `Del ${lesson.del}`;
    default: {
      const v = (lesson as unknown as Record<string, unknown>)[faltId];
      return typeof v === 'string' ? v : v === undefined ? '' : String(v);
    }
  }
}

/** Gummiband → normaliserad ruta (klarar drag åt alla håll), klämd till bladet. */
export function normaliseraRuta(
  x1: number, y1: number, x2: number, y2: number, minMm = 6,
): { xMm: number; yMm: number; wMm: number; hMm: number } {
  let x = Math.min(x1, x2), y = Math.min(y1, y2);
  let w = Math.max(Math.abs(x2 - x1), minMm), h = Math.max(Math.abs(y2 - y1), minMm);
  x = Math.max(0, Math.min(x, BLAD.breddMm - w));
  y = Math.max(0, Math.min(y, BLAD.hojdMm - h));
  w = Math.min(w, BLAD.breddMm - x);
  h = Math.min(h, BLAD.hojdMm - y);
  return { xMm: x, yMm: y, wMm: w, hMm: h };
}

export interface SnapGuide { typ: 'topp' | 'botten' | 'mitt' | 'bredd'; yMm?: number }
export interface SnapResultat { xMm: number; yMm: number; wMm: number; hMm: number; guides: SnapGuide[] }

/**
 * Snappning vid flytt/storleksändring: samma ovankant, samma underkant,
 * samma centrallinje som andra ytor — samt "fyll bladet i sidled" när
 * båda kanterna är nära marginalerna.
 */
export function snapBox(
  box: { xMm: number; yMm: number; wMm: number; hMm: number },
  andra: ReadonlyArray<{ yMm: number; hMm: number }>,
  lage: 'flytt' | 'storlek',
  tolMm = 2,
): SnapResultat {
  let { xMm, yMm, wMm, hMm } = box;
  const guides: SnapGuide[] = [];
  const kandidater = andra.flatMap((a) => [
    { typ: 'topp' as const, linje: a.yMm },
    { typ: 'botten' as const, linje: a.yMm + a.hMm },
    { typ: 'mitt' as const, linje: a.yMm + a.hMm / 2 },
  ]);
  const prova = (varde: number, linje: number) => Math.abs(varde - linje) <= tolMm;

  for (const k of kandidater) {
    if (lage === 'flytt') {
      if (k.typ === 'topp' && prova(yMm, k.linje)) { yMm = k.linje; guides.push({ typ: 'topp', yMm: k.linje }); break; }
      if (k.typ === 'botten' && prova(yMm + hMm, k.linje)) { yMm = k.linje - hMm; guides.push({ typ: 'botten', yMm: k.linje }); break; }
      if (k.typ === 'mitt' && prova(yMm + hMm / 2, k.linje)) { yMm = k.linje - hMm / 2; guides.push({ typ: 'mitt', yMm: k.linje }); break; }
    } else {
      // storleksändring i nederkant: snappa underkanten mot topp/botten/mitt-linjer
      if (prova(yMm + hMm, k.linje)) { hMm = k.linje - yMm; guides.push({ typ: k.typ, yMm: k.linje }); break; }
    }
  }
  // Fyll bladet i sidled när båda sidkanterna är nära marginalerna
  if (Math.abs(xMm - BLAD.marginalMm) <= tolMm * 2
    && Math.abs(xMm + wMm - (BLAD.breddMm - BLAD.marginalMm)) <= tolMm * 2) {
    xMm = BLAD.marginalMm;
    wMm = BLAD.breddMm - 2 * BLAD.marginalMm;
    guides.push({ typ: 'bredd' });
  }
  return { xMm, yMm, wMm, hMm, guides };
}

/** Fyll bladet i sidled uttryckligen (knappen ⇔). */
export function fyllSidled(box: LayoutBox): LayoutBox {
  return { ...box, xMm: BLAD.marginalMm, wMm: BLAD.breddMm - 2 * BLAD.marginalMm };
}

/** Lektionsbandets höjd = nedersta ytans underkant + luft. */
export function bandHojd(layout: UtskriftsLayout, luftMm = 4): number {
  if (layout.boxar.length === 0) return 0;
  return Math.max(...layout.boxar.map((b) => b.yMm + b.hMm)) + luftMm;
}

export function nyBoxId(existing: string[]): string {
  let n = 1;
  while (existing.includes(`box-${n}`)) n++;
  return `box-${n}`;
}

/** Startlayout: rubrikrad (nr · avsnitt · datum/tid) + genomgång + nivåer + läxa. */
export function defaultUtskriftslayout(): UtskriftsLayout {
  const M = BLAD.marginalMm, W = BLAD.breddMm - 2 * M;
  return {
    boxar: [
      { id: 'box-1', falt: 'lektionsnr', xMm: M, yMm: 4, wMm: 18, hMm: 8, fontPt: 12, align: 'left', visaEtikett: false },
      { id: 'box-2', falt: 'avsnitt', xMm: M + 20, yMm: 4, wMm: W - 70, hMm: 8, fontPt: 12, align: 'left', visaEtikett: false },
      { id: 'box-3', falt: 'datum', xMm: M + W - 48, yMm: 4, wMm: 26, hMm: 8, fontPt: 10, align: 'right', visaEtikett: false },
      { id: 'box-4', falt: 'tid', xMm: M + W - 20, yMm: 4, wMm: 20, hMm: 8, fontPt: 10, align: 'right', visaEtikett: false },
      { id: 'box-5', falt: 'genomgang', xMm: M, yMm: 14, wMm: W, hMm: 14, fontPt: 10, align: 'left', visaEtikett: true },
      { id: 'box-6', falt: 'grön', xMm: M, yMm: 30, wMm: W / 3 - 2, hMm: 9, fontPt: 9, align: 'left', visaEtikett: true },
      { id: 'box-7', falt: 'blå', xMm: M + W / 3 + 1, yMm: 30, wMm: W / 3 - 2, hMm: 9, fontPt: 9, align: 'left', visaEtikett: true },
      { id: 'box-8', falt: 'röd', xMm: M + (2 * W) / 3 + 2, yMm: 30, wMm: W / 3 - 2, hMm: 9, fontPt: 9, align: 'left', visaEtikett: true },
      { id: 'box-9', falt: 'laxa', xMm: M, yMm: 41, wMm: W, hMm: 8, fontPt: 9, align: 'left', visaEtikett: true },
    ],
  };
}
