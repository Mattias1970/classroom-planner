/**
 * NO-böcker / Spektrum Biologi (del 26) — ren kärna (invariant I2).
 *
 * Läser bokformatet i classroom-planner-data: books/spektrum-biologi/book.json.
 * Formatet byggs inkrementellt av AI:n från fotograferade boksidor:
 *
 * {
 *   "id": "spektrum-biologi", "titel": "Spektrum Biologi", "forlag": "Liber",
 *   "amne": "Biologi", "arskurs": 8,
 *   "kapitel": [ { nummer, titel, undertitel?, sidor, mal[], delkapitel: [
 *     { nummer: "6.1", titel, sidor, begrepp[], extraBegrepp[],
 *       testaDigSjalv?: { sida, fragor[] } } ],
 *     perspektiv?: { titel, sidor, fragor[] },
 *     sammanfattning?: { sidor }, finalen?: { sidor, antalUppgifter? } } ]
 * }
 *
 * Modulen validerar formatet (svenska felmeddelanden, förlåtande med
 * saknade textfält som blir "—") och konverterar en bok till LokalBok
 * enligt NO-planeringsmallen: en lektion per delkapitel med Socrative-rum
 * (exit ≥ 70 %, kumulativt läxförhör ≥ 90 %), följt av Perspektiv,
 * FINALEN och Repetition → prov.
 *
 * Socrative-namnkonvention: rumsnamnet är ämnesprefixet + kapitelnumret +
 * delkapitlens ordningstal i följd. Enskilt rum: Biologi61 (begrepp 6.1).
 * Kumulativt rum: Biologi6123 (begrepp 6.1–6.3), Biologi612345678 (6.1–6.8).
 */
import { ValidationError } from '../errors.js';
import type { BookFile, KapitelMeta, LessonRecord } from '../records/lesson-record.js';
import type { LokalBok } from './bocker.js';

// ── Typer för bokformatet ─────────────────────────────────────

export interface BiologiTestaDigSjalv {
  sida?: number;
  fragor: string[];
}

export interface BiologiDelkapitel {
  /** Bokens numrering, t.ex. "6.1". */
  nummer: string;
  titel: string;
  sidor: string;
  /** Officiella begrepp (Testa dig själv-listan). */
  begrepp: string[];
  /** Övriga kursiva begrepp i brödtexten. */
  extraBegrepp: string[];
  testaDigSjalv?: BiologiTestaDigSjalv;
}

export interface BiologiPerspektiv {
  titel: string;
  sidor: string;
  fragor: string[];
}

export interface BiologiKapitel {
  nummer: number;
  titel: string;
  undertitel?: string;
  sidor: string;
  mal: string[];
  delkapitel: BiologiDelkapitel[];
  perspektiv?: BiologiPerspektiv;
  sammanfattning?: { sidor: string };
  finalen?: { sidor: string; antalUppgifter?: number };
}

export interface BiologiBokFil {
  id: string;
  titel: string;
  forlag: string;
  amne: string;
  arskurs: number;
  kapitel: BiologiKapitel[];
}

// ── Kravnivåer och Socrative-namnkonvention ───────────────────

/** Exit ticket: har eleven lärt sig lektionens begrepp? */
export const NO_KRAV_EXIT = 70;
/** Läxförhör: kan eleven samtliga begrepp hittills? */
export const NO_KRAV_LAXFORHOR = 90;

/** Enskilt rum för ett delkapitels begrepp, t.ex. Biologi61 för 6.1. */
export function socrativeExitRum(prefix: string, kapitel: number, delkapitelNr: number): string {
  return `${prefix}${kapitel}${delkapitelNr}`;
}

/**
 * Kumulativt rum för begrepp 1..tomDelkapitelNr, med alla ordningstal i
 * följd: Biologi612 (6.1–6.2), Biologi6123 (6.1–6.3), Biologi612345678.
 */
export function socrativeLaxforhorRum(prefix: string, kapitel: number, tomDelkapitelNr: number): string {
  let siffror = '';
  for (let i = 1; i <= tomDelkapitelNr; i++) siffror += String(i);
  return `${prefix}${kapitel}${siffror}`;
}

// ── Validering ────────────────────────────────────────────────

function tillText(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}

function kravStrang(v: unknown, falt: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ValidationError(`Fältet "${falt}" saknas eller är tomt.`, falt);
  }
  return v.trim();
}

function strangLista(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
}

