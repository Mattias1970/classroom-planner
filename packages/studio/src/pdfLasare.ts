/**
 * PDF-läsning (studio): extraherar text-items MED koordinater ur en PDF via
 * pdf.js. Tolkningen sker i kärnan (tolkaSchemaPdf) — här bara I/O.
 */
import * as pdfjs from 'pdfjs-dist';
import type { PdfTextItem } from '@planner/kernel';

// Vite ?url-import av workern; typdeklarationen saknas i paketet.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error – Vite-asset utan typer
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl as string;

export async function lasPdfItems(fil: File): Promise<PdfTextItem[]> {
  const data = await fil.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const sida = await doc.getPage(1);
  const innehall = await sida.getTextContent();
  const ut: PdfTextItem[] = [];
  for (const item of innehall.items) {
    if ('str' in item && item.str.trim() !== '') {
      ut.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] });
    }
  }
  return ut;
}
