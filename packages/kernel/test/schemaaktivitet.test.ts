/**
 * Del 187 · Schemabrytande aktiviteter mellan två klockslag: pass som överlappar används inte
 * i planeringen; lektionerna flyttas till nästa pass och lärarens fasta kort ligger kvar.
 */
import { describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { brytandeAktivitet, laggTillAktivitet, passSparr, SKOLDAG_SLUT, SKOLDAG_START, skoldagarMellan, taBortAktivitet } from '../src/domain/skolar.js';
import { amnesPlanFor, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, samlaSlots, sparaBok } from '../src/domain/struktur.js';
import { laggTillSchemaAktivitet, laggTillSchemaPeriod, taBortSchemaAktivitet, taBortSchemaPeriod, tillampaUtkast } from '../src/domain/planutkast.js';
import { veckaRutor } from '../src/domain/kalender.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const BOK = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'b', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [1, 2, 3, 4, 5, 6].map((id) => ({ id, type: 'regular', avsnitt: `1.${id} Del ${id}`, del: 1 })) },
}));
const IDAG = '2026-08-24';

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'a', tjanstId: 'tj', namn: '8A' });
  s = laggTillKlass(s, { id: 'b', tjanstId: 'tj', namn: '8B' });
  // Tisdag 10–11 och torsdag 13–14
  const schema = [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '13:00', slut: '14:00' }];
  s = laggTillAmne(s, { id: 'ma-a', klassId: 'a', namn: 'Matematik', bokId: 'b', schema });
  s = laggTillAmne(s, { id: 'ma-b', klassId: 'b', namn: 'Matematik', bokId: 'b', schema });
  s = registreraPlanering(s, { id: 'pa', amneId: 'ma-a', bokId: 'b', skapad: '2026-08-10' });
  return registreraPlanering(s, { id: 'pb', amneId: 'ma-b', bokId: 'b', skapad: '2026-08-10' });
}
const rad = (s: Struktur, id = 'ma-a') => amnesPlanFor(s, id, IDAG)!.a.filter((r) => r.datum !== null).map((r) => `${r.datum!.slice(5)}:${r.nyckel}`);
const la = (s: Struktur) => s.skolar[0];

