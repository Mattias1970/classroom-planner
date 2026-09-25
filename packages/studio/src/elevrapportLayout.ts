/**
 * Del 151 · Elevrapporten i Word — uppdelad i pedagogiska områden.
 *
 *   Sida 1   Rubrik, tre översiktsrutor (Lektionerna · Läxorna · Minnet) och högst två fokus.
 *   1        Lektionerna — exit tickets per lektion (krav 70 %).
 *   2        Läxorna — läxförhör per gång (krav 90 %), vänt fel → rätt, kvar att lära.
 *   3        Minnet — begrepp som kunnats: upprepade fel flaggas, enstaka fel noteras.
 *   Bilaga A Frågematrisen, liggande, med samma kolumner och färger som på skärmen + frågenyckel.
 *   Bilaga B Att läsa: sammanfattningar, begreppsförklaringar och länkar.
 *
 * Innehållet kommer från kernel (`rapportOmraden`, `elevanalys`); här bestäms bara
 * layouten. Diagrammen ritas på canvas; finns ingen canvas (t.ex. i test) utelämnas de.
 */
import {
  AlignmentType, BorderStyle, Document, LineRuleType, ExternalHyperlink, Footer, Header, HeightRule, ImageRun, Packer, PageBreak,
  PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlignTable as VerticalAlign, WidthType,
  type ISectionOptions,
} from 'docx';
import { rapportDatum as kortDatum, rapportOmraden, type Elevanalys, type GlomskaBegrepp, type OmradeTon, type RapportOmraden, type ResultatKalla } from '@planner/kernel';

// ── Formspråk ──────────────────────────────────────────────────
const TEXT = '1F2937'; const MUTED = '6B7280'; const LINJE = 'E5E7EB'; const YTA = 'F3F4F6';
export const OMRADE = {
  lektioner: { farg: '2F5AA8', ljus: 'E8EFFA', ikon: '🎯', namn: 'Lektionerna', fraga: 'Hur mycket lär du dig på lektionen?' },
  laxor: { farg: '1A2A6B', ljus: 'E8EAF6', ikon: '📚', namn: 'Läxorna', fraga: 'Läser du läxan och ökar från gång till gång?' },
  minne: { farg: '00838F', ljus: 'E0F2F1', ikon: '🧠', namn: 'Minnet', fraga: 'Minns du begreppen du har lärt dig?' },
  prov: { farg: 'BF360C', ljus: 'FBE9E7', ikon: '📝', namn: 'Proven', fraga: 'Hur gick det på proven?' },
} as const;
export const TON: Record<OmradeTon, { fyll: string; text: string; markor: string }> = {
  bra: { fyll: 'E8F5E9', text: '1B5E20', markor: '●' },
  okej: { fyll: 'FFF8E1', text: '8D6E00', markor: '●' },
  oro: { fyll: 'FFEBEE', text: 'B71C1C', markor: '●' },
  ingen: { fyll: YTA, text: MUTED, markor: '○' },
};
/** Skärmens färger i frågematrisen (App.tsx: .st-fmruta, .st-typ, .st-fmgrupp). */
export const FM = { ratt: '4CAF50', fel: 'D32F2F', tom: 'F7F8FA', grupp: 'E8ECF3', gruppText: '465060', gruppUnder: '7A8494', gstart: 'C9D2E0', nr: '9AA3AE' };
export const TYP: Record<ResultatKalla, { fyll: string; text: string; namn: string }> = {
  'socrative-laxforhor': { fyll: 'E8EAF6', text: '1A2A6B', namn: 'Läxförhör' },
  'socrative-exit': { fyll: 'E3F2FD', text: '2F5AA8', namn: 'Exit ticket' },
  'socrative-ovning': { fyll: 'E0F2F1', text: '00838F', namn: 'Övning' },
  magma: { fyll: 'F3E5F5', text: '6A1B9A', namn: 'Magma' },
  digiexam: { fyll: 'FBE9E7', text: 'BF360C', namn: 'Prov' },
};

const A4 = { b: 11906, h: 16838 };
const MARG = 1000;                        // ~1,76 cm
const INNER = A4.b - 2 * MARG;            // stående innerbredd (twips)
const INNER_LIGG = A4.h - 2 * 720;        // liggande, smalare marginal

const ingenKant = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const INGA_KANTER = { top: ingenKant, bottom: ingenKant, left: ingenKant, right: ingenKant } as const;
const tunn = (color = LINJE) => ({ style: BorderStyle.SINGLE, size: 4, color });

function t(text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}): TextRun {
  return new TextRun({ text, bold: o.bold, size: o.size, color: o.color, italics: o.italics });
}
function p(barn: Array<TextRun | ExternalHyperlink>, o: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; keepNext?: boolean } = {}): Paragraph {
  return new Paragraph({ children: barn, spacing: { after: o.after ?? 80, before: o.before ?? 0 }, alignment: o.align, keepNext: o.keepNext });
}
const luft = (after = 120) => new Paragraph({ children: [], spacing: { after } });
const liten = (text: string, color = MUTED) => p([t(text, { size: 17, color })], { after: 60 });

