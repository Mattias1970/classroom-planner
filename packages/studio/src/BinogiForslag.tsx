/**
 * Del 229 · 🎬 Binogi-förslag — appen matchar varje delkapitel i bokens kapitel mot den inbyggda
 * Binogi-katalogen (foreslaBinogiFilmer) och visar förslag med poäng och vad som matchade.
 * Läraren öppnar länken, kontrollerar den i Binogi (✓ verifierad sparas) och lägger filmen på
 * en lektion. Egna katalogposter (titel, adress, nyckelord) sparas i webbläsaren och matchas
 * som de inbyggda. Binogi kan inte sökas live (inloggning, inget API) — 🔍 öppnar en webbsökning
 * begränsad till app.binogi.se.
 */
import { useState } from 'react';
import { binogiSokUrl, foreslaBinogiFilmer, hamtaLektionsplan, type BinogiPost, type Bok, type PlaneradLektion, type Struktur } from '@planner/kernel';
import { lasInstallning, sparaInstallning } from './store.js';

const EGNA_NYCKEL = 'binogi.egnaPoster';
const VERIFIERADE_NYCKEL = 'binogi.verifierade';

export function lasEgnaBinogiPoster(): BinogiPost[] { return lasInstallning<BinogiPost[]>(EGNA_NYCKEL, []); }

