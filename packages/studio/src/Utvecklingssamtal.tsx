/**
 * Del 164 · Utvärdering inför utvecklingssamtal — en kort text per elev (högst sju
 * rader) ur läxförhör, exit tickets, inlämningar och DigiExam-prov. Status och text
 * beräknas; läraren kan ändra status (texten följer) och skriva om texten. Kopiera
 * per elev eller exportera hela klassen som Word.
 */
import { useMemo, useState } from 'react';
import { Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from 'docx';
import {
  antalStycken, angraAvslutatSamtal, avslutaSamtal, gemensamText, kapitelNamn, klassensUtvarderingar, periodText, samtalsPeriod, samtalsStycken, sattSamtalsKapitel, sattSamtalsPeriod, sattSamtalsUtvardering, STATUS_ORDNING, STATUS_TEXT,
  type GemensamText, type Klass, type SamtalsPeriod, type SamtalsStatus, type Struktur, type Utvardering,
} from '@planner/kernel';
import { NamnFragor } from './NamnFragor.js';
import { lasStruktur } from './store.js';

const pct = (v: number | null) => (v === null ? '—' : `${v} %`);
const pil = (t: 'upp' | 'stabil' | 'ner' | null) => (t === 'upp' ? '↗' : t === 'ner' ? '↘' : t === 'stabil' ? '→' : '');

async function tillWord(klassNamn: string, amne: string, lista: Utvardering[], gemensam: string | null, period: SamtalsPeriod): Promise<void> {
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      children: [
        new Paragraph({ text: `Utvecklingssamtal · ${klassNamn} · ${amne}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: `Underlag ${periodText(period)}`, italics: true })] }),
        // Del 172 · Gemensam text för alla elever: kapitlen klassen arbetat med och vad de handlar om
        ...(gemensam === null ? [] : gemensam.split('\n').filter((r) => r.trim() !== '').map((r) => new Paragraph({ spacing: { after: 240, line: 300 }, children: [new TextRun({ text: r })] }))),
        ...lista.flatMap((u) => [
          new Paragraph({ text: `${u.namn} — ${STATUS_TEXT[u.egenStatus ?? u.status]}`, heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 160 } }),
          // Rubrikerna i fet svart stil, "Exit tickets" i fet blå, dubbel radbrytning mellan styckena
          // Underrader (diagnoserna över varandra) blir egna indragna rader med procenten vid en tabbposition
          ...samtalsStycken(u.egenText ?? u.text).flatMap((st) => [
            new Paragraph({
              spacing: { after: st.underrader.length > 0 ? 60 : 240, line: 300 },
              children: [
                ...(st.etikett !== null ? [new TextRun({ text: `${st.etikett}: `, bold: true, color: '000000' })] : []),
                ...st.delar.map((d) => new TextRun(d.exit ? { text: d.text, bold: true, color: '1565C0' } : { text: d.text })),
              ],
            }),
            ...st.underrader.map((r, ri) => new Paragraph({
              spacing: { after: ri === st.underrader.length - 1 ? 240 : 40, line: 280 },
              indent: { left: 400 },
              tabStops: [{ type: TabStopType.LEFT, position: 4400 }],
              children: r.varde === null ? [new TextRun({ text: r.text })] : [new TextRun({ text: r.text }), new TextRun({ text: `\t${r.varde}`, bold: true })],
            })),
          ]),
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
  const [gemUtkast, setGemUtkast] = useState<string | null>(null);
  // Del 172/192 · Alla ämnen: kapitlen i rapporten (checklista när flera kapitel är genomförda) och den gemensamma texten
  const gem: GemensamText | null = useMemo(() => gemensamText(s, amneId, idag), [s, amneId, idag]);
  // Del 191 · Perioden: från terminsstart (eller förra samtalet) till samtalsdatumet
  const period = useMemo(() => samtalsPeriod(s, amneId, idag), [s, amneId, idag]);
  if (amne === undefined) return null;
  const kopiera = (u: Utvardering) => {
    const text = u.egenText ?? u.text;
    void navigator.clipboard?.writeText(text).then(() => { setKopierad(u.elevId); window.setTimeout(() => setKopierad(null), 1500); });
  };
  const antalPer = STATUS_ORDNING.map((st) => [st, lista.filter((u) => (u.egenStatus ?? u.status) === st).length] as const);
  // Del 171 · Matematik: Magma-diagnoserna styr statusen (70–80 når målen, 81–90 går bra, 91–95 mycket bra, över 95 utmärkt)
  const ma = lista.some((u) => u.mall === 'ma');
  return (
    <div className="uppg-kort st-widget st-samtal" aria-label="Utvecklingssamtal">
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn sm" onClick={onTillbaka}>← Alla elever</button>
        <h3 style={{ margin: 0 }}>🗣 Utvecklingssamtal · {klass.namn} · {amne.namn}</h3>
        <span className="spacer" />
        <button className="btn sec sm" onClick={() => { void tillWord(klass.namn, amne.namn, lista, gem?.text ?? null, period); }}>📄 Alla till Word</button>
      </div>
      <SamtalsPeriodPanel s={s} amneId={amneId} period={period} idag={idag} kor={kor} />
      <p className="small muted" style={{ margin: '4px 0 8px' }}>
        {ma
          ? <>Statusen sätts av Magma-diagnoserna (70–80 % når målen, 81–90 % går bra, 91–95 % mycket bra, över 95 % utmärkt); en diagnos på hela kapitlet väger tyngst. </>
          : <>Statusen bygger på Läxförhör (gräns 90 %), Exit tickets (70 %), Inlämningar och DigiExam-prov. </>}
        Texten är kort: siffrorna i perioden och ett nästa steg. Ändra statusen så skrivs texten om, eller skriv om den själv.
      </p>
      {gem !== null && (
        <KapitelOchGemensamText gem={gem} amneId={amneId} kor={kor} utkast={gemUtkast} setUtkast={setGemUtkast} />
      )}
      <NamnFragor s={s} klassId={klass.id} kor={kor} />
      <div className="rad" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {antalPer.map(([st, n]) => <span key={st} className={`chip st-samtal-chip ${st}`}>{STATUS_TEXT[st]}: <b>{n}</b></span>)}
      </div>
      <table className="tbl small st-samtal-tabell">
        <thead><tr><th>#</th><th>Elev</th><th>Status</th>{ma && <th>Diagnoser</th>}<th>Exit</th><th>Läxförhör</th><th>Inlämningar</th><th>Prov</th><th></th></tr></thead>
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
              {ma && (
                <td title={u.diagnoser.lista.map((d) => `${d.prov}: ${d.procent} % (${STATUS_TEXT[d.niva]})`).join('\n')}>
                  {u.diagnoser.lista.length === 0 ? '—' : (
                    <>
                      {u.diagnoser.lista.map((d) => <span key={`${d.prov}-${d.datum}`} className={`st-krav st-samtal-diag ${d.niva}${d.typ === 'kapitel' ? ' kapitel' : ''}`} title={d.typ === 'kapitel' ? 'diagnos på hela kapitlet' : d.typ}>{d.procent}</span>)}
                      <small> {u.diagnoser.lista.some((d) => d.typ === 'kapitel') ? 'slutresultat' : 'snitt'} {pct(u.diagnoser.slut)} {pil(u.diagnoser.trend)}</small>
                    </>
                  )}
                </td>
              )}
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
              <tr key={`${u.elevId}-text`}><td colSpan={ma ? 9 : 8}>
                {redigerar === u.elevId ? (
                  <textarea aria-label={`Text ${u.namn}`} rows={10} className="st-samtal-text" value={text}
                    onChange={(e) => setUtkast({ ...utkast, [u.elevId]: e.target.value })} />
                ) : (
                  <div className="st-samtal-visning" aria-label={`Text ${u.namn}`}>
                    {samtalsStycken(text).map((st, si) => (
                      <div key={si} className="st-samtal-stycke">
                        <p>
                          {st.etikett !== null && <b className="st-samtal-rubrik">{st.etikett}: </b>}
                          {st.delar.map((d, di) => (d.exit ? <b key={di} className="st-samtal-exit">{d.text}</b> : <span key={di}>{d.text}</span>))}
                        </p>
                        {st.underrader.length > 0 && (
                          <div className="st-samtal-underrader">
                            {st.underrader.map((r, ri) => (r.varde === null
                              ? <div key={ri} className="st-samtal-underrad text">{r.text}</div>
                              : <div key={ri} className="st-samtal-underrad"><span>{r.text}</span><b>{r.varde}</b></div>))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="rad" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <small className="muted">{antalStycken(text)} stycken{u.egenText !== undefined ? ' · egen text' : ' · beräknad text'}</small>
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

/**
 * Del 172 · Kapitlen i rapporten: checklista över genomförda kapitel och delkapitel (öppen när flera
 * kapitel är genomförda och inget val gjorts) samt den gemensamma texten för alla elever, redigerbar.
 */
function KapitelOchGemensamText({ gem, amneId, kor, utkast, setUtkast }: {
  gem: GemensamText; amneId: string; kor: (fn: () => Struktur, m: string) => void; utkast: string | null; setUtkast: (v: string | null) => void;
}) {
  const valda = new Set(gem.koder);
  const satt = (koder: string[], m: string) => kor(() => sattSamtalsKapitel(lasStruktur(), amneId, { koder }), m);
  const vaxlaDel = (kod: string) => {
    const n = new Set(valda); if (n.has(kod)) n.delete(kod); else n.add(kod);
    satt([...n], `Rapporten: delkapitel ${kod} ${n.has(kod) ? 'med' : 'utan'}.`);
  };
  const vaxlaKap = (nr: number) => {
    const k = gem.kapitel.find((x) => x.nr === nr)!;
    const koder = k.delkapitel.map((d) => d.kod);
    const allaMed = koder.every((c) => valda.has(c));
    const n = new Set(valda); for (const c of koder) { if (allaMed) n.delete(c); else n.add(c); }
    satt([...n], `Rapporten: kapitel ${nr} ${allaMed ? 'utan' : 'med'}.`);
  };
  const text = utkast ?? gem.text;
  return (
    <div className="st-samtal-kapitel" aria-label="Kapitlen i rapporten">
      <details open>
        <summary>📚 Kapitel i rapporten: {gem.valda.length === 0 ? 'inget valt' : gem.valda.map(kapitelNamn).join(', ')}{gem.behoverVal ? ' — välj vilka kapitel och delkapitel som ska ingå' : ''}</summary>
        {gem.kapitel.length === 0 ? <p className="small muted">Ingen genomförd lektion i planeringen ännu.</p> : (
          <div className="rad" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {gem.kapitel.map((k) => {
              const koder = k.delkapitel.map((d) => d.kod);
              const antalMed = koder.filter((c) => valda.has(c)).length;
              return (
                <div key={k.nr} className="st-samtal-kapval">
                  <label><input type="checkbox" aria-label={kapitelNamn(k)} checked={antalMed === koder.length}
                    ref={(el) => { if (el !== null) el.indeterminate = antalMed > 0 && antalMed < koder.length; }} onChange={() => vaxlaKap(k.nr)} /> <b>{kapitelNamn(k)}</b>{k.sidor !== '' && k.sidor !== '—' ? <span className="muted"> {k.sidor}</span> : null}</label>
                  {k.delkapitel.map((d) => (
                    <label key={d.kod} className="st-samtal-delval"><input type="checkbox" aria-label={`Delkapitel ${d.kod}`} checked={valda.has(d.kod)} onChange={() => vaxlaDel(d.kod)} /> {d.kod} {d.namn}{d.lektioner > 0 ? <span className="muted"> · {d.lektioner} {d.lektioner === 1 ? 'lektion' : 'lektioner'}</span> : null}</label>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </details>
      <div className="st-samtal-gemensam">
        <b className="st-samtal-rubrik">Gemensam text för alla elever</b>
        {utkast !== null ? (
          <textarea aria-label="Gemensam text" rows={4} className="st-samtal-text" value={text} onChange={(e) => setUtkast(e.target.value)} />
        ) : (
          <div aria-label="Gemensam text">{gem.text.split('\n').map((r, i) => <p key={i}>{r}</p>)}</div>
        )}
        <div className="rad" style={{ gap: 6, flexWrap: 'wrap' }}>
          <small className="muted">{gem.egen ? 'egen text' : 'beräknad ur bokens kapitel och mål'}</small>
          <button className="btn sec sm" onClick={() => setUtkast(utkast === null ? gem.text : null)}>{utkast === null ? '✏ Redigera' : '👁 Visa'}</button>
          <span className="spacer" />
          {gem.egen && <button className="btn sec sm" onClick={() => { setUtkast(null); kor(() => sattSamtalsKapitel(lasStruktur(), amneId, { text: null }), 'Gemensam text: beräknad igen.'); }}>↺ Beräknad text</button>}
          <button className="btn sm" disabled={utkast === null || utkast === gem.text} onClick={() => { const v = utkast!; setUtkast(null); kor(() => sattSamtalsKapitel(lasStruktur(), amneId, { text: v }), 'Gemensam text sparad.'); }}>💾 Spara text</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Del 191 · Perioden rapporten gäller: från terminsstart (eller förra samtalet) till samtalsdatumet.
 * När samtalen är klara sparas datumet — nästa rapport blir en uppdatering från det datumet.
 */
function SamtalsPeriodPanel({ s, amneId, period, idag, kor }: { s: Struktur; amneId: string; period: SamtalsPeriod; idag: string; kor: (fn: () => Struktur, m: string) => void }) {
  const tidigare = s.samtalsPeriod?.[amneId]?.tidigare ?? [];
  const egen = s.samtalsPeriod?.[amneId]?.fran !== undefined || s.samtalsPeriod?.[amneId]?.till !== undefined;
  return (
    <div className="rad st-samtal-period" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '6px 0' }} aria-label="Rapportens period">
      <b>📅 Underlag {periodText(period)}</b>
      <small className="muted">{period.forra !== null ? `· uppdatering sedan förra samtalet ${period.forra}` : period.franTerminsstart ? '· från terminsstart' : ''}</small>
      <label className="small">från <input type="date" aria-label="Perioden från" value={period.fran} max={period.till} onChange={(e) => { if (e.target.value !== '') kor(() => sattSamtalsPeriod(lasStruktur(), amneId, { fran: e.target.value }, idag), `Rapporten gäller från ${e.target.value}.`); }} /></label>
      <label className="small">till <input type="date" aria-label="Perioden till" value={period.till} min={period.fran} onChange={(e) => { if (e.target.value !== '') kor(() => sattSamtalsPeriod(lasStruktur(), amneId, { till: e.target.value }, idag), `Rapporten gäller till ${e.target.value}.`); }} /></label>
      {egen && <button className="btn sec sm" onClick={() => kor(() => sattSamtalsPeriod(lasStruktur(), amneId, { fran: null, till: null }, idag), 'Perioden återställd.')}>↺ Standard</button>}
      <span className="spacer" />
      <button className="btn sm" title="Sparar samtalsdatumet — nästa rapport blir en uppdatering från det datumet" onClick={() => {
        if (!window.confirm(`Samtalen klara?\n\nDatumet ${period.till} sparas. Nästa rapport visar utvecklingen från ${period.till} och framåt. Det går att ångra.`)) return;
        kor(() => avslutaSamtal(lasStruktur(), amneId, idag), `Samtalen ${period.till} sparade — nästa rapport börjar där.`);
      }}>✓ Samtalen klara — spara {period.till}</button>
      {tidigare.length > 0 && (
        <button className="btn sec sm" title={`Tidigare samtal: ${tidigare.join(', ')}`} onClick={() => kor(() => angraAvslutatSamtal(lasStruktur(), amneId), `Samtalet ${tidigare[tidigare.length - 1]} borttaget — perioden börjar tidigare igen.`)}>↩ Ångra senaste ({tidigare[tidigare.length - 1]})</button>
      )}
    </div>
  );
}
