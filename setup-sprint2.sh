#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# classroom-planner — setup-sprint2.sh
#
# Kör detta i Codespaces-terminalen när Sprint 1 är klar:
#   bash setup-sprint2.sh
#
# Scriptet skapar ALLA Sprint 2-filer från grunden — inga externa
# filer eller nedladdningar behövs. Allt innehåll är inbakat.
#
# När scriptet är klart kör du:
#   npm test   ← ska visa minst 42 gröna tester (30 + 12 nya)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${BLUE}▶${NC}  $1"; }
ok()   { echo -e "${GREEN}✅${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠️${NC}   $1"; }

echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Classroom Planner — Sprint 2 setup       ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

# ── Kontrollera att Sprint 1 är klar ──────────────────────────
if [ ! -f "packages/core/src/errors.ts" ]; then
  echo "❌  Sprint 1 verkar inte vara klar."
  echo "    Kör 'bash setup.sh && npm install && npm test' först."
  exit 1
fi
ok "Sprint 1 hittad"

# ── Katalogstruktur ────────────────────────────────────────────
log "Skapar katalogstruktur..."
mkdir -p packages/core/src/domain
mkdir -p packages/core/src/fixtures
mkdir -p design-tokens
ok "Kataloger skapade"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/domain/types.ts
# ═══════════════════════════════════════════════════════════════
log "Skapar domain/types.ts..."
cat > packages/core/src/domain/types.ts << 'TYPES'
// ── Branded identifierare ─────────────────────────────────────
// Branded types hindrar att man blandar ihop olika id:n vid kompilering.
export type BookId      = string & { readonly __b: 'BookId' };
export type ConceptId   = string & { readonly __b: 'ConceptId' };
export type TemplateId  = string & { readonly __b: 'TemplateId' };
export type VersionId   = string & { readonly __b: 'VersionId' };
export type ScheduledId = string & { readonly __b: 'ScheduledId' };
export type ClassId     = string & { readonly __b: 'ClassId' };
export type RecipientId = string & { readonly __b: 'RecipientId' };

export type Iso8601     = string;  // "2026-09-03T09:00:00+02:00"
export type Level       = 'grön' | 'blå' | 'röd';
export type SubjectName = 'matematik' | 'fysik' | 'biologi' | 'kemi' | 'teknik';

// ── Bok och kursstruktur ──────────────────────────────────────
export interface Subchapter {
  id: string;            // "1.3"
  titel: string;         // "Multiplikation med negativa tal"
  conceptIds: ConceptId[];
}

export interface Chapter {
  id: string;            // "1"
  titel: string;         // "Tal"
  subchapters: Subchapter[];
}

export interface Book {
  id: BookId;
  titel: string;         // "Prio Matematik 8"
  förlag: string;        // "Sanoma"
  upplaga: string;       // "2a upplagan"
  årskurs: number;       // 8
  chapters: Chapter[];
}

export interface Concept {
  id: ConceptId;
  term: string;
  definition: string;
  subchapterId: string;  // "1.3"
}

// ── Lektionsbyggstenar ────────────────────────────────────────
export interface WorkItem {
  titel: string;
  beskrivning: string;
  nivå: Level;
}

export interface FilmRef {
  titel: string;
  url: string;
  källa: string;         // "Binogi" | "YouTube" | ...
}

export interface QuizRef {
  titel: string;
  plattform: string;     // "Socrative" | "Google Forms"
  url: string;
}

export interface MagmaRef {
  uppgiftsnamn: string;
  url: string;
}

export interface BamRow {
  label: string;
  minutes: number;       // heltal >= 1
  kind: 'quiz' | 'lecture' | 'work' | 'exit' | 'custom';
}

export interface FlipBlock {
  typ: 'text' | 'film' | 'quiz';
  text?: string;
  ref?: FilmRef | QuizRef;
}

export interface FlipSettings {
  socrativeRoom: string;
  sändDag: 'dag-före' | 'samma-dag';
  sändTid: string;       // "15:00"
}

