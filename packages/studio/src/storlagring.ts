/**
 * Del 254 · Webbläsarens stora lagring (IndexedDB) för appens data.
 *
 * Den lilla lagringen (localStorage) rymmer drygt 5 miljoner tecken per adress — två klassers resultat fyller
 * den på en termin. IndexedDB rymmer en stor del av datorns lediga disk. Här finns bara den tunna kopplingen:
 * läs, skriv och lista nycklar i ett enda dokumentlager. Vad som sparas och när bestämmer store.ts.
 */

/** Ett litet dokumentlager: värden under textnycklar. Varje anrop är en egen transaktion. */
export interface Dokumentlager {
  /** Värdena under nycklarna, i samma ordning (undefined = finns inte). Läses i en och samma transaktion. */
  las(nycklar: string[]): Promise<unknown[]>;
  /** Skriver posterna och tar bort nycklarna i en transaktion — allt eller inget. Avvisas om lagringen säger nej. */
  skriv(poster: Array<[nyckel: string, varde: unknown]>, taBort?: string[]): Promise<void>;
  /** Alla nycklar i lagret. */
  nycklar(): Promise<string[]>;
}

const DB = 'classroom-planner.studio';
const LAGER = 'dokument';
/** Så länge väntar vi på att webbläsaren ska öppna lagringen — sedan gäller den lilla lagringen som förut. */
const OPPNA_MS = 4000;

/** Öppnar den stora lagringen. null = webbläsaren har ingen (eller vägrar öppna den). */
export function oppnaIndexedDb(namn: string = DB): Promise<Dokumentlager | null> {
  return new Promise((resolve) => {
    let klar = false;
    const svara = (v: Dokumentlager | null) => { if (!klar) { klar = true; resolve(v); } };
    try {
      if (typeof indexedDB === 'undefined') { svara(null); return; }
      const tid = setTimeout(() => svara(null), OPPNA_MS);
      const req = indexedDB.open(namn, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(LAGER)) req.result.createObjectStore(LAGER); };
      req.onerror = () => { clearTimeout(tid); svara(null); };
      req.onblocked = () => { clearTimeout(tid); svara(null); };
      req.onsuccess = () => {
        clearTimeout(tid);
        const db = req.result;
        if (klar) { try { db.close(); } catch { /* redan stängd */ } return; }
        // En nyare version av appen i en annan flik vill bygga om lagret: släpp taget så den kommer åt
        db.onversionchange = () => { try { db.close(); } catch { /* redan stängd */ } };
        svara(lagerFor(db));
      };
    } catch { svara(null); }
  });
}

function lagerFor(db: IDBDatabase): Dokumentlager {
  const i = <T>(lage: IDBTransactionMode, gor: (lager: IDBObjectStore) => () => T): Promise<T> => new Promise<T>((resolve, reject) => {
    try {
      const tx = db.transaction(LAGER, lage);
      const hamta = gor(tx.objectStore(LAGER));
      tx.oncomplete = () => resolve(hamta());
      tx.onerror = () => reject(tx.error ?? new Error('Lagringen svarade med ett fel.'));
      tx.onabort = () => reject(tx.error ?? new Error('Lagringen avbröt skrivningen.'));
    } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
  });
  return {
    las: (nycklar) => i('readonly', (lager) => {
      const ut: unknown[] = nycklar.map(() => undefined);
      nycklar.forEach((n, ix) => { const r = lager.get(n); r.onsuccess = () => { ut[ix] = r.result as unknown; }; });
      return () => ut;
    }),
    skriv: (poster, taBort = []) => i('readwrite', (lager) => {
      for (const [n, v] of poster) lager.put(v, n);
      for (const n of taBort) lager.delete(n);
      return () => undefined;
    }),
    nycklar: () => i('readonly', (lager) => {
      let ut: string[] = [];
      const r = lager.getAllKeys();
      r.onsuccess = () => { ut = (r.result as IDBValidKey[]).map((k) => String(k)); };
      return () => ut;
    }),
  };
}

/** Hur mycket webbläsaren säger att adressen använder och får använda (byte), och om datan är skyddad mot rensning. */
export async function webblasarensUtrymme(): Promise<{ anvant: number | null; utrymme: number | null; skyddad: boolean | null }> {
  const ut = { anvant: null as number | null, utrymme: null as number | null, skyddad: null as boolean | null };
  try {
    const lagring = (globalThis as { navigator?: Navigator }).navigator?.storage;
    if (lagring === undefined) return ut;
    if (typeof lagring.estimate === 'function') { const e = await lagring.estimate(); ut.anvant = e.usage ?? null; ut.utrymme = e.quota ?? null; }
    if (typeof lagring.persisted === 'function') ut.skyddad = await lagring.persisted();
  } catch { /* uppgiften saknas — mätaren visar bara antalet tecken */ }
  return ut;
}

/** Ber webbläsaren att inte rensa appens data när disken blir trång. Ger aldrig något fel. */
export function bedOmSkydd(): void {
  try {
    const lagring = (globalThis as { navigator?: Navigator }).navigator?.storage;
    if (lagring !== undefined && typeof lagring.persist === 'function') void lagring.persist().catch(() => false);
  } catch { /* webbläsaren har inget sådant skydd */ }
}
