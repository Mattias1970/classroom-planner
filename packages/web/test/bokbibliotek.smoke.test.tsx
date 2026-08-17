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

// ── Del 26: Använd i planeringen ─────────────────────────────
import { applyLokalBok, getAktivBokId, resolveAktivBok, setAktivBokId } from '../src/state/store';

const matteY = () => validateBokImport({
  schema: BOK_IMPORT_SCHEMA, version: 1,
  bok: { id: 'liber-matematik-y', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8,
    kapitelMeta: { '4': { name: 'Algebra', col: '#2f5aa8' } } },
  lektioner: { '4': [
    { id: 1, type: 'regular', avsnitt: '4.6 Ekvationer', del: 1, ett: '133–137', två: '138–143', tre: '—', begrepp: 'ekvation, obekant' },
    { id: 2, type: 'regular', avsnitt: '4.6 Ekvationer', del: 2, ett: '—', två: '144–150', tre: '151–159' },
  ] },
});

describe('BokBibliotek – använd bok i planeringen (del 26)', () => {
  it('▶ Använd i planeringen aktiverar boken och visar ETT/TVÅ/TRE', () => {
    setAktivBokId(null);
    saveLokalBok(matteY());
    let changed = 0;
    const host = render(<BokBibliotek lib={demoLibrary()} onChange={() => { changed++; }} />);
    expect(host.textContent).toContain('ETT/TVÅ/TRE');
    const btn = [...host.querySelectorAll('button')].filter((b) => b.textContent?.includes('Använd i planeringen'));
    act(() => { btn[btn.length - 1]?.click(); }); // den egna boken (sist)
    expect(getAktivBokId()).toBe('liber-matematik-y');
    expect(changed).toBeGreaterThan(0);
    expect(host.textContent).toContain('bygger nu på "Matematik Y"');
  });

  it('applyLokalBok fyller lektioner, kapitel, begrepp och nivåer men behåller klasser/schema', () => {
    const lib = demoLibrary();
    const eff = applyLokalBok(lib, matteY());
    expect(eff.bookId).toBe('liber-matematik-y');
    expect(eff.nivaer).toEqual({ grön: 'ETT', blå: 'TVÅ', röd: 'TRE' });
    expect(Object.keys(eff.subject.kapitelMeta)).toEqual(['4']);
    expect(eff.lessons[4]).toHaveLength(2);
    expect(eff.lessons[4][0].grön).toBe('133–137');
    expect(eff.begrepp.perDelkapitel['4.6']).toEqual(['ekvation', 'obekant']);
    expect(eff.subject.meta.lärobok).toBe('Matematik Y, Liber');
    expect(eff.subject.meta.klasser).toEqual(lib.subject.meta.klasser);
    expect(eff.subject.schema).toEqual(lib.subject.schema);
    expect(eff.subject.läsår).toEqual(lib.subject.läsår);
    // utan bok: oförändrat + Grön/Blå/Röd
    const same = applyLokalBok(lib, null);
    expect(same.lessons).toBe(lib.lessons);
    expect(same.nivaer).toEqual({ grön: 'Grön', blå: 'Blå', röd: 'Röd' });
  });

  it('resolveAktivBok: uttryckligt val vinner, annars initieringens bokval', () => {
    setAktivBokId(null); // lsGet har minnesfallback (NFR-005) — nollställ uttryckligen
    saveLokalBok(matteY());
    expect(resolveAktivBok(null)).toBeNull();
    expect(resolveAktivBok({ titel: 'Matematik Y' })?.bok.id).toBe('liber-matematik-y');
    expect(resolveAktivBok({ titel: 'Prio 8' })).toBeNull();
    setAktivBokId('liber-matematik-y');
    expect(resolveAktivBok({ titel: 'Prio 8' })?.bok.id).toBe('liber-matematik-y');
    setAktivBokId(null);
  });
});
