#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# classroom-planner — setup.sh
#
# Kör detta i GitHub Codespaces terminalen:
#   bash setup.sh
#
# Scriptet skapar HELA projektet från grunden — inga externa filer
# eller nedladdningar behövs. Allt innehåll är inbakat i detta script.
#
# När scriptet är klart kör du:
#   npm install
#   npm test        ← ska visa 30/30 gröna tester
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${BLUE}▶${NC}  $1"; }
ok()   { echo -e "${GREEN}✅${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠️${NC}   $1"; }

echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Classroom Planner — Sprint 1 setup       ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

# ── Katalogstruktur ────────────────────────────────────────────
log "Skapar katalogstruktur..."
mkdir -p .claude/sprint
mkdir -p .claude/agents
mkdir -p packages/core/src/domain
mkdir -p packages/core/src/logic
mkdir -p packages/core/test
ok "Kataloger skapade"

# ═══════════════════════════════════════════════════════════════
# .gitignore
# ═══════════════════════════════════════════════════════════════
log "Skapar .gitignore..."
cat > .gitignore << 'GITIGNORE'
node_modules/
dist/
*.tsbuildinfo
.DS_Store
packages/core/src/__verify_*.ts
packages/core/src/__test_lint_*.ts
GITIGNORE
ok ".gitignore"

# ═══════════════════════════════════════════════════════════════
# CLAUDE.md — projektminnet som Claude Code läser varje session
# ═══════════════════════════════════════════════════════════════
log "Skapar CLAUDE.md..."
cat > CLAUDE.md << 'CLAUDEMD'
# Classroom Planner

TypeScript-monorepo. Strict mode. Vitest.

## Arkitektur — Ringmodell
- Ring 1 (`packages/core`): Ren domän. NOLL externa dependencies.
- Ring 1.5 (`packages/app-services`): Use cases, DI, Recipient. Senare sprint.
- Ring 2 (`packages/adapters-*`): Google, AI, Socrative, Magma, lokal lagring. Senare.
- Ring 3 (`packages/web`, `dashboards`): UI. Senare.

## Maskinkontrollerade invarianter
- **I1**: Core importerar ALDRIG från yttre ringar. Kontrolleras av ESLint.
- **I2**: Ingen fil i `packages/core/src` får innehålla: `google`, `fetch`, `window`, `document`, `localStorage`. Kontrolleras av ESLint.
- **I3**: LessonVersion append-only (Sprint 3+).
- **I4**: Publicering idempotent via ExternalRef (Sprint 9+).
- **I5**: Läroplan icke-blockerande.
- **I6**: AI utbytbar via config.
- **I7**: AI-bedömning = förslag tills lärargranskning.

## Kommandon
- Typecheck: `npx tsc --noEmit`
- Test: `npx vitest run`
- Lint: `npx eslint packages/core/src --max-warnings 0`
- Allt: `npm test` (lint + typecheck + vitest i sekvens)

## Konventioner
- Branded types: `type FooId = string & { readonly __b: 'FooId' }`
- `Iso8601 = string` (aldrig `Date`)
- Tester: Vitest med `describe`/`it`/`expect`
- Felklasser ärver från `DomainError` (aldrig `Error` direkt)
- Svenska domäntermer i typnamn (rubrik, mål, längdMin)
- Inga TODO-stubbar — allt som skrivs ska fungera
- Mutera aldrig indata — returnera kopior
- `Object.setPrototypeOf(this, new.target.prototype)` i alla Error-subklasser

## Sprint-status
- Sprint 1:  Projektgrund ✅
- Sprint 2:  Domäntyper (LessonContent, SourceRef, CurriculumPlanningNote)
- Sprint 3:  Ren kärnlogik (versionering, BAM, sök, flipp)
- Sprint 4:  Planeringsmotor
- Sprint 5:  App-services / use cases
- Sprint 6:  Lokal webbapp (B1–B36 paritet)
- Sprint 7:  Import av bokdata
- Sprint 8:  Google Auth + kurskoppling
- Sprint 9:  Classroom-publicering
- Sprint 10: Google Docs planeringsvy
- Sprint 11: DriveStore + migration
- Sprint 12: Hårdning + E2E
- Sprint 13: Classroom Add-on PoC
- Sprint 14: Forms ingest (SuperTeachEvidence)
- Sprint 15: Socrative/Magma ingest
- Sprint 16: SuperTeach dashboard
- Sprint 17: AI-port + default provider
- Sprint 18: AI för Forms-fritext
- Sprint 19: AI för Classroom-bilder
- Sprint 20: AI-router avancerad
- Sprint 21: Flerämnesstöd
- Sprint 22: SuperTeach + AI samverkan
CLAUDEMD
ok "CLAUDE.md"

