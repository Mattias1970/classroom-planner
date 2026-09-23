/**
 * Schema-PDF (v2): tolkar text-items MED koordinater ur en utskriven
 * schema-PDF (Skola24-stil): kolumn = veckodag, och varje lektionsbox omges
 * av sina tidsetiketter ([starttid] [textrader] [sluttid]). Ren kärna —
 * själva PDF-läsningen (pdf.js) bor i studio; här tolkas bara items.
 */
import { delaHalvklassPass } from './struktur.js';
import { laggTillAmne, laggTillKlass, laggTillLarare, laggTillTjanst, nyttId, sattLarare, uppdateraAmne } from './struktur.js';
import { NO_TK, NO_TK_AMNEN } from './amnen.js';
import type { Pass, Struktur } from './typer.js';
import type { OmfattningsPass } from './struktur.js';

export interface PdfTextItem { text: string; x: number; y: number; }

export interface SchemaPdfLektion {
  dag: number;                       // 1=mån … 5=fre
  start: string;                     // 'HH:MM'
  slut: string;
  amne: 'Matematik' | typeof NO_TK;
  klass: string;                     // '8A'
  omfattning: 'hel' | 'A' | 'B';     // :a → A, :b → B, annars helklass
  sal: string;
}

export interface TolkatSchema {
  larareNamn: string;
  signatur: string;
  lasar: string | null;              // 'Läsåret 2026/2027'
  lektioner: SchemaPdfLektion[];
  ovrigt: string[];                  // Konftid, MTID, Ämneskonferens m.m.
}

const TID = /^\d{1,2}:\d{2}$/;
const AMNEN: Record<string, SchemaPdfLektion['amne']> = { MA: 'Matematik', 'NO+Tk': NO_TK };

function norm(t: string): string { const [h, m] = t.split(':'); return `${h.padStart(2, '0')}:${m}`; }

/** Tolkar extraherade text-items till lärare + lektioner. */
export function tolkaSchemaPdf(items: PdfTextItem[]): TolkatSchema {
  // Lärare: alla items på "Lärare:"-raden (samma y), sorterade i x-led.
  const larRad = items.find((i) => i.text.startsWith('Lärare:'));
  let signatur = '', larareNamn = '';
  if (larRad) {
    const rad = items.filter((i) => Math.abs(i.y - larRad.y) < 3).sort((a, b) => a.x - b.x)
      .map((i) => i.text).join(' ').replace(/^Lärare:\s*/, '');
    const delar = rad.split(/\s+/);
    signatur = delar[0] ?? '';
    larareNamn = delar.slice(1).join(' ') || signatur;
  }
  const lasarItem = items.map((i) => /Läsåret (\d{4})-(\d{4})/.exec(i.text)).find((m) => m !== null);
  const lasar = lasarItem ? `Läsåret ${lasarItem[1]}/${lasarItem[2]}` : null;

  // Dagkolumner: de fem översta tidsmarkörerna (8:00-raden överst i rutnätet).
  const tider = items.filter((i) => TID.test(i.text));
  const toppY = Math.max(...tider.map((i) => i.y));
  const centra = tider.filter((i) => Math.abs(i.y - toppY) < 5).map((i) => i.x).sort((a, b) => a - b);
  if (centra.length < 5) return { larareNamn, signatur, lasar, lektioner: [], ovrigt: [] };
  const halvbredd = (centra[1] - centra[0]) / 2;
  const kolFor = (x: number): number | null => {
    if (x < centra[0] - halvbredd || x > centra[4] + halvbredd) return null;
    let bast = 0; for (let i = 1; i < 5; i++) if (Math.abs(centra[i] - x) < Math.abs(centra[bast] - x)) bast = i;
    return bast;
  };

  const lektioner: SchemaPdfLektion[] = [];
  const ovrigt: string[] = [];
  for (let kol = 0; kol < 5; kol++) {
    const iKol = items.filter((i) => kolFor(i.x) === kol && i.y < toppY + 5)
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let pendingStart: string | null = null;
    let block: string[] = [];
    const avsluta = (slut: string) => {
      const text = block.join(' ').replace(/\s+/g, ' ').trim();
      block = [];
      if (pendingStart === null || text === '') return;
      const m = /^(\S+)\s+(\d[A-ZÅÄÖ])(?::([ab]))?\s+([A-Z]\d{2,4})$/.exec(text);
      const amne = m !== null ? AMNEN[m[1]] : undefined;
      if (m !== null && amne !== undefined) {
        lektioner.push({
          dag: kol + 1, start: norm(pendingStart), slut: norm(slut), amne,
          klass: m[2], omfattning: m[3] === 'a' ? 'A' : m[3] === 'b' ? 'B' : 'hel', sal: m[4],
        });
      } else {
        ovrigt.push(`${['Mån', 'Tis', 'Ons', 'Tor', 'Fre'][kol]} ${norm(pendingStart)}–${norm(slut)}: ${text}`);
      }
      pendingStart = null;
    };
    for (const i of iKol) {
      if (TID.test(i.text)) {
        if (block.length > 0) avsluta(i.text);
        else pendingStart = i.text;
      } else {
        block.push(i.text);
      }
    }
  }
  return { larareNamn, signatur, lasar, lektioner, ovrigt };
}

export interface SchemaImportUtfall {
  s: Struktur;
  /** Det som skapades: 'tjänst MatTe Ma/NO+Tk', 'klass 8F', '8F · Matematik' … */
  skapade: string[];
  /** Fanns redan med schema — rördes inte. */
  hoppade: string[];
  /** Fanns men saknade schema — fick schemat ur PDF:en. */
  kompletterade: string[];
}

