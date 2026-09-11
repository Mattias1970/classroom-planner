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
