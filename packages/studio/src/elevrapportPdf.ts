/**
 * Del 153 · Elevrapporten som PDF — samma innehåll, områden och färger som Word-rapporten
 * (elevrapportLayout.ts), byggd i webbläsaren med pdfmake. Ingen server och inget program
 * behövs: PDF:en skapas i appen på vilken dator som helst. pdfmake laddas först när någon
 * exporterar en PDF.
 *
 * Typsnittet (Roboto) saknar några tecken som Word-versionen använder (✓ → ★ och emoji);
 * de ersätts med motsvarigheter som finns (ja/nej, –, ●).
 */
import type { Content, ContentTable, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { kortDatum, rapportOmraden, type Elevanalys, type GlomskaBegrepp, type OmradeTon, type RapportOmraden } from '@planner/kernel';
import { FM, OMRADE, TON, TYP, laxBild, lektionsBild, veckaFor, type RapportMeta } from './elevrapportLayout.js';

const TEXT = '#1F2937'; const MUTED = '#6B7280'; const YTA = '#F3F4F6'; const LINJE = '#E5E7EB';
const h = (x: string) => `#${x}`;
/** Byter tecken som Roboto saknar. */
const sak = (s: string) => s.replace(/✓\s?/g, '').replace(/✗/g, 'x').replace(/→/g, '–').replace(/★/g, '●').replace(/\p{Extended_Pictographic}️?\s?/gu, '');

const BREDD = 595.28 - 2 * 48;           // stående innerbredd (pt)
const BREDD_LIGG = 841.89 - 2 * 32;

type Omr = (typeof OMRADE)[keyof typeof OMRADE];

function liten(text: string): Content { return { text: sak(text), fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 5] }; }
function underrubrik(text: string, farg = TEXT): Content { return { text: sak(text), bold: true, fontSize: 11, color: farg, margin: [0, 9, 0, 4] }; }

function band(nr: string, o: Omr, brytning: boolean): Content {
  return {
    ...(brytning ? { pageBreak: 'before' as const } : {}),
    table: { widths: ['*'], body: [[{
      stack: [{ text: `${nr}   ${o.namn}`, bold: true, fontSize: 15, color: '#FFFFFF' }, { text: o.fraga, fontSize: 10, color: '#FFFFFF', margin: [0, 1, 0, 0] }],
      fillColor: h(o.farg), margin: [8, 7, 8, 7],
    }]] },
    layout: 'noBorders', margin: [0, 0, 0, 10],
  };
}

function slutsats(ton: OmradeTon, status: string, text: string): Content {
  const c = TON[ton];
  return {
    table: { widths: ['*'], body: [[{ text: [{ text: `${c.markor} ${status}  `, bold: true, color: h(c.text) }, { text: sak(text) }], fillColor: h(c.fyll), margin: [8, 6, 8, 6], fontSize: 10 }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => h(c.text) },
    margin: [0, 0, 0, 8],
  };
}

function nyckeltal(tal: Array<{ etikett: string; varde: string; under?: string }>, farg: string): Content | null {
  if (tal.length === 0) return null;
  return {
    table: { widths: tal.map(() => '*'), body: [tal.map((n): TableCell => ({ stack: [
      { text: sak(n.varde), bold: true, fontSize: 16, color: h(farg) },
      { text: sak(n.etikett), bold: true, fontSize: 9 },
      ...(n.under !== undefined ? [{ text: sak(n.under), fontSize: 8, color: MUTED }] : []),
    ], fillColor: YTA, margin: [6, 5, 6, 5] }))] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number, node: ContentTable) => (i === 0 || i === node.table.body[0].length ? 0 : 3), vLineColor: () => '#FFFFFF' },
    margin: [0, 0, 0, 8],
  };
}

type Cell = string | { text: string; farg?: string; bold?: boolean };
function dataTabell(rubriker: string[], bredder: number[], rader: Cell[][]): Content {
  const summa = bredder.reduce((a, b) => a + b, 0);
  return {
    table: {
      headerRows: 1, dontBreakRows: true,
      widths: bredder.map((b) => (b / summa) * BREDD),
      body: [
        rubriker.map((r): TableCell => ({ text: r, bold: true, fontSize: 8.5, color: MUTED, fillColor: YTA })),
        ...rader.map((r) => r.map((v): TableCell => {
          const x = typeof v === 'string' ? { text: v } : v;
          return { text: sak(x.text), fontSize: 9, ...(x.farg !== undefined ? { color: h(x.farg) } : {}), ...(x.bold === true ? { bold: true } : {}) };
        })),
      ],
    },
    layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.6), vLineWidth: () => 0, hLineColor: () => LINJE, paddingTop: () => 3, paddingBottom: () => 3 },
    margin: [0, 0, 0, 6],
  };
}
const janej = (ok: boolean): Cell => (ok ? { text: 'ja', farg: '1B5E20', bold: true } : { text: 'nej', farg: 'B71C1C' });