describe('Del 187 · schemabrytande aktiviteter', () => {
  const skolar: Skolar = { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [], aktiviteter: [{ id: 'x', datum: '2026-09-01', start: '09:30', slut: '10:15', label: 'Utflykt', klassIds: ['a'] }] };

  it('överlapp: pass som börjar före och slutar inom aktiviteten bryts; bara berörd klass; klassId null bortser', () => {
    expect(brytandeAktivitet('2026-09-01', '10:00', '11:00', skolar, 'a')?.label).toBe('Utflykt');
    expect(brytandeAktivitet('2026-09-01', '08:30', '09:30', skolar, 'a')).toBeNull();     // slutar när aktiviteten börjar
    expect(brytandeAktivitet('2026-09-01', '10:15', '11:00', skolar, 'a')).toBeNull();     // börjar när den slutar
    expect(brytandeAktivitet('2026-09-01', '10:00', '11:00', skolar, 'b')).toBeNull();     // annan klass
    expect(passSparr('2026-09-01', '10:00', skolar, '11:00', 'a')).toBe('Utflykt 09:30–10:15');
    expect(passSparr('2026-09-01', '10:00', skolar, '11:00', null)).toBeNull();
    const allaKlasser: Skolar = { ...skolar, aktiviteter: [{ ...skolar.aktiviteter![0], klassIds: undefined }] };
    expect(brytandeAktivitet('2026-09-01', '10:00', '11:00', allaKlasser, 'b')).not.toBeNull();
    expect(samlaSlots(skolar, [{ dag: 2, start: '10:00', slut: '11:00' }], 'a').map((x) => x.datum).slice(0, 3)).toEqual(['2026-08-18', '2026-08-25', '2026-09-08']);
  });

  it('validering: tider, ordning, inom skolåret, inte före idag; borttag av passerad avvisas', () => {
    const tom: Skolar = { ...skolar, aktiviteter: [] };
    expect(() => laggTillAktivitet(tom, { datum: '2026-09-01', start: '9:30', slut: '10:00', label: 'X' })).toThrow(/TT:MM/);
    expect(() => laggTillAktivitet(tom, { datum: '2026-09-01', start: '10:00', slut: '10:00', label: 'X' })).toThrow(/efter starttiden/);
    expect(() => laggTillAktivitet(tom, { datum: '2027-08-01', start: '10:00', slut: '11:00', label: 'X' })).toThrow(/utanför/);
    expect(() => laggTillAktivitet(tom, { datum: '2026-08-20', start: '10:00', slut: '11:00', label: 'X' }, IDAG)).toThrow(/redan varit/);
    expect(() => laggTillAktivitet(tom, { datum: '2026-09-01', start: '10:00', slut: '11:00', label: ' ' })).toThrow(/namn/);
    const med = laggTillAktivitet(tom, { datum: '2026-09-01', start: '10:00', slut: '11:00', label: 'Prao-info', klassIds: [] });
    expect(med.aktiviteter?.[0]).toMatchObject({ label: 'Prao-info', start: '10:00' });
    expect(med.aktiviteter?.[0].klassIds).toBeUndefined();
    expect(() => taBortAktivitet(med, med.aktiviteter![0].id, '2026-09-02')).toThrow(/redan varit/);
    expect(taBortAktivitet(med, med.aktiviteter![0].id, IDAG).aktiviteter).toBeUndefined();
  });

  it('lektionerna flyttas till nästa pass i berörd klass; den andra klassen påverkas inte', () => {
    const s = grund();
    expect(rad(s).slice(0, 4)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:1:4']);
    const r = laggTillSchemaAktivitet(s, 'la', { datum: '2026-08-25', start: '09:00', slut: '12:00', label: 'Utflykt', klassIds: ['a'] }, IDAG);
    expect(rad(r.s).slice(0, 4)).toEqual(['08-18:1:1', '08-20:1:2', '08-27:1:3', '09-01:1:4']);
    expect(rad(r.s, 'ma-b')).toEqual(rad(s, 'ma-b'));
    expect(r.berorda).toEqual([{ amneId: 'ma-a', amne: '8A Matematik', pass: 1, fasta: 0 }]);
    // Borttag: passet används igen
    const id = la(r.s).aktiviteter![0].id;
    const r2 = taBortSchemaAktivitet(r.s, 'la', id, IDAG);
    expect(rad(r2.s)).toEqual(rad(s));
    expect(la(r2.s).aktiviteter).toBeUndefined();
  });

  it('lärarens prov ligger kvar på sitt datum; ett prov på det brutna passet flyttas till nästa pass med varning', () => {
    let s = grund();
    s = tillampaUtkast(s, 'ma-a', { namn: 'Med prov', fran: '2026-08-25', teori: ['1:3', '1:4', 'u:prov', '1:5', '1:6'], labbar: [], egna: [{ id: 'prov', rubrik: 'Prov kapitel 1', typ: 'prov' }] }, IDAG);
    expect(rad(s).slice(2, 6)).toEqual(['08-25:1:3', '08-27:1:4', '09-01:u:prov', '09-03:1:5']);
    // Aktiviteten tar 27/8 (torsdag 13–14): 1:4 flyttas, provet ligger kvar 1/9
    const r = laggTillSchemaAktivitet(s, 'la', { datum: '2026-08-27', start: '12:30', slut: '13:30', label: 'Idrott', klassIds: ['a'] }, IDAG);
    expect(rad(r.s).slice(2, 6)).toEqual(['08-25:1:3', '09-01:u:prov', '09-03:1:4', '09-08:1:5']);
    expect(r.berorda[0]).toMatchObject({ pass: 1, fasta: 1 });
    expect(r.varningar).toEqual([]);
    // Aktivitet på provets pass: provet flyttas till nästa pass
    const r2 = laggTillSchemaAktivitet(s, 'la', { datum: '2026-09-01', start: '10:00', slut: '11:00', label: 'Nationellt prov', klassIds: ['a'] }, IDAG);
    expect(rad(r2.s).slice(2, 6)).toEqual(['08-25:1:3', '08-27:1:4', '09-03:u:prov', '09-08:1:5']);
    expect(r2.varningar.join(' ')).toMatch(/Prov kapitel 1.*Nationellt prov.*nästa pass/);
  });

  it('kalendern visar aktiviteten med klassnamn', () => {
    const r = laggTillSchemaAktivitet(grund(), 'la', { datum: '2026-08-25', start: '09:00', slut: '12:00', label: 'Utflykt', klassIds: ['a'] }, IDAG);
    const tis = veckaRutor('2026-08-25', la(r.s), new Map(), new Map([['a', '8A']]))[1];
    expect(tis.aktiviteter).toEqual(['Utflykt 09:00–12:00 (8A)']);
  });
});

describe('Del 204 · tid som försvinner från schemat under en period', () => {
  it('skoldagar mellan två datum hoppar helg, lov och röda dagar', () => {
    const s = grund();
    const l = { ...la(s), dagar: [{ datum: '2026-09-02', typ: 'heldag' as const, label: 'Studiedag' }] };
    expect(skoldagarMellan(l, '2026-08-28', '2026-09-03')).toEqual(['2026-08-28', '2026-08-31', '2026-09-01', '2026-09-03']);
    expect(skoldagarMellan(l, '2026-08-15', '2026-08-18')).toEqual(['2026-08-17', '2026-08-18']);   // före skolårets start hoppas
  });

  it('hela skoldagar 1–4 sep för 8A: tis 1/9 och tor 3/9 tas; en grupp som kan tas bort i ett svep', () => {
    const s = grund();
    const fore = rad(s);
    const r = laggTillSchemaPeriod(s, 'la', { fran: '2026-09-01', till: '2026-09-04', start: SKOLDAG_START, slut: SKOLDAG_SLUT, label: 'Prao', klassIds: ['a'] }, IDAG);
    expect(r.dagar).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
    expect(r.berorda.find((b) => b.amneId === 'ma-a')?.pass).toBe(2);
    expect(r.berorda.some((b) => b.amneId === 'ma-b')).toBe(false);
    expect((la(r.s).aktiviteter ?? []).filter((a) => a.grupp === r.grupp)).toHaveLength(4);
    expect(rad(r.s).slice(0, 6)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:1:4', '09-08:1:5', '09-10:1:6']);
    expect(rad(r.s, 'ma-b')).toEqual(rad(s, 'ma-b'));
    // Bara eftermiddagen (från 12:00 resten av dagen): tisdagens 10–11 kvar, torsdagens 13–14 tas
    const r2 = laggTillSchemaPeriod(s, 'la', { fran: '2026-09-01', till: '2026-09-04', start: '12:00', slut: SKOLDAG_SLUT, label: 'Friluftsdagar', klassIds: ['a'] }, IDAG);
    expect(rad(r2.s).slice(0, 6)).toEqual(['08-18:1:1', '08-20:1:2', '08-25:1:3', '08-27:1:4', '09-01:1:5', '09-08:1:6']);
    // Ta bort perioden → som förut
    const b = taBortSchemaPeriod(r.s, 'la', r.grupp, IDAG);
    expect(b).toMatchObject({ borttagna: 4, kvar: 0 });
    expect(rad(b.s)).toEqual(fore);
    expect(la(b.s).aktiviteter).toBeUndefined();
    // Fel
    expect(() => laggTillSchemaPeriod(s, 'la', { fran: '2026-09-05', till: '2026-09-04', start: '08:00', slut: '12:00', label: 'x' }, IDAG)).toThrow(/före startdatumet/);
    expect(() => laggTillSchemaPeriod(s, 'la', { fran: '2026-09-05', till: '2026-09-06', start: '08:00', slut: '12:00', label: 'x' }, IDAG)).toThrow(/Inga skoldagar/);
    expect(() => laggTillSchemaPeriod(s, 'la', { fran: '2026-08-20', till: '2026-08-21', start: '08:00', slut: '12:00', label: 'x' }, IDAG)).toThrow(/redan varit/);
    expect(() => taBortSchemaPeriod(s, 'la', 'finns-ej', IDAG)).toThrow(/finns inte/);
  });
});
