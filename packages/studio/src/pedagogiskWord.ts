/**
 * Del 134 · "Pedagogisk planering och provlapp" som Word-dokument till elever och
 * vårdnadshavare — samma layout som Planering_Ekologi.docx: rubrik, Syfte, Viktiga
 * begrepp, Innehåll per delkapitel, Binogi-filmer med länkar, Prov och bedömning
 * (B/U/R, studera inför prov, studieteknik, kort om förmågorna) och Planering-
 * tabellen vecka för vecka. Innehållet kommer ur pedagogiskPlanering (kernel), så
 * dokumentet kan genereras om när planeringen ändras.
 */
import {
  AlignmentType, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import type { PedagogiskPlanering, PlanDag, PlanFilm } from '@planner/kernel';

function ladda(namn: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${namn}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const h1 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1 });
const h2 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
const h3 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3 });
const p = (t: string, opts: { bold?: boolean; italics?: boolean } = {}) => new Paragraph({ children: [new TextRun({ text: t, ...opts })] });
const punkt = (t: string, niva = 0) => new Paragraph({ text: t, bullet: { level: niva } });
const numrerad = (t: string) => new Paragraph({ text: t, numbering: { reference: 'nr', level: 0 } });
const tom = () => new Paragraph({ text: '' });
const lank = (f: PlanFilm) => new ExternalHyperlink({ link: f.url, children: [new TextRun({ text: f.titel, style: 'Hyperlink' })] });
const filmRad = (filmer: PlanFilm[], prefix?: string) => new Paragraph({
  children: [
    ...(prefix !== undefined ? [new TextRun({ text: `${prefix} `, bold: true })] : []),
    ...filmer.flatMap((f, i) => [lank(f), ...(i < filmer.length - 1 ? [new TextRun('   ')] : [])]),
  ],
});

/** Det fasta bedömningsavsnittet — med kapitlets sidor och rum ifyllda. */
function provOchBedomning(pl: PedagogiskPlanering): Paragraph[] {
  const rumAlla = pl.ovaRum[pl.ovaRum.length - 1];
  const ovaRum = pl.ovaRum.join(', ');
  return [
    h2('Prov och bedömning'),
    p('Förmågor/betygskriterier och kvaliteter', { italics: true }),
    h3('Vi har 3 st huvudsakliga betygskriterier:'),
    punkt('B – Beskriv och förklara (begrepp och naturvetenskapliga modeller)'),
    punkt('U – Undersökning, dvs planera och genomföra, värdera (laborationer, systematisk undersökning). Inom detta kriterium finns även söka information och källkritik.'),
    punkt('R – Resonera och ta ställning (bemöta påståenden, diskutera och argumentera vetenskapligt)'),
    p('Kvalitet: för högre nivå, dvs C–A, måste man använda begrepp i sina svar och beskrivningar.', { bold: true }),
    punkt('Kvalitet handlar om hur man beskriver saker i flera led (djup): det första leder till det andra, vilket innebär det tredje.'),
    punkt('Kvalitet kan också visas genom bredd: flera exempel med mindre djup.'),
    tom(),
    p('Studera inför prov:', { bold: true }),
    p('E-nivå'),
    punkt(`Lär dig sammanfattningen${pl.sammanfattningSidor !== null ? ` (${pl.sammanfattningSidor})` : ''}.`),
    punkt(`Lär dig vad begreppen betyder. Öva i Socrative: ${rumAlla ?? pl.klassRum} (hela kapitlet)${pl.ovaRum.length > 1 ? `, eller delkapitel för delkapitel: ${ovaRum}. Första siffran är kapitlet och de följande siffrorna vilka delkapitel som ingår i rummet.` : '.'}`),
    punkt('Lär dig hur man undersöker:'),
    punkt('laborationerna – hur vi gör för att undersöka vad.', 1),
    punkt('du ska kunna göra en enkel beskrivning av hur man testar en hypotes (idé, antagande) och hur man ser på resultatet av testet – vad som är svaret på hypotesen.', 1),
    punkt('Träna på att bemöta påståenden (påståenden finns ofta i frågorna i Finalen):'),
    punkt('stämmer/stämmer inte samt ett enkelt resonemang varför (en mening). Pelle säger: "Om man sätter maten högt så får djuren längre hals." – "Pelle har fel därför att varje individ får den halslängd den ska, men de som har längst hals får tillgång till mat och överlever."', 1),
    tom(),
    p('Allmänt:', { bold: true }),
    p('Titta på Binogi-filmerna för bättre förståelse – se länkarna ovan eller i tidsplaneringen längst ner. Binogi innehåller även quizzar, översättningar med mera.'),
    tom(),
    p('Öva för högre nivå:', { bold: true }),
    p('Träna på Testa dig själv-frågorna och Finalen. När du skriver svar ska du beskriva varför svaret är som det är: använd begrepp och kunskap, besvara frågorna i flera led och ge flera exempel.'),
    tom(),
    p('Arbeta för högsta nivå:', { bold: true }),
    p('Gå igenom boken och anteckna allt viktigt. Gör gärna tankekartor över hur alla delar hör ihop.'),
    p('Gör alla frågor, inklusive Finalen, och se till att du förstår allt.'),
    p('Gå igenom laborationerna och se till att du förstår allt, samt hur man skriver en laborationsplanering med resultattabell, vilka svar man kan få ut och vad de betyder.'),
    tom(),
    h2('Studieteknik – hur man läser en text'),
    numrerad('Läs vad du ska lära dig på kapitlets första uppslag (Syfte högst upp i denna planering). Frågorna på provet testar om du har lärt dig detta. Tips! Skriv ner det så du enkelt ser vilka förväntningar som finns.'),
    numrerad('Läs sammanfattningen. Den innehåller allt du måste kunna för att fördjupa dig. Tips! Bryt ner sammanfattningen i meningar/punkter, eller skriv om dem som frågor och svar (flashcards).'),
    numrerad('Läs rubrikerna. De visar vad du ska kunna och vilka frågeställningar du ska kunna besvara. Tips! Skriv ner varje rubrik och sammanfatta innehållet under med korta punkter eller tankekartor. Om rubriken är en frågeställning – besvara den utifrån texten.'),
    numrerad('Läs bildtexterna. Där hittar du ofta fördjupningar och beskrivningar på högre nivå som du ska kunna redogöra för.'),
    p('Beskriv händelser och deras följder med ord som:'),
  ];
}