// ── CurriculumTag — koppling till läroplan ───────────────────
export interface CurriculumTag {
  subject: SubjectName;
  dimension:
    | 'begrepp'
    | 'metod'
    | 'problemlösning'
    | 'resonemang'
    | 'kommunikation'
    | 'undersökning'
    | 'samhälle-hållbarhet';
  centralContentRef?: string;
}

// ── LessonContent — lektionens innehåll ──────────────────────
export interface LessonContent {
  rubrik: string;
  mål: string;
  subject: SubjectName;
  bookId?: BookId;
  chapterId?: string;
  subchapterId?: string;
  årskurs: number;
  längdMin: number;
  del: 0 | 1 | 2;       // 0=hel, 1=del1, 2=del2
  arbetsmoment: WorkItem[];
  metoder: string[];
  conceptIds: ConceptId[];
  filmer: FilmRef[];
  quizzes: QuizRef[];
  magma: MagmaRef[];
  flippat: { blocks: FlipBlock[]; settings: FlipSettings };
  bam: BamRow[];
  curriculumTags?: CurriculumTag[];
}

// ── LessonVersion och LessonTemplate ─────────────────────────
export interface LessonVersion {
  id: VersionId;
  createdAt: Iso8601;
  label: string;
  content: LessonContent;
}

export interface LessonTemplate {
  id: TemplateId;
  currentVersionId: VersionId;
  versions: LessonVersion[];  // append-only — aldrig mutera
}

// ── ScheduledLesson ───────────────────────────────────────────
export type ScheduleStatus = 'planerad' | 'publicerad' | 'genomförd' | 'inställd';

export interface ExternalRef {
  provider: string;
  externalId: string;
  url?: string;
  publishedAt: Iso8601;
}

export interface ScheduledLesson {
  id: ScheduledId;
  templateId: TemplateId;
  versionId: VersionId;
  classId: ClassId;
  date: string;          // "2026-09-03"
  startTime: string;     // "09:00"
  endTime: string;       // "09:55"
  lengthOverrideMin?: number;
  locked: boolean;
  status: ScheduleStatus;
  externalRefs: ExternalRef[];
}

// ── Recipient — mottagare för utskick ────────────────────────
export type RecipientRole = 'elev' | 'vårdnadshavare' | 'kollega' | 'rektor';

export interface Recipient {
  id: RecipientId;
  classId: ClassId;
  role: RecipientRole;
  email: string;
  optOutToken: string;
  optedOut: boolean;
}
TYPES
ok "domain/types.ts"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/domain/sources.ts
# ═══════════════════════════════════════════════════════
log "Skapar domain/sources.ts..."
cat > packages/core/src/domain/sources.ts << 'SOURCES'
import type { Level } from './types.js';

// ── SourceRef — referens till en läromedelskälla ─────────────
export interface SourceRef {
  sourceId: string;
  type: 'book' | 'teacher-note' | 'video' | 'quiz' | 'magma' | 'ai-generated';
  title: string;
  url?: string;
  licenseNote?: string;
}

// ── LevelLabel — flexibel nivåetikett ────────────────────────
// Stödjer grön/blå/röd OCH bokspecifika etiketter som
// basläger/mellanläger/höghöjd/topptur (Prio Matematik).
export type KnownLevel = Level | 'basläger' | 'mellanläger' | 'höghöjd' | 'topptur';

export interface LevelLabel {
  known?: KnownLevel;
  custom?: string;
}

// ── ExerciseRange — ett uppgiftsspann på en nivå ─────────────
export interface ExerciseRange {
  label: LevelLabel;
  sourceId: string;
  from?: number;
  to?: number;
  text?: string;
}

// ── LessonSourceMap — källkarta för ett delkapitel ───────────
export interface LessonSourceMap {
  subchapterId: string;
  lessonNo: number;
  theoryPages?: string;
  exerciseRanges: ExerciseRange[];
  quizStart?: string;
  exitTicket?: string;
  magmaTaskName?: string;
  concepts: string[];
}
SOURCES
ok "domain/sources.ts"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/domain/curriculum.ts
# ═══════════════════════════════════════════════════════════════
log "Skapar domain/curriculum.ts..."
cat > packages/core/src/domain/curriculum.ts << 'CURRICULUM'
import type { SubjectName } from './types.js';

