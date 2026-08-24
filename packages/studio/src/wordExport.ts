/**
 * Word-export (portad från v1): Kapitel → Word och Vecka → Word.
 * Bygger .docx i webbläsaren (docx-paketet, Packer.toBlob) ur planeringen +
 * lektionsplanernas detaljer (genomgång, läxa, filmer, Magma).
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import {
  begreppForLektion, effektivaNivaer, hamtaLektionsplan,
  type Bok, type PlaneradLektion, type Struktur,
} from '@planner/kernel';

function ladda(namn: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${namn}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function rad(rubrik: string, text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: `${rubrik}: `, bold: true }), new TextRun(text)] });
}

function lektionsStycken(s: Struktur, amneId: string, bok: Bok, r: PlaneradLektion, i: number): Paragraph[] {
  const lp = hamtaLektionsplan(s, amneId, i);
  const n = effektivaNivaer(r.lektion, lp);
  const N = bok.nivaer;
  const begrepp = begreppForLektion(bok, r.kapitel, r.lektion);
  const ut: Paragraph[] = [
    new Paragraph({
      text: `Lektion ${i + 1} · ${r.lektion.avsnitt} · Del ${r.lektion.del}${r.datum !== null ? ` (${r.datum} ${r.start}–${r.slutTid})` : ''}`,
      heading: HeadingLevel.HEADING_2,
    }),
    rad('Uppgifter', `${N.niva1} ${n.niva1} · ${N.niva2} ${n.niva2} · ${N.niva3} ${n.niva3}${r.lektion.sidorTeori !== '' ? ` · Teori ${r.lektion.sidorTeori}` : ''}`),
  ];
  if (lp?.genomgang !== undefined && lp.genomgang !== '') ut.push(rad('Genomgång', lp.genomgang));
  if (begrepp.length > 0) ut.push(rad('Begrepp (läxa)', begrepp.join(', ')));
  if (lp?.laxa !== undefined && lp.laxa !== '') ut.push(rad('Läxa', lp.laxa));
  if (lp?.filmer !== undefined && lp.filmer.length > 0)
    ut.push(rad('Filmer', lp.filmer.map((f) => f.split('|')[0]).join(' · ')));
  if (lp?.magma !== undefined && lp.magma !== '') ut.push(rad('Magma', lp.magma));
  return ut;
}

export async function exporteraLektioner(
  s: Struktur, amneId: string, bok: Bok, rubrik: string, filnamn: string,
  rader: Array<{ rad: PlaneradLektion; index: number }>,
): Promise<void> {
  const children: Paragraph[] = [new Paragraph({ text: rubrik, heading: HeadingLevel.HEADING_1 })];
  for (const { rad: r, index } of rader) children.push(...lektionsStycken(s, amneId, bok, r, index));
  const doc = new Document({ sections: [{ children }] });
  ladda(filnamn, await Packer.toBlob(doc));
}
