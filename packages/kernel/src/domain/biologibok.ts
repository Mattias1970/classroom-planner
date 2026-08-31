/**
 * Biologibok (NO-formatet): läser books/<bok-id>/book.json i det format som
 * Spektrum-böckerna i datarepot använder (id/titel/kapitel med delkapitel,
 * begrepp och Testa dig själv — inget schema-fält) och bygger en v2-Bok
 * enligt NO-planeringsmallen: en lektion per delkapitel med läxförhör
 * (kumulativt, krav ≥ 90 %) och exit ticket (krav ≥ 70 %), följt av
 * PERSPEKTIV, FINALEN och PROV.
 *
 * Socrative-namnkonvention: ämnesprefix + kapitelnummer + delkapitlens
 * ordningstal i följd. Enskilt rum: Biologi61 (begrepp 6.1). Kumulativt:
 * Biologi6123 (6.1–6.3), Biologi612345678 (6.1–6.8).
 */
import { BOK_SCHEMA, NIVA_GRON_BLA_ROD, bokFromImport, byggKapitel } from './bok.js';
import type { Bok, Kapitel, Lektion } from './typer.js';

/** Exit ticket: har eleven lärt sig lektionens begrepp? */
export const NO_KRAV_EXIT = 70;
/** Läxförhör: kan eleven samtliga begrepp hittills? */
export const NO_KRAV_LAXFORHOR = 90;

/** Enskilt rum för ett delkapitels begrepp, t.ex. Biologi61 för 6.1. */
export function socrativeExitRum(prefix: string, kapitel: number, delkapitelNr: number): string {
  return `${prefix}${kapitel}${delkapitelNr}`;
}

/** Kumulativt rum för begrepp 1..tomDelkapitelNr: Biologi612, Biologi6123 … */
export function socrativeLaxforhorRum(prefix: string, kapitel: number, tomDelkapitelNr: number): string {
  let siffror = '';
  for (let i = 1; i <= tomDelkapitelNr; i++) siffror += String(i);
  return `${prefix}${kapitel}${siffror}`;
}

const NO_KAPITELFARGER = ['#2e7d32', '#8d3f2a', '#1d5f7a', '#6a3f8d', '#8d6a1d', '#37596b'];

function txt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}
function kravStrang(v: unknown, falt: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`Fältet "${falt}" saknas eller är tomt.`);
  return v.trim();
}
function strangLista(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
}

interface RawDelkapitel {
  nummer: string; titel: string; sidor: string;
  begrepp: string[]; extraBegrepp: string[]; testaFragor: number;
  genomgangLank?: string; forklaringar: Record<string, string>;
}

function lasDelkapitel(raw: unknown, kapNr: number, index: number): RawDelkapitel {
  if (raw === null || typeof raw !== 'object') throw new Error(`Kapitel ${kapNr}, delkapitel ${index + 1}: inte ett objekt.`);
  const r = raw as Record<string, unknown>;
  const nummer = kravStrang(r.nummer, `kapitel ${kapNr}, delkapitel ${index + 1}: nummer`);
  const tds = r.testaDigSjalv as Record<string, unknown> | undefined;
  const forklaringar: Record<string, string> = {};
  if (r.forklaringar !== null && typeof r.forklaringar === 'object' && !Array.isArray(r.forklaringar)) {
    for (const [k, v] of Object.entries(r.forklaringar as Record<string, unknown>)) {
      if (typeof v === 'string' && k.trim() !== '' && v.trim() !== '') forklaringar[k.trim()] = v.trim();
    }
  }
  return {
    nummer, titel: kravStrang(r.titel, `delkapitel ${nummer}: titel`), sidor: txt(r.sidor),
    begrepp: strangLista(r.begrepp), extraBegrepp: strangLista(r.extraBegrepp),
    testaFragor: tds && typeof tds === 'object' ? strangLista(tds.fragor).length : 0,
    ...(typeof r.genomgangLank === 'string' && r.genomgangLank.startsWith('http') ? { genomgangLank: r.genomgangLank } : {}),
    forklaringar,
  };
}

const TOM = { niva1: '—', niva2: '—', niva3: '—' } as const;

function delkapitelLektion(d: RawDelkapitel, index1: number, prefix: string, kapNr: number): Lektion {
  const laxforhor = index1 === 1 ? '—'
    : `${socrativeLaxforhorRum(prefix, kapNr, index1 - 1)} (krav ≥ ${NO_KRAV_LAXFORHOR} %)`;
  return {
    id: index1, typ: 'regular', avsnitt: `${d.nummer} ${d.titel}`, del: 1, ...TOM,
    sidorTeori: d.sidor,
    begrepp: d.begrepp.length > 0 ? d.begrepp.join(', ') : '—',
    genomgang: d.titel,
    ...(d.genomgangLank !== undefined ? { genomgangLank: d.genomgangLank } : {}),
    laxa: `Alla begrepp t.o.m. ${d.nummer} – ${socrativeLaxforhorRum(prefix, kapNr, index1)} ≥ ${NO_KRAV_LAXFORHOR} %`,
    ex: d.testaFragor > 0 ? `Testa dig själv ${d.nummer} · uppgift 1–${d.testaFragor}` : '—',
    socStart: laxforhor,
    exit: `${socrativeExitRum(prefix, kapNr, index1)} (krav ≥ ${NO_KRAV_EXIT} %)`,
  };
}

