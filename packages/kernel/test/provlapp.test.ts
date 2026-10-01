import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { byggKapitel } from '../src/domain/bok.js';
import { nivaKarta, provlapp, provlappText } from '../src/domain/provlapp.js';
import { laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, sattLektionsplan, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur, type Bok, type Lektion, type Struktur } from '../src/domain/typer.js';

const HAR = dirname(fileURLToPath(import.meta.url));
const SPEKTRUM = bokFromValfriImport(readFileSync(join(HAR, 'fixtures', 'spektrum-biologi-kap6.json'), 'utf8'));

const TOM = { sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—' };
function lekt(id: number, typ: Lektion['typ'], avsnitt: string, del: number, extra: Partial<Lektion> = {}): Lektion {
  return { id, typ, avsnitt, del, niva1: '—', niva2: '—', niva3: '—', ...TOM, ...extra };
}
const MATTE: Bok = {
  id: 'ma-y', titel: 'Matematik Y', forlag: 'Liber', amne: 'Matematik', arskurs: 8,
  nivaer: { niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' },
  kapitel: [byggKapitel(1, 'Tal', '#123456', [
    lekt(1, 'regular', '1.1 Räkna med bråk', 1, { niva1: '1–8', niva2: '9–15', sidorTeori: 's. 8–10', mal: 'förkorta bråk\nförlänga bråk', begrepp: 'bråk, täljare', genomgang: 'Andel och bråk', ex: '2/5 av kvadraten' }),
    lekt(2, 'regular', '1.1 Räkna med bråk', 2, { niva2: '16–22', niva3: '23–30', sidorTeori: 's. 11–13', mal: 'förlänga bråk\njämföra bråk' }),
    lekt(3, 'regular', '1.2 Potenser', 1, { niva1: '31–36', niva2: '37–42', sidorTeori: 's. 14–16', begrepp: 'potens, bas, exponent' }),
    lekt(4, 'regular', '1.2 Potenser', 2, { niva2: '43–48', niva3: '49–55', sidorTeori: 's. 17–18' }),
    lekt(5, 'repetition', 'Blandade uppgifter', 1, { niva1: '56–63', niva2: '64–70', niva3: '71–78', sidorTeori: 's. 19–21', mal: 'Repetera hela kapitlet inför diagnosen.' }),
    lekt(6, 'repetition', 'Träna Taluppfattning', 1, { niva1: '1–20', sidorTeori: 's. 22–23' }),
    lekt(7, 'review', 'Sammanfattning', 1, { sidorTeori: 's. 24' }),
  ])],
};
MATTE.kapitel[0].resurser.forklaringar = { 'Bråk': 'Ett tal skrivet som täljare över nämnare.', potens: '4³ = 4 · 4 · 4' };
MATTE.kapitel[0].mal = ['räkna med bråk', 'potenser och tiopotenser'];

function bygg(bok: Bok, amneNamn: string): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k', namn: amneNamn, bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 5, start: '10:00', slut: '11:00' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-09-10' });
}

