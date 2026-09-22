/**
 * Del 138 · Sparat — namngivna sparfiler för planeringar och SuperTeach-data.
 *
 * Två register i strukturen, oberoende av varandra:
 *
 *  - sparadePlaneringar: en planering (bok + lektionsplaner + planeringsval på
 *    ämnet) under ett namn med versionsnummer. Samma namn kan ha flera versioner.
 *  - sparadSuperTeach: resultat + filregister för ett ämne under ett namn, med
 *    en KOPPLING till den planering som gällde (namn + version) — så att man
 *    vet vilken lektionsföljd resultaten klassificerades mot.
 *
 * Tre sätt att spara, för båda: 'nytt' (nytt namn, v1), 'ersatt' (skriv över
 * en befintlig post), 'ny-version' (samma namn, nästa versionsnummer).
 *
 * Varje post är självbärande JSON (schema + version) så att den också kan
 * ligga som en fil i datarepot (sparat/planeringar/…, sparat/superteach/…)
 * och hämtas i en annan webbläsare.
 */
import type { Amne, LektionsPlan, Planering, Struktur } from './typer.js';
import type { FilPost, Resultat } from './resultat.js';
import { nyttId, registreraPlanering } from './struktur.js';

function kopia<T>(x: T): T { return JSON.parse(JSON.stringify(x)) as T; }

export const PLANERING_SCHEMA = 'classroom-planner-planering';
export const SUPERTEACH_SCHEMA = 'classroom-planner-superteach';

/** Fälten på ämnet som är planering (inte schema/klass): följer med i sparfilen. */
export type PlaneringsVal = Pick<Amne,
  'egnaRader' | 'lektionsVal' | 'antalLektioner' | 'lektionerPerDelkapitel'
  | 'laborationer' | 'laborationsstandard' | 'passVal' | 'labUndantag' | 'planFrystTill'>;

const VAL_FALT: Array<keyof PlaneringsVal> = [
  'egnaRader', 'lektionsVal', 'antalLektioner', 'lektionerPerDelkapitel',
  'laborationer', 'laborationsstandard', 'passVal', 'labUndantag', 'planFrystTill',
];

export interface SparadPlanering {
  schema: typeof PLANERING_SCHEMA;
  schemaVersion: 1;
  id: string;
  /** Namnet läraren gav sparfilen. */
  namn: string;
  /** Version av sparfilen med det namnet (1, 2, 3 …). */
  version: number;
  sparad: string;
  amneId: string;
  amneNamn: string;
  klassNamn: string;
  bokId: string;
  bokTitel: string;
  planering: Planering;
  lektionsplaner: LektionsPlan[];
  val: PlaneringsVal;
}

export interface Koppling { planeringsNamn: string; planeringsVersion: number; planeringsId: string }

export interface SparadSuperTeach {
  schema: typeof SUPERTEACH_SCHEMA;
  schemaVersion: 1;
  id: string;
  namn: string;
  version: number;
  sparad: string;
  amneId: string;
  amneNamn: string;
  klassNamn: string;
  /** Planeringen resultaten hör ihop med — null när ämnet saknade planering. */
  koppling: Koppling | null;
  resultat: Resultat[];
  filregister: FilPost[];
}

export type SparLage = { typ: 'nytt'; namn: string } | { typ: 'ersatt'; id: string } | { typ: 'ny-version'; namn: string };

// ── Hjälpare ────────────────────────────────────────────────

function amneOchKlass(s: Struktur, amneId: string): { amne: Amne; klassNamn: string } {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (!amne) throw new Error('Okänt ämne.');
  return { amne, klassNamn: s.klasser.find((k) => k.id === amne.klassId)?.namn ?? '' };
}

function planeringsVal(a: Amne): PlaneringsVal {
  const ut: Record<string, unknown> = {};
  for (const f of VAL_FALT) if (a[f] !== undefined) ut[f] = kopia(a[f]);
  return ut as PlaneringsVal;
}

function nastaVersion<T extends { namn: string; version: number }>(lista: T[], namn: string): number {
  return Math.max(0, ...lista.filter((x) => x.namn.trim().toLowerCase() === namn.trim().toLowerCase()).map((x) => x.version)) + 1;
}

function laggIn<T extends { id: string; namn: string; version: number }>(lista: T[], post: T, lage: SparLage): T[] {
  const namn = lage.typ === 'ersatt' ? undefined : lage.namn.trim();
  if (namn !== undefined && namn === '') throw new Error('Ge sparfilen ett namn.');
  if (lage.typ === 'nytt') {
    if (lista.some((x) => x.namn.trim().toLowerCase() === namn!.toLowerCase())) {
      throw new Error(`"${namn}" finns redan — välj "Ny version" eller "Ersätt".`);
    }
    return [...lista, { ...post, namn: namn!, version: 1 }];
  }
  if (lage.typ === 'ny-version') return [...lista, { ...post, namn: namn!, version: nastaVersion(lista, namn!) }];
  const gammal = lista.find((x) => x.id === lage.id);
  if (!gammal) throw new Error('Sparfilen som skulle ersättas finns inte.');
  return lista.map((x) => (x.id === lage.id ? { ...post, id: gammal.id, namn: gammal.namn, version: gammal.version } : x));
}