async function bildUrl(buf: Promise<ArrayBuffer | null>): Promise<string | null> {
  const b = await buf; if (b === null) return null;
  let s = ''; const u = new Uint8Array(b);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
}

function punkter(rader: Array<Array<{ text: string; bold?: boolean; color?: string; fontSize?: number }>>): Content {
  return { ul: rader.map((r) => ({ text: r.map((x) => ({ ...x, text: sak(x.text) })), fontSize: 9.5, margin: [0, 0, 0, 2] })), margin: [0, 0, 0, 6] };
}

// ── Sida 1 ─────────────────────────────────────────────────────
function oversikt(a: Elevanalys, r: RapportOmraden, meta: RapportMeta): Content[] {
  const idag = new Date().toISOString().slice(0, 10);
  const datum = [...r.lektioner.rader, ...r.laxor.rader].map((x) => x.datum).sort();
  const period = a.period.fran !== null || a.period.till !== null
    ? `${a.period.fran !== null ? kortDatum(a.period.fran) : 'start'} – ${a.period.till !== null ? kortDatum(a.period.till) : 'idag'}`
    : datum.length > 0 ? `${kortDatum(datum[0])} – ${kortDatum(datum[datum.length - 1])}` : 'hela perioden';
  const ruta = (o: Omr, nr: string, ton: OmradeTon, status: string, tal: string, rad: string): TableCell => ({
    stack: [
      { text: `${nr}  ${o.namn}`, bold: true, fontSize: 10.5, color: h(o.farg) },
      { text: o.fraga, fontSize: 8, color: MUTED, margin: [0, 0, 0, 5] },
      { text: tal, bold: true, fontSize: 20, color: h(o.farg) },
      { text: `${TON[ton].markor} ${status}`, bold: true, fontSize: 9, color: h(TON[ton].text), margin: [0, 1, 0, 3] },
      { text: sak(rad), fontSize: 8.5 },
    ],
    fillColor: h(o.ljus), margin: [8, 8, 8, 8],
  });
  const lek = r.lektioner; const lax = r.laxor; const min = r.minne;
  const rutor: TableCell[] = [
    ruta(OMRADE.lektioner, '1', lek.ton, lek.status, lek.snitt === null ? '—' : `${lek.snitt} %`,
      lek.rader.length === 0 ? 'Inga exit tickets i perioden.' : `Exit ticket i snitt. Nådde 70 % på ${lek.klarade} av ${lek.rader.length} lektioner.`),
    ruta(OMRADE.laxor, '2', lax.ton, lax.status, lax.rader.length === 0 ? '—' : `${lax.rader[lax.rader.length - 1].procent} %`,
      lax.rader.length === 0 ? 'Inga läxförhör i perioden.' : `Senaste läxförhöret. ${lax.vantTotalt} begrepp vända från fel till rätt.`),
    ruta(OMRADE.minne, '3', min.ton, min.status, min.testadeIgen === 0 ? '—' : `${Math.round((min.hallerI / min.testadeIgen) * 100)} %`,
      min.testadeIgen === 0 ? 'Inget kunnat begrepp har testats igen ännu.' : `av kunnade begrepp var rätt igen. ${min.flaggade.length} börjar glömmas.`),
    ...(r.prov === null ? [] : [ruta(OMRADE.prov, '4', r.prov.ton, r.prov.status, r.prov.nyckeltal[0].varde,
      `Senaste provet (${kortDatum(r.prov.rader[r.prov.rader.length - 1].datum)}). Klassens snitt ${r.prov.nyckeltal[1].varde}.`)]),
  ];
  const nu = a.nu;
  const nuTal = nu.fragor.length === 0 ? null : nyckeltal([
    { etikett: 'Testade begrepp', varde: String(nu.fragor.length) },
    { etikett: 'Rätt i senaste försöket', varde: String(nu.kan.length), under: `${nu.procent ?? '—'} %` },
    { etikett: 'Kvar att lära', varde: String(nu.kvar.length), under: 'fel i senaste försöket' },
    { etikett: 'Vände till rätt', varde: String(nu.fixat.length), under: 'efter tidigare fel' },
  ], '374151');
  return [
    { text: 'ELEVRAPPORT', bold: true, fontSize: 9, color: MUTED },
    { text: a.elev.namn, bold: true, fontSize: 26, margin: [0, 0, 0, 1] },
    { text: [a.amneNamn, meta.klassNamn, meta.grupp].filter((x) => x !== undefined && x !== '').join(' · '), fontSize: 12, color: '#374151' },
    { text: `Period ${period} · skapad ${kortDatum(idag)} ${idag.slice(0, 4)}`, fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 14] },
    { table: { widths: rutor.map(() => '*'), body: [rutor] },
      layout: {
        // Färgad överkant per ruta (områdets färg), vita mellanrum mellan rutorna
        hLineWidth: (i: number) => (i === 0 ? 3.5 : 0),
        hLineColor: (_i: number, _n: ContentTable, kol?: number) => {
          const farger = [OMRADE.lektioner, OMRADE.laxor, OMRADE.minne, OMRADE.prov].slice(0, rutor.length).map((o) => h(o.farg));
          return kol !== undefined && kol >= 0 && kol < farger.length ? farger[kol] : '#FFFFFF';
        },
        vLineWidth: (i: number) => (i === 0 || i === rutor.length ? 0 : 5), vLineColor: () => '#FFFFFF',
      }, margin: [0, 0, 0, 16] },
    { text: 'Begreppen just nu', bold: true, fontSize: 13, margin: [0, 0, 0, 1] },
    liten(nu.senastDatum !== null ? `Senaste svaret på varje begreppsfråga, till och med ${kortDatum(nu.senastDatum)}.` : 'Inga begreppsfrågor med svar i perioden.'),
    ...(nuTal !== null ? [nuTal] : []),
    { text: 'Så går du vidare', bold: true, fontSize: 13, margin: [0, 10, 0, 5] },
    ...(r.fokus.length === 0 ? [liten('Inga resultat i perioden.')] : r.fokus.map((f, i): Content => ({
      table: { widths: [22, '*'], dontBreakRows: true, body: [[
        { text: String(i + 1), bold: true, fontSize: 14, color: '#E65100', alignment: 'center', fillColor: '#FFF3E0', margin: [0, 6, 0, 6] },
        { stack: [{ text: sak(f.rubrik), bold: true, fontSize: 10 }, { text: sak(f.text), fontSize: 9.5, margin: [0, 2, 0, 0] }], fillColor: '#FFFAF3', margin: [6, 5, 6, 5] },
      ]] },
      layout: 'noBorders', margin: [0, 0, 0, 6],
    }))),
    { text: 'Hur rapporten läses: 70 % (exit ticket) och 90 % (läxförhör) är förhörsgränser för begreppsfrågorna, inte ämnesbetyg. Rapporten beskriver resultaten; orsaker följs upp i samtal. Jämförelsen är mot dina egna tidigare resultat. Bilaga A visar varje fråga, bilaga B vad du kan läsa.', fontSize: 8.5, color: MUTED, margin: [0, 12, 0, 0] },
  ];
}

