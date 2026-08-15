import React from 'react';
import { canCreateOverview, validateSetup, SETUP_FIELD_LABELS, type PartialSetup } from '@planner/core';

export interface SetupGateProps {
  setup: PartialSetup;
  /** Öppna inställningspanelen på initieringssektionen. */
  onOppnaInitiering: () => void;
  children: React.ReactNode;
}

/**
 * Spärren i UI:t: släpper bara igenom planeringsvyer (översikt, kalender,
 * schema …) när initieringen är komplett. Befintlig komplett data
 * (t.ex. Prio Matematik 8 för 8B/8F, härledd via deriveSetup) passerar
 * direkt; nya/ofullständiga planeringar möts av den här vyn.
 */
export function SetupGate({ setup, onOppnaInitiering, children }: SetupGateProps): React.JSX.Element {
  if (canCreateOverview(setup)) {
    return <>{children}</>;
  }

  const v = validateSetup(setup);

  return (
    <div
      role="alert"
      style={{
        maxWidth: 520,
        margin: '48px auto',
        padding: 24,
        border: '1px solid #eaecf0',
        borderRadius: 12,
        textAlign: 'center',
      }}
    >
      <h2 style={{ marginTop: 0 }}>Planeringen är inte initierad</h2>
      <p style={{ color: '#475467' }}>
        Ingen översikt kan skapas förrän alla fem obligatoriska delar är på plats.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', display: 'inline-block' }}>
        {(['lasar', 'klass', 'amne', 'amnesschema', 'bok'] as const).map((f) => {
          const ok = !v.missing.includes(f) && !v.issues.some((i) => i.field === f);
          return (
            <li key={f} style={{ padding: '4px 0', color: ok ? '#027a48' : '#b42318' }}>
              {ok ? '✓' : '✕'} {SETUP_FIELD_LABELS[f]}
            </li>
          );
        })}
      </ul>
      <div>
        <button
          type="button"
          onClick={onOppnaInitiering}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#175cd3',
            color: '#fff',
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Öppna initieringen
        </button>
      </div>
    </div>
  );
}
