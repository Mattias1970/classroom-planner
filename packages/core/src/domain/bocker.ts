/**
 * Bokbibliotek (del 12) — ren kärna (invariant I2).
 *
 * Böcker delas in i ämnen och årskurser. Utöver datakällans bok kan
 * läraren importera egna böcker som JSON — producerad av AI:n från
 * fotograferade boksidor med bokimport-prompten. Importformatet:
 *
 * {
 *   "schema": "classroom-planner-bok",
 *   "version": 1,
 *   "bok": { id, titel, förlag, ämne, årskurs, kapitelMeta },
 *   "lektioner": { "1": [ LessonRecord … ], "2": [ … ] }
 * }
 */
import { LESSON_TYPES, type BookFile, type KapitelMeta, type LessonRecord, type LessonType } from '../records/lesson-record.js';
import { STANDARD_AMNEN } from './setup.js';

export const BOK_IMPORT_SCHEMA = 'classroom-planner-bok';

/** Etiketter för de tre uppgiftsnivåerna (intro / E / C–A). Internt heter fälten alltid grön/blå/röd. */
export interface NivaEtiketter { grön: string; blå: string; röd: string; }
export const NIVA_GRON_BLA_ROD: NivaEtiketter = { grön: 'Grön', blå: 'Blå', röd: 'Röd' };
export const NIVA_ETT_TVA_TRE: NivaEtiketter = { grön: 'ETT', blå: 'TVÅ', röd: 'TRE' };

export interface LokalBok {
  bok: BookFile;
  lektioner: Record<number, LessonRecord[]>;
  /** Bokens nivånamn (t.ex. ETT/TVÅ/TRE för Matematik Y). Saknas ⇒ Grön/Blå/Röd. */
  nivaer?: NivaEtiketter;
}

/** Avgör nivåsystem ur råa lektionsobjekt: majoritet av ett/två/tre ⇒ ETT/TVÅ/TRE. */
export function detectNivaer(rader: Array<Record<string, unknown>>): NivaEtiketter {
  let ett = 0, gron = 0;
  for (const r of rader) {
    if ('ett' in r || 'två' in r || 'tva' in r || 'tre' in r) ett++;
    if ('grön' in r || 'gron' in r || 'blå' in r || 'bla' in r || 'röd' in r || 'rod' in r) gron++;
  }
  return ett > 0 && ett >= gron ? NIVA_ETT_TVA_TRE : NIVA_GRON_BLA_ROD;
}

/** Delkapitelnyckel "4.6" ur avsnitt "4.6 Ekvationer" (null för t.ex. "Blandade uppgifter"). */
export function delkapitelKey(avsnitt: string): string | null {
  const m = avsnitt.match(/^([1-9]\d?)\.(\d{1,2})\b/);
  return m ? `${m[1]}.${m[2]}` : null;
}

/** Begrepp per delkapitel, härledda ur lektionernas begrepp-fält (dedupe, ordning bevaras). */
export function begreppPerDelkapitel(lektioner: Record<number, LessonRecord[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const list of Object.values(lektioner)) for (const l of list) {
    const key = delkapitelKey(l.avsnitt);
    if (!key || l.begrepp === '—') continue;
    const acc = out[key] ?? [];
    const seen = new Set(acc.map((b) => b.toLowerCase()));
    for (const b of l.begrepp.split(',')) {
      const t = b.trim();
      if (t === '' || t === '—' || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase()); acc.push(t);
    }
    out[key] = acc;
  }
  return out;
}

/** Hittar den lokala bok som initieringens bokval pekar på (titel, ev. förlag). */
export function hittaBokForVal(bocker: LokalBok[], val: { titel: string; forlag?: string } | null | undefined): LokalBok | null {
  if (!val || val.titel.trim() === '') return null;
  const t = val.titel.trim().toLowerCase();
  const kandidater = bocker.filter((b) => b.bok.titel.trim().toLowerCase() === t);
  if (kandidater.length === 0) return null;
  const f = (val.forlag ?? '').trim().toLowerCase();
  return (f !== '' ? kandidater.find((b) => b.bok.förlag.trim().toLowerCase() === f) : undefined) ?? kandidater[0];
}

