import { describe, expect, it } from 'vitest';
import { doldaOmraden, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, sattOmradeDolt, tomStruktur, visaAllaOmraden } from '../src/index.js';

function bygg() {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  return laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
}

describe('Del 159 · dolda områden på lektionskorten', () => {
  it('döljs per ämne i kortets ordning, slås på igen och visa alla', () => {
    let s = sattOmradeDolt(bygg(), 'ma', 'magma', true);
    s = sattOmradeDolt(s, 'ma', 'laxforhor', true);
    s = sattOmradeDolt(s, 'ma', 'magma', true);
    expect(doldaOmraden(s, 'ma')).toEqual(['laxforhor', 'magma']);
    s = sattOmradeDolt(s, 'ma', 'laxforhor', false);
    expect(doldaOmraden(s, 'ma')).toEqual(['magma']);
    s = visaAllaOmraden(s, 'ma');
    expect(doldaOmraden(s, 'ma')).toEqual([]);
    expect(s.amnen[0]).not.toHaveProperty('doldaOmraden');
    expect(() => sattOmradeDolt(s, 'x', 'magma', true)).toThrow(/Okänt ämne/);
  });
});
