import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { byggKapitel } from '../src/domain/bok.js';
import { vagTillProvet, vagTyp, vagTypNamn } from '../src/domain/vagtillprovet.js';
import { laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, sattLektionsplan, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur, type Bok, type Lektion, type Struktur } from '../src/domain/typer.js';

const HAR = dirname(fileURLToPath(import.meta.url));
const SPEKTRUM = bokFromValfriImport(readFileSync(join(HAR, 'fixtures', 'spektrum-biologi-kap6.json'), 'utf8'));

const TOM = { sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—' };
function lekt(id: number, typ: Lektion['typ'], avsnitt: string, del: number, extra: Partial<Lektion> = {}): Lektion {
  return { id, typ, avsnitt, del, niva1: '—', niva2: '—', niva3: '—', ...TOM, ...extra };
}
/** En liten Matematik Y-bok: två delkapitel med två delar, Blandade uppgifter, Träna, Sammanfattning. */
const MATTE: Bok = {
  id: 'ma-y', titel: 'Matematik Y', forlag: 'Liber', amne: 'Matematik', arskurs: 8,
  nivaer: { niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' },
  kapitel: [byggKapitel(1, 'Tal', '#123456', [
    lekt(1, 'regular', '1.1 Räkna med bråk', 1, { niva1: '1–8', niva2: '9–15', sidorTeori: 's. 8–10', mal: 'förkorta bråk\nförlänga bråk', begrepp: 'bråk, täljare' }),
    lekt(2, 'regular', '1.1 Räkna med bråk', 2, { niva2: '16–22', niva3: '23–30', sidorTeori: 's. 11–13', mal: 'förlänga bråk\njämföra bråk' }),
    lekt(3, 'regular', '1.2 Potenser', 1, { niva1: '31–36', niva2: '37–42', sidorTeori: 's. 14–16', begrepp: 'potens, bas, exponent' }),
    lekt(4, 'regular', '1.2 Potenser', 2, { niva2: '43–48', niva3: '49–55', sidorTeori: 's. 17–18' }),
    lekt(5, 'repetition', 'Blandade uppgifter', 1, { niva1: '56–63', niva2: '64–70', niva3: '71–78', sidorTeori: 's. 19–21', mal: 'Repetera hela kapitlet inför diagnosen.' }),
    lekt(6, 'repetition', 'Träna Taluppfattning', 1, { niva1: '1–20', sidorTeori: 's. 22–23' }),
    lekt(7, 'review', 'Sammanfattning', 1, { sidorTeori: 's. 24' }),
  ])],
};

function bygg(bok: Bok, amneNamn: string, extra: Partial<Parameters<typeof laggTillAmne>[1]> = {}): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: amneNamn, bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 5, start: '10:00', slut: '11:00' }], ...extra });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-09-10' });
}

