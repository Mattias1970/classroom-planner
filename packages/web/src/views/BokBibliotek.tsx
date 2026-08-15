/**
 * Bokbiblioteket (del 12). Böcker delas in i ämnen och filtreras på
 * årskurs. Datakällans bok visas alltid; egna böcker importeras som JSON
 * (producerad av bokimport-prompten ur fotograferade boksidor) och lagras
 * lokalt — datakällan muteras aldrig. Välj en bok för att se innehållet
 * som lektioner per kapitel.
 */
import { useMemo, useState } from 'react';
import {
  STANDARD_AMNEN, filterBocker, raknaLektioner, validateBokImport,
  type BookFile, type LessonRecord, type LokalBok,
} from '@planner/core';
import { deleteLokalBok, getLokalaBocker, saveLokalBok, type LoadedLibrary } from '../state/store.js';

interface BokRad { bok: BookFile; lektioner: Record<number, LessonRecord[]>; kalla: 'datakalla' | 'egen'; }

function datakallansBok(lib: LoadedLibrary): BokRad {
  const meta = lib.subject.meta;
  return {
    kalla: 'datakalla',
    lektioner: lib.lessons,
    bok: {
      id: '__datakalla__',
      titel: meta.lärobok.split(',')[0] ?? meta.lärobok,
      förlag: meta.lärobok.split(',').slice(1).join(',').trim(),
      ämne: meta.ämne,
      årskurs: meta.årskurs,
      kapitelMeta: lib.subject.kapitelMeta,
    },
  };
}

