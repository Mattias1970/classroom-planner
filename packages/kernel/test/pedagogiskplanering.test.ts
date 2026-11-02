import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { pedagogiskPlanering, pedagogiskPlaneringForOmfang } from '../src/domain/pedagogiskplanering.js';
import { laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, sattLektionsplan, sparaBok, sattLaborationsstandard } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const HAR = dirname(fileURLToPath(import.meta.url));
const BOK = bokFromValfriImport(readFileSync(join(HAR, 'fixtures', 'spektrum-biologi-kap6.json'), 'utf8'));

function bygg(halvklass = false): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, BOK);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, halvklass
    ? { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, halvklass: true,
        schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 4, start: '09:45', slut: '10:55' }],
        schemaB: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 4, start: '11:00', slut: '12:10' }] }
    : { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 5, start: '10:00', slut: '11:00' }] });
  return registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
}

describe('Del 134: pedagogisk planering och provlapp ur planeringen', () => {
  it('syfte, begrepp, innehåll, filmer, rum och prov kommer ur boken; veckorna ur planeringen', () => {
    const p = pedagogiskPlanering(bygg(), 'bi', undefined, '2026-09-14')!;
    expect(p).not.toBeNull();
    expect(p.amne).toBe('Biologi'); expect(p.klass).toBe('8B');
    expect(p.kapitel).toEqual({ nr: 6, namn: 'Kroppen', sidor: 's. 230–266' });
    // Utan kapitlets "Här får du lära dig" i bokfilen faller syftet tillbaka på delkapitlens mål — märkt
    expect(p.syfte[0]).toBe('Alla organismer består av celler, livets minsta levande byggstenar.');
    expect(p.syfte).toHaveLength(40);                         // 8 delkapitel × 5 mål
    expect(p.syfteFranDelkapitel).toBe(true);
    expect(p.syfteSidor).toBeNull();
    expect(p.begrepp.slice(0, 3)).toEqual(['cellteorin', 'cellandning', 'cellmembran']);
    expect(p.innehall[1]).toMatchObject({ kod: '6.2', namn: 'Matspjälkningen', sidor: 's. 238–241' });
    expect(p.innehall[1].text).toContain('Vid matspjälkningen sönderdelas maten');
    expect(p.filmer[0].filmer.map((f) => f.titel)).toEqual(['Cellens specialisering', 'Celldelning', 'Organ och organsystem']);
    expect(p.filmer[0].filmer[0].url).toBe('https://app.binogi.se/l/cellens-specialisering');
    expect(p.ovaRum).toEqual(['Biologi61', 'Biologi62', 'Biologi63', 'Biologi64', 'Biologi65', 'Biologi66', 'Biologi67', 'Biologi68']);
    expect(p.klassRum).toBe('Biologi8BB');
    // Mån 14/9, fre 18/9, mån 21/9 … nio lektioner → provet på mån 12/10
    expect(p.veckor.map((v) => v.vecka)).toEqual([38, 39, 40, 41, 42]);
    expect(p.prov).toEqual({ datum: '2026-10-12', rubrik: 'PROV' });
    const d1 = p.veckor[0].dagar[0];
    expect(d1).toMatchObject({ datum: '2026-09-14', dag: 'Måndag', nr: 1, typ: 'lektion', kod: '6.1', sidor: 's. 230–235', laxforhor: null });
    expect(d1.exit).toEqual({ rum: 'Biologi8BB', begrepp: 'Begrepp 6.1' });
    expect(d1.arbete).toBe('Testa dig själv 6.1 · uppgift 1–7');
    expect(d1.genomgang).toContain('Cellteorin: alla organismer består av celler.');
    expect(d1.genomgangKalla).toBe('bok');                    // bokens innehåll — står under Innehåll, inte i tabellen
    expect(d1.begrepp).toContain('stamcell');
    expect(d1.laxa).toEqual({ till: 'fredag v38', text: 'Begrepp 6.1', ovaRum: 'Biologi61' });   // kumulativ läxa: hittills = 6.1
    expect(d1.filmer).toHaveLength(3);
    const d2 = p.veckor[0].dagar[1];
    expect(d2.laxforhor).toEqual({ begrepp: 'Begrepp 6.1', rum: 'Biologi8BB', ovaRum: 'Biologi61' });
    // Läxan är alltid kumulativ och är samma begrepp/rum som NÄSTA lektions läxförhör
    expect(d2.laxa).toEqual({ till: 'måndag v39', text: 'Begrepp 6.1–6.2', ovaRum: 'Biologi612' });
    const d3 = p.veckor[1].dagar[0];
    expect(d3.laxforhor).toEqual({ begrepp: 'Begrepp 6.1–6.2', rum: 'Biologi8BB', ovaRum: 'Biologi612' });
    expect(d3.laxforhor!.ovaRum).toBe(d2.laxa!.ovaRum);
    expect(d3.laxforhor!.begrepp).toBe(d2.laxa!.text);
    expect(p.veckor[1].dagar[1].laxa!.text).toBe('Begrepp 6.1–6.4');   // växer delkapitel för delkapitel
    const prov = p.veckor[4].dagar[0];
    expect(prov).toMatchObject({ typ: 'prov', avsnitt: 'PROV', laxa: null, exit: null, arbete: null });
  });

  it('lektionsplanens överstyrningar går före boken: genomgång, läxa, sammanfattning, filmer, namn', () => {
    let s = bygg();
    s = sattLektionsplan(s, { id: 'lp0', amneId: 'bi', lektionsIndex: 0, genomgang: 'Vi tittar i mikroskop.', laxa: 'Läs s. 230–235 och begreppen', sammanfattning: 'Cellen är livets byggsten.', filmer: ['Egen film|https://x.se/f'], avsnittText: '6.1 Cellen' });
    const p = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const d1 = p.veckor[0].dagar[0];
    expect(d1.avsnitt).toBe('6.1 Cellen');
    expect(d1.genomgang).toBe('Vi tittar i mikroskop.');
    expect(d1.genomgangKalla).toBe('lektionsplan');           // lärarens egen text — visas i tabellen
    expect(d1.laxa?.text).toBe('Läs s. 230–235 och begreppen');
    expect(d1.filmer.map((f) => f.titel)).toEqual(['Cellens specialisering', 'Celldelning', 'Organ och organsystem', 'Egen film']);
    expect(p.innehall[0].text).toBe('Cellen är livets byggsten.');
    expect(p.filmer[0].filmer).toHaveLength(4);
  });

  it('halvklass: laborationerna på torsdagarna kommer med för grupp A och B; helklassmåndagar en gång', () => {
    let s = bygg(true);
    s = sattLaborationsstandard(s, 'bi', true, '2026-09-14');
    const p = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const v38 = p.veckor[0].dagar;
    expect(v38.map((d) => `${d.dag} ${d.typ}${d.grupp !== undefined ? ` ${d.grupp}` : ''}`)).toEqual(['Måndag lektion', 'Torsdag laboration A', 'Torsdag laboration B']);
    expect(v38[1].avsnitt).toContain('Laboration');
    expect(v38[1].laxa).toBeNull();
  });

  it('syftet är kapitlets "Här får du lära dig" (öppningsuppslaget) när boken har det — inte delkapitlens mål', async () => {
    const { bokFromValfriImport } = await import('../src/domain/biologibok.js');
    const rad = JSON.parse(readFileSync(join(HAR, 'fixtures', 'spektrum-biologi-kap6.json'), 'utf8')) as { kapitel: Array<Record<string, unknown>> };
    rad.kapitel[0].malSidor = 's. 229';
    rad.kapitel[0].mal = ['beskriva cellens delar och hur celler bildar vävnader, organ och organsystem',
      'förklara hur kroppen tar upp näring, syre och gör sig av med avfall',
      'resonera om hur kroppens organsystem samarbetar'];
    const medMal = bokFromValfriImport(JSON.stringify(rad));
    expect(medMal.kapitel[0].mal).toHaveLength(3);
    expect(medMal.kapitel[0].malSidor).toBe('s. 229');
    let s = bygg();
    s = sparaBok(s, medMal);
    const p = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    expect(p.syfte).toEqual(medMal.kapitel[0].mal);            // kapitlets mål, inte de 40 delkapitelmålen
    expect(p.syfteSidor).toBe('s. 229');
    expect(p.syfteFranDelkapitel).toBe(false);
    expect(p.innehall[0].text).toContain('Alla organismer består av celler');   // delkapitlens mål finns kvar under Innehåll
    expect(p.kapitelLista[0].viktigaBegrepp).toEqual([]);                       // Del 218 · fältet saknas i fixturen
  });

  it('Del 218 · kapitlets "Några viktiga begrepp" följer med i kapitelLista', async () => {
    const { bokFromValfriImport } = await import('../src/domain/biologibok.js');
    const rad = JSON.parse(readFileSync(join(HAR, 'fixtures', 'spektrum-biologi-kap6.json'), 'utf8')) as { kapitel: Array<Record<string, unknown>> };
    rad.kapitel[0].mal = ['beskriva hur kroppens celler är uppbyggda och hur de fungerar'];
    rad.kapitel[0].viktigaBegrepp = ['evolution', 'cellandning', 'stamcell'];
    let s = bygg();
    s = sparaBok(s, bokFromValfriImport(JSON.stringify(rad)));
    const p = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    expect(p.kapitelLista[0].viktigaBegrepp).toEqual(['evolution', 'cellandning', 'stamcell']);
  });

  it('null utan bok eller planering; okänt kapitel ger null', () => {
    const s = bygg();
    expect(pedagogiskPlanering({ ...s, planeringar: [] }, 'bi')).toBeNull();
    expect(pedagogiskPlanering(s, 'bi', 9)).toBeNull();
    expect(pedagogiskPlanering(s, 'saknas')).toBeNull();
  });
});

