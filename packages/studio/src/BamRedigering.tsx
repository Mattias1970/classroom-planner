import { useState } from 'react';
import type { BamDel } from '@planner/kernel';

/** Del 143 · Redigera lektionens delar (BAM) med egna tider: namn, minuter, ikon, ordning. */
const BAM_IKONER = ['📱', '🧑‍🏫', '✏️', '🎫', '📋', '📝', '🧪', '💬', '🎬', '☕', '▪'];
export function BamRedigering({ bam, standard, onSpara }: { bam: BamDel[] | undefined; standard: BamDel[]; onSpara: (bam: BamDel[] | undefined, m: string) => void }) {
  const [oppen, setOppen] = useState(false);
  const [delar, setDelar] = useState<BamDel[]>(bam ?? standard);
  if (!oppen) {
    return (
      <div className="rad" style={{ gap: 6 }}>
        <button className="btn sec sm" onClick={() => { setDelar(bam ?? standard); setOppen(true); }}>✏ Ändra BAM</button>
        {bam !== undefined && <small className="muted">egna delar · <button className="linkbtn" onClick={() => onSpara(undefined, 'Lektionen följer standard-BAM igen.')}>↺ standard</button></small>}
      </div>
    );
  }
  const satt = (i: number, patch: Partial<BamDel>) => setDelar(delar.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const flytta = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= delar.length) return; const n = [...delar]; [n[i], n[j]] = [n[j], n[i]]; setDelar(n); };
  const summa = delar.reduce((a, d) => a + Math.max(0, Math.round(d.minuter)), 0);
  return (
    <div className="bam-red">
      <table className="tbl small">
        <thead><tr><th></th><th>Del</th><th>Minuter</th><th>Text på tavlan</th><th></th></tr></thead>
        <tbody>{delar.map((d, i) => (
          <tr key={i}>
            <td><select aria-label={`Ikon del ${i + 1}`} value={d.ikon ?? '▪'} onChange={(e) => satt(i, { ikon: e.target.value })}>{BAM_IKONER.map((ik) => <option key={ik} value={ik}>{ik}</option>)}</select></td>
            <td><input aria-label={`Namn del ${i + 1}`} value={d.namn} onChange={(e) => satt(i, { namn: e.target.value })} /></td>
            <td><input aria-label={`Minuter del ${i + 1}`} type="number" min={0} step={5} value={d.minuter} style={{ width: 64 }} onChange={(e) => satt(i, { minuter: Number(e.target.value) })} /></td>
            <td><input aria-label={`Text del ${i + 1}`} value={d.text ?? ''} placeholder="t.ex. rum, uppgifter" onChange={(e) => satt(i, { text: e.target.value })} /></td>
            <td className="rad" style={{ gap: 2 }}>
              <button className="icon-btn" aria-label={`Flytta upp del ${i + 1}`} disabled={i === 0} onClick={() => flytta(i, -1)}>↑</button>
              <button className="icon-btn" aria-label={`Flytta ned del ${i + 1}`} disabled={i === delar.length - 1} onClick={() => flytta(i, 1)}>↓</button>
              <button className="icon-btn" aria-label={`Ta bort del ${i + 1}`} onClick={() => setDelar(delar.filter((_, j) => j !== i))}>🗑</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      <div className="rad" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className="btn sec sm" onClick={() => setDelar([...delar, { namn: 'Ny del', minuter: 10, ikon: '▪' }])}>➕ Ny del</button>
        <button className="btn sec sm" onClick={() => setDelar(standard)}>↺ Standard</button>
        <small className="muted">summa {summa} min</small>
        <span className="spacer" />
        <button className="btn sec sm" onClick={() => setOppen(false)}>Avbryt</button>
        <button className="btn sm" disabled={delar.length === 0 || delar.some((d) => d.namn.trim() === '')} onClick={() => { onSpara(delar.map((d) => ({ ...d, namn: d.namn.trim(), minuter: Math.max(0, Math.round(d.minuter)) })), 'Lektionens delar sparade.'); setOppen(false); }}>💾 Spara BAM</button>
      </div>
    </div>
  );
}

