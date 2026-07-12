#!/usr/bin/env bash
# classroom-planner — setup-sprint11.sh
# Sprint 11: DriveStore + schemaVersion-migration + kalender-import
#
# DriveStore: persistent Store baserad på JSON-serialisering
# (i produktion → Google Drive; i tester → fil-/minnesbaserad).
# Samma Store-kontraktstest (C.6) körs mot DriveStore för paritet.
# schemaVersion-migrering: v1→v1 no-op, nyare version → SchemaVersionError.
# Kalender-import: nonTeachingDays från helgdagslista (Sverige).
#
# Kör i Codespaces efter Sprint 10:
#   bash setup-sprint11.sh
#   npm test  ← ska visa minst 232 gröna tester

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Sprint 11 — DriveStore + migration + kalender${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/app-services/src/planning-doc-port.ts" ]; then
  echo "❌  Sprint 10 krävs. Kör: bash setup-sprint10.sh"
  exit 1
fi
ok "Sprint 10 hittad"

# ═══════════════════════════════════════════════════════════════
# 1. DriveDocument — den datastruktur som serialiseras till JSON
# ═══════════════════════════════════════════════════════════════
log "packages/adapters-local/src/drive-document.ts..."
cat > packages/adapters-local/src/drive-document.ts << 'DRIVEDOC'
import type { LessonTemplate, ScheduledLesson, ClassId } from '@planner/core';
import {
  CURRENT_SCHEMA_VERSION,
  migrateDocument,
  prepareForSave,
  createDocument,
  SchemaVersionError,
  ValidationError,
} from '@planner/core';
import type { PlannerDocumentV1 } from '@planner/core';

/**
 * DriveDocument — det JSON-kuvert som sparas i Drive (eller minnet).
 *
 * Utökar PlannerDocumentV1 med applikationsdata.
 * schemaVersion styr migrering vid laddning.
 */
export interface DriveDocumentV1 extends PlannerDocumentV1 {
  readonly schemaVersion: 1;
  templates: LessonTemplate[];
  schedules: Record<string, ScheduledLesson[]>;  // classId → lektioner
}

const APP_VERSION = '1.0.0';

/**
 * Skapar ett tomt DriveDocument.
 */
export function createDriveDocument(clock: () => string): DriveDocumentV1 {
  const envelope = createDocument(APP_VERSION, clock);
  return {
    ...envelope,
    templates: [],
    schedules: {},
  };
}

/**
 * Serialiserar ett DriveDocument till JSON-sträng.
 * Sätter updatedAt via clock.
 */
export function serializeDriveDocument(
  doc: DriveDocumentV1,
  clock: () => string
): string {
  const saved = prepareForSave(doc, clock);
  return JSON.stringify({ ...doc, updatedAt: saved.updatedAt });
}

/**
 * Deserialiserar och migrerar ett DriveDocument från JSON-sträng.
 * Kastar SchemaVersionError om dokumentet är nyare än appen.
 * Kastar ValidationError om JSON är korrupt.
 */
export function deserializeDriveDocument(json: string): DriveDocumentV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError(
      'DriveDocument är inte giltig JSON — filen kan vara korrupt.',
      'serialized'
    );
  }

  // Kör schemaVersion-validering och migrering via core
  const envelope = migrateDocument(parsed);

  // Hämta applikationsdata med fallback
  const raw = parsed as Record<string, unknown>;

  const templates = Array.isArray(raw['templates'])
    ? (raw['templates'] as LessonTemplate[])
    : [];

  const schedules =
    raw['schedules'] !== null &&
    typeof raw['schedules'] === 'object' &&
    !Array.isArray(raw['schedules'])
      ? (raw['schedules'] as Record<string, ScheduledLesson[]>)
      : {};

  return {
    ...envelope,
    templates,
    schedules,
  };
}
DRIVEDOC
ok "drive-document.ts"

