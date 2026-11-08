/**
 * Del 229: Binogi-förslag per delkapitel ur den inbyggda katalogen — matchning på begrepp och
 * rubrik, bokens ämne väger tyngst, egna poster matchas, redan inlagda filmer märks.
 */
import { describe, expect, it } from 'vitest';
import { bokFromValfriImport } from '../src/domain/biologibok.js';
import { BINOGI_KATALOG, binogiSlug, binogiSokIAppen, binogiSokUrl, foreslaBinogiFilmer, laggBinogiFilmerPaPlan } from '../src/domain/binogikatalog.js';
import { amnesPlanFor, hamtaLektionsplan, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, sparaBok } from '../src/domain/struktur.js';
import { tomStruktur } from '../src/domain/typer.js';

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
    expect(BINOGI_KATALOG.every((p) => /^[a-z0-9-]+$/.test(p.slug) && p.verifierad)).toBe(true);
    expect(BINOGI_KATALOG.length).toBeGreaterThan(600);                                   // Binogis NO/Tk-katalog
    expect(BINOGI_KATALOG.find((p) => p.slug === 'kolvaeten')?.begrepp).toEqual(expect.arrayContaining(['metan', 'alkan', 'kolväte']));
  });
  it('söklänkarna: i Binogi utan inloggning respektive webbsökning', () => {
    expect(binogiSokIAppen(['kolväten', 'alkaner'])).toBe('https://app.binogi.se/search/kolv%C3%A4ten%20alkaner');
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
    expect(f[0].forslag[0].traffar).toEqual(expect.arrayContaining(['metan', 'etan', 'alkan']));
    expect(f[0].forslag.some((x) => x.post.titel === 'Mättade och omättade kolväten')).toBe(true);
    expect(f[1].forslag[0].post.titel).toBe('Alkoholer');
    expect(f[1].forslag[0].redanIBoken).toBe(true);           // finns redan i bokfilen
    expect(f[1].forslag[0].url).toBe('https://app.binogi.se/l/alkoholer');
  });

  it('rubriken räcker när delkapitlet saknar begrepp; okänt kapitel ger tom lista', () => {
    const f = foreslaBinogiFilmer(KEMI, 7);
    expect(f[2].forslag.map((x) => x.post.titel)).toContain('Förbränning: fullständig och ofullständig');
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

describe('laggBinogiFilmerPaPlan', () => {
  it('lägger bästa filmen på varje delkapitels första lektion, hoppar över redan inlagda och svaga träffar', () => {
    const LA = { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] };
    let s = tomStruktur();
    s = laggTillSkolar(s, LA); s = sparaBok(s, KEMI);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO 8' });
    s = laggTillKlass(s, { id: 'k8b', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'ke', klassId: 'k8b', namn: 'Kemi', bokId: 'spektrum-kemi', schema: [{ dag: 2, start: '10:00', slut: '11:00' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'ke', bokId: 'spektrum-kemi', skapad: '2026-08-10' });
    const r = laggBinogiFilmerPaPlan(s, 'ke');
    expect(r.tillagda.map((x) => [x.kod, x.titel])).toEqual([['7.2', 'Kolväten']]);        // 7.4 finns redan i boken, 7.9 har för svag träff
    expect(r.utanForslag).toEqual(['7.9']);
    const plan = amnesPlanFor(r.s, 'ke', undefined, false)!.a;
    const i = plan.findIndex((x) => x.lektion.avsnitt.startsWith('7.2'));
    expect(hamtaLektionsplan(r.s, 'ke', i)?.filmer).toEqual(['Kolväten|https://app.binogi.se/l/kolvaeten']);
    // Idempotent
    expect(laggBinogiFilmerPaPlan(r.s, 'ke').tillagda).toEqual([]);
  });
});