export function BokBibliotek(props: { lib: LoadedLibrary; onChange: () => void }) {
  const { lib, onChange } = props;
  const [tick, bump] = useState(0);
  const [amne, setAmne] = useState<string | null>(null);
  const [arskurs, setArskurs] = useState<number | null>(null);
  const [vald, setVald] = useState<string | null>(null);
  const [valdKap, setValdKap] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const alla = useMemo<BokRad[]>(() => [
    datakallansBok(lib),
    ...getLokalaBocker().map((b: LokalBok) => ({ ...b, kalla: 'egen' as const })),
  ], [lib, tick]);

  const amnen = useMemo(() => {
    const iBruk = new Set(alla.map((b) => b.bok.ämne));
    return [...STANDARD_AMNEN.filter((a) => iBruk.has(a)), ...[...iBruk].filter((a) => !STANDARD_AMNEN.includes(a)).sort((x, y) => x.localeCompare(y, 'sv'))];
  }, [alla]);
  const arskurser = useMemo(() => [...new Set(alla.map((b) => b.bok.årskurs))].sort((a, b) => a - b), [alla]);

  const synliga = filterBocker(alla.map((r) => ({ ...r.bok, _rad: r })), { amne, arskurs }).map((x) => x._rad);
  const valdRad = alla.find((r) => r.bok.id === vald) ?? null;

  const importera = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const bok = validateBokImport(parsed);
      if (bok.bok.id === '__datakalla__') { setMsg('✗ Bok-id:t är reserverat.'); return; }
      const fannsRedan = getLokalaBocker().some((b) => b.bok.id === bok.bok.id);
      saveLokalBok(bok);
      bump((t) => t + 1); onChange();
      setVald(bok.bok.id); setValdKap(null);
      setMsg(`✓ "${bok.bok.titel}" (${bok.bok.ämne}, åk ${bok.bok.årskurs}) ${fannsRedan ? 'uppdaterad' : 'importerad'} — ${raknaLektioner(bok.lektioner)} lektioner.`);
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    }
  };

  const taBort = (id: string, titel: string) => {
    if (!window.confirm(`Ta bort boken "${titel}" ur biblioteket? (Endast lokalt — påverkar inte datakällan.)`)) return;
    deleteLokalBok(id);
    if (vald === id) { setVald(null); setValdKap(null); }
    bump((t) => t + 1); onChange();
    setMsg(`✓ "${titel}" borttagen.`);
  };

  return (
    <div className="card">
      <div className="title">📚 Böcker</div>
      <p className="note">
        Böcker delas in i ämnen och årskurser. Importera en egen bok: fotografera bokens sidor,
        kör prompten <b>Bokimport</b> (Promptbiblioteket nedan) i en AI-chatt med bilderna, och
        importera JSON-filen här. Välj sedan boken för att se innehållet som lektioner.
      </p>

      <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <button className={`prio-pill ${amne === null ? 'on' : ''}`} onClick={() => setAmne(null)}>Alla ämnen</button>
        {amnen.map((a) => (
          <button key={a} className={`prio-pill ${amne === a ? 'on' : ''}`} onClick={() => setAmne(amne === a ? null : a)}>{a}</button>
        ))}
        <select value={arskurs ?? ''} onChange={(e) => setArskurs(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Alla årskurser</option>
          {arskurser.map((k) => <option key={k} value={k}>Åk {k}</option>)}
        </select>
        <label className="btn sec file-btn">⬆ Importera bok (JSON)
          <input type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importera(f); e.target.value = ''; }} />
        </label>
      </div>

      {synliga.length === 0 && <p className="muted">Inga böcker matchar filtret.</p>}
      {synliga.map((r) => (
        <div key={r.bok.id} className="cm-card" style={{ display: 'block' }}>
          <div className="head-row">
            <div>
              <b>{r.bok.titel}</b>{r.bok.förlag !== '' ? <span className="muted"> · {r.bok.förlag}</span> : null}<br />
              <small className="muted">
                {r.bok.ämne} · Åk {r.bok.årskurs} · {Object.keys(r.bok.kapitelMeta).length} kapitel ·{' '}
                {raknaLektioner(r.lektioner)} lektioner
              </small>
            </div>
            <div className="cm-actions">
              <span className={`pill src-${r.kalla === 'datakalla' ? 'datakalla' : 'egen'}`}>
                {r.kalla === 'datakalla' ? 'Datakälla' : 'Egen'}
              </span>
              <button className="btn sec" onClick={() => { setVald(vald === r.bok.id ? null : r.bok.id); setValdKap(null); }}>
                {vald === r.bok.id ? 'Dölj innehåll' : '📖 Visa innehåll'}
              </button>
              {r.kalla === 'egen' && (
                <button className="icon-btn" title="Ta bort bok" onClick={() => taBort(r.bok.id, r.bok.titel)}>🗑</button>
              )}
            </div>
          </div>

          {vald === r.bok.id && valdRad && (
            <div>
              <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                {Object.keys(valdRad.bok.kapitelMeta).map(Number).sort((a, b) => a - b).map((k) => (
                  <button key={k} className={`prio-pill ${valdKap === k ? 'on' : ''}`}
                    onClick={() => setValdKap(valdKap === k ? null : k)}>
                    {k}. {valdRad.bok.kapitelMeta[String(k)]?.name ?? `Kapitel ${k}`}
                  </button>
                ))}
              </div>
              {valdKap !== null && (
                <table className="tbl">
                  <thead><tr><th>#</th><th>Avsnitt</th><th>Del</th><th>Typ</th><th>Grön</th><th>Blå</th><th>Röd</th><th>Begrepp</th></tr></thead>
                  <tbody>
                    {(valdRad.lektioner[valdKap] ?? []).map((l) => (
                      <tr key={l.id}>
                        <td>{l.id}</td><td>{l.avsnitt}</td><td>{l.del}</td><td>{l.type}</td>
                        <td>{l.grön}</td><td>{l.blå}</td><td>{l.röd}</td>
                        <td>{l.begrepp.length > 48 ? `${l.begrepp.slice(0, 48)}…` : l.begrepp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {valdKap === null && <p className="muted">Välj ett kapitel ovan för att se lektionerna.</p>}
            </div>
          )}
        </div>
      ))}
      {msg && <p className="status">{msg}</p>}
    </div>
  );
}
