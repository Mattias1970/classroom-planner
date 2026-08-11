// @vitest-environment jsdom
/**
 * Render-röktest: monterar hela appen i jsdom och klickar igenom samtliga
 * toppflikar och inre kapitelflikar. Fångar "vit skärm"-regressioner där
 * ett menyklick kraschar renderingen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import App from '../src/app/App.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function clickButtonByText(text: string, scope = 'body'): boolean {
  const btns = [...document.querySelectorAll(`${scope} button`)];
  const b = btns.find((x) => (x.textContent ?? '').trim().includes(text));
  if (!b) return false;
  act(() => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return true;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function polluteStorage(): void {
  // Efterliknar kvarvarande state från en tidigare GitHub-session
  localStorage.setItem('classroom-planner.lesson-links.v1', JSON.stringify({
    '1:1': [{ typ: 'quiz', titel: 'Gammal quiz', url: 'socrative.com' },
            { typ: 'magma', titel: 'Gammal magma', url: 'magma.se' }],
    '3:12': [{ typ: 'film', titel: 'Kap3-film', url: 'binogi.se' }],
  }));
  localStorage.setItem('classroom-planner.cal-overrides.v1', JSON.stringify({
    '8B': { 120: { type: 'cancelled', reason: 'NP' }, 1: { type: 'shifted', reason: 'x' } },
  }));
  localStorage.setItem('classroom-planner.schema-edits.v1', JSON.stringify({
    startdatum: [2026, 7, 24],
    schema: { '8B': [{ day: 4, start: '10:00', end: '11:00' }], '8X': [{ day: 1, start: '08:00', end: '09:00' }] },
  }));
  localStorage.setItem('classroom-planner.class-edits.v1', JSON.stringify({
    added: [{ klass: { id: '8A', namn: '8A', läsår: '2026/27', socrative: 'Matte8A', arkiverad: false }, schema: [{ day: 2, start: '09:00', end: '10:00' }] }],
    archived: { '8F': true },
  }));
  localStorage.setItem('classroom-planner.class-notes.v1', JSON.stringify({ '8B:1:1': 'anteckning' }));
  localStorage.setItem('classroom-planner.magma.v1', JSON.stringify({ '1:2': { label: 'övning', url: 'magma.se/x' } }));
  localStorage.setItem('classroom-planner.overrides.v1', JSON.stringify([
    { kapitel: 1, lektionId: 1, field: 'genomgang', value: 'ändrad', updatedAt: '2026-08-01T10:00:00Z' },
  ]));
}

describe('render-röktest: menynavigation kraschar aldrig', () => {
  it('monterar appen (demo-läge) med årsöversikten', () => {
    act(() => { root.render(React.createElement(App)); });
    expect(container.textContent).toContain('Årsöversikt');
  });

  it('alla toppflikar renderar innehåll — även med kvarvarande state från tidigare session', () => {
    polluteStorage();
    act(() => { root.render(React.createElement(App)); });
    for (const tabName of ['Planering', 'Kalender', 'Klasser', 'Bibliotek', 'Inställningar', 'Årsöversikt']) {
      const found = clickButtonByText(tabName);
      expect(found, `flik "${tabName}" finns`).toBe(true);
      expect(container.textContent?.length ?? 0, `flik "${tabName}" renderar innehåll`).toBeGreaterThan(50);
    }
  });

  it('alla sju inre kapitelflikar renderar innehåll — även med kvarvarande state', () => {
    polluteStorage();
    act(() => { root.render(React.createElement(App)); });
    clickButtonByText('Planering');
    for (const inner of ['Översikt', 'Uppgifter', 'Begrepp', 'Filmer', 'Magma', 'Klasser', 'Lektionsplan']) {
      const found = clickButtonByText(inner, '.inner-tabs');
      expect(found, `inre flik "${inner}" finns`).toBe(true);
      expect(container.textContent?.length ?? 0, `inre flik "${inner}" renderar innehåll`).toBeGreaterThan(50);
    }
  });
});