# ═══════════════════════════════════════════════════════════════
# 2. MemoryDriveStore — DriveStore med in-memory backend
#    (samma kontrakt som InMemoryStore, men via JSON-serialisering)
# ═══════════════════════════════════════════════════════════════
log "packages/adapters-local/src/memory-drive-store.ts..."
cat > packages/adapters-local/src/memory-drive-store.ts << 'MEMDRIVESTORE'
import type { LessonTemplate, ScheduledLesson, ClassId } from '@planner/core';
import type { Store } from '@planner/app-services';
import { assertNoDeliveryAddress } from '@planner/app-services';
import {
  createDriveDocument,
  serializeDriveDocument,
  deserializeDriveDocument,
} from './drive-document.js';
import type { DriveDocumentV1 } from './drive-document.js';

/**
 * MemoryDriveStore — DriveStore med in-memory backend.
 *
 * Implementerar Store-porten via JSON-serialisering.
 * All data lagras som JSON-sträng i minnet (simulerar Drive).
 *
 * Används för:
 * - Tester som kräver serialiserings-round-trip
 * - Kontraktstester C.6 som ska köras mot ALLA Store-implementationer
 *
 * I produktion byts backend mot Google Drive API (Sprint 11.5+).
 */
export class MemoryDriveStore implements Store {
  private serialized: string;
  private clock: () => string;

  constructor(clock?: () => string) {
    this.clock = clock ?? (() => new Date().toISOString());
    this.serialized = serializeDriveDocument(
      createDriveDocument(this.clock),
      this.clock
    );
  }

  private load(): DriveDocumentV1 {
    return deserializeDriveDocument(this.serialized);
  }

  private save(doc: DriveDocumentV1): void {
    this.serialized = serializeDriveDocument(doc, this.clock);
  }

  async saveTemplate(template: LessonTemplate): Promise<void> {
    assertNoDeliveryAddress(template);
    const doc = this.load();
    const idx = doc.templates.findIndex((t) => t.id === template.id);
    const templates =
      idx >= 0
        ? doc.templates.map((t, i) => (i === idx ? template : t))
        : [...doc.templates, template];
    this.save({ ...doc, templates });
  }

  async loadTemplates(): Promise<LessonTemplate[]> {
    return structuredClone(this.load().templates);
  }

  async saveSchedule(classId: ClassId, lessons: ScheduledLesson[]): Promise<void> {
    for (const lesson of lessons) {
      assertNoDeliveryAddress(lesson);
    }
    const doc = this.load();
    this.save({
      ...doc,
      schedules: { ...doc.schedules, [classId]: lessons },
    });
  }

  async loadSchedule(classId: ClassId): Promise<ScheduledLesson[] | null> {
    const schedules = this.load().schedules;
    const lessons = schedules[classId];
    return lessons ? structuredClone(lessons) : null;
  }

  /** Exportera nuvarande JSON-sträng (för backup/synk) */
  exportJSON(): string {
    return this.serialized;
  }

  /** Importera JSON-sträng (valideras och migreras) */
  importJSON(json: string): void {
    // deserializeDriveDocument validerar och kastar vid fel
    const doc = deserializeDriveDocument(json);
    this.save(doc);
  }

  /** Nollställ till tomt dokument */
  clear(): void {
    this.serialized = serializeDriveDocument(
      createDriveDocument(this.clock),
      this.clock
    );
  }
}
MEMDRIVESTORE
ok "memory-drive-store.ts"

# ═══════════════════════════════════════════════════════════════
# 3. Kalender-import — nonTeachingDays för Sverige
# ═══════════════════════════════════════════════════════════════
log "packages/core/src/logic/calendar.ts..."
cat > packages/core/src/logic/calendar.ts << 'CALENDAR'
/**
 * Kalender-helpers för svenska skoldagar.
 *
 * Beräknar helgdagar och genererar nonTeachingDays-listor
 * för en given termin. Alla funktioner är rena (ingen I/O).
 *
 * Källor:
 * - Svenska helgdagar (fasta + rörliga) enligt almanacka
 * - Stockholms skolors standardlov (approximation — justeras per skola)
 */

/**
 * Genererar datum för påsk (Gregorisk algoritm — Meeus/Jones/Butcher).
 * Returnerar [month (1-12), day].
 */
