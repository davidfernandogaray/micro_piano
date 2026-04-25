import * as Tone from 'tone';
import type { InstrumentPreset } from './instruments';
import { recorderNoteOn, recorderNoteOff } from './midiRecorder';

const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.005, decay: 0.35, sustain: 0.08, release: 0.5 },
  maxPolyphony: 32,
});

const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.15 });
synth.connect(reverb);
reverb.toDestination();

export function setInstrument(preset: InstrumentPreset): void {
  releaseAll();
  synth.set({
    oscillator: preset.oscillator as Tone.OmniOscillatorOptions,
    envelope: preset.envelope,
  });
}

// Maps pointerId → noteIndex currently held by that pointer
const activePointers = new Map<number, number>();
// Maps noteIndex → frequency (for release lookup)
const noteFreqMap = new Map<number, number>();

export function attackNote(noteIndex: number, frequency: number, pointerId: number): void {
  // Release any note this pointer was already holding (slide)
  releaseNote(pointerId);
  activePointers.set(pointerId, noteIndex);
  noteFreqMap.set(noteIndex, frequency);
  synth.triggerAttack(frequency, Tone.now());
  recorderNoteOn(noteIndex);
}

export function releaseNote(pointerId: number): void {
  const noteIndex = activePointers.get(pointerId);
  if (noteIndex === undefined) return;
  const freq = noteFreqMap.get(noteIndex);
  if (freq !== undefined) {
    synth.triggerRelease(freq, Tone.now());
    noteFreqMap.delete(noteIndex);
  }
  activePointers.delete(pointerId);
  if (noteIndex !== undefined) recorderNoteOff(noteIndex);
}

export function releaseAll(): void {
  synth.releaseAll();
  activePointers.clear();
  noteFreqMap.clear();
}

export async function startAudio(): Promise<void> {
  await Tone.start();
}
