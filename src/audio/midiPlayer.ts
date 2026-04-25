import * as Tone from 'tone';
import { noteFrequency } from './tuning';
import { INSTRUMENTS } from './instruments';
import type { MidiTrack } from '../store/midiStore';
import { getTicksPerBar } from '../store/midiStore';

const trackSynths = new Map<string, { synth: Tone.PolySynth; reverb: Tone.Reverb }>();

function buildSynth(instrumentId: string): { synth: Tone.PolySynth; reverb: Tone.Reverb } {
  const preset = INSTRUMENTS.find(i => i.id === instrumentId) ?? INSTRUMENTS[0];
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: preset.oscillator as Tone.OmniOscillatorOptions,
    envelope: preset.envelope,
    maxPolyphony: 16,
  });
  const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.12 });
  synth.connect(reverb);
  reverb.toDestination();
  return { synth, reverb };
}

function disposeSynths(): void {
  for (const { synth, reverb } of trackSynths.values()) {
    synth.releaseAll();
    synth.dispose();
    reverb.dispose();
  }
  trackSynths.clear();
}

export function startPlayback(tracks: MidiTrack[], bpm: number, timeSig: string): void {
  stopPlayback();
  Tone.Transport.bpm.value = bpm;
  const ticksPerBar = getTicksPerBar(timeSig);

  for (const track of tracks) {
    if (track.muted) continue;
    const { synth } = buildSynth(track.instrumentId);
    trackSynths.set(track.id, { synth, reverb: new Tone.Reverb() });

    for (const clip of track.clips) {
      const clipStartTick = clip.startBar * ticksPerBar;
      for (const note of clip.notes) {
        const absTick = clipStartTick + note.startTick;
        const freq = noteFrequency(note.noteIndex);
        const durSec = Tone.Ticks(Math.max(48, note.durationTicks)).toSeconds();
        Tone.Transport.scheduleOnce((time) => {
          synth.triggerAttackRelease(freq, durSec, time, note.velocity);
        }, Tone.Ticks(absTick));
      }
    }
  }
  Tone.Transport.start();
}

export function stopPlayback(): void {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  disposeSynths();
}

export function startClipPlayback(
  notes: { noteIndex: number; startTick: number; durationTicks: number; velocity: number }[],
  instrumentId: string,
  ticksPerBar: number,
  lengthBars: number,
): void {
  stopPlayback();
  const { synth } = buildSynth(instrumentId);
  const tmpId = '__editor__';
  trackSynths.set(tmpId, { synth, reverb: new Tone.Reverb() });

  const loopTicks = lengthBars * ticksPerBar;

  for (const note of notes) {
    const freq = noteFrequency(note.noteIndex);
    const durSec = Tone.Ticks(Math.max(48, note.durationTicks)).toSeconds();
    Tone.Transport.scheduleOnce((time) => {
      synth.triggerAttackRelease(freq, durSec, time, note.velocity);
    }, Tone.Ticks(note.startTick));
  }

  Tone.Transport.loop = true;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = Tone.Ticks(loopTicks).toSeconds();
  Tone.Transport.start();
}

export function stopClipPlayback(): void {
  Tone.Transport.loop = false;
  stopPlayback();
}

export function getTransportTick(): number {
  return Tone.Transport.ticks;
}
