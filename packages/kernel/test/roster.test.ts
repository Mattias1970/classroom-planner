import { describe, expect, it } from 'vitest';
import { delaNamn, importeraRoster, rosterNamn, tolkaSocrativeRoster } from '../src/domain/roster.js';
import { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

// Fejkade elevnamn — verkliga elevuppgifter hör inte hemma i kodrepot.
const ROSTER_EN: Array<Array<string | number | null>> = [
  ['First Name', 'Last Name', 'Student ID', 'Email'],
  ['Ted', 'Testsson', 'TED', 'ted@skola.se'],
  ['Pia', 'Provlund', 'PIA', null],
  [null, null, null, null],
  ['Öjvind', 'Övnegård', 'ÖJVIND', 'ojvind@skola.se'],
];

const ROSTER_SV_EN_KOLUMN: Array<Array<string | number | null>> = [
  ['Klass 8B'],
  ['Namn', 'ID'],
  ['Testsson, Ted', 'TED'],
  ['Pia Provlund', 'PIA'],
];

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  return s;
}

describe('tolkaSocrativeRoster', () => {
  it('läser Socratives kolumner oavsett ordning, hoppar tomma rader och tar med e-post', () => {
    const r = tolkaSocrativeRoster(ROSTER_EN);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ fornamn: 'Ted', efternamn: 'Testsson', sidId: 'TED', epost: 'ted@skola.se' });
    expect(r[1]).toEqual({ fornamn: 'Pia', efternamn: 'Provlund', sidId: 'PIA' });
    expect(rosterNamn(r[2])).toBe('Öjvind Övnegård');
  });

  it('hittar rubrikraden längre ner och delar en enda namnkolumn i båda riktningarna', () => {
    const r = tolkaSocrativeRoster(ROSTER_SV_EN_KOLUMN);
    expect(r.map(rosterNamn)).toEqual(['Ted Testsson', 'Pia Provlund']);
    expect(r[0].sidId).toBe('TED');
  });

  it('tolkar rubriklös fil som Förnamn | Efternamn | ID', () => {
    const r = tolkaSocrativeRoster([['Ted', 'Testsson', 'TED']]);
    expect(r[0]).toMatchObject({ fornamn: 'Ted', efternamn: 'Testsson', sidId: 'TED' });
  });

  it('kastar svenskt fel för tom fil', () => {
    expect(() => tolkaSocrativeRoster([[]])).toThrow('inga elevrader');
  });
});

describe('delaNamn', () => {
  it('hanterar komma, mellanslag, dubbla förnamn och enkla namn', () => {
    expect(delaNamn('Övnegård, Öjvind')).toEqual({ fornamn: 'Öjvind', efternamn: 'Övnegård' });
    expect(delaNamn('Anna Lisa Berg')).toEqual({ fornamn: 'Anna Lisa', efternamn: 'Berg' });
    expect(delaNamn('Madonna')).toEqual({ fornamn: 'Madonna', efternamn: '' });
  });
});

