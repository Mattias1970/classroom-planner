/**
 * SuperTeach · Sittplatser — placeringar importerade från PowerPoint och
 * analys av hur resultat hänger ihop med var eleverna sitter.
 * (Ring 1, I2: ren text/XML-tolkning; uppackningen av .pptx-zippen sker i
 * UI-lagret som skickar in slide-XML:en som strängar.)
 */
import type { Elev, Struktur } from './typer.js';
import { delaNamn } from './roster.js';
import { dashboardResultat, type DashboardFilter, pearson } from './dashboard.js';
import { resultatProcent } from './resultat.js';

// ── Datamodell ────────────────────────────────────────────────

export interface Sittplats {
  /** Matchad elev, eller null för text som inte kunde knytas (t.ex. 'Kateder'). */
  elevId: string | null;
  /** Texten i rutan som den stod på bilden. */
  text: string;
  /** Radindex (0 = längst fram/överst på bilden) och kolumnindex (0 = längst till vänster). */
  rad: number;
  kol: number;
  /** Normaliserad position 0–1 på bilden (mitten av rutan). */
  x: number;
  y: number;
}

export interface Sittplatsering {
  id: string;
  klassId: string;
  /** Datum då placeringen börjar gälla (YYYY-MM-DD). */
  datum: string;
  /** Källfil, t.ex. 'Placering 8B v36.pptx'. */
  kalla: string;
  platser: Sittplats[];
}

// ── Tolkning av slide-XML ────────────────────────────────────

export interface SlideRuta { text: string; x: number; y: number; w: number; h: number; }

function avkoda(t: string): string {
  return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Plockar ut textrutor (<p:sp>) med position ur en slide-XML. Koordinater är
 * EMU och normaliseras mot bildens största utsträckning så att 0–1 gäller
 * oavsett bildformat. Tomma rutor hoppas över.
 */
export function tolkaSlideRutor(slideXml: string): SlideRuta[] {
  const ut: Array<{ text: string; x: number; y: number; w: number; h: number }> = [];
  const shapes = slideXml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? [];
  for (const sp of shapes) {
    const off = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/.exec(sp);
    const ext = /<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/.exec(sp);
    if (off === null) continue;
    const text = (sp.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => avkoda(t.replace(/<\/?a:t>/g, ''))).join(' ').replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    ut.push({ text, x: Number(off[1]), y: Number(off[2]), w: ext === null ? 0 : Number(ext[1]), h: ext === null ? 0 : Number(ext[2]) });
  }
  const maxX = Math.max(1, ...ut.map((r) => r.x + r.w)); const maxY = Math.max(1, ...ut.map((r) => r.y + r.h));
  const skala = Math.max(maxX, maxY);
  return ut.map((r) => ({ text: r.text, x: r.x / skala, y: r.y / skala, w: r.w / skala, h: r.h / skala }));
}

// ── Datumförslag ─────────────────────────────────────────────

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Hittar ett datum i fri text/filnamn: 2026-09-03, 3/9-2026, 3.9.26, '3 sep 2026', '3 september'. Null om inget. */
export function hittaDatum(text: string, idag: string): string | null {
  const ar = Number(idag.slice(0, 4));
  let m = /(\d{4})[-._](\d{1,2})[-._](\d{1,2})/.exec(text);
  if (m !== null) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = /(\d{4})(\d{2})(\d{2})/.exec(text);
  if (m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})[/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/.exec(text);
  if (m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const y = m[3] === undefined ? ar : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  m = /\b(\d{1,2})\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-z]*\.?\s*(\d{4})?/i.exec(text);
  if (m !== null) {
    const y = m[3] === undefined ? ar : Number(m[3]);
    return `${y}-${pad(MANADER.indexOf(m[2].toLowerCase()) + 1)}-${pad(Number(m[1]))}`;
  }
  return null;
}

/** Datumförslag: först bildens texter, sedan filnamnet, annars dagens datum. */
export function foreslaSittplatsDatum(rutor: SlideRuta[], filnamn: string, idag: string): { datum: string; kalla: 'bild' | 'filnamn' | 'idag' } {
  for (const r of rutor) { const d = hittaDatum(r.text, idag); if (d !== null) return { datum: d, kalla: 'bild' }; }
  const f = hittaDatum(filnamn, idag);
  if (f !== null) return { datum: f, kalla: 'filnamn' };
  return { datum: idag, kalla: 'idag' };
}

// ── Placering: rutor → rader/kolumner + elevmatchning ────────

function namnNyckel(n: string): string {
  return n.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim().split(' ').sort().join(' ');
}

/** Matchar en rutas text mot klassens elever: helt namn, annars unikt förnamn (ev. + initial). */
export function matchaSittplatsElev(text: string, elever: Elev[]): Elev | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const hela = elever.filter((e) => namnNyckel(e.namn) === namnNyckel(t));
  if (hela.length === 1) return hela[0];
  const delar = t.toLowerCase().split(' ');
  const fornamn = delar[0];
  const kandidater = elever.filter((e) => delaNamn(e.namn).fornamn.toLowerCase() === fornamn);
  if (kandidater.length === 1) return kandidater[0];
  if (kandidater.length > 1 && delar.length > 1) {
    const init = delar[1].replace('.', '');
    const viaInit = kandidater.filter((e) => delaNamn(e.namn).efternamn.toLowerCase().startsWith(init));
    if (viaInit.length === 1) return viaInit[0];
  }
  return null;
}

