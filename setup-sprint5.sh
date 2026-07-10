#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# classroom-planner — setup-sprint5.sh
#
# Kör detta i Codespaces-terminalen när Sprint 4 är klar:
#   bash setup-sprint5.sh
#
# Scriptet skapar Sprint 5-filer för app-services/use cases i core.
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
echo -e "${BLUE}  Classroom Planner — Sprint 5 setup       ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/core/src/logic/planning.ts" ]; then
  echo "❌  Sprint 4 verkar inte vara klar."
  echo "    Kör 'bash setup-sprint4.sh' först."
  exit 1
fi
ok "Sprint 4 hittad"

log "Skapar katalogstruktur..."
mkdir -p packages/core/src/app-services
mkdir -p packages/core/test/app-services
ok "Kataloger skapade"

log "Skapar app-services/lesson-use-cases.ts..."
cat > packages/core/src/app-services/lesson-use-cases.ts << 'USECASES'
import type { LessonContent, LessonTemplate, TemplateId, VersionId } from '../domain/index.js';
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
USECASES
ok "app-services/lesson-use-cases.ts"

log "Skapar app-services/index.ts..."
cat > packages/core/src/app-services/index.ts << 'APPINDEX'
export * from './lesson-use-cases.js';
APPINDEX
ok "app-services/index.ts"

log "Skapar tester..."
cat > packages/core/test/app-services/lesson-use-cases.test.ts << 'APPTEST'
import { describe, it, expect } from 'vitest';
import { createLesson, updateLesson } from '../../src/app-services/lesson-use-cases.js';
import { makeContent } from '../helpers/fixtures.js';

describe('lesson use cases', () => {
  it('createLesson skapar en template med initial version', () => {
    const template = createLesson({
      id: 'tmpl-1' as any,
      initialContent: makeContent({ rubrik: 'Intro' }),
      clock: () => '2026-09-01T00:00:00Z',
      idGen: () => 'v-1',
    });

    expect(template.versions).toHaveLength(1);
    expect(template.versions[0]?.content.rubrik).toBe('Intro');
  });

  it('updateLesson lägger till en ny version', () => {
    const template = createLesson({
      id: 'tmpl-2' as any,
      initialContent: makeContent({ rubrik: 'Första' }),
      clock: () => '2026-09-01T00:00:00Z',
      idGen: () => 'v-1',
    });

    const updated = updateLesson({
      template,
      content: makeContent({ rubrik: 'Andra' }),
      clock: () => '2026-09-02T00:00:00Z',
      idGen: () => 'v-2',
    });

    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[1]?.content.rubrik).toBe('Andra');
  });
});
APPTEST
ok "app-services tester"

echo ""
log "Kör npm test..."
echo ""

if npm test 2>&1; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Sprint 5 klar! Alla tester gröna.        ${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
else
  echo ""
  echo -e "${YELLOW}⚠️  Några tester failade. Kontrollera felmeddelandena ovan.${NC}"
fi
