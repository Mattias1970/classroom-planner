/**
 * NO-planering (del 26). Läser books/spektrum-biologi/book.json från
 * datakällan (GitHub via inställningarnas token) eller via manuell import,
 * validerar med kärnans validateBiologiBok och visar planeringen enligt
 * NO-mallen: en lektion per delkapitel med Socrative-rum (exit ≥ 70 %,
 * kumulativt läxförhör ≥ 90 %), följt av Perspektiv, FINALEN och prov.
 * Senast hämtad bok cachas lokalt (NFR-005) så vyn fungerar offline.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  NO_KRAV_EXIT, NO_KRAV_LAXFORHOR, biologiBokTillLokalBok, validateBiologiBok,
  type BiologiBokFil, type BiologiDelkapitel, type BiologiKapitel, type LessonRecord,
} from '@planner/core';
import { getSettings, lsGet, lsSet } from '../state/store.js';
import { githubReader } from '../state/githubReader.js';

export const NO_BOK_PATH = 'books/spektrum-biologi/book.json';
const CACHE_KEY = 'classroom-planner.no-bok.v1';

function tolka(text: string): BiologiBokFil {
  return validateBiologiBok(JSON.parse(text) as unknown);
}

export function NoPlanering() {
  const [bok, setBok] = useState<BiologiBokFil | null>(null);
  const [kalla, setKalla] = useState<'cache' | 'datakalla' | 'fil' | null>(null);
  const [valdKap, setValdKap] = useState<number | null>(null);
  const [oppet, setOppet] = useState<string | null>(null); // delkapitelnummer, t.ex. "6.1"
  const [msg, setMsg] = useState('');
  const [laddar, setLaddar] = useState(false);

  const satt = (b: BiologiBokFil, k: 'cache' | 'datakalla' | 'fil') => {
    setBok(b); setKalla(k);
    setValdKap((v) => (v !== null && b.kapitel.some((x) => x.nummer === v) ? v : b.kapitel[0]?.nummer ?? null));
  };

  useEffect(() => { // cachen först (snabb start), sedan datakällan om token finns
    const cached = lsGet(CACHE_KEY);
    if (cached) { try { satt(tolka(cached), 'cache'); } catch { /* trasig cache ignoreras */ } }
    if (getSettings().githubToken !== '') void hamta(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hamta = async (tyst = false) => {
    const s = getSettings();
    if (s.githubToken === '') { setMsg('✗ Ingen GitHub-token — lägg in den under ⚙ Inställningar, eller importera book.json manuellt.'); return; }
    setLaddar(true);
    try {
      const text = await githubReader(s.githubOwner, s.githubRepo, s.githubToken).readText(NO_BOK_PATH);
      if (text === null) { if (!tyst) setMsg(`✗ ${NO_BOK_PATH} saknas i ${s.githubOwner}/${s.githubRepo}.`); return; }
      const b = tolka(text);
      lsSet(CACHE_KEY, text);
      satt(b, 'datakalla');
      if (!tyst) setMsg(`✓ "${b.titel}" hämtad — ${b.kapitel.length} kapitel.`);
    } catch (e) {
      if (!tyst) setMsg(`✗ ${(e as Error).message}`);
    } finally { setLaddar(false); }
  };

  const importera = async (file: File) => {
    try {
      const text = await file.text();
      const b = tolka(text);
      lsSet(CACHE_KEY, text);
      satt(b, 'fil');
      setMsg(`✓ "${b.titel}" importerad — ${b.kapitel.length} kapitel.`);
    } catch (e) { setMsg(`✗ ${(e as Error).message}`); }
  };

  const lokal = useMemo(() => (bok ? biologiBokTillLokalBok(bok) : null), [bok]);
  const kap: BiologiKapitel | null = useMemo(
    () => bok?.kapitel.find((k) => k.nummer === valdKap) ?? null,
    [bok, valdKap],
  );
  const lektioner: LessonRecord[] = (lokal && valdKap !== null ? lokal.lektioner[valdKap] : undefined) ?? [];
  const delkapitelAv = (avsnitt: string): BiologiDelkapitel | undefined =>
    kap?.delkapitel.find((d) => d.nummer === avsnitt);

  return (
    <div className="card">
      <div className="title">🧬 NO-planering — Spektrum Biologi</div>
      <p className="note">
        Planeringen byggs ur <b>{NO_BOK_PATH}</b> i datakällan: en lektion per delkapitel enligt NO-mallen
        (läxförhör → genomgång → arbete → exit ticket). Socrative-rummen följer namnkonventionen — enskilt rum
        per delkapitel som exit ticket (krav ≥ {NO_KRAV_EXIT} %) och kumulativt rum med alla delkapitelsiffror
        i följd som läxförhör (krav ≥ {NO_KRAV_LAXFORHOR} %), t.ex. Biologi61 → Biologi612 → Biologi6123.
      </p>

      <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <button className="btn sec" disabled={laddar} onClick={() => void hamta()}>
          {laddar ? '⏳ Hämtar…' : '⟳ Hämta från datakällan'}
        </button>
        <label className="btn sec file-btn">⬆ Importera book.json
          <input type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importera(f); e.target.value = ''; }} />
        </label>
        {kalla && (
          <span className={`pill src-${kalla === 'datakalla' ? 'datakalla' : 'egen'}`}>
            {kalla === 'datakalla' ? 'Datakälla' : kalla === 'fil' ? 'Importerad fil' : 'Lokal cache'}
          </span>
        )}
      </div>
      {msg && <p className="status">{msg}</p>}

      {!bok && <p className="muted">Ingen NO-bok inläst ännu — hämta från datakällan eller importera filen manuellt.</p>}

      {bok && (
        <>
          <p className="muted">
            <b>{bok.titel}</b> · {bok.forlag} · {bok.amne} · Åk {bok.arskurs} · {bok.kapitel.length} kapitel
          </p>
          <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {bok.kapitel.map((k) => (
              <button key={k.nummer} className={`prio-pill ${valdKap === k.nummer ? 'on' : ''}`}
                onClick={() => { setValdKap(k.nummer); setOppet(null); }}>
                {k.nummer}. {k.titel}
              </button>
            ))}
          </div>
        </>
      )}

      {bok && kap && (
        <div>
          <div className="head-row">
            <div>
              <b>{kap.nummer}. {kap.titel}</b>
              {kap.undertitel && <span className="muted"> — {kap.undertitel}</span>}<br />
              <small className="muted">
                s. {kap.sidor}
                {kap.sammanfattning && <> · Sammanfattning s. {kap.sammanfattning.sidor}</>}
                {kap.finalen && <> · FINALEN s. {kap.finalen.sidor}</>}
              </small>
            </div>
          </div>

          {kap.mal.length > 0 && (
            <>
              <p className="note" style={{ marginBottom: 4 }}><b>Här får du lära dig:</b></p>
              <ul className="muted" style={{ marginTop: 0 }}>
                {kap.mal.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </>
          )}

          <table className="tbl clickable">
            <thead>
              <tr>
                <th>#</th><th>Avsnitt</th><th>Innehåll</th><th>Sidor</th><th>Begrepp</th>
                <th>Läxförhör</th><th>Exit ticket</th><th>Läxa</th>
              </tr>
            </thead>
            <tbody>
              {lektioner.map((l) => {
                const d = delkapitelAv(l.avsnitt);
                const rader = [(
                  <tr key={l.id} onClick={() => d && setOppet(oppet === d.nummer ? null : d.nummer)}
                    style={d ? { cursor: 'pointer' } : undefined}>
                    <td>{l.id}</td>
                    <td>{d ? `${oppet === d.nummer ? '▾' : '▸'} ${l.avsnitt}` : l.avsnitt}</td>
                    <td>{l.genomgang}</td>
                    <td>{l.sidor_teori}</td>
                    <td>{l.begrepp.length > 60 ? `${l.begrepp.slice(0, 60)}…` : l.begrepp}</td>
                    <td>{l.soc_start}</td>
                    <td>{l.exit}</td>
                    <td>{l.laxa}</td>
                  </tr>
                )];
                if (d && oppet === d.nummer) {
                  rader.push(
                    <tr key={`${l.id}-detalj`}>
                      <td colSpan={8}>
                        {d.begrepp.length > 0 && <p style={{ margin: '4px 0' }}><b>Begrepp:</b> {d.begrepp.join(' · ')}</p>}
                        {d.extraBegrepp.length > 0 && (
                          <p className="muted" style={{ margin: '4px 0' }}>
                            <b>Extra kursiva begrepp:</b> {d.extraBegrepp.join(', ')}
                          </p>
                        )}
                        {d.testaDigSjalv && d.testaDigSjalv.fragor.length > 0 && (
                          <>
                            <p style={{ margin: '4px 0' }}>
                              <b>Testa dig själv {d.nummer}</b>
                              {d.testaDigSjalv.sida !== undefined && <span className="muted"> (s. {d.testaDigSjalv.sida})</span>}
                            </p>
                            <ol style={{ marginTop: 0 }}>
                              {d.testaDigSjalv.fragor.map((f, i) => <li key={i}>{f}</li>)}
                            </ol>
                          </>
                        )}
                      </td>
                    </tr>,
                  );
                }
                return rader;
              })}
            </tbody>
          </table>

          {kap.perspektiv && kap.perspektiv.fragor.length > 0 && (
            <div className="cm-card" style={{ display: 'block' }}>
              <b>PERSPEKTIV: {kap.perspektiv.titel}</b> <span className="muted">(s. {kap.perspektiv.sidor})</span>
              <ol style={{ marginBottom: 0 }}>
                {kap.perspektiv.fragor.map((f, i) => <li key={i}>{f}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
