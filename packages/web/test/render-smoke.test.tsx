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

describe('render-röktest: menynavigation kraschar aldrig', () => {
  it('monterar appen (demo-läge) med årsöversikten', () => {
    act(() => { root.render(React.createElement(App)); });
    expect(container.textContent).toContain('Årsöversikt');
  });

  it('alla toppflikar renderar innehåll', () => {
    act(() => { root.render(React.createElement(App)); });
    for (const tabName of ['Planering', 'Kalender', 'Klasser', 'Bibliotek', 'Inställningar', 'Årsöversikt']) {
      const found = clickButtonByText(tabName);
      expect(found, `flik "${tabName}" finns`).toBe(true);
      expect(container.textContent?.length ?? 0, `flik "${tabName}" renderar innehåll`).toBeGreaterThan(50);
    }
  });

  it('alla sju inre kapitelflikar renderar innehåll', () => {
    act(() => { root.render(React.createElement(App)); });
    clickButtonByText('Planering');
    for (const inner of ['Översikt', 'Uppgifter', 'Begrepp', 'Filmer', 'Magma', 'Klasser', 'Lektionsplan']) {
      const found = clickButtonByText(inner, '.inner-tabs');
      expect(found, `inre flik "${inner}" finns`).toBe(true);
      expect(container.textContent?.length ?? 0, `inre flik "${inner}" renderar innehåll`).toBeGreaterThan(50);
    }
  });
});
