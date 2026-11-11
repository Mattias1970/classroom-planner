/**
 * Del 242 · Vakten vid quizen — två frågor som visas överst i appen när något behöver lärarens svar:
 *
 *   – Elever i fel klass: 8A:s elever har hamnat även i 8B (en 8A-rapport lästes in medan 8B var vald).
 *     "Ja" flyttar hem dem med resultat och filer; "Inte nu" tystar frågan för just den uppsättningen.
 *   – Quiz med för få svar: importerade quiz med under 30 % av elevernas möjliga svar. "Ta bort" tar bort
 *     filen och dess resultat och spärrar filnamnet; "Behåll" gör att appen inte frågar om filen igen.
 *
 * Inget ändras utan att läraren svarar, och båda går att ångra med ↩.
 */
import { useMemo, useState } from 'react';
import { behallFil, eleverIFelKlass, filerMedFaSvar, rensaEleverIFelKlass, sparraFil, type FelKlass, type Struktur } from '@planner/kernel';
import { lasInstallning, lasStruktur, sparaInstallning } from './store.js';

const INTE_NU = 'cp.felklass.inteNu';
const signatur = (f: FelKlass) => `${f.franKlassId}>${f.tillKlassId}:${f.par.map((p) => p.franId).sort().join(',')}`;
const antal = (n: number, ett: string, flera: string) => `${n} ${n === 1 ? ett : flera}`;
const kortDag = (datum?: string) => (datum === undefined ? '' : `${Number(datum.slice(8, 10))}/${Number(datum.slice(5, 7))}`);

export function QuizVakt({ s, kor }: { s: Struktur; kor: (fn: () => Struktur, m: string) => void }) {
  const [inteNu, setInteNu] = useState<string[]>(() => lasInstallning<string[]>(INTE_NU, []));
  const felKlass = useMemo(() => eleverIFelKlass(s).filter((f) => !inteNu.includes(signatur(f))), [s, inteNu]);
  const faSvar = useMemo(() => filerMedFaSvar(s), [s]);
  if (felKlass.length === 0 && faSvar.length === 0) return null;
  const klassNamn = (id: string) => s.klasser.find((k) => k.id === id)?.namn ?? '?';
  const amneNamn = (id: string) => { const a = s.amnen.find((x) => x.id === id); return `${klassNamn(a?.klassId ?? '')} ${a?.namn ?? '?'}`.trim(); };
  const idag = new Date().toISOString().slice(0, 10);

  const flyttaHem = (f: FelKlass) => {
    kor(() => {
      // Räkna om mot det som är sparat just nu, så att exakt samma elever flyttas
      const st = lasStruktur();
      const nu = eleverIFelKlass(st).find((x) => x.franKlassId === f.franKlassId && x.tillKlassId === f.tillKlassId);
      return nu === undefined ? st : rensaEleverIFelKlass(st, nu, idag).s;
    }, `${antal(f.par.length, 'elev', 'elever')} flyttade hem från ${klassNamn(f.franKlassId)} till ${klassNamn(f.tillKlassId)}: ${antal(f.resultat, 'resultat', 'resultat')} och ${antal(f.filer, 'quizfil', 'quizfiler')} följde med${f.dubbletter > 0 ? `, ${antal(f.dubbletter, 'kopia', 'kopior')} fanns redan där` : ''}. ${klassNamn(f.franKlassId)}:s egna elever och resultat är orörda.`);
  };
  const avvakta = (f: FelKlass) => { const ny = [...inteNu, signatur(f)]; setInteNu(ny); sparaInstallning(INTE_NU, ny); };

  return (
    <div className="quizvakt no-print">
      {felKlass.map((f) => (
        <div key={signatur(f)} className="quizfraga" role="region" aria-label="Elever i fel klass">
          <p><b>👥 {klassNamn(f.franKlassId)} innehåller {antal(f.par.length, 'elev', 'elever')} som också finns i {klassNamn(f.tillKlassId)} och hör hemma där.</b> Ska de flyttas hem?</p>
          <p className="small">
            {antal(f.resultat, 'resultat', 'resultat')} och {antal(f.filer, 'quizfil', 'quizfiler')} flyttas till {klassNamn(f.tillKlassId)} (samma ämne), och eleverna tas bort ur {klassNamn(f.franKlassId)}.
            {f.dubbletter > 0 ? ` ${antal(f.dubbletter, 'resultat', 'resultat')} finns redan i ${klassNamn(f.tillKlassId)} och tas inte dit en gång till.` : ''}
            {f.utanAmne > 0 ? ` ${antal(f.utanAmne, 'resultat', 'resultat')} hör till ett ämne som saknas i ${klassNamn(f.tillKlassId)} och följer med utan ämnesbyte.` : ''}
            {' '}{klassNamn(f.franKlassId)}:s egna elever och resultat rörs inte. Går att ångra med ↩.
          </p>
          <details><summary className="small">Visa eleverna ({f.par.length})</summary><p className="small muted">{f.par.map((p) => p.namn).sort((a, b) => a.localeCompare(b, 'sv')).join(' · ')}</p></details>
          <div className="quizknappar">
            <button className="btn" onClick={() => flyttaHem(f)}>Ja, flytta hem dem till {klassNamn(f.tillKlassId)}</button>
            <button className="btn sec" onClick={() => avvakta(f)} title="Frågan kommer tillbaka om fler elever hamnar i båda klasserna">Inte nu</button>
          </div>
        </div>
      ))}
      {faSvar.length > 0 && (
        <div className="quizfraga" role="region" aria-label="Quiz med för få svar">
          <p><b>⚠ {antal(faSvar.length, 'importerat quiz har', 'importerade quiz har')} under 30 % av elevernas möjliga svar</b> — troligen felstartade. Ska {faSvar.length === 1 ? 'det' : 'de'} tas bort?</p>
          <ul>
            {faSvar.map(({ fil, andel }) => (
              <li key={fil.id}>
                <b>{fil.prov}</b> <span className="muted">({amneNamn(fil.amneId)} · {kortDag(fil.datum)})</span> — {Math.round(andel.andel * 100)} %: {andel.besvarade} av {andel.mojliga} möjliga svar, {antal(andel.deltog, 'elev', 'elever')}{' '}
                <button className="btn sm" aria-label={`Ta bort ${fil.prov} ${fil.datum ?? ''}`.trim()} onClick={() => kor(() => sparraFil(lasStruktur(), fil.id, idag), `${fil.prov} (${kortDag(fil.datum)}) borttaget — filen är spärrad och laddas inte igen.`)}>Ta bort och spärra filen</button>{' '}
                <button className="btn sec sm" aria-label={`Behåll ${fil.prov} ${fil.datum ?? ''}`.trim()} onClick={() => kor(() => behallFil(lasStruktur(), fil.id), `${fil.prov} (${kortDag(fil.datum)}) behålls.`)}>Behåll</button>
              </li>
            ))}
          </ul>
          {faSvar.length > 1 && (
            <div className="quizknappar">
              <button className="btn" onClick={() => kor(() => { let st = lasStruktur(); for (const x of filerMedFaSvar(st)) st = sparraFil(st, x.fil.id, idag); return st; }, `${faSvar.length} quiz med för få svar borttagna — filerna är spärrade och laddas inte igen.`)}>Ta bort alla {faSvar.length} och spärra filerna</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
