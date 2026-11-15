/** Del 254 · Vites utvecklingsläge: `import.meta.hot` finns bara under `npm run dev` (se store.ts). */
interface ImportMeta {
  readonly hot?: { accept(cb?: () => void): void };
}