# ═══════════════════════════════════════════════════════════════
# package.json (rot)
# ═══════════════════════════════════════════════════════════════
log "Skapar package.json..."
cat > package.json << 'PACKAGEJSON'
{
  "name": "classroom-planner",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint packages/core/src --max-warnings 0",
    "test:unit": "vitest run",
    "test": "npm run lint && npm run typecheck && npm run test:unit"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
PACKAGEJSON
ok "package.json"

# ═══════════════════════════════════════════════════════════════
# TypeScript-konfiguration
# ═══════════════════════════════════════════════════════════════
log "Skapar tsconfig-filer..."
cat > tsconfig.base.json << 'TSCONFIGBASE'
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false
  }
}
TSCONFIGBASE

cat > tsconfig.json << 'TSCONFIG'
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "references": [
    { "path": "packages/core" }
  ],
  "include": []
}
TSCONFIG
ok "tsconfig.base.json + tsconfig.json"

# ═══════════════════════════════════════════════════════════════
# Vitest
# ═══════════════════════════════════════════════════════════════
log "Skapar vitest.config.ts..."
cat > vitest.config.ts << 'VITESTCONFIG'
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    include: ['packages/*/test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@planner/core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
});
VITESTCONFIG
ok "vitest.config.ts"

# ═══════════════════════════════════════════════════════════════
# ESLint — Invariant I1 + I2
# ═══════════════════════════════════════════════════════════════
log "Skapar eslint.config.mjs (invarianter I1+I2)..."
cat > eslint.config.mjs << 'ESLINTCONFIG'
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// I2: Förbjudna plattformsord i packages/core/src
const FORBIDDEN_GLOBALS = ['fetch', 'window', 'document', 'localStorage'];
const FORBIDDEN_IDENTIFIERS = ['google', 'googleapis'];

export default [
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-restricted-globals': [
        'error',
        ...FORBIDDEN_GLOBALS.map((name) => ({
          name,
          message: `Invariant I2: '${name}' är förbjudet i packages/core. Använd en port/adapter i Ring 2.`,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        ...FORBIDDEN_IDENTIFIERS.map((name) => ({
          selector: `Identifier[name="${name}"]`,
          message: `Invariant I2: '${name}' är förbjudet i packages/core.`,
        })),
        {
          selector: "MemberExpression[object.name='window']",
          message: "Invariant I2: 'window' är förbjudet i packages/core.",
        },
        {
          selector: "MemberExpression[object.name='document']",
          message: "Invariant I2: 'document' är förbjudet i packages/core.",
        },
        {
          selector: "MemberExpression[object.name='localStorage']",
          message: "Invariant I2: 'localStorage' är förbjudet i packages/core.",
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message: "Invariant I2: 'fetch' är förbjudet i packages/core.",
        },
      ],
    },
  },
];
ESLINTCONFIG
ok "eslint.config.mjs"

# ═══════════════════════════════════════════════════════════════
# packages/core/package.json
# ═══════════════════════════════════════════════════════════════
log "Skapar packages/core/package.json..."
cat > packages/core/package.json << 'COREPKG'
{
  "name": "@planner/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {},
  "devDependencies": {}
}
COREPKG
ok "packages/core/package.json"

# ═══════════════════════════════════════════════════════════════
# packages/core/tsconfig.json
# ═══════════════════════════════════════════════════════════════
log "Skapar packages/core/tsconfig.json..."
cat > packages/core/tsconfig.json << 'CORETSCONFIG'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test", "dist"]
}
CORETSCONFIG
ok "packages/core/tsconfig.json"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/errors.ts
# ═══════════════════════════════════════════════════════════════
log "Skapar packages/core/src/errors.ts..."
cat > packages/core/src/errors.ts << 'ERRORS'
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
ERRORS
ok "errors.ts"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/document.ts
# ═══════════════════════════════════════════════════════════════
log "Skapar packages/core/src/document.ts..."
cat > packages/core/src/document.ts << 'DOCUMENT'
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
DOCUMENT
ok "document.ts"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/index.ts
# ═══════════════════════════════════════════════════════════════
log "Skapar packages/core/src/index.ts..."
cat > packages/core/src/index.ts << 'INDEX'
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
INDEX
ok "index.ts"

