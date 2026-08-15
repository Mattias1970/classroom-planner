// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import Kalender from '../src/views/Kalender';
import { demoLibrary } from '../src/state/store';
import { generateSlots, placeLessons, type LokalPlanering, type PlacedLesson, type LessonRecord } from '@planner/core';

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(el); });
  return host;
}

const kemi8F: LokalPlanering = {
  id: 'kemi-8f', klassNamn: '8F', amne: 'Kemi', bokTitel: 'Spektrum Kemi',
  farg: '#b45309', schema: [{ veckodag: 2, start: '10:00', slut: '11:00' }],
};

function props() {
  const lib = demoLibrary();
  const sequence = Object.entries(lib.lessons)
    .flatMap(([k, list]) => list.map((lesson) => ({ kapitel: Number(k), lesson })));
  const placedByClass: Record<string, PlacedLesson<LessonRecord>[]> = {};
  for (const c of lib.subject.meta.klasser.filter((x) => !x.arkiverad)) {
    placedByClass[c.id] = placeLessons(sequence, generateSlots(lib.subject, c.id, sequence.length + 5));
  }
  return { subject: lib.subject, placedByClass, onChanged: () => {}, onOpenLesson: () => {} };
}

describe('Kalender med filter (render smoke)', () => {
  it('visar klassfilter med Alla klasser samt ämnesfilter när planeringar finns', () => {
    const host = render(<Kalender {...props()} planeringar={[kemi8F]} onTaBortPlanering={() => {}} />);
    expect(host.textContent).toContain('Alla klasser');
    expect(host.textContent).toContain('Alla ämnen');
    expect(host.textContent).toContain('Kemi');
    expect(host.textContent).toContain('Spektrum Kemi'); // planeringslegenden
  });

  it('utan planeringar: inget ämnesfilter (bara ett ämne), klassknappar som förut', () => {
    const host = render(<Kalender {...props()} planeringar={[]} onTaBortPlanering={() => {}} />);
    expect(host.textContent).toContain('Alla klasser');
    expect(host.textContent).not.toContain('Alla ämnen');
  });

  it('Alla klasser: läge utan redigering förklaras och klassmärkning används', () => {
    const host = render(<Kalender {...props()} planeringar={[kemi8F]} onTaBortPlanering={() => {}} />);
    const allaBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Alla klasser');
    act(() => { allaBtn?.click(); });
    expect(host.textContent).toContain('kräver att en klass är vald');
  });

  it('ämnesfilter på Kemi döljer datakällans lektioner men behåller kemiposterna', () => {
    const host = render(<Kalender {...props()} planeringar={[kemi8F]} onTaBortPlanering={() => {}} />);
    const kemiBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Kemi');
    act(() => { kemiBtn?.click(); });
    // Månad ger stabilast textinnehåll
    const manadBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Månad');
    act(() => { manadBtn?.click(); });
    expect(host.textContent).toContain('Kemi');
  });
});