function bindeordTabell(): Table {
  const cell = (rubrik: string, ord: string[]) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [p(rubrik, { bold: true }), ...ord.map((o) => punkt(o))],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell('🔬 Orsak', ['eftersom', 'på grund av', 'beror på', 'orsakas av']), cell('🔭 Följd', ['därför', 'leder till', 'resulterar i', 'medför att'])] }),
      new TableRow({ children: [cell('⚖️ Jämförelse och skillnad', ['jämfört med', 'liknar', 'skiljer sig från', 'i motsats till']), cell('📖 Förklaring och förtydligande', ['det vill säga', 'vilket innebär att', 'det betyder att', 'med andra ord'])] }),
    ],
  });
}

function kortOmFormagorna(): Paragraph[] {
  return [
    p('📌 Exempelmening: "Fotosyntesen är viktig eftersom den leder till att syre bildas; syret hamnar i vattnet, vilket innebär att djur kan andas, och högt upp i atmosfären bildas ozon som skyddar djur och växter från solens skadliga UV-strålning."'),
    tom(),
    h2('Kort om förmågorna: Resonemang samt Undersökning'),
    p('R – Ta ställning och resonera', { bold: true }),
    p('Perspektiv lyfter ofta områden som du ska kunna resonera om, dvs ta ställning till varför ett påstående är fel eller rätt, i flera led och med ett vetenskapligt resonemang (ämneskunskaper).'),
    p('Är ett påstående korrekt? "Pelle har rätt därför att …" eller "Pelle har fel därför att …". Förklara naturvetenskapligt varför påståendet är rätt eller fel, helst i flera led och med begrepp. Den här typen av frågor finns ofta i Finalen.'),
    tom(),
    p('U – Undersökning (vetenskaplig metod)', { bold: true }),
    p('Gå igenom och förstå laborationerna: hur man skriver en laborationsplanering och analyserar resultat.'),
    p('Syfte/frågeställning', { bold: true }), punkt('En frågeställning eller ett undersökningssyfte.'),
    p('Hypotes', { bold: true }), punkt('Besvarar frågeställningen med motivering (om möjligt).'),
    p('Materiel', { bold: true }), punkt('En lista över materiel – vad som behövs för laborationen.'),
    p('Risk', { bold: true }), punkt('Finns det betydande risker för kroppsskada ska de klargöras här.'),
    p('Utförande', { bold: true }), punkt('Numrerad punktlista, ett moment per punkt, skrivet i imperativform.'),
    p('Resultat', { bold: true }), punkt('Notera resultaten i en tabell när det är lämpligt. En planering ska innehålla en resultattabell att fylla i (A-nivå).'),
    p('Slutsats', { bold: true }),
    punkt('Analys av resultat: beskriv utförligt om resultatet bekräftar eller förkastar hypotesen. Beskriv i flera led vad som hänt (naturvetenskapligt) och hur det stämmer med hypotesen.'),
    punkt('Felkällor: vilken är den största felkällan som kan påverka resultatet, och hur kan resultatet ha påverkats?'),
    punkt('Förbättring: ange en förbättring som ger ett pålitligare resultat. Generell förbättring (gör försöket många gånger) är lägre nivå; en metodförbättring som ökar precisionen, med förklaring, är högre nivå.'),
  ];
}

