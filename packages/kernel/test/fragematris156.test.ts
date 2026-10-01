import { describe, expect, it } from 'vitest';
import {
  fragematris, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, matrisKallor, sparaMagmaTest,
  tomStruktur, type FragaSvar, type ResultatKalla, type Struktur,
} from '../src/index.js';

const svar = (fragor: string[], ratt: boolean[]): FragaSvar[] => fragor.map((fraga, i) => ({ fraga, svar: ratt[i] ? '1' : '0', ratt: ratt[i] }));

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  const imp = (kalla: ResultatKalla, prov: string, datum: string, fragor: string[], anna: boolean[], omar: boolean[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla, prov, datum, rader: [
      { namn: 'Anna Berg', poang: anna.filter(Boolean).length, maxPoang: fragor.length, svar: svar(fragor, anna) },
      { namn: 'Omar Ali', poang: omar.filter(Boolean).length, maxPoang: fragor.length, svar: svar(fragor, omar) },
    ] }).s;
  };
  imp('socrative-laxforhor', 'Matte11', '2026-09-01', ['Vad är en täljare?', 'Vad är en nämnare?'], [true, true], [true, false]);
  imp('digiexam', 'Ekologi E-prov', '2026-09-14', ['Fråga 1', 'Fråga 2'], [true, false], [false, false]);
  imp('digiexam', 'Ekologi E-prov – omprov', '2026-09-17', ['Fråga 1', 'Fråga 2'], [true, true], [true, false]);
  imp('digiexam', 'Cellen E-prov', '2026-10-01', ['Fråga 1'], [true], [true]);
  imp('magma', 'Test A', '2026-09-20', ['Uppgift 1', 'Uppgift 2'], [true, false], [false, false]);
  imp('magma', 'Diagnos', '2026-09-30', ['Uppgift 1'], [true], [true]);
  // Testens uppgifter (PDF): Diagnos uppgift 1 = Test A uppgift 2
  s = sparaMagmaTest(s, { titel: 'Test A', filnamn: 'a.pdf', testNyckel: 't1', uppgifter: [
    { nr: '1', nyckel: 'aaaa0001', text: '2 / 2/3 =', flerval: false, sida: 1, delkapitel: '1.4', formagor: ['M'] },
    { nr: '2', nyckel: 'aaaa0002', text: 'Skriv talet utan potens.\n0,4² =', flerval: false, sida: 1, delkapitel: '1.5', formagor: ['M'] },
  ] });
  s = sparaMagmaTest(s, { titel: 'Diagnos', filnamn: 'd.pdf', testNyckel: 't2', uppgifter: [
    { nr: '1', nyckel: 'aaaa0002', text: 'Skriv talet utan potens.\n0,4² =', flerval: false, sida: 1, delkapitel: '1.5', formagor: ['M'] },
  ] });
  return s;
}

describe('Del 156 · Frågematrisen separerad: Socrative, DigiExam, Magma', () => {
  it('källorna begränsas till en värld', () => {
    expect(matrisKallor(undefined)).toEqual(['socrative-laxforhor', 'socrative-exit', 'socrative-ovning']);
    expect(matrisKallor(['socrative-exit', 'digiexam', 'magma'])).toEqual(['socrative-exit']);
    expect(matrisKallor(['digiexam', 'magma'])).toEqual(['digiexam']);
    expect(matrisKallor(['magma'])).toEqual(['magma']);
  });

  it('standard = bara Socrative-frågor', () => {
    const m = fragematris(bygg(), { klassId: 'k' });
    expect(m.fragor.map((f) => f.fraga)).toEqual(['Vad är en täljare?', 'Vad är en nämnare?']);
    expect(m.rader.map((r) => r.kalla)).toEqual(['socrative-laxforhor']);
  });

  it('DigiExam: frågorna hör till sitt prov — ordinarie och omprov delar kolumner, andra prov får egna', () => {
    const m = fragematris(bygg(), { klassId: 'k', kallor: ['digiexam'] });
    expect(m.fragor.map((f) => [f.fraga, f.kod])).toEqual([
      ['Cellen E-prov · Fråga 1', 'Cellen E-prov'],
      ['Ekologi E-prov · Fråga 1', 'Ekologi E-prov'], ['Ekologi E-prov · Fråga 2', 'Ekologi E-prov'],
    ]);
    expect(m.grupper.map((g) => g.etikett)).toEqual(['Cellen E-prov', 'Ekologi E-prov']);
    expect(m.rader.map((r) => [r.prov, r.celler.map((c) => c?.procent ?? null)])).toEqual([
      ['Ekologi E-prov', [null, 50, 0]], ['Ekologi E-prov – omprov', [null, 100, 50]], ['Cellen E-prov', [100, null, null]],
    ]);
  });

  it('Magma: kolumnerna är uppgifterna ur PDF:en, grupperade per delkapitel; samma uppgift i två test = en kolumn', () => {
    const m = fragematris(bygg(), { klassId: 'k', kallor: ['magma'] });
    expect(m.fragor.map((f) => [f.fraga, f.kod])).toEqual([['2 / 2/3 =', '1.4'], ['Skriv talet utan potens. 0,4² =', '1.5']]);
    expect(m.grupper.map((g) => g.etikett)).toEqual(['Test14', 'Test15']);
    expect(m.rader.map((r) => [r.prov, r.celler.map((c) => c?.procent ?? null)])).toEqual([['Test A', [50, 0]], ['Diagnos', [null, 100]]]);
  });
});
