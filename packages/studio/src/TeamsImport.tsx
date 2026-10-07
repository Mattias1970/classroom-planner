/**
 * Del 163 · Inlämningar ur Teams: import av tilldelningsdata (xlsx) och diagram över
 * inlämningarna — per uppgift (staplar: inlämnade, sena, saknas) och per elev.
 * Tilldelningar för samma delkapitel och typ slås ihop till en uppgift. Exporten
 * säger inget om bifogade filer; läraren kan underkänna en inlämning som saknar bild.
 */
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  importeraInlamningar, inlamningsOversikt, sattInlamningUnderkand, tolkaTeamsTilldelningar, TYP_NAMN, arInlamnad,
  type Amne, type Inlamning, type Klass, type Struktur, type TeamsRad, type UppgiftsRad,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

const kort = (d: string) => (d === '' ? '—' : `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`);
const kortUppgift = (u: UppgiftsRad) => u.delkapitel !== undefined && u.typ !== 'laboration' ? `${u.delkapitel} ${u.typ === 'begrepp' ? 'B' : u.typ === 'testa' ? 'T' : 'U'}` : u.uppgift.replace(/^\S+\s+/, '').replace(/^Laboration\s*[-:–]\s*/i, 'Lab ').slice(0, 14);

/** Staplar per uppgift: inlämnade (grön), sena (orange) och saknas (grå), i procent av klassen. */
export function InlamningsStaplar({ uppgifter }: { uppgifter: UppgiftsRad[] }) {
  const w = Math.max(320, uppgifter.length * 40 + 44); const h = 190; const bas = 140; const topp = 14;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="st-inl-diagram" role="img" aria-label="Inlämningar per uppgift">
      {[0, 50, 100].map((y) => { const yy = bas - ((bas - topp) * y) / 100; return <g key={y}><line x1={34} x2={w - 4} y1={yy} y2={yy} stroke="#e0e0e0" /><text x={30} y={yy + 3} fontSize={9} textAnchor="end" fill="#666">{y}</text></g>; })}
      {uppgifter.map((u, i) => {
        const x = 40 + i * 40; const n = Math.max(1, u.antal);
        const hIn = ((bas - topp) * u.inlamnade) / n; const hSen = ((bas - topp) * u.sena) / n;
        return (
          <g key={u.uppgift}>
            <title>{`${u.uppgift} (${kort(u.forfallo)}): ${u.procent} % inlämnat — ${u.inlamnade} i tid, ${u.sena} sena, ${u.ej} saknas${u.underkanda > 0 ? `, ${u.underkanda} underkända` : ''}`}</title>
            <rect x={x} y={bas - hIn} width={28} height={hIn} fill="#2E7D32" rx={2} />
            <rect x={x} y={bas - hIn - hSen} width={28} height={hSen} fill="#EF6C00" />
            <text x={x + 14} y={bas - hIn - hSen - 3} fontSize={9} textAnchor="middle" fill="#333">{u.procent}</text>
            <text x={x + 14} y={bas + 11} fontSize={9} textAnchor="middle" fill="#333" fontWeight={u.procent < 50 ? 800 : 400}>{kortUppgift(u)}</text>
            <text x={x + 14} y={bas + 21} fontSize={8} textAnchor="middle" fill="#888">{kort(u.forfallo)}</text>
          </g>
        );
      })}
      <text x={w / 2} y={h - 2} fontSize={9} textAnchor="middle" fill="#666">B = begrepp · T = testa dig själv · % av klassen som lämnat in (grönt i tid, orange sent)</text>
    </svg>
  );
}

