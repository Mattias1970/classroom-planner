/**
 * Lokal state (sprint 16/18/19/22-om): fältändringar med ångra,
 * egna lektioner, inställningar och backup — allt i localStorage.
 */
import {
  loadSubjectLibrary,
  type FieldOverride,
  type FlipDoc,
  type LessonRecord,
  type SubjectFile,
} from '@planner/core';
import { githubReader } from './githubReader.js';
import { DEMO_BEGREPP, DEMO_FLIP, DEMO_LESSONS, DEMO_SUBJECT } from '../data/demo.js';

const K = {
  overrides: 'classroom-planner.overrides.v1',
  custom: 'classroom-planner.custom-lessons.v1',
  removed: 'classroom-planner.removed-lessons.v1',
  settings: 'classroom-planner.settings.v1',
  undo: 'classroom-planner.undo.v1',
};

/**
 * NFR-005: all webblagring går genom felskyddade hjälpare — om localStorage
 * är otillgängligt (privat läge, fullt utrymme, policyspärr) fortsätter
 * sessionen i minnet utan fatala fel.
 */
const memFallback = new Map<string, string>();
export function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) ?? memFallback.get(key) ?? null; }
  catch { return memFallback.get(key) ?? null; }
}
export function lsSet(key: string, value: string): void {
  memFallback.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* session-only fallback */ }
}
function read<T>(key: string, fallback: T): T {
  try {
    const raw = lsGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  lsSet(key, JSON.stringify(value));
}

// ── Inställningar ─────────────────────────────────────────────
export interface Settings { githubOwner: string; githubRepo: string; githubToken: string; slug: string; }
export function getSettings(): Settings {
  return read<Settings>(K.settings, { githubOwner: 'Mattias1970', githubRepo: 'classroom-planner-data', githubToken: '', slug: 'matematik-8' });
}
export function saveSettings(s: Settings): void { write(K.settings, s); }

// ── Fältändringar med ångra ───────────────────────────────────
export function getOverrides(): FieldOverride[] { return read<FieldOverride[]>(K.overrides, []); }

export function setField(kapitel: number, lektionId: number, field: keyof LessonRecord, value: string): void {
  const all = getOverrides();
  const undoStack = read<FieldOverride[][]>(K.undo, []);
  write(K.undo, [...undoStack.slice(-19), all]);
  all.push({ kapitel, lektionId, field, value, updatedAt: new Date().toISOString() });
  write(K.overrides, all);
}

export function undo(): boolean {
  const undoStack = read<FieldOverride[][]>(K.undo, []);
  const prev = undoStack.pop();
  if (!prev) return false;
  write(K.undo, undoStack);
  write(K.overrides, prev);
  return true;
}

/** FR-EDIT-005: tar bort alla lokala redigeringar för ett fält (med ångra-steg). */
export function clearField(kapitel: number, lektionId: number, field: keyof LessonRecord): void {
  const all = getOverrides();
  const undoStack = read<FieldOverride[][]>(K.undo, []);
  write(K.undo, [...undoStack.slice(-19), all]);
  write(K.overrides, all.filter((o) => !(o.kapitel === kapitel && o.lektionId === lektionId && o.field === field)));
}

/** Har fältet en lokal redigering? (FR-EDIT-004) */
export function isEdited(kapitel: number, lektionId: number, field: keyof LessonRecord): boolean {
  return getOverrides().some((o) => o.kapitel === kapitel && o.lektionId === lektionId && o.field === field);
}

export function effectiveField(kapitel: number, lesson: LessonRecord, field: keyof LessonRecord): string {
  const mine = getOverrides()
    .filter((o) => o.kapitel === kapitel && o.lektionId === lesson.id && o.field === field)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return mine.length ? mine[mine.length - 1].value : String(lesson[field]);
}

// ── Egna/borttagna lektioner (sprint 18-om) ───────────────────
export type InsertMode = 'skjut-fram' | 'ersätt' | 'sist';
export interface CustomLesson { kapitel: number; afterId: number | null; mode: InsertMode; lesson: LessonRecord; }
export function getCustomLessons(): CustomLesson[] { return read<CustomLesson[]>(K.custom, []); }
export function addCustomLesson(c: CustomLesson): void { write(K.custom, [...getCustomLessons(), c]); }
export function getRemovedIds(): Array<{ kapitel: number; id: number }> { return read(K.removed, []); }
export function removeLesson(kapitel: number, id: number): void {
  write(K.removed, [...getRemovedIds(), { kapitel, id }]);
}
export function restoreAllRemoved(): void { write(K.removed, []); }

/** Slår ihop bas + egna − borttagna till kapitlets faktiska sekvens. */
export function composeChapter(kapitel: number, base: LessonRecord[]): LessonRecord[] {
  const removed = new Set(getRemovedIds().filter((r) => r.kapitel === kapitel).map((r) => r.id));
  let seq = base.filter((l) => !removed.has(l.id));
  for (const c of getCustomLessons().filter((x) => x.kapitel === kapitel)) {
    if (c.mode === 'sist' || c.afterId === null) seq = [...seq, c.lesson];
    else {
      const i = seq.findIndex((l) => l.id === c.afterId);
      if (i === -1) seq = [...seq, c.lesson];
      else if (c.mode === 'ersätt') seq = [...seq.slice(0, i), c.lesson, ...seq.slice(i + 1)];
      else seq = [...seq.slice(0, i + 1), c.lesson, ...seq.slice(i + 1)];
    }
  }
  return seq;
}

export function nextCustomId(base: LessonRecord[]): number {
  const all = [...base.map((l) => l.id), ...getCustomLessons().map((c) => c.lesson.id)];
  return Math.max(1000, ...all) + 1;
}

// ── Backup (sprint 19-om) ─────────────────────────────────────
export function exportBackup(): string {
  return JSON.stringify({
    schema: 'classroom-planner-backup', version: 1, exportedAt: new Date().toISOString(),
    overrides: getOverrides(), custom: getCustomLessons(), removed: getRemovedIds(), settings: { ...getSettings(), githubToken: '' },
    superteach: lsGet('classroom-planner.superteach.evidence.v1') ?? null,
    calOverrides: lsGet('classroom-planner.cal-overrides.v1') ?? null,
    lessonLinks: lsGet('classroom-planner.lesson-links.v1') ?? null,
    schemaEdits: lsGet(SCHEMA_KEY) ?? null,
    magma: lsGet('classroom-planner.magma.v1') ?? null,
    prio: lsGet('classroom-planner.prio.v1') ?? null,
    classEdits: lsGet(CLASSES_KEY) ?? null,
    classNotes: lsGet(NOTES_KEY) ?? null,
    prompts: lsGet(PROMPTS_KEY),
  }, null, 2);
}
export function importBackup(json: string): void {
  const b = JSON.parse(json) as Record<string, unknown>;
  if (b.schema !== 'classroom-planner-backup') throw new Error('Filen är inte en classroom-planner-backup.');
  write(K.overrides, b.overrides ?? []);
  write(K.custom, b.custom ?? []);
  write(K.removed, b.removed ?? []);
  if (typeof b.superteach === 'string') lsSet('classroom-planner.superteach.evidence.v1', b.superteach);
  if (typeof b.calOverrides === 'string') lsSet('classroom-planner.cal-overrides.v1', b.calOverrides);
  if (typeof b.lessonLinks === 'string') lsSet('classroom-planner.lesson-links.v1', b.lessonLinks);
  if (typeof b.schemaEdits === 'string') lsSet(SCHEMA_KEY, b.schemaEdits);
  if (typeof b.magma === 'string') lsSet('classroom-planner.magma.v1', b.magma);
  if (typeof b.prio === 'string') lsSet('classroom-planner.prio.v1', b.prio);
  if (typeof b.classEdits === 'string') lsSet(CLASSES_KEY, b.classEdits);
  if (typeof b.classNotes === 'string') lsSet(NOTES_KEY, b.classNotes);
  if (typeof b.prompts === 'string') lsSet(PROMPTS_KEY, b.prompts);
}

// ── Klassregister-overlay (FR-CM-002…008) ─────────────────────
import type { ClassEdits } from '@planner/core';
const CLASSES_KEY = 'classroom-planner.class-edits.v1';
export function getClassEdits(): ClassEdits { return read<ClassEdits>(CLASSES_KEY, {}); }
export function saveClassEdits(e: ClassEdits): void { write(CLASSES_KEY, e); }

// ── Klassanteckningar per klass/kapitel/lektion (FR-CLS-002/003) ──
const NOTES_KEY = 'classroom-planner.class-notes.v1';
function noteKey(classId: string, kapitel: number, lektionId: number): string {
  return `${classId}:${kapitel}:${lektionId}`;
}
export function getClassNote(classId: string, kapitel: number, lektionId: number): string {
  return read<Record<string, string>>(NOTES_KEY, {})[noteKey(classId, kapitel, lektionId)] ?? '';
}
export function setClassNote(classId: string, kapitel: number, lektionId: number, text: string): void {
  const all = read<Record<string, string>>(NOTES_KEY, {});
  const k = noteKey(classId, kapitel, lektionId);
  if (text.trim() === '') delete all[k]; else all[k] = text;
  write(NOTES_KEY, all);
}

// ── Promptbibliotek: egna varianter (persistent, i backup) ───
import type { PromptTemplate } from '@planner/core';
const PROMPTS_KEY = 'classroom-planner.prompts.v1';
export function getCustomPrompts(): PromptTemplate[] {
  return read<PromptTemplate[]>(PROMPTS_KEY, []).map((p) => ({ ...p, kalla: 'egen' as const }));
}
export function saveCustomPrompt(prompt: PromptTemplate): void {
  const all = getCustomPrompts().filter((p) => p.id !== prompt.id);
  write(PROMPTS_KEY, [...all, { ...prompt, kalla: 'egen', uppdaterad: new Date().toISOString() }]);
}
export function deleteCustomPrompt(id: string): void {
  write(PROMPTS_KEY, getCustomPrompts().filter((p) => p.id !== id));
}

// ── Magma: en aktivitet per lektion (FR-MAG-001…006) ─────────
export interface MagmaActivity { label: string; url: string; }
const MAGMA_KEY = 'classroom-planner.magma.v1';
export function getMagma(kapitel: number, lektionId: number): MagmaActivity | null {
  return read<Record<string, MagmaActivity>>(MAGMA_KEY, {})[linkKey(kapitel, lektionId)] ?? null;
}
export function setMagma(kapitel: number, lektionId: number, a: MagmaActivity): void {
  const all = read<Record<string, MagmaActivity>>(MAGMA_KEY, {});
  all[linkKey(kapitel, lektionId)] = a;
  write(MAGMA_KEY, all);
}
export function clearMagma(kapitel: number, lektionId: number): void {
  const all = read<Record<string, MagmaActivity>>(MAGMA_KEY, {});
  delete all[linkKey(kapitel, lektionId)];
  write(MAGMA_KEY, all);
}
export function countMagmaForKap(kapitel: number, lessonIds: number[]): number {
  const all = read<Record<string, MagmaActivity>>(MAGMA_KEY, {});
  return lessonIds.filter((id) => all[linkKey(kapitel, id)]).length;
}

// ── Prio Övningsrum (FR-PRIO-001…003) ────────────────────────
export interface PrioRoom { active: boolean; desc: string; }
export type PrioState = Record<string, PrioRoom>; // 'Prio1'…'Prio5'
const PRIO_KEY = 'classroom-planner.prio.v1';
export const PRIO_ALL = ['Prio1', 'Prio2', 'Prio3', 'Prio4', 'Prio5'] as const;
export function getPrio(kapitel: number, lektionId: number): PrioState {
  return read<Record<string, PrioState>>(PRIO_KEY, {})[linkKey(kapitel, lektionId)] ?? {};
}
export function setPrio(kapitel: number, lektionId: number, state: PrioState): void {
  const all = read<Record<string, PrioState>>(PRIO_KEY, {});
  all[linkKey(kapitel, lektionId)] = state;
  write(PRIO_KEY, all);
}

// ── FR-STR-005: skifta kalenderöverstyrningar vid strukturell insättning ──
import { shiftOverrideMap } from '@planner/core';
export function shiftAllCalOverrides(insertedAt: number, delta: number): void {
  const all = read<Record<string, OverrideMap>>(OV_KEY, {});
  for (const cls of Object.keys(all)) all[cls] = shiftOverrideMap(all[cls], insertedAt, delta);
  write(OV_KEY, all);
}

// ── Bibliotek: demo eller GitHub ──────────────────────────────
export interface LoadedLibrary {
  source: 'demo' | 'github';
  subject: SubjectFile;
  lessons: Record<number, LessonRecord[]>;
  flip: Record<number, Record<number, FlipDoc>>;
  begrepp: { perDelkapitel: Record<string, string[]>; definitioner: Record<string, string> };
  /** Bokens resurslänkar per lektion ('kap-lektionsId') ur books/<bookId>/lankar.json. */
  lankar: Record<string, import('@planner/core').BookLink[]>;
  /** Promptmallar ur datakällans prompter/-katalog. */
  prompter: PromptTemplate[];
}

export function demoLibrary(): LoadedLibrary {
  return { source: 'demo', subject: DEMO_SUBJECT, lessons: DEMO_LESSONS, flip: DEMO_FLIP, begrepp: DEMO_BEGREPP, lankar: {}, prompter: [] };
}

export async function loadFromGithub(): Promise<LoadedLibrary> {
  const s = getSettings();
  if (!s.githubToken) throw new Error('Ingen token angiven — se Bibliotek → Datakällor.');
  const reader = githubReader(s.githubOwner, s.githubRepo, s.githubToken);
  const lib = await loadSubjectLibrary(reader, s.slug);
  const lessons: Record<number, LessonRecord[]> = {};
  const flip: Record<number, Record<number, FlipDoc>> = {};
  for (const [nr, kap] of lib.kapitel) {
    lessons[nr] = kap.lektioner;
    flip[nr] = Object.fromEntries(kap.flip);
  }
  // Promptmallar (valfritt): prompter/index.json = [{id, namn, beskrivning, fil}]
  const prompter: PromptTemplate[] = [];
  try {
    const idxText = await reader.readText('prompter/index.json');
    if (idxText) {
      const idx = JSON.parse(idxText) as Array<{ id: string; namn: string; beskrivning: string; fil: string }>;
      for (const e of idx) {
        const body = await reader.readText(`prompter/${e.fil}`);
        if (body) prompter.push({ id: e.id, namn: e.namn, beskrivning: e.beskrivning, innehall: body, kalla: 'datakalla' });
      }
    }
  } catch { /* trasig promptkatalog ska inte stoppa dataladdningen */ }

  return { source: 'github', subject: lib.subject, lessons, flip, begrepp: lib.begrepp, lankar: lib.lankar, prompter };
}

// ── Schemaändringar: startdatum + pass per klass (FR-SCH-002…005) ──
import type { SchemaEdits } from '@planner/core';
const SCHEMA_KEY = 'classroom-planner.schema-edits.v1';
export function getSchemaEdits(): SchemaEdits { return read<SchemaEdits>(SCHEMA_KEY, {}); }
export function saveSchemaEdits(e: SchemaEdits): void { write(SCHEMA_KEY, e); }

// ── Kalenderöverstyrningar per klass (sprint kalender-komplett) ──
import type { OverrideMap, LessonOverride } from '@planner/core';
const OV_KEY = 'classroom-planner.cal-overrides.v1';
export function getCalOverrides(classId: string): OverrideMap {
  return read<Record<string, OverrideMap>>(OV_KEY, {})[classId] ?? {};
}
export function setCalOverride(classId: string, globalIdx: number, ov: LessonOverride | null): void {
  const all = read<Record<string, OverrideMap>>(OV_KEY, {});
  const mine = all[classId] ?? {};
  if (ov === null) delete mine[globalIdx]; else mine[globalIdx] = ov;
  all[classId] = mine;
  write(OV_KEY, all);
}

// ── Pedagogiska verktyg per lektion (FR-TOOL-001…007) ─────────
/** Specens sex verktygstyper. */
export type ToolTyp = 'laxforhor' | 'exit' | 'ovning' | 'film' | 'prov' | 'flippat';
export interface LessonLink { typ: ToolTyp; platform?: string; titel: string; url: string; }
const LINKS_KEY = 'classroom-planner.lesson-links.v1';
function linkKey(kapitel: number, lektionId: number): string { return `${kapitel}:${lektionId}`; }
/** Migrerar äldre kategorier (del 3) till specens sex typer. */
const LEGACY_TYP: Record<string, { typ: ToolTyp; platform?: string }> = {
  quiz: { typ: 'laxforhor', platform: 'Socrative' },
  magma: { typ: 'ovning', platform: 'Magma' },
  verktyg: { typ: 'ovning' },
  aktivitet: { typ: 'ovning' },
  ovrigt: { typ: 'ovning' },
};
export function getLinks(kapitel: number, lektionId: number): LessonLink[] {
  const raw = read<Record<string, Array<LessonLink & { typ: string }>>>(LINKS_KEY, {})[linkKey(kapitel, lektionId)] ?? [];
  return raw.map((l) => {
    const legacy = LEGACY_TYP[l.typ];
    return legacy ? { ...l, typ: legacy.typ, platform: l.platform ?? legacy.platform } : (l as LessonLink);
  });
}
export function addLink(kapitel: number, lektionId: number, link: LessonLink): void {
  const all = read<Record<string, LessonLink[]>>(LINKS_KEY, {});
  const k = linkKey(kapitel, lektionId);
  all[k] = [...(all[k] ?? []), link];
  write(LINKS_KEY, all);
}
export function removeLink(kapitel: number, lektionId: number, idx: number): void {
  const all = read<Record<string, LessonLink[]>>(LINKS_KEY, {});
  const k = linkKey(kapitel, lektionId);
  all[k] = (all[k] ?? []).filter((_, i) => i !== idx);
  write(LINKS_KEY, all);
}
