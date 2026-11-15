import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Del 252: App.tsx är större än 500 kB — utan compact: false skriver Babel en rad om det vid varje start
  plugins: [react({ babel: { compact: false } })],
  base: './',
  resolve: { alias: { '@planner/kernel': resolve(__dirname, '../kernel/src/index.ts') } },
});
