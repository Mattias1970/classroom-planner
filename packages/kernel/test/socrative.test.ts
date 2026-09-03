import { describe, expect, it } from 'vitest';
import {
  klassificeraSocrativeAktivitet, svenskTid, tolkaSocrativeFilnamn, tolkaSocrativeRapport,
} from '../src/domain/socrative.js';
import type { PlaneradLektion } from '../src/domain/typer.js';

// Fejkade elevnamn — verkliga elevuppgifter hör inte hemma i kodrepot.
const RAPPORT: Array<Array<string | number | null>> = [
  ['Biologi 4.1 Begrepp'],
  ['21 August 2026 08:20'],
  ['BIOLOGI8BB'],
  [],
  [],
  ['Presence', 'Student Name', 'Student ID', 'Score (%)', 'Score (#)', 'Vetenskapen om…', 'Ett avgränsat…'],
  [null, null, null, null, 12, '1 point', '1 point'],
  ['No', 'Testsson, Ted', 'TED', '-', '-', '', ''],
  ['Yes', 'Provlund, Pia', 'PIA', '100', 12, 'A. • ekologi', 'B. • ekosystem'],
  ['Yes', 'Övnegård, Öjvind', 'ÖJVIND', '66.67', 8, 'A. • ekologi', 'E. • population'],
];

describe('tolkaSocrativeRapport', () => {
  it('läser quiz, rum, maxpoäng och elevrader; frånvarande får deltog=false', () => {
    const r = tolkaSocrativeRapport(RAPPORT);
    expect(r.quiz).toBe('Biologi 4.1 Begrepp');
    expect(r.rum).toBe('BIOLOGI8BB');
    expect(r.maxPoang).toBe(12);
    expect(r.rader).toHaveLength(3);
    expect(r.rader[0]).toMatchObject({ namn: 'Testsson, Ted', deltog: false, poang: 0, maxPoang: 12 });
    expect(r.rader[1]).toMatchObject({ namn: 'Provlund, Pia', sidId: 'PIA', deltog: true, poang: 12 });
    expect(r.rader[2].poang).toBe(8);
  });

  it('kastar svenska fel för icke-rapporter', () => {
    expect(() => tolkaSocrativeRapport([[]])).toThrow('quiznamn');
    expect(() => tolkaSocrativeRapport([['Quiz'], [], []])).toThrow("'Student Name'");
  });
});

describe('tolkaSocrativeFilnamn + svenskTid', () => {
  it('läser UTC-starten ur filnamnet och räknar om till svensk tid (sommartid +2)', () => {
    const f = tolkaSocrativeFilnamn('Class_2026_08_20__08_49_QZ_Biologi_4_1_Begrepp.xlsx');
    expect(f).toEqual({ startUtc: '2026-08-20T08:49:00Z', quiz: 'Biologi 4 1 Begrepp' });
    expect(svenskTid(f!.startUtc)).toEqual({ datum: '2026-08-20', tid: '10:49' });
    expect(tolkaSocrativeFilnamn('annat.xlsx')).toBeNull();
  });

  it('vintertid ger +1', () => {
    expect(svenskTid('2026-12-01T08:00:00Z').tid).toBe('09:00');
  });
});

