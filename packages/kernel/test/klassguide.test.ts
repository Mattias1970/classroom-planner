import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { tolkaSchemaPdf, type PdfTextItem } from '../src/domain/schemapdf.js';
import { arskursForKlass, bokForslag, klassGuideStatus, kopplaForeslagnaBocker, schematsKlasser, skapaAllaPlaneringar, slaIhopSchemaForKlasser } from '../src/domain/klassguide.js';
import { laggTillElev, laggTillSkolar, resetIdRaknare, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur, type Bok, type Struktur } from '../src/domain/typer.js';
import { byggKapitel } from '../src/domain/bok.js';

const items = JSON.parse(readFileSync(join(__dirname, 'fixtures/mittschema.json'), 'utf-8')) as PdfTextItem[];
beforeEach(resetIdRaknare);

function bok(id: string, amne: string, arskurs: number): Bok {
  return {
    id, titel: `${amne} ${arskurs} (${id})`, forlag: 'Testförlaget', amne, arskurs, nivaer: { niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' },
    kapitel: [byggKapitel(1, 'K1', '#123456', Array.from({ length: 30 }, (_, i) => ({ id: i + 1, typ: 'regular' as const, avsnitt: `1.${i + 1} Avsnitt`, del: 1, niva1: '—', niva2: '—', niva3: '—', sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—' })))],
  };
}

function medSkolar(): Struktur {
  return laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
}

describe('Del 155: lathund för en ny klass', () => {
  it('schemat: klasserna i PDF:en listas och bara den valda läses in', () => {
    const t = tolkaSchemaPdf(items);
    const kl = schematsKlasser(t);
    expect(kl.map((k) => k.klass)).toEqual(['8A', '8B']);
    expect(kl.find((k) => k.klass === '8B')!.amnen).toEqual(['Matematik', 'NO+Tk']);
    const u = slaIhopSchemaForKlasser(medSkolar(), t, 'la', ['8B']);
    expect(u.s.klasser.map((k) => k.namn)).toEqual(['8B']);
    // Matematik + fyra NO-delämnen
    expect(u.s.amnen.map((a) => a.namn).sort()).toEqual(['Biologi', 'Fysik', 'Kemi', 'Matematik', 'Teknik']);
    // En gång till: inget dubbleras
    const u2 = slaIhopSchemaForKlasser(u.s, t, 'la', ['8B']);
    expect(u2.s.amnen).toHaveLength(5);
    expect(u2.skapade).toEqual([]);
  });

  it('checklistan, bokförslag (samma årskurs först), entydiga böcker kopplas och alla planeringar skapas på en gång', () => {
    const t = tolkaSchemaPdf(items);
    let s = slaIhopSchemaForKlasser(medSkolar(), t, 'la', ['8B']).s;
    const k = s.klasser[0].id;
    expect(arskursForKlass('8B')).toBe(8);
    let st = klassGuideStatus(s, k)!;
    expect(st.klart).toEqual({ schema: true, bocker: false, planering: false, elever: false });
    expect(st.amnen.find((a) => a.amne.namn === 'Matematik')!.passPerVecka).toBe(4);

    s = sparaBok(s, bok('ma7', 'Matematik', 7));
    s = sparaBok(s, bok('ma8', 'Matematik', 8));
    s = sparaBok(s, bok('bi8', 'Biologi', 8));
    const ma = s.amnen.find((a) => a.namn === 'Matematik')!;
    expect(bokForslag(s, ma).map((b) => b.id)).toEqual(['ma8', 'ma7']);     // åk 8 först

    const kopp = kopplaForeslagnaBocker(s, k);
    // Matematik: två böcker men bara en i åk 8 → kopplas. Biologi: en bok → kopplas. Fysik/Kemi/Teknik: ingen bok.
    expect(kopp.kopplade).toEqual(['Matematik: Matematik 8 (ma8)', 'Biologi: Biologi 8 (bi8)']);
    s = kopp.s;
    st = klassGuideStatus(s, k)!;
    expect(st.klart.bocker).toBe(false);                                    // Fysik, Kemi, Teknik saknar bok

    const pl = skapaAllaPlaneringar(s, k, '2026-08-10T08:00:00Z');
    expect(pl.skapade).toEqual(['Matematik', 'Biologi']);
    expect(pl.utanBok.sort()).toEqual(['Fysik', 'Kemi', 'Teknik']);
    s = pl.s;
    // Körs igen: inget skapas två gånger
    expect(skapaAllaPlaneringar(s, k, '2026-08-11T08:00:00Z').skapade).toEqual([]);

    s = laggTillElev(s, { id: 'e1', klassId: k, namn: 'Anna Testsson', grupp: 'A' });
    st = klassGuideStatus(s, k)!;
    expect(st.klart.elever).toBe(true);
    expect(st.antalElever).toBe(1);
    expect(klassGuideStatus(s, 'finns-ej')).toBeNull();
  });
});