function kravSträng(v: unknown, falt: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`Fältet "${falt}" saknas eller är tomt.`);
  return v.trim();
}

function tillText(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}

/** Förlåtande normalisering: saknade textfält blir "—", okänd typ blir "regular". */
export function normalizeLesson(raw: Record<string, unknown>, kapitel: number, index: number): LessonRecord {
  const id = Number(raw.id);
  if (!Number.isFinite(id)) throw new Error(`Kapitel ${kapitel}, lektion ${index + 1}: "id" saknas eller är inte ett tal.`);
  const avsnitt = typeof raw.avsnitt === 'string' && raw.avsnitt.trim() !== '' ? raw.avsnitt.trim() : `${kapitel}.?`;
  const typ = typeof raw.type === 'string' && (LESSON_TYPES as string[]).includes(raw.type)
    ? (raw.type as LessonType) : 'regular';
  const del = Number(raw.del);
  return {
    id, type: typ, avsnitt, del: Number.isFinite(del) ? del : 1,
    grön: tillText(raw['grön'] ?? raw['gron'] ?? raw['ett']),
    blå: tillText(raw['blå'] ?? raw['bla'] ?? raw['två'] ?? raw['tva']),
    röd: tillText(raw['röd'] ?? raw['rod'] ?? raw['tre']),
    sidor_teori: tillText(raw.sidor_teori), begrepp: tillText(raw.begrepp),
    soc_start: tillText(raw.soc_start), exit: tillText(raw.exit), genomgang: tillText(raw.genomgang),
    bam_gora: tillText(raw.bam_gora), bam_lara: tillText(raw.bam_lara), bam_ex: tillText(raw.bam_ex),
    ex: tillText(raw.ex), laxa: tillText(raw.laxa),
  };
}

const DEFAULT_KAPMETA: Omit<KapitelMeta, 'name'> = {
  col: '#455a64', lektioner: 0, veckor: '', term: '', sidor_samm: '', prov: '',
};

/**
 * Validerar och normaliserar en bokimport. Kastar Error med svenskt
 * meddelande vid strukturfel; är förlåtande med saknade textfält
 * (AI-utdata är sällan perfekt) men aldrig med identitet (id, titel, ämne).
 */
