import type { LessonContent, LessonTemplate, TemplateId } from '../domain/index.js';
import { createTemplate, saveNewVersion } from '../logic/index.js';

export interface CreateLessonCommand {
  id: TemplateId;
  initialContent: LessonContent;
  clock: () => string;
  idGen: () => string;
}

export interface UpdateLessonCommand {
  template: LessonTemplate;
  content: LessonContent;
  clock: () => string;
  idGen: () => string;
  label?: string;
}

export function createLesson(command: CreateLessonCommand): LessonTemplate {
  return createTemplate(command.id, command.initialContent, command.clock, command.idGen);
}

export function updateLesson(command: UpdateLessonCommand): LessonTemplate {
  return saveNewVersion(command.template, command.content, command.clock, command.idGen, command.label);
}