function tolkaTestaDigSjalv(raw: unknown): BiologiTestaDigSjalv | undefined {
  if (raw === null || raw === undefined || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const sida = Number(r.sida);
  return { ...(Number.isFinite(sida) ? { sida } : {}), fragor: strangLista(r.fragor) };
}

function tolkaDelkapitel(raw: unknown, kapNr: number, index: number): BiologiDelkapitel {
  if (raw === null || typeof raw !== 'object') {
    throw new ValidationError(`Kapitel ${kapNr}, delkapitel ${index + 1}: inte ett objekt.`, 'delkapitel');
  }
  const r = raw as Record<string, unknown>;
  const nummer = kravStrang(r.nummer, `kapitel ${kapNr}, delkapitel ${index + 1}: nummer`);
  const titel = kravStrang(r.titel, `delkapitel ${nummer}: titel`);
  const tds = tolkaTestaDigSjalv(r.testaDigSjalv);
  return {
    nummer, titel, sidor: tillText(r.sidor),
    begrepp: strangLista(r.begrepp), extraBegrepp: strangLista(r.extraBegrepp),
    ...(tds ? { testaDigSjalv: tds } : {}),
  };
}

function tolkaPerspektiv(raw: unknown): BiologiPerspektiv | undefined {
  if (raw === null || raw === undefined || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const titel = typeof r.titel === 'string' && r.titel.trim() !== '' ? r.titel.trim() : 'Perspektiv';
  return { titel, sidor: tillText(r.sidor), fragor: strangLista(r.fragor) };
}

function tolkaKapitel(raw: unknown, index: number): BiologiKapitel {
  if (raw === null || typeof raw !== 'object') {
    throw new ValidationError(`Kapitel ${index + 1}: inte ett objekt.`, 'kapitel');
  }
  const r = raw as Record<string, unknown>;
  const nummer = Number(r.nummer);
  if (!Number.isFinite(nummer)) {
    throw new ValidationError(`Kapitel ${index + 1}: "nummer" saknas eller är inte ett tal.`, 'nummer');
  }
  const titel = kravStrang(r.titel, `kapitel ${nummer}: titel`);
  const delkapitelRaw = r.delkapitel;
  if (!Array.isArray(delkapitelRaw) || delkapitelRaw.length === 0) {
    throw new ValidationError(`Kapitel ${nummer}: "delkapitel" saknas eller är tom.`, 'delkapitel');
  }
  const undertitel = typeof r.undertitel === 'string' && r.undertitel.trim() !== '' ? r.undertitel.trim() : undefined;
  const samm = r.sammanfattning as Record<string, unknown> | undefined;
  const fin = r.finalen as Record<string, unknown> | undefined;
  const antal = fin ? Number(fin.antalUppgifter) : NaN;
  const perspektiv = tolkaPerspektiv(r.perspektiv);
  return {
    nummer, titel, ...(undertitel ? { undertitel } : {}), sidor: tillText(r.sidor),
    mal: strangLista(r.mal),
    delkapitel: delkapitelRaw.map((d, i) => tolkaDelkapitel(d, nummer, i)),
    ...(perspektiv ? { perspektiv } : {}),
    ...(samm && typeof samm === 'object' ? { sammanfattning: { sidor: tillText(samm.sidor) } } : {}),
    ...(fin && typeof fin === 'object'
      ? { finalen: { sidor: tillText(fin.sidor), ...(Number.isFinite(antal) ? { antalUppgifter: antal } : {}) } }
      : {}),
  };
}

/**
 * Validerar och normaliserar en NO-bok. Kastar ValidationError med
 * svenskt meddelande vid strukturfel; saknade textfält blir "—".
 * Muterar aldrig indata.
 */
export function validateBiologiBok(data: unknown): BiologiBokFil {
  if (data === null || typeof data !== 'object') {
    throw new ValidationError('Bokfilen är inte ett JSON-objekt.');
  }
  const r = data as Record<string, unknown>;
  const id = kravStrang(r.id, 'id');
  const titel = kravStrang(r.titel, 'titel');
  const kapitelRaw = r.kapitel;
  if (!Array.isArray(kapitelRaw) || kapitelRaw.length === 0) {
    throw new ValidationError('Fältet "kapitel" saknas eller är tomt.', 'kapitel');
  }
  const arskurs = Number(r.arskurs);
  return {
    id, titel,
    forlag: tillText(r.forlag),
    amne: typeof r.amne === 'string' && r.amne.trim() !== '' ? r.amne.trim() : 'Biologi',
    arskurs: Number.isFinite(arskurs) ? arskurs : 0,
    kapitel: kapitelRaw.map((k, i) => tolkaKapitel(k, i)),
  };
}

// ── Konvertering till LokalBok (NO-planeringsmallen) ──────────

const NO_KAPITELFARGER = ['#2e7d32', '#8d3f2a', '#1d5f7a', '#6a3f8d', '#8d6a1d', '#37596b'];

const TOM_FALT = {
  grön: '—', blå: '—', röd: '—',
  bam_gora: '—', bam_lara: '—', bam_ex: '—',
} as const;

function delkapitelLektion(
  d: BiologiDelkapitel, index1: number, prefix: string, kapNr: number, id: number,
): LessonRecord {
  const exit = socrativeExitRum(prefix, kapNr, index1);
  const laxforhor = index1 === 1 ? '—' : `${socrativeLaxforhorRum(prefix, kapNr, index1 - 1)} (krav ≥ ${NO_KRAV_LAXFORHOR} %)`;
  const begrepp = d.begrepp.length > 0 ? d.begrepp.join(' · ') : '—';
  return {
    id, type: 'regular', avsnitt: d.nummer, del: 1, ...TOM_FALT,
    sidor_teori: d.sidor, begrepp,
    soc_start: laxforhor,
    exit: `${exit} (krav ≥ ${NO_KRAV_EXIT} %)`,
    genomgang: d.titel,
    ex: d.testaDigSjalv && d.testaDigSjalv.fragor.length > 0 ? `Testa dig själv ${d.nummer}` : '—',
    laxa: `Alla begrepp t.o.m. ${d.nummer} – ${socrativeLaxforhorRum(prefix, kapNr, index1)} ≥ ${NO_KRAV_LAXFORHOR} %`,
  };
}

/** Konverterar en NO-bok till LokalBok enligt NO-planeringsmallen. */
export function biologiBokTillLokalBok(bokFil: BiologiBokFil): LokalBok {
  const prefix = bokFil.amne;
  const kapitelMeta: Record<string, KapitelMeta> = {};
  const lektioner: Record<number, LessonRecord[]> = {};

  bokFil.kapitel.forEach((kap, kapIndex) => {
    const alla = socrativeLaxforhorRum(prefix, kap.nummer, kap.delkapitel.length);
    const rader: LessonRecord[] = kap.delkapitel.map((d, i) => delkapitelLektion(d, i + 1, prefix, kap.nummer, i + 1));
    let id = rader.length;

    if (kap.perspektiv) {
      id += 1;
      rader.push({
        id, type: 'ovaformagor', avsnitt: 'PERSPEKTIV', del: 1, ...TOM_FALT,
        sidor_teori: kap.perspektiv.sidor, begrepp: '—',
        soc_start: `${alla} (krav ≥ ${NO_KRAV_LAXFORHOR} %)`, exit: '—',
        genomgang: kap.perspektiv.titel,
        ex: kap.perspektiv.fragor.length > 0 ? `${kap.perspektiv.fragor.length} diskussionsfrågor (EPA)` : '—',
        laxa: 'Gör klart de skriftliga svaren på Perspektiv-frågorna',
      });
    }
    if (kap.finalen) {
      id += 1;
      rader.push({
        id, type: 'repetition', avsnitt: 'FINALEN', del: 1, ...TOM_FALT,
        sidor_teori: kap.finalen.sidor, begrepp: '—',
        soc_start: `${alla} (omtag, krav ≥ ${NO_KRAV_LAXFORHOR} %)`, exit: '—',
        genomgang: 'FINALEN – blandade uppgifter',
        ex: kap.finalen.antalUppgifter !== undefined ? `${kap.finalen.antalUppgifter} uppgifter` : '—',
        laxa: 'Gör klart FINALEN',
      });
    }
    id += 1;
    rader.push({
      id, type: 'exam', avsnitt: 'PROV', del: 1, ...TOM_FALT,
      sidor_teori: kap.sammanfattning ? kap.sammanfattning.sidor : '—', begrepp: '—',
      soc_start: `${alla} (krav ≥ ${NO_KRAV_LAXFORHOR} %)`, exit: '—',
      genomgang: 'Repetition mot kapitelmålen → prov',
      ex: '—',
      laxa: 'Hela begreppssammanfattningen + Testa dig själv-frågorna + FINALEN',
    });

    lektioner[kap.nummer] = rader;
    kapitelMeta[String(kap.nummer)] = {
      name: kap.titel,
      col: NO_KAPITELFARGER[kapIndex % NO_KAPITELFARGER.length],
      lektioner: rader.length,
      veckor: '', term: '',
      sidor_samm: kap.sammanfattning ? kap.sammanfattning.sidor : '—',
      prov: '—',
    };
  });

  const bok: BookFile = {
    id: bokFil.id, titel: bokFil.titel, förlag: bokFil.forlag,
    ämne: bokFil.amne, årskurs: bokFil.arskurs, kapitelMeta,
  };
  return { bok, lektioner };
}

/** Begrepp per delkapitel ("6.1" → [...]), för begreppsvyer och förhör. */
export function biologiBegreppPerDelkapitel(bokFil: BiologiBokFil): Record<string, string[]> {
  const ut: Record<string, string[]> = {};
  for (const kap of bokFil.kapitel) {
    for (const d of kap.delkapitel) ut[d.nummer] = [...d.begrepp];
  }
  return ut;
}
