import { describe, it, expect } from 'vitest';
import {
  DomainError,
  ValidationError,
  SchemaVersionError,
  createDocument,
  CURRENT_SCHEMA_VERSION,
} from '@planner/core';

describe('Smoke — grundläggande importer och typer', () => {
  it('DomainError är en instans av Error', () => {
    const err = new DomainError('TEST', 'testmeddelande');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TEST');
    expect(err.message).toBe('testmeddelande');
  });

  it('ValidationError är en instans av DomainError', () => {
    const err = new ValidationError('ogiltigt värde', 'fältnamn');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
    expect(err.field).toBe('fältnamn');
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('SchemaVersionError är en instans av ValidationError och DomainError', () => {
    const err = new SchemaVersionError(5, 1);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
    expect(err.documentVersion).toBe(5);
    expect(err.supportedVersion).toBe(1);
  });

  it('createDocument returnerar schemaVersion === CURRENT_SCHEMA_VERSION', () => {
    const doc = createDocument('1.0.0', () => '2026-07-09T12:00:00Z');
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('CURRENT_SCHEMA_VERSION är 1', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});
