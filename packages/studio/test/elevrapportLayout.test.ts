import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Packer } from 'docx';
import {
  bokFromValfriImport, elevanalys, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst,
  registreraPlanering, sparaBok, tomStruktur,
} from '@planner/kernel';
import { elevrapportDokument } from '../src/elevrapportLayout';

const FIXTUR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'kernel', 'test', 'fixtures', 'spektrum-biologi-kap6.json');

/** Klass med tre påhittade elever, fyra exit tickets och fyra aggregerande läxförhör. Pia: lär sig, vänder, glömmer ett begrepp, trycker fel en gång. */
function byggKlass(antalDk = 4, perDk = 4) {
  const bok = bokFromValfriImport(readFileSync(FIXTUR, 'utf8'));
  const raw = JSON.parse(readFileSync(FIXTUR, 'utf8'));
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = sparaBok(s, bok);
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', bokId: bok.id, schema: [{ dag: 1, start: '08:10', slut: '09:10' }, { dag: 5, start: '10:00', slut: '11:00' }] });
  s = registreraPlanering(s, { id: 'pl', amneId: 'bi', bokId: bok.id, skapad: '2026-08-10' });
  const elever = ['Pia Övnegård', 'Anna Testsson', 'Omar Provlund'];
  elever.forEach((n, i) => { s = laggTillElev(s, { id: `e${i}`, klassId: 'k', namn: n, grupp: i % 2 ? 'B' : 'A' }); });
  // Fyra delkapitel × 4 begrepp
  const dk = raw.kapitel[0].delkapitel.slice(0, antalDk).map((d: { nummer: string; begrepp: string[]; forklaringar: Record<string, string> }) => ({
    kod: d.nummer, fragor: d.begrepp.slice(0, perDk).map((b: string) => ({ begrepp: b, fraga: d.forklaringar[b] ?? `Vad betyder ${b}?` })),
  }));
  // Pias svar: mönster per (tillfälle, fråga) — lär sig, glömmer två, ett felklick
  const pia = (lax: number, dki: number, q: number): boolean => {
    if (dki === 0 && q === 1) return lax < 2;               // kunde, sedan fel två gånger → börjar glömma
    if (dki === 0 && q === 2) return lax !== 2;             // ett felklick
    if (dki === 1 && q === 0) return lax >= 2;              // vänder fel → rätt
    if (dki === 2 && q === 3) return false;                 // kvar att lära
    return (lax + q + dki) % 5 !== 0;
  };
  const plus = (start: string, dagar: number) => new Date(Date.parse(`${start}T00:00:00Z`) + dagar * 86_400_000).toISOString().slice(0, 10);
  const datumLax = dk.map((_: unknown, i: number) => plus('2026-09-04', 7 * i));
  const datumExit = dk.map((_: unknown, i: number) => plus('2026-08-31', 7 * i));
  const exitP = [[3, 4, 2, 3], [4, 4, 3, 4], [2, 3, 4, 4]].map((r) => dk.map((_: unknown, i: number) => r[i % 4]));
  dk.forEach((d: { kod: string; fragor: Array<{ begrepp: string; fraga: string }> }, i: number) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov: `Exit ${d.kod}`, datum: datumExit[i], rum: `Biologi6${i + 1}`,
      rader: elever.map((namn, e) => {
        const ratt = Math.min(exitP[e][i], d.fragor.length);
        return { namn, poang: ratt, maxPoang: d.fragor.length, svar: d.fragor.map((f, q) => ({ fraga: f.fraga, svar: q < ratt ? f.begrepp : 'fel', ratt: q < ratt, facit: f.begrepp })) };
      }) }).s;
  });
  datumLax.forEach((datum, l) => {
    const med = dk.slice(0, l + 1);
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: `Läxförhör 6.1–6.${l + 1}`, datum, rum: `Biologi6${Array.from({ length: l + 1 }, (_, x) => x + 1).join('')}`,
      rader: elever.map((namn, e) => {
        const svar = med.flatMap((d: { kod: string; fragor: Array<{ begrepp: string; fraga: string }> }, dki: number) => d.fragor.map((f, q) => {
          const r = e === 0 ? pia(l, dki, q) : e === 1 ? true : (q + l) % 3 !== 0;
          return { fraga: f.fraga, svar: r ? f.begrepp : 'fel', ratt: r, facit: f.begrepp };
        }));
        return { namn, poang: svar.filter((x: { ratt: boolean }) => x.ratt).length, maxPoang: svar.length, svar };
      }) }).s;
  });
  // Två DigiExam-prov (förmåga B: E-prov och CA-prov)
  for (const [prov, datum, poang] of [['Prov kap 6 B E', '2026-10-01', [14, 19, 11]], ['Prov kap 6 B CA', '2026-10-08', [9, 13, 6]]] as const) {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'digiexam', prov, datum, rader: elever.map((namn, e) => ({ namn, poang: poang[e], maxPoang: 20 })) }).s;
  }
  return s;
}

/** Plockar texten ur document.xml (all text i w:t-element) och sektionernas orientering. */
async function dokumentText(buf: Buffer): Promise<{ text: string; xml: string }> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const text = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
  const stilar = await zip.file('word/styles.xml')!.async('string');
  return { text, xml, stilar };
}

