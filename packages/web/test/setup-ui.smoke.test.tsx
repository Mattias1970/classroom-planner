// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SettingsPanel } from '../src/components/SettingsPanel';
import { SetupGate } from '../src/components/SetupGate';
import { SetupWizard } from '../src/components/SetupWizard';
import { validateSetup, type PartialSetup } from '@planner/core';

const komplett: PartialSetup = {
  lasar: '2026/2027',
  klass: '8B',
  amne: 'Matematik',
  amnesschema: [{ veckodag: 1, start: '08:10', slut: '09:10' }],
  bok: { titel: 'Prio Matematik 8' },
};

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(el);
  });
  return host;
}

describe('SetupGate (render smoke)', () => {
  it('blockerar planeringsvyn när initieringen är ofullständig', () => {
    const host = render(
      <SetupGate setup={{ klass: '8F' }} onOppnaInitiering={() => {}}>
        <div>HEMLIG ÖVERSIKT</div>
      </SetupGate>
    );
    expect(host.textContent).toContain('inte initierad');
    expect(host.textContent).not.toContain('HEMLIG ÖVERSIKT');
  });

  it('släpper igenom när alla fem delar är kompletta', () => {
    const host = render(
      <SetupGate setup={komplett} onOppnaInitiering={() => {}}>
        <div>HEMLIG ÖVERSIKT</div>
      </SetupGate>
    );
    expect(host.textContent).toContain('HEMLIG ÖVERSIKT');
  });
});

describe('SetupWizard (render smoke)', () => {
  it('renderar alla fem obligatoriska fält', () => {
    const host = render(
      <SetupWizard setup={{}} validation={validateSetup({})} uppdatera={() => {}} />
    );
    for (const label of ['Läsår', 'Klass', 'Ämne', 'Ämnesschema', 'Bok']) {
      expect(host.textContent).toContain(label);
    }
    expect(host.textContent).toContain('Saknas:');
  });
});

describe('SettingsPanel (render smoke)', () => {
  it('öppnar på initieringen när setup är ofullständig och visar alla sektioner', () => {
    const host = render(
      <SettingsPanel
        onClose={() => {}}
        setup={{}}
        validation={validateSetup({})}
        uppdateraSetup={() => {}}
        version="test"
      />
    );
    for (const sektion of ['Initiering', 'Datakälla', 'Klasser', 'Utseende', 'Backup & data', 'Om']) {
      expect(host.textContent).toContain(sektion);
    }
    expect(host.textContent).toContain('Läsår');
  });
});