function lasKapitel(raw: unknown, index: number, prefix: string): Kapitel {
  if (raw === null || typeof raw !== 'object') throw new Error(`Kapitel ${index + 1}: inte ett objekt.`);
  const r = raw as Record<string, unknown>;
  const nummer = Number(r.nummer);
  if (!Number.isFinite(nummer)) throw new Error(`Kapitel ${index + 1}: "nummer" saknas eller är inte ett tal.`);
  const titel = kravStrang(r.titel, `kapitel ${nummer}: titel`);
  const delkapitelRaw = r.delkapitel;
  if (!Array.isArray(delkapitelRaw) || delkapitelRaw.length === 0) throw new Error(`Kapitel ${nummer}: "delkapitel" saknas eller är tom.`);

  const delkapitel = delkapitelRaw.map((d, i) => lasDelkapitel(d, nummer, i));
  const alla = `${socrativeLaxforhorRum(prefix, nummer, delkapitel.length)} (krav ≥ ${NO_KRAV_LAXFORHOR} %)`;
  const lektioner: Lektion[] = delkapitel.map((d, i) => delkapitelLektion(d, i + 1, prefix, nummer));
  let id = lektioner.length;

  const persp = r.perspektiv as Record<string, unknown> | undefined;
  if (persp && typeof persp === 'object') {
    const fragor = strangLista(persp.fragor).length;
    lektioner.push({
      id: ++id, typ: 'ovaformagor', avsnitt: 'PERSPEKTIV', del: 1, ...TOM,
      sidorTeori: txt(persp.sidor), begrepp: '—',
      genomgang: typeof persp.titel === 'string' && persp.titel.trim() !== '' ? persp.titel.trim() : 'Perspektiv',
      laxa: 'Gör klart de skriftliga svaren på Perspektiv-frågorna',
      ex: fragor > 0 ? `${fragor} diskussionsfrågor (EPA)` : '—',
      socStart: alla, exit: '—',
    });
  }
  const fin = r.finalen as Record<string, unknown> | undefined;
  if (fin && typeof fin === 'object') {
    const antal = Number(fin.antalUppgifter);
    lektioner.push({
      id: ++id, typ: 'repetition', avsnitt: 'FINALEN', del: 1, ...TOM,
      sidorTeori: txt(fin.sidor), begrepp: '—',
      genomgang: 'FINALEN – blandade uppgifter',
      laxa: 'Gör klart FINALEN',
      ex: Number.isFinite(antal) ? `${antal} uppgifter` : '—',
      socStart: `${socrativeLaxforhorRum(prefix, nummer, delkapitel.length)} (omtag, krav ≥ ${NO_KRAV_LAXFORHOR} %)`, exit: '—',
    });
  }
  const samm = r.sammanfattning as Record<string, unknown> | undefined;
  lektioner.push({
    id: ++id, typ: 'exam', avsnitt: 'PROV', del: 1, ...TOM,
    sidorTeori: samm && typeof samm === 'object' ? txt(samm.sidor) : '—', begrepp: '—',
    genomgang: 'Repetition mot kapitelmålen → prov',
    laxa: 'Hela begreppssammanfattningen + Testa dig själv-frågorna + FINALEN',
    ex: '—', socStart: alla, exit: '—',
  });

  const kap = byggKapitel(nummer, titel, NO_KAPITELFARGER[index % NO_KAPITELFARGER.length], lektioner);
  kap.resurser.forklaringar = Object.assign({}, ...delkapitel.map((d) => d.forklaringar)) as Record<string, string>;
  kap.resurser.filmer = delkapitel
    .filter((d) => d.genomgangLank !== undefined)
    .map((d) => ({ titel: `${d.nummer} ${d.titel} — genomgång`, url: d.genomgangLank ?? '' }));
  return kap;
}

/** Läser en NO-bok (biologibok-formatet, utan schema-fält) till en v2-Bok. */
export function bokFromBiologiImport(json: string): Bok {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(json) as Record<string, unknown>; }
  catch { throw new Error('Filen är inte giltig JSON.'); }
  const id = kravStrang(raw.id, 'id');
  const titel = kravStrang(raw.titel, 'titel');
  const kapitelRaw = raw.kapitel;
  if (!Array.isArray(kapitelRaw) || kapitelRaw.length === 0) throw new Error('Fältet "kapitel" saknas eller är tomt.');
  const amne = typeof raw.amne === 'string' && raw.amne.trim() !== '' ? raw.amne.trim() : 'Biologi';
  const arskurs = Number(raw.arskurs);
  return {
    id, titel,
    forlag: txt(raw.forlag) === '—' ? '' : txt(raw.forlag),
    amne, arskurs: Number.isFinite(arskurs) ? arskurs : 0,
    nivaer: NIVA_GRON_BLA_ROD,
    kapitel: kapitelRaw.map((k, i) => lasKapitel(k, i, amne)),
  };
}

/**
 * Läser en bokfil oavsett format: schemat "classroom-planner-bok" går via
 * bokFromImport, ett biologibok-objekt (kapitel med delkapitel, utan
 * schema-fält) via bokFromBiologiImport. Kastar Error med svensk text.
 */
export function bokFromValfriImport(json: string): Bok {
  let raw: unknown;
  try { raw = JSON.parse(json) as unknown; }
  catch { throw new Error('Filen är inte giltig JSON.'); }
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (r.schema === BOK_SCHEMA) return bokFromImport(json);
  if (Array.isArray(r.kapitel)) return bokFromBiologiImport(json);
  throw new Error(`Filen är varken en bokfil (schema "${BOK_SCHEMA}") eller en NO-bok (kapitel med delkapitel).`);
}
