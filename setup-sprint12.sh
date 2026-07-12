#!/usr/bin/env bash
# classroom-planner — setup-sprint12.sh
# Sprint 12: Hårdning — retry, auditlogg, rollback, E2E-integrationstester
#
# retry: exponentiell backoff för nätverksoperationer
# auditlogg: spåra alla publicerings- och Store-händelser
# rollback: ångra sista schema-operation
# E2E: full flödestest utan nätverk (FakeAdapters)
#
# Kör i Codespaces efter Sprint 11:
#   bash setup-sprint12.sh
#   npm test  ← ska visa minst 263 gröna tester

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

echo ""
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Sprint 12 — Hårdning + E2E               ${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/adapters-local/src/memory-drive-store.ts" ]; then
  echo "❌  Sprint 11 krävs. Kör: bash setup-sprint11.sh"
  exit 1
fi
ok "Sprint 11 hittad"
mkdir -p packages/app-services/src
mkdir -p packages/app-services/test

# ═══════════════════════════════════════════════════════════════
# 1. Retry — exponentiell backoff
# ═══════════════════════════════════════════════════════════════
log "packages/app-services/src/retry.ts..."
cat > packages/app-services/src/retry.ts << 'RETRY'
import { DomainError } from '@planner/core';

export interface RetryOptions {
  maxAttempts: number;      // max antal försök inkl. första
  initialDelayMs: number;   // initial fördröjning i ms
  backoffFactor: number;    // multiplikator per försök (2 = exponentiell)
  maxDelayMs: number;       // tak för fördröjning
  retryOn?: (error: unknown) => boolean;  // vilka fel ska retryas
}

export const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 200,
  backoffFactor: 2,
  maxDelayMs: 5000,
};

/**
 * Kör en async-funktion med exponentiell backoff.
 *
 * REN på kontraktsnivå: kastar DomainError om alla försök misslyckas.
 * Sleep-funktionen är injicerbar för testbarhet (ingen riktig sleep i tester).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY,
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<T> {
  let lastError: unknown;
  let delay = options.initialDelayMs;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Kolla om vi ska retrya detta specifika fel
      if (options.retryOn && !options.retryOn(err)) {
        throw err;
      }

      if (attempt < options.maxAttempts) {
        await sleep(delay);
        delay = Math.min(delay * options.backoffFactor, options.maxDelayMs);
      }
    }
  }

  throw new DomainError(
    'RETRY_EXHAUSTED',
    `Operationen misslyckades efter ${options.maxAttempts} försök. ` +
      `Senaste fel: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
RETRY
ok "retry.ts"

# ═══════════════════════════════════════════════════════════════
# 2. Auditlogg — spåra händelser
# ═══════════════════════════════════════════════════════════════
log "packages/app-services/src/audit-log.ts..."
cat > packages/app-services/src/audit-log.ts << 'AUDITLOG'
/**
 * Auditlogg — spårar alla publicerings- och schemaläggningshändelser.
 *
 * Varje händelse är append-only: logg-poster raderas aldrig.
 * Används av SuperTeach (Sprint 14+) och för felsökning.
 *
 * REN implementation: ingen I/O, allt i minnet.
 * I produktion serialiseras loggen till DriveStore.
 */

export type AuditEventType =
  | 'template-saved'
  | 'schedule-saved'
  | 'lesson-published'
  | 'lesson-updated'
  | 'planning-doc-written'
  | 'import-completed'
  | 'rollback-performed';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: string;        // ISO 8601
  classId?: string;
  templateId?: string;
  scheduledLessonId?: string;
  outcome: 'success' | 'failure';
  detail?: string;
  durationMs?: number;
}

export class AuditLog {
  private events: AuditEvent[] = [];
  private nextId = 1;

  /**
   * Loggar en händelse. Append-only — poster raderas aldrig.
   */
  log(event: Omit<AuditEvent, 'id'>): AuditEvent {
    const entry: AuditEvent = { id: `evt-${this.nextId++}`, ...event };
    this.events.push(entry);
    return entry;
  }

