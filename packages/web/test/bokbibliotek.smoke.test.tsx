// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BokBibliotek } from '../src/views/BokBibliotek';
import { demoLibrary, saveLokalBok } from '../src/state/store';
import { validateBokImport, BOK_IMPORT_SCHEMA } from '@planner/core';

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(el); });
  return host;
}

beforeEach(() => { localStorage.clear(); });

describe('BokBibliotek (render smoke)', () => {
  it('visar datakällans bok med ämne och årskurs', () => {
    const host = render(<BokBibliotek lib={demoLibrary()} onChange={() => {}} />);
    expect(host.textContent).toContain('Böcker');
    expect(host.textContent).toContain('Datakälla');
    expect(host.textContent).toContain('Alla ämnen');
    expect(host.textContent).toContain('Importera bok (JSON)');
  });

  it('visar lokalt importerad bok med Egen-märkning och ämnesfilter', () => {
    saveLokalBok(validateBokImport({
      schema: BOK_IMPORT_SCHEMA, version: 1,
      bok: { id: 'bi7', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 7 },
      lektioner: { '1': [{ id: 1, avsnitt: '1.1', del: 1 }] },
    }));
    const host = render(<BokBibliotek lib={demoLibrary()} onChange={() => {}} />);
    expect(host.textContent).toContain('Spektrum Biologi');
    expect(host.textContent).toContain('Egen');
    expect(host.textContent).toContain('Biologi');
    expect(host.textContent).toContain('Åk 7');
  });

  it('visar bokens innehåll som lektioner när boken väljs', () => {
    saveLokalBok(validateBokImport({
      schema: BOK_IMPORT_SCHEMA, version: 1,
      bok: { id: 'bi7', titel: 'Spektrum Biologi', ämne: 'Biologi', årskurs: 7, kapitelMeta: { '1': { name: 'Cellen' } } },
      lektioner: { '1': [{ id: 1, avsnitt: '1.1', del: 1, grön: '1–5', blå: '6–9', begrepp: 'cell, cellkärna' }] },
    }));
    const host = render(<BokBibliotek lib={demoLibrary()} onChange={() => {}} />);
    const visaKnappar = [...host.querySelectorAll('button')].filter((b) => b.textContent?.includes('Visa innehåll'));
    act(() => { visaKnappar[visaKnappar.length - 1]?.click(); }); // den egna boken (sist)
    expect(host.textContent).toContain('Cellen');
    const kapKnapp = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Cellen'));
    act(() => { kapKnapp?.click(); });
    expect(host.textContent).toContain('1.1');
    expect(host.textContent).toContain('1–5');
    expect(host.textContent).toContain('cell, cellkärna');
  });
});
