# classroom-planner

Lektionsplanering för MA/NO/TK — Prio Matematik 8, klasserna 8B och 8F.

## Struktur (ringmodellen)

- **Ring 1** `packages/core/src/{domain,logic,records,fixtures}` — ren domänlogik:
  versionering, BAM-tidslinje, flip-generering, sök, LessonRecord, schemamotor
  (svenska röda dagar + lov)
- **Ring 1.5** `packages/core/src/app-services` + `features/superteach/service.ts`
- **Ring 2** `packages/core/src/adapters` — `loadSubjectLibrary` mot
  [classroom-planner-data](https://github.com/Mattias1970/classroom-planner-data)
  (GitHub Contents API, fine-grained PAT) samt localStorage i webben
- **Ring 3** `packages/web` — React-UI: planering, kalender, klasser, bibliotek,
  SuperTeach, inställningar
- **SuperTeach + AI** `packages/core/src/features/{superteach,ai}` — evidens,
  CSV-ingest, policy-routad AI-port med läraren i loopen

## Kom igång

```bash
npm ci && npx vitest run        # kärnan: alla tester
cd packages/web && npm install
npx vite dev                    # utvecklingsläge (demodata)
npx vite build                  # produktion → dist/
```

Anslut riktig data under **Bibliotek → Datakällor** (repo + fine-grained PAT,
Contents: Read). Backup under **Inställningar**. SuperTeach aktiveras med en
kryssruta under Inställningar.

## Historik

Sprint 1–12 enligt ursprungsplanens setup-skript. Sprint 13–24 återuppbyggda
2026-07-20 efter dataförlust (originalet fanns endast i en chattsession) —
API:et rekonstruerat från testsviten och dataspecen. Sprint 25–30: SuperTeach,
ingest, AI-port. Setup-skripten `setup-sprint*.sh` är historiska artefakter;
källkoden i `packages/` är numera sanningen.
