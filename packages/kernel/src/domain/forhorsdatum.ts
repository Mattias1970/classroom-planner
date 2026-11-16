/**
 * Del 256 · Förhör som fått fel datum.
 *
 * Ett importerat Socrative-förhör knyts till en lektion via rummet, och fick förut lektionens datum hur långt
 * bort lektionen än låg. I en klass vars planering inte täcker tiden då förhören kördes hamnade därför alla
 * förhör på en och samma dag. Filnamnet säger när förhöret faktiskt startades — här hittas de förhör där det
 * sparade datumet ligger mer än `MAX_DAGAR_FRAN_LEKTION` dagar från den dagen, och de kan rättas.
 *
 * Inget rättas av sig självt: läraren får frågan (QuizVakt) och rättningen går att ångra.
 */
import type { FilPost, Resultat } from './resultat.js';
import { MAX_DAGAR_FRAN_LEKTION, svenskTid, tolkaSocrativeFilnamn } from './socrative.js';
import type { Struktur } from './typer.js';

/** Ett importerat förhör vars sparade datum inte är dagen det kördes. */
export interface FeldateratForhor {
  fil: FilPost;
  /** Dagen och klockslaget (svensk tid) då förhöret startades, ur filnamnet. */
  kord: { datum: string; tid: string };
  /** Antal resultat som bär det felaktiga datumet. */
  resultat: number;
}

const dagarMellan = (a: string, b: string): number => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** När filen säger att förhöret kördes (null = filnamnet är inte ett Socrative-filnamn). */
function kordEnligtFil(fil: FilPost): { datum: string; tid: string } | null {
  const info = tolkaSocrativeFilnamn(fil.filnamn);
  return info === null ? null : svenskTid(info.startUtc);
}

/** Resultaten som kom ur filen: samma ämne, typ, quiz och sparade datum — och samma klockslag när det är känt. */
function filensResultat(s: Struktur, fil: FilPost, kord: { tid: string }, ensamOmDagen: boolean): Resultat[] {
  return (s.resultat ?? []).filter((r) => r.amneId === fil.amneId && r.kalla === fil.kalla && r.prov === fil.prov && r.datum === fil.datum
    && (fil.rum === undefined || r.rum === undefined || r.rum === fil.rum)
    // Två körningar av samma quiz kan ha fått samma datum: klockslaget skiljer dem åt. Utan klockslag rättas
    // resultaten bara när filen är den enda med det quizet den dagen.
    && (r.tid !== undefined ? r.tid === kord.tid : ensamOmDagen));
}

/** Importerade förhör där det sparade datumet ligger mer än `MAX_DAGAR_FRAN_LEKTION` dagar från dagen de kördes. */
export function feldateradeForhor(s: Struktur): FeldateratForhor[] {
  const register = s.filregister ?? [];
  const ut: FeldateratForhor[] = [];
  for (const fil of register) {
    if (fil.datum === undefined || !fil.kalla.startsWith('socrative')) continue;
    const kord = kordEnligtFil(fil);
    if (kord === null || dagarMellan(fil.datum, kord.datum) <= MAX_DAGAR_FRAN_LEKTION) continue;
    const ensam = register.filter((f) => f.amneId === fil.amneId && f.kalla === fil.kalla && f.prov === fil.prov && f.datum === fil.datum).length === 1;
    const antal = filensResultat(s, fil, kord, ensam).length;
    if (antal > 0) ut.push({ fil, kord, resultat: antal });
  }
  return ut.sort((a, b) => a.kord.datum.localeCompare(b.kord.datum) || a.kord.tid.localeCompare(b.kord.tid) || a.fil.filnamn.localeCompare(b.fil.filnamn));
}

/**
 * Sätter dagen förhören kördes på resultaten och i filregistret. `filIds` begränsar till vissa filer (annars alla
 * feldaterade). Strukturen som skickas in rörs inte.
 */
export function rattaForhorsdatum(s: Struktur, filIds?: string[]): { s: Struktur; filer: number; resultat: number } {
  const fel = feldateradeForhor(s).filter((f) => filIds === undefined || filIds.includes(f.fil.id));
  if (fel.length === 0) return { s, filer: 0, resultat: 0 };
  const register = s.filregister ?? [];
  const nyttDatum = new Map<string, string>();
  for (const f of fel) {
    const ensam = register.filter((x) => x.amneId === f.fil.amneId && x.kalla === f.fil.kalla && x.prov === f.fil.prov && x.datum === f.fil.datum).length === 1;
    for (const r of filensResultat(s, f.fil, f.kord, ensam)) nyttDatum.set(r.id, f.kord.datum);
  }
  const filDatum = new Map(fel.map((f) => [f.fil.id, f.kord.datum]));
  return {
    s: {
      ...s,
      resultat: (s.resultat ?? []).map((r) => { const d = nyttDatum.get(r.id); return d === undefined ? r : { ...r, datum: d }; }),
      filregister: register.map((f) => { const d = filDatum.get(f.id); return d === undefined ? f : { ...f, datum: d }; }),
    },
    filer: fel.length, resultat: nyttDatum.size,
  };
}
