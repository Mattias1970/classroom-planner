/** Del 257 · Varje menyval under Planering har en enkel beskrivning som börjar med valets namn. */
import { describe, expect, it } from 'vitest';
import { PLANERINGSMENY, amnesflikBeskrivning, menyBeskrivning, type PlaneringsMenyval } from '../src/domain/planeringsmeny.js';

describe('Del 257 · PLANERINGSMENY', () => {
  it('varje text börjar med menyvalets namn, är en till tre meningar och slutar med punkt', () => {
    for (const [val, text] of Object.entries(PLANERINGSMENY)) {
      expect(text, val).toMatch(/^[A-ZÅÄÖ][^:]{2,30}: [A-ZÅÄÖa-zåäö]/);
      expect(text.endsWith('.'), val).toBe(true);
      expect(text.length, val).toBeLessThanOrEqual(220);
    }
  });
  it('alla flikar i ämnets meny finns med', () => {
    const flikar: PlaneringsMenyval[] = ['planering', 'kortrad', 'tavla', 'detalj', 'oversikt', 'uppgifter', 'begrepp', 'filmer', 'magma', 'anteckningar', 'laborationer', 'provlapp', 'installningar', 'arsoversikt', 'skrivUt', 'veckaWord', 'kapitelWord', 'pedagogiskPlanering', 'planeringsmall', 'spara', 'hamta', 'kalender'];
    expect(Object.keys(PLANERINGSMENY).sort()).toEqual([...flikar].sort());
  });
  it('det som saknas står först när valet inte går att använda', () => {
    expect(menyBeskrivning('kortrad')).toBe(PLANERINGSMENY.kortrad);
    expect(menyBeskrivning('kortrad', 'Koppla en bok först')).toBe(`Koppla en bok först — ${PLANERINGSMENY.kortrad}`);
    expect(menyBeskrivning('kortrad', '')).toBe(PLANERINGSMENY.kortrad);
  });
  it('ämnesfliken säger vilken klass och vilket ämne — och vad som saknas', () => {
    expect(amnesflikBeskrivning('8B', 'Matematik', true)).toBe('Öppnar planeringen för Matematik i 8B.');
    expect(amnesflikBeskrivning('8A', 'Matematik', false)).toBe('Öppnar Matematik i 8A. Ämnet har ingen planering än — välj bok och tryck ▶ Skapa planering.');
  });
});
