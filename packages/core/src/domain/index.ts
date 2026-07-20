/**
 * Domäntyper — återuppbyggda (sprint 13-om) enligt testspecifikationen
 * och dataspecen för classroom-planner-data.
 */
export type BookId = string & { readonly __brand: 'BookId' };
export type ClassId = string & { readonly __brand: 'ClassId' };
export type ConceptId = string & { readonly __brand: 'ConceptId' };
export type TemplateId = string & { readonly __brand: 'TemplateId' };
export type VersionId = string & { readonly __brand: 'VersionId' };
export type ScheduledLessonId = string & { readonly __brand: 'ScheduledLessonId' };

export type BamKind = 'quiz' | 'lecture' | 'work' | 'exit' | 'custom';
export interface BamRow { label: string; minutes: number; kind: BamKind; }
export interface TimedBamRow extends BamRow { from: string; to: string; }

export interface MediaRef { titel: string; url: string; källa?: string; plattform?: string; }
export type FlipBlock =
  | { typ: 'text'; text: string }
  | { typ: 'film'; ref: MediaRef }
  | { typ: 'quiz'; ref: MediaRef };
export interface FlipSettings {
  socrativeRoom: string;
  sändDag: 'dag-före' | 'samma-dag';
  sändTid: string;
}
export interface FlipContent { blocks: FlipBlock[]; settings: FlipSettings; }

export interface QuizRef { titel: string; url: string; plattform?: string; }
export interface LessonContent {
  rubrik: string;
  mål: string;
  subject: string;
  bookId?: BookId;
  chapterId?: string;
  subchapterId?: string;
  årskurs: number;
  längdMin: number;
  del: number;
  arbetsmoment: string[];
  metoder: string[];
  conceptIds: ConceptId[];
  filmer: MediaRef[];
  quizzes: QuizRef[];
  magma: MediaRef[];
  flippat: FlipContent;
  bam: BamRow[];
}

export interface LessonVersion {
  id: VersionId;
  createdAt: string;
  label: string;
  content: LessonContent;
}
export interface LessonTemplate {
  id: TemplateId;
  currentVersionId: VersionId;
  versions: LessonVersion[];
}

export type LessonStatus = 'planerad' | 'genomförd' | 'inställd';
export interface ExternalRef { system: string; id: string; url?: string; }
export interface ScheduledLesson {
  id: ScheduledLessonId;
  templateId: TemplateId;
  versionId: VersionId;
  classId: ClassId;
  date: string;
  startTime: string;
  endTime: string;
  locked: boolean;
  status: LessonStatus;
  externalRefs: ExternalRef[];
}

export interface KnowledgeDimension { id: string; label: string; typicalSources: string[]; }
export const KNOWLEDGE_DIMENSIONS: KnowledgeDimension[] = [
  { id: 'D1', label: 'Begrepp och modeller', typicalSources: ['läxförhör', 'exit ticket', 'begreppstest'] },
  { id: 'D2', label: 'Procedurer och metoder', typicalSources: ['magma', 'inlämning'] },
  { id: 'D3', label: 'Problemlösning', typicalSources: ['inlämning', 'prov'] },
  { id: 'D4', label: 'Resonemang och argumentation', typicalSources: ['muntlig aktivitet', 'lärarobservation'] },
  { id: 'D5', label: 'Kommunikation och redovisning', typicalSources: ['redovisning', 'inlämning'] },
  { id: 'D6', label: 'Samhälle/hållbarhet/konsekvenser', typicalSources: ['diskussion', 'projektarbete'] },
];
