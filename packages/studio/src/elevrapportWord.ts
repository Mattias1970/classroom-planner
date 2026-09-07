/**
 * Elevrapport → Word (.docx).
 *
 * Diagrammen ritas på en canvas och bäddas in som PNG — SVG:t i gränssnittet
 * går inte att lägga i ett Word-dokument. Texten kommer från elevanalys, så
 * utskriften säger samma sak som skärmen.
 */
import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { Elevanalys } from '@planner/kernel';

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
  const barn: Array<Paragraph | Table> = [
    new Paragraph({ text: `${a.elev.namn} — ${a.amneNamn}`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: a.sammanfattning, italics: true })] }),
    ...(a.period.fran !== null || a.period.till !== null
      ? [new Paragraph({ children: [new TextRun({ text: `Period: ${a.period.fran ?? 'start'} – ${a.period.till ?? 'idag'}`, color: '777777', size: 18 })] })]
      : []),
    tom(),
    new Paragraph({ text: 'Hur går det?', heading: HeadingLevel.HEADING_2 }),
  ];
  for (const r of a.laget) { barn.push(punkt(r), tom()); }
  if (a.laget.length === 0) barn.push(new Paragraph('Inga resultat i perioden.'), tom());

  if (a.kurva.length > 0) {
    barn.push(new Paragraph({ text: 'Resultat över tid', heading: HeadingLevel.HEADING_2 }));
    barn.push(bild(await kurvBild(a), 560, 226));
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Varje punkt är ett förhör. Streckade linjer är kraven: 90 % för läxförhör, 70 % för exit ticket.', size: 18, color: '777777' })] }));
    barn.push(tom());
    barn.push(tabell(['Nr', 'Datum', 'Prov', 'Resultat', 'Bedömning'],
      a.kurva.map((p, i) => [`T${i + 1}`, p.datum, p.prov, `${p.procent} %`, p.klarat === null ? '—' : p.klarat ? 'Godkänt' : 'Ej godkänt'])));
    barn.push(tom());
  }

  const kb = await kallBild(a);
  if (kb !== null) {
    barn.push(new Paragraph({ text: 'Du och klassen', heading: HeadingLevel.HEADING_2 }));
    barn.push(bild(kb, 560, 172));
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Färgad stapel = du, grå stapel = klassens snitt.', size: 18, color: '777777' })] }));
    barn.push(tom());
  }

  const lb = await ledBild(a);
  if (lb !== null) {
    barn.push(new Paragraph({ text: 'Delkapitel i förhören', heading: HeadingLevel.HEADING_2 }));
    barn.push(bild(lb, 560, 217));
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Stapelns höjd är antalet frågor, den fyllda delen hur många du hade rätt på. Läxförhören är kumulativa, så ett led som tunnas ut betyder att du tappat den delen.', size: 18, color: '777777' })] }));
    barn.push(tom());
  }

  barn.push(new Paragraph({ text: 'Vad kan du göra?', heading: HeadingLevel.HEADING_2 }));
  for (const r of a.rad) { barn.push(punkt(r), tom()); }

  if (a.nu.fragor.length > 0) {
    barn.push(new Paragraph({ text: 'Vad du kan nu', heading: HeadingLevel.HEADING_2 }));
    barn.push(new Paragraph({ children: [new TextRun({
      text: `${a.nu.kan.length} av ${a.nu.fragor.length} begrepp (${a.nu.procent} %) sitter, räknat på ditt senaste svar på varje fråga. `
        + 'Läxförhören är kumulativa, så samma begrepp återkommer — det du missade tidigare men kan nu räknas som kunnigt.', bold: true })] }));
    barn.push(tabell(['Delkapitel', 'Kan', 'Kvar', 'Andel', 'Senast testat'],
      a.nu.delkapitel.map((d) => [d.kod, String(d.ratt), String(d.fel), `${d.procent} %`, `${d.senastProv ?? '—'} ${d.senastDatum ?? ''}`])));
    barn.push(tom());
    if (a.nu.kvar.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: `Kvar att lära (${a.nu.kvar.length})`, bold: true })] }));
      for (const x of a.nu.kvar) barn.push(new Paragraph({ bullet: { level: 0 }, text: `${x.kod} ${x.fraga} — senast fel i ${x.senastProv}` }));
      barn.push(tom());
    }
    if (a.nu.fixat.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: `Vänt till rätt (${a.nu.fixat.length})`, bold: true })] }));
      for (const x of a.nu.fixat) barn.push(new Paragraph({ bullet: { level: 0 }, text: `${x.kod} ${x.fraga} — ${x.tidigareFel} fel tidigare, rätt nu` }));
      barn.push(tom());
    }
  }

  const matris = matrisTabell(a);
  if (matris.length > 0) {
    barn.push(new Paragraph({ text: 'Fråga för fråga', heading: HeadingLevel.HEADING_2 }));
    barn.push(...matris);
    barn.push(new Paragraph({ children: [new TextRun({ text: 'Grön ruta = rätt, röd = fel, tom = frågan ingick inte i det quizet. Siffrorna är frågans nummer; samma fråga har samma nummer i alla quiz, så du kan följa den över tid.', size: 18, color: '777777' })] }));
    barn.push(tom());
    for (const g of a.matris.grupper) {
      barn.push(new Paragraph({ children: [new TextRun({ text: `Fråga ${g.fran}–${g.till}: ${g.ursprung}${g.kod !== '—' ? ` (${g.kod})` : ''}`, size: 18, color: '777777' })] }));
    }
    barn.push(tom());
  }

  if (a.ovningar.length > 0 || a.filmer.length > 0) {
    barn.push(new Paragraph({ text: 'Öva och se filmer', heading: HeadingLevel.HEADING_2 }));
    if (a.ovningar.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: 'Öva i Socrative — logga in med ditt namn och kör quizet igen:', bold: true })] }));
      for (const o of a.ovningar) barn.push(lank(`${o.rum} — ${o.kod} ${o.namn}`, o.url));
    }
    if (a.filmer.length > 0) {
      barn.push(new Paragraph({ children: [new TextRun({ text: 'Filmer:', bold: true })] }));
      for (const film of a.filmer) barn.push(lank(`${film.titel} (${film.for})`, film.url));
    }
    barn.push(tom());
  }

  if (a.fastnat.length > 0) {
    barn.push(new Paragraph({ text: 'Begrepp att träna på', heading: HeadingLevel.HEADING_2 }));
    barn.push(tabell(['Begrepp', 'Delkapitel', 'Fel', 'Senast fel'],
      a.fastnat.slice(0, 15).map((b) => [b.fraga, b.kod, String(b.antalFel), b.senasteFel])));
    barn.push(tom());
  }

  if (a.rapport !== null) {
    for (const k of a.rapport.kapitel) {
      barn.push(new Paragraph({ text: `Kapitel ${k.nr} ${k.namn}`, heading: HeadingLevel.HEADING_2 }));
      barn.push(tabell(['Delkapitel', 'Status', 'Senaste resultat'],
        k.delkapitel.map((d) => [`${d.kod} ${d.namn}`,
          d.status === 'klarat' ? 'klarat' : d.status === 'ova' ? 'öva mer' : 'ej testat',
          d.senaste.map((x) => `${x.procent} %`).join(', ') || '—'])));
      if (k.sammanfattning !== null) {
        barn.push(new Paragraph({ children: [new TextRun({ text: 'Sammanfattning', bold: true })] }));
        for (const rad of k.sammanfattning.split('\n')) barn.push(new Paragraph(rad));
      }
      if (k.attOva.length > 0) {
        barn.push(new Paragraph({ children: [new TextRun({ text: 'Begrepp att öva', bold: true })] }));
        for (const b of k.attOva) {
          barn.push(new Paragraph({ bullet: { level: 0 }, children: [
            new TextRun({ text: b.begrepp, bold: true }),
            ...(b.forklaring !== null ? [new TextRun(` — ${b.forklaring}`)] : []),
          ] }));
        }
      }
      if (k.filmer.length > 0) {
        barn.push(new Paragraph({ children: [new TextRun({ text: 'Filmer', bold: true })] }));
        for (const film of k.filmer) barn.push(lank(`${film.titel} (${film.for})`, film.url));
      }
      barn.push(tom());
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