export type SourceStatus = 'verified' | 'needs-review' | 'manual';

// ── CurriculumPlanningNote — läroplansstöd (icke-blockerande) ─
export interface CurriculumPlanningNote {
  subject: SubjectName;
  purposeText: string;
  knowledgeDirectives: string[];
  relevantCentralContent: string[];
  sourceUrl: string;
  verifiedAt: string;
  sourceStatus: SourceStatus;
}

// ── Kunskapsdirektiv D1–D6 ────────────────────────────────────
export interface KnowledgeDimension {
  id: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';
  label: string;
  typicalSources: string[];
}

export const KNOWLEDGE_DIMENSIONS: KnowledgeDimension[] = [
  {
    id: 'D1',
    label: 'Begrepp och modeller',
    typicalSources: ['läxförhör', 'begreppstest', 'exit ticket'],
  },
  {
    id: 'D2',
    label: 'Metod/procedur/undersökning',
    typicalSources: ['magma', 'arbetsuppgifter', 'labb'],
  },
  {
    id: 'D3',
    label: 'Problemlösning/tillämpning',
    typicalSources: ['classroom-inlämning', 'prov', 'projekt'],
  },
  {
    id: 'D4',
    label: 'Resonemang/analys',
    typicalSources: ['exit ticket', 'provfrågor', 'diskussionsfrågor'],
  },
  {
    id: 'D5',
    label: 'Kommunikation/dokumentation',
    typicalSources: ['inlämnade lösningar', 'labbrapport'],
  },
  {
    id: 'D6',
    label: 'Samhälle/hållbarhet/konsekvenser',
    typicalSources: ['resonemangsfrågor', 'projekt', 'case'],
  },
];
CURRICULUM
ok "domain/curriculum.ts"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/domain/superteach.ts
# ═══════════════════════════════════════════════════════════════
log "Skapar domain/superteach.ts..."
cat > packages/core/src/domain/superteach.ts << 'SUPERTEACH'
import type { SubjectName, CurriculumTag, VersionId } from './types.js';

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
export type Confidence     = 'low' | 'medium' | 'high';

// ── EvidenceDimension ─────────────────────────────────────────
export interface EvidenceDimension {
  dimension: string;
  status: EvidenceStatus;
  confidence: Confidence;
  evidenceText: string;
}

// ── SuperTeachEvidence ────────────────────────────────────────
// Obligatoriska fält: id, studentKey, subject, source, collectedAt.
export interface SuperTeachEvidence {
  id: string;
  studentKey: string;
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
  { source: 'socrative-homework',          primaryFunction: 'Förberedelse, begrepp, minnesåterkallning', weight: 'låg-medel'      },
  { source: 'socrative-exit-ticket',       primaryFunction: 'Direkt förståelse efter lektion',          weight: 'medel'          },
  { source: 'magma',                       primaryFunction: 'Procedurträning och färdighet',             weight: 'medel'          },
  { source: 'google-classroom-submission', primaryFunction: 'Problemlösning, redovisning',              weight: 'medel-hög'      },
  { source: 'google-forms',                primaryFunction: 'Strukturerad kunskapskontroll',             weight: 'medel-hög'      },
  { source: 'google-classroom-image',      primaryFunction: 'Handskriven lösning, bildanalys',          weight: 'medel-hög'      },
  { source: 'teacher-observation',         primaryFunction: 'Professionell bedömning',                   weight: 'konfigurerbar'  },
  { source: 'manual',                      primaryFunction: 'Manuell inmatning',                         weight: 'konfigurerbar'  },
];
SUPERTEACH
ok "domain/superteach.ts"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/domain/ai.ts
# ═══════════════════════════════════════════════════════
log "Skapar domain/ai.ts..."
cat > packages/core/src/domain/ai.ts << 'AITYPES'
// ── AI-typer — utbytbar, policy-styrd, lärargranskad ─────────
// Inga provider-specifika SDK:er importeras i core (invariant I6).

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
  | 'openai'
  | 'google-gemini'
  | 'anthropic'
  | 'mistral'
  | 'local'
  | 'custom';

export type AiConfidence = 'low' | 'medium' | 'high';

