/**
 * Del 152 · Provlarm: alla i klassen ska vara godkända på DigiExam-proven.
 * Visar tydligt elever som inte är godkända eller inte har skrivit provet
 * (ett prov och dess omprov räknas ihop), och prov där gränsen saknas.
 * Används i Resultat (SuperTeach, DigiExam) och i Översikt.
 */
import { digiexamLarm, type DigiExamLarm, type Struktur } from '@planner/kernel';

const kort = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };

/** Alla larm i urvalet: per klass (och ämne), bara prov som larmar. */
export function provLarm(s: Struktur, klassIds: string[], amneId?: string): Array<DigiExamLarm & { klass: string; amne: string }> {
  return klassIds.flatMap((klassId) => {
    const klass = s.klasser.find((k) => k.id === klassId)?.namn ?? '';
    const amnen = s.amnen.filter((a) => a.klassId === klassId && (amneId === undefined || amneId === '' || a.id === amneId));
    return amnen.flatMap((a) => digiexamLarm(s, klassId, a.id).filter((l) => l.larm).map((l) => ({ ...l, klass, amne: a.namn })));
  });
}

function LarmRad({ l, visaKlass }: { l: DigiExamLarm & { klass?: string; amne?: string }; visaKlass?: boolean }) {
  return (
    <div className="provlarm-prov">
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <b>{visaKlass === true && l.klass !== undefined ? `${l.klass} · ${l.amne} · ` : ''}{l.prov}</b>
        <span className="small muted">{kort(l.datum)} · {l.grans !== null ? `godkänt från ${l.grans} av ${l.maxPoang} p` : 'gräns saknas'} · {l.godkanda} av {l.antalElever} godkända</span>
      </div>
      {l.grans === null && <p className="small" style={{ margin: '2px 0' }}>⚠ Gränsen för godkänt går inte att tolka ur provnamnet — importera filen igen och ange hur många poäng som krävs.</p>}
      {l.ejGodkanda.length > 0 && (
        <p className="small" style={{ margin: '2px 0' }}><b>Inte godkända ({l.ejGodkanda.length}):</b>{' '}
          {l.ejGodkanda.map((e) => <span key={e.elevId} className="provlarm-elev">{e.namn} <small>{e.poang}/{e.maxPoang}</small></span>)}</p>
      )}
      {l.ejSkrivit.length > 0 && (
        <p className="small" style={{ margin: '2px 0' }}><b>Har inte skrivit ({l.ejSkrivit.length}):</b>{' '}
          {l.ejSkrivit.map((e) => <span key={e.elevId} className="provlarm-elev saknas">{e.namn}</span>)}</p>
      )}
      {l.godkandaPaOmprov.length > 0 && (
        <p className="small muted" style={{ margin: '2px 0' }}>Godkända på omprovet: {l.godkandaPaOmprov.map((e) => `${e.namn} (${e.forePoang} → ${e.poang})`).join(' · ')}</p>
      )}
    </div>
  );
}

/** Larmrutan för en klass (och ett ämne). Visar en grön bekräftelse när alla är godkända. */
export function DigiExamLarmPanel({ s, klassId, amneId, tyst }: { s: Struktur; klassId: string; amneId?: string; tyst?: boolean }) {
  const alla = digiexamLarm(s, klassId, amneId);
  if (alla.length === 0) return null;
  const larm = alla.filter((l) => l.larm);
  if (larm.length === 0) {
    return tyst === true ? null : <p className="provlarm-ok small" role="status">✓ Alla elever är godkända på {alla.length === 1 ? alla[0].prov : `alla ${alla.length} DigiExam-prov`}.</p>;
  }
  const antal = larm.reduce((n, l) => n + l.ejGodkanda.length + l.ejSkrivit.length, 0);
  return (
    <div className="provlarm" role="alert" aria-label="Provlarm">
      <div className="provlarm-rubrik">🚨 Alla är inte godkända — {antal} elev{antal === 1 ? '' : 'er'} på {larm.length} prov behöver {larm.some((l) => l.ejSkrivit.length > 0) ? 'skriva eller göra omprov' : 'göra omprov'}</div>
      {larm.map((l) => <LarmRad key={l.provNyckel} l={l} />)}
    </div>
  );
}

/** Larmrutan för flera klasser och ämnen (Översikt). */
export function ProvLarmOversikt({ s, klassIds, onOppna }: { s: Struktur; klassIds: string[]; onOppna?: () => void }) {
  const larm = provLarm(s, klassIds);
  if (larm.length === 0) return null;
  const antal = larm.reduce((n, l) => n + l.ejGodkanda.length + l.ejSkrivit.length, 0);
  return (
    <div className="provlarm" role="alert" aria-label="Provlarm">
      <div className="provlarm-rubrik">🚨 Provlarm — {antal} elev{antal === 1 ? '' : 'er'} är inte godkända eller har inte skrivit ({larm.length} prov)
        {onOppna !== undefined && <button className="v3-lank" style={{ marginLeft: 8 }} onClick={onOppna}>Öppna resultat →</button>}</div>
      {larm.map((l) => <LarmRad key={`${l.klass}|${l.amne}|${l.provNyckel}`} l={l} visaKlass />)}
    </div>
  );
}