describe('Del 151 · Provlappen ur planeringen', () => {
  it('översätter bokens nivåer: ETT/TVÅ/TRE → E/C/A, Grön/Blå/Röd → E = Grön + Blå, C = Röd', () => {
    expect(nivaKarta({ niva1: 'ETT', niva2: 'TVÅ', niva3: 'TRE' })).toEqual({ karta: { E: [1], C: [2], A: [3] }, text: { E: 'ETT', C: 'TVÅ', A: 'TRE och fördjupning' } });
    expect(nivaKarta({ niva1: 'Grön', niva2: 'Blå', niva3: 'Röd' })).toEqual({ karta: { E: [1, 2], C: [3], A: [3] }, text: { E: 'Grön + Blå', C: 'Röd', A: 'Röd och fördjupning' } });
  });

  it('Matematik Y: mål och uppgifter per avsnitt, begrepp med förklaringar, övningar per E/C/A och lärarens notis', () => {
    let s = laggTillEgenRad(bygg(MATTE, 'Matematik'), 'am', { id: 'er1', position: 7, rubrik: 'Prov kapitel 1', typ: 'prov' }, '2026-09-14');
    s = sattLektionsplan(s, { id: 'lp7', amneId: 'am', lektionsIndex: 7, provlappNotis: 'Miniräknare tillåten på del 2.' });
    expect(provlapp(s, 'am', 0, '2026-09-14')).toBeNull();              // inte ett prov
    const p = provlapp(s, 'am', 7, '2026-09-14')!;
    expect(p).toMatchObject({ amne: 'Matematik', klass: '8B', bok: 'Matematik Y', kapitelNr: 1, kapitelNamn: 'Tal', provNamn: 'Prov kapitel 1', provDatum: '2026-10-09', provVecka: 41, notis: 'Miniräknare tillåten på del 2.' });
    expect(p.kapitelMal).toEqual(['räkna med bråk', 'potenser och tiopotenser']);
    expect(p.avsnitt.map((a) => [a.rubrik, a.typ])).toEqual([['1.1 Räkna med bråk', 'delkapitel'], ['1.2 Potenser', 'delkapitel'], ['Blandade uppgifter', 'blandade'], ['Träna Taluppfattning', 'trana'], ['Sammanfattning', 'sammanfattning']]);
    const d11 = p.avsnitt[0];
    expect(d11.mal).toEqual(['förkorta bråk', 'förlänga bråk', 'jämföra bråk']);
    expect(d11.uppgifter).toEqual({ niva1: '1–8', niva2: '9–22', niva3: '23–30' });   // 9–15 och 16–22 slås ihop
    expect(d11.genomgang).toEqual(['Andel och bråk']); expect(d11.exempel).toEqual(['2/5 av kvadraten']);
    expect(p.begrepp).toEqual([
      { begrepp: 'bråk', forklaring: 'Ett tal skrivet som täljare över nämnare.' }, { begrepp: 'täljare', forklaring: null },
      { begrepp: 'potens', forklaring: '4³ = 4 · 4 · 4' }, { begrepp: 'bas', forklaring: null }, { begrepp: 'exponent', forklaring: null },
    ]);
    expect(p.ovningar.E).toEqual([
      { avsnitt: '1.1 Räkna med bråk', uppgifter: 'ETT 1–8 (s. 8–13)' }, { avsnitt: '1.2 Potenser', uppgifter: 'ETT 31–36 (s. 14–18)' },
      { avsnitt: 'Blandade uppgifter', uppgifter: 'ETT 56–63 (s. 19–21)' }, { avsnitt: 'Träna Taluppfattning', uppgifter: 'ETT 1–20 (s. 22–23)' },
      { avsnitt: 'Sammanfattning', uppgifter: 's. 24' },
    ]);
    expect(p.ovningar.C).toEqual([
      { avsnitt: '1.1 Räkna med bråk', uppgifter: 'TVÅ 9–22 (s. 8–13)' }, { avsnitt: '1.2 Potenser', uppgifter: 'TVÅ 37–48 (s. 14–18)' },
      { avsnitt: 'Blandade uppgifter', uppgifter: 'TVÅ 64–70 (s. 19–21)' },
    ]);
    expect(p.ovningar.A).toEqual([
      { avsnitt: '1.1 Räkna med bråk', uppgifter: 'TRE 23–30 (s. 8–13)' }, { avsnitt: '1.2 Potenser', uppgifter: 'TRE 49–55 (s. 14–18)' },
      { avsnitt: 'Blandade uppgifter', uppgifter: 'TRE 71–78 (s. 19–21)' },
    ]);
    expect(p.repetitionSidor).toEqual(['Sammanfattning s. 24']);
    const text = provlappText(p);
    expect(text).toContain('PROVLAPP · Matematik 8B · Matematik Y');
    expect(text).toContain('Prov: Prov kapitel 1 · 2026-10-09 (v. 41)');
    expect(text).toContain('• bråk – Ett tal skrivet som täljare över nämnare.');
    expect(text).toContain('E-nivå\n  • 1.1 Räkna med bråk: ETT 1–8 (s. 8–13)');
    expect(text).toContain('Miniräknare tillåten på del 2.');
  });

  it('Spektrum (utan nivåer): delkapitlens mål och begrepp, Testa dig själv som E-övning', () => {
    const s = bygg(SPEKTRUM, 'Biologi');
    const ap = s; const idx = 8; // PROV efter 6.1–6.8
    const p = provlapp(ap, 'am', idx, '2026-09-14')!;
    expect(p).not.toBeNull();
    expect(p.provNamn).toBe('PROV');
    expect(p.avsnitt.map((a) => a.rubrik.slice(0, 3))).toEqual(['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8']);
    expect(p.avsnitt[0].begrepp).toContain('cellteorin');
    expect(p.avsnitt[0].exempel).toEqual(['Testa dig själv 6.1 · uppgift 1–7']);
    expect(p.begrepp.some((b) => b.forklaring !== null)).toBe(true);
    // Utan nivåuppgifter i boken finns inga uppgiftsintervall — övningslistorna är tomma, exemplen (Testa dig själv) står under avsnitten
    expect(p.ovningar.E).toEqual([]);
    expect(provlappText(p)).toContain('DET HÄR SKA DU KUNNA');
  });
});
