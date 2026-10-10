/**
 * Del 172 · Kapitlen i rapporten inför utvecklingssamtal (matematik).
 *
 *  - genomfordaKapitel: kapitel och delkapitel som klassen arbetat med enligt
 *    planeringen till och med idag (fallback: kapitel som har resultat).
 *  - urval: läraren väljer i en checklista vilka kapitel/delkapitel rapporten
 *    täcker (sparas per ämne); ett enda kapitel behöver inget val.
 *  - gemensamText: den gemensamma texten för alla elever — vilket kapitel
 *    klassen arbetat med och vad det handlar om (bokens mål och delkapitel,
 *    aldrig påhittat innehåll). Läraren kan skriva en egen.
 *  - kapitelKoder: delkapitelkoderna för ett kapitel ur urvalet — används för
 *    att plocka ut elevens Exit tickets och Läxförhör per kapitel.
 *
 * (Ring 1, I2.)
 */
import { delkapitelKod } from './bok.js';
import { koderForProv } from './delkapitelkoder.js';
import { amnesPlanFor } from './struktur.js';
import type { Struktur } from './typer.js';

export interface SamtalsDelkapitel { kod: string; namn: string; /** Genomförda lektioner på delkapitlet. */ lektioner: number }
export interface SamtalsKapitel { nr: number; /** Kapitlets namn ur boken, '' när boken saknas. */ namn: string; sidor: string; /** Bokens "Här får du lära dig" (tom när boken saknar den). */ mal: string[]; delkapitel: SamtalsDelkapitel[] }

export interface SamtalsKapitelVal { koder?: string[]; text?: string }

const kodOrdning = (a: string, b: string) => a.localeCompare(b, 'sv', { numeric: true });

/** Kapitel och delkapitel som klassen arbetat med till och med idag, i kapitelordning. */
export function genomfordaKapitel(s: Struktur, amneId: string, idag: string): SamtalsKapitel[] {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) return [];
  const bok = s.bocker.find((b) => b.id === amne.bokId);
  const antal = new Map<number, Map<string, { namn: string; lektioner: number }>>();
  const lagg = (nr: number, kod: string, namn: string, n: number) => {
    const kap = antal.get(nr) ?? new Map<string, { namn: string; lektioner: number }>();
    const d = kap.get(kod) ?? { namn, lektioner: 0 };
    d.lektioner += n; if (d.namn === '' && namn !== '') d.namn = namn;
    kap.set(kod, d); antal.set(nr, kap);
  };
  let plan: ReturnType<typeof amnesPlanFor> = null;
  try { plan = amnesPlanFor(s, amneId, idag); } catch { plan = null; }
  const rader = plan === null ? [] : [...plan.a, ...plan.b].filter((r) => r.datum !== null && r.datum <= idag);
  for (const r of rader) {
    const kod = delkapitelKod(r.lektion.avsnitt);
    if (kod === null) { if (!antal.has(r.kapitel)) antal.set(r.kapitel, new Map()); continue; }
    lagg(r.kapitel, kod, r.lektion.avsnitt.replace(/^\d+\.\d+\s*/, '').trim(), 1);
  }
  if (rader.length === 0) {
    // Ingen planering: kapitlen som har resultat i ämnet
    for (const r of (s.resultat ?? []).filter((x) => x.amneId === amneId)) {
      for (const kod of koderForProv(r.prov, r.rum)) {
        const nr = Number(kod.split('.')[0]);
        if (Number.isFinite(nr)) lagg(nr, kod, '', 0);
      }
    }
  }
  return [...antal.entries()].sort((a, b) => a[0] - b[0]).map(([nr, delar]) => {
    const bokKap = bok?.kapitel.find((k) => k.nr === nr);
    const delkapitel = [...delar.entries()].sort((a, b) => kodOrdning(a[0], b[0])).map(([kod, d]) => {
      const bokDel = bokKap?.delkapitel.find((x) => x.kod === kod);
      return { kod, namn: bokDel?.namn ?? d.namn, lektioner: d.lektioner };
    });
    return { nr, namn: bokKap?.namn ?? '', sidor: bokKap?.sidor ?? '', mal: bokKap?.mal ?? [], delkapitel };
  }).filter((k) => k.delkapitel.length > 0);
}

/** Lärarens val för ämnet (koder och/eller egen gemensam text). */
export function samtalsKapitelVal(s: Struktur, amneId: string): SamtalsKapitelVal {
  return s.samtalsKapitel?.[amneId] ?? {};
}

