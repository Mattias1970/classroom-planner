import { describe, expect, it } from 'vitest';
import {
  digiexamAnalys, digiexamDatumUrFilnamn, digiexamFrageStatistik, digiexamProvnamnUrFilnamn, digiexamSvar, importeraResultat,
  laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, tolkaDigiExamRapport, tomStruktur, uppdateraElev, type Struktur,
} from '../src/index.js';

// Samma form som DigiExams blad "Grades" (fejkade namn — verkliga elevnamn hör inte hemma i kodrepot).
const RUBRIK = ['First Name', 'Last Name', 'E-mail', 'Student Code', 'Final Grade', 'Fråga 1', 'Fråga 2', 'Fråga 3', 'Fråga 4'];
const FEJK: Array<Array<string | number | null>> = [
  RUBRIK,
  ['Anna', 'Berg', 'anna.berg@elevmail.test', 'anna.berg@elevmail.test', 3.5, 1, 1, 0.5, 1],
  ['Omar', 'Ali', 'omar.ali@elevmail.test', 'omar.ali@elevmail.test', 2, 1, 0, 1, 0],
  ['Pia', 'Provlund', 'pia.provlund@elevmail.test', 'pia.provlund@elevmail.test', 0, 0, 0, 0, 0],
  ['Kalle', 'Testsson', 'kalle.testsson@elevmail.test', 'kalle.2.testsson@elevmail.test', 4, 1, 1, 1, 1],
];

function bygg(): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:15', slut: '10:30' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  // Kalle heter något annat i rostern men har e-posten registrerad — e-posten ska vinna
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Karl Testsson', grupp: 'A', epost: 'Kalle.Testsson@elevmail.test' });
  return s;
}

