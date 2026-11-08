/**
 * Del 227 · Kapitlens ordning i planeringen.
 *
 * Boken läses inte alltid i bokens följd — kapitel 10 kan komma före kapitel 7. Läraren väljer
 * ordningen på kapitel (och delkapitel inom ett kapitel) när planeringen skapas och kan ändra
 * den senare; bokens ordning är förvalet. Bygger på Del 149 (kursOrdning): hela kapitlets
 * kurser — delkapitel, prov och egna rader som hör till kapitlet — flyttas som ett block.
 * Genomförda kurser (datum före idag) rörs aldrig; ett kapitel med en genomförd kurs är låst.
 */
import { amnesPlanFor, andraPlanering, kursLista, type Kurs } from './struktur.js';
import type { PlanFranUtkast, Struktur } from './typer.js';

/** Lärarens ordning: kapitelnummer i läsföljd och, per kapitel, delkapitelkoderna i läsföljd. */
export interface KapitelOrdning {
  kapitel: number[];
  /** Nyckel = kapitelnummer (som text, t.ex. '7'); värde = koder ('7.1', '7.3' …) i den följd de läses. */
  delkapitel?: Record<string, string[]>;
}

export interface KapitelIPlanen {
  nr: number;
  namn: string;
  /** Kapitlet har minst en genomförd kurs — det flyttas inte. */
  genomford: boolean;
  /** Kurserna i kapitlet i planens ordning (delkapitel, prov, egna rader). */
  kurser: Kurs[];
  /** Delkapitelkoderna i planens ordning ('7.1', '7.2' …). */
  delkapitel: string[];
  /** Kapitlet finns i boken men har inga lektioner kvar i planen (allt borttaget). */
  tomt: boolean;
}

/** Koden ur en kursnyckel: '7:7.3' → '7.3'; null för prov och egna rader. */
function kodUrKurs(k: Kurs): string | null {
  const m = /^\d+:(\d+\.\d+)$/.exec(k.nyckel);
  return m === null ? null : m[1];
}

/**
 * Kapitlen i den ordning de läses i ämnets plan (utan plan: bokens ordning), med kurserna i varje
 * kapitel. Kapitel som saknar lektioner i planen läggs sist och markeras `tomt`.
 */
export function planensKapitel(s: Struktur, amneId: string, idag?: string): KapitelIPlanen[] {
  const amne = s.amnen.find((a) => a.id === amneId);
  const bok = s.bocker.find((b) => b.id === amne?.bokId);
  if (amne === undefined || bok === undefined) return [];
  const namn = (nr: number) => bok.kapitel.find((k) => k.nr === nr)?.namn ?? `Kapitel ${nr}`;
  const plan = amnesPlanFor(s, amneId, idag, false);
  const ut: KapitelIPlanen[] = [];
  if (plan !== null) {
    const index = new Map<number, number>();
    for (const k of kursLista(plan.a, idag)) {
      let i = index.get(k.kapitel);
      if (i === undefined) { i = ut.length; index.set(k.kapitel, i); ut.push({ nr: k.kapitel, namn: namn(k.kapitel), genomford: false, kurser: [], delkapitel: [], tomt: false }); }
      const kap = ut[i];
      kap.kurser.push(k);
      kap.genomford = kap.genomford || k.genomford;
      const kod = kodUrKurs(k);
      if (kod !== null && !kap.delkapitel.includes(kod)) kap.delkapitel.push(kod);
    }
  }
  for (const k of bok.kapitel) {
    if (ut.some((x) => x.nr === k.nr)) continue;
    ut.push({ nr: k.nr, namn: k.namn, genomford: false, kurser: [], delkapitel: k.delkapitel.map((d) => d.kod), tomt: plan !== null });
  }
  return ut;
}

/** Bokens egen ordning — förvalet första gången. */
export function bokensKapitelOrdning(s: Struktur, amneId: string): KapitelOrdning {
  const amne = s.amnen.find((a) => a.id === amneId);
  const bok = s.bocker.find((b) => b.id === amne?.bokId);
  if (bok === undefined) return { kapitel: [] };
  return { kapitel: bok.kapitel.map((k) => k.nr), delkapitel: Object.fromEntries(bok.kapitel.map((k) => [String(k.nr), k.delkapitel.map((d) => d.kod)])) };
}

/** Planens nuvarande ordning som KapitelOrdning (det läraren ser och kan ändra). */
export function planensKapitelOrdning(s: Struktur, amneId: string, idag?: string): KapitelOrdning {
  const kap = planensKapitel(s, amneId, idag);
  return { kapitel: kap.map((k) => k.nr), delkapitel: Object.fromEntries(kap.map((k) => [String(k.nr), k.delkapitel])) };
}

/** Två ordningar är lika när kapitlen och alla angivna delkapitel står i samma följd. */
export function sammaKapitelOrdning(a: KapitelOrdning, b: KapitelOrdning): boolean {
  if (a.kapitel.join(',') !== b.kapitel.join(',')) return false;
  for (const nr of a.kapitel) {
    const x = a.delkapitel?.[String(nr)]; const y = b.delkapitel?.[String(nr)];
    if (x === undefined || y === undefined) continue;
    if (x.join(',') !== y.join(',')) return false;
  }
  return true;
}

