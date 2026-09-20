/**
 * Del 129: lektioner tas bort, ersätts och utökas i planeringen; lektioner per
 * delkapitel som ämnesinställning (loggad framåt); lektionsplaner följer sin lektion.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bokFromImport } from '../src/domain/bok.js';
import {
  amnesPlanFor, andraPlanering, antalIBoken, gruppNyckel, grundRader, hamtaLektionsplan, kopplaOmLektionsplaner,
  laggTillAmne, laggTillEgenRad, laggTillKlass, laggTillSkolar, laggTillTjanst, lektionerPerDelkapitel, noOverBudget,
  planeringsRader, registreraPlanering, resetIdRaknare, sattAntalLektioner, sattLektionerPerDelkapitel, sattLektionsplan,
  sattLektionsVal, skapaPlanering, sparaBok, taBortEgenRad,
} from '../src/domain/struktur.js';
import { planForAmne } from '../src/domain/studieguide.js';
import { kalenderHandelser } from '../src/domain/kalender.js';
import { tomStruktur, type Skolar, type Struktur } from '../src/domain/typer.js';

const LA: Skolar = { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] };

/** NO-bok: ett delkapitel = en lektion i boken, plus prov. */
const BIO = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'bio', titel: 'Biologi', förlag: 'Test', ämne: 'Biologi', årskurs: 8, kapitelMeta: { '4': { name: 'Ekologi', col: '#2f8f5a' } } },
  lektioner: { '4': [
    { id: 1, type: 'regular', avsnitt: '4.1 Ekosystem', del: 1, begrepp: 'ekosystem, biotop' },
    { id: 2, type: 'regular', avsnitt: '4.2 Näringskedjor', del: 1, begrepp: 'producent, konsument' },
    { id: 3, type: 'regular', avsnitt: '4.3 Kretslopp', del: 1, begrepp: 'kolets kretslopp' },
    { id: 4, type: 'exam', avsnitt: 'Prov kap 4', del: 1 },
  ] },
}));

/** Mattebok: delkapitlet har redan två lektioner i boken. */
const MA = bokFromImport(JSON.stringify({
  schema: 'classroom-planner-bok', version: 1,
  bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8' } } },
  lektioner: { '1': [
    { id: 1, type: 'regular', avsnitt: '1.1 Bråk', del: 1, ett: '1–8', två: '9–16', tre: '—' },
    { id: 2, type: 'regular', avsnitt: '1.1 Bråk', del: 2, ett: '—', två: '17–24', tre: '25–32' },
    { id: 3, type: 'regular', avsnitt: '1.2 Procent', del: 1, ett: '1–6', två: '7–12', tre: '13–15' },
    { id: 4, type: 'exam', avsnitt: '1 Prov', del: 1 },
  ] },
}));

const SCHEMA = [{ dag: 2, start: '10:00', slut: '11:00' }, { dag: 4, start: '10:00', slut: '11:00' }];

function bygg(bok = BIO, namn = 'Biologi'): Struktur {
  let s = tomStruktur();
  s = laggTillSkolar(s, LA); s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO 8' });
  s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'am', klassId: 'k8b', namn, bokId: bok.id, schema: SCHEMA });
  return registreraPlanering(s, { id: 'pl', amneId: 'am', bokId: bok.id, skapad: '2026-08-10' });
}
const amne = (s: Struktur) => s.amnen.find((a) => a.id === 'am')!;
const avsnitt = (s: Struktur) => amnesPlanFor(s, 'am')!.a.map((r) => `${r.lektion.avsnitt}·${r.lektion.del}`);

beforeEach(resetIdRaknare);

