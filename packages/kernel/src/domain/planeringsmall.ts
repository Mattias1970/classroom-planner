/**
 * Del 140 · Planeringsmall — en portabel fil med lektionsinnehåll per radnyckel
 * som slås ihop med ämnets aktiva planering.
 *
 * Mallen bär det som INTE är bokens (bokens rader kommer från book.json) men som
 * hör till lärarens upplägg: antal lektioner per delkapitel (Del 129-loggen) och
 * lektionsplaner (mål, genomgång, exempel, arbete …) nycklade på radnyckel
 * ('1:1', '1:2#3', 'er:<id>' …) i stället för position — så att de hamnar rätt
 * oavsett schema och datum.
 *
 * Sammanslagningen räknar om planeringen FRÅN BÖRJAN (ingen frysning av det som
 * redan genomförts) — det är ett medvetet undantag som läraren väljer själv i
 * dialogen. Befintliga lektionsplaner behålls; mallen fyller bara tomma fält om
 * inte `ersattTexter` är satt.
 */
import type { LektionsPlan, Struktur } from './typer.js';
import { amnesPlanFor, andraPlanering, hamtaLektionsplan, nyttId, sattLektionsplan } from './struktur.js';

export const PLANERINGSMALL_SCHEMA = 'classroom-planner-planeringsmall';

export type MallPlan = Partial<Pick<LektionsPlan,
  'mal' | 'genomgang' | 'exempelRakna' | 'uppgNiva1' | 'uppgNiva2' | 'uppgNiva3'
  | 'laraOss' | 'vadGora' | 'laxa' | 'presentation' | 'filmer' | 'exitQuiz' | 'laxforhorRum' | 'sammanfattning'>>;

export interface Planeringsmall {
  schema: typeof PLANERINGSMALL_SCHEMA;
  version: 1;
  namn: string;
  bokId: string;
  /** Del 129-loggen: t.ex. [{ antal: 3 }, { fran: '2:1', antal: 2 }]. */
  lektionerPerDelkapitel?: Array<{ fran?: string; antal: number }>;
  /** Lektionsplaner per radnyckel. */
  lektionsplaner: Record<string, MallPlan>;
}

const MALL_FALT: Array<keyof MallPlan> = [
  'mal', 'genomgang', 'exempelRakna', 'uppgNiva1', 'uppgNiva2', 'uppgNiva3',
  'laraOss', 'vadGora', 'laxa', 'presentation', 'filmer', 'exitQuiz', 'laxforhorRum', 'sammanfattning',
];

export function tolkaPlaneringsmall(json: string): Planeringsmall {
  const raw = JSON.parse(json) as Partial<Planeringsmall>;
  if (raw.schema !== PLANERINGSMALL_SCHEMA) throw new Error('Inte en planeringsmall (schema "classroom-planner-planeringsmall").');
  if (typeof raw.bokId !== 'string' || raw.bokId === '') throw new Error('Planeringsmallen saknar bokId.');
  if (raw.lektionsplaner === undefined || typeof raw.lektionsplaner !== 'object') throw new Error('Planeringsmallen saknar lektionsplaner.');
  const planer: Record<string, MallPlan> = {};
  for (const [nyckel, p] of Object.entries(raw.lektionsplaner)) {
    if (p === null || typeof p !== 'object') continue;
    const ren: MallPlan = {};
    for (const f of MALL_FALT) {
      const v = (p as Record<string, unknown>)[f];
      if (f === 'filmer') { if (Array.isArray(v)) ren.filmer = v.filter((x): x is string => typeof x === 'string'); }
      else if (typeof v === 'string' && v.trim() !== '') (ren as Record<string, unknown>)[f] = v;
    }
    planer[nyckel] = ren;
  }
  const logg = Array.isArray(raw.lektionerPerDelkapitel)
    ? raw.lektionerPerDelkapitel.filter((x) => typeof x === 'object' && x !== null && Number.isInteger((x as { antal?: unknown }).antal))
      .map((x) => ({ ...(typeof x.fran === 'string' ? { fran: x.fran } : {}), antal: Math.min(4, Math.max(1, x.antal)) }))
    : undefined;
  return {
    schema: PLANERINGSMALL_SCHEMA, version: 1, namn: typeof raw.namn === 'string' ? raw.namn : 'Planeringsmall', bokId: raw.bokId,
    ...(logg !== undefined ? { lektionerPerDelkapitel: logg } : {}), lektionsplaner: planer,
  };
}

export interface SlaIhopUtfall {
  s: Struktur;
  /** Antal lektionsplaner som fick innehåll ur mallen. */
  antalPlaner: number;
  /** Radnycklar i mallen som inte finns i planeringen (t.ex. fel bok eller borttagen rad). */
  saknade: string[];
}

/**
 * Slår ihop mallen med ämnets aktiva planering: lektionsantalet sätts från början
 * (ingen frysning), och lektionsplanerna läggs på raderna via radnyckel. Befintliga
 * fält behålls om de har innehåll, såvida inte `ersattTexter` är satt.
 */
export function slaIhopPlaneringsmall(s: Struktur, amneId: string, mall: Planeringsmall, val: { ersattTexter?: boolean } = {}): SlaIhopUtfall {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (!amne) throw new Error('Okänt ämne.');
  const planering = s.planeringar.find((p) => p.amneId === amneId);
  if (!planering) throw new Error('Ämnet har ingen planering — skapa planeringen först.');
  if (planering.bokId !== mall.bokId) {
    const bok = s.bocker.find((b) => b.id === mall.bokId);
    throw new Error(`Mallen är gjord för boken "${bok?.titel ?? mall.bokId}" men planeringen använder en annan bok.`);
  }
  let ut = s;
  if (mall.lektionerPerDelkapitel !== undefined) {
    ut = andraPlanering(ut, amneId, { lektionerPerDelkapitel: mall.lektionerPerDelkapitel });   // idag utelämnas: gäller från början
  }
  const rader = amnesPlanFor(ut, amneId, undefined, true)?.a ?? [];
  const index = new Map<string, number>();
  rader.forEach((r, i) => { if (r.nyckel !== undefined && !index.has(r.nyckel)) index.set(r.nyckel, i); });
  let antalPlaner = 0;
  const saknade: string[] = [];
  for (const [nyckel, mp] of Object.entries(mall.lektionsplaner)) {
    const i = index.get(nyckel);
    if (i === undefined) { saknade.push(nyckel); continue; }
    const finns = hamtaLektionsplan(ut, amneId, i);
    const bas: LektionsPlan = finns ?? { id: nyttId('lp'), amneId, lektionsIndex: i };
    const ny: Record<string, unknown> = { ...bas };
    let andrad = false;
    for (const f of MALL_FALT) {
      const v = mp[f];
      if (v === undefined) continue;
      const nu = ny[f];
      const tomt = nu === undefined || nu === '' || (Array.isArray(nu) && nu.length === 0);
      if (tomt || val.ersattTexter === true) { ny[f] = v; andrad = true; }
    }
    if (andrad || finns === null) { ut = sattLektionsplan(ut, ny as unknown as LektionsPlan); antalPlaner += 1; }
  }
  return { s: ut, antalPlaner, saknade };
}
