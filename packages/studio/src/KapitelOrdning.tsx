/**
 * Del 227 · Kapitlens ordning — läraren väljer i vilken följd bokens kapitel (och delkapitlen i
 * ett kapitel) läses: kap 10 före kap 7. Bokens ordning är förvalet första gången. Används när
 * planeringen skapas (SkapaPlaneringRuta), i 🧩 Kursernas ordning (KapitelOrdningPanel) och i
 * 👨‍👩‍👧 Pedagogisk planering (KapitelOrdningRedigerare med bara de valda delkapitlen).
 */
import { useState } from 'react';
import {
  bokensKapitelOrdning, flyttaDelkapitelIOrdning, flyttaKapitelIOrdning, planensKapitel, planensKapitelOrdning,
  sammaKapitelOrdning, sattKapitelOrdning, type KapitelIPlanen, type KapitelOrdning, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

/** Kapitlen i en ordnings följd (onämnda sist), med delkapitlen i ordningens följd. */
export function kapitelIFoljd(kapitel: KapitelIPlanen[], o: KapitelOrdning): Array<KapitelIPlanen & { foljd: string[] }> {
  const nr = [...o.kapitel.filter((n) => kapitel.some((k) => k.nr === n)), ...kapitel.map((k) => k.nr).filter((n) => !o.kapitel.includes(n))];
  return nr.map((n) => {
    const k = kapitel.find((x) => x.nr === n)!;
    const onskad = o.delkapitel?.[String(n)] ?? [];
    const foljd = [...onskad.filter((kod) => k.delkapitel.includes(kod)), ...k.delkapitel.filter((kod) => !onskad.includes(kod))];
    return { ...k, foljd };
  });
}

/** Fyller på en ordning så att alla kapitel och delkapitel nämns (i den följd de redan står). */
export function fullOrdning(kapitel: KapitelIPlanen[], o: KapitelOrdning): KapitelOrdning {
  const lista = kapitelIFoljd(kapitel, o);
  return { kapitel: lista.map((k) => k.nr), delkapitel: Object.fromEntries(lista.map((k) => [String(k.nr), k.foljd])) };
}

export function KapitelOrdningRedigerare({ kapitel, ordning, setOrdning, bokens, visaDelkapitel = true, kompakt = false }: {
  kapitel: KapitelIPlanen[];
  ordning: KapitelOrdning;
  setOrdning: (o: KapitelOrdning) => void;
  /** Bokens ordning — knappen ↺ återställer till den. */
  bokens?: KapitelOrdning;
  visaDelkapitel?: boolean;
  kompakt?: boolean;
}) {
  const o = fullOrdning(kapitel, ordning);
  const lista = kapitelIFoljd(kapitel, o);
  if (lista.length === 0) return <p className="muted small">Ämnet saknar bok.</p>;
  const namn = (k: KapitelIPlanen, kod: string) => k.kurser.find((x) => x.nyckel.endsWith(`:${kod}`))?.titel.replace(/^\d+\.\d+\s*/, '') ?? '';
  return (
    <div className="kapitelordning">
      {bokens !== undefined && (
        <div className="rad small" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span className="muted">{sammaKapitelOrdning(o, fullOrdning(kapitel, bokens)) ? 'Bokens ordning' : 'Egen ordning'}</span>
          <button type="button" className="chipbtn" disabled={sammaKapitelOrdning(o, fullOrdning(kapitel, bokens))} onClick={() => setOrdning(fullOrdning(kapitel, bokens))} title="Tillbaka till den ordning kapitlen står i boken">↺ Bokens ordning</button>
        </div>
      )}
      <ol className="kapitelordning-lista" style={{ margin: 0, paddingLeft: kompakt ? 18 : 22 }}>
        {lista.map((k, i) => {
          const fore = lista[i - 1]; const efter = lista[i + 1];
          const kanUpp = !k.genomford && fore !== undefined && !fore.genomford;
          const kanNer = !k.genomford && efter !== undefined && !efter.genomford;
          return (
            <li key={k.nr} className={k.genomford ? 'muted' : ''} style={{ margin: '2px 0' }}>
              <span className="rad" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>Kap {k.nr}</b> <span>{k.namn}</span>
                {k.genomford && <small className="muted">· påbörjat — flyttas inte</small>}
                {k.tomt && <small className="muted">· inga lektioner i planen</small>}
                <button type="button" className="icon-btn" aria-label={`Flytta kapitel ${k.nr} tidigare`} title="Läs kapitlet tidigare" disabled={!kanUpp} onClick={() => setOrdning(flyttaKapitelIOrdning(o, k.nr, -1))}>▲</button>
                <button type="button" className="icon-btn" aria-label={`Flytta kapitel ${k.nr} senare`} title="Läs kapitlet senare" disabled={!kanNer} onClick={() => setOrdning(flyttaKapitelIOrdning(o, k.nr, 1))}>▼</button>
              </span>
              {visaDelkapitel && k.foljd.length > 1 && (
                <span className="rad small" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center', marginLeft: 4 }}>
                  {k.foljd.map((kod, j) => {
                    const kurs = k.kurser.find((x) => x.nyckel.endsWith(`:${kod}`));
                    const last = kurs?.genomford === true;
                    const grann = (d: number) => k.kurser.find((x) => x.nyckel.endsWith(`:${k.foljd[j + d]}`));
                    const upp = !last && j > 0 && grann(-1)?.genomford !== true;
                    const ner = !last && j < k.foljd.length - 1 && grann(1)?.genomford !== true;
                    return (
                      <span key={kod} className={`chipbtn${last ? ' muted' : ''}`} title={`${kod} ${namn(k, kod)}${last ? ' — genomförd' : ''}`} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                        {kod}
                        <button type="button" className="icon-btn" aria-label={`Flytta ${kod} tidigare`} disabled={!upp} onClick={() => setOrdning(flyttaDelkapitelIOrdning(o, kod, -1))} style={{ padding: '0 2px' }}>◀</button>
                        <button type="button" className="icon-btn" aria-label={`Flytta ${kod} senare`} disabled={!ner} onClick={() => setOrdning(flyttaDelkapitelIOrdning(o, kod, 1))} style={{ padding: '0 2px' }}>▶</button>
                      </span>
                    );
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Rutan som öppnas av ▶ Skapa planering / ➕ Spara ny planeringsversion: bokens kapitel i den
 * ordning de ska läsas (bokens ordning förvald första gången, annars planens nuvarande).
 */
export function SkapaPlaneringRuta({ s, amneId, idag, harPlanering, bokTitel, onSkapa, onAvbryt }: {
  s: Struktur; amneId: string; idag: string; harPlanering: boolean; bokTitel: string;
  /** ordning = null när läraren behåller bokens ordning. */
  onSkapa: (ordning: KapitelOrdning | null) => void;
  onAvbryt: () => void;
}) {
  // En ny planering har inget genomfört — först när en planering finns låses det som redan lästs
  const lastTill = harPlanering ? idag : undefined;
  const kapitel = planensKapitel(s, amneId, lastTill);
  const bokens = bokensKapitelOrdning(s, amneId);
  const [ordning, setOrdning] = useState<KapitelOrdning>(() => (harPlanering ? planensKapitelOrdning(s, amneId, idag) : bokens));
  const egen = !sammaKapitelOrdning(fullOrdning(kapitel, ordning), fullOrdning(kapitel, bokens));
  return (
    <div className="st-info-bak" onClick={onAvbryt}>
      <div className="st-info-popup pp-modal" role="dialog" aria-label="Kapitlens ordning" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px' }}>{harPlanering ? '➕ Ny planeringsversion' : '▶ Skapa planering'} · {bokTitel}</h3>
        <p className="small muted" style={{ margin: '0 0 8px' }}>I vilken ordning ska kapitlen läsas? Bokens ordning är förvald — flytta ett kapitel med ▲▼ (t.ex. kap 10 före kap 7) och delkapitel inom ett kapitel med ◀▶. Ordningen kan ändras senare under 🧩 Kursernas ordning.</p>
        <KapitelOrdningRedigerare kapitel={kapitel} ordning={ordning} setOrdning={setOrdning} bokens={bokens} />
        <div className="modal-actions">
          <button className="btn" onClick={() => onSkapa(egen ? fullOrdning(kapitel, ordning) : null)}>✔ {harPlanering ? 'Spara ny planeringsversion' : 'Skapa planering'}{egen ? ' med egen ordning' : ' i bokens ordning'}</button>
          <button className="btn sec" onClick={onAvbryt}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

/** Panelen i 🧩 Kursernas ordning: ändra kapitlens ordning i en befintlig planering. */
export function KapitelOrdningPanel({ s, amneId, idag, kor }: { s: Struktur; amneId: string; idag: string; kor: (fn: () => Struktur, m: string) => void }) {
  const kapitel = planensKapitel(s, amneId, idag).filter((k) => !k.tomt);
  if (kapitel.length < 2) return null;
  const ordning = planensKapitelOrdning(s, amneId, idag);
  const bokens = bokensKapitelOrdning(s, amneId);
  const satt = (o: KapitelOrdning) => {
    const foljd = kapitelIFoljd(kapitel, o).map((k) => `kap ${k.nr}`).join(' → ');
    kor(() => sattKapitelOrdning(lasStruktur(), amneId, o, idag), `Kapitlens ordning: ${foljd} — lektionerna har fått nya datum, lektionskorten följer med.`);
  };
  return (
    <div className="uppg-kort" style={{ margin: '6px 0' }}>
      <b className="small">📚 Kapitlens ordning</b> <small className="muted">· flytta ett helt kapitel (med prov och egna rader) tidigare eller senare</small>
      <KapitelOrdningRedigerare kapitel={kapitel} ordning={ordning} setOrdning={satt} bokens={bokens} visaDelkapitel={false} kompakt />
    </div>
  );
}
