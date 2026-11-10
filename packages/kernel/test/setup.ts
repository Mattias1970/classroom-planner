// Del 241 · I testerna fryses allt som delas via en cache (minne.ts) — den som ändrar i ett delat värde får ett fel direkt.
(globalThis as { __cpFrysDelat?: boolean }).__cpFrysDelat = true;
