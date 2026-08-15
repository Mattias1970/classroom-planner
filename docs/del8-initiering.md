# Del 8 — Initieringsmeny med spärr (fem obligatoriska fält)

## Innehåll

**Kärna (`packages/core`, ren logik — invariant I2):**
- `src/domain/setup.ts` — `SetupState` (Läsår, Klass, Ämne, Ämnesschema, Bok),
  `validateSetup`, `isSetupComplete`, **`canCreateOverview`** (spärren),
  `parseLasar`, `validateSchemaPass` (inkl. överlappskontroll), `deriveSetup`
  (automatisk härledning för befintlig komplett data, t.ex. Prio 8 / 8B / 8F).
- `test/setup.test.ts` — 23 tester.

**Webb (`packages/web`):**
- `components/GearIcon.tsx`, `components/SettingsButton.tsx` — kugghjul i topbaren.
- `components/SettingsPanel.tsx` — panel med sektionerna Initiering, Datakälla,
  Klasser, Utseende, Backup & data, Om. Befintligt innehåll kopplas in via
  slots (`renderDatakalla`, `renderKlasser`, `renderUtseende`, `renderBackup`).
- `components/SetupWizard.tsx` — de fem fälten med statusprickar och felmeddelanden.
- `components/SetupGate.tsx` — blockerar planeringsvyer tills allt är komplett.
- `state/useSetup.ts` — persistens i localStorage (skyddad, minnesfallback).
- `test/setup-ui.smoke.test.tsx` — 4 jsdom-rendertester.

## Två manuella steg efter `git am`

**1. Exportera setup från kärnan** — lägg till i `packages/core/src/index.ts`:

```ts
export * from './domain/setup.js';
```

**2. Koppla in i `App.tsx`** (och ta bort den gamla Inställningar-fliken):

```tsx
import { useState } from 'react';
import { deriveSetup } from '@planner/core';
import { SettingsButton } from './components/SettingsButton';
import { SettingsPanel } from './components/SettingsPanel';
import { SetupGate } from './components/SetupGate';
import { useSetup } from './state/useSetup';

// I App:
const { setup, validation, uppdatera } = useSetup();
const [installningarOppna, setInstallningarOppna] = useState(false);

// Vid laddning av befintlig komplett planering (Prio 8): häv spärren automatiskt
// genom att härleda setup ur ämnesdatan, t.ex.:
//   const auto = deriveSetup({ lasarStart: 2026, klass: '8B', amne: 'Matematik',
//     amnesschema: schemaFrånDatakällan, bokTitel: 'Prio Matematik 8',
//     bokForlag: 'Sanoma', bokUpplaga: '2' });
//   if (auto && !validation.complete) uppdatera(auto);

// Topbar:
<SettingsButton isOpen={installningarOppna} onClick={() => setInstallningarOppna(true)} />

// Panel:
{installningarOppna && (
  <SettingsPanel
    onClose={() => setInstallningarOppna(false)}
    setup={setup}
    validation={validation}
    uppdateraSetup={uppdatera}
    version="del 8"
  />
)}

// Runt översikt/kalender/schema:
<SetupGate setup={setup} onOppnaInitiering={() => setInstallningarOppna(true)}>
  {/* befintliga planeringsvyer */}
</SetupGate>
```

## Verifiering (körd i container)

- `npx tsc --noEmit -p packages/core` — inga fel i setup.ts
- Webbfiler typcheckade med strict + noUncheckedIndexedAccess — OK
- `vitest`: 23/23 kärntester, 4/4 jsdom-rendertester

Kör lokalt som vanligt: båda tsc-målen + full testsvit.
