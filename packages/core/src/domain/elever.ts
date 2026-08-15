/**
 * Elevregister per klass.
 *
 * Ring 1: ren logik (invariant I2). Excel-filens *läsning* sker i webben
 * (SheetJS) — hit kommer bara radernas cellvärden som strängar, så att
 * tolkning, rubrikigenkänning och validering kan testas utan filer.
 */

export interface Elev {
  fornamn: string;
  efternamn: string;
  studentId: string;
  email: string;
}

export interface ElevImportResultat {
  elever: Elev[];
  /** Rader som hoppats över, med radnummer (1-baserat i källan) och orsak. */
  fel: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validerar en elev. Tom lista = giltig. */
export function validateElev(e: Elev): string[] {
  const fel: string[] = [];
  if (e.fornamn.trim() === '') fel.push('Förnamn saknas.');
  if (e.efternamn.trim() === '') fel.push('Efternamn saknas.');
  if (e.studentId.trim() === '') fel.push('StudentID saknas.');
  if (e.email.trim() !== '' && !EMAIL_RE.test(e.email.trim())) {
    fel.push(`Ogiltig e-postadress: "${e.email}".`);
  }
  return fel;
}

/** Kolumnindex för de fyra fälten, -1 = ej funnen. */
interface KolumnMap { fornamn: number; efternamn: number; studentId: number; email: number; }

const RUBRIKER: Record<keyof KolumnMap, string[]> = {
  fornamn: ['förnamn', 'fornamn', 'first name', 'firstname', 'tilltalsnamn'],
  efternamn: ['efternamn', 'last name', 'lastname', 'surname'],
  studentId: ['studentid', 'student id', 'elevid', 'elev-id', 'id', 'personnummer'],
  email: ['email', 'e-mail', 'e-post', 'epost', 'mail', 'emailaddress', 'e-postadress'],
};

function normCell(v: unknown): string {
  return String(v ?? '').trim();
}

/** Försöker känna igen en rubrikrad. Null om raden inte ser ut som rubriker. */
export function detectHeader(row: unknown[]): KolumnMap | null {
  const map: KolumnMap = { fornamn: -1, efternamn: -1, studentId: -1, email: -1 };
  row.forEach((cell, i) => {
    const c = normCell(cell).toLowerCase().replace(/[_\s]+/g, ' ');
    for (const falt of Object.keys(RUBRIKER) as (keyof KolumnMap)[]) {
      if (map[falt] === -1 && RUBRIKER[falt].includes(c)) map[falt] = i;
    }
  });
  // Rubrikrad = minst förnamn + efternamn igenkända
  return map.fornamn !== -1 && map.efternamn !== -1 ? map : null;
}

/**
 * Tolkar kalkylbladsrader till elever.
 * - Med rubrikrad: kolumnordningen spelar ingen roll.
 * - Utan rubrikrad antas ordningen Förnamn, Efternamn, StudentID, E-post.
 * - Tomma rader hoppas över tyst; ogiltiga rader rapporteras i `fel`.
 * - Dubbletter av StudentID inom filen: sista raden vinner (rapporteras).
 */
export function parseEleverFromRows(rows: unknown[][]): ElevImportResultat {
  const fel: string[] = [];
  if (rows.length === 0) return { elever: [], fel: ['Filen innehåller inga rader.'] };

  const forstaRad = rows[0] ?? [];
  const header = detectHeader(forstaRad);
  const map: KolumnMap = header ?? { fornamn: 0, efternamn: 1, studentId: 2, email: 3 };
  const dataRows = header ? rows.slice(1) : rows;
  const offset = header ? 2 : 1; // radnummer i källfilen

  const perId = new Map<string, Elev>();
  dataRows.forEach((row, i) => {
    const radNr = i + offset;
    const alla = row.map(normCell);
    if (alla.every((c) => c === '')) return; // tom rad
    const elev: Elev = {
      fornamn: normCell(row[map.fornamn]),
      efternamn: normCell(row[map.efternamn]),
      studentId: normCell(row[map.studentId]),
      email: normCell(row[map.email]),
    };
    const problem = validateElev(elev);
    if (problem.length > 0) {
      fel.push(`Rad ${radNr}: ${problem.join(' ')}`);
      return;
    }
    if (perId.has(elev.studentId)) {
      fel.push(`Rad ${radNr}: StudentID ${elev.studentId} förekommer flera gånger — sista raden används.`);
    }
    perId.set(elev.studentId, elev);
  });

  return { elever: [...perId.values()], fel };
}

/**
 * Slår ihop importerade elever med befintliga: matchning på StudentID,
 * importen uppdaterar befintliga och lägger till nya. Befintliga som
 * inte finns i importen behålls (import raderar aldrig).
 */
export function mergeElever(befintliga: Elev[], importerade: Elev[]): Elev[] {
  const perId = new Map<string, Elev>(befintliga.map((e) => [e.studentId, e]));
  for (const e of importerade) perId.set(e.studentId, e);
  return [...perId.values()].sort((a, b) =>
    `${a.efternamn} ${a.fornamn}`.localeCompare(`${b.efternamn} ${b.fornamn}`, 'sv')
  );
}
