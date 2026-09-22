/**
 * Del 139: lektionsregler per bok — standardtext beror på om boken har nivåer;
 * lärarens regler sparas som overlay och kan återställas.
 */
import { describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import { aterstallLektionsregler, harEgnaLektionsregler, lektionsreglerFor, sattLektionsregler, standardLektionsregler } from '../src/domain/lektionsregler.js';
import { sparaBok } from '../src/domain/struktur.js';
import { tomStruktur } from '../src/domain/typer.js';

const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Prio 8', förlag: 'Sanoma', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8', två: '9–16', tre: '—' },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '—', två: '17–24', tre: '25–32' },
  ] },
}));
const BIO = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } },
  lektioner: { '4': [{ id: 1, type: 'regular', avsnitt: '4.1 Ekosystem', del: 1, begrepp: 'ekosystem' }] },
}));

describe('Del 139: lektionsregler', () => {
  it('Prio har nivåregler utan "del 1/del 2"; Spektrum har läs + Testa dig själv och inga nivåer', () => {
    const ma = standardLektionsregler(MA);
    expect(ma.map((r) => r.rubrik)).toEqual(['Lektionsstruktur (BAM)', 'Uppgiftsnivåer', 'Inlämning', 'Läxor']);
    expect(ma[1].text).toContain('ETT = introduktion');
    expect(ma[1].text).toContain('Första lektionen på ett delkapitel');
    expect(ma.map((r) => r.text).join(' ')).not.toMatch(/del [12]/i);
    const bio = standardLektionsregler(BIO);
    expect(bio.map((r) => r.rubrik)).toEqual(['Lektionsstruktur (BAM)', 'Arbete', 'Inlämning', 'Läxor']);
    expect(bio[1].text).toContain('Testa dig själv');
    expect(bio.map((r) => r.text).join(' ')).not.toMatch(/ETT|TVÅ|TRE|Grön|Blå|Röd/);
  });

  it('lärarens regler sparas per bok som overlay, boken rörs inte, och kan återställas', () => {
    let s = sparaBok(sparaBok(tomStruktur(), MA), BIO);
    expect(harEgnaLektionsregler(s, 'ma')).toBe(false);
    s = sattLektionsregler(s, 'ma', [{ rubrik: ' Läxor ', text: 'Läxa varje vecka. ' }, { rubrik: '', text: '  ' }]);
    expect(lektionsreglerFor(s, MA)).toEqual([{ rubrik: 'Läxor', text: 'Läxa varje vecka.' }]);
    expect(harEgnaLektionsregler(s, 'ma')).toBe(true);
    expect(lektionsreglerFor(s, BIO)).toEqual(standardLektionsregler(BIO));   // andra boken opåverkad
    expect(s.bocker.find((b) => b.id === 'ma')).toEqual(MA);                   // bokdata skrivs aldrig
    // en ny hämtning av boken från datarepot behåller reglerna
    s = sparaBok(s, { ...MA, titel: 'Prio 8 (ny upplaga)' });
    expect(lektionsreglerFor(s, s.bocker[0])[0].text).toBe('Läxa varje vecka.');
    s = aterstallLektionsregler(s, 'ma');
    expect(harEgnaLektionsregler(s, 'ma')).toBe(false);
    expect(lektionsreglerFor(s, MA)).toEqual(standardLektionsregler(MA));
    expect(() => sattLektionsregler(s, 'finns-ej', [])).toThrow(/Okänd bok/);
  });
});