function cell(barn: Paragraph[], o: { fyll?: string; bredd?: number; span?: number; kanter?: object; marg?: number; v?: (typeof VerticalAlign)[keyof typeof VerticalAlign] } = {}): TableCell {
  const m = o.marg ?? 100;
  return new TableCell({
    children: barn,
    ...(o.fyll !== undefined ? { shading: { type: ShadingType.CLEAR, fill: o.fyll, color: 'auto' } } : {}),
    ...(o.bredd !== undefined ? { width: { size: o.bredd, type: WidthType.DXA } } : {}),
    ...(o.span !== undefined ? { columnSpan: o.span } : {}),
    borders: (o.kanter ?? INGA_KANTER) as never,
    margins: { top: m, bottom: m, left: m + 40, right: m + 40 },
    verticalAlign: o.v ?? VerticalAlign.TOP,
  });
}

/** Rubrikband för ett område: färgat fält med nummer, namn och frågan området besvarar. */
function omradesBand(nr: string, o: (typeof OMRADE)[keyof typeof OMRADE], sidbrytning: boolean): Array<Paragraph | Table> {
  return [
    ...(sidbrytning ? [new Paragraph({ children: [new PageBreak()] })] : []),
    new Table({
      width: { size: INNER, type: WidthType.DXA }, columnWidths: [INNER], layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: [cell([
        p([t(`${nr}  `, { bold: true, size: 30, color: 'FFFFFF' }), t(`${o.ikon} ${o.namn}`, { bold: true, size: 30, color: 'FFFFFF' })], { after: 20 }),
        p([t(o.fraga, { size: 20, color: 'FFFFFF' })], { after: 0 }),
      ], { fyll: o.farg, marg: 140 })] })],
    }),
    luft(140),
  ];
}

/** Slutsatsruta: tonad bakgrund, statusmarkör och texten. */
function slutsats(ton: OmradeTon, status: string, text: string): Table {
  const c = TON[ton];
  return new Table({
    width: { size: INNER, type: WidthType.DXA }, columnWidths: [INNER], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [cell([
      p([t(`${c.markor} ${status}  `, { bold: true, color: c.text }), t(text)], { after: 0 }),
    ], { fyll: c.fyll, marg: 110, kanter: { ...INGA_KANTER, left: { style: BorderStyle.SINGLE, size: 24, color: c.text } } })] })],
  });
}

/** Nyckeltal i rad: stort tal, etikett och förklaring. */
function nyckeltalRad(tal: Array<{ etikett: string; varde: string; under?: string }>, farg: string): Table | null {
  if (tal.length === 0) return null;
  const b = Math.floor(INNER / tal.length);
  return new Table({
    width: { size: INNER, type: WidthType.DXA }, columnWidths: tal.map(() => b), layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: tal.map((n) => cell([
      p([t(n.varde, { bold: true, size: 32, color: farg })], { after: 0 }),
      p([t(n.etikett, { bold: true, size: 18 })], { after: 0 }),
      ...(n.under !== undefined ? [p([t(n.under, { size: 16, color: MUTED })], { after: 0 })] : []),
    ], { bredd: b, fyll: YTA, marg: 100, kanter: { ...INGA_KANTER, right: { style: BorderStyle.SINGLE, size: 18, color: 'FFFFFF' } } })) })],
  });
}

/** Enkel datatabell: grått rubrikfält, tunna linjer, valfria cellfärger. */
function dataTabell(rubriker: string[], bredder: number[], rader: Array<Array<string | { text: string; fyll?: string; farg?: string; bold?: boolean }>>): Table {
  const summa = bredder.reduce((a, b) => a + b, 0);
  const skal = bredder.map((b) => Math.round((b / summa) * INNER));
  const kant = { top: tunn(), bottom: tunn(), left: ingenKant, right: ingenKant };
  return new Table({
    width: { size: INNER, type: WidthType.DXA }, columnWidths: skal, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: rubriker.map((h, i) => cell([p([t(h, { bold: true, size: 17, color: MUTED })], { after: 0 })], { bredd: skal[i], fyll: YTA, marg: 60, kanter: kant })) }),
      ...rader.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => {
        const x = typeof v === 'string' ? { text: v } : v;
        return cell([p([t(x.text, { size: 18, color: x.farg, bold: x.bold })], { after: 0 })], { bredd: skal[i], fyll: x.fyll, marg: 60, kanter: kant });
      }) })),
    ],
  });
}

const bock = (ok: boolean) => (ok ? { text: '✓ ja', farg: '1B5E20', bold: true } : { text: 'nej', farg: 'B71C1C' });

function underrubrik(text: string, farg = TEXT): Paragraph {
  return p([t(text, { bold: true, size: 22, color: farg })], { before: 160, after: 60, keepNext: true });
}

function punktlista(rader: Array<Array<TextRun>>): Paragraph[] {
  return rader.map((r) => new Paragraph({ children: r, bullet: { level: 0 }, spacing: { after: 40 } }));
}

function lank(text: string, url: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [
    new ExternalHyperlink({ children: [new TextRun({ text, style: 'Hyperlink', size: 19 })], link: url }),
  ] });
}

// ── Diagram (canvas → PNG) ─────────────────────────────────────
async function rita(bredd: number, hojd: number, fn: (ctx: CanvasRenderingContext2D) => void): Promise<ArrayBuffer | null> {
  try {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = bredd * 2; c.height = hojd * 2;
    const ctx = c.getContext('2d');
    if (ctx === null) return null;
    ctx.scale(2, 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, bredd, hojd);
    ctx.font = '11px Calibri, Segoe UI, Arial, sans-serif';
    fn(ctx);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    return blob === null ? null : await blob.arrayBuffer();
  } catch { return null; }
}

