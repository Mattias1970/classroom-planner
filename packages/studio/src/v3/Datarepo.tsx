/**
 * ☁ Datarepo — en plats för nyckeln och allt som synkas mot
 * github.com/<ägare>/classroom-planner-data: strukturen (klasser, elever,
 * resultat, planeringar, mallar), böckerna under books/ och rapportmallarna
 * under rapportmallar/. Anslutningstestet säger exakt vad som saknas när
 * något inte går.
 */
import { useMemo, useState } from 'react';
import { amneForArkivSokvag, arArkivFilImporterad, ARKIV_KALLA_NAMN, arkivStatus, bokFromValfriImport, sparaBok, sparaRapportmall, tolkaArkivSokvag, tolkaRapportmall, type ArkivKalla, type Struktur } from '@planner/kernel';
import { Ikon } from './ikoner.js';
import { DataSaknas, Kort, Kpi } from './Skal.js';
import {
  hamtaBockerFranGitHub, hamtaFilerFranGitHub, konfigKomplett, laddaFranGitHub, lasGitHubConfig, sparaGitHubConfig, sparaTillGitHub, testaAnslutning,
  type GitHubConfig,
} from '../github.js';
import { exportJson, importJson, lasStruktur } from '../store.js';
import { hamtaArkivFil, laggVantandeFiler, listaArkiv } from '../resultatarkiv.js';

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
      </div>

      <div className="v3-rutnat tva">
        <Kort rubrik="Nyckel och adress" under="tokenen sparas bara i den här webbläsaren och skickas enbart till api.github.com">
          <div className="v3-form">
            <label>Ägare (owner)<input aria-label="Ägare" value={cfg.owner} onChange={(e) => uppdatera({ owner: e.target.value.trim() })} placeholder="Mattias1970" /></label>
            <label>Repo<input aria-label="Repo" value={cfg.repo} onChange={(e) => uppdatera({ repo: e.target.value.trim() })} placeholder="classroom-planner-data" /></label>
            <label>Gren<input aria-label="Gren" value={cfg.branch} onChange={(e) => uppdatera({ branch: e.target.value.trim() })} placeholder="main" /></label>
            <label>Sökväg till strukturen<input aria-label="Sökväg" value={cfg.path} onChange={(e) => uppdatera({ path: e.target.value.trim() })} placeholder="studio/struktur.json" /></label>
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
        <Resultatarkiv s={s} klar={klar} meddela={meddela} />
      </div>
    </div>
  );
}

/**
 * Del 203 · Resultatarkivet: varje importerad resultatfil (Socrative, Magma, DigiExam, Teams) laddas upp
 * till datarepot under resultat/ak8/8B/Biologi/<källa>/. Här syns vad som är uppladdat, vad som saknar
 * kopia, och arkivets filer kan hämtas till en annan dator och läggas fram för import.
 */
