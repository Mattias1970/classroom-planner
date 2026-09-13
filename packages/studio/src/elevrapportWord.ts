/**
 * Elevrapport → Word (.docx).
 *
 * Diagrammen ritas på en canvas och bäddas in som PNG — SVG:t i gränssnittet
 * går inte att lägga i ett Word-dokument. Texten kommer från elevanalys, så
 * utskriften säger samma sak som skärmen.
 */
import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { forklaring, type Elevanalys, type EnkelRapport, type ForklaringId, type Studieguide } from '@planner/kernel';

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

/** Elevens kurva med kravlinjer och klassens snitt. */
async function kurvBild(a: Elevanalys): Promise<ArrayBuffer> {
  const B = 620; const H = 250; const x0 = 34; const y0 = 14; const b = B - x0 - 12; const h = H - y0 - 56;
  const { c, ctx } = canvas(B, H);
  rutnat(ctx, x0, y0, b, h);
  const n = a.kurva.length;
  const px = (i: number) => (n <= 1 ? x0 + b / 2 : x0 + (i / (n - 1)) * b);
  const py = (p: number) => y0 + h - (p / 100) * h;
  for (const [krav, farg] of [[90, '#E65100'], [70, '#EF9A9A']] as const) {
    ctx.strokeStyle = farg; ctx.setLineDash([5, 4]); ctx.beginPath();
    ctx.moveTo(x0, py(krav)); ctx.lineTo(x0 + b, py(krav)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = farg; ctx.textAlign = 'left'; ctx.fillText('Godkänt', x0 + 4, py(krav) - 4);
  }
  if (n > 0) {
    ctx.strokeStyle = BLA; ctx.lineWidth = 2.2; ctx.beginPath();
    a.kurva.forEach((p, i) => (i === 0 ? ctx.moveTo(px(i), py(p.procent)) : ctx.lineTo(px(i), py(p.procent))));
    ctx.stroke();
    ctx.textAlign = 'center';
    a.kurva.forEach((p, i) => {
      ctx.fillStyle = p.klarat === false ? ROD : BLA;
      ctx.beginPath(); ctx.arc(px(i), py(p.procent), 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillText(`${p.procent}`, px(i), py(p.procent) - 9);
      ctx.fillStyle = GRA;
      ctx.fillText(`T${i + 1}`, px(i), y0 + h + 16);
      ctx.fillText(p.datum.slice(5).replace('-', '/'), px(i), y0 + h + 30);
    });
  }
  return png(c);
}

/** Delkapitel som staplade led per förhör. */
async function ledBild(a: Elevanalys): Promise<ArrayBuffer | null> {
  const rader = a.segment.filter((t) => t.segment.length > 0);
  if (rader.length === 0) return null;
  const B = 620; const H = 240; const x0 = 34; const y0 = 14; const b = B - x0 - 12; const h = H - y0 - 56;
  const { c, ctx } = canvas(B, H);
  const maxF = Math.max(1, ...rader.map((t) => t.antalFragor));
  rutnat(ctx, x0, y0, b, h, maxF);
  const koder = [...new Set(rader.flatMap((t) => t.segment.map((x) => x.kod)))].sort();
  const farger = ['#2f5aa8', '#1B5E20', '#B71C1C', '#E65100', '#6A1B9A', '#00838F'];
  const band = b / rader.length;
  const bredd = Math.min(58, band * 0.55);
  rader.forEach((t, i) => {
    const cx = x0 + band * (i + 0.5);
    let botten = y0 + h;
    for (const seg of t.segment) {
      const hoj = (seg.antalFragor / maxF) * h;
      const fyllt = ((seg.procent ?? 0) / 100) * hoj;
      const farg = farger[koder.indexOf(seg.kod) % farger.length];
      ctx.globalAlpha = 0.16; ctx.fillStyle = farg;
      ctx.fillRect(cx - bredd / 2, botten - hoj, bredd, hoj);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx - bredd / 2, botten - fyllt, bredd, fyllt);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - bredd / 2, botten - hoj, bredd, hoj);
      if (hoj > 15) {
        ctx.fillStyle = fyllt > hoj / 2 ? '#fff' : farg; ctx.textAlign = 'center';
        ctx.fillText(`${seg.kod} ${seg.procent ?? '—'}%`, cx, botten - hoj / 2 + 4);
      }
      botten -= hoj;
    }
    ctx.fillStyle = GRA; ctx.textAlign = 'center';
    ctx.fillText(`T${i + 1}`, cx, y0 + h + 16);
    ctx.fillText(t.datum.slice(5).replace('-', '/'), cx, y0 + h + 30);
  });
  return png(c);
}

