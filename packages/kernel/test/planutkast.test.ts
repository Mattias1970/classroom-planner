/**
 * Del 158 · Planeringstavlan: utkast med startdatum och provdatum, tomma lektioner
 * med egna kortdelar, borttag som flyttar fram, och inläggning i den riktiga planeringen.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  amnesPlanFor, hamtaLektionsplan, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering,
  resetIdRaknare, sattLektionerPerDelkapitel, sattLektionsplan, sattLektionsVal, sparaBok, sparaLaborationer,
} from '../src/domain/struktur.js';
import {
  amnetsUtkast, foljbaraAmnen, foljPlanering, infogaIUtkast, kapitelBorjar, kortDetaljer, laddaKapitel, taBortLektion, laggProvPaDatum, nyttKortIUtkast, planeringstavla, sattKortDetaljer,
  sparaUtkast, taBortUrUtkast, taBortUtkast, tabortInlagtUtkast, tillampaUtkast, utkastFranPlan,
} from '../src/domain/planutkast.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1 },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2 },
    { id: 3, type: 'regular', avsnitt: '1.2 Procent', del: 1 },
    { id: 4, type: 'exam', avsnitt: '1 Prov', del: 1 },
  ] },
}));

const BIO = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'bio', titel: 'Biologi', förlag: 'Test', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } },
  lektioner: { '4': [
    { id: 1, type: 'regular', avsnitt: '4.1 Ekosystem', del: 1 },
    { id: 2, type: 'regular', avsnitt: '4.2 Näringskedjor', del: 1 },
    { id: 3, type: 'regular', avsnitt: '4.3 Kretslopp', del: 1 },
  ] },
}));

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(sparaBok(s, MA), BIO);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma/NO' });
  return laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
}
function matte(): Struktur {
  const s = laggTillAmne(grund(), { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
}
const IDAG = '2026-08-24';
const nycklar = (s: Struktur, id = 'ma') => amnesPlanFor(s, id, IDAG)!.a.map((r) => `${r.datum}:${r.nyckel}`);

beforeEach(resetIdRaknare);

describe('Del 158 · planeringstavlan (helklass)', () => {
  it('utkastet börjar som nuvarande planering från startdatum; tavlan visar vecka, dag, tid och palett', () => {
    const s = matte();
    const u = utkastFranPlan(s, 'ma', '2026-08-25', IDAG, 'Höst');
    expect(u.teori).toEqual(['1:3', '1:4']);
    const t = planeringstavla(s, 'ma', u, IDAG);
    expect(t.kolumner[0]).toMatchObject({ datum: '2026-08-25', vecka: 35, veckodag: 2, start: '10:00', slut: '11:00', nyckel: '1:3', kod: '1.2', ko: 'teori', koIndex: 0 });
    expect(t.kolumner[2]).toMatchObject({ datum: '2026-09-01', tom: true, koIndex: 2 });
    expect(t.palett[0].grupper.map((g) => g.titel)).toEqual(['1.1 Bråk', '1.2 Procent', '1 Prov']);
    expect(t.palett[0].grupper[0].lektioner.map((l) => l.anvand)).toEqual(['fore', 'fore']);
    expect(t.palett[0].grupper[1].lektioner[0].anvand).toBe('utkast');
  });

  it('tom lektion med egna kortdelar, provet på provdatum med repetition, borttag flyttar fram', () => {
    const s = matte();
    let u = utkastFranPlan(s, 'ma', '2026-08-25', IDAG, 'Höst');
    const ny = nyttKortIUtkast(u, { typ: 'lektion', rubrik: 'Bråk i vardagen' }, 'teori', 0);
    u = sattKortDetaljer(ny.utkast, ny.nyckel, { genomgang: 'Recept och rabatter', bam: [{ namn: 'Genomgång', minuter: 20 }, { namn: 'Arbete', minuter: 40 }], uppgNiva1: 'Stencil 1' });
    u = { ...u, provDatum: '2026-09-08' };
    const p = laggProvPaDatum(s, 'ma', u, IDAG);
    expect(p.repetition).toBe(2);
    expect(p.utkast.teori).toEqual([ny.nyckel, '1:3', 'u:rep-2026-09-08-1', 'u:rep-2026-09-08-2', '1:4']);
    const t = planeringstavla(s, 'ma', p.utkast, IDAG);
    expect(t.prov).toMatchObject({ nyckel: '1:4', hamnar: '2026-09-08', malDatum: '2026-09-08', passFore: 4, paPlats: true, efterProv: 0 });
    expect(t.kolumner[0]).toMatchObject({ rubrik: 'Bråk i vardagen', egen: { typ: 'lektion' } });
    // Ta bort en planerad lektion: de följande flyttas fram ett pass
    const utan = taBortUrUtkast(p.utkast, 'u:rep-2026-09-08-1');
    expect(planeringstavla(s, 'ma', utan, IDAG).prov).toMatchObject({ hamnar: '2026-09-03', paPlats: false });
    // Flytta provet sist via drag & drop-funktionen
    expect(infogaIUtkast(p.utkast, 'teori', '1:4', 0).teori[0]).toBe('1:4');
  });

  it('läggs in från startdatum: passen före ändras inte, lektionsplanerna följer sina lektioner, kortdelarna förs över', () => {
    let s = matte();
    s = sattLektionsplan(s, { id: 'lp', amneId: 'ma', lektionsIndex: 2, filmer: ['Procent|https://exempel.se/p'] });  // 1:3
    let u = utkastFranPlan(s, 'ma', '2026-08-25', IDAG, 'Höst');
    expect(kortDetaljer(s, 'ma', u, '1:3', IDAG)).toEqual({ filmer: ['Procent|https://exempel.se/p'] });
    const ny = nyttKortIUtkast(u, { typ: 'lektion', rubrik: 'Bråk i vardagen' }, 'teori', 0);
    u = sattKortDetaljer(ny.utkast, ny.nyckel, { genomgang: 'Recept och rabatter', bam: [{ namn: 'Arbete', minuter: 60 }] });
    expect(() => tillampaUtkast(s, 'ma', { ...u, fran: '2026-08-20' }, IDAG)).toThrow(/före idag/);
    s = tillampaUtkast(s, 'ma', u, IDAG);
    expect(nycklar(s)).toEqual(['2026-08-18:1:1', '2026-08-20:1:2', `2026-08-25:${ny.nyckel}`, '2026-08-27:1:3', '2026-09-01:1:4']);
    expect(hamtaLektionsplan(s, 'ma', 3)?.filmer).toEqual(['Procent|https://exempel.se/p']);
    expect(hamtaLektionsplan(s, 'ma', 2)).toMatchObject({ genomgang: 'Recept och rabatter', bam: [{ namn: 'Arbete', minuter: 60 }] });
    expect(s.amnen[0].planFranUtkast).toMatchObject({ namn: 'Höst', fran: '2026-08-25' });
    expect(s.amnen[0].planFranUtkast).not.toHaveProperty('detaljer');

    // Ett nytt utkast senare behåller det förra utkastets lektioner fram till sitt startdatum
    let u2 = utkastFranPlan(s, 'ma', '2026-09-01', IDAG, 'Höst 2');
    u2 = taBortUrUtkast(u2, '1:4');
    s = tillampaUtkast(s, 'ma', u2, IDAG);
    expect(nycklar(s)).toEqual(['2026-08-18:1:1', '2026-08-20:1:2', `2026-08-25:${ny.nyckel}`, '2026-08-27:1:3']);
    expect(s.amnen[0].planFranUtkast).toMatchObject({ namn: 'Höst 2', fran: '2026-08-25' });

    // Ta bort det inlagda utkastet → boken igen
    s = tabortInlagtUtkast(s, 'ma', IDAG);
    expect(nycklar(s)).toEqual(['2026-08-18:1:1', '2026-08-20:1:2', '2026-08-25:1:3', '2026-08-27:1:4']);
    expect(hamtaLektionsplan(s, 'ma', 2)?.filmer).toEqual(['Procent|https://exempel.se/p']);
  });

  it('sparade utkast har unika namn per ämne', () => {
    let s = matte();
    const u = utkastFranPlan(s, 'ma', '2026-08-25', IDAG, 'Höst');
    const r = sparaUtkast(s, 'ma', u, undefined, '2026-08-24');
    s = r.s;
    expect(() => sparaUtkast(s, 'ma', { ...u, namn: ' höst ' })).toThrow(/finns redan/);
    expect(() => sparaUtkast(s, 'ma', { ...u, namn: '' })).toThrow(/namn/);
    expect(amnetsUtkast(s, 'ma').map((x) => x.namn)).toEqual(['Höst']);
    s = sparaUtkast(s, 'ma', { ...u, namn: 'Höst B' }, r.id).s;
    expect(amnetsUtkast(s, 'ma').map((x) => x.namn)).toEqual(['Höst B']);
    expect(amnetsUtkast(taBortUtkast(s, r.id), 'ma')).toEqual([]);
  });
});

describe('Del 158 · planeringstavlan (halvklass med laborationer)', () => {
  it('halvklasspassen visar laborationer; egna laborationer och teori läggs i var sin kö', () => {
    let s = laggTillAmne(grund(), {
      id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', halvklass: true,
      schema: [{ dag: 1, start: '10:00', slut: '11:00' }, { dag: 2, start: '13:00', slut: '14:00' }],
      schemaB: [{ dag: 1, start: '10:00', slut: '11:00' }, { dag: 3, start: '13:00', slut: '14:00' }],
    });
    s = sparaLaborationer(s, 'bi', [{ id: 'l1', rubrik: 'Mikroskopet' }, { id: 'l2', rubrik: 'Fotosyntes' }]);
    let u = utkastFranPlan(s, 'bi', '2026-08-24', IDAG, 'Ekologi');
    // 17–18 aug är genomförda (före idag) och behåller bokens följd: 4:1 och 4:2
    expect(u.teori).toEqual(['4:3']);
    expect(u.labbar).toEqual(['lab:l1', 'lab:l2']);
    const t = planeringstavla(s, 'bi', u, IDAG);
    expect(t.halvklass).toBe(true);
    expect(t.kolumner.slice(0, 2)).toMatchObject([
      { datum: '2026-08-24', passTyp: 'teori', nyckel: '4:3', b: null },
      { datum: '2026-08-25', passTyp: 'lab', ko: 'labbar', nyckel: 'lab:l1', rubrik: '🧪 Mikroskopet', b: { datum: '2026-08-26', start: '13:00' } },
    ]);
    expect(() => nyttKortIUtkast(u, { typ: 'lektion', rubrik: 'Fel' }, 'labbar', 0)).toThrow(/laborationer/);
    const lab = nyttKortIUtkast(u, { typ: 'lab', rubrik: 'Egen lab' }, 'labbar', 0);
    const lek = nyttKortIUtkast(lab.utkast, { typ: 'lektion', rubrik: 'Fältstudie' }, 'teori', 0);
    u = lek.utkast;
    s = tillampaUtkast(s, 'bi', u, IDAG);
    const plan = amnesPlanFor(s, 'bi', IDAG)!;
    expect(plan.a.filter((r) => r.datum !== null && r.datum >= IDAG).slice(0, 4).map((r) => `${r.datum}:${r.nyckel}`)).toEqual([`2026-08-24:${lek.nyckel}`, `2026-08-25:lab:${lab.nyckel}`, '2026-08-31:4:3', '2026-09-01:lab:l1']);
    expect(plan.b.find((r) => r.datum === '2026-08-26')).toMatchObject({ datum: '2026-08-26', nyckel: `lab:${lab.nyckel}` });
  });
});

describe('Del 161 · följ en annan klass planering', () => {
  it('8A följer 8B från startdatum: samma ordning, lektionskorten med, extra lektioner blir egna kort, det genomförda rörs inte', () => {
    let s = grund();
    s = laggTillKlass(s, { id: 'k2', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'maB', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
    s = laggTillAmne(s, { id: 'maA', klassId: 'k2', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 3, start: '08:10', slut: '09:10' }] });
    s = registreraPlanering(s, { id: 'plB', amneId: 'maB', bokId: 'ma', skapad: '2026-08-10' });
    s = registreraPlanering(s, { id: 'plA', amneId: 'maA', bokId: 'ma', skapad: '2026-08-10' });
    // 8B: två lektioner på 1.2, provet sist, en film på 1.2
    s = sattLektionerPerDelkapitel(s, 'maB', 2);
    s = sattLektionsplan(s, { id: 'lpB', amneId: 'maB', lektionsIndex: 2, filmer: ['Procent|https://exempel.se/p'], genomgang: 'Procent som bråk' });
    expect(foljbaraAmnen(s, 'maA').map((a) => a.id)).toEqual(['maB']);
    expect(() => foljPlanering(s, 'maA', 'maA', IDAG, IDAG)).toThrow(/annat ämne/);
    const r = foljPlanering(s, 'maA', 'maB', IDAG, IDAG);
    // 8B från idag: 1:3, 1:3#2, 1:4 → hos 8A finns inte 1:3#2 i bokföljden → eget kort
    expect(r).toMatchObject({ teori: 3, labbar: 0, egnaKort: 1, kort: 1 });
    const plan = amnesPlanFor(r.s, 'maA', IDAG)!.a;
    expect(plan.map((x) => `${x.datum}:${x.nyckel}`)).toEqual(['2026-08-17:1:1', '2026-08-19:1:2', '2026-08-24:1:3', '2026-08-26:u:f-1-3-2', '2026-08-31:1:4']);
    expect(hamtaLektionsplan(r.s, 'maA', 2)).toMatchObject({ filmer: ['Procent|https://exempel.se/p'], genomgang: 'Procent som bråk' });
    expect(plan[3].lektion.avsnitt).toBe('1.2 Procent');
    expect(r.s.amnen.find((a) => a.id === 'maA')?.planFranUtkast?.namn).toBe('Följer 8B · Matematik');
  });
});

describe('Del 174 · följ veckovis — samma saker samma vecka', () => {
  const MA2 = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'ma2', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
    lektioner: { '1': [
      { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1 },
      { id: 2, type: 'regular', avsnitt: '1.2 Procent', del: 1 },
      { id: 3, type: 'repetition', avsnitt: 'Träna mera', del: 1 },
      { id: 4, type: 'regular', avsnitt: '1.3 Potenser', del: 1 },
      { id: 5, type: 'repetition', avsnitt: 'Blandade uppgifter', del: 1 },
      { id: 6, type: 'regular', avsnitt: '1.4 Tal', del: 1 },
      { id: 7, type: 'exam', avsnitt: '1 Prov', del: 1 },
    ] },
  }));
  function tva(schemaA: Array<{ dag: number; start: string; slut: string }>): Struktur {
    let s = sparaBok(grund(), MA2);
    s = laggTillKlass(s, { id: 'k2', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'maB', klassId: 'k', namn: 'Matematik', bokId: 'ma2', schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
    s = laggTillAmne(s, { id: 'maA', klassId: 'k2', namn: 'Matematik', bokId: 'ma2', schema: schemaA });
    s = registreraPlanering(s, { id: 'plB', amneId: 'maB', bokId: 'ma2', skapad: '2026-08-10' });
    return registreraPlanering(s, { id: 'plA', amneId: 'maA', bokId: 'ma2', skapad: '2026-08-10' });
  }
  const FRAN = '2026-08-17';   // måndag v. 34, läsårets första dag

  it('8A med tre pass i veckan: 8B:s två lektioner läggs samma vecka och det tredje passet blir en övning', () => {
    const s = tva([{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 3, start: '08:10', slut: '09:10' }, { dag: 5, start: '08:10', slut: '09:10' }]);
    // 8B v. 34: 1:1 (tis 18/8), 1:2 (tor 20/8); v. 35: 1:3, 1:4; v. 36: 1:5, 1:6; v. 37: 1:7
    const r = foljPlanering(s, 'maA', 'maB', FRAN, FRAN, { veckovis: true });
    const plan = amnesPlanFor(r.s, 'maA', FRAN)!.a;
    expect(plan.slice(0, 10).map((x) => `${x.datum}:${x.nyckel}`)).toEqual([
      '2026-08-17:1:1', '2026-08-19:1:2', '2026-08-21:u:ov-2026-08-21',
      '2026-08-24:1:3', '2026-08-26:1:4', '2026-08-28:u:ov-2026-08-28',
      '2026-08-31:1:5', '2026-09-02:1:6', '2026-09-04:u:ov-2026-09-04', '2026-09-07:1:7']);
    expect(plan[2].lektion.avsnitt).toBe('Övning');
    // Efter källans sista lektion fylls inga fler övningar på
    expect(plan[10]?.nyckel ?? 'pass').toMatch(/^pass|^$/);
    expect(r.strukna).toEqual([]);
  });

  it('8A med ett pass i veckan: övningslektioner stryks så att veckorna går ihop, 8A:s eget prov ligger kvar', () => {
    let s = tva([{ dag: 3, start: '08:10', slut: '09:10' }]);
    // 8A har ett eget provkort onsdag 26/8 (v. 35)
    s = tillampaUtkast(s, 'maA', { namn: 'Eget prov', fran: FRAN, teori: ['1:1', 'u:provA', '1:2'], labbar: [], egna: [{ id: 'provA', rubrik: 'Prov kapitel 1 (8A)', typ: 'prov' }] }, FRAN);
    expect(amnesPlanFor(s, 'maA', FRAN)!.a.slice(0, 3).map((x) => `${x.datum}:${x.nyckel}`)).toEqual(['2026-08-19:1:1', '2026-08-26:u:provA', '2026-09-02:1:2']);
    const r = foljPlanering(s, 'maA', 'maB', FRAN, FRAN, { veckovis: true });
    const plan = amnesPlanFor(r.s, 'maA', FRAN)!.a;
    // v. 34: 8B gör 1:1 och 1:2 — 8A har ett pass → 1:1; 1:2 släpar, så övningen 1:3 (Träna mera) stryks
    // v. 35: 8A:s pass är provet (ligger kvar); 8B gjorde 1:3 (struken) och 1:4
    // v. 36: 1:2 (eftersläpning), övningen 1:5 (Blandade uppgifter) stryks; v. 37: 1:4; v. 38: 1:6
    expect(plan.slice(0, 5).map((x) => `${x.datum}:${x.nyckel}`)).toEqual(['2026-08-19:1:1', '2026-08-26:u:provA', '2026-09-02:1:2', '2026-09-09:1:4', '2026-09-16:1:6']);
    expect(r.strukna).toEqual(['Träna mera', 'Blandade uppgifter']);
    // 8B:s eget provkort (1:7) hoppas över eftersom 8A har ett eget prov
    expect(plan.map((x) => x.nyckel)).not.toContain('1:7');
    expect(r.varningar.some((v) => v.includes('ströks'))).toBe(true);
  });

  it('till och med ett datum: därefter fortsätter boken i ordning på 8A:s schema; historik skriver om genomförda pass bara på uttryckligt val', () => {
    const s = tva([{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 3, start: '08:10', slut: '09:10' }, { dag: 5, start: '08:10', slut: '09:10' }]);
    const IDAG2 = '2026-09-01';
    // Startdatum före idag kräver historik
    expect(() => foljPlanering(s, 'maA', 'maB', FRAN, IDAG2, { veckovis: true, till: '2026-08-28' })).toThrow(/före idag/);
    const r = foljPlanering(s, 'maA', 'maB', FRAN, IDAG2, { veckovis: true, till: '2026-08-28', historik: true });
    const plan = amnesPlanFor(r.s, 'maA', IDAG2)!.a;
    // t.o.m. 28/8 som 8B (vecka för vecka), sedan bokens nästa lektioner (1:5 Blandade uppgifter, 1:6, 1:7 Prov) i ordning
    expect(plan.slice(0, 9).map((x) => `${x.datum}:${x.nyckel}`)).toEqual([
      '2026-08-17:1:1', '2026-08-19:1:2', '2026-08-21:u:ov-2026-08-21',
      '2026-08-24:1:3', '2026-08-26:1:4', '2026-08-28:u:ov-2026-08-28',
      '2026-08-31:1:5', '2026-09-02:1:6', '2026-09-04:1:7']);
    expect(r.strukna).toEqual([]);
  });
});

describe('Del 183 · kapitlet börjar ett visst datum — genomförda kapitel 2-lektioner flyttas fram, prov ligger kvar', () => {
  const MA3 = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'ma3', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' }, '2': { name: 'Samband', col: '#2f8a58' } } },
    lektioner: {
      '1': [{ id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1 }, { id: 2, type: 'regular', avsnitt: '1.2 Potenser', del: 1 }, { id: 3, type: 'test', avsnitt: 'Diagnos 1', del: 1 }],
      '2': [{ id: 1, type: 'regular', avsnitt: '2.1 Andelen', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.2 Delen', del: 1 }],
    },
  }));
  it('2.1 hamnar på startdatumet, passen före blir övningar och lärarens provkort behåller sitt datum', () => {
    let s = sparaBok(grund(), MA3);
    s = laggTillAmne(s, { id: 'ma3', klassId: 'k', namn: 'Matematik', bokId: 'ma3', schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 3, start: '08:10', slut: '09:10' }, { dag: 5, start: '08:10', slut: '09:10' }] });
    s = registreraPlanering(s, { id: 'pl3', amneId: 'ma3', bokId: 'ma3', skapad: '2026-08-10' });
    // Planen (fel): 2.1 redan 24/8, lärarens prov 26/8, 2.2 28/8 — allt "genomfört" idag 7/10
    s = tillampaUtkast(s, 'ma3', { namn: 'Fel', fran: '2026-08-17', teori: ['1:1', '1:2', '1:3', '2:1', 'u:provA', '2:2'], labbar: [], egna: [{ id: 'provA', rubrik: 'Prov kapitel 1', typ: 'prov' }] }, '2026-08-17');
    s = sattLektionsplan(s, { id: 'lp21', amneId: 'ma3', lektionsIndex: 3, genomgang: 'Andelar i vardagen' });
    const fore = amnesPlanFor(s, 'ma3', '2026-10-07')!.a.map((r) => `${r.datum}:${r.nyckel}`);
    expect(fore.slice(0, 6)).toEqual(['2026-08-17:1:1', '2026-08-19:1:2', '2026-08-21:1:3', '2026-08-24:2:1', '2026-08-26:u:provA', '2026-08-28:2:2']);
    const r = kapitelBorjar(s, 'ma3', 2, '2026-08-31');
    expect(r).toMatchObject({ flyttade: 2, ovningar: 2, fasta: 1 });
    const plan = amnesPlanFor(r.s, 'ma3', '2026-10-07')!.a;
    expect(plan.slice(0, 8).map((x) => `${x.datum}:${x.nyckel}`)).toEqual([
      '2026-08-17:1:1', '2026-08-19:1:2', '2026-08-21:1:3',
      '2026-08-24:u:ov-2026-08-24', '2026-08-26:u:provA', '2026-08-28:u:ov-2026-08-28',
      '2026-08-31:2:1', '2026-09-02:2:2']);
    expect(plan[3].lektion.avsnitt).toBe('Övning');
    // Lektionskortet följer 2.1 till det nya datumet
    expect(hamtaLektionsplan(r.s, 'ma3', 6)?.genomgang).toBe('Andelar i vardagen');
    expect(() => kapitelBorjar(r.s, 'ma3', 2, '2026-08-31')).toThrow(/Inga lektioner/);
  });
});

describe('Del 185 · ladda ett kapitel från ett pass · ta bort en lektion', () => {
  const MA4 = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'ma4', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' }, '2': { name: 'Samband', col: '#2f8a58' }, '3': { name: 'Geometri', col: '#8a2f5a' } } },
    lektioner: {
      '1': [{ id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1 }, { id: 2, type: 'regular', avsnitt: '1.2 Potenser', del: 1 }, { id: 3, type: 'test', avsnitt: 'Diagnos 1', del: 1 }],
      '2': [{ id: 1, type: 'regular', avsnitt: '2.1 Andelen', del: 1 }, { id: 2, type: 'regular', avsnitt: '2.2 Delen', del: 1 }, { id: 3, type: 'repetition', avsnitt: 'Blandade uppgifter', del: 1 }, { id: 4, type: 'exam', avsnitt: 'Prov 2', del: 1 }],
      '3': [{ id: 1, type: 'regular', avsnitt: '3.1 Omkrets', del: 1 }, { id: 2, type: 'regular', avsnitt: '3.2 Area', del: 1 }],
    },
  }));
  function m4(): Struktur {
    let s = sparaBok(grund(), MA4);
    s = laggTillAmne(s, { id: 'm4', klassId: 'k', namn: 'Matematik', bokId: 'ma4', schema: [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }] });
    return registreraPlanering(s, { id: 'pl4', amneId: 'm4', bokId: 'ma4', skapad: '2026-08-10' });
  }
  const rad = (s: Struktur) => amnesPlanFor(s, 'm4', IDAG)!.a.filter((r) => r.datum !== null).map((r) => `${r.datum!.slice(5)}:${r.nyckel}`);

  it('kapitel 3 från 27/8: kapitlet först, kapitel 2 flyttas senare, genomförda pass orörda, lektionskorten följer', () => {
    let s = m4();
    expect(rad(s)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:2:1', '09-01:2:2', '09-03:2:3', '09-08:2:4', '09-10:3:1', '09-15:3:2']);
    s = sattLektionsplan(s, { id: 'lp31', amneId: 'm4', lektionsIndex: 7, filmer: ['Omkrets|https://exempel.se/o'] });
    s = sattLektionsplan(s, { id: 'lp21', amneId: 'm4', lektionsIndex: 3, genomgang: 'Andelar' });
    const r = laddaKapitel(s, 'm4', 3, '2026-08-27', IDAG);
    expect(rad(r.s)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:3:1', '09-01:3:2', '09-03:2:1', '09-08:2:2', '09-10:2:3', '09-15:2:4']);
    expect(r).toMatchObject({ kapitel: 3, namn: 'Geometri', forsta: '2026-08-27', sista: '2026-09-01', inlagda: 2, framflyttade: 4, fasta: 0, hoppade: 0, aterinforda: 0, rymsEj: 0, kort: 1 });
    expect(hamtaLektionsplan(r.s, 'm4', 3)?.filmer).toEqual(['Omkrets|https://exempel.se/o']);
    expect(hamtaLektionsplan(r.s, 'm4', 5)?.genomgang).toBe('Andelar');
    // Idempotent: samma kapitel igen ändrar inget
    expect(rad(laddaKapitel(r.s, 'm4', 3, '2026-08-27', IDAG).s)).toEqual(rad(r.s));
  });

  it('eget prov ligger kvar på sitt datum; startdag utan pass tar nästa pass; före idag avvisas; okänt kapitel avvisas', () => {
    let s = m4();
    s = tillampaUtkast(s, 'm4', { namn: 'Med prov', fran: '2026-08-25', teori: ['1:3', '2:1', 'u:provA', '2:2', '2:3', '2:4', '3:1', '3:2'], labbar: [], egna: [{ id: 'provA', rubrik: 'Prov kapitel 1', typ: 'prov' }] }, IDAG);
    expect(rad(s).slice(2, 5)).toEqual(['08-25:1:3', '08-27:2:1', '09-01:u:provA']);
    const r = laddaKapitel(s, 'm4', 3, '2026-08-27', IDAG);
    expect(rad(r.s)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:3:1', '09-01:u:provA', '09-03:3:2', '09-08:2:1', '09-10:2:2', '09-15:2:3', '09-17:2:4']);
    expect(r.fasta).toBe(1);
    // Måndag 24/8 (= idag, inget pass): första passet 25/8
    const r2 = laddaKapitel(m4(), 'm4', 3, '2026-08-24', IDAG);
    expect(rad(r2.s).slice(2, 6)).toEqual(['08-25:3:1', '08-27:3:2', '09-01:1:3', '09-03:2:1']);
    expect(r2.forsta).toBe('2026-08-25');
    expect(() => laddaKapitel(m4(), 'm4', 3, '2026-08-20', IDAG)).toThrow(/före idag/);
    expect(() => laddaKapitel(m4(), 'm4', 9, '2026-08-27', IDAG)).toThrow(/finns inte/);
  });

  it('borttagna lektioner ur kapitlet läggs in igen; genomförda ur kapitlet hoppas över', () => {
    let s = m4();
    s = sattLektionsVal(s, 'm4', '3:2', { bort: true }, IDAG);
    expect(rad(s)).not.toContain('09-15:3:2');
    const r = laddaKapitel(s, 'm4', 3, '2026-08-27', IDAG);
    expect(r.aterinforda).toBe(1);
    expect(rad(r.s).slice(3, 5)).toEqual(['08-27:3:1', '09-01:3:2']);
    // Kapitel 1 från 25/8: 1:1 och 1:2 är genomförda → bara 1:3 läggs (och ligger redan där)
    const r3 = laddaKapitel(m4(), 'm4', 1, '2026-08-25', IDAG);
    expect(r3).toMatchObject({ inlagda: 1, hoppade: 2 });
    expect(rad(r3.s)).toEqual(rad(m4()));
  });

  it('Del 186: egna kopior av kapitlets lektioner (från Följ planering) ersätts av boken — prov och andra kapitel ligger kvar', () => {
    let s = m4();
    // Gammal följd planering: kapitel 2 som egna kopior (f-2-…), en kopia med samma rubrik, ett eget prov och kapitel 3
    s = tillampaUtkast(s, 'm4', {
      namn: 'Följer 8B', fran: '2026-08-27',
      teori: ['u:f-2-1', 'u:f-2-3-2', 'u:blandat', 'u:provB', '3:1', '3:2'], labbar: [],
      egna: [
        { id: 'f-2-1', rubrik: '2.1 Andelen', typ: 'lektion' },
        { id: 'f-2-3-2', rubrik: 'Blandade uppgifter', typ: 'ovning' },
        { id: 'blandat', rubrik: 'blandade uppgifter', typ: 'ovning' },
        { id: 'provB', rubrik: 'Prov kapitel 2', typ: 'prov' },
      ],
    }, IDAG);
    expect(rad(s).slice(3, 7)).toEqual(['08-27:u:f-2-1', '09-01:u:f-2-3-2', '09-03:u:blandat', '09-08:u:provB']);
    const r = laddaKapitel(s, 'm4', 2, '2026-08-27', IDAG);
    const efter = rad(r.s);
    expect(efter.filter((x) => x.includes('u:f-2') || x.includes('u:blandat'))).toEqual([]);
    expect(efter).toContain('09-08:u:provB');            // provet ligger kvar på sitt datum
    expect(efter.slice(3, 6)).toEqual(['08-27:2:1', '09-01:2:2', '09-03:2:3']);
    expect(efter.filter((x) => x.endsWith(':3:1') || x.endsWith(':3:2'))).toHaveLength(2);   // kapitel 3 kvar efter
    expect(r.kopior).toBe(3);
    expect(r.varningar.join(' ')).toMatch(/3 egna kopior/);
    expect(r.s.amnen.find((a) => a.id === 'm4')?.planFranUtkast?.egna.map((k) => k.id)).toEqual(['provB']);
  });

  it('ta bort en lektion: de följande flyttas ett pass tidigare, egna prov ligger kvar; genomförd kan inte tas bort', () => {
    let s = m4();
    s = tillampaUtkast(s, 'm4', { namn: 'Med prov', fran: '2026-08-25', teori: ['1:3', '2:1', 'u:provA', '2:2', '2:3', '2:4', '3:1', '3:2'], labbar: [], egna: [{ id: 'provA', rubrik: 'Prov kapitel 1', typ: 'prov' }] }, IDAG);
    s = sattLektionsplan(s, { id: 'lp22', amneId: 'm4', lektionsIndex: 5, genomgang: 'Delen av det hela' });
    const r = taBortLektion(s, 'm4', '2:1', IDAG);
    expect(r).toMatchObject({ rubrik: '2.1 Andelen', datum: '2026-08-27', framflyttade: 5, fasta: 1, hadeKort: false });
    expect(rad(r.s)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:2:2', '09-01:u:provA', '09-03:2:3', '09-08:2:4', '09-10:3:1', '09-15:3:2']);
    expect(hamtaLektionsplan(r.s, 'm4', 3)?.genomgang).toBe('Delen av det hela');
    // Eget kort kan tas bort
    const r2 = taBortLektion(r.s, 'm4', 'u:provA', IDAG);
    expect(rad(r2.s).slice(3, 6)).toEqual(['08-27:2:2', '09-01:2:3', '09-03:2:4']);
    expect(r2.s.amnen.find((a) => a.id === 'm4')?.planFranUtkast?.egna).toEqual([]);
    expect(() => taBortLektion(s, 'm4', '1:1', IDAG)).toThrow(/genomförd/);
    expect(() => taBortLektion(s, 'm4', '9:9', IDAG)).toThrow(/finns inte/);
  });
});
