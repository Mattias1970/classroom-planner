#!/usr/bin/env bash
# classroom-planner — setup-sprint29.sh
#
# Sprint 29: AI-port + policy-router (Ring 1, invariant I6: inga SDK:er)
# - AiProviderConfig, AiRoutingRule, AiAnalysisPort + FakeAiAdapter
# - chooseProvider: GDPR-policy (approvedForStudentData) och vision-krav
#   kan aldrig överridas av routingregler
#
# Kör i projektroten:  bash setup-sprint29.sh  &&  npm test
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
mkdir -p packages/core/src/features/ai packages/core/test/ai
log "packages/core/src/features/ai/port.ts..."
cat > packages/core/src/features/ai/port.ts << 'S29_PORT'
/**
 * Sprint 29 — AI-port och router (Ring 1).
 * Från ursprungsplanen: utbytbar, policy-styrd, lärargranskad AI.
 * Invariant I6: inga provider-SDK:er i core — endast typer, policy
 * och ren routinglogik. Verkliga anrop görs av en Ring 2-adapter
 * som implementerar AiAnalysisPort.
 *
 * Fristående modul — inga imports från övriga core-moduler.
 */

export type AiTaskType =
  | 'forms-short-answer-analysis'
  | 'forms-class-misconception-analysis'
  | 'classroom-image-solution-analysis'
  | 'math-handwriting-analysis'
  | 'lab-report-analysis'
  | 'technology-project-analysis'
  | 'feedback-draft'
  | 'curriculum-mapping'
  | 'superteach-summary';

export type AiProviderName =
  | 'openai' | 'google-gemini' | 'anthropic' | 'mistral' | 'local' | 'custom';

export type AiConfidence = 'low' | 'medium' | 'high';

export interface AiProviderConfig {
  id: string;
  provider: AiProviderName;
  displayName: string;
  supportsText: boolean;
  supportsVision: boolean;
  supportsJsonSchema: boolean;
  supportsLocalProcessing: boolean;
  /** GDPR-policy: får providern behandla elevdata? */
  approvedForStudentData: boolean;
}

export interface AiRoutingRule {
  task: AiTaskType;
  providerId: string;
}

/** Uppgifter som innehåller elevdata resp. kräver bildförståelse. */
export const TASK_INVOLVES_STUDENT_DATA: Record<AiTaskType, boolean> = {
  'forms-short-answer-analysis': true,
  'forms-class-misconception-analysis': true,
  'classroom-image-solution-analysis': true,
  'math-handwriting-analysis': true,
  'lab-report-analysis': true,
  'technology-project-analysis': true,
  'feedback-draft': true,
  'curriculum-mapping': false,
  'superteach-summary': true,
};

export const TASK_REQUIRES_VISION: Record<AiTaskType, boolean> = {
  'forms-short-answer-analysis': false,
  'forms-class-misconception-analysis': false,
  'classroom-image-solution-analysis': true,
  'math-handwriting-analysis': true,
  'lab-report-analysis': false,
  'technology-project-analysis': false,
  'feedback-draft': false,
  'curriculum-mapping': false,
  'superteach-summary': false,
};

export class AiRoutingError extends Error {}

/**
 * Väljer provider för en uppgift.
 * Policy (hårda krav, kan inte överridas av regler):
 *  - elevdata → approvedForStudentData måste vara true
 *  - bilduppgift → supportsVision måste vara true
 * Regler väljer bland kvalificerade providers; annars första kvalificerade.
 */
export function chooseProvider(
  task: AiTaskType,
  providers: AiProviderConfig[],
  rules: AiRoutingRule[] = [],
): AiProviderConfig {
  const qualified = providers.filter((p) => {
    if (TASK_INVOLVES_STUDENT_DATA[task] && !p.approvedForStudentData) return false;
    if (TASK_REQUIRES_VISION[task] && !p.supportsVision) return false;
    if (!TASK_REQUIRES_VISION[task] && !p.supportsText) return false;
    return true;
  });
  if (qualified.length === 0) {
    throw new AiRoutingError(
      `Ingen provider uppfyller policykraven för '${task}' ` +
      `(elevdata=${TASK_INVOLVES_STUDENT_DATA[task]}, vision=${TASK_REQUIRES_VISION[task]}).`,
    );
  }
  const rule = rules.find((r) => r.task === task);
  if (rule) {
    const chosen = qualified.find((p) => p.id === rule.providerId);
    if (chosen) return chosen;
    // Regeln pekar på en okvalificerad provider → policyn vinner, med tydligt fel.
    if (providers.some((p) => p.id === rule.providerId)) {
      throw new AiRoutingError(
        `Routingregeln för '${task}' pekar på '${rule.providerId}' som inte uppfyller policykraven.`,
      );
    }
  }
  return qualified[0];
}

// ── Port för Ring 2-adaptrar ──────────────────────────────────
export interface AiDimensionFinding {
  dimension: string;
  status: 'secure' | 'developing' | 'gap' | 'not-assessed';
  confidence: AiConfidence;
  evidenceText: string;
}

export interface AiAnalysisRequest {
  task: AiTaskType;
  subject: string;
  studentKey?: string;
  /** Textunderlag (fritextsvar, transkription …). */
  text?: string;
  /** Bildunderlag som data-URL eller referens — adaptern avgör. */
  imageRef?: string;
}

export interface AiAnalysisResult {
  task: AiTaskType;
  providerId: string;
  studentKey?: string;
  subject: string;
  findings: AiDimensionFinding[];
  /** Modellens sammanfattning för läraren. */
  summary: string;
  completedAt: string;
}

export interface AiAnalysisPort {
  analyze(request: AiAnalysisRequest, provider: AiProviderConfig): Promise<AiAnalysisResult>;
}

/** Fake-adapter för tester och offline-läge. */
export class FakeAiAdapter implements AiAnalysisPort {
  constructor(private readonly cannedFindings: AiDimensionFinding[] = []) {}
  async analyze(req: AiAnalysisRequest, provider: AiProviderConfig): Promise<AiAnalysisResult> {
    return {
      task: req.task,
      providerId: provider.id,
      studentKey: req.studentKey,
      subject: req.subject,
      findings: this.cannedFindings,
      summary: `Fake-analys av ${req.task}.`,
      completedAt: new Date().toISOString(),
    };
  }
}
S29_PORT
ok "packages/core/src/features/ai/port.ts"
log "packages/core/src/features/ai/index.ts..."
cat > packages/core/src/features/ai/index.ts << 'S29_IDX'
export * from './port.js';
S29_IDX
ok "packages/core/src/features/ai/index.ts"
log "packages/core/test/ai/port.test.ts..."
cat > packages/core/test/ai/port.test.ts << 'S29_TEST'
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
S29_TEST
ok "packages/core/test/ai/port.test.ts"
ok "Sprint 29 klar"