export function TeamsImport({ s, klass, amne, kor, idag }: {
  s: Struktur; klass: Klass; amne: Amne | undefined; kor: (fn: () => Struktur, m: string) => void; idag: string;
}) {
  const [rader, setRader] = useState<TeamsRad[] | null>(null);
  const [filnamn, setFilnamn] = useState('');
  const [fel, setFel] = useState<string | null>(null);
  const [vy, setVy] = useState<'uppgifter' | 'elever'>('uppgifter');
  const [oppenUppgift, setOppenUppgift] = useState<string | null>(null);
  const alla = useMemo(() => inlamningsOversikt(s, klass.id, undefined, idag), [s, klass.id, idag]);
  const o = useMemo(() => inlamningsOversikt(s, klass.id, amne?.id, idag), [s, klass.id, amne?.id, idag]);
  const amnesNamn = (id: string | undefined) => s.amnen.find((a) => a.id === id)?.namn ?? 'utan ämne';

  const lasFil = async (filer: FileList | null) => {
    const fil = filer?.[0]; if (fil === undefined) return;
    try {
      const wb = XLSX.read(await fil.arrayBuffer(), { type: 'array', cellDates: true });
      const blad = wb.SheetNames.find((n) => /tilldelning/i.test(n)) ?? wb.SheetNames[0];
      const matris = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[blad], { header: 1, raw: true, defval: null });
      setRader(tolkaTeamsTilldelningar(matris)); setFilnamn(fil.name); setFel(null);
    } catch (e) { setFel(e instanceof Error ? e.message : 'Kunde inte läsa filen.'); setRader(null); }
  };
  const forhands = rader === null ? null : { elever: new Set(rader.map((r) => r.namn)).size, tilldelningar: new Set(rader.map((r) => r.uppgift.trim())).size };

  return (
    <div className="uppg-kort st-teams">
      <b>📨 Inlämningar ur Teams</b>{' '}
      <small className="muted">Exportera tilldelningsdata för klassen i Teams (Uppgifter → … → Exportera till Excel) och välj filen. Inlämnat, inlämnat sent och returnerat räknas som inlämnat; "Visade" räknas inte. Tilldelningar för samma delkapitel och typ slås ihop till en uppgift.</small>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
        <label className="btn sec sm file-btn">📂 Välj Teams-fil (.xlsx)
          <input type="file" accept=".xlsx" hidden aria-label="Teams-fil" onChange={(e) => { void lasFil(e.target.files); e.currentTarget.value = ''; }} />
        </label>
        {forhands !== null && <small>{filnamn}: {rader!.length} rader · {forhands.elever} elever · {forhands.tilldelningar} tilldelningar</small>}
        {rader !== null && (
          <button className="btn sm" onClick={() => {
            try {
              const r = importeraInlamningar(lasStruktur(), klass.id, rader);
              kor(() => r.s, `Inlämningar importerade för ${klass.namn}: ${r.uppgifter} uppgifter, ${r.antal} inlämningsposter.${r.sammanslagna.length > 0 ? ` Sammanslagna: ${r.sammanslagna.join(', ')}.` : ''}${r.omatchade.length > 0 ? ` ⚠ ${r.omatchade.length} elever i filen finns inte i klassen: ${r.omatchade.join(', ')}.` : ''}`);
              setRader(null); setFilnamn('');
            } catch (e) { setFel(e instanceof Error ? e.message : 'Importen misslyckades.'); }
          }}>💾 Importera inlämningar</button>
        )}
      </div>
      {fel !== null && <p className="status warn" role="alert">✗ {fel}</p>}
      <p className="small muted" style={{ margin: '6px 0' }}>⚠ Teams-exporten visar inte om en fil eller bild är bifogad. Kontrollera det i Teams och <b>underkänn</b> inlämningar utan bild här (✕ vid eleven) — de räknas då som ej inlämnade, även efter nya importer.</p>

      {alla.uppgifter.length === 0 ? <p className="muted small">Inga inlämningar importerade för {klass.namn} än.</p> : (<>
        <div className="rad" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b>{amne !== undefined ? amne.namn : 'Alla ämnen'} · {o.uppgifter.length} uppgifter</b>
          <small className="muted">{o.procent === null ? '—' : `${o.procent} % av alla inlämningar gjorda`}{amne !== undefined && alla.uppgifter.length > o.uppgifter.length ? ` · ${alla.uppgifter.length - o.uppgifter.length} uppgifter i andra ämnen/utan ämne` : ''}</small>
          <span className="spacer" />
          <button className={`btn sec sm${vy === 'uppgifter' ? ' act' : ''}`} onClick={() => setVy('uppgifter')}>Per uppgift</button>
          <button className={`btn sec sm${vy === 'elever' ? ' act' : ''}`} onClick={() => setVy('elever')}>Per elev</button>
        </div>
        {o.uppgifter.length > 0 && <div className="st-inl-ram"><InlamningsStaplar uppgifter={o.uppgifter} /></div>}
        {vy === 'uppgifter' && (
          <table className="tbl small st-inl-tabell">
            <thead><tr><th>Uppgift</th><th>Förfallo</th><th>Inlämnat</th><th>Sent</th><th>Saknas</th><th>%</th><th></th></tr></thead>
            <tbody>{o.uppgifter.map((u) => (
              <UppgiftsRadVy key={u.uppgift} u={u} s={s} klassId={klass.id} oppen={oppenUppgift === u.uppgift} onOppna={() => setOppenUppgift(oppenUppgift === u.uppgift ? null : u.uppgift)} kor={kor} amnesNamn={amnesNamn(u.amneId)} visaAmne={amne === undefined} />
            ))}</tbody>
          </table>
        )}
        {vy === 'elever' && (
          <table className="tbl small st-inl-tabell">
            <thead><tr><th>#</th><th>Elev</th><th>Inlämnat</th><th>Sent</th><th>%</th><th>Saknas</th></tr></thead>
            <tbody>{o.elever.map((e, i) => (
              <tr key={e.elevId} className={e.procent < 50 ? 'st-inl-lag' : ''}>
                <td>{i + 1}</td><td>{e.namn}</td><td>{e.inlamnade}</td><td>{e.sena}</td><td><b>{e.procent} %</b></td>
                <td className="muted">{e.saknas.length === 0 ? '—' : e.saknas.map((x) => x.replace(/^\S+\s+/, '')).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </>)}
    </div>
  );
}

function UppgiftsRadVy({ u, s, klassId, oppen, onOppna, kor, amnesNamn, visaAmne }: {
  u: UppgiftsRad; s: Struktur; klassId: string; oppen: boolean; onOppna: () => void; kor: (fn: () => Struktur, m: string) => void; amnesNamn: string; visaAmne: boolean;
}) {
  const poster = (s.inlamningar ?? []).filter((x) => x.klassId === klassId && x.uppgift === u.uppgift);
  const elevNamn = (id: string) => s.elever.find((e) => e.id === id)?.namn ?? id;
  const vaxla = (x: Inlamning) => kor(() => sattInlamningUnderkand(lasStruktur(), x.id, x.underkand !== true),
    x.underkand === true ? `${elevNamn(x.elevId)}: inlämningen räknas igen.` : `${elevNamn(x.elevId)}: inlämningen underkänd (räknas som ej inlämnad).`);
  return (<>
    <tr className={u.procent < 50 ? 'st-inl-lag' : ''}>
      <td><button className="linkbtn" onClick={onOppna} aria-expanded={oppen}>{oppen ? '▾' : '▸'} {u.uppgift}</button>{visaAmne && <small className="muted"> · {amnesNamn}</small>}{u.teamsNamn.length > 1 && <small className="muted" title={u.teamsNamn.join(' | ')}> · {u.teamsNamn.length} tilldelningar</small>}</td>
      <td>{kort(u.forfallo)}</td><td>{u.inlamnade}</td><td>{u.sena}</td><td>{u.ej}{u.underkanda > 0 ? <small className="muted"> ({u.underkanda} underkända)</small> : null}</td><td><b>{u.procent} %</b></td>
      <td className="muted small">{u.saknas.length === 0 ? 'alla har lämnat in' : `saknas: ${u.saknas.map((x) => x.namn).join(', ')}`}</td>
    </tr>
    {oppen && (
      <tr><td colSpan={7}>
        <div className="st-inl-elever">
          {s.elever.filter((e) => e.klassId === klassId).sort((a, b) => a.namn.localeCompare(b.namn, 'sv')).map((e) => {
            const x = poster.find((p) => p.elevId === e.id);
            const ok = x !== undefined && arInlamnad(x);
            return (
              <span key={e.id} className={`chip st-inl-chip ${ok ? (x.status === 'sen' ? 'sen' : 'ok') : 'ej'}`} title={x === undefined ? 'ingen post i Teams-filen' : `${x.teamsStatus}${x.underkand === true ? ' · underkänd' : ''}${x.feedback !== undefined ? `\n${x.feedback}` : ''}`}>
                {ok ? '✓' : '–'} {e.namn}
                {x !== undefined && x.status !== 'ej' && <button className="icon-btn" aria-label={`${x.underkand === true ? 'Godkänn' : 'Underkänn'} ${e.namn}`} title={x.underkand === true ? 'Räkna inlämningen igen' : 'Underkänn — t.ex. utan bild'} onClick={() => vaxla(x)}>{x.underkand === true ? '↺' : '✕'}</button>}
              </span>
            );
          })}
        </div>
      </td></tr>
    )}
  </>);
}
