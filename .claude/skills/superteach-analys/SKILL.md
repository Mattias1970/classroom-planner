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
- **Trendkoll** (`trendkoll.ts`) jämför frågor med identisk text mellan två förhör: fel→rätt = lärt, rätt→fel = glömt. Facit härleds ur eleverna med full poäng. Kräver frågekolumnerna, som bara följer med filimport.
- **Trendkluster**: en elev vars senaste aggregerande läxförhör är ≥ 90 % och inte faller hamnar aldrig i Riskzon.

## Lagring

Bokdata är läsbar men aldrig skrivbar från appen (`classroom-planner-data`). Allt användarskapat är overlays i localStorage via `lsGet`/`lsSet` med minnesfallback (NFR-005). Filer registreras i `filregister` med `datum`, `rum` och `traffar`; en fil med 0 träffar räknas inte som importerad och erbjuds igen.

## Vanliga fel

- **0 matchade resultat** → klassen saknar elever. Importera Socrative-rostern först.
- **Varning om saknat prov trots import** → jämför på rum, inte quiznamn.
- **Magma syns i biologi** → `amnesKallor` ska filtrera bort den.
