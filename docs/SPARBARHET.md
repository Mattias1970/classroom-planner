# Teknisk spårbarhet — kodnoder → TS-moduler

Enligt kravspecifikation del 7, avsnitt 10. Kravtabellerna i del 1–6 refererar
implementationsnoder i HTML-monoliten (`planering_matematik8_alla_kapitel.html`).
Tabellen nedan mappar varje område till motsvarande plats i TypeScript-appen,
så att en utvecklare eller kodgenerator hittar beteendet.

| Område | Monolitens kodnoder | TS-appen |
|---|---|---|
| Årsöversikt: kapitelkort, nyckeldatum, klassval | renderYearOverview, yearClassBtns | `packages/web/src/views/Arsoversikt.tsx` + `packages/core/src/logic/arsoversikt.ts` (extractKeyDates, weeksLabel) |
| Datumhistorik, provvarning | dateHistoryPopup, examWarningBanner | `arsoversikt.ts` (diffKeyDates, examWarnings) + popup/banner i `Arsoversikt.tsx` |
| Kalender: vyer, legend, chips | CAL_COLORS, renderCalendar, calChip | `packages/web/src/views/Kalender.tsx` (TYPE_COLORS, chip, week/month/term) |
| Kalenderöverstyrningar: ta bort/flytta/återställ | changeLessonDialog, applyCalOverride | `Kalender.tsx` (editModal, fig 5-flöde) + `packages/core/src/records/schedule-overrides.ts` (placeLessons, OverrideMap) + store (setCalOverride) |
| Schemapanel: startdatum, dagar, tider, spara | scheduleView, saveSchedule, parseDayName | `packages/web/src/views/SchemaOchTidsband.tsx` (SchedulePanel) + `packages/core/src/logic/redigering.ts` (parseWeekday, applySchemaEdits, isValidPass) |
| Google Kalender-import | gcalStub | `packages/core/src/logic/ical.ts` (parseIcsEvents, suggestSchedulePasses) + SchedulePanel (applyIcs, importFromUrl) |
| Tidsband | timeBand, tbWeekNav | `SchemaOchTidsband.tsx` (TimeBand) |
| Lektionskort: huvud, typkodning | renderCard, cardTypeClass | `packages/web/src/app/App.tsx` (LessonCard) + CSS `.card.type-*` |
| Tavlan/BAM med tidslinje | tavlaBlock, bamTimeline | LessonCard (tavlan) + `packages/core/src/logic/bam-default.ts` + `timeline.ts` (computeTimes) |
| Socrative-kontext, exit ticket | classRoom, exitBlock | LessonCard (soc-block start/exit; socRoom per klass) |
| Arbetsblock med nivåer, minimum, Classroom | workBlock, levelBoxes | LessonCard (work-block, fig 12) |
| Läxblock | laxaBlock | LessonCard (laxa-block, fig 14) |
| Inline-redigering | editableField, commitFieldEdit, undoFieldEdit, flashSaved, persistFieldEdits, EDIT_STORAGE_KEY | App.tsx (Editable, autoGrow) + store (setField, clearField, isEdited, getOverrides) |
| Global redigeringsräknare + sammanfattning | updateEditCountStat, showEditSummary | App.tsx (edit-stat, showEdits-modal) + `redigering.ts` (distinctEditedFields, summarizeEdits) |
| Pedagogiska verktyg (sex typer, plattformar) | toolGroups, addToolDialog | App.tsx (ResourceRow, PLATFORMS) + store (LessonLink/ToolTyp med legacy-migrering) + `verktyg.ts` (normalizeUrl) |
| Strukturell insättning (tre lägen) | openAddLessonDialog, insertLesson, blankLessonContent | App.tsx (AddLessonDialog) + store (addCustomLesson, shiftAllCalOverrides) + `verktyg.ts` (shiftOverrideMap) |
| Kapitelöversikt | renderOverview, setOvClass | App.tsx (OversiktTab) |
| Uppgifter per delkapitel | renderUppgifter | App.tsx (UppgifterTab) |
| Begreppstabell | renderBegrepp | App.tsx (BegreppTab, Forklaring) + `verktyg.ts` (buildBegreppTabell) |
| Filmer per lektion | filmState, renderFilmTab | App.tsx (FilmerTab) + flip-data + store (getLinks typ 'film') |
| Magma per lektion | magmaState, renderMagmaTab | App.tsx (MagmaTab, MagmaRow) + store (getMagma/setMagma/clearMagma, countMagmaForKap) |
| Prio Övningsrum | prioState (dormant) | App.tsx (PrioBlock) + store (getPrio/setPrio, PRIO_ALL) — exponerad |
| Klassanteckningar | classNotes | App.tsx (KlasserTab) + store (getClassNote/setClassNote) |
| Klasshanteraren | manageClassesDialog, importClassesBackup, exportClassesBackup | `packages/web/src/views/KlassHanterare.tsx` + `packages/core/src/logic/klasser.ts` (applyClassEdits, uniqueClassId, validateClassBackup) |
| Mobil: identifiering, bottennav, Mer, skärmprofil, scroll-nästa | detectPlatform, bottomNav, moreMenu, phoneSizeMenu, scrollNextChapter | `packages/web/src/views/Mobil.tsx` + `klasser.ts` (isMobileViewport, guessScreenSize, nextChapterOf) |
| Datakällor: GitHub/demo | — (ny) | store (loadFromGithub) + `packages/web/src/state/githubReader.ts` + `packages/core/src/adapters/subject-loader.ts` |
| Backup/persistens | persistAll | store (exportBackup/importBackup, lsGet/lsSet med NFR-005-fallback) |
| Utskrift | @media print | `styles.css` print-sektioner (WYSIWYG, färgexakt) |

**Visuell baslinje:** figurerna 1–38 i del 7 utgör referensen. Avvikelser som
identifierades och åtgärdades vid del 7-granskningen: fig 5 (Ändra lektion med
valkort + Bekräfta), fig 11 (nivåintervall i Arbete-segmentet), fig 12
(arbetsblock med nivåboxar och underrader), fig 14 (läxblock med chips och
slutförandetext), fig 36 (scroll-hint med kapitelnamn).
