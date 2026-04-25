import { describe, it, expect } from 'vitest';
import { noteFrequency, buildNoteTable, A4_INDEX, STEPS_PER_OCTAVE } from './tuning';

describe('noteFrequency', () => {
  it('A4 = 440 Hz', () => {
    expect(noteFrequency(A4_INDEX)).toBeCloseTo(440, 5);
  });

  it('one octave up = 880 Hz', () => {
    expect(noteFrequency(A4_INDEX + STEPS_PER_OCTAVE)).toBeCloseTo(880, 5);
  });

  it('one octave down = 220 Hz', () => {
    expect(noteFrequency(A4_INDEX - STEPS_PER_OCTAVE)).toBeCloseTo(220, 5);
  });

  it('one 24-TET step up is a quarter-tone (~452 Hz)', () => {
    const f = noteFrequency(A4_INDEX + 1);
    expect(f).toBeGreaterThan(440);
    expect(f).toBeLessThan(noteFrequency(A4_INDEX + 2)); // less than a full semitone
    expect(f).toBeCloseTo(440 * Math.pow(2, 1 / 24), 5);
  });

  it('24 steps = exactly one octave', () => {
    const f0 = noteFrequency(0);
    const f24 = noteFrequency(STEPS_PER_OCTAVE);
    expect(f24 / f0).toBeCloseTo(2, 10);
  });
});

describe('buildNoteTable', () => {
  it('produces 24 notes for 1 octave (12 chromatic + 12 microtonal)', () => {
    const notes = buildNoteTable(4, 4);
    expect(notes).toHaveLength(24); // 12 semitones × 2 (standard + micro each)
  });

  it('C4 has frequency ~261.63 Hz', () => {
    const notes = buildNoteTable(4, 4);
    const c4 = notes.find(n => n.noteId === 'C4');
    expect(c4).toBeDefined();
    expect(c4!.frequency).toBeCloseTo(261.63, 1);
  });

  it('gray microtonal keys interleave with chromatic keys', () => {
    const notes = buildNoteTable(4, 4);
    const grayCount = notes.filter(n => n.keyVariant === 'gray').length;
    expect(grayCount).toBe(12);
  });
});