describe('Del 150 · DigiExam-export', () => {
  it('tolkar bladet Grades: namn, e-post, kod, totalpoäng och poäng per fråga; maxpoäng härleds per fråga', () => {
    const r = tolkaDigiExamRapport(FEJK);
    expect(r.fragor.map((f) => f.nr)).toEqual(['1', '2', '3', '4']);
    expect(r.fragor.map((f) => f.max)).toEqual([1, 1, 1, 1]);
    expect(r.maxPoang).toBe(4);
    expect(r.avvikandeSumma).toBe(false);
    expect(r.rader.map((x) => [x.namn, x.epost, x.poang, x.nollrad])).toEqual([
      ['Anna Berg', 'anna.berg@elevmail.test', 3.5, false],
      ['Omar Ali', 'omar.ali@elevmail.test', 2, false],
      ['Pia Provlund', 'pia.provlund@elevmail.test', 0, true],
      ['Kalle Testsson', 'kalle.testsson@elevmail.test', 4, false],
    ]);
    expect(r.rader[3].kod).toBe('kalle.2.testsson@elevmail.test');
    expect(r.rader[0].fragePoang).toEqual([1, 1, 0.5, 1]);
  });

  it('svar per fråga: full poäng = rätt, delpoäng = ej rätt, poängen som text med decimalkomma', () => {
    const r = tolkaDigiExamRapport(FEJK);
    expect(digiexamSvar(r, r.rader[0])).toEqual([
      { fraga: 'Fråga 1', svar: '1', ratt: true }, { fraga: 'Fråga 2', svar: '1', ratt: true },
      { fraga: 'Fråga 3', svar: '0,5', ratt: false }, { fraga: 'Fråga 4', svar: '1', ratt: true },
    ]);
  });

  it('frågestatistik utan nollrader: full/del/noll och medel i procent av frågans max', () => {
    const r = tolkaDigiExamRapport(FEJK);
    const st = digiexamFrageStatistik(r);
    expect(st[0]).toEqual({ nr: '1', full: 3, del: 0, noll: 0, medel: 100 });
    expect(st[2]).toEqual({ nr: '3', full: 2, del: 1, noll: 0, medel: 83 });
    expect(st[3]).toEqual({ nr: '4', full: 2, del: 0, noll: 1, medel: 67 });
    expect(digiexamFrageStatistik(r, true)[3].noll).toBe(2);
  });

  it('flera poäng per fråga: max härleds som högsta poäng, Final Grade som text tolkas, saknad Final Grade ger summan', () => {
    const celler: Array<Array<string | number | null>> = [
      ['Förnamn', 'Efternamn', 'E-post', 'Fråga 1', 'Fråga 2'],
      ['Anna', 'Berg', 'a@x.test', 2, 3],
      ['Omar', 'Ali', 'o@x.test', 1, 0],
    ];
    const r = tolkaDigiExamRapport(celler);
    expect(r.fragor.map((f) => f.max)).toEqual([2, 3]);
    expect(r.maxPoang).toBe(5);
    expect(r.rader.map((x) => x.poang)).toEqual([5, 1]);
    const medText = tolkaDigiExamRapport([RUBRIK, ['Anna', 'Berg', 'a@x.test', 'a@x.test', '3,5', '1', '1', '0,5', '1']]);
    expect(medText.rader[0].poang).toBe(3.5);
    expect(medText.rader[0].fragePoang).toEqual([1, 1, 0.5, 1]);
  });

  it('avvisar filer utan DigiExam-rubrik och filer utan elevrader med svenska fel', () => {
    expect(() => tolkaDigiExamRapport([['', '', '1', '2'], ['Anna', 'Berg', 1, 0]])).toThrow('Hittar ingen rubrikrad');
    expect(() => tolkaDigiExamRapport([RUBRIK])).toThrow('inga elevrader');
  });

  it('provnamn och exportdatum ur filnamnet', () => {
    expect(digiexamProvnamnUrFilnamn('2026-09-30-2248-8b-ekologi-omprov-e-prov.xlsx')).toBe('8b ekologi omprov e prov');
    expect(digiexamProvnamnUrFilnamn('Ekologi_E-prov.xlsx')).toBe('Ekologi E prov');
    expect(digiexamDatumUrFilnamn('2026-09-30-2248-8b-ekologi-eprov.xlsx')).toBe('2026-09-30');
    expect(digiexamDatumUrFilnamn('ekologi.xlsx')).toBeNull();
  });

  it('importen kopplar via e-post före namn, sparar svar per fråga och kan hoppa över nollrader', () => {
    const s0 = bygg();
    const r = tolkaDigiExamRapport(FEJK);
    const u = importeraResultat(s0, {
      klassId: 'k', amneId: 'bi', kalla: 'digiexam', prov: 'Ekologi E-prov', datum: '2026-09-25',
      rader: r.rader.filter((x) => !x.nollrad).map((x) => ({ namn: x.namn, epost: x.epost, poang: x.poang, maxPoang: r.maxPoang, svar: digiexamSvar(r, x) })),
    });
    expect(u.traffar).toBe(3);
    expect(u.omatchade).toEqual([]);
    const kalle = u.s.resultat!.find((x) => x.elevId === 'e3')!;
    expect(kalle).toMatchObject({ kalla: 'digiexam', prov: 'Ekologi E-prov', datum: '2026-09-25', poang: 4, maxPoang: 4, amneId: 'bi' });
    const anna = u.s.resultat!.find((x) => x.elevId === 'e1')!;
    expect(anna.svar!.map((x) => x.ratt)).toEqual([true, true, false, true]);
    // e-posten kan sparas på eleven så att nästa import träffar exakt
    const s2 = uppdateraElev(u.s, 'e1', { epost: 'anna.berg@elevmail.test' });
    expect(s2.elever.find((e) => e.id === 'e1')!.epost).toBe('anna.berg@elevmail.test');
  });

  it('digiexamAnalys: medel, andel full poäng per fråga, svaga frågor och procentserie per elev', () => {
    let s = bygg();
    const r = tolkaDigiExamRapport(FEJK);
    const rader = r.rader.filter((x) => !x.nollrad).map((x) => ({ namn: x.namn, epost: x.epost, poang: x.poang, maxPoang: r.maxPoang, svar: digiexamSvar(r, x) }));
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'digiexam', prov: 'Ekologi E-prov', datum: '2026-09-25', rader }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'digiexam', prov: 'Ekologi CA-prov', datum: '2026-10-02', rader: [{ namn: 'Anna Berg', poang: 6, maxPoang: 8 }] }).s;
    const a = digiexamAnalys(s, 'k', 'bi');
    expect(a.prov.map((p) => [p.prov, p.antal, p.medel])).toEqual([['Ekologi E-prov', 3, 79], ['Ekologi CA-prov', 1, 75]]);
    expect(a.prov[0].fragor.find((f) => f.nr === '4')).toEqual({ nr: '4', full: 2, ejFull: 1, andelFull: 67 });
    expect(a.prov[0].svaga).toEqual([]);
    const anna = a.elever.find((e) => e.elevId === 'e1')!;
    expect(anna.procent.map((p) => (p === null ? null : Math.round(p)))).toEqual([88, 75]);
    expect(a.elever.find((e) => e.elevId === 'e2')!.procent[1]).toBeNull();
    // Magma-resultat blandas inte in
    expect(digiexamAnalys(s, 'k', 'ma').prov).toEqual([]);
  });
});

import { digiexamLarm, digiexamProvInfo, omprovNamn } from '../src/domain/digiexam.js';
import { digiexamProvTyp, eProvGrans, godkantGransFor, klaratKrav } from '../src/domain/resultat.js';

