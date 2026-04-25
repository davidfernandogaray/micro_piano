export const STEPS_PER_OCTAVE = 24;
// A4 = octave 4 + 9 semitones from C = 4*24 + 9*2 = 114
export const A4_INDEX = 114;

export function noteFrequency(noteIndex: number): number {
  return 440 * Math.pow(2, (noteIndex - A4_INDEX) / STEPS_PER_OCTAVE);
}

export type KeyVariant = 'white' | 'black' | 'gray';

export interface NoteDefinition {
  noteId: string;
  noteIndex: number;
  frequency: number;
  keyVariant: KeyVariant;
  octave: number;
  label: string;
}

// Standard 12-TET semitone layout within one octave (0=C, 1=C#, 2=D ... 11=B)
const SEMITONE_VARIANT: KeyVariant[] = [
  'white', 'black', 'white', 'black', 'white',
  'white', 'black', 'white', 'black', 'white', 'black', 'white',
];

const SEMITONE_LABEL = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function buildNoteTable(startOctave: number, endOctave: number): NoteDefinition[] {
  const notes: NoteDefinition[] = [];

  for (let octave = startOctave; octave <= endOctave; octave++) {
    for (let semi = 0; semi < 12; semi++) {
      // Standard chromatic note (even 24-TET step)
      const evenStep = semi * 2;
      const noteIndex = octave * STEPS_PER_OCTAVE + evenStep;
      notes.push({
        noteId: `${SEMITONE_LABEL[semi]}${octave}`,
        noteIndex,
        frequency: noteFrequency(noteIndex),
        keyVariant: SEMITONE_VARIANT[semi],
        octave,
        label: `${SEMITONE_LABEL[semi]}${octave}`,
      });

      // Microtonal half-step (odd 24-TET step) — sits between this and the next semitone
      const oddStep = semi * 2 + 1;
      const microIndex = octave * STEPS_PER_OCTAVE + oddStep;
      notes.push({
        noteId: `${SEMITONE_LABEL[semi]}+${octave}`,
        noteIndex: microIndex,
        frequency: noteFrequency(microIndex),
        keyVariant: 'gray',
        octave,
        label: `${SEMITONE_LABEL[semi]}½`,
      });
    }
  }

  return notes;
}