describe('Del 144: vägen till provet — alla avsnitt som boxar', () => {
  it('klassar avsnitt: delkapitel, Blandade uppgifter, Träna/Utveckla, Förmågorna, Sammanfattning, PERSPEKTIV, FINALEN, prov, diagnos', () => {
    expect(vagTyp({ typ: 'regular', avsnitt: '1.6 Tiopotenser' })).toBe('delkapitel');
    expect(vagTyp({ typ: 'regular', avsnitt: '1.10 Mer' })).toBe('delkapitel');
    expect(vagTyp({ typ: 'repetition', avsnitt: 'Blandade uppgifter' })).toBe('blandade');
    expect(vagTyp({ typ: 'repetition', avsnitt: 'Träna Taluppfattning och tals användning' })).toBe('trana');
    expect(vagTyp({ typ: 'repetition', avsnitt: 'Utveckla Taluppfattning och tals användning' })).toBe('utveckla');
    expect(vagTyp({ typ: 'ovaformagor', avsnitt: 'Förmågorna i fokus' })).toBe('formagor');
    expect(vagTyp({ typ: 'review', avsnitt: 'Sammanfattning' })).toBe('sammanfattning');
    expect(vagTyp({ typ: 'ovaformagor', avsnitt: 'PERSPEKTIV' })).toBe('perspektiv');
    expect(vagTyp({ typ: 'repetition', avsnitt: 'FINALEN' })).toBe('finalen');
    expect(vagTyp({ typ: 'exam', avsnitt: 'PROV' })).toBe('prov');
    expect(vagTyp({ typ: 'regular', avsnitt: 'Prov kapitel 1' })).toBe('prov');
    expect(vagTyp({ typ: 'test', avsnitt: 'Diagnos' })).toBe('diagnos');
    expect(vagTyp({ typ: 'laboration', avsnitt: 'Laboration: cellen' })).toBe('laboration');
    expect(vagTypNamn('blandade')).toBe('Blandade uppgifter');
  });

  it('Matematik Y: delkapitel med del 1/2 och uppgifter per nivå, Blandade/Träna/Sammanfattning som boxar, egen provrad sist', () => {
    // Prov som egen rad efter alla bokens lektioner (position 7)
    let s = laggTillEgenRad(bygg(MATTE, 'Matematik'), 'am', { id: 'er1', position: 7, rubrik: 'Prov kapitel 1', typ: 'prov' }, '2026-09-14');
    // Lektion 1 (mån 14/9) kryssad som klar; idag = fre 18/9 (lektion 2)
    s = sattLektionsplan(s, { id: 'lp0', amneId: 'am', lektionsIndex: 0, klar: true, uppgNiva2: '9–14' });
    const v = vagTillProvet(s, 'am', undefined, '2026-09-18')!;
    expect(v).not.toBeNull();
    expect(v.kapitelNr).toBe(1); expect(v.nivaer).toEqual({ niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' });
    expect(v.boxar.map((b) => b.rubrik)).toEqual(['1.1 Räkna med bråk', '1.2 Potenser', 'Blandade uppgifter', 'Träna Taluppfattning', 'Sammanfattning']);
    expect(v.boxar.map((b) => b.typ)).toEqual(['delkapitel', 'delkapitel', 'blandade', 'trana', 'sammanfattning']);
    expect(v.boxar.map((b) => b.ikon)).toEqual(['📖', '📖', '🔀', '🏋️', '📝']);
    // Provet ligger för sig, sist på vägen
    expect(v.prov).toMatchObject({ typ: 'prov', rubrik: 'Prov kapitel 1', status: 'kommande' });
    expect(v.prov!.lektioner).toHaveLength(1);
    expect(v.prov!.fran).toBe('2026-10-09');
    expect(v.totalt).toBe(8); expect(v.klara).toBe(1);

    // 1.1: del 1 klar (kryss), del 2 idag → pågår; uppgifter ETT/TVÅ/TRE med lärarens eget TVÅ-intervall på del 1
    const d11 = v.boxar[0];
    expect(d11).toMatchObject({ kod: '1.1', sidor: 's. 8–13', status: 'pagar', klara: 1, fran: '2026-09-14', till: '2026-09-18', veckaFran: 38, veckaTill: 38 });
    expect(d11.lektioner.map((l) => [l.del, l.datum, l.status, l.kryss])).toEqual([[1, '2026-09-14', 'klar', true], [2, '2026-09-18', 'idag', false]]);
    expect(d11.lektioner[0].uppgifter).toEqual({ niva1: '1–8', niva2: '9–14', niva3: '—' });
    expect(d11.lektioner[1].uppgifter).toEqual({ niva1: '—', niva2: '16–22', niva3: '23–30' });
    expect(d11.mal).toEqual(['förkorta bråk', 'förlänga bråk', 'jämföra bråk']);       // dedupat över delarna
    expect(d11.begrepp).toEqual(['bråk', 'täljare']);
    expect(d11.lektioner[0].index).toBe(0);
    // 1.2 kommande, Blandade uppgifter med tre nivåer och mål
    expect(v.boxar[1]).toMatchObject({ status: 'kommande', klara: 0, fran: '2026-09-21', till: '2026-09-25', veckaFran: 39, veckaTill: 39 });
    expect(v.prov).toMatchObject({ veckaFran: 41, veckaTill: 41 });
    expect(v.boxar[2].lektioner[0].uppgifter).toEqual({ niva1: '56–63', niva2: '64–70', niva3: '71–78' });
    expect(v.boxar[2].mal).toEqual(['Repetera hela kapitlet inför diagnosen.']);
    expect(v.boxar[4]).toMatchObject({ typ: 'sammanfattning', sidor: 's. 24', status: 'kommande' });
  });

  it('Spektrum: delkapitel 6.1–6.8 följt av PROV; passerade datum räknas som gjorda', () => {
    const v = vagTillProvet(bygg(SPEKTRUM, 'Biologi'), 'am', undefined, '2026-09-28')!;
    expect(v.kapitelNr).toBe(6);
    expect(v.boxar.map((b) => b.kod)).toEqual(['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8']);
    expect(v.boxar.every((b) => b.typ === 'delkapitel')).toBe(true);
    expect(v.prov).toMatchObject({ typ: 'prov', rubrik: 'PROV', ikon: '🏆' });
    // 14/9, 18/9, 21/9, 25/9 gjorda; 28/9 idag
    expect(v.boxar.map((b) => b.status)).toEqual(['klar', 'klar', 'klar', 'klar', 'pagar', 'kommande', 'kommande', 'kommande']);
    expect(v.boxar[4].lektioner[0].status).toBe('idag');
    expect(v.boxar[0].begrepp).toContain('cellteorin');
    expect(v.boxar[0].lektioner[0].exempel).toBe('Testa dig själv 6.1 · uppgift 1–7');
    expect(v.klara).toBe(4); expect(v.totalt).toBe(9);
  });

  it('PERSPEKTIV och FINALEN blir egna boxar mellan delkapitlen och provet', () => {
    const bok: Bok = {
      ...SPEKTRUM,
      kapitel: SPEKTRUM.kapitel.map((k) => {
        const prov = k.extraLektioner.find((l) => l.typ === 'exam')!;
        const ovriga = k.extraLektioner.filter((l) => l !== prov);
        return { ...k, extraLektioner: [...ovriga,
          lekt(prov.id, 'ovaformagor', 'PERSPEKTIV', 1, { sidorTeori: 's. 262–263', genomgang: 'Organdonation', ex: '4 diskussionsfrågor (EPA)' }),
          lekt(prov.id + 1, 'repetition', 'FINALEN', 1, { sidorTeori: 's. 264–265', ex: '12 uppgifter' }),
          { ...prov, id: prov.id + 2 }] };
      }),
    };
    const v = vagTillProvet(bygg(bok, 'Biologi'), 'am', 6, '2026-09-14')!;
    expect(v.boxar.slice(-2).map((b) => [b.typ, b.rubrik, b.ikon])).toEqual([['perspektiv', 'PERSPEKTIV', '🔭'], ['finalen', 'FINALEN', '🏁']]);
    expect(v.boxar.at(-2)!.lektioner[0].exempel).toBe('4 diskussionsfrågor (EPA)');
    expect(v.prov!.rubrik).toBe('PROV');
    // Provet kommer efter Finalen i datum
    expect(v.prov!.fran! > v.boxar.at(-1)!.till!).toBe(true);
  });

  it('utan prov är prov null; halvklass (NO) ger laborationsboxar och grupp på B-raderna som skiljer sig', () => {
    expect(vagTillProvet(bygg(MATTE, 'Matematik'), 'am', 1, '2026-09-14')!.prov).toBeNull();
    expect(vagTillProvet(bygg(MATTE, 'Matematik'), 'am', 99, '2026-09-14')).toBeNull(); // okänt kapitel
    const s = bygg(SPEKTRUM, 'Biologi', { halvklass: true, schemaB: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 5, start: '11:00', slut: '12:00' }] });
    const v = vagTillProvet(s, 'am', 6, '2026-09-14')!;
    expect(v.boxar.map((b) => b.typ).slice(0, 4)).toEqual(['delkapitel', 'laboration', 'delkapitel', 'laboration']);
    expect(v.boxar[1]).toMatchObject({ rubrik: 'Laboration 1', ikon: '🧪' });
    // Måndagspasset är gemensamt (ingen grupp); fredagens laboration ligger på olika tider → rad för A och rad för B
    expect(v.boxar[0].lektioner.map((l) => l.grupp)).toEqual([undefined]);
    expect(v.boxar[1].lektioner.map((l) => l.grupp).sort()).toEqual(['A', 'B']);
  });
});
