/**
 * Strukturen (v2): immutabla operationer på trädet
 * Skolår ─ Tjänst ─ Klass ─ Ämne, plus lärare, böcker och planeringar.
 * Borttag kaskaderar nedåt; böcker är fristående och kopplas via bokId.
 */
import { bokLektioner } from './bok.js';
import { isoVecka, passSparr } from './skolar.js';
import type {
  Amne, Bok, Klass, Larare, Pass, PlaneradLektion, Planering, Skolar, Struktur, Tjanst,
} from './typer.js';

let seq = 0;
/** Deterministiskt unikt id (testbart via reset). */
export function nyttId(prefix: string): string { seq += 1; return `${prefix}-${seq.toString(36)}`; }
export function resetIdRaknare(): void { seq = 0; }

export function giltigtPass(p: Pass): boolean {
  return p.dag >= 1 && p.dag <= 5 && /^\d{2}:\d{2}$/.test(p.start) && /^\d{2}:\d{2}$/.test(p.slut) && p.start < p.slut;
}

// ── Skolår ───────────────────────────────────────────────────
export function laggTillSkolar(s: Struktur, skolar: Skolar): Struktur {
  return { ...s, skolar: [...s.skolar, skolar] };
}
export function uppdateraSkolar(s: Struktur, id: string, patch: Partial<Skolar>): Struktur {
  return { ...s, skolar: s.skolar.map((x) => (x.id === id ? { ...x, ...patch, id: x.id } : x)) };
}
export function taBortSkolar(s: Struktur, id: string): Struktur {
  const tjanster = s.tjanster.filter((t) => t.skolarId === id).map((t) => t.id);
  let ut: Struktur = { ...s, skolar: s.skolar.filter((x) => x.id !== id) };
  for (const t of tjanster) ut = taBortTjanst(ut, t);
  return ut;
}

// ── Lärare ───────────────────────────────────────────────────
export function laggTillLarare(s: Struktur, larare: Larare): Struktur {
  return { ...s, larare: [...s.larare, larare] };
}
export function taBortLarare(s: Struktur, id: string): Struktur {
  return {
    ...s,
    larare: s.larare.filter((l) => l.id !== id),
    tjanster: s.tjanster.map((t) => (t.larareId === id ? { ...t, larareId: undefined } : t)),
  };
}

// ── Tjänst ───────────────────────────────────────────────────
export function laggTillTjanst(s: Struktur, tjanst: Tjanst): Struktur {
  if (!s.skolar.some((x) => x.id === tjanst.skolarId)) throw new Error('Tjänsten måste höra till ett skolår.');
  return { ...s, tjanster: [...s.tjanster, tjanst] };
}
/** Kopplar (eller kopplar bort med undefined) en lärare till tjänsten. */
export function sattLarare(s: Struktur, tjanstId: string, larareId: string | undefined): Struktur {
  if (larareId !== undefined && !s.larare.some((l) => l.id === larareId)) throw new Error('Okänd lärare.');
  return { ...s, tjanster: s.tjanster.map((t) => (t.id === tjanstId ? { ...t, larareId } : t)) };
}
export function taBortTjanst(s: Struktur, id: string): Struktur {
  const klasser = s.klasser.filter((k) => k.tjanstId === id).map((k) => k.id);
  let ut: Struktur = { ...s, tjanster: s.tjanster.filter((t) => t.id !== id) };
  for (const k of klasser) ut = taBortKlass(ut, k);
  return ut;
}

// ── Klass ────────────────────────────────────────────────────
export function laggTillKlass(s: Struktur, klass: Klass): Struktur {
  if (!s.tjanster.some((t) => t.id === klass.tjanstId)) throw new Error('Klassen måste höra till en tjänst.');
  return { ...s, klasser: [...s.klasser, klass] };
}
export function uppdateraKlass(s: Struktur, id: string, patch: Partial<Klass>): Struktur {
  return { ...s, klasser: s.klasser.map((k) => (k.id === id ? { ...k, ...patch, id: k.id, tjanstId: k.tjanstId } : k)) };
}
export function taBortKlass(s: Struktur, id: string): Struktur {
  const amnen = s.amnen.filter((a) => a.klassId === id).map((a) => a.id);
  let ut: Struktur = { ...s, klasser: s.klasser.filter((k) => k.id !== id) };
  for (const a of amnen) ut = taBortAmne(ut, a);
  return ut;
}

// ── Ämne ─────────────────────────────────────────────────────
/** Ämnet kräver ett eget schema — inget ärvs (minst ett giltigt pass). */
export function laggTillAmne(s: Struktur, amne: Amne): Struktur {
  if (!s.klasser.some((k) => k.id === amne.klassId)) throw new Error('Ämnet måste höra till en klass.');
  if (amne.schema.length === 0 || !amne.schema.every(giltigtPass)) {
    throw new Error('Ämnet behöver minst ett giltigt lektionspass (veckodag mån–fre, start < slut).');
  }
  if (amne.bokId !== undefined && !s.bocker.some((b) => b.id === amne.bokId)) throw new Error('Okänd bok.');
  return { ...s, amnen: [...s.amnen, amne] };
}
export function uppdateraAmne(s: Struktur, id: string, patch: Partial<Amne>): Struktur {
  if (patch.schema !== undefined && (patch.schema.length === 0 || !patch.schema.every(giltigtPass))) {
    throw new Error('Ämnet behöver minst ett giltigt lektionspass.');
  }
  if (patch.bokId !== undefined && patch.bokId !== '' && !s.bocker.some((b) => b.id === patch.bokId)) {
    throw new Error('Okänd bok.');
  }
  return {
    ...s,
    amnen: s.amnen.map((a) => (a.id === id
      ? { ...a, ...patch, id: a.id, bokId: patch.bokId === '' ? undefined : (patch.bokId ?? a.bokId) }
      : a)),
  };
}
export function taBortAmne(s: Struktur, id: string): Struktur {
  return {
    ...s,
    amnen: s.amnen.filter((a) => a.id !== id),
    planeringar: s.planeringar.filter((p) => p.amneId !== id),
  };
}

