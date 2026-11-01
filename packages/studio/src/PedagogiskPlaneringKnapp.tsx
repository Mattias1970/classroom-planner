/**
 * Del 217 · 👨‍👩‍👧 Pedagogisk planering — knappen i ämnespanelen öppnar en liten ruta där
 * läraren kryssar i vilka delkapitel planeringen ska täcka (över ett eller flera kapitel,
 * t.ex. 6.1–6.5 och 7.1–7.3) och laddar ner Word-dokumentet. Valet sparas per ämne.
 * Innehållet byggs av kernel (pedagogiskPlaneringForOmfang) och Word-filen av pedagogiskWord.ts.
 */
import { useState } from 'react';
import { omfangUrKoder, pedagogiskPlanering, pedagogiskPlaneringForOmfang, tolkaOmfang, valbaraDelkapitel, type Struktur } from '@planner/kernel';
import { lasInstallning, sparaInstallning } from './store.js';

export function PedagogiskPlaneringKnapp({ s, amneId, aktivtKapitel, disabled, meddela }: {
  s: Struktur; amneId: string;
  /** Kapitlet som pågår — förvalet när inget sparats. */
  aktivtKapitel: number | null;
  disabled?: boolean;
  meddela?: (m: string) => void;
}) {
  const [oppen, setOppen] = useState(false);
  const [omfang, setOmfangRaw] = useState<string>(() => lasInstallning<string>(`pp.omfang.${amneId}`, ''));
  const setOmfang = (v: string) => { setOmfangRaw(v); sparaInstallning(`pp.omfang.${amneId}`, v); };
  const idag = new Date().toISOString().slice(0, 10);
  const kapitel = valbaraDelkapitel(s, amneId, omfang, idag);
  const valda = kapitel.flatMap((k) => k.delkapitel.filter((d) => d.vald).map((d) => d.kod));
  const omf = tolkaOmfang(omfang);
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
      ? pedagogiskPlaneringForOmfang(s, amneId, omf.spann, idag)
      : pedagogiskPlanering(s, amneId, aktivtKapitel ?? undefined, idag);
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
