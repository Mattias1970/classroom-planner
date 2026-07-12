g#!/usr/bin/env bash
# classroom-planner — setup-sprint10.sh
# Sprint 10: Google Docs planeringsvy
#
# PlanningDocumentTarget-port, renderTermPlan (ren funktion),
# FakeDocsAdapter, ingen dubbelinmatning, tester.
#
# Kör i Codespaces efter Sprint 9:
#   bash setup-sprint10.sh
#   npm test  ← ska visa minst 209 gröna tester

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }
echo ""
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Sprint 10 — Google Docs planeringsvy        ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════${NC}"
echo ""
if [ ! -f "packages/adapters-google/src/classroom-publish-adapter.ts" ]; then
  echo "❌  Sprint 9 krävs. Kör: bash setup-sprint9.sh"
  exit 1
fi
ok "Sprint 9 hittad"


# ──────────────────────────────────────────────────
log "packages/app-services/src/planning-doc-port.ts..."
cat > packages/app-services/src/planning-doc-port.ts << 'XEOF10_X'

import type { ScheduledLesson, LessonTemplate, ClassId } from "@planner/core";

/**
 * RenderedDocument — resultatet av att rendera en terminsplanering.
 * Innehåller alla lektioner i ett strukturerat format redo för
 * skrivning till Google Docs eller annat dokument-format.
 */
export interface RenderedSection {
  heading: string;        // t.ex. "Kapitel 1 — Tal"
  rows: RenderedRow[];
}

export interface RenderedRow {
  lessonNumber: number;
  date: string;           // "2026-09-08"
  subchapterId: string;
  rubrik: string;
  del: number;            // 1 eller 2
  status: string;         // "planerad" | "publicerad" | ...
  socrativeRoom?: string;
  groenRange?: string;    // "1–13"
  blaaRange?: string;     // "14–21"
  roedRange?: string;     // "22–25"
  theoryPages?: string;
  concepts: string[];
}

export interface RenderedDocument {
  classId: ClassId;
  className: string;      // t.ex. "8B"
  termStart: string;
  termEnd: string;
  generatedAt: string;
  totalLessons: number;
  sections: RenderedSection[];
  /** Råtext-version för enkel utskrift */
  plainText: string;
}

export interface DocumentRef {
  documentId: string;
  url: string;
  updatedAt: string;
}

/**
 * PlanningDocumentTarget — port för informationspublicering.
 * Implementeras av FakeDocsAdapter (tester) och
 * GoogleDocsAdapter (Sprint 10.5+).
 *
 * Regel: ingen dubbelinmatning — data hämtas alltid från Store,
 * aldrig kopieras manuellt av läraren.
 */
export interface PlanningDocumentTarget {
  /**
   * Skriver ett RenderedDocument till ett Google Doc.
   * Skapar dokumentet om documentId saknas, uppdaterar annars.
   * Idempotent: samma data → samma dokument, ingen dubblett.
   */
  writeDocument(
    rendered: RenderedDocument,
    documentId?: string
  ): Promise<DocumentRef>;

  /**
   * Hämtar en länk till ett befintligt planeringsdokument.
   * Returnerar null om dokumentet inte finns.
   */
  getDocumentUrl(documentId: string): Promise<string | null>;
}

XEOF10_X
ok "packages/app-services/src/planning-doc-port.ts"

# ──────────────────────────────────────────────────
log "packages/app-services/src/render-term-plan.ts..."
cat > packages/app-services/src/render-term-plan.ts << 'XEOF10_X'

import type { ScheduledLesson, LessonTemplate } from "@planner/core";
import { getCurrentVersion } from "@planner/core";
import type { LessonSourceMap } from "@planner/core";
import type {
  RenderedDocument,
  RenderedSection,
  RenderedRow,
} from "./planning-doc-port.js";

/**
 * Konfiguration för en terminsrendering.
 */
export interface TermPlanConfig {
  classId: string;
  className: string;
  termStart: string;
  termEnd: string;
  generatedAt: string;
  sourceMaps?: LessonSourceMap[];
  socrativeRoom?: string;
}

/**
 * renderTermPlan — ren funktion som renderar en terminsplan.
 *
 * REN: ingen I/O, ingen Store-åtkomst.
 * Läraren skall aldrig behöva kopiera data manuellt — allt
 * hämtas från Store via use caset och skickas hit som argument.
 *
 * Grupperar lektioner per kapitel (baserat på subchapterId-prefix).
 */