// ── Områdena ────────────────────────────────────────────────────
async function lektionerna(r: RapportOmraden): Promise<Content[]> {
  const o = r.lektioner; const u: Content[] = [band('1', OMRADE.lektioner, true)];
  u.push(liten('Exit ticketen i slutet av lektionen prövar det ni arbetat med just den lektionen. Läxförhöret räknas inte här — det hör till läxorna.'));
  u.push(slutsats(o.ton, o.status, o.slutsats));
  const n = nyckeltal(o.nyckeltal, OMRADE.lektioner.farg); if (n !== null) u.push(n);
  if (o.rader.length > 0) {
    const img = await bildUrl(lektionsBild(o));
    if (img !== null) u.push({ image: img, width: BREDD * 0.92, alignment: 'center', margin: [0, 2, 0, 2] }, liten('Grön stapel = nådde 70 %, orange = under. Streckad linje = kravet.'));
    u.push(underrubrik('Lektion för lektion'));
    u.push(dataTabell(['Datum', 'Exit ticket', 'Resultat', 'Nådde 70 %', 'Nivå'], [16, 38, 12, 14, 20],
      o.rader.map((x) => [kortDatum(x.datum), x.prov, { text: `${x.procent} %`, bold: true }, janej(x.klarat), x.niva])));
  }
  return u;
}

