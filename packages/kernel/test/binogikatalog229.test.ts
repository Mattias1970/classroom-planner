/**
 * Del 229: Binogi-förslag per delkapitel ur den inbyggda katalogen — matchning på begrepp och
 * rubrik, bokens ämne väger tyngst, egna poster matchas, redan inlagda filmer märks.
 */
import { describe, expect, it } from 'vitest';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { BINOGI_KATALOG, binogiSlug, binogiSokUrl, foreslaBinogiFilmer } from '../src/domain/binogikatalog.js';

const KEMI = bokFromValfriImport(JSON.stringify({
  id: 'spektrum-kemi', titel: 'Spektrum Kemi', forlag: 'Liber', amne: 'Kemi', arskurs: 8,
  kapitel: [{
    nummer: 7, titel: 'Organisk kemi', sidor: '156–185',
    delkapitel: [
      { nummer: '7.2', titel: 'Kolväten är grunden i organisk kemi', sidor: '161–165', begrepp: ['kolväte', 'metan', 'etan', 'propan', 'butan', 'alkaner', 'alkanserien', 'pentan', 'isomerer'], extraBegrepp: [], testaDigSjalv: { sida: 165, fragor: [] } },
      { nummer: '7.4', titel: 'Alkoholer finns inte bara i vin', sidor: '169–172', begrepp: ['OH-grupp', 'metanol', 'etanol', 'glykol', 'glycerol'], extraBegrepp: [], testaDigSjalv: { sida: 172, fragor: [] },
        filmer: [{ titel: 'Alkoholer', plattform: 'Binogi', url: 'https://app.binogi.se/l/alkoholer', begrepp: 'alkohol' }] },
      { nummer: '7.9', titel: 'Förbränning påverkar miljön', sidor: '—', begrepp: [], extraBegrepp: [], testaDigSjalv: { sida: null, fragor: [] } },
    ],
  }],
}));

describe('binogiSlug', () => {
  it('följer Binogis adressmönster', () => {
    expect(binogiSlug('Förbränning')).toBe('foerbraenning');
    expect(binogiSlug('Hjärt- och kärlsystemet')).toBe('hjaert-och-kaerlsystemet');
    expect(binogiSlug('Matspjälkningen – från munnen till magen')).toBe('matspjaelkningen-fraan-munnen-till-magen');
    expect(BINOGI_KATALOG.every((p) => /^[a-z0-9-]+$/.test(p.slug))).toBe(true);
  });
  it('söklänken begränsas till app.binogi.se', () => {
    expect(binogiSokUrl(['kolväten', 'alkaner'])).toContain(encodeURIComponent('site:app.binogi.se kolväten alkaner'));
  });
});

describe('foreslaBinogiFilmer', () => {
  it('bästa förslaget per delkapitel är den lektion som täcker begreppen', () => {
    const f = foreslaBinogiFilmer(KEMI, 7);
    expect(f.map((d) => d.kod)).toEqual(['7.2', '7.4', '7.9']);
    expect(f[0].forslag[0].post.titel).toBe('Kolväten');
    expect(f[0].forslag[0].traffar).toEqual(expect.arrayContaining(['metan', 'etan', 'propan', 'butan']));
    expect(f[0].forslag.some((x) => x.post.titel === 'Isomerer')).toBe(true);
    expect(f[1].forslag[0].post.titel).toBe('Alkoholer');
    expect(f[1].forslag[0].redanIBoken).toBe(true);           // finns redan i bokfilen
    expect(f[1].forslag[0].url).toBe('https://app.binogi.se/l/alkoholer');
  });

  it('rubriken räcker när delkapitlet saknar begrepp; okänt kapitel ger tom lista', () => {
    const f = foreslaBinogiFilmer(KEMI, 7);
    expect(f[2].forslag.map((x) => x.post.titel)).toContain('Förbränning');
    expect(f[2].sokord).toEqual([]);
    expect(foreslaBinogiFilmer(KEMI, 99)).toEqual([]);
  });

  it('egna katalogposter matchas och går före vid lika poäng; biologilektioner tas inte med i kemi utan stark träff', () => {
    const egen = { titel: 'Kolväten i vardagen', slug: 'kolvaeten-i-vardagen', amne: 'Kemi' as const, nyckelord: ['kolväte', 'metan', 'etan', 'propan', 'butan', 'alkaner', 'alkanserien', 'pentan'], verifierad: true };
    const f = foreslaBinogiFilmer(KEMI, 7, [egen]);
    expect(f[0].forslag.map((x) => x.post.titel).slice(0, 2)).toContain('Kolväten i vardagen');
    expect(f.flatMap((d) => d.forslag).some((x) => x.post.amne === 'Biologi')).toBe(false);
  });
});
