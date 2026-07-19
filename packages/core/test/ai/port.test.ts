import { describe, expect, it } from 'vitest';
import {
  AiRoutingError,
  FakeAiAdapter,
  chooseProvider,
  type AiProviderConfig,
} from '../../src/features/ai/port.js';

const providers: AiProviderConfig[] = [
  { id: 'cloud', provider: 'openai', displayName: 'Moln', supportsText: true, supportsVision: true, supportsJsonSchema: true, supportsLocalProcessing: false, approvedForStudentData: false },
  { id: 'gdpr', provider: 'anthropic', displayName: 'Godkänd', supportsText: true, supportsVision: false, supportsJsonSchema: true, supportsLocalProcessing: false, approvedForStudentData: true },
  { id: 'local-vision', provider: 'local', displayName: 'Lokal', supportsText: true, supportsVision: true, supportsJsonSchema: false, supportsLocalProcessing: true, approvedForStudentData: true },
];

describe('chooseProvider — policy', () => {
  it('blockerar ej godkända providers för elevdata', () => {
    const p = chooseProvider('feedback-draft', providers);
    expect(p.id).toBe('gdpr');
  });
  it('kräver vision för bilduppgifter', () => {
    const p = chooseProvider('math-handwriting-analysis', providers);
    expect(p.id).toBe('local-vision');
  });
  it('tillåter ej-elevdata på valfri textprovider', () => {
    expect(chooseProvider('curriculum-mapping', providers).id).toBe('cloud');
  });
  it('kastar när regel pekar på okvalificerad provider', () => {
    expect(() => chooseProvider('feedback-draft', providers, [{ task: 'feedback-draft', providerId: 'cloud' }]))
      .toThrow(AiRoutingError);
  });
  it('följer regel bland kvalificerade', () => {
    const p = chooseProvider('math-handwriting-analysis', providers, [{ task: 'math-handwriting-analysis', providerId: 'local-vision' }]);
    expect(p.id).toBe('local-vision');
  });
  it('kastar när ingen kvalificerar', () => {
    expect(() => chooseProvider('feedback-draft', [providers[0]])).toThrow(AiRoutingError);
  });
});

describe('FakeAiAdapter', () => {
  it('returnerar canned findings med vald provider', async () => {
    const fake = new FakeAiAdapter([{ dimension: 'begrepp', status: 'developing', confidence: 'medium', evidenceText: 't' }]);
    const res = await fake.analyze({ task: 'feedback-draft', subject: 'ma', studentKey: 'e1' }, providers[1]);
    expect(res.providerId).toBe('gdpr');
    expect(res.findings).toHaveLength(1);
  });
});
