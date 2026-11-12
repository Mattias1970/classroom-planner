/**
 * Del 246 · Samläsning: ett lektionspass kan ha flera klasser (8A och 8B har MaNOTk-stöd tillsammans).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  amnenForKlass, amnetsKlassnamn, handelseGallerKlass, kalenderHandelser, klassSchema, laggTillAmne, laggTillKlass, laggTillLarare, laggTillSkolar, laggTillTjanst,
  larareSchema, passKonflikter, resetIdRaknare, sattSamlasning, skapaFriPlanering, taBortKlass, tomStruktur, type Struktur,
} from '../src/index.js';

beforeEach(resetIdRaknare);

function grund(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillLarare(s, { id: 'mt', namn: 'Läraren' });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma/NO', larareId: 'mt' });
  s = laggTillKlass(s, { id: 'kb', tjanstId: 'tj', namn: '8B' });
  s = laggTillKlass(s, { id: 'ka', tjanstId: 'tj', namn: '8A' });
  // MaNOTk-stöd ligger hos 8B: torsdagar 14:55–15:45
  s = laggTillAmne(s, { id: 'stod', klassId: 'kb', namn: 'MaNOTk-stöd', schema: [{ dag: 4, start: '14:55', slut: '15:45' }] });
  s = laggTillAmne(s, { id: 'ma-a', klassId: 'ka', namn: 'Matematik', schema: [{ dag: 2, start: '09:00', slut: '10:00' }] });
  return skapaFriPlanering(s, 'stod', '2026-08-17T08:00:00Z');
}

describe('Del 246 · sattSamlasning', () => {
  it('8A läser med: ämnet får klasserna 8A+8B och hör till båda klassernas ämnen', () => {
    const s = sattSamlasning(grund(), 'stod', ['ka']);
    const stod = s.amnen.find((a) => a.id === 'stod')!;
    expect(stod.medKlassIds).toEqual(['ka']);
    expect(amnetsKlassnamn(s, stod)).toBe('8A+8B');
    expect(amnenForKlass(s, 'ka').map((a) => a.namn).sort()).toEqual(['MaNOTk-stöd', 'Matematik']);
    expect(amnenForKlass(s, 'kb').map((a) => a.namn)).toEqual(['MaNOTk-stöd']);
  });

  it('hemklassen, okända klasser och klasser i ett annat skolår räknas inte; inget ändrat ger samma struktur', () => {
    let s = laggTillSkolar(grund(), { id: 'la2', namn: '2027/2028', start: '2027-08-16', slut: '2028-06-09', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj2', skolarId: 'la2', namn: 'Ma/NO' });
    s = laggTillKlass(s, { id: 'k9', tjanstId: 'tj2', namn: '9A' });
    expect(sattSamlasning(s, 'stod', ['kb', 'finns-inte', 'k9'])).toBe(s);
    const med = sattSamlasning(s, 'stod', ['ka', 'ka', 'kb']);
    expect(med.amnen.find((a) => a.id === 'stod')!.medKlassIds).toEqual(['ka']);
    expect(sattSamlasning(med, 'stod', ['ka'])).toBe(med);
    // av igen: fältet försvinner helt
    expect('medKlassIds' in sattSamlasning(med, 'stod', []).amnen.find((a) => a.id === 'stod')!).toBe(false);
  });

  it('tas 8A bort läser bara 8B ämnet', () => {
    const s = taBortKlass(sattSamlasning(grund(), 'stod', ['ka']), 'ka');
    expect('medKlassIds' in s.amnen.find((a) => a.id === 'stod')!).toBe(false);
  });
});

describe('Del 246 · passet står i båda klassernas scheman och kalendrar', () => {
  it('klassens schema: 8A får stödpasset, märkt med båda klasserna; lärarens schema har passet en gång', () => {
    const s = sattSamlasning(grund(), 'stod', ['ka']);
    expect(klassSchema(s, 'ka').map((r) => [r.dag, r.start, r.klassNamn, r.amnesNamn])).toEqual([[2, '09:00', '8A', 'Matematik'], [4, '14:55', '8A+8B', 'MaNOTk-stöd']]);
    expect(klassSchema(s, 'kb').map((r) => [r.dag, r.start, r.klassNamn, r.amnesNamn])).toEqual([[4, '14:55', '8A+8B', 'MaNOTk-stöd']]);
    expect(larareSchema(s, 'mt').filter((r) => r.amnesNamn === 'MaNOTk-stöd')).toHaveLength(1);
    // utan samläsning är allt som förut
    expect(klassSchema(grund(), 'ka').map((r) => r.amnesNamn)).toEqual(['Matematik']);
    expect(klassSchema(grund(), 'kb')[0].klassNamn).toBe('8B');
  });

  it('kalendern: en händelse per pass, märkt 8A+8B, och den gäller båda klasserna', () => {
    const s = sattSamlasning(grund(), 'stod', ['ka']);
    const h = kalenderHandelser(s, 'la').filter((x) => x.amnesNamn === 'MaNOTk-stöd');
    expect(h[0]).toMatchObject({ datum: '2026-08-20', start: '14:55', slut: '15:45', klassId: 'kb', klassIds: ['kb', 'ka'], klassNamn: '8A+8B', avsnitt: 'Tillfälle 1' });
    expect(new Set(h.map((x) => x.datum)).size).toBe(h.length);   // aldrig två händelser för samma pass
    expect([handelseGallerKlass(h[0], 'ka'), handelseGallerKlass(h[0], 'kb'), handelseGallerKlass(h[0], 'annan')]).toEqual([true, true, false]);
    // utan samläsning: bara 8B, och inget klassIds-fält
    const forut = kalenderHandelser(grund(), 'la').filter((x) => x.amnesNamn === 'MaNOTk-stöd')[0];
    expect([forut.klassNamn, 'klassIds' in forut, handelseGallerKlass(forut, 'ka')]).toEqual(['8B', false, false]);
  });

  it('krockar: ett nytt 8A-pass på torsdag 15:00 krockar med det samlästa stödpasset', () => {
    const s = sattSamlasning(grund(), 'stod', ['ka']);
    const krock = passKonflikter(s, 'ka', [{ dag: 4, start: '15:00', slut: '16:00' }], 'ma-a');
    expect(krock.map((r) => [r.klassNamn, r.amnesNamn])).toEqual([['8A+8B', 'MaNOTk-stöd']]);
    // och stödpasset flyttat till tisdag 09:30 krockar med 8A:s matematik
    expect(passKonflikter(s, 'kb', [{ dag: 2, start: '09:30', slut: '10:30' }], 'stod').map((r) => [r.klassNamn, r.amnesNamn])).toEqual([['8A', 'Matematik']]);
  });
});