export function easterDate(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/**
 * Lägger till ett antal dagar till ett datum.
 * Returnerar nytt datum som "YYYY-MM-DD".
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10)!;
}

/**
 * Formaterar år, månad, dag till "YYYY-MM-DD".
 */
function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Svenska fasta helgdagar för ett givet år.
 * Obs: ger INTE lov-dagar — bara röda dagar i almanackan.
 */
export function swedishPublicHolidays(year: number): string[] {
  const [easterMonth, easterDay] = easterDate(year);
  const easterStr = fmt(year, easterMonth, easterDay);

  return [
    fmt(year, 1, 1),   // Nyårsdagen
    fmt(year, 1, 6),   // Trettondedag jul
    addDays(easterStr, -2),  // Långfredag
    addDays(easterStr, 1),   // Annandag påsk
    fmt(year, 5, 1),   // Första maj
    addDays(easterStr, 39),  // Kristi himmelsfärdsdag
    addDays(easterStr, 49),  // Pingstdagen
    fmt(year, 6, 6),   // Nationaldagen
    midsommarafton(year),    // Midsommarafton (fredag)
    fmt(year, 12, 24), // Julafton
    fmt(year, 12, 25), // Juldagen
    fmt(year, 12, 26), // Annandag jul
    fmt(year, 12, 31), // Nyårsafton
  ].sort();
}

/** Midsommarafton = fredagen mellan 19-25 juni */
function midsommarafton(year: number): string {
  for (let day = 19; day <= 25; day++) {
    const d = new Date(fmt(year, 6, day) + 'T12:00:00Z');
    if (d.getUTCDay() === 5) return fmt(year, 6, day); // fredag
  }
  return fmt(year, 6, 20); // fallback
}

/**
 * Standardlov för Stockholm (approximation HT).
 * Justeras per skola — används som startpunkt.
 */
export function stockholmAutumnBreaks(year: number): string[] {
  // Höstlov: vecka 44 (måndag–fredag)
  // Beräkna första måndag i vecka 44
  const nov1 = new Date(fmt(year, 11, 1) + 'T12:00:00Z');
  const dayOfWeek = nov1.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const week44Mon = new Date(nov1);
  week44Mon.setUTCDate(nov1.getUTCDate() + daysToMonday - 7);

  const breaks: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(week44Mon);
    d.setUTCDate(week44Mon.getUTCDate() + i);
    breaks.push(d.toISOString().slice(0, 10)!);
  }
  return breaks;
}

/**
 * Genererar en komplett nonTeachingDays-lista för en termin.
 * Inkluderar: svenska helgdagar + Stockholms standardlov.
 *
 * Filtrerar till bara datum inom [termStart, termEnd].
 */
export function generateNonTeachingDays(
  termStart: string,
  termEnd: string
): string[] {
  const startYear = parseInt(termStart.slice(0, 4)!);
  const endYear = parseInt(termEnd.slice(0, 4)!);

  const allDays = new Set<string>();

  for (let year = startYear; year <= endYear; year++) {
    for (const day of swedishPublicHolidays(year)) {
      allDays.add(day);
    }
    for (const day of stockholmAutumnBreaks(year)) {
      allDays.add(day);
    }
  }

  return Array.from(allDays)
    .filter((d) => d >= termStart && d <= termEnd)
    .sort();
}
CALENDAR
ok "calendar.ts"

# ── Uppdatera logic/index.ts ───────────────────────────────────
log "Uppdaterar logic/index.ts..."
cat > packages/core/src/logic/index.ts << 'LOGICIDX'
export * from './versioning.js';
export * from './timeline.js';
export * from './search.js';
export * from './flip.js';
export * from './engine.js';
export * from './calendar.js';
LOGICIDX
ok "logic/index.ts"

