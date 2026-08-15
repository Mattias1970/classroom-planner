import React from 'react';
import {
  SETUP_FIELDS,
  SETUP_FIELD_LABELS,
  STANDARD_AMNEN,
  amnesbytePatch,
  describeMissing,
  veckodagsnamn,
  type PartialSetup,
  type SetupField,
  type SetupValidation,
  type SchemaPass,
} from '@planner/core';

/** Sentinel för select-alternativet "Eget ämne …". */
const EGET_AMNE = '__eget__';

export interface SetupWizardProps {
  setup: PartialSetup;
  validation: SetupValidation;
  uppdatera: (patch: PartialSetup) => void;
  /** Frivillig: fyll fälten från datakällans kompletta planering. */
  onHamtaFranDatakallan?: () => void;
}

const rad: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid #eaecf0',
};

const etikett: React.CSSProperties = { width: 130, fontWeight: 600, paddingTop: 6 };

const falt: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  fontSize: 14,
};

function StatusPrick({ ok }: { ok: boolean }): React.JSX.Element {
  return (
    <span
      aria-label={ok ? 'Komplett' : 'Saknas eller ogiltigt'}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        marginTop: 10,
        background: ok ? '#12b76a' : '#f04438',
        flexShrink: 0,
      }}
    />
  );
}

function faltOk(field: SetupField, v: SetupValidation): boolean {
  return !v.missing.includes(field) && !v.issues.some((i) => i.field === field);
}

/**
 * Initieringsmenyn: de fem obligatoriska delarna. Ingen översikt kan
 * skapas förrän samtliga är gröna — spärren ligger i @planner/core
 * (canCreateOverview), den här komponenten visar bara tillståndet.
 */
export function SetupWizard({ setup, validation, uppdatera, onHamtaFranDatakallan }: SetupWizardProps): React.JSX.Element {
  const schema = setup.amnesschema ?? [];

  const uppdateraPass = (index: number, patch: Partial<SchemaPass>): void => {
    const nasta = schema.map((p, i) => (i === index ? { ...p, ...patch } : p));
    uppdatera({ amnesschema: nasta });
  };

  const laggTillPass = (): void => {
    uppdatera({
      amnesschema: [...schema, { veckodag: 1, start: '08:00', slut: '09:00' }],
    });
  };

  const taBortPass = (index: number): void => {
    uppdatera({ amnesschema: schema.filter((_, i) => i !== index) });
  };

  return (
    <div>
      <div
        role="status"
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          marginBottom: 8,
          background: validation.complete ? '#ecfdf3' : '#fef3f2',
          color: validation.complete ? '#027a48' : '#b42318',
          fontSize: 14,
        }}
      >
        {describeMissing(validation)}
      </div>

      <div style={rad}>
        <StatusPrick ok={faltOk('lasar', validation)} />
        <label style={etikett} htmlFor="setup-lasar">
          {SETUP_FIELD_LABELS.lasar}
        </label>
        <input
          id="setup-lasar"
          style={falt}
          placeholder="2026/2027"
          value={setup.lasar ?? ''}
          onChange={(e) => uppdatera({ lasar: e.target.value })}
        />
      </div>

      <div style={rad}>
        <StatusPrick ok={faltOk('klass', validation)} />
        <label style={etikett} htmlFor="setup-klass">
          {SETUP_FIELD_LABELS.klass}
        </label>
        <input
          id="setup-klass"
          style={falt}
          placeholder="8B"
          value={setup.klass ?? ''}
          onChange={(e) => uppdatera({ klass: e.target.value })}
        />
      </div>

      <div style={rad}>
        <StatusPrick ok={faltOk('amne', validation)} />
        <label style={etikett} htmlFor="setup-amne">
          {SETUP_FIELD_LABELS.amne}
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            id="setup-amne"
            style={falt}
            value={
              setup.amne == null || setup.amne === ''
                ? ''
                : STANDARD_AMNEN.includes(setup.amne)
                  ? setup.amne
                  : EGET_AMNE
            }
            onChange={(e) => {
              const v = e.target.value;
              // Ämnesbyte: schema och bok rensas (regeln ligger i kärnan).
              uppdatera(amnesbytePatch(setup, v === EGET_AMNE ? ' ' : v));
            }}
          >
            <option value="" disabled>
              Välj ämne …
            </option>
            {STANDARD_AMNEN.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value={EGET_AMNE}>Eget ämne …</option>
          </select>
          {setup.amne != null && setup.amne !== '' && !STANDARD_AMNEN.includes(setup.amne) && (
            <input
              aria-label="Eget ämne"
              style={falt}
              placeholder="Skriv ämnets namn"
              value={setup.amne.trimStart() === '' ? '' : setup.amne}
              onChange={(e) => uppdatera({ amne: e.target.value === '' ? ' ' : e.target.value })}
            />
          )}
          <p style={{ fontSize: 12, color: '#667085', margin: '4px 0 0', width: '100%' }}>
            Byter du ämne måste schema och bok anges på nytt — de följer ämnet.
          </p>
        </div>
      </div>

      <div style={rad}>
        <StatusPrick ok={faltOk('amnesschema', validation)} />
        <span style={etikett}>{SETUP_FIELD_LABELS.amnesschema}</span>
        <div style={{ flex: 1 }}>
          {schema.map((pass, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <select
                aria-label="Veckodag"
                style={falt}
                value={pass.veckodag}
                onChange={(e) =>
                  uppdateraPass(i, { veckodag: Number(e.target.value) as SchemaPass['veckodag'] })
                }
              >
                {([1, 2, 3, 4, 5] as const).map((d) => (
                  <option key={d} value={d}>
                    {veckodagsnamn(d)}
                  </option>
                ))}
              </select>
              <input
                aria-label="Starttid"
                style={{ ...falt, width: 70 }}
                value={pass.start}
                onChange={(e) => uppdateraPass(i, { start: e.target.value })}
              />
              <span>–</span>
              <input
                aria-label="Sluttid"
                style={{ ...falt, width: 70 }}
                value={pass.slut}
                onChange={(e) => uppdateraPass(i, { slut: e.target.value })}
              />
              <button type="button" onClick={() => taBortPass(i)} aria-label="Ta bort pass">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={laggTillPass}>
            + Lägg till pass
          </button>
        </div>
      </div>

      <div style={rad}>
        <StatusPrick ok={faltOk('bok', validation)} />
        <span style={etikett}>{SETUP_FIELD_LABELS.bok}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            aria-label="Bokens titel"
            style={falt}
            placeholder="Titel"
            value={setup.bok?.titel ?? ''}
            onChange={(e) => uppdatera({ bok: { ...setup.bok, titel: e.target.value } })}
          />
          <input
            aria-label="Förlag"
            style={falt}
            placeholder="Förlag (valfritt)"
            value={setup.bok?.forlag ?? ''}
            onChange={(e) =>
              uppdatera({ bok: { titel: setup.bok?.titel ?? '', forlag: e.target.value } })
            }
          />
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#667085', marginTop: 8 }}>
        {SETUP_FIELDS.length} obligatoriska delar. Planeringsvyerna låses upp först när alla är
        gröna.
      </p>
      {onHamtaFranDatakallan && (
        <button type="button" onClick={onHamtaFranDatakallan}>
          ↺ Hämta från datakällan
        </button>
      )}
    </div>
  );
}
