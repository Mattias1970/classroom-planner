#!/usr/bin/env bash
# classroom-planner — setup-sprint9.sh
#
# Sprint 9: Classroom-publicering — idempotent publishing via ExternalRef
# - ExternalRef types (Classroom item references)
# - Publication state tracking
# - Idempotent upsert logic for assignments, topics, etc.
#
# Kör i Codespaces efter Sprint 8:
#   bash setup-sprint9.sh
#   npm test

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Classroom Planner — Sprint 9            ${NC}"
echo -e "${BLUE}  Classroom-publicering (idempotent)      ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/core/src/domain/auth.ts" ]; then
  echo "❌  Sprint 8 krävs. Kör setup-sprint8.sh."
  exit 1
fi
ok "Tidigare sprint hittad"

mkdir -p packages/core/src/domain
mkdir -p packages/core/src/logic
mkdir -p packages/core/test
ok "Kataloger klara"

# ──────────────────────────────────────────────────
log "packages/core/src/domain/publication.ts..."
cat > packages/core/src/domain/publication.ts << 'XEOF9_DELIM_X'
/**
 * Publication domain — Classroom-publicering och ExternalRef tracking.
 * Ring 1: NOLL externa beroenden.
 *
 * Invariant I4: Publicering är idempotent via ExternalRef.
 * En gång publicerad, kan ett item uppdateras eller tas bort,
 * men samma sourceId + sourceItemId kopplas alltid till samma Classroom-item.
 */

export type PublicationRefId = string & { readonly __b: 'PublicationRefId' };
export type ClassroomAssignmentId = string & { readonly __b: 'ClassroomAssignmentId' };
export type ClassroomTopicId = string & { readonly __b: 'ClassroomTopicId' };
export type ClassroomMaterialId = string & { readonly __b: 'ClassroomMaterialId' };

export function asPublicationRefId(s: string): PublicationRefId {
  return s as PublicationRefId;
}

export function asClassroomAssignmentId(s: string): ClassroomAssignmentId {
  return s as ClassroomAssignmentId;
}

export function asClassroomTopicId(s: string): ClassroomTopicId {
  return s as ClassroomTopicId;
}

export function asClassroomMaterialId(s: string): ClassroomMaterialId {
  return s as ClassroomMaterialId;
}

/**
 * ExternalRef: Maps internal sourceId+sourceItemId to Classroom ID.
 * Enabler för idempotent upsert.
 */
export interface ExternalRef {
  id: PublicationRefId;
  sourceId: string; // e.g. 'lesson-plan-v1', 'import-prio-mat-8'
  sourceItemId: string; // e.g. 'lesson-1-1-ex1', 'course-link-123'
  classroomItemType: 'assignment' | 'topic' | 'material' | 'coursework';
  classroomItemId: ClassroomAssignmentId | ClassroomTopicId | ClassroomMaterialId | string;
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
  metadata?: Record<string, unknown>; // Extra data för senare use
}

/**
 * PublicationState: Spårar status för en publicerad lektion/uppgift.
 */
export enum PublicationState {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  UPDATED = 'UPDATED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * PublishedLesson: Lektion som publicerats till Classroom.
 * Tracking av Classroom ID:n för alla sub-items (topic, assignments, etc).
 */
export interface PublishedLesson {
  id: string & { readonly __b: 'PublishedLessonId' };
  lessonId: string;
  courseLink: { teacherId: string; googleCourseId: string };
  state: PublicationState;
  topicRef?: ExternalRef; // Classroom topic för denna lektion
  assignmentRefs: ExternalRef[]; // En per exercise-range (grön, blå, röd)
  materialRefs: ExternalRef[]; // Teori-sidor, koncept-resurser
  publishedAt: string; // ISO8601
  updatedAt: string; // ISO8601
  syncedAt?: string; // Senaste synk av status från Classroom
}

/**
 * Feltyper för publication-domänen.
 */
export class PublicationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    Object.setPrototypeOf(this, PublicationError.prototype);
  }
}

export class IdempotencyError extends PublicationError {
  constructor(message = 'Item already published with different external ID') {
    super(message, 'IDEMPOTENCY_VIOLATION');
    Object.setPrototypeOf(this, IdempotencyError.prototype);
  }
}

export class ClassroomSyncError extends PublicationError {
  constructor(message: string) {
    super(message, 'CLASSROOM_SYNC_ERROR');
    Object.setPrototypeOf(this, ClassroomSyncError.prototype);
  }
}
XEOF9_DELIM_X
ok "packages/core/src/domain/publication.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/domain/index.ts (update)..."
if ! grep -q "export.*from './publication" packages/core/src/domain/index.ts; then
  cat >> packages/core/src/domain/index.ts << 'XEOF9_EXPORT_X'
export * from './publication.js';
XEOF9_EXPORT_X
fi
ok "packages/core/src/domain/index.ts (updated)"

# ──────────────────────────────────────────────────
log "packages/core/src/logic/publication-logic.ts..."
cat > packages/core/src/logic/publication-logic.ts << 'XEOF9_DELIM_X'
/**
 * Ren publikationslogik: idempotent upsert, ref-tracking, state-transitions.
 * NOLL externa I/O-beroenden.
 */

import type { ExternalRef, PublishedLesson } from '../domain/publication.js';
import { PublicationState, IdempotencyError, PublicationError } from '../domain/publication.js';
import {
  asPublicationRefId,
  asClassroomAssignmentId,
} from '../domain/publication.js';

/**
 * Skapar en ny ExternalRef för en publicerad item.
 * Idempotent baserat på sourceId + sourceItemId.
 */
