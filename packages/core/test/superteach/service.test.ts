import { describe, expect, it } from 'vitest';
import {
  MemoryEvidenceStore,
  SuperTeachParseError,
  SuperTeachService,
  parseEvidenceFile,
  serializeEvidence,
} from '../../src/features/superteach/service.js';
import type { SuperTeachEvidence } from '../../src/features/superteach/types.js';

const CLOCK = () => new Date('2026-07-19T12:00:00Z');

function ev(id: string, extra: Partial<SuperTeachEvidence> = {}): SuperTeachEvidence {
  return {
    id,
    studentKey: 'elev-1',
    subject: 'matematik',
    source: 'manual',
    dimensions: [{ dimension: 'begrepp', status: 'secure', confidence: 'high', evidenceText: 't' }],
    aiAssisted: false,
    teacherReviewed: true,
    collectedAt: '2026-07-10T08:00:00Z',
    ...extra,
  };
}

function makeService() {
  return new SuperTeachService(new MemoryEvidenceStore(), undefined, CLOCK);
}

describe('SuperTeachService', () => {
  it('record är idempotent på id', async () => {
    const s = makeService();
    await s.record(ev('a'));
    await s.record(ev('a', { subject: 'fysik' }));
    const list = await s.listForStudent('elev-1');
    expect(list).toHaveLength(1);
    expect(list[0]?.subject).toBe('fysik');
  });

  it('approve sätter granskning och tidsstämpel', async () => {
    const s = makeService();
    await s.record(ev('a', { aiAssisted: true, teacherReviewed: false }));
    expect(await s.pendingReviewCount()).toBe(1);
    expect(await s.approve('a')).toBe(true);
    expect(await s.pendingReviewCount()).toBe(0);
    const [item] = await s.listForStudent('elev-1');
    expect(item?.teacherApprovedAt).toBe(CLOCK().toISOString());
    expect(await s.approve('finns-inte')).toBe(false);
  });

  it('remove tar bort och rapporterar om inget fanns', async () => {
    const s = makeService();
    await s.record(ev('a'));
    expect(await s.remove('a')).toBe(true);
    expect(await s.remove('a')).toBe(false);
  });

  it('summarize använder lagrad evidens', async () => {
    const s = makeService();
    await s.record(ev('a'));
    const summary = await s.summarize('elev-1', 'matematik');
    expect(summary.dimensions[0]?.dimension).toBe('begrepp');
    expect(summary.dimensions[0]?.status).toBe('secure');
  });

  it('export/import går runt och slår ihop på id', async () => {
    const a = makeService();
    await a.record(ev('a'));
    await a.record(ev('b'));
    const json = await a.exportJson();

    const b = makeService();
    await b.record(ev('b', { subject: 'kemi' }));
    const imported = await b.importJson(json);
    expect(imported).toBe(2);
    const list = await b.listForStudent('elev-1');
    expect(list).toHaveLength(2);
    // importen vinner vid id-krock
    expect(list.find((e) => e.id === 'b')?.subject).toBe('matematik');
  });
});

describe('serialisering', () => {
  it('avvisar fel schema och trasig JSON', () => {
    expect(() => parseEvidenceFile('inte json')).toThrow(SuperTeachParseError);
    expect(() => parseEvidenceFile('{"schema":"nåt-annat"}')).toThrow(SuperTeachParseError);
    expect(() => parseEvidenceFile(JSON.stringify({ schema: 'superteach-evidence', version: 1, evidence: [{ id: 'x' }] }))).toThrow(SuperTeachParseError);
  });
  it('round-trip bevarar data', () => {
    const original = [ev('a')];
    expect(parseEvidenceFile(serializeEvidence(original))).toEqual(original);
  });
});