function axlar(ctx: CanvasRenderingContext2D, x0: number, y0: number, b: number, h: number): void {
  ctx.strokeStyle = '#E5E7EB'; ctx.fillStyle = '#9CA3AF'; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (const v of [0, 25, 50, 75, 100]) {
    const y = y0 + h - (v / 100) * h;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + b, y); ctx.stroke();
    ctx.fillText(`${v}`, x0 - 6, y + 4);
  }
}
function kravlinje(ctx: CanvasRenderingContext2D, x0: number, y: number, b: number, farg: string, text: string): void {
  ctx.strokeStyle = farg; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + b, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = farg; ctx.textAlign = 'right'; ctx.fillText(text, x0 + b, y - 4);
}
const etikettDatum = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

/** Exit ticket per lektion: staplar, grön när kravet nås. */
export function lektionsBild(o: RapportOmraden['lektioner']): Promise<ArrayBuffer | null> {
  const B = 640; const H = 210; const x0 = 32; const y0 = 12; const b = B - x0 - 8; const h = H - y0 - 34;
  return rita(B, H, (ctx) => {
    axlar(ctx, x0, y0, b, h);
    const n = o.rader.length; const band = b / Math.max(1, n); const bar = Math.min(34, band * 0.62);
    o.rader.forEach((r, i) => {
      const cx = x0 + band * (i + 0.5); const y = y0 + h - (r.procent / 100) * h;
      ctx.fillStyle = r.klarat ? '#43A047' : '#EF6C00';
      ctx.fillRect(cx - bar / 2, y, bar, y0 + h - y);
      ctx.fillStyle = '#374151'; ctx.textAlign = 'center'; ctx.fillText(`${r.procent}`, cx, y - 4);
      ctx.fillStyle = '#9CA3AF'; ctx.fillText(etikettDatum(r.datum), cx, y0 + h + 16);
    });
    kravlinje(ctx, x0, y0 + h - 0.7 * h, b, '#B71C1C', 'krav 70 %');
  });
}

/** Läxförhör för läxförhör: linje med punkter, kravlinje 90 %. */
export function laxBild(o: RapportOmraden['laxor']): Promise<ArrayBuffer | null> {
  const B = 640; const H = 210; const x0 = 32; const y0 = 12; const b = B - x0 - 16; const h = H - y0 - 34;
  return rita(B, H, (ctx) => {
    axlar(ctx, x0, y0, b, h);
    const n = o.rader.length;
    const px = (i: number) => (n <= 1 ? x0 + b / 2 : x0 + 12 + (i / (n - 1)) * (b - 24));
    const py = (v: number) => y0 + h - (v / 100) * h;
    kravlinje(ctx, x0, py(90), b, '#B71C1C', 'krav 90 %');
    ctx.strokeStyle = '#1A2A6B'; ctx.lineWidth = 2.2; ctx.beginPath();
    o.rader.forEach((r, i) => (i === 0 ? ctx.moveTo(px(i), py(r.procent)) : ctx.lineTo(px(i), py(r.procent))));
    ctx.stroke();
    o.rader.forEach((r, i) => {
      ctx.fillStyle = r.klarat ? '#43A047' : '#EF6C00';
      ctx.beginPath(); ctx.arc(px(i), py(r.procent), 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#374151'; ctx.textAlign = 'center'; ctx.fillText(`${r.procent}`, px(i), py(r.procent) - 9);
      ctx.fillStyle = '#9CA3AF'; ctx.fillText(etikettDatum(r.datum), px(i), y0 + h + 16);
    });
  });
}

function bild(data: ArrayBuffer, b: number, h: number): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new ImageRun({ data, transformation: { width: b, height: h }, type: 'png' })] });
}

// ── Sida 1 ─────────────────────────────────────────────────────
function oversiktsRuta(o: (typeof OMRADE)[keyof typeof OMRADE], nr: string, ton: OmradeTon, status: string, huvudtal: string, rad: string, bredd: number): TableCell {
  const c = TON[ton];
  return cell([
    p([t(`${nr}  ${o.ikon} ${o.namn}`, { bold: true, size: 20, color: o.farg })], { after: 20 }),
    p([t(o.fraga, { size: 16, color: MUTED })], { after: 80 }),
    p([t(huvudtal, { bold: true, size: 40, color: o.farg })], { after: 20 }),
    p([t(`${c.markor} ${status}`, { bold: true, size: 18, color: c.text })], { after: 40 }),
    p([t(rad, { size: 17 })], { after: 0 }),
  ], { bredd, fyll: o.ljus, marg: 140, kanter: { ...INGA_KANTER, top: { style: BorderStyle.SINGLE, size: 36, color: o.farg }, right: { style: BorderStyle.SINGLE, size: 30, color: 'FFFFFF' } } });
}

