/**
 * Del 154 · Elevkortet: enkla resultatdata för en elev med ett eget diagram per
 * källa — läxförhör, exit tickets, övningar, DigiExam och Magma (DigiExam och
 * Magma delar aldrig diagram med Socrative) — vårdnadshavarnas e-post, och
 * elevens status i klassen (på/av, börjar/slutar). En elev som är av eller har
 * slutat ingår inte i klassens rapportering; resultaten finns kvar här.
 */
import { useState } from 'react';
import {
  elevIKlassen, elevkort, giltigEpost, laggTillVardnadshavare, sattElevStatus, taBortVardnadshavare, vardnadshavareMailto,
  type ElevkortSerie, type ResultatKalla, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

const FARG: Record<ResultatKalla, string> = {
  'socrative-laxforhor': '#1A2A6B', 'socrative-exit': '#2f5aa8', 'socrative-ovning': '#00838F', digiexam: '#BF360C', magma: '#6A1B9A',
};
const IKON: Record<ResultatKalla, string> = { 'socrative-laxforhor': '✅', 'socrative-exit': '🎟', 'socrative-ovning': '✏️', digiexam: '📝', magma: '🧠' };
const kort = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };

/** Ett diagram per källa: en stapel per tillfälle, gränsen som streckad linje. */
function KallDiagram({ serie }: { serie: ElevkortSerie }) {
  const n = serie.punkter.length;
  const bred = 34; const w = Math.max(260, n * bred + 50); const h = 150; const bas = 112; const topp = 12;
  const y = (p: number) => bas - ((bas - topp) * p) / 100;
  const farg = FARG[serie.kalla];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="ek-diagram" role="img" aria-label={`Diagram ${serie.rubrik}`}>
      {[0, 50, 100].map((p) => <g key={p}><line x1={30} x2={w - 4} y1={y(p)} y2={y(p)} stroke="#e6e6e6" /><text x={26} y={y(p) + 3} fontSize={9} textAnchor="end" fill="#777">{p}</text></g>)}
      {serie.gransProcent !== null && <g><line x1={30} x2={w - 4} y1={y(serie.gransProcent)} y2={y(serie.gransProcent)} stroke="#2E7D32" strokeDasharray="4 3" /><text x={w - 6} y={y(serie.gransProcent) - 3} fontSize={9} textAnchor="end" fill="#2E7D32">{serie.gransProcent} %</text></g>}
      {serie.punkter.map((p, i) => {
        const x = 36 + i * bred; const v = p.procent ?? 0; const hh = bas - y(v);
        const fyll = p.klarat === false ? '#C62828' : farg;
        return (
          <g key={`${p.datum}-${p.prov}-${i}`}>
            <title>{`${p.prov} (${p.datum}): ${p.procent ?? '–'} % · ${p.omdome}${p.omprov === true ? ' · omprov' : ''}`}</title>
            <rect x={x} y={bas - hh} width={bred - 10} height={hh} rx={3} fill={fyll} opacity={p.omprov === true ? 0.65 : 1} />
            <text x={x + (bred - 10) / 2} y={bas - hh - 3} fontSize={9} textAnchor="middle" fill="#222">{p.procent ?? '–'}</text>
            <text x={x + (bred - 10) / 2} y={bas + 12} fontSize={8} textAnchor="middle" fill="#555">{kort(p.datum)}</text>
            {p.omprov === true && <text x={x + (bred - 10) / 2} y={bas + 22} fontSize={7} textAnchor="middle" fill="#BF360C">omprov</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Elevkort({ s, elevId, amneId, kor, onTillbaka }: {
  s: Struktur; elevId: string; amneId?: string; kor: (fn: () => Struktur, m: string) => void; onTillbaka: () => void;
}) {
  const [epost, setEpost] = useState('');
  const [namn, setNamn] = useState('');
  const [fel, setFel] = useState<string | null>(null);
  const k = elevkort(s, elevId, amneId);
  if (k === null) return <p className="muted">Eleven finns inte.</p>;
  const { elev } = k;
  const iKlassen = elevIKlassen(elev);
  const status = (andring: Parameters<typeof sattElevStatus>[2], m: string) => {
    try { kor(() => sattElevStatus(lasStruktur(), elev.id, andring), m); setFel(null); }
    catch (e) { setFel(e instanceof Error ? e.message : 'Kunde inte spara.'); }
  };
  const laggTill = () => {
    if (!giltigEpost(epost)) { setFel(`"${epost.trim()}" är ingen giltig e-postadress.`); return; }
    kor(() => laggTillVardnadshavare(lasStruktur(), elev.id, { epost, ...(namn.trim() !== '' ? { namn } : {}) }), `Vårdnadshavare tillagd för ${elev.namn}.`);
    setEpost(''); setNamn(''); setFel(null);
  };
  const mailto = vardnadshavareMailto(elev, `${k.amne ?? 'Skolan'} ${k.klass} – ${elev.namn}`);

  return (
    <div className="uppg-kort st-widget elevkort" aria-label={`Elevkort ${elev.namn}`}>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn sm" onClick={onTillbaka}>← Alla elever</button>
        <h3 style={{ margin: 0 }}>🪪 {elev.namn}</h3>
        <small className="muted">{k.klass}{k.amne !== null ? ` · ${k.amne}` : ' · alla ämnen'} · grupp {elev.grupp} · {k.antal} resultat</small>
        {!iKlassen && <span className="st-krav ej">ingår inte i klassen — ingen rapportering</span>}
      </div>

      {/* ── Status i klassen ── */}
      <div className="ek-status rad" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="ek-vaxel" title="Av = eleven ingår inte i klassen; rapporteringen kring eleven avslutas">
          <input type="checkbox" aria-label="Eleven ingår i klassen" checked={elev.aktiv !== false}
            onChange={(e) => status({ aktiv: e.target.checked }, e.target.checked ? `${elev.namn} ingår i klassen igen.` : `${elev.namn} ingår inte längre i klassen — rapporteringen avslutad.`)} />
          <b>{elev.aktiv === false ? 'Av' : 'På'}</b> <small className="muted">ingår i klassen</small>
        </label>
        <label className="small">Börjar:{' '}
          <input type="date" aria-label="Börjar datum" value={elev.startDatum ?? ''} onChange={(e) => status({ startDatum: e.target.value === '' ? null : e.target.value }, e.target.value === '' ? 'Startdatum borttaget.' : `${elev.namn} börjar ${e.target.value}.`)} /></label>
        <label className="small">Slutar:{' '}
          <input type="date" aria-label="Slutar datum" value={elev.slutDatum ?? ''} onChange={(e) => status({ slutDatum: e.target.value === '' ? null : e.target.value }, e.target.value === '' ? 'Slutdatum borttaget.' : `${elev.namn} slutar ${e.target.value} (sista dagen).`)} /></label>
        <small className="muted">Slutdatum är sista dagen. Efter det, eller när eleven är av, räknas eleven inte i klassens resultat, översikt eller provlarm — resultaten finns kvar här.</small>
      </div>

      {/* ── Nyckeltal ── */}
      <div className="ek-nyckeltal">
        {k.serier.map((x) => (
          <div key={x.kalla} className="ek-tal" style={{ borderTopColor: FARG[x.kalla] }}>
            <span className="ek-tal-rubrik">{IKON[x.kalla]} {x.rubrik}</span>
            <b>{x.snitt === null ? '—' : `${x.snitt} %`}</b>
            <small>{x.antal === 0 ? 'inga resultat' : `${x.antal} tillfällen · senast ${x.senaste ?? '—'} %`}</small>
            {x.bedomda > 0 && <small className={x.klarade === x.bedomda ? 'ek-ok' : 'ek-ej'}>{x.klarade} av {x.bedomda} nådde gränsen</small>}
          </div>
        ))}
      </div>

      {/* ── Ett diagram per källa ── */}
      <div className="ek-diagramrutnat">
        {k.serier.map((x) => (
          <section key={x.kalla} className="ek-diagramruta">
            <div className="ek-diagramrubrik"><b style={{ color: FARG[x.kalla] }}>{IKON[x.kalla]} {x.rubrik}</b> <small className="muted">{x.gransText}</small></div>
            {x.antal === 0 ? <p className="small muted ek-tom">Inga {x.rubrik.toLowerCase()} i urvalet.</p> : <KallDiagram serie={x} />}
          </section>
        ))}
      </div>

      {/* ── Vårdnadshavare ── */}
      <section className="ek-vh">
        <div className="rad" style={{ gap: 8, alignItems: 'baseline' }}>
          <b>👨‍👩‍👧 Vårdnadshavare</b>
          {mailto !== '' && <a className="btn sec sm" href={mailto}>✉ Skriv till {k.vardnadshavare.length === 1 ? 'vårdnadshavaren' : `alla ${k.vardnadshavare.length}`}</a>}
        </div>
        {k.vardnadshavare.length === 0 ? <p className="small muted">Ingen e-post registrerad.</p> : (
          <ul className="ek-vh-lista">{k.vardnadshavare.map((v) => (
            <li key={v.epost}>{v.namn !== undefined ? <b>{v.namn} </b> : null}<a href={`mailto:${v.epost}`}>{v.epost}</a>{' '}
              <button className="linkbtn small" aria-label={`Ta bort ${v.epost}`} onClick={() => kor(() => taBortVardnadshavare(lasStruktur(), elev.id, v.epost), `${v.epost} borttagen.`)}>✕</button></li>
          ))}</ul>
        )}
        <div className="rad" style={{ gap: 6, flexWrap: 'wrap' }}>
          <input aria-label="Vårdnadshavarens namn" placeholder="Namn (valfritt)" value={namn} onChange={(e) => setNamn(e.target.value)} style={{ width: 160 }} />
          <input aria-label="Vårdnadshavarens e-post" type="email" placeholder="namn@exempel.se" value={epost} onChange={(e) => setEpost(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') laggTill(); }} style={{ width: 220 }} />
          <button className="btn sm" disabled={epost.trim() === ''} onClick={laggTill}>➕ Lägg till e-post</button>
        </div>
      </section>
      {fel !== null && <p className="status warn small" role="alert">{fel}</p>}
    </div>
  );
}
