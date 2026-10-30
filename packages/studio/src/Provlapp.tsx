/**
 * Del 151 · Provlappen på provlektionens kort: knappen "Generera provlapp" bygger
 * lappen ur planeringen (kernel provlapp.ts) — avsnitten före provet med mål,
 * begrepp, uppgifter per nivå och övningsförslag för E/C/A — visar den för
 * läsning och laddar ner den som Word (provlappWord.ts). Lärarens egen text
 * (hjälpmedel, tider) sparas på lektionsplanen och tas med på lappen.
 */
import { useState } from 'react';
import { labMall, noOvningPunkter, provlapp, provlappText, PROVLAPP_OVA_GRANS, tolkaOmfang, type Betygsniva, type Provlapp as ProvlappData, type Struktur } from '@planner/kernel';
import { lasStruktur } from './store.js';
import { djupBreddDataUrl } from './provlappFigur.js';

const NIVAER: Betygsniva[] = ['E', 'C', 'A'];

export function ProvlappPanel({ s, amneId, lektionsIndex, farg, notis, sattNotis, omfang = '', sattOmfang, meddela }: {
  s: Struktur; amneId: string; lektionsIndex: number; farg: string;
  notis: string; sattNotis: (v: string) => void;
  /** Del 199: omfång som text ('6.1-6.5, 7.1-7.5'); tomt = hela kapitlet. */
  omfang?: string; sattOmfang?: (v: string) => void;
  meddela?: (m: string) => void;
}) {
  const omf = tolkaOmfang(omfang);
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
      {sattOmfang !== undefined && (
        <label className="small" style={{ display: 'block', marginBottom: 6 }}>Omfång — vilka delkapitel lappen täcker (tomt = hela kapitlet; t.ex. <code>6.1-6.5, 7.1-7.5</code> för två kapitel)
          <input aria-label="Provlappens omfång" value={omfang} placeholder="6.1-6.5, 7.1-7.5" onChange={(e) => sattOmfang(e.target.value)} style={{ width: '100%' }} />
          {omf.fel !== null && <span className="status warn small" style={{ display: 'block' }}>⚠ {omf.fel}</span>}
        </label>
      )}
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
        <div className="small" style={{ color: farg, fontWeight: 800, letterSpacing: '.08em' }}>PROVLAPP · {p.amne.toUpperCase()} {p.klass} · {p.bok.toUpperCase()} · {p.kapitel.length > 1 ? `KAPITEL ${p.kapitel.map((k) => k.nr).join(' OCH ')}` : `KAPITEL ${p.kapitelNr}`}</div>
        <h3 style={{ margin: '2px 0 4px' }}>{p.kapitelNamn}</h3>
        <div className="small"><b>Prov:</b> {p.provNamn} · <b>Datum:</b> {p.provDatum !== null ? `${p.provDatum}${p.provVecka !== null ? ` (v. ${p.provVecka})` : ''}` : <span className="muted">ej satt</span>} · <b>Omfattar:</b> {p.omfang ?? (p.avsnitt.filter((a) => a.typ === 'delkapitel').map((a) => a.rubrik).join(' · ') || `kapitel ${p.kapitelNr}`)}</div>
        {p.notis !== null && <p className="small" style={{ margin: '4px 0 0' }}><b>Från läraren:</b> {p.notis}</p>}
      </div>

      {p.kapitelMal.length > 0 && (<>
        <h4>{p.kapitel.length > 1 ? 'Det här får du lära dig i kapitlen' : 'Det här får du lära dig i kapitlet'}</h4>
        {p.kapitel.map((k) => k.mal.length === 0 ? null : <div key={k.nr}>{p.kapitel.length > 1 && <b className="small">Kapitel {k.nr} {k.namn}</b>}<ul>{k.mal.map((m, i) => <li key={i}>{m}</li>)}</ul></div>)}
      </>)}

      <h4>1. Det här ska du kunna</h4>
      {delkap.map((a) => (
        <div key={a.rubrik} className="provlapp-avsnitt">
          <b>{a.rubrik}</b>{a.sidor !== '' && a.sidor !== '—' && <span className="muted small"> ({a.sidor})</span>}
          {a.sammanfattning.map((sm, i) => <p key={`s${i}`} className="small provlapp-sammanfattning"><b>Sammanfattning:</b> {sm}</p>)}
          {a.mal.length > 0 ? <ul>{a.mal.map((m, i) => <li key={i}>{m}</li>)}</ul> : null}
          {a.begrepp.length > 0 && <p className="small"><b>Begrepp:</b> {a.begrepp.join(', ')}</p>}
          {a.exempel.length > 0 && <p className="small"><b>Exempel vi räknat:</b> {a.exempel.join(' · ')}</p>}
          {a.djupBredd !== null && (
            <div className="provlapp-djupbredd small">
              <div><b>Djup:</b> {a.djupBredd.djup}</div>
              <div><b>Bredd:</b> {a.djupBredd.bredd}</div>
              {a.labb !== null && <div><b>Labb (E):</b> {a.labb}</div>}
            </div>
          )}
          {a.fragor.length > 0 && (
            <p className="small provlapp-fragor"><b>Begrepp från läxförhör och exit tickets:</b> {a.fragor.map((f, i) => (
              <span key={i} className={f.procent !== null && f.procent < PROVLAPP_OVA_GRANS ? 'provlapp-ova' : ''} title={`${f.fraga} · senast ${f.senast}`}>{i > 0 && ' · '}{f.begrepp ?? f.fraga}{f.procent !== null && <small className="muted"> {f.procent} %{f.procent < PROVLAPP_OVA_GRANS ? ' ⚠' : ''}</small>}</span>
            ))}</p>
          )}
          {a.filmer.length > 0 && <p className="small provlapp-filmer"><b>Filmer:</b> {a.filmer.map((f, i) => <span key={f.url}>{i > 0 && ' · '}<a href={f.url} target="_blank" rel="noreferrer">{f.titel}</a></span>)}</p>}
        </div>
      ))}

      {delkap.some((a) => a.fragor.length > 0) && <p className="small muted">Procenten är klassens andel rätt senast begreppet var med i ett läxförhör eller en exit ticket. ⚠ = under {PROVLAPP_OVA_GRANS} % — öva extra på det.</p>}

      <h4>Så visar du djup och bredd</h4>
      <p className="small"><b>Djup</b> = orsakssamband i flera led: A → B → C, där varje pil svarar på <i>varför</i>. <b>Bredd</b> = flera exempel i ett led: A — exempel 1, 2, 3 — och vad de har gemensamt. Under varje avsnitt ovan finns en djup- och en breddfråga byggd på avsnittets begrepp.</p>
      {(() => { const f = delkap.find((a) => a.djupBredd !== null)?.djupBredd; return f === undefined || f === null ? null : <img className="provlapp-figur" alt="Djup: kedja av orsak och följd. Bredd: ett begrepp med tre exempel." src={djupBreddDataUrl(f.kedja, farg)} />; })()}

      <h4>För E-nivå krävs</h4>
      <ul>{p.kravE.map((k, i) => <li key={i}>{k}</li>)}</ul>
      {p.noAmne && (() => { const fragor = delkap.flatMap((a) => a.labFragor); return (
        <div className="provlapp-lab small">
          <b>Enkel laborationsbeskrivning — tre steg</b>
          <ol>{labMall(fragor[0] ?? null).map((m) => <li key={m.steg}><b>{m.steg}</b> {m.text}</li>)}</ol>
          {fragor.length > 1 && <p className="muted">Laborationsfrågor i omfånget: {fragor.join(' · ')}</p>}
        </div>
      ); })()}

      {p.begrepp.length > 0 && (<>
        <h4>2. Begrepp du ska kunna förklara</h4>
        {p.noAmne && <p className="small muted">{p.begreppKalla === 'socrative' ? 'Beskrivningarna är de från läxförhören i Socrative (senaste versionen).' : p.begreppKalla === 'blandat' ? 'Beskrivningarna är de från läxförhören i Socrative (senaste versionen); begrepp som inte varit med i ett förhör har bokens förklaring.' : 'Beskrivningarna är bokens — inga läxförhör med facit finns än för de här begreppen.'}</p>}
        <table className="tbl small"><thead><tr><th>Begrepp</th><th>{p.noAmne ? 'Beskrivning' : 'Förklaring'}</th></tr></thead>
          <tbody>{p.begrepp.map((b) => <tr key={b.begrepp}><td><b>{b.begrepp}</b></td><td>{b.forklaring ?? <span className="muted">—</span>}</td></tr>)}</tbody></table>
      </>)}

      {p.noOvning !== null ? <NoOvningVy p={p} /> : (<>
        <h4>3. Vad krävs för E, C och A?</h4>
        <p className="small">E tränas med <b>{p.nivaKarta.E}</b>, C med <b>{p.nivaKarta.C}</b>, A med <b>{p.nivaKarta.A}</b>. E: metoderna rätt på grundläggande uppgifter. C: flera steg, förklara varför, bedöma rimlighet. A: egen strategi, generalisera och motivera.</p>

        <h4>4. Övningsförslag för varje nivå</h4>
        <table className="tbl small provlapp-ovningar"><thead><tr><th>Nivå</th><th>Uppgifter i boken</th></tr></thead>
          <tbody>{NIVAER.map((n) => (
            <tr key={n}><td><b>{n}</b> <span className="muted">({p.nivaKarta[n]})</span></td>
              <td>{p.ovningar[n].length === 0 ? <span className="muted">—</span> : <ul style={{ margin: 0, paddingLeft: 18 }}>{p.ovningar[n].map((o, i) => <li key={i}><b>{o.avsnitt}:</b> {o.uppgifter}</li>)}</ul>}</td></tr>
          ))}</tbody></table>
        {p.repetitionSidor.length > 0 && <p className="small"><b>Läs igenom:</b> {p.repetitionSidor.join(' · ')}</p>}
      </>)}
    </div>
  );
}

