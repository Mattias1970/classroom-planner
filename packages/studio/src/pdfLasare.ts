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

/** Del 153 · Alla sidors text-items med höjd och sidnummer (Magma-testens uppgifter). */
export async function lasPdfAllaSidor(fil: File): Promise<import('@planner/kernel').MagmaPdfItem[]> {
  const data = await fil.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const ut: import('@planner/kernel').MagmaPdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const innehall = await (await doc.getPage(p)).getTextContent();
    for (const item of innehall.items) {
      if ('str' in item && item.str.trim() !== '') ut.push({ text: item.str, x: item.transform[4], y: item.transform[5], h: item.height, sida: p });
    }
  }
  return ut;
}
