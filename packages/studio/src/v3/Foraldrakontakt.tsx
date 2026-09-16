/**
 * v3 · Föräldrakontakt — "Förenkla och strukturera kommunikationen med vårdnadshavare."
 *
 * Prioriteringslistan byggs ur samma underlag som rapporterna (rapportOversikt:
 * låga snitt, saknade quizsvar, begrepp som fastnat). Meddelandeförslaget är
 * den enkla rapportens text — beskrivande, utan orsaksslutsatser. Kontakt-
 * status (skickat / väntar / ej granskat) sparas lokalt per elev; vårdnads-
 * havarnas kontaktuppgifter finns inte i datan än och visas som "Data saknas".
 */
import React, { useMemo, useState } from 'react';
import { enkelRapport, rapportOversikt, tolkaVeckor, type Struktur } from '@planner/kernel';
import { lasInstallning, sparaInstallning } from '../store.js';
import { Ikon } from './ikoner.js';
import { DataSaknas, Kort, Kpi, type Filter, type V3Vy } from './Skal.js';

type Status = 'skickat' | 'vantar' | 'ej-granskat';
type Kontakt = Record<string, { status: Status; datum: string; anteckning?: string }>;

const NYCKEL = 'cp3.foraldrakontakt';

export function Foraldrakontakt({ s, filter, setVy }: { s: Struktur; filter: Filter; setVy: (v: V3Vy) => void }) {
  const klass = s.klasser.find((k) => k.id === filter.klassId) ?? s.klasser[0];
  const [kontakt, setKontakt] = useState<Kontakt>(() => lasInstallning<Kontakt>(NYCKEL, {}));
  const [vald, setVald] = useState<string | null>(null);
  const period = tolkaVeckor(filter.periodText) ?? {};
  const amneId = filter.amneId !== '' ? filter.amneId : s.amnen.find((a) => a.klassId === klass?.id)?.id;

  const rader = useMemo(() => {
    if (klass === undefined) return [];
    const f = { klassId: klass.id, ...(amneId !== undefined ? { amneId } : {}), ...period };
    return rapportOversikt(s, f, filter.sok)
      .map((r) => ({ ...r, prio: r.antalProv === 0 ? 0 : r.oro }))
      .sort((a, b) => b.prio - a.prio || a.elev.namn.localeCompare(b.elev.namn, 'sv'));
  }, [s, klass?.id, amneId, filter.periodText, filter.sok]); // eslint-disable-line react-hooks/exhaustive-deps

  const satt = (elevId: string, status: Status) => {
    const ny = { ...kontakt, [elevId]: { ...(kontakt[elevId] ?? { datum: '' }), status, datum: new Date().toISOString().slice(0, 10) } };
    setKontakt(ny); sparaInstallning(NYCKEL, ny);
  };
  const antal = (st: Status) => rader.filter((r) => (kontakt[r.elev.id]?.status ?? 'ej-granskat') === st).length;
  const hogRisk = rader.filter((r) => r.prio >= 3).length;
  const valdRad = rader.find((r) => r.elev.id === vald) ?? null;
  const forslag = useMemo(() => {
    if (valdRad === null || klass === undefined) return null;
    try { return enkelRapport(s, valdRad.elev.id, { klassId: klass.id, ...(amneId !== undefined ? { amneId } : {}), ...period }); } catch { return null; }
  }, [s, valdRad?.elev.id, klass?.id, amneId, filter.periodText]); // eslint-disable-line react-hooks/exhaustive-deps

  if (klass === undefined) return <div className="v3-sida-innehall"><Kort rubrik="Föräldrakontakt"><DataSaknas text="Ingen klass finns än." atgard={{ text: 'Öppna struktur', onKlick: () => setVy({ typ: 'oversikt' }) }} /></Kort></div>;

  const meddelande = forslag === null ? '' : [
    `Hej!`, '',
    `Här kommer en kort återkoppling om ${valdRad?.elev.namn} i ${forslag.amneNamn}.`, '',
    forslag.rubrik + '.', ...forslag.text, '',
    forslag.kvar.length > 0 ? `Begrepp att öva på: ${forslag.kvar.slice(0, 5).map((x) => x.begrepp ?? x.fraga).join(', ')}.` : 'Inga begrepp är kvar att öva just nu.',
    '', 'Hör gärna av dig om du har frågor.', 'Med vänliga hälsningar,', s.larare[0]?.namn ?? 'Läraren',
  ].join('\n');

  return (
    <div className="v3-sida-innehall">
      <div className="v3-kpi-rad">
        <Kpi ikon={Ikon.varning} rubrik="Hög prioritet" varde={hogRisk} under="tre eller fler saker att ta tag i" ton="rod" />
        <Kpi ikon={Ikon.kuvert} rubrik="Skickat" varde={antal('skickat')} under={`av ${rader.length} elever`} ton="gron" />
        <Kpi ikon={Ikon.klocka} rubrik="Väntar på svar" varde={antal('vantar')} under="meddelande skickat" ton="gul" />
        <Kpi ikon={Ikon.elever} rubrik="Ej granskat" varde={antal('ej-granskat')} under="inte kontaktade i perioden" ton="bla" />
      </div>

      <div className="v3-rutnat tva">
        <Kort rubrik={`Prioriteringslista — ${klass.namn}`} under="flest saker att ta tag i överst · klicka för meddelandeförslag">
          {rader.length === 0 ? <DataSaknas text="Inga elever i urvalet." /> : (
            <table className="v3-tabell">
              <thead><tr><th>Elev</th><th>Prio</th><th>Läxförhör</th><th>Exit</th><th>Quizsvar</th><th>Status</th></tr></thead>
              <tbody>{rader.map((r) => {
                const st = kontakt[r.elev.id]?.status ?? 'ej-granskat';
                return (
                  <tr key={r.elev.id} className={vald === r.elev.id ? 'act' : ''} onClick={() => setVald(r.elev.id)}>
                    <td><b>{r.elev.namn}</b></td>
                    <td><span className={`v3-badge-text ${r.prio >= 3 ? 'rod' : r.prio >= 1 ? 'gul' : 'gron'}`}>{r.antalProv === 0 ? 'inga resultat' : r.prio >= 3 ? 'Hög' : r.prio >= 1 ? 'Medel' : 'Låg'}</span></td>
                    <td>{r.laxforhorProcent ?? '—'} %</td><td>{r.exitProcent ?? '—'} %</td><td>{r.narvaroProcent ?? '—'} %</td>
                    <td><select aria-label={`Kontaktstatus ${r.elev.namn}`} value={st} onClick={(e) => e.stopPropagation()} onChange={(e) => satt(r.elev.id, e.target.value as Status)}>
                      <option value="ej-granskat">Ej granskat</option><option value="vantar">Väntar</option><option value="skickat">Skickat</option></select></td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </Kort>

        <Kort rubrik="Meddelandeförslag" under={valdRad !== null ? `${valdRad.elev.namn} · texten är beskrivande och kan redigeras innan den skickas` : 'välj en elev i listan'}>
          {valdRad === null ? <p className="muted small">Klicka på en elev för att få ett förslag byggt på den enkla rapporten.</p>
            : forslag === null ? <DataSaknas text="Inga resultat att skriva om än." />
              : (<>
                <textarea className="v3-meddelande" aria-label="Meddelande" rows={14} defaultValue={meddelande} key={valdRad.elev.id} />
                <div className="v3-knapprad">
                  <button className="v3-knapp" onClick={() => { const t = (document.querySelector('.v3-meddelande') as HTMLTextAreaElement | null)?.value ?? meddelande; void navigator.clipboard?.writeText(t); satt(valdRad.elev.id, 'vantar'); }}>Kopiera och märk som skickat</button>
                  <button className="v3-knapp sek" onClick={() => setVy({ typ: 'elever' })}>Öppna rapporten</button>
                </div>
                <DataSaknas text="Vårdnadshavarnas e-post finns inte i datan än. Klistra in meddelandet i Teams, Schoolsoft eller e-post." />
              </>)}
        </Kort>
      </div>
    </div>
  );
}