/** Flyttar kapitel `nr` ett steg tidigare (−1) eller senare (+1) i en ordning. */
export function flyttaKapitelIOrdning(o: KapitelOrdning, nr: number, steg: -1 | 1): KapitelOrdning {
  const i = o.kapitel.indexOf(nr); const j = i + steg;
  if (i === -1 || j < 0 || j >= o.kapitel.length) return o;
  const kapitel = [...o.kapitel]; [kapitel[i], kapitel[j]] = [kapitel[j], kapitel[i]];
  return { ...o, kapitel };
}

/** Flyttar delkapitlet `kod` ett steg inom sitt kapitel. */
export function flyttaDelkapitelIOrdning(o: KapitelOrdning, kod: string, steg: -1 | 1): KapitelOrdning {
  const nr = kod.split('.')[0];
  const lista = o.delkapitel?.[nr];
  if (lista === undefined) return o;
  const i = lista.indexOf(kod); const j = i + steg;
  if (i === -1 || j < 0 || j >= lista.length) return o;
  const ny = [...lista]; [ny[i], ny[j]] = [ny[j], ny[i]];
  return { ...o, delkapitel: { ...o.delkapitel, [nr]: ny } };
}

/**
 * Kursernas nya följd (gruppnycklar) ur en kapitelordning: genomförda kurser behåller sina
 * platser; övriga kurser fylls på i kapitelordningens följd, och inom kapitlet i delkapitlens
 * följd (prov och egna rader behåller sin plats bland kapitlets kurser). Kapitel som inte nämns
 * kommer sist i planens nuvarande ordning.
 */
export function kursOrdningUrKapitelOrdning(kapitel: KapitelIPlanen[], o: KapitelOrdning): string[] {
  const kapFoljd = [...o.kapitel.filter((nr) => kapitel.some((k) => k.nr === nr)), ...kapitel.map((k) => k.nr).filter((nr) => !o.kapitel.includes(nr))];
  const alla = kapitel.flatMap((k) => k.kurser);
  const flyttbara: Kurs[] = [];
  for (const nr of kapFoljd) {
    const kap = kapitel.find((k) => k.nr === nr)!;
    const onskad = o.delkapitel?.[String(nr)];
    let kurser = kap.kurser.filter((k) => !k.genomford);
    if (onskad !== undefined) {
      // Delkapitlen i önskad följd på delkapitlens platser; prov/egna rader står kvar där de står
      const platser = kurser.map((k, i) => (kodUrKurs(k) !== null ? i : -1)).filter((i) => i >= 0);
      const dk = kurser.filter((k) => kodUrKurs(k) !== null);
      const sorterade = [...dk].sort((x, y) => {
        const ix = onskad.indexOf(kodUrKurs(x)!); const iy = onskad.indexOf(kodUrKurs(y)!);
        return (ix === -1 ? 1e9 : ix) - (iy === -1 ? 1e9 : iy) || dk.indexOf(x) - dk.indexOf(y);
      });
      kurser = [...kurser];
      platser.forEach((p, i) => { kurser[p] = sorterade[i]; });
    }
    flyttbara.push(...kurser);
  }
  let i = 0;
  return alla.map((k) => (k.genomford ? k.nyckel : flyttbara[i++].nyckel));
}

/**
 * Sätter kapitlens (och delkapitlens) ordning i ämnets plan. Lektionsplanerna följer sina
 * lektioner (andraPlanering). Ligger ett utkast inlagt (planFranUtkast) ordnas även dess
 * teorikö om, så att ordningen slår igenom från utkastets startdatum; lärarens fasta kort i kön
 * (prov, diagnoser, egna rader) behåller sina pass.
 */
export function sattKapitelOrdning(s: Struktur, amneId: string, o: KapitelOrdning, idag?: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  const plan = amnesPlanFor(s, amneId, idag, false);
  if (plan === null) throw new Error('Ämnet saknar bok eller skolår.');
  const kapitel = planensKapitel(s, amneId, idag).filter((k) => !k.tomt);
  const ordning = kursOrdningUrKapitelOrdning(kapitel, o);
  let ut = andraPlanering(s, amneId, { kursOrdning: ordning }, idag);
  const u = amne.planFranUtkast;
  if (u !== undefined) {
    // Nya följden av teorinycklar: kursernas rader i ny ordning
    const rader = new Map<string, string[]>();
    const radNycklar = plan.a.filter((r) => r.nyckel !== undefined).map((r) => r.nyckel!);
    const grupp = (n: string): string | null => {
      const kurs = kapitel.flatMap((k) => k.kurser).find((k) => plan.a.slice(k.forsta, k.sista + 1).some((r) => r.nyckel === n));
      return kurs?.nyckel ?? null;
    };
    for (const n of radNycklar) { const g = grupp(n); if (g !== null) rader.set(g, [...(rader.get(g) ?? []), n]); }
    const onskad = ordning.flatMap((g) => rader.get(g) ?? []).filter((n) => u.teori.includes(n));
    const flyttbar = new Set(onskad);
    let i = 0;
    const teori = u.teori.map((n) => (flyttbar.has(n) ? onskad[i++] : n));
    const nyttUtkast: PlanFranUtkast = { ...u, teori };
    ut = andraPlanering(ut, amneId, { planFranUtkast: nyttUtkast }, idag);
  }
  return ut;
}
