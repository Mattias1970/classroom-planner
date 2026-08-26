// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { NoPlanering } from '../src/views/NoPlanering';
import { lsSet } from '../src/state/store';

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(el); });
  return host;
}

/** Minibok i samma format som books/spektrum-biologi/book.json. */
const NO_BOK = {
  id: 'spektrum-biologi', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
  kapitel: [{
    nummer: 6, titel: 'Vår fantastiska kropp', sidor: '228–271',
    mal: ['att din kropp består av celler'],
    delkapitel: [
      { nummer: '6.1', titel: 'Celler i samarbete', sidor: '230–235',
        begrepp: ['cellteorin', 'stamcell'], extraBegrepp: ['ribosomer'],
        testaDigSjalv: { sida: 235, fragor: ['Hur får cellen sin energi?'] } },
      { nummer: '6.2', titel: 'Maten ger näring till cellerna', sidor: '238–241',
        begrepp: ['enzym'], extraBegrepp: [], testaDigSjalv: { sida: 241, fragor: ['Hur bearbetas maten i magsäcken?'] } },
    ],
    perspektiv: { titel: 'Stamceller framtidens reservdelar?', sidor: '236–237', fragor: ['Vad tycker du?'] },
    sammanfattning: { sidor: '267–268' },
    finalen: { sidor: '269–271', antalUppgifter: 12 },
  }],
};

beforeEach(() => { localStorage.clear(); });

describe('NoPlanering (render smoke)', () => {
  it('visar hjälptext och importknapp utan inläst bok', () => {
    const host = render(<NoPlanering />);
    expect(host.textContent).toContain('NO-planering');
    expect(host.textContent).toContain('Importera book.json');
    expect(host.textContent).toContain('Ingen NO-bok inläst');
  });

  it('läser cachen och visar lektionstabellen enligt NO-mallen', () => {
    lsSet('classroom-planner.no-bok.v1', JSON.stringify(NO_BOK));
    const host = render(<NoPlanering />);
    expect(host.textContent).toContain('Spektrum Biologi');
    expect(host.textContent).toContain('6. Vår fantastiska kropp');
    expect(host.textContent).toContain('Celler i samarbete');
    // Socrative-konventionen: exit ≥ 70 %, kumulativt läxförhör ≥ 90 %
    expect(host.textContent).toContain('Biologi61 (krav ≥ 70 %)');
    expect(host.textContent).toContain('Biologi61 (krav ≥ 90 %)');
    // Perspektiv, FINALEN och PROV renderas som rader/sektion
    expect(host.textContent).toContain('PERSPEKTIV');
    expect(host.textContent).toContain('FINALEN');
    expect(host.textContent).toContain('PROV');
    expect(host.textContent).toContain('Stamceller framtidens reservdelar?');
  });

  it('expanderar ett delkapitel och visar Testa dig själv-frågorna', () => {
    lsSet('classroom-planner.no-bok.v1', JSON.stringify(NO_BOK));
    const host = render(<NoPlanering />);
    const rad = [...host.querySelectorAll('td')].find((td) => td.textContent?.includes('6.1'));
    expect(rad).toBeTruthy();
    act(() => { rad!.closest('tr')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain('Testa dig själv 6.1');
    expect(host.textContent).toContain('Hur får cellen sin energi?');
    expect(host.textContent).toContain('ribosomer');
  });
});
