import { describe, expect, it } from 'vitest';
import {
  A4, andraStorlek, arDatablock, dupliceraBlock, flyttaBlock, fyllText, laggTillBlock, nyMall, ordnaBlock, ritordning,
  snappa, sparaRapportmall, standardmall, taBortBlock, taBortRapportmall, tolkaRapportmall, uppdateraBlock,
} from '../src/domain/rapportmall.js';
import { tomStruktur } from '../src/domain/typer.js';

describe('rapportmall — block på en A4-sida', () => {
  it('lägger till block med standardstorlek, snappar till rutnätet och lägger plattor bakom', () => {
    let m = nyMall('m1', 'Test', '2026-09-11');
    m = laggTillBlock(m, 'r', 'rubrik', 22, 18);
    m = laggTillBlock(m, 'p', 'platta', 7, 7);
    expect(m.block.find((b) => b.id === 'r')).toMatchObject({ x: 20, y: 20, b: 170, h: 14, z: 0, text: 'Rapport — {elev}' });
    expect(m.block.find((b) => b.id === 'p')).toMatchObject({ x: 5, y: 5, z: -1 });
    expect(ritordning(m).map((b) => b.id)).toEqual(['p', 'r']);
    expect(snappa(23)).toBe(25); expect(snappa(22)).toBe(20);
  });

  it('flytt och storlek håller sig inom sidan', () => {
    let m = laggTillBlock(nyMall('m', 'x', '2026-09-11'), 'k', 'kpi', 0, 0);
    m = flyttaBlock(m, 'k', 500, 500);
    const b = m.block[0];
    expect(b.x + b.b).toBeLessThanOrEqual(A4.bredd);
    expect(b.y + b.h).toBeLessThanOrEqual(A4.hojd);
    m = andraStorlek(m, 'k', 3, 2);
    expect(m.block[0]).toMatchObject({ b: 10, h: 6 }); // minimum
    m = flyttaBlock(m, 'k', -10, -10);
    expect(m.block[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('uppdatera slår ihop stil, duplicera förskjuter, ordna lägger fram/bak, ta bort', () => {
    let m = laggTillBlock(nyMall('m', 'x', '2026-09-11'), 'a', 'text', 20, 20);
    m = laggTillBlock(m, 'b', 'text', 20, 60);
    m = uppdateraBlock(m, 'a', { stil: { fet: true } });
    expect(m.block[0].stil).toEqual({ storlek: 11, fet: true });
    m = dupliceraBlock(m, 'a', 'a2');
    expect(m.block.find((b) => b.id === 'a2')).toMatchObject({ x: 25, y: 25, typ: 'text' });
    m = ordnaBlock(m, 'a', 'fram');
    expect(ritordning(m).pop()!.id).toBe('a');
    m = ordnaBlock(m, 'a', 'bak');
    expect(ritordning(m)[0].id).toBe('a');
    m = taBortBlock(m, 'a2');
    expect(m.block.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('fyllText byter platshållare; datablock kräver elev', () => {
    expect(fyllText('Rapport — {elev} i {amne} ({klass}, {datum})', { elev: 'Anna', amne: 'Biologi', klass: '8B', datum: '2026-09-11' })).toBe('Rapport — Anna i Biologi (8B, 2026-09-11)');
    expect(fyllText('{elev}', {})).toBe('');
    expect(arDatablock('platta')).toBe(false);
    expect(arDatablock('laxkurva')).toBe(true);
  });

  it('sparas i strukturen och kan läsas ur JSON; trasig JSON avvisas', () => {
    const m = standardmall('std', '2026-09-11');
    expect(m.block.length).toBeGreaterThan(8);
    let s = sparaRapportmall(tomStruktur(), m, '2026-09-11');
    expect(s.rapportmallar).toHaveLength(1);
    s = sparaRapportmall(s, { ...m, namn: 'Ny' }, '2026-09-12');
    expect(s.rapportmallar![0]).toMatchObject({ namn: 'Ny', andrad: '2026-09-12' });
    const tillbaka = tolkaRapportmall(JSON.stringify(m));
    expect(tillbaka.block.map((b) => b.typ)).toEqual(m.block.map((b) => b.typ));
    expect(() => tolkaRapportmall('{')).toThrow('giltig JSON');
    expect(() => tolkaRapportmall('{"id":"x"}')).toThrow('inte en rapportmall');
    expect(() => tolkaRapportmall(JSON.stringify({ id: 'x', namn: 'n', block: [{ typ: 'hologram' }] }))).toThrow('okänd typ');
    expect(taBortRapportmall(s, 'std').rapportmallar).toEqual([]);
  });
});

describe('Del 106: sidor, rutnät och linjering', async () => {
  const { antalSidor, blockSida, flyttaFlera, fordelaBlock, laggTillSida, linjeraBlock, taBortSida, tillSida } = await import('../src/domain/rapportmall.js');

  it('flera sidor: block hör till en sida, sidor kan läggas till och tas bort', () => {
    let m = nyMall('m', 'x', '2026-09-11');
    m = laggTillBlock(m, 'a', 'text', 20, 20);
    m = laggTillSida(m); m = laggTillSida(m);
    expect(antalSidor(m)).toBe(3);
    m = laggTillBlock(m, 'b', 'text', 20, 20, '2026-09-11', 2);
    m = laggTillBlock(m, 'c', 'text', 20, 20, '2026-09-11', 3);
    expect(ritordning(m, 2).map((b) => b.id)).toEqual(['b']);
    expect(ritordning(m).map((b) => b.id)).toEqual(['a', 'b', 'c']);
    m = tillSida(m, ['a'], 3);
    expect(blockSida(m.block.find((b) => b.id === 'a')!)).toBe(3);
    m = taBortSida(m, 2); // b försvinner, c och a flyttas till sida 2
    expect(antalSidor(m)).toBe(2);
    expect(m.block.map((b) => `${b.id}:${blockSida(b)}`).sort()).toEqual(['a:2', 'c:2']);
    expect(taBortSida(nyMall('x', 'x', ''), 1).antalSidor).toBeUndefined(); // enda sidan kan inte tas bort
  });

  it('rutnätet är valbart: 0 = fritt, 10 = grovt', () => {
    expect(snappa(23, 0)).toBe(23);
    expect(snappa(23, 10)).toBe(20);
    expect(snappa(23.46, 0)).toBe(23.5);
    let m = { ...nyMall('m', 'x', ''), rutnat: 10 };
    m = laggTillBlock(m, 'a', 'kpi', 23, 27);
    expect(m.block[0]).toMatchObject({ x: 20, y: 30 });
    m = flyttaBlock(m, 'a', 33, 33, false); // snapp av
    expect(m.block[0]).toMatchObject({ x: 33, y: 33 });
  });

  it('linjering: vänster, höger, hcenter, topp, botten, vcenter', () => {
    let m = nyMall('m', 'x', '');
    m = laggTillBlock(m, 'a', 'kpi', 10, 10); // 42×34
    m = laggTillBlock(m, 'b', 'kpi', 60, 40);
    m = andraStorlek(m, 'b', 20, 10);
    const pos = (mm: typeof m) => mm.block.map((b) => `${b.id}:${b.x},${b.y}`);
    expect(pos(linjeraBlock(m, ['a', 'b'], 'vanster'))).toEqual(['a:10,10', 'b:10,40']);
    expect(pos(linjeraBlock(m, ['a', 'b'], 'hoger'))).toEqual(['a:38,10', 'b:60,40']);   // maxX = 80
    expect(pos(linjeraBlock(m, ['a', 'b'], 'topp'))).toEqual(['a:10,10', 'b:60,10']);
    expect(pos(linjeraBlock(m, ['a', 'b'], 'botten'))).toEqual(['a:10,16', 'b:60,40']); // maxY = 50, a är 34 hög
    expect(pos(linjeraBlock(m, ['a', 'b'], 'hcenter'))).toEqual(['a:24,10', 'b:35,40']); // cx = 45
    expect(pos(linjeraBlock(m, ['a', 'b'], 'vcenter'))).toEqual(['a:10,13', 'b:60,25']); // cy = 30
    expect(linjeraBlock(m, ['a'], 'topp')).toBe(m); // ett block: inget att linjera mot
  });

  it('fördela och flytta flera', () => {
    let m = nyMall('m', 'x', '');
    m = laggTillBlock(m, 'a', 'kpi', 0, 0); m = laggTillBlock(m, 'b', 'kpi', 50, 0); m = laggTillBlock(m, 'c', 'kpi', 140, 0);
    const f = fordelaBlock(m, ['a', 'b', 'c'], 'vagratt');
    expect(f.block.map((b) => b.x)).toEqual([0, 70, 140]); // 182 − 126 = 56 / 2 = 28 mellanrum
    const fl = flyttaFlera(m, ['a', 'b'], 10, 5);
    expect(fl.block.map((b) => `${b.x},${b.y}`)).toEqual(['10,5', '60,5', '140,0']);
  });
});

describe('Del 107: vaxBlock — blocket växer, raden följer, allt under flyttas ned', async () => {
  const { vaxBlock, antalSidor, blockSida } = await import('../src/domain/rapportmall.js');
  function layout() {
    let m = nyMall('m', 'x', '');
    m = laggTillBlock(m, 'a', 'kpi', 20, 20);   // rad 1, 42×34
    m = laggTillBlock(m, 'b', 'kpi', 70, 20);   // rad 1
    m = laggTillBlock(m, 'c', 'text', 20, 60);  // under, 170×24
    m = laggTillBlock(m, 'd', 'text', 20, 240); // långt ner, 24 hög
    return m;
  }
  it('växer, raden får samma höjd, blocken under flyttas lika mycket', () => {
    const m = vaxBlock(layout(), 'a', 50);
    const b = (id: string) => m.block.find((x) => x.id === id)!;
    expect(b('a').h).toBe(50);
    expect(b('b').h).toBe(50); // samma rad följer med
    expect(b('c').y).toBe(76); // 60 + 16
    expect(b('d').y).toBe(256);
    expect(vaxBlock(m, 'a', 30)).toBe(m); // krymper aldrig
  });
  it('block som inte längre ryms hamnar överst på nästa sida i samma ordning', () => {
    const m = vaxBlock(layout(), 'a', 80); // delta 46: d skulle hamna på y=286, under sidkanten
    const d = m.block.find((x) => x.id === 'd')!;
    expect(antalSidor(m)).toBe(2);
    expect(blockSida(d)).toBe(2);
    expect(d.y).toBe(15); // marginalen
    expect(blockSida(m.block.find((x) => x.id === 'c')!)).toBe(1);
  });
});

describe('Del 116: rubrik på alla datablock och typografi i punkter', async () => {
  const { blockRubrik, blockTypografi, TYPOGRAFI_STANDARD } = await import('../src/domain/rapportmall.js');
  it('varje datablock får en rubrik, egen text vinner, KPI följer källan, dekor har ingen', () => {
    let m = nyMall('m', 'x', '');
    for (const typ of ['kpi', 'laxkurva', 'fragematris', 'begrepp-kvar', 'narvaro', 'studieplan', 'rad', 'laget', 'sammanfattning', 'exitlax', 'delkapitel', 'begrepp-vant'] as const) {
      m = laggTillBlock(m, typ, typ, 0, 0);
      expect(blockRubrik(m.block.find((b) => b.id === typ)!), typ).not.toBe('');
    }
    expect(blockRubrik({ typ: 'kpi', kalla: 'socrative-exit' })).toBe('Exit tickets');
    expect(blockRubrik({ typ: 'kpi', rubrik: 'Mina läxförhör' })).toBe('Mina läxförhör');
    expect(blockRubrik({ typ: 'platta' })).toBe('');
    expect(blockRubrik({ typ: 'exitlax' })).toContain('håller det?');
  });
  it('typografi: block > mall > standard; sparas och läses ur JSON', () => {
    const m = { ...nyMall('m', 'x', ''), typografi: { rubrikPt: 14, brodPt: 11 } };
    expect(blockTypografi(m, { stil: {} })).toEqual({ rubrikPt: 14, brodPt: 11 });
    expect(blockTypografi(m, { stil: { brodPt: 9 } })).toEqual({ rubrikPt: 14, brodPt: 9 });
    expect(blockTypografi({}, {})).toEqual(TYPOGRAFI_STANDARD);
    const t = tolkaRapportmall(JSON.stringify({ ...m, block: [{ typ: 'kpi', stil: { rubrikPt: 16 } }] }));
    expect(t.typografi).toEqual({ rubrikPt: 14, brodPt: 11 });
    expect(t.block[0].stil?.rubrikPt).toBe(16);
  });
});
