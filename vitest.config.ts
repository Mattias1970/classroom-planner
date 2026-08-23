import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    include: ['packages/*/test/**/*.test.ts', 'packages/*/test/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@planner/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@planner/kernel': resolve(__dirname, 'packages/kernel/src/index.ts'),
    },
  },
});