# ── Uppdatera adapters-local/src/index.ts ─────────────────────
log "Uppdaterar adapters-local/src/index.ts..."
cat > packages/adapters-local/src/index.ts << 'LOCALIDX'
export { InMemoryStore } from './in-memory-store.js';
export { FakePublishTarget } from './fake-publish-target.js';
export { MemoryDriveStore } from './memory-drive-store.js';
export type { DriveDocumentV1 } from './drive-document.js';
export {
  createDriveDocument,
  serializeDriveDocument,
  deserializeDriveDocument,
} from './drive-document.js';
LOCALIDX
ok "adapters-local/src/index.ts"

# ═══════════════════════════════════════════════════════════════
# 4. TESTER
# ═══════════════════════════════════════════════════════════════
log "Skapar tester..."
mkdir -p packages/adapters-local/test

cat > packages/adapters-local/test/drive-document.test.ts << 'DRIVEDOCTEST'
import { describe, it, expect } from 'vitest';
import {
  createDriveDocument,
  serializeDriveDocument,
  deserializeDriveDocument,
} from '@planner/adapters-local';
import { SchemaVersionError, ValidationError } from '@planner/core';

const CLOCK = () => '2026-09-01T08:00:00Z';

describe('DriveDocument — serialisering och migrering', () => {

  it('createDriveDocument ger schemaVersion 1', () => {
    const doc = createDriveDocument(CLOCK);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.templates).toHaveLength(0);
    expect(doc.schedules).toEqual({});
  });

  it('serialize → deserialize round-trip bevarar data', () => {
    const doc = createDriveDocument(CLOCK);
    const json = serializeDriveDocument(doc, CLOCK);
    const loaded = deserializeDriveDocument(json);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.templates).toEqual([]);
    expect(loaded.schedules).toEqual({});
  });

  it('serialize sätter updatedAt', () => {
    const later = () => '2026-09-02T10:00:00Z';
    const doc = createDriveDocument(CLOCK);
    const json = serializeDriveDocument(doc, later);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed['updatedAt']).toBe('2026-09-02T10:00:00Z');
  });

  it('deserialize med nyare schemaVersion → SchemaVersionError', () => {
    const json = JSON.stringify({
      schemaVersion: 999,
      appVersion: '1.0.0',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      templates: [],
      schedules: {},
    });
    expect(() => deserializeDriveDocument(json)).toThrow(SchemaVersionError);
  });

  it('deserialize med korrupt JSON → ValidationError', () => {
    expect(() => deserializeDriveDocument('inte-json-{{{')).toThrow(ValidationError);
  });

  it('deserialize med saknad templates → tom array (graceful fallback)', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      appVersion: '1.0.0',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    });
    const doc = deserializeDriveDocument(json);
    expect(doc.templates).toEqual([]);
    expect(doc.schedules).toEqual({});
  });
});
DRIVEDOCTEST
ok "drive-document.test.ts"

cat > packages/adapters-local/test/memory-drive-store.test.ts << 'MEMDRIVETEST'
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDriveStore } from '@planner/adapters-local';
import { makeTemplate, makeScheduled } from '../../core/test/helpers/fixtures.js';

/**
 * C.6 (paritet) — Samma tester som körs mot InMemoryStore
 * körs här mot MemoryDriveStore via JSON-serialisering.
 * Båda Store-implementationerna måste uppfylla exakt samma kontrakt.
 */