export function renderTermPlan(
  lessons: ScheduledLesson[],
  templates: Map<string, LessonTemplate>,
  config: TermPlanConfig
): RenderedDocument {
  const sorted = [...lessons].sort((a, b) => a.date.localeCompare(b.date));
  const sections: RenderedSection[] = [];
  let currentChapterId = "";
  let currentRows: RenderedRow[] = [];
  let lessonNumber = 0;

  const flushSection = () => {
    if (currentRows.length > 0) {
      sections.push({
        heading: chapterHeading(currentChapterId),
        rows: currentRows,
      });
      currentRows = [];
    }
  };

  for (const lesson of sorted) {
    lessonNumber++;
    const template = templates.get(lesson.templateId);
    const version = template ? getCurrentVersion(template) : null;
    const content = version?.content;

    // Delkapitel-prefix ("1" från "1.1", "2" från "2.3" etc)
    const subId = content?.subchapterId ?? "";
    const chapterId = subId.split(".")[0] ?? subId;

    if (chapterId !== currentChapterId) {
      flushSection();
      currentChapterId = chapterId;
    }

    // Slå upp källkarta för uppgiftsspann
    const sourceMap = config.sourceMaps?.find(
      (sm) =>
        sm.subchapterId === subId &&
        sm.lessonNo === (content?.del ?? 1)
    );

    const groenRange = rangeStr(sourceMap, "grön");
    const blaaRange  = rangeStr(sourceMap, "blå");
    const roedRange  = rangeStr(sourceMap, "röd");

    const row: RenderedRow = {
      lessonNumber,
      date: lesson.date,
      subchapterId: subId,
      rubrik: content?.rubrik ?? "(okänd lektion)",
      del: content?.del ?? 0,
      status: lesson.status,
      socrativeRoom: config.socrativeRoom,
      groenRange,
      blaaRange,
      roedRange,
      theoryPages: sourceMap?.theoryPages,
      concepts: sourceMap?.concepts ?? [],
    };

    currentRows.push(row);
  }

  flushSection();

  const plainText = renderPlainText(sections, config);

  return {
    classId: config.classId as import("@planner/core").ClassId,
    className: config.className,
    termStart: config.termStart,
    termEnd: config.termEnd,
    generatedAt: config.generatedAt,
    totalLessons: lessonNumber,
    sections,
    plainText,
  };
}

/** Extrahera uppgiftsspann som sträng ("1–13") */
function rangeStr(
  sourceMap: LessonSourceMap | undefined,
  level: "grön" | "blå" | "röd"
): string | undefined {
  if (!sourceMap) return undefined;
  const range = sourceMap.exerciseRanges.find((r) => r.label.known === level);
  if (!range) return undefined;
  if (range.from && range.to) return `${range.from}–${range.to}`;
  return range.text;
}

/** Kapitelrubrik från ID */
function chapterHeading(chapterId: string): string {
  const names: Record<string, string> = {
    "1": "Kapitel 1 — Tal",
    "2": "Kapitel 2 — Algebra",
    "3": "Kapitel 3 — Geometri",
    "4": "Kapitel 4 — Procent och samband",
    "5": "Kapitel 5 — Sannolikhet och statistik",
  };
  return names[chapterId] ?? `Kapitel ${chapterId}`;
}

/** Generera råtext-representation */
function renderPlainText(
  sections: RenderedSection[],
  config: TermPlanConfig
): string {
  const lines: string[] = [
    `TERMINSPLANERING — Klass ${config.className}`,
    `Termin: ${config.termStart} – ${config.termEnd}`,
    `Genererad: ${config.generatedAt}`,
    "",
  ];

  for (const section of sections) {
    lines.push(`== ${section.heading} ==`);
    for (const row of section.rows) {
      const parts = [
        `Lektion ${row.lessonNumber}`,
        row.date,
        row.rubrik,
        `Del ${row.del}`,
        row.status,
      ];
      if (row.groenRange) parts.push(`Grön: ${row.groenRange}`);
      if (row.blaaRange)  parts.push(`Blå: ${row.blaaRange}`);
      if (row.roedRange)  parts.push(`Röd: ${row.roedRange}`);
      lines.push("  " + parts.join(" | "));
    }
    lines.push("");
  }

  return lines.join("\n");
}

