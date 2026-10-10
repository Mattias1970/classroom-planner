/**
 * Del 181 · Frågor vid import: när ett namn i filen passar flera elever lika bra frågar
 * appen i stället för att gissa — är det samma person (vilken?), och om den redan har ett
 * annat resultat på provet: har eleven skrivit om (ersätt) eller är det ett annat tillfälle
 * med annat datum (behåll båda)? Svaren skickas som `beslut` i en ny import av samma rader.
 */
import { useState } from 'react';
import {
  importeraResultat, namnNyckelFor, registreraFil,
  type FilPost, type ImportBeslut, type ImportFraga, type ImportUnderlag, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

export interface VantandeImport {
  /** Vad som visas som rubrik: '8B · Matematik · Ma 8B Kap 1 Diagnos 1.1 - 1.2'. */
  etikett: string;
  underlag: ImportUnderlag;
  fragor: ImportFraga[];
  /** Filposten som ska registreras om efter den nya importen (valfritt). */
  fil?: Omit<FilPost, 'id' | 'traffar'>;
}

type Svar = { elevId: string; atgard: 'ersatt' | 'behall-bada' } | 'hoppa';

export function ImportFragor({ vantande, kor, onKlar }: {
  vantande: VantandeImport[]; kor: (fn: () => Struktur, m: string) => void; onKlar: () => void;
}) {
  const [svar, setSvar] = useState<Record<string, Svar>>({});
  const alla = vantande.flatMap((v, vi) => v.fragor.map((f) => ({ v, vi, f, nyckel: `${vi}|${namnNyckelFor(f.namn)}` })));
  if (alla.length === 0) return null;
  const klara = alla.filter((x) => svar[x.nyckel] !== undefined).length;
  const importera = () => {
    let st = lasStruktur();
    let sparade = 0; let hoppade = 0;
    for (const [vi, v] of vantande.entries()) {
      const beslut: ImportBeslut = {};
      for (const f of v.fragor) {
        const sv = svar[`${vi}|${namnNyckelFor(f.namn)}`];
        if (sv === undefined || sv === 'hoppa') { beslut[namnNyckelFor(f.namn)] = 'hoppa'; hoppade += 1; continue; }
        beslut[namnNyckelFor(f.namn)] = { elevId: sv.elevId, atgard: sv.atgard };
        sparade += 1;
      }
      const u = importeraResultat(st, { ...v.underlag, beslut });
      st = v.fil !== undefined ? registreraFil(u.s, { ...v.fil, traffar: u.traffar }) : u.s;
    }
    const klar = st;
    kor(() => klar, `${sparade} ${sparade === 1 ? 'rad' : 'rader'} sparade efter dina svar${hoppade > 0 ? ` · ${hoppade} hoppade över` : ''}.`);
    onKlar();
  };
  const p = (x: number) => String(x).replace('.', ',');
  return (
    <div className="uppg-kort st-importfragor" role="dialog" aria-label="Frågor om namn i importen">
      <h3 style={{ margin: '0 0 4px' }}>❓ Namn som behöver ett svar <small className="muted">· {klara} av {alla.length} besvarade</small></h3>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        Namnen nedan passar flera elever lika bra, så appen gissar inte. Välj vilken elev raden hör till — och om eleven redan har ett annat resultat på provet: är det samma person som skrivit om (ersätt), eller ett annat tillfälle med annat datum (behåll båda)?
      </p>
      {alla.map(({ v, f, nyckel }) => {
        const valt = svar[nyckel];
        return (
          <fieldset key={nyckel} className="st-importfraga">
            <legend><b>”{f.namn}”</b> <span className="muted">· {v.etikett} · {p(f.rad.poang)}/{p(f.rad.maxPoang)} p · {v.underlag.datum}</span></legend>
            {f.kandidater.map((k) => {
              const bef = k.befintligt;
              const skiljer = bef !== null && (bef.poang !== f.rad.poang || bef.maxPoang !== f.rad.maxPoang || bef.datum !== v.underlag.datum);
              const ar = (a: 'ersatt' | 'behall-bada') => valt !== undefined && valt !== 'hoppa' && valt.elevId === k.elev.id && valt.atgard === a;
              return (
                <div key={k.elev.id} className="st-importval">
                  <label>
                    <input type="radio" name={nyckel} aria-label={`${f.namn}: ${k.elev.namn}`} checked={ar('ersatt')} onChange={() => setSvar({ ...svar, [nyckel]: { elevId: k.elev.id, atgard: 'ersatt' } })} />
                    {' '}Samma person: <b>{k.elev.namn}</b>
                    {bef !== null && <span className="muted"> — har redan {p(bef.poang)}/{p(bef.maxPoang)} p ({bef.datum}){skiljer ? '; det nya ersätter' : ''}</span>}
                    {bef === null && <span className="muted"> — inget resultat på provet ännu</span>}
                  </label>
                  {skiljer && (
                    <label style={{ marginLeft: 22 }}>
                      <input type="radio" name={nyckel} aria-label={`${f.namn}: ${k.elev.namn}, annat datum`} checked={ar('behall-bada')} onChange={() => setSvar({ ...svar, [nyckel]: { elevId: k.elev.id, atgard: 'behall-bada' } })} />
                      {' '}Samma person, men ett annat tillfälle ({bef.datum} och {v.underlag.datum}) — behåll båda
                    </label>
                  )}
                </div>
              );
            })}
            <label className="st-importval">
              <input type="radio" name={nyckel} aria-label={`${f.namn}: hoppa över`} checked={valt === 'hoppa'} onChange={() => setSvar({ ...svar, [nyckel]: 'hoppa' })} />
              {' '}Hoppa över raden
            </label>
          </fieldset>
        );
      })}
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm" disabled={klara < alla.length} onClick={importera}>✓ Spara svaren och importera</button>
        <button className="btn sec sm" onClick={onKlar}>Senare</button>
        <small className="muted">Obesvarade rader hoppas över — importera filen igen så frågar appen på nytt.</small>
      </div>
    </div>
  );
}
