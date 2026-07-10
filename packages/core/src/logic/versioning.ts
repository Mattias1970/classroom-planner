import type {
  LessonTemplate,
  LessonVersion,
  LessonContent,
  TemplateId,
  VersionId,
} from '../domain/index.js';
import { DomainError } from '../errors.js';

/** Injicerbar klocka — samma mönster som i Sprint 1 */
export type Clock = () => string;

/** Injicerbar ID-generator */
export type IdGen = () => string;

/**
 * Skapar en ny tom LessonTemplate med en initial version.
 * REN funktion — ingen I/O, ingen mutation.
 */
export function createTemplate(
  id: TemplateId,
  initialContent: LessonContent,
  clock: Clock,
  idGen: IdGen,
  label = 'v1'
): LessonTemplate {
  const versionId = idGen() as VersionId;
  const version: LessonVersion = {
    id: versionId,
    createdAt: clock(),
    label,
    content: initialContent,
  };
  return {
    id,
    currentVersionId: versionId,
    versions: [version],
  };
}

/**
 * Lägger till en ny version i en LessonTemplate.
 * REN funktion — muterar ALDRIG indata.
 *
 * Regler (testfacit C.1):
 * - Ny version läggs SIST i versions-arrayen
 * - currentVersionId pekas om till den nya versionen
 * - Befintliga versioner rörs aldrig
 * - Indata-templaten är OFÖRÄNDRAD efter anrop
 */
export function saveNewVersion(
  template: LessonTemplate,
  newContent: LessonContent,
  clock: Clock,
  idGen: IdGen,
  label?: string
): LessonTemplate {
  const versionId = idGen() as VersionId;
  const versionLabel = label ?? `v${template.versions.length + 1}`;

  const newVersion: LessonVersion = {
    id: versionId,
    createdAt: clock(),
    label: versionLabel,
    content: newContent,
  };

  return {
    ...template,
    currentVersionId: versionId,
    versions: [...template.versions, newVersion],
  };
}

/**
 * Hämtar en specifik version från en template.
 * Kastar DomainError om versionId inte finns.
 */
export function getVersion(
  template: LessonTemplate,
  versionId: string
): LessonVersion {
  const found = template.versions.find((v) => v.id === versionId);
  if (!found) {
    throw new DomainError(
      'VERSION_NOT_FOUND',
      `Version '${versionId}' hittades inte i template '${template.id}'.`
    );
  }
  return found;
}

/**
 * Hämtar den aktuella versionen av en template.
 */
export function getCurrentVersion(template: LessonTemplate): LessonVersion {
  return getVersion(template, template.currentVersionId);
}
