// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { bokFromImport, importeraResultat, laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst, registreraPlanering, resetIdRaknare, sparaBok, tomStruktur, type Struktur } from '@planner/kernel';
import { Utvecklingssamtal } from '../src/Utvecklingssamtal';
import { sparaStruktur } from '../src/store';

function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'e2', klassId: 'k', namn: 'Omar Ali', grupp: 'B' });
  const imp = (kalla: 'socrative-laxforhor' | 'socrative-exit', prov: string, datum: string, a: number, o: number) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rum: prov.toUpperCase(), rader: [{ namn: 'Anna Berg', poang: a, maxPoang: 10 }, { namn: 'Omar Ali', poang: o, maxPoang: 10 }] }).s;
  };
  imp('socrative-exit', 'Biologi41', '2026-08-24', 7, 4); imp('socrative-exit', 'Biologi42', '2026-08-28', 9, 5);
  imp('socrative-laxforhor', 'Biologi41', '2026-08-28', 9, 6); imp('socrative-laxforhor', 'Biologi412', '2026-09-04', 10, 6);
  return s;
}
beforeEach(() => { localStorage.clear(); resetIdRaknare(); document.body.innerHTML = ''; });

describe('Del 164 · Utvecklingssamtal', () => {
  it('lista med status per elev; texten kan ändras, statusen ändras och texten följer', async () => {
    let s = bygg(); sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const rendera = () => act(() => root.render(<Utvecklingssamtal s={s} klass={s.klasser[0]} amneId="bi" kor={kor} idag="2026-10-07" onTillbaka={() => {}} />));
    rendera();
    expect(div.textContent).toContain('Utvecklingssamtal · 8B · Biologi');
    const status = (namn: string) => (div.querySelector(`select[aria-label="Status ${namn}"]`) as HTMLSelectElement);
    expect(status('Anna Berg').value).toBe('mycketBra');
    expect(status('Omar Ali').value).toBe('svart');
    // Öppna Omar: texten har högst sju rader och börjar positivt
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Omar Ali'))!.click(); });
    // Formaterad visning: rubrikerna i fet stil, Exit tickets i fet blå, ett stycke per rad
    const visning = div.querySelector('div[aria-label="Text Omar Ali"]')!;
    expect([...visning.querySelectorAll('b.st-samtal-rubrik')].map((b) => b.textContent)).toEqual(['Lektionerna: ', 'Närvaro: ', 'Läxläsning: ', 'Inlämningar: ']);
    expect(visning.querySelector('b.st-samtal-exit')!.textContent).toBe('Exit tickets');
    expect(visning.querySelectorAll('p').length).toBeLessThanOrEqual(7);
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Redigera'))!.click(); });
    const ta = div.querySelector('textarea[aria-label="Text Omar Ali"]') as HTMLTextAreaElement;
    expect(ta.value.split('\n').length).toBeLessThanOrEqual(7);
    expect(ta.value).toContain('Omar har just nu svårt att nå målen');
    // Ändra status → texten följer
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(status('Omar Ali'), 'nar'); status('Omar Ali').dispatchEvent(new Event('change', { bubbles: true })); });
    expect(s.samtalsUtvarderingar?.['e2|bi']?.status).toBe('nar');
    expect((div.querySelector('textarea[aria-label="Text Omar Ali"]') as HTMLTextAreaElement).value).toContain('Omar når målen');
    // Egen text sparas
    const tsetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    const ta2 = div.querySelector('textarea[aria-label="Text Omar Ali"]') as HTMLTextAreaElement;
    await act(async () => { tsetter.call(ta2, 'Min egen text.'); ta2.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Spara text'))!.click(); });
    expect(s.samtalsUtvarderingar?.['e2|bi']?.text).toBe('Min egen text.');
    expect(div.textContent).toContain('egen text');
    expect([...div.querySelectorAll('button')].some((b) => b.textContent?.includes('Alla till Word'))).toBe(true);
  });
});

describe('Del 172 · matematik — diagnoserna över varandra', () => {
  it('Diagnoser-kolumn i tabellen och en rad per diagnos i visningen', async () => {
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', schema: [{ dag: 2, start: '12:50', slut: '13:40' }] });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    const imp = (prov: string, datum: string, p: number, max = 20) => {
      s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov, datum, rader: [{ namn: 'Anna Berg', poang: p, maxPoang: max }] }).s;
    };
    imp('1.1 - 1.2 diagnos', '2026-09-05', 19); imp('1.3 - 1.4 diagnos', '2026-09-19', 18); imp('Stockholm stads screening', '2026-09-30', 46, 50);
    sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => root.render(<Utvecklingssamtal s={s} klass={s.klasser[0]} amneId="ma" kor={() => {}} idag="2026-10-07" onTillbaka={() => {}} />));
    expect([...div.querySelectorAll('thead th')].map((th) => th.textContent)).toContain('Diagnoser');
    expect([...div.querySelectorAll('.st-samtal-diag')].map((x) => x.textContent)).toEqual(['95', '90', '92']);
    expect(div.textContent).toContain('snitt 93 %');   // Del 179: screeningen räknas inte in
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Anna Berg'))!.click(); });
    const visning = div.querySelector('div[aria-label="Text Anna Berg"]')!;
    expect(visning.querySelector('b.st-samtal-rubrik')!.textContent).toBe('Diagnoser: ');
    const rader = [...visning.querySelectorAll('.st-samtal-underrad')].map((r) => [...r.children].map((c) => c.textContent)).filter((r) => r.length === 2);
    expect(rader).toEqual([
      ['1.1 - 1.2 Diagnos', '95 % (mycket bra)'], ['1.3 - 1.4 Diagnos', '90 % (går bra)'],
      ['Snitt av två diagnoser', '93 % (mycket bra)'], ['Stockholm stads screening', '92 % (mycket bra)']]);
    expect(div.textContent).toContain('5 stycken');   // inledning, Diagnoser, Screening, Inlämningar, avslut — inga förhör i kapitlet   // inledning, Diagnoser, Inlämningar, avslut — inga förhör i kapitlet
  });
});

