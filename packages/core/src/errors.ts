/**
 * Basfel för alla domänfel i planeringssystemet.
 * Alla specifika feltyper ärver från denna klass.
 *
 * @example
 * throw new DomainError('NOT_FOUND', 'Lektionen hittades inte');
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    // Krävs för korrekt instanceof-kontroll i TypeScript/transpilerad kod
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Valideringsfel — kastas vid ogiltiga data eller invariantbrott.
 * Anger vilket fält som felade via det valfria `field`-attributet.
 *
 * @example
 * throw new ValidationError('schemaVersion måste vara ett positivt heltal', 'schemaVersion');
 */
export class ValidationError extends DomainError {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super('VALIDATION_ERROR', message);
    this.name = 'ValidationError';
    this.field = field;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Versionsfel — kastas när ett dokument har en schemaVersion
 * som är nyare än vad denna appversion stödjer.
 * Användaren behöver uppdatera appen för att öppna dokumentet.
 */
export class SchemaVersionError extends ValidationError {
  readonly documentVersion: number;
  readonly supportedVersion: number;

  constructor(documentVersion: number, supportedVersion: number) {
    super(
      `Dokumentet har schemaVersion ${documentVersion} men denna app stödjer max version ${supportedVersion}. Uppdatera appen.`,
      'schemaVersion'
    );
    this.name = 'SchemaVersionError';
    this.documentVersion = documentVersion;
    this.supportedVersion = supportedVersion;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
