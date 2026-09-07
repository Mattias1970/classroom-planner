/**
 * SuperTeach · Elevrapport — kopplar elevens förhör till bokens delkapitel
 * och listar vad som behöver övas: begrepp med förklaring, sammanfattning
 * per kapitel och filmer. (Ring 1, I2: ren funktion.)
 *
 * Koppling resultat → delkapitel: Socrative-rummet ('Biologi41' = kap 4,
 * delkapitel 1; 'Biologi412' = 4.1–4.2 kumulativt), annars provnamnet
 * ('Quiz 1.2a' → 1.2). Ett delkapitel behöver övas när elevens SENASTE
 * resultat på något förhör som täcker det ligger under BAM-kravet.
 */
import type { Bok, Delkapitel, Elev, Kapitel, LektionsPlan, Struktur } from './typer.js';
import { kravFor, resultatProcent, type Resultat, type ResultatKalla } from './resultat.js';
import { delkapitelKod } from './bok.js';

export interface RapportResultat { kalla: ResultatKalla; prov: string; datum: string; procent: number; krav: number | null; klarat: boolean | null; rum?: string; }
export type DelStatus = 'klarat' | 'ova' | 'ej-testat';
export interface RapportBegrepp { begrepp: string; forklaring: string | null; }
export interface RapportDelkapitel {
  kod: string; namn: string; status: DelStatus;
  resultat: RapportResultat[];
  /** Elevens senaste resultat per källa (det som avgör status). */
  senaste: RapportResultat[];
  begrepp: RapportBegrepp[];
  /** Socrative-rummet för delkapitlets begrepp, t.ex. 'Biologi41'. */
  socrativeRum: string | null;
  mal: string | null;
  sammanfattning: string | null;
  filmer: Array<{ titel: string; url: string }>;
}
export interface RapportKapitel {
  nr: number; namn: string;
  sammanfattning: string | null;
  delkapitel: RapportDelkapitel[];
  /** Alla begrepp i kapitlet som behöver övas (dedupade, bokordning). */
  attOva: RapportBegrepp[];
  /** Filmer att se: delkapitlens + kapitlets. */
  filmer: Array<{ titel: string; url: string; for: string }>;
}
export interface Elevrapport {
  elev: Elev; amneNamn: string; bokNamn: string | null;
  kapitel: RapportKapitel[];
  /** Resultat som inte gick att knyta till något delkapitel. */
  okopplade: RapportResultat[];
  /** Kort läshjälp för eleven/vårdnadshavaren. */
  sammanfattning: string;
}

/** 'Biologi412' → { kapitel: 4, delar: [1, 2] }; 'Matte8B' → null. */
export function tolkaRumKoder(rum: string): { kapitel: number; delar: number[] } | null {
  const m = /^[^\d]+(\d)(\d+)$/.exec(rum.trim());
  if (m === null) return null;
  return { kapitel: Number(m[1]), delar: m[2].split('').map(Number) };
}

/**
 * Delkapitelkoder som ett prov täcker. Rummet först ('Biologi412' → 4.1, 4.2).
 * När rummet är klassrummet ('BIOLOGI8BB') läses koderna ur quiznamnet, och då
 * måste hela namnet tolkas: 'Bi 4.1-4.3 Begrepp' täcker 4.1, 4.2 OCH 4.3, och
 * '4.1 - 4.4 begrepp' alla fyra. Ett kumulativt förhör testar av de tidigare
 * delkapitlen igen — fråga 1 är densamma i alla prov.
 */