const GRA = 'D9D9D9'; const GRON = 'E2EFDA';
function cell(children: Array<Paragraph | Table>, procent: number, fill?: string): TableCell {
  return new TableCell({
    width: { size: procent, type: WidthType.PERCENTAGE },
    ...(fill !== undefined ? { shading: { type: ShadingType.CLEAR, fill } } : {}),
    children: children.length > 0 ? children : [tom()],
  });
}

/** Cellens delar (Läxa, Inlämning, Genomgång, Läxa till, Binogifilm …) skiljs åt med en tom rad. */
function medLuft(delar: Paragraph[][]): Paragraph[] {
  const fyllda = delar.filter((d) => d.length > 0);
  return fyllda.flatMap((d, i) => (i === 0 ? d : [tom(), ...d]));
}

/** En dag i planeringstabellen — fyra kolumner som förlagan. */
function dagRad(d: PlanDag, pl: PlanDag[]): TableRow {
  const inlamning = pl.filter((x) => x !== d && x.datum < d.datum && x.kod !== null).slice(-1)[0];
  const kol1 = medLuft([
    [p(`${d.dag}${d.grupp !== undefined ? ` · Grupp ${d.grupp}` : ''}`, { bold: true })],
    d.laxforhor !== null
      ? [p('Läxa:', { bold: true }), p(d.laxforhor.begrepp),
        ...(d.laxforhor.ovaRum !== null ? [p(`Begrepp övas i Socrative: ${d.laxforhor.ovaRum}`)] : [])]
      : [],
    d.typ === 'lektion' && inlamning !== undefined && inlamning.kod !== null
      ? [p('Inlämning:', { bold: true }), p(`Kap ${inlamning.kod} Begrepp`), p(`Kap ${inlamning.kod} Frågor`)]
      : [],
  ]);
  const kol2 = medLuft([
    [p(d.typ === 'laboration' ? 'Laboration' : d.typ === 'prov' ? 'Prov' : d.kod !== null ? `Kap ${d.kod}` : d.avsnitt, { bold: true }),
      ...(d.typ !== 'prov' ? [p(d.avsnitt.replace(/^🧪\s*/, ''))] : [])],
    d.sidor !== null ? [p(`Bok ${d.sidor}`)] : [],
  ]);
  const kol3 = medLuft([
    d.typ === 'prov' ? [p(`Prov – ${d.avsnitt}`, { bold: true })] : [],
    d.laxforhor !== null
      ? [p('Läxförhör:', { bold: true }), p(`${d.laxforhor.begrepp} · Socrative: ${d.laxforhor.rum}`),
        p('(börja med frågorna när du är klar med förhöret)', { italics: true })]
      : [],
    [
      ...(d.typ === 'lektion' && d.kod !== null
        ? [p(`Genomgång ${d.kod}:`, { bold: true }), p('Skriv ner begreppens betydelse under genomgången.', { italics: true })]
        : []),
      // Bokens centrala innehåll står under Innehåll längre upp — i tabellen bara lärarens egen text
      ...(d.genomgang !== null && d.genomgangKalla === 'lektionsplan' && d.typ !== 'prov'
        ? d.genomgang.split('\n').filter((x) => x.trim() !== '').map((rad) => punkt(rad)) : []),
    ],
    d.arbete !== null ? [p('Arbete:', { bold: true }), p(d.arbete)] : [],
    d.exit !== null ? [p('Avslut:', { bold: true }), p(`Exit ticket · Socrative: ${d.exit.rum} (${d.exit.begrepp})`)] : [],
  ]);
  const kol4 = medLuft([
    d.begrepp.length > 0 ? [p('Begrepp', { bold: true }), p(d.begrepp.join(', '))] : [],
    d.laxa !== null
      ? [p(`Läxa till ${d.laxa.till}`, { bold: true }), p(d.laxa.text, { bold: true }),
        ...(d.laxa.ovaRum !== null ? [p(`Öva i Socrative: ${d.laxa.ovaRum}`, { bold: true })] : [])]
      : [],
    d.filmer.length > 0 ? [p('Binogifilm', { bold: true }), ...d.filmer.map((f) => new Paragraph({ children: [lank(f)] }))] : [],
  ]);
  return new TableRow({ children: [cell(kol1, 18), cell(kol2, 14), cell(kol3, 40), cell(kol4, 28)] });
}

