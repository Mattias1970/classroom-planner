import { describe, it, expect } from 'vitest';
import {
  BLAD, LAYOUT_FALT, LINJE_FARGER, LJUSA_FARGER, arLinje, rektanglarKorsar, bandHojd, defaultUtskriftslayout, fyllSidled, layoutFaltVarde,
  normaliseraRuta, nyBoxId, snapBox,
} from '../src/domain/utskriftslayout.js';
import type { LessonRecord } from '../src/records/lesson-record.js';

const lektion: LessonRecord = {
  id: 3, type: 'regular', avsnitt: '1.2 Negativa tal', del: 1,
  grön: '1–6', blå: '7–12', röd: '13–15', sidor_teori: 's. 14–17', begrepp: 'negativa tal',
  soc_start: 'Kap 1.1 Exit grön', exit: 'Kap 1.2 Exit grön', genomgang: 'Tallinjen',
  bam_gora: '—', bam_lara: '—', bam_ex: '—', ex: '—', laxa: 'Begreppen 1.2',
};

describe('normaliseraRuta — gummiband åt alla håll', () => {
  it('drag uppåt-vänster normaliseras och minsta storlek gäller', () => {
    expect(normaliseraRuta(100, 80, 60, 50)).toEqual({ xMm: 60, yMm: 50, wMm: 40, hMm: 30 });
    const liten = normaliseraRuta(20, 20, 21, 21);
    expect(liten.wMm).toBe(6); expect(liten.hMm).toBe(6);
  });
  it('kläms innanför bladet', () => {
    const r = normaliseraRuta(200, 290, 260, 320);
    expect(r.xMm + r.wMm).toBeLessThanOrEqual(BLAD.breddMm);
    expect(r.yMm + r.hMm).toBeLessThanOrEqual(BLAD.hojdMm);
  });
});

describe('snapBox — ovankant, underkant, centrallinje, fyll sidled', () => {
  const annan = { yMm: 40, hMm: 20 }; // topp 40, botten 60, mitt 50
  it('flytt snappar till samma ovankant', () => {
    const r = snapBox({ xMm: 30, yMm: 41.5, wMm: 50, hMm: 10 }, [annan], 'flytt');
    expect(r.yMm).toBe(40);
    expect(r.guides[0]?.typ).toBe('topp');
  });
  it('flytt snappar till samma underkant', () => {
    const r = snapBox({ xMm: 30, yMm: 48.5, wMm: 50, hMm: 10 }, [annan], 'flytt');
    expect(r.yMm + r.hMm).toBe(60);
    expect(r.guides[0]?.typ).toBe('botten');
  });
  it('flytt snappar till samma centrallinje', () => {
    const r = snapBox({ xMm: 30, yMm: 46.2, wMm: 50, hMm: 10 }, [annan], 'flytt');
    expect(r.yMm + r.hMm / 2).toBe(50);
    expect(r.guides[0]?.typ).toBe('mitt');
  });
  it('storleksändring snappar underkanten', () => {
    const r = snapBox({ xMm: 30, yMm: 30, wMm: 50, hMm: 10.8 }, [annan], 'storlek');
    expect(r.yMm + r.hMm).toBe(40);
  });
  it('fyller bladet i sidled när båda kanterna är nära marginalerna', () => {
    const r = snapBox({ xMm: BLAD.marginalMm + 2, yMm: 10, wMm: BLAD.breddMm - 2 * BLAD.marginalMm - 5, hMm: 10 }, [], 'flytt');
    expect(r.xMm).toBe(BLAD.marginalMm);
    expect(r.wMm).toBe(BLAD.breddMm - 2 * BLAD.marginalMm);
    expect(r.guides.some((g) => g.typ === 'bredd')).toBe(true);
  });
  it('utan närhet: ingen snap', () => {
    const r = snapBox({ xMm: 30, yMm: 100, wMm: 50, hMm: 10 }, [annan], 'flytt');
    expect(r.yMm).toBe(100);
    expect(r.guides).toEqual([]);
  });
});