/** Sparar urvalet (koder) och/eller den egna gemensamma texten; null tar bort. */
export function sattSamtalsKapitel(s: Struktur, amneId: string, patch: { koder?: string[] | null; text?: string | null }): Struktur {
  const alla = { ...(s.samtalsKapitel ?? {}) };
  const nu: SamtalsKapitelVal = { ...(alla[amneId] ?? {}) };
  if (patch.koder === null) delete nu.koder; else if (patch.koder !== undefined) nu.koder = [...new Set(patch.koder)].sort(kodOrdning);
  if (patch.text === null || patch.text?.trim() === '') delete nu.text; else if (patch.text !== undefined) nu.text = patch.text;
  if (Object.keys(nu).length === 0) delete alla[amneId]; else alla[amneId] = nu;
  const { samtalsKapitel: _g, ...rest } = s; void _g;
  return Object.keys(alla).length === 0 ? rest : { ...rest, samtalsKapitel: alla };
}

/** Valda delkapitelkoder: lärarens urval begränsat till genomförda delkapitel; utan urval alla. */
export function valdaKoder(s: Struktur, amneId: string, kapitel: SamtalsKapitel[]): string[] {
  const alla = kapitel.flatMap((k) => k.delkapitel.map((d) => d.kod));
  const val = samtalsKapitelVal(s, amneId).koder;
  if (val === undefined) return alla;
  const v = new Set(val);
  return alla.filter((k) => v.has(k));
}

/** Kapitlen som ingår i rapporten (bara valda delkapitel kvar). */
export function valdaKapitel(kapitel: SamtalsKapitel[], koder: string[]): SamtalsKapitel[] {
  const v = new Set(koder);
  return kapitel.map((k) => ({ ...k, delkapitel: k.delkapitel.filter((d) => v.has(d.kod)) })).filter((k) => k.delkapitel.length > 0);
}

function lista(namn: string[]): string {
  return namn.length <= 1 ? namn.join('') : `${namn.slice(0, -1).join(', ')} och ${namn[namn.length - 1]}`;
}

/** Den gemensamma texten ur bokens innehåll (ett stycke per kapitel). */
export function beraknadGemensamText(kapitel: SamtalsKapitel[], amneNamn: string): string {
  if (kapitel.length === 0) return `Ingen genomförd planering i ${amneNamn.toLowerCase()} att sammanfatta ännu.`;
  return kapitel.map((k) => {
    const delar = lista(k.delkapitel.map((d) => (d.namn !== '' ? `${d.kod} ${d.namn}` : d.kod)));
    let t = `Klassen har arbetat med kapitel ${k.nr}${k.namn !== '' ? ` ${k.namn}` : ''}${k.sidor !== '' && k.sidor !== '—' ? ` (${k.sidor})` : ''} — ${k.delkapitel.length === 1 ? 'delkapitlet' : 'delkapitlen'} ${delar}.`;
    if (k.mal.length > 0) t += ` Kapitlet handlar om: ${k.mal.map((m) => m.replace(/[.\s]+$/, '')).join('; ')}.`;
    return t;
  }).join('\n');
}

export interface GemensamText {
  kapitel: SamtalsKapitel[];
  /** Valda delkapitelkoder. */
  koder: string[];
  /** Kapitlen som ingår. */
  valda: SamtalsKapitel[];
  text: string;
  /** Texten är lärarens egen. */
  egen: boolean;
  /** Flera genomförda kapitel — rapporten behöver ett urval. */
  behoverVal: boolean;
}

/** Gemensam text för alla elever i ämnet: kapitlen klassen arbetat med och vad de handlar om. */
export function gemensamText(s: Struktur, amneId: string, idag: string): GemensamText {
  const amne = s.amnen.find((a) => a.id === amneId);
  const kapitel = genomfordaKapitel(s, amneId, idag);
  const koder = valdaKoder(s, amneId, kapitel);
  const valda = valdaKapitel(kapitel, koder);
  const egen = samtalsKapitelVal(s, amneId).text;
  return {
    kapitel, koder, valda,
    text: egen ?? beraknadGemensamText(valda, amne?.namn ?? 'ämnet'),
    egen: egen !== undefined,
    behoverVal: kapitel.length > 1 && samtalsKapitelVal(s, amneId).koder === undefined,
  };
}

/** 'Kapitel 1 Tal' (eller 'Kapitel 1' utan bok). */
export function kapitelNamn(k: Pick<SamtalsKapitel, 'nr' | 'namn'>): string { return k.namn === '' ? `Kapitel ${k.nr}` : `Kapitel ${k.nr} ${k.namn}`; }

/** Koderna som hör till kapitlet ur urvalet. */
export function kapitelKoder(k: SamtalsKapitel): string[] { return k.delkapitel.map((d) => d.kod); }

/** Etikett för ett förhörs koder: '1.1', '1.1–1.3' (sammanhängande) eller '1.1, 1.4'. */
export function kodEtikett(koder: string[]): string {
  const k = [...new Set(koder)].sort(kodOrdning);
  if (k.length <= 1) return k.join('');
  const kap = new Set(k.map((x) => x.split('.')[0]));
  const nr = k.map((x) => Number(x.split('.')[1]));
  const sammanhangande = kap.size === 1 && nr.every((n, i) => i === 0 || n === nr[i - 1] + 1);
  return sammanhangande ? `${k[0]}–${k[k.length - 1]}` : k.join(', ');
}