// ── AiProviderConfig ──────────────────────────────────────────
export interface AiProviderConfig {
  id: string;
  provider: AiProviderName;
  displayName: string;
  supportsText: boolean;
  supportsVision: boolean;
  supportsJsonSchema: boolean;
  supportsLocalProcessing: boolean;
  approvedForStudentData: boolean;
}

// ── AiRoutingRule — task-specifik provider-override ──────────
export interface AiRoutingRule {
  taskType: AiTaskType;
  providerId: string;
  reason?: string;
}

// ── AiSettings ────────────────────────────────────────────────
export interface AiSettings {
  defaultProviderId: string;
  defaultTextModel?: string;
  defaultVisionModel?: string;
  taskOverrides: AiRoutingRule[];
}

// ── AiDataPolicy — GDPR och dataskydd ────────────────────────
export interface AiDataPolicy {
  allowExternalAi: boolean;
  allowStudentNames: boolean;
  requirePseudonymization: boolean;
  allowImageSubmissions: boolean;
  retainAiInputs: boolean;
  retainAiOutputs: boolean;
  maxRetentionDays: number;
}

// ── AiAnalysisResult ──────────────────────────────────────────
export type FindingStatus = 'strength' | 'partial' | 'gap' | 'misconception';

export interface AiFinding {
  dimension: string;
  status: FindingStatus;
  evidence: string;
  feedbackSuggestion: string;
}

export interface AiAnalysisResult {
  taskType: AiTaskType;
  providerId: string;
  model: string;
  confidence: AiConfidence;
  summary: string;
  findings: AiFinding[];
  suggestedTeacherAction: string[];
  needsHumanReview: boolean;
}
AITYPES
ok "domain/ai.ts"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/domain/index.ts
# ═══════════════════════════════════════════════════════
log "Skapar domain/index.ts..."
cat > packages/core/src/domain/index.ts << 'DOMAININDEX'
export * from './types.js';
export * from './sources.js';
export * from './curriculum.js';
export * from './superteach.js';
export * from './ai.js';
DOMAININDEX
ok "domain/index.ts"

# ═══════════════════════════════════════════════════════════════
# Uppdatera packages/core/src/index.ts
# ═══════════════════════════════════════════════════════════════
log "Uppdaterar core/src/index.ts med domain-export..."
cat > packages/core/src/index.ts << 'COREINDEX'
/**
 * @planner/core — Ren domänkärna utan externa beroenden.
 *
 * Ring 1 i ringmodellen. Ingen Google-kod, inget nätverk,
 * inget DOM, ingen webblagring. Allt sådant hör till Ring 2 (adaptrar).
 */

// Felmodell (Sprint 1)
export { DomainError, ValidationError, SchemaVersionError } from './errors.js';

// Dokumentkuvert och versionering (Sprint 1)
export {
  type Iso8601,
  type Clock,
  type PlannerDocumentV1,
  CURRENT_SCHEMA_VERSION,
  createDocument,
  migrateDocument,
  prepareForSave,
  roundTrip,
} from './document.js';

// Domäntyper (Sprint 2)
export * from './domain/index.js';
COREINDEX
ok "core/src/index.ts uppdaterad"

# ═══════════════════════════════════════════════════════════════
# design-tokens/tokens.css
# ═══════════════════════════════════════════════════════
log "Skapar design-tokens/tokens.css..."
cat > design-tokens/tokens.css << 'TOKENS'
/* ── Classroom Planner — Design Tokens ──────────────────────
   Baseras på Prio Matematik 8 bokens visuella identitet:
   terrakotta/canyon-röd, guld, teal, djupblå.
   Alla UI-komponenter i Sprint 6 ska använda dessa tokens.
   Ändra aldrig hex-värdena utan att uppdatera paritetsprotokollet.
──────────────────────────────────────────────────────────── */

