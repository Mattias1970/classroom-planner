/**
 * Bok (v2): fristående bibliotek. Import läser befintliga bokfiler
 * (schema "classroom-planner-bok" version 1 — t.ex. Matematik Y skapad ur
 * fotograferade boksidor via AI-prompten) och bygger kapitel → delkapitel →
 * lektioner med sidregister, begrepp per delkapitel, kapitlets begreppslista
 * och tomma resursytor (filmer, flippat klassrum).
 */
import type { Bok, Delkapitel, Kapitel, Lektion, LektionsTyp, NivaEtiketter } from './typer.js';

export const BOK_SCHEMA = 'classroom-planner-bok';
const TYPER: LektionsTyp[] = ['regular', 'test', 'repetition', 'review', 'ovaformagor', 'exam'];

export const NIVA_ETT_TVA_TRE: NivaEtiketter = { niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' };
export const NIVA_GRON_BLA_ROD: NivaEtiketter = { niva1: 'Grön', niva2: 'Blå', niva3: 'Röd' };

function txt(v: unknown): string {
  if (v === undefined || v === null) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}
function har(v: string): boolean { return v !== '—' && v !== ''; }

/** '4.6' ur '4.6 Ekvationer'; null för t.ex. 'Blandade uppgifter'. */
export function delkapitelKod(avsnitt: string): string | null {
  const m = avsnitt.match(/^([1-9]\d?)\.(\d{1,2})\b/);
  return m ? `${m[1]}.${m[2]}` : null;
}

/** 's. 184–186' m.fl. → alla sidnummer i strängen. */
function sidnummer(s: string): number[] {
  return [...s.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n > 0 && n < 2000);
}
/** Sammanfattar sidspann ur flera sidsträngar: 's. 184–212' ('—' om inga). */
export function sidspann(sidor: string[]): string {
  const alla = sidor.flatMap(sidnummer);
  if (alla.length === 0) return '—';
  const min = Math.min(...alla), max = Math.max(...alla);
  return min === max ? `s. ${min}` : `s. ${min}–${max}`;
}

function splitBegrepp(s: string): string[] {
  if (!har(s)) return [];
  return s.split(',').map((b) => b.trim()).filter((b) => b !== '' && b !== '—');
}
function dedupe(list: string[]): string[] {
  const seen = new Set<string>(); const ut: string[] = [];
  for (const b of list) { const k = b.toLowerCase(); if (!seen.has(k)) { seen.add(k); ut.push(b); } }
  return ut;
}

interface RawLektion { [k: string]: unknown; }

function lasLektion(raw: RawLektion, kap: number, idx: number): Lektion {
  const id = raw['id'];
  if (!Number.isInteger(id)) throw new Error(`Kapitel ${kap}, lektion #${idx + 1}: id måste vara ett heltal.`);
  const typ = (raw['type'] ?? raw['typ'] ?? 'regular') as LektionsTyp;
  if (!TYPER.includes(typ)) throw new Error(`Kapitel ${kap}, id ${String(id)}: ogiltig type "${String(typ)}".`);
  return {
    id: id as number, typ,
    avsnitt: txt(raw['avsnitt']),
    del: Number.isInteger(raw['del']) ? (raw['del'] as number) : 1,
    niva1: txt(raw['ett'] ?? raw['grön'] ?? raw['gron'] ?? raw['niva1']),
    niva2: txt(raw['två'] ?? raw['tva'] ?? raw['blå'] ?? raw['bla'] ?? raw['niva2']),
    niva3: txt(raw['tre'] ?? raw['röd'] ?? raw['rod'] ?? raw['niva3']),
    sidorTeori: txt(raw['sidor_teori'] ?? raw['sidorTeori']),
    begrepp: txt(raw['begrepp']),
    genomgang: txt(raw['genomgang']),
    ...(typeof raw['genomgang_lank'] === 'string' && (raw['genomgang_lank'] as string).startsWith('http')
      ? { genomgangLank: raw['genomgang_lank'] as string } : {}),
    laxa: txt(raw['laxa'] ?? raw['läxa']),
    ex: txt(raw['ex'] ?? raw['bam_ex']),
    socStart: txt(raw['soc_start'] ?? raw['socStart']),
    exit: txt(raw['exit']),
  };
}

function detectNivaer(rader: RawLektion[]): NivaEtiketter {
  let ett = 0, gron = 0;
  const finns = (r: RawLektion, keys: string[]) => keys.some((k) => r[k] !== undefined);
  for (const r of rader) {
    if (finns(r, ['ett', 'två', 'tva', 'tre'])) ett++;
    if (finns(r, ['grön', 'gron', 'blå', 'bla', 'röd', 'rod'])) gron++;
  }
  return ett > 0 && ett >= gron ? NIVA_ETT_TVA_TRE : NIVA_GRON_BLA_ROD;
}

/** Delkapitlets namn ur första lektionens rubrik: '4.6 Ekvationer' → 'Ekvationer'. */
function delkapitelNamn(avsnitt: string, kod: string): string {
  const rest = avsnitt.slice(kod.length).trim();
  return rest !== '' ? rest : kod;
}

/** Grupperar ett kapitels lektioner till delkapitel (bokordning) + extra. */
export function byggKapitel(nr: number, namn: string, farg: string, lektioner: Lektion[]): Kapitel {
  const ordning: string[] = [];
  const perKod = new Map<string, Lektion[]>();
  const extra: Lektion[] = [];
  for (const l of lektioner) {
    const kod = delkapitelKod(l.avsnitt);
    if (kod === null) { extra.push(l); continue; }
    if (!perKod.has(kod)) { perKod.set(kod, []); ordning.push(kod); }
    perKod.get(kod)!.push(l);
  }
  const delkapitel: Delkapitel[] = ordning.map((kod) => {
    const ls = perKod.get(kod)!;
    return {
      kod,
      namn: delkapitelNamn(ls[0].avsnitt, kod),
      sidor: sidspann(ls.map((l) => l.sidorTeori)),
      begrepp: dedupe(ls.flatMap((l) => splitBegrepp(l.begrepp))),
      lektioner: ls,
    };
  });
  return {
    nr, namn, farg,
    sidor: sidspann(lektioner.map((l) => l.sidorTeori)),
    delkapitel,
    extraLektioner: extra,
    begreppslista: dedupe(delkapitel.flatMap((d) => d.begrepp)),
    resurser: { filmer: [] },
  };
}

/**
 * Läser en bokfil (v1-JSON) till v2-modellen. Kastar Error med svensk text.
 * Filen skapas genom att fotografera boksidor och köra prompten "Bokimport";
 * sidregistret (kapitel/teori/delkapitel/avsnitt med sidnummer) kan sedan
 * exporteras som Excel.
 */
export function bokFromImport(json: string): Bok {
  let raw: { schema?: unknown; version?: unknown; bok?: RawLektion; lektioner?: Record<string, RawLektion[]> };
  try { raw = JSON.parse(json) as typeof raw; }
  catch { throw new Error('Filen är inte giltig JSON.'); }
  if (raw.schema !== BOK_SCHEMA) throw new Error(`Filen är inte en bokfil (schema måste vara "${BOK_SCHEMA}").`);
  if (raw.version !== 1) throw new Error(`Okänd version ${String(raw.version)} — appen läser version 1.`);
  const b = raw.bok ?? {};
  const id = txt(b['id']); const titel = txt(b['titel']);
  if (!har(id)) throw new Error('bok.id saknas.');
  if (!har(titel)) throw new Error('bok.titel saknas.');
  const kapMeta = (b['kapitelMeta'] ?? {}) as Record<string, { name?: unknown; col?: unknown; filmer?: unknown; forklaringar?: unknown }>;
  const lekRaw = raw.lektioner ?? {};
  const kapNrs = Object.keys(kapMeta).map(Number).filter((n) => Number.isInteger(n) && n > 0).sort((a, c) => a - c);
  if (kapNrs.length === 0) throw new Error('bok.kapitelMeta är tom — minst ett kapitel krävs.');

  const allaRader = kapNrs.flatMap((k) => lekRaw[String(k)] ?? []);
  const kapitel: Kapitel[] = kapNrs.map((nr) => {
    const rader = lekRaw[String(nr)] ?? [];
    const lektioner = rader.map((r, i) => lasLektion(r, nr, i));
    const ids = new Set<number>();
    for (const l of lektioner) {
      if (ids.has(l.id)) throw new Error(`Kapitel ${nr}: id ${l.id} förekommer flera gånger.`);
      ids.add(l.id);
    }
    const m = kapMeta[String(nr)] ?? {};
    const namn = typeof m.name === 'string' && m.name.trim() !== '' ? m.name : `Kapitel ${nr}`;
    const farg = typeof m.col === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.col) ? m.col : '#5c6b7a';
    const kap = byggKapitel(nr, namn, farg, lektioner);
    kap.resurser.filmer = lasKapitelFilmer(m.filmer);
    kap.resurser.forklaringar = lasForklaringar(m.forklaringar);
    return kap;
  });
  if (kapitel.every((k) => k.delkapitel.length === 0 && k.extraLektioner.length === 0)) {
    throw new Error('Boken innehåller inga lektioner.');
  }
  return {
    id, titel,
    forlag: txt(b['förlag'] ?? b['forlag']),
    amne: txt(b['ämne'] ?? b['amne']),
    arskurs: Number.isInteger(b['årskurs']) ? (b['årskurs'] as number) : 0,
    nivaer: detectNivaer(allaRader),
    kapitel,
  };
}

