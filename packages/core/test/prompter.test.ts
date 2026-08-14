import { describe, expect, it } from 'vitest';
import { mergePromptSources, promptIdFromName, type PromptTemplate } from '../src/index.js';

function p(id: string, namn: string, kalla: PromptTemplate['kalla'], innehall = 'x'): PromptTemplate {
  return { id, namn, beskrivning: '', innehall, kalla };
}

describe('mergePromptSources', () => {
  it('egen variant vinner över datakälla som vinner över inbyggd', () => {
    const out = mergePromptSources(
      [p('a', 'Alfa', 'inbyggd', 'v1')],
      [p('a', 'Alfa', 'datakalla', 'v2'), p('b', 'Beta', 'datakalla')],
      [p('a', 'Alfa (min)', 'egen', 'v3')],
    );
    expect(out.find((x) => x.id === 'a')!.innehall).toBe('v3');
    expect(out.find((x) => x.id === 'a')!.kalla).toBe('egen');
    expect(out.find((x) => x.id === 'b')!.kalla).toBe('datakalla');
  });
  it('sorterar på svenskt namn', () => {
    const out = mergePromptSources([p('o', 'Örn', 'inbyggd'), p('a', 'Anka', 'inbyggd')], [], []);
    expect(out.map((x) => x.namn)).toEqual(['Anka', 'Örn']);
  });
});

describe('promptIdFromName', () => {
  it('slugifierar svenska namn och räknar upp vid krock', () => {
    expect(promptIdFromName('Lektionsgenerator för Prio 8', [])).toBe('lektionsgenerator-for-prio-8');
    expect(promptIdFromName('Ny Bok — Åk 9!', [])).toBe('ny-bok-ak-9');
    expect(promptIdFromName('Test', ['test'])).toBe('test-2');
    expect(promptIdFromName('Test', ['test', 'test-2'])).toBe('test-3');
  });
});
