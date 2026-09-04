# Classroom Planner

TypeScript-monorepo. Strict mode. Vitest. Lärarens planerings- och analysverktyg
(Mattias, Eriksdalsskolan, klasserna 8B och 8F).

## Paket

- `packages/kernel` — **Ring 1, all domänlogik.** Ren TypeScript, I2-invariant.
- `packages/studio` — React-UI (Struktur, Planering, Kalender, SuperTeach). Aktiv utveckling.
- `packages/core`, `packages/web` — äldre generation, ändras inte längre.

## Maskinkontrollerade invarianter

- **I1**: kernel importerar aldrig från yttre ringar. ESLint.
- **I2**: ingen fil i `packages/kernel/src` innehåller `google`, `fetch`, `window`, `document` eller `localStorage`. ESLint.
- **NFR-005**: bokdata (repot `classroom-planner-data`) är läsbart, aldrig skrivbart. Allt användarskapat är overlays i localStorage med minnesfallback.

## Kommandon

- Allt: `npm test` (lint + typecheck + vitest)
- Bygg: `cd packages/studio && npx vite build`
- Enskilt test: `npx vitest run packages/kernel/test/<fil>.test.ts`

## Skills

`.claude/skills/` innehåller projektets arbetsbeskrivningar:

- **kernel-domanlogik** — konventioner för `packages/kernel` (I2, rena funktioner, tester)
- **superteach-analys** — datamodellen för resultat: Socrative-rum, BAM-krav, halvklass, närvaro, trendkoll
- **patch-leverans** — hur ändringar levereras som `git format-patch` och appliceras i PowerShell

## Konventioner

- Svenska domäntermer i typ- och funktionsnamn (`provTillfallen`, `snittProcent`, `laxforhor`)
- `Iso8601 = string` (aldrig `Date`); datum `YYYY-MM-DD`, tid `HH:MM` svensk tid via `svenskTid`
- Mutera aldrig indata — returnera kopior
- Inga TODO-stubbar; osäkra fält sätts till `"—"`, fält att verifiera till `"⚠ kontrollera"`
- Testfixturer använder fejkade namn (Testsson, Provlund, Övnegård) — riktiga elevnamn committas aldrig

## Historik

Sprintspecarna i `.claude/sprint/` och `setup-sprint*.sh` hör till den äldre
`packages/core`-generationen och är kvar som referens. Nuvarande arbete sker i
numrerade delar (Del 56 och framåt) mot `kernel` och `studio`.
