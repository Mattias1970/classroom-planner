/**
 * Lokala planeringar i kalendern (del 13) — ren kärna (invariant I2).
 *
 * En komplett initiering (Läsår, Klass, Ämne, Ämnesschema, Bok) kan visas
 * i kalendern som en egen planering bredvid datakällans. Passen genereras
 * av den befintliga schemamotorn (generateSlots) via ett syntetiskt
 * SubjectFile, så lov och svenska röda dagar respekteras automatiskt.
 */
import { generateSlots, type ScheduledSlot } from '../records/schedule.js';
import type { KalenderDag } from '../logic/kalendarium.js';
import type { SubjectFile } from '../records/lesson-record.js';
import { STANDARD_AMNEN, type SchemaPass, type SetupState } from './setup.js';
import { raknaLektioner, type LokalBok } from './bocker.js';

export interface LokalPlanering {
  id: string;
  klassNamn: string;
  amne: string;
  bokTitel: string;
  /** Hexfärg för kalenderposterna. */
  farg: string;
  schema: SchemaPass[];
}

/** Dova, läsbara ämnesfärger; okända ämnen får en stabil färg ur paletten. */
export const AMNES_FARGER: Record<string, string> = {
  Matematik: '#1d4ed8',
  Biologi: '#15803d',
  Fysik: '#7c3aed',
  Kemi: '#b45309',
  Teknik: '#0e7490',
};
const EXTRA_FARGER = ['#9d174d', '#4d7c0f', '#a21caf', '#b91c1c', '#374151'];

export function fargForAmne(amne: string): string {
  const std = AMNES_FARGER[amne];
  if (std !== undefined) return std;
  let hash = 0;
  for (const ch of amne) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return EXTRA_FARGER[hash % EXTRA_FARGER.length] ?? '#374151';
}

/** Stabilt id ur ämne + klass: 'Kemi' + '8F' → 'kemi-8f'. */
export function planeringsId(amne: string, klassNamn: string): string {
  return `${amne} ${klassNamn}`.trim().toLowerCase()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Bygger en planering ur en komplett initiering. */
export function planeringFromSetup(setup: SetupState): LokalPlanering {
  return {
    id: planeringsId(setup.amne, setup.klass),
    klassNamn: setup.klass.trim(),
    amne: setup.amne.trim(),
    bokTitel: setup.bok.titel.trim(),
    farg: fargForAmne(setup.amne.trim()),
    schema: setup.amnesschema,
  };
}

/**
 * Minimalt SubjectFile så att schemamotorn kan generera pass för
 * planeringen. Läsårets startdatum och lov tas från värdplaneringen
 * (samma skola, samma läsårskalender).
 */
export function planeringSubject(p: LokalPlanering, lasar: SubjectFile['läsår']): SubjectFile {
  return {
    meta: {
      ämne: p.amne, årskurs: 0, lärobok: p.bokTitel,
      klasser: [{ id: p.klassNamn, namn: p.klassNamn, läsår: '', socrative: '', arkiverad: false }],
    },
    schema: {
      [p.klassNamn]: p.schema.map((s) => ({ day: s.veckodag, start: s.start, end: s.slut })),
    },
    läsår: lasar,
    kapitelMeta: {},
  };
}

/** En kalenderpost från en lokal planering (visas skrivskyddad i kalendern). */
export interface ExternPost {
  date: string; week: number; weekday: number; start: string; end: string;
  planeringId: string; klassNamn: string; amne: string; bokTitel: string; farg: string;
}

const VECKOR_PER_LASAR = 40;

/** Genererar planeringens alla kalenderposter för läsåret. */
export function byggExternaPoster(p: LokalPlanering, lasar: SubjectFile['läsår'], kalendarium: KalenderDag[] = []): ExternPost[] {
  if (p.schema.length === 0) return [];
  const slots: ScheduledSlot[] = generateSlots(
    planeringSubject(p, lasar), p.klassNamn, p.schema.length * VECKOR_PER_LASAR, kalendarium,
  );
  return slots.map((s) => ({
    date: s.date, week: s.week, weekday: s.weekday, start: s.start, end: s.end,
    planeringId: p.id, klassNamn: p.klassNamn, amne: p.amne, bokTitel: p.bokTitel, farg: p.farg,
  }));
}

/**
 * Klassfärger (del 15): varje klass får en egen, stabil textfärg så att
 * klasser kan särskiljas när de visas tillsammans i kalender och översikt.
 */
const KLASS_PALETT = ['#1d4ed8', '#b91c1c', '#15803d', '#7c3aed', '#b45309', '#0e7490', '#9d174d', '#4d7c0f'];

export function fargForKlass(klassNamn: string): string {
  let hash = 0;
  for (const ch of klassNamn) hash = (hash * 33 + ch.charCodeAt(0)) % 9973;
  return KLASS_PALETT[hash % KLASS_PALETT.length] ?? '#1d4ed8';
}

/** Unika ämnen för filterchips: standardordning först, övriga alfabetiskt. */
export function unikaAmnen(amnen: string[]): string[] {
  const set = new Set(amnen.filter((a) => a.trim() !== ''));
  return [
    ...STANDARD_AMNEN.filter((a) => set.has(a)),
    ...[...set].filter((a) => !STANDARD_AMNEN.includes(a)).sort((a, b) => a.localeCompare(b, 'sv')),
  ];
}

/** Delat värde för "alla ämnen" i ämnesval. */
export const ALLA_AMNEN = '__alla__';

export interface AmnesSummering {
  lektioner: number;
  kapitel: number;
  passPerVecka: number;
  bokTitlar: string[];
  /** true om minst en av planeringarnas böcker finns i biblioteket. */
  harBok: boolean;
}

/**
 * Topbarens summering för ett ämne (del 16): lektioner/kapitel räknas ur
 * bibliotekets böcker (unika per titel); saknas boken används antalet
 * schemalagda pass under läsåret som lektionstal.
 */
export function amnesSummering(
  planeringar: LokalPlanering[],
  bocker: LokalBok[],
  lasar: SubjectFile['läsår'],
): AmnesSummering {
  const titlar = [...new Set(planeringar.map((p) => p.bokTitel))];
  let lektioner = 0, kapitel = 0, harBok = false;
  for (const titel of titlar) {
    const bok = bocker.find((b) => b.bok.titel === titel);
    if (bok) { harBok = true; lektioner += raknaLektioner(bok.lektioner); kapitel += Object.keys(bok.bok.kapitelMeta).length; }
  }
  if (!harBok) {
    for (const p of planeringar) lektioner += byggExternaPoster(p, lasar).length;
  }
  return { lektioner, kapitel, passPerVecka: planeringar[0]?.schema.length ?? 0, bokTitlar: titlar, harBok };
}