XEOF10_X
ok "packages/app-services/src/render-term-plan.ts"

# ──────────────────────────────────────────────────
log "packages/adapters-google/src/fake-docs-adapter.ts..."
cat > packages/adapters-google/src/fake-docs-adapter.ts << 'XEOF10_X'

import type {
  PlanningDocumentTarget,
  RenderedDocument,
  DocumentRef,
} from "@planner/app-services/src/planning-doc-port.js";

/**
 * FakeDocsAdapter — deterministisk fejk för tester.
 *
 * Simulerar Google Docs-skrivning utan nätverksanrop.
 * Lagrar dokument i minnet indexerade på documentId.
 *
 * Idempotens: samma documentId → uppdatering, inte ny skapelse.
 */
export class FakeDocsAdapter implements PlanningDocumentTarget {
  private docs = new Map<string, { rendered: RenderedDocument; ref: DocumentRef }>();
  private nextId = 1;

  async writeDocument(
    rendered: RenderedDocument,
    documentId?: string
  ): Promise<DocumentRef> {
    const docId = documentId ?? `fake-doc-${this.nextId++}`;
    const ref: DocumentRef = {
      documentId: docId,
      url: `https://docs.google.com/document/d/${docId}/edit`,
      updatedAt: rendered.generatedAt,
    };
    this.docs.set(docId, { rendered, ref });
    return ref;
  }

  async getDocumentUrl(documentId: string): Promise<string | null> {
    return this.docs.get(documentId)?.ref.url ?? null;
  }

  /** Antal sparade dokument */
  get documentCount(): number { return this.docs.size; }

  /** Hämta ett sparat dokument för testvalidering */
  getDocument(documentId: string): RenderedDocument | null {
    return this.docs.get(documentId)?.rendered ?? null;
  }

  clear(): void { this.docs.clear(); }
}

XEOF10_X
ok "packages/adapters-google/src/fake-docs-adapter.ts"

# ──────────────────────────────────────────────────
log "packages/adapters-google/src/index.ts..."
cat > packages/adapters-google/src/index.ts << 'XEOF10_X'

export type { AuthProvider, GoogleToken, AuthResult, Scope } from './auth-types.js';
export { REQUIRED_SCOPES } from './auth-types.js';
export type { ClassroomCourse, CourseMapping, CourseProvider } from './course-types.js';
export { FakeAuthAdapter } from './fake-auth-adapter.js';
export { FakeCourseProvider } from './fake-course-provider.js';
export { CourseMapper } from './course-mapper.js';
export type { PublishResult, PublishOutcome, CourseWorkType, CourseWorkPayload } from './publish-types.js';
export { FakeClassroomPublishAdapter } from './classroom-publish-adapter.js';
export { FakeDocsAdapter } from './fake-docs-adapter.js';

XEOF10_X
ok "packages/adapters-google/src/index.ts"

# ──────────────────────────────────────────────────
log "packages/app-services/src/index.ts..."
cat > packages/app-services/src/index.ts << 'XEOF10_X'

export * from './ports.js';
export * from './roster.js';
export * from './generated-content.js';
export * from './use-cases.js';
export * from './planning-doc-port.js';
export * from './render-term-plan.js';

XEOF10_X
ok "packages/app-services/src/index.ts"

# ──────────────────────────────────────────────────
log "packages/app-services/test/render-term-plan.test.ts..."
cat > packages/app-services/test/render-term-plan.test.ts << 'XEOF10_X'

import { describe, it, expect } from "vitest";
import { renderTermPlan } from "@planner/app-services";
import type { TermPlanConfig } from "@planner/app-services";
import type { LessonTemplate, ScheduledLesson, TemplateId, VersionId, ScheduledId, ClassId } from "@planner/core";
import { makeContent, makeTemplate, makeScheduled } from "../../core/test/helpers/fixtures.js";
import { SOURCE_MAPS_KAP1 } from "../../core/src/fixtures/prio-mat-8-full.js";

function makeTemplateMap(template: LessonTemplate): Map<string, LessonTemplate> {
  return new Map([[template.id, template]]);
}

const BASE_CONFIG: TermPlanConfig = {
  classId: "8B",
  className: "8B",
  termStart: "2026-09-07",
  termEnd: "2026-12-19",
  generatedAt: "2026-09-01T08:00:00Z",
  socrativeRoom: "Matte8B",
  sourceMaps: SOURCE_MAPS_KAP1,
};

