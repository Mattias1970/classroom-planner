import type { LessonTemplate, ScheduledLesson } from '../domain/index.js';
import { getCurrentVersion } from './versioning.js';

export interface FlipMessage {
  socrativeRoom: string;
  socrativeUrl: string;
  subject: string;
  greeting: string;
  blocksHtml: string[];
  homeworkConcepts: string[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Ren funktion: bygger flippat klassrum-utskicket för en schemalagd lektion. */
export function buildFlip(
  scheduled: ScheduledLesson,
  template: LessonTemplate,
  roomResolver: (classId: string) => string,
): FlipMessage {
  const content = getCurrentVersion(template).content;
  const blocksHtml = content.flippat.blocks.map((b) => {
    switch (b.typ) {
      case 'text': return `<p>${esc(b.text)}</p>`;
      case 'film': return `<p>🎬 <a href="${esc(b.ref.url)}">${esc(b.ref.titel)}</a></p>`;
      case 'quiz': return `<p>❓ <a href="${esc(b.ref.url)}">${esc(b.ref.titel)}</a></p>`;
    }
  });
  return {
    socrativeRoom: roomResolver(scheduled.classId),
    socrativeUrl: 'https://socrative.com/',
    subject: content.rubrik,
    greeting: `Hej! Inför lektionen "${content.rubrik}" den ${scheduled.date}:`,
    blocksHtml,
    homeworkConcepts: content.conceptIds.map(String),
  };
}