/** Namnförslag: 'Matematik 8B · Prio Matematik 8'. */
export function forslagPlaneringsNamn(s: Struktur, amneId: string): string {
  const { amne, klassNamn } = amneOchKlass(s, amneId);
  const bok = s.bocker.find((b) => b.id === (s.planeringar.find((p) => p.amneId === amneId)?.bokId ?? amne.bokId));
  return `${amne.namn} ${klassNamn}${bok ? ` · ${bok.titel}` : ''}`.trim();
}

/** Namnförslag: 'Resultat Matematik 8B HT26'. */
export function forslagSuperTeachNamn(s: Struktur, amneId: string, idag: string): string {
  const { amne, klassNamn } = amneOchKlass(s, amneId);
  const ar = idag.slice(2, 4); const man = Number(idag.slice(5, 7));
  return `Resultat ${amne.namn} ${klassNamn} ${man >= 7 ? 'HT' : 'VT'}${ar}`.trim();
}

/** Den aktiva planeringen som koppling för SuperTeach-data — helst en sparad post med samma planerings-id. */
export function kopplingFor(s: Struktur, amneId: string): Koppling | null {
  const aktiv = s.planeringar.find((p) => p.amneId === amneId);
  if (!aktiv) return null;
  const sparad = (s.sparadePlaneringar ?? [])
    .filter((x) => x.planering.id === aktiv.id || `${x.namn} v${x.version}` === aktiv.namn)
    .sort((a, b) => b.version - a.version)[0];
  if (sparad) return { planeringsNamn: sparad.namn, planeringsVersion: sparad.version, planeringsId: aktiv.id };
  return { planeringsNamn: aktiv.namn ?? forslagPlaneringsNamn(s, amneId), planeringsVersion: aktiv.version ?? 1, planeringsId: aktiv.id };
}

// ── Planeringar ─────────────────────────────────────────────

/** Paketerar ämnets aktiva planering (utan att lägga in den i registret). */
export function paketeraPlanering(s: Struktur, amneId: string, sparad: string): Omit<SparadPlanering, 'namn' | 'version'> {
  const { amne, klassNamn } = amneOchKlass(s, amneId);
  const planering = s.planeringar.find((p) => p.amneId === amneId);
  if (!planering) throw new Error('Ämnet har ingen planering att spara.');
  const bok = s.bocker.find((b) => b.id === planering.bokId);
  return {
    schema: PLANERING_SCHEMA, schemaVersion: 1, id: nyttId('spl'), sparad,
    amneId, amneNamn: amne.namn, klassNamn, bokId: planering.bokId, bokTitel: bok?.titel ?? '—',
    planering: kopia(planering),
    lektionsplaner: kopia(s.lektionsplaner.filter((lp) => lp.amneId === amneId)),
    val: planeringsVal(amne),
  };
}

export function sparaPlanering(s: Struktur, amneId: string, lage: SparLage, sparad: string): Struktur {
  const post = { ...paketeraPlanering(s, amneId, sparad), namn: '', version: 0 } as SparadPlanering;
  return { ...s, sparadePlaneringar: laggIn(s.sparadePlaneringar ?? [], post, lage) };
}

/**
 * Öppnar en sparad planering på ämnet: den blir aktiv (den nuvarande arkiveras
 * som vanligt via registreraPlanering), lektionsplaner och planeringsval byts.
 * Genomförda lektioner påverkas inte av bytet i sig — men bokens följd kan
 * skilja, så detta görs bara på lärarens uttryckliga val.
 */
export function oppnaSparadPlanering(s: Struktur, id: string, skapad: string): Struktur {
  const post = (s.sparadePlaneringar ?? []).find((x) => x.id === id);
  if (!post) throw new Error('Okänd sparad planering.');
  if (!s.amnen.some((a) => a.id === post.amneId)) throw new Error(`Ämnet för "${post.namn}" finns inte längre.`);
  if (!s.bocker.some((b) => b.id === post.bokId)) throw new Error(`Boken "${post.bokTitel}" finns inte i biblioteket — hämta böcker från datarepot först.`);
  // Alltid en ny aktiv version: den som gällde arkiveras och kan återställas.
  const ut = registreraPlanering(s, { ...post.planering, id: nyttId('pl'), skapad, namn: `${post.namn} v${post.version}`, version: undefined });
  const tomma: Record<string, undefined> = {};
  for (const f of VAL_FALT) tomma[f] = undefined;
  return {
    ...ut,
    amnen: ut.amnen.map((a) => (a.id === post.amneId ? { ...a, ...tomma, ...kopia(post.val) } : a)),
    lektionsplaner: [...ut.lektionsplaner.filter((lp) => lp.amneId !== post.amneId), ...kopia(post.lektionsplaner)],
  };
}

