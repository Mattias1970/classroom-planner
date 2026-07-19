/**
 * SuperTeach — localStorage-adapter (Ring 2).
 * Implementerar EvidenceStore-porten. Egen nyckel — rör aldrig
 * planerarens befintliga localStorage-data.
 */
import type { EvidenceStore } from './superteachCore.js';
import { parseEvidenceFile, serializeEvidence, type SuperTeachEvidence } from './superteachCore.js';

const STORAGE_KEY = 'classroom-planner.superteach.evidence.v1';

export class LocalStorageEvidenceStore implements EvidenceStore {
  async loadAll(): Promise<SuperTeachEvidence[]> {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return parseEvidenceFile(raw);
    } catch {
      // Trasig data ska aldrig krascha appen — börja om tomt.
      return [];
    }
  }
  async saveAll(evidence: SuperTeachEvidence[]): Promise<void> {
    globalThis.localStorage?.setItem(STORAGE_KEY, serializeEvidence(evidence));
  }
}
