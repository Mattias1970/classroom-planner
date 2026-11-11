/**
 * SuperTeach · Svarets form i Socrative-rapporterna. (Ring 1, I2.)
 *
 * Flervalssvar står med alternativbokstaven först: 'A. Ribosomer', 'F. Mitokondrier', 'B • biotop',
 * 'c) ekologi'. Bokstaven säger bara var alternativet stod — samma svar kan ha en annan bokstav i ett annat
 * quiz — så det är texten som jämförs. Socrative har fler än fem alternativ (riktiga rapporter går till F),
 * därför tas A–J bort, inte bara A–E.
 */
const ALTERNATIV = /^[a-j]\s*(?:[.)]|[•·])\s*/i;

/** Svarstexten utan alternativbokstav och punkttecken: 'F. Mitokondrier' → 'Mitokondrier'. */
export function utanAlternativ(svar: string): string {
  return svar.replace(ALTERNATIV, '').replace(/[•·]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Jämförelsenyckel för ett svar: utan alternativbokstav, gemener. */
export function svarNyckel(svar: string): string {
  return utanAlternativ(svar).toLowerCase();
}
