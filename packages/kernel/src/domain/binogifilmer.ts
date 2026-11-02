/**
 * Del 226 · Binogi-filmer för Spektrum Biologi (Liber), kapitel 6 och 7 — samma lista som i
 * bokfilen i datarepot, men inbyggd i appen så att planeringen och provlappen alltid har
 * filmerna även när appen kör en äldre bokfil. Bokfilens egna filmer går först; listan här
 * används bara för delkapitel som saknar filmer i boken.
 */
export interface BinogiFilm { titel: string; url: string; begrepp: string }

export const SPEKTRUM_BIOLOGI_FILMER: Readonly<Record<string, readonly BinogiFilm[]>> = {
  '6.1': [
    { titel: 'Livets domäner', url: 'https://app.binogi.se/l/cellens-domaener', begrepp: 'cellteorin, encelliga bakterier, celler med och utan cellkärna' },
    { titel: 'Djurcellen', url: 'https://app.binogi.se/l/djurcellen', begrepp: 'cellmembran, cellkärna, mitokondrier, ribosomer, cellandning' },
    { titel: 'Cellens specialisering', url: 'https://app.binogi.se/l/cellens-specialisering', begrepp: 'stamcell, specialiserade celler, celldelning' },
    { titel: 'Vävnad', url: 'https://app.binogi.se/l/vaevnad', begrepp: 'vävnad' },
    { titel: 'Organ och organsystem', url: 'https://app.binogi.se/l/organ-och-organsystem', begrepp: 'organ, organsystem' },
    { titel: 'Aerobisk och anaerobisk syreupptagning', url: 'https://app.binogi.se/l/aerobisk-och-anaerobisk-syreupptagning', begrepp: 'cellandning, mitokondrier, mjölksyra' },
  ],
  '6.2': [
    { titel: 'Matspjälkningen – från munnen till magen', url: 'https://app.binogi.se/l/matspjaelkningen-fraan-munnen-till-magen', begrepp: 'matspjälkning, enzym, magsaft' },
    { titel: 'Matspjälkningen – tarmarna', url: 'https://app.binogi.se/l/matspjaelkningen-tarmarna', begrepp: 'bukspott, galla, tarmludd' },
    { titel: 'Näringsämnen', url: 'https://app.binogi.se/l/naeringsaemnen', begrepp: 'kolhydrater, proteiner, fetter, näring till cellerna' },
  ],
  '6.3': [
    { titel: 'Andningen', url: 'https://app.binogi.se/l/andningen', begrepp: 'luftrör, lungblåsor, diafragma, andningscentrum' },
    { titel: 'Aerobisk och anaerobisk syreupptagning', url: 'https://app.binogi.se/l/aerobisk-och-anaerobisk-syreupptagning', begrepp: 'syre till cellerna, cellandning' },
  ],
  '6.4': [
    { titel: 'Hjärt- och kärlsystemet', url: 'https://app.binogi.se/l/hjaert-och-kaerlsystemet', begrepp: 'blodomlopp, artär, ven, kapillär, lilla och stora kretsloppet' },
    { titel: 'Hjärtat', url: 'https://app.binogi.se/l/hjaertat', begrepp: 'segelklaff, fickklaff, blodtryck, muskelpump' },
    { titel: 'Blodet', url: 'https://app.binogi.se/l/blodet', begrepp: 'blodplasma, hemoglobin, röda och vita blodkroppar, blodplättar' },
    { titel: 'Blodgrupper och blodtransfusioner', url: 'https://app.binogi.se/l/blodgrupper-och-blodtransfusioner', begrepp: 'blodgrupper, blodtransfusion' },
    { titel: 'Njurarna', url: 'https://app.binogi.se/l/njurarna', begrepp: 'njurarna renar blodet, urinblåsan' },
  ],
  '6.5': [
    { titel: 'Immunförsvaret', url: 'https://app.binogi.se/l/immunfoersvaret', begrepp: 'immunförsvar, vit blodkropp, antikropp' },
    { titel: 'Lymfsystemet', url: 'https://app.binogi.se/l/lymfsystemet', begrepp: 'lymfa, lymfkörtel, mjälte, tymus' },
    { titel: 'Vaccin i kroppen', url: 'https://app.binogi.se/l/vaccin-i-kroppen', begrepp: 'vaccination, antikropp' },
    { titel: 'Bakteriesjukdomar', url: 'https://app.binogi.se/l/bakteriesjukdomar', begrepp: 'bakterier, infektion' },
    { titel: 'Resistenta bakterier', url: 'https://app.binogi.se/l/resistenta-bakterier', begrepp: 'antibiotika, resistens' },
    { titel: 'Virus', url: 'https://app.binogi.se/l/virus', begrepp: 'virus, infektion' },
  ],
  '7.1': [
    { titel: 'Nervsystemet', url: 'https://app.binogi.se/l/nervsystemet', begrepp: 'centrala/perifera, självständiga nervsystemet, nervimpuls' },
    { titel: 'Nervreflexer', url: 'https://app.binogi.se/l/nervreflexer', begrepp: 'reflex, ryggmärgen, synaps' },
    { titel: 'Hjärnans anatomi', url: 'https://app.binogi.se/l/hjaernans-anatomi', begrepp: 'storhjärna, hjärnbark, hjärnbalk, hjärnstam, lillhjärna, hjärnhinnor' },
  ],
  '7.2': [
    { titel: 'Hjärnan', url: 'https://app.binogi.se/l/hjaernan', begrepp: 'hjärnbark, hjärncentra, lober' },
    { titel: 'Hur minnet fungerar', url: 'https://app.binogi.se/l/hur-minnet-fungerar', begrepp: 'korttids-/långtidsminne, hippocampus, synapser' },
    { titel: 'Känslornas biologi', url: 'https://app.binogi.se/l/kaenslornas-biologi', begrepp: 'hjärnans centra, signalämnen (fördjupning)' },
  ],
  '7.3': [
    { titel: 'Smak och lukt', url: 'https://app.binogi.se/l/smak-och-lukt', begrepp: 'luktsinnescell, grundsmaker, smaklök, kemiska sinnen' },
    { titel: 'Huden', url: 'https://app.binogi.se/l/huden', begrepp: 'känselkropp, beröring, värme, kyla, smärta' },
  ],
  '7.4': [
    { titel: 'Synen', url: 'https://app.binogi.se/l/synen', begrepp: 'hornhinna, pupill, lins, näthinna, tappar/stavar, syncentrum' },
    { titel: 'Linser (fysik)', url: 'https://app.binogi.se/l/linser', begrepp: 'ackommodation, närsynthet, översynthet, samlings-/spridningslins' },
  ],
  '7.5': [
    { titel: 'Hörseln', url: 'https://app.binogi.se/l/hoerseln', begrepp: 'trumhinna, hörselben, hörselsnäcka, hörselnerv, hörselcentrum, balans' },
    { titel: 'Ljud och oljud (fysik)', url: 'https://app.binogi.se/l/ljud-och-oljud', begrepp: 'buller, tinnitus, frekvens 20–20 000 Hz' },
  ],
  '7.6': [
    { titel: 'Endokrina system och hormoner', url: 'https://app.binogi.se/l/endokrina-system-och-hormoner', begrepp: 'vävnads-/klassiska hormon, receptor, hypotalamus, hypofysen, körtlar' },
    { titel: 'Puberteten: Förändringar i kroppen', url: 'https://app.binogi.se/l/puberteten-foeraendringar-i-kroppen', begrepp: 'östrogen, progesteron, testosteron' },
    { titel: 'Stress och stresshantering', url: 'https://app.binogi.se/l/stress-och-stresshantering', begrepp: 'adrenalin, kortisol, binjurarna' },
  ],
};

/** Böcker som listan gäller: Spektrum Biologi (id spektrum-biologi) eller en Liber-biologibok. */
export function binogiFilmerFor(bok: { id: string; forlag?: string; amne?: string }, kod: string | null): readonly BinogiFilm[] {
  if (kod === null) return [];
  const spektrum = bok.id === 'spektrum-biologi' || bok.id.startsWith('liber-biologi') || ((bok.forlag ?? '').toLowerCase() === 'liber' && (bok.amne ?? '').toLowerCase() === 'biologi');
  return spektrum ? (SPEKTRUM_BIOLOGI_FILMER[kod] ?? []) : [];
}
