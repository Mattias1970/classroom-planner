---
name: kernel-domanlogik
description: Konventioner för domänlogik i packages/kernel i Classroom Planner. Använd när kod ska skrivas, ändras eller granskas i kernel — nya funktioner i domain/, typer i typer.ts, eller tester i packages/kernel/test. Täcker I2-invarianten (ingen fetch/DOM/lagring), rena funktioner, svenska domäntermer och testupplägget med Vitest.
---

# Kernel — domänlogik (Ring 1)

`packages/kernel/src/domain/` innehåller all affärslogik. `packages/studio/src/App.tsx` är UI och får inte innehålla beräkningar som hör hemma i kernel.

## Hårda regler

- **I2**: ingen `fetch`, `window`, `document`, `localStorage` eller `google` i `packages/kernel/src`. ESLint bryter bygget. Filer läses i UI-lagret och skickas in som data (t.ex. `Cell[][]` från SheetJS).
- **Rena funktioner**: mutera aldrig indata. Ta `Struktur` in, returnera ny `Struktur` ut. Testa alltid att originalet är orört.
- **Inga TODO-stubbar.** Det som skrivs ska fungera.
- Osäkra värden sätts till `"—"`, värden som behöver kontrolleras mot källan till `"⚠ kontrollera"` — aldrig gissningar.

## Namngivning

Svenska domäntermer genomgående: `provTillfallen`, `narvaroLektioner`, `laxforhor`, `krav`, `snittProcent`. Engelska bara i tekniska hjälpfunktioner. Kommentarer på svenska och förklarar *varför*, inte vad koden gör.

Typer: `Iso8601 = string` (aldrig `Date` i modellen), datum alltid `YYYY-MM-DD`, klockslag `HH:MM` i svensk tid via `svenskTid`.

## Struktur på en ny modul

```ts
/**
 * SuperTeach · <namn> — en mening om vad modulen gör.
 * (Ring 1, I2: ingen fetch/DOM/lagring.)
 */
export interface Xxx { … }        // typerna först
export function xxx(s: Struktur, f: Filter): Xxx[] { … }
```

Exportera från `packages/kernel/src/index.ts` med `export * from './domain/<fil>.js'` (notera `.js`-ändelsen i importen — ESM).

## Delade värden och cachar (Del 241)

Strukturen är oföränderlig, och hastigheten bygger på det:

