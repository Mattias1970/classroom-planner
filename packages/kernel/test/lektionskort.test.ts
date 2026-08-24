import { describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  arbetsNivaer, bamTidslinje, begreppForLektion, effektivaNivaer, exitStart, tavelrubrik, tillKlockslag, tillMin,
} from '../src/domain/lektionskort.js';
import { uppdateraKlass, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur } from '../src/domain/typer.js';

const REG = { typ: 'regular' as const };

describe('bamTidslinje', () => {
  it('60-minuterspass: Läxförhör 10, Genomgång 15, Arbete 25, Exit 10 — med klockslag', () => {
    const seg = bamTidslinje(REG, '09:00', '10:00');
    expect(seg.map((s) => `${s.namn} ${s.start}–${s.slut} (${s.minuter})`)).toEqual([
      'Läxförhör 09:00–09:10 (10)',
      'Genomgång 09:10–09:25 (15)',
      'Arbete 09:25–09:50 (25)',
      'Exit ticket 09:50–10:00 (10)',
    ]);
    expect(seg.reduce((a, s) => a + s.minuter, 0)).toBe(60);
  });
  it('40-minuterspass: kortare block, exit 8 min; summan stämmer alltid', () => {
    const seg = bamTidslinje(REG, '08:10', '08:50');
    expect(seg.reduce((a, s) => a + s.minuter, 0)).toBe(40);
    expect(seg[seg.length - 1]).toMatchObject({ namn: 'Exit ticket', minuter: 8, slut: '08:50' });
  });
  it('prov: instruktion + provtid', () => {
    expect(bamTidslinje({ typ: 'exam' }, '09:00', '10:00')).toEqual([
      { namn: 'Instruktion', ikon: '📋', start: '09:00', slut: '09:05', minuter: 5 },
      { namn: 'Prov', ikon: '📝', start: '09:05', slut: '10:00', minuter: 55 },
    ]);
  });
  it('exitStart ger exit ticketens klockslag; tid-hjälparna räknar rätt', () => {
    expect(exitStart(REG, '09:00', '10:00')).toBe('09:50');
    expect(exitStart({ typ: 'exam' }, '09:00', '10:00')).toBeNull();
    expect(tillMin('09:05')).toBe(545);
    expect(tillKlockslag(545)).toBe('09:05');
    expect(tavelrubrik('Ma', '09:00', '10:00')).toBe('Ma 09:00–10:00');
  });
});

describe('arbetsNivaer', () => {
  it('del 1 arbetar nivå 1/2 (minimum 1); del 2 arbetar nivå 2/3 (minimum 2)', () => {
    expect(arbetsNivaer({ del: 1 })).toEqual({ arbetar: [1, 2], minimum: 1 });
    expect(arbetsNivaer({ del: 2 })).toEqual({ arbetar: [2, 3], minimum: 2 });
  });
});

describe('begreppForLektion + socrative', () => {
  const bok = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'b', titel: 'B', förlag: 'F', ämne: 'Ma', årskurs: 8, kapitelMeta: { '4': { name: 'Algebra' } } },
    lektioner: { '4': [
      { id: 1, type: 'regular', avsnitt: '4.6 Ekvationer', del: 1, begrepp: 'ekvation, obekant', ex: 'Uppg. 133a', soc_start: 'Fråga 1', exit: 'Exit 4.6' },
      { id: 2, type: 'regular', avsnitt: '4.6 Ekvationer', del: 2, begrepp: 'balansmetoden' },
      { id: 3, type: 'review', avsnitt: 'Blandade uppgifter', del: 1, begrepp: 'x, y' },
    ] },
  }));
  it('hämtar delkapitlets samlade begrepp; extra lektioner får sina egna; ex/socStart/exit läses', () => {
    const [l1, l2] = bok.kapitel[0].delkapitel[0].lektioner;
    expect(begreppForLektion(bok, 4, l1)).toEqual(['ekvation', 'obekant', 'balansmetoden']);
    expect(begreppForLektion(bok, 4, l2)).toEqual(['ekvation', 'obekant', 'balansmetoden']);
    expect(begreppForLektion(bok, 4, bok.kapitel[0].extraLektioner[0])).toEqual(['x', 'y']);
    expect(l1.ex).toBe('Uppg. 133a');
    expect(l1.socStart).toBe('Fråga 1');
    expect(l1.exit).toBe('Exit 4.6');
  });
  it('uppdateraKlass byter namn utan att röra id/tjänst', () => {
    let s = tomStruktur();
    s = laggTillSkolar(s, { id: 'la', namn: 'x', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    const ny = uppdateraKlass(s, 'k', { namn: '8C', id: 'hack', tjanstId: 'hack' } as never);
    expect(ny.klasser[0]).toEqual({ id: 'k', tjanstId: 'tj', namn: '8C' });
  });
});

describe('effektivaNivaer — lärarens överstyrning av uppgiftsintervall', () => {
  const lekt = { niva1: '1–6', niva2: '7–12', niva3: '—' };
  it('utan överstyrning gäller bokens värden', () => {
    expect(effektivaNivaer(lekt, null)).toEqual({ niva1: '1–6', niva2: '7–12', niva3: '—' });
  });
  it('överstyrning per nivå; tom sträng faller tillbaka på boken', () => {
    expect(effektivaNivaer(lekt, { uppgNiva1: '1–8', uppgNiva3: '13–18' }))
      .toEqual({ niva1: '1–8', niva2: '7–12', niva3: '13–18' });
    expect(effektivaNivaer(lekt, { uppgNiva1: '  ' }).niva1).toBe('1–6');
  });
});