:root {
  /* ── Primärfärger (bokens identitet) ── */
  --color-primary:        #c0392b;
  --color-primary-dark:   #962d22;
  --color-primary-light:  #e74c3c;
  --color-gold:           #d4a843;
  --color-teal:           #1a7a6e;
  --color-teal-light:     #20b2a0;
  --color-deep-blue:      #1a2a4a;

  /* ── Nivåfärger ── */
  --color-level-grön:     #27ae60;
  --color-level-blå:      #2980b9;
  --color-level-röd:      #c0392b;

  /* ── Neutrala ── */
  --color-bg:             #fafafa;
  --color-bg-card:        #ffffff;
  --color-bg-dark:        #1a2a4a;
  --color-border:         #e0e0e0;
  --color-text:           #2c3e50;
  --color-text-muted:     #7f8c8d;
  --color-text-inverse:   #ffffff;

  /* ── Statusfärger ── */
  --color-success:        #27ae60;
  --color-warning:        #f39c12;
  --color-error:          #c0392b;
  --color-info:           #2980b9;

  /* ── BAM-tidslinje ── */
  --color-bam-quiz:       #9b59b6;
  --color-bam-lecture:    #2980b9;
  --color-bam-work:       #27ae60;
  --color-bam-exit:       #e67e22;
  --color-bam-custom:     #7f8c8d;

  /* ── Typografi ── */
  --font-family:          -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-family-mono:     'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  --font-size-xs:         11px;
  --font-size-sm:         13px;
  --font-size-base:       15px;
  --font-size-lg:         17px;
  --font-size-xl:        20px;
  --font-size-2xl:        24px;
  --font-weight-normal:   400;
  --font-weight-medium:   500;
  --font-weight-bold:     700;

  /* ── Spacing ── */
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;

  /* ── Radier ── */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-full: 9999px;

  /* ── Skuggor ── */
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.08);
  --shadow-md:  0 4px 12px rgba(0,0,0,0.12);
  --shadow-lg:  0 8px 24px rgba(0,0,0,0.16);

  /* ── Animationer ── */
  --transition-fast:    0.1s ease;
  --transition-normal:  0.2s ease;
  --transition-slow:    0.3s ease;

  /* ── Layout ── */
  --sidebar-width:      280px;
  --header-height:      56px;
  --content-max-width:  1200px;
  --bam-bar-height:     40px;
}
TOKENS
ok "design-tokens/tokens.css"

# ═══════════════════════════════════════════════════════════════
# packages/core/src/fixtures/prio-mat-8.ts
# ═══════════════════════════════════════════════════════
log "Skapar fixtures/prio-mat-8.ts..."
cat > packages/core/src/fixtures/prio-mat-8.ts << 'FIXTURES'
import type { Book, BookId, Concept, ConceptId } from '../domain/index.js';
import type { LessonSourceMap } from '../domain/index.js';