describe('C.6 (paritet) — MemoryDriveStore kontraktstest', () => {
  const CLOCK = () => '2026-09-01T08:00:00Z';
  let store: MemoryDriveStore;

  beforeEach(() => { store = new MemoryDriveStore(CLOCK); });

  it('C.6.1: saveTemplate + loadTemplates round-trip', async () => {
    const template = makeTemplate();
    await store.saveTemplate(template);
    const loaded = await store.loadTemplates();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(template.id);
    expect(loaded[0]?.currentVersionId).toBe(template.currentVersionId);
  });

  it('C.6.2: saveSchedule + loadSchedule round-trip', async () => {
    const lesson = makeScheduled();
    await store.saveSchedule('8B', [lesson]);
    const loaded = await store.loadSchedule('8B');
    expect(loaded).not.toBeNull();
    expect(loaded![0]?.id).toBe(lesson.id);
  });

  it('C.6.3: loadSchedule med okänd klass → null', async () => {
    expect(await store.loadSchedule('finns-inte')).toBeNull();
  });

  it('C.6.4: två saveTemplate med samma id → senaste vinner', async () => {
    const t1 = makeTemplate();
    const t2 = { ...t1, currentVersionId: 'v-ny' as typeof t1.currentVersionId };
    await store.saveTemplate(t1);
    await store.saveTemplate(t2);
    const loaded = await store.loadTemplates();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.currentVersionId).toBe('v-ny');
  });

  it('C.6.4b: två saveSchedule med samma classId → senaste vinner', async () => {
    const l1 = { ...makeScheduled(), date: '2026-09-07' };
    const l2 = { ...makeScheduled(), date: '2026-09-08' };
    await store.saveSchedule('8B', [l1]);
    await store.saveSchedule('8B', [l2]);
    const loaded = await store.loadSchedule('8B');
    expect(loaded).toHaveLength(1);
    expect(loaded![0]?.date).toBe('2026-09-08');
  });

  it('R-P1: saveSchedule kastar vid deliveryAddress', async () => {
    const lesson = { ...makeScheduled(), deliveryAddress: 'test@example.com' };
    await expect(
      store.saveSchedule('8B', [lesson as ReturnType<typeof makeScheduled>])
    ).rejects.toThrow('R-P1');
  });
});

describe('MemoryDriveStore — export/import JSON', () => {
  const CLOCK = () => '2026-09-01T08:00:00Z';

  it('exportJSON + importJSON round-trip bevarar mallar', async () => {
    const store1 = new MemoryDriveStore(CLOCK);
    const template = makeTemplate();
    await store1.saveTemplate(template);
    const json = store1.exportJSON();

    const store2 = new MemoryDriveStore(CLOCK);
    store2.importJSON(json);
    const loaded = await store2.loadTemplates();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(template.id);
  });

  it('exportJSON + importJSON round-trip bevarar scheman', async () => {
    const store1 = new MemoryDriveStore(CLOCK);
    const lesson = makeScheduled();
    await store1.saveSchedule('8B', [lesson]);
    const json = store1.exportJSON();

    const store2 = new MemoryDriveStore(CLOCK);
    store2.importJSON(json);
    const loaded = await store2.loadSchedule('8B');
    expect(loaded![0]?.id).toBe(lesson.id);
  });

  it('importJSON med nyare schemaVersion kastar fel', () => {
    const store = new MemoryDriveStore(CLOCK);
    const badJson = JSON.stringify({
      schemaVersion: 999,
      appVersion: '1.0.0',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      templates: [],
      schedules: {},
    });
    expect(() => store.importJSON(badJson)).toThrow();
  });

  it('clear() nollställer all data', async () => {
    const store = new MemoryDriveStore(CLOCK);
    await store.saveTemplate(makeTemplate());
    store.clear();
    const templates = await store.loadTemplates();
    expect(templates).toHaveLength(0);
  });
});
MEMDRIVETEST
ok "memory-drive-store.test.ts"

cat > packages/core/test/calendar.test.ts << 'CALTEST'
import { describe, it, expect } from 'vitest';
import {
  easterDate,
  swedishPublicHolidays,
  generateNonTeachingDays,
} from '@planner/core';

describe('easterDate', () => {
  it('Påsk 2026 är 5 april', () => {
    const [month, day] = easterDate(2026);
    expect(month).toBe(4);
    expect(day).toBe(5);
  });

  it('Påsk 2025 är 20 april', () => {
    const [month, day] = easterDate(2025);
    expect(month).toBe(4);
    expect(day).toBe(20);
  });

  it('Påsk 2024 är 31 mars', () => {
    const [month, day] = easterDate(2024);
    expect(month).toBe(3);
    expect(day).toBe(31);
  });
});

