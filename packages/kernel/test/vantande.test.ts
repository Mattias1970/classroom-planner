import { describe, expect, it } from 'vitest';
import { importeraResultat } from '../src/domain/resultat.js';
import { kopplaVantande, matchaVantande, taBortVantande, vantandeNamn } from '../src/domain/vantande.js';
import { laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, uppdateraElev } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Testsson', grupp: 'A' });
  return s;
}

describe('Del 147: väntande resultat — omatchade rader sparas och kopplas när eleven tillkommer', () => {
  it('omatchade rader sparas som väntande med allt som behövs, och en omkörning ersätter dem', () => {
    const u = importeraResultat(bygg(), { klassId: 'k', kalla: 'socrative-laxforhor', prov: 'Läxförhör 1', datum: '2026-09-04', tid: '08:32', rum: 'BIOLOGI8BB',
      rader: [{ namn: 'Anna Testsson', poang: 2, maxPoang: 2 }, { namn: 'Pia Övnegård', poang: 1, maxPoang: 2, sidId: '4711', svar: [{ fraga: 'Cellens chef?', svar: 'A', ratt: false, facit: 'D' }] }] });
    expect(u.omatchade).toEqual(['Pia Övnegård']);
    expect(u.s.resultat).toHaveLength(1);
    expect(u.s.vantandeResultat).toHaveLength(1);
    expect(u.s.vantandeResultat![0]).toMatchObject({ klassId: 'k', kalla: 'socrative-laxforhor', prov: 'Läxförhör 1', datum: '2026-09-04', tid: '08:32', rum: 'BIOLOGI8BB', namn: 'Pia Övnegård', sidId: '4711', poang: 1, maxPoang: 2 });
    expect(u.s.vantandeResultat![0].svar).toHaveLength(1);
    // Samma fil igen (rättad poäng) → fortfarande en väntande rad, med nya poängen
    const u2 = importeraResultat(u.s, { klassId: 'k', kalla: 'socrative-laxforhor', prov: 'Läxförhör 1', datum: '2026-09-04',
      rader: [{ namn: 'Pia Övnegård', poang: 2, maxPoang: 2 }] });
    expect(u2.s.vantandeResultat).toHaveLength(1);
    expect(u2.s.vantandeResultat![0].poang).toBe(2);
    expect(vantandeNamn(u2.s, 'k')).toEqual([{ namn: 'Pia Övnegård', antal: 1, prov: ['Läxförhör 1'], senast: '2026-09-04' }]);
  });

  it('matchaVantande: när eleven läggs till blir raderna resultat utan ny import; inget väntar kvar', () => {
    let s = importeraResultat(bygg(), { klassId: 'k', kalla: 'socrative-laxforhor', prov: 'Läxförhör 1', datum: '2026-09-04', rader: [{ namn: 'Pia Övnegård', poang: 1, maxPoang: 2 }] }).s;
    s = importeraResultat(s, { klassId: 'k', kalla: 'socrative-exit', prov: 'Exit 6.1', datum: '2026-09-04', rader: [{ namn: 'Övnegård, Pia', poang: 3, maxPoang: 3 }] }).s;
    expect(vantandeNamn(s, 'k').map((v) => [v.namn, v.antal])).toEqual([['Pia Övnegård', 1], ['Övnegård, Pia', 1]]);
    // Ingen ändring utan elev
    expect(matchaVantande(s).matchade).toBe(0);
    s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Pia Övnegård', grupp: 'B' });
    const u = matchaVantande(s, 'k');
    expect(u.matchade).toBe(2);                     // både 'Pia Övnegård' och 'Övnegård, Pia' (flippat namn)
    expect(u.elever).toEqual(['Pia Övnegård']);
    expect(u.s.vantandeResultat).toBeUndefined();
    expect(u.s.resultat!.filter((r) => r.elevId === 'e2').map((r) => r.prov).sort()).toEqual(['Exit 6.1', 'Läxförhör 1']);
    // Namnbyte på en elev fungerar också som nyckel
    let t = importeraResultat(bygg(), { klassId: 'k', kalla: 'socrative-laxforhor', prov: 'L1', datum: '2026-09-04', rader: [{ namn: 'Omar Provlund', poang: 1, maxPoang: 2 }] }).s;
    t = uppdateraElev(t, 'e1', { namn: 'Omar Provlund' });
    expect(matchaVantande(t).matchade).toBe(1);
  });

  it('kopplaVantande kopplar ett avvikande namn till en elev och sätter Socrative-id; taBortVantande kastar raderna', () => {
    let s = importeraResultat(bygg(), { klassId: 'k', kalla: 'socrative-laxforhor', prov: 'L1', datum: '2026-09-04', rader: [{ namn: 'Anna-Karin Testsson', poang: 2, maxPoang: 2, sidId: '99' }] }).s;
    s = importeraResultat(s, { klassId: 'k', kalla: 'socrative-exit', prov: 'E1', datum: '2026-09-05', rader: [{ namn: 'Anna-Karin Testsson', poang: 1, maxPoang: 3 }, { namn: 'Fel Person', poang: 1, maxPoang: 3 }] }).s;
    expect(vantandeNamn(s, 'k').map((v) => v.namn)).toEqual(['Anna-Karin Testsson', 'Fel Person']);
    const u = kopplaVantande(s, 'k', 'anna-karin testsson', 'e1');
    expect(u.matchade).toBe(2);
    expect(u.s.resultat!.filter((r) => r.elevId === 'e1')).toHaveLength(2);
    expect(u.s.elever[0].socrativeId).toBe('99');
    expect(vantandeNamn(u.s, 'k').map((v) => v.namn)).toEqual(['Fel Person']);
    // Nästa import med samma Student ID matchar direkt
    const u2 = importeraResultat(u.s, { klassId: 'k', kalla: 'socrative-exit', prov: 'E2', datum: '2026-09-12', rader: [{ namn: 'A-K Testsson', poang: 3, maxPoang: 3, sidId: '99' }] });
    expect(u2.omatchade).toEqual([]);
    const t = taBortVantande(u2.s, 'k', 'Fel Person');
    expect(t.vantandeResultat).toBeUndefined();
    expect(() => kopplaVantande(t, 'k', 'x', 'finns-ej')).toThrow('Okänd elev');
  });
});
