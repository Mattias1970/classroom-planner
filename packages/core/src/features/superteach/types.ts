/**
 * SuperTeach — evidensbaserad kunskapsöversikt per elev.
 *
 * SJÄLVSTÄNDIG MODUL (Ring 1, ren domän):
 * - Inga imports från övriga core-moduler → kan aldrig påverka
 *   befintliga funktioner och påverkas inte av deras ändringar.
 * - Lokala typalias (StudentKey, SubjectName, ...) är strängar,
 *   kompatibla med befintliga LessonRecord-fält utan koppling.
 */

// Lokala alias — medvetet frikopplade från resten av domänen.
export type StudentKey = string;
export type SubjectName = string;
export type CurriculumTag = string;
export type VersionId = string;

export type EvidenceSource =
  | 'google-forms'
  | 'google-classroom-image'
  | 'google-classroom-submission'
  | 'socrative-homework'
  | 'socrative-exit-ticket'
  | 'magma'
  | 'teacher-observation'
  | 'manual';

export type EvidenceStatus = 'secure' | 'developing' | 'gap' | 'not-assessed';
export type Confidence = 'low' | 'medium' | 'high';

export interface EvidenceDimension {
  /** T.ex. 'begrepp', 'procedur', 'problemlösning', 'resonemang', 'kommunikation' */
  dimension: string;
  status: EvidenceStatus;
  confidence: Confidence;
  evidenceText: string;
}

/** Ett evidensobjekt — en observation av en elevs kunnande vid en tidpunkt. */
export interface SuperTeachEvidence {
  id: string;
  studentKey: StudentKey;
  subject: SubjectName;
  source: EvidenceSource;
  assignmentId?: string;
  submissionId?: string;
  lessonVersionId?: VersionId;
  curriculumTags?: CurriculumTag[];
  dimensions: EvidenceDimension[];
  aiAssisted: boolean;
  aiProviderId?: string;
  teacherReviewed: boolean;
  teacherApprovedAt?: string;
  /** ISO 8601 */
  collectedAt: string;
}

// ── Evidensviktning per källa ─────────────────────────────────
export type EvidenceWeight =
  | 'låg'
  | 'låg-medel'
  | 'medel'
  | 'medel-hög'
  | 'hög'
  | 'konfigurerbar';

export interface EvidenceWeightEntry {
  source: EvidenceSource;
  primaryFunction: string;
  weight: EvidenceWeight;
}

export const EVIDENCE_WEIGHTS: EvidenceWeightEntry[] = [
  { source: 'socrative-homework',          primaryFunction: 'Förberedelse, begrepp, minnesåterkallning', weight: 'låg-medel' },
  { source: 'socrative-exit-ticket',       primaryFunction: 'Direkt förståelse efter lektion',           weight: 'medel' },
  { source: 'magma',                       primaryFunction: 'Procedurträning och färdighet',             weight: 'medel' },
  { source: 'google-classroom-submission', primaryFunction: 'Problemlösning, redovisning',               weight: 'medel-hög' },
  { source: 'google-forms',                primaryFunction: 'Strukturerad kunskapskontroll',             weight: 'medel-hög' },
  { source: 'google-classroom-image',      primaryFunction: 'Handskriven lösning, bildanalys',           weight: 'medel-hög' },
  { source: 'teacher-observation',         primaryFunction: 'Professionell bedömning',                   weight: 'konfigurerbar' },
  { source: 'manual',                      primaryFunction: 'Manuell inmatning',                         weight: 'konfigurerbar' },
];

/** Numerisk vikt för aggregering. 'konfigurerbar' faller tillbaka på config. */
export interface SuperTeachConfig {
  /** Vikt för 'konfigurerbar'-källor (lärarobservation, manuell). Default 1.0 */
  configurableWeight: number;
  /** Evidens äldre än så många dagar viktas ned linjärt mot decayFloor. Default 60 */
  decayAfterDays: number;
  /** Lägsta viktfaktor för gammal evidens. Default 0.4 */
  decayFloor: number;
  /** Om true räknas AI-evidens utan lärargranskning inte in i sammanställningen. Default true */
  requireTeacherReviewForAi: boolean;
}

export const DEFAULT_SUPERTEACH_CONFIG: SuperTeachConfig = {
  configurableWeight: 1.0,
  decayAfterDays: 60,
  decayFloor: 0.4,
  requireTeacherReviewForAi: true,
};

// ── Sammanställning (dashboardens datamodell) ─────────────────
export interface DimensionSummary {
  dimension: string;
  status: EvidenceStatus;
  /** 0–1, viktat medel av evidensens säkerhet */
  score: number | null;
  evidenceCount: number;
  latestCollectedAt: string | null;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
}

export interface StudentSummary {
  studentKey: StudentKey;
  subject: SubjectName;
  dimensions: DimensionSummary[];
  totalEvidence: number;
  excludedUnreviewedAi: number;
  gaps: string[];
}
