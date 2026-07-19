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