async function laxorna(r: RapportOmraden): Promise<Content[]> {
  const o = r.laxor; const u: Content[] = [band('2', OMRADE.laxor, true)];
  u.push(liten('Läxförhöret i början av lektionen prövar läxan: begreppen från förra lektionen och tidigare läxor. Det som räknas är att du ökar från gång till gång och vänder fel till rätt.'));
  u.push(slutsats(o.ton, o.status, o.slutsats));
  const n = nyckeltal(o.nyckeltal, OMRADE.laxor.farg); if (n !== null) u.push(n);
  if (o.rader.length > 0) {
    const img = await bildUrl(laxBild(o));
    if (img !== null) u.push({ image: img, width: BREDD * 0.92, alignment: 'center', margin: [0, 2, 0, 2] }, liten('Varje punkt är ett läxförhör. Grön = nådde 90 %, orange = under.'));
    u.push(underrubrik('Läxförhör för läxförhör'));
    const del = (x: { ratt: number; antal: number } | null) => (x === null ? '—' : `${x.ratt} av ${x.antal}`);
    const harNya = o.rader.some((x) => x.nya !== null);
    u.push(dataTabell(['Datum', 'Läxförhör', 'Resultat', 'Nådde 90 %', 'Förra lektionen', 'Tidigare läxor', ...(harNya ? ['Nya'] : [])], harNya ? [14, 26, 10, 12, 14, 14, 10] : [15, 29, 11, 13, 16, 16],
      o.rader.map((x) => [kortDatum(x.datum), x.prov, { text: `${x.procent} %`, bold: true }, janej(x.klarat), del(x.forraLektionen), del(x.tidigare), ...(harNya ? [del(x.nya)] : [])])));
    u.push(liten('Förra lektionen = begreppen från exit ticketen sedan förra läxförhöret. Tidigare läxor = begrepp från tidigare förhör — visar om du läser hela läxan, inte bara det senaste.'));
  }
  if (o.vandSteg.length > 0) {
    u.push(underrubrik(`Vänt från fel till rätt (${o.vantTotalt})`, '#1B5E20'));
    u.push(dataTabell(['Mellan förhören', 'Antal', 'Begrepp'], [30, 10, 60],
      o.vandSteg.map((s) => [`${kortDatum(s.franDatum)} – ${kortDatum(s.tillDatum)}`, { text: `+${s.antal}`, farg: '1B5E20', bold: true }, s.begrepp.join(' · ')])));
  }
  if (o.kvar.length > 0) {
    u.push(underrubrik(`Kvar att lära — fel i senaste försöket (${o.kvar.length})`, '#B71C1C'));
    u.push(punkter(o.kvar.map((x) => [
      ...(x.begrepp !== undefined ? [{ text: `${x.begrepp} — `, bold: true }] : []), { text: x.fraga },
      { text: `  ${x.kod} · ${x.prov} ${kortDatum(x.datum)}`, fontSize: 8, color: MUTED },
    ])));
  }
  if (o.fixat.length > 0) {
    u.push(underrubrik(`Rätt i senaste försöket efter tidigare fel (${o.fixat.length})`, '#1B5E20'));
    u.push({ text: sak(o.fixat.map((x) => x.begrepp ?? x.fraga).join(' · ')), fontSize: 9.5 });
  }
  return u;
}

