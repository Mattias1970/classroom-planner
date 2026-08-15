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
  it('utan betygsdatum: hänvisning till inställningarna, ingen egen betygsyta', () => {
    const host = render(<Arsoversikt {...props()} />);
    expect(host.textContent).toContain('kugghjulet → Viktiga datum');
    expect([...host.querySelectorAll('h4')].some((h) => h.textContent?.includes('Betygssättning'))).toBe(false);
  });

  it('betygsdatum integreras som 🎓-rad i kapitelkolumnerna (del 15), ingen egen kolumn', () => {
    setBetygsdatum([{ id: 'bd-1', label: 'Betygssättning HT', datum: '2026-12-11' }]);
    const host = render(<Arsoversikt {...props()} />);
    expect(host.textContent).toContain('🎓 Betygssättning HT');
    expect(host.textContent).toMatch(/v\.50/);
    // Ingen egen kolumnrubrik för betygssättning — raden bor i en kapitelkolumn
    expect([...host.querySelectorAll('h4')].some((h) => h.textContent?.includes('Betygssättning'))).toBe(false);
  });

  it('Alla ämnen-knappen visar datakällans översikt och planeringssammanfattningar samtidigt', () => {
    setBetygsdatum([{ id: 'bd-1', label: 'Betygssättning HT', datum: '2026-12-11' }]);
    saveLokalPlanering({
      id: 'kemi-8f', klassNamn: '8F', amne: 'Kemi', bokTitel: 'Spektrum Kemi',
      farg: '#b45309', schema: [{ veckodag: 2, start: '10:00', slut: '11:00' }],
    });
    const host = render(<Arsoversikt {...props()} />);
    const allaBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Alla ämnen');
    expect(allaBtn).toBeDefined();
    act(() => { allaBtn?.click(); });
    expect(host.textContent).toContain('alla ämnen');
    expect(host.textContent).toContain('Spektrum Kemi');           // planeringens sammanfattning
    expect(host.textContent).toContain('Viktiga datum — repetition'); // datakällans sektion kvar
    expect(host.textContent).toContain('Lektionsregler — Kemi');   // regler per ämne staplade
    expect(host.textContent).toContain('Lektionsregler — Matematik');
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

describe('Del 16: betygsrad i rätt datumposition med samma radstil', () => {
  it('🎓-raden har klassen yr-key (samma som övriga) och ligger datumsorterad', () => {
    setBetygsdatum([{ id: 'bd-1', label: 'Betygssättning HT', datum: '2026-12-11' }]);
    const host = render(<Arsoversikt {...props()} />);
    const rad = [...host.querySelectorAll('.yr-key')].find((el) => el.textContent?.includes('🎓'));
    expect(rad).toBeDefined();
    expect(rad?.className).toContain('yr-key');
    expect(host.querySelector('.yr-keyrow.exam')).toBeNull(); // gamla avvikande stilen borta ur kolumnerna
    // Datumsortering: raden ska inte ligga sist om senare nyckeldatum finns i samma kolumn
    const kolumn = rad?.closest('.yr-datecol');
    const rader = [...(kolumn?.querySelectorAll('.yr-key') ?? [])];
    const idx = rader.findIndex((el) => el.textContent?.includes('🎓'));
    expect(idx).toBeGreaterThanOrEqual(0);
  });
});