export function BinogiForslag({ s, amneId, bok, plan, laggPa }: {
  s: Struktur; amneId: string;
  bok: Bok;
  plan: PlaneradLektion[];
  /** Lägger en film på en lektion (samma som Filmer-flikens formulär). */
  laggPa: (lektionsIndex: number, titel: string, url: string) => void;
}) {
  const [egna, setEgnaRaw] = useState<BinogiPost[]>(lasEgnaBinogiPoster);
  const [verifierade, setVerifieradeRaw] = useState<string[]>(() => lasInstallning<string[]>(VERIFIERADE_NYCKEL, []));
  const setEgna = (p: BinogiPost[]) => { setEgnaRaw(p); sparaInstallning(EGNA_NYCKEL, p); };
  const setVerifierade = (v: string[]) => { setVerifieradeRaw(v); sparaInstallning(VERIFIERADE_NYCKEL, v); };
  const [nyTitel, setNyTitel] = useState(''); const [nyUrl, setNyUrl] = useState(''); const [nyOrd, setNyOrd] = useState('');
  const [oppet, setOppet] = useState<number | null>(null);
  const kapitelIPlanen = bok.kapitel.filter((k) => plan.some((r) => r.kapitel === k.nr));
  if (kapitelIPlanen.length === 0) return null;
  const arVerifierad = (p: BinogiPost, url: string) => p.verifierad || verifierade.includes(url);
  const lektionerFor = (kapNr: number, kod: string) => plan.map((r, i) => ({ r, i })).filter(({ r }) => r.kapitel === kapNr && r.lektion.avsnitt.startsWith(`${kod} `));
  const redanPaLektion = (kod: string, kapNr: number, url: string) => lektionerFor(kapNr, kod).some(({ i }) => (hamtaLektionsplan(s, amneId, i)?.filmer ?? []).some((f) => f.split('|').pop() === url));
  const laggTillEgen = () => {
    const url = nyUrl.trim(); const titel = nyTitel.trim();
    if (!url.startsWith('http') || titel === '') return;
    const slug = url.replace(/^https?:\/\/app\.binogi\.se\/l\//, '').replace(/[/?#].*$/, '');
    const post: BinogiPost = { titel, slug, amne: (['Kemi', 'Fysik', 'Biologi', 'Teknik', 'Matematik'] as const).find((a) => a.toLowerCase() === (bok.amne ?? '').toLowerCase()) ?? 'Kemi', nyckelord: nyOrd.split(',').map((x) => x.trim()).filter((x) => x !== ''), verifierad: true };
    setEgna([...egna.filter((p) => p.slug !== slug), post]); setNyTitel(''); setNyUrl(''); setNyOrd('');
  };
  return (
    <div className="uppg-kort binogi-forslag" style={{ borderLeft: '4px solid #2d6da3' }}>
      <b>🎬 Binogi-förslag per delkapitel</b> <small className="muted">— matchade mot bokens begrepp och rubriker. Öppna, kontrollera i Binogi och lägg på lektionen. ⚠ = adressen är härledd ur titeln och inte kontrollerad än.</small>
      {kapitelIPlanen.map((k) => {
        const forslag = foreslaBinogiFilmer(bok, k.nr, egna);
        const visa = oppet === k.nr;
        const antal = forslag.reduce((n, d) => n + d.forslag.length, 0);
        return (
          <div key={k.nr} style={{ marginTop: 8 }}>
            <button type="button" className="chipbtn" onClick={() => setOppet(visa ? null : k.nr)} aria-expanded={visa}>{visa ? '▾' : '▸'} Kapitel {k.nr} {k.namn} <small className="muted">· {antal} förslag</small></button>
            {visa && forslag.map((d) => (
              <div key={d.kod} className="rad small" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, margin: '6px 0 6px 12px' }}>
                <span><b>{d.kod}</b> {d.namn} {d.forslag.length === 0 && <span className="muted">— inget i katalogen passar.</span>} <a href={binogiSokUrl([d.namn, ...d.sokord])} target="_blank" rel="noreferrer" title="Webbsökning begränsad till app.binogi.se">🔍 sök</a></span>
                {d.forslag.map((f) => {
                  const lekt = lektionerFor(k.nr, d.kod);
                  const finns = f.redanIBoken || redanPaLektion(d.kod, k.nr, f.url);
                  const verif = arVerifierad(f.post, f.url);
                  return (
                    <span key={f.url} className="rad" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap', marginLeft: 12 }}>
                      <a href={f.url} target="_blank" rel="noreferrer" title={`Matchade: ${f.traffar.join(', ')}`}>▶ {f.post.titel}</a>
                      <small className="muted">{f.poang} p · {f.traffar.slice(0, 4).join(', ')}</small>
                      {verif ? <small title="Adressen är kontrollerad">✓</small> : (
                        <button type="button" className="chipbtn" title="Jag har öppnat länken och den fungerar" onClick={() => setVerifierade([...verifierade, f.url])}>⚠ markera som verifierad</button>
                      )}
                      {finns ? <small className="muted">· finns redan</small> : lekt.length === 1 ? (
                        <button type="button" className="chipbtn" onClick={() => laggPa(lekt[0].i, f.post.titel, f.url)}>+ på lektion {lekt[0].i + 1}</button>
                      ) : lekt.length > 1 ? (
                        <select aria-label={`Lägg ${f.post.titel} på lektion`} value="" onChange={(e) => { if (e.target.value !== '') laggPa(Number(e.target.value), f.post.titel, f.url); e.target.value = ''; }}>
                          <option value="">+ på lektion …</option>
                          {lekt.map(({ r, i }) => <option key={i} value={i}>Lektion {i + 1} — {r.lektion.avsnitt}</option>)}
                        </select>
                      ) : <small className="muted">· ingen lektion i planen</small>}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
      <details style={{ marginTop: 8 }}>
        <summary className="small">➕ Egen katalogpost <small className="muted">· en Binogi-lektion som saknas i katalogen — matchas sedan mot alla böcker</small></summary>
        <div className="rad small" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <input aria-label="Binogi-lektionens titel" placeholder="Titel" value={nyTitel} onChange={(e) => setNyTitel(e.target.value)} style={{ width: 180 }} />
          <input aria-label="Binogi-adress" placeholder="https://app.binogi.se/l/…" value={nyUrl} onChange={(e) => setNyUrl(e.target.value)} style={{ width: 260 }} />
          <input aria-label="Nyckelord" placeholder="nyckelord, kommaseparerade" value={nyOrd} onChange={(e) => setNyOrd(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button type="button" className="btn sm" disabled={!nyUrl.trim().startsWith('http') || nyTitel.trim() === ''} onClick={laggTillEgen}>Spara</button>
        </div>
        {egna.length > 0 && <p className="small muted" style={{ margin: '4px 0 0' }}>Egna: {egna.map((p) => <span key={p.slug}>{p.titel} <button type="button" className="icon-btn" aria-label={`Ta bort ${p.titel}`} onClick={() => setEgna(egna.filter((x) => x.slug !== p.slug))}>✕</button> </span>)}</p>}
      </details>
    </div>
  );
}
