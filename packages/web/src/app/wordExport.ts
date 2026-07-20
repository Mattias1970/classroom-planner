/** Word-export i webbläsaren (sprint 21-om) — Packer.toBlob, ej fs. */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { LessonRecord } from '@planner/core';

type Row = LessonRecord & { date: string };

async function download(name: string, blob: Blob): Promise<void> {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const Docx = {
  async exportLessons(filename: string, heading: string, rows: Row[]): Promise<void> {
    const children: Paragraph[] = [
      new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }),
    ];
    for (const r of rows) {
      children.push(
        new Paragraph({ text: `Lektion ${r.id} · ${r.avsnitt}${r.date ? ` (${r.date})` : ''}`, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: 'Genomgång: ', bold: true }), new TextRun(r.genomgang)] }),
        new Paragraph({ children: [new TextRun({ text: 'Uppgifter: ', bold: true }), new TextRun(`Grön ${r.grön} · Blå ${r.blå} · Röd ${r.röd} · Teori ${r.sidor_teori}`)] }),
        new Paragraph({ children: [new TextRun({ text: 'Läxa: ', bold: true }), new TextRun(r.laxa)] }),
      );
    }
    const doc = new Document({ sections: [{ children }] });
    await download(filename, await Packer.toBlob(doc));
  },
};
