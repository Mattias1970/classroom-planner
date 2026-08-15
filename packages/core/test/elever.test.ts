import { describe, it, expect } from 'vitest';
import {
  detectHeader, mergeElever, parseEleverFromRows, validateElev, type Elev,
} from '../src/domain/elever.js';

describe('detectHeader', () => {
  it('känner igen svenska rubriker oavsett ordning och skiftläge', () => {
    const map = detectHeader(['E-post', 'Efternamn', 'StudentID', 'Förnamn']);
    expect(map).toEqual({ email: 0, efternamn: 1, studentId: 2, fornamn: 3 });
  });

  it('känner igen engelska rubriker', () => {
    const map = detectHeader(['First name', 'Last name', 'ID', 'Email']);
    expect(map).toEqual({ fornamn: 0, efternamn: 1, studentId: 2, email: 3 });
  });

  it('returnerar null för en datarad', () => {
    expect(detectHeader(['Anna', 'Svensson', 'S123', 'anna@skola.se'])).toBeNull();
  });
});

describe('parseEleverFromRows', () => {
  it('tolkar fil med rubrikrad och blandad kolumnordning', () => {
    const r = parseEleverFromRows([
      ['Efternamn', 'Förnamn', 'E-post', 'StudentID'],
      ['Svensson', 'Anna', 'anna@skola.se', 'S001'],
      ['Ali', 'Omar', 'omar@skola.se', 'S002'],
    ]);
    expect(r.fel).toEqual([]);
    expect(r.elever).toEqual([
      { fornamn: 'Anna', efternamn: 'Svensson', studentId: 'S001', email: 'anna@skola.se' },
      { fornamn: 'Omar', efternamn: 'Ali', studentId: 'S002', email: 'omar@skola.se' },
    ]);
  });

  it('utan rubrikrad antas ordningen förnamn, efternamn, id, e-post', () => {
    const r = parseEleverFromRows([['Anna', 'Svensson', 'S001', 'anna@skola.se']]);
    expect(r.fel).toEqual([]);
    expect(r.elever[0]?.studentId).toBe('S001');
  });

  it('hoppar över tomma rader tyst och rapporterar ogiltiga med radnummer', () => {
    const r = parseEleverFromRows([
      ['Förnamn', 'Efternamn', 'StudentID', 'E-post'],
      ['', '', '', ''],
      ['Anna', '', 'S001', 'anna@skola.se'],
      ['Omar', 'Ali', 'S002', 'inte-en-mail'],
      ['Eva', 'Berg', 'S003', ''],
    ]);
    expect(r.elever.map((e) => e.studentId)).toEqual(['S003']); // tom e-post är ok
    expect(r.fel.length).toBe(2);
    expect(r.fel[0]).toContain('Rad 3');
    expect(r.fel[1]).toContain('Rad 4');
  });

  it('numeriska celler (Excel) blir strängar', () => {
    const r = parseEleverFromRows([['Anna', 'Svensson', 12345, 'anna@skola.se']]);
    expect(r.elever[0]?.studentId).toBe('12345');
  });

  it('dubblett-id: sista raden vinner och rapporteras', () => {
    const r = parseEleverFromRows([
      ['Anna', 'Svensson', 'S001', 'anna@skola.se'],
      ['Anna', 'Svensson-Ny', 'S001', 'anna@skola.se'],
    ]);
    expect(r.elever.length).toBe(1);
    expect(r.elever[0]?.efternamn).toBe('Svensson-Ny');
    expect(r.fel[0]).toContain('S001');
  });
});

describe('mergeElever', () => {
  const bef: Elev[] = [
    { fornamn: 'Anna', efternamn: 'Svensson', studentId: 'S001', email: 'a@s.se' },
    { fornamn: 'Omar', efternamn: 'Ali', studentId: 'S002', email: 'o@s.se' },
  ];

  it('uppdaterar på StudentID, lägger till nya, raderar aldrig', () => {
    const res = mergeElever(bef, [
      { fornamn: 'Anna', efternamn: 'Svensson', studentId: 'S001', email: 'ny@s.se' },
      { fornamn: 'Eva', efternamn: 'Berg', studentId: 'S003', email: 'e@s.se' },
    ]);
    expect(res.length).toBe(3);
    expect(res.find((e) => e.studentId === 'S001')?.email).toBe('ny@s.se');
    expect(res.find((e) => e.studentId === 'S002')).toBeDefined();
  });

  it('sorterar på efternamn, svensk ordning', () => {
    const res = mergeElever(bef, [
      { fornamn: 'Åsa', efternamn: 'Öberg', studentId: 'S004', email: '' },
    ]);
    expect(res[res.length - 1]?.efternamn).toBe('Öberg');
  });
});

describe('validateElev', () => {
  it('kräver förnamn, efternamn och studentId; e-post valfri men måste vara giltig', () => {
    expect(validateElev({ fornamn: 'A', efternamn: 'B', studentId: 'S1', email: '' })).toEqual([]);
    expect(validateElev({ fornamn: '', efternamn: 'B', studentId: '', email: 'fel' }).length).toBe(3);
  });
});
