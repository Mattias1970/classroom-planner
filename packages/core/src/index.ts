/**
 * @planner/core — Ren domänkärna utan externa beroenden.
 *
 * Ring 1 i ringmodellen. Ingen Google-kod, inget nätverk,
 * inget DOM, ingen webblagring. Allt sådant hör till Ring 2 (adaptrar).
 */

// Felmodell
export { DomainError, ValidationError, SchemaVersionError } from './errors.js';

// Dokumentkuvert och versionering
export {
  type Iso8601,
  type Clock,
  type PlannerDocumentV1,
  CURRENT_SCHEMA_VERSION,
  createDocument,
  migrateDocument,
  prepareForSave,
  roundTrip,
} from './document.js';

export * as superteach from './features/superteach/index.js';

// Domäntyper (sprint 13-om)
export * from './domain/index.js';

// Ren logik (sprint 13-om)
export { createTemplate, saveNewVersion, getVersion, getCurrentVersion } from './logic/versioning.js';
export { validateTimeline, computeTimes, type TimelineValidation } from './logic/timeline.js';
export { buildFlip, type FlipMessage } from './logic/flip.js';
export { projectToIndex, search, type IndexRow, type SearchQuery } from './logic/search.js';

// Evidensviktning delas med SuperTeach-modulen
export { EVIDENCE_WEIGHTS, type EvidenceWeightEntry, type EvidenceWeight } from './features/superteach/types.js';

// LessonRecord + dataadapter (sprint 23/24-om)
export * from './records/lesson-record.js';
export * from './records/schedule.js';
export * from './adapters/subject-loader.js';