/** Grupperar värden i band: nytt band när avståndet till föregående är större än `tolerans`. */
function banda(varden: number[], tolerans: number): number[] {
  const sorterade = [...new Set(varden)].sort((a, b) => a - b);
  const band: number[] = []; let start = -Infinity;
  for (const v of sorterade) { if (v - start > tolerans) band.push(v); start = v; }
  return band;
}

/** Bygger platser ur rutorna: radindex efter y, kolumnindex efter x (band med tolerans = halv rutstorlek). */
export function byggSittplatser(rutor: SlideRuta[], elever: Elev[]): Sittplats[] {
  if (rutor.length === 0) return [];
  const mittY = rutor.map((r) => r.y + r.h / 2); const mittX = rutor.map((r) => r.x + r.w / 2);
  const medH = rutor.reduce((a, r) => a + r.h, 0) / rutor.length; const medW = rutor.reduce((a, r) => a + r.w, 0) / rutor.length;
  const radBand = banda(mittY, Math.max(0.02, medH * 0.6)); const kolBand = banda(mittX, Math.max(0.02, medW * 0.6));
  const index = (band: number[], v: number) => { let i = 0; for (let j = 0; j < band.length; j++) if (band[j] <= v) i = j; return i; };
  return rutor.map((r, i) => ({
    elevId: matchaSittplatsElev(r.text, elever)?.id ?? null, text: r.text,
    rad: index(radBand, mittY[i]), kol: index(kolBand, mittX[i]), x: mittX[i], y: mittY[i],
  }));
}

