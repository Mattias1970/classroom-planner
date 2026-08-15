/**
 * Layoutmall för utskrift (del 20) — ren kärna (invariant I2).
 *
 * Läraren ritar med gummiband hur EN lektion ska återges: informationsytor
 * (boxar) placeras fritt på ett tomt blad, kan flyttas, skalas, snappas och
 * formateras. Vid export läggs samtliga lektioner efter varandra enligt
 * mallen, med kapitelrubrik överst. Alla mått i millimeter (A4) så att
 * designern och PDF:en är exakt samma geometri.
 */

export type LayoutFaltId =
  | 'lektion' | 'avsnitt' | 'typ' | 'datumtid'
  | 'gron' | 'bla' | 'rod'
  | 'sidor_teori' | 'begrepp' | 'soc_start' | 'exit'
  | 'genomgang' | 'bam_gora' | 'bam_lara' | 'bam_ex' | 'ex' | 'laxa';

export const LAYOUT_FALT: ReadonlyArray<{ id: LayoutFaltId; label: string }> = [
  { id: 'lektion', label: 'Lektionsnr + avsnitt' },
  { id: 'avsnitt', label: 'Avsnitt' },
  { id: 'typ', label: 'Lektionstyp' },
  { id: 'datumtid', label: 'Datum & tid' },
  { id: 'gron', label: 'Gröna uppgifter' },
  { id: 'bla', label: 'Blå uppgifter' },
  { id: 'rod', label: 'Röda uppgifter' },
  { id: 'sidor_teori', label: 'Teorisidor' },
  { id: 'begrepp', label: 'Begrepp' },
  { id: 'soc_start', label: 'Läxförhör (Socrative)' },
  { id: 'exit', label: 'Exit ticket' },
  { id: 'genomgang', label: 'Genomgång' },
  { id: 'bam_gora', label: 'BAM: Göra' },
  { id: 'bam_lara', label: 'BAM: Lära' },
  { id: 'bam_ex', label: 'BAM: Exempel' },
  { id: 'ex', label: 'Exempel' },
  { id: 'laxa', label: 'Läxa' },
];

export const FALT_LABEL: Record<LayoutFaltId, string> = Object.fromEntries(
  LAYOUT_FALT.map((f) => [f.id, f.label]),
) as Record<LayoutFaltId, string>;

/** A4 stående med 15 mm marginal → arbetsyta 180 mm bred. */
export const SIDBREDD_MM = 210;
export const SIDHOJD_MM = 297;
export const MARGINAL_MM = 15;
export const ARBETSBREDD_MM = SIDBREDD_MM - 2 * MARGINAL_MM;

export const MIN_BOX_W = 14;
export const MIN_BOX_H = 6;

export type LayoutAlign = 'left' | 'center' | 'right';

export interface LayoutBox {
  id: string;
  falt: LayoutFaltId;
  xMm: number; yMm: number; wMm: number; hMm: number;
  fontPt: number;
  align: LayoutAlign;
  /** Visa fältets etikett före innehållet ("Läxa: …"). */
  etikett: boolean;
}

export interface LayoutMall {
  namn: string;
  boxar: LayoutBox[];
}

export function nyBoxId(existing: string[]): string {
  let n = 1;
  while (existing.includes(`box-${n}`)) n++;
  return `box-${n}`;
}

/** Håller boxen inom arbetsytan och över minimimåtten. */
export function clampBox(b: LayoutBox): LayoutBox {
  const w = Math.max(MIN_BOX_W, Math.min(ARBETSBREDD_MM, b.wMm));
  const h = Math.max(MIN_BOX_H, b.hMm);
  const x = Math.max(0, Math.min(ARBETSBREDD_MM - w, b.xMm));
  const y = Math.max(0, b.yMm);
  return { ...b, xMm: r1(x), yMm: r1(y), wMm: r1(w), hMm: r1(h) };
}

function r1(n: number): number { return Math.round(n * 10) / 10; }

/** Lektionsrutans höjd = nedersta boxkanten + luft. */
export function lektionsHojd(mall: LayoutMall): number {
  const botten = mall.boxar.reduce((m, b) => Math.max(m, b.yMm + b.hMm), 0);
  return r1(Math.max(16, botten + 4));
}

export type JusteraOp = 'topp' | 'botten' | 'centrallinje' | 'bredd';

/**
 * Justeringar för markerade boxar. Första id:t är referens:
 * topp/botten = samma ovan-/underkant som referensen,
 * centrallinje = samma horisontella centrallinje,
 * bredd = fyll bladet i sidled (x=0, w=hela arbetsbredden).
 */
