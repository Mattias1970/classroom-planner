/**
 * Del 164 · Utvärdering inför utvecklingssamtal — en kort text per elev (högst sju
 * rader) ur läxförhör, exit tickets, inlämningar och DigiExam-prov. Status och text
 * beräknas; läraren kan ändra status (texten följer) och skriva om texten. Kopiera
 * per elev eller exportera hela klassen som Word.
 */
import { useMemo, useState } from 'react';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import {
  klassensUtvarderingar, samtalsStycken, sattSamtalsUtvardering, STATUS_ORDNING, STATUS_TEXT,
  type Klass, type SamtalsStatus, type Struktur, type Utvardering,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

const pct = (v: number | null) => (v === null ? '—' : `${v} %`);
const pil = (t: 'upp' | 'stabil' | 'ner' | null) => (t === 'upp' ? '↗' : t === 'ner' ? '↘' : t === 'stabil' ? '→' : '');

async function tillWord(klassNamn: string, amne: string, lista: Utvardering[]): Promise<void> {
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      children: [
        new Paragraph({ text: `Utvecklingssamtal · ${klassNamn} · ${amne}`, heading: HeadingLevel.HEADING_1 }),
        ...lista.flatMap((u) => [
          new Paragraph({ text: `${u.namn} — ${STATUS_TEXT[u.egenStatus ?? u.status]}`, heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 160 } }),
          // Rubrikerna i fet svart stil, "Exit tickets" i fet blå, dubbel radbrytning mellan styckena
          ...samtalsStycken(u.egenText ?? u.text).map((st) => new Paragraph({
            spacing: { after: 240, line: 300 },
            children: [
              ...(st.etikett !== null ? [new TextRun({ text: `${st.etikett}: `, bold: true, color: '000000' })] : []),
              ...st.delar.map((d) => new TextRun(d.exit ? { text: d.text, bold: true, color: '1565C0' } : { text: d.text })),
            ],
          })),
        ]),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Utvecklingssamtal ${klassNamn} ${amne}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Utvecklingssamtal({ s, klass, amneId, kor, idag, onTillbaka }: {
  s: Struktur; klass: Klass; amneId: string; kor: (fn: () => Struktur, m: string) => void; idag: string; onTillbaka: () => void;
}) {
  const amne = s.amnen.find((a) => a.id === amneId);
  const lista = useMemo(() => klassensUtvarderingar(s, klass.id, amneId, idag), [s, klass.id, amneId, idag]);
  const [oppen, setOppen] = useState<string | null>(null);
  const [kopierad, setKopierad] = useState<string | null>(null);
  const [utkast, setUtkast] = useState<Record<string, string>>({});
  const [redigerar, setRedigerar] = useState<string | null>(null);
  if (amne === undefined) return null;
  const kopiera = (u: Utvardering) => {
    const text = u.egenText ?? u.text;
    void navigator.clipboard?.writeText(text).then(() => { setKopierad(u.elevId); window.setTimeout(() => setKopierad(null), 1500); });
  };
  const antalPer = STATUS_ORDNING.map((st) => [st, lista.filter((u) => (u.egenStatus ?? u.status) === st).length] as const);
  return (
    <div className="uppg-kort st-widget st-samtal" aria-label="Utvecklingssamtal">
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn sm" onClick={onTillbaka}>← Alla elever</button>
        <h3 style={{ margin: 0 }}>🗣 Utvecklingssamtal · {klass.namn} · {amne.namn}</h3>
        <span className="spacer" />
        <button className="btn sec sm" onClick={() => { void tillWord(klass.namn, amne.namn, lista); }}>📄 Alla till Word</button>
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>
        Texten bygger på läxförhör (gräns 90 %), exit tickets (70 %), inlämningar ur Teams och DigiExam-prov. Utveckling = de första förhören jämfört med de senaste.
        Statusen är beräknad — ändra den så skrivs texten om; du kan också skriva om texten själv. Ett prov som inte är godkänt ger ”har svårt att nå målen” tills omprovet är klarat.
      </p>
      <div className="rad" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {antalPer.map(([st, n]) => <span key={st} className={`chip st-samtal-chip ${st}`}>{STATUS_TEXT[st]}: <b>{n}</b></span>)}
      </div>
      <table className="tbl small st-samtal-tabell">
        <thead><tr><th>#</th><th>Elev</th><th>Status</th><th>Exit</th><th>Läxförhör</th><th>Inlämningar</th><th>Prov</th><th></th></tr></thead>
        <tbody>{lista.map((u, i) => {
          const status = u.egenStatus ?? u.status;
          const ar = oppen === u.elevId;
          const text = utkast[u.elevId] ?? u.egenText ?? u.text;
          return [
            <tr key={u.elevId} className={`st-samtal-rad ${status}`}>
              <td className="muted">{i + 1}</td>
              <td><button className="linkbtn" aria-expanded={ar} onClick={() => setOppen(ar ? null : u.elevId)}>{ar ? '▾' : '▸'} {u.namn}</button></td>
              <td>
                <select aria-label={`Status ${u.namn}`} value={status} className={`st-samtal-status ${status}`}
                  onChange={(e) => kor(() => sattSamtalsUtvardering(lasStruktur(), u.elevId, amneId, { status: e.target.value === u.status ? null : e.target.value as SamtalsStatus }), `${u.namn}: status ${STATUS_TEXT[e.target.value as SamtalsStatus]}.`)}>
                  {STATUS_ORDNING.map((st) => <option key={st} value={st}>{STATUS_TEXT[st]}{st === u.status ? ' (beräknad)' : ''}</option>)}
                </select>
              </td>
              <td title={`${u.lektioner.antal} exit tickets`}>{u.lektioner.antal === 0 ? '—' : `${pct(u.lektioner.borjan)} → ${pct(u.lektioner.nu)} ${pil(u.lektioner.trend)}`}</td>
              <td title={u.laxlasning.glomdaBegrepp.length > 0 ? `Glömda begrepp: ${u.laxlasning.glomdaBegrepp.join(', ')}` : `${u.laxlasning.antal} läxförhör`}>
                {u.laxlasning.antal === 0 ? '—' : `${pct(u.laxlasning.borjan)} → ${pct(u.laxlasning.nu)} ${pil(u.laxlasning.trend)}`}
                {u.laxlasning.glomdaBegrepp.length > 0 && <small className={`st-samtal-glomda ${u.laxlasning.tendens}`}> · {u.laxlasning.glomdaBegrepp.length} glömda</small>}
              </td>
              <td>{u.inlamningar.procent === null ? '—' : `${u.inlamningar.procent} % ${pil(u.inlamningar.trend)}`}</td>
              <td>{u.digiexam.length === 0 ? '—' : u.digiexam.map((p) => <span key={p.prov} className={`st-krav ${!p.skrivit ? 'ej' : p.godkand === false ? 'ej' : 'ok'}`} title={p.prov}>{!p.skrivit ? 'ej skrivit' : p.godkand === false ? 'ej godkänd' : p.godkand === true ? 'godkänd' : 'skrivet'}</span>)}</td>
              <td><button className="btn sec sm" aria-label={`Kopiera ${u.namn}`} onClick={() => kopiera(u)}>{kopierad === u.elevId ? '✓ Kopierad' : '📋 Kopiera'}</button></td>
            </tr>,
            ar && (
              <tr key={`${u.elevId}-text`}><td colSpan={8}>
                {redigerar === u.elevId ? (
                  <textarea aria-label={`Text ${u.namn}`} rows={10} className="st-samtal-text" value={text}
                    onChange={(e) => setUtkast({ ...utkast, [u.elevId]: e.target.value })} />
                ) : (
                  <div className="st-samtal-visning" aria-label={`Text ${u.namn}`}>
                    {samtalsStycken(text).map((st, si) => (
                      <p key={si}>
                        {st.etikett !== null && <b className="st-samtal-rubrik">{st.etikett}: </b>}
                        {st.delar.map((d, di) => (d.exit ? <b key={di} className="st-samtal-exit">{d.text}</b> : <span key={di}>{d.text}</span>))}
                      </p>
                    ))}
                  </div>
                )}
                <div className="rad" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <small className="muted">{text.split('\n').length} stycken{u.egenText !== undefined ? ' · egen text' : ' · beräknad text'}</small>
                  <button className="btn sec sm" onClick={() => setRedigerar(redigerar === u.elevId ? null : u.elevId)}>{redigerar === u.elevId ? '👁 Visa' : '✏ Redigera'}</button>
                  <span className="spacer" />
                  {(u.egenText !== undefined || utkast[u.elevId] !== undefined) && <button className="btn sec sm" onClick={() => { const { [u.elevId]: _b, ...rest } = utkast; void _b; setUtkast(rest); kor(() => sattSamtalsUtvardering(lasStruktur(), u.elevId, amneId, { text: null }), `${u.namn}: beräknad text igen.`); }}>↺ Beräknad text</button>}
                  <button className="btn sm" disabled={utkast[u.elevId] === undefined || utkast[u.elevId] === (u.egenText ?? u.text)} onClick={() => { const t = utkast[u.elevId]; const { [u.elevId]: _b, ...rest } = utkast; void _b; setUtkast(rest); kor(() => sattSamtalsUtvardering(lasStruktur(), u.elevId, amneId, { text: t }), `${u.namn}: texten sparad.`); }}>💾 Spara text</button>
                </div>
              </td></tr>
            ),
          ];
        })}</tbody>
      </table>
    </div>
  );
}