// ── Boken ───────────────────────────────────────────────────
export const PRIO_MAT_8: Book = {
  id: 'prio-mat-8-2ed' as BookId,
  titel: 'Prio Matematik 8',
  förlag: 'Sanoma',
  upplaga: '2a upplagan',
  årskurs: 8,
  chapters: [
    {
      id: '1',
      titel: 'Tal',
      subchapters: [
        { id: '1.1', titel: 'Negativa tal',                      conceptIds: ['c-1-1-negativatal', 'c-1-1-tallinjen'] as ConceptId[] },
        { id: '1.2', titel: 'Additions- och subtraktionsregler', conceptIds: ['c-1-2-addition', 'c-1-2-subtraktion'] as ConceptId[] },
        { id: '1.3', titel: 'Multiplikation med negativa tal',   conceptIds: ['c-1-3-multiplikation'] as ConceptId[] },
        { id: '1.4', titel: 'Division med negativa tal',         conceptIds: ['c-1-4-division'] as ConceptId[] },
        { id: '1.5', titel: 'Potenser med negativa tal',         conceptIds: ['c-1-5-potenser'] as ConceptId[] },
      ],
    },
    {
      id: '2',
      titel: 'Algebra',
      subchapters: [
        { id: '2.1', titel: 'Algebraiska uttryck',         conceptIds: ['c-2-1-uttryck', 'c-2-1-variabel'] as ConceptId[] },
        { id: '2.2', titel: 'Mönster och formler',         conceptIds: ['c-2-2-mönster', 'c-2-2-formel'] as ConceptId[] },
        { id: '2.3', titel: 'Parenteser',                  conceptIds: ['c-2-3-parenteser', 'c-2-3-distributivlagen'] as ConceptId[] },
        { id: '2.4', titel: 'Faktorisering',               conceptIds: ['c-2-4-faktorisering'] as ConceptId[] },
        { id: '2.5', titel: 'Ekvationer',                  conceptIds: ['c-2-5-ekvation', 'c-2-5-lösning'] as ConceptId[] },
        { id: '2.6', titel: 'Mer om ekvationer',           conceptIds: ['c-2-6-ekvationer'] as ConceptId[] },
        { id: '2.7', titel: 'Skriva och lösa ekvationer',  conceptIds: ['c-2-7-problemlösning'] as ConceptId[] },
        { id: '2.8', titel: 'Andragradsekvationer',        conceptIds: ['c-2-8-andragrads'] as ConceptId[] },
      ],
    },
    {
      id: '3',
      titel: 'Geometri',
      subchapters: [
        { id: '3.1', titel: 'Vinklar och trianglar',        conceptIds: [] as ConceptId[] },
        { id: '3.2', titel: 'Kongruens och likformighet',   conceptIds: [] as ConceptId[] },
        { id: '3.3', titel: 'Pythagoras sats',              conceptIds: [] as ConceptId[] },
        { id: '3.4', titel: 'Area och omkrets',             conceptIds: [] as ConceptId[] },
        { id: '3.5', titel: 'Volym och area',               conceptIds: [] as ConceptId[] },
      ],
    },
    {
      id: '4',
      titel: 'Sannolikhet och statistik',
      subchapters: [
        { id: '4.1', titel: 'Sannolikhet',             conceptIds: [] as ConceptId[] },
        { id: '4.2', titel: 'Kombinatorik',             conceptIds: [] as ConceptId[] },
        { id: '4.3', titel: 'Statistik',                conceptIds: [] as ConceptId[] },
        { id: '4.4', titel: 'Diagram och medelvärde',   conceptIds: [] as ConceptId[] },
      ],
    },
  ],
};

// ── Begrepp för kapitel 1.1 ───────────────────────────────────
export const CONCEPTS_1_1: Concept[] = [
  {
    id: 'c-1-1-negativatal' as ConceptId,
    term: 'negativt tal',
    definition: 'Tal som är mindre än noll, skrivs med minustecken framför.',
    subchapterId: '1.1',
  },
  {
    id: 'c-1-1-tallinjen' as ConceptId,
    term: 'tallinjen',
    definition: 'En linje där tal placeras i storleksordning från vänster (minst) till höger (störst).',
    subchapterId: '1.1',
  },
];

// ── Källkartor för 1.1 ───────────────────────────────────────
export const SOURCE_MAP_1_1_DEL1: LessonSourceMap = {
  subchapterId: '1.1',
  lessonNo: 1,
  theoryPages: 's. 10-13',
  exerciseRanges: [
    { label: { known: 'grön' }, sourceId: 'prio-mat-8-2ed', from: 101, to: 110 },
    { label: { known: 'blå'  }, sourceId: 'prio-mat-8-2ed', from: 111, to: 120 },
  ],
  quizStart: 'Matte8B',
  exitTicket: 'Matte8B',
  magmaTaskName: 'Negativa tal 1',
  concepts: ['c-1-1-negativatal', 'c-1-1-tallinjen'],
};

export const SOURCE_MAP_1_1_DEL2: LessonSourceMap = {
  subchapterId: '1.1',
  lessonNo: 2,
  theoryPages: 's. 10-13',
  exerciseRanges: [
    { label: { known: 'blå' }, sourceId: 'prio-mat-8-2ed', from: 111, to: 120 },
    { label: { known: 'röd' }, sourceId: 'prio-mat-8-2ed', from: 121, to: 130 },
  ],
  quizStart: 'Matte8B',
  exitTicket: 'Matte8B',
  concepts: ['c-1-1-negativatal', 'c-1-1-tallinjen'],
};
FIXTURES
ok "fixtures/prio-mat-8.ts"

# ═══════════════════════════════════════════════════════════════
# Tester
# ═══════════════════════════════════════════════════════
log "Skapar tester..."