function forstaSidan(a: Elevanalys, r: RapportOmraden, meta: RapportMeta): Array<Paragraph | Table> {
  const idag = new Date().toISOString().slice(0, 10);
  const period = a.period.fran !== null || a.period.till !== null
    ? `${a.period.fran !== null ? kortDatum(a.period.fran) : 'start'} – ${a.period.till !== null ? kortDatum(a.period.till) : 'idag'}`
    : r.lektioner.rader.length + r.laxor.rader.length > 0
      ? `${kortDatum([...r.lektioner.rader, ...r.laxor.rader].map((x) => x.datum).sort()[0])} – ${kortDatum([...r.lektioner.rader, ...r.laxor.rader].map((x) => x.datum).sort().pop()!)}`
      : 'hela perioden';
  const b = Math.floor(INNER / (r.prov === null ? 3 : 4));
  const lek = r.lektioner; const lax = r.laxor; const min = r.minne;
  return [
    p([t('ELEVRAPPORT', { bold: true, size: 18, color: MUTED })], { after: 0 }),
    p([t(a.elev.namn, { bold: true, size: 52 })], { after: 0 }),
    p([t([a.amneNamn, meta.klassNamn, meta.grupp].filter((x) => x !== undefined && x !== '').join(' · '), { size: 24, color: '374151' })], { after: 40 }),
    p([t(`Period ${period} · skapad ${kortDatum(idag)} ${idag.slice(0, 4)}`, { size: 17, color: MUTED })], { after: 200 }),
    new Table({
      width: { size: INNER, type: WidthType.DXA }, columnWidths: r.prov === null ? [b, b, b] : [b, b, b, b], layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: [
        oversiktsRuta(OMRADE.lektioner, '1', lek.ton, lek.status, lek.snitt === null ? '—' : `${lek.snitt} %`,
          lek.rader.length === 0 ? 'Inga exit tickets i perioden.' : `Exit ticket i snitt. Nådde 70 % på ${lek.klarade} av ${lek.rader.length} lektioner.`, b),
        oversiktsRuta(OMRADE.laxor, '2', lax.ton, lax.status, lax.rader.length === 0 ? '—' : `${lax.rader[lax.rader.length - 1].procent} %`,
          lax.rader.length === 0 ? 'Inga läxförhör i perioden.' : `Senaste läxförhöret. ${lax.vantTotalt} begrepp har gått från fel till rätt.`, b),
        oversiktsRuta(OMRADE.minne, '3', min.ton, min.status, min.testadeIgen === 0 ? '—' : `${Math.round((min.hallerI / min.testadeIgen) * 100)} %`,
          min.testadeIgen === 0 ? 'Inget inlärt begrepp har testats igen ännu.' : `av inlärda begrepp var rätt varje gång. ${min.flaggade.length} börjar glömmas.`, b),
        ...(r.prov === null ? [] : [oversiktsRuta(OMRADE.prov, '4', r.prov.ton, r.prov.status, r.prov.nyckeltal[0].varde,
          `Senaste provet (${kortDatum(r.prov.rader[r.prov.rader.length - 1].datum)}). Klassens snitt ${r.prov.nyckeltal[1].varde}.`, b)]),
      ] })],
    }),
    luft(200),
    p([t('Begreppen just nu', { bold: true, size: 26 })], { after: 20, keepNext: true }),
    liten(a.nu.senastDatum !== null ? `Senaste svaret på varje begreppsfråga, till och med ${kortDatum(a.nu.senastDatum)}.` : 'Inga begreppsfrågor med svar i perioden.'),
    ...(() => { const n = nyckeltalRad(a.nu.fragor.length === 0 ? [] : [
      { etikett: 'Testade begrepp', varde: String(a.nu.fragor.length) },
      { etikett: 'Rätt i senaste försöket', varde: String(a.nu.kan.length), under: `${a.nu.procent ?? '—'} %` },
      { etikett: 'Kvar att lära', varde: String(a.nu.kvar.length), under: 'fel i senaste försöket' },
      { etikett: 'Vände till rätt', varde: String(a.nu.fixat.length), under: 'efter tidigare fel' },
    ], '374151'); return n === null ? [] : [n]; })(),
    luft(200),
    p([t('Så går du vidare', { bold: true, size: 26 })], { after: 80, keepNext: true }),
    ...(r.fokus.length === 0 ? [liten('Inga resultat i perioden.')] : r.fokus.flatMap((f, i) => [
      new Table({
        width: { size: INNER, type: WidthType.DXA }, columnWidths: [520, INNER - 520], layout: TableLayoutType.FIXED,
        rows: [new TableRow({ cantSplit: true, children: [
          cell([p([t(String(i + 1), { bold: true, size: 28, color: 'E65100' })], { after: 0, align: AlignmentType.CENTER })], { bredd: 520, fyll: 'FFF3E0', marg: 100, v: VerticalAlign.CENTER }),
          cell([p([t(f.rubrik, { bold: true })], { after: 20 }), p([t(f.text, { size: 19 })], { after: 0 })], { bredd: INNER - 520, fyll: 'FFFAF3', marg: 100 }),
        ] })],
      }),
      luft(80),
    ])),
    luft(120),
    liten('Så läser du rapporten: 70 % (exit ticket) och 90 % (läxförhör) är gränser för förhörens begreppsfrågor, inte ämnesbetyg. Rapporten beskriver resultaten; orsakerna följs upp i samtal. Jämförelsen görs mot dina egna tidigare resultat. Bilaga A visar varje fråga och bilaga B vad du kan läsa.'),
  ];
}

// ── Områdena ────────────────────────────────────────────────────
async function lektionsOmrade(r: RapportOmraden): Promise<Array<Paragraph | Table>> {
  const o = r.lektioner; const u: Array<Paragraph | Table> = [...omradesBand('1', OMRADE.lektioner, true)];
  u.push(liten('Exit ticket i slutet av lektionen prövar det ni har arbetat med under just den lektionen. Läxförhöret räknas inte här – det redovisas under Läxorna.'));
  u.push(slutsats(o.ton, o.status, o.slutsats), luft(100));
  const nt = nyckeltalRad(o.nyckeltal, OMRADE.lektioner.farg); if (nt !== null) u.push(nt, luft(100));
  if (o.rader.length > 0) {
    const img = await lektionsBild(o);
    if (img !== null) u.push(bild(img, 600, 197), liten('Grön stapel = nådde 70 %, orange = under 70 %. Den streckade linjen visar kravet.'));
    u.push(underrubrik('Lektion för lektion'));
    u.push(dataTabell(['Datum', 'Exit ticket', 'Resultat', 'Nådde 70 %', 'Nivå'], [16, 38, 12, 14, 20],
      o.rader.map((x) => [kortDatum(x.datum), x.prov, { text: `${x.procent} %`, bold: true }, bock(x.klarat), x.niva])));
  }
  return u;
}

