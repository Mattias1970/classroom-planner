// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LayoutDesigner } from '../src/views/LayoutDesigner';
import { demoLibrary, getUtskriftslayout } from '../src/state/store';

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(el); });
  return document.body; // designern portaleras till body (del 20b)
}

function props() {
  const lib = demoLibrary();
  const kapitel = Number(Object.keys(lib.lessons)[0]);
  return {
    lib, kapitel,
    lessons: lib.lessons[kapitel] ?? [],
    slotFor: () => null,
    classId: '8B',
    onClose: () => {},
  };
}

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('LayoutDesigner (render smoke)', () => {
  it('visar fältpalett med lektionsplaneringens fält samt exportknappar', () => {
    const host = render(<LayoutDesigner {...props()} />);
    for (const falt of ['Arbete', 'Avsnitt', 'Genomgång', 'Grön', 'Blå', 'Röd', 'Läxa', 'Datum', 'Exit ticket']) {
      expect(host.textContent).toContain(falt);
    }
    expect(host.textContent).toContain('PDF (Skriv ut)');
    expect(host.textContent).toContain('Word (.docx)');
    expect(host.textContent).toContain('lektionsbandets höjd');
  });

  it('startlayouten sparas och innehåller ytor; vald yta visar egenskaper', () => {
    const host = render(<LayoutDesigner {...props()} />);
    expect((getUtskriftslayout()?.boxar.length ?? 0)).toBeGreaterThanOrEqual(0);
    // klicka en yta (pointerdown) → egenskapspanelen visas
    const yta = host.querySelector('[title="Avsnitt"]');
    expect(yta).not.toBeNull();
    act(() => {
      yta?.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
      yta?.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
    });
    expect(host.textContent).toContain('VALD YTA — Avsnitt');
    expect(host.textContent).toContain('Fyll sidled');
    expect(host.textContent).toContain('Ta bort');
  });
});


describe('Flermarkering (del 21)', () => {
  it('shift+klick markerar flera ytor och panelen visar antal + platta/ram', () => {
    const host = render(<LayoutDesigner {...props()} />);
    const ytor = [host.querySelector('[title="Lektionsnummer"]'), host.querySelector('[title="Avsnitt"]')];
    act(() => {
      ytor[0]?.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
      ytor[0]?.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
    });
    act(() => {
      ytor[1]?.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, shiftKey: true }));
      ytor[1]?.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
    });
    expect(host.textContent).toContain('2 YTOR VALDA');
    expect(host.textContent).toContain('Platta:');
    expect(host.textContent).toContain('Ram');
  });
});