/** Stapel per källa: eleven mot klassen. */
async function kallBild(a: Elevanalys): Promise<ArrayBuffer | null> {
  if (a.kallor.length === 0) return null;
  const B = 620; const H = 190; const x0 = 34; const y0 = 14; const b = B - x0 - 12; const h = H - y0 - 46;
  const { c, ctx } = canvas(B, H);
  rutnat(ctx, x0, y0, b, h);
  const band = b / a.kallor.length;
  a.kallor.forEach((k, i) => {
    const cx = x0 + band * (i + 0.5);
    const bar = Math.min(34, band * 0.3);
    const py = (p: number) => y0 + h - (p / 100) * h;
    if (k.snittProcent !== null) {
      ctx.fillStyle = k.krav !== null && k.snittProcent >= k.krav ? GRON : k.snittProcent >= 60 ? '#F9A825' : ROD;
      ctx.fillRect(cx - bar - 2, py(k.snittProcent), bar, y0 + h - py(k.snittProcent));
      ctx.fillStyle = '#333'; ctx.textAlign = 'center';
      ctx.fillText(`${k.snittProcent}`, cx - bar / 2 - 2, py(k.snittProcent) - 5);
    }
    if (k.klassSnitt !== null) {
      ctx.fillStyle = '#C7CEDB';
      ctx.fillRect(cx + 2, py(k.klassSnitt), bar, y0 + h - py(k.klassSnitt));
      ctx.fillStyle = GRA; ctx.textAlign = 'center';
      ctx.fillText(`${k.klassSnitt}`, cx + bar / 2 + 2, py(k.klassSnitt) - 5);
    }
    ctx.fillStyle = '#333'; ctx.textAlign = 'center';
    ctx.fillText(k.namn, cx, y0 + h + 16);
    ctx.fillStyle = GRA;
    ctx.fillText(k.krav !== null ? 'godkäntgräns' : `${k.antal} prov`, cx, y0 + h + 30);
  });
  return png(c);
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

const RATT = 'C8E6C9'; const FEL = 'FFCDD2'; const EJ = 'F2F4F7';

/** Frågematrisen: en rad per förhör, en ruta per fråga (grön rätt, röd fel, tom = ej gjord). */
function matrisTabell(a: Elevanalys): Table[] {
  const m = a.matris;
  if (m.fragor.length === 0 || m.rader.length === 0) return [];
  const rutcell = (fyll: string, text: string): TableCell => new TableCell({
    shading: { type: ShadingType.CLEAR, fill: fyll },
    margins: { top: 20, bottom: 20, left: 20, right: 20 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, size: 12 })] })],
  });
  const huvud = new TableRow({ children: [
    new TableCell({ shading: { type: ShadingType.CLEAR, fill: 'EEF1F5' }, children: [new Paragraph({ children: [new TextRun({ text: 'Quiz', bold: true, size: 16 })] })] }),
    ...m.fragor.map((fr) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: 'EEF1F5' },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(fr.nr), size: 12 })] })],
    })),
  ] });
  const rader = m.rader.map((rad) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph({ children: [
      new TextRun({ text: `${rad.prov}`, size: 14 }),
      new TextRun({ text: `  ${rad.datum.slice(5)}${rad.tid !== undefined ? ` ${rad.tid}` : ''}`, size: 12, color: '888888' }),
    ] })] }),
    ...m.fragor.map((_, i) => {
      const svar = rad.elevCeller?.[i];
      const fanns = rad.celler[i] !== null;
      return rutcell(!fanns ? 'FFFFFF' : svar === true ? RATT : svar === false ? FEL : EJ, !fanns ? '' : svar === true ? '✓' : svar === false ? '✗' : '·');
    }),
  ] }));
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [huvud, ...rader] })];
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

