/**
 * ☁ Datarepo — en plats för nyckeln och allt som synkas mot
 * github.com/<ägare>/classroom-planner-data: strukturen (klasser, elever,
 * resultat, planeringar, mallar), böckerna under books/ och rapportmallarna
 * under rapportmallar/. Anslutningstestet säger exakt vad som saknas när
 * något inte går.
 */
import { useState } from 'react';
import { bokFromValfriImport, sparaBok, sparaRapportmall, tolkaRapportmall, type Struktur } from '@planner/kernel';
import { Ikon } from './ikoner.js';
import { DataSaknas, Kort, Kpi } from './Skal.js';
import {
  hamtaBockerFranGitHub, hamtaFilerFranGitHub, konfigKomplett, laddaFranGitHub, lasGitHubConfig, sparaGitHubConfig, sparaTillGitHub, testaAnslutning,
  type GitHubConfig,
} from '../github.js';
import { exportJson, importJson, lasStruktur } from '../store.js';

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
      </div>
    </div>
  );
}
