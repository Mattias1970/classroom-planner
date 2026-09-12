/**
 * SuperTeach · Rapportmall — layouten för en utskriven rapport.
 *
 * En mall är en A4-sida med block placerade i millimeter. Varje block
 * visar antingen dekor (platta, rubrik, text, bild) eller data ur
 * SuperTeach (KPI, kurvor, frågematris, begreppslistor …). Mallen är ren
 * data: den kan sparas i datarepot (rapportmallar/<id>.json), delas mellan
 * datorer och återanvändas för hur många elever som helst.
 *
 * Koordinater i mm på A4 stående (210 × 297). Rutnätet är 5 mm.
 * (Ring 1, I2: ingen fetch/DOM/lagring.)
 */
import type { Struktur } from './typer.js';

export const A4 = { bredd: 210, hojd: 297 } as const;
export const RUTNAT = 5;

/** Vad ett block visar. Datablock hämtar sitt innehåll ur elevens resultat vid rendering. */
export type BlockTyp =
  | 'platta' | 'rubrik' | 'text' | 'bild'
  | 'kpi' | 'sammanfattning' | 'laget' | 'rad'
  | 'laxkurva' | 'exitlax' | 'fragematris' | 'delkapitel' | 'narvaro'
  | 'begrepp-kvar' | 'begrepp-vant' | 'studieplan' | 'qr';

export interface BlockStil {
  bakgrund?: string;
  kant?: string;
  /** Hörnradie i mm. */
  radie?: number;
  /** 0–1. */
  opacitet?: number;
  textfarg?: string;
  /** Punktstorlek för text/rubrik. */
  storlek?: number;
  fet?: boolean;
  /** Inre marginal i mm. */
  marginal?: number;
}

export interface Block {
  id: string;
  typ: BlockTyp;
  /** Sidnummer 1..antalSidor. Saknas = sida 1. */
  sida?: number;
  /** Position och storlek i mm. */
  x: number; y: number; b: number; h: number;
  /** Ritordning — lägre bakom. Plattor bör ligga lägst. */
  z: number;
  /** Egen rubrik ovanför datablock (tom = ingen). */
  rubrik?: string;
  /** Fri text för rubrik/text-block; stöder {elev}, {amne}, {datum}, {klass}. */
  text?: string;
  /** Källa för KPI-block. */
  kalla?: 'socrative-laxforhor' | 'socrative-exit' | 'socrative-ovning' | 'magma' | 'digiexam' | 'helhet';
  /** Data-URL för bildblock. */
  bild?: string;
  /** Socrative-rum för QR-block. */
  rum?: string;
  stil?: BlockStil;
}

export interface Rapportmall {
  id: string;
  namn: string;
  beskrivning?: string;
  /** Sidmarginal i mm. */
  marginal: number;
  /** Antal sidor (minst 1). */
  antalSidor?: number;
  /** Rutnät för snapp i mm (0 = av). */
  rutnat?: number;
  block: Block[];
  skapad: string;
  andrad: string;
  /** Version så att framtida ändringar av formatet kan migreras. */
  version: 1;
}

export const BLOCK_NAMN: Record<BlockTyp, string> = {
  platta: 'Platta', rubrik: 'Rubrik', text: 'Text', bild: 'Bild',
  kpi: 'KPI-kort', sammanfattning: 'Sammanfattning', laget: 'Hur går det?', rad: 'Vad kan du göra?',
  laxkurva: 'Läxförhör över tid', exitlax: 'Exit → läxförhör', fragematris: 'Frågematris', delkapitel: 'Delkapitel som led',
  narvaro: 'Närvaro', 'begrepp-kvar': 'Begrepp kvar att lära', 'begrepp-vant': 'Begrepp som vänts', studieplan: 'Studieplan', qr: 'Socrative-QR',
};

/** Standardstorlek (mm) när ett block läggs till. */
export const BLOCK_STANDARD: Record<BlockTyp, { b: number; h: number }> = {
  platta: { b: 90, h: 60 }, rubrik: { b: 170, h: 14 }, text: { b: 170, h: 24 }, bild: { b: 40, h: 40 },
  kpi: { b: 42, h: 26 }, sammanfattning: { b: 170, h: 20 }, laget: { b: 170, h: 50 }, rad: { b: 170, h: 50 },
  laxkurva: { b: 170, h: 60 }, exitlax: { b: 170, h: 55 }, fragematris: { b: 170, h: 70 }, delkapitel: { b: 170, h: 60 },
  narvaro: { b: 80, h: 40 }, 'begrepp-kvar': { b: 82, h: 60 }, 'begrepp-vant': { b: 82, h: 60 }, studieplan: { b: 170, h: 40 }, qr: { b: 40, h: 46 },
};

