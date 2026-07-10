import { ValidationError, SchemaVersionError } from './errors.js';

/** ISO 8601-sträng, t.ex. "2026-07-09T12:00:00Z" */
export type Iso8601 = string;

/**
 * Injicerbar klocka för testbar tid.
 * Produktion: () => new Date().toISOString()
 * Tester:     () => "2026-01-15T10:00:00Z"
 */
export type Clock = () => Iso8601;

/** Aktuell schemaVersion som denna kodversion stödjer. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * PlannerDocument är kuvertet runt ALL data i systemet.
 * SchemaVersion styr migrering och bakåtkompatibilitet.
 *
 * I Sprint 1 innehåller kuvertet bara metadata.
 * Domäntyper (lektioner, klasser, böcker) läggs till i Sprint 2+,
 * men versioneringsmekanismen etableras här från dag ett.
 */
export interface PlannerDocumentV1 {
  readonly schemaVersion: 1;
  readonly appVersion: string;
  readonly createdAt: Iso8601;
  updatedAt: Iso8601;
}

/**
 * Skapar ett nytt tomt PlannerDocument med schemaVersion 1.
 * Tid injiceras via `clock` för testbarhet.
 */
export function createDocument(appVersion: string, clock: Clock): PlannerDocumentV1 {
  const now = clock();
  return {
    schemaVersion: 1,
    appVersion,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Validerar och migrerar ett laddat dokument.
 * Tar `unknown` — validerar ALLT innan typning.
 */
export function migrateDocument(raw: unknown): PlannerDocumentV1 {
  if (raw === null || raw === undefined) {
    throw new ValidationError('Dokumentet är null eller undefined.');
  }
  if (typeof raw !== 'object') {
    throw new ValidationError(`Dokumentet måste vara ett objekt, fick: ${typeof raw}.`);
  }
  if (Array.isArray(raw)) {
    throw new ValidationError('Dokumentet får inte vara en array.');
  }

  const doc = raw as Record<string, unknown>;

  if (!('schemaVersion' in doc)) {
    throw new ValidationError('schemaVersion saknas i dokumentet.', 'schemaVersion');
  }

  const sv = doc['schemaVersion'];
  if (typeof sv !== 'number') {
    throw new ValidationError(
      `schemaVersion måste vara ett nummer, fick: ${typeof sv}.`,
      'schemaVersion'
    );
  }
  if (!Number.isInteger(sv) || sv < 1) {
    throw new ValidationError(
      `schemaVersion måste vara ett positivt heltal (>= 1), fick: ${sv}.`,
      'schemaVersion'
    );
  }
  if (sv > CURRENT_SCHEMA_VERSION) {
    throw new SchemaVersionError(sv, CURRENT_SCHEMA_VERSION);
  }

  if (!('appVersion' in doc) || typeof doc['appVersion'] !== 'string' || doc['appVersion'] === '') {
    throw new ValidationError('appVersion saknas eller är tom.', 'appVersion');
  }

  if (!('createdAt' in doc) || typeof doc['createdAt'] !== 'string' || doc['createdAt'] === '') {
    throw new ValidationError('createdAt saknas eller är tom.', 'createdAt');
  }

  const updatedAt =
    'updatedAt' in doc && typeof doc['updatedAt'] === 'string'
      ? doc['updatedAt']
      : doc['createdAt'] as string;

  return {
    schemaVersion: 1,
    appVersion: doc['appVersion'] as string,
    createdAt: doc['createdAt'] as string,
    updatedAt,
  };
}

/**
 * Förbereder ett dokument för sparning genom att sätta updatedAt.
 * Returnerar ALLTID en ny kopia — muterar aldrig originalet.
 */
export function prepareForSave(doc: PlannerDocumentV1, clock: Clock): PlannerDocumentV1 {
  return {
    ...doc,
    updatedAt: clock(),
  };
}

/**
 * Fullständig round-trip: deserialisera → validera/migrera → spara.
 */
export function roundTrip(
  serialized: string,
  clock: Clock
): { loaded: PlannerDocumentV1; saved: PlannerDocumentV1; serialized: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ValidationError(
      'Dokumentet är inte giltig JSON. Det kan ha blivit korrupt vid lagring.',
      'serialized'
    );
  }

  const loaded = migrateDocument(parsed);
  const saved = prepareForSave(loaded, clock);

  return {
    loaded,
    saved,
    serialized: JSON.stringify(saved),
  };
}
