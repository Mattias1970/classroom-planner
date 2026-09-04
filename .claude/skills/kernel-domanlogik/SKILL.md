---
name: kernel-domanlogik
description: Konventioner för domänlogik i packages/kernel i Classroom Planner. Använd när kod ska skrivas, ändras eller granskas i kernel — nya funktioner i domain/, typer i typer.ts, eller tester i packages/kernel/test. Täcker I2-invarianten (ingen fetch/DOM/lagring), rena funktioner, svenska domäntermer och testupplägget med Vitest.
---

# Kernel — domänlogik (Ring 1)

`packages/kernel/src/domain/` innehåller all affärslogik. `packages/studio/src/App.tsx` är UI och får inte innehålla beräkningar som hör hemma i kernel.

## Hårda regler

- **I2**: ingen `fetch`, `window`, `document`, `localStorage` eller `google` i `packages/kernel/src`. ESLint bryter bygget. Filer läses i UI-lagret och skickas in som data (t.ex. `Cell[][]` från SheetJS).
- **Rena funktioner**: mutera aldrig indata. Ta `Struktur` in, returnera ny `Struktur` ut. Testa alltid att originalet är orört.
- **Inga TODO-stubbar.** Det som skrivs ska fungera.
- Osäkra värden sätts till `"—"`, värden som behöver kontrolleras mot källan till `"⚠ kontrollera"` — aldrig gissningar.

## Namngivning

Svenska domäntermer genomgående: `provTillfallen`, `narvaroLektioner`, `laxforhor`, `krav`, `snittProcent`. Engelska bara i tekniska hjälpfunktioner. Kommentarer på svenska och förklarar *varför*, inte vad koden gör.

Typer: `Iso8601 = string` (aldrig `Date` i modellen), datum alltid `YYYY-MM-DD`, klockslag `HH:MM` i svensk tid via `svenskTid`.

## Struktur på en ny modul

```ts
/**
 * SuperTeach · <namn> — en mening om vad modulen gör.
 * (Ring 1, I2: ingen fetch/DOM/lagring.)
 */
export interface Xxx { … }        // typerna först
export function xxx(s: Struktur, f: Filter): Xxx[] { … }
```

Exportera från `packages/kernel/src/index.ts` med `export * from './domain/<fil>.js'` (notera `.js`-ändelsen i importen — ESM).

## Tester

Vitest i `packages/kernel/test/<modul>.test.ts`. Ett `describe` per funktionsområde, `it`-texten beskriver beteendet på svenska: `it('halvklass A/B slås ihop till ett tillfälle')`.

- **Fejkade namn i fixturer**: Testsson, Provlund, Övnegård, Anna Berg, Omar Ali. Riktiga elevnamn får aldrig committas.
- Testa gränsfall: tom lista, saknat värde (`null`), dubbletter, orört original.
- Kör `npx vitest run packages/kernel/test/<fil>.test.ts` under arbetet, hela sviten före leverans.

## Kvalitetskedjan före varje leverans

```
npm run lint        # eslint, I2
npm run typecheck   # tsc i alla paket
npx vitest run      # hela sviten
cd packages/studio && npx vite build
```

Alla fyra ska passera. Ett fallerande test rättas i sak — förväntningar ändras bara när beteendet medvetet ändrats, och då med en kommentar om varför.
