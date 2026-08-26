import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  biologiBegreppPerDelkapitel,
  biologiBokTillLokalBok,
  socrativeExitRum,
  socrativeLaxforhorRum,
  validateBiologiBok,
} from '../src/index.js';

/** Minifixtur i samma format som books/spektrum-biologi/book.json. */
function fixtur(): unknown {
  const del = (nummer: string, titel: string, begrepp: string[]) => ({
    nummer, titel, sidor: '156–161', begrepp, extraBegrepp: ['evolution'],
    testaDigSjalv: { sida: 161, fragor: ['Vad skiljer en biotop från ett habitat?'] },
  });
  return {
    id: 'spektrum-biologi', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
    kapitel: [
      {
        nummer: 4, titel: 'Ekologi', undertitel: 'Liv och utveckling', sidor: '155–183',
        mal: ['beskriva ekosystem och ekosystemtjänster'],
        delkapitel: [
          del('4.1', 'Liv i samspel', ['ekologi', 'ekosystem']),
          del('4.2', 'Energi och materia', ['fotosyntes', 'bärförmåga']),
          del('4.3', 'Olika känsliga system', ['resiliens']),
          del('4.4', 'Bruka utan att förbruka', ['ekosystemtjänst']),
        ],
        perspektiv: { titel: 'Tar fisken slut?', sidor: '178–179', fragor: ['Fråga A', 'Fråga B'] },
        sammanfattning: { sidor: '180–181' },
        finalen: { sidor: '182–183', antalUppgifter: 8 },
      },
      {
        nummer: 6, titel: 'Vår fantastiska kropp', sidor: '228–271', mal: [],
        delkapitel: ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8']
          .map((n, i) => del(n, `Delkapitel ${n}`, [`begrepp${i + 1}`])),
        finalen: { sidor: '269–271', antalUppgifter: 12 },
      },
    ],
  };
}

describe('Socrative-namnkonventionen', () => {
  it('bygger enskilda rum av prefix + kapitel + delkapitelnummer', () => {
    expect(socrativeExitRum('Biologi', 6, 1)).toBe('Biologi61');
    expect(socrativeExitRum('Biologi', 6, 8)).toBe('Biologi68');
    expect(socrativeExitRum('Biologi', 4, 3)).toBe('Biologi43');
  });

  it('bygger kumulativa rum med alla ordningstal i följd', () => {
    expect(socrativeLaxforhorRum('Biologi', 6, 1)).toBe('Biologi61');
    expect(socrativeLaxforhorRum('Biologi', 6, 2)).toBe('Biologi612');
    expect(socrativeLaxforhorRum('Biologi', 6, 3)).toBe('Biologi6123');
    expect(socrativeLaxforhorRum('Biologi', 6, 8)).toBe('Biologi612345678');
    expect(socrativeLaxforhorRum('Biologi', 4, 4)).toBe('Biologi41234');
  });
});

describe('validateBiologiBok', () => {
  it('accepterar bokformatet och normaliserar saknade fält till "—"', () => {
    const rå = fixtur() as { kapitel: Array<Record<string, unknown>> };
    delete rå.kapitel[0].sidor;
    const bok = validateBiologiBok(rå);
    expect(bok.titel).toBe('Spektrum Biologi');
    expect(bok.kapitel).toHaveLength(2);
    expect(bok.kapitel[0].sidor).toBe('—');
    expect(bok.kapitel[0].delkapitel[0].begrepp).toEqual(['ekologi', 'ekosystem']);
    expect(bok.kapitel[0].perspektiv?.fragor).toHaveLength(2);
    expect(bok.kapitel[1].finalen?.antalUppgifter).toBe(12);
  });

  it('kastar ValidationError med svenskt meddelande vid strukturfel', () => {
    expect(() => validateBiologiBok(null)).toThrow(ValidationError);
    expect(() => validateBiologiBok({ id: 'x', titel: 'Y' })).toThrow(/kapitel/);
    expect(() => validateBiologiBok({
      id: 'x', titel: 'Y', kapitel: [{ nummer: 4, titel: 'Ekologi', delkapitel: [{ titel: 'Utan nummer' }] }],
    })).toThrow(/delkapitel 1/);
  });

  it('muterar aldrig indata', () => {
    const rå = fixtur();
    const före = JSON.stringify(rå);
    validateBiologiBok(rå);
    expect(JSON.stringify(rå)).toBe(före);
  });
});

