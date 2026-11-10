/**
 * ☁ Datarepo — en plats för nyckeln och allt som synkas mot
 * github.com/<ägare>/classroom-planner-data: strukturen (klasser, elever,
 * resultat, planeringar, mallar), böckerna under books/ och rapportmallarna
 * under rapportmallar/. Anslutningstestet säger exakt vad som saknas när
 * något inte går.
 */
import { useEffect, useMemo, useState } from 'react';
import { ARKIV_KALLA_NAMN, arkivMappar, arkivStatus, bokFromValfriImport, jamforArkiv, kandaArkivMappar, sparaBok, sparaRapportmall, tolkaRapportmall, type Struktur } from '@planner/kernel';
import { Ikon } from './ikoner.js';
import { DataSaknas, Kort, Kpi } from './Skal.js';
import {
  githubLank, hamtaBockerFranGitHub, hamtaFilerFranGitHub, konfigKomplett, laddaFranGitHub, lasGitHubConfig, lokalSokvag, sparaGitHubConfig, sparaTillGitHub, testaAnslutning,
  type GitHubConfig,
} from '../github.js';
import { exportJson, importJson, LAGRINGSGRANS_TECKEN, lagradeTecken, lasStruktur } from '../store.js';
import { hamtaTillImport, listaArkiv, skickaKoade, useUppladdningsko } from '../resultatarkiv.js';

type Test = Awaited<ReturnType<typeof testaAnslutning>>;