# ═══════════════════════════════════════════════════════════════
# Tester
# ═══════════════════════════════════════════════════════════════
log "Skapar tester..."

cat > packages/core/test/smoke.test.ts << 'SMOKE'
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
SMOKE

cat > packages/core/test/document.test.ts << 'DOCTEST'
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
DOCTEST

cat > packages/core/test/invariants.test.ts << 'INVTEST'
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.startsWith('__')) {
      files.push(full);
    }
  }
  return files;
}

function findViolations(files: string[], pattern: RegExp): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (pattern.test(line)) {
        violations.push(file.replace(CORE_SRC + '/', ''));
        break;
      }
    }
  }
  return violations;
}

const CORE_SRC = resolve('packages/core/src');
const CORE_PKG = resolve('packages/core/package.json');

describe('Invariant I2 — ren core (inga plattformsberoenden i kod)', () => {
  const files = collectTsFiles(CORE_SRC);

  const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
    { label: 'window.*',      pattern: /(?<!['\"./])\bwindow\.[a-zA-Z_$]/ },
    { label: 'document.*',    pattern: /(?<![/.'\"()])\bdocument\.[a-zA-Z_$]/ },
    { label: 'localStorage.*',pattern: /\blocalStorage\.[a-zA-Z_$]/ },
    { label: 'fetch(',        pattern: /\bfetch\s*\(/ },
    { label: 'googleapis',    pattern: /googleapis/ },
  ];

  for (const { label, pattern } of FORBIDDEN) {
    it(`Ingen kodrad i core/src anropar "${label}"`, () => {
      expect(findViolations(files, pattern)).toEqual([]);
    });
  }
});

describe('Invariant I1 — noll externa dependencies i core', () => {
  it('packages/core/package.json har inga dependencies', () => {
    const pkg = JSON.parse(readFileSync(CORE_PKG, 'utf-8')) as Record<string, unknown>;
    const deps = (pkg['dependencies'] as Record<string, string> | undefined) ?? {};
    expect(Object.keys(deps)).toHaveLength(0);
  });
});
INVTEST

ok "Alla tre testfiler"

# ═══════════════════════════════════════════════════════════════
# .claude/sprint/sprint-01-spec.md
# ═══════════════════════════════════════════════════════════════
log "Skapar sprint-specifikationer..."
cat > .claude/sprint/sprint-01-spec.md << 'SPEC01'
# Sprint 1: Projektgrund

**Status:** Klar ✅
**Verifiering:** 30/30 tester gröna

## Leverabler
- package.json (rot, workspaces)
- tsconfig.base.json + tsconfig.json
- vitest.config.ts
- eslint.config.mjs (I1+I2 som error)
- packages/core/package.json (noll dependencies)
- packages/core/tsconfig.json
- packages/core/src/errors.ts (DomainError, ValidationError, SchemaVersionError)
- packages/core/src/document.ts (PlannerDocumentV1, migrate, prepareForSave, roundTrip)
- packages/core/src/index.ts
- packages/core/test/smoke.test.ts (5 tester)
- packages/core/test/document.test.ts (19 tester — C.12 + edge cases)
- packages/core/test/invariants.test.ts (6 tester)
SPEC01

# Platshållare för sprint 02–22
for i in $(seq -w 2 22); do
  cat > ".claude/sprint/sprint-${i}-spec.md" << SPECEOF
# Sprint ${i} — Specifikation

**Status:** Ej påbörjad — väntar på att föregående sprint är godkänd.

Denna spec fylls i när föregående sprint är klar.
Se MASTERPLAN v2.0 för planerat innehåll.
SPECEOF
done
ok "Sprint-specifikationer (01–22)"

# ═══════════════════════════════════════════════════════════════
# .claude/agents/
# ═══════════════════════════════════════════════════════════════
log "Skapar agentdefinitioner..."
cat > .claude/agents/sprint-verifier.md << 'VERIFIER'
---
name: sprint-verifier
description: Verifierar att en sprint uppfyller sin spec. Kör alltid i fresh context.
tools: Read, Bash, Glob, Grep
model: sonnet
---

Du är en oberoende granskare. Du har INTE sett implementationsarbetet.
Verifiera sprintresultatet mot specen och rapportera sanningsenligt.

Arbetsgång:
1. Läs .claude/sprint/sprint-NN-spec.md
2. Kontrollera att VARJE leverabel finns som fil
3. Kör `npm test` — alla tester MÅSTE vara gröna
4. Kör `npx eslint packages/core/src --max-warnings 0`
5. Verifiera I2 aktivt: skapa __verify_i2.ts med window.innerWidth, kör lint (MÅSTE ge fel), radera filen
6. Kontrollera att core/package.json har dependencies: {}
7. Skriv rapport till .claude/sprint/sprint-NN-report.md

Var hård. Om NÅGOT saknas: UNDERKÄND.
VERIFIER

cat > .claude/agents/core-implementer.md << 'IMPLEMENTER'
---
name: core-implementer
description: Implementerar TypeScript-kod i packages/core
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
isolation: worktree
---

Du implementerar TypeScript i packages/core.

Regler:
- Strict TypeScript, inga `any`
- Inga: google, googleapis, fetch, window, document, localStorage
- Inga externa npm-dependencies
- Mutera ALDRIG indata — returnera kopior
- Object.setPrototypeOf i alla Error-subklasser
- Iso8601 = string, aldrig Date
- Kör `npx tsc --noEmit` efter varje fil
IMPLEMENTER

cat > .claude/agents/test-writer.md << 'TESTWRITER'
---
name: test-writer
description: Skriver Vitest-tester för packages/core
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
isolation: worktree
---

Du skriver tester i Vitest (describe/it/expect).

Regler:
- Varje testfacit-punkt = ett eget it()-block
- Deterministiska assertions — exakta värden
- Injicera Clock för tidsberoende (aldrig new Date())
- Testa BÅDE lyckat och misslyckat fall
- Verifiera instanceof-kedjor för felklasser
- Kör `npx vitest run` när alla tester är skrivna
TESTWRITER
ok "Agentdefinitioner"

# ═══════════════════════════════════════════════════════════════
# README.md
# ═══════════════════════════════════════════════════════════════
log "Skapar README.md..."
cat > README.md << 'README'
# Classroom Planner

Lektionsplaneringsapp med Google Classroom-integration för matematikundervisning i åk 8.
TypeScript monorepo · Sprint 1 av 22 klar.

## Kom igång

```bash
npm install
npm test        # 30/30 tester gröna
```

## Installera Claude Code (i Codespaces-terminalen)

```bash
npm install -g @anthropic-ai/claude-code
claude          # starta Sprint 2
```

## Arkitektur

```
Ring 3 — Ytor (web, dashboards)
Ring 2 — Adaptrar (Google, AI, Socrative, Magma)
Ring 1.5 — App Services (use cases, DI)
Ring 1 — Ren kärna (packages/core) ← NOLL externa dependencies
```

## Sprint-status

| Sprint | Innehåll | Status |
|--------|----------|--------|
| 1 | Projektgrund, monorepo, I1/I2, felmodell | ✅ Klar |
| 2 | Domäntyper (LessonContent, SourceRef) | ⬜ |
| 3 | Ren kärnlogik (versionering, BAM, sök) | ⬜ |
| 4 | Planeringsmotor | ⬜ |
| 5 | App-services / use cases | ⬜ |
| 6 | Lokal webbapp (B1–B36 paritet) | ⬜ |
| 7–22 | Se CLAUDE.md | ⬜ |
README
ok "README.md"

# ═══════════════════════════════════════════════════════════════
# Klart — sammanfattning
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Alla filer skapade!                      ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "Kör nu:"
echo ""
echo -e "  ${BLUE}npm install${NC}"
echo -e "  ${BLUE}npm test${NC}          ← ska visa 30/30 gröna tester"
echo ""
echo "Sedan för att starta Sprint 2:"
echo ""
echo -e "  ${BLUE}npm install -g @anthropic-ai/claude-code${NC}"
echo -e "  ${BLUE}claude${NC}"
echo ""