cat > packages/core/test/types.test.ts << 'TYPESTEST'
import { describe, it, expect } from 'vitest';
import { KNOWLEDGE_DIMENSIONS, EVIDENCE_WEIGHTS } from '@planner/core';

describe('Kunskapsdirektiv D1–D6', () => {
  it('KNOWLEDGE_DIMENSIONS innehåller 6 poster', () => {
    expect(KNOWLEDGE_DIMENSIONS).toHaveLength(6);
  });

  it('D1 heter Begrepp och modeller', () => {
    const d1 = KNOWLEDGE_DIMENSIONS.find((d) => d.id === 'D1');
    expect(d1).toBeDefined();
    expect(d1?.label).toBe('Begrepp och modeller');
  });

  it('D6 heter Samhälle/hållbarhet/konsekvenser', () => {
    const d6 = KNOWLEDGE_DIMENSIONS.find((d) => d.id === 'D6');
    expect(d6).toBeDefined();
    expect(d6?.label).toBe('Samhälle/hållbarhet/konsekvenser');
  });

  it('Alla dimensioner har minst en typisk evidenskälla', () => {
    for (const dim of KNOWLEDGE_DIMENSIONS) {
      expect(dim.typicalSources.length).toBeGreaterThan(0);
    }
  });
});

describe('Evidensviktning', () => {
  it('EVIDENCE_WEIGHTS innehåller 8 poster', () => {
    expect(EVIDENCE_WEIGHTS).toHaveLength(8);
  });

  it('socrative-exit-ticket har weight medel', () => {
    const entry = EVIDENCE_WEIGHTS.find((e) => e.source === 'socrative-exit-ticket');
    expect(entry).toBeDefined();
    expect(entry?.weight).toBe('medel');
  });

  it('teacher-observation har weight konfigurerbar', () => {
    const entry = EVIDENCE_WEIGHTS.find((e) => e.source === 'teacher-observation');
    expect(entry).toBeDefined();
    expect(entry?.weight).toBe('konfigurerbar');
  });

  it('Alla sources är unika', () => {
    const sources = EVIDENCE_WEIGHTS.map((e) => e.source);
    const unique = new Set(sources);
    expect(unique.size).toBe(sources.length);
  });
});
TYPESTEST

cat > packages/core/test/fixtures.test.ts << 'FIXTURESTEST'
import { describe, it, expect } from 'vitest';
import {
  PRIO_MAT_8,
  CONCEPTS_1_1,
  SOURCE_MAP_1_1_DEL1,
  SOURCE_MAP_1_1_DEL2,
} from '../src/fixtures/prio-mat-8.js';

describe('PRIO_MAT_8 — bokstruktur', () => {
  it('har 4 kapitel', () => {
    expect(PRIO_MAT_8.chapters).toHaveLength(4);
  });

  it('kapitel 1 heter Tal', () => {
    expect(PRIO_MAT_8.chapters[0]?.titel).toBe('Tal');
  });

  it('kapitel 1 har 5 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[0]?.subchapters).toHaveLength(5);
  });

  it('kapitel 2 heter Algebra', () => {
    expect(PRIO_MAT_8.chapters[1]?.titel).toBe('Algebra');
  });

  it('kapitel 2 har 8 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[1]?.subchapters).toHaveLength(8);
  });

  it('kapitel 3 heter Geometri och har 5 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[2]?.titel).toBe('Geometri');
    expect(PRIO_MAT_8.chapters[2]?.subchapters).toHaveLength(5);
  });

  it('kapitel 4 heter Sannolikhet och statistik och har 4 delkapitel', () => {
    expect(PRIO_MAT_8.chapters[3]?.titel).toBe('Sannolikhet och statistik');
    expect(PRIO_MAT_8.chapters[3]?.subchapters).toHaveLength(4);
  });

  it('förlag är Sanoma', () => {
    expect(PRIO_MAT_8.förlag).toBe('Sanoma');
  });

  it('årskurs är 8', () => {
    expect(PRIO_MAT_8.årskurs).toBe(8);
  });
});

