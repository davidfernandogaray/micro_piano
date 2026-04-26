import * as Tone from 'tone';
import type { MidiNote } from '../store/midiStore';

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let active = false;
let recordStartTick = 0;
const pending = new Map<number, number>(); // noteIndex → absStartTick
let onCapture: ((n: MidiNote) => void) | null = null;

export function startRecording(cb: (n: MidiNote) => void): void {
  active = true;
  recordStartTick = Tone.Transport.ticks;
  pending.clear();
  onCapture = cb;
}

export function stopRecording(): MidiNote[] {
  active = false;
  const now = Tone.Transport.ticks;
  const leftovers: MidiNote[] = [];
  for (const [noteIndex, startTick] of pending) {
    leftovers.push({
      id: uid(), noteIndex,
      startTick: startTick - recordStartTick,
      durationTicks: Math.max(48, now - startTick),
      velocity: 0.8,
    });
  }
  pending.clear();
  onCapture = null;
  return leftovers;
}

export function recorderNoteOn(noteIndex: number): void {
  if (!active) return;
  pending.set(noteIndex, Tone.Transport.ticks);
}

export function recorderNoteOff(noteIndex: number): void {
  if (!active) return;
  const startTick = pending.get(noteIndex);
  if (startTick === undefined) return;
  pending.delete(noteIndex);
  const note: MidiNote = {
    id: uid(), noteIndex,
    startTick: startTick - recordStartTick,
    durationTicks: Math.max(48, Tone.Transport.ticks - startTick),
    velocity: 0.8,
  };
  onCapture?.(note);
}

export function isRecorderActive(): boolean { return active; }