function glomskaRad(g: GlomskaBegrepp): Array<{ text: string; bold?: boolean; color?: string; fontSize?: number }> {
  return [
    { text: g.begrepp ?? g.fraga, bold: true }, ...(g.begrepp !== undefined ? [{ text: ` — ${g.fraga}` }] : []),
    { text: `  ${g.kod} · rätt ${kortDatum(g.kundeDatum)}, fel ${g.fel.map((f) => kortDatum(f.datum)).join(' och ')}`, fontSize: 8, color: MUTED },
  ];
}

function minnet(r: RapportOmraden): Content[] {
  const o = r.minne; const u: Content[] = [band('3', OMRADE.minne, true)];
  u.push(liten('Läxförhören tar upp gamla begrepp igen. Ett begrepp räknas som kunnat från första gången det var rätt. Är det fel de två senaste gångerna flaggas det. Ett enstaka fel noteras bara — man kan trycka fel.'));
  u.push(slutsats(o.ton, o.status, o.slutsats));
  const n = nyckeltal(o.nyckeltal, OMRADE.minne.farg); if (n !== null) u.push(n);
  if (o.flaggade.length > 0) { u.push(underrubrik(`Börjar glömma — repetera (${o.flaggade.length})`, '#B71C1C')); u.push(punkter(o.flaggade.map(glomskaRad))); }
  if (o.noterade.length > 0) {
    u.push(underrubrik(`Noterat: enstaka fel på kunnade begrepp (${o.noterade.length})`, MUTED));
    u.push({ text: sak(o.noterade.map((g) => `${g.begrepp ?? g.fraga} (${kortDatum(g.fel[g.fel.length - 1].datum)})`).join(' · ')), fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 4] });
    u.push(liten('Flaggas inte. Blir samma begrepp fel igen nästa gång flyttas det upp till "börjar glömma".'));
  }
  return u;
}

function proven(r: RapportOmraden): Content[] {
  const o = r.prov; if (o === null) return [];
  const tal = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','));
  return [
    band('4', OMRADE.prov, true),
    liten('Proven skrivs i DigiExam och bedöms per förmåga. Här visas poängen och klassens snitt på samma prov — betyget sätts av läraren utifrån förmågorna.'),
    slutsats(o.ton, o.status, o.slutsats),
    ...(() => { const n = nyckeltal(o.nyckeltal, OMRADE.prov.farg); return n === null ? [] : [n]; })(),
    underrubrik('Prov för prov'),
    dataTabell(['Datum', 'Prov', 'Poäng', 'Resultat', 'Klassens snitt', 'Mot klassen'], [15, 33, 13, 12, 14, 13],
      o.rader.map((x) => [kortDatum(x.datum), x.prov, `${tal(x.poang)} / ${tal(x.maxPoang)}`, { text: x.procent !== null ? `${x.procent} %` : '—', bold: true },
        x.klassSnitt !== null ? `${x.klassSnitt} %` : '—',
        x.mot === null ? '—' : { text: `${x.mot > 0 ? '+' : ''}${x.mot}`, farg: x.mot >= 0 ? '1B5E20' : 'B71C1C', bold: true }])),
  ];
}

// ── Bilaga A: frågematrisen, som på skärmen ─────────────────────
const ETIKETT = [24, 58, 52, 104];
const RUT_MIN = 10; const RUT_MAX = 17;

