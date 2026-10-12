/**
 * Del 190 · Frågor om elevnamn: snarlika namn (samma förnamn och minst ett namn efter förnamnet lika)
 * och samma namn där båda har resultat på samma prov. Läraren svarar "samma person" (slås ihop,
 * resultaten flyttas till namnet som behålls) eller "olika personer" (appen frågar inte igen).
 */
import {
  hittaDubbletter, markeraOlikaElever, slaIhopElever, snarlikaElever, type Elev, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

interface Fraga { a: Elev; b: Elev; varfor: string; konflikt: string[] }

export function NamnFragor({ s, klassId, kor }: { s: Struktur; klassId: string; kor: (fn: () => Struktur, m: string) => void }) {
  const antal = (id: string) => (s.resultat ?? []).filter((r) => r.elevId === id).length;
  const fragor: Fraga[] = [
    ...hittaDubbletter(s, klassId).filter((d) => d.konflikt.length > 0)
      .map((d) => ({ a: d.till, b: d.fran, varfor: 'samma namn, men båda har resultat på samma prov', konflikt: d.konflikt })),
    ...snarlikaElever(s, klassId).map((p) => ({ a: p.a, b: p.b, varfor: `samma förnamn och ${p.gemensamt.length === 1 ? 'namnet' : 'namnen'} ${p.gemensamt.map((x) => `"${x}"`).join(', ')}`, konflikt: p.konflikt })),
  ];
  if (fragor.length === 0) return null;
  const sammaPerson = (f: Fraga, behall: Elev, bort: Elev) => {
    if (f.konflikt.length > 0 && !window.confirm(`${bort.namn} och ${behall.namn} har båda resultat på: ${f.konflikt.join(', ')}.\n\nÄr det säkert samma elev (t.ex. ett omprov)? Där båda har samma prov och datum behålls ${behall.namn}s resultat.`)) return;
    const r = slaIhopElever(lasStruktur(), bort.id, behall.id);
    kor(() => r.s, `${bort.namn} och ${behall.namn} är samma elev — ${r.flyttade} resultat flyttade till ${behall.namn}. ↩ Ångra finns.`);
  };
  return (
    <div className="uppg-kort st-namnfragor" role="region" aria-label="Frågor om elevnamn">
      <h3 style={{ margin: '0 0 4px' }}>❓ Är det samma elev? <small className="muted">· {fragor.length} {fragor.length === 1 ? 'fråga' : 'frågor'}</small></h3>
      <p className="small muted" style={{ margin: '0 0 8px' }}>Namnen liknar varandra men appen slår inte ihop dem själv. Svara en gång — svaret sparas.</p>
      {fragor.map((f) => {
        const [lang, kort] = f.a.namn.length >= f.b.namn.length ? [f.a, f.b] : [f.b, f.a];
        return (
          <div key={`${f.a.id}|${f.b.id}`} className="rad st-namnfraga" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <span><b>{f.a.namn}</b> ({antal(f.a.id)} resultat) och <b>{f.b.namn}</b> ({antal(f.b.id)} resultat) <span className="muted small">— {f.varfor}{f.konflikt.length > 0 ? ` · båda har ${f.konflikt.join(', ')}` : ''}</span></span>
            <button className="btn sm" aria-label={`Samma elev: ${kort.namn} och ${lang.namn}, behåll ${lang.namn}`} onClick={() => sammaPerson(f, lang, kort)}>Samma elev — behåll {lang.namn}</button>
            <button className="btn sec sm" aria-label={`Samma elev: ${kort.namn} och ${lang.namn}, behåll ${kort.namn}`} onClick={() => sammaPerson(f, kort, lang)}>behåll {kort.namn}</button>
            <button className="btn sec sm" aria-label={`Olika elever: ${f.a.namn} och ${f.b.namn}`} onClick={() => kor(() => markeraOlikaElever(lasStruktur(), f.a.id, f.b.id), `${f.a.namn} och ${f.b.namn} är olika elever — appen frågar inte igen.`)}>Olika elever</button>
          </div>
        );
      })}
    </div>
  );
}