describe('Del 152 · samma prov, omprov, gräns och larm', () => {
  it('samma prov oavsett klass, exporttid och ordföljd; omprov känns igen', () => {
    const a = digiexamProvInfo('2026-09-30-2249-8a-e-prov-ekologi.xlsx');
    const b = digiexamProvInfo('2026-09-30-2249-ekologi-eprov.xlsx');
    const c = digiexamProvInfo('2026-09-30-2248-8b-ekologi-eprov.xlsx');
    const o = digiexamProvInfo('2026-09-30-2248-8b-ekologi-omprov-e-prov.xlsx');
    expect(a).toEqual({ nyckel: 'ekologi eprov', namn: 'Ekologi E-prov', omprov: false, typ: 'E' });
    expect(b.nyckel).toBe('ekologi eprov'); expect(c.nyckel).toBe('ekologi eprov');
    expect(o).toEqual({ nyckel: 'ekologi eprov', namn: 'Ekologi E-prov', omprov: true, typ: 'E' });
    expect(digiexamProvInfo('Cellen CA-prov.xlsx')).toMatchObject({ nyckel: 'caprov cellen', namn: 'Cellen CA-prov', typ: 'CA' });
    expect(digiexamProvInfo('kemi-slutprov.xlsx')).toMatchObject({ typ: null });
    expect(omprovNamn('Ekologi E-prov')).toBe('Ekologi E-prov – omprov');
  });

  it('E-prov: mer än hälften av poängen — 14 → 8, 21 → 11; andra prov saknar gräns tills läraren anger den', () => {
    expect(eProvGrans(14)).toBe(8); expect(eProvGrans(21)).toBe(11); expect(eProvGrans(20)).toBe(11);
    expect(digiexamProvTyp('Ekologi E-prov')).toBe('E'); expect(digiexamProvTyp('Ekologi ECA-prov')).toBe('ECA');
    expect(godkantGransFor({ kalla: 'digiexam', prov: 'Ekologi E-prov', maxPoang: 14 })).toBe(8);
    expect(godkantGransFor({ kalla: 'digiexam', prov: 'Ekologi ECA-prov', maxPoang: 30 })).toBeNull();
    expect(godkantGransFor({ kalla: 'digiexam', prov: 'Ekologi ECA-prov', maxPoang: 30, godkantGrans: 12 })).toBe(12);
    expect(klaratKrav({ kalla: 'digiexam', prov: 'Ekologi E-prov', poang: 8, maxPoang: 14 })).toBe(true);
    expect(klaratKrav({ kalla: 'digiexam', prov: 'Ekologi E-prov', poang: 7, maxPoang: 14 })).toBe(false);
    expect(klaratKrav({ kalla: 'digiexam', prov: 'Kemi', poang: 7, maxPoang: 14 })).toBeNull();
  });

  it('larm: ej godkända och ej skrivit; omprov räknas ihop med provet och kan göra eleven godkänd', () => {
    let s = bygg();   // Anna, Omar, Karl
    s = laggTillElev(s, { id: 'e4', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
    const imp = (prov: string, datum: string, rader: Array<[string, number]>, omprov = false) => {
      s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'digiexam', prov, datum, provNyckel: 'ekologi eprov', ...(omprov ? { omprov: true } : {}), rader: rader.map(([namn, poang]) => ({ namn, poang, maxPoang: 14 })) }).s;
    };
    imp('Ekologi E-prov', '2026-09-25', [['Anna Berg', 12], ['Omar Ali', 6], ['Karl Testsson', 7]]);
    let [l] = digiexamLarm(s, 'k', 'bi');
    expect(l).toMatchObject({ prov: 'Ekologi E-prov', grans: 8, maxPoang: 14, godkanda: 1, antalElever: 4, larm: true });
    expect(l.ejGodkanda.map((e) => [e.namn, e.poang])).toEqual([['Karl Testsson', 7], ['Omar Ali', 6]]);
    expect(l.ejSkrivit.map((e) => e.namn)).toEqual(['Pia Provlund']);
    // Omprovet: Omar 10 (godkänd), Karl 7 igen (fortfarande inte), Pia skriver omprovet (9)
    imp(omprovNamn('Ekologi E-prov'), '2026-10-05', [['Omar Ali', 10], ['Karl Testsson', 7], ['Pia Provlund', 9]], true);
    [l] = digiexamLarm(s, 'k', 'bi');
    expect(digiexamLarm(s, 'k', 'bi')).toHaveLength(1);              // ordinarie + omprov = ett prov
    expect(l).toMatchObject({ godkanda: 3, larm: true });
    expect(l.ejGodkanda.map((e) => e.namn)).toEqual(['Karl Testsson']);
    expect(l.ejSkrivit).toEqual([]);
    expect(l.godkandaPaOmprov.map((e) => [e.namn, e.forePoang, e.poang])).toEqual([['Omar Ali', 6, 10]]);
    imp(omprovNamn('Ekologi E-prov'), '2026-10-05', [['Omar Ali', 10], ['Karl Testsson', 9], ['Pia Provlund', 9]], true);
    expect(digiexamLarm(s, 'k', 'bi')[0]).toMatchObject({ godkanda: 4, larm: false });
  });

  it('larmar när gränsen inte går att tolka (inte E-prov och ingen gräns angiven)', () => {
    const s = importeraResultat(bygg(), { klassId: 'k', amneId: 'bi', kalla: 'digiexam', prov: 'Ekologi ECA-prov', datum: '2026-09-25', rader: [{ namn: 'Anna Berg', poang: 20, maxPoang: 30 }, { namn: 'Omar Ali', poang: 5, maxPoang: 30 }, { namn: 'Karl Testsson', poang: 9, maxPoang: 30 }] }).s;
    const [l] = digiexamLarm(s, 'k', 'bi');
    expect(l).toMatchObject({ grans: null, larm: true, godkanda: 0 });
    expect(l.ejGodkanda).toHaveLength(3);
  });
});
