import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { pedagogiskPlanering } from '../src/domain/pedagogiskplanering.js';
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
  });

  it('null utan bok eller planering; okänt kapitel ger null', () => {
    const s = bygg();
    expect(pedagogiskPlanering({ ...s, planeringar: [] }, 'bi')).toBeNull();
    expect(pedagogiskPlanering(s, 'bi', 9)).toBeNull();
    expect(pedagogiskPlanering(s, 'saknas')).toBeNull();
  });
});
