/**
 * Betygsdatum-editor (del 14) — sektionen Viktiga datum i kugghjulspanelen.
 * Datumen visas som egen rubrik under Viktiga datum i årsöversikten.
 */
import { useState } from 'react';
import { nyttBetygsdatumId, validateBetygsdatum, type Betygsdatum } from '@planner/core';
import { getBetygsdatum, setBetygsdatum } from '../state/store.js';

export function BetygsdatumEditor(props: { onChange: () => void }) {
  const [tick, bump] = useState(0);
  const [label, setLabel] = useState('Betygssättning HT');
  const [datum, setDatum] = useState('');
  const [msg, setMsg] = useState('');
  void tick;
  const lista = getBetygsdatum();

  const spara = (nyLista: Betygsdatum[]) => {
    setBetygsdatum(nyLista); bump((t) => t + 1); props.onChange();
  };

  const laggTill = () => {
    const ny: Betygsdatum = { id: nyttBetygsdatumId(lista.map((b) => b.id)), label: label.trim(), datum };
    const fel = validateBetygsdatum(ny);
    if (fel.length > 0) { setMsg(`✗ ${fel.join(' ')}`); return; }
    spara([...lista, ny]);
    setMsg(`✓ ${ny.label} (${ny.datum}) tillagd.`);
    setLabel(''); setDatum('');
  };

  return (
    <div>
      <p className="note">
        Betygssättningsdatum visas som egen rubrik under Viktiga datum i årsöversikten,
        för alla ämnen. Lägg t.ex. in ett datum för HT och ett för VT.
      </p>
      {lista.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Rubrik</th><th>Datum</th><th /></tr></thead>
          <tbody>
            {lista.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td><td>{b.datum}</td>
                <td><button className="icon-btn" title="Ta bort"
                  onClick={() => spara(lista.filter((x) => x.id !== b.id))}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="cm-add">
        <input placeholder="Rubrik, t.ex. Betygssättning HT" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        <button className="btn" disabled={label.trim() === '' || datum === ''} onClick={laggTill}>➕ Lägg till</button>
      </div>
      {msg && <p className="status">{msg}</p>}
    </div>
  );
}
