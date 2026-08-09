/**
 * Lokal state (sprint 16/18/19/22-om): fältändringar med ångra,
 * egna lektioner, inställningar och backup — allt i localStorage.
 */
import {
  loadSubjectLibrary,
  githubReader,
  type FieldOverride,
  type FlipDoc,
  type LessonRecord,
  type SubjectFile,
} from '@planner/core';
import { DEMO_BEGREPP, DEMO_FLIP, DEMO_LESSONS, DEMO_SUBJECT } from '../data/demo.js';

const K = {
  overrides: 'classroom-planner.overrides.v1',
  custom: 'classroom-planner.custom-lessons.v1',
  removed: 'classroom-planner.removed-lessons.v1',
  settings: 'classroom-planner.settings.v1',
  undo: 'classroom-planner.undo.v1',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
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
    superteach: localStorage.getItem('classroom-planner.superteach.evidence.v1') ?? null,
    calOverrides: localStorage.getItem('classroom-planner.cal-overrides.v1') ?? null,
    lessonLinks: localStorage.getItem('classroom-planner.lesson-links.v1') ?? null,
  }, null, 2);
}
export function importBackup(json: string): void {
  const b = JSON.parse(json) as Record<string, unknown>;
  if (b.schema !== 'classroom-planner-backup') throw new Error('Filen är inte en classroom-planner-backup.');
  write(K.overrides, b.overrides ?? []);
  write(K.custom, b.custom ?? []);
  write(K.removed, b.removed ?? []);
  if (typeof b.superteach === 'string') localStorage.setItem('classroom-planner.superteach.evidence.v1', b.superteach);
  if (typeof b.calOverrides === 'string') localStorage.setItem('classroom-planner.cal-overrides.v1', b.calOverrides);
  if (typeof b.lessonLinks === 'string') localStorage.setItem('classroom-planner.lesson-links.v1', b.lessonLinks);
}

// ── Bibliotek: demo eller GitHub ──────────────────────────────
export interface LoadedLibrary {
  source: 'demo' | 'github';
  subject: SubjectFile;
  lessons: Record<number, LessonRecord[]>;
  flip: Record<number, Record<number, FlipDoc>>;
  begrepp: { perDelkapitel: Record<string, string[]>; definitioner: Record<string, string> };
}

export function demoLibrary(): LoadedLibrary {
  return { source: 'demo', subject: DEMO_SUBJECT, lessons: DEMO_LESSONS, flip: DEMO_FLIP, begrepp: DEMO_BEGREPP };
}

export async function loadFromGithub(): Promise<LoadedLibrary> {
  const s = getSettings();
  if (!s.githubToken) throw new Error('Ingen token angiven — se Bibliotek → Datakällor.');
  const lib = await loadSubjectLibrary(githubReader(s.githubOwner, s.githubRepo, s.githubToken), s.slug);
  const lessons: Record<number, LessonRecord[]> = {};
  const flip: Record<number, Record<number, FlipDoc>> = {};
  for (const [nr, kap] of lib.kapitel) {
    lessons[nr] = kap.lektioner;
    flip[nr] = Object.fromEntries(kap.flip);
  }
  return { source: 'github', subject: lib.subject, lessons, flip, begrepp: lib.begrepp };
}

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

// ── Resurslänkar per lektion: filmer, magma, verktyg ─────────
export interface LessonLink { typ: 'film' | 'magma' | 'quiz' | 'verktyg'; titel: string; url: string; }
const LINKS_KEY = 'classroom-planner.lesson-links.v1';
function linkKey(kapitel: number, lektionId: number): string { return `${kapitel}:${lektionId}`; }
export function getLinks(kapitel: number, lektionId: number): LessonLink[] {
  return read<Record<string, LessonLink[]>>(LINKS_KEY, {})[linkKey(kapitel, lektionId)] ?? [];
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