describe('Del 217 · pedagogisk planering för ett omfång över flera kapitel', () => {
  it('bara valda delkapitel: innehåll, begrepp, filmer och veckoplanering; kapitel utan träff hoppas', () => {
    const s = bygg();
    const pl = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.2' }], '2026-09-14')!;
    expect(pl).not.toBeNull();
    expect(pl.omfang).toBe('6.1–6.2');
    expect(pl.kapitelLista.map((k) => k.nr)).toEqual([6]);
    expect(pl.innehall.map((d) => d.kod)).toEqual(['6.1', '6.2']);
    expect(pl.filmer.map((d) => d.kod)).toEqual(['6.1', '6.2']);
    const koder = pl.veckor.flatMap((v) => v.dagar).map((d) => d.kod ?? d.typ);
    expect(koder.filter((k) => /^6\./.test(k))).toEqual(['6.1', '6.2']);
    expect(koder).not.toContain('6.3');
    // Hela kapitlet via omfång = samma delkapitel som utan omfång
    const hela = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const viaOmfang = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.9' }], '2026-09-14')!;
    expect(viaOmfang.innehall.map((d) => d.kod)).toEqual(hela.innehall.map((d) => d.kod));
    expect(viaOmfang.veckor.flatMap((v) => v.dagar).length).toBe(hela.veckor.flatMap((v) => v.dagar).length);
    expect(pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '9.1', till: '9.2' }], '2026-09-14')).toBeNull();
    expect(hela.omfang).toBeNull();
  });
});