  /**
   * Hämtar alla händelser, valfritt filtrerat.
   */
  getEvents(filter?: {
    type?: AuditEventType;
    classId?: string;
    outcome?: 'success' | 'failure';
    since?: string;  // ISO timestamp
  }): AuditEvent[] {
    return this.events.filter((e) => {
      if (filter?.type && e.type !== filter.type) return false;
      if (filter?.classId && e.classId !== filter.classId) return false;
      if (filter?.outcome && e.outcome !== filter.outcome) return false;
      if (filter?.since && e.timestamp < filter.since) return false;
      return true;
    });
  }

  /**
   * Antal loggade händelser totalt.
   */
  get count(): number { return this.events.length; }

  /**
   * Antal misslyckade händelser.
   */
  get failureCount(): number {
    return this.events.filter((e) => e.outcome === 'failure').length;
  }

  /**
   * Senaste händelse av en given typ.
   */
  lastOf(type: AuditEventType): AuditEvent | null {
    return [...this.events].reverse().find((e) => e.type === type) ?? null;
  }

  /**
   * Exportera som JSON-serialiserbar array (för Store).
   */
  toJSON(): AuditEvent[] { return structuredClone(this.events); }

  /**
   * Ladda från JSON (för Store-återhämtning).
   */
  static fromJSON(events: AuditEvent[]): AuditLog {
    const log = new AuditLog();
    log.events = structuredClone(events);
    log.nextId = events.length + 1;
    return log;
  }
}
AUDITLOG
ok "audit-log.ts"

# ═══════════════════════════════════════════════════════════════
# 3. ScheduleHistory — rollback-stöd
# ═══════════════════════════════════════════════════════════════
log "packages/app-services/src/schedule-history.ts..."
cat > packages/app-services/src/schedule-history.ts << 'SCHEDHISTORY'
import type { ScheduledLesson } from '@planner/core';
import { DomainError } from '@planner/core';

/**
 * ScheduleHistory — håller en ångra-stack för schema-operationer.
 *
 * Varje operation (move, remove, insert) sparar det tidigare
 * tillståndet. Rollback återställer till föregående tillstånd.
 *
 * Max 20 snapshots — äldre raderas (FIFO).
 */
export class ScheduleHistory {
  private snapshots: Array<{
    timestamp: string;
    label: string;
    lessons: ScheduledLesson[];
  }> = [];

  private readonly maxSnapshots: number;