/** Lägger till (eller ersätter samma datum) en placering. */
export function sparaSittplatsering(s: Struktur, p: Sittplatsering): Struktur {
  if (!s.klasser.some((k) => k.id === p.klassId)) throw new Error('Placeringen måste höra till en befintlig klass.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.datum)) throw new Error('Ange datum som YYYY-MM-DD.');
  if (!p.platser.some((pl) => pl.elevId !== null)) throw new Error('Ingen ruta på bilden kunde knytas till en elev i klassen.');
  const kvar = (s.sittplatser ?? []).filter((x) => !(x.klassId === p.klassId && x.datum === p.datum));
  return { ...s, sittplatser: [...kvar, p].sort((a, b) => a.datum.localeCompare(b.datum)) };
}

export function taBortSittplatsering(s: Struktur, id: string): Struktur {
  return { ...s, sittplatser: (s.sittplatser ?? []).filter((p) => p.id !== id) };
}

// ── Analys ───────────────────────────────────────────────────

export interface SittplatsAnalysRad {
  plats: Sittplats;
  elev: Elev | null;
  /** Elevens snitt under placeringens giltighetstid. */
  snitt: number | null;
  /** Snitt för grannarna (angränsande rutor). */
  grannSnitt: number | null;
  grannar: Elev[];
  /** Skillnad elev − grannar. Positivt = eleven presterar bättre än bänkgrannarna. */
  skillnad: number | null;
}

export interface Flytt {
  elev: Elev;
  fran: { datum: string; rad: number; kol: number; snitt: number | null; grannSnitt: number | null };
  till: { datum: string; rad: number; kol: number; snitt: number | null; grannSnitt: number | null };
  /** Förändring i elevens snitt efter flytten (procentenheter). */
  delta: number | null;
}

export interface SittplatsAnalys {
  placering: Sittplatsering;
  /** Placeringen gäller t.o.m. detta datum (dagen före nästa placering), eller null = tills vidare. */
  giltigTill: string | null;
  rader: SittplatsAnalysRad[];
  /** Rumslig autokorrelation: r mellan elevens snitt och grannarnas snitt. Högt = tydliga kluster. */
  klusterR: number | null;
  antalRader: number;
  antalKolumner: number;
  /** Flyttar från föregående placering till denna. */
  flyttar: Flytt[];
}

function snittFor(rs: ReturnType<typeof dashboardResultat>, elevId: string): number | null {
  const ps = rs.filter((r) => r.elevId === elevId).map(resultatProcent).filter((p): p is number => p !== null);
  return ps.length === 0 ? null : Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
}

function grannarTill(p: Sittplats, alla: Sittplats[]): Sittplats[] {
  return alla.filter((q) => q !== p && q.elevId !== null && Math.abs(q.rad - p.rad) <= 1 && Math.abs(q.kol - p.kol) <= 1);
}

function dagenFore(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Analyserar en placering med resultaten under dess giltighetstid (övriga filter — ämne, källor — respekteras). */
export function sittplatsAnalys(s: Struktur, placeringId: string, f: DashboardFilter): SittplatsAnalys | null {
  const alla = (s.sittplatser ?? []).filter((p) => p.klassId === f.klassId).sort((a, b) => a.datum.localeCompare(b.datum));
  const i = alla.findIndex((p) => p.id === placeringId);
  if (i === -1) return null;
  const placering = alla[i];
  const nasta = alla[i + 1];
  const giltigTill = nasta === undefined ? null : dagenFore(nasta.datum);
  const rs = dashboardResultat(s, { ...f, fran: placering.datum, ...(giltigTill !== null ? { till: giltigTill } : {}) });
  const elev = (id: string | null) => (id === null ? null : s.elever.find((e) => e.id === id) ?? null);
  const rader: SittplatsAnalysRad[] = placering.platser.map((plats) => {
    const e = elev(plats.elevId);
    const snitt = e === null ? null : snittFor(rs, e.id);
    const grannPlatser = grannarTill(plats, placering.platser);
    const grannar = grannPlatser.map((g) => elev(g.elevId)).filter((x): x is Elev => x !== null);
    const gs = grannar.map((g) => snittFor(rs, g.id)).filter((x): x is number => x !== null);
    const grannSnitt = gs.length === 0 ? null : Math.round(gs.reduce((a, b) => a + b, 0) / gs.length);
    return { plats, elev: e, snitt, grannSnitt, grannar, skillnad: snitt !== null && grannSnitt !== null ? snitt - grannSnitt : null };
  });
  const par = rader.filter((r) => r.snitt !== null && r.grannSnitt !== null);
  const klusterR = pearson(par.map((r) => r.snitt!), par.map((r) => r.grannSnitt!));

  // Flyttar: elever som fanns i föregående placering på en annan plats
  const flyttar: Flytt[] = [];
  const forra = alla[i - 1];
  if (forra !== undefined) {
    const forraAnalys = sittplatsAnalysUtanFlytt(s, forra, dagenFore(placering.datum), f);
    for (const r of rader) {
      if (r.elev === null) continue;
      const innan = forraAnalys.find((x) => x.elev?.id === r.elev!.id);
      if (innan === undefined || (innan.plats.rad === r.plats.rad && innan.plats.kol === r.plats.kol)) continue;
      flyttar.push({
        elev: r.elev,
        fran: { datum: forra.datum, rad: innan.plats.rad, kol: innan.plats.kol, snitt: innan.snitt, grannSnitt: innan.grannSnitt },
        till: { datum: placering.datum, rad: r.plats.rad, kol: r.plats.kol, snitt: r.snitt, grannSnitt: r.grannSnitt },
        delta: innan.snitt !== null && r.snitt !== null ? r.snitt - innan.snitt : null,
      });
    }
  }
  return {
    placering, giltigTill, rader, klusterR,
    antalRader: Math.max(0, ...placering.platser.map((p) => p.rad)) + 1,
    antalKolumner: Math.max(0, ...placering.platser.map((p) => p.kol)) + 1,
    flyttar,
  };
}

function sittplatsAnalysUtanFlytt(s: Struktur, placering: Sittplatsering, till: string, f: DashboardFilter): SittplatsAnalysRad[] {
  const rs = dashboardResultat(s, { ...f, fran: placering.datum, till });
  const elev = (id: string | null) => (id === null ? null : s.elever.find((e) => e.id === id) ?? null);
  return placering.platser.map((plats) => {
    const e = elev(plats.elevId);
    const grannar = grannarTill(plats, placering.platser).map((g) => elev(g.elevId)).filter((x): x is Elev => x !== null);
    const gs = grannar.map((g) => snittFor(rs, g.id)).filter((x): x is number => x !== null);
    const snitt = e === null ? null : snittFor(rs, e.id);
    const grannSnitt = gs.length === 0 ? null : Math.round(gs.reduce((a, b) => a + b, 0) / gs.length);
    return { plats, elev: e, snitt, grannSnitt, grannar, skillnad: snitt !== null && grannSnitt !== null ? snitt - grannSnitt : null };
  });
}
