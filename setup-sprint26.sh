#!/usr/bin/env bash
# classroom-planner — setup-sprint26.sh
#
# Sprint 26: SuperTeach service + lagringsport (Ring 1.5/2)
# - EvidenceStore-port (implementeras av valfri adapter)
# - MemoryEvidenceStore + JSON-serialisering (classroom-planner-data-kompatibel)
# - Service: record (idempotent), approve, remove, summarize, export/import
#
# Kör i projektroten:
#   bash setup-sprint26.sh
#   npm test
#
# MODULARITET: skriptet skapar ENDAST nya filer i egna kataloger.
# Inga befintliga filer ändras — befintliga funktioner påverkas inte.

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Classroom Planner — Sprint 26: SuperTeach service (1.5/2) ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/core/package.json" ]; then
  echo "❌  Kör skriptet i projektroten (packages/core saknas)."
  exit 1
fi
if [ ! -f "packages/core/src/features/superteach/types.ts" ]; then
  echo "❌  Sprint 25 krävs. Kör setup-sprint25.sh först."
  exit 1
fi
ok "Sprint 25 hittad"

log "packages/core/src/features/superteach/service.ts..."
cat > packages/core/src/features/superteach/service.ts << 'ST26_SVC'
/**
 * SuperTeach — app-service och lagringsport (Ring 1.5 + portdefinition för Ring 2).
 *
 * Lagring sker via porten EvidenceStore. Två implementationer följer med:
 *  - MemoryEvidenceStore  (tester, dev)
 *  - JSON-serialisering   (för classroom-planner-data-repots JSON-filer
 *                          eller localStorage i webben — adaptern väljer själv)
 *
 * Ingen import från övriga core-moduler → helt fristående funktion.
 */
import { buildStudentSummary, usableEvidence } from './logic.js';
import {
  DEFAULT_SUPERTEACH_CONFIG,
  type StudentSummary,
  type SuperTeachConfig,
  type SuperTeachEvidence,
} from './types.js';

// ── Port (implementeras i Ring 2) ─────────────────────────────
export interface EvidenceStore {
  loadAll(): Promise<SuperTeachEvidence[]>;
  saveAll(evidence: SuperTeachEvidence[]): Promise<void>;
}

// ── Referensimplementation i minne ────────────────────────────
export class MemoryEvidenceStore implements EvidenceStore {
  private items: SuperTeachEvidence[] = [];
  async loadAll(): Promise<SuperTeachEvidence[]> {
    return [...this.items];
  }
  async saveAll(evidence: SuperTeachEvidence[]): Promise<void> {
    this.items = [...evidence];
  }
}

// ── JSON-serialisering (för fil-/localStorage-adaptrar) ───────
export interface SuperTeachDataFile {
  schema: 'superteach-evidence';
  version: 1;
  evidence: SuperTeachEvidence[];
}

export function serializeEvidence(evidence: SuperTeachEvidence[]): string {
  const file: SuperTeachDataFile = { schema: 'superteach-evidence', version: 1, evidence };
  return JSON.stringify(file, null, 2);
}

export class SuperTeachParseError extends Error {}

export function parseEvidenceFile(json: string): SuperTeachEvidence[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SuperTeachParseError('Ogiltig JSON i evidensfil.');
  }
  const file = raw as Partial<SuperTeachDataFile>;
  if (file?.schema !== 'superteach-evidence' || !Array.isArray(file.evidence)) {
    throw new SuperTeachParseError('Filen är inte en superteach-evidence-fil (v1).');
  }
  for (const e of file.evidence) {
    if (!e.id || !e.studentKey || !e.subject || !e.source || !e.collectedAt) {
      throw new SuperTeachParseError(`Evidens saknar obligatoriska fält (id=${String(e.id)}).`);
    }
  }
  return file.evidence;
}