describe('Del 220 · sammanfattning per delkapitel, begrepp per delkapitel och Socrative-rummen', () => {
  it('innehållet är bokens sammanfattning när den finns, begreppen grupperas per delkapitel, rummen listas med delkapitel', () => {
    const s = bygg();
    const p = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.3' }], '2026-09-14')!;
    expect(p.begreppPerDelkapitel.map((d) => d.kod)).toEqual(['6.1', '6.2', '6.3']);
    expect(p.begreppPerDelkapitel[0].begrepp).toContain('cellteorin');
    expect(p.begreppPerDelkapitel[1].begrepp).toContain('enzym');
    expect(p.begrepp).toEqual([...new Set(p.begreppPerDelkapitel.flatMap((d) => d.begrepp))]);
    // fixturen saknar bokens sammanfattning → bokens mål; källan märks
    expect(p.innehall.map((d) => d.kalla)).toEqual(['mal', 'mal', 'mal']);
    expect(p.innehall[0].text).toContain('Alla organismer består av celler');
    // Del 222 · rummen planeringen pekar på, klippta till urvalet: provets Biologi612345678 blir Biologi6123
    expect(p.socrativeRum).toEqual([
      { rum: 'Biologi61', delkapitel: '6.1', anvands: 'exit ticket och läxförhör' },
      { rum: 'Biologi612', delkapitel: '6.1–6.2', anvands: 'läxförhör' },
      { rum: 'Biologi6123', delkapitel: '6.1–6.3', anvands: 'läxförhör' },
      { rum: 'Biologi62', delkapitel: '6.2', anvands: 'exit ticket' },
      { rum: 'Biologi63', delkapitel: '6.3', anvands: 'exit ticket' },
    ]);
    expect(p.ovaRumAlla).toEqual(['Biologi6123']);
    // provdagen: läxförhöret pekar på urvalet, inte hela kapitlet
    const prov = p.veckor.flatMap((v) => v.dagar).find((d) => d.typ === 'prov')!;
    expect(prov.laxforhor).toEqual({ begrepp: 'Begrepp 6.1–6.3', rum: 'Biologi8BB', ovaRum: 'Biologi6123' });
    const sista = p.veckor.flatMap((v) => v.dagar).filter((d) => d.kod === '6.3').pop()!;
    expect(sista.laxa?.ovaRum).toBe('Biologi6123');
    expect(JSON.stringify(p)).not.toMatch(/6\.[4-8]|Biologi6123[45]/);
    // hela kapitlet: oklippt
    const hela = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    expect(hela.socrativeRum.map((r) => r.rum)).toContain('Biologi612345678');
    expect(hela.ovaRumAlla).toEqual(['Biologi612345678']);
  });

  it('bokens sammanfattning av delkapitlet går före lektionsplanens och bokens mål', async () => {
    const { bokFromValfriImport } = await import('../src/domain/biologibok.js');
    const rad = JSON.parse(readFileSync(join(HAR, 'fixtures', 'spektrum-biologi-kap6.json'), 'utf8')) as { kapitel: Array<{ delkapitel: Array<Record<string, unknown>> }> };
    rad.kapitel[0].delkapitel[0].sammanfattning = 'Celler bildar vävnader, vävnader bildar organ och organ bildar organsystem.';
    let s = bygg();
    s = sparaBok(s, bokFromValfriImport(JSON.stringify(rad)));
    const p = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    expect(p.innehall[0]).toMatchObject({ kod: '6.1', kalla: 'bok', text: 'Celler bildar vävnader, vävnader bildar organ och organ bildar organsystem.' });
    expect(p.innehall[1].kalla).toBe('mal');
  });
});

