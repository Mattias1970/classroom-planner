/**
 * Del 149: delkapitel som kurser — flyttas fram och tillbaka i planeringen (och därmed
 * i kalendern), lektionsplanerna följer sina lektioner, genomförda kurser rörs inte.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  amnesPlanFor, flyttaKurs, hamtaLektionsplan, kursLista, laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar,
  laggTillTjanst, ordnaKurser, planeringsRader, registreraPlanering, resetIdRaknare, sattLektionsplan, sparaBok,
} from '../src/domain/struktur.js';
import { kalenderHandelser } from '../src/domain/kalender.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] };
const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8', två: '9–16', tre: '—' },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '—', två: '17–24', tre: '25–32' },
    { id: 3, type: 'regular', avsnitt: '1.2 Procent', del: 1, ett: '1–6', två: '7–12', tre: '13–15' },
    { id: 4, type: 'regular', avsnitt: '1.3 Potenser', del: 1, ett: '1–6', två: '7–12', tre: '13–15' },
    { id: 5, type: 'exam', avsnitt: '1 Prov', del: 1 },
  ] },
}));
const SCHEMA = [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }];

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, LA); s = sparaBok(s, MA);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma 8' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k8b', namn: 'Matematik', bokId: 'ma', schema: SCHEMA });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: 'ma', skapad: '2026-08-10' });
}
const avsnitt = (s: Struktur, idag?: string) => amnesPlanFor(s, 'am', idag, false)!.a.map((r) => `${r.lektion.avsnitt}·${r.lektion.del}`);

beforeEach(resetIdRaknare);

describe('ordnaKurser', () => {
  it('byter plats på nämnda kurser och låter övriga stå kvar', () => {
    const rader = planeringsRader(MA, {});
    expect(rader.map((r) => r.lektion.avsnitt)).toEqual(['1.1 Bråk', '1.1 Bråk', '1.2 Procent', '1.3 Potenser', '1 Prov']);
    const ny = ordnaKurser(rader, ['1:1.3', '1:1.1']);
    expect(ny.map((r) => `${r.lektion.avsnitt}·${r.lektion.del}`)).toEqual(['1.3 Potenser·1', '1.2 Procent·1', '1.1 Bråk·1', '1.1 Bråk·2', '1 Prov·1']);
    expect(ordnaKurser(rader, undefined)).toBe(rader);
    expect(ordnaKurser(rader, ['finns:ej'])).toEqual(rader);
  });
});

describe('kursLista och flyttaKurs', () => {
  it('listar delkapitlen som kurser med antal lektioner och första datum', () => {
    const s = bygg();
    const k = kursLista(amnesPlanFor(s, 'am')!.a);
    expect(k.map((x) => [x.nyckel, x.titel, x.antalLektioner, x.forsta])).toEqual([
      ['1:1.1', '1.1 Bråk', 2, 0], ['1:1.2', '1.2 Procent', 1, 2], ['1:1.3', '1.3 Potenser', 1, 3], ['1:5', '1 Prov', 1, 4],
    ]);
    expect(k[0].datum).toBe('2026-08-18');
  });

  it('flyttar en kurs bakåt/framåt; kalendern följer; lektionsplanerna följer sina lektioner', () => {
    let s = bygg();
    // Detaljplan på 1.2 Procent (rad 2)
    s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: 2, anteckning: 'Procentanteckning' });
    s = flyttaKurs(s, 'am', '1:1.2', -1, '2026-08-10');
    expect(avsnitt(s)).toEqual(['1.2 Procent·1', '1.1 Bråk·1', '1.1 Bråk·2', '1.3 Potenser·1', '1 Prov·1']);
    expect(hamtaLektionsplan(s, 'am', 0)?.anteckning).toBe('Procentanteckning');   // följde med till rad 0
    expect(hamtaLektionsplan(s, 'am', 2)).toBeNull();
    const kal = kalenderHandelser(s, 'la', '2026-08-10').filter((h) => h.amneId === 'am').slice(0, 2);
    expect(kal.map((h) => h.avsnitt)).toEqual(['1.2 Procent', '1.1 Bråk']);
    // Tillbaka igen och vidare förbi 1.3
    s = flyttaKurs(s, 'am', '1:1.2', 1, '2026-08-10');
    s = flyttaKurs(s, 'am', '1:1.2', 1, '2026-08-10');
    expect(avsnitt(s)).toEqual(['1.1 Bråk·1', '1.1 Bråk·2', '1.3 Potenser·1', '1.2 Procent·1', '1 Prov·1']);
    expect(hamtaLektionsplan(s, 'am', 3)?.anteckning).toBe('Procentanteckning');
    // Utanför kanten: oförändrat
    expect(flyttaKurs(s, 'am', '1:1.1', -1, '2026-08-10')).toBe(s);
  });

  it('egna rader är egna kurser och kan flyttas som block', () => {
    let s = bygg();
    s = laggTillEgenRad(s, 'am', { id: 'd1', position: 2, rubrik: 'Diagnos', typ: 'diagnos' });
    expect(avsnitt(s)).toEqual(['1.1 Bråk·1', '1.1 Bråk·2', 'Diagnos·1', '1.2 Procent·1', '1.3 Potenser·1', '1 Prov·1']);
    s = flyttaKurs(s, 'am', 'er:d1', 1, '2026-08-10');
    expect(avsnitt(s)).toEqual(['1.1 Bråk·1', '1.1 Bråk·2', '1.2 Procent·1', 'Diagnos·1', '1.3 Potenser·1', '1 Prov·1']);
  });

  it('genomförda kurser flyttas inte', () => {
    const s = bygg();
    // 1.1 Bråk ligger 18 och 20 aug — den 25 aug är kursen genomförd
    const k = kursLista(amnesPlanFor(s, 'am', '2026-08-25', false)!.a, '2026-08-25');
    expect(k[0].genomford).toBe(true); expect(k[1].genomford).toBe(false);
    expect(() => flyttaKurs(s, 'am', '1:1.2', -1, '2026-08-25')).toThrow('Genomförda lektioner flyttas inte');
    expect(() => flyttaKurs(s, 'am', '1:1.1', 1, '2026-08-25')).toThrow('Genomförda lektioner flyttas inte');
    expect(avsnitt(flyttaKurs(s, 'am', '1:1.2', 1, '2026-08-25'))).toEqual(['1.1 Bråk·1', '1.1 Bråk·2', '1.3 Potenser·1', '1.2 Procent·1', '1 Prov·1']);
  });
});
