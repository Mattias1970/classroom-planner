import { describe, expect, it } from 'vitest';
import { parseIcsEvents, suggestSchedulePasses } from '../src/index.js';

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Stockholm:20260817T090000',
  'DTEND;TZID=Europe/Stockholm:20260817T100000',
  'SUMMARY:Ma 8B',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260818T060000Z', // 08:00 svensk sommartid
  'DTEND:20260818T065000Z',
  'SUMMARY:Ma 8B lekt', // radvikning nedan
  ' ion 2',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260819', // heldag — ska hoppas över
  'DTEND;VALUE=DATE:20260820',
  'SUMMARY:Studiedag',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Stockholm:20260822T100000', // lördag — filtreras i förslag
  'DTEND;TZID=Europe/Stockholm:20260822T110000',
  'SUMMARY:Ma stöd',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Stockholm:20260824T090000', // samma pass som v.34 mån — dedupe
  'DTEND;TZID=Europe/Stockholm:20260824T100000',
  'SUMMARY:Ma 8B',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Stockholm:20260819T130000',
  'DTEND;TZID=Europe/Stockholm:20260819T135500',
  'SUMMARY:NO 8B', // ska filtreras bort med titelfilter "ma"
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcsEvents (P2: iCal-import)', () => {
  it('parsar TZID-tider, UTC-tider och radvikning; hoppar heldag', () => {
    const ev = parseIcsEvents(ICS);
    expect(ev).toHaveLength(5); // heldagen borta
    expect(ev[0]).toMatchObject({ weekday: 1, start: '09:00', end: '10:00', summary: 'Ma 8B' });
    expect(ev[1]).toMatchObject({ weekday: 2, start: '08:00', end: '08:50', summary: 'Ma 8B lektion 2' });
    expect(ev[2].weekday).toBe(6); // lördagen finns bland händelser
  });
  it('tål trasig indata utan att kasta', () => {
    expect(parseIcsEvents('hej hopp')).toEqual([]);
    expect(parseIcsEvents('BEGIN:VEVENT\nDTSTART:banan\nEND:VEVENT')).toEqual([]);
  });
});

describe('suggestSchedulePasses', () => {
  it('unika mån–fre-pass i veckodagsordning, dedupe över veckor', () => {
    const passes = suggestSchedulePasses(parseIcsEvents(ICS));
    expect(passes).toEqual([
      { day: 1, start: '09:00', end: '10:00' },
      { day: 2, start: '08:00', end: '08:50' },
      { day: 3, start: '13:00', end: '13:55' },
    ]);
  });
  it('titelfilter matchar skiftlägesokänsligt', () => {
    const passes = suggestSchedulePasses(parseIcsEvents(ICS), 'ma 8b');
    expect(passes).toEqual([
      { day: 1, start: '09:00', end: '10:00' },
      { day: 2, start: '08:00', end: '08:50' },
    ]);
  });
});
