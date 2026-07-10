import { describe, it, expect } from 'vitest';
import {
  createDocument,
  migrateDocument,
  prepareForSave,
  roundTrip,
  ValidationError,
  SchemaVersionError,
  CURRENT_SCHEMA_VERSION,
} from '@planner/core';
import type { Clock, PlannerDocumentV1 } from '@planner/core';

const TEST_CLOCK: Clock = () => '2026-07-09T12:00:00Z';
const LATER_CLOCK: Clock = () => '2026-07-09T13:00:00Z';

describe('C.12-1 — Round-trip bevarar schemaVersion', () => {
  it('schemaVersion är 1 efter round-trip', () => {
    const doc = createDocument('1.0.0', TEST_CLOCK);
    const json = JSON.stringify(doc);
    const result = roundTrip(json, LATER_CLOCK);
    expect(result.loaded.schemaVersion).toBe(1);
    expect(result.saved.schemaVersion).toBe(1);
    expect((JSON.parse(result.serialized) as PlannerDocumentV1).schemaVersion).toBe(1);
  });
});

describe('C.12-2 — Nyare schemaVersion ger SchemaVersionError', () => {
  it('schemaVersion 999 kastar SchemaVersionError', () => {
    const raw = { schemaVersion: 999, appVersion: '1.0.0', createdAt: '2026-07-09T12:00:00Z', updatedAt: '' };
    expect(() => migrateDocument(raw)).toThrow(SchemaVersionError);
  });

  it('SchemaVersionError innehåller rätt versions-info', () => {
    const raw = { schemaVersion: 999, appVersion: '1.0.0', createdAt: '2026-07-09T12:00:00Z', updatedAt: '' };
    try {
      migrateDocument(raw);
      expect.fail('Ska kasta SchemaVersionError');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaVersionError);
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as SchemaVersionError).documentVersion).toBe(999);
      expect((e as SchemaVersionError).supportedVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
  });
});

describe('C.12-3 — v1→v1 identitetsmigrering är no-op', () => {
  it('migreringsresultat har exakt samma fältvärden', () => {
    const doc = createDocument('1.0.0', TEST_CLOCK);
    const migrated = migrateDocument(JSON.parse(JSON.stringify(doc)));
    expect(migrated.schemaVersion).toBe(doc.schemaVersion);
    expect(migrated.appVersion).toBe(doc.appVersion);
    expect(migrated.createdAt).toBe(doc.createdAt);
  });

  it('migrering lägger inte till extra fält', () => {
    const doc = createDocument('1.0.0', TEST_CLOCK);
    const migrated = migrateDocument(JSON.parse(JSON.stringify(doc)));
    expect(Object.keys(migrated).sort()).toEqual(Object.keys(doc).sort());
  });
});

describe('C.12-4 — updatedAt sätts vid save, original ej muterat', () => {
  it('prepareForSave returnerar nytt dokument med uppdaterad updatedAt', () => {
    const doc = createDocument('1.0.0', TEST_CLOCK);
    const saved = prepareForSave(doc, LATER_CLOCK);
    expect(saved.updatedAt).toBe('2026-07-09T13:00:00Z');
  });

  it('createdAt bevaras oförändrad efter save', () => {
    const doc = createDocument('1.0.0', TEST_CLOCK);
    const saved = prepareForSave(doc, LATER_CLOCK);
    expect(saved.createdAt).toBe('2026-07-09T12:00:00Z');
  });

  it('originaldokumentet muteras inte av prepareForSave', () => {
    const doc = createDocument('1.0.0', TEST_CLOCK);
    const originalUpdatedAt = doc.updatedAt;
    prepareForSave(doc, LATER_CLOCK);
    expect(doc.updatedAt).toBe(originalUpdatedAt);
  });
});

describe('migrateDocument — valideringsfel för ogiltiga indata', () => {
  it('null → ValidationError', () => { expect(() => migrateDocument(null)).toThrow(ValidationError); });
  it('sträng → ValidationError', () => { expect(() => migrateDocument('en sträng')).toThrow(ValidationError); });
  it('array → ValidationError', () => { expect(() => migrateDocument([])).toThrow(ValidationError); });
  it('tomt objekt → ValidationError', () => { expect(() => migrateDocument({})).toThrow(ValidationError); });
  it('schemaVersion: 0 → ValidationError', () => { expect(() => migrateDocument({ schemaVersion: 0 })).toThrow(ValidationError); });
  it('schemaVersion: -1 → ValidationError', () => { expect(() => migrateDocument({ schemaVersion: -1 })).toThrow(ValidationError); });
  it('schemaVersion: 1.5 → ValidationError', () => { expect(() => migrateDocument({ schemaVersion: 1.5 })).toThrow(ValidationError); });
  it('saknar appVersion → ValidationError', () => { expect(() => migrateDocument({ schemaVersion: 1 })).toThrow(ValidationError); });
  it('tom appVersion → ValidationError', () => { expect(() => migrateDocument({ schemaVersion: 1, appVersion: '' })).toThrow(ValidationError); });
  it('tom createdAt → ValidationError', () => { expect(() => migrateDocument({ schemaVersion: 1, appVersion: '1.0.0', createdAt: '' })).toThrow(ValidationError); });
});

describe('roundTrip — ogiltig JSON', () => {
  it('ogiltig JSON-sträng → ValidationError', () => {
    expect(() => roundTrip('inte json {{{', TEST_CLOCK)).toThrow(ValidationError);
  });
});
