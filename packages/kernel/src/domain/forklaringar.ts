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
    kort: 'Görs i början av lektionen och tar med begreppen från alla tidigare delkapitel. Godkänd nivå från 90 %: 90–93 Bra, 94–96 Mycket bra, 97–100 Utmärkt.',
    lang: [
      'Läxförhöret görs i Socrative i lektionens början. Det är kumulativt: varje nytt förhör innehåller begreppen från alla tidigare delkapitel, så resultatet visar hur mycket av hela kapitlet som sitter just nu, inte bara det senaste avsnittet.',
      'Godkänt är 90 % rätt. Eftersom samma begrepp återkommer räcker det inte att läsa dagen före — det man kunde för tre veckor sedan ska fortfarande sitta.',
    ],
  },
  exit: {
    rubrik: 'Exit ticket',
    kort: 'Lektionsarbete: görs sista minuterna på lektionen och visar hur väl eleven följde med. Godkänd nivå från 70 %: 70–80 Bra, 81–90 Mycket bra, 91–100 Utmärkt.',
    lang: [
      'Exit ticket görs i Socrative i slutet av lektionen och handlar bara om det som gåtts igenom samma lektion. Den visar om lektionens innehåll landade.',
      'Målet är 70 %. Läxförhör och exit ticket prövar olika frågor och svårighetsgrad, så skillnaden mellan dem säger inte i sig vad den beror på — den följs upp tillsammans med eleven.',
    ],
  },
  ovning: {
    rubrik: 'Övning',
    kort: 'Ett quiz som körts utanför lektionens rytm, till exempel som extraträning eller omtag. Bedöms som läxförhör: från 90 % Bra, Mycket bra, Utmärkt.',
    lang: [
      'Övningar räknas inte som lektioner. Om en övning använder samma frågor som ett läxförhör eller en exit ticket räknas den ändå in i analysen som det testet — det är ju samma begrepp som testats igen.',
    ],
  },
  helhet: {
    rubrik: 'Helhet',
    kort: 'Snittet av alla prov i urvalet, oavsett typ.',
    lang: ['Helheten väger ihop läxförhör, exit tickets och eventuella övriga prov till ett enda snitt. Den är bra för en snabb överblick men säger inte vad som brister — det gör de enskilda måtten.'],
  },
  narvaro: {
    rubrik: 'Närvaro',
    kort: 'Andel lektioner där eleven har ett registrerat quizsvar (läxförhör, exit ticket eller övning).',
    lang: [
      'Måttet härleds ur Socrative: en lektion räknas som "med svar" om eleven svarat på något quiz den dagen. Inget svar = "utan svar".',
      'Ett saknat quizsvar bevisar inte frånvaro från lektionen, och ett svar bevisar inte närvaro. Måttet stäms av mot skolans närvaroregistrering innan slutsatser dras.',
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
    kort: 'Läxförhör och exit ticket från samma lektion sida vid sida; Δ = exit − läxförhör, räknat per lektion.',
    lang: [
      'Bara lektioner där eleven gjort båda testerna räknas. Skillnaden räknas per lektion och medelvärdet tas sedan, så det kan avvika från skillnaden mellan de två totalsnitten (som kan bygga på olika lektioner).',
      'Testerna prövar olika innehåll och svårighetsgrad. Δ beskriver resultaten; vad skillnaden beror på följs upp med eleven.',
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
    kort: 'Samma fråga i två förhör: antal svar som glömdes (rätt → fel) och vändes till rätt (fel → rätt).',
    lang: [
      'Eftersom läxförhören är kumulativa återkommer frågorna. Glömda svar betyder oftast att repetitionen inte täckt allt sedan förra förhöret — det är det viktigaste måttet på om man läser på regelbundet. Vändningar visar att det man missat har pluggats in.',
    ],
  },
  nulage: {
    rubrik: 'Vad du kan nu',
    kort: 'Senaste svaret på varje testad fråga. Visar vad eleven valde rätt i senaste försöket — inte varaktig kunskap.',
    lang: [
      'Läxförhören är kumulativa, så varje fråga bidrar med sitt senaste svar. "Fel i senaste försöket" är det som behöver följas upp. "Rätt efter tidigare fel" visar ändrade svar.',
      'Begrepp som inte testats än redovisas separat. Egen förklaring, tillämpning och kunskap efter en tids uppehåll behöver följas upp på annat sätt än med begreppsfrågor.',
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
    kort: 'Begrepp där senaste svaret var fel — det som följs upp först.',
    lang: ['Listan är kort med flit: bara det som inte sitter just nu. Skriv en egen förklaring till varje, med ett exempel, och testa sedan i Socrative-rummet.'],
  },
  begreppVant: {
    rubrik: 'Vänt till rätt',
    kort: 'Begrepp som varit fel någon gång men var rätt i senaste försöket.',
    lang: ['Det visar ett ändrat svar. Om det håller följs upp i nästa kumulativa läxförhör, och genom att eleven förklarar begreppet med egna ord.'],
  },
  fastnat: {
    rubrik: 'Begrepp som fastnat',
    kort: 'Fel minst två gånger och ännu inte befäst med två rätt i rad.',
    lang: ['Skiljer sig från "kvar att lära": här står begrepp som brukar glida iväg även om de tillfälligt sitter. De försvinner ur listan när eleven svarat rätt två gånger efter det senaste felet.'],
  },
  exitTillLax: {
    rubrik: 'Från exit ticket till läxförhör',
    kort: 'Samma delkapitel på exit ticket och i nästa läxförhör: höll det som satt efter lektionen till förhöret?',
    lang: ['Grå stapel = exit ticket i slutet av lektionen, färgad = samma delkapitels frågor i nästa läxförhör. Röd betyder att det gick ned — det som satt efter lektionen lästes troligen inte på däremellan. Hur ofta man läser på väger tyngre än hur mycket per gång.'],
  },
  studieplan: {
    rubrik: 'Studieplan',
    kort: 'Dagarna fram till provet med delkapitlen fördelade, svagaste först, repetition sist.',
    lang: ['Tidsuppskattningen räknar fyra minuter per begrepp att plugga in, en minut per repetition och tio minuter för ett varv i Socrative-rummet. Tre korta pass slår ett långt.'],
  },
  ovar: {
    rubrik: 'Övar eleven?',
    kort: 'För varje läxförhör: hur gick exit-begreppen från förra lektionen, den äldre läxan och de nya frågorna — var för sig.',
    lang: [
      'Läxförhör och exit ticket bedöms var för sig; det intressanta är vad som hände däremellan. Högt på exit-begreppen men lågt på den äldre läxan betyder att bara det senaste avsnittet lästes på. Högt på båda betyder att hela läxan — alla begrepp hittills — övades.',
      'Delkapitel med alla rätt de två senaste läxförhören räknas som befästa och märks aldrig "öva" eller "ej godkänt", oavsett äldre resultat.',
    ],
  },
  omfang: {
    rubrik: 'Omfång',
    kort: 'Vilka resultat som analyseras: aktivt kapitel (standard), hela terminen, alla NO-ämnen i terminen, eller hela läsåret.',
    lang: [
      'Aktivt kapitel är kapitlet för den senaste planerade lektionen — läxförhören där visar hur begreppen sitter just nu. Prov utan delkapitelkod (till exempel Magma-diagnoser) ingår inte i kapitelurvalet.',
      'Hela terminen ger utvecklingen i ämnet över tid. Alla NO-ämnen lägger Biologi, Fysik, Kemi och Teknik i samma bild, för terminen eller hela läsåret — det är årskursnivån. Ett periodfält som fyllts i går före omfångets datum.',
    ],
  },
  elevProv: {
    rubrik: 'Elev × provtillfälle',
    kort: 'Varje elevs procent per prov. Färg mot förhörsgränsen: grönt nådd, orange nära, rött under. Rött kryss = inget quizsvar.',
    lang: ['Ett rött kryss betyder att eleven inte svarade på det Socrative-testet — inte att det gick dåligt, och inte nödvändigtvis frånvaro. En punkt betyder att provet inte gäller den eleven.'],
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
