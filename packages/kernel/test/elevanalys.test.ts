import { describe, expect, it } from 'vitest';
import { elevanalys } from '../src/domain/elevanalys.js';
import { importeraResultat, type FragaSvar } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const A = 'Vad kallas samspelet i naturen?';
const B = 'Vad är en population?';

function sv(par: Array<[string, boolean]>): FragaSvar[] {
  return par.map(([fraga, ratt]) => ({ fraga, svar: ratt ? 'r' : 'f', ratt }));
}

/** Anna: starka läxförhör. Omar: svaga läxförhör, frånvaro, tappar under lektionen. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
  const lax = (prov: string, datum: string, rum: string, anna: FragaSvar[], omar: FragaSvar[] | null) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov, datum, rum, rader: [
      { namn: 'Anna Berg', poang: anna.filter((x) => x.ratt).length, maxPoang: anna.length, svar: anna },
      ...(omar === null ? [] : [{ namn: 'Omar Ali', poang: omar.filter((x) => x.ratt).length, maxPoang: omar.length, svar: omar }]),
    ] }).s;
  };
  const ex = (prov: string, datum: string, rum: string, annaP: number, omarP: number | null) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov, datum, rum, rader: [
      { namn: 'Anna Berg', poang: annaP, maxPoang: 10 },
      ...(omarP === null ? [] : [{ namn: 'Omar Ali', poang: omarP, maxPoang: 10 }]),
    ] }).s;
  };
  lax('Biologi 4.1 Begrepp', '2026-08-21', 'Biologi41', sv([[A, true], [B, true]]), sv([[A, false], [B, true]]));
  ex('Biologi 4.2 Begrepp', '2026-08-21', 'Biologi42', 10, 4);
  lax('4.1-4.2 Begrepp', '2026-08-28', 'Biologi412', sv([[A, true], [B, true]]), sv([[A, false], [B, false]]));
  ex('Biologi 4.3 Begrepp', '2026-08-28', 'Biologi43', 9, 5);
  // 4 sep: Omar helt frånvarande (varken läxförhör eller exit)
  lax('4.1-4.3 Begrepp', '2026-09-04', 'Biologi4123', sv([[A, true], [B, true]]), null);
  ex('Biologi 4.4 Begrepp', '2026-09-04', 'Biologi44', 9, null);
  return s;
}
const f = { klassId: 'k', amneId: 'bi' };

describe('elevanalys', () => {
  it('Anna: läxförhören sitter, jämförelse mot klassen, råd att fortsätta', () => {
    const a = elevanalys(bygg(), 'a', f);
    expect(a.amneNamn).toBe('Biologi');
    const lax = a.kallor.find((k) => k.kalla === 'socrative-laxforhor')!;
    expect(lax).toMatchObject({ snittProcent: 100, krav: 90, andelKlarade: 100, antal: 3 });
    expect(a.narvaroProcent).toBe(100);
    expect(a.laget.map((r) => r.rubrik)).toContain('Läxförhören sitter');
    expect(a.laget.find((r) => r.rubrik === 'Läxförhören sitter')!.text).toContain('kumulativa');
    expect(a.fastnat).toEqual([]);
    expect(a.rad.map((r) => r.rubrik)).toContain('Fånga upp lektionens slut'); // exit strax under läxförhören
    expect(a.sammanfattning).toContain('Anna Berg ligger på');
  });

  it('Omar: svaga läxförhör, frånvaro och begrepp som fastnat ger konkreta råd', () => {
    const o = elevanalys(bygg(), 'b', f);
    expect(o.narvaroProcent).toBe(67);
    expect(o.franvaroDatum).toEqual(['2026-09-04']);
    expect(o.laget.map((r) => r.rubrik)).toEqual(expect.arrayContaining(['Läxförhören behöver mer tid', 'Frånvaron påverkar']));
    expect(o.fastnat.map((b) => b.fraga)).toEqual([A]);
    const rubriker = o.rad.map((r) => r.rubrik);
    expect(rubriker[0]).toContain('Börja med 1 begrepp');
    expect(rubriker).toEqual(expect.arrayContaining(['Plugga begreppen i flera omgångar', 'Ta igen de missade lektionerna']));
    expect(o.rad.find((r) => r.rubrik === 'Ta igen de missade lektionerna')!.text).toContain('2026-09-04');
  });

  it('elev utan resultat ger tom men läsbar analys; okänd elev kastar', () => {
    let s = bygg();
    s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
    const p = elevanalys(s, 'c', f);
    expect(p.kallor).toEqual([]);
    expect(p.sammanfattning).toBe('Pia Provlund har inga resultat i urvalet.');
    expect(p.rad).toHaveLength(1);
    expect(() => elevanalys(s, 'finns-ej', f)).toThrow('Okänd elev');
  });
});

describe('rapportOversikt', () => {
  it('ger nyckeltal per elev utan att köra hela analysen', async () => {
    const { rapportOversikt } = await import('../src/domain/elevanalys.js');
    const r = rapportOversikt(bygg(), f);
    const anna = r.find((x) => x.elev.id === 'a')!;
    expect(anna).toMatchObject({ laxforhorProcent: 100, narvaroProcent: 100, antalFastnat: 0, oro: 0 });
    const omar = r.find((x) => x.elev.id === 'b')!;
    expect(omar.laxforhorProcent).toBeLessThan(90);
    expect(omar.antalFastnat).toBe(1);
    expect(omar.oro).toBeGreaterThanOrEqual(3); // låga läxförhör + låga exit + frånvaro + fastnat
  });

  it('elev utan resultat får noll prov och ingen oro; sökningen filtrerar', async () => {
    const { rapportOversikt } = await import('../src/domain/elevanalys.js');
    let s = bygg();
    s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
    const pia = rapportOversikt(s, f).find((x) => x.elev.id === 'c')!;
    expect(pia).toMatchObject({ antalProv: 0, oro: 0, laxforhorProcent: null });
    expect(rapportOversikt(s, f, 'omar').map((x) => x.elev.namn)).toEqual(['Omar Ali']);
  });
});

describe('Del 88: frågematris, övningsrum och filmer i analysen', () => {
  it('matrisen följer med och råden pekar på Socrative-rummet', () => {
    const o = elevanalys(bygg(), 'b', f);
    expect(o.matris.rader.length).toBeGreaterThan(0);
    expect(o.matris.rader[0].elevCeller).not.toBeUndefined();
  });

  it('socrativeElevLank bygger en klickbar länk och rumUrLektion plockar rummet', async () => {
    const { socrativeElevLank, rumUrLektion } = await import('../src/domain/elevrapport.js');
    expect(socrativeElevLank('Biologi41')).toBe('https://b.socrative.com/student/#joinRoom/BIOLOGI41');
    expect(rumUrLektion(['Biologi41 (krav ≥ 70 %)'])).toBe('Biologi41');
    expect(rumUrLektion(['—', 'Biologi412 (krav ≥ 90 %)'])).toBe('Biologi412');
    expect(rumUrLektion(['—'])).toBeNull();
  });
});
