---
name: superteach-analys
description: Datamodell och regler för SuperTeach-fliken i Classroom Planner — Socrative-import, rumsnamn som nyckel, BAM-krav, halvklass, närvaro, trendkoll och elevrapport. Använd när resultat, prov, förhör, närvaro, kluster eller dashboard-widgets ska läggas till eller ändras, eller när en import inte matchar som förväntat.
---

# SuperTeach — resultat och analys

## Källor och krav (BAM-rytmen)

| Källa | `ResultatKalla` | Krav | Anmärkning |
|---|---|---|---|
| Läxförhör | `socrative-laxforhor` | ≥ 90 % | i lektionens början, **aggregerande** |
| Exit ticket | `socrative-exit` | ≥ 70 % | sista 10 min, dagens avsnitt |
| Magma | `magma` | — | **bara matematik** (`amnesKallor`) |
| DigiExam | `digiexam` | — | formella prov |

## Rumsnamnet är nyckeln

Socrative-rummet, inte quiznamnet, styr klassificeringen: `<Ämne><kapitel><delkapitelsiffror>`.

- `Biologi41` = Biologi, kapitel 4, delkapitel 1
- `Biologi412` = kapitel 4, delkapitel 1 **och** 2 (kumulativt — alla siffror skrivs ut, aldrig intervall)
- Rum som står som `exit` i planen ⇒ exit ticket, som `socStart` ⇒ läxförhör
- Rum som används till allt (`Matte8B`) faller tillbaka på starttiden i filnamnet (UTC → svensk tid)

Quiznamnet (`Biologi 4.1 Begrepp`) är bara etikett och visas i sin helhet i tabeller och på axlar.

## Sammanslagning

- **Halvklass**: samma källa + samma rum inom 7 dagar = ETT tillfälle (`tillfalleIndex`, `HALVKLASS_FONSTER_DAGAR`). Grupp A måndag + grupp B torsdag är ett läxförhör, inte två.
- Ett omtag av samma elev bryter sammanslagningen och blir eget tillfälle.
- **Lektionsdag**: läxförhör + exit ticket samma dag hör till samma lektion, men hålls isär som två prov.

## Härledda mått

- **Närvaro** finns inte som egen källa — den härleds: en dag med läxförhör och/eller exit ticket är en lektion, elev utan svar på båda är frånvarande.
- **Trendkoll** (`trendkoll.ts`) jämför samma fråga mellan två förhör: fel→rätt = lärt, rätt→fel = glömt. Facit härleds ur eleverna med full poäng. Kräver frågekolumnerna, som bara följer med filimport.
- **Frågans identitet** (`fragaidentitet.ts`, Del 238): en Socrative-fråga är sitt begrepp — det rätta svaret — inom ämne och kapitel. En omskriven fråga hamnar i samma kolumn som tidigare versioner och visas med senaste formuleringen. Frågetexten gäller när svaret inte är ett begrepp (sant/falskt, tal, uträkning, 'alla ovanstående') eller när två frågor i samma quiz har samma rätta svar. Sparade resultat ändras inte — sammanslagningen görs vid läsning (`enaFragorPaBegrepp`).
- **Trendkluster**: en elev vars senaste aggregerande läxförhör är ≥ 90 % och inte faller hamnar aldrig i Riskzon.

## Lagring

Bokdata är läsbar men aldrig skrivbar från appen (`classroom-planner-data`). Allt användarskapat är overlays i localStorage via `lsGet`/`lsSet` med minnesfallback (NFR-005). Filer registreras i `filregister` med `datum`, `rum` och `traffar`; en fil med 0 träffar räknas inte som importerad och erbjuds igen.

## Resultatarkivet i datarepot (Del 203, 239)

- Varje importerad resultatfil laddas upp till `resultat/ak<årskurs>/<klass>/<ämne>/<källa>/<fil>` (`arkivSokvag`). Går det inte (ingen nyckel, nätet nere) läggs filen i en kö i IndexedDB (`koaUppladdning`) och skickas automatiskt vid nästa kontroll.
- `ArkivBevakning` kontrollerar datarepot när appen startar och när fönstret aktiveras (högst var tionde minut): köade filer laddas upp, och finns det filer i arkivet som inte är importerade här (`jamforArkiv`) frågar appen om de ska laddas. "Ja" hämtar dem till importsidorna (`hamtaTillImport` → `laggVantandeFiler`) för granskning — inget importeras utan att läraren trycker Importera.
- Datarepo → Resultatarkiv visar var mapparna och filerna ligger (`arkivMappar`, länk till github.com, valfri lokal klonmapp `GitHubConfig.lokalMapp`).

