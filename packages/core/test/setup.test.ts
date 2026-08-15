import { describe, it, expect } from 'vitest';
import {
  validateSetup,
  isSetupComplete,
  canCreateOverview,
  parseLasar,
  formatLasar,
  parseHm,
  validateSchemaPass,
  deriveSetup,
  describeMissing,
  type PartialSetup,
  type SchemaPass,
} from '../src/domain/setup.js';

const giltigtSchema: SchemaPass[] = [
  { veckodag: 1, start: '08:10', slut: '09:10' },
  { veckodag: 3, start: '10:00', slut: '11:00' },
];

const komplett: PartialSetup = {
  lasar: '2026/2027',
  klass: '8B',
  amne: 'Matematik',
  amnesschema: giltigtSchema,
  bok: { titel: 'Prio Matematik 8', forlag: 'Sanoma', upplaga: '2' },
};

describe('parseLasar', () => {
  it('accepterar snedstreck, bindestreck och tankstreck', () => {
    expect(parseLasar('2026/2027')).toEqual({ start: 2026, slut: 2027 });
    expect(parseLasar('2026-2027')).toEqual({ start: 2026, slut: 2027 });
    expect(parseLasar('2026–2027')).toEqual({ start: 2026, slut: 2027 });
    expect(parseLasar(' 2026 / 2027 ')).toEqual({ start: 2026, slut: 2027 });
  });

  it('avvisar år som inte är på varandra följande', () => {
    expect(parseLasar('2026/2028')).toBeNull();
    expect(parseLasar('2027/2026')).toBeNull();
    expect(parseLasar('2026/2026')).toBeNull();
  });

  it('avvisar felformat', () => {
    expect(parseLasar('26/27')).toBeNull();
    expect(parseLasar('hösten 2026')).toBeNull();
    expect(parseLasar('')).toBeNull();
  });

  it('formatLasar är invers till parseLasar', () => {
    expect(formatLasar(2026)).toBe('2026/2027');
    expect(parseLasar(formatLasar(2026))).toEqual({ start: 2026, slut: 2027 });
  });
});

describe('parseHm', () => {
  it('tolkar giltiga tider', () => {
    expect(parseHm('08:10')).toBe(490);
    expect(parseHm('8:10')).toBe(490);
    expect(parseHm('23:59')).toBe(1439);
    expect(parseHm('00:00')).toBe(0);
  });

  it('avvisar ogiltiga tider', () => {
    expect(parseHm('24:00')).toBeNull();
    expect(parseHm('12:60')).toBeNull();
    expect(parseHm('12.30')).toBeNull();
    expect(parseHm('')).toBeNull();
  });
});

describe('validateSchemaPass', () => {
  it('godkänner ett giltigt pass', () => {
    expect(validateSchemaPass({ veckodag: 2, start: '13:00', slut: '14:00' })).toEqual([]);
  });

  it('kräver sluttid efter starttid', () => {
    const fel = validateSchemaPass({ veckodag: 2, start: '14:00', slut: '13:00' });
    expect(fel.length).toBe(1);
    expect(fel[0]).toContain('efter');
  });

  it('rapporterar ogiltig veckodag och tid', () => {
    const fel = validateSchemaPass({
      veckodag: 6 as SchemaPass['veckodag'],
      start: '25:00',
      slut: '26:00',
    });
    expect(fel.length).toBe(3);
  });
});

describe('validateSetup — spärren för de fem obligatoriska fälten', () => {
  it('komplett tillstånd passerar', () => {
    const v = validateSetup(komplett);
    expect(v.complete).toBe(true);
    expect(v.missing).toEqual([]);
    expect(v.issues).toEqual([]);
    expect(isSetupComplete(komplett)).toBe(true);
    expect(canCreateOverview(komplett)).toBe(true);
  });

  it('tomt tillstånd rapporterar alla fem fälten som saknade', () => {
    const v = validateSetup({});
    expect(v.complete).toBe(false);
    expect(v.missing).toEqual(['lasar', 'klass', 'amne', 'amnesschema', 'bok']);
    expect(canCreateOverview({})).toBe(false);
  });

  it.each([
    ['lasar', { ...komplett, lasar: null }],
    ['klass', { ...komplett, klass: '  ' }],
    ['amne', { ...komplett, amne: undefined }],
    ['amnesschema', { ...komplett, amnesschema: [] }],
    ['bok', { ...komplett, bok: { titel: '' } }],
  ] as const)('saknat fält %s blockerar översikten', (falt, setup) => {
    const v = validateSetup(setup as PartialSetup);
    expect(v.complete).toBe(false);
    expect(v.missing).toContain(falt);
    expect(canCreateOverview(setup as PartialSetup)).toBe(false);
  });

  it('ogiltigt läsår ger issue, inte missing', () => {
    const v = validateSetup({ ...komplett, lasar: '2026/2029' });
    expect(v.complete).toBe(false);
    expect(v.missing).not.toContain('lasar');
    expect(v.issues.some((i) => i.field === 'lasar')).toBe(true);
  });

  it('överlappande pass samma dag blockerar', () => {
    const v = validateSetup({
      ...komplett,
      amnesschema: [
        { veckodag: 1, start: '08:00', slut: '09:00' },
        { veckodag: 1, start: '08:30', slut: '09:30' },
      ],
    });
    expect(v.complete).toBe(false);
    expect(v.issues.some((i) => i.message.includes('överlappar'))).toBe(true);
  });

  it('pass på olika dagar med samma tider överlappar inte', () => {
    const v = validateSetup({
      ...komplett,
      amnesschema: [
        { veckodag: 1, start: '08:00', slut: '09:00' },
        { veckodag: 2, start: '08:00', slut: '09:00' },
      ],
    });
    expect(v.complete).toBe(true);
  });
});

describe('deriveSetup — automatisk härledning för befintlig komplett data (Prio 8)', () => {
  it('härleder komplett setup från fullständigt underlag', () => {
    const s = deriveSetup({
      lasarStart: 2026,
      klass: '8B',
      amne: 'Matematik',
      amnesschema: giltigtSchema,
      bokTitel: 'Prio Matematik 8',
      bokForlag: 'Sanoma',
      bokUpplaga: '2',
    });
    expect(s).not.toBeNull();
    expect(s?.lasar).toBe('2026/2027');
    expect(canCreateOverview(s ?? {})).toBe(true);
  });

  it('returnerar null vid ofullständigt underlag i stället för att kasta', () => {
    const s = deriveSetup({
      lasarStart: 2026,
      klass: '8X',
      amne: 'Matematik',
      amnesschema: [],
      bokTitel: 'Ny bok',
    });
    expect(s).toBeNull();
  });
});

describe('describeMissing', () => {
  it('listar saknade fält med svenska etiketter', () => {
    const text = describeMissing(validateSetup({ klass: '8F' }));
    expect(text).toContain('Läsår');
    expect(text).toContain('Ämnesschema');
    expect(text).toContain('Bok');
    expect(text).not.toContain('Klass,');
  });

  it('bekräftar komplett initiering', () => {
    expect(describeMissing(validateSetup(komplett))).toBe('Initieringen är komplett.');
  });
});
