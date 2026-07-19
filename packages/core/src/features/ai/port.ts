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