describe('Del 129: lektionsföljden — nycklar, extra lektioner, ersättningar, borttag', () => {
  it('utan ändringar är följden bokens; varje rad har en stabil nyckel', () => {
    const rader = planeringsRader(BIO, {});
    expect(rader.map((r) => r.nyckel)).toEqual(['4:1', '4:2', '4:3', '4:4']);
    expect(rader).toEqual(grundRader(BIO, {}));
    expect(gruppNyckel(rader[0])).toBe('4:4.1');
    expect(gruppNyckel(rader[3])).toBe('4:4');           // provet saknar delkapitelkod → egen grupp
    expect(lektionerPerDelkapitel({})).toBe(1);
  });

  it('lektioner per delkapitel = 2 ger varje delkapitel Del 1 och Del 2 — provet och egna rader utökas inte', () => {
    const rader = planeringsRader(BIO, { lektionerPerDelkapitel: [{ antal: 2 }], egnaRader: [{ id: 'x', position: 3, rubrik: 'Repetition', typ: 'ovning' }] });
    expect(rader.map((r) => `${r.lektion.avsnitt}·${r.lektion.del}`)).toEqual([
      '4.1 Ekosystem·1', '4.1 Ekosystem·2', '4.2 Näringskedjor·1', '4.2 Näringskedjor·2',
      '4.3 Kretslopp·1', '4.3 Kretslopp·2', 'Repetition·1', 'Prov kap 4·1']);
    expect(rader[1].nyckel).toBe('4:1#2');
    expect(rader[1].lektion.begrepp).toBe('ekosystem, biotop');   // innehållet följer med
    expect(rader[6].nyckel).toBe('er:x');
  });

  it('boken behåller sina lektioner när den redan har fler än inställningen; 3 lägger till Del 3', () => {
    expect(planeringsRader(MA, { lektionerPerDelkapitel: [{ antal: 1 }] }).map((r) => r.nyckel)).toEqual(['1:1', '1:2', '1:3', '1:4']);
    const tre = planeringsRader(MA, { lektionerPerDelkapitel: [{ antal: 3 }] });
    expect(tre.map((r) => `${r.lektion.avsnitt}·${r.lektion.del}`)).toEqual([
      '1.1 Bråk·1', '1.1 Bråk·2', '1.1 Bråk·3', '1.2 Procent·1', '1.2 Procent·2', '1.2 Procent·3', '1 Prov·1']);
    expect(tre[2].nyckel).toBe('1:2#3');                            // förlagan är delkapitlets sista lektion
    expect(tre[2].lektion.niva2).toBe('17–24');
    expect(antalIBoken(MA, {}, '1:1.1')).toBe(2);
    expect(antalIBoken(MA, {}, '1:1.2')).toBe(1);
  });

  it('ett enskilt delkapitel kan få eget antal — och tas ned till bokens igen', () => {
    const tva = planeringsRader(BIO, { antalLektioner: { '4:4.2': 2 } });
    expect(tva.map((r) => r.nyckel)).toEqual(['4:1', '4:2', '4:2#2', '4:3', '4:4']);
    // Inställning 2 på ämnet men 1 på 4.2: 4.2 får bara bokens
    const ner = planeringsRader(BIO, { lektionerPerDelkapitel: [{ antal: 2 }], antalLektioner: { '4:4.2': 1 } });
    expect(ner.map((r) => r.nyckel)).toEqual(['4:1', '4:1#2', '4:2', '4:3', '4:3#2', '4:4']);
  });

  it('loggen: en senare post gäller från sin lektion och framåt, tidigare delkapitel behåller sitt antal', () => {
    const rader = planeringsRader(BIO, { lektionerPerDelkapitel: [{ antal: 2 }, { fran: '4:3', antal: 3 }] });
    expect(rader.map((r) => r.nyckel)).toEqual(['4:1', '4:1#2', '4:2', '4:2#2', '4:3', '4:3#2', '4:3#3', '4:4']);
    // Sänkning framåt: 4.1–4.2 behåller två, 4.3 får bokens enda
    const ned = planeringsRader(BIO, { lektionerPerDelkapitel: [{ antal: 2 }, { fran: '4:3', antal: 1 }] });
    expect(ned.map((r) => r.nyckel)).toEqual(['4:1', '4:1#2', '4:2', '4:2#2', '4:3', '4:4']);
  });

  it('bort tar bort raden och flyttar fram resten; ersatt byter innehåll men behåller plats och nyckel', () => {
    const bort = planeringsRader(BIO, { lektionsVal: { '4:2': { bort: true } } });
    expect(bort.map((r) => r.nyckel)).toEqual(['4:1', '4:3', '4:4']);
    const egen = planeringsRader(BIO, { lektionsVal: { '4:2': { ersatt: { rubrik: 'Fältstudie', typ: 'annat', beskrivning: 'Vi går ut' } } } });
    expect(egen[1]).toMatchObject({ nyckel: '4:2', kapitel: 4, lektion: { avsnitt: 'Fältstudie', typ: 'regular', genomgang: 'Vi går ut' } });
    const bok = planeringsRader(BIO, { lektionsVal: { '4:3': { ersatt: { kapitel: 4, lektionId: 1 } } } });
    expect(bok[2]).toMatchObject({ nyckel: '4:3', lektion: { avsnitt: '4.1 Ekosystem', begrepp: 'ekosystem, biotop' } });
    // Extra lektioner kan också tas bort
    const extraBort = planeringsRader(BIO, { lektionerPerDelkapitel: [{ antal: 2 }], lektionsVal: { '4:1#2': { bort: true } } });
    expect(extraBort.map((r) => r.nyckel)).toEqual(['4:1', '4:2', '4:2#2', '4:3', '4:3#2', '4:4']);
    // Okänd bok-lektion som ersättning → raden lämnas orörd
    expect(planeringsRader(BIO, { lektionsVal: { '4:3': { ersatt: { kapitel: 9, lektionId: 9 } } } })[2].lektion.avsnitt).toBe('4.3 Kretslopp');
  });

  it('skapaPlanering tar ämnets fält (och fortfarande en lista egna rader); budgetvarningen räknar extra lektioner', () => {
    const medFalt = skapaPlanering(LA, SCHEMA, BIO, 0, { lektionerPerDelkapitel: [{ antal: 2 }] });
    expect(medFalt).toHaveLength(7);
    expect(medFalt[1].nyckel).toBe('4:1#2');
    expect(medFalt[1].datum).toBe('2026-08-20');                     // torsdagen efter tisdag 18/8
    const medLista = skapaPlanering(LA, SCHEMA, BIO, 0, [{ id: 'e', position: 0, rubrik: 'Start', typ: 'diagnos' }]);
    expect(medLista[0].nyckel).toBe('er:e');
    expect(noOverBudget(BIO, 5)).toBe(false);
    expect(noOverBudget(BIO, 5, { lektionerPerDelkapitel: [{ antal: 2 }] })).toBe(true);
  });
});

