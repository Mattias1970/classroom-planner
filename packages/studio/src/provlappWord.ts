/**
 * Del 151 · Provlappen som Word-fil (.docx), byggd i webbläsaren ur
 * kernelns provlapp() — dvs. direkt ur planeringen. Laddas lazy (dynamic
 * import) från provets lektionskort.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import type { Betygsniva, Provlapp } from '@planner/kernel';

const FONT = 'Calibri';
const BRED = 9638; // A4 minus 2 cm marginaler (DXA)
const KANT = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const KANTER = { top: KANT, bottom: KANT, left: KANT, right: KANT };

const t = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text, font: FONT, size: 22, ...o });
const p = (runs: TextRun[] | string, after = 80) => new Paragraph({ spacing: { after }, children: typeof runs === 'string' ? [t(runs)] : runs });
const punkt = (runs: TextRun[] | string) => new Paragraph({ numbering: { reference: 'punkt', level: 0 }, spacing: { after: 50 }, children: typeof runs === 'string' ? [t(runs)] : runs });
const kryss = (text: string) => new Paragraph({ spacing: { after: 50 }, children: [t('☐  ', { size: 24 }), t(text)] });

function hex(farg: string): string { const h = farg.replace('#', '').trim(); return /^[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : 'B5532C'; }

function tabell(bredder: number[], rader: Array<Array<string | string[]>>, farg: string): Table {
  return new Table({
    width: { size: bredder.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: bredder,
    rows: rader.map((rad, i) => new TableRow({
      tableHeader: i === 0, cantSplit: true,
      children: rad.map((c, j) => new TableCell({
        width: { size: bredder[j], type: WidthType.DXA }, borders: KANTER,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: i === 0 ? { type: ShadingType.CLEAR, fill: farg, color: 'auto' } : j === 0 ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined,
        children: (Array.isArray(c) ? c : [c]).map((x) => new Paragraph({ spacing: { after: 30 }, children: [t(x, i === 0 ? { bold: true, color: 'FFFFFF' } : j === 0 ? { bold: true } : {})] })),
      })),
    })),
  });
}

const datumText = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const dag = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][d.getUTCDay()];
  const man = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'][d.getUTCMonth()];
  return `${dag} ${d.getUTCDate()} ${man}`;
};

/** Bygger provlappens Word-dokument. `farg` = kapitlets färg ur boken. */
export function provlappDokument(pl: Provlapp, farg: string): Document {
  const F = hex(farg);
  const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 100 }, children: [t(text, { bold: true, size: 30, color: F })] });
  const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 70 }, children: [t(text, { bold: true, size: 24, color: '333333' })] });
  const ut: Array<Paragraph | Table> = [];

  ut.push(p([t(`PROVLAPP · ${pl.bok.toUpperCase()} · KAPITEL ${pl.kapitelNr}`, { bold: true, size: 20, color: F })], 40));
  ut.push(new Paragraph({
    spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: F, space: 6 } },
    children: [t(pl.kapitelNamn, { bold: true, size: 40 })],
  }));
  ut.push(tabell([2000, 2819, 2000, 2819], [
    ['Ämne', `${pl.amne} ${pl.klass}`, 'Prov', pl.provNamn],
    ['Provdatum', pl.provDatum !== null ? `${datumText(pl.provDatum)}${pl.provVecka !== null ? ` (v. ${pl.provVecka})` : ''}` : 'meddelas', 'Bok', pl.bok],
  ], F));
  ut.push(p(''));
  if (pl.notis !== null) {
    ut.push(p([t('Från din lärare: ', { bold: true }), t(pl.notis)]));
  }
  ut.push(p([t('Så läser du provlappen. ', { bold: true }), t(`Del 1 är det du ska kunna, avsnitt för avsnitt. Del 2 är begreppen. Del 3 ger förslag på uppgifter i boken för varje nivå — E-nivån tränas med ${pl.nivaKarta.E}, C-nivån med ${pl.nivaKarta.C} och A-nivån med ${pl.nivaKarta.A}.`)]));

  if (pl.kapitelMal.length > 0) {
    ut.push(h1('Kapitlets mål'));
    pl.kapitelMal.forEach((m) => ut.push(punkt(m)));
  }

  ut.push(h1('1. Det här ska du kunna'));
  for (const a of pl.avsnitt) {
    const visa = a.typ === 'delkapitel' || a.mal.length > 0;
    if (!visa) continue;
    ut.push(h2(`${a.rubrik}${a.sidor !== '' && a.sidor !== '—' ? `  (${a.sidor})` : ''}`));
    if (a.mal.length > 0) a.mal.forEach((m) => ut.push(punkt(m)));
    else if (a.begrepp.length > 0) ut.push(punkt(`Förstå och använda begreppen: ${a.begrepp.join(', ')}.`));
    a.exempel.forEach((e) => ut.push(p([t('Exempel från lektionerna: ', { italics: true, color: '555555' }), t(e, { italics: true, color: '555555' })], 50)));
  }

  if (pl.begrepp.length > 0) {
    ut.push(h1('2. Begrepp du ska kunna förklara'));
    ut.push(p('Förklara med egna ord och ge ett exempel.'));
    ut.push(tabell([2900, 6738], [['Begrepp', 'Förklaring'], ...pl.begrepp.map((b) => [b.begrepp, b.forklaring ?? ''])], F));
  }

  ut.push(h1('3. Övningsförslag för varje nivå'));
  ut.push(p('Börja med nivån under din målnivå och rätta mot facit i boken.'));
  const NIVATEXT: Record<Betygsniva, string> = {
    E: 'Grundläggande: använd metoderna rätt, visa uträkningar och använd begreppen korrekt.',
    C: 'Flera steg och vardagliga sammanhang: välj metod själv, förklara varför den fungerar och bedöm om svaret är rimligt.',
    A: 'Problemlösning och generalisering: hitta egen strategi, motivera att något alltid gäller och jämför olika lösningar.',
  };
  const nivaRader: Array<Array<string | string[]>> = (['E', 'C', 'A'] as Betygsniva[]).map((n) => [
    n,
    [NIVATEXT[n], ...(pl.ovningar[n].length > 0 ? pl.ovningar[n].map((o) => `${o.avsnitt}: ${o.uppgifter}`) : ['Se bokens uppgifter för avsnitten ovan.'])],
  ]);
  ut.push(tabell([1100, 8538], [['Nivå', 'Förslag'], ...nivaRader], F));

  ut.push(h1('4. Checklista inför provet'));
  [
    'Jag kan förklara alla begreppen i del 2 med ett eget exempel.',
    `Jag har gjort ${pl.nivaKarta.E}-uppgifterna i alla avsnitt och rättat mot facit.`,
    'Jag har räknat om de uppgifter jag hade fel på.',
    ...pl.repetitionSidor.map((r) => `Jag har läst igenom ${r}.`),
    `För C och A: jag har gjort ${pl.nivaKarta.C}-uppgifter och förklarat med ord hur jag tänkte.`,
  ].forEach((c) => ut.push(kryss(c)));

  return new Document({
    creator: 'Classroom Planner', title: `Provlapp ${pl.amne} ${pl.klass} kapitel ${pl.kapitelNr}`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: { config: [{ reference: 'punkt', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 280 } } } }] }] },
    sections: [{
      properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t(`${pl.amne} ${pl.klass} · Kapitel ${pl.kapitelNr} · Provlapp`, { size: 18, color: '808080' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Sida ', { size: 18, color: '808080' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '808080' })] })] }) },
      children: ut,
    }],
  });
}

/** Filnamn: 'Provlapp Matematik 8B kap 1.docx'. */
export function provlappFilnamn(pl: Provlapp): string {
  return `Provlapp ${pl.amne} ${pl.klass} kap ${pl.kapitelNr}`.replace(/[\\/:*?"<>|]/g, '').trim();
}

/** Bygger och laddar ner provlappen. */
export async function laddaNerProvlapp(pl: Provlapp, farg: string): Promise<void> {
  const blob = await Packer.toBlob(provlappDokument(pl, farg));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${provlappFilnamn(pl)}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