describe('CONCEPTS_1_1', () => {
  it('har 2 begrepp', () => {
    expect(CONCEPTS_1_1).toHaveLength(2);
  });

  it('första begreppet är negativt tal', () => {
    expect(CONCEPTS_1_1[0]?.term).toBe('negativt tal');
  });

  it('andra begreppet är tallinjen', () => {
    expect(CONCEPTS_1_1[1]?.term).toBe('tallinjen');
  });
});

describe('SOURCE_MAP_1_1_DEL1', () => {
  it('är lessonNo 1', () => {
    expect(SOURCE_MAP_1_1_DEL1.lessonNo).toBe(1);
  });

  it('har 2 exerciseRanges', () => {
    expect(SOURCE_MAP_1_1_DEL1.exerciseRanges).toHaveLength(2);
  });

  it('grön-range är 101–110', () => {
    const grön = SOURCE_MAP_1_1_DEL1.exerciseRanges[0];
    expect(grön?.label.known).toBe('grön');
    expect(grön?.from).toBe(101);
    expect(grön?.to).toBe(110);
  });

  it('quizStart är Matte8B', () => {
    expect(SOURCE_MAP_1_1_DEL1.quizStart).toBe('Matte8B');
  });
});

describe('SOURCE_MAP_1_1_DEL2', () => {
  it('är lessonNo 2', () => {
    expect(SOURCE_MAP_1_1_DEL2.lessonNo).toBe(2);
  });

  it('har blå och röd range', () => {
    const labels = SOURCE_MAP_1_1_DEL2.exerciseRanges.map((r) => r.label.known);
    expect(labels).toContain('blå');
    expect(labels).toContain('röd');
  });
});
FIXTURESTEST

ok "Alla testfiler skapade"

# ═══════════════════════════════════════════════════════════════
# Uppdatera sprint-spec
# ═══════════════════════════════════════════════════════
log "Uppdaterar sprint-02-spec.md..."
cat > .claude/sprint/sprint-02-spec.md << 'SPEC02'
# Sprint 2: Domäntyper

**Status:** Klar ✅

## Leverabler
- packages/core/src/domain/types.ts      (branded types, Book, LessonContent, ScheduledLesson)
- packages/core/src/domain/sources.ts    (SourceRef, LevelLabel, ExerciseRange, LessonSourceMap)
- packages/core/src/domain/curriculum.ts (CurriculumPlanningNote, KNOWLEDGE_DIMENSIONS D1–D6)
- packages/core/src/domain/superteach.ts (SuperTeachEvidence, EVIDENCE_WEIGHTS)
- packages/core/src/domain/ai.ts         (AiProviderConfig, AiSettings, AiDataPolicy, AiAnalysisResult)
- packages/core/src/domain/index.ts      (re-exporterar allt)
- packages/core/src/fixtures/prio-mat-8.ts (PRIO_MAT_8, CONCEPTS_1_1, SOURCE_MAP_1_1_DEL1+DEL2)
- design-tokens/tokens.css               (bindande designtokens från Prio-bokens visuella identitet)
- packages/core/test/types.test.ts       (8 tester)
- packages/core/test/fixtures.test.ts    (12 tester)
- .claude/sprint/sprint-02-spec.md       (Sprint 2-spec)
SPEC02
ok "sprint-02-spec.md"

# ═══════════════════════════════════════════════════════
# Kör tester
# ═══════════════════════════════════════════════
echo ""
log "Kör npm test..."
echo ""

if npm test 2>&1; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Sprint 2 klar! Alla tester gröna.        ${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo ""
  echo "Nästa steg — starta Sprint 3:"
  echo ""
  echo -e "  ${BLUE}bash setup-sprint3.sh${NC}   ← när den finns"
  echo -e "  ${BLUE}claude${NC}                  ← eller kör Sprint 3-prompten i Claude Code"
  echo ""
else
  echo ""
  echo -e "${YELLOW}⚠️  Några tester failade. Kontrollera felmeddelandena ovan.${NC}"
  echo ""
  echo "Vanliga orsaker:"
  echo "  - TypeScript-fel: kör 'npx tsc --noEmit' för detaljer"
  echo "  - Import-fel: kontrollera att alle filer skapades korrekt"
  echo ""
fi
