// @vitest-environment jsdom
/**
 * Del 255 · Dokumentet sparas packat — i den stora lagringen, i backupfilen och i datarepot — och läses
 * tillbaka till exakt samma struktur. Äldre, opackade dokument och filer läses som förut.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arPackad, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, resetIdRaknare, tomStruktur, type FragaSvar, type Struktur } from '@planner/kernel';
import type { Dokumentlager } from '../src/storlagring';

const KEY = 'classroom-planner.studio.v2';
const ELEVER = ['Anna Testsson', 'Omar Provlund', 'Li Övnegård'];
function bygg(forhor = 4, fragor = 20): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  for (const [i, namn] of ELEVER.entries()) s = laggTillElev(s, { id: `e${i}`, klassId: 'k', namn, grupp: 'A' });
  for (let q = 0; q < forhor; q++) {
    const rader = ELEVER.map((namn, e) => {
      const svar: FragaSvar[] = Array.from({ length: fragor }, (_, j) => ({
        fraga: `Fråga ${j + 1}: ett begrepp i biologin som eleverna ska känna igen och kunna namnge med rätt ord.`,
        svar: (e + j) % 2 === 0 ? `A. • begrepp ${j}` : `B. • något annat ${j}`, ratt: (e + j) % 2 === 0, facit: `A. • begrepp ${j}`,
      }));
      return { namn, poang: svar.filter((x) => x.ratt).length, maxPoang: fragor, svar };
    });
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: `Biologi 6.${q + 1} Begrepp`, datum: `2026-09-${String(10 + q).padStart(2, '0')}`, tid: '09:21', rum: 'BIOLOGI8BB', rader }).s;
  }
  return s;
}
function minneslager() {
  const data = new Map<string, unknown>();
  const lager: Dokumentlager = {
    las: async (nycklar) => nycklar.map((n) => data.get(n)),
    skriv: async (poster, taBort = []) => { for (const [n, v] of poster) data.set(n, v); for (const n of taBort) data.delete(n); },
    nycklar: async () => [...data.keys()],
  };
  return { lager, data };
}
async function flik() { vi.resetModules(); return import('../src/store'); }

beforeEach(() => { localStorage.clear(); resetIdRaknare(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Del 255 · den stora lagringen sparar packat', () => {
  it('dokumentet är packat och mycket mindre — och läses tillbaka till exakt samma struktur', async () => {
    const m = minneslager();
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    const s = bygg();
    store.sparaStruktur(s);
    await store.vantaPaLagring();
    const text = m.data.get('struktur') as string;
    expect(arPackad(JSON.parse(text))).toBe(true);
    expect(text.length).toBeLessThan(JSON.stringify(s).length * 0.4);
    expect(store.lagradeTecken()).toBe(text.length);
    expect(text).not.toContain('"fraga"');                        // inga frågetexter per elev längre

    const nasta = await flik();                                    // sidan laddas om
    await nasta.startaLagring({ lager: m.lager, kanal: null });
    expect(JSON.stringify(nasta.lasStruktur())).toBe(JSON.stringify(s));
  });

  it('ett äldre, opackat dokument i lagringen läses som förut och packas vid nästa sparning', async () => {
    const m = minneslager();
    const s = bygg();
    m.data.set('struktur', JSON.stringify(s)); m.data.set('stampel', 'a');
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    expect(JSON.stringify(store.lasStruktur())).toBe(JSON.stringify(s));
    store.sparaStruktur({ ...store.lasStruktur() });
    await store.vantaPaLagring();
    expect(arPackad(JSON.parse(m.data.get('struktur') as string))).toBe(true);
  });

  it('en struktur utan resultat sparas som den är', async () => {
    const m = minneslager();
    const store = await flik();
    await store.startaLagring({ lager: m.lager, kanal: null });
    const s = bygg(0);
    store.sparaStruktur(s);
    await store.vantaPaLagring();
    expect(m.data.get('struktur')).toBe(JSON.stringify(s));
  });
});

describe('Del 255 · den lilla lagringen (webbläsare utan stor lagring)', () => {
  it('ryms dokumentet sparas det som förut, opackat', async () => {
    const store = await flik();
    const s = bygg();
    store.sparaStruktur(s);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(s));
  });

  it('ryms det inte som det är sparas det packat — utan varning — och läses tillbaka likadant', async () => {
    const s = bygg();
    const grans = Math.round(JSON.stringify(s).length * 0.6);     // lagringen tar emot det packade men inte det opackade
    const riktig = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEY && v.length > grans) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      riktig.call(this, k, v);
    });
    const store = await flik();
    store.sparaStruktur(s);
    expect(arPackad(JSON.parse(localStorage.getItem(KEY)!))).toBe(true);
    expect(store.lasStruktur()).toBe(s);
    const nasta = await flik();
    expect(JSON.stringify(nasta.lasStruktur())).toBe(JSON.stringify(s));
  });
});

describe('Del 255 · backupfilen och datarepot', () => {
  it('filen är version 3: packad, en post per rad, mycket mindre — och läses in till samma struktur', async () => {
    const store = await flik();
    const s = bygg();
    const fil = store.exportJson(s);
    const tolkad = JSON.parse(fil) as { schema: string; version: number; packad?: unknown; struktur?: unknown; exportedAt: string };
    expect(tolkad.schema).toBe('classroom-planner-studio');
    expect(tolkad.version).toBe(3);
    expect(arPackad(tolkad.packad)).toBe(true);
    expect(tolkad.struktur).toBeUndefined();                       // en äldre app säger "inte en Studio-backup" i stället för att läsa fel
    expect(fil.length).toBeLessThan(JSON.stringify({ struktur: s }, null, 2).length * 0.3);
    expect(fil.split('\n').filter((r) => r.startsWith('{"id":') && r.includes('"prov":')).length).toBe(12);   // ett resultat per rad
    expect(JSON.stringify(store.importJson(fil))).toBe(JSON.stringify(s));
  });

  it('en äldre backup (version 2, opackad) läses som förut', async () => {
    const store = await flik();
    const s = bygg();
    const gammal = JSON.stringify({ schema: 'classroom-planner-studio', version: 2, struktur: s, exportedAt: '2026-09-23T23:37:34.358Z' }, null, 2);
    expect(JSON.stringify(store.importJson(gammal))).toBe(JSON.stringify(s));
  });

  it('en fil som inte är en backup, eller en skadad packad fil, ger ett fel — inget läses in', async () => {
    const store = await flik();
    expect(() => store.importJson('{"schema":"annat"}')).toThrow(/inte en Studio-backup/);
    const fil = JSON.parse(store.exportJson(bygg())) as { packad: { texter: string[] } };
    fil.packad.texter = fil.packad.texter.slice(0, 3);
    expect(() => store.importJson(JSON.stringify(fil))).toThrow(/Filen är skadad/);
  });

  it('en undanlagd kopia blir en backupfil — packad eller inte', async () => {
    const store = await flik();
    const s = bygg();
    expect(JSON.stringify(store.importJson(store.reservSomBackup(JSON.stringify(s))))).toBe(JSON.stringify(s));
    const m = minneslager();
    await store.startaLagring({ lager: m.lager, kanal: null });
    store.sparaStruktur(s); await store.vantaPaLagring();
    expect(JSON.stringify(store.importJson(store.reservSomBackup(m.data.get('struktur') as string)))).toBe(JSON.stringify(s));
  });
});