function matrisBlock(a: Elevanalys, fran: number, till: number): Content {
  const m = a.matris;
  const fragor = m.fragor.slice(fran, till);
  const rut = Math.max(RUT_MIN, Math.min(RUT_MAX, (BREDD_LIGG - ETIKETT.reduce((x, y) => x + y, 0)) / Math.max(1, fragor.length) - 1.5));
  const gstartKol = new Set(fragor.map((fr, i) => (m.grupper.some((g) => g.fran === fr.nr) ? i + 4 : -1)).filter((i) => i >= 0));
  const grupper = m.grupper.map((g) => ({ ...g, a: Math.max(g.fran, fran + 1), b: Math.min(g.till, till) })).filter((g) => g.a <= g.b);
  const rad1: TableCell[] = [{ text: '', colSpan: 4 }, {}, {}, {}];
  for (const g of grupper) {
    const n = g.b - g.a + 1;
    rad1.push({ stack: [{ text: g.ursprung, bold: true, fontSize: 6.5, color: h(FM.gruppText) }, { text: `${g.kod !== '—' ? `${g.kod} · ` : ''}${g.till - g.fran + 1} frågor`, fontSize: 5.5, color: h(FM.gruppUnder) }],
      alignment: 'center', fillColor: h(FM.grupp), colSpan: n });
    for (let i = 1; i < n; i++) rad1.push({});
  }
  const rad2: TableCell[] = [
    ...['Vecka', 'Datum', 'Typ', 'Quiz'].map((x): TableCell => ({ text: x, bold: true, fontSize: 6.5, color: MUTED })),
    ...fragor.map((fr): TableCell => ({ text: String(fr.nr), fontSize: 5.5, color: h(FM.nr), alignment: 'center' })),
  ];
  const rader = [...m.rader].sort((x, y) => x.datum.localeCompare(y.datum) || (x.tid ?? '').localeCompare(y.tid ?? ''));
  const kropp: TableCell[][] = rader.map((rad) => [
    { text: `v${veckaFor(rad.datum)}`, fontSize: 6.5, color: MUTED },
    { text: [{ text: kortDatum(rad.datum), color: MUTED }, ...(rad.tid !== undefined ? [{ text: ` ${rad.tid}`, bold: true }] : [])], fontSize: 6.5 },
    { text: TYP[rad.kalla].namn, bold: true, fontSize: 6, color: h(TYP[rad.kalla].text), fillColor: h(TYP[rad.kalla].fyll) },
    { text: rad.prov, bold: true, fontSize: 7 },
    ...fragor.map((fr): TableCell => {
      const i = m.fragor.indexOf(fr);
      const svar = rad.elevCeller?.[i];
      return { text: '', fillColor: h(rad.celler[i] === null ? FM.tom : svar === true ? FM.ratt : svar === false ? FM.fel : FM.tom) };
    }),
  ]);
  const utan: TableCell[][] = m.utanSvar.filter((x) => x.kalla.startsWith('socrative')).map((x) => [
    { text: `v${veckaFor(x.datum)}`, fontSize: 6.5, color: MUTED }, { text: kortDatum(x.datum), fontSize: 6.5, color: MUTED },
    { text: TYP[x.kalla].namn, bold: true, fontSize: 6, color: h(TYP[x.kalla].text), fillColor: h(TYP[x.kalla].fyll) }, { text: x.prov, bold: true, fontSize: 7 },
    { text: 'resultat utan svar per fråga', italics: true, fontSize: 6, color: MUTED, colSpan: fragor.length }, ...fragor.slice(1).map(() => ({})),
  ]);
  return {
    table: { headerRows: 2, widths: [...ETIKETT, ...fragor.map(() => rut)], heights: (i: number) => (i < 2 ? 'auto' : 11), body: [rad1, rad2, ...kropp, ...utan] },
    layout: {
      hLineWidth: () => 1.2, hLineColor: (i: number) => (i === 1 ? h(FM.gstart) : '#FFFFFF'),
      vLineWidth: (i: number) => (gstartKol.has(i) ? 1.4 : 1.2), vLineColor: (i: number) => (gstartKol.has(i) ? h(FM.gstart) : '#FFFFFF'),
      paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1,
    },
    margin: [0, 0, 0, 10],
  };
}

