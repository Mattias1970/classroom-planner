/**
 * Del 151 · Provlappen på provlektionens kort: knappen "Generera provlapp" bygger
 * lappen ur planeringen (kernel provlapp.ts) — avsnitten före provet med mål,
 * begrepp, uppgifter per nivå och övningsförslag för E/C/A — visar den för
 * läsning och laddar ner den som Word (provlappWord.ts). Lärarens egen text
 * (hjälpmedel, tider) sparas på lektionsplanen och tas med på lappen.
 */
import { useState } from 'react';
import { provlapp, provlappText, type Betygsniva, type Provlapp as ProvlappData, type Struktur } from '@planner/kernel';
import { lasStruktur } from './store.js';

const NIVAER: Betygsniva[] = ['E', 'C', 'A'];

export function ProvlappPanel({ s, amneId, lektionsIndex, farg, notis, sattNotis, meddela }: {
  s: Struktur; amneId: string; lektionsIndex: number; farg: string;
  notis: string; sattNotis: (v: string) => void; meddela?: (m: string) => void;
}) {
  const [lapp, setLapp] = useState<ProvlappData | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const idag = new Date().toISOString().slice(0, 10);

  const generera = () => {
    const p = provlapp(lasStruktur(), amneId, lektionsIndex, idag);
    if (p === null) { setFel('Provlappen kunde inte byggas — lektionen är inte ett prov eller ämnet saknar bok och planering.'); setLapp(null); return; }
    setFel(null); setLapp(p);
  };
  const laddaNer = () => {
    const p = lapp ?? provlapp(lasStruktur(), amneId, lektionsIndex, idag);
    if (p === null) { generera(); return; }
    void import('./provlappWord.js').then(({ laddaNerProvlapp }) => laddaNerProvlapp(p, farg)).then(() => meddela?.(`Provlapp ${p.provNamn} nedladdad som Word.`));
  };
  const kopiera = () => {
    if (lapp === null) return;
    void navigator.clipboard?.writeText(provlappText(lapp)).then(() => meddela?.('Provlappen kopierad som text.'));
  };

  return (
    <section className="ls-sektion ls-provlapp" style={{ borderLeftColor: farg }}>
      <div className="ls-sek-rubrik">📄 PROVLAPP</div>
      <p className="small muted" style={{ margin: '0 0 6px' }}>Genereras ur planeringen: avsnitten före provet med mål, begrepp (med bokens förklaringar), uppgifter per nivå och övningsförslag för E-, C- och A-nivå. Ändras planeringen genereras lappen om.</p>
      <label className="small" style={{ display: 'block' }}>Från läraren (hjälpmedel, tid, extra råd — tas med på lappen)
        <textarea aria-label="Provlappens lärartext" rows={2} value={notis} placeholder="T.ex. Miniräknare tillåten på del 2. Provet är 60 minuter." onChange={(e) => sattNotis(e.target.value)} style={{ width: '100%' }} />
      </label>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="btn" onClick={generera}>📄 Generera provlapp</button>
        <button className="btn sec" onClick={laddaNer}>⬇ Ladda ner Word (.docx)</button>
        {lapp !== null && <button className="btn sec" onClick={kopiera}>📋 Kopiera som text</button>}
        {s.amnen.find((a) => a.id === amneId)?.bokId === undefined && <span className="status warn small">⚠ Ämnet saknar bok — lappen blir tom.</span>}
      </div>
      {fel !== null && <p className="status warn small">{fel}</p>}
      {lapp !== null && <ProvlappVisning p={lapp} farg={farg} />}
    </section>
  );
}

/** Provlappen för läsning på skärmen — samma delar som Word-filen. */
function ProvlappVisning({ p, farg }: { p: ProvlappData; farg: string }) {
  const delkap = p.avsnitt.filter((a) => a.typ === 'delkapitel' || a.mal.length > 0);
  return (
    <div className="provlapp-vy" role="document" aria-label={`Provlapp ${p.provNamn}`}>
      <div className="provlapp-huvud" style={{ borderBottomColor: farg }}>
        <div className="small" style={{ color: farg, fontWeight: 800, letterSpacing: '.08em' }}>PROVLAPP · {p.amne.toUpperCase()} {p.klass} · {p.bok.toUpperCase()} · KAPITEL {p.kapitelNr}</div>
        <h3 style={{ margin: '2px 0 4px' }}>{p.kapitelNamn}</h3>
        <div className="small"><b>Prov:</b> {p.provNamn} · <b>Datum:</b> {p.provDatum !== null ? `${p.provDatum}${p.provVecka !== null ? ` (v. ${p.provVecka})` : ''}` : <span className="muted">ej satt</span>} · <b>Omfattar:</b> {p.avsnitt.filter((a) => a.typ === 'delkapitel').map((a) => a.rubrik).join(' · ') || `kapitel ${p.kapitelNr}`}</div>
        {p.notis !== null && <p className="small" style={{ margin: '4px 0 0' }}><b>Från läraren:</b> {p.notis}</p>}
      </div>

      {p.kapitelMal.length > 0 && (<><h4>Det här får du lära dig i kapitlet</h4><ul>{p.kapitelMal.map((m, i) => <li key={i}>{m}</li>)}</ul></>)}

      <h4>1. Det här ska du kunna</h4>
      {delkap.map((a) => (
        <div key={a.rubrik} className="provlapp-avsnitt">
          <b>{a.rubrik}</b>{a.sidor !== '' && a.sidor !== '—' && <span className="muted small"> ({a.sidor})</span>}
          {a.mal.length > 0 ? <ul>{a.mal.map((m, i) => <li key={i}>{m}</li>)}</ul> : a.begrepp.length > 0 ? <p className="small"><b>Begrepp:</b> {a.begrepp.join(', ')}</p> : null}
          {a.exempel.length > 0 && <p className="small"><b>Exempel vi räknat:</b> {a.exempel.join(' · ')}</p>}
        </div>
      ))}

      {p.begrepp.length > 0 && (<>
        <h4>2. Begrepp du ska kunna förklara</h4>
        <table className="tbl small"><thead><tr><th>Begrepp</th><th>Förklaring</th></tr></thead>
          <tbody>{p.begrepp.map((b) => <tr key={b.begrepp}><td><b>{b.begrepp}</b></td><td>{b.forklaring ?? <span className="muted">—</span>}</td></tr>)}</tbody></table>
      </>)}

      <h4>3. Vad krävs för E, C och A?</h4>
      <p className="small">E tränas med <b>{p.nivaKarta.E}</b>, C med <b>{p.nivaKarta.C}</b>, A med <b>{p.nivaKarta.A}</b>. E: metoderna rätt på grundläggande uppgifter. C: flera steg, förklara varför, bedöma rimlighet. A: egen strategi, generalisera och motivera.</p>

      <h4>4. Övningsförslag för varje nivå</h4>
      <table className="tbl small provlapp-ovningar"><thead><tr><th>Nivå</th><th>Uppgifter i boken</th></tr></thead>
        <tbody>{NIVAER.map((n) => (
          <tr key={n}><td><b>{n}</b> <span className="muted">({p.nivaKarta[n]})</span></td>
            <td>{p.ovningar[n].length === 0 ? <span className="muted">—</span> : <ul style={{ margin: 0, paddingLeft: 18 }}>{p.ovningar[n].map((o, i) => <li key={i}><b>{o.avsnitt}:</b> {o.uppgifter}</li>)}</ul>}</td></tr>
        ))}</tbody></table>
      {p.repetitionSidor.length > 0 && <p className="small"><b>Läs igenom:</b> {p.repetitionSidor.join(' · ')}</p>}
    </div>
  );
}
