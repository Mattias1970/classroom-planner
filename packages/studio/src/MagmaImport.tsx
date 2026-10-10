/**
 * Del 146 · Magma-prov: import av Magmas resultatexport (xlsx) och visning
 * per elev — vilka uppgifter som gick rätt/fel, andel rätt och omdöme
 * (70 Godkänt · 85 Bra · 95 Utmärkt). Filen tolkas i kernel (magmaprov.ts);
 * här sker bara xlsx-avläsning, förhandsvisning och sparande.
 */
import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  arFilImporterad, importeraResultat, laggTillElev, magmaAnalys, magmaOmdome, magmaProcent, magmaProvnamnUrFilnamn, magmaUppgiftsStatistik, MAGMA_TYP_NAMN, matchaElev,
  nyttId, registreraFil, resultatProcent, taBortAllaMagma, taBortMagmaProv, tolkaMagmaNamn, tolkaMagmaRapport,
  type Amne, type Klass, type MagmaAnalys, type MagmaOmdome, type MagmaRapport, type Resultat, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';
import { MagmaUppgifter } from './MagmaUppgifter.js';

const OMDOME_KLASS: Record<MagmaOmdome, string> = { 'Under godkänt': 'ej', 'Godkänt': 'ok', 'Bra': 'bra', 'Utmärkt': 'utmarkt' };

/** Omdömesbricka: Under godkänt · Godkänt · Bra · Utmärkt. */
export function MagmaOmdomeBricka({ procent }: { procent: number | null }) {
  const o = magmaOmdome(procent);
  if (o === null) return <span className="muted">—</span>;
  return <span className={`st-krav st-magma ${OMDOME_KLASS[o]}`}>{o}</span>;
}

/** ✓ / ✗ / – för en uppgift. */
function Ratt({ ratt }: { ratt: boolean | null }) {
  if (ratt === null) return <span className="muted" title="ej besvarad">–</span>;
  return ratt ? <span className="st-magma-ratt" title="rätt">✓</span> : <span className="st-magma-fel" title="fel">✗</span>;
}

interface MagmaFil {
  filnamn: string;
  prov: string;
  datum: string;
  rapport: MagmaRapport | null;
  fel: string | null;
  redanInne: boolean;
}