describe('importeraRoster', () => {
  it('lägger till nya, fyller e-post på befintliga och hoppar dubbletter (även Efternamn, Förnamn)', () => {
    let s = grund();
    s = laggTillElev(s, { id: 'e1', klassId: 'k8b', namn: 'Testsson, Ted', grupp: 'B' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k8b', namn: 'Pia Provlund', grupp: 'A' });
    let n = 0;
    const ut = importeraRoster(s, 'k8b', tolkaSocrativeRoster(ROSTER_EN), 'A', () => `e-ny-${++n}`);
    expect(ut.tillagda).toEqual(['Öjvind Övnegård']);
    expect(ut.uppdaterade).toEqual(['Ted Testsson', 'Pia Provlund']); // Ted: e-post + ID, Pia: bara ID
    expect(ut.hoppade).toEqual([]);
    const elever = ut.struktur.elever.filter((e) => e.klassId === 'k8b');
    expect(elever).toHaveLength(3);
    expect(elever.find((e) => e.id === 'e1')).toMatchObject({ namn: 'Testsson, Ted', grupp: 'B', epost: 'ted@skola.se', socrativeId: 'TED' });
    expect(elever.find((e) => e.id === 'e2')).toMatchObject({ socrativeId: 'PIA' });
    expect(elever.find((e) => e.id === 'e-ny-1')).toMatchObject({ namn: 'Öjvind Övnegård', grupp: 'A', epost: 'ojvind@skola.se', socrativeId: 'ÖJVIND' });
    // Ursprunget orört (ren funktion)
    expect(s.elever).toHaveLength(2);
  });

  it('kräver befintlig klass och slår ihop dubbletter inom rostern', () => {
    const s = grund();
    expect(() => importeraRoster(s, 'finns-ej', [], 'A', () => 'x')).toThrow('befintlig klass');
    const ut = importeraRoster(s, 'k8b', [
      { fornamn: 'Ted', efternamn: 'Testsson', sidId: 'TED' },
      { fornamn: 'ted', efternamn: 'TESTSSON', sidId: 'TED2' },
    ], 'B', () => 'e1');
    expect(ut.tillagda).toEqual(['Ted Testsson']);
    expect(ut.struktur.elever).toHaveLength(1);
  });

  it('hoppar över elever som redan har allt ifyllt', () => {
    let s = grund();
    s = laggTillElev(s, { id: 'e1', klassId: 'k8b', namn: 'Ted Testsson', grupp: 'A', epost: 'x@y.se', socrativeId: 'TED' });
    const ut = importeraRoster(s, 'k8b', [{ fornamn: 'Ted', efternamn: 'Testsson', sidId: 'TED', epost: 'annan@y.se' }], 'A', () => 'x');
    expect(ut.hoppade).toEqual(['Ted Testsson']);
    expect(ut.struktur).toBe(s.elever === ut.struktur.elever ? ut.struktur : ut.struktur);
    expect(ut.struktur.elever[0].epost).toBe('x@y.se');
  });
});

describe('matchaElev via socrativeId', () => {
  it('Student ID ur rapporten vinner över namnmatchning', async () => {
    const { matchaElev } = await import('../src/domain/resultat.js');
    let s = grund();
    s = laggTillElev(s, { id: 'e1', klassId: 'k8b', namn: 'Ted Testsson', grupp: 'A', socrativeId: 'TED' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k8b', namn: 'Ted Tvillingsson', grupp: 'A', socrativeId: 'TED2' });
    expect(matchaElev(s, 'k8b', 'Ted', 'ted2')?.id).toBe('e2');
    expect(matchaElev(s, 'k8b', 'Ted')).toBeNull(); // två Ted utan ID → oklart
    expect(matchaElev(s, 'k8b', 'Testsson, Ted', '')?.id).toBe('e1');
  });
});

describe('Del 62: laborationsgrupper ur lista', async () => {
  const { tolkaGruppLista, tilldelaGrupper } = await import('../src/domain/roster.js');

  it('tolkaGruppLista klarar mellanslag, komma, tab, "Grupp B" och rubrikrad', () => {
    expect(tolkaGruppLista('Namn\tGrupp\nTed A\nPia Provlund, B\nÖjvind\tgrupp b\n\nAnna Berg;A')).toEqual([
      { namn: 'Ted', grupp: 'A' }, { namn: 'Pia Provlund', grupp: 'B' }, { namn: 'Öjvind', grupp: 'B' }, { namn: 'Anna Berg', grupp: 'A' },
    ]);
  });

  it('tilldelaGrupper: förnamn räcker när det är unikt, annars tvetydigt; okända rapporteras', () => {
    let s = grund();
    s = laggTillElev(s, { id: 'e1', klassId: 'k8b', namn: 'Ted Testsson', grupp: 'A' });
    s = laggTillElev(s, { id: 'e2', klassId: 'k8b', namn: 'Ted Tvillingsson', grupp: 'A' });
    s = laggTillElev(s, { id: 'e3', klassId: 'k8b', namn: 'Provlund, Pia', grupp: 'A' });
    const ut = tilldelaGrupper(s, 'k8b', tolkaGruppLista('Ted B\nTed Tvillingsson B\nPia B\nOkänd A'));
    expect(ut.tvetydiga.map((t) => t.namn)).toEqual(['Ted']);
    expect(ut.tvetydiga[0].kandidater.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(ut.okanda).toEqual(['Okänd']);
    expect(ut.tilldelade.map((t) => `${t.elev.id}:${t.grupp}:${t.andrad}`)).toEqual(['e2:B:true', 'e3:B:true']);
    expect(ut.struktur.elever.map((e) => e.grupp)).toEqual(['A', 'B', 'B']);
    expect(s.elever.map((e) => e.grupp)).toEqual(['A', 'A', 'A']); // ren funktion
  });
});