function blockGranser(a: Elevanalys): Array<[number, number]> {
  const n = a.matris.fragor.length;
  const ryms = Math.max(8, Math.floor((BREDD_LIGG - ETIKETT.reduce((x, y) => x + y, 0)) / (RUT_MIN + 1.5)));
  if (n <= ryms) return [[0, n]];
  const ut: Array<[number, number]> = []; let start = 0;
  while (start < n) {
    let slut = Math.min(n, start + ryms);
    if (slut < n) { const b = a.matris.grupper.map((g) => g.fran - 1).filter((i) => i > start && i <= slut).pop(); if (b !== undefined) slut = b; }
    ut.push([start, slut]); start = slut;
  }
  return ut;
}

function bilagaA(a: Elevanalys): Content[] {
  const m = a.matris;
  const u: Content[] = [
    { text: 'Bilaga A', bold: true, fontSize: 9, color: MUTED, pageBreak: 'before', pageOrientation: 'landscape' },
    { text: 'Fråga för fråga', bold: true, fontSize: 16, margin: [0, 0, 0, 4] },
  ];
  if (m.fragor.length === 0) { u.push(liten('Inga förhör med svar per fråga i perioden.')); return u; }
  u.push({ text: [
    { text: '■ ', color: h(FM.ratt), fontSize: 11 }, { text: 'rätt   ' }, { text: '■ ', color: h(FM.fel), fontSize: 11 }, { text: 'fel   ' },
    { text: '■ ', color: '#D9DDE3', fontSize: 11 }, { text: 'ingick inte / inte gjord   ' },
    { text: 'Samma fråga har samma nummer i alla förhör. Kolumnerna är grupperade efter förhöret där frågan först ställdes.', color: MUTED },
  ], fontSize: 8.5, margin: [0, 0, 0, 6] });
  for (const [fran, till] of blockGranser(a)) u.push(matrisBlock(a, fran, till));
  u.push({ text: 'Frågorna', bold: true, fontSize: 12, margin: [0, 6, 0, 4] });
  u.push({
    table: { headerRows: 1, dontBreakRows: true, widths: [22, 32, 150, '*'], body: [
      ['Nr', 'Del', 'Rätt svar (begrepp)', 'Fråga'].map((x): TableCell => ({ text: x, bold: true, fontSize: 8, color: MUTED, fillColor: YTA })),
      ...m.fragor.map((fr): TableCell[] => [
        { text: String(fr.nr), fontSize: 8, color: MUTED }, { text: fr.kod, fontSize: 8 },
        { text: sak(fr.begrepp ?? '—'), fontSize: 8, bold: fr.begrepp !== undefined }, { text: sak(fr.fraga), fontSize: 8 },
      ]),
    ] },
    layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => LINJE },
  });
  return u;
}

