import { describe, expect, it } from 'vitest';
import { parseFilmState, parsePrototypeLinks, summarizePrototypeLinks } from '../src/index.js';

const HTML = `
<h3>Lektion 1 – 1.1 Negativa tal</h3>
<div class="filmer">
  <a href="https://app.binogi.se/l/introduktion-till-negativa-tal">Introduktion till negativa tal – Binogi</a>
  <a href="https://app.binogi.se/l/rationella-tal">Rationella tal – Binogi</a>
  <a href="https://www.youtube.com/watch?v=abc123">Genomgång negativa tal</a>
</div>
<p>Exit ticket: Socrative Roomname: Matte8B Quiz: 1.1a</p>
<h3>Lektion 3 – 1.2 Addition &amp; subtraktion</h3>
<a href="https://app.binogi.se/l/addition-negativa-tal">Addition med negativa tal</a>
<a href="https://example.com/vanlig-lank">Ej film</a>
<p>Quiz: Quiz1.2b</p>
<h3>2.1 Mönster</h3>
<a href="https://app.binogi.se/l/moenster">Mönster – Binogi</a>
<a href="https://app.binogi.se/l/moenster">Mönster – Binogi (dubblett)</a>
`;

describe('parsePrototypeLinks', () => {
  const links = parsePrototypeLinks(HTML);

  it('associerar filmlänkar till närmast föregående delkapitel', () => {
    const f11 = links.filter((l) => l.delkapitel === '1.1' && l.typ === 'film');
    expect(f11.map((l) => l.url)).toEqual([
      'https://app.binogi.se/l/introduktion-till-negativa-tal',
      'https://app.binogi.se/l/rationella-tal',
      'https://www.youtube.com/watch?v=abc123',
    ]);
    expect(f11[0].titel).toContain('Introduktion till negativa tal');
  });

  it('fångar Socrative-quizreferenser som quiz', () => {
    const q11 = links.filter((l) => l.delkapitel === '1.1' && l.typ === 'quiz');
    expect(q11.map((l) => l.titel)).toContain('Matte8B');
    expect(q11.map((l) => l.titel)).toContain('1.1a');
    const q12 = links.filter((l) => l.delkapitel === '1.2' && l.typ === 'quiz');
    expect(q12.map((l) => l.titel)).toContain('Quiz1.2b');
  });

  it('ignorerar icke-filmlänkar och deduplicerar per delkapitel+url', () => {
    expect(links.some((l) => l.url.includes('example.com'))).toBe(false);
    expect(links.filter((l) => l.delkapitel === '2.1' && l.typ === 'film')).toHaveLength(1);
  });

  it('tål trasig indata utan att kasta', () => {
    expect(parsePrototypeLinks('')).toEqual([]);
    expect(parsePrototypeLinks('<a href="x')).toEqual([]);
  });
});

describe('summarizePrototypeLinks', () => {
  it('räknar filmer och quiz per kapitel', () => {
    const s = summarizePrototypeLinks(parsePrototypeLinks(HTML));
    expect(s.perKapitel[1].filmer).toBe(4);
    expect(s.perKapitel[2].filmer).toBe(1);
    expect(s.totalFilmer).toBe(5);
    expect(s.totalQuiz).toBeGreaterThanOrEqual(3);
  });
});

describe('parseFilmState (verklig prototypstruktur)', () => {
  const REAL = `
// ── DYNAMIC CONTENT STATE (film & magma, keyed by "kap-id") ──
const filmState = {
  // 1.1 Negativa tal (lek 1)
  '1-1': [
    {title:'Introduktion till negativa tal – Binogi', url:'https://app.binogi.se/l/introduktion-till-negativa-tal'},
    {title:'Rationella tal – Binogi', url:'https://app.binogi.se/l/rationella-tal'}
  ],
  '2-59': [
    {title:'Uttryck med variabler – Binogi', url:'https://app.binogi.se/l/uttryck'}
  ]
};
const magmaState = {};`;
  it('läser kap-id-nycklade filmlistor med exakta lektionsadresser', () => {
    const f = parseFilmState(REAL);
    expect(f).toHaveLength(3);
    expect(f[0]).toEqual({ kapitel: 1, lektionId: 1, titel: 'Introduktion till negativa tal – Binogi', url: 'https://app.binogi.se/l/introduktion-till-negativa-tal' });
    expect(f[2].kapitel).toBe(2);
    expect(f[2].lektionId).toBe(59);
  });
  it('hanterar escapade citattecken och saknad filmState', () => {
    expect(parseFilmState("const filmState = { '1-2': [{title:'Bråk \\'special\\'', url:'https://x.se'}] };")[0].titel).toBe("Bråk 'special'");
    expect(parseFilmState('<html>ingen state</html>')).toEqual([]);
  });
});