describe('Del 172 · matematik — kapitelval och gemensam text', () => {
  it('checklista över genomförda kapitel; urvalet styr texten; gemensam text kan redigeras', async () => {
    const MA = bokFromImport(JSON.stringify({
      schema: 'classroom-planner-bok', version: 1,
      bok: { id: 'ma', titel: 'Matematik Y', förlag: 'Liber', ämne: 'Matematik', årskurs: 8, kapitelMeta: { '1': { name: 'Tal', col: '#2f5aa8', mal: ['räkna med negativa tal'] }, '2': { name: 'Geometri', col: '#2f8a58' } } },
      lektioner: { '1': [{ id: 1, type: 'regular', avsnitt: '1.1 Negativa tal', del: 1 }, { id: 2, type: 'regular', avsnitt: '1.2 Potenser', del: 1 }], '2': [{ id: 1, type: 'regular', avsnitt: '2.1 Vinklar', del: 1 }] },
    }));
    let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '26/27', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
    s = sparaBok(s, MA);
    s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'Ma' });
    s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8A' });
    s = laggTillAmne(s, { id: 'ma', klassId: 'k', namn: 'Matematik', bokId: 'ma', schema: [{ dag: 2, start: '12:50', slut: '13:40' }] });
    s = registreraPlanering(s, { id: 'pl', amneId: 'ma', bokId: 'ma', skapad: '2026-08-10' });
    s = laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'socrative-exit', prov: '1.1 Exit', datum: '2026-08-18', rum: 'Matte8AA', rader: [{ namn: 'Anna Berg', poang: 8, maxPoang: 10 }] }).s;
    s = importeraResultat(s, { klassId: 'k', amneId: 'ma', kalla: 'magma', prov: '1.1 - 1.2 diagnos', datum: '2026-09-05', rader: [{ namn: 'Anna Berg', poang: 19, maxPoang: 20 }] }).s;
    sparaStruktur(s);
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    const kor = (fn: () => Struktur) => { s = fn(); sparaStruktur(s); rendera(); };
    const rendera = () => act(() => root.render(<Utvecklingssamtal s={s} klass={s.klasser[0]} amneId="ma" kor={kor} idag="2026-10-07" onTillbaka={() => {}} />));
    rendera();
    // Två genomförda kapitel → checklistan är öppen och ber om ett val; båda är med tills läraren väljer
    const kap = div.querySelector('[aria-label="Kapitlen i rapporten"]')!;
    expect(kap.querySelector('summary')!.textContent).toContain('välj vilka kapitel');
    expect([...kap.querySelectorAll('input[type="checkbox"]')].map((c) => c.getAttribute('aria-label'))).toEqual(['Kapitel 1 Tal', 'Delkapitel 1.1', 'Delkapitel 1.2', 'Kapitel 2 Geometri', 'Delkapitel 2.1']);
    const gem = () => div.querySelector('div[aria-label="Gemensam text"]')!.textContent;
    expect(gem()).toContain('kapitel 1 Tal — delkapitlen 1.1 Negativa tal och 1.2 Potenser. Kapitlet handlar om: räkna med negativa tal.');
    expect(gem()).toContain('kapitel 2 Geometri');
    // Välj bort kapitel 2
    await act(async () => { (kap.querySelector('input[aria-label="Kapitel 2 Geometri"]') as HTMLInputElement).click(); });
    expect(s.samtalsKapitel?.ma?.koder).toEqual(['1.1', '1.2']);
    expect(gem()).not.toContain('Geometri');
    expect(div.querySelector('[aria-label="Kapitlen i rapporten"] summary')!.textContent).not.toContain('välj vilka');
    // Elevens text: Förhören per kapitel
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent?.includes('Anna Berg'))!.click(); });
    const rader = [...div.querySelectorAll('div[aria-label="Text Anna Berg"] .st-samtal-underrad')].map((r) => [...r.children].map((c) => c.textContent));
    expect(rader).toContainEqual(['Kapitel 1 Tal · Exit tickets', '1.1 80 %']);
    // Egen gemensam text
    const tsetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent === '✏ Redigera')!.click(); });
    const ta = div.querySelector('textarea[aria-label="Gemensam text"]') as HTMLTextAreaElement;
    await act(async () => { tsetter.call(ta, 'Vi har räknat med tal.'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { [...div.querySelectorAll('button')].find((b) => b.textContent === '💾 Spara text')!.click(); });
    expect(s.samtalsKapitel?.ma?.text).toBe('Vi har räknat med tal.');
    expect(gem()).toBe('Vi har räknat med tal.');
  });
});