describe('Del 129: strukturoperationer — lektionsplanerna följer sina lektioner', () => {
  it('sattLektionsVal bort: planen på lektionen efter flyttar ett steg; planen på den borttagna faller', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp1', amneId: 'am', lektionsIndex: 1, genomgang: 'Näringskedjor-text' });
    s = sattLektionsplan(s, { id: 'lp2', amneId: 'am', lektionsIndex: 2, genomgang: 'Kretslopp-text', klar: true });
    s = sattLektionsVal(s, 'am', '4:2', { bort: true });
    expect(avsnitt(s)).toEqual(['4.1 Ekosystem·1', '4.3 Kretslopp·1', 'Prov kap 4·1']);
    expect(hamtaLektionsplan(s, 'am', 1)?.genomgang).toBe('Kretslopp-text');   // följde med 4.3 till index 1
    expect(hamtaLektionsplan(s, 'am', 1)?.klar).toBe(true);
    expect(s.lektionsplaner.filter((p) => p.amneId === 'am')).toHaveLength(1);   // lp1 föll med lektionen
    // Återställ: valet försvinner
    s = sattLektionsVal(s, 'am', '4:2', null);
    expect(amne(s).lektionsVal).toEqual({});
    expect(hamtaLektionsplan(s, 'am', 2)?.genomgang).toBe('Kretslopp-text');   // tillbaka till index 2
  });

  it('sattLektionsVal ersatt: samma plats, planen ligger kvar; ett tomt val tar bort posten', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: 1, filmer: ['Film|https://x'] });
    s = sattLektionsVal(s, 'am', '4:2', { ersatt: { rubrik: 'Studiebesök', typ: 'annat' } });
    expect(avsnitt(s)[1]).toBe('Studiebesök·1');
    expect(hamtaLektionsplan(s, 'am', 1)?.filmer).toEqual(['Film|https://x']);
    s = sattLektionsVal(s, 'am', '4:2', {});
    expect(amne(s).lektionsVal).toEqual({});
  });

  it('sattAntalLektioner och sattLektionerPerDelkapitel flyttar planerna efter de nya lektionerna', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: 3, anteckning: 'Provet' });
    s = sattAntalLektioner(s, 'am', '4:4.1', 2);
    expect(avsnitt(s)).toEqual(['4.1 Ekosystem·1', '4.1 Ekosystem·2', '4.2 Näringskedjor·1', '4.3 Kretslopp·1', 'Prov kap 4·1']);
    expect(hamtaLektionsplan(s, 'am', 4)?.anteckning).toBe('Provet');
    s = sattLektionerPerDelkapitel(s, 'am', 2);
    expect(avsnitt(s)).toHaveLength(7);
    expect(hamtaLektionsplan(s, 'am', 6)?.anteckning).toBe('Provet');
    expect(lektionerPerDelkapitel(amne(s))).toBe(2);
    expect(sattAntalLektioner(s, 'am', '4:4.1', 7).amnen[0].antalLektioner?.['4:4.1']).toBe(4);   // klamp 1–4
    s = sattAntalLektioner(s, 'am', '4:4.1', null);
    expect(amne(s).antalLektioner).toEqual({});
  });

  it('loggen växer med giltighet framåt; samma startpunkt ersätter; oförändrat ger samma struktur', () => {
    let s = bygg();
    s = sattLektionerPerDelkapitel(s, 'am', 2);
    expect(amne(s).lektionerPerDelkapitel).toEqual([{ antal: 2 }]);
    expect(sattLektionerPerDelkapitel(s, 'am', 2)).toBe(s);
    s = sattLektionerPerDelkapitel(s, 'am', 3, '4:3');
    s = sattLektionerPerDelkapitel(s, 'am', 4, '4:3');   // ångrar sig direkt — samma startpunkt
    expect(amne(s).lektionerPerDelkapitel).toEqual([{ antal: 2 }, { fran: '4:3', antal: 4 }]);
    expect(avsnitt(s).filter((x) => x.startsWith('4.1'))).toHaveLength(2);
    expect(avsnitt(s).filter((x) => x.startsWith('4.3'))).toHaveLength(4);
  });

  it('det som är genomfört ändras aldrig: borttag och nytt antal framåt lämnar datumen bakåt orörda', () => {
    let s = bygg();
    const idag = '2026-09-01';   // 18/8, 20/8, 25/8, 27/8 är genomförda (4 lektioner: hela boken) — gör boken längre först
    s = sattLektionerPerDelkapitel(s, 'am', 2);   // 7 lektioner: 18/8 … 8/9
    const fore = amnesPlanFor(s, 'am', idag)!.a;
    const genomforda = fore.filter((r) => r.datum !== null && r.datum < idag);
    expect(genomforda).toHaveLength(4);
    const forstaKommande = fore.find((r) => r.datum !== null && r.datum >= idag)!;
    expect(forstaKommande.nyckel).toBe('4:3');
    // Ta bort en kommande lektion och sätt tre lektioner per delkapitel från och med den första kommande
    s = sattLektionsVal(s, 'am', '4:3#2', { bort: true }, idag);
    s = sattLektionerPerDelkapitel(s, 'am', 3, forstaKommande.nyckel, idag);
    const efter = amnesPlanFor(s, 'am', idag)!.a;
    for (const [i, r] of genomforda.entries()) expect(efter[i]).toMatchObject({ nyckel: r.nyckel, datum: r.datum, lektion: r.lektion });
    expect(efter.map((r) => r.nyckel)).toEqual(['4:1', '4:1#2', '4:2', '4:2#2', '4:3', '4:3#3', '4:4']);
  });

  it('egna rader via laggTillEgenRad/taBortEgenRad flyttar planerna med sina lektioner', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: 0, genomgang: 'Ekosystem-text' });
    s = laggTillEgenRad(s, 'am', { id: 'd', position: 0, rubrik: 'Diagnos', typ: 'diagnos' });
    expect(avsnitt(s)[0]).toBe('Diagnos·1');
    expect(hamtaLektionsplan(s, 'am', 1)?.genomgang).toBe('Ekosystem-text');
    expect(hamtaLektionsplan(s, 'am', 0)).toBeNull();
    s = taBortEgenRad(s, 'am', 'd');
    expect(hamtaLektionsplan(s, 'am', 0)?.genomgang).toBe('Ekosystem-text');
    expect(() => laggTillEgenRad(s, 'saknas', { id: 'x', position: 0, rubrik: 'x', typ: 'prov' })).toThrow(/Okänt ämne/);
  });

  it('kopplaOmLektionsplaner: planer utan rad i förra planen faller; andra ämnens planer rörs inte', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp', amneId: 'am', lektionsIndex: 9, genomgang: 'utanför' });
    s = { ...s, lektionsplaner: [...s.lektionsplaner, { id: 'annan', amneId: 'annat-amne', lektionsIndex: 0 }] };
    const fore = amnesPlanFor(s, 'am')!.a;
    const ut = kopplaOmLektionsplaner(s, 'am', fore, fore);
    expect(ut.lektionsplaner.map((p) => p.id)).toEqual(['annan']);
    // andraPlanering fungerar även innan en planering registrerats
    const utanPlanering = { ...s, planeringar: [] };
    expect(andraPlanering(utanPlanering, 'am', { lektionsVal: { '4:1': { bort: true } } }).amnen[0].lektionsVal).toEqual({ '4:1': { bort: true } });
  });

  it('samma plan överallt: planForAmne, kalendern och amnesPlanFor visar ändringen', () => {
    let s = bygg();
    s = sattLektionsVal(s, 'am', '4:1', { ersatt: { rubrik: 'Uppstart', typ: 'annat' } });
    s = sattLektionerPerDelkapitel(s, 'am', 2);
    const plan = planForAmne(s, 'am');
    expect(plan.map((r) => r.nyckel)).toEqual(amnesPlanFor(s, 'am')!.a.map((r) => r.nyckel));
    const kal = kalenderHandelser(s, 'la').filter((h) => h.amneId === 'am').sort((x, y) => x.datum.localeCompare(y.datum));
    expect(kal.map((h) => h.avsnitt)).toEqual(plan.filter((r) => r.datum !== null).map((r) => r.lektion.avsnitt));
    expect(kal[0].avsnitt).toBe('Uppstart');
    expect(kal[1].avsnitt).toBe('4.1 Ekosystem');       // ersättningen tar första platsen; delkapitlets andra lektion ligger kvar
    expect(kal[1].lektionsIndex).toBe(1);
  });
});
