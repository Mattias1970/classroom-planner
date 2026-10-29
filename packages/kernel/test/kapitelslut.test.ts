import { describe, expect, it } from 'vitest';
import {
  amnesPlanFor, aterstallKapitel, avslutaKapitelEfter, bokFromImport, borttagnaDelkapitel, kapitelAterstallningFor, kapitelSlutFor, tillampaUtkast, utkastFranPlan, laggTillAmne, laggTillKlass, laggTillSkolar,
  laggTillTjanst, registreraPlanering, resetIdRaknare, sattAntalLektioner, sattLektionsVal, sparaBok, tomStruktur, type Struktur,
} from '../src/index.js';

const lek = (kap: number, n: number, rubriker: string[]) => rubriker.map((r, i) => ({ id: i + 1, type: 'regular', avsnitt: r, del: 1, n })).map(({ n: _n, ...x }) => x);
function bygg(): Struktur {
  const BIO = bokFromImport(JSON.stringify({
    schema: 'classroom-planner-bok', version: 1,
    bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '6': { name: 'Vår fantastiska kropp', col: '#2f8f5a' }, '7': { name: 'Nervsystemet', col: '#8a2f5a' } } },
    lektioner: {
      '6': [...lek(6, 0, ['6.1 Celler', '6.2 Maten', '6.3 Andningen', '6.4 Hjärta', '6.5 Försvar', '6.6 Skelettet', '6.7 Musklerna', '6.8 Huden']), { id: 9, type: 'test', avsnitt: 'Finalen kapitel 6', del: 1 }],
      '7': lek(7, 0, ['7.1 Nervsystemet', '7.2 Hjärnbarken', '7.3 Lukt', '7.4 Synen', '7.5 Örat', '7.6 Hormoner']),
    },
  }));
  resetIdRaknare();
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BIO);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: 'bio', skapad: '2026-08-10' });
}
const rubriker = (s: Struktur, idag?: string) => (amnesPlanFor(s, 'bi', idag, false)?.a ?? []).map((r) => r.lektion.avsnitt.split(' ')[0]);
const datumFor = (s: Struktur, kod: string, idag?: string) => (amnesPlanFor(s, 'bi', idag, false)?.a ?? []).find((r) => r.lektion.avsnitt.startsWith(kod))?.datum;

describe('Del 197 · avsluta ett kapitel efter ett delkapitel', () => {
  it('kapitel 6 slutar efter 6.5 och kapitel 7 efter 7.5 — framåt i tiden', () => {
    let s = bygg();
    const idag = '2026-08-17';   // inget har varit
    expect(kapitelSlutFor(s, 'bi', '6.5', idag)).toEqual({ kapitel: 6, efter: '6.5', bort: ['6.6', '6.7', '6.8'], lektioner: 3, genomforda: 0 });
    s = avslutaKapitelEfter(s, 'bi', '6.5', idag).s;
    s = avslutaKapitelEfter(s, 'bi', '7.5', idag).s;
    expect(rubriker(s, idag)).toEqual(['6.1', '6.2', '6.3', '6.4', '6.5', 'Finalen', '7.1', '7.2', '7.3', '7.4', '7.5']);
    expect(borttagnaDelkapitel(s, 'bi', 6)).toEqual(['6.6', '6.7', '6.8']);
    expect(borttagnaDelkapitel(s, 'bi', 7)).toEqual(['7.6']);
    // Kapitel 7 börjar tre måndagar tidigare (efter 6.5 och Finalen)
    expect(datumFor(s, '7.1', idag)).toBe('2026-09-28');
    // Återställ kapitel 6
    s = aterstallKapitel(s, 'bi', 6, idag);
    expect(borttagnaDelkapitel(s, 'bi', 6)).toEqual([]);
    expect(rubriker(s, idag).slice(0, 9)).toEqual(['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8', 'Finalen']);
    expect(borttagnaDelkapitel(s, 'bi', 7)).toEqual(['7.6']);
  });

  it('extra lektioner på ett borttaget delkapitel försvinner också', () => {
    let s = sattAntalLektioner(bygg(), 'bi', '6:6.6', 2, '2026-08-17');
    expect(rubriker(s, '2026-08-17').filter((x) => x === '6.6')).toHaveLength(2);
    expect(kapitelSlutFor(s, 'bi', '6.5', '2026-08-17').lektioner).toBe(4);
    s = avslutaKapitelEfter(s, 'bi', '6.5', '2026-08-17').s;
    expect(rubriker(s, '2026-08-17')).not.toContain('6.6');
  });

  it('genomförda lektioner tas bara bort när läraren uttryckligen tillåter det', () => {
    let s = bygg();
    // Måndagar 17/8 … : 6.6 = 21/9, 6.7 = 28/9, 6.8 = 5/10. Idag 13/10 → alla tre har varit.
    const idag = '2026-10-13';
    expect(datumFor(s, '6.6', idag)).toBe('2026-09-21');
    expect(kapitelSlutFor(s, 'bi', '6.5', idag)).toMatchObject({ lektioner: 3, genomforda: 3 });
    expect(() => avslutaKapitelEfter(s, 'bi', '6.5', idag)).toThrow(/har varit/);
    // En enskild genomförd lektion: spärrad som förut, tillåten med flaggan
    const nyckel66 = (amnesPlanFor(s, 'bi', idag, false)?.a ?? []).find((r) => r.lektion.avsnitt.startsWith('6.6'))!.nyckel!;
    expect(() => sattLektionsVal(s, 'bi', nyckel66, { bort: true }, idag)).toThrow(/har varit/);
    expect(rubriker(sattLektionsVal(s, 'bi', nyckel66, { bort: true }, idag, true), idag)).not.toContain('6.6');
    // Hela kapitelslutet med flaggan: Finalen och kapitel 7 flyttas tre pass tidigare, även över genomförda pass
    s = avslutaKapitelEfter(s, 'bi', '6.5', idag, true).s;
    expect(datumFor(s, 'Finalen', idag)).toBe('2026-09-21');
    expect(datumFor(s, '7.1', idag)).toBe('2026-09-28');
    expect(() => avslutaKapitelEfter(s, 'bi', '6.8', idag)).toThrow(/inga delkapitel efter/);
    expect(() => kapitelSlutFor(s, 'bi', '6', idag)).toThrow(/6\.5/);
  });
});