function Resultatarkiv({ s, klar, meddela }: { s: Struktur; klar: boolean; meddela: (m: string) => void }) {
  const status = useMemo(() => arkivStatus(s), [s]);
  const [lista, setLista] = useState<string[] | null>(null);
  const [arbetar, setArbetar] = useState<'' | 'lista' | 'hamta'>('');
  const [fel, setFel] = useState<string | null>(null);
  const amneNamn = (id: string) => { const a = s.amnen.find((x) => x.id === id); const k = s.klasser.find((x) => x.id === a?.klassId); return `${k?.namn ?? ''} ${a?.namn ?? '?'}`.trim(); };
  const rader = (lista ?? []).map((sokvag) => {
    const tolk = tolkaArkivSokvag(sokvag); const amneId = amneForArkivSokvag(s, sokvag);
    return { sokvag, tolk, amneId, importerad: tolk !== null && amneId !== null && arArkivFilImporterad(s, amneId, tolk.kalla, tolk.filnamn) };
  });
  const nya = rader.filter((r) => r.tolk !== null && r.amneId !== null && !r.importerad);
  const okanda = rader.filter((r) => r.tolk === null || r.amneId === null);
  const uppdateraLista = () => {
    setArbetar('lista'); setFel(null);
    listaArkiv().then((l) => setLista(l)).catch((e) => setFel(e instanceof Error ? e.message : 'Kunde inte läsa arkivet.')).finally(() => setArbetar(''));
  };
  const hamtaNya = () => {
    setArbetar('hamta'); setFel(null);
    void (async () => {
      const grupper = new Map<string, { amneId: string; klassId: string; kalla: ArkivKalla; filer: File[] }>();
      let antal = 0;
      for (const r of nya) {
        try {
          const fil = await hamtaArkivFil(r.sokvag);
          const amne = s.amnen.find((a) => a.id === r.amneId)!;
          const nyckel = `${r.amneId}|${r.tolk!.kalla}`;
          const g = grupper.get(nyckel) ?? { amneId: r.amneId!, klassId: amne.klassId, kalla: r.tolk!.kalla, filer: [] };
          g.filer.push(fil); grupper.set(nyckel, g); antal += 1;
        } catch (e) { setFel(`${r.sokvag}: ${e instanceof Error ? e.message : 'kunde inte hämtas'}`); }
      }
      for (const g of grupper.values()) laggVantandeFiler(g);
      const var_ = [...grupper.values()].map((g) => `${amneNamn(g.amneId)} · ${ARKIV_KALLA_NAMN[g.kalla]} (${g.filer.length})`).join(', ');
      meddela(antal === 0 ? 'Inga nya filer att hämta.' : `${antal} filer hämtade från datarepot: ${var_}. Öppna Resultat → 📥 Importera för rätt klass och ämne — filerna ligger framme för granskning och import.`);
      setArbetar('');
    })();
  };
  return (
    <Kort rubrik="Resultatarkiv" under="varje importerad resultatfil (Socrative, Magma, DigiExam, Teams) laddas upp till datarepot under resultat/årskurs/klass/ämne/källa — så att filerna följer med till alla datorer">
      <div className="v3-kpi-rad" style={{ marginBottom: 8 }}>
        <Kpi ikon={Ikon.klassrum} rubrik="I datarepot" varde={status.uppladdade} under="importerade filer med kopia i arkivet" ton="gron" />
        <Kpi ikon={Ikon.varning} rubrik="Saknar kopia" varde={status.saknarKopia.length} under={status.saknarKopia.length === 0 ? 'allt är uppladdat' : 'importerade före arkivet, eller när GitHub saknades — importera om filen så laddas den upp'} ton={status.saknarKopia.length === 0 ? 'gron' : 'orange'} />
      </div>
      {status.saknarKopia.length > 0 && (
        <details><summary className="small">Filer utan kopia ({status.saknarKopia.length})</summary>
          <ul className="v3-lista v3-kompakt">{status.saknarKopia.slice(0, 40).map((f) => <li key={`${f.amneId}|${f.filnamn}`}>{amneNamn(f.amneId)} · {ARKIV_KALLA_NAMN[f.kalla]} · {f.filnamn}</li>)}</ul>
        </details>
      )}
      <div className="v3-knapprad" style={{ marginTop: 8 }}>
        <button className="v3-knapp sek" disabled={arbetar !== '' || !klar} onClick={uppdateraLista}>{arbetar === 'lista' ? '⏳ Läser…' : '🔎 Visa arkivet i datarepot'}</button>
        {lista !== null && <button className="v3-knapp" disabled={arbetar !== '' || nya.length === 0} onClick={hamtaNya}>{arbetar === 'hamta' ? '⏳ Hämtar…' : `⬇ Hämta ${nya.length} nya till import`}</button>}
      </div>
      {fel !== null && <p className="status warn small">{fel}</p>}
      {lista !== null && (
        <div style={{ marginTop: 6 }}>
          <p className="small muted">{lista.length} filer i arkivet · {rader.filter((r) => r.importerad).length} importerade här · {nya.length} nya{okanda.length > 0 ? ` · ${okanda.length} utanför konventionen eller för klasser/ämnen som inte finns här` : ''}</p>
          <table className="tbl small"><thead><tr><th>Klass · ämne</th><th>Källa</th><th>Fil</th><th>Här</th></tr></thead>
            <tbody>{rader.slice(0, 200).map((r) => (
              <tr key={r.sokvag} className={r.importerad ? 'muted' : ''}>
                <td>{r.tolk === null ? <span className="muted">{r.sokvag}</span> : r.amneId === null ? <span className="muted">{r.tolk.klass} {r.tolk.amne} (finns inte här)</span> : amneNamn(r.amneId)}</td>
                <td>{r.tolk === null ? '' : ARKIV_KALLA_NAMN[r.tolk.kalla]}</td>
                <td>{r.tolk?.filnamn ?? ''}</td>
                <td>{r.importerad ? '✓ importerad' : r.amneId === null || r.tolk === null ? '—' : <b>ny</b>}</td>
              </tr>
            ))}</tbody></table>
        </div>
      )}
    </Kort>
  );
}
