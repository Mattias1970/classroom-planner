/**
 * Elevregister per klass (del 10).
 * Excel-läsning (SheetJS) sker här i Ring 3; tolkning/validering/merge
 * är ren logik i @planner/core (parseEleverFromRows, mergeElever).
 * Lagring: localStorage-overlay per klass — datakällan muteras aldrig.
 */
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { mergeElever, parseEleverFromRows, validateElev, type Elev } from '@planner/core';
import { getElever, setElever } from '../state/store.js';

const TOM: Elev = { fornamn: '', efternamn: '', studentId: '', email: '' };

export function EleverPanel(props: { classId: string; klassNamn: string; onChange: () => void }) {
  const { classId, klassNamn, onChange } = props;
  const [tick, bump] = useState(0);
  const [ny, setNy] = useState<Elev>(TOM);
  const [msg, setMsg] = useState('');
  void tick;
  const elever = getElever(classId);

  const spara = (lista: Elev[]) => { setElever(classId, lista); bump((t) => t + 1); onChange(); };

  const laggTill = () => {
    const problem = validateElev(ny);
    if (problem.length > 0) { setMsg(`✗ ${problem.join(' ')}`); return; }
    if (elever.some((e) => e.studentId === ny.studentId)) {
      setMsg(`✗ StudentID ${ny.studentId} finns redan i ${klassNamn}.`); return;
    }
    spara(mergeElever(elever, [ny]));
    setNy(TOM); setMsg('✓ Elev tillagd.');
  };

  const taBort = (studentId: string) => {
    spara(elever.filter((e) => e.studentId !== studentId));
  };

  const importera = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheetName = wb.SheetNames[0];
      const sheet = sheetName === undefined ? undefined : wb.Sheets[sheetName];
      if (sheet === undefined) { setMsg('✗ Filen innehåller inget kalkylblad.'); return; }
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
      const res = parseEleverFromRows(rows);
      if (res.elever.length === 0) {
        setMsg(`✗ Inga giltiga elever i filen.${res.fel.length > 0 ? ` ${res.fel[0]}` : ''}`);
        return;
      }
      spara(mergeElever(elever, res.elever));
      setMsg(
        `✓ ${res.elever.length} elever importerade till ${klassNamn}.` +
        (res.fel.length > 0 ? ` ${res.fel.length} rader hoppades över: ${res.fel.join(' ')}` : '')
      );
    } catch (e) {
      setMsg(`✗ Kunde inte läsa filen: ${(e as Error).message}`);
    }
  };

  return (
    <div className="cm-card" style={{ display: 'block' }}>
      <div className="head-row">
        <b>👥 Elever i {klassNamn} ({elever.length})</b>
        <label className="btn sec file-btn">⬆ Importera från Excel
          <input type="file" accept=".xlsx,.xls,.csv" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importera(f); e.target.value = ''; }} />
        </label>
      </div>
      <p className="note">
        Kolumner: Förnamn, Efternamn, StudentID, E-post — rubrikraden känns igen automatiskt
        (även engelska), annars antas den ordningen. Import matchar på StudentID och raderar aldrig.
      </p>

      {elever.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Efternamn</th><th>Förnamn</th><th>StudentID</th><th>E-post</th><th /></tr></thead>
          <tbody>
            {elever.map((e) => (
              <tr key={e.studentId}>
                <td>{e.efternamn}</td><td>{e.fornamn}</td><td>{e.studentId}</td><td>{e.email}</td>
                <td><button className="icon-btn" title="Ta bort elev" onClick={() => taBort(e.studentId)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="cm-add">
        <input placeholder="Förnamn" value={ny.fornamn} onChange={(e) => setNy({ ...ny, fornamn: e.target.value })} />
        <input placeholder="Efternamn" value={ny.efternamn} onChange={(e) => setNy({ ...ny, efternamn: e.target.value })} />
        <input placeholder="StudentID" value={ny.studentId} onChange={(e) => setNy({ ...ny, studentId: e.target.value })} />
        <input placeholder="E-post (valfri)" value={ny.email} onChange={(e) => setNy({ ...ny, email: e.target.value })} />
        <button className="btn" disabled={ny.fornamn.trim() === '' || ny.efternamn.trim() === '' || ny.studentId.trim() === ''}
          onClick={laggTill}>➕ Lägg till elev</button>
      </div>
      {msg && <p className="status">{msg}</p>}
    </div>
  );
}
