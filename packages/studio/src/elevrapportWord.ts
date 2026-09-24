/**
 * Elevrapport → Word (.docx).
 *
 * Diagrammen ritas på en canvas och bäddas in som PNG — SVG:t i gränssnittet
 * går inte att lägga i ett Word-dokument. Texten kommer från elevanalys, så
 * utskriften säger samma sak som skärmen.
 */
import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { elevrapportBlob, type RapportMeta } from './elevrapportLayout.js';
import { forklaring, niva, type Elevanalys, type EnkelRapport, type ForklaringId, type Studieguide } from '@planner/kernel';

const BLA = '#2f5aa8'; const GRON = '#1B5E20'; const ROD = '#B71C1C'; const GRA = '#9AA3AE';
const TON_FARG = { bra: 'E8F5E9', okej: 'FFF8E1', oro: 'FFEBEE' } as const;

function canvas(bredd: number, hojd: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = bredd * 2; c.height = hojd * 2; // 2× för skärpa i utskrift
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('Kunde inte rita diagrammet.');
  ctx.scale(2, 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, bredd, hojd);
  ctx.font = '11px Segoe UI, Arial, sans-serif';
  return { c, ctx };
}

async function png(c: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (blob === null) throw new Error('Kunde inte spara diagrammet.');
  return blob.arrayBuffer();
}

function rutnat(ctx: CanvasRenderingContext2D, x0: number, y0: number, b: number, h: number, hogsta = 100): void {
  ctx.strokeStyle = '#E4E8EF'; ctx.fillStyle = GRA; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (let p = 0; p <= hogsta; p += hogsta / 4) {
    const y = y0 + h - (p / hogsta) * h;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + b, y); ctx.stroke();
    ctx.fillText(`${Math.round(p)}`, x0 - 6, y + 4);
  }
}

function bild(data: ArrayBuffer, bredd: number, hojd: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data, transformation: { width: bredd, height: hojd }, type: 'png' })],
  });
}

function punkt(r: { rubrik: string; text: string; ton: 'bra' | 'okej' | 'oro' }): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: TON_FARG[r.ton] },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: r.rubrik, bold: true })] }), new Paragraph(r.text)],
    })] })],
  });
}

function tabell(rubriker: string[], rader: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: rubriker.map((h) => new TableCell({
        shading: { type: ShadingType.CLEAR, fill: 'EEF1F5' },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
      })) }),
      ...rader.map((r) => new TableRow({ children: r.map((v) => new TableCell({ children: [new Paragraph(v)] })) })),
    ],
  });
}

const tom = (): Paragraph => new Paragraph('');

/** Kort förklaring under ett avsnitt, i grått. */
function forklaringRad(id: ForklaringId): Paragraph {
  const f = forklaring(id);
  return new Paragraph({ children: [new TextRun({ text: `${f.kort} ${f.lang[0] ?? ''}`, size: 18, color: '666666', italics: true })] });
}

function lank(text: string, url: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, children: [
    new ExternalHyperlink({ children: [new TextRun({ text, style: 'Hyperlink' })], link: url }),
  ] });
}

/** Filnamn för en elevs rapport. */
export function rapportFilnamn(a: Elevanalys): string {
  return `${a.elev.namn} ${a.amneNamn} rapport.docx`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
}

/**
 * Bygger rapporten som en .docx-blob (delas av enskild nedladdning och klassexporten).
 * Del 151: layouten ligger i elevrapportLayout.ts — områden, bilagor och frågematris.
 */
export async function elevrapportDocx(a: Elevanalys, meta: RapportMeta = {}): Promise<Blob> {
  return elevrapportBlob(a, meta);
}

function laddaNer(blob: Blob, filnamn: string): void {
  const lank = document.createElement('a');
  lank.href = URL.createObjectURL(blob);
  lank.download = filnamn;
  lank.click();
  URL.revokeObjectURL(lank.href);
}

/** Bygger och laddar ner en elevs rapport. */
export async function elevrapportTillWord(a: Elevanalys, meta: RapportMeta = {}): Promise<void> {
  laddaNer(await elevrapportDocx(a, meta), rapportFilnamn(a));
}

