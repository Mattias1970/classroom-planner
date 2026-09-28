/**
 * Del 156 · Återskapa genomförd planering ur quizzarna (Ring 1, I2).
 *
 * Varje schemalagt pass före idag får ett förslag på vad som gjordes, läst ur
 * Socrative- och DigiExam-resultaten som hör till passet:
 *
 *  - Exit ticket med ett nytt delkapitel  → genomgång av avsnittet (säkert).
 *    Samma exit igen → bokens nästa del av avsnittet, annars en extra lektion.
 *  - Läxförhör/övning som körts förut (samma test igen) → extra lektion på
 *    avsnittet med Testa dig själv-frågor (säkert).
 *  - Läxförhör utan exit, första gången → genomgång utan exit om nästa läxförhör
 *    innehåller ett delkapitel som ingen exit introducerat, annars extra lektion
 *    (kontrollera).
 *  - DigiExam → prov (bokens provlektion om den finns).
 *  - Inget quiz → laboration på halvklasspass, annars "Lektion utan quiz" (kontrollera).
 *
 * Läraren kan byta förslaget per pass (AterskapaValTyp). Valet görs i ordning,
 * så ett byte påverkar vilken bokrad nästa "genomgång utan exit" tar. När läraren
 * godkänner blir resultatet facit på en ny planeringsversion (den gamla arkiveras);
 * från idag fortsätter boken med raden efter den sista som gåtts igenom.
 *
 * Klassificeringen går på rum och delkapitelkoder (koderForProv), aldrig på tid.
 */
import { delkapitelKod } from './bok.js';
import { koderForProv } from './delkapitelkoder.js';
import { TYPNAMN, type Resultat, type ResultatKalla } from './resultat.js';
import {
  amnesOffset, amnesPlanFor, facitNyckel, kopplaOmLektionsplaner, noBudget, planeringsRader, registreraPlanering, samlaSlots,
  sessionsNyckel, nyttId,
} from './struktur.js';
import type { AterskapaValTyp, GenomfordLektion, GenomfordPlanering, GenomfordTyp, Pass, Struktur } from './typer.js';

/** Ett quiz som kördes på passet. */
export interface QuizPaPass {
  kalla: ResultatKalla;
  /** Quizets namn ('Biologi 4.1 Begrepp'). */
  prov: string;
  rum?: string;
  /** Delkapitel quizet täcker ('4.1', '4.2'). */
  koder: string[];
  /** Antal elever med svar. */
  antal: number;
  /** Samma läxförhör/övning har körts på ett tidigare pass. */
  upprepat: boolean;
}

export interface AterskapadLektion extends GenomfordLektion {
  vecka: number;
  slut: string;
  /** Passet är ett halvklasspass (bara den här gruppen). */
  halvklasspass: boolean;
  quiz: QuizPaPass[];
  /** Förslaget följer direkt ur quizzarna (exit ticket, upprepat förhör, prov). */
  saker: boolean;
  /** Varför förslaget blev som det blev. */
  skal: string;
  /** Förslaget ur quizzarna. */
  forslag: GenomfordTyp;
  /** Det som gäller: förslaget ('auto') eller lärarens val. */
  val: AterskapaValTyp;
  /** Nyckel för valet: 'A|2026-09-01|08:10'. */
  nyckel: string;
}

export interface AterskapadGrupp {
  /** null = helklassämne. */
  grupp: 'A' | 'B' | null;
  lektioner: AterskapadLektion[];
  /** Bokens rader som hoppades över (före den sista som gicks igenom). */
  hoppade: string[];
  /** Bokens rad som planeringen fortsätter med från idag. */
  fortsatter: string | null;
}

export interface Aterskapad {
  amneId: string;
  /** Facit gäller pass före detta datum. */
  till: string;
  grupper: AterskapadGrupp[];
  /** Quiz som inte hör till något pass i schemat (t.ex. övning hemma). */
  utanforSchema: Array<{ datum: string; kalla: ResultatKalla; prov: string }>;
  antalQuiz: number;
  /** Antal pass per typ (alla grupper). */
  summa: Record<GenomfordTyp, number>;
}

/** Lärarens val per pass: nyckel → typ (+ rubrik för 'annat'). */
export type AterskapaVal = Record<string, { typ: AterskapaValTyp; rubrik?: string }>;

export const VALNAMN: Record<AterskapaValTyp, string> = {
  auto: 'Förslaget', nasta: 'Genomgång utan exit (nästa i boken)', extra: 'Extra lektion (Testa dig själv)',
  laboration: 'Laboration', prov: 'Prov', installd: 'Inställd', annat: 'Annat',
};