export function Datarepo({ s, spara, kor, meddela }: {
  s: Struktur;
  spara: (ny: Struktur, m: string) => void;
  kor: (fn: () => Struktur, m: string) => void;
  meddela: (m: string) => void;
}) {
  const [cfg, setCfg] = useState<GitHubConfig>(() => lasGitHubConfig());
  const [visaToken, setVisaToken] = useState(false);
  const [arbetar, setArbetar] = useState<'' | 'test' | 'spara' | 'ladda' | 'bocker' | 'mallar'>('');
  const [test, setTest] = useState<Test | null>(null);
  const [logg, setLogg] = useState<string[]>([]);
  const uppdatera = (delta: Partial<GitHubConfig>) => { const ny = { ...cfg, ...delta }; setCfg(ny); sparaGitHubConfig(ny); };
  const klar = konfigKomplett(cfg);
  // Del 241 · hur mycket av webbläsarens lagring appens data tar — när den är full går inget mer att spara
  const lagrat = useMemo(() => lagradeTecken(), [s]);
  const lagratProcent = Math.round((lagrat / LAGRINGSGRANS_TECKEN) * 100);
  const miljoner = (n: number) => (n / 1e6).toFixed(1).replace('.', ',');
  const skriv = (rad: string) => setLogg((l) => [rad, ...l].slice(0, 12));

  const testa = () => {
    setArbetar('test'); setTest(null);
    void testaAnslutning(cfg).then((t) => { setTest(t); skriv(t.fel === null ? `✅ Ansluten som ${t.anvandare ?? '?'} till ${t.repo}` : `❌ ${t.fel}`); }).finally(() => setArbetar(''));
  };
  const sparaStruktur = () => {
    setArbetar('spara');
    void sparaTillGitHub(cfg, exportJson(s)).then(() => { skriv(`✅ Strukturen sparad till ${cfg.path}`); meddela(`✓ Sparat till ${cfg.owner}/${cfg.repo}/${cfg.path}.`); })
      .catch((e: unknown) => { const m = e instanceof Error ? e.message : String(e); skriv(`❌ Spara: ${m}`); meddela(`✗ ${m}`); }).finally(() => setArbetar(''));
  };
  const laddaStruktur = () => {
    if (!window.confirm('Ladda strukturen från datarepot? Det ersätter det som finns i den här webbläsaren (en Backup-fil är en bra försäkring).')) return;
    setArbetar('ladda');
    void laddaFranGitHub(cfg).then((json) => { spara(importJson(json), `✓ Laddat från ${cfg.owner}/${cfg.repo}/${cfg.path}.`); skriv('✅ Strukturen laddad'); })
      .catch((e: unknown) => { const m = e instanceof Error ? e.message : String(e); skriv(`❌ Ladda: ${m}`); meddela(`✗ ${m}`); }).finally(() => setArbetar(''));
  };
  const hamtaBocker = () => {
    setArbetar('bocker');
    void hamtaBockerFranGitHub(cfg).then((bocker) => {
      let antal = 0;
      for (const { id, json } of bocker) {
        try {
          const bok = bokFromValfriImport(json);
          kor(() => sparaBok(lasStruktur(), bok), `Bok "${bok.titel}" hämtad från datarepot.`);
          skriv(`✅ ${id}: ${bok.titel} (${bok.amne}, åk ${bok.arskurs})`); antal += 1;
        } catch (fel) { skriv(`⚠ ${id}: ${(fel as Error).message}`); }
      }
      meddela(`${antal} böcker hämtade från datarepot.`);
    }).catch((e: unknown) => { const m = e instanceof Error ? e.message : String(e); skriv(`❌ Böcker: ${m}`); meddela(`✗ ${m}`); }).finally(() => setArbetar(''));
  };
  const hamtaMallar = () => {
    setArbetar('mallar');
    const idag = new Date().toISOString().slice(0, 10);
    void hamtaFilerFranGitHub(cfg, /^rapportmallar\/.+\.json$/).then((filer) => {
      let antal = 0;
      kor(() => { let st = lasStruktur(); for (const f of filer) { try { st = sparaRapportmall(st, tolkaRapportmall(f.json), idag); antal += 1; } catch { skriv(`⚠ ${f.sokvag}: kunde inte tolkas`); } } return st; }, `${antal} rapportmallar hämtade.`);
      skriv(`✅ ${antal} rapportmallar hämtade`);
    }).catch((e: unknown) => { const m = e instanceof Error ? e.message : String(e); skriv(`❌ Mallar: ${m}`); meddela(`✗ ${m}`); }).finally(() => setArbetar(''));
  };

  return (
    <div className="v3-sida-innehall">
      <div className="v3-kpi-rad">
        <Kpi ikon={Ikon.klassrum} rubrik="Datarepo" varde={cfg.repo || '—'} under={cfg.owner !== '' ? `${cfg.owner} · ${cfg.branch}` : 'inte ifyllt'} ton="bla" />
        <Kpi ikon={Ikon.bok} rubrik="Böcker i appen" varde={String(s.bocker.length)} under={test !== null ? `${test.bocker.length} i repot` : 'testa anslutningen'} ton="gron" />
        <Kpi ikon={Ikon.staplar} rubrik="Resultat i appen" varde={String((s.resultat ?? []).length)} under={`${s.elever.length} elever · ${s.klasser.length} klasser`} ton="lila" />
        <Kpi ikon={Ikon.kalender} rubrik="Rapportmallar" varde={String((s.rapportmallar ?? []).length)} under={test !== null ? `${test.mallar} i repot` : ''} ton="orange" />
        <Kpi ikon={lagratProcent >= 80 ? Ikon.varning : Ikon.klassrum} rubrik="Lagring i webbläsaren" varde={`${lagratProcent} %`}
          under={`${miljoner(lagrat)} av ca ${miljoner(LAGRINGSGRANS_TECKEN)} miljoner tecken${lagratProcent >= 80 ? ' — snart fullt: spara strukturen till datarepot' : ''}`} ton={lagratProcent >= 80 ? 'orange' : 'gron'} />
      </div>

      <div className="v3-rutnat tva">
        <Kort rubrik="Nyckel och adress" under="tokenen sparas bara i den här webbläsaren och skickas enbart till api.github.com">
          <div className="v3-form">
            <label>Ägare (owner)<input aria-label="Ägare" value={cfg.owner} onChange={(e) => uppdatera({ owner: e.target.value.trim() })} placeholder="Mattias1970" /></label>
            <label>Repo<input aria-label="Repo" value={cfg.repo} onChange={(e) => uppdatera({ repo: e.target.value.trim() })} placeholder="classroom-planner-data" /></label>
            <label>Gren<input aria-label="Gren" value={cfg.branch} onChange={(e) => uppdatera({ branch: e.target.value.trim() })} placeholder="main" /></label>
            <label>Sökväg till strukturen<input aria-label="Sökväg" value={cfg.path} onChange={(e) => uppdatera({ path: e.target.value.trim() })} placeholder="studio/struktur.json" /></label>
            <label className="v3-form-bred">Mapp på den här datorn där datarepot är klonat (valfritt — visar var filerna ligger lokalt)
              <input aria-label="Lokal mapp" value={cfg.lokalMapp ?? ''} onChange={(e) => uppdatera({ lokalMapp: e.target.value })} placeholder={'C:\\Users\\…\\Code\\classroom-planner-data'} /></label>
            <label className="v3-form-bred">Token (fine-grained PAT, Contents: Read and write på datarepot)
              <div className="v3-token">
                <input aria-label="Token" type={visaToken ? 'text' : 'password'} value={cfg.token} onChange={(e) => uppdatera({ token: e.target.value.trim() })} placeholder="github_pat_…" autoComplete="off" />
                <button className="v3-knapp sek" type="button" onClick={() => setVisaToken((v) => !v)}>{visaToken ? 'Dölj' : 'Visa'}</button>
                <button className="v3-knapp sek" type="button" onClick={() => uppdatera({ token: '' })} title="Ta bort tokenen från den här webbläsaren">Glöm</button>
              </div>
            </label>
          </div>
          <div className="v3-knapprad">
            <button className="v3-knapp" disabled={arbetar !== '' || !klar} onClick={testa}>{arbetar === 'test' ? '⏳ Testar…' : '🔌 Testa anslutningen'}</button>
            {!klar && <small className="v3-kpi-under">Fyll i alla fält för att kunna testa.</small>}
          </div>
          {test !== null && (
            <div className={`v3-testresultat ${test.fel === null ? 'ok' : 'fel'}`}>
              {test.fel !== null && <p><b>Problem:</b> {test.fel}</p>}
              {test.anvandare !== null && <p>Inloggad som <b>{test.anvandare}</b> · {test.repo}</p>}
              <p>Struktur ({cfg.path}): <b>{test.struktur ? 'finns' : 'saknas — spara härifrån först'}</b></p>
              <p>Böcker: <b>{test.bocker.length}</b>{test.bocker.length > 0 && <span className="v3-kpi-under"> — {test.bocker.map((b) => b.split('/').slice(1, -1).join('/')).join(', ')}</span>}</p>
              {test.bocker.length === 0 && test.fel === null && <p className="v3-kpi-under">Inga <code>books/…/book.json</code> i repot. Bokfilerna ska ligga som <code>books/ma/liber-matematik-y/book.json</code> (valfritt djup under books/).</p>}
              <p>Rapportmallar: <b>{test.mallar}</b></p>
            </div>
          )}
        </Kort>

        <Kort rubrik="Ladda och spara" under="strukturen är hela appen: skolår, klasser, elever, resultat, planeringar och mallar">
          <div className="v3-synkrad">
            <div className="v3-synkkort">
              <b>⬆ Spara till datarepot</b>
              <p className="v3-kpi-under">Skriver {cfg.path || 'studio/struktur.json'} — det som finns där ersätts. Gör detta på datorn som har den senaste datan.</p>
              <button className="v3-knapp" disabled={arbetar !== '' || !klar} onClick={sparaStruktur}>{arbetar === 'spara' ? '⏳ Sparar…' : 'Spara strukturen'}</button>
            </div>
            <div className="v3-synkkort">
              <b>⬇ Ladda från datarepot</b>
              <p className="v3-kpi-under">Hämtar strukturen till den här webbläsaren. Klarar filer över 1 MB.</p>
              <button className="v3-knapp sek" disabled={arbetar !== '' || !klar} onClick={laddaStruktur}>{arbetar === 'ladda' ? '⏳ Laddar…' : 'Ladda strukturen'}</button>
            </div>
            <div className="v3-synkkort">
              <b>📚 Hämta böcker</b>
              <p className="v3-kpi-under">Alla <code>books/…/book.json</code>. Böcker med samma id uppdateras (begreppsförklaringar följer med).</p>
              <button className="v3-knapp sek" disabled={arbetar !== '' || !klar} onClick={hamtaBocker}>{arbetar === 'bocker' ? '⏳ Hämtar…' : 'Hämta böcker'}</button>
            </div>
            <div className="v3-synkkort">
              <b>🎨 Hämta rapportmallar</b>
              <p className="v3-kpi-under">Alla <code>rapportmallar/*.json</code>. Mallar sparas dit från Rapportdesign.</p>
              <button className="v3-knapp sek" disabled={arbetar !== '' || !klar} onClick={hamtaMallar}>{arbetar === 'mallar' ? '⏳ Hämtar…' : 'Hämta mallar'}</button>
            </div>
          </div>
          {logg.length === 0 ? <DataSaknas text="Inget har hänt än." /> : <ul className="v3-lista v3-kompakt">{logg.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        </Kort>
      </div>
      {/* Del 239: hela bredden — mapparna och sökvägarna behöver plats */}
      <Resultatarkiv s={s} cfg={cfg} klar={klar} meddela={meddela} uppdatera={() => spara(lasStruktur(), '')} />
    </div>
  );
}

