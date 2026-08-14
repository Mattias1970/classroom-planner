import { describe, expect, it } from 'vitest';
import { parseTokenExpiry, resolveField, uniqueVariantName, EMPTY_VARIANTS } from '../src/index.js';

describe('resolveField — variantprecedens', () => {
  const variants = { active: 'Lugnare tempo', varianter: { 'Lugnare tempo': { genomgang: 'variantens text' } } };
  it('aktiv variant vinner över basöverstyrning och källa', () => {
    expect(resolveField('källa', 'bas', variants, 'genomgang')).toBe('variantens text');
  });
  it('fält som varianten inte satt faller tillbaka till bas, sedan källa', () => {
    expect(resolveField('källa', 'bas', variants, 'laxa')).toBe('bas');
    expect(resolveField('källa', undefined, variants, 'laxa')).toBe('källa');
  });
  it('utan aktiv variant gäller basöverstyrning → källa', () => {
    expect(resolveField('källa', 'bas', EMPTY_VARIANTS, 'genomgang')).toBe('bas');
    expect(resolveField('källa', undefined, EMPTY_VARIANTS, 'genomgang')).toBe('källa');
  });
});

describe('uniqueVariantName', () => {
  it('behåller ledigt namn och räknar upp vid krock', () => {
    expect(uniqueVariantName('Stödgrupp', [])).toBe('Stödgrupp');
    expect(uniqueVariantName('Stödgrupp', ['Stödgrupp'])).toBe('Stödgrupp 2');
    expect(uniqueVariantName('', [])).toBe('Variant');
  });
});

describe('parseTokenExpiry', () => {
  const now = new Date('2026-08-14T00:00:00Z');
  it('tolkar GitHubs headerformat och räknar dagar kvar', () => {
    const t = parseTokenExpiry('2026-09-13 00:00:00 UTC', now);
    expect(t).toEqual({ iso: '2026-09-13', daysLeft: 30 });
  });
  it('tolkar ISO-format och hanterar utgången token', () => {
    expect(parseTokenExpiry('2026-08-01T00:00:00Z', now)!.daysLeft).toBeLessThan(0);
  });
  it('null för saknad eller trasig header', () => {
    expect(parseTokenExpiry(null, now)).toBeNull();
    expect(parseTokenExpiry('banan', now)).toBeNull();
  });
});