export function koderForProv(prov: string, rum?: string): string[] {
  const viaRum = rum !== undefined ? tolkaRumKoder(rum) : null;
  if (viaRum !== null) return viaRum.delar.map((d) => `${viaRum.kapitel}.${d}`);
  const koder: string[] = [];
  // Intervall först: '4.1-4.3', '4.1 – 4.4', '4.1-3'
  for (const m of prov.matchAll(/(\d+)\.(\d+)\s*[-–—]\s*(?:(\d+)\.)?(\d+)/g)) {
    const kap = Number(m[1]); const fran = Number(m[2]); const till = Number(m[4]);
    if (m[3] !== undefined && Number(m[3]) !== kap) continue;
    for (let d = fran; d <= till && d - fran < 12; d++) koder.push(`${kap}.${d}`);
  }
  for (const m of prov.matchAll(/(\d+)\.(\d+)/g)) koder.push(`${Number(m[1])}.${Number(m[2])}`);
  if (koder.length > 0) return [...new Set(koder)].sort((a, b) => a.localeCompare(b, 'sv', { numeric: true }));
  const kod = delkapitelKod(prov);
  return kod === null ? [] : [kod];
}

/** Delkapitelkoder ('4.1') som ett resultat täcker. */
export function delkapitelForResultat(r: Resultat): string[] {
  return koderForProv(r.prov, r.rum);
}

function tillRapport(r: Resultat): RapportResultat | null {
  const procent = resultatProcent(r);
  if (procent === null) return null;
  const krav = kravFor(r.kalla);
  return { kalla: r.kalla, prov: r.prov, datum: r.datum, procent, krav, klarat: krav === null ? null : procent >= krav, ...(r.rum !== undefined ? { rum: r.rum } : {}) };
}

/** 'Biologi41 (krav ≥ 70 %)' → 'Biologi41'. */
export function rumUrLektion(exitFalt: string[]): string | null {
  for (const f of exitFalt) {
    const m = /^\s*([A-Za-zÅÄÖåäö]+\d+)/.exec(f ?? '');
    if (m !== null) return m[1];
  }
  return null;
}

/** Länk som eleven kan klicka på för att öva i ett Socrative-rum. */
export function socrativeElevLank(rum: string): string {
  return `https://b.socrative.com/student/#joinRoom/${encodeURIComponent(rum.trim().toUpperCase())}`;
}

