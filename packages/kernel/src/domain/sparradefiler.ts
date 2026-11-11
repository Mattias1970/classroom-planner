/**
 * Del 242 · Spärrade resultatfiler. (Ring 1, I2.)
 *
 * En fil som läraren avvisat — typiskt ett felstartat quiz där nästan ingen svarade — ska inte laddas igen,
 * varken för hand eller när appen hittar den i datarepot. Filnamnet räcker som nyckel: Socratives filnamn bär
 * starttiden ('Class_2026_09_28__07_17_QZ_…'), så varje körning av ett quiz har sitt eget namn. Webbläsarens
 * "(1)" på en fil som laddats ner en gång till, och tecknen som skrivs om i datarepot, räknas inte.
 */
import type { Struktur } from './typer.js';

export interface SparradFil {
  filnamn: string;
  /** Varför filen spärrades. */
  orsak: 'fa-svar';
  /** Dagen den spärrades (YYYY-MM-DD). */
  sparrad: string;
  /** Vad filen innehöll, för listan över spärrade filer. */
  prov?: string;
  datum?: string;
  amneId?: string;
  /** Socrative-rummet filen kördes i (Del 244: rapportlistan matchar på rum). */
  rum?: string;
  /** Andel av de möjliga svaren (0–1) när filen spärrades. */
  andel?: number;
}

/** Jämförelsenyckel för ett filnamn: utan '(1)' före ändelsen, utan tecknen som datarepot skriver om, gemener. */
export function filnamnsNyckel(filnamn: string): string {
  return filnamn.trim()
    .replace(/\s*\(\d+\)(?=\.[A-Za-z0-9]+$)/, '')
    .replace(/[\\/:*?"<>|#%]+/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function arFilSparrad(s: Pick<Struktur, 'sparradeFiler'>, filnamn: string): boolean {
  const n = filnamnsNyckel(filnamn);
  return (s.sparradeFiler ?? []).some((f) => filnamnsNyckel(f.filnamn) === n);
}

/** Spärrar ett filnamn (en gång — en redan spärrad fil ändras inte). */
export function sparraFilnamn(s: Struktur, fil: SparradFil): Struktur {
  if (arFilSparrad(s, fil.filnamn)) return s;
  return { ...s, sparradeFiler: [...(s.sparradeFiler ?? []), fil] };
}

/** Häver spärren, så att filen kan importeras igen. */
export function havSparr(s: Struktur, filnamn: string): Struktur {
  if (!arFilSparrad(s, filnamn)) return s;
  const n = filnamnsNyckel(filnamn);
  return { ...s, sparradeFiler: (s.sparradeFiler ?? []).filter((f) => filnamnsNyckel(f.filnamn) !== n) };
}
