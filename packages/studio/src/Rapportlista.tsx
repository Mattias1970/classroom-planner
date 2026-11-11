/**
 * Del 244 · 📋 Rapportlistan — facit över vilka Socrative-rapporter som finns, och vad som återstår att ladda upp.
 *
 * Läraren klistrar in listan från Socratives sida Reports (namn, datum, rum). Panelen visar per rum hur många
 * rapporter som finns, hur många som är inlästa — och av dem hur många som är riktiga läxförhör, exit tickets och
 * övningar — hur många som är spärrade som felstartade och vilka som saknas. Rum som inte hör till något av
 * lärarens ämnen sorteras bort. Filer kan släppas direkt i rutan; de går till samma granskning som "Välj filer".
 */
import { useMemo, useState, type DragEvent } from 'react';
import {
  laggTillRapporter, rapportlage, summeraRapporter, tolkaRapportlista, tomRapportlista, type ListadRapportRad, type RumInfo, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

const SLAG_TEXT: Record<RumInfo['slag'], string> = {
  klassrum: 'klassrum', planrum: 'rum i planeringen', begreppsrum: 'begreppsrum', amnesrum: 'ämnesrum', annat: 'annat rum — sorteras bort',
};
const TYP_TEXT: Record<string, string> = { 'socrative-laxforhor': 'Läxförhör', 'socrative-exit': 'Exit ticket', 'socrative-ovning': 'Övning' };
const nar = (slut: string) => `${Number(slut.slice(8, 10))}/${Number(slut.slice(5, 7))} ${slut.slice(11)}`;

export function Rapportlista({ s, kor, onFiler }: { s: Struktur; kor: (fn: () => Struktur, m: string) => void; onFiler: (filer: File[]) => void }) {
  const [text, setText] = useState('');
  const [klistra, setKlistra] = useState(false);
  const [over, setOver] = useState(false);
  const [visaAlla, setVisaAlla] = useState(false);
  const rader = useMemo(() => rapportlage(s), [s]);
  const summor = useMemo(() => summeraRapporter(rader), [rader]);
  const tolkade = useMemo(() => (text.trim() === '' ? [] : tolkaRapportlista(text)), [text]);
  const antal = (s.socrativeRapporter ?? []).length;
  const vara = summor.filter((x) => x.info.slag !== 'annat');
  const bort = summor.filter((x) => x.info.slag === 'annat');
  const saknas = rader.filter((r) => r.lage === 'saknas');
  const utanfor = rader.filter((r) => r.lage === 'utanfor').length;
  const klassNamn = (id?: string) => (id === undefined ? '' : s.klasser.find((k) => k.id === id)?.namn ?? '');
  const rumText = (i: RumInfo) => (i.slag === 'annat' ? SLAG_TEXT.annat : `${[klassNamn(i.klassId), i.amnesNamn ?? ''].filter((x) => x !== '').join(' ')} · ${SLAG_TEXT[i.slag]}`);

  const lasIn = () => {
    const nya = tolkade;
    kor(() => laggTillRapporter(lasStruktur(), nya).s, `Rapportlistan: ${nya.length} rapporter lästa.`);
    setText(''); setKlistra(false);
  };
  const slapp = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setOver(false);
    const filer = Array.from(e.dataTransfer?.files ?? []).filter((f) => /\.xlsx$/i.test(f.name));
    if (filer.length > 0) onFiler(filer);
  };
  const lageText = (r: ListadRapportRad) => (r.lage === 'importerad'
    ? `✓ ${TYP_TEXT[r.kalla ?? ''] ?? 'inläst'}${r.andel != null ? ` · ${Math.round(r.andel.andel * 100)} % av svaren` : ''}${r.riktig ? '' : ' — för få svar'}`
    : r.lage === 'sparrad' ? '🚫 spärrad (felstartad)' : r.lage === 'saknas' ? 'saknas — ladda upp' : r.lage === 'annat-rum' ? 'annat rum — sorteras bort' : 'utanför läsåret');

  return (
    <div className="rapportlista" aria-label="Rapportlista">
      <div className={`rapportslapp${over ? ' over' : ''}`} aria-label="Släpp Socrative-filer här"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={slapp}>
        <b>⬇ Släpp rapportfilerna här</b> <small className="muted">flera på en gång går bra — appen känner igen redan inlästa filer, spärrade filer, filer från andra rum och fel klass</small>
      </div>

      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
        <b>📋 Rapportlistan</b>
        <small className="muted">{antal === 0 ? 'ingen lista inläst — klistra in listan från Socrative → Reports så ser du vilka rapporter som saknas' : `${antal} rapporter i listan${utanfor > 0 ? ` (${utanfor} äldre än läsåret)` : ''}`}</small>
        <button className="btn sec sm" onClick={() => setKlistra(!klistra)}>{antal === 0 ? 'Klistra in listan' : 'Uppdatera listan'}</button>
        {antal > 0 && <button className="linkbtn" onClick={() => { if (window.confirm('Tömma rapportlistan? Inlästa resultat påverkas inte.')) kor(() => tomRapportlista(lasStruktur()), 'Rapportlistan tömd.'); }}>töm</button>}
      </div>
      {klistra && (
        <div style={{ marginTop: 6 }}>
          <p className="note" style={{ margin: '0 0 4px' }}>Öppna Socrative → <b>Reports</b>, markera listan (Ctrl+A), kopiera (Ctrl+C) och klistra in här. Gör likadant för varje sida och för filtret <i>From Deleted Rooms</i> — rapporter som redan finns i listan läggs inte till igen.</p>
          <textarea aria-label="Rapportlista från Socrative" rows={5} style={{ width: '100%' }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'6.1-6.5,7.1-7.3\n11/2/2026\n10:06 PM\nBIOLOGI8AA\nQuiz'} />
          <div className="rad" style={{ gap: 8, alignItems: 'center' }}>
            <button className="btn sm" disabled={tolkade.length === 0} onClick={lasIn}>Läs in {tolkade.length} rapporter</button>
            {text.trim() !== '' && tolkade.length === 0 && <span className="status warn small">Hittar inga rapporter i texten — varje rapport ska ha namn, datum, klockslag och rum.</span>}
          </div>
        </div>
      )}

      {antal > 0 && (<>
        <table className="tbl small" style={{ marginTop: 8 }} aria-label="Rapporter per rum">
          <thead><tr><th>Rum</th><th>Hör till</th><th title="Rapporter i Socrative (inom läsåret)">Rapporter</th><th>Inlästa</th><th>Läxförhör</th><th>Exit ticket</th><th>Övning</th>
            <th title="Inlästa med under 30 % av elevernas möjliga svar, och spärrade filer">För få svar</th><th>Saknas</th></tr></thead>
          <tbody>
            {vara.map((x) => (
              <tr key={x.rum}>
                <td><b>{x.rum}</b></td><td>{rumText(x.info)}</td><td>{x.totalt}</td><td>{x.importerade + x.sparrade}</td>
                <td>{x.laxforhor}</td><td>{x.exit}</td><td>{x.ovning}</td><td>{x.faSvar + x.sparrade}</td>
                <td>{x.saknas > 0 ? <b className="st-krav ej">{x.saknas}</b> : <span className="st-krav ok">0</span>}</td>
              </tr>
            ))}
            {bort.map((x) => (
              <tr key={x.rum} className="muted"><td>{x.rum}</td><td>{SLAG_TEXT.annat}</td><td>{x.totalt}</td><td colSpan={6}>behöver inte laddas upp</td></tr>
            ))}
          </tbody>
        </table>

        {saknas.length === 0 ? <p className="st-krav ok small" style={{ margin: '6px 0 0' }}>✓ Alla rapporter i listan från våra rum är inlästa.</p> : (
          <details className="st-filer" open>
            <summary>⬆ {saknas.length} {saknas.length === 1 ? 'rapport saknas' : 'rapporter saknas'} <small className="muted">· exportera dem i Socrative (Reports → rapporten → Export → Whole Class Excel) och släpp filerna i rutan</small></summary>
            <table className="tbl small" aria-label="Rapporter som saknas">
              <thead><tr><th>Rum</th><th>Quiz</th><th title="När aktiviteten avslutades i Socrative">Avslutad</th></tr></thead>
              <tbody>{saknas.map((r) => <tr key={`${r.rapport.rum}|${r.rapport.slut}|${r.rapport.quiz}`}><td>{r.rapport.rum.toUpperCase()}</td><td>{r.rapport.quiz}</td><td>{nar(r.rapport.slut)}</td></tr>)}</tbody>
            </table>
          </details>
        )}
        <button className="v3-lank small" onClick={() => setVisaAlla(!visaAlla)}>{visaAlla ? 'Dölj hela listan' : 'Visa hela listan'}</button>
        {visaAlla && (
          <table className="tbl small" aria-label="Hela rapportlistan">
            <thead><tr><th>Avslutad</th><th>Rum</th><th>Quiz</th><th>Läge</th></tr></thead>
            <tbody>{rader.map((r) => <tr key={`${r.rapport.rum}|${r.rapport.slut}|${r.rapport.quiz}`} className={r.lage === 'annat-rum' || r.lage === 'utanfor' ? 'muted' : ''}>
              <td>{nar(r.rapport.slut)}</td><td>{r.rapport.rum.toUpperCase()}</td><td>{r.rapport.quiz}</td><td title={r.filnamn}>{lageText(r)}</td></tr>)}</tbody>
          </table>
        )}
      </>)}
    </div>
  );
}
