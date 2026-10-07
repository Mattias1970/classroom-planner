import { describe, expect, it } from 'vitest';
import {
  importeraInlamningar, inlamningsOversikt, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare,
  sattInlamningUnderkand, teamsStatusTillStatus, tolkaTeamsTilldelningar, tomStruktur, uppgiftsDelkapitel, uppgiftsTyp, type Struktur,
} from '../src/index.js';

function bygg(): Struktur {
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A', epost: 'anna.berg@elevmail.exempel.se' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  s = laggTillElev(s, { id: 'e3', klassId: 'k', namn: 'Pia Provlund', grupp: 'A', aktiv: false });
  return s;
}

const BLAD: unknown[][] = [
  [null, null, null, '8B - Tilldelningsdata'],
  [null, null, null, 'Fullständigt namn', 'Förnamn', 'Efternamn', 'E-postadress', 'Tilldelningar', 'Förfallodatum', 'Märke', 'Status', 'Feedback', 'Poäng', 'Maxpoäng'],
  [null, null, null, 'Anna Berg', 'Anna', 'Berg', 'anna.berg@elevmail.exempel.se', 'Biologi 6.5 Begrepp', new Date('2026-10-09T00:00:00Z'), null, 'Inlämnat', null, null, null],
  [null, null, null, 'Omar Ali', 'Omar', 'Ali', 'omar.ali@elevmail.exempel.se', 'Biologi 6.5 Begrepp', new Date('2026-10-09T00:00:00Z'), null, 'Visade', null, null, null],
  [null, null, null, 'Pia Provlund', 'Pia', 'Provlund', '', 'Biologi 6.5 Begrepp', '2026-10-09 00:00:00', null, 'Inlämnad sent', null, null, null],
  [null, null, null, 'Anna Berg', 'Anna', 'Berg', 'anna.berg@elevmail.exempel.se', 'Biologi 4.3 Begrepp', '2026-09-04 00:00:00', null, 'Inte inlämnat', null, null, null],
  [null, null, null, 'Anna Berg', 'Anna', 'Berg', 'anna.berg@elevmail.exempel.se', 'Biologi 4.3 Begrepp ', '2026-09-09 00:00:00', null, 'Inlämnad sent', 'Bra!', null, null],
  [null, null, null, 'Omar Ali', 'Omar', 'Ali', '', 'Biologi 4.3 Begrepp', '2026-09-04 00:00:00', null, 'Returnerad', null, null, null],
  [null, null, null, 'Omar Ali', 'Omar', 'Ali', '', 'Biologi 4.3 Begrepp ', '2026-09-09 00:00:00', null, 'Inte inlämnat', null, null, null],
  [null, null, null, 'Omar Ali', 'Omar', 'Ali', '', 'Biologi Laboration - Enzym i saliv', '2026-10-02 00:00:00', null, 'Inlämnat', null, null, null],
  [null, null, null, 'Anna Berg', 'Anna', 'Berg', '', 'Spela in din deckare', '2026-09-01 00:00:00', null, 'Inlämnat', null, null, null],
  [null, null, null, 'Kalle Testsson', 'Kalle', 'Testsson', '', 'Biologi 6.5 Begrepp', '2026-10-09 00:00:00', null, 'Inlämnat', null, null, null],
  [null, null, null, 'Anna Berg', 'Anna', 'Berg', '', 'Biologi 4.4 Testa dig själv', '2026-09-04 00:00:00', null, 'Inte inlämnat', null, null, null],
  [null, null, null, 'Anna Berg', 'Anna', 'Berg', '', 'Biologi 4.4 Biologi: Testa dig själv 1 - 7', '2026-09-11 00:00:00', null, 'Inlämnat', null, null, null],
  [null, null, null, 'Omar Ali', 'Omar', 'Ali', '', 'Biologi 4.4 Testa dig själv', '2026-09-04 00:00:00', null, 'Inte inlämnat', null, null, null],
];

