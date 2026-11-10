import { describe, expect, it } from 'vitest';
import {
  amneForArkivSokvag, arArkivFilImporterad, arkivMappAv, arkivMappar, arkivMappFor, jamforArkiv, kandaArkivMappar, arkivLed, arkivSokvag, arkivStatus, arskursFor, bokFromImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst,
  registreraArkivFil, registreraFil, resetIdRaknare, sparaBok, tolkaArkivSokvag, tomStruktur, type Struktur,
} from '../src/index.js';

function bygg(): Struktur {
  const BOK = bokFromImport(JSON.stringify({ schema: 'classroom-planner-bok', version: 1, bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } }, lektioner: { '4': [{ id: 1, type: 'regular', avsnitt: '4.1 Liv', del: 1 }] } }));
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  return laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '08:10', slut: '09:10' }] });
}

describe('Del 203 · resultatarkivet', () => {
  it('sökvägen: årskurs ur boken eller klassnamnet, klass, ämne, källa, filnamn', () => {
    const s = bygg();
    expect(arskursFor(s, 'bi')).toBe(8);
    expect(arskursFor(s, 'ma')).toBe(8);   // ingen bok → ur '8B'
    expect(arkivSokvag(s, 'bi', 'socrative', 'Biologi41 2026-08-24 08:15.xlsx')).toBe('resultat/ak8/8B/Biologi/socrative/Biologi41 2026-08-24 08-15.xlsx');
    expect(arkivLed('a/b:c*?"<>|#%')).toBe('a-b-c-');
    expect(tolkaArkivSokvag('resultat/ak8/8B/Biologi/socrative/fil.xlsx')).toEqual({ arskurs: 8, klass: '8B', amne: 'Biologi', kalla: 'socrative', filnamn: 'fil.xlsx' });
    expect(tolkaArkivSokvag('resultat/ak8/8B/Biologi/annat/fil.xlsx')).toBeNull();
    expect(amneForArkivSokvag(s, 'resultat/ak8/8B/Matematik/magma/x.xlsx')).toBe('ma');
    expect(amneForArkivSokvag(s, 'resultat/ak8/8A/Matematik/magma/x.xlsx')).toBeNull();
  });

  it('registret: uppladdat, importerat och vad som saknar kopia', () => {
    let s = bygg();
    s = registreraFil(s, { amneId: 'bi', filnamn: 'a.xlsx', importerad: '2026-09-01T10:00:00Z', kalla: 'socrative-exit', prov: 'Biologi41' });
    s = registreraFil(s, { amneId: 'bi', filnamn: 'b.xlsx', importerad: '2026-09-02T10:00:00Z', kalla: 'socrative-laxforhor', prov: 'Biologi41' });
    expect(arkivStatus(s, 'bi')).toEqual({ uppladdade: 0, saknarKopia: [{ amneId: 'bi', filnamn: 'a.xlsx', kalla: 'socrative' }, { amneId: 'bi', filnamn: 'b.xlsx', kalla: 'socrative' }] });
    s = registreraArkivFil(s, { sokvag: arkivSokvag(s, 'bi', 'socrative', 'a.xlsx'), filnamn: 'a.xlsx', amneId: 'bi', kalla: 'socrative', uppladdad: '2026-09-01T10:00:05Z', importerad: true });
    expect(arkivStatus(s, 'bi')).toMatchObject({ uppladdade: 1, saknarKopia: [{ filnamn: 'b.xlsx' }] });
    // Teams-filer finns bara i arkivet
    s = registreraArkivFil(s, { sokvag: arkivSokvag(s, 'bi', 'teams', 't.xlsx'), filnamn: 't.xlsx', amneId: 'bi', kalla: 'teams', uppladdad: '', importerad: true });
    expect(arkivStatus(s, 'bi').saknarKopia.map((x) => x.filnamn)).toEqual(['b.xlsx', 't.xlsx']);
    expect(arArkivFilImporterad(s, 'bi', 'teams', 't.xlsx')).toBe(true);
    expect(arArkivFilImporterad(s, 'bi', 'socrative', 'a.xlsx')).toBe(true);
    expect(arArkivFilImporterad(s, 'bi', 'socrative', 'c.xlsx')).toBe(false);
    // Uppladdning registreras ovanpå
    s = registreraArkivFil(s, { ...s.resultatArkiv![1], uppladdad: '2026-09-03T00:00:00Z' });
    expect(arkivStatus(s, 'bi')).toMatchObject({ uppladdade: 2 });
    expect(s.resultatArkiv).toHaveLength(2);
  });
});

