import { describe, expect, it } from 'vitest';
import { FakeAiAdapter, type AiProviderConfig } from '../../src/features/ai/port.js';
import { analyzeToDraft, draftEvidenceFromAi } from '../../src/features/superteach/ai-bridge.js';
import { MemoryEvidenceStore, SuperTeachService } from '../../src/features/superteach/service.js';

const gdprProvider: AiProviderConfig = {
  id: 'gdpr', provider: 'anthropic', displayName: 'Godkänd', supportsText: true,
  supportsVision: true, supportsJsonSchema: true, supportsLocalProcessing: false,
  approvedForStudentData: true,
};

describe('draftEvidenceFromAi', () => {
  it('skapar ogranskat AI-utkast', () => {
    const draft = draftEvidenceFromAi({
      task: 'math-handwriting-analysis', providerId: 'gdpr', studentKey: 'e1', subject: 'ma',
      findings: [{ dimension: 'procedur', status: 'gap', confidence: 'high', evidenceText: 'Teckenfel' }],
      summary: 's', completedAt: '2026-07-19T10:00:00Z',
    });
    expect(draft.aiAssisted).toBe(true);
    expect(draft.teacherReviewed).toBe(false);
    expect(draft.source).toBe('google-classroom-image');
  });
  it('kräver studentKey', () => {
    expect(() => draftEvidenceFromAi({
      task: 'feedback-draft', providerId: 'x', subject: 'ma', findings: [], summary: '', completedAt: 'now',
    })).toThrow();
  });
});

describe('analyzeToDraft — läraren i loopen', () => {
  it('utkast hamnar i granskningskön och räknas först efter approve', async () => {
    const superteach = new SuperTeachService(new MemoryEvidenceStore());
    const port = new FakeAiAdapter([{ dimension: 'begrepp', status: 'secure', confidence: 'high', evidenceText: 'AI' }]);
    const id = await analyzeToDraft(
      { task: 'feedback-draft', subject: 'matematik', studentKey: 'e1', text: 'elevsvar' },
      { port, providers: [gdprProvider], superteach },
    );
    expect(await superteach.pendingReviewCount()).toBe(1);
    let summary = await superteach.summarize('e1', 'matematik');
    expect(summary.dimensions).toHaveLength(0); // ej inräknad ännu
    await superteach.approve(id);
    summary = await superteach.summarize('e1', 'matematik');
    expect(summary.dimensions[0]?.status).toBe('secure');
  });
});
