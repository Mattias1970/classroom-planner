import { useCallback, useMemo, useState } from 'react';
import {
  validateSetup,
  canCreateOverview,
  type PartialSetup,
  type SetupValidation,
} from '@planner/core';

/**
 * Skyddad localStorage-åtkomst med minnesfallback, samma mönster som
 * appens lsGet/lsSet. Vill du kan du byta ut dessa två mot de befintliga
 * hjälparna — signaturerna är avsiktligt kompatibla.
 */
const minnesFallback = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? minnesFallback.get(key) ?? null;
  } catch {
    return minnesFallback.get(key) ?? null;
  }
}

function safeSet(key: string, value: string): void {
  minnesFallback.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* privat läge / fullt — minnesfallbacken gäller */
  }
}

const DEFAULT_KEY = 'cp.setup.v1';

function lasSetup(key: string): PartialSetup {
  const raw = safeGet(key);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as PartialSetup) : {};
  } catch {
    return {};
  }
}

export interface UseSetupResult {
  setup: PartialSetup;
  validation: SetupValidation;
  /** Spärren: sant först när alla fem obligatoriska delar är kompletta. */
  klarForOversikt: boolean;
  uppdatera: (patch: PartialSetup) => void;
  nollstall: () => void;
}

/**
 * Hanterar initieringstillståndet (Läsår, Klass, Ämne, Ämnesschema, Bok)
 * med persistens i localStorage. All validering sker i @planner/core.
 */
export function useSetup(storageKey: string = DEFAULT_KEY): UseSetupResult {
  const [setup, setSetup] = useState<PartialSetup>(() => lasSetup(storageKey));

  const uppdatera = useCallback(
    (patch: PartialSetup) => {
      setSetup((prev) => {
        const nasta = { ...prev, ...patch };
        safeSet(storageKey, JSON.stringify(nasta));
        return nasta;
      });
    },
    [storageKey]
  );

  const nollstall = useCallback(() => {
    setSetup({});
    safeSet(storageKey, '{}');
  }, [storageKey]);

  const validation = useMemo(() => validateSetup(setup), [setup]);

  return {
    setup,
    validation,
    klarForOversikt: canCreateOverview(setup),
    uppdatera,
    nollstall,
  };
}