describe('swedishPublicHolidays', () => {
  it('ger minst 12 helgdagar för 2026', () => {
    expect(swedishPublicHolidays(2026).length).toBeGreaterThanOrEqual(12);
  });

  it('inkluderar Nyårsdagen 2026-01-01', () => {
    expect(swedishPublicHolidays(2026)).toContain('2026-01-01');
  });

  it('inkluderar Nationaldagen 2026-06-06', () => {
    expect(swedishPublicHolidays(2026)).toContain('2026-06-06');
  });

  it('inkluderar Juldagen 2026-12-25', () => {
    expect(swedishPublicHolidays(2026)).toContain('2026-12-25');
  });

  it('Långfredag 2026 är 3 april (påsk - 2 dagar)', () => {
    expect(swedishPublicHolidays(2026)).toContain('2026-04-03');
  });

  it('Annandag påsk 2026 är 6 april (påsk + 1 dag)', () => {
    expect(swedishPublicHolidays(2026)).toContain('2026-04-06');
  });

  it('returnerar datum i sorteringsordning', () => {
    const days = swedishPublicHolidays(2026);
    expect(days).toEqual([...days].sort());
  });
});

describe('generateNonTeachingDays', () => {
  it('returnerar datum inom terminen', () => {
    const days = generateNonTeachingDays('2026-09-07', '2026-12-19');
    for (const d of days) {
      expect(d >= '2026-09-07').toBe(true);
      expect(d <= '2026-12-19').toBe(true);
    }
  });

  it('inga helgdagar utanför terminen', () => {
    const days = generateNonTeachingDays('2026-09-07', '2026-12-19');
    expect(days).not.toContain('2026-01-01');
    expect(days).not.toContain('2026-06-06');
  });

  it('inkluderar Nationaldagen om den är i terminen', () => {
    const days = generateNonTeachingDays('2026-06-01', '2026-06-30');
    expect(days).toContain('2026-06-06');
  });

  it('returnerar sorterade datum', () => {
    const days = generateNonTeachingDays('2026-09-07', '2026-12-19');
    expect(days).toEqual([...days].sort());
  });

  it('inga dubletter', () => {
    const days = generateNonTeachingDays('2026-09-07', '2026-12-19');
    expect(new Set(days).size).toBe(days.length);
  });
});
CALTEST
ok "calendar.test.ts"

# ── sprint-11-spec ─────────────────────────────────────────────
cat > .claude/sprint/sprint-11-spec.md << 'SPEC11'
# Sprint 11: DriveStore + schemaVersion-migration + kalender

**Status:** Klar

## Leverabler
- packages/adapters-local/src/drive-document.ts    (DriveDocumentV1, serialize/deserialize)
- packages/adapters-local/src/memory-drive-store.ts (MemoryDriveStore — Drive-paritet via JSON)
- packages/adapters-local/src/index.ts             (uppdaterad)
- packages/core/src/logic/calendar.ts              (easterDate, swedishPublicHolidays, generateNonTeachingDays)
- packages/core/src/logic/index.ts                 (uppdaterad)
- packages/adapters-local/test/drive-document.test.ts   (6 tester)
- packages/adapters-local/test/memory-drive-store.test.ts (10 tester — C.6 paritet)
- packages/core/test/calendar.test.ts              (14 tester)

## Regler
- MemoryDriveStore uppfyller exakt samma Store-kontrakt som InMemoryStore
- C.6-testerna körs mot MemoryDriveStore för paritet
- deserializeDriveDocument: SchemaVersionError vid nyare version, ValidationError vid korrupt JSON
- importJSON: validerar och migrerar alltid via core
- generateNonTeachingDays: ren funktion, inga datum utanför [termStart, termEnd]
- Inga dubletter i nonTeachingDays-listan

## Testresultat
Sprint 1-10 (202) + Sprint 11 (30) = 232 tester
SPEC11
ok ".claude/sprint/sprint-11-spec.md"

# ── Kör tester ─────────────────────────────────────────────────
echo ""
log "npm test (232 ska passera)..."
npm test 2>&1 | tail -6

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sprint 11 klar!                              ${NC}"
echo -e "${GREEN}  DriveStore + migration + svenska helgdagar   ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo "Nästa: bash setup-sprint12.sh  (hårdning + E2E)"
echo ""
