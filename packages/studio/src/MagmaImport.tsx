/**
 * Del 146 · Magma-prov: import av Magmas resultatexport (xlsx) och visning
 * per elev — vilka uppgifter som gick rätt/fel, andel rätt och omdöme
 * (70 Godkänt · 85 Bra · 95 Utmärkt). Filen tolkas i kernel (magmaprov.ts);
 * här sker bara xlsx-avläsning, förhandsvisning och sparande.
 */
import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  arFilImporterad, importeraResultat, magmaOmdome, magmaProvnamnUrFilnamn, magmaUppgiftsStatistik, matchaElev,
  registreraFil, resultatProcent, tolkaMagmaRapport,
  type Amne, type Klass, type MagmaOmdome, type MagmaRapport, type Resultat, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

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
  const importerbara = filer.filter((f) => f.rapport !== null && f.prov.trim() !== '' && (importeraOm || !f.redanInne) && matchning(f).matchade > 0);

  const importera = () => {
    if (amne === undefined) return;
    let sparade = 0;
    kor(() => {
      let st = lasStruktur();
      for (const f of importerbara) {
        const { deltagare, matchade } = matchning(f);
        st = importeraResultat(st, {
          klassId: klass.id, amneId: amne.id, kalla: 'magma', prov: f.prov.trim(), datum: f.datum,
          rader: deltagare.map((r) => ({ namn: r.namn, poang: r.poang, maxPoang: r.maxPoang, svar: r.svar })),
        }).s;
        st = registreraFil(st, { amneId: amne.id, filnamn: f.filnamn, importerad: new Date().toISOString(), kalla: 'magma', prov: f.prov.trim(), datum: f.datum, traffar: matchade });
        sparade += matchade;
      }
      return st;
    }, `${importerbara.length} Magma-prov importerade — ${sparade} elevresultat sparade på ${amne.namn}.`);
    setFiler([]);
  };

  return (
    <div className="uppg-kort st-magma-import">
      <b>📗 Magma-prov (xlsx)</b>{' '}
      <small className="muted">Magmas resultatexport: en rad per elev, en kolumn per uppgift med 1 (rätt) eller 0 (fel); tomma rader = eleven gjorde inte provet. Bladnamnet ger datumet, filnamnet provnamnet (går att ändra). Resultaten sparas per elev med rätt/fel per uppgift och andel rätt; omdöme: <b>70–&lt;85 % Godkänt · 85–&lt;95 % Bra · 95–100 % Utmärkt</b>.</small>
      <div className="rad" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
        <input type="file" multiple accept=".xlsx,.xls" aria-label="Magma-filer" onChange={(e) => { void lasFiler(e.target.files); e.target.value = ''; }} />
        <label className="small"><input type="checkbox" checked={importeraOm} onChange={(e) => setImporteraOm(e.target.checked)} /> importera om redan importerade filer</label>
        {amne === undefined && <span className="status warn small">⚠ Välj ämne (Matematik) ovan — Magma-resultat sparas ämnesvis.</span>}
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

      <MagmaSparade s={s} klass={klass} amne={amne} />
    </div>
  );
}

/** Sparade Magma-prov för klassen: välj prov → en rad per elev med ✓/✗ per uppgift, andel rätt och omdöme. */
function MagmaSparade({ s, klass, amne }: { s: Struktur; klass: Klass; amne: Amne | undefined }) {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === klass.id).map((e) => e.id));
  const alla = (s.resultat ?? []).filter((r) => r.kalla === 'magma' && elevIds.has(r.elevId) && (amne === undefined || r.amneId === amne.id));
  const prov = [...new Map(alla.map((r) => [`${r.datum}|${r.prov}`, { datum: r.datum, prov: r.prov }])).values()].sort((a, b) => b.datum.localeCompare(a.datum) || a.prov.localeCompare(b.prov, 'sv'));
  const [valt, setValt] = useState('');
  if (prov.length === 0) return null;
  const nyckel = valt !== '' && prov.some((p) => `${p.datum}|${p.prov}` === valt) ? valt : `${prov[0].datum}|${prov[0].prov}`;
  const [datum, provnamn] = nyckel.split('|');
  const rs = alla.filter((r) => r.datum === datum && r.prov === provnamn);
  const perElev = new Map<string, Resultat>(rs.map((r) => [r.elevId, r]));
  const uppgifter = [...new Set(rs.flatMap((r) => (r.svar ?? []).map((x) => x.fraga)))];
  const elever = s.elever.filter((e) => e.klassId === klass.id).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const procentFor = (r: Resultat) => (r.maxPoang > 0 ? (r.poang / r.maxPoang) * 100 : null);
  const antal = (o: MagmaOmdome) => rs.filter((r) => magmaOmdome(procentFor(r)) === o).length;
  return (
    <details className="st-magma-sparade" open>
      <summary>📗 Sparade Magma-prov <small className="muted">· {prov.length} prov · resultat per elev</small></summary>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <label>Prov:{' '}
          <select aria-label="Sparat Magma-prov" value={nyckel} onChange={(e) => setValt(e.target.value)}>
            {prov.map((p) => <option key={`${p.datum}|${p.prov}`} value={`${p.datum}|${p.prov}`}>{p.datum} · {p.prov}</option>)}
          </select></label>
        <span className="small muted">{rs.length} elever · Utmärkt {antal('Utmärkt')} · Bra {antal('Bra')} · Godkänt {antal('Godkänt')} · Under godkänt {antal('Under godkänt')}</span>
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