export const TYPNAMN_GENOMFORD: Record<GenomfordTyp, string> = {
  avsnitt: 'Avsnitt', extra: 'Extra lektion', laboration: 'Laboration', prov: 'Prov', annat: 'Annat', installd: 'Inställd',
};

export function aterskapaNyckel(grupp: 'A' | 'B' | null, datum: string, start: string): string {
  return `${grupp ?? 'hel'}|${datum}|${start}`;
}

interface Test { kalla: ResultatKalla; prov: string; rum?: string; datum: string; tid?: string; elever: Set<string>; koder: string[]; id: string }

const minuter = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Unika tester (kalla + quiz + rum + datum) ur resultaten, med antal elever. */
function testerFor(resultat: Resultat[]): Test[] {
  const per = new Map<string, Test>();
  for (const r of resultat) {
    const kalla = r.manuellTyp === true ? r.kalla : (r.inkluderadSom ?? r.kalla);
    const k = `${kalla}|${r.prov}|${r.rum ?? ''}|${r.datum}`;
    const t = per.get(k) ?? { kalla, prov: r.prov, rum: r.rum, datum: r.datum, tid: r.tid, elever: new Set<string>(), koder: koderForProv(r.prov, r.rum), id: `${r.rum ?? ''}|${r.prov}` };
    t.elever.add(r.elevId);
    if (t.tid === undefined && r.tid !== undefined) t.tid = r.tid;
    per.set(k, t);
  }
  return [...per.values()];
}

