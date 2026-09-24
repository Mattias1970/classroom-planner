/**
 * Del 147 · Väntande resultat — rader som inte hittade sin elev vid importen.
 *
 * Importen kastar aldrig bort en rad: namn som inte matchar sparas som
 * `vantandeResultat` med allt som behövs för ett Resultat. När en elev sedan
 * läggs till, byter namn eller får ett Socrative-id (`matchaVantande`), eller
 * när läraren kopplar ett namn till en elev för hand (`kopplaVantande`), blir
 * raderna riktiga resultat — utan att någon fil läses in igen.
 */
import type { Struktur } from './typer.js';
import { matchaElev, type Resultat, type VantandeResultat } from './resultat.js';
import { nyttId } from './struktur.js';

function normalisera(namn: string): string {
  return namn.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

function tillResultat(v: VantandeResultat, elevId: string): Resultat {
  return {
    id: nyttId('res'), elevId, kalla: v.kalla, prov: v.prov, datum: v.datum, poang: v.poang, maxPoang: v.maxPoang,
    ...(v.tid !== undefined ? { tid: v.tid } : {}),
    ...(v.rum !== undefined ? { rum: v.rum } : {}),
    ...(v.autoTyp === true ? { autoTyp: true } : {}),
    ...(v.svar !== undefined && v.svar.length > 0 ? { svar: v.svar } : {}),
    ...(v.amneId !== undefined ? { amneId: v.amneId } : {}),
  };
}

/** Lägger in resultat och ersätter ett befintligt för samma elev, källa och prov. */
function laggInResultat(s: Struktur, nya: Resultat[]): Struktur {
  if (nya.length === 0) return s;
  const ersatta = new Set(nya.map((r) => `${r.elevId}|${r.kalla}|${r.prov}`));
  const kvar = (s.resultat ?? []).filter((r) => !ersatta.has(`${r.elevId}|${r.kalla}|${r.prov}`));
  return { ...s, resultat: [...kvar, ...nya] };
}

function utanVantande(s: Struktur, bort: Set<string>): Struktur {
  const kvar = (s.vantandeResultat ?? []).filter((v) => !bort.has(v.id));
  const { vantandeResultat: _v, ...rest } = s;
  return kvar.length > 0 ? { ...rest, vantandeResultat: kvar } : rest;
}

export interface VantandeUtfall {
  s: Struktur;
  /** Antal rader som blev resultat. */
  matchade: number;
  /** Elevnamn (som de står i strukturen) som fick resultat. */
  elever: string[];
}

/**
 * Försöker matcha alla väntande rader (i en klass, eller alla) mot elevlistan
 * med samma regler som importen. Billig när inget väntar — kan köras efter
 * varje ändring av elever.
 */
export function matchaVantande(s: Struktur, klassId?: string): VantandeUtfall {
  const alla = s.vantandeResultat ?? [];
  if (alla.length === 0) return { s, matchade: 0, elever: [] };
  const nya: Resultat[] = [];
  const bort = new Set<string>();
  const namn = new Set<string>();
  for (const v of alla) {
    if (klassId !== undefined && v.klassId !== klassId) continue;
    const elev = matchaElev(s, v.klassId, v.namn, v.sidId);
    if (elev === null) continue;
    nya.push(tillResultat(v, elev.id));
    bort.add(v.id);
    namn.add(elev.namn);
  }
  if (nya.length === 0) return { s, matchade: 0, elever: [] };
  return { s: utanVantande(laggInResultat(s, nya), bort), matchade: nya.length, elever: [...namn].sort((a, b) => a.localeCompare(b, 'sv')) };
}

/** Ett väntande namn i en klass med alla sina rader — underlag för panelen. */
export interface VantandeNamn {
  namn: string;
  sidId?: string;
  antal: number;
  prov: string[];
  /** Senaste importerade datum. */
  senast: string;
}

/** Väntande rader grupperade per namn (som de står i filen), sorterade på namn. */
export function vantandeNamn(s: Struktur, klassId: string): VantandeNamn[] {
  const per = new Map<string, VantandeNamn>();
  for (const v of s.vantandeResultat ?? []) {
    if (v.klassId !== klassId) continue;
    const k = normalisera(v.namn);
    const f = per.get(k);
    if (f === undefined) per.set(k, { namn: v.namn, ...(v.sidId !== undefined ? { sidId: v.sidId } : {}), antal: 1, prov: [v.prov], senast: v.datum });
    else {
      f.antal += 1;
      if (!f.prov.includes(v.prov)) f.prov.push(v.prov);
      if (v.datum > f.senast) f.senast = v.datum;
      if (f.sidId === undefined && v.sidId !== undefined) f.sidId = v.sidId;
    }
  }
  return [...per.values()].sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
}

/**
 * Kopplar alla väntande rader med ett namn till en befintlig elev (t.ex. när
 * filen stavar namnet annorlunda). Finns ett Socrative-id på raderna och eleven
 * saknar ett sätts det, så att nästa import matchar direkt.
 */
export function kopplaVantande(s: Struktur, klassId: string, namn: string, elevId: string): VantandeUtfall {
  const elev = s.elever.find((e) => e.id === elevId && e.klassId === klassId);
  if (elev === undefined) throw new Error('Okänd elev i klassen.');
  const k = normalisera(namn);
  const rader = (s.vantandeResultat ?? []).filter((v) => v.klassId === klassId && normalisera(v.namn) === k);
  if (rader.length === 0) return { s, matchade: 0, elever: [] };
  const sidId = rader.find((v) => v.sidId !== undefined)?.sidId;
  let ut = utanVantande(laggInResultat(s, rader.map((v) => tillResultat(v, elev.id))), new Set(rader.map((v) => v.id)));
  if (sidId !== undefined && (elev.socrativeId === undefined || elev.socrativeId.trim() === '')) {
    ut = { ...ut, elever: ut.elever.map((e) => (e.id === elev.id ? { ...e, socrativeId: sidId } : e)) };
  }
  return { s: ut, matchade: rader.length, elever: [elev.namn] };
}

/** Tar bort alla väntande rader med ett namn (t.ex. en elev som inte går i klassen). */
export function taBortVantande(s: Struktur, klassId: string, namn: string): Struktur {
  const k = normalisera(namn);
  const bort = new Set((s.vantandeResultat ?? []).filter((v) => v.klassId === klassId && normalisera(v.namn) === k).map((v) => v.id));
  return bort.size === 0 ? s : utanVantande(s, bort);
}
