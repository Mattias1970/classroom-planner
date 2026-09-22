/**
 * Del 138: namngivna sparfiler — planeringar (namn + version) och SuperTeach-data
 * (resultat + filregister) med koppling till planeringen. Spara som nytt / ersätt /
 * ny version; öppna igen; filer för datarepot.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  amnesPlanFor, laggTillAmne, laggTillEgenRad, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst,
  registreraPlanering, resetIdRaknare, sattLektionsplan, sparaBok,
} from '../src/domain/struktur.js';
import { importeraResultat, registreraFil } from '../src/domain/resultat.js';
import {
  forslagPlaneringsNamn, forslagSuperTeachNamn, kopplingFor, laggInSparfiler, oppnaSparadPlanering, oppnaSparadSuperTeach,
  serialiseraSparfil, sparaPlanering, sparaSuperTeach, sparfilSokvag, taBortSparadPlanering, taBortSparadSuperTeach, tolkaSparfil,
} from '../src/domain/sparat.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] };
const BIO = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Test', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } },
  lektioner: { '4': [
    { id: 1, type: 'regular', avsnitt: '4.1 Ekosystem', del: 1, begrepp: 'ekosystem' },
    { id: 2, type: 'regular', avsnitt: '4.2 Näringskedjor', del: 1, begrepp: 'producent' },
    { id: 3, type: 'exam', avsnitt: 'Prov kap 4', del: 1 },
  ] },
}));
const SCHEMA = [{ dag: 2, start: '10:00', slut: '11:00' }];

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, LA); s = sparaBok(s, BIO);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO 8' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = laggTillElev(s, { id: 'e1', klassId: 'k8b', namn: 'Anna Testsson', grupp: 'A' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k8b', namn: 'Biologi', bokId: 'bio', schema: SCHEMA });
  s = registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: 'bio', skapad: '2026-08-10' });
  s = sattLektionsplan(s, { id: 'lp1', amneId: 'am', lektionsIndex: 0, presentation: 'Ekosystem.pptx' });
  return s;
}
const T = '2026-09-22T10:00:00.000Z';
beforeEach(resetIdRaknare);

describe('Del 138: sparade planeringar', () => {
  it('spara som nytt ger v1 med namn, bok, lektionsplaner och planeringsval', () => {
    let s = bygg();
    s = laggTillEgenRad(s, 'am', { id: 'er1', rubrik: 'Diagnos', typ: 'prov', position: 1 });
    s = sparaPlanering(s, 'am', { typ: 'nytt', namn: 'Biologi 8B HT' }, T);
    const [p] = s.sparadePlaneringar!;
    expect(p.namn).toBe('Biologi 8B HT'); expect(p.version).toBe(1);
    expect(p.bokTitel).toBe('Spektrum Biologi'); expect(p.klassNamn).toBe('8B');
    expect(p.lektionsplaner.map((x) => x.presentation)).toEqual(['Ekosystem.pptx']);
    expect(p.val.egnaRader?.map((r) => r.rubrik)).toEqual(['Diagnos']);
    expect(forslagPlaneringsNamn(s, 'am')).toBe('Biologi 8B · Spektrum Biologi');
  });

  it('samma namn igen kräver ny version eller ersätt; ny version räknar upp, ersätt behåller id och version', () => {
    let s = sparaPlanering(bygg(), 'am', { typ: 'nytt', namn: 'Bio' }, T);
    expect(() => sparaPlanering(s, 'am', { typ: 'nytt', namn: 'bio' }, T)).toThrow(/finns redan/);
    s = sparaPlanering(s, 'am', { typ: 'ny-version', namn: 'Bio' }, T);
    expect(s.sparadePlaneringar!.map((p) => p.version)).toEqual([1, 2]);
    const id = s.sparadePlaneringar![0].id;
    s = sattLektionsplan(s, { id: 'lp1', amneId: 'am', lektionsIndex: 0, presentation: 'Ny.pptx' });
    s = sparaPlanering(s, 'am', { typ: 'ersatt', id }, '2026-10-01T00:00:00.000Z');
    expect(s.sparadePlaneringar!.length).toBe(2);
    expect(s.sparadePlaneringar![0]).toMatchObject({ id, version: 1, sparad: '2026-10-01T00:00:00.000Z' });
    expect(s.sparadePlaneringar![0].lektionsplaner[0].presentation).toBe('Ny.pptx');
    expect(() => sparaPlanering(s, 'am', { typ: 'nytt', namn: '  ' }, T)).toThrow(/namn/);
  });

  it('öppna en sparad planering: aktiv planering byts (gamla arkiveras), lektionsplaner och val följer med', () => {
    let s = sparaPlanering(bygg(), 'am', { typ: 'nytt', namn: 'Utan diagnos' }, T);
    const sparadId = s.sparadePlaneringar![0].id;
    s = laggTillEgenRad(s, 'am', { id: 'er1', rubrik: 'Diagnos', typ: 'prov', position: 1 });
    s = sattLektionsplan(s, { id: 'lp1', amneId: 'am', lektionsIndex: 0, presentation: 'Andra.pptx' });
    expect(amnesPlanFor(s, 'am')!.a.map((r) => r.lektion.avsnitt)).toContain('Diagnos');
    s = oppnaSparadPlanering(s, sparadId, '2026-10-05');
    expect(amnesPlanFor(s, 'am')!.a.map((r) => r.lektion.avsnitt)).not.toContain('Diagnos');
    expect(s.lektionsplaner.find((lp) => lp.amneId === 'am')?.presentation).toBe('Ekosystem.pptx');
    const aktiv = s.planeringar.find((p) => p.amneId === 'am')!;
    expect(aktiv.namn).toBe('Utan diagnos v1'); expect(aktiv.version).toBe(2);
    expect(s.planeringsarkiv!.map((p) => p.id)).toEqual(['pl']);
    // kopplingen känner igen den öppnade planeringen via namnet
    expect(kopplingFor(s, 'am')).toEqual({ planeringsNamn: 'Utan diagnos', planeringsVersion: 1, planeringsId: aktiv.id });
    s = taBortSparadPlanering(s, sparadId);
    expect(s.sparadePlaneringar).toEqual([]);
  });

  it('öppna kräver att boken finns', () => {
    let s = sparaPlanering(bygg(), 'am', { typ: 'nytt', namn: 'Bio' }, T);
    s = { ...s, bocker: [] };
    expect(() => oppnaSparadPlanering(s, s.sparadePlaneringar![0].id, '2026-10-05')).toThrow(/Boken/);
  });
});

describe('Del 138: sparade SuperTeach-data', () => {
  function medResultat(): Struktur {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k8b', amneId: 'am', kalla: 'socrative-exit', prov: 'Exit 4.1', datum: '2026-09-01', rader: [{ namn: 'Anna Testsson', poang: 8, maxPoang: 10 }] }).s;
    s = registreraFil(s, { amneId: 'am', filnamn: 'Biologi8B Exit 4.1.xlsx', importerad: T, kalla: 'socrative-exit', prov: 'Exit 4.1' });
    return s;
  }

  it('sparar ämnets resultat och filregister med koppling till planeringen (sparat namn först, annars aktiv)', () => {
    let s = medResultat();
    expect(forslagSuperTeachNamn(s, 'am', '2026-09-22')).toBe('Resultat Biologi 8B HT26');
    expect(forslagSuperTeachNamn(s, 'am', '2027-02-01')).toBe('Resultat Biologi 8B VT27');
    expect(() => sparaSuperTeach(bygg(), 'am', { typ: 'nytt', namn: 'X' }, T)).toThrow(/inga resultat/);
    s = sparaSuperTeach(s, 'am', { typ: 'nytt', namn: 'Resultat HT' }, T);
    const [st] = s.sparadSuperTeach!;
    expect(st.resultat.length).toBe(1); expect(st.filregister.length).toBe(1);
    expect(st.koppling).toEqual({ planeringsNamn: 'Biologi 8B · Spektrum Biologi · v1 (2026-08-10)', planeringsVersion: 1, planeringsId: 'pl' });
    s = sparaPlanering(s, 'am', { typ: 'nytt', namn: 'Bio HT' }, T);
    s = sparaSuperTeach(s, 'am', { typ: 'ny-version', namn: 'Resultat HT' }, T);
    expect(s.sparadSuperTeach![1]).toMatchObject({ version: 2, koppling: { planeringsNamn: 'Bio HT', planeringsVersion: 1 } });
  });

  it('öppna: ersätt byter ämnets resultat, lägg till hoppar över det som redan finns', () => {
    let s = sparaSuperTeach(medResultat(), 'am', { typ: 'nytt', namn: 'R' }, T);
    const id = s.sparadSuperTeach![0].id;
    s = importeraResultat(s, { klassId: 'k8b', amneId: 'am', kalla: 'socrative-laxforhor', prov: 'Läxförhör 4.2', datum: '2026-09-08', rader: [{ namn: 'Anna Testsson', poang: 5, maxPoang: 10 }] }).s;
    expect(s.resultat!.length).toBe(2);
    const laggTill = oppnaSparadSuperTeach(s, id, 'laggTill');
    expect(laggTill.resultat!.length).toBe(2); expect(laggTill.filregister!.length).toBe(1);
    const ersatt = oppnaSparadSuperTeach(s, id, 'ersatt');
    expect(ersatt.resultat!.map((r) => r.prov)).toEqual(['Exit 4.1']);
    expect(taBortSparadSuperTeach(s, id).sparadSuperTeach).toEqual([]);
  });

  it('sparfiler för datarepot: sökväg, serialisering, tolkning och inläsning (samma id ersätts)', () => {
    let s = sparaPlanering(medResultat(), 'am', { typ: 'nytt', namn: 'Biologi 8B · Höst' }, T);
    s = sparaSuperTeach(s, 'am', { typ: 'nytt', namn: 'Resultat Biologi 8B HT26' }, T);
    const [pl] = s.sparadePlaneringar!; const [st] = s.sparadSuperTeach!;
    expect(sparfilSokvag(pl)).toBe('sparat/planeringar/biologi-8b-host-v1.json');
    expect(sparfilSokvag(st)).toBe('sparat/superteach/resultat-biologi-8b-ht26-v1.json');
    const tolkad = tolkaSparfil(serialiseraSparfil(pl));
    expect(tolkad).toEqual(pl);
    expect(() => tolkaSparfil('{"schema":"annat"}')).toThrow(/Inte en sparfil/);
    const tom = laggInSparfiler(tomStruktur(), [tolkad, tolkaSparfil(serialiseraSparfil(st))]);
    expect(tom.sparadePlaneringar!.length).toBe(1); expect(tom.sparadSuperTeach!.length).toBe(1);
    const igen = laggInSparfiler(tom, [{ ...pl, sparad: 'senare' }]);
    expect(igen.sparadePlaneringar!.length).toBe(1); expect(igen.sparadePlaneringar![0].sparad).toBe('senare');
  });
});
