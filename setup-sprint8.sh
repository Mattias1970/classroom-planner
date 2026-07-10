#!/usr/bin/env bash
# classroom-planner — setup-sprint8.sh
#
# Sprint 8: Google Auth + kurskoppling
# - Google OAuth 2.0 integration types
# - Classroom course linking / koppling
# - Teacher identity / User domain
# - Token and session management domain
#
# Kör i Codespaces efter Sprint 7:
#   bash setup-sprint8.sh
#   npm test

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Classroom Planner — Sprint 8            ${NC}"
echo -e "${BLUE}  Google Auth + Kurskoppling              ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/core/src/import/importer.ts" ]; then
  echo "❌  Sprint 7 krävs. Kör setup-sprint7.sh."
  exit 1
fi
ok "Tidigare sprint hittad"

mkdir -p packages/core/src/domain
mkdir -p packages/core/test
ok "Kataloger klara"

# ──────────────────────────────────────────────────
log "packages/core/src/domain/auth.ts..."
cat > packages/core/src/domain/auth.ts << 'XEOF8_DELIM_X'
/**
 * Auth domain — Google OAuth 2.0 och sessionshantering.
 * Ring 1: NOLL externa beroenden.
 */

export type UserId = string & { readonly __b: 'UserId' };
export type RefreshToken = string & { readonly __b: 'RefreshToken' };
export type AccessToken = string & { readonly __b: 'AccessToken' };
export type GoogleClassroomCourseId = string & { readonly __b: 'GoogleClassroomCourseId' };
export type GoogleUserId = string & { readonly __b: 'GoogleUserId' };

export function asUserId(s: string): UserId {
  return s as UserId;
}

export function asRefreshToken(s: string): RefreshToken {
  return s as RefreshToken;
}

export function asAccessToken(s: string): AccessToken {
  return s as AccessToken;
}

export function asGoogleClassroomCourseId(s: string): GoogleClassroomCourseId {
  return s as GoogleClassroomCourseId;
}

export function asGoogleUserId(s: string): GoogleUserId {
  return s as GoogleUserId;
}

/**
 * OAuth token mottaget från Google.
 * Sparas säkert i session/db (aldrig i localStorage direkt).
 */
export interface OAuthToken {
  accessToken: AccessToken;
  refreshToken?: RefreshToken;
  expiresAt: string; // ISO8601
  scopes: string[];
}

/**
 * Lärare-identitet — kopplad till ett Google-konto.
 */
export interface Teacher {
  id: UserId;
  googleUserId: GoogleUserId;
  email: string;
  displayName: string;
  oauthToken: OAuthToken;
  createdAt: string; // ISO8601
  lastAuthAt: string; // ISO8601
}

/**
 * Koppling mellan en Teacher och ett Classroom-kurs.
 * En lärare kan koppla flera kurser; en kurs kopplas av EN lärare.
 */
export interface CourseLink {
  id: string & { readonly __b: 'CourseLinkId' };
  teacherId: UserId;
  googleCourseId: GoogleClassroomCourseId;
  googleCourseName: string;
  linkedAt: string; // ISO8601
  syncedAt?: string; // ISO8601 — senaste synk av klassrumslista
}

/**
 * Feltyper för auth-domänen.
 */