async function laxOmrade(r: RapportOmraden): Promise<Array<Paragraph | Table>> {
  const o = r.laxor; const u: Array<Paragraph | Table> = [...omradesBand('2', OMRADE.laxor, true)];
  u.push(liten('Läxförhöret i början av lektionen prövar läxan: begreppen från förra lektionen och från tidigare läxor. Det viktiga är att resultatet ökar från gång till gång och att fel blir rätt.'));
  u.push(slutsats(o.ton, o.status, o.slutsats), luft(100));
  const nt = nyckeltalRad(o.nyckeltal, OMRADE.laxor.farg); if (nt !== null) u.push(nt, luft(100));
  if (o.rader.length > 0) {
    const img = await laxBild(o);
    if (img !== null) u.push(bild(img, 600, 197), liten('Varje punkt är ett läxförhör. Grön = nådde 90 %, orange = under 90 %.'));
    u.push(underrubrik('Läxförhör för läxförhör'));
    const del = (x: { ratt: number; antal: number } | null) => (x === null ? '—' : `${x.ratt} av ${x.antal}`);
    const harNya = o.rader.some((x) => x.nya !== null);
    u.push(dataTabell(['Datum', 'Läxförhör', 'Resultat', 'Nådde 90 %', 'Förra lektionen', 'Tidigare läxor', ...(harNya ? ['Nya'] : [])], harNya ? [14, 26, 10, 12, 14, 14, 10] : [15, 29, 11, 13, 16, 16],
      o.rader.map((x) => [kortDatum(x.datum), x.prov, { text: `${x.procent} %`, bold: true }, bock(x.klarat), del(x.forraLektionen), del(x.tidigare), ...(harNya ? [del(x.nya)] : [])])));
    u.push(liten('Förra lektionen = begreppen från exit ticket sedan förra läxförhöret. Tidigare läxor = begrepp från tidigare förhör; visar om du läser hela läxan och inte bara det senaste.'));
  }
  if (o.vandSteg.length > 0) {
    u.push(underrubrik(`Från fel till rätt (${o.vantTotalt})`, '1B5E20'));
    u.push(dataTabell(['Mellan förhören', 'Antal', 'Begrepp'], [30, 10, 60],
      o.vandSteg.map((s) => [`${kortDatum(s.franDatum)} → ${kortDatum(s.tillDatum)}`, { text: `+${s.antal}`, farg: '1B5E20', bold: true }, s.begrepp.join(' · ')])));
  }
  if (o.kvar.length > 0) {
    u.push(underrubrik(`Kvar att lära – fel i senaste försöket (${o.kvar.length})`, 'B71C1C'));
    u.push(...punktlista(o.kvar.map((x) => [
      ...(x.begrepp !== undefined ? [t(`${x.begrepp} — `, { bold: true, size: 19 })] : []), t(x.fraga, { size: 19 }),
      t(`  ${x.kod} · ${x.prov} ${kortDatum(x.datum)}`, { size: 16, color: MUTED }),
    ])));
  }
  if (o.fixat.length > 0) {
    u.push(underrubrik(`Rätt i senaste försöket efter tidigare fel (${o.fixat.length})`, '1B5E20'));
    u.push(p([t(o.fixat.map((x) => x.begrepp ?? x.fraga).join(' · '), { size: 19 })]));
  }
  return u;
}

function glomskaRad(g: GlomskaBegrepp): Array<TextRun> {
  return [
    t(`${g.begrepp ?? g.fraga}`, { bold: true, size: 19 }), ...(g.begrepp !== undefined ? [t(` — ${g.fraga}`, { size: 19 })] : []),
    t(`  ${g.kod} · rätt ${kortDatum(g.kundeDatum)}, fel ${g.fel.map((f) => kortDatum(f.datum)).join(' och ')}`, { size: 16, color: MUTED }),
  ];
}

function minnesOmrade(r: RapportOmraden): Array<Paragraph | Table> {
  const o = r.minne; const u: Array<Paragraph | Table> = [...omradesBand('3', OMRADE.minne, true)];
  u.push(liten('Läxförhören tar upp tidigare begrepp igen. Ett begrepp räknas som inlärt från första gången du svarade rätt. Om det sedan är fel de två senaste gångerna flaggas det. Ett enstaka fel noteras bara – det är lätt att trycka fel.'));
  u.push(slutsats(o.ton, o.status, o.slutsats), luft(100));
  const nt = nyckeltalRad(o.nyckeltal, OMRADE.minne.farg); if (nt !== null) u.push(nt, luft(100));
  if (o.flaggade.length > 0) {
    u.push(underrubrik(`Börjar glömmas – repetera (${o.flaggade.length})`, 'B71C1C'));
    u.push(...punktlista(o.flaggade.map(glomskaRad)));
  }
  if (o.noterade.length > 0) {
    u.push(underrubrik(`Noterat: enstaka fel på inlärda begrepp (${o.noterade.length})`, MUTED));
    u.push(p([t(o.noterade.map((g) => `${g.begrepp ?? g.fraga} (${kortDatum(g.fel[g.fel.length - 1].datum)})`).join(' · '), { size: 17, color: MUTED })]));
    u.push(liten('Dessa flaggas inte. Blir samma begrepp fel även nästa gång flyttas det till ”börjar glömmas”.'));
  }
  return u;
}

