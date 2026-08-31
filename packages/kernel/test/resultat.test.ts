import { beforeEach, describe, expect, it } from 'vitest';
import {
  aggregatForElev, amnesOversikt, filtreraResultat, importeraResultat, klassOversikt,
  klaratKrav, kravFor, matchaElev, provLista, provSammanstallning, resultatForElev,
  resultatProcent,
} from '../src/domain/resultat.js';
import { laggTillAmne } from '../src/domain/struktur.js';
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

describe('ämnesvis insamling och aggregering med källfilter', () => {
  function medTvaAmnen() {
    let s = bygg();
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 4, start: '10:00', slut: '11:00' }] });
    let u = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'socrative-exit', prov: 'Quiz 1.1a', datum: '2026-08-20',
      rader: [{ namn: 'Anna Berg', poang: 8, maxPoang: 10 }, { namn: 'Omar Ali', poang: 6, maxPoang: 10 }] });
    u = importeraResultat(u.s, { klassId: 'k', amneId: 'ma', kalla: 'socrative-laxforhor', prov: 'Quiz 1.1-förhör', datum: '2026-08-24',
      rader: [{ namn: 'Anna Berg', poang: 10, maxPoang: 10 }] });
    u = importeraResultat(u.s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov: 'Magma T1', datum: '2026-08-25',
      rader: [{ namn: 'Anna Berg', poang: 12, maxPoang: 20 }] });
    u = importeraResultat(u.s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: 'Biologi61', datum: '2026-09-01',
      rader: [{ namn: 'Anna Berg', poang: 9, maxPoang: 10 }] });
    return u.s;
  }

  it('resultat samlas per ämne och kan filtreras på källa', () => {
    const s = medTvaAmnen();
    expect(filtreraResultat(s, { amneId: 'ma' })).toHaveLength(4);
    expect(filtreraResultat(s, { amneId: 'bi' })).toHaveLength(1);
    expect(filtreraResultat(s, { kallor: ['socrative-exit'] })).toHaveLength(3);
    expect(filtreraResultat(s, { amneId: 'ma', kallor: ['socrative-exit', 'magma'] })).toHaveLength(3);
    expect(() => importeraResultat(s, { klassId: 'k', amneId: 'fel', kalla: 'magma', prov: 'X', datum: '2026-09-02', rader: [] }))
      .toThrow('Okänt ämne för klassen.');
  });

  it('amnesOversikt aggregerar klassens elever för ett ämne; klassOversikt över alla ämnen', () => {
    const s = medTvaAmnen();
    const ma = amnesOversikt(s, 'ma');
    expect(ma.map((r) => r.elev.namn)).toEqual(['Anna Berg', 'Elsa Lindqvist', 'Omar Ali']);
    const anna = ma[0];
    expect(anna.perKalla.map((k) => k.kalla)).toEqual(['socrative-laxforhor', 'socrative-exit', 'magma']);
    expect(anna.perKalla.find((k) => k.kalla === 'socrative-laxforhor')).toMatchObject({ antal: 1, snittProcent: 100, klarade: 1, medKrav: 1 });
    expect(anna.snittProcent).toBe(Math.round((100 + 80 + 60) / 3));
    expect(ma[1].snittProcent).toBeNull();          // Elsa saknar resultat i Matematik

    // Över alla ämnen: Annas Biologi-exit räknas med; filter på exit ger 80/90-snitt
    const alla = klassOversikt(s, 'k');
    expect(alla[0].snittProcent).toBe(Math.round((100 + 80 + 60 + 90) / 4));
    const exit = klassOversikt(s, 'k', { kallor: ['socrative-exit'] });
    expect(exit[0].perKalla).toEqual([{ kalla: 'socrative-exit', antal: 2, snittProcent: 85, klarade: 2, medKrav: 2 }]);
  });

  it('aggregatForElev respekterar ämnesfiltret', () => {
    const s = medTvaAmnen();
    expect(aggregatForElev(s, 'e1', { amneId: 'bi' })).toEqual([
      { kalla: 'socrative-exit', antal: 1, snittProcent: 90, klarade: 1, medKrav: 1 },
    ]);
  });
});