export function validateBokImport(data: unknown): LokalBok {
  if (typeof data !== 'object' || data === null) throw new Error('Filen innehåller inte ett JSON-objekt.');
  const d = data as Record<string, unknown>;
  if (d.schema !== BOK_IMPORT_SCHEMA) {
    throw new Error(`Filen är inte en bokimport (förväntade schema "${BOK_IMPORT_SCHEMA}").`);
  }
  const bokRaw = d.bok;
  if (typeof bokRaw !== 'object' || bokRaw === null) throw new Error('Fältet "bok" saknas.');
  const b = bokRaw as Record<string, unknown>;
  const arskurs = Number(b['årskurs'] ?? b['arskurs']);
  if (!Number.isFinite(arskurs) || arskurs < 1 || arskurs > 9) {
    throw new Error('Fältet "årskurs" måste vara ett tal 1–9.');
  }

  const lektionerRaw = d.lektioner;
  if (typeof lektionerRaw !== 'object' || lektionerRaw === null) throw new Error('Fältet "lektioner" saknas.');
  const lektioner: Record<number, LessonRecord[]> = {};
  const kapitelMetaIn = (typeof b.kapitelMeta === 'object' && b.kapitelMeta !== null
    ? b.kapitelMeta : {}) as Record<string, Partial<KapitelMeta>>;
  const kapitelMeta: Record<string, KapitelMeta> = {};
  const allaRader: Array<Record<string, unknown>> = [];

  for (const [kapStr, list] of Object.entries(lektionerRaw as Record<string, unknown>)) {
    const kap = Number(kapStr);
    if (!Number.isFinite(kap)) throw new Error(`Kapitelnyckeln "${kapStr}" är inte ett tal.`);
    if (!Array.isArray(list)) throw new Error(`Kapitel ${kap}: "lektioner" måste vara en lista.`);
    const rader = list.map((row, i) => {
      if (typeof row !== 'object' || row === null) throw new Error(`Kapitel ${kap}, lektion ${i + 1}: inte ett objekt.`);
      allaRader.push(row as Record<string, unknown>);
      return normalizeLesson(row as Record<string, unknown>, kap, i);
    });
    const ids = new Set<number>();
    for (const r of rader) {
      if (ids.has(r.id)) throw new Error(`Kapitel ${kap}: lektions-id ${r.id} förekommer flera gånger.`);
      ids.add(r.id);
    }
    lektioner[kap] = rader;
    const metaIn = kapitelMetaIn[kapStr] ?? {};
    // Sammanfattnings- och provsidor härleds ur lektionsbladen om boken inte anger dem.
    const samm = rader.find((l) => l.type === 'review') ?? rader.find((l) => /sammanfattning/i.test(l.avsnitt));
    const prov = rader.find((l) => l.type === 'exam') ?? rader.find((l) => l.type === 'test');
    kapitelMeta[kapStr] = {
      ...DEFAULT_KAPMETA,
      ...metaIn,
      name: typeof metaIn.name === 'string' && metaIn.name.trim() !== '' ? metaIn.name : `Kapitel ${kap}`,
      lektioner: rader.length,
      sidor_samm: metaIn.sidor_samm || (samm && samm.sidor_teori !== '—' ? samm.sidor_teori : ''),
      prov: metaIn.prov || (prov ? (prov.sidor_teori !== '—' ? `${prov.avsnitt} (${prov.sidor_teori})` : prov.avsnitt) : ''),
    };
  }
  if (Object.keys(lektioner).length === 0) throw new Error('Boken innehåller inga kapitel.');

  const bok: BookFile = {
    id: kravSträng(b.id, 'bok.id'),
    titel: kravSträng(b.titel, 'bok.titel'),
    förlag: typeof b['förlag'] === 'string' ? b['förlag'] : (typeof b['forlag'] === 'string' ? b['forlag'] : ''),
    ämne: kravSträng(b['ämne'] ?? b['amne'], 'bok.ämne'),
    årskurs: arskurs,
    kapitelMeta,
  };
  return { bok, lektioner, nivaer: detectNivaer(allaRader) };
}

export interface BokFilter { amne?: string | null; arskurs?: number | null; }

/** Filtrerar på ämne och/eller årskurs; null/undefined = inget filter. */
export function filterBocker<T extends { ämne: string; årskurs: number }>(bocker: T[], f: BokFilter): T[] {
  return bocker.filter((b) =>
    (f.amne == null || b.ämne === f.amne) &&
    (f.arskurs == null || b.årskurs === f.arskurs)
  );
}

/** Antal lektioner totalt i en lokal bok. */
export function raknaLektioner(lektioner: Record<number, LessonRecord[]>): number {
  return Object.values(lektioner).reduce((sum, l) => sum + l.length, 0);
}

/**
 * Grupperar objekt per ämne för visning: standardämnena i fast ordning
 * först, därefter övriga ämnen i svensk bokstavsordning, sist "Allmänt"
 * (objekt utan ämne). Tomma grupper utelämnas.
 */
export function grupperaPerAmne<T extends { amne?: string }>(items: T[]): Array<[string, T[]]> {
  const grupper = new Map<string, T[]>();
  for (const item of items) {
    const amne = item.amne?.trim() || 'Allmänt';
    grupper.set(amne, [...(grupper.get(amne) ?? []), item]);
  }
  const ovriga = [...grupper.keys()]
    .filter((a) => !STANDARD_AMNEN.includes(a) && a !== 'Allmänt')
    .sort((a, b) => a.localeCompare(b, 'sv'));
  const ordning = [...STANDARD_AMNEN, ...ovriga, 'Allmänt'];
  return ordning.flatMap((a) => {
    const list = grupper.get(a);
    return list ? [[a, list] as [string, T[]]] : [];
  });
}