function provOmrade(r: RapportOmraden): Array<Paragraph | Table> {
  const o = r.prov; if (o === null) return [];
  const u: Array<Paragraph | Table> = [...omradesBand('4', OMRADE.prov, true)];
  u.push(liten('Proven skrivs i DigiExam och bedöms per förmåga. Här visas poängen och klassens snitt på samma prov. Betyget sätts av läraren utifrån förmågorna.'));
  u.push(slutsats(o.ton, o.status, o.slutsats), luft(100));
  const nt = nyckeltalRad(o.nyckeltal, OMRADE.prov.farg); if (nt !== null) u.push(nt, luft(100));
  const tal = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','));
  u.push(underrubrik('Prov för prov'));
  u.push(dataTabell(['Datum', 'Prov', 'Poäng', 'Resultat', 'Klassens snitt', 'Mot klassen'], [15, 33, 13, 12, 14, 13],
    o.rader.map((x) => [kortDatum(x.datum), x.prov, `${tal(x.poang)} / ${tal(x.maxPoang)}`, { text: x.procent !== null ? `${x.procent} %` : '—', bold: true },
      x.klassSnitt !== null ? `${x.klassSnitt} %` : '—',
      x.mot === null ? '—' : { text: `${x.mot > 0 ? '+' : x.mot < 0 ? '−' : ''}${Math.abs(x.mot)}`, farg: x.mot >= 0 ? '1B5E20' : 'B71C1C', bold: true }])));
  return u;
}

// ── Bilaga A: frågematrisen, som på skärmen ─────────────────────
export function veckaFor(datum: string): number {
  const d = new Date(`${datum}T00:00:00Z`); const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const ar = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - ar.getTime()) / 86_400_000 + 1) / 7);
}

/** Frågematrisens kolumnbredder (twips) i liggande A4. Returnerar hur många frågor som ryms per block. */
// Smala etikettkolumner och små rutor, så att en hel klass frågor (upp till ~70) ryms i EN matris som på skärmen
const FM_ETIKETT = [460, 1050, 950, 2050];
const FM_MIN = 150;

function matrisBlock(a: Elevanalys, fran: number, till: number): Table {
  const m = a.matris;
  const fragor = m.fragor.slice(fran, till);
  const etikett = FM_ETIKETT.reduce((x, y) => x + y, 0);
  const rut = Math.max(FM_MIN, Math.min(420, Math.floor((INNER_LIGG - etikett) / Math.max(1, fragor.length))));
  const bredder = [...FM_ETIKETT, ...fragor.map(() => rut)];
  const vit = { style: BorderStyle.SINGLE, size: 12, color: 'FFFFFF' };
  const VIT = { top: vit, bottom: vit, left: vit, right: vit };
  const gstart = (nr: number) => m.grupper.some((g) => g.fran === nr);
  const kantFor = (nr: number) => (gstart(nr) ? { ...VIT, left: { style: BorderStyle.SINGLE, size: 16, color: FM.gstart } } : VIT);
  const cellP = (barn: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) => new Paragraph({ children: barn, alignment: align, spacing: { after: 0 } });
  const tc = (barn: Paragraph[], o: { b: number; fyll?: string; span?: number; kant?: object }) => new TableCell({
    children: barn, width: { size: o.b, type: WidthType.DXA }, ...(o.span !== undefined ? { columnSpan: o.span } : {}),
    ...(o.fyll !== undefined ? { shading: { type: ShadingType.CLEAR, fill: o.fyll, color: 'auto' } } : {}),
    borders: (o.kant ?? VIT) as never, margins: { top: 20, bottom: 20, left: 25, right: 25 }, verticalAlign: VerticalAlign.CENTER,
  });
  // Rad 1: hörn + grupper (ursprungsprovet och "kod · N frågor")
  const grupper = m.grupper.map((g) => ({ ...g, a: Math.max(g.fran, fran + 1), b: Math.min(g.till, till) })).filter((g) => g.a <= g.b);
  const rad1 = new TableRow({ children: [
    tc([cellP([])], { b: etikett, span: 4 }),
    ...grupper.map((g) => tc([
      cellP([t(g.ursprung, { bold: true, size: 14, color: FM.gruppText })], AlignmentType.CENTER),
      cellP([t(`${g.kod !== '—' ? `${g.kod} · ` : ''}${g.till - g.fran + 1} frågor`, { size: 12, color: FM.gruppUnder })], AlignmentType.CENTER),
    ], { b: rut * (g.b - g.a + 1), span: g.b - g.a + 1, fyll: FM.grupp, kant: { ...VIT, bottom: { style: BorderStyle.SINGLE, size: 16, color: FM.gstart } } })),
  ] });
  // Rad 2: Vecka · Datum · Typ · Förhör · frågenummer
  const rad2 = new TableRow({ tableHeader: true, children: [
    ...['Vecka', 'Datum', 'Typ', 'Förhör'].map((h, i) => tc([cellP([t(h, { bold: true, size: 14, color: MUTED })])], { b: FM_ETIKETT[i] })),
    ...fragor.map((fr) => tc([cellP([t(String(fr.nr), { size: 12, color: FM.nr })], AlignmentType.CENTER)], { b: rut, kant: kantFor(fr.nr) })),
  ] });
  const rader = [...m.rader].sort((x, y) => x.datum.localeCompare(y.datum) || (x.tid ?? '').localeCompare(y.tid ?? ''));
  const kropp = rader.map((rad) => new TableRow({ cantSplit: true, height: { value: 300, rule: HeightRule.ATLEAST }, children: [
    tc([cellP([t(`v${veckaFor(rad.datum)}`, { size: 14, color: MUTED })])], { b: FM_ETIKETT[0] }),
    tc([cellP([t(kortDatum(rad.datum), { size: 14, color: MUTED }), ...(rad.tid !== undefined ? [t(` ${rad.tid}`, { bold: true, size: 14 })] : [])])], { b: FM_ETIKETT[1] }),
    tc([cellP([t(TYP[rad.kalla].namn, { bold: true, size: 13, color: TYP[rad.kalla].text })])], { b: FM_ETIKETT[2], fyll: TYP[rad.kalla].fyll }),
    tc([cellP([t(rad.prov, { bold: true, size: 15 })])], { b: FM_ETIKETT[3] }),
    ...fragor.map((fr) => {
      const i = m.fragor.indexOf(fr);
      const fanns = rad.celler[i] !== null;
      const svar = rad.elevCeller?.[i];
      const fyll = !fanns ? FM.tom : svar === true ? FM.ratt : svar === false ? FM.fel : FM.tom;
      return tc([cellP([])], { b: rut, fyll, kant: kantFor(fr.nr) });
    }),
  ] }));
  // Som på skärmen: bara Socrative-förhör hör hemma i frågematrisen (prov och Magma har egna vyer)
  const utan = m.utanSvar.filter((u) => u.kalla.startsWith('socrative')).map((u) => new TableRow({ cantSplit: true, children: [
    tc([cellP([t(`v${veckaFor(u.datum)}`, { size: 14, color: MUTED })])], { b: FM_ETIKETT[0] }),
    tc([cellP([t(kortDatum(u.datum), { size: 14, color: MUTED })])], { b: FM_ETIKETT[1] }),
    tc([cellP([t(TYP[u.kalla].namn, { bold: true, size: 13, color: TYP[u.kalla].text })])], { b: FM_ETIKETT[2], fyll: TYP[u.kalla].fyll }),
    tc([cellP([t(u.prov, { bold: true, size: 15 })])], { b: FM_ETIKETT[3] }),
    tc([cellP([t('⚠ resultat utan svar per fråga', { size: 13, color: MUTED, italics: true })])], { b: rut * fragor.length, span: fragor.length }),
  ] }));
  return new Table({ width: { size: etikett + rut * fragor.length, type: WidthType.DXA }, columnWidths: bredder, layout: TableLayoutType.FIXED, rows: [rad1, rad2, ...kropp, ...utan] });
}