export function createExternalRef(
  sourceId: string,
  sourceItemId: string,
  classroomItemType: 'assignment' | 'topic' | 'material' | 'coursework',
  classroomItemId: string,
  nowIso: string
): ExternalRef {
  if (!sourceId || sourceId.trim() === '') {
    throw new PublicationError('sourceId is required', 'INVALID_SOURCE_ID');
  }
  if (!sourceItemId || sourceItemId.trim() === '') {
    throw new PublicationError('sourceItemId is required', 'INVALID_SOURCE_ITEM_ID');
  }
  if (!classroomItemId || classroomItemId.trim() === '') {
    throw new PublicationError('classroomItemId is required', 'INVALID_CLASSROOM_ID');
  }

  return {
    id: asPublicationRefId(`ref-${sourceId}-${sourceItemId}-${Date.now()}`),
    sourceId,
    sourceItemId,
    classroomItemType,
    classroomItemId: asClassroomAssignmentId(classroomItemId),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Validerar idempotens: om samma sourceId+sourceItemId finns redan,
 * måste classroomItemId matcha. Annars kastar IdempotencyError.
 */
export function validateIdempotency(
  existing: ExternalRef | undefined,
  sourceId: string,
  sourceItemId: string,
  classroomItemId: string
): void {
  if (!existing) {
    return; // Första gången — OK
  }
  if (existing.sourceId === sourceId && existing.sourceItemId === sourceItemId) {
    if (existing.classroomItemId !== classroomItemId) {
      throw new IdempotencyError(
        `Source (${sourceId}/${sourceItemId}) redan mappad till ${existing.classroomItemId}, ` +
        `kan inte mappa till ${classroomItemId}`
      );
    }
  }
}

/**
 * Transiterar en PublishedLesson mellan tillstånd.
 * DRAFT -> PUBLISHED (vid första publicering)
 * PUBLISHED/UPDATED -> UPDATED (vid uppdatering)
 * Alla -> ARCHIVED (vid borttagning)
 */
export function transitionState(
  current: PublicationState,
  action: 'publish' | 'update' | 'archive'
): PublicationState {
  switch (action) {
    case 'publish':
      if (current === PublicationState.DRAFT) {
        return PublicationState.PUBLISHED;
      }
      throw new PublicationError(
        `Cannot publish from state ${current}`,
        'INVALID_STATE_TRANSITION'
      );

    case 'update':
      if (current === PublicationState.PUBLISHED || current === PublicationState.UPDATED) {
        return PublicationState.UPDATED;
      }
      throw new PublicationError(
        `Cannot update from state ${current}`,
        'INVALID_STATE_TRANSITION'
      );

    case 'archive':
      if (current !== PublicationState.ARCHIVED) {
        return PublicationState.ARCHIVED;
      }
      return current;

    default:
      throw new PublicationError(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
  }
}
XEOF9_DELIM_X
ok "packages/core/src/logic/publication-logic.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/logic/index.ts (update)..."
if ! grep -q "export.*from './publication-logic" packages/core/src/logic/index.ts; then
  cat >> packages/core/src/logic/index.ts << 'XEOF9_EXPORT_X'
export * from './publication-logic.js';
XEOF9_EXPORT_X
fi
ok "packages/core/src/logic/index.ts (updated)"

# ──────────────────────────────────────────────────
log "packages/core/test/publication.test.ts..."
cat > packages/core/test/publication.test.ts << 'XEOF9_DELIM_X'
import { describe, it, expect } from 'vitest';
import {
  createExternalRef,
  validateIdempotency,
  transitionState,
} from '../src/logic/publication-logic.js';
import { PublicationState, IdempotencyError, PublicationError } from '../src/domain/publication.js';

describe('publication-logic', () => {
  it('skapar ExternalRef med giltiga indata', () => {
    const ref = createExternalRef(
      'lesson-plan-v1',
      'lesson-1-1-ex-groen',
      'assignment',
      '456abc',
      '2026-07-10T12:00:00Z'
    );
    expect(ref.sourceId).toBe('lesson-plan-v1');
    expect(ref.sourceItemId).toBe('lesson-1-1-ex-groen');
    expect(ref.classroomItemType).toBe('assignment');
  });

  it('kastar vid tom sourceId', () => {
    expect(() => {
      createExternalRef('', 'item1', 'assignment', '456abc', '2026-07-10T12:00:00Z');
    }).toThrow(PublicationError);
  });

  it('validerar idempotens vid samma source+item', () => {
    const ref1 = createExternalRef(
      'src1',
      'item1',
      'assignment',
      'classroom-123',
      '2026-07-10T12:00:00Z'
    );

    // Samma source+item, samma classroom-id → OK
    expect(() => {
      validateIdempotency(ref1, 'src1', 'item1', 'classroom-123');
    }).not.toThrow();

    // Samma source+item, ANNAN classroom-id → Error
    expect(() => {
      validateIdempotency(ref1, 'src1', 'item1', 'classroom-999');
    }).toThrow(IdempotencyError);
  });

  it('transiterar state DRAFT -> PUBLISHED', () => {
    const newState = transitionState(PublicationState.DRAFT, 'publish');
    expect(newState).toBe(PublicationState.PUBLISHED);
  });

  it('transiterar state PUBLISHED -> UPDATED', () => {
    const newState = transitionState(PublicationState.PUBLISHED, 'update');
    expect(newState).toBe(PublicationState.UPDATED);
  });

  it('kastar vid ogiltig transition', () => {
    expect(() => {
      transitionState(PublicationState.PUBLISHED, 'publish');
    }).toThrow(PublicationError);
  });
});
XEOF9_DELIM_X
ok "packages/core/test/publication.test.ts"

echo ""
log "Kör npm test..."
echo ""
if npm test 2>&1; then
  echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sprint 9 klar!                          ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
else
  echo ""
echo "Några tester failade. Kontrollera felmeddelandena ovan."
fi