/** Kapitelfilmer ur bokfilen: 'Titel|https://…' eller { titel, url }. Ogiltiga poster hoppas över. */
function lasKapitelFilmer(raw: unknown): Array<{ titel: string; url: string }> {
  if (!Array.isArray(raw)) return [];
  const ut: Array<{ titel: string; url: string }> = [];
  for (const f of raw) {
    if (typeof f === 'string' && f.includes('|')) {
      const [titel, ...rest] = f.split('|');
      const url = rest.join('|').trim();
      if (titel.trim() !== '' && url.startsWith('http')) ut.push({ titel: titel.trim(), url });
    } else if (f !== null && typeof f === 'object') {
      const o = f as { titel?: unknown; url?: unknown };
      if (typeof o.titel === 'string' && o.titel.trim() !== '' && typeof o.url === 'string' && o.url.startsWith('http')) {
        ut.push({ titel: o.titel.trim(), url: o.url });
      }
    }
  }
  return ut;
}

/** Begreppsförklaringar ur bokfilen: objekt begrepp → beskrivning (strängar). */
function lasForklaringar(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const ut: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && k.trim() !== '' && v.trim() !== '') ut[k.trim()] = v.trim();
  }
  return ut;
}

/** Har boken nivåindelade uppgifter (Grön/Blå/Röd, ETT/TVÅ/TRE …)? NO-böcker saknar nivåer. */
export function bokHarNivaer(bok: Bok): boolean {
  return bok.kapitel.some((k) =>
    [...k.delkapitel.flatMap((d) => d.lektioner), ...k.extraLektioner].some(
      (l) => (l.niva1 !== '—' && l.niva1 !== '') || (l.niva2 !== '—' && l.niva2 !== '') || (l.niva3 !== '—' && l.niva3 !== '')));
}

/** Bokens alla lektioner i planeringsordning (kapitel stigande, bokordning inom). */
export function bokLektioner(bok: Bok): Array<{ kapitel: number; lektion: Lektion }> {
  return bok.kapitel.flatMap((k) => {
    const inne = [...k.delkapitel.flatMap((d) => d.lektioner), ...k.extraLektioner]
      .sort((a, b) => a.id - b.id);
    return inne.map((lektion) => ({ kapitel: k.nr, lektion }));
  });
}

/** Bokens totala begreppslista (för begreppsvyn). */
export function bokBegrepp(bok: Bok): Array<{ kapitel: number; kod: string; begrepp: string[] }> {
  return bok.kapitel.flatMap((k) => k.delkapitel.filter((d) => d.begrepp.length > 0)
    .map((d) => ({ kapitel: k.nr, kod: d.kod, begrepp: d.begrepp })));
}