/**
 * Del 203 · Resultatarkivet: varje importerad resultatfil (Socrative, Magma, DigiExam, Teams) laddas upp
 * till datarepot under resultat/ak8/8B/Biologi/<källa>/. Här syns vad som är uppladdat, vad som saknar
 * kopia, och arkivets filer kan hämtas till en annan dator och läggas fram för import.
 *
 * Del 239 · Panelen visar var mapparna och filerna ligger (sökväg i datarepot, länk till github.com och —
 * om den lokala klonen är angiven — mappen på datorn), läser arkivet själv när sidan öppnas, och visar
 * filer som väntar på uppladdning.
 */
function Resultatarkiv({ s, cfg, klar, meddela, uppdatera }: { s: Struktur; cfg: GitHubConfig; klar: boolean; meddela: (m: string) => void; uppdatera: () => void }) {
  const status = useMemo(() => arkivStatus(s), [s]);
  const [lista, setLista] = useState<string[] | null>(null);
  const [arbetar, setArbetar] = useState<'' | 'lista' | 'hamta' | 'ko'>('');
  const [fel, setFel] = useState<string | null>(null);
  const iKo = useUppladdningsko();
  const amneNamn = (id: string | null) => { const a = s.amnen.find((x) => x.id === id); const k = s.klasser.find((x) => x.id === a?.klassId); return `${k?.namn ?? ''} ${a?.namn ?? '?'}`.trim(); };
  const j = useMemo(() => jamforArkiv(s, lista ?? []), [s, lista]);
  // Mapparna: ur datarepot när arkivet är läst, annars det appen själv vet att den har laddat upp
  const mappar = useMemo(() => (lista !== null ? arkivMappar(j.rader) : kandaArkivMappar(s)), [s, lista, j]);
  const uppdateraLista = () => {
    setArbetar('lista'); setFel(null);
    listaArkiv().then((l) => setLista(l)).catch((e) => setFel(e instanceof Error ? e.message : 'Kunde inte läsa arkivet.')).finally(() => setArbetar(''));
  };
  // Del 239: arkivet läses när sidan öppnas (ett anrop) — ingen knapp behövs för att se var filerna ligger
  useEffect(() => { if (klar) uppdateraLista(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hamtaNya = () => {
    setArbetar('hamta'); setFel(null);
    void hamtaTillImport(j.nya).then((u) => {
      if (u.fel.length > 0) setFel(u.fel[0]);
      const var_ = u.grupper.map((g) => `${amneNamn(g.amneId)} · ${ARKIV_KALLA_NAMN[g.kalla]} (${g.antal})`).join(', ');
      meddela(u.antal === 0 ? 'Inga nya filer att hämta.' : `${u.antal} filer hämtade från datarepot: ${var_}. Öppna Resultat → 📥 Importera för rätt klass och ämne — filerna ligger framme för granskning och import.`);
    }).finally(() => setArbetar(''));
  };
  const skickaKo = () => {
    setArbetar('ko'); setFel(null);
    void skickaKoade().then((u) => {
      if (u.skickade.length > 0) { uppdatera(); uppdateraLista(); }
      if (u.fel !== null) setFel(`Uppladdningen stannade: ${u.fel}`);
      meddela(u.skickade.length === 0 ? `Inget kunde laddas upp${u.fel !== null ? ` — ${u.fel}` : ''}.` : `☁ ${u.skickade.length} väntande filer uppladdade till datarepot${u.kvar > 0 ? ` · ${u.kvar} väntar fortfarande` : ''}.`);
    }).finally(() => setArbetar((a) => (a === 'ko' ? '' : a)));
  };
  const rot = githubLank(cfg, 'resultat');
  const lokalRot = lokalSokvag(cfg, 'resultat');
  return (
    <Kort rubrik="Resultatarkiv" under="varje importerad resultatfil (Socrative, Magma, DigiExam, Teams) laddas automatiskt upp till datarepot under resultat/årskurs/klass/ämne/källa — så att filerna följer med till alla datorer">
      <div className="v3-kpi-rad" style={{ marginBottom: 8 }}>
        <Kpi ikon={Ikon.klassrum} rubrik="I datarepot" varde={status.uppladdade} under="importerade filer med kopia i arkivet" ton="gron" />
        <Kpi ikon={Ikon.varning} rubrik="Saknar kopia" varde={status.saknarKopia.length} under={status.saknarKopia.length === 0 ? 'allt är uppladdat' : iKo > 0 ? `${iKo} av dem väntar på uppladdning och skickas automatiskt` : 'importerade före arkivet — importera om filen så laddas den upp'} ton={status.saknarKopia.length === 0 ? 'gron' : 'orange'} />
        <Kpi ikon={Ikon.kalender} rubrik="Väntar på uppladdning" varde={iKo} under={iKo === 0 ? 'inget i kö' : 'skickas automatiskt när appen startar eller aktiveras'} ton={iKo === 0 ? 'gron' : 'orange'} />
      </div>
      {iKo > 0 && <div className="v3-knapprad" style={{ marginTop: 0, marginBottom: 8 }}><button className="v3-knapp sek" disabled={arbetar !== '' || !klar} onClick={skickaKo}>{arbetar === 'ko' ? '⏳ Laddar upp…' : `⬆ Ladda upp ${iKo} väntande nu`}</button>{!klar && <small className="v3-kpi-under">Fyll i nyckel och adress först.</small>}</div>}
      {status.saknarKopia.length > 0 && (
        <details><summary className="small">Filer utan kopia ({status.saknarKopia.length})</summary>
          <ul className="v3-lista v3-kompakt">{status.saknarKopia.slice(0, 40).map((f) => <li key={`${f.amneId}|${f.filnamn}`}>{amneNamn(f.amneId)} · {ARKIV_KALLA_NAMN[f.kalla]} · {f.filnamn}</li>)}</ul>
        </details>
      )}

      <h4 style={{ margin: '12px 0 4px' }}>📁 Var filerna ligger</h4>
      <p className="small" style={{ margin: '0 0 6px' }}>
        I datarepot: <code className="arkivsokvag">resultat/ak&lt;årskurs&gt;/&lt;klass&gt;/&lt;ämne&gt;/&lt;källa&gt;/&lt;fil&gt;</code>
        {klar && <> · <a href={rot} target="_blank" rel="noreferrer">öppna resultat/ på github.com ↗</a></>}
        {lokalRot !== null
          ? <><br />På den här datorn: <code className="arkivsokvag">{lokalRot}</code> <span className="muted">(uppdateras med <code>git pull</code> i mappen)</span></>
          : <><br /><span className="muted">Ange mappen där datarepot är klonat under <i>Nyckel och adress</i> så visas också var filerna ligger på datorn.</span></>}
      </p>
      {mappar.length === 0
        ? <p className="small muted">{lista === null ? (klar ? 'Arkivet är inte läst än.' : 'Fyll i nyckel och adress för att läsa arkivet.') : 'Inga resultatfiler i datarepot ännu — nästa import laddas upp hit.'}</p>
        : (
          <table className="tbl small arkivmappar"><thead><tr><th>Klass · ämne</th><th>Källa</th><th>Mapp</th><th>Filer</th><th>Nya här</th></tr></thead>
            <tbody>{mappar.map((m) => {
              const lokal = lokalSokvag(cfg, m.mapp);
              return (
                <tr key={m.mapp}>
                  <td>{m.amneId !== null ? amneNamn(m.amneId) : <span className="muted">finns inte här</span>}</td>
                  <td>{m.kalla !== null ? ARKIV_KALLA_NAMN[m.kalla] : ''}</td>
                  <td>
                    {klar ? <a href={githubLank(cfg, m.mapp)} target="_blank" rel="noreferrer" title="Öppna mappen på github.com"><code className="arkivsokvag">{m.mapp}/</code></a> : <code className="arkivsokvag">{m.mapp}/</code>}
                    {lokal !== null && <span className="lokal">{lokal}</span>}
                    <details><summary className="small">Visa filerna ({m.filer.length})</summary>
                      <ul className="v3-lista v3-kompakt">{m.filer.slice(0, 200).map((f) => <li key={f}>{klar ? <a href={githubLank(cfg, `${m.mapp}/${f}`, 'blob')} target="_blank" rel="noreferrer">{f}</a> : f}</li>)}</ul>
                    </details>
                  </td>
                  <td>{m.filer.length}</td>
                  <td>{lista === null ? '' : m.nya > 0 ? <b>{m.nya} nya</b> : m.amneId !== null ? '✓ alla importerade' : '—'}</td>
                </tr>
              );
            })}</tbody></table>
        )}
      {lista === null && mappar.length > 0 && <p className="small muted">Listan visar det som laddats upp härifrån. Läs arkivet för att se allt som finns i datarepot.</p>}

      <div className="v3-knapprad" style={{ marginTop: 8 }}>
        <button className="v3-knapp sek" disabled={arbetar !== '' || !klar} onClick={uppdateraLista}>{arbetar === 'lista' ? '⏳ Läser…' : lista === null ? '🔎 Läs arkivet i datarepot' : '🔄 Läs arkivet igen'}</button>
        {lista !== null && <button className="v3-knapp" disabled={arbetar !== '' || j.nya.length === 0} onClick={hamtaNya}>{arbetar === 'hamta' ? '⏳ Hämtar…' : `⬇ Hämta ${j.nya.length} nya till import`}</button>}
      </div>
      {fel !== null && <p className="status warn small">{fel}</p>}
      {lista !== null && (
        <p className="small muted" style={{ marginTop: 6 }}>{lista.length} filer i arkivet · {j.importerade} importerade här · {j.nya.length} nya{j.okanda.length > 0 ? ` · ${j.okanda.length} utanför konventionen eller för klasser/ämnen som inte finns här` : ''}. Appen kontrollerar arkivet själv när den startar och frågar om nya resultat ska laddas.</p>
      )}
    </Kort>
  );
}
