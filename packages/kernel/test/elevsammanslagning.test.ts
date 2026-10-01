import { describe, expect, it } from 'vitest';
import { importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, slaIhopElever, tomStruktur, type Struktur } from '../src/index.js';

function bygg(): Struktur {
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Kalle Testsson', grupp: 'A', socrativeId: 'kt1', vardnadshavare: [{ epost: 'lena@exempel.se' }] });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Kalle Testsson Provlund', grupp: 'B' });
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  const imp = (namn: string, prov: string, datum: string, poang: number) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'socrative-laxforhor', prov, datum, rader: [{ namn, poang, maxPoang: 10 }] }).s;
  };
  imp('Kalle Testsson', 'Matte11', '2026-09-01', 9);
  imp('Kalle Testsson', 'Matte12', '2026-09-08', 8);
  imp('Kalle Testsson Provlund', 'Matte12', '2026-09-08', 8);
  imp('Kalle Testsson Provlund', 'Matte13', '2026-09-15', 10);
  return s;
}

describe('Del 160 · slå ihop två elever', () => {
  it('alla prov hamnar hos eleven som behålls; det andra namnet blir tidigare namn', () => {
    const fore = bygg();
    const id = (n: string) => fore.elever.find((e) => e.namn === n)!.id;
    const { s, flyttade, dubbletter } = slaIhopElever(fore, id('Kalle Testsson'), id('Kalle Testsson Provlund'));
    expect(flyttade).toBe(1);
    expect(dubbletter).toBe(1);
    expect(s.elever.map((e) => e.namn)).toEqual(['Kalle Testsson Provlund', 'Anna Berg']);
    const kvar = s.elever[0];
    expect(kvar).toMatchObject({ grupp: 'B', socrativeId: 'kt1', tidigareNamn: ['Kalle Testsson'], vardnadshavare: [{ epost: 'lena@exempel.se' }] });
    expect((s.resultat ?? []).filter((r) => r.elevId === kvar.id).map((r) => r.prov).sort()).toEqual(['Matte11', 'Matte12', 'Matte13']);
    expect((s.resultat ?? []).some((r) => r.elevId === id('Kalle Testsson'))).toBe(false);
    expect(() => slaIhopElever(s, kvar.id, kvar.id)).toThrow(/två olika/);
  });
});