/**
 * En Word-fil per elev, packade i ett zip-arkiv — webbläsare blockerar
 * dussintals nedladdningar i rad, och en zip är enklare att lägga i en mapp.
 * `steg` anropas efter varje elev så gränssnittet kan visa hur långt det gått.
 */
export async function klassrapporterTillWord(
  analyser: Elevanalys[], arkivNamn: string, steg?: (klar: number, av: number) => void, meta: RapportMeta = {},
): Promise<void> {
  if (analyser.length === 0) return;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const anvanda = new Set<string>();
  for (const [i, a] of analyser.entries()) {
    let namn = rapportFilnamn(a);
    // Två elever kan heta lika — numrera i så fall
    if (anvanda.has(namn)) namn = namn.replace(/\.docx$/, `-${i + 1}.docx`);
    anvanda.add(namn);
    zip.file(namn, await elevrapportDocx(a, meta));
    steg?.(i + 1, analyser.length);
  }
  laddaNer(await zip.generateAsync({ type: 'blob' }), `${arkivNamn}.zip`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-'));
}

/** Läxförhör till läxförhör: linje med punkter och linjen för godkänt. */
async function laxBild(r: EnkelRapport): Promise<ArrayBuffer | null> {
  if (r.laxforhor.length === 0) return null;
  const B = 620; const H = 220; const x0 = 34; const y0 = 14; const b = B - x0 - 12; const h = H - y0 - 52;
  const { c, ctx } = canvas(B, H);
  rutnat(ctx, x0, y0, b, h);
  const n = r.laxforhor.length;
  const px = (i: number) => (n <= 1 ? x0 + b / 2 : x0 + (i / (n - 1)) * b);
  const py = (p: number) => y0 + h - (p / 100) * h;
  ctx.strokeStyle = '#E65100'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x0, py(90)); ctx.lineTo(x0 + b, py(90)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#E65100'; ctx.textAlign = 'left'; ctx.fillText('Godkänt', x0 + 4, py(90) - 4);
  ctx.strokeStyle = BLA; ctx.lineWidth = 2.2; ctx.beginPath();
  r.laxforhor.forEach((p, i) => (i === 0 ? ctx.moveTo(px(i), py(p.procent)) : ctx.lineTo(px(i), py(p.procent))));
  ctx.stroke();
  ctx.textAlign = 'center';
  r.laxforhor.forEach((p, i) => {
    ctx.fillStyle = p.godkant === false ? ROD : GRON;
    ctx.beginPath(); ctx.arc(px(i), py(p.procent), 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#333'; ctx.fillText(`${p.procent} %`, px(i), py(p.procent) - 9);
    ctx.fillStyle = GRA; ctx.fillText(p.datum.slice(5).replace('-', '/'), px(i), y0 + h + 16);
    if (p.delta !== null) { ctx.fillStyle = p.delta > 0 ? GRON : p.delta < 0 ? ROD : GRA; ctx.fillText(`${p.delta > 0 ? '+' : ''}${p.delta}`, px(i), y0 + h + 30); }
  });
  return png(c);
}

/** Exit ticket → nästa läxförhör per delkapitel som parvisa staplar. */
async function exitLaxBild(r: EnkelRapport): Promise<ArrayBuffer | null> {
  if (r.exitTillLax.length === 0) return null;
  const B = 620; const H = 200; const x0 = 34; const y0 = 14; const b = B - x0 - 12; const h = H - y0 - 46;
  const { c, ctx } = canvas(B, H);
  rutnat(ctx, x0, y0, b, h);
  const band = b / r.exitTillLax.length;
  const bar = Math.min(30, band * 0.28);
  const py = (p: number) => y0 + h - (p / 100) * h;
  r.exitTillLax.forEach((x, i) => {
    const cx = x0 + band * (i + 0.5);
    ctx.fillStyle = '#C7CEDB'; ctx.fillRect(cx - bar - 2, py(x.exitProcent), bar, y0 + h - py(x.exitProcent));
    ctx.fillStyle = x.delta >= 0 ? GRON : ROD; ctx.fillRect(cx + 2, py(x.laxProcent), bar, y0 + h - py(x.laxProcent));
    ctx.textAlign = 'center'; ctx.fillStyle = GRA; ctx.fillText(`${x.exitProcent}`, cx - bar / 2 - 2, py(x.exitProcent) - 4);
    ctx.fillStyle = '#333'; ctx.fillText(`${x.laxProcent}`, cx + bar / 2 + 2, py(x.laxProcent) - 4);
    ctx.fillText(x.kod, cx, y0 + h + 16);
    ctx.fillStyle = x.delta >= 0 ? GRON : ROD; ctx.fillText(`${x.delta > 0 ? '+' : ''}${x.delta}`, cx, y0 + h + 30);
  });
  return png(c);
}

async function enkelBarn(r: EnkelRapport): Promise<Array<Paragraph | Table>> {
  const barn: Array<Paragraph | Table> = [
    new Paragraph({ text: `${r.elev.namn} — ${r.amneNamn}`, heading: HeadingLevel.HEADING_1 }),
    punkt({ rubrik: r.rubrik, text: r.text.join(' '), ton: r.ton }),
    tom(),
  ];
  if (r.laxforhor.length > 0) {
    barn.push(new Paragraph({ text: 'Läxförhör till läxförhör', heading: HeadingLevel.HEADING_2 }));
    barn.push(forklaringRad('laxforhor'));
    const lb = await laxBild(r);
    if (lb !== null) {
      barn.push(bild(lb, 560, 199));
      barn.push(new Paragraph({ children: [new TextRun({ text: 'Grön punkt = godkänt, röd = under. Siffran under datumet är förändringen mot förra förhöret.', size: 18, color: '777777' })] }));
    }
    barn.push(tabell(['Datum', 'Prov', 'Resultat', 'Förändring', 'Bedömning'],
      r.laxforhor.map((x) => [x.datum, x.prov, `${x.procent} %`, x.delta === null ? '—' : `${x.delta > 0 ? '+' : ''}${x.delta}`, niva('socrative-laxforhor', x.procent) ?? '—'])));
    barn.push(tom());
  }
  if (r.exitTillLax.length > 0) {
    barn.push(new Paragraph({ text: 'Från exit ticket till läxförhör', heading: HeadingLevel.HEADING_2 }));
    barn.push(forklaringRad('exitTillLax'));
    const eb = await exitLaxBild(r);
    if (eb !== null) {
      barn.push(bild(eb, 560, 181));
      barn.push(new Paragraph({ children: [new TextRun({ text: 'Grå stapel = exit ticket i slutet av lektionen, färgad = samma delkapitel i nästa läxförhör.', size: 18, color: '777777' })] }));
    }
    barn.push(tabell(['Delkapitel', 'Exit ticket', 'Läxförhör', 'Förändring'],
      r.exitTillLax.map((x) => [x.kod, `${x.exitProcent} % (${x.exitDatum})`, `${x.laxProcent} % (${x.laxDatum})`, `${x.delta > 0 ? '+' : ''}${x.delta}`])));
    barn.push(tom());
  }
  barn.push(new Paragraph({ text: 'Begrepp du haft problem med', heading: HeadingLevel.HEADING_2 }));
  barn.push(forklaringRad('nulage'));
  if (r.kvar.length === 0 && r.vant.length === 0) barn.push(new Paragraph('Inga.'));
  if (r.kvar.length > 0) {
    barn.push(new Paragraph({ children: [new TextRun({ text: `Kvar att lära (${r.kvar.length})`, bold: true })] }));
    for (const x of r.kvar) barn.push(new Paragraph({ bullet: { level: 0 }, children: [
      ...(x.begrepp !== undefined ? [new TextRun({ text: `${x.begrepp} — `, bold: true })] : []), new TextRun(x.fraga),
    ] }));
  }
  if (r.vant.length > 0) {
    barn.push(new Paragraph({ children: [new TextRun({ text: `Var fel, sitter nu (${r.vant.length})`, bold: true })] }));
    for (const x of r.vant) barn.push(new Paragraph({ bullet: { level: 0 }, children: [
      ...(x.begrepp !== undefined ? [new TextRun({ text: `${x.begrepp} — `, bold: true })] : []), new TextRun(x.fraga),
    ] }));
  }
  return barn;
}

/** Den enkla rapporten som ett kort Word-dokument — en sida, ingen grafik. */
export async function enkelRapportTillWord(r: EnkelRapport): Promise<void> {
  const doc = new Document({ sections: [{ children: await enkelBarn(r) }] });
  laddaNer(await Packer.toBlob(doc), `${r.elev.namn} ${r.amneNamn} enkel rapport.docx`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-'));
}

/** En enkel rapport per elev i ett zip-arkiv. */
export async function enklaRapporterTillWord(rapporter: EnkelRapport[], arkivNamn: string, steg?: (klar: number, av: number) => void): Promise<void> {
  if (rapporter.length === 0) return;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const anvanda = new Set<string>();
  for (const [i, r] of rapporter.entries()) {
    let namn = `${r.elev.namn} ${r.amneNamn} enkel rapport.docx`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
    if (anvanda.has(namn)) namn = namn.replace(/\.docx$/, `-${i + 1}.docx`);
    anvanda.add(namn);
    zip.file(namn, await Packer.toBlob(new Document({ sections: [{ children: await enkelBarn(r) }] })));
    steg?.(i + 1, rapporter.length);
  }
  laddaNer(await zip.generateAsync({ type: 'blob' }), `${arkivNamn}.zip`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-'));
}

/** Studieguiden inför prov: plan per dag, begrepp med förklaring, rum och filmer. */
export async function studieguideTillWord(g: Studieguide): Promise<void> {
  const barn: Array<Paragraph | Table> = [
    new Paragraph({ text: `${g.elev.namn} — plugga inför provet i ${g.amneNamn}`, heading: HeadingLevel.HEADING_1 }),
    punkt({ rubrik: g.rubrik, text: g.text.join(' '), ton: g.dagarKvar !== null && g.dagarKvar <= 2 ? 'oro' : 'okej' }),
    tom(),
  ];
  if (g.plan.length > 0) {
    barn.push(new Paragraph({ text: 'Din plan', heading: HeadingLevel.HEADING_2 }));
    barn.push(forklaringRad('studieplan'));
    barn.push(tabell(['Dag', 'Datum', 'Plugga', 'Tid'],
      g.plan.map((d) => [`Dag ${d.dag}`, d.datum ?? '—', d.delar.map((k) => (k === 'repetition' ? 'Repetera allt' : `${k} ${g.delar.find((x) => x.kod === k)?.namn ?? ''}`)).join(', ') || '—', `${d.minuter} min`])));
    barn.push(tom());
  }
  for (const d of g.delar) {
    barn.push(new Paragraph({ text: `${d.kod} ${d.namn}${d.procent !== null ? ` — ${d.procent} % rätt just nu` : ' — inte testat än'}`, heading: HeadingLevel.HEADING_2 }));
    if (d.sammanfattning !== null) barn.push(new Paragraph({ children: [new TextRun({ text: d.sammanfattning, italics: true })] }));
    if (d.plugga.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: `Plugga (${d.plugga.length})`, bold: true })] }));
      for (const b of d.plugga) barn.push(new Paragraph({ bullet: { level: 0 }, children: [
        new TextRun({ text: b.begrepp, bold: true }),
        ...(b.forklaring !== null ? [new TextRun(` — ${b.forklaring}`)] : []),
        new TextRun({ text: b.status === 'otestat' ? '  (inte testad än)' : '  (fel senast)', size: 18, color: '777777' }),
      ] }));
    }
    if (d.sitter.length > 0) barn.push(new Paragraph({ children: [new TextRun({ text: 'Sitter redan: ', bold: true }), new TextRun(d.sitter.join(', '))] }));
    if (d.rum !== null && d.rumUrl !== null) barn.push(lank(`Öva i Socrative-rummet ${d.rum}`, d.rumUrl));
    for (const film of d.filmer) barn.push(lank(`Se: ${film.titel}`, film.url));
    barn.push(tom());
  }
  barn.push(new Paragraph({ text: 'Så pluggar du bäst', heading: HeadingLevel.HEADING_2 }));
  for (const t of g.tips) barn.push(new Paragraph({ bullet: { level: 0 }, text: t }));
  const doc = new Document({ sections: [{ children: barn }] });
  laddaNer(await Packer.toBlob(doc), `${g.elev.namn} ${g.amneNamn} studieguide.docx`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-'));
}