describe('Del 163 · inlämningar ur Teams', () => {
  it('tolkar bladet, slår ihop samma uppgift, matchar elever och räknar per uppgift och elev', () => {
    const rader = tolkaTeamsTilldelningar(BLAD);
    expect(rader).toHaveLength(13);
    expect(rader[0]).toMatchObject({ namn: 'Anna Berg', epost: 'anna.berg@elevmail.exempel.se', uppgift: 'Biologi 6.5 Begrepp', forfallo: '2026-10-09', status: 'Inlämnat' });
    expect(['Inlämnat', 'Inlämnad sent', 'Returnerad', 'Visade', 'Inte inlämnat', 'Inlämnad igen'].map(teamsStatusTillStatus)).toEqual(['inlamnad', 'sen', 'inlamnad', 'ej', 'ej', 'inlamnad']);
    expect(uppgiftsTyp('Biologi 6.5 Testa dig själv 1 - 6')).toBe('testa');
    expect(uppgiftsTyp('Biologi Laboration - Enzym')).toBe('laboration');
    expect(uppgiftsDelkapitel('Biologi 4.4 Hjärta och blodomlopp 1 - 9')).toBe('4.4');

    const r = importeraInlamningar(bygg(), 'k', rader);
    expect(r.omatchade).toEqual(['Kalle Testsson']);
    expect(r.sammanslagna).toEqual(['Biologi 4.3 Begrepp', 'Biologi 4.4 Testa dig själv']);
    // Tre olika tilldelningsnamn för 4.4 Testa dig själv blir en uppgift
    expect(r.s.inlamningar!.find((x) => x.elevId === 'e1' && x.uppgift === 'Biologi 4.4 Testa dig själv')).toMatchObject({ status: 'inlamnad', teamsNamn: ['Biologi 4.4 Testa dig själv', 'Biologi 4.4 Biologi: Testa dig själv 1 - 7'], forfallo: '2026-09-11' });
    expect(r.s.inlamningar!.find((x) => x.elevId === 'e1' && x.uppgift === 'Biologi 4.3 Begrepp')?.teamsNamn).toEqual(['Biologi 4.3 Begrepp']);
    expect(r.uppgifter).toBe(5);
    // 4.3 Begrepp utdelad två gånger: Anna sen (bästa av ej+sen), Omar inlämnad (returnerad)
    const anna43 = r.s.inlamningar!.find((x) => x.elevId === 'e1' && x.uppgift === 'Biologi 4.3 Begrepp')!;
    expect(anna43).toMatchObject({ status: 'sen', amneId: 'bi', delkapitel: '4.3', typ: 'begrepp', feedback: 'Bra!', forfallo: '2026-09-09' });
    expect(r.s.inlamningar!.find((x) => x.elevId === 'e2' && x.uppgift === 'Biologi 4.3 Begrepp')?.status).toBe('inlamnad');
    expect(r.s.inlamningar!.find((x) => x.uppgift === 'Spela in din deckare')?.amneId).toBeUndefined();

    const o = inlamningsOversikt(r.s, 'k', 'bi', '2026-10-07');
    // Förfallna (t.o.m. idag) räknas i procenten; 6.5 Begrepp förfaller 9/10 → kommande
    expect(o.forfallna.map((u) => u.uppgift)).toEqual(['Biologi 4.3 Begrepp', 'Biologi 4.4 Testa dig själv', 'Biologi Laboration - Enzym i saliv']);
    expect(o.kommande.map((u) => [u.uppgift, u.forfallen])).toEqual([['Biologi 6.5 Begrepp', false]]);
    // Pia är av → räknas inte; 2 elever i klassen
    expect(o.uppgifter.map((u) => [u.uppgift, u.inlamnade, u.sena, u.ej, u.procent])).toEqual([
      ['Biologi 4.3 Begrepp', 1, 1, 0, 100], ['Biologi 4.4 Testa dig själv', 1, 0, 1, 50], ['Biologi Laboration - Enzym i saliv', 1, 0, 1, 50], ['Biologi 6.5 Begrepp', 1, 0, 1, 50],
    ]);
    expect(o.uppgifter[3].saknas).toEqual([{ elevId: 'e2', namn: 'Omar Ali' }]);   // Visade = ej inlämnad
    expect(o.elever.map((e) => [e.namn, e.antal, e.inlamnade, e.sena, e.procent, e.kommandeInlamnade])).toEqual([['Anna Berg', 3, 1, 1, 67, 1], ['Omar Ali', 3, 2, 0, 67, 0]]);
    expect(o.procent).toBe(67);
    expect(o.saknasTotalt).toBe(2);
    // Utan idag räknas alla uppgifter som förfallna
    expect(inlamningsOversikt(r.s, 'k', 'bi').kommande).toEqual([]);

    // Underkänd (t.ex. utan bild) räknas som ej inlämnad och överlever en ny import
    const s2 = sattInlamningUnderkand(r.s, anna43.id, true);
    expect(inlamningsOversikt(s2, 'k', 'bi', '2026-10-07').uppgifter[0]).toMatchObject({ sena: 0, ej: 1, underkanda: 1 });
    const r2 = importeraInlamningar(s2, 'k', rader);
    expect(r2.s.inlamningar!.find((x) => x.elevId === 'e1' && x.uppgift === 'Biologi 4.3 Begrepp')?.underkand).toBe(true);
    expect(r2.s.inlamningar).toHaveLength(r.s.inlamningar!.length);
  });
});