describe('biologiBokTillLokalBok (NO-planeringsmallen)', () => {
  const bok = biologiBokTillLokalBok(validateBiologiBok(fixtur()));

  it('bygger BookFile med kapitelMeta per kapitel', () => {
    expect(bok.bok.id).toBe('spektrum-biologi');
    expect(bok.bok.ämne).toBe('Biologi');
    expect(bok.bok.kapitelMeta['4'].name).toBe('Ekologi');
    expect(bok.bok.kapitelMeta['4'].sidor_samm).toBe('180–181');
    expect(bok.bok.kapitelMeta['4'].lektioner).toBe(7); // 4 delkapitel + Perspektiv + FINALEN + PROV
    expect(bok.bok.kapitelMeta['6'].lektioner).toBe(10); // 8 delkapitel + FINALEN + PROV
  });

  it('ger varje delkapitel en lektion med exit ≥ 70 % och kumulativt läxförhör ≥ 90 %', () => {
    const kap6 = bok.lektioner[6];
    expect(kap6[0].soc_start).toBe('—'); // första lektionen har inget läxförhör
    expect(kap6[0].exit).toBe('Biologi61 (krav ≥ 70 %)');
    expect(kap6[1].soc_start).toBe('Biologi61 (krav ≥ 90 %)');
    expect(kap6[2].soc_start).toBe('Biologi612 (krav ≥ 90 %)');
    expect(kap6[7].soc_start).toBe('Biologi61234567 (krav ≥ 90 %)');
    expect(kap6[7].exit).toBe('Biologi68 (krav ≥ 70 %)');
    expect(kap6[0].laxa).toContain('Biologi61 ≥ 90 %');
    expect(kap6[7].laxa).toContain('Biologi612345678 ≥ 90 %');
  });

  it('fyller lektionsfälten från delkapitlet', () => {
    const l = bok.lektioner[4][1];
    expect(l.avsnitt).toBe('4.2');
    expect(l.genomgang).toBe('Energi och materia');
    expect(l.begrepp).toBe('fotosyntes · bärförmåga');
    expect(l.sidor_teori).toBe('156–161');
    expect(l.ex).toBe('Testa dig själv 4.2');
    expect(l.grön).toBe('—'); // nivåfälten används inte i NO
  });

  it('lägger Perspektiv, FINALEN och PROV efter delkapitlen', () => {
    const kap4 = bok.lektioner[4];
    const [perspektiv, finalen, prov] = kap4.slice(4);
    expect(perspektiv.type).toBe('ovaformagor');
    expect(perspektiv.avsnitt).toBe('PERSPEKTIV');
    expect(perspektiv.genomgang).toBe('Tar fisken slut?');
    expect(perspektiv.ex).toBe('2 diskussionsfrågor (EPA)');
    expect(perspektiv.soc_start).toBe('Biologi41234 (krav ≥ 90 %)');
    expect(finalen.type).toBe('repetition');
    expect(finalen.ex).toBe('8 uppgifter');
    expect(prov.type).toBe('exam');
    expect(prov.sidor_teori).toBe('180–181');
    // Kapitel 6 saknar perspektiv → FINALEN kommer direkt efter delkapitlen
    expect(bok.lektioner[6][8].avsnitt).toBe('FINALEN');
    expect(bok.lektioner[6][9].avsnitt).toBe('PROV');
  });

  it('ger lektionerna löpande id inom kapitlet', () => {
    expect(bok.lektioner[4].map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('biologiBegreppPerDelkapitel', () => {
  it('mappar delkapitelnummer till begreppslistor', () => {
    const begrepp = biologiBegreppPerDelkapitel(validateBiologiBok(fixtur()));
    expect(begrepp['4.1']).toEqual(['ekologi', 'ekosystem']);
    expect(begrepp['6.8']).toEqual(['begrepp8']);
  });
});