describe('Del 224 · laborationerna i planeringen med frågeställning och genomförd-status', () => {
  it('halvklass: en post per laboration (A och B slås ihop), frågeställning ur lektionsplanen, genomförd = datum före idag', () => {
    let s = bygg(true);
    s = sattLaborationsstandard(s, 'bi', true, '2026-09-14');
    const fore = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const labRad = fore.veckor[0].dagar.find((d) => d.typ === 'laboration')!;
    s = sattLektionsplan(s, { id: 'lpL', amneId: 'bi', lektionsIndex: labRad.nr - 1, labFraga: 'Hur påverkar temperaturen enzymets aktivitet?' });
    const p = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    expect(p.laborationer.length).toBeGreaterThan(0);
    expect(p.laborationer.filter((l) => l.datum === labRad.datum)).toHaveLength(1);     // inte en för A och en för B
    expect(p.laborationer[0]).toMatchObject({ datum: labRad.datum, fraga: 'Hur påverkar temperaturen enzymets aktivitet?', genomford: false });
    // idag efter första labben: den är genomförd, de senare inte
    const senare = pedagogiskPlanering(s, 'bi', 6, '2026-10-01')!;
    expect(senare.laborationer[0].genomford).toBe(true);
    expect(senare.laborationer.filter((l) => l.datum !== null && l.datum >= '2026-10-01').every((l) => !l.genomford)).toBe(true);
    // lärarens val vinner över datumet
    const val = pedagogiskPlanering(s, 'bi', 6, '2026-10-01', new Set([p.laborationer[1].nyckel]))!;
    expect(val.laborationer[0].genomford).toBe(false);
    expect(val.laborationer[1].genomford).toBe(true);
    // omfång: bara laborationerna i omfånget, i datumordning
    const o = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.2' }], '2026-09-14')!;
    expect(o.laborationer.every((l) => l.nyckel.length > 0)).toBe(true);
    expect([...o.laborationer].sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''))).toEqual(o.laborationer);
  });
});

