export interface InstrumentPreset {
  id: string;
  name: string;
  oscillator: { type: OscillatorType };
  envelope: { attack: number; decay: number; sustain: number; release: number };
}

type OscillatorType = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'fatsine' | 'fatsawtooth' | 'fattriangle';

export const INSTRUMENTS: InstrumentPreset[] = [
  {
    id: 'piano',
    name: 'Piano',
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.35, sustain: 0.08, release: 0.5 },
  },
  {
    id: 'epiano',
    name: 'E. Piano',
    oscillator: { type: 'fatsine' },
    envelope: { attack: 0.01, decay: 0.5, sustain: 0.25, release: 0.6 },
  },
  {
    id: 'organ',
    name: 'Organ',
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.01, sustain: 1.0, release: 0.06 },
  },
  {
    id: 'synth',
    name: 'Synth',
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
  },
  {
    id: 'pad',
    name: 'Pad',
    oscillator: { type: 'fatsawtooth' },
    envelope: { attack: 0.4, decay: 0.5, sustain: 0.8, release: 1.8 },
  },
  {
    id: 'pluck',
    name: 'Pluck',
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0.0, release: 0.12 },
  },
];
