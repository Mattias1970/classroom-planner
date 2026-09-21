// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { Packer } from 'docx';
import {
  bokFromValfriImport, laggTillAmne, laggTillKlass, laggTillSkolar, laggTillTjanst, pedagogiskPlanering, registreraPlanering, sparaBok, tomStruktur,
} from '@planner/kernel';
import { byggPedagogiskPlanering } from '../src/pedagogiskWord.js';

describe('Del 134: Word-dokumentet Pedagogisk planering och provlapp', () => {
  it('bygger ett giltigt dokument med alla avsnitt, Binogi-länkar och planeringstabellen', async () => {
    const BOK = bokFromValfriImport(readFileSync(new URL('../../kernel/test/fixtures/spektrum-biologi-kap6.json', import.meta.url), 'utf8'));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-09-14', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, BOK);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
    s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: BOK.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 5, start: '10:00', slut: '11:00' }] });
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
    for (const t of ['Pedagogisk planering och provlapp', 'Syfte', 'Viktiga begrepp', 'Innehåll', 'Binogi – filmer', 'Prov och bedömning', 'Studieteknik', 'Kort om förmågorna', 'Planering', '6.2 Matspjälkningen', 'Läxförhör:', 'Exit ticket', 'Biologi612', 'v38', 'Måndag', 'PROV']) {
      expect(xml, t).toContain(t.replace(/&/g, '&amp;'));
    }
    expect(xml).toContain('Binogifilm');
    expect(xml).not.toMatch(/>Binogi</);                       // rubriken heter Binogifilm
    expect(xml).toContain('Begrepp 6.1\u2013\u0036.2');       // läxan är kumulativ (6.1–6.2)
    expect(rels).toContain('https://app.binogi.se/l/cellens-specialisering');
    expect((rels.match(/app\.binogi\.se/g) ?? []).length).toBeGreaterThanOrEqual(19);
  });
});