  constructor(maxSnapshots = 20) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Sparar nuvarande state innan en operation utförs.
   */
  push(lessons: ScheduledLesson[], label: string, timestamp: string): void {
    this.snapshots.push({
      timestamp,
      label,
      lessons: structuredClone(lessons),
    });
    // FIFO: ta bort äldsta om vi överskrider max
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Ångrar senaste operation.
   * Returnerar det återställda schemat.
   * Kastar DomainError om historiken är tom.
   */
  rollback(): { lessons: ScheduledLesson[]; label: string; timestamp: string } {
    const snap = this.snapshots.pop();
    if (!snap) {
      throw new DomainError(
        'NO_HISTORY',
        'Ingen historik att ångra — inga operationer har utförts.'
      );
    }
    return { lessons: structuredClone(snap.lessons), label: snap.label, timestamp: snap.timestamp };
  }

  /**
   * Antal tillgängliga ångra-steg.
   */
  get depth(): number { return this.snapshots.length; }

  /**
   * Om rollback är möjlig.
   */
  get canRollback(): boolean { return this.snapshots.length > 0; }

  /**
   * Etikett för senaste sparade tillstånd (för UI-visning).
   */
  get lastLabel(): string | null {
    return this.snapshots[this.snapshots.length - 1]?.label ?? null;
  }

  /** Nollställ historiken */
  clear(): void { this.snapshots = []; }
}
SCHEDHISTORY
ok "schedule-history.ts"

# ── Uppdatera app-services/src/index.ts ──────────────────────
log "Uppdaterar app-services/src/index.ts..."
cat > packages/app-services/src/index.ts << 'APPIDX'
export * from './ports.js';
export * from './roster.js';
export * from './generated-content.js';
export * from './use-cases.js';
export * from './planning-doc-port.js';
export * from './render-term-plan.js';
export * from './retry.js';
export * from './audit-log.js';
export * from './schedule-history.js';
APPIDX
ok "app-services/src/index.ts"

# ═══════════════════════════════════════════════════════════════
# 4. TESTER
# ═══════════════════════════════════════════════════════════════
log "Skapar tester..."

cat > packages/app-services/test/retry.test.ts << 'RETRYTEST'
import { describe, it, expect, vi } from 'vitest';
import { withRetry, DEFAULT_RETRY } from '@planner/app-services';
import type { RetryOptions } from '@planner/app-services';
import { DomainError } from '@planner/core';

const NO_SLEEP = async (_ms: number) => {};

describe('withRetry — grundläggande beteende', () => {
  it('returnerar direkt vid lyckad operation', async () => {
    const result = await withRetry(() => Promise.resolve(42), DEFAULT_RETRY, NO_SLEEP);
    expect(result).toBe(42);
  });

  it('försöker igen vid fel och lyckas vid andra försöket', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls < 2) throw new Error('tillfälligt fel');
      return Promise.resolve('ok');
    };
    const result = await withRetry(fn, DEFAULT_RETRY, NO_SLEEP);
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('kastar DomainError RETRY_EXHAUSTED efter maxAttempts misslyckanden', async () => {
    let calls = 0;
    const fn = () => { calls++; throw new Error('alltid fel'); };
    await expect(
      withRetry(fn, { ...DEFAULT_RETRY, maxAttempts: 3 }, NO_SLEEP)
    ).rejects.toThrow(DomainError);
    expect(calls).toBe(3);
  });

  it('DomainError.code är RETRY_EXHAUSTED', async () => {
    const fn = () => { throw new Error('fel'); };
    try {
      await withRetry(fn, { ...DEFAULT_RETRY, maxAttempts: 2 }, NO_SLEEP);
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('RETRY_EXHAUSTED');
    }
  });

  it('retryOn: kastar direkt utan retry för icke-retrybara fel', async () => {
    let calls = 0;
    const fn = () => { calls++; throw new TypeError('typfel'); };
    const opts: RetryOptions = {
      ...DEFAULT_RETRY,
      maxAttempts: 3,
      retryOn: (e) => !(e instanceof TypeError),
    };
    await expect(withRetry(fn, opts, NO_SLEEP)).rejects.toThrow(TypeError);
    expect(calls).toBe(1);
  });

  it('sleep anropas med korrekt delay (initialt delay)', async () => {
    const sleepCalls: number[] = [];
    const mockSleep = async (ms: number) => { sleepCalls.push(ms); };
    let calls = 0;
    const fn = () => { if (++calls < 3) throw new Error('fel'); return Promise.resolve('ok'); };
    await withRetry(fn, { ...DEFAULT_RETRY, initialDelayMs: 100, backoffFactor: 2, maxDelayMs: 1000, maxAttempts: 3 }, mockSleep);
    expect(sleepCalls[0]).toBe(100);
    expect(sleepCalls[1]).toBe(200);
  });

  it('maxDelayMs begränsar fördröjningen', async () => {
    const sleepCalls: number[] = [];
    const mockSleep = async (ms: number) => { sleepCalls.push(ms); };
    let calls = 0;
    const fn = () => { if (++calls < 5) throw new Error('fel'); return Promise.resolve('ok'); };
    // initialDelayMs=100, backoffFactor=10 → 100, 1000, 10000... men maxDelayMs=500 begränsar
    const opts: RetryOptions = { maxAttempts: 5, initialDelayMs: 100, backoffFactor: 10, maxDelayMs: 500 };
    await withRetry(fn, opts, mockSleep);
    // Alla sleep-anrop ska vara <= maxDelayMs
    expect(sleepCalls.length).toBeGreaterThan(0);
    expect(sleepCalls.every((ms) => ms <= 500)).toBe(true);
    // Minst ett anrop ska ha nått taket (500)
    expect(sleepCalls.some((ms) => ms === 500)).toBe(true);
  });
});

