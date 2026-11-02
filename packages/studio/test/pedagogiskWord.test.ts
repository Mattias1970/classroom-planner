// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { Packer } from 'docx';
import {
  bokFromValfriImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, pedagogiskPlanering, pedagogiskPlaneringForOmfang, registreraPlanering, sattLaborationsstandard, sattLektionsplan, sparaBok, tomStruktur,
} from '@planner/kernel';
import { byggPedagogiskPlanering } from '../src/pedagogiskWord.js';

describe('Del 134: Word-dokumentet Pedagogisk planering och provlapp', () => {
  it('bygger ett giltigt dokument med alla avsnitt, Binogi-länkar och planeringstabellen', async () => {
    const BOK = bokFromValfriImport(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8'));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    // 8B Biologi: lektionen på torsdagen, läxförhöret på fredagen — första lektionen torsdag v38 (17/9)
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 4, start: '09:45', slut: '10:55' }, { dag: 5, start: '08:10', slut: '09:10' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
    const pl = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const doc = byggPedagogiskPlanering(pl);
    const buf = await Packer.toBuffer(doc);
    expect(buf.byteLength).toBeGreaterThan(10_000);
    if (process.env.SKRIV_DOCX) writeFileSync(process.env.SKRIV_DOCX, buf);
    // Dokumentets XML innehåller avsnitten, länkarna och tabellen
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    for (const t of ['Pedagogisk planering och provlapp', 'Syfte', 'Viktiga begrepp', 'Innehåll', 'Binogi – filmer', 'Prov och bedömning', 'Studieteknik', 'Kort om förmågorna', 'Planering', '6.2 Matspjälkningen', 'Läxförhör:', 'Exit ticket', 'Biologi612', 'v38', 'PROV']) {
      expect(xml, t).toContain(t.replace(/&/g, '&amp;'));
    }
    expect(xml).toContain('Binogifilm');
    expect(xml).not.toMatch(/>Binogi</);                       // rubriken heter Binogifilm
    expect(xml).toContain('Begrepp 6.1\u2013\u0036.2');       // läxan är kumulativ (6.1–6.2)
    expect(xml).toContain('Torsdag');                          // första lektionen ligger på torsdagen i v38
    expect(rels).toContain('https://app.binogi.se/l/cellens-specialisering');
    expect((rels.match(/app\.binogi\.se/g) ?? []).length).toBeGreaterThanOrEqual(19);
  });
});

describe('Del 217: Word-dokumentet för ett omfång av delkapitel', () => {
  it('rubriken bär omfånget, syftet per kapitel, bara valda delkapitel under Innehåll', async () => {
    const BOK = bokFromValfriImport(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8'));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 4, start: '09:45', slut: '10:55' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
    const pl = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.2' }], '2026-09-14')!;
    const buf = await Packer.toBuffer(byggPedagogiskPlanering(pl));
    const { default: JSZip } = await import('jszip');
    const xml = (await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    expect(xml).toContain('(6.1–6.2)');
    expect(xml).toContain('6.2 Matspjälkningen');
    expect(xml).not.toContain('6.3 ');
  });
});

describe('Del 218: bokens "Några viktiga begrepp" i Word-dokumentet', () => {
  it('står under syftet, före avsnittet Viktiga begrepp', async () => {
    const rad = JSON.parse(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8')) as { kapitel: Array<Record<string, unknown>> };
    rad.kapitel[0].mal = ['beskriva hur kroppens celler är uppbyggda och hur de fungerar'];
    rad.kapitel[0].viktigaBegrepp = ['evolution', 'cellandning', 'stamcell', 'organsystem'];
    const BOK = bokFromValfriImport(JSON.stringify(rad));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 4, start: '09:45', slut: '10:55' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
    const pl = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const buf = await Packer.toBuffer(byggPedagogiskPlanering(pl));
    const { default: JSZip } = await import('jszip');
    const xml = (await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    const i = xml.indexOf('beskriva hur kroppens celler');
    const j = xml.indexOf('Några viktiga begrepp: evolution, cellandning, stamcell, organsystem');
    expect(i).toBeGreaterThan(-1); expect(j).toBeGreaterThan(i);
    expect(j).toBeLessThan(xml.indexOf('Innehåll'));
  });
});

describe('Del 220: sammanfattning, begrepp i två kolumner och Socrative-rummen i Word', () => {
  it('innehållet är bokens sammanfattning, begreppen står per delkapitel, rumstabellen har rum + delkapitel', async () => {
    const rad = JSON.parse(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8')) as { kapitel: Array<{ delkapitel: Array<Record<string, unknown>> }> };
    rad.kapitel[0].delkapitel[0].sammanfattning = 'Celler bildar vävnader, vävnader bildar organ och organ bildar organsystem.';
    const BOK = bokFromValfriImport(JSON.stringify(rad));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 4, start: '09:45', slut: '10:55' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
    const pl = pedagogiskPlaneringForOmfang(s, 'bi', [{ fran: '6.1', till: '6.2' }], '2026-09-14')!;
    const buf = await Packer.toBuffer(byggPedagogiskPlanering(pl));
    const { default: JSZip } = await import('jszip');
    const xml = (await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    for (const t of ['Innehåll – sammanfattning av varje delkapitel', 'Celler bildar vävnader, vävnader bildar organ', 'Viktiga begrepp per delkapitel', 'Socrative – öva begreppen', 'socrative.com', 'Student Login', 'Room Name', 'Biologi612', '6.1–6.2', 'läxförhör', 'exit ticket']) {
      expect(xml, t).toContain(t);
    }
    // begreppen står under sitt delkapitel: 6.1-rubriken före cellteorin, 6.2-rubriken före enzym
    const i61 = xml.indexOf('6.1 Celler, vävnader och organ', xml.indexOf('Viktiga begrepp per delkapitel'));
    const i62 = xml.indexOf('6.2 Matspjälkningen', i61);
    expect(xml.indexOf('cellteorin', i61)).toBeLessThan(i62);
    expect(xml.indexOf('enzym', i62)).toBeGreaterThan(i62);
    expect(xml).not.toContain('Biologi63');   // 6.3 ingår inte i omfånget
    // Prov-raden står före Socrative-avsnittet, som står före filmerna
    expect(xml.indexOf('Prov: PROV')).toBeLessThan(xml.indexOf('Socrative – öva begreppen'));
    expect(xml.indexOf('Socrative – öva begreppen')).toBeLessThan(xml.indexOf('Binogi – filmer'));
  });
});

describe('Del 223: den numrerade listan under Studieteknik har hängande indrag', () => {
  it('numreringsnivån definierar indent med hanging', async () => {
    const BOK = bokFromValfriImport(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8'));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 4, start: '09:45', slut: '10:55' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
    const buf = await Packer.toBuffer(byggPedagogiskPlanering(pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!));
    const { default: JSZip } = await import('jszip');
    const numbering = await (await JSZip.loadAsync(buf)).file('word/numbering.xml')!.async('string');
    expect(numbering).toMatch(/<w:lvl w:ilvl="0"[^>]*>(?:(?!<\/w:lvl>).)*<w:numFmt w:val="decimal"\/>(?:(?!<\/w:lvl>).)*<w:ind [^>]*w:hanging="360"/s);
  });
});

describe('Del 224: genomförda laborationer med frågeställning i Word', () => {
  it('står under "Lär dig hur man undersöker"; utan genomförda labbar en notis', async () => {
    const BOK = bokFromValfriImport(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8'));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, halvklass: true, schema: [{ dag: 1, start: '10:00', slut: '11:00' }, { dag: 4, start: '13:00', slut: '14:00' }], schemaB: [{ dag: 1, start: '10:00', slut: '11:00' }, { dag: 4, start: '14:10', slut: '15:10' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
    s = sattLaborationsstandard(s, 'bi', true, '2026-09-14');
    const fore = pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!;
    const lab1 = fore.veckor.flatMap((v) => v.dagar).find((d) => d.typ === 'laboration')!;
    s = sattLektionsplan(s, { id: 'lpL', amneId: 'bi', lektionsIndex: lab1.nr - 1, labFraga: 'Hur påverkar temperaturen enzymets aktivitet?' });
    const { default: JSZip } = await import('jszip');
    const text = async (pl: ReturnType<typeof pedagogiskPlanering>) => (await (await JSZip.loadAsync(await Packer.toBuffer(byggPedagogiskPlanering(pl!)))).file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
    const utan = await text(pedagogiskPlanering(s, 'bi', 6, '2026-09-14'));
    expect(utan).toContain('inga laborationer är genomförda än');
    const med = await text(pedagogiskPlanering(s, 'bi', 6, '2026-11-01'));
    expect(med).toContain('Laborationer vi har gjort');
    expect(med).toContain('Frågeställning: Hur påverkar temperaturen enzymets aktivitet?');
  });
});

describe('Del 225: klassen nämns inte i dokumentet', () => {
  it('varken klassnamn eller klassens Socrative-rum finns i texten', async () => {
    const BOK = bokFromValfriImport(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8'));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 4, start: '09:45', slut: '10:55' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: BOK.id, skapad: '2026-09-10' });
    const buf = await Packer.toBuffer(byggPedagogiskPlanering(pedagogiskPlanering(s, 'bi', 6, '2026-09-14')!));
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    const alltXml = (await Promise.all(['word/document.xml', 'word/footer1.xml'].map(async (f) => (await zip.file(f)?.async('string')) ?? ''))).join('').replace(/<[^>]+>/g, '');
    expect(alltXml).not.toMatch(/(^|[^\d])8B\b/);   // klassnamnet (inte '…678Binogifilm')
    expect(alltXml).not.toContain('Biologi8BB');
    expect(alltXml).toContain('Socrative: klassens rum');
    expect(alltXml).toContain('Biologi · Kap 6');
  });
});