describe('Del 239 · var filerna ligger och vad som är nytt i datarepot', () => {
  const REPO = [
    'resultat/ak8/8B/Biologi/socrative/a.xlsx',
    'resultat/ak8/8B/Biologi/socrative/b.xlsx',
    'resultat/ak8/8B/Matematik/magma/m.xlsx',
    'resultat/ak8/8A/Biologi/socrative/annan-klass.xlsx',
    'resultat/gammalt/fil.xlsx',
  ];

  it('mappen för ett ämne och en källa, och mappen ur en sökväg', () => {
    const s = bygg();
    expect(arkivMappFor(s, 'bi', 'socrative')).toBe('resultat/ak8/8B/Biologi/socrative');
    expect(arkivMappFor(s, 'ma', 'teams')).toBe('resultat/ak8/8B/Matematik/teams');
    expect(arkivMappAv('resultat/ak8/8B/Biologi/socrative/a.xlsx')).toBe('resultat/ak8/8B/Biologi/socrative');
  });

  it('nya = filer för klasser och ämnen här som inte är importerade; resten är okända', () => {
    let s = bygg();
    s = registreraFil(s, { amneId: 'bi', filnamn: 'a.xlsx', importerad: '2026-09-01T10:00:00Z', kalla: 'socrative-exit', prov: 'Biologi41' });
    const j = jamforArkiv(s, REPO);
    expect(j.nya.map((r) => r.sokvag)).toEqual(['resultat/ak8/8B/Biologi/socrative/b.xlsx', 'resultat/ak8/8B/Matematik/magma/m.xlsx']);
    expect(j.okanda.map((r) => r.sokvag)).toEqual(['resultat/ak8/8A/Biologi/socrative/annan-klass.xlsx', 'resultat/gammalt/fil.xlsx']);
    expect(j.importerade).toBe(1);
    // En tom app (data som försvunnit) ser allt för sina klasser som nytt
    expect(jamforArkiv(bygg(), REPO).nya).toHaveLength(3);
  });

  it('en fil vars namn skrevs om i arkivet (%, #) räknas som importerad på datorn den kom ifrån', () => {
    let s = bygg();
    s = registreraFil(s, { amneId: 'ma', filnamn: 'Class_2026_09_01__07_00_QZ_Procent_50%.xlsx', importerad: '2026-09-01T10:00:00Z', kalla: 'socrative-exit', prov: 'Procent' });
    const sokvag = arkivSokvag(s, 'ma', 'socrative', 'Class_2026_09_01__07_00_QZ_Procent_50%.xlsx');
    expect(sokvag).toBe('resultat/ak8/8B/Matematik/socrative/Class_2026_09_01__07_00_QZ_Procent_50-.xlsx');
    expect(jamforArkiv(s, [sokvag]).nya).toEqual([]);
  });

  it('mapparna listas med sina filer och antal nya', () => {
    let s = bygg();
    s = registreraFil(s, { amneId: 'bi', filnamn: 'a.xlsx', importerad: '2026-09-01T10:00:00Z', kalla: 'socrative-exit', prov: 'Biologi41' });
    const mappar = arkivMappar(jamforArkiv(s, REPO).rader);
    expect(mappar.map((m) => [m.mapp, m.filer.length, m.nya])).toEqual([
      ['resultat/ak8/8A/Biologi/socrative', 1, 0],
      ['resultat/ak8/8B/Biologi/socrative', 2, 1],
      ['resultat/ak8/8B/Matematik/magma', 1, 1],
      ['resultat/gammalt', 1, 0],
    ]);
    expect(mappar[1]).toMatchObject({ amneId: 'bi', kalla: 'socrative', filer: ['a.xlsx', 'b.xlsx'] });
  });

  it('kända mappar ur registret — bara filer som faktiskt är uppladdade', () => {
    let s = bygg();
    s = registreraArkivFil(s, { sokvag: arkivSokvag(s, 'bi', 'socrative', 'a.xlsx'), filnamn: 'a.xlsx', amneId: 'bi', kalla: 'socrative', uppladdad: '2026-09-01T10:00:05Z', importerad: true });
    s = registreraArkivFil(s, { sokvag: arkivSokvag(s, 'bi', 'teams', 't.xlsx'), filnamn: 't.xlsx', amneId: 'bi', kalla: 'teams', uppladdad: '', importerad: true });
    expect(kandaArkivMappar(s).map((m) => m.mapp)).toEqual(['resultat/ak8/8B/Biologi/socrative']);
  });
});