export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message = 'Invalid or expired token') {
    super(message, 'INVALID_TOKEN');
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

export class CourseLinkError extends AuthError {
  constructor(message: string) {
    super(message, 'COURSE_LINK_ERROR');
    Object.setPrototypeOf(this, CourseLinkError.prototype);
  }
}
XEOF8_DELIM_X
ok "packages/core/src/domain/auth.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/domain/index.ts (update)..."
# Lägg till auth.ts-export
if ! grep -q "export.*from './auth" packages/core/src/domain/index.ts; then
  cat >> packages/core/src/domain/index.ts << 'XEOF8_EXPORT_X'
export * from './auth.js';
XEOF8_EXPORT_X
fi
ok "packages/core/src/domain/index.ts (updated)"

# ──────────────────────────────────────────────────
log "packages/core/src/logic/auth-logic.ts..."
cat > packages/core/src/logic/auth-logic.ts << 'XEOF8_DELIM_X'
/**
 * Ren auth-logik: token-validering, course-link-skapande, etc.
 * NOLL externa I/O-beroenden.
 */

import type { Teacher, OAuthToken, CourseLink } from '../domain/auth.js';
import { InvalidTokenError, CourseLinkError } from '../domain/auth.js';
import {
  asUserId,
  asGoogleUserId,
  asAccessToken,
  asGoogleClassroomCourseId,
} from '../domain/auth.js';

/**
 * Kontrollerar om en OAuth token är utgångad.
 * @param token Token med expiresAt i ISO8601
 * @param nowIso ISO8601 tidsstämpel (test: kan injiceras)
 */
export function isTokenExpired(token: OAuthToken, nowIso: string = new Date().toISOString()): boolean {
  return nowIso >= token.expiresAt;
}

/**
 * Validerar token innan den används.
 * Kastar InvalidTokenError om utgångad.
 */
export function validateToken(token: OAuthToken): void {
  if (isTokenExpired(token)) {
    throw new InvalidTokenError('Token has expired');
  }
  if (token.scopes.length === 0) {
    throw new InvalidTokenError('Token has no scopes');
  }
}

/**
 * Skapar en CourseLink från raw Google Classroom data.
 * Validerar indata; kastar CourseLinkError vid ogiltiga värden.
 */
export function createCourseLink(
  teacherId: string,
  googleCourseId: string,
  googleCourseName: string,
  linkedAtIso: string
): CourseLink {
  if (!teacherId || teacherId.trim() === '') {
    throw new CourseLinkError('teacherId is required');
  }
  if (!googleCourseId || googleCourseId.trim() === '') {
    throw new CourseLinkError('googleCourseId is required');
  }
  if (!googleCourseName || googleCourseName.trim() === '') {
    throw new CourseLinkError('googleCourseName is required');
  }

  return {
    id: `link-${Date.now()}` as any,
    teacherId: asUserId(teacherId),
    googleCourseId: asGoogleClassroomCourseId(googleCourseId),
    googleCourseName: googleCourseName.trim(),
    linkedAt: linkedAtIso,
  };
}
XEOF8_DELIM_X
ok "packages/core/src/logic/auth-logic.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/logic/index.ts (update)..."
if ! grep -q "export.*from './auth-logic" packages/core/src/logic/index.ts; then
  cat >> packages/core/src/logic/index.ts << 'XEOF8_EXPORT_X'
export * from './auth-logic.js';
XEOF8_EXPORT_X
fi
ok "packages/core/src/logic/index.ts (updated)"

# ──────────────────────────────────────────────────
log "packages/core/test/auth.test.ts..."
cat > packages/core/test/auth.test.ts << 'XEOF8_DELIM_X'
import { describe, it, expect } from 'vitest';
import {
  isTokenExpired,
  validateToken,
  createCourseLink,
} from '../src/logic/auth-logic.js';
import { InvalidTokenError, CourseLinkError } from '../src/domain/auth.js';
import { asAccessToken } from '../src/domain/auth.js';

describe('auth-logic', () => {
  it('detekterar utgångna tokens', () => {
    const token = {
      accessToken: asAccessToken('abc123'),
      expiresAt: '2020-01-01T00:00:00Z',
      scopes: ['classroom'],
    };
    expect(isTokenExpired(token, '2020-01-02T00:00:00Z')).toBe(true);
    expect(isTokenExpired(token, '2019-12-31T00:00:00Z')).toBe(false);
  });

  it('kastar vid expired token', () => {
    const token = {
      accessToken: asAccessToken('abc123'),
      expiresAt: '2020-01-01T00:00:00Z',
      scopes: ['classroom'],
    };
    expect(() => {
      validateToken(token);
    }).toThrow(InvalidTokenError);
  });

  it('skapar CourseLink med giltiga indata', () => {
    const link = createCourseLink('teacher1', 'course123', 'Matematik 8A', '2026-07-10T12:00:00Z');
    expect(link.teacherId).toBe('teacher1');
    expect(link.googleCourseId).toBe('course123');
    expect(link.googleCourseName).toBe('Matematik 8A');
  });

  it('kastar CourseLinkError vid saknad googleCourseId', () => {
    expect(() => {
      createCourseLink('teacher1', '', 'Matematik 8A', '2026-07-10T12:00:00Z');
    }).toThrow(CourseLinkError);
  });
});
XEOF8_DELIM_X
ok "packages/core/test/auth.test.ts"

echo ""
log "Kör npm test..."
echo ""
if npm test 2>&1; then
  echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sprint 8 klar!                          ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
else
  echo ""
echo "Några tester failade. Kontrollera felmeddelandena ovan."
fi
