/**
 * Del 151 · Provlappen som Word-fil (.docx), byggd i webbläsaren ur
 * kernelns provlapp() — dvs. direkt ur planeringen. Laddas lazy (dynamic
 * import) från provets lektionskort.
 */
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { BINDEORD, labMall, noOvningPunkter, PROVLAPP_OVA_GRANS, type Betygsniva, type Provlapp } from '@planner/kernel';
import { djupBreddSvg, svgTillPng } from './provlappFigur.js';

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
export function provlappDokument(pl: Provlapp, farg: string, figur: Uint8Array | null = null): Document {
  const F = hex(farg);
  const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 100 }, children: [t(text, { bold: true, size: 30, color: F })] });
  const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 70 }, children: [t(text, { bold: true, size: 24, color: '333333' })] });
  const ut: Array<Paragraph | Table> = [];

  const kapRubrik = pl.kapitel.length > 1 ? `KAPITEL ${pl.kapitel.map((k) => k.nr).join(' OCH ')}` : `KAPITEL ${pl.kapitelNr}`;
  ut.push(p([t(`PROVLAPP · ${pl.bok.toUpperCase()} · ${kapRubrik}`, { bold: true, size: 20, color: F })], 40));
  ut.push(new Paragraph({
    spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: F, space: 6 } },
    children: [t(pl.kapitelNamn, { bold: true, size: 40 })],
  }));
  ut.push(tabell([2000, 2819, 2000, 2819], [
    ['Ämne', `${pl.amne} ${pl.klass}`, 'Prov', pl.provNamn],
    ['Provdatum', pl.provDatum !== null ? `${datumText(pl.provDatum)}${pl.provVecka !== null ? ` (v. ${pl.provVecka})` : ''}` : 'meddelas', 'Bok', pl.bok],
    ...(pl.omfang !== null ? [['Omfattar', pl.omfang, '', '']] : []),
  ], F));
  ut.push(p(''));
  if (pl.notis !== null) {
    ut.push(p([t('Från din lärare: ', { bold: true }), t(pl.notis)]));
  }
  ut.push(p([t('Så läser du provlappen. ', { bold: true }), t(pl.noOvning !== null
    ? 'Del 1 är det du ska kunna, avsnitt för avsnitt, med djup- och breddfrågor. Del 2 är begreppen med sina beskrivningar. Del 3 är hur du övar för E, del 4 hur du övar för C och A — med Testa dig själv-frågorna och alla filmer.'
    : `Del 1 är det du ska kunna, avsnitt för avsnitt. Del 2 är begreppen. Del 3 ger förslag på uppgifter i boken för varje nivå — E-nivån tränas med ${pl.nivaKarta.E}, C-nivån med ${pl.nivaKarta.C} och A-nivån med ${pl.nivaKarta.A}.`)]));

  if (pl.kapitelMal.length > 0) {
    ut.push(h1(pl.kapitel.length > 1 ? 'Kapitlens mål' : 'Kapitlets mål'));
    for (const k of pl.kapitel) {
      if (pl.kapitel.length > 1 && k.mal.length > 0) ut.push(h2(`Kapitel ${k.nr} ${k.namn}`));
      k.mal.forEach((m) => ut.push(punkt(m)));
    }
  }

  ut.push(h1('1. Det här ska du kunna'));
  for (const a of pl.avsnitt) {
    const visa = a.typ === 'delkapitel' || a.mal.length > 0;
    if (!visa) continue;
    ut.push(h2(`${a.rubrik}${a.sidor !== '' && a.sidor !== '—' ? `  (${a.sidor})` : ''}`));
    a.sammanfattning.forEach((sm) => ut.push(p([t('Sammanfattning: ', { bold: true }), t(sm)])));
    if (a.mal.length > 0) a.mal.forEach((m) => ut.push(punkt(m)));
    if (a.begrepp.length > 0) ut.push(punkt(`Begrepp: ${a.begrepp.join(', ')}.`));
    a.exempel.forEach((e) => ut.push(p([t('Exempel från lektionerna: ', { italics: true, color: '555555' }), t(e, { italics: true, color: '555555' })], 50)));
    if (a.djupBredd !== null) {
      ut.push(p([t('Djup: ', { bold: true, color: F }), t(a.djupBredd.djup)], 40));
      ut.push(p([t('Bredd: ', { bold: true, color: F }), t(a.djupBredd.bredd)], a.labb !== null ? 40 : 80));
      if (a.labb !== null) ut.push(p([t('Labb (E): ', { bold: true, color: F }), t(a.labb)], 80));
    }
    if (a.fragor.length > 0) {
      ut.push(new Paragraph({ spacing: { after: 60 }, children: [t('Begrepp från läxförhör och exit tickets: ', { bold: true }), ...a.fragor.flatMap((f, i) => {
        const ova = f.procent !== null && f.procent < PROVLAPP_OVA_GRANS;
        return [...(i > 0 ? [t(' · ')] : []), t(f.begrepp ?? f.fraga, ova ? { bold: true, color: 'B00020' } : {}), ...(f.procent !== null ? [t(` ${f.procent} %${ova ? ' ⚠' : ''}`, { color: ova ? 'B00020' : '777777', size: 18 })] : [])];
      })] }));
    }
    if (a.filmer.length > 0) {
      ut.push(new Paragraph({ spacing: { after: 80 }, children: [t('Filmer: ', { bold: true }), ...a.filmer.flatMap((f, i) => [
        ...(i > 0 ? [t(' · ')] : []),
        new ExternalHyperlink({ link: f.url, children: [new TextRun({ text: f.titel, font: FONT, size: 22, style: 'Hyperlink' })] }),
      ])] }));
    }
  }

  if (pl.avsnitt.some((a) => a.fragor.length > 0)) ut.push(p([t(`Procenten efter ett begrepp är klassens andel rätt senast det var med i ett läxförhör eller en exit ticket. ⚠ = under ${PROVLAPP_OVA_GRANS} % — öva extra på det.`, { italics: true, color: '555555' })]));

  ut.push(h1('Så visar du djup och bredd'));
  ut.push(p([t('Djup', { bold: true }), t(' = orsakssamband i flera led: A → B → C, där varje pil svarar på '), t('varför', { italics: true }), t('. '), t('Bredd', { bold: true }), t(' = flera exempel i ett led: A — exempel 1, 2, 3 — och vad de har gemensamt. Under varje avsnitt finns en djup- och en breddfråga byggd på avsnittets begrepp.')]));
  ut.push(p([t('Bindeord i stället för pilar: ', { bold: true }), t(BINDEORD.join(' · '))]));
  if (figur !== null) ut.push(new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({ type: 'png', data: figur, transformation: { width: 600, height: 208 }, altText: { title: 'Djup och bredd', description: 'Djup: kedja av orsak och följd. Bredd: ett begrepp med tre exempel.', name: 'djupbredd' } })] }));

  ut.push(h1('För E-nivå krävs'));
  pl.kravE.forEach((k) => ut.push(punkt(k)));
  if (pl.noAmne) {
    const fragor = pl.avsnitt.flatMap((a) => a.labFragor);
    ut.push(h2('Enkel laborationsbeskrivning — tre steg'));
    labMall(fragor[0] ?? null).forEach((m, i) => ut.push(p([t(`${i + 1}. ${m.steg} `, { bold: true }), t(m.text)], 50)));
    if (fragor.length > 1) ut.push(p([t(`Laborationsfrågor i omfånget: ${fragor.join(' · ')}`, { italics: true, color: '555555' })]));
  }

  if (pl.begrepp.length > 0) {
    ut.push(h1('2. Begrepp du ska kunna förklara'));
    ut.push(p(pl.noAmne && pl.begreppKalla !== 'bok' ? 'Beskrivningarna är de från läxförhören i Socrative (senaste versionen). Förklara med egna ord och ge ett exempel.' : 'Förklara med egna ord och ge ett exempel.'));
    ut.push(tabell([2900, 6738], [['Begrepp', pl.noAmne ? 'Beskrivning' : 'Förklaring'], ...pl.begrepp.map((b) => [b.begrepp, b.forklaring ?? ''])], F));
  }

  if (pl.noOvning !== null) {
    const { E, CA } = noOvningPunkter(pl);
    const o = pl.noOvning;
    ut.push(h1('3. Så övar du för E'));
    E.forEach((x) => ut.push(punkt(x)));
    if (o.rum.length > 0) ut.push(p([t('Socrative-rum: ', { bold: true }), t(o.rum.join(' · '))]));
    ut.push(h1('4. Så övar du för C och A'));
    CA.forEach((x) => ut.push(punkt(x)));
    const tds = pl.avsnitt.filter((a) => a.testaFragor.length > 0);
    if (tds.length > 0) {
      ut.push(h2('Testa dig själv-frågorna'));
      for (const a of tds) { ut.push(p([t(a.rubrik, { bold: true })], 40)); a.testaFragor.forEach((f, i) => ut.push(p(`${i + 1}. ${f}`, 30))); }
    }
    if (o.filmer.length > 0) {
      ut.push(h2('Filmer på Binogi'));
      for (const f of o.filmer) ut.push(new Paragraph({ spacing: { after: 40 }, children: [t(`${f.avsnitt.split(' ')[0]} `, { color: '777777' }), new ExternalHyperlink({ link: f.url, children: [new TextRun({ text: f.titel, font: FONT, size: 22, style: 'Hyperlink' })] }), t(`  ${f.url}`, { color: '777777', size: 18 })] }));
    }
    ut.push(h1('5. Checklista inför provet'));
    [
      'Jag kan förklara alla begreppen i del 2 med egna ord och ge ett exempel.',
      'Jag kan berätta sammanfattningen för varje avsnitt.',
      'Jag kan beskriva laborationerna: vad vi testade, hur vi testade och hur vi såg resultatet.',
      'För C och A: jag kan förklara orsak och samband i flera led och har gjort Testa dig själv-frågorna och Finalen.',
    ].forEach((c) => ut.push(kryss(c)));
  } else {
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
  }

  return new Document({
    creator: 'Classroom Planner', title: `Provlapp ${pl.amne} ${pl.klass} ${pl.omfang ?? `kapitel ${pl.kapitelNr}`}`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: { config: [{ reference: 'punkt', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 280 } } } }] }] },
    sections: [{
      properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t(`${pl.amne} ${pl.klass} · ${pl.omfang ?? `Kapitel ${pl.kapitelNr}`} · Provlapp`, { size: 18, color: '808080' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Sida ', { size: 18, color: '808080' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '808080' })] })] }) },
      children: ut,
    }],
  });
}

/** Filnamn: 'Provlapp Matematik 8B kap 1.docx' eller 'Provlapp Biologi 8B 6.1-6.5 7.1-7.5.docx'. */
export function provlappFilnamn(pl: Provlapp): string {
  const del = pl.omfang === null ? `kap ${pl.kapitelNr}` : pl.omfang.replace(/–/g, '-').replace(/ · /g, ' ');
  return `Provlapp ${pl.amne} ${pl.klass} ${del}`.replace(/[\\/:*?"<>|]/g, '').trim();
}

/** Bygger och laddar ner provlappen. */
export async function laddaNerProvlapp(pl: Provlapp, farg: string): Promise<void> {
  const kedja = pl.avsnitt.find((a) => a.djupBredd !== null)?.djupBredd?.kedja ?? [];
  const figur = kedja.length > 0 ? await svgTillPng(djupBreddSvg(kedja, farg)) : null;
  const blob = await Packer.toBlob(provlappDokument(pl, farg, figur));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${provlappFilnamn(pl)}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