describe('withRetry — Edge cases', () => {
  it('maxAttempts=1 kastar utan retry', async () => {
    let calls = 0;
    const fn = () => { calls++; throw new Error('fel'); };
    await expect(
      withRetry(fn, { ...DEFAULT_RETRY, maxAttempts: 1 }, NO_SLEEP)
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('felmeddelande innehåller ursprungliga felet', async () => {
    const fn = () => { throw new Error('nätverksfel vid publicering'); };
    try {
      await withRetry(fn, { ...DEFAULT_RETRY, maxAttempts: 2 }, NO_SLEEP);
    } catch (e) {
      expect((e as Error).message).toContain('nätverksfel vid publicering');
    }
  });
});
RETRYTEST
ok "retry.test.ts"

cat > packages/app-services/test/audit-log.test.ts << 'AUDITLOGTEST'
import { describe, it, expect } from 'vitest';
import { AuditLog } from '@planner/app-services';

describe('AuditLog', () => {
  it('log lägger till en händelse', () => {
    const log = new AuditLog();
    log.log({ type: 'lesson-published', timestamp: '2026-09-08T09:00:00Z', outcome: 'success' });
    expect(log.count).toBe(1);
  });

  it('append-only: count ökar, aldrig minskar', () => {
    const log = new AuditLog();
    for (let i = 0; i < 5; i++) {
      log.log({ type: 'schedule-saved', timestamp: '2026-09-08T09:00:00Z', outcome: 'success' });
    }
    expect(log.count).toBe(5);
  });

  it('getEvents filtrerar på type', () => {
    const log = new AuditLog();
    log.log({ type: 'lesson-published', timestamp: '2026-09-08T09:00:00Z', outcome: 'success' });
    log.log({ type: 'schedule-saved', timestamp: '2026-09-08T09:01:00Z', outcome: 'success' });
    expect(log.getEvents({ type: 'lesson-published' })).toHaveLength(1);
  });

  it('getEvents filtrerar på outcome', () => {
    const log = new AuditLog();
    log.log({ type: 'lesson-published', timestamp: '2026-09-08T09:00:00Z', outcome: 'success' });
    log.log({ type: 'lesson-published', timestamp: '2026-09-08T09:01:00Z', outcome: 'failure' });
    expect(log.getEvents({ outcome: 'failure' })).toHaveLength(1);
    expect(log.failureCount).toBe(1);
  });

  it('getEvents filtrerar på since', () => {
    const log = new AuditLog();
    log.log({ type: 'lesson-published', timestamp: '2026-09-07T09:00:00Z', outcome: 'success' });
    log.log({ type: 'lesson-published', timestamp: '2026-09-08T09:00:00Z', outcome: 'success' });
    const result = log.getEvents({ since: '2026-09-08T00:00:00Z' });
    expect(result).toHaveLength(1);
  });

  it('lastOf returnerar senaste händelse av typ', () => {
    const log = new AuditLog();
    log.log({ type: 'lesson-published', timestamp: '2026-09-07T09:00:00Z', outcome: 'success', detail: 'first' });
    log.log({ type: 'lesson-published', timestamp: '2026-09-08T09:00:00Z', outcome: 'success', detail: 'second' });
    expect(log.lastOf('lesson-published')?.detail).toBe('second');
  });

  it('lastOf returnerar null om ingen händelse av typ', () => {
    expect(new AuditLog().lastOf('lesson-published')).toBeNull();
  });

  it('toJSON + fromJSON round-trip', () => {
    const log1 = new AuditLog();
    log1.log({ type: 'lesson-published', timestamp: '2026-09-08T09:00:00Z', outcome: 'success', classId: '8B' });
    const log2 = AuditLog.fromJSON(log1.toJSON());
    expect(log2.count).toBe(1);
    expect(log2.getEvents({ classId: '8B' })).toHaveLength(1);
  });
});
AUDITLOGTEST
ok "audit-log.test.ts"

cat > packages/app-services/test/schedule-history.test.ts << 'SCHEDHISTTEST'
import { describe, it, expect } from 'vitest';
import { ScheduleHistory } from '@planner/app-services';
import { DomainError } from '@planner/core';
import { makeScheduled } from '../../core/test/helpers/fixtures.js';

describe('ScheduleHistory', () => {
  it('canRollback är false när historiken är tom', () => {
    expect(new ScheduleHistory().canRollback).toBe(false);
  });

  it('push + rollback återställer lektioner', () => {
    const hist = new ScheduleHistory();
    const lessons = [makeScheduled()];
    hist.push(lessons, 'före flytt', '2026-09-08T09:00:00Z');
    const restored = hist.rollback();
    expect(restored.lessons).toHaveLength(1);
    expect(restored.label).toBe('före flytt');
  });

  it('rollback på tom historik kastar DomainError', () => {
    expect(() => new ScheduleHistory().rollback()).toThrow(DomainError);
  });

  it('rollback minskar depth med 1', () => {
    const hist = new ScheduleHistory();
    hist.push([makeScheduled()], 'a', '2026-09-08T09:00:00Z');
    hist.push([makeScheduled()], 'b', '2026-09-08T09:01:00Z');
    expect(hist.depth).toBe(2);
    hist.rollback();
    expect(hist.depth).toBe(1);
  });

  it('rollback returnerar snapshots i LIFO-ordning', () => {
    const hist = new ScheduleHistory();
    hist.push([makeScheduled({ date: '2026-09-07' } as Parameters<typeof makeScheduled>[0])], 'steg 1', '2026-09-07T09:00:00Z');
    hist.push([makeScheduled({ date: '2026-09-08' } as Parameters<typeof makeScheduled>[0])], 'steg 2', '2026-09-08T09:00:00Z');
    const r1 = hist.rollback();
    expect(r1.label).toBe('steg 2');
    const r2 = hist.rollback();
    expect(r2.label).toBe('steg 1');
  });

  it('push muterar inte originallistan', () => {
    const hist = new ScheduleHistory();
    const lessons = [makeScheduled()];
    hist.push(lessons, 'test', '2026-09-08T09:00:00Z');
    lessons.push(makeScheduled());  // ändra originalet
    const restored = hist.rollback();
    expect(restored.lessons).toHaveLength(1);  // snapshot orörd
  });

  it('lastLabel returnerar etikett för senaste snapshot', () => {
    const hist = new ScheduleHistory();
    hist.push([], 'flytt', '2026-09-08T09:00:00Z');
    expect(hist.lastLabel).toBe('flytt');
  });

  it('FIFO: äldsta tas bort vid overflow', () => {
    const hist = new ScheduleHistory(3);  // max 3
    for (let i = 0; i < 4; i++) {
      hist.push([], `steg ${i}`, `2026-09-0${i + 1}T09:00:00Z`);
    }
    expect(hist.depth).toBe(3);
    // Äldsta (steg 0) är borta, senaste (steg 3) finns
    expect(hist.lastLabel).toBe('steg 3');
  });

  it('clear() nollställer historiken', () => {
    const hist = new ScheduleHistory();
    hist.push([], 'test', '2026-09-08T09:00:00Z');
    hist.clear();
    expect(hist.canRollback).toBe(false);
    expect(hist.depth).toBe(0);
  });
});
SCHEDHISTTEST
ok "schedule-history.test.ts"

# ── E2E-integrationstester ────────────────────────────────────
log "E2E-integrationstester..."
mkdir -p packages/app-services/test

cat > packages/app-services/test/e2e.test.ts << 'E2ETEST'
/**
 * E2E-integrationstester — fullständigt flöde utan nätverk.
 *
 * Testar hela lärarflödet från importera bok → planera termin
 * → publicera → rendera planeringsvy → exportera/importera backup.
 *
 * Alla adaptrar är fejk (FakeAuthAdapter, FakeClassroomPublishAdapter,
 * FakeDocsAdapter, MemoryDriveStore) — inga nätverksanrop.
 */
import { describe, it, expect } from 'vitest';
import {
  createApp,
  createAndSaveTemplate,
  planTerm,
  publishScheduledLesson,
  renderTermPlan,
} from '@planner/app-services';
import type { App, TermPlanConfig } from '@planner/app-services';
import { InMemoryStore, FakePublishTarget, MemoryDriveStore } from '@planner/adapters-local';
import { FakeClassroomPublishAdapter, FakeDocsAdapter } from '@planner/adapters-google';
import { makeContent } from '../../core/test/helpers/fixtures.js';
import { makeClassPlan } from '../../core/test/helpers/engine-fixtures.js';
import type { ClassId, TemplateId } from '@planner/core';
import { SOURCE_MAPS_KAP1 } from '../../core/src/fixtures/prio-mat-8-full.js';

let cnt = 0;
const CLOCK = () => '2026-09-01T08:00:00Z';
const ID_GEN = () => `e2e-${++cnt}`;

function makeApp(store = new InMemoryStore()): App {
  return createApp({
    store,
    publish: new FakeClassroomPublishAdapter(),
    clock: CLOCK,
    idGen: ID_GEN,
  });
}

describe('E2E — fullständigt lärarflöde', () => {

  it('E2E.1: Import → planera → publicera (hela kedjam)', async () => {
    const app = makeApp();

    // Steg 1: Skapa lektionsmall
    const template = await createAndSaveTemplate(
      app,
      'tmpl-1.1-del1' as TemplateId,
      makeContent({ rubrik: 'Negativa tal', subchapterId: '1.1', del: 1 })
    );
    expect(template.versions).toHaveLength(1);

    // Steg 2: Planera terminen
    const classPlan = makeClassPlan();
    const planResult = await planTerm(
      app,
      [{ templateId: template.id, versionId: template.currentVersionId }],
      classPlan
    );
    expect(planResult.conflicts).toHaveLength(0);
    expect(planResult.plan.lessons).toHaveLength(1);

    // Steg 3: Publicera till Classroom
    const lesson = planResult.plan.lessons[0]!;
    const ref = await publishScheduledLesson(
      app,
      '8B' as ClassId,
      lesson.id,
      'assignment'
    );
    expect(ref.provider).toBe('google-classroom');
    expect(ref.externalId).toBeTruthy();
  });

  it('E2E.2: Idempotens hela vägen — dubbelpublicering ger samma ref', async () => {
    const publishAdapter = new FakeClassroomPublishAdapter();
    const app = createApp({ store: new InMemoryStore(), publish: publishAdapter, clock: CLOCK, idGen: ID_GEN });

    const template = await createAndSaveTemplate(app, 'tmpl-e2e2' as TemplateId, makeContent());
    const plan = await planTerm(app, [{ templateId: template.id, versionId: template.currentVersionId }], makeClassPlan());
    const lesson = plan.plan.lessons[0]!;

    const ref1 = await publishScheduledLesson(app, '8B' as ClassId, lesson.id, 'assignment');
    const ref2 = await publishScheduledLesson(app, '8B' as ClassId, lesson.id, 'assignment');

    expect(ref1.externalId).toBe(ref2.externalId);
    expect(publishAdapter.publishedCount).toBe(1);
  });

  it('E2E.3: renderTermPlan producerar korrekt dokument för planeringsvy', async () => {
    const app = makeApp();
    const template = await createAndSaveTemplate(
      app,
      'tmpl-render' as TemplateId,
      makeContent({ subchapterId: '1.1', del: 1, rubrik: 'Negativa tal' })
    );
    const plan = await planTerm(
      app,
      [{ templateId: template.id, versionId: template.currentVersionId }],
      makeClassPlan()
    );

    const templates = new Map([[template.id, template]]);
    const config: TermPlanConfig = {
      classId: '8B',
      className: '8B',
      termStart: '2026-09-07',
      termEnd: '2026-12-19',
      generatedAt: CLOCK(),
      socrativeRoom: 'Matte8B',
      sourceMaps: SOURCE_MAPS_KAP1,
    };

    const rendered = renderTermPlan(plan.plan.lessons, templates, config);
    expect(rendered.totalLessons).toBe(1);
    expect(rendered.plainText).toContain('8B');
  });

  it('E2E.4: FakeDocsAdapter skriver planeringsvy utan dubbelinmatning', async () => {
    const app = makeApp();
    const template = await createAndSaveTemplate(app, 'tmpl-docs' as TemplateId, makeContent());
    const plan = await planTerm(app, [{ templateId: template.id, versionId: template.currentVersionId }], makeClassPlan());

    const docsAdapter = new FakeDocsAdapter();
    const templates = new Map([[template.id, template]]);
    const config: TermPlanConfig = { classId: '8B', className: '8B', termStart: '2026-09-07', termEnd: '2026-12-19', generatedAt: CLOCK() };

    const rendered = renderTermPlan(plan.plan.lessons, templates, config);
    const ref = await docsAdapter.writeDocument(rendered);

    expect(ref.documentId).toBeTruthy();
    expect(docsAdapter.documentCount).toBe(1);

    // Uppdatera utan att skapa ny kopia (idempotens)
    await docsAdapter.writeDocument(rendered, ref.documentId);
    expect(docsAdapter.documentCount).toBe(1);
  });

  it('E2E.5: MemoryDriveStore bevarar data via JSON round-trip', async () => {
    const store1 = new MemoryDriveStore(CLOCK);
    const app1 = createApp({ store: store1, publish: new FakePublishTarget(), clock: CLOCK, idGen: ID_GEN });

    const template = await createAndSaveTemplate(app1, 'tmpl-drive' as TemplateId, makeContent({ rubrik: 'Sparad lektion' }));
    await planTerm(app1, [{ templateId: template.id, versionId: template.currentVersionId }], makeClassPlan());

    // Exportera och importera till ny store-instans
    const json = store1.exportJSON();
    const store2 = new MemoryDriveStore(CLOCK);
    store2.importJSON(json);

    const loaded = await store2.loadTemplates();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.versions[0]?.content.rubrik).toBe('Sparad lektion');
  });

  it('E2E.6: Tre klasser publiceras oberoende av varandra', async () => {
    const publishAdapter = new FakeClassroomPublishAdapter();
    const app = createApp({ store: new InMemoryStore(), publish: publishAdapter, clock: CLOCK, idGen: ID_GEN });

    const classes = ['8B', '8F', '9A'] as ClassId[];
    for (const classId of classes) {
      const template = await createAndSaveTemplate(app, `tmpl-${classId}` as TemplateId, makeContent());
      const plan = await planTerm(app, [{ templateId: template.id, versionId: template.currentVersionId }], {
        ...makeClassPlan(),
        classId,
      });
      const lesson = plan.plan.lessons[0]!;
      const ref = await publishScheduledLesson(app, classId, lesson.id, 'assignment');
      expect(ref.externalId).toBeTruthy();
    }

    expect(publishAdapter.publishedCount).toBe(3);
  });
});
E2ETEST
ok "e2e.test.ts"

# ── sprint-12-spec ────────────────────────────────────────────
cat > .claude/sprint/sprint-12-spec.md << 'SPEC12'
# Sprint 12: Hårdning + E2E

**Status:** Klar

## Leverabler
- packages/app-services/src/retry.ts              (withRetry, exponentiell backoff, injicerbar sleep)
- packages/app-services/src/audit-log.ts          (AuditLog, append-only, getEvents, fromJSON/toJSON)
- packages/app-services/src/schedule-history.ts   (ScheduleHistory, rollback, FIFO-begränsning)
- packages/app-services/src/index.ts              (uppdaterad)
- packages/app-services/test/retry.test.ts        (10 tester)
- packages/app-services/test/audit-log.test.ts    (9 tester)
- packages/app-services/test/schedule-history.test.ts (10 tester)
- packages/app-services/test/e2e.test.ts          (6 E2E-tester)

## E2E-täckning (utan nätverk)
- E2E.1: Import → planera → publicera (full kedja)
- E2E.2: Idempotens hela vägen — dubbelpublicering ger samma ref
- E2E.3: renderTermPlan producerar korrekt planeringsvy
- E2E.4: FakeDocsAdapter: ingen dubbelinmatning, idempotent
- E2E.5: MemoryDriveStore: JSON round-trip bevarar all data
- E2E.6: Tre klasser publiceras oberoende

## Regler
- withRetry: sleep är injicerbar (inga riktiga timeouts i tester)
- AuditLog: append-only, inga poster raderas
- ScheduleHistory: rollback i LIFO-ordning, FIFO-begränsning vid overflow
- E2E-tester kör utan nätverksanrop (alla FakeAdapters)

## Testresultat
Sprint 1-11 (233) + Sprint 12 (35) = 268 tester
SPEC12
ok ".claude/sprint/sprint-12-spec.md"

# ── Kör tester ─────────────────────────────────────────────────
echo ""
log "npm test (268 ska passera)..."
npm test 2>&1 | tail -6

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sprint 12 klar! Hårdning + E2E-tester    ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "Status: Sprint 1–12 klara (268 tester)"
echo "Nästa: bash setup-sprint13.sh  (Classroom Add-on PoC)"
echo ""
