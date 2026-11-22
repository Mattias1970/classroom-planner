/**
 * Del 261 · Matematikens provinformation i Word — delas av provlappen (provlappWord.ts) och den pedagogiska
 * planeringen (pedagogiskWord.ts), så att båda dokumenten säger samma sak: regeln för E, kravtabellen, en del
 * per förmåga (begrepp med beskrivning och sida, metoder med teorisidor, typiska uppgifter per nivå) och
 * checklistan per delkapitel. Rubrikerna och punktlistan kommer från dokumentet som anropar.
 */
import { BorderStyle, ExternalHyperlink, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { MatteLapp } from '@planner/kernel';

const FONT = 'Calibri';
/** Bredden som kolumnmåtten nedan är skrivna för (A4 minus 2 cm marginaler, DXA). */
const GRUNDBREDD = 9638;
const KANT = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const KANTER = { top: KANT, bottom: KANT, left: KANT, right: KANT };
const t = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text, font: FONT, size: 22, ...o });

export interface MatteWordVal {
  /** Rubrikfärgen i tabellhuvudena (hex utan #). */
  farg: string;
  /** Textytans bredd i DXA — tabellerna skalas dit. */
  bredd: number;
  /** Förmågans rubrik ('1. Begrepp') och checklistans. */
  h1: (text: string) => Paragraph;
  /** Underrubrik (delkapitlet under Begrepp, 'Typiska uppgifter'). */
  h2: (text: string) => Paragraph;
  punkt: (text: string) => Paragraph;
  /** Provlappen: lärarens sammanfattning och filmerna per delkapitel, före checklistan. Planeringen har dem på egna ställen. */
  stod?: Array<{ rubrik: string; sammanfattning: string[]; filmer: Array<{ titel: string; url: string }> }>;
}