describe('Del 197 · under ett utkast ligger fasta kort kvar, och återställning lägger in delkapitlen igen', () => {
  it('prov efter kapitlet behåller sitt datum när 6.6–6.8 tas bort; ↺ Återställ lägger tillbaka dem före provet', () => {
    let s = bygg();
    const idag = '2026-08-17';
    // Utkast från terminsstart: bokens följd men lärarens eget prov på måndag 2026-11-02 (efter 6.8 = 5/10, Finalen 12/10, 7.1 19/10, 7.2 26/10)
    const u = utkastFranPlan(s, 'bi', '2026-08-17', idag, 'Höst');
    const i = u.teori.indexOf('7:2');
    s = tillampaUtkast(s, 'bi', { ...u, teori: [...u.teori.slice(0, i + 1), 'u:prov6', ...u.teori.slice(i + 1)], egna: [{ id: 'prov6', rubrik: 'Prov kapitel 6', typ: 'prov' }] }, idag);
    const fore = amnesPlanFor(s, 'bi', idag, false)!.a;
    expect(fore.find((r) => r.nyckel === 'u:prov6')?.datum).toBe('2026-11-02');
    expect(datumFor(s, '7.1', idag)).toBe('2026-10-19');
    const r = avslutaKapitelEfter(s, 'bi', '6.5', idag);
    expect(r).toMatchObject({ borttagna: 3, genomforda: 0, fran: '2026-09-21', fasta: 1 });
    const efter = amnesPlanFor(r.s, 'bi', idag, false)!.a;
    expect(efter.map((x) => x.nyckel).slice(4, 13)).toEqual(['6:5', '6:9', '7:1', '7:2', '7:3', '7:4', '7:5', 'u:prov6', '7:6']);
    expect(efter.find((x) => x.nyckel === 'u:prov6')?.datum).toBe('2026-11-02');   // provet ligger kvar
    expect(datumFor(r.s, '7.1', idag)).toBe('2026-09-28');                           // tre pass tidigare
    expect(borttagnaDelkapitel(r.s, 'bi', 6)).toEqual(['6.6', '6.7', '6.8']);
    // Återställ: 6.6–6.8 läggs in efter Finalen (kapitlets sista kvarvarande rad), kapitel 7 flyttas senare, provet ligger kvar
    const info = kapitelAterstallningFor(r.s, 'bi', 6, idag);
    expect(info).toMatchObject({ koder: ['6.6', '6.7', '6.8'], lektioner: 3, fran: '2026-09-21', genomford: false });
    const s3 = aterstallKapitel(r.s, 'bi', 6, idag);
    const sen = amnesPlanFor(s3, 'bi', idag, false)!.a;
    expect(sen.map((x) => x.nyckel).slice(4, 13)).toEqual(['6:5', '6:6', '6:7', '6:8', '6:9', '7:1', '7:2', 'u:prov6', '7:3']);
    expect(sen.find((x) => x.nyckel === 'u:prov6')?.datum).toBe('2026-11-02');
    expect(borttagnaDelkapitel(s3, 'bi', 6)).toEqual([]);
    expect(aterstallKapitel(s3, 'bi', 6, idag)).toBe(s3);   // inget att återställa
  });

  it('halvklassämne (grupp A/B): 6.6–6.8 bort i båda grupperna; en ersatt lektion förblir ersatt efter återställning', () => {
    const BIO = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'bio', titel: 'Spektrum Biologi', förlag: 'Liber', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '6': { name: 'Kroppen', col: '#2f8f5a' }, '7': { name: 'Nervsystemet', col: '#8a2f5a' } } },
      lektioner: {
        '6': lek(6, 0, ['6.1 Celler', '6.2 Maten', '6.3 Andningen', '6.4 Hjärta', '6.5 Försvar', '6.6 Skelettet', '6.7 Musklerna', '6.8 Huden']),
        '7': lek(7, 0, ['7.1 Nervsystemet', '7.2 Hjärnbarken']),
      },
    }));
    resetIdRaknare();
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BIO);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: 'bio', halvklass: true,
      schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 4, start: '09:45', slut: '10:55' }],
      schemaB: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 4, start: '11:00', slut: '12:10' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: 'bio', skapad: '2026-08-10' });
    const idag = '2026-08-17';
    const n67 = (amnesPlanFor(s, 'bi', idag, false)?.a ?? []).find((r) => r.lektion.avsnitt.startsWith('6.7'))!.nyckel!;
    s = sattLektionsVal(s, 'bi', n67, { ersatt: { rubrik: 'Repetition', typ: 'annat' } }, idag);
    const info = kapitelSlutFor(s, 'bi', '6.5', idag);
    expect(info.bort).toEqual(['6.6', '6.7', '6.8']);
    const r = avslutaKapitelEfter(s, 'bi', '6.5', idag);
    const p = amnesPlanFor(r.s, 'bi', idag, false)!;
    for (const lista of [p.a, p.b]) {
      const avsnitt = lista.map((x) => x.lektion.avsnitt.split(' ')[0]);
      expect(avsnitt).not.toContain('6.6'); expect(avsnitt).not.toContain('6.8'); expect(avsnitt).not.toContain('Repetition');
      expect(avsnitt).toContain('7.1');
    }
    // ersatt-valet ligger kvar under bort-märkningen och gäller igen efter återställning
    expect(r.s.amnen[0].lektionsVal?.[n67]).toEqual({ ersatt: { rubrik: 'Repetition', typ: 'annat' }, bort: true });
    const s3 = aterstallKapitel(r.s, 'bi', 6, idag);
    expect(s3.amnen[0].lektionsVal?.[n67]).toEqual({ ersatt: { rubrik: 'Repetition', typ: 'annat' } });
    expect(amnesPlanFor(s3, 'bi', idag, false)!.a.map((x) => x.lektion.avsnitt.split(' ')[0]).filter((x) => x !== 'Laboration').slice(4, 9)).toEqual(['6.5', '6.6', 'Repetition', '6.8', '7.1']);
  });

  it('genomförda lektioner under ett utkast: tillåtet med flaggan, passen skrivs om från första borttagna', () => {
    let s = bygg();
    s = tillampaUtkast(s, 'bi', utkastFranPlan(s, 'bi', '2026-08-17', '2026-08-17', 'Höst'), '2026-08-17');
    const idag = '2026-10-13';   // 6.6 (21/9), 6.7 (28/9), 6.8 (5/10) och Finalen (12/10) har varit
    expect(() => avslutaKapitelEfter(s, 'bi', '6.5', idag)).toThrow(/har varit/);
    const r = avslutaKapitelEfter(s, 'bi', '6.5', idag, true);
    expect(r).toMatchObject({ borttagna: 3, genomforda: 3, fran: '2026-09-21' });
    expect(datumFor(r.s, 'Finalen', idag)).toBe('2026-09-21');
    expect(datumFor(r.s, '7.1', idag)).toBe('2026-09-28');
    expect(rubriker(r.s, idag)).not.toContain('6.6');
    // Återställning: insättningspunkten (efter Finalen 21/9) har varit → kräver flaggan
    expect(kapitelAterstallningFor(r.s, 'bi', 6, idag)).toMatchObject({ fran: '2026-09-21', genomford: true });
    expect(() => aterstallKapitel(r.s, 'bi', 6, idag)).toThrow(/har varit/);
    expect(rubriker(aterstallKapitel(r.s, 'bi', 6, idag, true), idag).slice(4, 10)).toEqual(['6.5', '6.6', '6.7', '6.8', 'Finalen', '7.1']);
  });

  it('återställning när inget följer efter kapitlet: delkapitlen läggs sist, inte före det som finns', () => {
    const BOK = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
      lektioner: { '1': lek(1, 0, ['1.1 Tal', '1.2 Potenser', '1.3 Bråk']) },
    }));
    resetIdRaknare();
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 3, start: '09:00', slut: '10:00' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
    const idag = '2026-08-10';
    const rub = (x: Struktur) => (amnesPlanFor(x, 'ma', idag, false)?.a ?? []).map((r) => `${r.datum} ${r.lektion.avsnitt.split(' ')[0]}`);
    const r = avslutaKapitelEfter(s, 'ma', '1.1', idag);
    expect(rub(r.s)).toEqual(['2026-08-19 1.1']);
    expect(kapitelAterstallningFor(r.s, 'ma', 1, idag)).toMatchObject({ fran: '2026-08-19', sistaDatum: '2026-08-19', genomford: false });
    expect(rub(aterstallKapitel(r.s, 'ma', 1, idag))).toEqual(['2026-08-19 1.1', '2026-08-26 1.2', '2026-09-02 1.3']);
  });
});
