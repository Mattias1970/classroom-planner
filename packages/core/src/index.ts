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
