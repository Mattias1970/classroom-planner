# Classroom Planner

Lektionsplaneringsapp med Google Classroom-integration för matematikundervisning i åk 8.
TypeScript monorepo · Sprint 1 av 22 klar.

## Kom igång

```bash
npm install
npm test        # 30/30 tester gröna
```

## Installera Claude Code (i Codespaces-terminalen)

```bash
npm install -g @anthropic-ai/claude-code
claude          # starta Sprint 2
```

## Arkitektur

```
Ring 3 — Ytor (web, dashboards)
Ring 2 — Adaptrar (Google, AI, Socrative, Magma)
Ring 1.5 — App Services (use cases, DI)
Ring 1 — Ren kärna (packages/core) ← NOLL externa dependencies
```

## Sprint-status

| Sprint | Innehåll | Status |
|--------|----------|--------|
| 1 | Projektgrund, monorepo, I1/I2, felmodell | ✅ Klar |
| 2 | Domäntyper (LessonContent, SourceRef) | ⬜ |
| 3 | Ren kärnlogik (versionering, BAM, sök) | ⬜ |
| 4 | Planeringsmotor | ⬜ |
| 5 | App-services / use cases | ⬜ |
| 6 | Lokal webbapp (B1–B36 paritet) | ⬜ |
| 7–22 | Se CLAUDE.md | ⬜ |
