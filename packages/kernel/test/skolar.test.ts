import { describe, expect, it } from 'vitest';
import {
  helgdagar, isoVecka, kalendariumFromIcs, ledigEtikett, parseKalendarium, passSparr,
} from '../src/domain/skolar.js';
import type { Skolar } from '../src/domain/typer.js';

const skolar = (dagar: Skolar['dagar'] = []): Skolar => ({
  id: 'la-1', namn: 'Läsåret 2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar,
});

describe('helgdagar', () => {
  it('innehåller fasta och rörliga röda dagar', () => {
    const h = helgdagar(2027);
    expect(h.get('2027-01-01')).toBe('Nyårsdagen');
    expect(h.get('2027-01-06')).toBe('Trettondedag jul');
    expect(h.get('2027-03-26')).toBe('Långfredagen');   // påsk 28 mars 2027
    expect(h.get('2027-03-29')).toBe('Annandag påsk');
    expect(h.get('2027-05-06')).toBe('Kristi himmelsfärdsdag');
    expect(h.get('2027-06-25')).toBe('Midsommarafton');
  });
});

describe('parseKalendarium', () => {
  it('läser enskilda dagar, lovintervall, halvdagar och idrottsdagar', () => {
    const dagar = parseKalendarium([
      '# Kalendarium 2026/27',
      '2026-09-15 Temadag',
      '2026-10-26--2026-10-30 Höstlov',
      '2026-12-18 halvdag 12:00 Julavslutning',
      '2027-02-05 Idrottsdag',
    ].join('\n'));
    expect(dagar).toHaveLength(1 + 5 + 1 + 1);
    expect(dagar[0]).toEqual({ datum: '2026-09-15', typ: 'heldag', label: 'Temadag' });
    expect(dagar.filter((d) => d.label === 'Höstlov').map((d) => d.datum)).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
    ]);
    expect(dagar.find((d) => d.datum === '2026-10-26')?.typ).toBe('lov');
    expect(dagar.find((d) => d.datum === '2026-12-18')).toMatchObject({ typ: 'halvdag', slut: '12:00', label: 'Julavslutning' });
    expect(dagar.find((d) => d.datum === '2027-02-05')?.label).toBe('Idrottsdag');
  });
  it('kastar svenskt fel utan giltiga rader', () => {
    expect(() => parseKalendarium('hej')).toThrow(/Inga giltiga rader/);
  });
});

describe('kalendariumFromIcs', () => {
  it('läser heldagshändelser inkl. flerdagars lov (DTEND exklusiv)', () => {
    const ics = [
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261026', 'DTEND;VALUE=DATE:20261031', 'SUMMARY:Höstlov', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260915', 'SUMMARY:Temadag', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20260916T090000', 'DTEND:20260916T100000', 'SUMMARY:Lektion', 'END:VEVENT',
    ].join('\r\n');
    const dagar = kalendariumFromIcs(ics);
    expect(dagar.filter((d) => d.label === 'Höstlov')).toHaveLength(5);
    expect(dagar.find((d) => d.label === 'Höstlov')?.typ).toBe('lov');
    expect(dagar.find((d) => d.datum === '2026-09-15')?.typ).toBe('heldag');
  });
});

describe('ledigEtikett + passSparr', () => {
  const la = skolar([
    { datum: '2026-09-15', typ: 'heldag', label: 'Temadag' },
    { datum: '2026-10-02', typ: 'halvdag', slut: '11:30', label: 'Öppet hus' },
    { datum: '2026-10-26', typ: 'lov', label: 'Höstlov' },
  ]);
  it('röda dagar, lov och heldagar ger etikett; halvdag spärrar från sluttiden', () => {
    expect(ledigEtikett('2027-01-06', la)).toBe('Trettondedag jul');
    expect(ledigEtikett('2026-10-26', la)).toBe('Höstlov');
    expect(ledigEtikett('2026-09-15', la)).toBe('Temadag');
    expect(ledigEtikett('2026-10-02', la)).toBeNull(); // halvdag är inte helt ledig
    expect(passSparr('2026-10-02', '09:00', la)).toBeNull();
    expect(passSparr('2026-10-02', '11:30', la)).toBe('Öppet hus (halvdag 11:30)');
    expect(passSparr('2026-09-15', '08:00', la)).toBe('Temadag');
    expect(passSparr('2026-09-16', '08:00', la)).toBeNull();
  });
});

describe('isoVecka', () => {
  it('beräknar ISO-vecka', () => {
    expect(isoVecka('2026-08-17')).toBe(34);
    expect(isoVecka('2027-01-04')).toBe(1);
  });
});
