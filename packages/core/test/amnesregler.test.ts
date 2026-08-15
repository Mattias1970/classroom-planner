import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LEKTIONSREGLER, normaliseraRegler, nyttBetygsdatumId, reglerForAmne,
  sorteraBetygsdatum, validateBetygsdatum,
  placeraBetygsdatum,
} from '../src/domain/amnesregler.js';
import { fargForKlass } from '../src/domain/lokal-planering.js';

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

describe('placeraBetygsdatum — integreras i kapitelkolumnerna (del 15)', () => {
  const spann = [
    { kapitel: 1, forsta: '2026-08-20', sista: '2026-10-02' },
    { kapitel: 2, forsta: '2026-10-05', sista: '2026-11-20' },
    { kapitel: 3, forsta: '2026-11-23', sista: '2027-02-05' },
  ];
  it('datum hamnar i det kapitel som pågår/senast börjat', () => {
    const ut = placeraBetygsdatum([
      { id: 'bd-1', label: 'HT', datum: '2026-12-11' },
      { id: 'bd-2', label: 'Mitt i kap 2', datum: '2026-11-01' },
    ], spann);
    expect(ut[3]?.[0]?.label).toBe('HT');
    expect(ut[2]?.[0]?.label).toBe('Mitt i kap 2');
  });
  it('datum före läsåret hamnar i första kapitlet; datum efter allt i sista', () => {
    const ut = placeraBetygsdatum([
      { id: 'bd-1', label: 'Tidigt', datum: '2026-06-01' },
      { id: 'bd-2', label: 'VT', datum: '2027-06-04' },
    ], spann);
    expect(ut[1]?.[0]?.label).toBe('Tidigt');
    expect(ut[3]?.[0]?.label).toBe('VT');
  });
  it('tomt spann ger tomt resultat', () => {
    expect(placeraBetygsdatum([{ id: 'bd-1', label: 'X', datum: '2026-12-11' }], [])).toEqual({});
  });
});

describe('fargForKlass', () => {
  it('stabil och giltig hexfärg; olika klasser får normalt olika färg', () => {
    expect(fargForKlass('8B')).toBe(fargForKlass('8B'));
    expect(fargForKlass('8B')).toMatch(/^#[0-9a-f]{6}$/);
    expect(fargForKlass('8B')).not.toBe(fargForKlass('8F'));
  });
});