/** Datablock kräver en elev (och för vissa ett ämne) för att kunna renderas. */
export function arDatablock(typ: BlockTyp): boolean {
  return !['platta', 'rubrik', 'text', 'bild', 'qr'].includes(typ);
}

export function snappa(v: number, rutnat: number = RUTNAT): number {
  if (rutnat <= 0) return Math.round(v * 10) / 10;
  return Math.round(v / rutnat) * rutnat;
}

/** Tillåtna rutnät i designern (mm); 0 = fritt. */
export const RUTNAT_VAL = [0, 1, 2.5, 5, 10] as const;

export function antalSidor(m: Rapportmall): number { return Math.max(1, m.antalSidor ?? 1); }
export function blockSida(b: Block): number { return Math.max(1, b.sida ?? 1); }

function klamma(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function nyMall(id: string, namn: string, idag: string): Rapportmall {
  return { id, namn, marginal: 15, block: [], skapad: idag, andrad: idag, version: 1 };
}

export function laggTillBlock(m: Rapportmall, id: string, typ: BlockTyp, x = 20, y = 20, idag = m.andrad, sida = 1): Rapportmall {
  const std = BLOCK_STANDARD[typ];
  const g = m.rutnat ?? RUTNAT;
  const z = m.block.length === 0 ? 0 : Math.max(...m.block.map((b) => b.z)) + 1;
  const block: Block = { id, typ, sida, x: snappa(x, g), y: snappa(y, g), b: std.b, h: std.h, z: typ === 'platta' ? -1 : z };
  if (typ === 'rubrik') { block.text = 'Rapport — {elev}'; block.stil = { storlek: 20, fet: true }; }
  if (typ === 'text') { block.text = 'Skriv text här. {elev}, {amne} och {datum} byts ut.'; block.stil = { storlek: 11 }; }
  if (typ === 'platta') block.stil = { bakgrund: '#EEF3FB', radie: 3 };
  if (typ === 'kpi') block.kalla = 'socrative-laxforhor';
  return { ...m, block: [...m.block, block] };
}

export function flyttaBlock(m: Rapportmall, id: string, x: number, y: number, snapp = true): Rapportmall {
  const g = snapp ? (m.rutnat ?? RUTNAT) : 0;
  return {
    ...m,
    block: m.block.map((b) => (b.id !== id ? b : {
      ...b, x: klamma(snappa(x, g), 0, A4.bredd - b.b), y: klamma(snappa(y, g), 0, A4.hojd - b.h),
    })),
  };
}

/** Flyttar flera block samma sträcka (markerad grupp). */
export function flyttaFlera(m: Rapportmall, ids: string[], dx: number, dy: number, snapp = true): Rapportmall {
  let ut = m;
  for (const id of ids) { const b = m.block.find((x) => x.id === id); if (b !== undefined) ut = flyttaBlock(ut, id, b.x + dx, b.y + dy, snapp); }
  return ut;
}

export function andraStorlek(m: Rapportmall, id: string, bredd: number, hojd: number, snapp = true): Rapportmall {
  const g = snapp ? (m.rutnat ?? RUTNAT) : 0;
  return {
    ...m,
    block: m.block.map((b) => (b.id !== id ? b : {
      ...b, b: klamma(snappa(bredd, g), 10, A4.bredd - b.x), h: klamma(snappa(hojd, g), 6, A4.hojd - b.y),
    })),
  };
}

export type Linjering = 'vanster' | 'hcenter' | 'hoger' | 'topp' | 'vcenter' | 'botten';

/**
 * Linjerar markerade block mot varandra: vänsterkant, horisontell mitt, högerkant,
 * överkant, vertikal mitt eller underkant. Referensen är gruppens yttre kant
 * (respektive mitten av gruppens omslutande rektangel).
 */
export function linjeraBlock(m: Rapportmall, ids: string[], lage: Linjering): Rapportmall {
  const valda = m.block.filter((b) => ids.includes(b.id));
  if (valda.length < 2) return m;
  const minX = Math.min(...valda.map((b) => b.x)); const maxX = Math.max(...valda.map((b) => b.x + b.b));
  const minY = Math.min(...valda.map((b) => b.y)); const maxY = Math.max(...valda.map((b) => b.y + b.h));
  const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
  return {
    ...m,
    block: m.block.map((b) => {
      if (!ids.includes(b.id)) return b;
      switch (lage) {
        case 'vanster': return { ...b, x: minX };
        case 'hoger': return { ...b, x: maxX - b.b };
        case 'hcenter': return { ...b, x: Math.round((cx - b.b / 2) * 10) / 10 };
        case 'topp': return { ...b, y: minY };
        case 'botten': return { ...b, y: maxY - b.h };
        case 'vcenter': return { ...b, y: Math.round((cy - b.h / 2) * 10) / 10 };
        default: return b;
      }
    }),
  };
}

/** Fördelar markerade block med lika mellanrum vågrätt eller lodrätt. */
export function fordelaBlock(m: Rapportmall, ids: string[], riktning: 'vagratt' | 'lodratt'): Rapportmall {
  const valda = m.block.filter((b) => ids.includes(b.id)).sort((a, b) => (riktning === 'vagratt' ? a.x - b.x : a.y - b.y));
  if (valda.length < 3) return m;
  const forsta = valda[0]; const sista = valda[valda.length - 1];
  const total = riktning === 'vagratt' ? sista.x + sista.b - forsta.x : sista.y + sista.h - forsta.y;
  const summa = valda.reduce((n, b) => n + (riktning === 'vagratt' ? b.b : b.h), 0);
  const mellan = (total - summa) / (valda.length - 1);
  let pos = riktning === 'vagratt' ? forsta.x : forsta.y;
  const nyPos = new Map<string, number>();
  for (const b of valda) { nyPos.set(b.id, Math.round(pos * 10) / 10); pos += (riktning === 'vagratt' ? b.b : b.h) + mellan; }
  return { ...m, block: m.block.map((b) => (nyPos.has(b.id) ? (riktning === 'vagratt' ? { ...b, x: nyPos.get(b.id)! } : { ...b, y: nyPos.get(b.id)! }) : b)) };
}

export function laggTillSida(m: Rapportmall): Rapportmall {
  return { ...m, antalSidor: antalSidor(m) + 1 };
}

/** Tar bort en sida och dess block; efterföljande sidor numreras om. */
export function taBortSida(m: Rapportmall, sida: number): Rapportmall {
  if (antalSidor(m) <= 1) return m;
  return {
    ...m, antalSidor: antalSidor(m) - 1,
    block: m.block.filter((b) => blockSida(b) !== sida).map((b) => (blockSida(b) > sida ? { ...b, sida: blockSida(b) - 1 } : b)),
  };
}

/** Flyttar block till en annan sida. */
export function tillSida(m: Rapportmall, ids: string[], sida: number): Rapportmall {
  return { ...m, block: m.block.map((b) => (ids.includes(b.id) ? { ...b, sida: Math.max(1, Math.min(antalSidor(m), sida)) } : b)) };
}

export function uppdateraBlock(m: Rapportmall, id: string, patch: Partial<Omit<Block, 'id'>>): Rapportmall {
  return { ...m, block: m.block.map((b) => (b.id !== id ? b : { ...b, ...patch, stil: patch.stil === undefined ? b.stil : { ...(b.stil ?? {}), ...patch.stil } })) };
}

export function taBortBlock(m: Rapportmall, id: string): Rapportmall {
  return { ...m, block: m.block.filter((b) => b.id !== id) };
}

/** Flyttar blocket längst fram eller längst bak i ritordningen. */
export function ordnaBlock(m: Rapportmall, id: string, riktning: 'fram' | 'bak'): Rapportmall {
  const zs = m.block.map((b) => b.z);
  const nyZ = riktning === 'fram' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
  return uppdateraBlock(m, id, { z: nyZ });
}

export function dupliceraBlock(m: Rapportmall, id: string, nyttId: string): Rapportmall {
  const b = m.block.find((x) => x.id === id);
  if (b === undefined) return m;
  return { ...m, block: [...m.block, { ...b, id: nyttId, x: klamma(b.x + RUTNAT, 0, A4.bredd - b.b), y: klamma(b.y + RUTNAT, 0, A4.hojd - b.h), z: Math.max(...m.block.map((x) => x.z)) + 1 }] };
}

/** Blocken i ritordning (lägst z först), valfritt bara en sida. */
export function ritordning(m: Rapportmall, sida?: number): Block[] {
  return [...m.block].filter((b) => sida === undefined || blockSida(b) === sida).sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
}

/** Byter ut {elev}, {amne}, {datum}, {klass} i fri text. */
export function fyllText(text: string, v: { elev?: string; amne?: string; datum?: string; klass?: string }): string {
  return text
    .replace(/\{elev\}/g, v.elev ?? '')
    .replace(/\{amne\}/g, v.amne ?? '')
    .replace(/\{datum\}/g, v.datum ?? '')
    .replace(/\{klass\}/g, v.klass ?? '');
}

// ── Lagring i strukturen ─────────────────────────────────────

export function sparaRapportmall(s: Struktur, m: Rapportmall, idag: string): Struktur {
  const ny = { ...m, andrad: idag };
  const finns = (s.rapportmallar ?? []).some((x) => x.id === m.id);
  return { ...s, rapportmallar: finns ? (s.rapportmallar ?? []).map((x) => (x.id === m.id ? ny : x)) : [...(s.rapportmallar ?? []), ny] };
}

export function taBortRapportmall(s: Struktur, id: string): Struktur {
  return { ...s, rapportmallar: (s.rapportmallar ?? []).filter((x) => x.id !== id) };
}

/** Läser en mall ur JSON (från datarepot) och kontrollerar formatet. Kastar svenska fel. */
export function tolkaRapportmall(json: string): Rapportmall {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('Filen är inte giltig JSON.'); }
  const r = raw as Partial<Rapportmall>;
  if (typeof r.id !== 'string' || typeof r.namn !== 'string' || !Array.isArray(r.block)) throw new Error('Filen är inte en rapportmall (saknar id, namn eller block).');
  const block: Block[] = r.block.map((b, i) => {
    const x = b as Partial<Block>;
    if (typeof x.typ !== 'string' || !(x.typ in BLOCK_NAMN)) throw new Error(`Block ${i + 1} har okänd typ.`);
    return {
      id: typeof x.id === 'string' ? x.id : `b${i}`, typ: x.typ,
      x: Number(x.x ?? 0), y: Number(x.y ?? 0), b: Number(x.b ?? 40), h: Number(x.h ?? 20), z: Number(x.z ?? i),
      ...(x.sida !== undefined ? { sida: Number(x.sida) } : {}),
      ...(x.rubrik !== undefined ? { rubrik: String(x.rubrik) } : {}), ...(x.text !== undefined ? { text: String(x.text) } : {}),
      ...(x.kalla !== undefined ? { kalla: x.kalla } : {}), ...(x.bild !== undefined ? { bild: String(x.bild) } : {}),
      ...(x.rum !== undefined ? { rum: String(x.rum) } : {}), ...(x.stil !== undefined ? { stil: x.stil } : {}),
    };
  });
  return {
    id: r.id, namn: r.namn, ...(r.beskrivning !== undefined ? { beskrivning: r.beskrivning } : {}),
    marginal: Number(r.marginal ?? 15), ...(r.antalSidor !== undefined ? { antalSidor: Number(r.antalSidor) } : {}),
    ...(r.rutnat !== undefined ? { rutnat: Number(r.rutnat) } : {}), block, skapad: r.skapad ?? '', andrad: r.andrad ?? '', version: 1,
  };
}