export function justeraBoxar(boxar: LayoutBox[], ids: string[], op: JusteraOp): LayoutBox[] {
  if (ids.length === 0) return boxar;
  const ref = boxar.find((b) => b.id === ids[0]);
  if (ref === undefined) return boxar;
  return boxar.map((b) => {
    if (!ids.includes(b.id)) return b;
    if (op === 'bredd') return clampBox({ ...b, xMm: 0, wMm: ARBETSBREDD_MM });
    if (b.id === ref.id) return b;
    if (op === 'topp') return clampBox({ ...b, yMm: ref.yMm });
    if (op === 'botten') return clampBox({ ...b, yMm: ref.yMm + ref.hMm - b.hMm });
    return clampBox({ ...b, yMm: ref.yMm + ref.hMm / 2 - b.hMm / 2 }); // centrallinje
  });
}

export interface SnapGuide { riktning: 'v' | 'h'; posMm: number; }
export interface SnapResultat { xMm: number; yMm: number; guider: SnapGuide[]; }

/**
 * Magnetsnap under flytt: kanterna och centrumlinjerna dras mot övriga
 * boxars kanter/centra samt bladets kanter och mittlinje, inom toleransen.
 */
export function magnetSnap(
  box: LayoutBox, ovriga: LayoutBox[], tolMm = 1.5,
): SnapResultat {
  const xKanter = [0, ARBETSBREDD_MM, ARBETSBREDD_MM / 2];
  const yKanter: number[] = [0];
  for (const o of ovriga) {
    xKanter.push(o.xMm, o.xMm + o.wMm, o.xMm + o.wMm / 2);
    yKanter.push(o.yMm, o.yMm + o.hMm, o.yMm + o.hMm / 2);
  }
  const guider: SnapGuide[] = [];
  let x = box.xMm, y = box.yMm;

  const minaX = [
    { off: 0, get: () => x },
    { off: box.wMm, get: () => x + box.wMm },
    { off: box.wMm / 2, get: () => x + box.wMm / 2 },
  ];
  let bastX: { diff: number; mal: number; off: number } | null = null;
  for (const m of minaX) for (const k of xKanter) {
    const diff = Math.abs(m.get() - k);
    if (diff <= tolMm && (bastX === null || diff < bastX.diff)) bastX = { diff, mal: k, off: m.off };
  }
  if (bastX !== null) { x = bastX.mal - bastX.off; guider.push({ riktning: 'v', posMm: bastX.mal }); }

  const minaY = [
    { off: 0 }, { off: box.hMm }, { off: box.hMm / 2 },
  ];
  let bastY: { diff: number; mal: number; off: number } | null = null;
  for (const m of minaY) for (const k of yKanter) {
    const diff = Math.abs(y + m.off - k);
    if (diff <= tolMm && (bastY === null || diff < bastY.diff)) bastY = { diff, mal: k, off: m.off };
  }
  if (bastY !== null) { y = bastY.mal - bastY.off; guider.push({ riktning: 'h', posMm: bastY.mal }); }

  return { xMm: r1(x), yMm: r1(y), guider };
}

/** Standardmall: rubrikrad, nivårutor sida vid sida, genomgång och läxa. */
export const DEFAULT_MALL: LayoutMall = {
  namn: 'Standard',
  boxar: [
    { id: 'box-1', falt: 'lektion', xMm: 0, yMm: 0, wMm: 110, hMm: 8, fontPt: 12, align: 'left', etikett: false },
    { id: 'box-2', falt: 'datumtid', xMm: 112, yMm: 0, wMm: 68, hMm: 8, fontPt: 10, align: 'right', etikett: false },
    { id: 'box-3', falt: 'genomgang', xMm: 0, yMm: 10, wMm: 180, hMm: 12, fontPt: 9, align: 'left', etikett: true },
    { id: 'box-4', falt: 'gron', xMm: 0, yMm: 24, wMm: 58, hMm: 8, fontPt: 9, align: 'left', etikett: true },
    { id: 'box-5', falt: 'bla', xMm: 61, yMm: 24, wMm: 58, hMm: 8, fontPt: 9, align: 'left', etikett: true },
    { id: 'box-6', falt: 'rod', xMm: 122, yMm: 24, wMm: 58, hMm: 8, fontPt: 9, align: 'left', etikett: true },
    { id: 'box-7', falt: 'begrepp', xMm: 0, yMm: 34, wMm: 110, hMm: 8, fontPt: 8, align: 'left', etikett: true },
    { id: 'box-8', falt: 'laxa', xMm: 112, yMm: 34, wMm: 68, hMm: 8, fontPt: 8, align: 'left', etikett: true },
  ],
};
