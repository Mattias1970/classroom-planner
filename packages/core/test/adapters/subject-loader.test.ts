import { describe, expect, it } from 'vitest';
import { loadSubjectLibrary, memoryReader, SubjectLoadError } from '../../src/adapters/subject-loader.js';
import { LessonRecordError } from '../../src/records/lesson-record.js';

const LESSON_1 = {
  id: 1, type: 'regular', avsnitt: '1.1 Negativa tal', del: 1,
  grön: '101–110', blå: '111–120', röd: '—', sidor_teori: 'sid 8–12',
  begrepp: 'negativa tal, tallinjen', soc_start: '—', exit: 'Quiz 1.1a',
  genomgang: 'Vi inleder…', bam_gora: 'Uppg 101–110', bam_lara: 'Talmängder',
  bam_ex: 'sid 10–11', ex: '−5 < −2 < 0', laxa: 'Öva begrepp.',
};

const SUBJECT = {
  meta: { ämne: 'Matematik', årskurs: 8, lärobok: 'Prio 8', klasser: [] },
  schema: {},
  läsår: { startdatum: [2026, 7, 17], lov: [] },
  kapitelMeta: { '1': { name: 'Tal', col: 'c1', lektioner: 1, veckor: '1', term: 'HT', sidor_samm: '-', prov: '-' } },
};

function files(extra: Record<string, string> = {}) {
  return {
    'subjects/matematik-8/subject.json': JSON.stringify(SUBJECT),
    'subjects/matematik-8/overrides.json': '[]',
    'subjects/matematik-8/begrepp/per-delkapitel.json': JSON.stringify({ '1.1': ['negativa tal'] }),
    'subjects/matematik-8/begrepp/definitioner.json': JSON.stringify({ 'negativa tal': 'Tal < 0' }),
    'subjects/matematik-8/kapitel/1/lektioner/1.json': JSON.stringify(LESSON_1),
    ...extra,
  };
}

describe('loadSubjectLibrary', () => {
  it('läser hela strukturen enligt dataspecen', async () => {
    const lib = await loadSubjectLibrary(memoryReader(files()), 'matematik-8');
    expect(lib.subject.meta.ämne).toBe('Matematik');
    expect(lib.kapitel.get(1)?.lektioner[0]?.avsnitt).toBe('1.1 Negativa tal');
    expect(lib.begrepp.definitioner['negativa tal']).toBe('Tal < 0');
  });

  it('flip.json är valfri och valideras när den finns', async () => {
    const flip = {
      settings: { socrativeRoom: 'Matte8B', sändDag: 'dag-före', sändTid: '15:00' },
      blocks: [{ typ: 'text', text: 'Läs sid 8–9.' }],
      bamTimeline: [{ label: 'Genomgång', minutes: 15, kind: 'lecture' }],
      concepts: ['negativa tal'],
    };
    const lib = await loadSubjectLibrary(memoryReader(files({
      'subjects/matematik-8/kapitel/1/lektioner/1.flip.json': JSON.stringify(flip),
    })), 'matematik-8');
    expect(lib.kapitel.get(1)?.flip.get(1)?.blocks).toHaveLength(1);
  });

  it('avvisar exitTicket utan url (dataspecens hårda regel)', async () => {
    const bad = {
      settings: { socrativeRoom: 'x', sändDag: 'dag-före', sändTid: '15:00' },
      blocks: [], exitTicket: { titel: 'Exit', url: '' },
    };
    await expect(loadSubjectLibrary(memoryReader(files({
      'subjects/matematik-8/kapitel/1/lektioner/1.flip.json': JSON.stringify(bad),
    })), 'matematik-8')).rejects.toThrow(LessonRecordError);
  });

  it('avvisar id som inte matchar filnamnet', async () => {
    await expect(loadSubjectLibrary(memoryReader(files({
      'subjects/matematik-8/kapitel/1/lektioner/2.json': JSON.stringify(LESSON_1),
    })), 'matematik-8')).rejects.toThrow(LessonRecordError);
  });

  it('overrides appliceras på lektionsfält', async () => {
    const lib = await loadSubjectLibrary(memoryReader(files({
      'subjects/matematik-8/overrides.json': JSON.stringify([
        { kapitel: 1, lektionId: 1, field: 'laxa', value: 'Ny läxa!', updatedAt: '2026-07-20T10:00:00Z' },
      ]),
    })), 'matematik-8');
    expect(lib.kapitel.get(1)?.lektioner[0]?.laxa).toBe('Ny läxa!');
  });

  it('saknad subject.json ger SubjectLoadError', async () => {
    await expect(loadSubjectLibrary(memoryReader({}), 'x')).rejects.toThrow(SubjectLoadError);
  });
});

describe('bokindelning (books/<bookId>/)', () => {
  const BOOK = {
    id: 'prio-matematik-8', titel: 'Prio Matematik 8', förlag: 'Sanoma',
    ämne: 'Matematik', årskurs: 8,
    kapitelMeta: { '1': { name: 'Tal', col: 'c1', lektioner: 1, veckor: '1', term: 'HT', sidor_samm: '-', prov: '-' } },
  };
  const SUBJECT_V2 = { ...SUBJECT, bookId: 'prio-matematik-8', kapitelMeta: {} };
  const bookFiles = {
    'subjects/matematik-8/subject.json': JSON.stringify(SUBJECT_V2),
    'subjects/matematik-8/overrides.json': '[]',
    'books/prio-matematik-8/book.json': JSON.stringify(BOOK),
    'books/prio-matematik-8/begrepp/per-delkapitel.json': JSON.stringify({ '1.1': ['negativa tal'] }),
    'books/prio-matematik-8/begrepp/definitioner.json': JSON.stringify({ 'negativa tal': 'Tal < 0' }),
    'books/prio-matematik-8/kapitel/1/lektioner/1.json': JSON.stringify(LESSON_1),
  };

  it('läser bokens innehåll via bookId, planeringen äger schema/overrides', async () => {
    const lib = await loadSubjectLibrary(memoryReader(bookFiles), 'matematik-8');
    expect(lib.book?.titel).toBe('Prio Matematik 8');
    expect(lib.subject.kapitelMeta['1']?.name).toBe('Tal');
    expect(lib.kapitel.get(1)?.lektioner[0]?.avsnitt).toBe('1.1 Negativa tal');
    expect(lib.begrepp.definitioner['negativa tal']).toBe('Tal < 0');
  });

  it('overrides ur planeringen appliceras på bokens lektioner', async () => {
    const lib = await loadSubjectLibrary(memoryReader({
      ...bookFiles,
      'subjects/matematik-8/overrides.json': JSON.stringify([
        { kapitel: 1, lektionId: 1, field: 'laxa', value: 'Egen läxa', updatedAt: '2026-08-10T10:00:00Z' },
      ]),
    }), 'matematik-8');
    expect(lib.kapitel.get(1)?.lektioner[0]?.laxa).toBe('Egen läxa');
  });

  it('saknad book.json ger tydligt fel', async () => {
    const files = { ...bookFiles };
    delete (files as Record<string, string>)['books/prio-matematik-8/book.json'];
    await expect(loadSubjectLibrary(memoryReader(files), 'matematik-8')).rejects.toThrow(/book\.json saknas/);
  });

  it('gammal layout utan bookId fungerar oförändrat', async () => {
    const lib = await loadSubjectLibrary(memoryReader(files()), 'matematik-8');
    expect(lib.book).toBeUndefined();
    expect(lib.kapitel.get(1)?.lektioner).toHaveLength(1);
  });
});
