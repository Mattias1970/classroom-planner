import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LEKTIONSREGLER, normaliseraRegler, nyttBetygsdatumId, reglerForAmne,
  sorteraBetygsdatum, validateBetygsdatum,
} from '../src/domain/amnesregler.js';

describe('validateBetygsdatum', () => {
  it('kräver rubrik och giltigt ISO-datum', () => {
    expect(validateBetygsdatum({ id: 'bd-1', label: 'Betygssättning HT', datum: '2026-12-11' })).toEqual([]);
    expect(validateBetygsdatum({ id: 'bd-1', label: '', datum: '11/12' }).length).toBe(2);
    expect(validateBetygsdatum({ id: 'bd-1', label: 'X', datum: '2026-13-40' }).length).toBe(1);
  });
});

describe('sorteraBetygsdatum + nyttBetygsdatumId', () => {
  it('sorterar kronologiskt och ger nästa lediga id', () => {
    const s = sorteraBetygsdatum([
      { id: 'bd-2', label: 'VT', datum: '2027-06-04' },
      { id: 'bd-1', label: 'HT', datum: '2026-12-11' },
    ]);
    expect(s[0]?.label).toBe('HT');
    expect(nyttBetygsdatumId(['bd-1', 'bd-2'])).toBe('bd-3');
  });
});

describe('reglerForAmne — gemensam grund med ämnesvisa anpassningar', () => {
  it('ämne utan egen uppsättning får grunden (anpassade=false)', () => {
    const r = reglerForAmne({}, 'Kemi');
    expect(r.anpassade).toBe(false);
    expect(r.regler).toBe(DEFAULT_LEKTIONSREGLER);
    expect(r.regler.length).toBe(4);
  });

  it('ämne med egen uppsättning använder den (anpassade=true), andra ämnen påverkas inte', () => {
    const map = { Kemi: [{ rubrik: 'Säkerhet', text: 'Skyddsglasögon vid laborationer.' }] };
    expect(reglerForAmne(map, 'Kemi')).toEqual({ regler: map.Kemi, anpassade: true });
    expect(reglerForAmne(map, 'Matematik').anpassade).toBe(false);
  });
});

describe('normaliseraRegler', () => {
  it('rensar tomma rader och trimmar; helt tomt → null (återgå till grunden)', () => {
    expect(normaliseraRegler([
      { rubrik: '  Säkerhet ', text: ' Skyddsglasögon. ' },
      { rubrik: '', text: '   ' },
    ])).toEqual([{ rubrik: 'Säkerhet', text: 'Skyddsglasögon.' }]);
    expect(normaliseraRegler([{ rubrik: ' ', text: '' }])).toBeNull();
  });
});
