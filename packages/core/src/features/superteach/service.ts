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
