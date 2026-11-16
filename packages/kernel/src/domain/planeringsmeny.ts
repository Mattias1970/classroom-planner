/**
 * Del 257 · Vad varje menyval under Planering gör — en enkel mening som visas när musen stannar över valet.
 *
 * Texterna ligger samlade här så att de är lätta att läsa igenom och ändra, och så att inget menyval saknar
 * beskrivning (det kontrolleras i testerna). (Ring 1, I2: ren data.)
 */
export const PLANERINGSMENY = {
  planering: 'Lektionsplan: alla lektioner i tur och ordning med datum, tid och avsnitt. Här väljer du bok, skapar planeringen, bockar av genomförda lektioner och lägger in egna rader som prov.',
  kortrad: 'Kortrad: lektionerna som kort på en rad, vecka för vecka. Dra ett kort för att byta ordning, lägg till eller ta bort en lektion. Kartan överst visar hela terminen.',
  tavla: 'Planeringstavla: bygg ett utkast till planeringen. Dra in kapitel, laborationer och egna kort, och lägg sedan in utkastet från ett datum. Det som redan är genomfört ändras inte.',
  detalj: 'Detaljplanering: en lektion i taget. Skriv genomgång, exempel, uppgifter, läxa och exit ticket, och bläddra mellan lektionerna.',
  oversikt: 'Översikt: alla lektioner i en tabell med det viktigaste ur varje lektionskort. Klicka på en rad för att öppna lektionen.',
  uppgifter: 'Uppgifter: vilka uppgifter i boken som hör till varje lektion, på nivå ett, två och tre.',
  begrepp: 'Begrepp: begreppen som hör till varje lektion, med förklaring. Det är dem eleverna får i läxa.',
  filmer: 'Filmer: filmerna som hör till varje lektion, till exempel från Binogi. Lägg till, byt eller ta bort.',
  magma: 'Magma: övningar och test i Magma per lektion. Länken visas på lektionskortet.',
  anteckningar: 'Anteckningar: egna noteringar om klassen per lektion — vad som hände och vad som behöver följas upp.',
  laborationer: 'Laborationer: listan över laborationer som läggs ut i ordning på halvklasspassen. Lägg till, ändra och byt ordning.',
  provlapp: 'Provlapp: ett blad per prov i planeringen med vad provet omfattar. Kan laddas ner som Word.',
  installningar: 'Schema: ämnets lektionstider i veckan, halvklass och laborationer, perioden i NO-blocket och hur många lektioner varje delkapitel får.',
  arsoversikt: 'Årsöversikt: hela läsåret på en sida — ett kort per kapitel med veckor, och viktiga datum som prov.',
  skrivUt: 'Skriv ut: skriver ut den flik som visas just nu.',
  veckaWord: 'Vecka → Word: laddar ner den här veckans lektioner som ett Word-dokument.',
  kapitelWord: 'Kapitel → Word: laddar ner hela planeringen som ett Word-dokument.',
  pedagogiskPlanering: 'Pedagogisk planering: ett dokument till elever och vårdnadshavare om vad som ska läras, hur och när provet är. Välj vilka delkapitel som ingår och ladda ner som Word.',
  planeringsmall: 'Planeringsmall: läs in en fil med ett färdigt upplägg (antal lektioner och lektionskort) och slå ihop den med planeringen. Räknar om från terminsstart.',
  spara: 'Spara: sparar planeringen som den är nu under ett eget namn, så att du kan gå tillbaka till den senare.',
  hamta: 'Hämta: öppnar en planering du sparat tidigare och gör den till den aktiva.',
  kalender: 'Kalender: alla klassers lektioner i ett veckoschema, månad eller läsår.',
} as const;

export type PlaneringsMenyval = keyof typeof PLANERINGSMENY;

/** Beskrivningen av ett menyval. Kräver valet något som saknas (t.ex. en bok) står det först. */
export function menyBeskrivning(val: PlaneringsMenyval, saknas?: string): string {
  return saknas === undefined || saknas === '' ? PLANERINGSMENY[val] : `${saknas} — ${PLANERINGSMENY[val]}`;
}

/** Beskrivningen av en ämnesflik: vilken klass och vilket ämne som öppnas, och om planering saknas. */
export function amnesflikBeskrivning(klass: string, amne: string, harPlanering: boolean): string {
  return harPlanering
    ? `Öppnar planeringen för ${amne} i ${klass}.`
    : `Öppnar ${amne} i ${klass}. Ämnet har ingen planering än — välj bok och tryck ▶ Skapa planering.`;
}