// ── Bok ──────────────────────────────────────────────────────
/** Importerad bok läggs till/uppdateras (samma id ersätter). */
export function sparaBok(s: Struktur, bok: Bok): Struktur {
  const fanns = s.bocker.some((b) => b.id === bok.id);
  return { ...s, bocker: fanns ? s.bocker.map((b) => (b.id === bok.id ? bok : b)) : [...s.bocker, bok] };
}
export function taBortBok(s: Struktur, id: string): Struktur {
  return {
    ...s,
    bocker: s.bocker.filter((b) => b.id !== id),
    amnen: s.amnen.map((a) => (a.bokId === id ? { ...a, bokId: undefined } : a)),
    planeringar: s.planeringar.filter((p) => p.bokId !== id),
  };
}

// ── Härledda scheman ─────────────────────────────────────────
export interface SchemaRad extends Pass { klassNamn: string; amnesNamn: string; }

/** Klassens schema = unionen av klassens ämnespass (sorterad dag, start). */
export function klassSchema(s: Struktur, klassId: string): SchemaRad[] {
  const klass = s.klasser.find((k) => k.id === klassId);
  if (!klass) return [];
  return s.amnen.filter((a) => a.klassId === klassId)
    .flatMap((a) => a.schema.map((p) => ({ ...p, klassNamn: klass.namn, amnesNamn: a.namn })))
    .sort((x, y) => x.dag - y.dag || x.start.localeCompare(y.start));
}

/** Lärarens schema HÄRLEDS: alla pass i lärarens tjänsters klassers ämnen. */
export function larareSchema(s: Struktur, larareId: string): SchemaRad[] {
  const tjanster = new Set(s.tjanster.filter((t) => t.larareId === larareId).map((t) => t.id));
  const klasser = s.klasser.filter((k) => tjanster.has(k.tjanstId));
  return klasser.flatMap((k) => klassSchema(s, k.id))
    .sort((x, y) => x.dag - y.dag || x.start.localeCompare(y.start));
}

/** Överlappande pass i ett schema (t.ex. lärarens) — för varningar i UI. */
export function schemaKonflikter(rader: SchemaRad[]): Array<[SchemaRad, SchemaRad]> {
  const ut: Array<[SchemaRad, SchemaRad]> = [];
  for (let i = 0; i < rader.length; i++) for (let j = i + 1; j < rader.length; j++) {
    const a = rader[i], b = rader[j];
    if (a.dag === b.dag && a.start < b.slut && b.start < a.slut) ut.push([a, b]);
  }
  return ut;
}

// ── Planering: bok + ämnesschema + skolår → datumsatta lektioner ──
/**
 * Lägger bokens lektioner i ordning på ämnets pass inom skolåret.
 * Helger, röda dagar, lov, temadagar och halvdagar hoppas över —
 * bortfallna pass förskjuter planeringen; lektioner som inte ryms före
 * skolårets slut får datum null.
 */
export function skapaPlanering(skolar: Skolar, schema: Pass[], bok: Bok): PlaneradLektion[] {
  const lektioner = bokLektioner(bok);
  const perDag = new Map<number, Pass[]>();
  for (const p of schema.filter(giltigtPass)) {
    if (!perDag.has(p.dag)) perDag.set(p.dag, []);
    perDag.get(p.dag)!.push(p);
  }
  for (const list of perDag.values()) list.sort((a, b) => a.start.localeCompare(b.start));

  const ut: PlaneradLektion[] = [];
  let i = 0;
  const d = new Date(`${skolar.start}T00:00:00Z`);
  const slut = skolar.slut;
  let guard = 0;
  while (i < lektioner.length && guard++ < 500) {
    const di = d.toISOString().slice(0, 10);
    if (di > slut) break;
    const veckodag = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    for (const pass of perDag.get(veckodag) ?? []) {
      if (i >= lektioner.length) break;
      if (veckodag <= 5 && passSparr(di, pass.start, skolar) === null) {
        const { kapitel, lektion } = lektioner[i];
        ut.push({ kapitel, lektion, datum: di, vecka: isoVecka(di), start: pass.start, slutTid: pass.slut });
        i++;
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  for (; i < lektioner.length; i++) {
    const { kapitel, lektion } = lektioner[i];
    ut.push({ kapitel, lektion, datum: null, vecka: null, start: null, slutTid: null });
  }
  return ut;
}

/** Registrerar en planering (ersätter tidigare för samma ämne). */
export function registreraPlanering(s: Struktur, p: Planering): Struktur {
  const amne = s.amnen.find((a) => a.id === p.amneId);
  if (!amne) throw new Error('Okänt ämne.');
  if (!s.bocker.some((b) => b.id === p.bokId)) throw new Error('Okänd bok.');
  return { ...s, planeringar: [...s.planeringar.filter((x) => x.amneId !== p.amneId), p] };
}