describe('fyllSidled + bandHojd + nyBoxId', () => {
  it('fyllSidled sätter marginal-till-marginal', () => {
    const b = fyllSidled({ id: 'x', falt: 'laxa', xMm: 40, yMm: 5, wMm: 30, hMm: 8, fontPt: 10, align: 'left', visaEtikett: false });
    expect(b.xMm).toBe(BLAD.marginalMm);
    expect(b.wMm).toBe(BLAD.breddMm - 2 * BLAD.marginalMm);
  });
  it('bandHojd = nedersta underkant + luft; tom layout = 0', () => {
    expect(bandHojd(defaultUtskriftslayout())).toBe(49 + 4);
    expect(bandHojd({ boxar: [] })).toBe(0);
  });
  it('nyBoxId tar nästa lediga', () => {
    expect(nyBoxId(['box-1', 'box-2'])).toBe('box-3');
  });
});

describe('layoutFaltVarde', () => {
  it('lektionsfält, beräknade fält och typetikett', () => {
    expect(layoutFaltVarde('avsnitt', lektion)).toBe('1.2 Negativa tal');
    expect(layoutFaltVarde('grön', lektion)).toBe('1–6');
    expect(layoutFaltVarde('typ', lektion)).toBe('Lektion');
    expect(layoutFaltVarde('del', lektion)).toBe('Del 1');
    expect(layoutFaltVarde('lektionsnr', lektion, { lektionsNr: 3 })).toBe('L3');
    expect(layoutFaltVarde('datum', lektion, { datum: '2026-08-20' })).toBe('2026-08-20');
    expect(layoutFaltVarde('tid', lektion, { tid: '08:10–09:10' })).toBe('08:10–09:10');
  });
});

describe('Arbete-fältet + färgplattor + markeringskorsning (del 21)', () => {
  it('arbete sammansätter Grön/Blå/Röd och hoppar tomma', () => {
    expect(layoutFaltVarde('arbete', lektion)).toBe('Grön: 1–6  ·  Blå: 7–12  ·  Röd: 13–15');
    expect(layoutFaltVarde('arbete', { ...lektion, röd: '—' })).toBe('Grön: 1–6  ·  Blå: 7–12');
    expect(layoutFaltVarde('arbete', { ...lektion, grön: '—', blå: '—', röd: '—' })).toBe('');
  });
  it('Arbete finns i fältkatalogen och LJUSA_FARGER har Ingen först', () => {
    expect(LAYOUT_FALT.some((f) => f.id === 'arbete' && f.etikett === 'Arbete')).toBe(true);
    expect(LJUSA_FARGER[0]).toEqual({ namn: 'Ingen', hex: '' });
  });
  it('rektanglarKorsar: överlapp, kant-i-kant och separata', () => {
    const a = { xMm: 10, yMm: 10, wMm: 20, hMm: 10 };
    expect(rektanglarKorsar(a, { xMm: 25, yMm: 15, wMm: 20, hMm: 10 })).toBe(true);
    expect(rektanglarKorsar(a, { xMm: 30, yMm: 10, wMm: 5, hMm: 5 })).toBe(false); // kant-i-kant räknas inte
    expect(rektanglarKorsar(a, { xMm: 0, yMm: 40, wMm: 5, hMm: 5 })).toBe(false);
  });
});

describe('Fristående linjer (del 22)', () => {
  it('linje finns i katalogen, saknar innehåll och känns igen', () => {
    expect(LAYOUT_FALT.some((f) => f.id === 'linje' && f.etikett === 'Linje')).toBe(true);
    expect(layoutFaltVarde('linje', lektion)).toBe('');
    expect(arLinje({ falt: 'linje' })).toBe(true);
    expect(arLinje({ falt: 'laxa' })).toBe(false);
  });
  it('LINJE_FARGER har svart först och giltiga hexfärger', () => {
    expect(LINJE_FARGER[0]?.namn).toBe('Svart');
    for (const f of LINJE_FARGER) expect(f.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});