export function MagmaImport({ s, klass, amne, kor }: {
  s: Struktur; klass: Klass; amne: Amne | undefined; kor: (fn: () => Struktur, m: string) => void;
}) {
  const [filer, setFiler] = useState<MagmaFil[]>([]);
  const [importeraOm, setImporteraOm] = useState(false);
  const antalElever = s.elever.filter((e) => e.klassId === klass.id).length;
  // Klass utan elever: Magma-filen är den bästa klasslistan som finns — skapa eleverna direkt
  const [skapaElever, setSkapaElever] = useState(antalElever === 0);
  const idag = new Date().toISOString().slice(0, 10);

  const lasFiler = async (lista: FileList | null) => {
    if (lista === null) return;
    const ut: MagmaFil[] = [];
    for (const fil of Array.from(lista)) {
      const prov = magmaProvnamnUrFilnamn(fil.name);
      try {
        const wb = XLSX.read(await fil.arrayBuffer(), { type: 'array' });
        const blad = wb.SheetNames[0];
        const matris = XLSX.utils.sheet_to_json<Array<string | number | null>>(wb.Sheets[blad], { header: 1, raw: true, defval: null });
        const rapport = tolkaMagmaRapport(matris, blad);
        ut.push({ filnamn: fil.name, prov, datum: rapport.datum ?? idag, rapport, fel: null, redanInne: amne !== undefined && arFilImporterad(s, amne.id, fil.name) });
      } catch (e) {
        ut.push({ filnamn: fil.name, prov, datum: idag, rapport: null, fel: e instanceof Error ? e.message : 'kunde inte läsas', redanInne: false });
      }
    }
    setFiler(ut);
  };

  const andra = (i: number, patch: Partial<MagmaFil>) => setFiler(filer.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const matchning = (f: MagmaFil) => {
    const deltagare = f.rapport?.rader.filter((r) => r.deltog) ?? [];
    const omatchade = deltagare.filter((r) => matchaElev(s, klass.id, r.namn) === null).map((r) => r.namn);
    return { deltagare, omatchade, matchade: deltagare.length - omatchade.length };
  };
  const importerbara = filer.filter((f) => f.rapport !== null && f.prov.trim() !== '' && (importeraOm || !f.redanInne) && (matchning(f).matchade > 0 || (skapaElever && matchning(f).omatchade.length > 0)));

  const importera = () => {
    if (amne === undefined) return;
    let sparade = 0; let nyaElever = 0;
    kor(() => {
      let st = lasStruktur();
      for (const f of importerbara) {
        const { deltagare } = matchning(f);
        if (skapaElever) {
          // Elever som saknas i klassen skapas från Magma-namnet (grupp A tills läraren sätter laborationsgrupp)
          for (const r of deltagare) {
            if (matchaElev(st, klass.id, r.namn) === null) { st = laggTillElev(st, { id: nyttId('elev'), klassId: klass.id, namn: r.namn, grupp: 'A' }); nyaElever += 1; }
          }
        }
        const u = importeraResultat(st, {
          klassId: klass.id, amneId: amne.id, kalla: 'magma', prov: f.prov.trim(), datum: f.datum,
          rader: deltagare.map((r) => ({ namn: r.namn, poang: r.poang, maxPoang: r.maxPoang, svar: r.svar })),
        });
        st = registreraFil(u.s, { amneId: amne.id, filnamn: f.filnamn, importerad: new Date().toISOString(), kalla: 'magma', prov: f.prov.trim(), datum: f.datum, traffar: u.traffar });
        sparade += u.traffar;
      }
      return st;
    }, `${importerbara.length} Magma-prov importerade — ${sparade} elevresultat sparade på ${amne.namn}${nyaElever > 0 ? ` · ${nyaElever} nya elever tillagda i ${klass.namn}` : ''}.`);
    setFiler([]);
  };

  return (
    <div className="uppg-kort st-magma-import">
      <b>📗 Magma-prov (xlsx)</b>{' '}
      <small className="muted">Magmas resultatexport: en rad per elev, en kolumn per uppgift med 1 (rätt) eller 0 (fel); tomma rader = eleven gjorde inte provet. Bladnamnet ger datumet, filnamnet provnamnet (går att ändra). Resultaten sparas per elev med rätt/fel per uppgift och andel rätt; omdöme: <b>70–&lt;85 % Godkänt · 85–&lt;95 % Bra · 95–100 % Utmärkt</b>.</small>
      <div className="rad" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
        <input type="file" multiple accept=".xlsx,.xls" aria-label="Magma-filer" onChange={(e) => { void lasFiler(e.target.files); e.target.value = ''; }} />
        <label className="small"><input type="checkbox" checked={importeraOm} onChange={(e) => setImporteraOm(e.target.checked)} /> importera om redan importerade filer</label>
        <label className="small" title="Namn i filen som inte finns bland klassens elever läggs till som nya elever (grupp A)"><input type="checkbox" checked={skapaElever} onChange={(e) => setSkapaElever(e.target.checked)} /> lägg till omatchade namn som nya elever i {klass.namn}</label>
        {amne === undefined && <span className="status warn small">⚠ Välj ämne (Matematik) ovan — Magma-resultat sparas ämnesvis.</span>}
        {antalElever === 0 && <span className="status warn small">⚠ {klass.namn} har inga elever än — med rutan ibockad skapas de från filen vid import.</span>}
      </div>

      {filer.map((f, i) => {
        const m = matchning(f);
        const stat = f.rapport !== null ? magmaUppgiftsStatistik(f.rapport) : [];
        return (
          <div key={f.filnamn} className="st-magma-fil">
            <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span title={f.filnamn}>📄 {f.filnamn}</span>
              {f.fel !== null ? <span className="st-krav ej">{f.fel}</span> : (<>
                <label>Prov:{' '}<input aria-label={`Provnamn för ${f.filnamn}`} value={f.prov} onChange={(e) => andra(i, { prov: e.target.value })} style={{ width: 200 }} /></label>
                <label>Datum:{' '}<input aria-label={`Provdatum för ${f.filnamn}`} type="date" value={f.datum} onChange={(e) => andra(i, { datum: e.target.value })} /></label>
                <span className="small muted">{f.rapport!.uppgifter.length} uppgifter · {m.deltagare.length} deltog · {m.matchade} matchade{m.omatchade.length > 0 ? ` · ⚠ omatchade: ${m.omatchade.join(', ')}` : ''}</span>
                {f.redanInne && <span className="muted small">redan importerad</span>}
                {m.omatchade.length > 0 && skapaElever && <span className="st-krav ok">{m.omatchade.length} nya elever skapas</span>}
              </>)}
            </div>
            {f.rapport !== null && (
              <table className="tbl small st-magma-tabell">
                <thead><tr><th>Elev</th>{f.rapport.uppgifter.map((u) => <th key={u.nr} title={`Uppgift ${u.nr}`}>{u.nr}</th>)}<th>Rätt</th><th>%</th><th>Omdöme</th></tr></thead>
                <tbody>
                  {f.rapport.rader.map((r) => {
                    const elev = matchaElev(s, klass.id, r.namn);
                    return (
                      <tr key={r.namn} className={!r.deltog ? 'muted' : elev === null ? 'st-magma-omatchad' : ''}>
                        <td title={elev === null ? 'ingen elev i klassen matchar namnet' : elev.namn}>{r.namn}{elev === null && r.deltog ? ' ⚠' : ''}</td>
                        {r.deltog
                          ? r.svar.map((sv, j) => <td key={j}><Ratt ratt={sv.ratt} /></td>)
                          : <td colSpan={f.rapport!.uppgifter.length} className="muted small">deltog inte</td>}
                        <td>{r.deltog ? `${r.poang}/${r.maxPoang}` : '—'}</td>
                        <td>{r.procent !== null ? `${Math.round(r.procent)} %` : '—'}</td>
                        <td><MagmaOmdomeBricka procent={r.procent} /></td>
                      </tr>
                    );
                  })}
                  <tr className="st-magma-stat">
                    <td><b>Andel rätt per uppgift</b></td>
                    {stat.map((u) => <td key={u.nr} title={`${u.ratt} rätt · ${u.fel} fel`} className={u.andelRatt !== null && u.andelRatt < 50 ? 'st-magma-svag' : ''}>{u.andelRatt !== null ? `${u.andelRatt}` : '–'}</td>)}
                    <td colSpan={3} className="small muted">% av de som deltog · under 50 % markeras</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {filer.length > 0 && (
        <div className="rad"><span className="spacer" />
          <button className="btn" disabled={amne === undefined || importerbara.length === 0} title={amne === undefined ? 'Välj ämne först' : ''} onClick={importera}>💾 Importera {importerbara.length} Magma-prov</button>
        </div>
      )}

      <MagmaUppgifter s={s} klass={klass} amne={amne} kor={kor} />
      <MagmaAnalysVy s={s} klass={klass} amne={amne} />
      <MagmaSparade s={s} klass={klass} amne={amne} kor={kor} />
    </div>
  );
}

/** Sparade Magma-prov för klassen: välj prov → en rad per elev med ✓/✗ per uppgift, andel rätt och omdöme. */
function MagmaSparade({ s, klass, amne, kor }: { s: Struktur; klass: Klass; amne: Amne | undefined; kor: (fn: () => Struktur, m: string) => void }) {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === klass.id).map((e) => e.id));
  const alla = (s.resultat ?? []).filter((r) => r.kalla === 'magma' && elevIds.has(r.elevId) && (amne === undefined || r.amneId === amne.id));
  // Del 178 · Ett prov per namn (importer med samma namn är kombinerade); typen ur namnkonventionen "Ma 8B Kap 1 Diagnos 1.3 - 1.4"
  const prov = [...new Map(alla.map((r) => [r.prov, { datum: r.datum, prov: r.prov, antal: 0 }])).values()]
    .map((p) => ({ ...p, datum: alla.filter((r) => r.prov === p.prov).map((r) => r.datum).sort().at(-1) ?? p.datum, antal: alla.filter((r) => r.prov === p.prov).length, namn: tolkaMagmaNamn(p.prov) }))
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.prov.localeCompare(b.prov, 'sv'));
  const [valt, setValt] = useState('');
  if (prov.length === 0) return null;
  const nyckel = valt !== '' && prov.some((p) => p.prov === valt) ? valt : prov[0].prov;
  const provnamn = nyckel;
  const valtProv = prov.find((p) => p.prov === provnamn)!;
  const datum = valtProv.datum;
  const rs = alla.filter((r) => r.prov === provnamn);
  const taBortProv = () => {
    if (amne === undefined) return;
    if (!window.confirm(`Ta bort ”${provnamn}” (${rs.length} elevresultat) från ${amne.namn}? Filen kan importeras igen efteråt.`)) return;
    setValt('');
    kor(() => taBortMagmaProv(lasStruktur(), amne.id, provnamn), `${provnamn} borttaget — ${rs.length} elevresultat raderade.`);
  };
  const taBortAlla = () => {
    if (amne === undefined) return;
    if (!window.confirm(`Ta bort SAMTLIGA Magma-resultat i ${klass.namn} · ${amne.namn} (${prov.length} prov, ${alla.length} elevresultat)? Filerna kan importeras igen efteråt.`)) return;
    setValt('');
    kor(() => taBortAllaMagma(lasStruktur(), amne.id), `Alla Magma-resultat i ${amne.namn} borttagna (${alla.length} elevresultat).`);
  };
  const perElev = new Map<string, Resultat>(rs.map((r) => [r.elevId, r]));
  const uppgifter = [...new Set(rs.flatMap((r) => (r.svar ?? []).map((x) => x.fraga)))];
  const elever = s.elever.filter((e) => e.klassId === klass.id).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const procentFor = (r: Resultat) => magmaProcent(r);
  const antal = (o: MagmaOmdome) => rs.filter((r) => magmaOmdome(procentFor(r)) === o).length;
  return (
    <details className="st-magma-sparade" open>
      <summary>📗 Sparade Magma-prov <small className="muted">· {prov.length} prov · resultat per elev</small></summary>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <label>Prov:{' '}
          <select aria-label="Sparat Magma-prov" value={nyckel} onChange={(e) => setValt(e.target.value)}>
            {prov.map((p) => <option key={p.prov} value={p.prov}>{p.datum} · {MAGMA_TYP_NAMN[p.namn.typ]}{p.namn.kapitel !== null ? ` kap ${p.namn.kapitel}` : ''} · {p.prov}</option>)}
          </select></label>
        <span className={`st-typ magma-${valtProv.namn.typ}`} title="Typ ur filnamnet: Diagnos, Exit ticket, Läxförhör eller Screening">{MAGMA_TYP_NAMN[valtProv.namn.typ]}</span>
        <span className="small muted">{datum} · {rs.length} elever · Utmärkt {antal('Utmärkt')} · Bra {antal('Bra')} · Godkänt {antal('Godkänt')} · Under godkänt {antal('Under godkänt')}</span>
        <span className="spacer" />
        {amne !== undefined && <button className="btn sec sm" aria-label={`Ta bort ${provnamn}`} title="Tar bort provets alla elevresultat (alla importdatum) och filposten" onClick={taBortProv}>🗑 Ta bort provet</button>}
        {amne !== undefined && <button className="btn sec sm" aria-label="Ta bort alla Magma-resultat" title="Tar bort samtliga Magma-resultat i ämnet så att filerna kan importeras på nytt" onClick={taBortAlla}>🗑 Ta bort alla Magma-resultat</button>}
      </div>
      <table className="tbl small st-magma-tabell">
        <thead><tr><th>Elev</th>{uppgifter.map((u) => <th key={u} title={u}>{u.replace(/^Uppgift\s*/i, '')}</th>)}<th>Rätt</th><th>%</th><th>Omdöme</th></tr></thead>
        <tbody>{elever.map((e) => {
          const r = perElev.get(e.id);
          if (r === undefined) return <tr key={e.id} className="muted"><td>{e.namn}</td><td colSpan={uppgifter.length + 3} className="small">saknar resultat</td></tr>;
          const svar = new Map((r.svar ?? []).map((x) => [x.fraga, x.ratt]));
          return (
            <tr key={e.id}>
              <td>{e.namn}</td>
              {uppgifter.map((u) => <td key={u}><Ratt ratt={svar.get(u) ?? null} /></td>)}
              <td>{r.poang}/{r.maxPoang}</td>
              <td>{resultatProcent(r) ?? '—'} %</td>
              <td><MagmaOmdomeBricka procent={procentFor(r)} /></td>
            </tr>
          );
        })}</tbody>
      </table>
    </details>
  );
}


// ── Analys: grafer över sparade Magma-prov ────────────────────────────────────

const OMDOMEN: MagmaOmdome[] = ['Utmärkt', 'Bra', 'Godkänt', 'Under godkänt'];
const OMDOME_FARG: Record<MagmaOmdome, string> = { 'Utmärkt': '#6A1B9A', 'Bra': '#1565C0', 'Godkänt': '#2E7D32', 'Under godkänt': '#C62828' };

function stapelFarg(andel: number | null): string {
  if (andel === null) return '#ccc';
  return andel < 50 ? '#C62828' : andel < 70 ? '#EF6C00' : '#2E7D32';
}

/** Stapeldiagram: andel rätt per uppgift för ett prov (delas med DigiExam-importen, Del 150). */
export function UppgiftsStaplar({ uppgifter, etikett = 'Andel rätt per uppgift', fotnot = 'uppgift · % av eleverna som hade rätt' }: {
  uppgifter: Array<{ nr: string; ratt: number; fel: number; andelRatt: number | null }>; etikett?: string; fotnot?: string;
}) {
  const w = Math.max(320, uppgifter.length * 34 + 40); const h = 170; const bas = 130; const topp = 14;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="st-diagram st-magma-diagram" role="img" aria-label={etikett}>
      {[0, 50, 70, 100].map((y) => {
        const yy = bas - ((bas - topp) * y) / 100;
        return <g key={y}><line x1={30} x2={w - 4} y1={yy} y2={yy} stroke={y === 50 ? '#C62828' : y === 70 ? '#EF6C00' : '#e0e0e0'} strokeDasharray={y === 50 || y === 70 ? '3 3' : undefined} /><text x={26} y={yy + 3} fontSize={9} textAnchor="end" fill="#666">{y}</text></g>;
      })}
      {uppgifter.map((u, i) => {
        const x = 34 + i * 34; const andel = u.andelRatt ?? 0; const hh = ((bas - topp) * andel) / 100;
        return (
          <g key={u.nr}>
            <title>{`Uppgift ${u.nr}: ${u.andelRatt ?? '–'} % rätt (${u.ratt} rätt · ${u.fel} fel)`}</title>
            <rect x={x} y={bas - hh} width={24} height={hh} rx={2} fill={stapelFarg(u.andelRatt)} />
            <text x={x + 12} y={bas - hh - 3} fontSize={9} textAnchor="middle" fill="#333">{u.andelRatt ?? '–'}</text>
            <text x={x + 12} y={bas + 12} fontSize={10} textAnchor="middle" fill="#333" fontWeight={u.andelRatt !== null && u.andelRatt < 50 ? 800 : 400}>{u.nr}</text>
          </g>
        );
      })}
      <text x={w / 2} y={h - 2} fontSize={9} textAnchor="middle" fill="#666">{fotnot}</text>
    </svg>
  );
}

/** Staplad rad: hur många elever som fick varje omdöme. */
function OmdomesRemsa({ fordelning, antal }: { fordelning: Record<MagmaOmdome, number>; antal: number }) {
  if (antal === 0) return null;
  return (
    <div className="st-magma-remsa" role="img" aria-label="Omdömesfördelning">
      {OMDOMEN.filter((o) => fordelning[o] > 0).map((o) => (
        <span key={o} className="st-magma-remsa-del" style={{ width: `${(fordelning[o] / antal) * 100}%`, background: OMDOME_FARG[o] }} title={`${o}: ${fordelning[o]} elever (${Math.round((fordelning[o] / antal) * 100)} %)`}>
          {fordelning[o]}
        </span>
      ))}
    </div>
  );
}

/** Linjediagram: klassens medel (tjock) och varje elev (tunn) över proven. */
function UtvecklingsLinjer({ analys, markeradElev }: { analys: MagmaAnalys; markeradElev: string | null }) {
  const n = analys.prov.length;
  const w = 640; const h = 220; const v = 36; const hg = 12; const topp = 14; const bas = 180;
  const x = (i: number) => (n === 1 ? (w + v - hg) / 2 : v + ((w - v - hg) * i) / (n - 1));
  const y = (p: number) => bas - ((bas - topp) * p) / 100;
  const linje = (serie: Array<number | null>) => {
    const punkter = serie.map((p, i) => (p === null ? null : `${x(i)},${y(p)}`)).filter((q): q is string => q !== null);
    return punkter.join(' ');
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="st-diagram st-magma-diagram" role="img" aria-label="Utveckling över Magma-proven">
      {[0, 70, 85, 95, 100].map((p) => <g key={p}><line x1={v} x2={w - hg} y1={y(p)} y2={y(p)} stroke={p === 70 ? '#2E7D32' : p === 85 ? '#1565C0' : p === 95 ? '#6A1B9A' : '#e0e0e0'} strokeDasharray={p === 70 || p === 85 || p === 95 ? '3 3' : undefined} /><text x={v - 4} y={y(p) + 3} fontSize={9} textAnchor="end" fill="#666">{p}</text></g>)}
      {analys.elever.map((e) => {
        const pts = linje(e.procent); if (pts === '') return null;
        const mark = e.elevId === markeradElev;
        return <polyline key={e.elevId} points={pts} fill="none" stroke={mark ? '#C62828' : '#9e9e9e'} strokeWidth={mark ? 2.5 : 1} opacity={mark ? 1 : 0.45}><title>{e.namn}</title></polyline>;
      })}
      <polyline points={linje(analys.prov.map((p) => p.medel))} fill="none" stroke="#1A2A6B" strokeWidth={3}><title>Klassens medel</title></polyline>
      {analys.prov.map((p, i) => (
        <g key={`${p.datum}|${p.prov}`}>
          {p.medel !== null && <circle cx={x(i)} cy={y(p.medel)} r={4} fill="#1A2A6B"><title>{`${p.prov} (${p.datum}): medel ${p.medel} %`}</title></circle>}
          <text x={x(i)} y={h - 22} fontSize={9} textAnchor="middle" fill="#333">{p.prov.length > 14 ? `${p.prov.slice(0, 13)}…` : p.prov}</text>
          <text x={x(i)} y={h - 11} fontSize={8} textAnchor="middle" fill="#666">{p.datum}</text>
        </g>
      ))}
    </svg>
  );
}

/** Analysrutan: per prov (staplar + omdömesremsa + svaga uppgifter) och per elev (utveckling, trend). */
function MagmaAnalysVy({ s, klass, amne }: { s: Struktur; klass: Klass; amne: Amne | undefined }) {
  const analys = magmaAnalys(s, klass.id, amne?.id);
  const [valtProv, setValtProv] = useState('');
  const [markerad, setMarkerad] = useState<string | null>(null);
  if (analys.prov.length === 0) return null;
  const nyckel = valtProv !== '' && analys.prov.some((p) => `${p.datum}|${p.prov}` === valtProv) ? valtProv : `${analys.prov[analys.prov.length - 1].datum}|${analys.prov[analys.prov.length - 1].prov}`;
  const prov = analys.prov.find((p) => `${p.datum}|${p.prov}` === nyckel)!;
  const medElev = analys.elever.filter((e) => e.senaste !== null);
  const trendPil = (t: number | null) => (t === null ? <span className="muted">—</span> : t > 0 ? <span className="st-magma-ratt">▲ {t}</span> : t < 0 ? <span className="st-magma-fel">▼ {Math.abs(t)}</span> : <span className="muted">= 0</span>);
  return (
    <details className="st-magma-analys" open>
      <summary>📈 Magma-analys <small className="muted">· {analys.prov.length} prov · {klass.namn}{amne !== undefined ? ` · ${amne.namn}` : ''}</small></summary>

      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
        <label>Prov:{' '}
          <select aria-label="Analyserat Magma-prov" value={nyckel} onChange={(e) => setValtProv(e.target.value)}>
            {analys.prov.map((p) => <option key={`${p.datum}|${p.prov}`} value={`${p.datum}|${p.prov}`}>{p.datum} · {p.prov}</option>)}
          </select></label>
        <span className="small"><b>Medel {prov.medel ?? '—'} %</b> · {prov.antal} elever</span>
        <OmdomesRemsa fordelning={prov.fordelning} antal={prov.antal} />
        <span className="small muted">{OMDOMEN.map((o) => `${o} ${prov.fordelning[o]}`).join(' · ')}</span>
      </div>
      <p className="small" style={{ margin: '6px 0 0' }}>
        <b>Uppgifter att ta upp igen</b> (under 50 % rätt): {prov.svaga.length > 0 ? prov.svaga.map((nr) => <span key={nr} className="st-krav ej">{nr}</span>) : <span className="muted">inga — alla uppgifter klarades av minst hälften</span>}
      </p>
      <UppgiftsStaplar uppgifter={prov.uppgifter} />

      <h4 style={{ margin: '10px 0 4px' }}>Utveckling över proven <small className="muted">— tjock linje = klassens medel, tunna = elever (klicka på en elev i tabellen för att lyfta fram hen)</small></h4>
      <UtvecklingsLinjer analys={analys} markeradElev={markerad} />
      <table className="tbl small st-magma-tabell">
        <thead><tr><th>Elev</th>{analys.prov.map((p) => <th key={`${p.datum}|${p.prov}`} title={`${p.prov} (${p.datum})`}>{p.prov.length > 10 ? `${p.prov.slice(0, 9)}…` : p.prov}</th>)}<th>Senaste</th><th>Trend</th><th>Omdöme</th></tr></thead>
        <tbody>{medElev.map((e) => (
          <tr key={e.elevId} className={e.elevId === markerad ? 'st-magma-markerad' : ''} onClick={() => setMarkerad(e.elevId === markerad ? null : e.elevId)} style={{ cursor: 'pointer' }}>
            <td>{e.namn}</td>
            {e.procent.map((p, i) => <td key={i} style={p !== null ? { color: OMDOME_FARG[magmaOmdome(p)!] } : undefined}>{p !== null ? `${Math.round(p)} %` : <span className="muted">—</span>}</td>)}
            <td><b>{e.senaste !== null ? `${Math.round(e.senaste)} %` : '—'}</b></td>
            <td>{trendPil(e.trend)}</td>
            <td><MagmaOmdomeBricka procent={e.senaste} /></td>
          </tr>
        ))}</tbody>
      </table>
      {analys.elever.length > medElev.length && <p className="small muted">{analys.elever.length - medElev.length} elever saknar Magma-resultat.</p>}
    </details>
  );
}