/** Delar frågorna i block som ryms på bredden — vid gränser mellan delkapitel när det går. */
function matrisBlockGranser(a: Elevanalys): Array<[number, number]> {
  const n = a.matris.fragor.length;
  const ryms = Math.max(8, Math.floor((INNER_LIGG - FM_ETIKETT.reduce((x, y) => x + y, 0)) / FM_MIN));
  if (n <= ryms) return [[0, n]];
  const block: Array<[number, number]> = [];
  let start = 0;
  while (start < n) {
    let slut = Math.min(n, start + ryms);
    if (slut < n) {
      const brytpunkt = a.matris.grupper.map((g) => g.fran - 1).filter((i) => i > start && i <= slut).pop();
      if (brytpunkt !== undefined) slut = brytpunkt;
    }
    block.push([start, slut]); start = slut;
  }
  return block;
}

function bilagaA(a: Elevanalys): Array<Paragraph | Table> {
  const m = a.matris;
  const u: Array<Paragraph | Table> = [
    p([t('Bilaga A', { bold: true, size: 18, color: MUTED })], { after: 0 }),
    p([t('Fråga för fråga', { bold: true, size: 32 })], { after: 60 }),
  ];
  if (m.fragor.length === 0) { u.push(liten('Det finns inga förhör med svar per fråga i perioden.')); return u; }
  u.push(p([
    t('■ ', { color: FM.ratt, size: 22 }), t('rätt   ', { size: 17 }),
    t('■ ', { color: FM.fel, size: 22 }), t('fel   ', { size: 17 }),
    t('■ ', { color: 'D9DDE3', size: 22 }), t('ingick inte eller besvarades inte   ', { size: 17 }),
    t('Samma fråga har samma nummer i alla förhör. Kolumnerna är grupperade efter det förhör där frågan ställdes första gången.', { size: 17, color: MUTED }),
  ], { after: 100 }));
  for (const [fran, till] of matrisBlockGranser(a)) u.push(matrisBlock(a, fran, till), luft(120));
  u.push(p([t('Frågorna', { bold: true, size: 24 })], { before: 120, after: 60, keepNext: true }));
  const bred = INNER_LIGG;
  const bb = [500, 700, 3200, bred - 4400];
  const kant = { top: tunn(), bottom: tunn(), left: ingenKant, right: ingenKant };
  u.push(new Table({
    width: { size: bred, type: WidthType.DXA }, columnWidths: bb, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: ['Nr', 'Del', 'Rätt svar (begrepp)', 'Fråga'].map((h, i) => cell([p([t(h, { bold: true, size: 16, color: MUTED })], { after: 0 })], { bredd: bb[i], fyll: YTA, marg: 40, kanter: kant })) }),
      ...m.fragor.map((fr) => new TableRow({ cantSplit: true, children: [
        cell([p([t(String(fr.nr), { size: 16, color: MUTED })], { after: 0 })], { bredd: bb[0], marg: 30, kanter: kant }),
        cell([p([t(fr.kod, { size: 16 })], { after: 0 })], { bredd: bb[1], marg: 30, kanter: kant }),
        cell([p([t(fr.begrepp ?? '—', { size: 16, bold: fr.begrepp !== undefined })], { after: 0 })], { bredd: bb[2], marg: 30, kanter: kant }),
        cell([p([t(fr.fraga, { size: 16 })], { after: 0 })], { bredd: bb[3], marg: 30, kanter: kant }),
      ] })),
    ],
  }));
  return u;
}