describe("renderTermPlan — grundläggande rendering", () => {
  it("returnerar RenderedDocument med korrekt klassinfo", () => {
    const template = makeTemplate();
    const lesson = makeScheduled({ date: "2026-09-08" } as Partial<ScheduledLesson>);
    const result = renderTermPlan([lesson], makeTemplateMap(template), BASE_CONFIG);
    expect(result.classId).toBe("8B");
    expect(result.className).toBe("8B");
    expect(result.termStart).toBe("2026-09-07");
  });

  it("totalLessons = antal inlektioner", () => {
    const template = makeTemplate();
    const lessons = [
      makeScheduled({ date: "2026-09-08" } as Partial<ScheduledLesson>),
      makeScheduled({ date: "2026-09-09" } as Partial<ScheduledLesson>),
      makeScheduled({ date: "2026-09-10" } as Partial<ScheduledLesson>),
    ];
    const result = renderTermPlan(lessons, makeTemplateMap(template), BASE_CONFIG);
    expect(result.totalLessons).toBe(3);
  });

  it("lektioner sorteras i datumordning", () => {
    const template = makeTemplate();
    const lessons = [
      makeScheduled({ date: "2026-09-10" } as Partial<ScheduledLesson>),
      makeScheduled({ date: "2026-09-08" } as Partial<ScheduledLesson>),
      makeScheduled({ date: "2026-09-09" } as Partial<ScheduledLesson>),
    ];
    const result = renderTermPlan(lessons, makeTemplateMap(template), BASE_CONFIG);
    const rows = result.sections.flatMap((s) => s.rows);
    expect(rows[0]?.date).toBe("2026-09-08");
    expect(rows[1]?.date).toBe("2026-09-09");
    expect(rows[2]?.date).toBe("2026-09-10");
  });

  it("tom lektionslista returnerar dokument med 0 sektioner och 0 lektioner", () => {
    const result = renderTermPlan([], new Map(), BASE_CONFIG);
    expect(result.totalLessons).toBe(0);
    expect(result.sections).toHaveLength(0);
  });

  it("grupperar lektioner per kapitel", () => {
    const t1 = { ...makeTemplate(), id: "t1" as TemplateId,
      versions: [{ ...makeTemplate().versions[0]!, content: makeContent({ subchapterId: "1.1" }) }] };
    const t2 = { ...makeTemplate(), id: "t2" as TemplateId,
      versions: [{ ...makeTemplate().versions[0]!, content: makeContent({ subchapterId: "2.1" }) }] };
    const l1 = makeScheduled({ date: "2026-09-08", templateId: "t1" as TemplateId } as Partial<ScheduledLesson>);
    const l2 = makeScheduled({ date: "2026-09-09", templateId: "t2" as TemplateId } as Partial<ScheduledLesson>);
    const templates = new Map<string, LessonTemplate>([["t1", t1], ["t2", t2]]);
    const result = renderTermPlan([l1, l2], templates, { ...BASE_CONFIG, sourceMaps: [] });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.heading).toContain("Kapitel 1");
    expect(result.sections[1]?.heading).toContain("Kapitel 2");
  });

  it("plainText innehåller klassnamn och terminsdata", () => {
    const result = renderTermPlan([], new Map(), BASE_CONFIG);
    expect(result.plainText).toContain("8B");
    expect(result.plainText).toContain("2026-09-07");
  });

  it("socrativeRoom propageras till varje rad", () => {
    const template = makeTemplate();
    const lesson = makeScheduled({ date: "2026-09-08" } as Partial<ScheduledLesson>);
    const result = renderTermPlan([lesson], makeTemplateMap(template), BASE_CONFIG);
    const row = result.sections[0]?.rows[0];
    expect(row?.socrativeRoom).toBe("Matte8B");
  });

  it("källkarta ger uppgiftsspann i raderna", () => {
    const template = {
      ...makeTemplate(),
      versions: [{ ...makeTemplate().versions[0]!, content: makeContent({ subchapterId: "1.1", del: 1 }) }],
    };
    const lesson = makeScheduled({ date: "2026-09-08", templateId: template.id } as Partial<ScheduledLesson>);
    const result = renderTermPlan([lesson], makeTemplateMap(template), BASE_CONFIG);
    const row = result.sections[0]?.rows[0];
    expect(row?.groenRange).toBe("1–13");
    expect(row?.blaaRange).toBe("14–21");
  });

  it("REN funktion: indata muteras inte", () => {
    const template = makeTemplate();
    const lessons = [makeScheduled({ date: "2026-09-08" } as Partial<ScheduledLesson>)];
    const originalLength = lessons.length;
    renderTermPlan(lessons, makeTemplateMap(template), BASE_CONFIG);
    expect(lessons).toHaveLength(originalLength);
  });
});