/** En färdig startmall: rubrik, sammanfattning, läxförhörskurva, begreppslistor. */
export function standardmall(id: string, idag: string): Rapportmall {
  let m = nyMall(id, 'Enkel elevrapport', idag);
  m = laggTillBlock(m, `${id}-platta`, 'platta', 15, 15); m = andraStorlek(m, `${id}-platta`, 180, 30);
  m = laggTillBlock(m, `${id}-rubrik`, 'rubrik', 20, 20);
  m = laggTillBlock(m, `${id}-sam`, 'sammanfattning', 20, 50);
  m = laggTillBlock(m, `${id}-kpi1`, 'kpi', 20, 75); m = uppdateraBlock(m, `${id}-kpi1`, { kalla: 'socrative-laxforhor' });
  m = laggTillBlock(m, `${id}-kpi2`, 'kpi', 65, 75); m = uppdateraBlock(m, `${id}-kpi2`, { kalla: 'socrative-exit' });
  m = laggTillBlock(m, `${id}-kpi3`, 'kpi', 110, 75); m = uppdateraBlock(m, `${id}-kpi3`, { kalla: 'helhet' });
  m = laggTillBlock(m, `${id}-kurva`, 'laxkurva', 20, 110);
  m = laggTillBlock(m, `${id}-kvar`, 'begrepp-kvar', 20, 180);
  m = laggTillBlock(m, `${id}-vant`, 'begrepp-vant', 108, 180);
  m = laggTillBlock(m, `${id}-rad`, 'rad', 20, 245);
  return m;
}
