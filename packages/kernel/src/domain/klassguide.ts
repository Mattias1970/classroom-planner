/**
 * Del 155 · Lathund: lägg till en klass steg för steg.
 *
 *   1 Läsår   → 2 Schema (PDF eller för hand) → 3 Böcker → 4 Planering → 5 Elever → 6 Klart
 *
 * Här finns det guiden behöver utöver de vanliga strukturfunktionerna:
 * en checklista som räknas fram ur strukturen (så guiden alltid visar hur
 * långt klassen faktiskt kommit), ett bokförslag per ämne, schemaimport
 * begränsad till valda klasser och "skapa alla planeringar" i ett steg.
 * Genomförd planering rörs aldrig — bara ämnen utan planering får en. (Ring 1, I2.)
 */
import type { Amne, Bok, Struktur } from './typer.js';
import { arStodAmne } from './amnen.js';
import { nyttId, registreraPlanering, skapaFriPlanering } from './struktur.js';
import { slaIhopSchema, type SchemaImportUtfall, type TolkatSchema } from './schemapdf.js';

export interface GuideAmne {
  amne: Amne;
  /** Stödämne (Ma/NO-stöd m.fl.) — fri planering utan bok. */
  stod: boolean;
  /** Antal pass i veckan (grupp A + B vid halvklass). */
  passPerVecka: number;
  bok: Bok | null;
  /** Böcker som passar ämnet, bäst först (samma årskurs som klassen). */
  forslag: Bok[];
  harPlanering: boolean;
}

export interface KlassGuideStatus {
  klassId: string;
  klassNamn: string;
  amnen: GuideAmne[];
  antalElever: number;
  /** Stegen: schema = minst ett ämne med pass; bocker = alla ämnen som behöver bok har en; osv. */
  klart: { schema: boolean; bocker: boolean; planering: boolean; elever: boolean };
}

/** Årskursen ur klassnamnet: '8B' → 8, 'Åk 7 A' → 7; null om ingen siffra. */
export function arskursForKlass(namn: string): number | null {
  const m = /(\d{1,2})/.exec(namn);
  return m === null ? null : Number(m[1]);
}

/** Böcker som passar ett ämne: samma ämnesnamn, samma årskurs som klassen först, sedan titel. */
export function bokForslag(s: Struktur, amne: Amne): Bok[] {
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const ak = klass === undefined ? null : arskursForKlass(klass.namn);
  const norm = (x: string) => x.trim().toLowerCase();
  return s.bocker
    .filter((b) => norm(b.amne) === norm(amne.namn))
    .sort((a, b) => Number(b.arskurs === ak) - Number(a.arskurs === ak) || a.titel.localeCompare(b.titel, 'sv'));
}

/** Guidens checklista för en klass, räknad ur strukturen. */
export function klassGuideStatus(s: Struktur, klassId: string): KlassGuideStatus | null {
  const klass = s.klasser.find((k) => k.id === klassId);
  if (klass === undefined) return null;
  const amnen: GuideAmne[] = s.amnen.filter((a) => a.klassId === klassId).map((a) => ({
    amne: a,
    stod: arStodAmne(a.namn),
    passPerVecka: a.schema.length + (a.schemaB?.length ?? 0),
    bok: s.bocker.find((b) => b.id === a.bokId) ?? null,
    forslag: bokForslag(s, a),
    harPlanering: s.planeringar.some((p) => p.amneId === a.id),
  }));
  const antalElever = s.elever.filter((e) => e.klassId === klassId).length;
  return {
    klassId, klassNamn: klass.namn, amnen, antalElever,
    klart: {
      schema: amnen.some((a) => a.passPerVecka > 0),
      bocker: amnen.length > 0 && amnen.every((a) => a.stod || a.bok !== null),
      planering: amnen.length > 0 && amnen.every((a) => a.harPlanering),
      elever: antalElever > 0,
    },
  };
}

/**
 * Kopplar föreslagen bok till varje ämne i klassen som saknar bok, när förslaget är
 * entydigt (exakt en bok för ämnet, eller exakt en i klassens årskurs). Ämnen med
 * flera möjliga böcker lämnas åt läraren. Returnerar vilka ämnen som fick bok.
 */
export function kopplaForeslagnaBocker(s: Struktur, klassId: string): { s: Struktur; kopplade: string[] } {
  const klass = s.klasser.find((k) => k.id === klassId);
  if (klass === undefined) return { s, kopplade: [] };
  const ak = arskursForKlass(klass.namn);
  const kopplade: string[] = [];
  let ut = s;
  for (const a of s.amnen.filter((x) => x.klassId === klassId && x.bokId === undefined && !arStodAmne(x.namn))) {
    const f = bokForslag(s, a);
    const samma = f.filter((b) => b.arskurs === ak);
    const val = f.length === 1 ? f[0] : samma.length === 1 ? samma[0] : null;
    if (val === null) continue;
    ut = { ...ut, amnen: ut.amnen.map((x) => (x.id === a.id ? { ...x, bokId: val.id } : x)) };
    kopplade.push(`${a.namn}: ${val.titel}`);
  }
  return { s: ut, kopplade };
}

/**
 * Skapar planering för varje ämne i klassen som ännu saknar en: bokens lektioner
 * på schemat, eller fri planering för stödämnen. Ämnen som redan har planering
 * lämnas orörda. Ämnen utan bok (som behöver en) hoppas över och rapporteras.
 */
export function skapaAllaPlaneringar(s: Struktur, klassId: string, skapad: string): { s: Struktur; skapade: string[]; utanBok: string[] } {
  let ut = s; const skapade: string[] = []; const utanBok: string[] = [];
  for (const a of s.amnen.filter((x) => x.klassId === klassId)) {
    if (ut.planeringar.some((p) => p.amneId === a.id)) continue;
    if (arStodAmne(a.namn)) { ut = skapaFriPlanering(ut, a.id, skapad); skapade.push(`${a.namn} (fri planering)`); continue; }
    if (a.bokId === undefined || !ut.bocker.some((b) => b.id === a.bokId)) { utanBok.push(a.namn); continue; }
    ut = registreraPlanering(ut, { id: nyttId('pl'), amneId: a.id, bokId: a.bokId, skapad });
    skapade.push(a.namn);
  }
  return { s: ut, skapade, utanBok };
}

/** Klasserna i ett inläst schema med antal lektioner i veckan. */
export function schematsKlasser(t: TolkatSchema): Array<{ klass: string; lektioner: number; amnen: string[] }> {
  const per = new Map<string, { lektioner: number; amnen: Set<string> }>();
  for (const l of t.lektioner) {
    const x = per.get(l.klass) ?? { lektioner: 0, amnen: new Set<string>() };
    x.lektioner += 1; x.amnen.add(l.amne);
    per.set(l.klass, x);
  }
  return [...per.entries()].sort(([a], [b]) => a.localeCompare(b, 'sv')).map(([klass, x]) => ({ klass, lektioner: x.lektioner, amnen: [...x.amnen].sort((a, b) => a.localeCompare(b, 'sv')) }));
}

/** Läser in schemat men bara för de valda klasserna (övriga i PDF:en lämnas utanför). */
export function slaIhopSchemaForKlasser(s: Struktur, t: TolkatSchema, skolarId: string, klasser: string[]): SchemaImportUtfall {
  const valda = new Set(klasser);
  return slaIhopSchema(s, { ...t, lektioner: t.lektioner.filter((l) => valda.has(l.klass)) }, skolarId);
}
