// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { KlassHanterare } from '../src/views/KlassHanterare';
import { demoLibrary, getClassEdits, saveClassEdits, saveLokalBok } from '../src/state/store';
import { BOK_IMPORT_SCHEMA, validateBokImport } from '@planner/core';

beforeEach(() => { localStorage.clear(); saveClassEdits({}); });

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(el); });
  return host;
}
function setSelect(sel: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  setter.call(sel, value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('KlassHanterare – ämne och bok per klass (del 27)', () => {
  it('visar bokväljare per klass och sparar valet som overlay', () => {
    saveLokalBok(validateBokImport({
      schema: BOK_IMPORT_SCHEMA, version: 1,
      bok: { id: 'liber-matematik-y', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '4': { name: 'Algebra' } } },
      lektioner: { '4': [{ id: 1, avsnitt: '4.1', del: 1, ett: '1–5' }] },
    }));
    const lib = demoLibrary();
    const host = render(<KlassHanterare subject={lib.subject} datakallansBok={{ titel: 'Prio 8', amne: lib.subject.meta.ämne }} onClose={() => {}} onChange={() => {}} />);
    expect(host.textContent).toContain('gemensamt bokval');
    const bokSel = host.querySelector<HTMLSelectElement>(`select[aria-label="Bok för ${lib.subject.meta.klasser[0].namn}"]`)!;
    expect(bokSel).toBeTruthy();
    expect([...bokSel.options].some((o) => o.textContent?.includes('Matematik Y'))).toBe(true);
    act(() => { setSelect(bokSel, 'liber-matematik-y'); });
    expect(getClassEdits().renamed?.[lib.subject.meta.klasser[0].id]?.bokId).toBe('liber-matematik-y');
    expect(host.textContent).toContain('planeras nu efter Matematik Y, Liber');
  });

  it('ny klass kräver eget schema (inget arv) och skapas med ämne, bok och pass', () => {
    const lib = demoLibrary();
    const host = render(<KlassHanterare subject={lib.subject} onClose={() => {}} onChange={() => {}} />);
    expect(host.textContent).not.toContain('Ärv schema'); // del 28: arv borttaget
    const inSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const type = (el: HTMLInputElement, v: string) => act(() => { inSetter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
    type(host.querySelector<HTMLInputElement>('input[placeholder^="Namn"]')!, '8X');
    act(() => { setSelect(host.querySelector<HTMLSelectElement>('select[aria-label="Ämne för ny klass"]')!, 'Fysik'); });
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Lägg till klass'))!;
    expect(btn.disabled).toBe(true); // inget giltigt pass ännu
    type(host.querySelector<HTMLInputElement>('input[aria-label="Veckodag pass 1"]')!, 'Onsdag');
    expect(btn.disabled).toBe(false);
    act(() => { btn.click(); });
    const added = getClassEdits().added ?? [];
    expect(added).toHaveLength(1);
    expect(added[0].klass).toMatchObject({ namn: '8X', ämne: 'Fysik' });
    expect(added[0].klass.bokId).toBeUndefined();
    expect(added[0].schema).toEqual([{ day: 3, start: '08:10', end: '09:10' }]); // bokens lektioner mappas på detta
  });
});
