/**
 * Demodata — exakt samma format som classroom-planner-data-repot.
 * Används tills GitHub-källan är ansluten (Bibliotek → Datakällor).
 */
import type { FlipDoc, LessonRecord, SubjectFile } from '@planner/core';

export const DEMO_SUBJECT: SubjectFile = {
  meta: {
    ämne: 'Matematik',
    årskurs: 8,
    lärobok: 'Prio Matematik 8, Sanoma 2:a upplagan',
    klasser: [
      { id: '8B', namn: '8B', läsår: '2026/27', socrative: 'Matte8B', arkiverad: false },
      { id: '8F', namn: '8F', läsår: '2026/27', socrative: 'Matte8F', arkiverad: false },
    ],
  },
  schema: {
    '8B': [
      { day: 1, start: '09:00', end: '10:00' },
      { day: 2, start: '08:00', end: '08:50' },
      { day: 3, start: '12:30', end: '13:25' },
      { day: 5, start: '13:45', end: '14:45' },
    ],
    '8F': [
      { day: 1, start: '11:00', end: '12:00' },
      { day: 2, start: '09:00', end: '09:50' },
      { day: 3, start: '11:00', end: '11:55' },
      { day: 4, start: '10:15', end: '11:10' },
    ],
  },
  läsår: {
    startdatum: [2026, 7, 17],
    lov: [
      { start: [2026, 9, 26], end: [2026, 9, 30], label: 'Höstlov / studiedagar' },
      { start: [2026, 10, 23], end: [2026, 11, 4], label: 'Prao' },
      { start: [2026, 11, 18], end: [2027, 0, 10], label: 'Jullov' },
      { start: [2027, 2, 1], end: [2027, 2, 5], label: 'Sportlov' },
      { start: [2027, 2, 30], end: [2027, 3, 2], label: 'Påsklov' },
      { start: [2027, 4, 7], end: [2027, 4, 7], label: 'Klämdag' },
    ],
  },
  kapitelMeta: {
    '1': { name: 'Tal', col: 'c1', lektioner: 3, veckor: '6,25', term: 'HT', sidor_samm: '54–55', prov: 'Prov i Tal' },
  },
};

export const DEMO_LESSONS: Record<number, LessonRecord[]> = {
  1: [
    {
      id: 1, type: 'regular', avsnitt: '1.1 Negativa tal', del: 1,
      grön: '101–110', blå: '111–120', röd: '—', sidor_teori: 'sid 8–12',
      begrepp: 'negativa tal, tallinjen', soc_start: '—', exit: 'Quiz 1.1a',
      genomgang: 'Vi inleder kapitlet med att titta på talmängder och negativa tal på tallinjen.',
      bam_gora: 'Placera tal på tallinjen. Uppg. 101–110 (grön)',
      bam_lara: 'Talmängder och negativa tal på tallinjen',
      bam_ex: 'Bokens exempel sid 10–11', ex: '−5 < −2 < 0 < 3',
      laxa: 'Öva begrepp negativa tal och tallinjen.',
    },
    {
      id: 2, type: 'regular', avsnitt: '1.1 Negativa tal', del: 2,
      grön: '—', blå: '121–130', röd: '131–138', sidor_teori: 'sid 12–15',
      begrepp: 'differens, motsatta tal', soc_start: 'Quiz 1.1a', exit: 'Quiz 1.1b',
      genomgang: 'Addition och subtraktion med negativa tal. Termometermodellen.',
      bam_gora: 'Uppg. 121–130 (blå), EPA på 128',
      bam_lara: 'Addition och subtraktion med negativa tal',
      bam_ex: 'Exempel på tavlan: (−3) − (−7)', ex: '(−3) − (−7) = 4',
      laxa: 'sid 16–17, uppg. 1121–1128',
    },
    {
      id: 3, type: 'test', avsnitt: 'Läxförhör 1.1', del: 0,
      grön: '—', blå: '—', röd: '—', sidor_teori: '—',
      begrepp: '—', soc_start: 'Läxförhör 1.1', exit: '—',
      genomgang: 'Läxförhör på 1.1 följt av genomgång av lösningar.',
      bam_gora: 'Läxförhör + rättning i par', bam_lara: 'Befästa 1.1',
      bam_ex: '—', ex: '—', laxa: '—',
    },
  ],
};

export const DEMO_FLIP: Record<number, Record<number, FlipDoc>> = {
  1: {
    1: {
      settings: { socrativeRoom: 'Matte8B', sändDag: 'dag-före', sändTid: '15:00' },
      blocks: [
        { typ: 'text', text: 'Läs sid 8–9 i boken innan lektionen. Fundera på: vad kan ett negativt tal betyda i verkligheten?' },
        { typ: 'film', ref: { titel: 'Negativa tal – introduktion', url: 'https://www.youtube.com/watch?v=demo', källa: 'Egen inspelad genomgång' } },
      ],
      bamTimeline: [
        { label: 'Läxförhör', minutes: 10, kind: 'quiz' },
        { label: 'Genomgång', minutes: 15, kind: 'lecture' },
        { label: 'Arbete', minutes: 25, kind: 'work' },
        { label: 'Exit ticket', minutes: 5, kind: 'exit' },
      ],
      concepts: ['negativa tal', 'tallinjen'],
    },
  },
};

export const DEMO_BEGREPP = {
  perDelkapitel: { '1.1': ['negativa tal', 'tallinjen'] } as Record<string, string[]>,
  definitioner: {
    'negativa tal': 'Tal mindre än noll, till vänster om 0 på tallinjen',
    'tallinjen': 'En linje där varje punkt motsvarar ett tal, ordnat från minst till störst',
  } as Record<string, string>,
};