/** Förslag för varje pass före `idag` ur quizzarna — med lärarens val insprängda. */
export function aterskapaPlanering(s: Struktur, amneId: string, idag: string, valIn: AterskapaVal = {}): Aterskapad {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const tjanst = s.tjanster.find((t) => t.id === klass?.tjanstId);
  const skolar = s.skolar.find((x) => x.id === tjanst?.skolarId);
  if (skolar === undefined) throw new Error('Ämnet saknar läsår.');
  const bok = s.bocker.find((b) => b.id === amne.bokId);
  if (bok === undefined) throw new Error('Ämnet saknar bok.');
  const rader = planeringsRader(bok, amne);
  const radKod = rader.map((r) => delkapitelKod(r.lektion.avsnitt));
  const labbar = amne.laborationer ?? [];

  // Tidigare godkända val återanvänds (lärarens beslut ska inte behöva göras om)
  const tidigare = s.planeringar.find((p) => p.amneId === amneId)?.genomfort;
  const val: AterskapaVal = { ...tidigareVal(tidigare), ...valIn };

  const elever = s.elever.filter((e) => e.klassId === amne.klassId);
  const resultat = (s.resultat ?? []).filter((r) => r.amneId === amneId && r.kalla !== 'magma' && r.datum < idag);
  const offset = amnesOffset(skolar, amne);
  const budget = amne.noGrupp !== undefined ? noBudget(skolar, amne.schema) : undefined;
  const slotsFor = (schema: Pass[]) => samlaSlots(skolar, schema).slice(offset, budget === undefined ? undefined : offset + budget);

  const halv = amne.halvklass === true && amne.schemaB !== undefined;
  const grupper: Array<{ grupp: 'A' | 'B' | null; schema: Pass[]; andra: Pass[] | null }> = halv
    ? [{ grupp: 'A', schema: amne.schema, andra: amne.schemaB ?? [] }, { grupp: 'B', schema: amne.schemaB ?? [], andra: amne.schema }]
    : [{ grupp: null, schema: amne.schema, andra: null }];

  const utanfor = new Map<string, { datum: string; kalla: ResultatKalla; prov: string }>();
  const allaTester = new Set<string>();
  const ut: AterskapadGrupp[] = [];

  for (const g of grupper) {
    const slots = slotsFor(g.schema).filter((x) => x.datum < idag);
    const andraNycklar = g.andra === null ? null : new Set(slotsFor(g.andra).map((x) => sessionsNyckel(x.datum, x.start)));
    const iGruppen = new Set(elever.filter((e) => g.grupp === null || e.grupp === g.grupp).map((e) => e.id));
    const tester = testerFor(resultat.filter((r) => iGruppen.has(r.elevId)));
    // Tester → pass (samma datum; flera pass samma dag avgörs av klockslaget)
    const perPass = new Map<string, Test[]>();
    for (const t of tester) {
      allaTester.add(`${t.kalla}|${t.prov}|${t.rum ?? ''}|${t.datum}`);
      const samma = slots.filter((x) => x.datum === t.datum);
      if (samma.length === 0) { utanfor.set(`${t.kalla}|${t.prov}|${t.datum}`, { datum: t.datum, kalla: t.kalla, prov: t.prov }); continue; }
      const tid = t.tid;
      const x = tid === undefined || samma.length === 1 ? samma[0]
        : (samma.find((y) => tid >= y.start && tid <= y.slut) ?? [...samma].sort((p, q) => Math.abs(minuter(p.start) - minuter(tid)) - Math.abs(minuter(q.start) - minuter(tid)))[0]);
      const k = facitNyckel(x.datum, x.start);
      perPass.set(k, [...(perPass.get(k) ?? []), t]);
    }

    // Tillstånd när passen gås igenom i ordning
    const gatt = new Set<string>();          // delkapitel som introducerats
    const forbrukade = new Set<number>();    // bokens rader som gåtts igenom
    let pekare = -1;                          // sista bokrad som gåtts igenom
    let aktuell: string | null = null;        // delkapitlet klassen arbetar med
    let labNr = 0;
    const sedda = new Set<string>();          // läxförhör/övningar som körts
    const lektioner: AterskapadLektion[] = [];

    const forstaRad = (kod: string): number => rader.findIndex((_, i) => radKod[i] === kod && !forbrukade.has(i));
    const namnFor = (kod: string | null): string => {
      if (kod === null) return 'avsnittet';
      const i = radKod.findIndex((k) => k === kod);
      return i < 0 ? kod : rader[i].lektion.avsnitt;
    };
    const exitKoderFramat = (fran: number, till: number): Set<string> => {
      const k = new Set<string>();
      for (let j = fran; j <= till; j += 1) for (const t of perPass.get(facitNyckel(slots[j].datum, slots[j].start)) ?? []) if (t.kalla === 'socrative-exit') t.koder.forEach((x) => k.add(x));
      return k;
    };

    slots.forEach((x, idx) => {
      const pk = facitNyckel(x.datum, x.start);
      const nyckel = aterskapaNyckel(g.grupp, x.datum, x.start);
      const tp = perPass.get(pk) ?? [];
      const halvklasspass = andraNycklar !== null && !andraNycklar.has(sessionsNyckel(x.datum, x.start));
      const quiz: QuizPaPass[] = tp.map((t) => ({
        kalla: t.kalla, prov: t.prov, ...(t.rum !== undefined ? { rum: t.rum } : {}), koder: t.koder, antal: t.elever.size,
        upprepat: t.kalla !== 'socrative-exit' && t.kalla !== 'digiexam' && sedda.has(t.id),
      }));
      const underlag = tp.map((t) => `${TYPNAMN[t.kalla]} · ${t.rum ?? t.prov}`);
      const exits = tp.filter((t) => t.kalla === 'socrative-exit');
      const forhor = tp.filter((t) => t.kalla === 'socrative-laxforhor' || t.kalla === 'socrative-ovning');
      const prov = tp.filter((t) => t.kalla === 'digiexam');

      // ── Förslaget ur quizzarna ──
      type Beslut = { typ: GenomfordTyp; rader: number[]; kod: string | null; rubrik: string; saker: boolean; skal: string; nyaKoder: string[] };
      const extra = (saker: boolean, skal: string): Beslut => {
        const i = aktuell === null ? -1 : radKod.findIndex((k) => k === aktuell);
        return { typ: 'extra', rader: i < 0 ? [] : [i], kod: aktuell, rubrik: `${namnFor(aktuell)} – extra lektion (Testa dig själv)`, saker, skal, nyaKoder: [] };
      };
      const provBeslut = (skal: string, saker: boolean): Beslut => {
        const i = rader.findIndex((r, j) => j > pekare && !forbrukade.has(j) && r.lektion.typ === 'exam');
        return { typ: 'prov', rader: i < 0 ? [] : [i], kod: aktuell, rubrik: i < 0 ? (prov[0]?.prov ?? 'Prov') : rader[i].lektion.avsnitt, saker, skal, nyaKoder: [] };
      };
      const avsnittFor = (koder: string[], saker: boolean, skal: string): Beslut => {
        const idxs: number[] = [];
        for (const kod of koder) { const i = forstaRad(kod); if (i >= 0 && !idxs.includes(i)) idxs.push(i); }
        const rubrik = idxs.length > 0 ? idxs.map((i) => rader[i].lektion.avsnitt).join(' + ') : `${koder.join(' + ')} (finns inte i boken)`;
        return { typ: 'avsnitt', rader: idxs, kod: koder[koder.length - 1] ?? aktuell, rubrik, saker, skal, nyaKoder: koder };
      };
      const nastaIBoken = (skal: string): Beslut => {
        const i = rader.findIndex((_, j) => j > pekare && !forbrukade.has(j));
        if (i < 0) return { typ: 'annat', rader: [], kod: aktuell, rubrik: 'Lektion (boken är slut)', saker: false, skal, nyaKoder: [] };
        const kod = radKod[i];
        return { typ: 'avsnitt', rader: [i], kod: kod ?? aktuell, rubrik: rader[i].lektion.avsnitt, saker: false, skal, nyaKoder: kod === null ? [] : [kod] };
      };
      const lab = (saker: boolean, skal: string): Beslut => ({
        typ: 'laboration', rader: [], kod: aktuell, rubrik: labbar[labNr] !== undefined ? `🧪 ${labbar[labNr].rubrik}` : `🧪 Laboration ${labNr + 1}`, saker, skal, nyaKoder: [],
      });

      let forslag: Beslut;
      if (prov.length > 0) {
        forslag = provBeslut(`DigiExam: ${prov.map((t) => t.prov).join(', ')}`, true);
      } else if (exits.length > 0) {
        const koder = [...new Set(exits.flatMap((t) => t.koder))];
        const nya = koder.filter((k) => !gatt.has(k));
        const exitNamn = exits.map((t) => t.rum ?? t.prov).join(', ');
        if (nya.length > 0) forslag = avsnittFor(nya, true, `Exit ticket ${exitNamn}: nytt avsnitt`);
        else if (koder.length === 0) forslag = nastaIBoken(`Exit ticket ${exitNamn} utan delkapitel i namnet — kontrollera`);
        else if (koder.some((k) => forstaRad(k) >= 0)) forslag = avsnittFor(koder.filter((k) => forstaRad(k) >= 0).slice(0, 1), true, `Exit ticket ${exitNamn} igen: nästa del av avsnittet`);
        else forslag = extra(true, `Exit ticket ${exitNamn} igen: extra lektion på avsnittet`);
      } else if (forhor.length > 0) {
        const upprepade = forhor.filter((t) => sedda.has(t.id));
        if (upprepade.length > 0) {
          forslag = extra(true, `${upprepade.map((t) => t.rum ?? t.prov).join(', ')} körs igen: extra lektion med Testa dig själv`);
        } else {
          // Titta framåt: nästa läxförhör — finns ett delkapitel där som ingen exit introducerat?
          let dolda: string[] = [];
          for (let j = idx + 1; j < slots.length; j += 1) {
            const lax = (perPass.get(facitNyckel(slots[j].datum, slots[j].start)) ?? []).filter((t) => t.kalla === 'socrative-laxforhor');
            if (lax.length === 0) continue;
            const exitsSedan = exitKoderFramat(idx + 1, j);
            dolda = [...new Set(lax.flatMap((t) => t.koder))].filter((k) => !gatt.has(k) && !exitsSedan.has(k) && !forhor.some((f) => f.koder.includes(k)));
            break;
          }
          forslag = dolda.length > 0
            ? avsnittFor(dolda.slice(0, 1), false, `Ingen exit ticket, men ${dolda[0]} finns i nästa läxförhör — genomgång utan exit? Kontrollera`)
            : extra(false, 'Läxförhör men ingen exit ticket — arbete på avsnittet? Kontrollera');
        }
      } else if (halvklasspass) {
        forslag = lab(false, 'Halvklasspass utan quiz — laboration? Kontrollera');
      } else {
        forslag = { typ: 'annat', rader: [], kod: aktuell, rubrik: 'Lektion utan quiz', saker: false, skal: 'Inget quiz på passet — välj vad som gjordes', nyaKoder: [] };
      }

      // ── Lärarens val ──
      const v = val[nyckel];
      let beslut = forslag;
      if (v !== undefined && v.typ !== 'auto') {
        const skal = `Ditt val: ${VALNAMN[v.typ]}`;
        if (v.typ === 'nasta') beslut = { ...nastaIBoken(skal), saker: true };
        else if (v.typ === 'extra') beslut = extra(true, skal);
        else if (v.typ === 'laboration') beslut = lab(true, skal);
        else if (v.typ === 'prov') beslut = provBeslut(skal, true);
        else if (v.typ === 'installd') beslut = { typ: 'installd', rader: [], kod: aktuell, rubrik: 'Inställd', saker: true, skal, nyaKoder: [] };
        else beslut = { typ: 'annat', rader: [], kod: aktuell, rubrik: v.rubrik?.trim() !== '' && v.rubrik !== undefined ? v.rubrik.trim() : 'Annat', saker: true, skal, nyaKoder: [] };
      }

      // ── Uppdatera tillståndet ──
      if (beslut.typ === 'avsnitt' || beslut.typ === 'prov') for (const i of beslut.rader) { forbrukade.add(i); pekare = Math.max(pekare, i); }
      for (const k of beslut.nyaKoder) gatt.add(k);
      for (const i of beslut.typ === 'avsnitt' ? beslut.rader : []) { const k = radKod[i]; if (k !== null) gatt.add(k); }
      exits.forEach((t) => t.koder.forEach((k) => gatt.add(k)));
      if (beslut.kod !== null) aktuell = beslut.kod;
      if (beslut.typ === 'laboration') labNr += 1;
      forhor.forEach((t) => sedda.add(t.id));

      lektioner.push({
        datum: x.datum, start: x.start, slut: x.slut, vecka: x.vecka, nyckel, halvklasspass, quiz, underlag,
        typ: beslut.typ, rubrik: beslut.rubrik, ...(beslut.kod !== null ? { kod: beslut.kod } : {}),
        ...(beslut.rader.length > 0 ? { rader: beslut.rader.map((i) => rader[i].nyckel) } : {}),
        saker: beslut.saker, skal: beslut.skal, forslag: forslag.typ, val: v?.typ ?? 'auto',
        ...(v !== undefined && v.typ !== 'auto' ? { vald: v.typ } : {}),
      });
    });

    const hoppade = rader.filter((_, i) => i < pekare && !forbrukade.has(i)).map((r) => r.lektion.avsnitt);
    ut.push({ grupp: g.grupp, lektioner, hoppade, fortsatter: rader[pekare + 1]?.lektion.avsnitt ?? null });
  }

  const summa: Record<GenomfordTyp, number> = { avsnitt: 0, extra: 0, laboration: 0, prov: 0, annat: 0, installd: 0 };
  for (const g of ut) for (const l of g.lektioner) summa[l.typ] += 1;
  return {
    amneId, till: idag, grupper: ut, utanforSchema: [...utanfor.values()].sort((a, b) => a.datum.localeCompare(b.datum)),
    antalQuiz: allaTester.size, summa,
  };
}

