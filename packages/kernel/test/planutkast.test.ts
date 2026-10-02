/**
 * Del 158 · Planeringstavlan: utkast med startdatum och provdatum, tomma lektioner
 * med egna kortdelar, borttag som flyttar fram, och inläggning i den riktiga planeringen.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  amnesPlanFor, hamtaLektionsplan, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering,
  resetIdRaknare, sattLektionerPerDelkapitel, sattLektionsplan, sparaBok, sparaLaborationer,
} from '../src/domain/struktur.js';
import {
  amnetsUtkast, foljbaraAmnen, foljPlanering, infogaIUtkast, kortDetaljer, laggProvPaDatum, nyttKortIUtkast, planeringstavla, sattKortDetaljer,
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
