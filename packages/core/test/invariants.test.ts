import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.startsWith('__')) {
      files.push(full);
    }
  }
  return files;
}

function findViolations(files: string[], pattern: RegExp): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (pattern.test(line)) {
        violations.push(file.replace(CORE_SRC + '/', ''));
        break;
      }
    }
  }
  return violations;
}

const CORE_SRC = resolve('packages/core/src');
const CORE_PKG = resolve('packages/core/package.json');

describe('Invariant I2 — ren core (inga plattformsberoenden i kod)', () => {
  const files = collectTsFiles(CORE_SRC);

  const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
    { label: 'window.*',      pattern: /(?<!['\"./])\bwindow\.[a-zA-Z_$]/ },
    { label: 'document.*',    pattern: /(?<![/.'\"()])\bdocument\.[a-zA-Z_$]/ },
    { label: 'localStorage.*',pattern: /\blocalStorage\.[a-zA-Z_$]/ },
    { label: 'fetch(',        pattern: /\bfetch\s*\(/ },
    { label: 'googleapis',    pattern: /googleapis/ },
  ];

  for (const { label, pattern } of FORBIDDEN) {
    it(`Ingen kodrad i core/src anropar "${label}"`, () => {
      expect(findViolations(files, pattern)).toEqual([]);
    });
  }
});

describe('Invariant I1 — noll externa dependencies i core', () => {
  it('packages/core/package.json har inga dependencies', () => {
    const pkg = JSON.parse(readFileSync(CORE_PKG, 'utf-8')) as Record<string, unknown>;
    const deps = (pkg['dependencies'] as Record<string, string> | undefined) ?? {};
    expect(Object.keys(deps)).toHaveLength(0);
  });
});
