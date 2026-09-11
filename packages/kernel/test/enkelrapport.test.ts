import { describe, expect, it } from 'vitest';
import { enkelRapport } from '../src/domain/enkelrapport.js';
import { importeraResultat, type FragaSvar } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const A = 'Vetenskapen om hur organismer samspelar med varandra och sin omgivning.';
const B = 'Alla individer av en art inom ett ekosystem.';
const C = 'Näringens väg från växt till växtätare till rovdjur och så vidare.';
const sv = (par: Array<[string, boolean]>): FragaSvar[] => par.map(([fraga, ratt]) => ({ fraga, svar: ratt ? 'r' : 'f', ratt }));

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  const imp = (kalla: 'socrative-laxforhor' | 'socrative-exit', prov: string, datum: string, rum: string, svar: FragaSvar[]) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rum, rader: [{ namn: 'Anna Berg', poang: svar.filter((x) => x.ratt).length, maxPoang: svar.length, svar }] }).s;
  };
  // Exit 4.1 (A fel, B rätt) → läxförhör 4.1 (A rätt, B fel) → exit 4.2 (C fel) → läxförhör 4.1-4.2 (allt rätt)
  imp('socrative-exit', 'Exit 4.1', '2026-08-20', 'Biologi41', sv([[A, false], [B, true]]));
  imp('socrative-laxforhor', 'Läxförhör 4.1', '2026-08-24', 'Biologi41', sv([[A, true], [B, false]]));
  imp('socrative-exit', 'Exit 4.2', '2026-08-24', 'Biologi42', sv([[C, false]]));
  imp('socrative-laxforhor', 'Läxförhör 4.1-4.2', '2026-08-31', 'Biologi412', sv([[A, true], [B, true], [C, true]]));
  return s;
}
const f = { klassId: 'k', amneId: 'bi' };

describe('enkelRapport', () => {
  it('uppåtgående trend ger positiv rubrik; läxförhör till läxförhör med delta', () => {
    const r = enkelRapport(bygg(), 'a', f);
    expect(r.trend).toBe('upp');
    expect(r.ton).toBe('bra');
    expect(r.rubrik).toBe('Det går uppåt för Anna Berg');
    expect(r.laxforhor.map((x) => `${x.procent}:${x.delta}`)).toEqual(['50:null', '100:50']);
    expect(r.laxforhor[1].godkant).toBe(true);
    expect(r.text[0]).toContain('från 50 % (2026-08-24) till 100 % (2026-08-31)');
  });

  it('exit ticket → nästa läxförhör per delkapitel', () => {
    const r = enkelRapport(bygg(), 'a', f);
    expect(r.exitTillLax.map((x) => `${x.kod}:${x.exitProcent}→${x.laxProcent}`)).toEqual(['4.1:50→50', '4.2:0→100']);
    expect(r.exitTillLax[1]).toMatchObject({ exitProv: 'Exit 4.2', laxProv: 'Läxförhör 4.1-4.2', delta: 100 });
    expect(r.text.some((t) => t.includes('förbättrades 1 av 2 delkapitel'))).toBe(true);
  });

  it('begrepp: allt rätt nu, tre vända (A och B och C var fel någon gång)', () => {
    const r = enkelRapport(bygg(), 'a', f);
    expect(r.kvar).toEqual([]);
    expect(r.vant.map((x) => x.fraga).sort()).toEqual([A, B, C].sort());
    expect(r.nuProcent).toBe(100);
    expect(r.text).toContain('Inga begrepp är kvar att lära just nu.');
    expect(r.text.some((t) => t.includes('3 begrepp som tidigare var fel sitter nu'))).toBe(true);
  });

  it('nedåtgående trend under godkänt ger oro', () => {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: 'Läxförhör 4.1-4.3', datum: '2026-09-07', rum: 'Biologi4123',
      rader: [{ namn: 'Anna Berg', poang: 1, maxPoang: 3, svar: sv([[A, false], [B, false], [C, true]]) }] }).s;
    const r = enkelRapport(s, 'a', f);
    expect(r.laxforhor.map((x) => x.procent)).toEqual([50, 100, 33]);
    expect(['ned', 'jamn']).toContain(r.trend);
    expect(r.kvar.map((x) => x.fraga).sort()).toEqual([A, B].sort());
    expect(r.text.some((t) => t.includes('2 begrepp är kvar att lära'))).toBe(true);
  });

  it('elev utan läxförhör', () => {
    let s = bygg();
    s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
    const r = enkelRapport(s, 'b', f);
    expect(r.rubrik).toBe('Omar Ali har inga läxförhör i perioden');
    expect(r.laxforhor).toEqual([]);
  });
});