describe('Del 151: elevrapporten i Word — pedagogiska områden', () => {
  it('har översikt, tre områden, fokus med underlag och bilagor; frågematrisen i liggande format med skärmens färger', async () => {
    const s = byggKlass();
    const a = elevanalys(s, 'e0', { klassId: 'k', amneId: 'bi' });
    expect(a.glomska.borjarGlomma.map((g) => g.begrepp)).toEqual(['cellandning']);
    const buf = await Packer.toBuffer(await elevrapportDokument(a, { klassNamn: '8B' }));
    const { text, xml } = await dokumentText(buf);
    for (const del of ['ELEVRAPPORT', 'Pia Övnegård', 'Biologi · 8B', 'Begreppen just nu', 'Så går du vidare',
      'Lektionerna', 'Hur mycket lär du dig på lektionen?', 'Lektion för lektion',
      'Läxorna', 'Läxförhör för läxförhör', 'Från fel till rätt', 'Kvar att lära',
      'Minnet', 'Börjar glömmas – repetera (1)', 'Noterat: enstaka fel på inlärda begrepp',
      'Proven', 'Prov för prov', 'Prov kap 6 B CA',
      'Bilaga A', 'Fråga för fråga', 'Frågorna', 'Bilaga B', 'Att läsa och öva']) {
      expect(text, del).toContain(del);
    }
    // Läxförhöret räknas inte i lektionsområdet; förhörsgränserna förklaras
    expect(text).toContain('Läxförhöret räknas inte här');
    expect(text).toContain('gränser för förhörens begreppsfrågor, inte ämnesbetyg');
    // Fokus med underlag (prov och datum)
    expect(text).toContain('Repetera begrepp du har lärt dig');
    expect(text).toContain('cellandning – rätt tidigare men fel de två senaste gångerna (senast 25 sep)');
    // Frågematrisen: liggande sektion, Vecka/Datum/Typ/Quiz, skärmens rutfärger och gruppfärg
    expect(xml).toContain('w:orient="landscape"');
    for (const h of ['Vecka', 'Datum', 'Typ', 'Förhör']) expect(text).toContain(h);
    expect(xml).toContain('w:fill="4CAF50"');
    expect(xml).toContain('w:fill="D32F2F"');
    expect(xml).toContain('w:fill="E8ECF3"');
    expect(text).toContain('Exit 6.1');
    expect(text).toContain('Läxförhör 6.1–6.4');
  }, 60000);
});

describe('Del 153: elevrapporten som PDF', () => {
  it('samma områden, prov och bilagor; frågematrisen på en liggande sida; inga tecken som typsnittet saknar', async () => {
    const { elevrapportPdfDefinition } = await import('../src/elevrapportPdf');
    const a = elevanalys(byggKlass(), 'e0', { klassId: 'k', amneId: 'bi' });
    const def = await elevrapportPdfDefinition(a, { klassNamn: '8B', grupp: 'Grupp Riskzon' });
    const json = JSON.stringify(def.content);
    for (const del of ['ELEVRAPPORT', 'Pia Övnegård', 'Biologi · 8B · Grupp Riskzon', 'Så går du vidare', '1   Lektionerna', '2   Läxorna', '3   Minnet', '4   Proven',
      'Prov för prov', 'Bilaga A', 'Fråga för fråga', 'Bilaga B', 'Att läsa och öva']) expect(json, del).toContain(del);
    expect(json).toContain('"pageOrientation":"landscape"');
    expect(json).toContain('"fillColor":"#4CAF50"');
    expect(json).toContain('"fillColor":"#D32F2F"');
    expect(json.match(/.{0,40}[✓✗→★🎯📚🧠📝].{0,20}/u)?.[0] ?? null).toBeNull();
    // pdfmake bygger faktiskt dokumentet (fångar fel i layoutfunktionerna)
    const pm = (await import('pdfmake/build/pdfmake')) as unknown as { default?: unknown };
    const pdfMake = (pm.default ?? pm) as { addVirtualFileSystem?: (v: unknown) => void; vfs?: unknown; createPdf: (d: unknown) => { getBuffer: (cb: (b: Uint8Array) => void) => void } };
    const vf = (await import('pdfmake/build/vfs_fonts')) as unknown as { default?: unknown };
    if (pdfMake.addVirtualFileSystem !== undefined) pdfMake.addVirtualFileSystem(vf.default ?? vf); else pdfMake.vfs = vf.default ?? vf;
    const buf = await new Promise<Uint8Array>((res) => pdfMake.createPdf(def).getBuffer(res));
    expect(new TextDecoder().decode(buf.slice(0, 5))).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(50_000);
  }, 60000);
});

describe('Del 154: frågematrisen är EN tabell även för ett helt kapitel', () => {
  it('58 frågor (8 delkapitel) ryms i en tabell i Word och PDF; rubriken heter Förhör och datumen saknar veckodag', async () => {
    const a = elevanalys(byggKlass(8, 20), 'e0', { klassId: 'k', amneId: 'bi' });
    expect(a.matris.fragor).toHaveLength(58);
    const { xml, text, stilar } = await dokumentText(await Packer.toBuffer(await elevrapportDokument(a, { klassNamn: '8B' })));
    // Matrisens tabeller känns igen på rubrikraden Vecka · Datum · Typ · Förhör
    const antal = (xml.match(/<w:t(?: [^>]*)?>Vecka<\/w:t>/g) ?? []).length;
    expect(antal).toBe(1);
    expect(text).toContain('Förhör');
    expect(text).not.toMatch(/\b(mån|tis|ons|tor|fre) \d/);
    expect(stilar).toContain('w:lang w:val="sv-SE"');              // Word stavningskontrollerar på svenska
    const { elevrapportPdfDefinition } = await import('../src/elevrapportPdf');
    const json = JSON.stringify((await elevrapportPdfDefinition(a, { klassNamn: '8B' })).content);
    expect((json.match(/"text":"Vecka"/g) ?? []).length).toBe(1);
  }, 60000);
});