/** Bygger rapporten som en .docx-blob (delas av enskild nedladdning och klassexporten). */
export async function elevrapportDocx(a: Elevanalys): Promise<Blob> {
  const idag = new Date().toISOString().slice(0, 10);
  const senast = a.nu.senastDatum ?? null;
  const barn: Array<Paragraph | Table> = [
    new Paragraph({ text: `${a.elev.namn} — ${a.amneNamn}`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: a.sammanfattning, italics: true })] }),
    new Paragraph({ children: [new TextRun({ text: `Rapport skapad ${idag}${a.period.fran !== null || a.period.till !== null ? ` · period ${a.period.fran ?? 'start'} – ${a.period.till ?? 'idag'}` : ''}. Förhörsgränserna 90 % (läxförhör) och 70 % (exit ticket) gäller begreppsfrågorna och är inte ett ämnesbetyg.`, color: '777777', size: 18 })] }),
    tom(),
  ];

  // ── 1. Aktuellt kunnande ──
  barn.push(new Paragraph({ text: `1. Aktuellt kunnande${senast !== null ? ` (senaste försöket per fråga, till och med ${senast})` : ''}`, heading: HeadingLevel.HEADING_2 }));
  barn.push(forklaringRad('nulage'));
  if (a.nu.fragor.length === 0) barn.push(new Paragraph('Inga begreppsfrågor med svar i perioden.'));
  else {
    barn.push(new Paragraph({ children: [new TextRun({ text: `Rätt på ${a.nu.kan.length} av ${a.nu.fragor.length} testade begreppsfrågor (${a.nu.procent} %). ${a.nu.kvar.length} var fel i senaste försöket.`, bold: true })] }));
    barn.push(tabell(['Delkapitel', 'Rätt', 'Fel', 'Andel', 'Senast testat'],
      a.nu.delkapitel.map((d) => [d.kod, String(d.ratt), String(d.fel), `${d.procent} %`, `${d.senastProv ?? '—'} ${d.senastDatum ?? ''}`])));
    if (a.nu.kvar.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: `Fel i senaste försöket (${a.nu.kvar.length})`, bold: true })] }));
      for (const x of a.nu.kvar) barn.push(new Paragraph({ bullet: { level: 0 }, children: [
        ...(x.begrepp !== undefined ? [new TextRun({ text: `${x.begrepp} — `, bold: true })] : []), new TextRun(x.fraga),
        new TextRun({ text: `  (${x.kod}, ${x.senastProv} ${x.senastDatum})`, size: 18, color: '777777' }),
      ] }));
    }
    if (a.nu.fixat.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: `Rätt i senaste försöket efter tidigare fel (${a.nu.fixat.length})`, bold: true })] }));
      for (const x of a.nu.fixat) barn.push(new Paragraph({ bullet: { level: 0 }, children: [
        ...(x.begrepp !== undefined ? [new TextRun({ text: `${x.begrepp} — `, bold: true })] : []), new TextRun(x.fraga),
        new TextRun({ text: `  (${x.kod}, ${x.tidigareFel} fel tidigare)`, size: 18, color: '777777' }),
      ] }));
    }
  }
  barn.push(tom());

  // ── 2. Nästa steg ──
  barn.push(new Paragraph({ text: '2. Nästa steg — fokus, lärarstöd och uppföljning', heading: HeadingLevel.HEADING_2 }));
  for (const r of a.rad) { barn.push(punkt(r), tom()); }
  if (a.ovningar.length > 0 || a.filmer.length > 0) {
    if (a.ovningar.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: 'Socrative-rum att öva i:', bold: true })] }));
      for (const o of a.ovningar) barn.push(lank(`${o.rum} — ${o.kod} ${o.namn}`, o.url));
    }
    if (a.filmer.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: 'Filmer:', bold: true })] }));
      for (const film of a.filmer) barn.push(lank(`${film.titel} (${film.for})`, film.url));
    }
    barn.push(tom());
  }

  // ── 3. Historik ──
  barn.push(new Paragraph({ text: '3. Historik — resultat med datum', heading: HeadingLevel.HEADING_2 }));
  for (const r of a.laget) { barn.push(punkt(r), tom()); }
  if (a.laget.length === 0) barn.push(new Paragraph('Inga resultat i perioden.'), tom());
  if (a.kurva.length > 0) {
    barn.push(forklaringRad('laxforhor'));
    barn.push(forklaringRad('exit'));
    barn.push(bild(await kurvBild(a), 560, 226));
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Varje punkt är ett prov. Streckade linjer är förhörsgränserna: 90 % för läxförhör, 70 % för exit ticket. Jämförelsen är mot dina egna tidigare resultat.', size: 18, color: '777777' })] }));
    barn.push(tabell(['Nr', 'Datum', 'Prov', 'Resultat', 'Förhörsgräns'],
      a.kurva.map((p, i) => [`T${i + 1}`, p.datum, p.prov, `${p.procent} %`, p.klarat === null ? '—' : p.klarat ? 'nådd' : 'ej nådd'])));
    barn.push(tom());
  }
  const lb = await ledBild(a);
  if (lb !== null) {
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Delkapitel i förhören', bold: true })] }));
    barn.push(forklaringRad('delkapitel'));
    barn.push(bild(lb, 560, 217));
    barn.push(tom());
  }
  const kb = await kallBild(a);
  if (kb !== null) {
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Snitt per testtyp, du och klassen', bold: true })] }));
    barn.push(bild(kb, 560, 172));
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Färgad stapel = du, grå = klassens snitt. Klassens snitt är en referens, inte målet — målet är din egen utveckling.', size: 18, color: '777777' })] }));
    barn.push(tom());
  }

  // ── Bilaga A: frågematris ──
  const matris = matrisTabell(a);
  if (matris.length > 0) {
    barn.push(new Paragraph({ text: 'Bilaga A — Fråga för fråga', heading: HeadingLevel.HEADING_2, pageBreakBefore: true }));
    barn.push(forklaringRad('fragematris'));
    barn.push(...matris);
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Grön ruta = rätt, röd = fel, tom = frågan ingick inte i det quizet. Samma fråga har samma nummer i alla quiz.', size: 18, color: '777777' })] }));
    for (const g of a.matris.grupper) {
      barn.push(new Paragraph({ children: [new TextRun({ text: `Fråga ${g.fran}–${g.till}: ${g.ursprung}${g.kod !== '—' ? ` (${g.kod})` : ''}`, size: 18, color: '777777' })] }));
    }
    barn.push(tom());
  }

  // ── Bilaga B: begrepp med förklaringar ──
  if (a.fastnat.length > 0 || a.rapport !== null) {
    barn.push(new Paragraph({ text: 'Bilaga B — Begrepp och förklaringar', heading: HeadingLevel.HEADING_2, pageBreakBefore: true }));
    if (a.fastnat.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: 'Begrepp som varit fel minst två gånger', bold: true })] }));
      barn.push(forklaringRad('fastnat'));
      barn.push(tabell(['Begrepp', 'Delkapitel', 'Fel', 'Senast fel'],
        a.fastnat.slice(0, 15).map((b) => [b.fraga, b.kod, String(b.antalFel), b.senasteFel])));
      barn.push(tom());
    }
    if (a.rapport !== null) {
      for (const k of a.rapport.kapitel) {
        barn.push(new Paragraph({ children: [new TextRun({ text: `Kapitel ${k.nr} ${k.namn}`, bold: true })] }));
        barn.push(tabell(['Delkapitel', 'Begreppsfrågor just nu', 'Äldre prov'],
          k.delkapitel.map((d) => {
            const nuDel = a.nu.delkapitel.find((x) => x.kod === d.kod);
            return [`${d.kod} ${d.namn}`,
              nuDel === undefined || nuDel.procent === null ? 'inte testat' : `${nuDel.procent} % (${nuDel.senastDatum ?? ''})`,
              d.senaste.map((x) => `${x.procent} % (${x.datum})`).join(', ') || '—'];
          })));
        if (k.sammanfattning !== null) {
          barn.push(new Paragraph({ children: [new TextRun({ text: 'Sammanfattning', bold: true })] }));
          for (const rad of k.sammanfattning.split('\n')) barn.push(new Paragraph(rad));
        }
        if (k.attOva.length > 0) {
          barn.push(new Paragraph({ children: [new TextRun({ text: 'Begreppsförklaringar', bold: true })] }));
          for (const b of k.attOva) {
            barn.push(new Paragraph({ bullet: { level: 0 }, children: [
              new TextRun({ text: b.begrepp, bold: true }),
              ...(b.forklaring !== null ? [new TextRun(` — ${b.forklaring}`)] : []),
            ] }));
          }
        }
        barn.push(tom());
      }
    }
  }

  const doc = new Document({ sections: [{ children: barn }] });
  return Packer.toBlob(doc);
}

