# Sprint 3: Ren kärnlogik

**Status:** Klar ✅

## Leverabler
- packages/core/src/logic/versioning.ts  (createTemplate, saveNewVersion, getVersion, getCurrentVersion)
- packages/core/src/logic/timeline.ts    (validateTimeline, computeTimes)
- packages/core/src/logic/search.ts      (projectToIndex, search)
- packages/core/src/logic/flip.ts        (buildFlip)
- packages/core/src/logic/index.ts       (re-export)
- packages/core/test/helpers/fixtures.ts (makeContent, makeTemplate, makeScheduled)
- packages/core/test/versioning.test.ts  (10 tester — C.1)
- packages/core/test/timeline.test.ts    (12 tester — C.2)
- packages/core/test/search.test.ts      (10 tester — C.3)
- packages/core/test/flip.test.ts        (9 tester — C.4)

## Invarianter
- Alla funktioner är rena (ingen I/O, ingen mutation av indata)
- Inga externa dependencies i core
- Sprint 1 (30) + Sprint 2 (26) + Sprint 3 (41) = 97 tester gröna
