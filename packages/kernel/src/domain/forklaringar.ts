/**
 * SuperTeach · Förklaringar — vad varje siffra, graf och tabell betyder.
 *
 * Används på två ställen: ℹ-knappen på varje widget i SuperTeach öppnar
 * förklaringen, och i rapportmallen kan varje datablock skriva ut sin
 * förklaring under sig så att eleven och vårdnadshavaren förstår vad de ser.
 * Texterna är skrivna för elever och föräldrar, inte för läraren.
 *
 * (Ring 1, I2: ren data.)
 */

export interface Forklaring {
  rubrik: string;
  /** En mening — visas under rubriken i rapporten. */
  kort: string;
  /** Flera stycken — visas i popupen och i den fullständiga rapporten. */
  lang: string[];
}

export const FORKLARINGAR = {
  laxforhor: {
    rubrik: 'Läxförhör',
    kort: 'Görs i början av lektionen och tar med begreppen från alla tidigare delkapitel. Godkänt är 90 %.',
    lang: [
      'Läxförhöret görs i Socrative i lektionens början. Det är kumulativt: varje nytt förhör innehåller begreppen från alla tidigare delkapitel, så resultatet visar hur mycket av hela kapitlet som sitter just nu, inte bara det senaste avsnittet.',
      'Godkänt är 90 % rätt. Eftersom samma begrepp återkommer räcker det inte att läsa dagen före — det man kunde för tre veckor sedan ska fortfarande sitta.',
    ],
  },
  exit: {
    rubrik: 'Exit ticket',
    kort: 'Görs sista minuterna på lektionen och testar bara dagens avsnitt. Godkänt är 70 %.',
    lang: [
      'Exit ticket görs i Socrative i slutet av lektionen och handlar bara om det som gåtts igenom samma lektion. Den visar om lektionens innehåll landade.',
      'Godkänt är 70 %. Ett lågt exit-resultat följt av ett bra läxförhör betyder att eleven pluggat ikapp hemma; tvärtom betyder det att det som satt på lektionen försvann till förhöret.',
    ],
  },
  ovning: {
    rubrik: 'Övning',
    kort: 'Ett quiz som körts utanför lektionens rytm, till exempel som extraträning eller omtag.',
    lang: [
      'Övningar räknas inte som lektioner och har inget godkänt-krav. Om en övning använder samma frågor som ett läxförhör eller en exit ticket räknas den ändå in i analysen som det testet — det är ju samma begrepp som testats igen.',
    ],
  },
  helhet: {
    rubrik: 'Helhet',
    kort: 'Snittet av alla prov i urvalet, oavsett typ.',
    lang: ['Helheten väger ihop läxförhör, exit tickets och eventuella övriga prov till ett enda snitt. Den är bra för en snabb överblick men säger inte vad som brister — det gör de enskilda måtten.'],
  },
  narvaro: {
    rubrik: 'Närvaro',
    kort: 'Andel lektioner där eleven svarat på läxförhöret eller exit ticket.',
    lang: [
      'Närvaron härleds ur Socrative: en lektion räknas som närvarande om eleven svarat på läxförhöret eller exit ticket den dagen. Inget svar på någotdera = frånvarande.',
      'Det betyder att närvaron mäter deltagande i lektionens tester, inte fysisk närvaro. En elev som är i salen men inte gör testerna räknas som frånvarande här.',
    ],
  },
  trendkluster: {
    rubrik: 'Trendkluster',
    kort: 'Eleverna grupperade efter hur deras resultat rör sig över tid: stigande, stabil, riskzon eller ojämn.',
    lang: [
      'Stigande: resultaten går uppåt. Stabil: jämna resultat utan tydlig riktning. Riskzon: snittet ligger under lägsta godkänt-kravet i urvalet. Ojämn: stora hopp mellan tillfällena.',
      'En elev vars läxförhör ligger på minst 90 % och inte faller hamnar aldrig i riskzonen, även om exit tickets drar ner snittet.',
    ],
  },
  normerad: {
    rubrik: 'Normerad graf',
    kort: 'Mittlinjen är klassens snitt vid varje tillfälle (100). Kurvorna visar avstånd till klassen, inte absoluta procent.',
    lang: [
      'Ett svårt prov sänker alla och syns inte som ett fall i den här grafen. En grupp på 85 presterade 15 procentenheter under klassen just då. De tonade banden visar hur gruppens elever fördelar sig: brett band = de skiljer sig åt, smalt = de följs åt.',
    ],
  },
  lektionstest: {
    rubrik: 'Lektionstest',
    kort: 'Läxförhör och exit ticket från samma lektion sida vid sida; Δ = exit − läxförhör.',
    lang: [
      'Skillnaden visar om lektionen lyfte eleven. Positiv Δ: eleven kunde mer efter lektionen än före. Negativ Δ: eleven svarade sämre i slutet av lektionen än i början — vanligen koncentration eller att det nya inte hann landa.',
    ],
  },
  samband: {
    rubrik: 'Sambandsanalys',
    kort: 'Hur starkt två mått hänger ihop hos eleverna i klassen, mätt som korrelation (Pearson r) från −1 till +1.',
    lang: [
      'Korrelationen jämför elevernas snitt i två källor, till exempel läxförhör mot exit tickets. +1 betyder att de som är bäst på det ena också är bäst på det andra; 0 betyder inget samband; −1 att de går åt motsatt håll.',
      'Läxförhör ↔ exit ticket runt +0,8 betyder att lektionsarbetet och hemarbetet följs åt i klassen. Närvaro ↔ helhet nära 0 betyder att närvaron inte förklarar skillnaderna i resultat — de som missar lektioner tar igen det.',
      'Det är ett mått på klassen som helhet, inte på en enskild elev, och kräver minst tre elever med resultat i båda källorna.',
    ],
  },
  trendkoll: {
    rubrik: 'Trendkoll',
    kort: 'Samma fråga i två förhör: fel → rätt räknas som lärt, rätt → fel som glömt.',
    lang: [
      'Eftersom läxförhören är kumulativa återkommer frågorna. Trendkollen jämför elevens svar på samma fråga i två förhör efter varandra. Netto = lärt − glömt. En elev med negativt netto glömmer mer än den lär sig och behöver repetera med mellanrum snarare än plugga mer.',
    ],
  },
  nulage: {
    rubrik: 'Vad du kan nu',
    kort: 'Senaste svaret på varje fråga räknas — det som missades tidigare men sitter nu räknas som kunnigt.',
    lang: [
      'Läxförhören är kumulativa, så ett fel för tre veckor sedan säger inget om nuläget. Varje fråga bidrar med sitt senaste svar. Kvar att lära: senaste svaret var fel. Vänt till rätt: var fel förut, rätt nu.',
    ],
  },
  fragematris: {
    rubrik: 'Fråga för fråga',
    kort: 'En rad per förhör, en kolumn per fråga. Grön = rätt, röd = fel, ljusgrå = ej gjord, tom = frågan ingick inte.',
    lang: [
      'Frågorna numreras i den ordning delkapitlen introduceras, så kolumnerna grupperar sig som Test41, Test42 och så vidare. Samma fråga står i samma kolumn i alla förhör — läs kolumnen uppifrån och ned för att se om ett begrepp håller i sig.',
    ],
  },
  delkapitel: {
    rubrik: 'Delkapitel i förhören',
    kort: 'Varje förhör som staplade led: ett led per delkapitel, fylld del = andel rätt.',
    lang: [
      'Ledets höjd är antalet frågor från delkapitlet, den fyllda delen hur många som var rätt. Ett led som tunnas ut i senare förhör betyder att delkapitlet håller på att glömmas, även om helheten ser bra ut.',
    ],
  },
  begreppKvar: {
    rubrik: 'Kvar att lära',
    kort: 'Begrepp där senaste svaret var fel — det här är det enda som behöver pluggas in.',
    lang: ['Listan är kort med flit: bara det som inte sitter just nu. Skriv en egen förklaring till varje, med ett exempel, och testa sedan i Socrative-rummet.'],
  },
  begreppVant: {
    rubrik: 'Vänt till rätt',
    kort: 'Begrepp som varit fel någon gång men sitter nu. Framsteg, inte skulder.',
    lang: ['Håll dem vid liv genom att svara på dem igen i nästa kumulativa läxförhör. Ett begrepp som vänts en gång kan vända tillbaka om det inte repeteras.'],
  },
  fastnat: {
    rubrik: 'Begrepp som fastnat',
    kort: 'Fel minst två gånger och ännu inte befäst med två rätt i rad.',
    lang: ['Skiljer sig från "kvar att lära": här står begrepp som brukar glida iväg även om de tillfälligt sitter. De försvinner ur listan när eleven svarat rätt två gånger efter det senaste felet.'],
  },
  exitTillLax: {
    rubrik: 'Från exit ticket till läxförhör',
    kort: 'Samma delkapitel på exit ticket och i nästa läxförhör: höll det som satt på lektionen till förhöret?',
    lang: ['Grå stapel = exit ticket i slutet av lektionen, färgad = samma delkapitels frågor i nästa läxförhör. Grön om det gick upp, röd om det gick ner.'],
  },
  studieplan: {
    rubrik: 'Studieplan',
    kort: 'Dagarna fram till provet med delkapitlen fördelade, svagaste först, repetition sist.',
    lang: ['Tidsuppskattningen räknar fyra minuter per begrepp att plugga in, en minut per repetition och tio minuter för ett varv i Socrative-rummet. Tre korta pass slår ett långt.'],
  },
  elevProv: {
    rubrik: 'Elev × provtillfälle',
    kort: 'Varje elevs procent per prov. Färg mot godkänt: grönt klarat, orange nära, rött under. Rött kryss = frånvarande.',
    lang: ['Ett rött kryss betyder att eleven inte svarade på det Socrative-testet — inte att det gick dåligt. En punkt betyder att provet inte gäller den eleven (till exempel Magma-test som inte gjorts).'],
  },
  grupper: {
    rubrik: 'Grupp A vs B',
    kort: 'Snitt per källa för de två halvklassgrupperna.',
    lang: ['Används för att se om en grupp halkar efter — till exempel för att den alltid har lektionen sist på dagen.'],
  },
} as const satisfies Record<string, Forklaring>;

export type ForklaringId = keyof typeof FORKLARINGAR;

export function forklaring(id: ForklaringId): Forklaring {
  return FORKLARINGAR[id];
}
