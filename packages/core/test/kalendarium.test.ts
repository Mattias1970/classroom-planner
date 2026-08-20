import { describe, expect, it } from 'vitest';
import {
  kalendariumFromIcs, kalenderDagFor, normaliseraKalendarium, parseKalendarium, sparrEtikett,
} from '../src/logic/kalendarium.js';
import { generateSlots } from '../src/records/schedule.js';
import type { SubjectFile } from '../src/records/lesson-record.js';

describe('parseKalendarium', () => {
  it('läser heldagar och halvdagar ur text/CSV, sorterat och dedupat', () => {
    const dagar = parseKalendarium([
      '# kommentar',
      '2026-10-02; halvdag 11:30; Öppet hus',
      '2026-09-15  Temadag',
      '20261218 halvdag 12.00 Julavslutning',
      '2026-09-15 Studiedag', // dubblett — sista vinner
      'ogiltig rad utan datum',
    ].join('\n'));
    expect(dagar).toEqual([
      { datum: '2026-09-15', typ: 'heldag', label: 'Studiedag' },
      { datum: '2026-10-02', typ: 'halvdag', slut: '11:30', label: 'Öppet hus' },
      { datum: '2026-12-18', typ: 'halvdag', slut: '12:00', label: 'Julavslutning' },
    ]);
  });
  it('kastar svenskt fel när inget går att tolka', () => {
    expect(() => parseKalendarium('hej\nhopp')).toThrow(/Inga giltiga rader/);
  });
});

describe('kalendariumFromIcs', () => {
  it('läser heldagshändelser inkl. flerdagars (DTEND exklusiv), ignorerar tidsatta', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260915', 'SUMMARY:Temadag', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261026', 'DTEND;VALUE=DATE:20261028', 'SUMMARY:Studiedagar', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20260916T090000', 'DTEND:20260916T100000', 'SUMMARY:Lektion', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(kalendariumFromIcs(ics)).toEqual([
      { datum: '2026-09-15', typ: 'heldag', label: 'Temadag' },
      { datum: '2026-10-26', typ: 'heldag', label: 'Studiedagar' },
      { datum: '2026-10-27', typ: 'heldag', label: 'Studiedagar' },
    ]);
  });
  it('kastar svenskt fel utan heldagshändelser', () => {
    expect(() => kalendariumFromIcs('BEGIN:VEVENT\nDTSTART:20260916T090000\nEND:VEVENT')).toThrow(/heldagshändelser/);
  });
});

describe('sparrEtikett + kalenderDagFor', () => {
  const dagar = normaliseraKalendarium([
    { datum: '2026-09-15', typ: 'heldag', label: 'Temadag' },
    { datum: '2026-10-02', typ: 'halvdag', slut: '11:30', label: 'Öppet hus' },
  ]);
  it('heldag spärrar allt; halvdag spärrar pass som börjar vid/efter sluttiden', () => {
    expect(sparrEtikett('2026-09-15', '08:00', dagar)).toBe('Temadag');
    expect(sparrEtikett('2026-10-02', '09:00', dagar)).toBeNull();
    expect(sparrEtikett('2026-10-02', '11:30', dagar)).toBe('Öppet hus (halvdag 11:30)');
    expect(sparrEtikett('2026-10-02', '13:00', dagar)).toBe('Öppet hus (halvdag 11:30)');
    expect(sparrEtikett('2026-10-05', '08:00', dagar)).toBeNull();
    expect(kalenderDagFor('2026-10-02', dagar)?.typ).toBe('halvdag');
    expect(kalenderDagFor('2026-10-03', dagar)).toBeNull();
  });
});

describe('generateSlots med kalendarium', () => {
  const subject: SubjectFile = {
    meta: { ämne: 'Ma', årskurs: 8, lärobok: 'X', klasser: [{ id: '8B', namn: '8B', läsår: '2026/27', socrative: 'Matte8B', arkiverad: false }] },
    schema: { '8B': [{ day: 2, start: '09:00', end: '10:00' }, { day: 4, start: '13:00', end: '14:00' }] },
    läsår: { startdatum: [2026, 8, 14], lov: [] }, // måndag 14 sep 2026
    kapitelMeta: {},
  };
  it('temadag och halvdag tar bort pass — planeringen förskjuts, inget datum spärras', () => {
    // Utan kalendarium: tis 09:00 och tors 13:00 varje vecka
    const fria = generateSlots(subject, '8B', 4);
    expect(fria.map((s) => `${s.date} ${s.start}`)).toEqual([
      '2026-09-15 09:00', '2026-09-17 13:00', '2026-09-22 09:00', '2026-09-24 13:00',
    ]);
    // Temadag tis 15/9 ⇒ passet bort; halvdag tors 24/9 kl 11:30 ⇒ 13-passet bort.
    const dagar = [
      { datum: '2026-09-15', typ: 'heldag', label: 'Temadag' } as const,
      { datum: '2026-09-24', typ: 'halvdag', slut: '11:30', label: 'Öppet hus' } as const,
    ];
    const slots = generateSlots(subject, '8B', 4, [...dagar]);
    expect(slots.map((s) => `${s.date} ${s.start}`)).toEqual([
      '2026-09-17 13:00', '2026-09-22 09:00', '2026-09-29 09:00', '2026-10-01 13:00',
    ]);
  });
});
