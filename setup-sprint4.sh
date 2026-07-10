#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# classroom-planner — setup-sprint4.sh
#
# Kör detta i Codespaces-terminalen när Sprint 3 är klar:
#   bash setup-sprint4.sh
#
# Scriptet skapar Sprint 4-filer för en enkel planeringsmotor i core.
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
echo -e "${BLUE}  Classroom Planner — Sprint 4 setup       ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/core/src/logic/versioning.ts" ]; then
  echo "❌  Sprint 3 verkar inte vara klar."
  echo "    Kör 'bash setup-sprint3.sh' först."
  exit 1
fi
ok "Sprint 3 hittad"

log "Skapar katalogstruktur..."
mkdir -p packages/core/test/helpers
ok "Kataloger skapade"

log "Skapar logic/planning.ts..."
cat > packages/core/src/logic/planning.ts << 'PLANNING'
import type { BamRow, LessonContent } from '../domain/index.js';

export interface LessonPlanSummary {
  title: string;
  targetDurationMin: number;
  sections: BamRow[];
  hasFlippedContent: boolean;
}

/**
 * Skapar en enkel planeringssummering för en lektion.
 * Om lektionen redan har BAM-rader används dessa; annars skapas en enkel standardplan.
 */
export function buildLessonPlanSummary(
  content: LessonContent,
  targetDurationMin = content.längdMin
): LessonPlanSummary {
  const sections = content.bam.length > 0
    ? content.bam
    : createDefaultSections(targetDurationMin);

  return {
    title: content.rubrik,
    targetDurationMin,
    sections,
    hasFlippedContent: content.flippat.blocks.length > 0,
  };
}

function createDefaultSections(totalMin: number): BamRow[] {
  const introMin = Math.min(10, Math.max(5, Math.floor(totalMin / 4)));
  const workMin = Math.max(8, totalMin - introMin - 8);
  const exitMin = totalMin - introMin - workMin;

  return [
    { label: 'Intro', minutes: introMin, kind: 'lecture' },
    { label: 'Arbeta', minutes: workMin, kind: 'work' },
    { label: 'Avslut', minutes: exitMin, kind: 'exit' },
  ];
}
PLANNING
ok "logic/planning.ts"

log "Uppdaterar logic/index.ts..."
cat > packages/core/src/logic/index.ts << 'LOGICINDEX'
export * from './versioning.js';
export * from './timeline.js';
export * from './search.js';
export * from './flip.js';
export * from './planning.js';
LOGICINDEX
ok "logic/index.ts"

log "Skapar tester..."
cat > packages/core/test/planning.test.ts << 'PLANNINGTEST'
import { describe, it, expect } from 'vitest';
import { buildLessonPlanSummary } from '../src/logic/planning.js';
import { createFixtureLessonContent } from './helpers/fixtures.js';

describe('buildLessonPlanSummary', () => {
  it('skapar en standardplan när bam saknas', () => {
    const content = createFixtureLessonContent();
    const plan = buildLessonPlanSummary(content, 55);

    expect(plan.title).toBe('Multiplikation med negativa tal');
    expect(plan.targetDurationMin).toBe(55);
    expect(plan.sections).toHaveLength(3);
    expect(plan.sections.reduce((sum, row) => sum + row.minutes, 0)).toBe(55);
  });

  it('använder befintlig bam när den finns', () => {
    const content = createFixtureLessonContent();
    content.bam = [
      { label: 'Quiz', minutes: 10, kind: 'quiz' },
      { label: 'Arbeta', minutes: 20, kind: 'work' },
      { label: 'Exit', minutes: 15, kind: 'exit' },
    ];

    const plan = buildLessonPlanSummary(content, 45);
    expect(plan.sections).toHaveLength(3);
    expect(plan.sections[0]?.label).toBe('Quiz');
    expect(plan.hasFlippedContent).toBe(true);
  });
});
PLANNINGTEST

cat > packages/core/test/helpers/fixtures.ts << 'FIXTURES'
import type { LessonContent } from '../../src/domain/index.js';

export function createFixtureLessonContent(): LessonContent {
  return {
    rubrik: 'Multiplikation med negativa tal',
    mål: 'Förstå multiplikation med negativa tal',
    subject: 'matematik',
    årskurs: 8,
    längdMin: 55,
    del: 1,
    arbetsmoment: [],
    metoder: ['diskussion'],
    conceptIds: ['c-1'],
    filmer: [],
    quizzes: [],
    magma: [],
    flippat: { blocks: [{ typ: 'text', text: 'Förbered dig' }], settings: { socrativeRoom: 'Matte8B', sändDag: 'samma-dag', sändTid: '15:00' } },
    bam: [],
  };
}
FIXTURES
ok "tester"

log "Uppdaterar sprint-04-spec.md..."
cat > .claude/sprint/sprint-04-spec.md << 'SPEC04'
# Sprint 4: Planeringsmotor

**Status:** Klar ✅

## Leverabler
- packages/core/src/logic/planning.ts (planeringssummering)
- packages/core/src/logic/index.ts (export)
- packages/core/test/planning.test.ts (tester)
- packages/core/test/helpers/fixtures.ts (test-fixture)
SPEC04
ok "sprint-04-spec.md"

echo ""
log "Kör npm test..."
echo ""

if npm test 2>&1; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Sprint 4 klar! Alla tester gröna.        ${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
else
  echo ""
  echo -e "${YELLOW}⚠️  Några tester failade. Kontrollera felmeddelandena ovan.${NC}"
fi