describe('Del 226 · två kapitel i omfånget: inbyggda filmer, kapitlets omfång, slutförhöret över alla valda delkapitel, provets upplägg', () => {
  const TVA = bokFromValfriImport(JSON.stringify({
    id: 'spektrum-biologi', titel: 'Spektrum Biologi', forlag: 'Liber', amne: 'Biologi', arskurs: 8,
    kapitel: [
      { nummer: 6, titel: 'Vår fantastiska kropp', sidor: '228–271', finalen: { sidor: '269–271' }, delkapitel: [1, 2, 3].map((n) => ({ nummer: `6.${n}`, titel: `Del ${n}`, sidor: `${n}`, begrepp: [`b${n}`], extraBegrepp: [], testaDigSjalv: { sida: n, fragor: [] } })) },
      { nummer: 7, titel: 'Nervsystemet styr din kropp', sidor: '272–303', finalen: { sidor: '302–303' }, delkapitel: [1, 2, 3].map((n) => ({ nummer: `7.${n}`, titel: `N ${n}`, sidor: `${n}`, begrepp: [`n${n}`], extraBegrepp: [], testaDigSjalv: { sida: n, fragor: [] } })) },
    ],
  }));
  function byggTva(): Struktur {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, TVA);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: TVA.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 4, start: '09:45', slut: '10:55' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: TVA.id, skapad: '2026-09-10' });
    return s;
  }
  it('bokfilen utan filmer → den inbyggda Binogi-listan för Spektrum; annan bok får inga', () => {
    const s = byggTva();
    const p = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.2' }, { fran: '7.1', till: '7.2' }], '2026-09-14')!;
    expect(p.filmer.find((d) => d.kod === '6.1')!.filmer.map((f) => f.titel)).toContain('Livets domäner');
    expect(p.filmer.find((d) => d.kod === '6.2')!.filmer.map((f) => f.url)).toContain('https://app.binogi.se/l/naeringsaemnen');
    expect(p.filmer.find((d) => d.kod === '7.1')!.filmer.map((f) => f.titel)).toEqual(['Nervsystemet', 'Nervreflexer', 'Hjärnans anatomi']);
    const annan = { ...TVA, id: 'gleerups-biologi', forlag: 'Gleerups' };
    let s2 = sparaBok(byggTva(), annan);
    s2 = { ...s2, amnen: s2.amnen.map((a) => ({ ...a, bokId: annan.id })), planeringar: s2.planeringar.map((x) => ({ ...x, bokId: annan.id })) };
    const p2 = pedagogiskPlanering(s2, 'bi', 6, '2026-09-14')!;
    expect(p2.filmer.every((d) => d.filmer.length === 0)).toBe(true);
  });
  it('kapitelLista bär kapitlets eget omfång; slutförhöret och läxan inför repetition/prov täcker alla valda delkapitel', () => {
    const s = byggTva();
    const p = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.2' }, { fran: '7.1', till: '7.3' }], '2026-09-14')!;
    expect(p.kapitelLista.map((k) => [k.nr, k.omfang])).toEqual([[6, '6.1–6.2'], [7, '7.1–7.3']]);
    expect(p.ovaRumAlla).toEqual(['Biologi612', 'Biologi7123']);
    const dagar = p.veckor.flatMap((v) => v.dagar);
    const slut = dagar.filter((d) => d.datum >= dagar.find((x) => x.kod === '7.1')!.datum && d.typ !== 'lektion' && d.laxforhor !== null);
    expect(slut.length).toBeGreaterThan(0);
    for (const d of slut) expect(d.laxforhor).toEqual({ begrepp: 'Begrepp 6.1–6.2, 7.1–7.3', rum: 'Biologi8BB', ovaRum: 'Biologi612, Biologi7123' });
    const sista73 = dagar.filter((d) => d.kod === '7.3').pop()!;
    expect(sista73.laxa).toMatchObject({ text: 'Begrepp 6.1–6.2, 7.1–7.3', ovaRum: 'Biologi612, Biologi7123' });
    // kapitel 6:s eget slutförhör (inför kapitel 7) rör inte
    const for7 = dagar.filter((d) => d.typ !== 'lektion' && d.laxforhor !== null && d.datum < dagar.find((x) => x.kod === '7.1')!.datum);
    for (const d of for7) expect(d.laxforhor!.begrepp).toBe('Begrepp 6.1–6.2');
    // ett kapitel: hela kapitlet → omfang null
    expect(pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!.kapitelLista[0].omfang).toBeNull();
  });
  it('provdagen: NO-standardupplägget, eller lärarens egen text från provlektionen', () => {
    let s = byggTva();
    const p = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const prov = p.veckor.flatMap((v) => v.dagar).find((d) => d.typ === 'prov')!;
    expect(prov.provText).toEqual(['Lektion 1 (NO-lektion): E-prov (begrepp och modeller), ECA Undersökningsprov', 'Lektion 2 (Ma-lektion): CA-prov (begrepp och modeller)']);
    expect(p.veckor.flatMap((v) => v.dagar).filter((d) => d.typ !== 'prov').every((d) => d.provText.length === 0)).toBe(true);
    s = sattLektionsplan(s, { id: 'lpP', amneId: 'bi', lektionsIndex: prov.nr - 1, genomgang: 'Provet skrivs på en lektion.\nHjälpmedel: begreppslistan.' });
    const egen = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!.veckor.flatMap((v) => v.dagar).find((d) => d.typ === 'prov')!;
    expect(egen.provText).toEqual(['Provet skrivs på en lektion.', 'Hjälpmedel: begreppslistan.']);
  });
});
