import { DomainError } from '../errors.js';
import type { LessonContent, LessonTemplate, LessonVersion, TemplateId, VersionId } from '../domain/index.js';

type Clock = () => string;
type IdGen = () => string;

export function createTemplate(
  id: TemplateId, content: LessonContent, clock: Clock, idGen: IdGen, label = 'v1',
): LessonTemplate {
  const version: LessonVersion = {
    id: idGen() as VersionId, createdAt: clock(), label, content: structuredClone(content),
  };
  return { id, currentVersionId: version.id, versions: [version] };
}

export function saveNewVersion(
  template: LessonTemplate, content: LessonContent, clock: Clock, idGen: IdGen, label?: string,
): LessonTemplate {
  const version: LessonVersion = {
    id: idGen() as VersionId,
    createdAt: clock(),
    label: label ?? `v${template.versions.length + 1}`,
    content: structuredClone(content),
  };
  return {
    ...template,
    currentVersionId: version.id,
    versions: [...template.versions, version],
  };
}

export function getVersion(template: LessonTemplate, versionId: string): LessonVersion {
  const v = template.versions.find((x) => x.id === versionId);
  if (!v) throw new DomainError('NOT_FOUND', `Versionen ${versionId} hittades inte i ${template.id}`);
  return v;
}

export function getCurrentVersion(template: LessonTemplate): LessonVersion {
  return getVersion(template, template.currentVersionId);
}
