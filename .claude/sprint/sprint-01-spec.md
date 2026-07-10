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
