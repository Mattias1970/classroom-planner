/**
 * Initiering av en planering (setup-wizard).
 *
 * Fem obligatoriska delar krävs innan en översikt får skapas:
 *   1. Läsår        — t.ex. "2026/2027"
 *   2. Klass        — t.ex. "8B"
 *   3. Ämne         — t.ex. "Matematik"
 *   4. Ämnesschema  — veckans lektionspass med tider
 *   5. Bok          — läromedlet planeringen bygger på
 *
 * Ring 1: ren logik. Ingen DOM, ingen lagring, inget nätverk (invariant I2).
 */

export type SetupField = 'lasar' | 'klass' | 'amne' | 'amnesschema' | 'bok';

export const SETUP_FIELDS: readonly SetupField[] = [
  'lasar',
  'klass',
  'amne',
  'amnesschema',
  'bok',
] as const;

export const SETUP_FIELD_LABELS: Record<SetupField, string> = {
  lasar: 'Läsår',
  klass: 'Klass',
  amne: 'Ämne',
  amnesschema: 'Ämnesschema',
  bok: 'Bok',
};

/** Standardämnen som erbjuds i initieringen; eget ämne kan alltid anges fritt. */
export const STANDARD_AMNEN: readonly string[] = [
  'Matematik',
  'Biologi',
  'Fysik',
  'Kemi',
  'Teknik',
] as const;

/** Ett återkommande lektionspass i veckoschemat. Veckodag 1 = måndag … 5 = fredag. */
export interface SchemaPass {
  veckodag: 1 | 2 | 3 | 4 | 5;
  /** Starttid "HH:MM" (24h). */
  start: string;
  /** Sluttid "HH:MM" (24h), måste vara efter start. */
  slut: string;
}

export interface BokRef {
  titel: string;
  forlag?: string;
  upplaga?: string;
}

/** Komplett initieringstillstånd. Alla fält obligatoriska. */
export interface SetupState {
  /** Normaliserad form "ÅÅÅÅ/ÅÅÅÅ", t.ex. "2026/2027". */
  lasar: string;
  klass: string;
  amne: string;
  amnesschema: SchemaPass[];
  bok: BokRef;
}

/** Under uppbyggnad: alla fält kan saknas eller vara null. */
export type PartialSetup = {
  [K in keyof SetupState]?: SetupState[K] | null;
};

export interface SetupIssue {
  field: SetupField;
  message: string;
}

export interface SetupValidation {
  complete: boolean;
  /** Fält som saknas helt (tomma/null/ej ifyllda). */
  missing: SetupField[];
  /** Fält som är ifyllda men ogiltiga, med förklaring. */
  issues: SetupIssue[];
}

const VECKODAGSNAMN = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag'] as const;

export function veckodagsnamn(dag: SchemaPass['veckodag']): string {
  return VECKODAGSNAMN[dag - 1] ?? `dag ${String(dag)}`;
}

/**
 * Tolkar ett läsår skrivet som "2026/2027", "2026-2027" eller "2026–2027".
 * Returnerar null om formatet är fel eller åren inte är på varandra följande.
 */
export function parseLasar(input: string): { start: number; slut: number } | null {
  const m = /^\s*(\d{4})\s*[/\-–]\s*(\d{4})\s*$/.exec(input);
  if (!m) return null;
  const start = Number(m[1]);
  const slut = Number(m[2]);
  if (slut !== start + 1) return null;
  return { start, slut };
}

export function formatLasar(startAr: number): string {
  return `${startAr}/${startAr + 1}`;
}

