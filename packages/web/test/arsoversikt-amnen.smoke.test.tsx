// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import Arsoversikt from '../src/views/Arsoversikt';
import {
  demoLibrary, saveLokalPlanering, setAmnesregler, setBetygsdatum,
} from '../src/state/store';
import { generateSlots, placeLessons, type LessonRecord, type PlacedLesson } from '@planner/core';

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(el); });
  return host;
}

function props() {
  const lib = demoLibrary();
  const sequence = Object.entries(lib.lessons)
    .flatMap(([k, list]) => list.map((lesson) => ({ kapitel: Number(k), lesson })));
  const byClass: Record<string, PlacedLesson<LessonRecord>[]> = {};
  for (const c of lib.subject.meta.klasser.filter((x) => !x.arkiverad)) {
    byClass[c.id] = placeLessons(sequence, generateSlots(lib.subject, c.id, sequence.length + 5));
  }
  return { lib, placedByClass: byClass, baselineByClass: byClass, onGoTo: () => {} };
}

beforeEach(() => { localStorage.clear(); });

describe('Årsöversikt del 14 (render smoke)', () => {
  it('Viktiga datum har alltid rubriken Betygssättning, med hänvisning när datum saknas', () => {
    const host = render(<Arsoversikt {...props()} />);
    expect(host.textContent).toContain('Betygssättning');
    expect(host.textContent).toContain('kugghjulet → Viktiga datum');
  });

  it('inlagda betygsdatum visas med vecka och svenskt datum', () => {
    setBetygsdatum([{ id: 'bd-1', label: 'Betygssättning HT', datum: '2026-12-11' }]);
    const host = render(<Arsoversikt {...props()} />);
    expect(host.textContent).toContain('Betygssättning HT');
    expect(host.textContent).toMatch(/v\.50/);
  });

  it('ämnesflikar visas när planeringar finns; ämnesvyn visar planeringens sammanfattning', () => {
    saveLokalPlanering({
      id: 'kemi-8f', klassNamn: '8F', amne: 'Kemi', bokTitel: 'Spektrum Kemi',
      farg: '#b45309', schema: [{ veckodag: 2, start: '10:00', slut: '11:00' }],
    });
    const host = render(<Arsoversikt {...props()} />);
    const kemiTab = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Kemi');
    expect(kemiTab).toBeDefined();
    act(() => { kemiTab?.click(); });
    expect(host.textContent).toContain('Spektrum Kemi');
    expect(host.textContent).toContain('Pass under läsåret');
    expect(host.textContent).toContain('Betygssättning'); // rubriken följer med alla ämnen
  });

  it('lektionsregler: gemensam grund som standard, ämnesanpassning slår igenom', () => {
    const host1 = render(<Arsoversikt {...props()} />);
    expect(host1.textContent).toContain('(gemensam grund)');
    expect(host1.textContent).toContain('Uppgiftsnivåer');

    setAmnesregler('Matematik', [{ rubrik: 'Miniräknare', text: 'Endast på röda uppgifter.' }]);
    const host2 = render(<Arsoversikt {...props()} />);
    expect(host2.textContent).toContain('(anpassade)');
    expect(host2.textContent).toContain('Miniräknare');
    expect(host2.textContent).not.toContain('Uppgiftsnivåer');
  });
});
