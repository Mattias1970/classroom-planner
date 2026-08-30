import { beforeEach, describe, expect, it } from 'vitest';
import {
  importeraResultat, klaratKrav, kravFor, matchaElev, provLista,
  provSammanstallning, resultatForElev, resultatProcent,
} from '../src/domain/resultat.js';
import {
  laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare,
} from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

beforeEach(resetIdRaknare);

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Elsa Lindqvist', grupp: 'A' });
  return s;
}

describe('BAM-kraven per källa', () => {
  it('läxförhör 90, exit 70, Magma/DigiExam utan fast krav', () => {
    expect(kravFor('socrative-laxforhor')).toBe(90);
    expect(kravFor('socrative-exit')).toBe(70);
    expect(kravFor('magma')).toBeNull();
    expect(kravFor('digiexam')).toBeNull();
  });

  it('procent och kravbedömning', () => {
    expect(resultatProcent({ poang: 9, maxPoang: 10 })).toBe(90);
    expect(resultatProcent({ poang: 1, maxPoang: 0 })).toBeNull();
    expect(klaratKrav({ poang: 9, maxPoang: 10, kalla: 'socrative-laxforhor' })).toBe(true);
    expect(klaratKrav({ poang: 8, maxPoang: 10, kalla: 'socrative-laxforhor' })).toBe(false);
    expect(klaratKrav({ poang: 7, maxPoang: 10, kalla: 'socrative-exit' })).toBe(true);
    expect(klaratKrav({ poang: 5, maxPoang: 10, kalla: 'magma' })).toBeNull();
  });
});

describe('elevmatchning mot resultatfilernas namn', () => {
  it('exakt, skiftlägesokänsligt, Efternamn, Förnamn och entydigt förnamn', () => {
    const s = bygg();
    expect(matchaElev(s, 'k', 'Anna Berg')?.id).toBe('e1');
    expect(matchaElev(s, 'k', 'BERG, anna')?.id).toBe('e1');
    expect(matchaElev(s, 'k', '  omar   ALI ')?.id).toBe('e2');
    expect(matchaElev(s, 'k', 'Elsa')?.id).toBe('e3');
    expect(matchaElev(s, 'k', 'Okänd Person')).toBeNull();
  });

  it('tvetydigt förnamn matchas inte', () => {
    let s = bygg();
    s = laggTillElev(s, { id: 'e4', klassId: 'k', namn: 'Elsa Öman', grupp: 'B' });
    expect(matchaElev(s, 'k', 'Elsa')).toBeNull();
    expect(matchaElev(s, 'k', 'Elsa Öman')?.id).toBe('e4');
  });
});

describe('importeraResultat', () => {
  it('matchar rader, rapporterar omatchade och ersätter vid omkörning', () => {
    const s = bygg();
    const u1 = importeraResultat(s, {
      klassId: 'k', kalla: 'socrative-exit', prov: 'Quiz 1.1a', datum: '2026-08-20',
      rader: [
        { namn: 'Berg, Anna', poang: 8, maxPoang: 10 },
        { namn: 'omar ali', poang: 6, maxPoang: 10 },
        { namn: 'Nils Nilsson', poang: 4, maxPoang: 10 },
      ],
    });
    expect(u1.traffar).toBe(2);
    expect(u1.omatchade).toEqual(['Nils Nilsson']);
    expect(u1.s.resultat).toHaveLength(2);

    // Omkörning med rättad fil ersätter — ingen dubblett
    const u2 = importeraResultat(u1.s, {
      klassId: 'k', kalla: 'socrative-exit', prov: 'Quiz 1.1a', datum: '2026-08-20',
      rader: [{ namn: 'Anna Berg', poang: 9, maxPoang: 10 }],
    });
    expect(u2.s.resultat).toHaveLength(2);
    const anna = resultatForElev(u2.s, 'e1');
    expect(anna).toHaveLength(1);
    expect(anna[0].poang).toBe(9);
  });

  it('kräver känd klass och provnamn', () => {
    expect(() => importeraResultat(bygg(), { klassId: 'fel', kalla: 'magma', prov: 'T1', datum: '2026-09-01', rader: [] })).toThrow('Okänd klass.');
    expect(() => importeraResultat(bygg(), { klassId: 'k', kalla: 'magma', prov: '  ', datum: '2026-09-01', rader: [] })).toThrow('Provet måste ha ett namn.');
  });
});

describe('sammanställningar', () => {
  it('provSammanstallning ger en rad per elev i bokstavsordning; provLista per klass', () => {
    const { s } = importeraResultat(bygg(), {
      klassId: 'k', kalla: 'socrative-laxforhor', prov: 'Biologi612', datum: '2026-09-03',
      rader: [{ namn: 'Anna Berg', poang: 10, maxPoang: 10 }, { namn: 'Elsa', poang: 8, maxPoang: 10 }],
    });
    const rows = provSammanstallning(s, 'k', 'Biologi612');
    expect(rows.map((r) => r.elev.namn)).toEqual(['Anna Berg', 'Elsa Lindqvist', 'Omar Ali']);
    expect(rows[0].resultat?.poang).toBe(10);
    expect(rows[2].resultat).toBeNull();
    expect(provLista(s, 'k')).toEqual([{ kalla: 'socrative-laxforhor', prov: 'Biologi612' }]);
  });
});
