import { describe, expect, it } from 'vitest';
import {
  diagramFilter, digiexamLarm, elevIKlassen, elevernaIKlassen, elevkort, frageKort, giltigEpost, importeraResultat, klassKurva,
  laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, laggTillVardnadshavare, rapportOversikt, sattElevStatus,
  taBortVardnadshavare, tomStruktur, vardnadshavareMailto, type ResultatKalla, type Struktur,
} from '../src/index.js';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Pia Provlund', grupp: 'A' });
  return s;
}
const imp = (s: Struktur, kalla: ResultatKalla, prov: string, datum: string, rader: Array<[string, number, number]>, extra: Record<string, unknown> = {}) =>
  importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla, prov, datum, ...extra, rader: rader.map(([namn, poang, maxPoang]) => ({ namn, poang, maxPoang })) }).s;

describe('Del 154 · Elevkortet', () => {
  it('en serie per källa i fast ordning, med antal, snitt, senaste och hur många som nått gränsen', () => {
    let s = bygg();
    s = imp(s, 'socrative-laxforhor', 'Matte11', '2026-09-01', [['Anna Berg', 9, 10]]);
    s = imp(s, 'socrative-laxforhor', 'Matte112', '2026-09-08', [['Anna Berg', 8, 10]]);
    s = imp(s, 'socrative-exit', 'Matte11', '2026-09-01', [['Anna Berg', 4, 5]]);
    s = imp(s, 'digiexam', 'Ekologi E-prov', '2026-09-25', [['Anna Berg', 7, 14]]);
    s = imp(s, 'digiexam', 'Ekologi E-prov – omprov', '2026-10-05', [['Anna Berg', 9, 14]], { omprov: true });
    s = imp(s, 'magma', '1.1 - 1.3 Test', '2026-09-30', [['Anna Berg', 14, 16]]);
    const k = elevkort(s, 'e1', 'ma')!;
    expect(k).toMatchObject({ klass: '8B', amne: 'Matematik', antal: 6, vardnadshavare: [] });
    expect(k.serier.map((x) => [x.rubrik, x.antal, x.snitt, x.senaste, x.klarade, x.bedomda])).toEqual([
      ['Läxförhör', 2, 85, 80, 1, 2], ['Exit tickets', 1, 80, 80, 1, 1], ['Övningar', 0, null, null, 0, 0],
      ['DigiExam-prov', 2, 57, 64, 1, 2], ['Magma-test', 1, 88, 88, 1, 1],
    ]);
    const lax = k.serier[0];
    expect(lax).toMatchObject({ gransProcent: 90, gransText: 'gräns 90 %' });
    expect(lax.punkter.map((p) => [p.prov, p.procent, p.klarat, p.omdome])).toEqual([['Matte11', 90, true, 'Bra'], ['Matte112', 80, false, 'Under godkänd nivå']]);
    const de = k.serier[3];
    expect(de).toMatchObject({ gransProcent: 57, gransText: 'godkänt från 8 av 14 p' });
    expect(de.punkter.map((p) => [p.omdome, p.omprov ?? false])).toEqual([['7 av 14 p · ej godkänt (gräns 8)', false], ['9 av 14 p · godkänt', true]]);
    expect(k.serier[4].punkter[0].omdome).toBe('Bra');
    expect(elevkort(s, 'finns-inte')).toBeNull();
  });

  it('vårdnadshavare: e-post kontrolleras, normaliseras och dubbletter ersätts; mailto till alla', () => {
    expect(giltigEpost('anna.berg@exempel.se')).toBe(true);
    expect(giltigEpost('anna.berg@exempel')).toBe(false);
    expect(giltigEpost('anna berg@exempel.se')).toBe(false);
    let s = bygg();
    s = laggTillVardnadshavare(s, 'e1', { epost: ' Mamma.Berg@Exempel.se ', namn: 'Lena Berg' });
    s = laggTillVardnadshavare(s, 'e1', { epost: 'pappa.berg@exempel.se' });
    s = laggTillVardnadshavare(s, 'e1', { epost: 'mamma.berg@exempel.se', namn: 'Lena B.' });
    expect(s.elever.find((e) => e.id === 'e1')!.vardnadshavare).toEqual([{ epost: 'pappa.berg@exempel.se' }, { epost: 'mamma.berg@exempel.se', namn: 'Lena B.' }]);
    expect(() => laggTillVardnadshavare(s, 'e1', { epost: 'inte en adress' })).toThrow('ingen giltig e-postadress');
    expect(elevkort(s, 'e1')!.vardnadshavare).toHaveLength(2);
    expect(vardnadshavareMailto(s.elever.find((e) => e.id === 'e1')!, 'Matematik 8B', 'Hej!')).toBe('mailto:pappa.berg@exempel.se,mamma.berg@exempel.se?subject=Matematik%208B&body=Hej!');
    s = taBortVardnadshavare(s, 'e1', 'PAPPA.berg@exempel.se');
    s = taBortVardnadshavare(s, 'e1', 'mamma.berg@exempel.se');
    expect(s.elever.find((e) => e.id === 'e1')!.vardnadshavare).toBeUndefined();
    expect(vardnadshavareMailto(s.elever.find((e) => e.id === 'e1')!)).toBe('');
  });

  it('eleven kan slås av eller börja/sluta ett datum — rapporteringen kring eleven avslutas', () => {
    let s = bygg();
    expect(() => sattElevStatus(s, 'e1', { startDatum: '2026-10-01', slutDatum: '2026-09-01' })).toThrow('Slutdatum kan inte ligga före startdatum');
    expect(() => sattElevStatus(s, 'e1', { startDatum: '1/10' })).toThrow('ÅÅÅÅ-MM-DD');
    s = sattElevStatus(s, 'e2', { aktiv: false });
    s = sattElevStatus(s, 'e3', { startDatum: '2026-09-28' });
    expect(elevIKlassen(s.elever[1], '2026-09-01')).toBe(false);
    expect(elevIKlassen(s.elever[2], '2026-09-27')).toBe(false);
    expect(elevIKlassen(s.elever[2], '2026-09-28')).toBe(true);
    expect(elevernaIKlassen(s, 'k', '2026-09-20').map((e) => e.id)).toEqual(['e1']);
    expect(elevernaIKlassen(s, 'k', '2026-10-01').map((e) => e.id)).toEqual(['e1', 'e3']);
    s = sattElevStatus(s, 'e1', { slutDatum: '2026-10-01' });
    expect(elevIKlassen(s.elever[0], '2026-10-01')).toBe(true);            // sista dagen räknas
    expect(elevIKlassen(s.elever[0], '2026-10-02')).toBe(false);
    s = sattElevStatus(s, 'e1', { slutDatum: null });
    expect(s.elever[0].slutDatum).toBeUndefined();
    s = sattElevStatus(s, 'e2', { aktiv: true });
    expect(s.elever[1].aktiv).toBeUndefined();

    // Provlarmet: elev som är av räknas inte; elev som började efter provet förväntas inte ha skrivit
    s = sattElevStatus(s, 'e2', { aktiv: false });
    s = imp(s, 'digiexam', 'Ekologi E-prov', '2026-09-25', [['Anna Berg', 9, 14]]);
    const [l] = digiexamLarm(s, 'k', 'ma', '2026-10-01');
    expect(l).toMatchObject({ antalElever: 1, godkanda: 1, larm: false, ejSkrivit: [] });
    // Rapportlistan och klassens kurvor räknar bara elever i klassen; resultaten finns kvar
    s = imp(s, 'socrative-laxforhor', 'Matte11', '2026-09-01', [['Omar Ali', 2, 10], ['Anna Berg', 10, 10]]);
    expect(rapportOversikt(s, { klassId: 'k' }).map((r) => r.elev.id)).not.toContain('e2');
    expect(klassKurva(s, { klassId: 'k' })[0].snittProcent).toBe(100);
    expect((s.resultat ?? []).some((r) => r.elevId === 'e2')).toBe(true);
    expect(elevkort(s, 'e2')!.serier[0].antal).toBe(1);                       // elevkortet visar fortfarande historiken
  });

  it('DigiExam och Magma delar aldrig diagram med Socrative', () => {
    expect(diagramFilter({ klassId: 'k' }).kallor).toEqual(['socrative-laxforhor', 'socrative-exit', 'socrative-ovning']);
    expect(diagramFilter({ klassId: 'k', kallor: ['socrative-exit', 'digiexam', 'magma'] }).kallor).toEqual(['socrative-exit']);
    expect(diagramFilter({ klassId: 'k', kallor: ['digiexam'] }).kallor).toEqual(['digiexam']);
    let s = bygg();
    s = imp(s, 'socrative-laxforhor', 'Matte11', '2026-09-01', [['Anna Berg', 10, 10], ['Omar Ali', 10, 10]]);
    s = imp(s, 'digiexam', 'Ekologi E-prov', '2026-09-25', [['Anna Berg', 2, 14], ['Omar Ali', 2, 14]]);
    expect(klassKurva(s, { klassId: 'k' }).map((t) => t.kalla)).toEqual(['socrative-laxforhor']);
    expect(klassKurva(s, { klassId: 'k', kallor: ['digiexam'] }).map((t) => t.kalla)).toEqual(['digiexam']);
    const kort = frageKort(s, { klassId: 'k' });
    expect(kort.find((x) => x.kalla === 'helhet')!.snittProcent).toBe(100);   // DigiExam:s 14 % räknas inte in
    expect(kort.find((x) => x.kalla === 'digiexam')!.snittProcent).toBe(14);
  });
});
