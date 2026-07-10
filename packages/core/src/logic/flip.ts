import type { ScheduledLesson, LessonTemplate, FlipBlock } from '../domain/index.js';
import { getCurrentVersion } from './versioning.js';

export interface FlipOutput {
  subject: string;
  greeting: string;
  blocksHtml: string[];       // ett HTML-fragment per block
  homeworkConcepts: string[]; // begreppstermer att öva till nästa lektion
  socrativeRoom: string;      // t.ex. "Matte8B"
  socrativeUrl: string;       // "https://socrative.com/"
}

/**
 * Bygger flippat-klassrum-innehåll från en schemalagd lektion + dess mall.
 *
 * REN funktion: ingen sändning, ingen I/O.
 * socrativeRoom slås upp via injicerad roomResolver
 * så att kärnan inte känner till klasslogik.
 */
export function buildFlip(
  scheduled: ScheduledLesson,
  template: LessonTemplate,
  roomResolver: (classId: string) => string
): FlipOutput {
  const version = getCurrentVersion(template);
  const content = version.content;
  const socrativeRoom = roomResolver(scheduled.classId);

  const greeting = buildGreeting(content.rubrik, scheduled.date);
  const blocksHtml = content.flippat.blocks.map(blockToHtml);
  const homeworkConcepts = content.conceptIds.map(String);

  return {
    subject: content.rubrik,
    greeting,
    blocksHtml,
    homeworkConcepts,
    socrativeRoom,
    socrativeUrl: 'https://socrative.com/',
  };
}

/** Bygger en hälsningsfras på svenska */
function buildGreeting(rubrik: string, date: string): string {
  return `Hej! Inför morgondagens lektion om "${rubrik}" (${date}) ber vi dig titta igenom följande material.`;
}

/** Omvandlar ett FlipBlock till ett HTML-fragment */
function blockToHtml(block: FlipBlock): string {
  switch (block.typ) {
    case 'text':
      return `<p>${escapeHtml(block.text ?? '')}</p>`;
    case 'film': {
      if (!block.ref || !('url' in block.ref)) return '<p>[Film saknar URL]</p>';
      const ref = block.ref as { titel: string; url: string; källa: string };
      return `<p>🎬 <a href="${escapeHtml(ref.url)}">${escapeHtml(ref.titel)}</a> (${escapeHtml(ref.källa)})</p>`;
    }
    case 'quiz': {
      if (!block.ref || !('url' in block.ref)) return '<p>[Quiz saknar URL]</p>';
      const ref = block.ref as { titel: string; url: string; plattform: string };
      return `<p>📝 <a href="${escapeHtml(ref.url)}">${escapeHtml(ref.titel)}</a> (${escapeHtml(ref.plattform)})</p>`;
    }
    default:
      return '<p>[Okänt blocktyp]</p>';
  }
}

/** Enkel HTML-escape för att undvika XSS i genererade fragment */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
