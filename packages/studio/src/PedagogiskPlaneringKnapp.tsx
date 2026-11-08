/**
 * Del 217 · 👨‍👩‍👧 Pedagogisk planering — knappen i ämnespanelen öppnar en liten ruta där
 * läraren kryssar i vilka delkapitel planeringen ska täcka (över ett eller flera kapitel,
 * t.ex. 6.1–6.5 och 7.1–7.3) och laddar ner Word-dokumentet. Valet sparas per ämne.
 * Innehållet byggs av kernel (pedagogiskPlaneringForOmfang) och Word-filen av pedagogiskWord.ts.
 */
import { useEffect, useState } from 'react';
import { bokensKapitelOrdning, omfangUrKoder, pedagogiskPlanering, pedagogiskPlaneringForOmfang, planensKapitel, planensKapitelOrdning, tolkaOmfang, valbaraDelkapitel, type KapitelOrdning, type PlanLaboration, type Struktur } from '@planner/kernel';
import { lasInstallning, sparaInstallning } from './store.js';
import { KapitelOrdningRedigerare, fullOrdning } from './KapitelOrdning.js';

export function PedagogiskPlaneringKnapp({ s, amneId, aktivtKapitel, disabled, meddela, sparaLabb, sattOrdning }: {
  s: Struktur; amneId: string;
  /** Kapitlet som pågår — förvalet när inget sparats. */
  aktivtKapitel: number | null;
  disabled?: boolean;
  meddela?: (m: string) => void;
  /** Del 226 · Sparar laborationens namn och frågeställning i lektionsplanen (avsnittText + labFraga). */
  sparaLabb?: (lektionsIndex: number, namn: string, fraga: string) => void;
  /** Del 230 · Ändrar kapitlens ordning i själva planeringen — en ordning för lektionsplan, detaljplanering, kalender och dokument. */
  sattOrdning?: (o: KapitelOrdning) => void;
}) {
  const [oppen, setOppen] = useState(false);
  const [omfang, setOmfangRaw] = useState<string>(() => lasInstallning<string>(`pp.omfang.${amneId}`, ''));
  const setOmfang = (v: string) => { setOmfangRaw(v); sparaInstallning(`pp.omfang.${amneId}`, v); };
  const idag = new Date().toISOString().slice(0, 10);
  const kapitel = valbaraDelkapitel(s, amneId, omfang, idag);
  const valda = kapitel.flatMap((k) => k.delkapitel.filter((d) => d.vald).map((d) => d.kod));
  const omf = tolkaOmfang(omfang);
  // Del 224 · laborationerna i omfånget: läraren kryssar i vilka som är genomförda (förval: datum före idag)
  const [labbVal, setLabbValRaw] = useState<Record<string, boolean>>(() => lasInstallning<Record<string, boolean>>(`pp.labbar.${amneId}`, {}));
  const setLabbVal = (v: Record<string, boolean>) => { setLabbValRaw(v); sparaInstallning(`pp.labbar.${amneId}`, v); };
  // Del 230 · kapitlens (och delkapitlens) ordning är planeringens egen: ändras den här ändras hela planeringen
  // (sattKapitelOrdning → sparas med ämnet via ☁, bokfilen rörs inte). Dokumentet följer alltid planen.
  const harPlanering = s.planeringar.some((p) => p.amneId === amneId);
  const last = harPlanering ? idag : undefined;
  const valdaKapitel = planensKapitel(s, amneId, last)
    .map((k) => ({ ...k, delkapitel: k.delkapitel.filter((kod) => valda.includes(kod)), kurser: k.kurser.filter((x) => valda.some((kod) => x.nyckel.endsWith(`:${kod}`))) }))
    .filter((k) => k.delkapitel.length > 0);
  const ordning = fullOrdning(valdaKapitel, planensKapitelOrdning(s, amneId, last));
  const setOrdning = (o: KapitelOrdning) => {
    // De valda delkapitlens nya följd läggs in i planens fullständiga ordning (ovalda delkapitel behåller sin plats)
    const hela = planensKapitelOrdning(s, amneId, last);
    const kapitel = [...o.kapitel, ...hela.kapitel.filter((n) => !o.kapitel.includes(n))];
    const delkapitel: Record<string, string[]> = { ...(hela.delkapitel ?? {}) };
    for (const [nr, foljd] of Object.entries(o.delkapitel ?? {})) {
      const alla = hela.delkapitel?.[nr] ?? [];
      const platser = alla.map((kod, i) => (foljd.includes(kod) ? i : -1)).filter((i) => i >= 0);
      const ny = [...alla]; platser.forEach((p, i) => { ny[p] = foljd[i]; });
      delkapitel[nr] = ny;
    }
    sattOrdning?.({ kapitel, delkapitel });
  };
  const forhand = omf.fel === null && omf.spann.length > 0 ? pedagogiskPlaneringForOmfang(s, amneId, omf.spann, idag, undefined, ordning) : pedagogiskPlanering(s, amneId, aktivtKapitel ?? undefined, idag);
  const labbar = (forhand?.laborationer ?? []).map((l) => ({ ...l, genomford: labbVal[l.nyckel] ?? l.genomford }));
  const genomforda = new Set(labbar.filter((l) => l.genomford).map((l) => l.nyckel));
  const vaxla = (kod: string) => setOmfang(omfangUrKoder(valda.includes(kod) ? valda.filter((x) => x !== kod) : [...valda, kod]));
  const oppna = () => {
    // Förval: pågående kapitlets alla delkapitel när inget valts än
    if (omfang.trim() === '' && aktivtKapitel !== null) {
      const k = kapitel.find((x) => x.nr === aktivtKapitel);
      if (k !== undefined) setOmfang(omfangUrKoder(k.delkapitel.map((d) => d.kod)));
    }
    setOppen(true);
  };
  const exportera = () => {
    const pl = omf.fel === null && omf.spann.length > 0
      ? pedagogiskPlaneringForOmfang(s, amneId, omf.spann, idag, genomforda, ordning)
      : pedagogiskPlanering(s, amneId, aktivtKapitel ?? undefined, idag, genomforda);
    if (pl === null) { meddela?.('✗ Kunde inte bygga planeringen — inget valt delkapitel finns i boken, eller ämnet saknar planering.'); return; }
    void import('./pedagogiskWord.js').then(({ exporteraPedagogiskPlanering }) => exporteraPedagogiskPlanering(pl)).then(() => {
      meddela?.(`Pedagogisk planering ${pl.omfang ?? `kap ${pl.kapitel.nr}`} nedladdad som Word.`); setOppen(false);
    });
  };
  return (
    <>
      <button className="flik" disabled={disabled} title="Pedagogisk planering och provlapp för elever och vårdnadshavare — välj vilka delkapitel som ingår" onClick={oppna}>👨‍👩‍👧 Pedagogisk planering</button>
      {oppen && (
        <div className="st-info-bak" onClick={() => setOppen(false)}>
          <div className="st-info-popup pp-modal" role="dialog" aria-label="Pedagogisk planering" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px' }}>👨‍👩‍👧 Pedagogisk planering</h3>
            <p className="small muted" style={{ margin: '0 0 8px' }}>Kryssa i delkapitlen som planeringen ska täcka — gärna över flera kapitel. Dokumentet får syfte, begrepp, innehåll, filmer, prov och bedömning samt veckoplaneringen för just de delkapitlen.</p>
            {!s.planeringar.some((p) => p.amneId === amneId) && <p className="status warn small" style={{ margin: '0 0 8px' }}>⚠ Planeringen är inte skapad än — dokumentet bygger på förhandsvisningen (bokens ordning). Skapa planeringen med ▶ Skapa planering först om du vill ha din egen kapitelordning och dina datum.</p>}
            <label className="small" style={{ display: 'block', marginBottom: 6 }}>Omfång
              <input aria-label="Planeringens omfång" value={omfang} placeholder="6.1-6.5, 7.1-7.3" onChange={(e) => setOmfang(e.target.value)} style={{ width: '100%' }} />
              {omf.fel !== null && <span className="status warn small" style={{ display: 'block' }}>⚠ {omf.fel}</span>}
            </label>
            {kapitel.length === 0 ? <p className="muted small">Ämnet saknar bok.</p> : kapitel.map((k) => (
              <div key={k.nr} className="rad" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0' }}>
                <span className="muted small" style={{ minWidth: 170 }}>Kap {k.nr} {k.namn}</span>
                <button type="button" className="chipbtn" onClick={() => setOmfang(omfangUrKoder([...new Set([...valda, ...k.delkapitel.map((d) => d.kod)])]))}>alla</button>
                <button type="button" className="chipbtn" onClick={() => setOmfang(omfangUrKoder(valda.filter((v) => !k.delkapitel.some((d) => d.kod === v))))}>inga</button>
                {k.delkapitel.map((d) => (
                  <label key={d.kod} className={`chipbtn provlapp-dk${d.vald ? ' act' : ''}${d.iPlanen ? '' : ' muted'}`} title={`${d.kod} ${d.namn}${d.iPlanen ? '' : ' — inte i planeringen (bortklippt)'}`}>
                    <input type="checkbox" aria-label={`Planering delkapitel ${d.kod}`} checked={d.vald} onChange={() => vaxla(d.kod)} /> {d.kod}
                  </label>
                ))}
              </div>
            ))}
            {sattOrdning !== undefined && valdaKapitel.length > 0 && (valdaKapitel.length > 1 || valdaKapitel[0].delkapitel.length > 1) && (
              <div className="pp-ordning" style={{ margin: '10px 0 4px' }}>
                <b className="small">I vilken ordning?</b>
                <p className="small muted" style={{ margin: '2px 0 4px' }}>Det här är planeringens ordning för klassen — flyttar du ett kapitel (▲▼) eller delkapitel (◀▶) ändras lektionsplan, detaljplanering, kalender och dokument på samma gång. Sparas med ämnet (☁), bokfilen rörs inte. Veckoplaneringen står alltid i datumordning.</p>
                <KapitelOrdningRedigerare kapitel={valdaKapitel} ordning={ordning} setOrdning={setOrdning} bokens={bokensKapitelOrdning(s, amneId)} kompakt />
              </div>
            )}
            {labbar.length > 0 && (
              <div className="pp-labbar" style={{ margin: '10px 0 4px' }}>
                <b className="small">Vilka laborationer har genomförts?</b>
                <p className="small muted" style={{ margin: '2px 0 4px' }}>De ikryssade tas med i planeringen med namn och frågeställning (under "Studera inför prov"). Förval: laborationer med datum före idag. Namn och frågeställning sparas i lektionsplanen.</p>
                {labbar.map((l) => (
                  <LabbRad key={l.nyckel} l={l} vaxla={() => setLabbVal({ ...labbVal, [l.nyckel]: !l.genomford })} spara={sparaLabb} />
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" disabled={omf.fel !== null || valda.length === 0} onClick={exportera}>📄 Ladda ner Word</button>
              <button className="btn sec" onClick={() => setOppen(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Del 226 · En laboration i rutan: kryss (genomförd), datum, namn och frågeställning — namn och fråga sparas i lektionsplanen när fältet lämnas. */
function LabbRad({ l, vaxla, spara }: { l: PlanLaboration; vaxla: () => void; spara?: (lektionsIndex: number, namn: string, fraga: string) => void }) {
  const [namn, setNamn] = useState(l.namn);
  const [fraga, setFraga] = useState(l.fraga ?? '');
  useEffect(() => { setNamn(l.namn); setFraga(l.fraga ?? ''); }, [l.namn, l.fraga]);
  const sparaNu = () => { if (spara !== undefined && (namn.trim() !== l.namn || fraga.trim() !== (l.fraga ?? ''))) spara(l.lektionsIndex, namn.trim(), fraga.trim()); };
  return (
    <div className="rad small pp-labb" style={{ gap: 6, alignItems: 'center', margin: '3px 0', flexWrap: 'wrap' }}>
      <input type="checkbox" aria-label={`Laboration genomförd ${l.namn}`} checked={l.genomford} onChange={vaxla} />
      <span className="muted" style={{ minWidth: 80 }}>{l.datum ?? '—'}</span>
      <input aria-label={`Laborationens namn ${l.nyckel}`} value={namn} placeholder="Laborationens namn" style={{ width: 200 }} disabled={spara === undefined}
        onChange={(e) => setNamn(e.target.value)} onBlur={sparaNu} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <input aria-label={`Frågeställning ${l.nyckel}`} value={fraga} placeholder="Frågeställning (vad undersökte vi?)" style={{ flex: 1, minWidth: 220 }} disabled={spara === undefined}
        className={fraga.trim() === '' ? 'fel' : undefined} title={fraga.trim() === '' ? 'Frågeställning saknas — skriv vad laborationen undersökte' : undefined}
        onChange={(e) => setFraga(e.target.value)} onBlur={sparaNu} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}
