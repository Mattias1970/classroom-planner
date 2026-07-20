import type { LessonTemplate } from '../domain/index.js';
import { getCurrentVersion } from './versioning.js';

export interface IndexRow {
  templateId: string;
  versionId: string;
  rubrik: string;
  mål: string;
  subject: string;
  chapterId?: string;
  subchapterId?: string;
  bookId?: string;
  conceptIds: string[];
}

export function projectToIndex(template: LessonTemplate): IndexRow {
  const c = getCurrentVersion(template).content;
  return {
    templateId: template.id,
    versionId: template.currentVersionId,
    rubrik: c.rubrik,
    mål: c.mål,
    subject: c.subject,
    chapterId: c.chapterId,
    subchapterId: c.subchapterId,
    bookId: c.bookId,
    conceptIds: c.conceptIds.map(String),
  };
}

export interface SearchQuery {
  text?: string;
  subchapterId?: string;
  bookId?: string;
  conceptId?: string;
}

export function search(rows: IndexRow[], q: SearchQuery): IndexRow[] {
  const text = q.text?.toLowerCase();
  return rows.filter((r) => {
    if (text && !r.rubrik.toLowerCase().includes(text) && !r.mål.toLowerCase().includes(text)) return false;
    if (q.subchapterId !== undefined && r.subchapterId !== q.subchapterId) return false;
    if (q.bookId !== undefined && r.bookId !== q.bookId) return false;
    if (q.conceptId !== undefined && !r.conceptIds.includes(q.conceptId)) return false;
    return true;
  });
}
