/**
 * Del 241 · Delade (cachade) värden. (Ring 1, I2.)
 *
 * Strukturen är oföränderlig — varje ändring ger nya objekt och lämnar de gamla orörda. Ett resultat som
 * bara beror på vissa objekt (skolåret, ämnet, boken …) kan därför sparas på just de objekten och
 * återanvändas tills något av dem byts ut; en WeakMap släpper det när objekten inte längre används.
 *
 * Det som lämnas ut ur en cache delas av alla anropare och får inte ändras. I testerna (flaggan
 * __cpFrysDelat, satt i test/setup.ts) fryses det, så att en anropare som ändrar i det avslöjas direkt.
 */
const flaggor = globalThis as { __cpFrysDelat?: boolean };

/** Markerar ett värde som delat. Fryser det (och det närmast under) när testflaggan är satt. */
export function delat<T>(x: T, djup = 2): T {
  if (flaggor.__cpFrysDelat === true) frys(x, djup);
  return x;
}

function frys(x: unknown, djup: number): void {
  if (x === null || typeof x !== 'object' || Object.isFrozen(x)) return;
  if (x instanceof Map || x instanceof Set) return;
  Object.freeze(x);
  if (djup <= 0) return;
  for (const v of Array.isArray(x) ? x : Object.values(x as Record<string, unknown>)) frys(v, djup - 1);
}

/** Cache på tre objekt i följd (alla måste vara desamma för en träff) plus en textnyckel. */
export class TrippelCache<A extends object, B extends object, C extends object, V> {
  private readonly rot = new WeakMap<A, WeakMap<B, WeakMap<C, Map<string, V>>>>();
  hamta(a: A, b: B, c: C, nyckel: string, rakna: () => V): V {
    let pa = this.rot.get(a); if (pa === undefined) { pa = new WeakMap(); this.rot.set(a, pa); }
    let pb = pa.get(b); if (pb === undefined) { pb = new WeakMap(); pa.set(b, pb); }
    let pc = pb.get(c); if (pc === undefined) { pc = new Map(); pb.set(c, pc); }
    if (pc.has(nyckel)) return pc.get(nyckel) as V;
    const v = rakna();
    // En handfull nycklar per objekt räcker (t.ex. en per vecka i veckorapportlarmet) — växer den förbi det börjar den om
    if (pc.size >= 200) pc.clear();
    pc.set(nyckel, v);
    return v;
  }
}
