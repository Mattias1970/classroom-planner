# Minsta regressionssvit — Classroom Planner

Enligt kravspecifikation del 6, avsnitt 8. Automatisk täckning avser
`npm test` (lint + typecheck + vitest). Manuella steg körs i webbläsaren
(desktop + Chrome DevTools mobilemulering) före release.

| # | Steg | Automatiskt | Manuellt |
|---|------|-------------|----------|
| 1 | Navigera alla toppflikar och samtliga sju underflikar i varje kapitel | — | Klicka igenom; ingen flik får ge tom/felaktig vy |
| 2 | Byt klass i årsöversikt, kalender, tidsband och kapitelöversikt; jämför datum/tider | `schedule.test.ts`, `arsoversikt.test.ts` (slotberäkning per klass) | 8B↔8F ska ge olika tider enligt schema |
| 3 | Ändra en vanlig lektion och ett prov i kalendern; verifiera kaskad, varningsbanner och datumhistorik | `schedule-overrides.test.ts`, `arsoversikt.test.ts` (diff/varningar) | ★ + röd banner + popup med ±v |
| 4 | Redigera ett BAM-fält, återställ, verifiera persistens | `redigering.test.ts` (räknare/sammanfattning) | Gul markering, ↩ Återställ, kvar efter reload |
| 5 | Lägg till/ta bort pedagogiskt verktyg; reload-persistens | `verktyg.test.ts` (normalizeUrl) | Verktyget kvar efter omladdning |
| 6 | Alla tre lägg-till-lektion-lägen; omnumrering/state-shift | `verktyg.test.ts` (shiftOverrideMap) | Tomt/Kopiera/Flytta in nästa; kalenderändringar pekar rätt |
| 7 | Skapa, byt namn, kopiera, arkivera, återaktivera, radera klass + export/import-backup | `klasser.test.ts` (applyClassEdits, uniqueClassId, validateClassBackup) | Sista aktiva klass går ej att arkivera; klasser_backup_ÅÅÅÅ-MM-DD.json |
| 8 | Desktop, mobil porträtt, mobil landskap, Mer-menyn, skärmprofil, scroll-till-nästa | `klasser.test.ts` (isMobileViewport, guessScreenSize, nextChapterOf) | Bottennav, Mer med Kap 3–5, 📱-profil, pull efter kap-botten (ej efter kap 5) |
| 9 | Print-preview utan fixed/modal UI | — | Ctrl+P: inga knappar/nav/modaler; färger som på skärmen |
| 10 | Negativa tester för dokumenterade gap | `ical.test.ts` (trasig .ics kastar inte) | Schema överlever reload (gap stängt); sessiondata: allt persistent (gap stängt); iCal: länk med CORS-block ger vägledning, .ics-fil fyller pass; Prio: exponerad på lektionskortet (gap stängt) |

## Kända avvikelser mot prototypens gap-lista (del 6, avsnitt 7)

Alla P1-gap och P2-gapen "Prio dormant", "Film/Magma-synk", "Ny klass i
Klasser-flik", "Top-statistik statisk" är **stängda** i denna implementation.
"Google Kalender-import" är uppgraderad från stub till fungerande import via
.ics-fil (URL-hämtning försöks men blockeras normalt av Googles CORS-policy —
appen förklarar detta och hänvisar till filuppladdning).

P3 "Två parallella filmsystem" är medvetet löst som: bokens filmer (flip-data,
skrivskyddade) + lärarens egna filmlänkar (verktygstyp Film) — Filmer-fliken
visar båda samlat. P3 "Ingen autentisering/serverlagring" adresseras i
kommande sprintar (Google Auth, Classroom-publicering) enligt MASTERPLAN.