// ── Bilaga B: att läsa ─────────────────────────────────────────
function bilagaB(a: Elevanalys, r: RapportOmraden): Array<Paragraph | Table> {
  const u: Array<Paragraph | Table> = [
    new Paragraph({ children: [new PageBreak()] }),
    p([t('Bilaga B', { bold: true, size: 18, color: MUTED })], { after: 0 }),
    p([t('Att läsa och öva', { bold: true, size: 32 })], { after: 60 }),
    liten('Sammanfattningarna och förklaringarna kommer från läroboken. Begrepp markerade med ★ ska du repetera eller lära dig (se område 2 och 3).'),
  ];
  const markerade = new Set([...r.minne.flaggade.map((g) => (g.begrepp ?? '').toLowerCase()), ...r.laxor.kvar.map((k) => (k.begrepp ?? '').toLowerCase())].filter((x) => x !== ''));
  if (a.ovningar.length > 0 || a.filmer.length > 0) {
    u.push(underrubrik('Länkar'));
    for (const o of a.ovningar) u.push(lank(`Öva i Socrative: ${o.rum} — ${o.kod} ${o.namn}`, o.url));
    for (const f of a.filmer) u.push(lank(`Film: ${f.titel} (${f.for})`, f.url));
  }
  const kapitel = a.rapport?.kapitel ?? [];
  if (kapitel.length === 0 && a.ovningar.length === 0 && a.filmer.length === 0) u.push(liten('Det finns ännu inga sammanfattningar eller länkar för ämnet.'));
  for (const k of kapitel) {
    if (k.sammanfattning === null && k.attOva.length === 0) continue;
    u.push(p([t(`Kapitel ${k.nr} ${k.namn}`, { bold: true, size: 24, color: OMRADE.laxor.farg })], { before: 200, after: 60, keepNext: true }));
    if (k.sammanfattning !== null) {
      u.push(underrubrik('Sammanfattning'));
      for (const rad of k.sammanfattning.split('\n').filter((x) => x.trim() !== '')) u.push(p([t(rad, { size: 19 })], { after: 40 }));
    }
    if (k.attOva.length > 0) {
      u.push(underrubrik('Begrepp'));
      u.push(...punktlista(k.attOva.map((b) => [
        ...(markerade.has(b.begrepp.toLowerCase()) ? [t('★ ', { bold: true, color: 'E65100', size: 19 })] : []),
        t(b.begrepp, { bold: true, size: 19 }), ...(b.forklaring !== null ? [t(` — ${b.forklaring}`, { size: 19 })] : []),
      ])));
    }
  }
  return u;
}

// ── Dokumentet ─────────────────────────────────────────────────
export interface RapportMeta { klassNamn?: string; grupp?: string }

function sidhuvud(a: Elevanalys): Header {
  return new Header({ children: [p([t(`${a.elev.namn} · ${a.amneNamn}`, { size: 16, color: '9CA3AF' })], { align: AlignmentType.RIGHT, after: 0 })] });
}
function sidfot(): Footer {
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ children: ['Sida ', PageNumber.CURRENT, ' av ', PageNumber.TOTAL_PAGES], size: 16, color: '9CA3AF' }),
  ] })] });
}

/** Bygger elevrapporten (Del 151) som docx-dokument. */
export async function elevrapportDokument(a: Elevanalys, meta: RapportMeta = {}): Promise<Document> {
  const r = rapportOmraden(a);
  const staende: ISectionOptions['properties'] = { page: { size: { width: A4.b, height: A4.h }, margin: { top: MARG, bottom: MARG, left: MARG, right: MARG, header: 500, footer: 500 } } };
  const huvud = [
    ...forstaSidan(a, r, meta),
    ...(await lektionsOmrade(r)),
    ...(await laxOmrade(r)),
    ...minnesOmrade(r),
    ...provOmrade(r),
  ];
  return new Document({
    creator: 'Classroom Planner', title: `Elevrapport ${a.elev.namn} ${a.amneNamn}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 20, color: TEXT, language: { value: 'sv-SE' } }, paragraph: { spacing: { after: 80, line: 264, lineRule: LineRuleType.AUTO } } } } },
    sections: [
      { properties: staende, headers: { default: sidhuvud(a) }, footers: { default: sidfot() }, children: huvud },
      { properties: { page: { size: { width: A4.b, height: A4.h, orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720, header: 400, footer: 400 } } },
        headers: { default: sidhuvud(a) }, footers: { default: sidfot() }, children: bilagaA(a) },
      { properties: staende, headers: { default: sidhuvud(a) }, footers: { default: sidfot() }, children: bilagaB(a, r).slice(1) },
    ],
  });
}

/** Rapporten som blob (webbläsaren). */
export async function elevrapportBlob(a: Elevanalys, meta: RapportMeta = {}): Promise<Blob> {
  return Packer.toBlob(await elevrapportDokument(a, meta));
}