## Vakten vid quizen (Del 242)

- **Rätt klass** — `klassForRapport(s, valdKlass, rum, rader)` avgör vilken klass en Socrative-rapport hör till: klassrummet (`socrativeRum`, t.ex. `BIOLOGI8AA`) först, annars klassen där flest av rapportens elever finns, annars den valda. Importen går till den klassen även om en annan är vald, och `rosterUtanAndraKlasser` ser till att elever som redan finns i en annan klass aldrig läggs till i den valda.
- **Elever i fel klass** — `eleverIFelKlass(s)` hittar elever som finns i två klasser (minst tre gemensamma namn) och pekar ut hemklassen; `rensaEleverIFelKlass` flyttar resultat, filposter, inlämningar m.m. till samma ämne i hemklassen och tar bort dubbletterna. `QuizVakt` frågar läraren först — inget flyttas utan ett ja, och ↩ Ångra lägger tillbaka.
- **För få svar** — ett quiz med under `LAGSTA_SVARSANDEL` (30 %) av elevernas möjliga svar (`svarsandelForRapport`: besvarade frågor / elever i gruppen × frågor) är ett felstartat quiz. Vid import frågar appen ("Nej — spärra filen" / "Ladda ändå"); redan importerade pekas ut av `filerMedFaSvar` och frågan ställs överst i appen.
- **Spärrade filer** — `Struktur.sparradeFiler` minns filnamnet (`filnamnsNyckel` tar bort " (1)" och skiftläge). En spärrad fil importeras inte igen, varken från datorn eller från resultatarkivet (`jamforArkiv` räknar den inte som ny). Spärren hävs under Importera eller i granskningstabellen.
- **Samma svar = samma fråga** — `utanAlternativ` tar bort alternativbokstaven A–J (riktiga rapporter har upp till F), frågor enas på begreppet inom hela ämnet (inte per kapitel — läxförhören är kumulativa), och facit härleds så att nyckeln förklarar allas poäng (`harledSvarsnyckelMedKvalitet`) när ingen hade alla rätt. `rattaFacit` rättar redan importerade quiz vid start (meddelas, går att ångra). Två frågor med samma svar i samma quiz hålls isär.
- **Bildfrågor är egna frågor (Del 243)** — `arBildfraga` känner igen frågor som pekar i en bild ("Vad pekar nummer 6 på?"). De knyts aldrig till begreppet: en bildfråga och en textfråga med samma rätta svar slås inte ihop. Samma bildtext med ett annat rätt svar (ny bild) blir en egen fråga, visad som "Vad pekar nummer 1 på? (Hornhinna)"; stavningsvarianter av samma begrepp räknas som ett.

## Rapportlistan från Socrative (Del 244)

- `Struktur.socrativeRapporter` är facit över vilka rapporter som finns: läraren klistrar in listan från Socrative → Reports (även filtret *From Deleted Rooms*), `tolkaRapportlista` läser namn, datum, klockslag och rum.
- **Tiden i listan är när aktiviteten avslutades (svensk tid); filnamnets tid är starten (UTC).** Ett rum kör en aktivitet i taget, så en fil hör till den rapport i samma rum vars fönster (förra rapportens slut … rapportens slut) rymmer filens start — och quiznamnet ska stämma (`rapportlage`, `rapportForFil`). En aktivitet kan ligga öppen i flera dagar.
- Läge per rapport: importerad (typ + svarsandel; "riktigt test" = minst 30 % av svaren), spärrad, saknas, annat rum, utanför läsåret. `summeraRapporter` ger raden per rum.
- **Rummen vi använder** (`rumInfo`): klassrum (`socrativeRum`), rum i planeringen, begreppsrum (ämne + siffror), ämnesrum (börjar på ett av lärarens ämnen). Allt annat (t.ex. `SO8BB`) är inte vårt: det sorteras bort i listan, och en sådan fil importeras inte utan "ta med ändå".
- UI: `Rapportlista.tsx` under 📥 Importera → Socrative — släppruta för filer, tabellen per rum och listan över rapporter som saknas.

## Vanliga fel

- **0 matchade resultat** → klassen saknar elever. Importera Socrative-rostern först.
- **Varning om saknat prov trots import** → jämför på rum, inte quiznamn.
- **Magma syns i biologi** → `amnesKallor` ska filtrera bort den.
