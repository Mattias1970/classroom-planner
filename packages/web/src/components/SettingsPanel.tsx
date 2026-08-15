import React, { useState } from 'react';
import { SetupWizard } from './SetupWizard';
import type { PartialSetup, SetupValidation } from '@planner/core';

export type SettingsSectionId =
  | 'initiering'
  | 'datakalla'
  | 'klasser'
  | 'utseende'
  | 'backup'
  | 'om';

const SEKTIONER: { id: SettingsSectionId; label: string }[] = [
  { id: 'initiering', label: 'Initiering' },
  { id: 'datakalla', label: 'Datakälla' },
  { id: 'klasser', label: 'Klasser' },
  { id: 'utseende', label: 'Utseende' },
  { id: 'backup', label: 'Backup & data' },
  { id: 'om', label: 'Om' },
];

export interface SettingsPanelProps {
  onClose: () => void;
  /** Vilken sektion panelen öppnas på. Default 'initiering' om setup är ofullständig. */
  startSektion?: SettingsSectionId;
  setup: PartialSetup;
  validation: SetupValidation;
  uppdateraSetup: (patch: PartialSetup) => void;
  /**
   * Slots: koppla in befintligt innehåll (t.ex. klasshanteringsmodalen,
   * backup-export/import, repo/token-formuläret) utan att den här
   * komponenten behöver känna till dem.
   */
  renderDatakalla?: () => React.ReactNode;
  renderKlasser?: () => React.ReactNode;
  renderUtseende?: () => React.ReactNode;
  renderBackup?: () => React.ReactNode;
  /** Frivillig: hämta initieringen från datakällan (visas som knapp i wizarden). */
  onHamtaFranDatakallan?: () => void;
  /** Version/testläge som visas under Om. */
  version?: string;
  testlage?: boolean;
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16, 24, 40, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const panel: React.CSSProperties = {
  width: 'min(720px, 94vw)',
  maxHeight: '86vh',
  background: '#fff',
  borderRadius: 12,
  display: 'flex',
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(16, 24, 40, 0.18)',
};

const nav: React.CSSProperties = {
  width: 170,
  borderRight: '1px solid #eaecf0',
  padding: 8,
  background: '#f9fafb',
  flexShrink: 0,
};

const innehall: React.CSSProperties = {
  flex: 1,
  padding: 20,
  overflowY: 'auto',
};

function Platshallare({ text }: { text: string }): React.JSX.Element {
  return <p style={{ color: '#667085' }}>{text}</p>;
}

/**
 * Samlad inställningspanel som öppnas från kugghjulet i topbaren och
 * ersätter den gamla Inställningar-fliken i navigationen.
 */
export function SettingsPanel({
  onClose,
  startSektion,
  setup,
  validation,
  uppdateraSetup,
  renderDatakalla,
  renderKlasser,
  renderUtseende,
  renderBackup,
  onHamtaFranDatakallan,
  version = 'utveckling',
  testlage = false,
}: SettingsPanelProps): React.JSX.Element {
  const [aktiv, setAktiv] = useState<SettingsSectionId>(
    startSektion ?? (validation.complete ? 'datakalla' : 'initiering')
  );

  return (
    <div
      style={overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Inställningar"
    >
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <nav style={nav} aria-label="Inställningssektioner">
          {SEKTIONER.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setAktiv(s.id)}
              aria-current={aktiv === s.id}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: 2,
                border: 'none',
                borderRadius: 6,
                background: aktiv === s.id ? '#eef4ff' : 'transparent',
                color: aktiv === s.id ? '#175cd3' : '#344054',
                fontWeight: aktiv === s.id ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {s.label}
              {s.id === 'initiering' && !validation.complete ? ' ●' : ''}
            </button>
          ))}
        </nav>

        <div style={innehall}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: '0 0 12px' }}>
              {SEKTIONER.find((s) => s.id === aktiv)?.label ?? ''}
            </h2>
            <button type="button" onClick={onClose} aria-label="Stäng inställningar">
              ✕
            </button>
          </div>

          {aktiv === 'initiering' && (
            <SetupWizard setup={setup} validation={validation} uppdatera={uppdateraSetup}
              onHamtaFranDatakallan={onHamtaFranDatakallan} />
          )}

          {aktiv === 'datakalla' &&
            (renderDatakalla?.() ?? (
              <Platshallare text="Repo, token och cache för classroom-planner-data kopplas in här (renderDatakalla)." />
            ))}

          {aktiv === 'klasser' &&
            (renderKlasser?.() ?? (
              <Platshallare text="Befintlig klasshantering kopplas in här (renderKlasser)." />
            ))}

          {aktiv === 'utseende' &&
            (renderUtseende?.() ?? (
              <Platshallare text="Skärmstorlek och framtida teman (renderUtseende)." />
            ))}

          {aktiv === 'backup' &&
            (renderBackup?.() ?? (
              <Platshallare text="Export/import av backup-JSON kopplas in här (renderBackup)." />
            ))}

          {aktiv === 'om' && (
            <div>
              <p>
                Classroom Planner — version {version}
                {testlage ? ' (testläge)' : ''}
              </p>
              <Platshallare text="Ren TypeScript-kärna (Ring 1), React-UI (Ring 3), data från classroom-planner-data via GitHub." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