export function matteInnehall(m: MatteLapp, v: MatteWordVal): Array<Paragraph | Table> {
  const F = v.farg;
  const tabell = (grund: number[], rader: Array<Array<string | string[]>>): Table => {
    const bredder = grund.map((b) => Math.round((b * v.bredd) / GRUNDBREDD));
    bredder[bredder.length - 1] += v.bredd - bredder.reduce((a, b) => a + b, 0);
    return new Table({
      width: { size: v.bredd, type: WidthType.DXA },
      columnWidths: bredder,
      rows: rader.map((rad, i) => new TableRow({
        tableHeader: i === 0, cantSplit: true,
        children: rad.map((c, j) => new TableCell({
          width: { size: bredder[j], type: WidthType.DXA }, borders: KANTER,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: i === 0 ? { type: ShadingType.CLEAR, fill: F, color: 'auto' } : j === 0 ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined,
          children: (Array.isArray(c) ? c : [c]).map((x) => new Paragraph({ spacing: { after: 30 }, children: [t(x, i === 0 ? { bold: true, color: 'FFFFFF' } : j === 0 ? { bold: true } : {})] })),
        })),
      })),
    });
  };
  const ut: Array<Paragraph | Table> = [];
  ut.push(new Paragraph({
    spacing: { before: 80, after: 160 }, indent: { left: 160 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: F, space: 8 } },
    shading: { type: ShadingType.CLEAR, fill: 'F7F3EC', color: 'auto' },
    children: [t('För betyget E ', { bold: true, size: 24 }), t(m.regelE.replace(/^För betyget E /, ''), { size: 24 })],
  }));
  ut.push(tabell([1838, 2600, 2600, 2600], [['Förmåga', 'E', 'C', 'A'], ...m.formagor.map((f) => [f.namn, f.krav.E, f.krav.C, f.krav.A])]));

  m.formagor.forEach((f, nr) => {
    ut.push(v.h1(`${nr + 1}. ${f.namn}`));
    ut.push(new Paragraph({ spacing: { after: 80 }, children: [t(f.betyder, { italics: true, color: '555555' })] }));
    const avsnitt = [...m.avsnitt, ...m.blandat].filter((a) => (f.id === 'begrepp' && a.begrepp.length > 0) || a.mal[f.id].length > 0);
    if (f.id === 'begrepp') {
      for (const a of avsnitt) {
        ut.push(v.h2(`${a.rubrik}${a.teoriSidor !== null ? `  (teori ${a.teoriSidor})` : ''}`));
        if (a.begrepp.length > 0) ut.push(tabell([2300, 6038, 1300], [['Begrepp', 'Beskrivning', 'Sida'], ...a.begrepp.map((b) => [b.begrepp, b.forklaring ?? '', b.sidor ?? ''])]));
        a.mal.begrepp.forEach((x) => ut.push(v.punkt(`${x.text}${x.sidor !== null ? ` (${x.sidor})` : ''}`)));
      }
    } else if (avsnitt.length > 0) {
      ut.push(tabell([2500, 5838, 1300], [
        ['Delkapitel', f.id === 'metod' ? 'Metoder du ska kunna' : 'Det här ska du kunna', 'Teori'],
        ...avsnitt.map((a) => [a.rubrik, a.mal[f.id].map((x) => `• ${x.text}`), a.teoriSidor ?? '']),
      ]));
    }
    if (f.typiska.E.length + f.typiska.C.length + f.typiska.A.length > 0) {
      ut.push(v.h2(f.utskrivna ? 'Typiska uppgifter' : 'Typiska uppgifter i boken'));
      ut.push(tabell([1100, 8538], [['Nivå', 'Uppgift'], ...(['E', 'C', 'A'] as const).map((n) => [`${n}-nivå`, f.typiska[n].length > 0 ? f.typiska[n].map((u) => `• ${u}`) : ['—']])]));
    }
    f.iBoken.forEach((x) => ut.push(new Paragraph({ spacing: { before: 100, after: 80 }, children: [t('Öva i boken: ', { bold: true }), t(x)] })));
  });

  if (v.stod !== undefined && v.stod.length > 0) {
    ut.push(v.h1('Repetera: sammanfattning och filmer'));
    for (const a of v.stod) {
      ut.push(v.h2(a.rubrik));
      a.sammanfattning.forEach((x) => ut.push(new Paragraph({ spacing: { after: 80 }, children: [t('Sammanfattning: ', { bold: true }), t(x)] })));
      if (a.filmer.length > 0) {
        ut.push(new Paragraph({ spacing: { after: 80 }, children: [t('Filmer: ', { bold: true }), ...a.filmer.flatMap((f, i) => [
          ...(i > 0 ? [t(' · ')] : []),
          new ExternalHyperlink({ link: f.url, children: [new TextRun({ text: f.titel, font: FONT, size: 22, style: 'Hyperlink' })] }),
        ])] }));
      }
    }
  }

  ut.push(v.h1(`${m.formagor.length + 1}. Checklista — har du gjort?`));
  ut.push(new Paragraph({ spacing: { after: 80 }, children: [t('Kryssa för det du har gjort. Rutorna för E-nivå behöver vara ifyllda i varje delkapitel.')] }));
  const ruta = (k: MatteLapp['avsnitt'][number]['kryss'][number], medBetyg: boolean) =>
    `☐  ${k.namn}${k.uppgifter !== null ? ` ${k.uppgifter}` : ''}${k.sidor !== null ? ` (${k.sidor})` : ''}${medBetyg ? ` — ${k.betyg.join('/')}-nivå` : ''}`;
  ut.push(tabell([2900, 6738], [
    ['Delkapitel', 'Uppgifter i boken'],
    ...m.avsnitt.map((a) => [a.rubrik, a.kryss.length > 0 ? a.kryss.map((k) => ruta(k, true)) : ['☐  Uppgifterna i delkapitlet']]),
    ...(m.repetition.length > 0 ? [['Hela kapitlet', m.repetition.map((k) => ruta(k, false))]] : []),
  ]));
  return ut;
}
