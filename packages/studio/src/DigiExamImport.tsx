/**
 * Del 150 · DigiExam-prov: import av DigiExams resultatexport (xlsx, bladet
 * "Grades") och visning per elev — poäng per fråga, totalpoäng och procent.
 * DigiExam-prov är något annat än Magma-prov och Socrative-test: egen tolkare
 * (kernel digiexam.ts), egen källa ('digiexam'), inget fast procentkrav.
 * Eleven kopplas via e-posten i filen (Elev.epost) och annars via namnet;
 * här sker bara xlsx-avläsning, förhandsvisning och sparande.
 */
import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  arFilImporterad, digiexamAnalys, digiexamDatumUrFilnamn, digiexamFrageStatistik, digiexamProvnamnUrFilnamn, digiexamSvar, importeraResultat,
  laggTillElev, matchaElev, nyttId, registreraFil, resultatProcent, tolkaDigiExamRapport, uppdateraElev,
  type Amne, type DigiExamElevRad, type DigiExamRapport, type Klass, type Resultat, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';
import { UppgiftsStaplar } from './MagmaImport.js';

interface DigiExamFil {
  filnamn: string;
  prov: string;
  datum: string;
  /** Maxpoäng för provet — härledd ur filen, ändras av läraren när provet har fler poäng än någon fick. */
  maxPoang: string;
  rapport: DigiExamRapport | null;
  fel: string | null;
  redanInne: boolean;
}

/** Poängcell: full poäng grön, delpoäng orange, noll röd, tom = ej besvarad. */
function Poang({ p, max }: { p: number | null; max: number }) {
  if (p === null) return <span className="muted" title="ej besvarad">–</span>;
  const klass = p >= max ? 'st-de-full' : p > 0 ? 'st-de-del' : 'st-de-noll';
  return <span className={klass} title={`${String(p).replace('.', ',')} av ${max}`}>{String(p).replace('.', ',')}</span>;
}

/** Elev ur rostern för en filrad: e-posten vinner, annars namnet. */
function elevFor(s: Struktur, klassId: string, r: DigiExamElevRad) {
  return (r.epost !== '' ? matchaElev(s, klassId, r.epost) : null) ?? matchaElev(s, klassId, r.namn);
}

