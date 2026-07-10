import { describe, it, expect } from 'vitest';
import {
  createTemplate,
  saveNewVersion,
  getVersion,
  getCurrentVersion,
  DomainError,
} from '@planner/core';
import type { TemplateId } from '@planner/core';
import { makeContent } from './helpers/fixtures.js';

const CLOCK = () => '2026-09-01T08:00:00Z';
const LATER  = () => '2026-09-02T08:00:00Z';
let counter  = 0;
const ID_GEN = () => `id-${++counter}`;

describe('C.1 — Versionering', () => {

  it('createTemplate skapar en template med en version', () => {
    const t = createTemplate('tmpl-1' as TemplateId, makeContent(), CLOCK, ID_GEN);
    expect(t.versions).toHaveLength(1);
    expect(t.currentVersionId).toBe(t.versions[0]?.id);
  });

  it('saveNewVersion lägger ny version SIST', () => {
    const t1 = createTemplate('tmpl-2' as TemplateId, makeContent(), CLOCK, ID_GEN);
    const t2 = saveNewVersion(t1, makeContent({ rubrik: 'Uppdaterad' }), LATER, ID_GEN);
    expect(t2.versions).toHaveLength(2);
    expect(t2.versions[1]?.content.rubrik).toBe('Uppdaterad');
  });

  it('saveNewVersion uppdaterar currentVersionId', () => {
    const t1 = createTemplate('tmpl-3' as TemplateId, makeContent(), CLOCK, ID_GEN);
    const oldId = t1.currentVersionId;
    const t2 = saveNewVersion(t1, makeContent(), LATER, ID_GEN);
    expect(t2.currentVersionId).not.toBe(oldId);
    expect(t2.currentVersionId).toBe(t2.versions[1]?.id);
  });

  it('saveNewVersion muterar INTE indata-templaten', () => {
    const t1 = createTemplate('tmpl-4' as TemplateId, makeContent(), CLOCK, ID_GEN);
    const originalLength = t1.versions.length;
    const originalId = t1.currentVersionId;
    saveNewVersion(t1, makeContent(), LATER, ID_GEN);
    expect(t1.versions).toHaveLength(originalLength);
    expect(t1.currentVersionId).toBe(originalId);
  });

  it('saveNewVersion rör inte befintliga versioner', () => {
    const t1 = createTemplate('tmpl-5' as TemplateId, makeContent({ rubrik: 'Original' }), CLOCK, ID_GEN);
    const t2 = saveNewVersion(t1, makeContent({ rubrik: 'Ny' }), LATER, ID_GEN);
    expect(t2.versions[0]?.content.rubrik).toBe('Original');
  });

  it('getVersion returnerar rätt version', () => {
    const t = createTemplate('tmpl-6' as TemplateId, makeContent(), CLOCK, ID_GEN);
    const v = getVersion(t, t.currentVersionId);
    expect(v.id).toBe(t.currentVersionId);
  });

  it('getVersion kastar DomainError vid okänd id', () => {
    const t = createTemplate('tmpl-7' as TemplateId, makeContent(), CLOCK, ID_GEN);
    expect(() => getVersion(t, 'finns-inte')).toThrow(DomainError);
  });

  it('getCurrentVersion returnerar aktuell version', () => {
    const t1 = createTemplate('tmpl-8' as TemplateId, makeContent(), CLOCK, ID_GEN);
    const t2 = saveNewVersion(t1, makeContent({ rubrik: 'Senaste' }), LATER, ID_GEN);
    expect(getCurrentVersion(t2).content.rubrik).toBe('Senaste');
  });

  it('label auto-numreras om inget anges', () => {
    const t1 = createTemplate('tmpl-9' as TemplateId, makeContent(), CLOCK, ID_GEN, 'v1');
    const t2 = saveNewVersion(t1, makeContent(), LATER, ID_GEN);
    expect(t2.versions[1]?.label).toBe('v2');
  });

  it('anpassat label sparas korrekt', () => {
    const t1 = createTemplate('tmpl-10' as TemplateId, makeContent(), CLOCK, ID_GEN);
    const t2 = saveNewVersion(t1, makeContent(), LATER, ID_GEN, 'efter pilot');
    expect(t2.versions[1]?.label).toBe('efter pilot');
  });
});