/**
 * Del 142 · Slår ihop ett tolkat schema med strukturen. Kan köras hur många gånger
 * som helst: lärare, tjänst (samma lärare på samma skolår), klass (samma namn i
 * tjänsten) och ämne (samma namn i klassen) återanvänds. Ett ämne som redan har
 * schema hoppas över; ett ämne utan schema kompletteras; det som saknas skapas.
 */
export function slaIhopSchema(s: Struktur, t: TolkatSchema, skolarId: string): SchemaImportUtfall {
  let ut = s;
  const skapade: string[] = []; const hoppade: string[] = []; const kompletterade: string[] = [];
  // Lärare: samma signatur = samma lärare
  const befintlig = s.larare.find((l) => l.signatur === t.signatur && t.signatur !== '');
  const larareId = befintlig ? befintlig.id : nyttId('lr');
  if (!befintlig) { ut = laggTillLarare(ut, { id: larareId, namn: t.larareNamn, signatur: t.signatur }); skapade.push(`lärare ${t.larareNamn}`); }
  // Tjänst: lärarens tjänst på skolåret, annars en med samma namn
  const tjanstNamn = `${t.signatur} Ma/NO+Tk`.trim();
  const tjanst = ut.tjanster.find((x) => x.skolarId === skolarId && (x.larareId === larareId || x.namn === tjanstNamn));
  const tjanstId = tjanst?.id ?? nyttId('tj');
  if (tjanst === undefined) {
    ut = laggTillTjanst(ut, { id: tjanstId, skolarId, namn: tjanstNamn });
    ut = sattLarare(ut, tjanstId, larareId);
    skapade.push(`tjänst ${tjanstNamn}`);
  } else if (tjanst.larareId === undefined) {
    ut = sattLarare(ut, tjanstId, larareId);
  }
  // Klasser: samma namn i tjänsten
  const klassId = new Map<string, string>();
  for (const namn of [...new Set(t.lektioner.map((l) => l.klass))].sort()) {
    const finns = ut.klasser.find((k) => k.tjanstId === tjanstId && k.namn === namn);
    if (finns !== undefined) { klassId.set(namn, finns.id); continue; }
    const id = nyttId('k');
    klassId.set(namn, id);
    ut = laggTillKlass(ut, { id, tjanstId, namn });
    skapade.push(`klass ${namn}`);
  }
  // Ämnen: samma namn i klassen — med schema: hoppa; utan schema: komplettera; saknas: skapa
  const harSchema = (a: { schema: Pass[]; schemaB?: Pass[] }) => a.schema.length > 0 || (a.schemaB?.length ?? 0) > 0;
  for (const [klassNamn, kid] of klassId) {
    const ma: Pass[] = t.lektioner.filter((l) => l.klass === klassNamn && l.amne === 'Matematik')
      .map(({ dag, start, slut }) => ({ dag, start, slut }));
    if (ma.length > 0) {
      const finns = ut.amnen.find((a) => a.klassId === kid && a.namn === 'Matematik');
      if (finns === undefined) { ut = laggTillAmne(ut, { id: nyttId('am'), klassId: kid, namn: 'Matematik', schema: ma }); skapade.push(`${klassNamn} · Matematik`); }
      else if (harSchema(finns)) hoppade.push(`${klassNamn} · Matematik`);
      else { ut = uppdateraAmne(ut, finns.id, { schema: ma }); kompletterade.push(`${klassNamn} · Matematik`); }
    }
    const no: OmfattningsPass[] = t.lektioner.filter((l) => l.klass === klassNamn && l.amne === NO_TK)
      .map(({ dag, start, slut, omfattning }) => ({ dag, start, slut, omfattning }));
    if (no.length > 0) {
      const { schema, schemaB } = delaHalvklassPass(no);
      const befintligaNo = ut.amnen.filter((a) => a.klassId === kid && (NO_TK_AMNEN as readonly string[]).includes(a.namn));
      const grupp = befintligaNo.find((a) => a.noGrupp !== undefined)?.noGrupp ?? nyttId('no');
      NO_TK_AMNEN.forEach((namn, order) => {
        const finns = befintligaNo.find((a) => a.namn === namn);
        if (finns === undefined) {
          ut = laggTillAmne(ut, { id: nyttId('am'), klassId: kid, namn, schema, schemaB, halvklass: true, noGrupp: grupp, noOrder: order });
          skapade.push(`${klassNamn} · ${namn}`);
        } else if (harSchema(finns)) hoppade.push(`${klassNamn} · ${namn}`);
        else { ut = uppdateraAmne(ut, finns.id, { schema, ...(schemaB.length > 0 ? { schemaB } : {}), halvklass: true, noGrupp: finns.noGrupp ?? grupp, noOrder: finns.noOrder ?? order }); kompletterade.push(`${klassNamn} · ${namn}`); }
      });
    }
  }
  return { s: ut, skapade, hoppade, kompletterade };
}

/**
 * Skapar lärare + tjänst + klasser + ämnen (Matematik och NO+Tk med hel-/
 * halvklasspass) ur ett tolkat schema, kopplat till ett befintligt skolår.
 * Sedan Del 142 samma sak som slaIhopSchema — en andra import ger inga dubbletter.
 */
export function skapaTjanstFranSchema(s: Struktur, t: TolkatSchema, skolarId: string): Struktur {
  return slaIhopSchema(s, t, skolarId).s;
}