/** Tolkar "HH:MM" till minuter sedan midnatt, eller null vid fel format. */
export function parseHm(hm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isBlank(s: unknown): boolean {
  return typeof s !== 'string' || s.trim().length === 0;
}

/** Validerar ett enskilt schemapass. Returnerar felmeddelanden (tom lista = giltigt). */
export function validateSchemaPass(pass: SchemaPass): string[] {
  const fel: string[] = [];
  if (!(pass.veckodag >= 1 && pass.veckodag <= 5)) {
    fel.push(`Ogiltig veckodag: ${String(pass.veckodag)} (tillåtet 1–5, måndag–fredag).`);
  }
  const start = parseHm(pass.start);
  const slut = parseHm(pass.slut);
  if (start === null) fel.push(`Ogiltig starttid "${pass.start}" (format HH:MM).`);
  if (slut === null) fel.push(`Ogiltig sluttid "${pass.slut}" (format HH:MM).`);
  if (start !== null && slut !== null && slut <= start) {
    fel.push(`Sluttiden ${pass.slut} måste vara efter starttiden ${pass.start}.`);
  }
  return fel;
}

/**
 * Fullständig validering av initieringstillståndet.
 * `missing` = fält som saknas, `issues` = ifyllda men ogiltiga fält.
 * `complete` är sant endast när inget saknas och inga fel finns.
 */
export function validateSetup(setup: PartialSetup): SetupValidation {
  const missing: SetupField[] = [];
  const issues: SetupIssue[] = [];

  // 1. Läsår
  if (setup.lasar == null || isBlank(setup.lasar)) {
    missing.push('lasar');
  } else if (parseLasar(setup.lasar) === null) {
    issues.push({
      field: 'lasar',
      message: `Läsåret "${setup.lasar}" måste skrivas som t.ex. "2026/2027" med två på varandra följande år.`,
    });
  }

  // 2. Klass
  if (setup.klass == null || isBlank(setup.klass)) {
    missing.push('klass');
  }

  // 3. Ämne
  if (setup.amne == null || isBlank(setup.amne)) {
    missing.push('amne');
  }

  // 4. Ämnesschema
  const schema = setup.amnesschema;
  if (schema == null || schema.length === 0) {
    missing.push('amnesschema');
  } else {
    for (const pass of schema) {
      for (const fel of validateSchemaPass(pass)) {
        issues.push({ field: 'amnesschema', message: fel });
      }
    }
    // Överlappande pass samma dag
    const perDag = new Map<number, { start: number; slut: number }[]>();
    for (const pass of schema) {
      const start = parseHm(pass.start);
      const slut = parseHm(pass.slut);
      if (start === null || slut === null) continue;
      const list = perDag.get(pass.veckodag) ?? [];
      list.push({ start, slut });
      perDag.set(pass.veckodag, list);
    }
    for (const [dag, tider] of perDag) {
      tider.sort((a, b) => a.start - b.start);
      for (let i = 1; i < tider.length; i++) {
        const nuv = tider[i];
        const forra = tider[i - 1];
        if (nuv !== undefined && forra !== undefined && nuv.start < forra.slut) {
          issues.push({
            field: 'amnesschema',
            message: `Två pass överlappar på ${veckodagsnamn(dag as SchemaPass['veckodag'])}.`,
          });
        }
      }
    }
  }

  // 5. Bok
  if (setup.bok == null || isBlank(setup.bok.titel)) {
    missing.push('bok');
  }

  return { complete: missing.length === 0 && issues.length === 0, missing, issues };
}

/** Typvakt: sann endast när tillståndet är komplett och giltigt. */
export function isSetupComplete(setup: PartialSetup): setup is SetupState {
  return validateSetup(setup).complete;
}

/**
 * SPÄRREN: ingen översikt (eller annan planeringsvy) får skapas
 * förrän initieringen är komplett. All vy-gating går genom denna funktion.
 */
export function canCreateOverview(setup: PartialSetup): boolean {
  return isSetupComplete(setup);
}

/** Läsbar sammanfattning av vad som återstår, för UI:t. */
export function describeMissing(validation: SetupValidation): string {
  if (validation.complete) return 'Initieringen är komplett.';
  const delar: string[] = [];
  if (validation.missing.length > 0) {
    delar.push(
      `Saknas: ${validation.missing.map((f) => SETUP_FIELD_LABELS[f]).join(', ')}.`
    );
  }
  for (const issue of validation.issues) {
    delar.push(issue.message);
  }
  return delar.join(' ');
}

/**
 * Härleder ett komplett SetupState från en redan komplett planering
 * (t.ex. befintliga Prio Matematik 8 för 8B/8F). Kastar aldrig — returnerar
 * null om underlaget inte räcker, så att anroparen kan falla tillbaka
 * på wizarden i stället.
 */
export function deriveSetup(underlag: {
  lasarStart: number;
  klass: string;
  amne: string;
  amnesschema: SchemaPass[];
  bokTitel: string;
  bokForlag?: string;
  bokUpplaga?: string;
}): SetupState | null {
  const kandidat: PartialSetup = {
    lasar: formatLasar(underlag.lasarStart),
    klass: underlag.klass,
    amne: underlag.amne,
    amnesschema: underlag.amnesschema,
    bok: {
      titel: underlag.bokTitel,
      ...(underlag.bokForlag ? { forlag: underlag.bokForlag } : {}),
      ...(underlag.bokUpplaga ? { upplaga: underlag.bokUpplaga } : {}),
    },
  };
  return isSetupComplete(kandidat) ? kandidat : null;
}
