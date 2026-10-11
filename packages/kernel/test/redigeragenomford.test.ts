/**
 * Del 188 · Redigera genomförda lektioner: nytt innehåll på ett pass som varit ändrar bara det
 * passet — inga andra lektioner flyttas. Genomförda lektioner kan inte tas bort.
 */
import { describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { amnesPlanFor, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, sattLektionsVal, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const BOK = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'b', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [1, 2, 3, 4].map((id) => ({ id, type: 'regular', avsnitt: `1.${id} Del ${id}`, del: 1 })) },
}));
const IDAG = '2026-08-26';
function s0(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'b', schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
  return registreraPlanering(s, { id: 'p', amneId: 'ma', bokId: 'b', skapad: '2026-08-10' });
}
const rad = (s: Struktur) => amnesPlanFor(s, 'ma', IDAG)!.a.map((r) => `${r.datum}:${r.nyckel}:${r.lektion.avsnitt}`);

describe('Del 188 · redigera genomförda lektioner', () => {
  it('ersätt innehållet på ett pass som varit: bara det passet ändras', () => {
    const s = s0();
    const fore = rad(s);
    expect(fore.slice(0, 2)).toEqual(['2026-08-18:1:1:1.1 Del 1', '2026-08-20:1:2:1.2 Del 2']);
    const ut = sattLektionsVal(s, 'ma', '1:2', { ersatt: { rubrik: 'Övning', typ: 'ovning' } }, IDAG);
    const efter = rad(ut);
    expect(efter[1]).toBe('2026-08-20:1:2:Övning');
    expect(efter.filter((_, i) => i !== 1)).toEqual(fore.filter((_, i) => i !== 1));
    // Återställ
    expect(rad(sattLektionsVal(ut, 'ma', '1:2', null, IDAG))).toEqual(fore);
  });

  it('en genomförd lektion kan inte tas bort; en kommande kan', () => {
    const s = s0();
    expect(() => sattLektionsVal(s, 'ma', '1:2', { bort: true }, IDAG)).toThrow(/har varit/);
    expect(() => sattLektionsVal(s, 'ma', '1:3', { bort: true }, IDAG)).toThrow(/har varit/);   // tis 25/8
    expect(rad(sattLektionsVal(s, 'ma', '1:4', { bort: true }, IDAG)).map((x) => x.split(':')[0]).slice(0, 3)).toEqual(['2026-08-18', '2026-08-20', '2026-08-25']);
    expect(rad(sattLektionsVal(s, 'ma', '1:4', { bort: true }, IDAG))).toHaveLength(3);
  });
});