export function DigiExamImport({ s, klass, amne, kor }: {
  s: Struktur; klass: Klass; amne: Amne | undefined; kor: (fn: () => Struktur, m: string) => void;
}) {
  const [filer, setFiler] = useState<DigiExamFil[]>([]);
  const [importeraOm, setImporteraOm] = useState(false);
  const [medNollrader, setMedNollrader] = useState(false);
  const [sparaEpost, setSparaEpost] = useState(true);
  const antalElever = s.elever.filter((e) => e.klassId === klass.id).length;
  const [skapaElever, setSkapaElever] = useState(antalElever === 0);
  const idag = new Date().toISOString().slice(0, 10);

  const lasFiler = async (lista: FileList | null) => {
    if (lista === null) return;
    const ut: DigiExamFil[] = [];
    for (const fil of Array.from(lista)) {
      const prov = digiexamProvnamnUrFilnamn(fil.name);
      const datum = digiexamDatumUrFilnamn(fil.name) ?? idag;
      try {
        const wb = XLSX.read(await fil.arrayBuffer(), { type: 'array' });
        const blad = wb.SheetNames.find((n) => /grades|resultat|betyg/i.test(n)) ?? wb.SheetNames[0];
        const matris = XLSX.utils.sheet_to_json<Array<string | number | null>>(wb.Sheets[blad], { header: 1, raw: true, defval: null });
        const rapport = tolkaDigiExamRapport(matris);
        ut.push({ filnamn: fil.name, prov, datum, maxPoang: String(rapport.maxPoang), rapport, fel: null, redanInne: amne !== undefined && arFilImporterad(s, amne.id, fil.name) });
      } catch (e) {
        ut.push({ filnamn: fil.name, prov, datum, maxPoang: '', rapport: null, fel: e instanceof Error ? e.message : 'kunde inte läsas', redanInne: false });
      }
    }
    setFiler(ut);
  };

  const andra = (i: number, patch: Partial<DigiExamFil>) => setFiler(filer.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const maxFor = (f: DigiExamFil) => { const n = Number(f.maxPoang.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : (f.rapport?.maxPoang ?? 0); };
  const matchning = (f: DigiExamFil) => {
    const deltagare = f.rapport?.rader.filter((r) => medNollrader || !r.nollrad) ?? [];
    const omatchade = deltagare.filter((r) => elevFor(s, klass.id, r) === null).map((r) => r.namn);
    return { deltagare, omatchade, matchade: deltagare.length - omatchade.length };
  };
  const importerbara = filer.filter((f) => f.rapport !== null && f.prov.trim() !== '' && maxFor(f) > 0 && (importeraOm || !f.redanInne) && (matchning(f).matchade > 0 || (skapaElever && matchning(f).omatchade.length > 0)));

  const importera = () => {
    if (amne === undefined) return;
    let sparade = 0; let nyaElever = 0; let eposter = 0;
    kor(() => {
      let st = lasStruktur();
      for (const f of importerbara) {
        const { deltagare } = matchning(f);
        for (const r of deltagare) {
          const elev = elevFor(st, klass.id, r);
          if (elev === null) {
            // Elever som saknas i klassen skapas från filen, med e-posten så nästa import träffar exakt (grupp A tills läraren sätter laborationsgrupp)
            if (skapaElever) { st = laggTillElev(st, { id: nyttId('elev'), klassId: klass.id, namn: r.namn, grupp: 'A', ...(r.epost !== '' ? { epost: r.epost } : {}) }); nyaElever += 1; }
          } else if (sparaEpost && r.epost !== '' && (elev.epost ?? '') === '') {
            st = uppdateraElev(st, elev.id, { epost: r.epost }); eposter += 1;
          }
        }
        const u = importeraResultat(st, {
          klassId: klass.id, amneId: amne.id, kalla: 'digiexam', prov: f.prov.trim(), datum: f.datum,
          rader: deltagare.map((r) => ({ namn: r.namn, epost: r.epost, poang: r.poang, maxPoang: maxFor(f), svar: digiexamSvar(f.rapport!, r) })),
        });
        st = registreraFil(u.s, { amneId: amne.id, filnamn: f.filnamn, importerad: new Date().toISOString(), kalla: 'digiexam', prov: f.prov.trim(), datum: f.datum, traffar: u.traffar });
        sparade += u.traffar;
      }
      return st;
    }, `${importerbara.length} DigiExam-prov importerade — ${sparade} elevresultat sparade på ${amne.namn}${nyaElever > 0 ? ` · ${nyaElever} nya elever tillagda i ${klass.namn}` : ''}${eposter > 0 ? ` · e-post sparad på ${eposter} elever` : ''}.`);
    setFiler([]);
  };

  return (
    <div className="uppg-kort st-magma-import st-de-import">
      <b>📘 DigiExam-prov (xlsx)</b>{' '}
      <small className="muted">DigiExams resultatexport (bladet <i>Grades</i>): en rad per elev med förnamn, efternamn, e-post, totalpoäng och poäng per fråga. Eleven kopplas via e-posten, annars via namnet. Filen saknar maxpoäng — den härleds som högsta poäng någon fick per fråga och kan ändras nedan. Datumet i filnamnet är <b>exportens</b> datum: ändra till provdatumet. DigiExam-prov har inget fast procentkrav — de bedöms per förmåga.</small>
      <div className="rad" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
        <input type="file" multiple accept=".xlsx,.xls" aria-label="DigiExam-filer" onChange={(e) => { void lasFiler(e.target.files); e.target.value = ''; }} />
        <label className="small"><input type="checkbox" checked={importeraOm} onChange={(e) => setImporteraOm(e.target.checked)} /> importera om redan importerade filer</label>
        <label className="small" title="Elever med 0 poäng på alla frågor har troligen inte genomfört provet"><input type="checkbox" checked={medNollrader} onChange={(e) => setMedNollrader(e.target.checked)} /> ta med elever med 0 poäng</label>
        <label className="small" title="Elever som matchas via namnet får filens e-post sparad, så nästa import träffar exakt"><input type="checkbox" checked={sparaEpost} onChange={(e) => setSparaEpost(e.target.checked)} /> spara e-post på matchade elever</label>
        <label className="small" title="Namn i filen som inte finns bland klassens elever läggs till som nya elever (grupp A)"><input type="checkbox" checked={skapaElever} onChange={(e) => setSkapaElever(e.target.checked)} /> lägg till omatchade som nya elever i {klass.namn}</label>
        {amne === undefined && <span className="status warn small">⚠ Välj ämne ovan — DigiExam-resultat sparas ämnesvis.</span>}
        {antalElever === 0 && <span className="status warn small">⚠ {klass.namn} har inga elever än — med rutan ibockad skapas de från filen vid import.</span>}
      </div>

      {filer.map((f, i) => {
        const m = matchning(f);
        const stat = f.rapport !== null ? digiexamFrageStatistik(f.rapport, medNollrader) : [];
        const nollrader = f.rapport?.rader.filter((r) => r.nollrad).length ?? 0;
        return (
          <div key={f.filnamn} className="st-magma-fil">
            <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span title={f.filnamn}>📄 {f.filnamn}</span>
              {f.fel !== null ? <span className="st-krav ej">{f.fel}</span> : (<>
                <label>Prov:{' '}<input aria-label={`Provnamn för ${f.filnamn}`} value={f.prov} onChange={(e) => andra(i, { prov: e.target.value })} style={{ width: 200 }} /></label>
                <label>Provdatum:{' '}<input aria-label={`Provdatum för ${f.filnamn}`} type="date" value={f.datum} onChange={(e) => andra(i, { datum: e.target.value })} /></label>
                <label>Max:{' '}<input aria-label={`Maxpoäng för ${f.filnamn}`} value={f.maxPoang} onChange={(e) => andra(i, { maxPoang: e.target.value })} style={{ width: 50 }} /></label>
                <span className="small muted">{f.rapport!.fragor.length} frågor · {m.deltagare.length} elever · {m.matchade} matchade{m.omatchade.length > 0 ? ` · ⚠ omatchade: ${m.omatchade.join(', ')}` : ''}{nollrader > 0 && !medNollrader ? ` · ${nollrader} med 0 poäng hoppas över` : ''}</span>
                {f.rapport!.avvikandeSumma && <span className="status warn small">⚠ Final Grade skiljer sig från summan av frågepoängen för någon elev — filens totalpoäng används.</span>}
                {f.redanInne && <span className="muted small">redan importerad</span>}
                {m.omatchade.length > 0 && skapaElever && <span className="st-krav ok">{m.omatchade.length} nya elever skapas</span>}
              </>)}
            </div>
            {f.rapport !== null && (
              <table className="tbl small st-magma-tabell">
                <thead><tr><th>Elev</th>{f.rapport.fragor.map((q) => <th key={q.nr} title={`${q.rubrik} · max ${q.max}`}>{q.nr}</th>)}<th>Poäng</th><th>%</th></tr></thead>
                <tbody>
                  {f.rapport.rader.map((r) => {
                    const elev = elevFor(s, klass.id, r);
                    const hoppas = r.nollrad && !medNollrader;
                    const procent = maxFor(f) > 0 ? Math.round((r.poang / maxFor(f)) * 100) : null;
                    return (
                      <tr key={r.epost !== '' ? r.epost : r.namn} className={hoppas ? 'muted' : elev === null ? 'st-magma-omatchad' : ''}>
                        <td title={elev === null ? 'ingen elev i klassen matchar e-posten eller namnet' : `${elev.namn}${r.epost !== '' ? ` · ${r.epost}` : ''}`}>{r.namn}{elev === null && !hoppas ? ' ⚠' : ''}</td>
                        {hoppas
                          ? <td colSpan={f.rapport!.fragor.length} className="muted small">0 poäng — hoppas över (ej genomfört?)</td>
                          : f.rapport!.fragor.map((q, j) => <td key={q.nr}><Poang p={r.fragePoang[j]} max={q.max} /></td>)}
                        <td>{String(r.poang).replace('.', ',')}/{maxFor(f)}</td>
                        <td>{hoppas || procent === null ? '—' : `${procent} %`}</td>
                      </tr>
                    );
                  })}
                  <tr className="st-magma-stat">
                    <td><b>Medel per fråga</b></td>
                    {stat.map((q) => <td key={q.nr} title={`${q.full} full poäng · ${q.del} delpoäng · ${q.noll} noll`} className={q.medel !== null && q.medel < 50 ? 'st-magma-svag' : ''}>{q.medel !== null ? `${q.medel}` : '–'}</td>)}
                    <td colSpan={2} className="small muted">% av frågans max · under 50 % markeras</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {filer.length > 0 && (
        <div className="rad"><span className="spacer" />
          <button className="btn" disabled={amne === undefined || importerbara.length === 0} title={amne === undefined ? 'Välj ämne först' : ''} onClick={importera}>💾 Importera {importerbara.length} DigiExam-prov</button>
        </div>
      )}

      <DigiExamAnalysVy s={s} klass={klass} amne={amne} />
      <DigiExamSparade s={s} klass={klass} amne={amne} />
    </div>
  );
}

/** Analys över sparade DigiExam-prov: per prov medel och andel full poäng per fråga; per elev procent per prov. */
function DigiExamAnalysVy({ s, klass, amne }: { s: Struktur; klass: Klass; amne: Amne | undefined }) {
  const analys = digiexamAnalys(s, klass.id, amne?.id);
  const [valtProv, setValtProv] = useState('');
  if (analys.prov.length === 0) return null;
  const sista = analys.prov[analys.prov.length - 1];
  const nyckel = valtProv !== '' && analys.prov.some((p) => `${p.datum}|${p.prov}` === valtProv) ? valtProv : `${sista.datum}|${sista.prov}`;
  const prov = analys.prov.find((p) => `${p.datum}|${p.prov}` === nyckel)!;
  const medElev = analys.elever.filter((e) => e.senaste !== null);
  return (
    <details className="st-magma-analys st-de-analys" open>
      <summary>📈 DigiExam-analys <small className="muted">· {analys.prov.length} prov · {klass.namn}{amne !== undefined ? ` · ${amne.namn}` : ''}</small></summary>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
        <label>Prov:{' '}
          <select aria-label="Analyserat DigiExam-prov" value={nyckel} onChange={(e) => setValtProv(e.target.value)}>
            {analys.prov.map((p) => <option key={`${p.datum}|${p.prov}`} value={`${p.datum}|${p.prov}`}>{p.datum} · {p.prov}</option>)}
          </select></label>
        <span className="small"><b>Medel {prov.medel ?? '—'} %</b> · {prov.antal} elever</span>
      </div>
      <p className="small" style={{ margin: '6px 0 0' }}>
        <b>Frågor att ta upp igen</b> (under hälften fick full poäng): {prov.svaga.length > 0 ? prov.svaga.map((nr) => <span key={nr} className="st-krav ej">{nr}</span>) : <span className="muted">inga — minst hälften fick full poäng på varje fråga</span>}
      </p>
      {prov.fragor.length > 0 && <UppgiftsStaplar uppgifter={prov.fragor.map((q) => ({ nr: q.nr, ratt: q.full, fel: q.ejFull, andelRatt: q.andelFull }))} etikett="Andel full poäng per fråga" fotnot="fråga · % av eleverna som fick full poäng" />}
      <table className="tbl small st-magma-tabell">
        <thead><tr><th>Elev</th>{analys.prov.map((p) => <th key={`${p.datum}|${p.prov}`} title={`${p.prov} (${p.datum})`}>{p.prov.length > 12 ? `${p.prov.slice(0, 11)}…` : p.prov}</th>)}<th>Senaste</th></tr></thead>
        <tbody>{medElev.map((e) => (
          <tr key={e.elevId}>
            <td>{e.namn}</td>
            {e.procent.map((p, i) => <td key={i}>{p !== null ? `${Math.round(p)} %` : <span className="muted">—</span>}</td>)}
            <td><b>{e.senaste !== null ? `${Math.round(e.senaste)} %` : '—'}</b></td>
          </tr>
        ))}</tbody>
      </table>
      {analys.elever.length > medElev.length && <p className="small muted">{analys.elever.length - medElev.length} elever saknar DigiExam-resultat.</p>}
    </details>
  );
}

/** Sparade DigiExam-prov för klassen: välj prov → en rad per elev med poäng per fråga, totalpoäng och procent. */
function DigiExamSparade({ s, klass, amne }: { s: Struktur; klass: Klass; amne: Amne | undefined }) {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === klass.id).map((e) => e.id));
  const alla = (s.resultat ?? []).filter((r) => r.kalla === 'digiexam' && elevIds.has(r.elevId) && (amne === undefined || r.amneId === amne.id));
  const prov = [...new Map(alla.map((r) => [`${r.datum}|${r.prov}`, { datum: r.datum, prov: r.prov }])).values()].sort((a, b) => b.datum.localeCompare(a.datum) || a.prov.localeCompare(b.prov, 'sv'));
  const [valt, setValt] = useState('');
  if (prov.length === 0) return null;
  const nyckel = valt !== '' && prov.some((p) => `${p.datum}|${p.prov}` === valt) ? valt : `${prov[0].datum}|${prov[0].prov}`;
  const [datum, provnamn] = nyckel.split('|');
  const rs = alla.filter((r) => r.datum === datum && r.prov === provnamn);
  const perElev = new Map<string, Resultat>(rs.map((r) => [r.elevId, r]));
  const fragor = [...new Set(rs.flatMap((r) => (r.svar ?? []).map((x) => x.fraga)))];
  const elever = s.elever.filter((e) => e.klassId === klass.id).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const procenten = rs.map(resultatProcent).filter((p): p is number => p !== null);
  const medel = procenten.length > 0 ? Math.round(procenten.reduce((a, b) => a + b, 0) / procenten.length) : null;
  return (
    <details className="st-magma-sparade st-de-sparade" open>
      <summary>📘 Sparade DigiExam-prov <small className="muted">· {prov.length} prov · resultat per elev</small></summary>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <label>Prov:{' '}
          <select aria-label="Sparat DigiExam-prov" value={nyckel} onChange={(e) => setValt(e.target.value)}>
            {prov.map((p) => <option key={`${p.datum}|${p.prov}`} value={`${p.datum}|${p.prov}`}>{p.datum} · {p.prov}</option>)}
          </select></label>
        <span className="small muted">{rs.length} elever · medel {medel ?? '—'} %</span>
      </div>
      <table className="tbl small st-magma-tabell">
        <thead><tr><th>Elev</th>{fragor.map((q) => <th key={q} title={q}>{q.replace(/^Fråga\s*/i, '')}</th>)}<th>Poäng</th><th>%</th></tr></thead>
        <tbody>{elever.map((e) => {
          const r = perElev.get(e.id);
          if (r === undefined) return <tr key={e.id} className="muted"><td>{e.namn}</td><td colSpan={fragor.length + 2} className="small">saknar resultat</td></tr>;
          const svar = new Map((r.svar ?? []).map((x) => [x.fraga, x]));
          return (
            <tr key={e.id}>
              <td>{e.namn}</td>
              {fragor.map((q) => { const x = svar.get(q); return <td key={q}>{x === undefined || x.svar === '' ? <span className="muted">–</span> : <span className={x.ratt === true ? 'st-de-full' : Number(x.svar.replace(',', '.')) > 0 ? 'st-de-del' : 'st-de-noll'}>{x.svar}</span>}</td>; })}
              <td>{String(r.poang).replace('.', ',')}/{r.maxPoang}</td>
              <td>{resultatProcent(r) ?? '—'} %</td>
            </tr>
          );
        })}</tbody>
      </table>
    </details>
  );
}