/** Lärarens tidigare val ur ett godkänt facit. */
function tidigareVal(f: GenomfordPlanering | undefined): AterskapaVal {
  const v: AterskapaVal = {};
  if (f === undefined) return v;
  const lagg = (grupp: 'A' | 'B' | null, lista: GenomfordLektion[]) => {
    for (const l of lista) if (l.vald !== undefined) v[aterskapaNyckel(grupp, l.datum, l.start)] = { typ: l.vald, ...(l.vald === 'annat' ? { rubrik: l.rubrik } : {}) };
  };
  if (f.b !== undefined) { lagg('A', f.a); lagg('B', f.b); } else lagg(null, f.a);
  return v;
}

/** Facitpasset utan förslagets arbetsfält. */
function tillFacit(l: AterskapadLektion): GenomfordLektion {
  return {
    datum: l.datum, start: l.start, typ: l.typ, rubrik: l.rubrik,
    ...(l.rader !== undefined ? { rader: l.rader } : {}), ...(l.kod !== undefined ? { kod: l.kod } : {}),
    ...(l.underlag !== undefined && l.underlag.length > 0 ? { underlag: l.underlag } : {}),
    ...(l.vald !== undefined ? { vald: l.vald } : {}),
  };
}

/**
 * Godkänner återskapandet: en ny planeringsversion med facit registreras (den aktiva
 * arkiveras och kan återställas), och lektionsplanerna följer sina lektioner.
 */
export function godkannAterskapad(s: Struktur, a: Aterskapad, skapad: string): Struktur {
  const amne = s.amnen.find((x) => x.id === a.amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  if (amne.bokId === undefined) throw new Error('Ämnet saknar bok.');
  const hel = a.grupper.find((g) => g.grupp === null);
  const ga = a.grupper.find((g) => g.grupp === 'A');
  const gb = a.grupper.find((g) => g.grupp === 'B');
  const genomfort: GenomfordPlanering = {
    till: a.till,
    a: (hel ?? ga)?.lektioner.map(tillFacit) ?? [],
    ...(gb !== undefined ? { b: gb.lektioner.map(tillFacit) } : {}),
    aterskapad: skapad,
  };
  const fore = amnesPlanFor(s, a.amneId, a.till, false)?.a ?? [];
  const ut = registreraPlanering(s, { id: nyttId('pl'), amneId: a.amneId, bokId: amne.bokId, skapad, genomfort });
  const efter = amnesPlanFor(ut, a.amneId, a.till, false)?.a ?? [];
  return kopplaOmLektionsplaner(ut, a.amneId, fore, efter);
}

