import { describe, it, expect } from 'vitest';
import {
  amnesSummering, byggExternaPoster, fargForAmne, planeringFromSetup, planeringsId, unikaAmnen,
} from '../src/domain/lokal-planering.js';
import type { SetupState } from '../src/domain/setup.js';
import type { SubjectFile } from '../src/records/lesson-record.js';

const setup: SetupState = {
  lasar: '2026/2027',
  klass: '8F',
  amne: 'Kemi',
  amnesschema: [
    { veckodag: 2, start: '10:00', slut: '11:00' },
    { veckodag: 4, start: '13:00', slut: '14:00' },
  ],
  bok: { titel: 'Spektrum Kemi' },
};

const lasar: SubjectFile['läsår'] = {
  startdatum: [2026, 7, 17], // 17 aug 2026 (månad 0-indexerad)
  lov: [{ start: [2026, 9, 26], end: [2026, 9, 30], label: 'Höstlov v.44' }],
};

describe('planeringFromSetup', () => {
  it('bygger planering med stabilt id och ämnesfärg', () => {
    const p = planeringFromSetup(setup);
    expect(p.id).toBe('kemi-8f');
    expect(p.klassNamn).toBe('8F');
    expect(p.amne).toBe('Kemi');
    expect(p.bokTitel).toBe('Spektrum Kemi');
    expect(p.farg).toBe(fargForAmne('Kemi'));
    expect(p.schema.length).toBe(2);
  });

  it('planeringsId hanterar svenska tecken', () => {
    expect(planeringsId('Hemkunskap på riktigt', '8Å')).toBe('hemkunskap-pa-riktigt-8a');
  });
});

describe('byggExternaPoster — via befintliga schemamotorn', () => {
  const poster = byggExternaPoster(planeringFromSetup(setup), lasar);

  it('genererar pass endast på schemats veckodagar med rätt tider', () => {
    expect(poster.length).toBeGreaterThan(50);
    for (const post of poster.slice(0, 20)) {
      expect([2, 4]).toContain(post.weekday);
      expect(post.start).toBe(post.weekday === 2 ? '10:00' : '13:00');
    }
  });

  it('respekterar lov (inga pass under höstlovet)', () => {
    const iLov = poster.filter((p) => p.date >= '2026-10-26' && p.date <= '2026-10-30');
    expect(iLov).toEqual([]);
  });

  it('första passet ligger på/efter läsårsstart', () => {
    expect(poster[0]?.date >= '2026-08-17').toBe(true);
  });

  it('bär planeringens identitet på varje post', () => {
    expect(poster[0]?.amne).toBe('Kemi');
    expect(poster[0]?.klassNamn).toBe('8F');
    expect(poster[0]?.planeringId).toBe('kemi-8f');
  });

  it('tomt schema ger inga poster', () => {
    expect(byggExternaPoster({ ...planeringFromSetup(setup), schema: [] }, lasar)).toEqual([]);
  });
});

describe('fargForAmne', () => {
  it('standardämnen har fasta färger, okända en stabil färg', () => {
    expect(fargForAmne('Matematik')).toBe('#1d4ed8');
    expect(fargForAmne('Spanska')).toBe(fargForAmne('Spanska'));
    expect(fargForAmne('Spanska')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('unikaAmnen', () => {
  it('standardordning först, övriga alfabetiskt, dubbletter bort', () => {
    expect(unikaAmnen(['Kemi', 'Spanska', 'Matematik', 'Kemi', 'Bild'])).toEqual([
      'Matematik', 'Kemi', 'Bild', 'Spanska',
    ]);
  });
});

describe('amnesSummering — ämnesstyrd topbar (del 16)', () => {
  const pl = planeringFromSetup(setup); // Kemi 8F, 2 pass/vecka
  const bok = {
    bok: { id: 'kemi', titel: 'Spektrum Kemi', förlag: 'Liber', ämne: 'Kemi', årskurs: 8,
      kapitelMeta: { '1': { name: 'Atomer', col: '#111', lektioner: 2, veckor: '', term: '', sidor_samm: '', prov: '' },
                     '2': { name: 'Reaktioner', col: '#222', lektioner: 1, veckor: '', term: '', sidor_samm: '', prov: '' } } },
    lektioner: { 1: [
      { id: 1, type: 'regular' as const, avsnitt: '1.1', del: 1, grön: '—', blå: '—', röd: '—', sidor_teori: '—', begrepp: '—', soc_start: '—', exit: '—', genomgang: '—', bam_gora: '—', bam_lara: '—', bam_ex: '—', ex: '—', laxa: '—' },
      { id: 2, type: 'regular' as const, avsnitt: '1.1', del: 2, grön: '—', blå: '—', röd: '—', sidor_teori: '—', begrepp: '—', soc_start: '—', exit: '—', genomgang: '—', bam_gora: '—', bam_lara: '—', bam_ex: '—', ex: '—', laxa: '—' },
    ] },
  };

  it('med bok i biblioteket: lektioner och kapitel ur boken, unika per titel', () => {
    const st = amnesSummering([pl, { ...pl, id: 'kemi-8b', klassNamn: '8B' }], [bok], lasar);
    expect(st.lektioner).toBe(2);   // samma bok räknas en gång
    expect(st.kapitel).toBe(2);
    expect(st.harBok).toBe(true);
    expect(st.passPerVecka).toBe(2);
    expect(st.bokTitlar).toEqual(['Spektrum Kemi']);
  });

  it('utan bok: lektioner = schemalagda pass under läsåret', () => {
    const st = amnesSummering([pl], [], lasar);
    expect(st.harBok).toBe(false);
    expect(st.lektioner).toBeGreaterThan(50);
    expect(st.kapitel).toBe(0);
  });
});