describe('klassificeraSocrativeAktivitet — läxförhör vid start, exit nära slut', () => {
  const lekt = (avsnitt: string): PlaneradLektion['lektion'] =>
    ({ id: 1, typ: 'regular', avsnitt, del: 1, niva1: '—', niva2: '—', niva3: '—',
       sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—' });
  const plan: PlaneradLektion[] = [
    { kapitel: 4, lektion: lekt('4.1 Liv i samspel'), datum: '2026-08-20', vecka: 34, start: '09:45', slutTid: '10:55' },
    { kapitel: 4, lektion: lekt('4.2 Energi och materia'), datum: '2026-08-21', vecka: 34, start: '08:25', slutTid: '09:35' },
  ];

  it('6 min före lektionsslut → exit ticket på rätt lektion', () => {
    const k = klassificeraSocrativeAktivitet('2026-08-20T08:49:00Z', plan);   // 10:49 sv
    expect(k).toMatchObject({ datum: '2026-08-20', tid: '10:49', lektionsIndex: 0, kalla: 'socrative-exit' });
    expect(k.beskrivning).toContain('6 min före lektionsslut');
  });

  it('3 min före lektionsstart → läxförhör', () => {
    const k = klassificeraSocrativeAktivitet('2026-08-21T06:22:00Z', plan);   // 08:22 sv
    expect(k).toMatchObject({ lektionsIndex: 1, kalla: 'socrative-laxforhor', avsnitt: '4.2 Energi och materia' });
    expect(k.beskrivning).toContain('före lektionsstart');
  });

  it('mitt i natten → utanför lektionstid, ingen källa gissas', () => {
    const k = klassificeraSocrativeAktivitet('2026-08-23T23:05:00Z', plan);   // må 01:05 sv
    expect(k.kalla).toBeNull();
    expect(k.lektionsIndex).toBeNull();
    expect(k.beskrivning).toContain('utanför lektionstid');
  });
});

describe('Del 61: klassificering via rumsnamn (planens socStart/exit är Socrative-rum)', async () => {
  const { klassificeraViaRum, klassificeraSocrativeFil } = await import('../src/domain/socrative.js');
  const lekt = (avsnitt: string, socStart: string, exit: string): PlaneradLektion['lektion'] =>
    ({ id: 1, typ: 'regular', avsnitt, del: 1, niva1: '—', niva2: '—', niva3: '—',
       sidorTeori: '—', begrepp: '—', genomgang: '—', laxa: '—', ex: '—', socStart, exit });
  const plan: PlaneradLektion[] = [
    { kapitel: 4, lektion: lekt('4.1 Liv i samspel', '—', 'Biologi41'), datum: '2026-08-20', vecka: 34, start: '09:45', slutTid: '10:55' },
    { kapitel: 4, lektion: lekt('4.2 Energi och materia', 'Biologi41', 'Biologi42'), datum: '2026-08-21', vecka: 34, start: '08:25', slutTid: '09:35' },
    { kapitel: 4, lektion: lekt('4.3 Olika känsliga system', 'Biologi412', 'Biologi43'), datum: '2026-08-24', vecka: 35, start: '08:25', slutTid: '09:35' },
    { kapitel: 4, lektion: lekt('Repetition', 'Biologi41', '—'), datum: '2026-09-07', vecka: 37, start: '08:25', slutTid: '09:35' },
  ];

  it('rum som står som exit → exit ticket, oavsett quiznamn och tid', () => {
    const k = klassificeraViaRum('Biologi41', '2026-08-20T08:49:00Z', plan)!;
    expect(k).toMatchObject({ kalla: 'socrative-exit', datum: '2026-08-20', lektionsIndex: 0, avsnitt: '4.1 Liv i samspel' });
    expect(k.beskrivning).toBe('exit ticket via rum Biologi41');
  });

  it('samma rum som läxförhör dagen efter → läxförhör; nattkört quiz knyts till närmaste lektion', () => {
    expect(klassificeraViaRum('biologi 41', '2026-08-21T06:27:00Z', plan)).toMatchObject({ kalla: 'socrative-laxforhor', datum: '2026-08-21' });
    // Kört 2026-08-24 01:05 svensk tid (23:05 UTC den 23:e): närmast är läxförhöret 21/8 (3 dagar) framför 7/9
    const natt = klassificeraViaRum('Biologi41', '2026-08-23T23:05:00Z', plan)!;
    expect(natt).toMatchObject({ kalla: 'socrative-laxforhor', datum: '2026-08-21', tid: '01:05' });
    expect(natt.beskrivning).toContain('körd 2026-08-24, lektion 2026-08-21');
  });

  it('vid lika avstånd vinner lektionen före filens datum; okänt rum → null och tidsfallback', () => {
    expect(klassificeraViaRum('Biologi412', '2026-08-24T06:30:00Z', plan)).toMatchObject({ kalla: 'socrative-laxforhor', datum: '2026-08-24' });
    expect(klassificeraViaRum('Matte8B', '2026-08-20T08:49:00Z', plan)).toBeNull();
    const fb = klassificeraSocrativeFil('Matte8B', '2026-08-20T08:49:00Z', plan);
    expect(fb).toMatchObject({ kalla: 'socrative-exit', datum: '2026-08-20' });
    expect(fb.beskrivning).toContain('min före lektionsslut');
  });
});
