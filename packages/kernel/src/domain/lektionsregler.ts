/**
 * Del 139 · Lektionsregler — den gemensamma grunden för lektionerna i en bok
 * (lektionsstruktur, arbete/uppgiftsnivåer, inlämning, läxor).
 *
 * Standardtexten beror på boken: Prio Matematik har nivåindelade uppgifter
 * (Grön/Blå/Röd), Spektrum-böckerna har inga nivåer utan "läs och Testa dig
 * själv". Läraren kan skriva om reglerna; de sparas som ett OVERLAY per bok
 * i strukturen (NFR-005: bokdata skrivs aldrig, och en ny hämtning av boken
 * från datarepot rör inte lärarens regler).
 */
import { bokHarNivaer } from './bok.js';
import type { Bok, Struktur } from './typer.js';

export interface Lektionsregel { rubrik: string; text: string }

export function standardLektionsregler(bok: Bok): Lektionsregel[] {
  const N = bok.nivaer;
  const struktur: Lektionsregel = {
    rubrik: 'Lektionsstruktur (BAM)',
    text: 'Tavlan högst upp: [Ämne] [starttid]–[sluttid]. Läxförhör via Socrative → Genomgång → Arbete → Exit ticket i slutet (Socrative).',
  };
  const laxor: Lektionsregel = {
    rubrik: 'Läxor',
    text: 'Läxa till varje delkapitel: alla begrepp som hör till delkapitlet. Läxförhör i början av nästa lektion via Socrative.',
  };
  if (bokHarNivaer(bok)) {
    return [
      struktur,
      {
        rubrik: 'Uppgiftsnivåer',
        text: `${N.niva1} = introduktion · ${N.niva2} = E-nivå · ${N.niva3} = C/A-nivå. Första lektionen på ett delkapitel arbetar ${N.niva1}/${N.niva2} (minimum ${N.niva1} klart), följande lektioner ${N.niva2}/${N.niva3} (minimum ${N.niva2} klart).`,
      },
      {
        rubrik: 'Inlämning',
        text: `${N.niva1}- och ${N.niva2}-uppgifter är obligatoriska: fotografera beräkningarna och ladda upp i Google Classroom. ${N.niva3} är frivillig fördjupning när lektionstiden räcker. Det som inte hinns med görs klart hemma eller på stödtid.`,
      },
      laxor,
    ];
  }
  return [
    struktur,
    {
      rubrik: 'Arbete',
      text: 'Läs delkapitlets sidor och besvara "Testa dig själv" skriftligt. Använd begreppen i svaren.',
    },
    {
      rubrik: 'Inlämning',
      text: 'Svaren på "Testa dig själv" lämnas in i Google Classroom (fotografi eller text). Det som inte hinns med görs klart hemma eller på stödtid.',
    },
    laxor,
  ];
}

/** Lärarens regler för boken om de finns, annars standard. */
export function lektionsreglerFor(s: Struktur, bok: Bok): Lektionsregel[] {
  return s.lektionsregler?.[bok.id] ?? standardLektionsregler(bok);
}

export function harEgnaLektionsregler(s: Struktur, bokId: string): boolean {
  return s.lektionsregler?.[bokId] !== undefined;
}

/** Sparar lärarens regler för boken. Tomma rader (utan rubrik och text) tas bort. */
export function sattLektionsregler(s: Struktur, bokId: string, regler: Lektionsregel[]): Struktur {
  if (!s.bocker.some((b) => b.id === bokId)) throw new Error('Okänd bok.');
  const rena = regler
    .map((r) => ({ rubrik: r.rubrik.trim(), text: r.text.trim() }))
    .filter((r) => r.rubrik !== '' || r.text !== '');
  return { ...s, lektionsregler: { ...(s.lektionsregler ?? {}), [bokId]: rena } };
}

/** Tar bort lärarens regler så att standardtexten gäller igen. */
export function aterstallLektionsregler(s: Struktur, bokId: string): Struktur {
  const kvar = { ...(s.lektionsregler ?? {}) };
  delete kvar[bokId];
  return { ...s, lektionsregler: kvar };
}