// ── Bilaga B ───────────────────────────────────────────────────
function bilagaB(a: Elevanalys, r: RapportOmraden): Content[] {
  const u: Content[] = [
    { text: 'Bilaga B', bold: true, fontSize: 9, color: MUTED, pageBreak: 'before', pageOrientation: 'portrait' },
    { text: 'Att läsa och öva', bold: true, fontSize: 16, margin: [0, 0, 0, 4] },
    liten('Sammanfattningarna och förklaringarna är bokens. Begrepp markerade ● är sådana du ska repetera eller lära in (område 2 och 3).'),
  ];
  const markerade = new Set([...r.minne.flaggade.map((g) => (g.begrepp ?? '').toLowerCase()), ...r.laxor.kvar.map((k) => (k.begrepp ?? '').toLowerCase())].filter((x) => x !== ''));
  if (a.ovningar.length > 0 || a.filmer.length > 0) {
    u.push(underrubrik('Länkar'));
    u.push({ ul: [
      ...a.ovningar.map((o) => ({ text: `Öva i Socrative: ${o.rum} — ${o.kod} ${o.namn}`, link: o.url, color: '#1D4ED8', decoration: 'underline' as const, fontSize: 9.5 })),
      ...a.filmer.map((f) => ({ text: sak(`Film: ${f.titel} (${f.for})`), link: f.url, color: '#1D4ED8', decoration: 'underline' as const, fontSize: 9.5 })),
    ], margin: [0, 0, 0, 6] });
  }
  const kapitel = a.rapport?.kapitel ?? [];
  if (kapitel.length === 0 && a.ovningar.length === 0 && a.filmer.length === 0) u.push(liten('Inga sammanfattningar eller länkar finns för ämnet ännu.'));
  for (const k of kapitel) {
    if (k.sammanfattning === null && k.attOva.length === 0) continue;
    u.push({ text: `Kapitel ${k.nr} ${k.namn}`, bold: true, fontSize: 12, color: h(OMRADE.laxor.farg), margin: [0, 12, 0, 4] });
    if (k.sammanfattning !== null) {
      u.push(underrubrik('Sammanfattning'));
      for (const rad of k.sammanfattning.split('\n').filter((x) => x.trim() !== '')) u.push({ text: sak(rad), fontSize: 9.5, margin: [0, 0, 0, 3] });
    }
    if (k.attOva.length > 0) {
      u.push(underrubrik('Begrepp'));
      u.push(punkter(k.attOva.map((b) => [
        ...(markerade.has(b.begrepp.toLowerCase()) ? [{ text: '● ', bold: true, color: '#E65100' }] : []),
        { text: b.begrepp, bold: true }, ...(b.forklaring !== null ? [{ text: ` — ${b.forklaring}` }] : []),
      ])));
    }
  }
  return u;
}

/** Hela dokumentdefinitionen (utan typsnitt) — testbar utan webbläsare. */
export async function elevrapportPdfDefinition(a: Elevanalys, meta: RapportMeta = {}): Promise<TDocumentDefinitions> {
  const r = rapportOmraden(a);
  return {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [48, 44, 48, 44],
    info: { title: `Elevrapport ${a.elev.namn} ${a.amneNamn}`, creator: 'Classroom Planner' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: TEXT, lineHeight: 1.15 },
    header: (_sida: number, _av: number, storlek: { width: number }) => ({ text: `${a.elev.namn} · ${a.amneNamn}`, fontSize: 8, color: '#9CA3AF', alignment: 'right', margin: [0, 22, storlek.width > 700 ? 32 : 48, 0] }),
    footer: (sida: number, av: number) => ({ text: `Sida ${sida} av ${av}`, fontSize: 8, color: '#9CA3AF', alignment: 'center', margin: [0, 12, 0, 0] }),
    content: [
      ...oversikt(a, r, meta),
      ...(await lektionerna(r)),
      ...(await laxorna(r)),
      ...minnet(r),
      ...proven(r),
      ...bilagaA(a),
      ...bilagaB(a, r),
    ],
  };
}

type PdfMake = { vfs?: unknown; addVirtualFileSystem?: (v: unknown) => void; createPdf: (d: TDocumentDefinitions) => { getBlob: (cb: (b: Blob) => void) => void } };
let pdfMakeLaddad: Promise<PdfMake> | null = null;
/** pdfmake och typsnittet laddas först när en PDF skapas (egen chunk i bygget). */
function laddaPdfMake(): Promise<PdfMake> {
  pdfMakeLaddad ??= (async () => {
    const pm = (await import('pdfmake/build/pdfmake')) as unknown as { default?: PdfMake } & PdfMake;
    const pdfMake = pm.default ?? pm;
    const vf = (await import('pdfmake/build/vfs_fonts')) as unknown as { default?: unknown };
    const vfs = vf.default ?? vf;
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
    else pdfMake.vfs = vfs;
    return pdfMake;
  })();
  return pdfMakeLaddad;
}

/** Elevrapporten som PDF-blob. */
export async function elevrapportPdfBlob(a: Elevanalys, meta: RapportMeta = {}): Promise<Blob> {
  const [pdfMake, def] = await Promise.all([laddaPdfMake(), elevrapportPdfDefinition(a, meta)]);
  return new Promise((res) => pdfMake.createPdf(def).getBlob(res));
}
