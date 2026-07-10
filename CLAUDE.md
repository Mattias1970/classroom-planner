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
