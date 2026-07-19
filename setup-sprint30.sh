#!/usr/bin/env bash
# classroom-planner — setup-sprint30.sh
#
# Sprint 30: SuperTeach + AI samverkan — läraren i loopen
# - draftEvidenceFromAi: AI-resultat blir alltid ogranskade utkast
# - analyzeToDraft: policy-routad analys → granskningskön
# - Evidens räknas in i översikten först efter lärarens approve
#
# Kör i projektroten:  bash setup-sprint30.sh  &&  npm test
# MODULARITET: endast nya filer + guardade index-uppdateringar av
# superteach-modulens egna index.ts. Inget annat rörs.

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

if [ ! -f "packages/core/src/features/superteach/service.ts" ]; then
  echo "❌  Sprint 26 krävs först (setup-sprint26.sh)."
  exit 1
fi
if [ ! -f "packages/core/src/features/ai/port.ts" ]; then
  echo "❌  Sprint 29 krävs först (setup-sprint29.sh)."
  exit 1
fi
log "packages/core/src/features/superteach/ai-bridge.ts..."
cat > packages/core/src/features/superteach/ai-bridge.ts << 'S30_BRIDGE'
/**
 * Sprint 30 — SuperTeach + AI samverkan.
 * Kopplar AI-analyser till evidensflödet med läraren i loopen:
 * AI-resultat blir alltid UTKAST (aiAssisted=true, teacherReviewed=false)
 * som hamnar i granskningskön och räknas in först efter godkännande.
 *
 * Importerar endast superteach- och ai-modulerna — rör inget annat.
 */
import type { AiAnalysisPort, AiAnalysisRequest, AiAnalysisResult, AiProviderConfig, AiRoutingRule } from '../ai/port.js';
import { chooseProvider } from '../ai/port.js';
import type { SuperTeachService } from './service.js';
import type { SuperTeachEvidence } from './types.js';

/** Gör om ett AI-resultat till ett evidensutkast som kräver lärargranskning. */
export function draftEvidenceFromAi(result: AiAnalysisResult): SuperTeachEvidence {
  if (!result.studentKey) {
    throw new Error('AI-resultatet saknar studentKey — evidens måste kopplas till en elev.');
  }
  return {
    id: `ai-${result.task}-${result.completedAt}-${result.studentKey}`.replace(/\s+/g, '_'),
    studentKey: result.studentKey,
    subject: result.subject,
    source: result.task === 'classroom-image-solution-analysis' || result.task === 'math-handwriting-analysis'
      ? 'google-classroom-image'
      : 'google-forms',
    dimensions: result.findings.map((f) => ({ ...f })),
    aiAssisted: true,
    aiProviderId: result.providerId,
    teacherReviewed: false,
    collectedAt: result.completedAt,
  };
}

/**
 * Kör en AI-analys via porten (policy-routad) och lägger resultatet
 * som ogranskat evidensutkast i SuperTeach. Returnerar utkastets id.
 */
export async function analyzeToDraft(
  request: AiAnalysisRequest,
  deps: {
    port: AiAnalysisPort;
    providers: AiProviderConfig[];
    rules?: AiRoutingRule[];
    superteach: SuperTeachService;
  },
): Promise<string> {
  const provider = chooseProvider(request.task, deps.providers, deps.rules ?? []);
  const result = await deps.port.analyze(request, provider);
  const draft = draftEvidenceFromAi(result);
  await deps.superteach.record(draft);
  return draft.id;
}
S30_BRIDGE
ok "packages/core/src/features/superteach/ai-bridge.ts"
log "packages/core/test/superteach/ai-bridge.test.ts..."
cat > packages/core/test/superteach/ai-bridge.test.ts << 'S30_TEST'
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
S30_TEST
ok "packages/core/test/superteach/ai-bridge.test.ts"
grep -q "ai-bridge.js" packages/core/src/features/superteach/index.ts || \
  printf "export * from './ai-bridge.js';\n" >> packages/core/src/features/superteach/index.ts
ok "Sprint 30 klar — kör: npx vitest run packages/core/test/superteach packages/core/test/ai"