function normFraga(t: string): string {
  return t.toLowerCase().replace(/[.,;:!?"'()[\]{}…]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Slår upp vilket begrepp en frågetext beskriver. Socrative-frågan ÄR
 * begreppsbeskrivningen ur boken ('En naturtyp med vissa typiska djur- och
 * växtsamhällen' → biotop), så matchningen görs mot bokens förklaringar:
 * exakt normaliserad text först, sedan gemensam början, sist tydlig
 * ordöverlappning.
 */
export function begreppForFraga(forklaringar: Record<string, string>, fraga: string): string | null {
  const f = normFraga(fraga);
  if (f === '') return null;
  const poster = Object.entries(forklaringar).map(([b, text]) => [b, normFraga(text)] as const);
  const exakt = poster.find(([, text]) => text === f);
  if (exakt !== undefined) return exakt[0];
  const borjan = poster.find(([, text]) => text.startsWith(f.slice(0, Math.min(f.length, 40))) || f.startsWith(text.slice(0, Math.min(text.length, 40))));
  if (borjan !== undefined) return borjan[0];
  // Ordöverlappning: quizet kan sakna bokstäver eller vara nedkortat
  const ord = new Set(f.split(' ').filter((o) => o.length > 3));
  if (ord.size < 3) return null;
  let bast: { begrepp: string; andel: number } | null = null;
  for (const [b, text] of poster) {
    const andra = new Set(text.split(' ').filter((o) => o.length > 3));
    if (andra.size === 0) continue;
    const gemensam = [...ord].filter((o) => andra.has(o)).length;
    const andel = gemensam / Math.max(ord.size, andra.size);
    if (bast === null || andel > bast.andel) bast = { begrepp: b, andel };
  }
  return bast !== null && bast.andel >= 0.6 ? bast.begrepp : null;
}

function forklaringFor(kap: Kapitel, begrepp: string): string | null {
  const f = kap.resurser.forklaringar ?? {};
  const direkt = f[begrepp];
  if (direkt !== undefined) return direkt;
  const nyckel = Object.keys(f).find((k) => k.toLowerCase() === begrepp.toLowerCase());
  return nyckel === undefined ? null : f[nyckel];
}

function planerFor(s: Struktur, amneId: string, bok: Bok, del: Delkapitel): LektionsPlan[] {
  // LektionsPlan pekar på position i ämnets lektionsföljd = bokens lektionsordning
  const alla: Array<{ index: number; lektionId: number }> = [];
  let i = 0;
  for (const kap of bok.kapitel) {
    for (const d of kap.delkapitel) for (const l of d.lektioner) alla.push({ index: i++, lektionId: l.id });
    for (const l of kap.extraLektioner) alla.push({ index: i++, lektionId: l.id });
  }
  const ids = new Set(del.lektioner.map((l) => l.id));
  const index = new Set(alla.filter((x) => ids.has(x.lektionId)).map((x) => x.index));
  return s.lektionsplaner.filter((p) => p.amneId === amneId && index.has(p.lektionsIndex));
}

function filmerUr(planer: LektionsPlan[], del: Delkapitel): Array<{ titel: string; url: string }> {
  const ut: Array<{ titel: string; url: string }> = [];
  for (const p of planer) {
    for (const f of p.filmer ?? []) { const [titel, url] = f.split('|'); if (url !== undefined && url.trim() !== '') ut.push({ titel: titel.trim(), url: url.trim() }); }
    if (p.flippFilm !== undefined && p.flippFilm.trim() !== '') ut.push({ titel: `Flippad film ${del.kod}`, url: p.flippFilm.trim() });
  }
  for (const l of del.lektioner) if (l.genomgangLank !== undefined && l.genomgangLank.trim() !== '') ut.push({ titel: `Genomgång ${l.avsnitt}`, url: l.genomgangLank.trim() });
  const sedda = new Set<string>();
  return ut.filter((f) => (sedda.has(f.url) ? false : (sedda.add(f.url), true)));
}

/** Elevrapport för ett ämne, valfritt begränsad till ett datumintervall. */
export function elevrapport(s: Struktur, elevId: string, amneId: string, period?: { fran?: string; till?: string }): Elevrapport {
  const elev = s.elever.find((e) => e.id === elevId);
  const amne = s.amnen.find((a) => a.id === amneId);
  if (elev === undefined || amne === undefined) throw new Error('Okänd elev eller okänt ämne.');
  const bok = s.bocker.find((b) => b.id === amne.bokId) ?? null;
  const rs = (s.resultat ?? []).filter((r) => r.elevId === elevId && r.amneId === amneId
    && (period?.fran === undefined || r.datum >= period.fran) && (period?.till === undefined || r.datum <= period.till))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const perDel = new Map<string, RapportResultat[]>();
  const okopplade: RapportResultat[] = [];
  for (const r of rs) {
    const rr = tillRapport(r); if (rr === null) continue;
    const koder = delkapitelForResultat(r);
    if (koder.length === 0) { okopplade.push(rr); continue; }
    for (const k of koder) perDel.set(k, [...(perDel.get(k) ?? []), rr]);
  }
  const kapitel: RapportKapitel[] = [];
  for (const kap of bok?.kapitel ?? []) {
    const delar: RapportDelkapitel[] = kap.delkapitel.map((del) => {
      const resultat = perDel.get(del.kod) ?? [];
      const senaste = [...new Set(resultat.map((r) => r.kalla))].map((k) => [...resultat].reverse().find((r) => r.kalla === k)!);
      const bedomda = senaste.filter((r) => r.klarat !== null);
      const status: DelStatus = bedomda.length === 0 ? 'ej-testat' : bedomda.every((r) => r.klarat) ? 'klarat' : 'ova';
      const planer = planerFor(s, amneId, bok!, del);
      const begreppNamn = [...new Set([...del.begrepp, ...planer.flatMap((p) => (p.begreppText ?? '').split(',').map((b) => b.trim()).filter(Boolean))])];
      return {
        kod: del.kod, namn: del.namn, status, resultat, senaste,
        begrepp: begreppNamn.map((b) => ({ begrepp: b, forklaring: forklaringFor(kap, b) })),
        socrativeRum: rumUrLektion(del.lektioner.map((l) => l.exit)),
        mal: del.lektioner.map((l) => l.mal).find((m): m is string => m !== undefined && m.trim() !== '') ?? null,
        sammanfattning: planer.map((p) => p.sammanfattning).find((x): x is string => x !== undefined && x.trim() !== '') ?? null,
        filmer: filmerUr(planer, del),
      };
    });
    if (delar.every((d) => d.status === 'ej-testat')) continue; // kapitel som inte påbörjats utelämnas
    const attOva: RapportBegrepp[] = [];
    const sedda = new Set<string>();
    for (const d of delar) if (d.status === 'ova') for (const b of d.begrepp) if (!sedda.has(b.begrepp.toLowerCase())) { sedda.add(b.begrepp.toLowerCase()); attOva.push(b); }
    const seddaUrl = new Set<string>();
    const filmer = [
      ...delar.filter((d) => d.status === 'ova').flatMap((d) => d.filmer.map((f) => ({ ...f, for: d.kod }))),
      ...kap.resurser.filmer.map((f) => ({ ...f, for: `kap ${kap.nr}` })),
    ].filter((f) => (seddaUrl.has(f.url) ? false : (seddaUrl.add(f.url), true)));
    const sam = delar.map((d) => (d.sammanfattning ?? d.mal) === null ? null : `${d.kod} ${d.namn}: ${d.sammanfattning ?? d.mal}`).filter((x): x is string => x !== null);
    kapitel.push({ nr: kap.nr, namn: kap.namn, sammanfattning: sam.length === 0 ? null : sam.join('\n'), delkapitel: delar, attOva, filmer });
  }
  const ova = kapitel.flatMap((k) => k.delkapitel.filter((d) => d.status === 'ova'));
  const klarat = kapitel.flatMap((k) => k.delkapitel.filter((d) => d.status === 'klarat'));
  const antalBegrepp = kapitel.reduce((n, k) => n + k.attOva.length, 0);
  const sammanfattning = ova.length === 0
    ? (klarat.length === 0 ? 'Inga förhör i urvalet ännu.' : `${elev.namn} har klarat kraven i ${klarat.length} delkapitel. Inget behöver övas just nu.`)
    : `${elev.namn} behöver öva ${ova.map((d) => d.kod).join(', ')} (${antalBegrepp} begrepp). ${klarat.length > 0 ? `Klarat: ${klarat.map((d) => d.kod).join(', ')}.` : ''}`.trim();
  return { elev, amneNamn: amne.namn, bokNamn: bok?.titel ?? null, kapitel, okopplade, sammanfattning };
}

/** Rapporten som ren text (för Teams/utskrift). */
export function elevrapportText(r: Elevrapport): string {
  const rader: string[] = [`${r.elev.namn} — ${r.amneNamn}`, r.sammanfattning, ''];
  for (const k of r.kapitel) {
    rader.push(`Kapitel ${k.nr} ${k.namn}`);
    for (const d of k.delkapitel) {
      const st = d.status === 'klarat' ? '✓ klarat' : d.status === 'ova' ? '✗ öva' : '– ej testat';
      rader.push(`  ${d.kod} ${d.namn}: ${st}${d.senaste.length > 0 ? ` (${d.senaste.map((x) => `${x.procent} %`).join(', ')})` : ''}`);
    }
    if (k.sammanfattning !== null) rader.push('  Sammanfattning:', ...k.sammanfattning.split('\n').map((x) => `    ${x}`));
    if (k.attOva.length > 0) rader.push('  Begrepp att öva:', ...k.attOva.map((b) => `    • ${b.begrepp}${b.forklaring !== null ? ` — ${b.forklaring}` : ''}`));
    if (k.filmer.length > 0) rader.push('  Filmer:', ...k.filmer.map((f) => `    ▶ ${f.titel} (${f.for}) ${f.url}`));
    rader.push('');
  }
  return rader.join('\n').trim();
}