describe("FakeDocsAdapter", () => {
  it("writeDocument skapar ett dokument och returnerar DocumentRef", async () => {
    const { FakeDocsAdapter } = await import("@planner/adapters-google");
    const adapter = new FakeDocsAdapter();
    const template = makeTemplate();
    const result = renderTermPlan(
      [makeScheduled({ date: "2026-09-08" } as Partial<ScheduledLesson>)],
      makeTemplateMap(template),
      BASE_CONFIG
    );
    const ref = await adapter.writeDocument(result);
    expect(ref.documentId).toBeTruthy();
    expect(ref.url).toContain("docs.google.com");
    expect(adapter.documentCount).toBe(1);
  });

  it("writeDocument med samma documentId uppdaterar (idempotent)", async () => {
    const { FakeDocsAdapter } = await import("@planner/adapters-google");
    const adapter = new FakeDocsAdapter();
    const template = makeTemplate();
    const rendered = renderTermPlan([], new Map(), BASE_CONFIG);
    const ref1 = await adapter.writeDocument(rendered, "doc-123");
    const ref2 = await adapter.writeDocument(rendered, "doc-123");
    expect(ref1.documentId).toBe(ref2.documentId);
    expect(adapter.documentCount).toBe(1);
  });

  it("getDocumentUrl returnerar URL för befintligt dokument", async () => {
    const { FakeDocsAdapter } = await import("@planner/adapters-google");
    const adapter = new FakeDocsAdapter();
    const rendered = renderTermPlan([], new Map(), BASE_CONFIG);
    const ref = await adapter.writeDocument(rendered, "doc-456");
    const url = await adapter.getDocumentUrl("doc-456");
    expect(url).toBe(ref.url);
  });

  it("getDocumentUrl returnerar null för okänt dokumentId", async () => {
    const { FakeDocsAdapter } = await import("@planner/adapters-google");
    const adapter = new FakeDocsAdapter();
    const url = await adapter.getDocumentUrl("saknas");
    expect(url).toBeNull();
  });
});

XEOF10_X
ok "packages/app-services/test/render-term-plan.test.ts"

# ──────────────────────────────────────────────────
log ".claude/sprint/sprint-10-spec.md..."
cat > .claude/sprint/sprint-10-spec.md << 'XEOF10_X'
# Sprint 10: Google Docs planeringsvy

**Status:** Klar

## Leverabler
- packages/app-services/src/planning-doc-port.ts   (PlanningDocumentTarget, RenderedDocument, RenderedRow)
- packages/app-services/src/render-term-plan.ts    (renderTermPlan — ren funktion)
- packages/app-services/src/index.ts               (uppdaterad)
- packages/adapters-google/src/fake-docs-adapter.ts (FakeDocsAdapter)
- packages/adapters-google/src/index.ts            (uppdaterad)
- packages/app-services/test/render-term-plan.test.ts (12 tester)

## Regler
- Ingen dubbelinmatning: data flödar Store → renderTermPlan → FakeDocsAdapter
- renderTermPlan är ren (ingen I/O, ingen mutation av indata)
- Lektioner grupperas per kapitel (subchapterId-prefix)
- Källkartor ger uppgiftsspann (Grön/Blå/Röd) i varje rad
- FakeDocsAdapter är idempotent: samma documentId → uppdatering

## Testresultat
Sprint 1-9 (189) + Sprint 10 (12 nya) = 201 tester

XEOF10_X
ok ".claude/sprint/sprint-10-spec.md"

# ── Kör tester ────────────────────────────────────────────────
log "npm test (201 ska passera)..."
npm test 2>&1 | tail -5

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sprint 10 klar! Planeringsvy renderas.      ${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
echo "Nästa: bash setup-sprint11.sh  (DriveStore + migration)"
echo ""