// ── Service ───────────────────────────────────────────────────
export class SuperTeachService {
  constructor(
    private readonly store: EvidenceStore,
    private readonly config: SuperTeachConfig = DEFAULT_SUPERTEACH_CONFIG,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Lägger till evidens. Idempotent på id — samma id ersätter befintlig post. */
  async record(evidence: SuperTeachEvidence): Promise<void> {
    const all = await this.store.loadAll();
    const next = all.filter((e) => e.id !== evidence.id);
    next.push(evidence);
    await this.store.saveAll(next);
  }

  /** Markerar AI-evidens som lärargranskad. Returnerar false om id saknas. */
  async approve(evidenceId: string): Promise<boolean> {
    const all = await this.store.loadAll();
    const target = all.find((e) => e.id === evidenceId);
    if (!target) return false;
    target.teacherReviewed = true;
    target.teacherApprovedAt = this.clock().toISOString();
    await this.store.saveAll(all);
    return true;
  }

  async remove(evidenceId: string): Promise<boolean> {
    const all = await this.store.loadAll();
    const next = all.filter((e) => e.id !== evidenceId);
    if (next.length === all.length) return false;
    await this.store.saveAll(next);
    return true;
  }

  async listForStudent(studentKey: string, subject?: string): Promise<SuperTeachEvidence[]> {
    const all = await this.store.loadAll();
    return all.filter(
      (e) => e.studentKey === studentKey && (subject === undefined || e.subject === subject),
    );
  }

  /** Antal AI-poster som väntar på lärargranskning (dashboardens "att granska"). */
  async pendingReviewCount(): Promise<number> {
    const all = await this.store.loadAll();
    const { excludedUnreviewedAi } = usableEvidence(all, this.config);
    return excludedUnreviewedAi;
  }

  async summarize(studentKey: string, subject: string): Promise<StudentSummary> {
    const all = await this.store.loadAll();
    return buildStudentSummary(studentKey, subject, all, this.clock(), this.config);
  }

  async exportJson(): Promise<string> {
    return serializeEvidence(await this.store.loadAll());
  }

  /** Importerar en JSON-fil; slår ihop på id (importen vinner). */
  async importJson(json: string): Promise<number> {
    const incoming = parseEvidenceFile(json);
    const all = await this.store.loadAll();
    const ids = new Set(incoming.map((e) => e.id));
    const merged = [...all.filter((e) => !ids.has(e.id)), ...incoming];
    await this.store.saveAll(merged);
    return incoming.length;
  }
}
ST26_SVC
ok "packages/core/src/features/superteach/service.ts"
log "packages/core/src/features/superteach/index.ts..."
cat > packages/core/src/features/superteach/index.ts << 'ST26_IDX'
/**
 * SuperTeach — publik yta för modulen.
 * Importeras via djup sökväg: '@planner/core/features/superteach'
 * eller re-exporteras (valfritt) från core/src/index.ts.
 */
export * from './types.js';
export * from './logic.js';
export * from './service.js';
ST26_IDX
ok "packages/core/src/features/superteach/index.ts"
log "packages/core/test/superteach/service.test.ts..."
cat > packages/core/test/superteach/service.test.ts << 'ST26_TEST'
import { describe, expect, it } from 'vitest';
import {
  MemoryEvidenceStore,
  SuperTeachParseError,
  SuperTeachService,
  parseEvidenceFile,
  serializeEvidence,
} from '../../src/features/superteach/service.js';
import type { SuperTeachEvidence } from '../../src/features/superteach/types.js';

const CLOCK = () => new Date('2026-07-19T12:00:00Z');

function ev(id: string, extra: Partial<SuperTeachEvidence> = {}): SuperTeachEvidence {
  return {
    id,
    studentKey: 'elev-1',
    subject: 'matematik',
    source: 'manual',
    dimensions: [{ dimension: 'begrepp', status: 'secure', confidence: 'high', evidenceText: 't' }],
    aiAssisted: false,
    teacherReviewed: true,
    collectedAt: '2026-07-10T08:00:00Z',
    ...extra,
  };
}

function makeService() {
  return new SuperTeachService(new MemoryEvidenceStore(), undefined, CLOCK);
}

describe('SuperTeachService', () => {
  it('record är idempotent på id', async () => {
    const s = makeService();
    await s.record(ev('a'));
    await s.record(ev('a', { subject: 'fysik' }));
    const list = await s.listForStudent('elev-1');
    expect(list).toHaveLength(1);
    expect(list[0]?.subject).toBe('fysik');
  });

  it('approve sätter granskning och tidsstämpel', async () => {
    const s = makeService();
    await s.record(ev('a', { aiAssisted: true, teacherReviewed: false }));
    expect(await s.pendingReviewCount()).toBe(1);
    expect(await s.approve('a')).toBe(true);
    expect(await s.pendingReviewCount()).toBe(0);
    const [item] = await s.listForStudent('elev-1');
    expect(item?.teacherApprovedAt).toBe(CLOCK().toISOString());
    expect(await s.approve('finns-inte')).toBe(false);
  });

  it('remove tar bort och rapporterar om inget fanns', async () => {
    const s = makeService();
    await s.record(ev('a'));
    expect(await s.remove('a')).toBe(true);
    expect(await s.remove('a')).toBe(false);
  });

  it('summarize använder lagrad evidens', async () => {
    const s = makeService();
    await s.record(ev('a'));
    const summary = await s.summarize('elev-1', 'matematik');
    expect(summary.dimensions[0]?.dimension).toBe('begrepp');
    expect(summary.dimensions[0]?.status).toBe('secure');
  });

  it('export/import går runt och slår ihop på id', async () => {
    const a = makeService();
    await a.record(ev('a'));
    await a.record(ev('b'));
    const json = await a.exportJson();

    const b = makeService();
    await b.record(ev('b', { subject: 'kemi' }));
    const imported = await b.importJson(json);
    expect(imported).toBe(2);
    const list = await b.listForStudent('elev-1');
    expect(list).toHaveLength(2);
    // importen vinner vid id-krock
    expect(list.find((e) => e.id === 'b')?.subject).toBe('matematik');
  });
});

describe('serialisering', () => {
  it('avvisar fel schema och trasig JSON', () => {
    expect(() => parseEvidenceFile('inte json')).toThrow(SuperTeachParseError);
    expect(() => parseEvidenceFile('{"schema":"nåt-annat"}')).toThrow(SuperTeachParseError);
    expect(() => parseEvidenceFile(JSON.stringify({ schema: 'superteach-evidence', version: 1, evidence: [{ id: 'x' }] }))).toThrow(SuperTeachParseError);
  });
  it('round-trip bevarar data', () => {
    const original = [ev('a')];
    expect(parseEvidenceFile(serializeEvidence(original))).toEqual(original);
  });
});
ST26_TEST
ok "packages/core/test/superteach/service.test.ts"

# Valfri barrel-export — läggs BARA till om index.ts finns och raden saknas.
if [ -f "packages/core/src/index.ts" ] && ! grep -q "features/superteach" packages/core/src/index.ts; then
  printf "\nexport * as superteach from './features/superteach/index.js';\n" >> packages/core/src/index.ts
  ok "Barrel-export tillagd i core/src/index.ts (namespace 'superteach')"
else
  ok "Barrel-export hoppas över (finns redan eller index saknas)"
fi

echo ""
ok "Sprint 26 klar — kör: npx vitest run packages/core/test/superteach"