- `lasStruktur()` (studio/store.ts) lämnar **samma objekt** så länge lagringen är oförändrad. Ändra aldrig i det — bygg en ny struktur med spread och spara den.
- **Lagringen (Del 254)**: strukturen ligger i webbläsarens stora lagring (IndexedDB, `studio/storlagring.ts`) när `startaLagring()` körts — det gör `main.tsx` innan appen ritas. Då är **minnet sanningen**: `lasStruktur()` lämnar objektet direkt, `sparaStruktur()` byter det och skriver ut i bakgrunden (flera sparningar i samma klick = en skrivning; `vantaPaLagring()` i tester). Andra flikar får veta via en kanal och appen ritar om (`prenumereraStruktur`). Första starten flyttas det som låg i `localStorage` över, läses tillbaka och jämförs, och en reservkopia läggs undan (visas under Datarepo). Utan IndexedDB — och i testerna, där `startaLagring()` inte körs — gäller `localStorage` precis som förut, så tester som skriver `classroom-planner.studio.v2` i `localStorage` fungerar oförändrat. Inställningar ligger kvar i `localStorage`.
- **Packad struktur (Del 255)**: `packaStruktur`/`packaUpp` (`domain/packning.ts`) sparar varje fråge-, svars- och facittext en gång (`texter`), och frågornas ordning en gång per förhör (`fragelistor`); varje resultat bär `svar: { q, s, r }`. Förlustfritt — uppackat är strukturen densamma tecken för tecken; svar med okänd form (andra nycklar, annan ordning) lämnas opackade. Används av store.ts i den stora lagringen, i ⬇ Backup och i datarepots `studio/struktur.json` (**version 3**: `{ schema, version: 3, exportedAt, packad }`, en post per rad via `radvisJson`). `importJson` läser både version 3 och den äldre version 2 (`struktur`). Nya fält i `FragaSvar` kräver ingen ändring i packningen (de lämnas opackade) — men lägg till dem i `kanPackas` om de ska packas. I minnet och i all domänlogik är strukturen alltid uppackad.
- **Menyvalens beskrivningar (Del 257)**: varje menyval under Planering (ämnets flikar, Spara/Hämta, Kalender) har en enkel text i `PLANERINGSMENY` (`domain/planeringsmeny.ts`) som visas som `title` via `menyBeskrivning(val, saknas?)`. Ett nytt menyval ska in där — testet `del257` kräver att ingen flik saknar beskrivning.
- **Radens kapitel (Del 258)**: `radensKapitel(rad, bokensKapitel)` — delkapitelkoden i rubriken avgör ('3.1 …' → 3) när boken har kapitlet, annars `rad.kapitel`. Egna kort (`u:`) ärver annars kapitlet av raden före; `utkastTeoriRader` använder nu koden. Visa aldrig "aktuellt kapitel" ur `rad.kapitel` direkt — använd `radensKapitel`. Kapitelrubriken (`KapitelHeader`) visar kapitlet för dagens/nästa lektion med brickan "nästa lektion: …", och följer lektionen som visas i Detaljplanering.
- **Dra och släpp (Del 259)**: `flyttaKortTill(s, amneId, nycklar, efterNyckel, idag, tillatGenomford)` flyttar kort **positionsvis** — korten byter plats som de ligger, också prov, diagnoser och egna rader; bara passen mellan gammal och ny plats berörs. Resultatet säger vilka andra prov/diagnoser som fick nytt datum (`flyttadeFasta`) så att gränssnittet kan fråga först (`studio/flytt.ts` → `flyttaMedFragor`: fråga 1 om pass som har varit, fråga 2 om prov/diagnoser som följer med). `flyttaAvsnittEfter` flyttar ett helt avsnitt till höger om ett annat (rutorna i "Vägen till provet" på ämnessidan; åt höger samlas avsnittet där dess senare del redan ligger). Kortrad använder `flyttaKortTill`; den äldre `flyttaLektionEfter` (fasta kort ligger kvar, de fria flyter) finns kvar för annan kod. **Egna rader under ett inlagt utkast**: `laggTillEgenRad` ensam syns inte (utkastet visar bara nycklar det känner till) — använd `laggTillEgenRadIPlan`; `osynligaEgnaRader` / `laggInEgenRadIPlan` hittar och lägger in rader som redan hamnat utanför.
- **Provlapp i matematik (Del 260)**: `provlappmatematik.ts` → `matteLapp(bok, koder, lärarensUppgifter)`. När ämnet är matematik sätts `Provlapp.matte` och lappen (text, skärm, Word) följer de fem förmågorna i `FORMAGOR` — begrepp, metod, problemlösning, resonemang, kommunikation — med `REGEL_E` överst (alla fem på E-nivå för E) och en checklista per delkapitel sist. Delkapitlens mål sorteras till en förmåga av `malensFormaga` (förled i bokfilen `'Metod: …'`, annars hur målet börjar; okänt = metod). Bokfilen ger innehållet: `kapitelMeta[nr].forklaringar` (begreppens beskrivningar), `kapitelMeta[nr].formagor` (`{ problemlosning|resonemang|kommunikation: { E, C, A: [uppgifter] } }` → `Kapitel.formagor`), uppgifternas sidor ur `sidor_uppgifter: { ett, två, tre }` eller ur gör-raden `'ETT (1–10, s. 108)'` (→ `Lektion.uppgiftSidor`) och 'Förmågorna i fokus'-texten (`formagorIFokus`). Andra ämnen behåller den allmänna lappen (djup och bredd) och NO sin egen — testa dem med en bok vars ämne inte är matematik.
- Dyra, rena uträkningar sparas på objekten de beror på (`minne.ts`: `TrippelCache`, `delat`): `amnesPlan` (skolår + ämne + bok), `samlaSlots` (skolår + schema + klass), `helgdagar` (år), `foreslaBinogiFilmer` (bok + kapitel). Det som lämnas ut delas av alla anropare — kopiera (`[...x]`, `{ ...x }`) innan du sorterar, lägger till eller ändrar.
- En ny cache: nyckeln ska täcka **allt** resultatet beror på, och värdet ska gå genom `delat()`.
- I testerna är delade värden frysta (`test/setup.ts`) och `lasStruktur()` kontrollerar att strukturen inte ändrats på plats — ett `TypeError: Cannot add property …` eller "har ändrats på plats" betyder att koden muterar något delat.

## Ämnen, klasser och kalender (Del 245–246)

- **Ett ämne kan ha flera klasser** (`Amne.medKlassIds`, samläsning): ett ämne, en planering, ett pass — men passet står i alla klassernas scheman och kalendrar som t.ex. `8A+8B`. Fråga aldrig `a.klassId === klassId` när du menar "klassens ämnen": använd `amnenForKlass`, `amnetGallerKlass` och `handelseGallerKlass`. `klassId` är hemklassen (där elever, resultat och schemabrytande tid hämtas).
- **Kalendern visar schemat, inte bara planeringen**: ett ämne med schema men utan planering läggs ut som `oplanerad` ("Ingen planering"); `amnenUtanPlanering` pekar ut dem.

## Tester

Vitest i `packages/kernel/test/<modul>.test.ts`. Ett `describe` per funktionsområde, `it`-texten beskriver beteendet på svenska: `it('halvklass A/B slås ihop till ett tillfälle')`.

- **Fejkade namn i fixturer**: Testsson, Provlund, Övnegård, Anna Berg, Omar Ali. Riktiga elevnamn får aldrig committas.
- Testa gränsfall: tom lista, saknat värde (`null`), dubbletter, orört original.
- Kör `npx vitest run packages/kernel/test/<fil>.test.ts` under arbetet, hela sviten före leverans.

## Kvalitetskedjan före varje leverans

```
npm run lint        # eslint, I2
npm run typecheck   # tsc i alla paket
npx vitest run      # hela sviten
cd packages/studio && npx vite build
```

Alla fyra ska passera. Ett fallerande test rättas i sak — förväntningar ändras bara när beteendet medvetet ändrats, och då med en kommentar om varför.