export function taBortSparadPlanering(s: Struktur, id: string): Struktur {
  return { ...s, sparadePlaneringar: (s.sparadePlaneringar ?? []).filter((x) => x.id !== id) };
}

// ── SuperTeach ──────────────────────────────────────────────

export function paketeraSuperTeach(s: Struktur, amneId: string, sparad: string): Omit<SparadSuperTeach, 'namn' | 'version'> {
  const { amne, klassNamn } = amneOchKlass(s, amneId);
  return {
    schema: SUPERTEACH_SCHEMA, schemaVersion: 1, id: nyttId('sst'), sparad,
    amneId, amneNamn: amne.namn, klassNamn, koppling: kopplingFor(s, amneId),
    resultat: kopia((s.resultat ?? []).filter((r) => r.amneId === amneId)),
    filregister: kopia((s.filregister ?? []).filter((f) => f.amneId === amneId)),
  };
}

export function sparaSuperTeach(s: Struktur, amneId: string, lage: SparLage, sparad: string): Struktur {
  const post = { ...paketeraSuperTeach(s, amneId, sparad), namn: '', version: 0 } as SparadSuperTeach;
  if (post.resultat.length === 0) throw new Error('Ämnet har inga resultat att spara.');
  return { ...s, sparadSuperTeach: laggIn(s.sparadSuperTeach ?? [], post, lage) };
}

/**
 * Öppnar sparade SuperTeach-data på ämnet. 'ersatt' byter ut ämnets resultat och
 * filregister; 'laggTill' behåller det som finns och lägger till poster som inte
 * redan finns (samma id, eller samma fil i filregistret).
 */
export function oppnaSparadSuperTeach(s: Struktur, id: string, lage: 'ersatt' | 'laggTill'): Struktur {
  const post = (s.sparadSuperTeach ?? []).find((x) => x.id === id);
  if (!post) throw new Error('Okända sparade SuperTeach-data.');
  if (!s.amnen.some((a) => a.id === post.amneId)) throw new Error(`Ämnet för "${post.namn}" finns inte längre.`);
  const resultat = s.resultat ?? []; const filregister = s.filregister ?? [];
  if (lage === 'ersatt') {
    return {
      ...s,
      resultat: [...resultat.filter((r) => r.amneId !== post.amneId), ...kopia(post.resultat)],
      filregister: [...filregister.filter((f) => f.amneId !== post.amneId), ...kopia(post.filregister)],
    };
  }
  const harId = new Set(resultat.map((r) => r.id));
  const harFil = new Set(filregister.map((f) => `${f.amneId}|${f.filnamn}`));
  return {
    ...s,
    resultat: [...resultat, ...kopia(post.resultat.filter((r) => !harId.has(r.id)))],
    filregister: [...filregister, ...kopia(post.filregister.filter((f) => !harFil.has(`${f.amneId}|${f.filnamn}`)))],
  };
}

export function taBortSparadSuperTeach(s: Struktur, id: string): Struktur {
  return { ...s, sparadSuperTeach: (s.sparadSuperTeach ?? []).filter((x) => x.id !== id) };
}

// ── Filer (datarepot) ───────────────────────────────────────

function slug(text: string): string {
  return text.toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'namnlos';
}

/** Filnamn i datarepot: sparat/planeringar/matematik-8b-prio-8-v2.json. */
export function sparfilSokvag(post: SparadPlanering | SparadSuperTeach): string {
  const mapp = post.schema === PLANERING_SCHEMA ? 'planeringar' : 'superteach';
  return `sparat/${mapp}/${slug(post.namn)}-v${post.version}.json`;
}

export function serialiseraSparfil(post: SparadPlanering | SparadSuperTeach): string {
  return JSON.stringify(post, null, 2);
}

/** Tolkar en sparfil från datarepot. Kastar om schemat är okänt. */
export function tolkaSparfil(json: string): SparadPlanering | SparadSuperTeach {
  const raw = JSON.parse(json) as { schema?: string; namn?: string; version?: number; id?: string };
  if (raw.schema !== PLANERING_SCHEMA && raw.schema !== SUPERTEACH_SCHEMA) throw new Error('Inte en sparfil från Classroom Planner.');
  if (typeof raw.namn !== 'string' || typeof raw.version !== 'number' || typeof raw.id !== 'string') throw new Error('Sparfilen saknar namn, version eller id.');
  return raw as SparadPlanering | SparadSuperTeach;
}

/** Lägger in sparfiler från datarepot; en post med samma id ersätts, övriga läggs till. */
export function laggInSparfiler(s: Struktur, filer: Array<SparadPlanering | SparadSuperTeach>): Struktur {
  let pl = s.sparadePlaneringar ?? []; let st = s.sparadSuperTeach ?? [];
  for (const f of filer) {
    if (f.schema === PLANERING_SCHEMA) pl = [...pl.filter((x) => x.id !== f.id), f];
    else st = [...st.filter((x) => x.id !== f.id), f];
  }
  return { ...s, sparadePlaneringar: pl, sparadSuperTeach: st };
}