function planeringsTabell(pl: PedagogiskPlanering): Table {
  const rubrik = new TableRow({ tableHeader: true, children: [
    cell([p('Vecka (dag och inlämningar)', { bold: true })], 20, GRA), cell([p('Avsnitt', { bold: true })], 15, GRA),
    cell([p('Innehåll', { bold: true })], 35, GRA), cell([p('Begrepp, läxor och filmer', { bold: true })], 30, GRA),
  ] });
  const rader: TableRow[] = [rubrik];
  const alla = pl.veckor.flatMap((v) => v.dagar);
  for (const v of pl.veckor) {
    rader.push(new TableRow({ children: [cell([p(`v${v.vecka}`, { bold: true })], 20, GRON), cell([p('Avsnitt')], 15, GRON), cell([p('Lektion')], 35, GRON), cell([p('Begrepp, läxor och filmer')], 30, GRON)] }));
    for (const d of v.dagar) rader.push(dagRad(d, alla));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rader });
}

/** Bygger dokumentet (utan att ladda ner) — testbart. */
export function byggPedagogiskPlanering(pl: PedagogiskPlanering): Document {
  const barn: Array<Paragraph | Table> = [
    h1('Pedagogisk planering och provlapp'),
    h1(`${pl.amne} ${pl.klass} · Kap ${pl.kapitel.nr} – ${pl.kapitel.namn}${pl.kapitel.sidor !== '—' ? ` (${pl.kapitel.sidor})` : ''}`),
    h2('Syfte'),
    p('I detta kapitel ska du lära dig följande.'),
    ...pl.syfte.map((m) => punkt(m)),
    h2('Viktiga begrepp'),
    ...(() => { const ut: Paragraph[] = []; for (let i = 0; i < pl.begrepp.length; i += 3) ut.push(p(pl.begrepp.slice(i, i + 3).join(' – '))); return ut; })(),
    h2('Innehåll'),
    ...pl.innehall.flatMap((d) => [h3(`${d.kod} ${d.namn}${d.sidor !== '—' ? ` ${d.sidor}` : ''}`), ...d.text.split('\n').filter((x) => x.trim() !== '').map((x) => p(x))]),
    ...(pl.prov !== null ? [p(`Prov: ${pl.prov.rubrik}${pl.prov.datum !== null ? ` – ${pl.prov.datum}` : ''}`, { bold: true })] : []),
    ...(pl.sammanfattningSidor !== null ? [p(`Sammanfattning ${pl.sammanfattningSidor}`)] : []),
    h2('Binogi – filmer'),
    p('Filmer om kapitlets innehåll. Man kan välja olika språk för tal och undertexter för ökad förståelse. Notera att ni behöver kunna begreppen på svenska.'),
    ...pl.filmer.map((d) => (d.filmer.length > 0 ? filmRad(d.filmer, d.kod) : p(`${d.kod} —`))),
    ...provOchBedomning(pl),
    bindeordTabell(),
    ...kortOmFormagorna(),
    tom(),
    h2('Planering'),
    planeringsTabell(pl),
  ];
  return new Document({
    numbering: { config: [{ reference: 'nr', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }] }] },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: barn }],
  });
}

export async function exporteraPedagogiskPlanering(pl: PedagogiskPlanering): Promise<void> {
  const doc = byggPedagogiskPlanering(pl);
  ladda(`Planering ${pl.amne} ${pl.klass} kap ${pl.kapitel.nr}`, await Packer.toBlob(doc));
}