/** Del 213 · NO: Så övar du för E, så övar du för C och A, Testa dig själv-frågorna och alla filmer. */
function NoOvningVy({ p }: { p: ProvlappData }) {
  const { E, CA } = noOvningPunkter(p);
  const o = p.noOvning!;
  const tds = p.avsnitt.filter((a) => a.testaFragor.length > 0);
  return (
    <div className="provlapp-no-ovning">
      <h4>3. Så övar du för E</h4>
      <ul>{E.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {o.rum.length > 0 && <p className="small"><b>Socrative-rum:</b> {o.rum.map((r) => <code key={r} style={{ marginRight: 6 }}>{r}</code>)}</p>}
      <h4>4. Så övar du för C och A</h4>
      <ul>{CA.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {tds.length > 0 && (<>
        <h4>Testa dig själv-frågorna</h4>
        {tds.map((a) => <div key={a.rubrik} className="provlapp-tds"><b className="small">{a.rubrik}</b><ol className="small">{a.testaFragor.map((f, i) => <li key={i}>{f}</li>)}</ol></div>)}
      </>)}
      {o.filmer.length > 0 && (<>
        <h4>Filmer på Binogi</h4>
        <ul className="small">{o.filmer.map((f, i) => <li key={i}><span className="muted">{f.avsnitt.split(' ')[0]}</span> <a href={f.url} target="_blank" rel="noreferrer">{f.titel}</a> <small className="muted">{f.url}</small></li>)}</ul>
      </>)}
    </div>
  );
}
