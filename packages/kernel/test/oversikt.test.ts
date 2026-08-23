import { describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { skapaPlanering } from '../src/domain/struktur.js';
import { kapitelKort, viktigaDatum } from '../src/domain/oversikt.js';
import type { Skolar } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] };
const bok = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'b', titel: 'B', förlag: 'F', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#8d4a2f' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8', begrepp: 'täljare, nämnare', sidor_teori: 's. 10' },
    { id: 2, type: 'repetition', avsnitt: 'Repetition 1.1', del: 1 },
    { id: 3, type: 'review', avsnitt: 'Diagnos 1.1', del: 1 },
    { id: 4, type: 'exam', avsnitt: 'Prov i Tal', del: 1 },
  ] },
}));

describe('årsöversikt', () => {
  const plan = skapaPlanering(LA, [{ dag: 2, start: '09:00', slut: '10:00' }], bok);
  it('kapitelKort räknar lektioner, begrepp, filmer och veckospann', () => {
    const kort = kapitelKort(bok, plan);
    expect(kort).toHaveLength(1);
    expect(kort[0]).toMatchObject({ nr: 1, namn: 'Tal', antalLektioner: 4, begreppAntal: 2, filmAntal: 0 });
    expect(kort[0].forstaVecka).toBe(34);
    expect(kort[0].sistaVecka).not.toBeNull();
  });
  it('viktigaDatum plockar repetition, diagnos och prov med datum', () => {
    const vd = viktigaDatum(plan);
    expect(vd.map((v) => v.typ)).toEqual(['repetition', 'diagnos', 'prov']);
    expect(vd[2]).toMatchObject({ kapitel: 1, etikett: 'Prov i Tal' });
    expect(vd[0].datum).not.toBeNull();
  });
});