function laddaNer(blob: Blob, filnamn: string): void {
  const lank = document.createElement('a');
  lank.href = URL.createObjectURL(blob);
  lank.download = filnamn;
  lank.click();
  URL.revokeObjectURL(lank.href);
}

/** Bygger och laddar ner en elevs rapport. */
export async function elevrapportTillWord(a: Elevanalys): Promise<void> {
  laddaNer(await elevrapportDocx(a), rapportFilnamn(a));
}

/**
 * En Word-fil per elev, packade i ett zip-arkiv — webbläsare blockerar
 * dussintals nedladdningar i rad, och en zip är enklare att lägga i en mapp.
 * `steg` anropas efter varje elev så gränssnittet kan visa hur långt det gått.
 */
export async function klassrapporterTillWord(
  analyser: Elevanalys[], arkivNamn: string, steg?: (klar: number, av: number) => void,
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
    zip.file(namn, await elevrapportDocx(a));
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
    barn.push(tabell(['Datum', 'Prov', 'Resultat', 'Förändring', 'Godkänt'],
      r.laxforhor.map((x) => [x.datum, x.prov, `${x.procent} %`, x.delta === null ? '—' : `${x.delta > 0 ? '+' : ''}${x.delta}`, x.godkant === null ? '—' : x.godkant ? 'ja' : 'nej'])));
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
