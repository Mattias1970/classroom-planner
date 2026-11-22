/** Del 263 · Elevernas inlämningar görs i Teams — inga elevtexter pekar på Google Classroom. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Del 263 · inlämningar i Teams', () => {
  it('lektionsreglerna säger Teams, både för matematik (foto på beräkningarna) och NO (Testa dig själv)', () => {
    const regler = readFileSync(new URL('../src/domain/lektionsregler.ts', import.meta.url), 'utf8');
    expect(regler).toContain('fotografera beräkningarna och ladda upp i Teams');
    expect(regler).toContain('lämnas in i Teams (fotografi eller text)');
    expect(regler).not.toContain('Classroom');
  });

  it('appens inlämningstexter (lektionskort, detaljplanering, uppgifter) säger Teams', () => {
    const app = readFileSync(new URL('../../studio/src/App.tsx', import.meta.url), 'utf8');
    expect(app.match(/Inlämning via Teams/g)).toHaveLength(2);
    expect(app).toContain('inlämnade via Teams innan nästa lektion');
    expect(app.match(/laddas upp i Teams/g)).toHaveLength(2);
    expect(app).not.toContain('Google Classroom');
  });
});
