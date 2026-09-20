import { describe, expect, it } from 'vitest';
import { aktivtKapitel, lasarIntervall, noAmnenIKlass, omfangFilter, terminIntervall } from '../src/domain/omfang.js';
import { dashboardResultat, frageKort, kapitelMatchar, amneMatchar } from '../src/domain/dashboard.js';
import { importeraResultat } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, tomStruktur, type Struktur } from '../src/index.js';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillAmne(s, { id: 'fy', klassId: 'k', namn: 'Fysik', schema: [{ dag: 2, start: '09:00', slut: '10:00' }] });
  s = laggTillAmne(s, { id: 'stod', klassId: 'k', namn: 'Ma/NO-stöd', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  const imp = (amneId: string, prov: string, datum: string, rum: string, poang: number) => {
    s = importeraResultat(s, { klassId: 'k', amneId, kalla: 'socrative-laxforhor', prov, datum, rum, rader: [{ namn: 'Anna Berg', poang, maxPoang: 10 }] }).s;
  };
  imp('bi', 'Biologi 3.1', '2026-05-10', 'Biologi31', 6);   // VT, kapitel 3
  imp('bi', 'Biologi 4.1', '2026-08-21', 'Biologi41', 8);   // HT, kapitel 4
  imp('bi', '4.1-4.2 Begrepp', '2026-08-28', 'Biologi412', 9);
  imp('fy', 'Fysik 2.1', '2026-09-01', 'Fysik21', 7);       // HT, fysik
  return s;
}

describe('omfång — aktivt kapitel, termin, alla NO-ämnen, läsår', () => {
  it('kapitel- och ämnesmatchning ur koderna', () => {
    expect(kapitelMatchar(4, '4.1-4.2 Begrepp', 'Biologi412')).toBe(true);
    expect(kapitelMatchar(3, '4.1-4.2 Begrepp', 'Biologi412')).toBe(false);
    expect(kapitelMatchar(undefined, 'Diagnos', undefined)).toBe(true);
    expect(kapitelMatchar(4, 'Diagnos utan kod', undefined)).toBe(false); // prov utan koder utesluts när kapitel valts
    expect(amneMatchar({ amneIds: ['bi', 'fy'] }, 'fy')).toBe(true);
    expect(amneMatchar({ amneId: 'bi', amneIds: ['fy'] }, 'bi')).toBe(false); // amneIds tar över
    expect(amneMatchar({}, 'bi')).toBe(true);
  });

  it('aktivt kapitel läses ur resultaten när plan saknas; NO-ämnen utan stödämnen', () => {
    const s = bygg();
    expect(aktivtKapitel(s, 'bi', '2026-09-20')).toBe(4);
    expect(aktivtKapitel(s, 'stod', '2026-09-20')).toBeNull();
    expect(noAmnenIKlass(s, 'k')).toEqual(['bi', 'fy']);
  });

  it('terminen och läsåret', () => {
    expect(terminIntervall('2026-09-20')).toEqual({ fran: '2026-08-01', till: '2026-12-31', namn: 'HT 2026' });
    expect(terminIntervall('2027-03-01')).toEqual({ fran: '2027-01-01', till: '2027-06-30', namn: 'VT 2027' });
    expect(lasarIntervall(bygg(), '2026-09-20')).toMatchObject({ fran: '2026-08-17', till: '2027-06-11', namn: '2026/2027' });
    expect(lasarIntervall(tomStruktur(), '2027-03-01')).toMatchObject({ fran: '2026-08-01', till: '2027-06-30' });
  });

  it('omfångsfiltret styr vilka resultat som räknas', () => {
    const s = bygg(); const idag = '2026-09-20';
    const kap = omfangFilter(s, 'k', 'bi', 'kapitel', idag);
    expect(kap).toMatchObject({ kapitel: 4, etikett: 'Kap 4 · Biologi' });
    expect(dashboardResultat(s, { klassId: 'k', amneId: 'bi', ...kap.filter }).map((r) => r.prov)).toEqual(['Biologi 4.1', '4.1-4.2 Begrepp']);
    const termin = omfangFilter(s, 'k', 'bi', 'termin', idag);
    expect(termin.etikett).toBe('HT 2026 · Biologi');
    expect(dashboardResultat(s, { klassId: 'k', amneId: 'bi', ...termin.filter }).length).toBe(2); // 3.1 var i våras
    const noT = omfangFilter(s, 'k', 'bi', 'no-termin', idag);
    expect(noT.etikett).toBe('HT 2026 · Biologi, Fysik');
    expect(dashboardResultat(s, { klassId: 'k', amneId: 'bi', ...noT.filter }).length).toBe(3); // amneIds tar över amneId
    const noL = omfangFilter(s, 'k', 'bi', 'no-lasar', idag);
    expect(noL.etikett).toBe('2026/2027 · Biologi, Fysik');
    expect(frageKort(s, { klassId: 'k', ...noL.filter }).find((k) => k.kalla === 'socrative-laxforhor')!.antalProv).toBe(3);
  });
});
